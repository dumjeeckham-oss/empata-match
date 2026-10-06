import { collection, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, Timestamp, where, writeBatch } from "firebase/firestore";
import { auth, db, usingFirebaseEmulators } from "@/lib/firebase";
import { EVENT_FORM_COLLECTIONS as C } from "@/lib/collectionNames";
import { createEventFormId, decodeEventFormAnswers, encodeEventFormAnswers, sanitizeSpreadsheetCell } from "@/lib/eventForms";
import { buildEventFormExportRows, buildEventFormStatistics } from "@/lib/eventFormResults";
import { deletionChunks, requiredQuestionIds, validateResetConfirmation, validateSlotAssignment, type EventFormExportReceipt } from "@/lib/eventFormReuse";
import type { EventFormField, EventFormSlot, EventFormSubmission } from "@/types/eventForms";

const DEPENDENCIES = [C.submissions, C.rounds, C.versions, C.images] as const;

async function staff(adminOnly = false) {
  // This release candidate is deliberately incapable of destructive production operations.
  if (!usingFirebaseEmulators || !db.app.options.projectId?.startsWith("demo-")) throw new Error("이 작업은 로컬 Emulator 전용입니다. 운영 적용은 별도 승인이 필요합니다.");
  const user = auth.currentUser;
  const role = user && (await user.getIdTokenResult()).claims.role;
  if (!user || (adminOnly ? role !== "admin" : !["admin", "social_worker"].includes(String(role)))) throw new Error("이 작업을 수행할 권한이 없습니다.");
  return user.uid;
}

async function dependencies(formId: string) {
  return Promise.all(DEPENDENCIES.map(async (name) => ({ name, snapshot: await getDocs(query(collection(db, name), where("formId", "==", formId))) })));
}

async function digest(value: Uint8Array) {
  const bytes = new Uint8Array(value);
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function linkExistingEventForm(slotNumber: 1 | 2, formId: string) {
  const uid = await staff();
  await runTransaction(db, async (tx) => {
    const refs = [doc(db, C.slots, "1"), doc(db, C.slots, "2")];
    const [one, two, form] = await Promise.all([...refs.map((ref) => tx.get(ref)), tx.get(doc(db, C.forms, formId))]);
    if (!form.exists()) throw new Error("연결할 폼을 찾을 수 없습니다.");
    const publicRef = doc(db, C.public, form.data().tokenHash);
    const publicForm = await tx.get(publicRef);
    if (!publicForm.exists()) throw new Error("기존 공유 정보를 찾을 수 없어 연결을 중단했습니다. 원본은 보존됩니다.");
    validateSlotAssignment(slotNumber, formId, [one, two].filter((item) => item.exists()).map((item) => item.data() as { slotNumber: number; formId: string }));
    tx.set(refs[slotNumber - 1], { formId, slotNumber, createdBy: uid, createdAt: serverTimestamp() });
    tx.update(form.ref, { slotNumber, updatedBy: uid, updatedAt: serverTimestamp() });
    tx.update(publicRef, { requiredQuestionIds: requiredQuestionIds(publicForm.data().fields || []), updatedAt: serverTimestamp() });
  });
}

export async function loadEventFormResetSummary(formId: string) {
  await staff();
  const formSnapshot = await getDoc(doc(db, C.forms, formId));
  if (!formSnapshot.exists()) throw new Error("폼을 찾을 수 없습니다.");
  const form = { ...formSnapshot.data(), id: formId } as EventFormSlot;
  const groups = await dependencies(formId);
  const count = groups[0].snapshot.size;
  const manifest = groups.flatMap(({ name, snapshot }) => snapshot.docs.map((item) => [name, item.id, item.data()]));
  manifest.sort((left, right) => String(left[0]).localeCompare(String(right[0])) || String(left[1]).localeCompare(String(right[1])));
  const fingerprint = await digest(new TextEncoder().encode(JSON.stringify({ manifest, revision: form.contentRevision || 0, title: form.title, description: form.description, roundId: form.activeRoundId, versionId: form.activeVersionId })));
  return { form, groups, count, fingerprint, documents: manifest.length, estimatedBytes: new TextEncoder().encode(JSON.stringify(manifest)).length };
}

/** Full, unfiltered, all-round export; never substitutes the current filtered sheet. */
export async function exportAllEventFormRounds(formId: string): Promise<EventFormExportReceipt> {
  const uid = await staff();
  const summary = await loadEventFormResetSummary(formId);
  if (summary.form.status !== "closed") throw new Error("먼저 접수를 마감한 뒤 전체 회차 엑셀을 저장해주세요.");
  const XLSX = await import("xlsx");
  const book = XLSX.utils.book_new();
  const exportedAt = new Date().toISOString();
  const summaries: unknown[][] = [["폼", summary.form.title], ["전체 응답 수", summary.count], ["내보낸 시각", exportedAt], ["현재 회차", summary.form.activeRoundId], ["현재 버전", summary.form.activeVersionId]];
  const definitions: unknown[][] = [["회차 ID", "버전 ID", "문항 ID", "순서", "질문 제목", "상세설명", "필수", "입력 예시"]];
  const responseRows: Record<string, unknown>[] = [];
  const covered = new Set<string>();
  const statistics: unknown[][] = [["회차 ID", "문항", "선택지", "응답 수"]];
  for (const versionDoc of summary.groups[2].snapshot.docs) {
    const version = versionDoc.data();
    const fields = [...(version.fields || [])] as EventFormField[];
    fields.sort((a, b) => a.order - b.order);
    fields.forEach((field) => definitions.push([version.roundId, versionDoc.id, field.id, field.order, sanitizeSpreadsheetCell(field.title), sanitizeSpreadsheetCell(field.description || ""), field.required || field.consentRequired ? "필수" : "선택", sanitizeSpreadsheetCell(field.placeholder || "")]));
    const rows = summary.groups[0].snapshot.docs.filter((item) => item.data().versionId === versionDoc.id).map((item, index) => {
      covered.add(item.id);
      const data = item.data();
      const decoded = decodeEventFormAnswers(data.answersBase64 || (data.answers ? encodeEventFormAnswers(data.answers).answersBase64 : ""));
      if (decoded.invalidPayload || Object.keys(decoded.answers).some((id) => !fields.some((field) => field.id === id))) throw new Error("안전하게 내보낼 수 없는 응답이 있습니다. 원본을 보존하고 초기화를 중단합니다.");
      return { ...data, id: item.id, sequence: index + 1, answers: decoded.answers } as EventFormSubmission;
    });
    const metadata = version.formSnapshot || {};
    summaries.push(["회차 / 버전", version.roundId, versionDoc.id], ["제목", metadata.title || ""], ["설명", metadata.description || ""], ["행사 일시", metadata.eventDateTime || ""], ["장소", metadata.location || ""]);
    const exportFields = fields.map((field) => ({ ...field, title: `${field.title} [${field.id}]` }));
    const values = buildEventFormExportRows(exportFields, rows, (value) => (value as { toDate?: () => Date })?.toDate?.().toISOString() || "");
    values.forEach((row, index) => {
      const addresses = Object.fromEntries(fields.filter((field) => field.type === "address").flatMap((field) => {
        const address = rows[index].answers[field.id] as { roadAddress?: string; detailAddress?: string } | undefined;
        return [[`${field.title} [${field.id}] 도로명주소`, sanitizeSpreadsheetCell(address?.roadAddress || "")], [`${field.title} [${field.id}] 상세주소`, sanitizeSpreadsheetCell(address?.detailAddress || "")]];
      }));
      responseRows.push({ "회차 ID": version.roundId, "버전 ID": versionDoc.id, ...row, ...addresses });
    });
    buildEventFormStatistics(fields, rows).choiceStats.forEach(({ field, counts }) => counts.forEach(({ label, count }) => statistics.push([version.roundId, sanitizeSpreadsheetCell(field.title), sanitizeSpreadsheetCell(label), count])));
  }
  if (covered.size !== summary.count) throw new Error("문항 버전을 찾을 수 없는 응답이 있어 안전한 전체 내보내기를 중단했습니다. 초기화하지 마세요.");
  for (const [name, rows] of [["요약", summaries], ["문항 정의", definitions], ["통계", statistics]] as const) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name);
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(responseRows), "전체 응답");
  const bytes = new Uint8Array(XLSX.write(book, { type: "array", bookType: "xlsx" }));
  const sha256 = await digest(bytes);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a");
  link.href = url; link.download = "행사입력폼_전체회차.xlsx"; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  const fresh = await loadEventFormResetSummary(formId);
  if (fresh.fingerprint !== summary.fingerprint) throw new Error("자료가 변경되었습니다. 전체 엑셀을 다시 저장해주세요.");
  const receipt: EventFormExportReceipt = { formId, roundId: summary.form.activeRoundId || "", versionId: summary.form.activeVersionId || "", responseCount: summary.count, fingerprint: summary.fingerprint, sha256, actorUid: uid, downloadedAt: exportedAt };
  const batch = writeBatch(db);
  batch.set(doc(db, C.receipts, createEventFormId("export")), receipt);
  batch.update(doc(db, C.forms, formId), { lastExportReceipt: receipt, updatedBy: uid, updatedAt: serverTimestamp() });
  await batch.commit();
  return receipt;
}

export async function resetEventForm(formId: string, saved: boolean, typedTitle: string, onProgress: (deleted: number, total: number) => void) {
  const uid = await staff(true);
  const summary = await loadEventFormResetSummary(formId);
  const formRef = doc(db, C.forms, formId), jobRef = doc(db, C.resetJobs, formId);
  const receipt = (summary.form as EventFormSlot & { lastExportReceipt?: EventFormExportReceipt }).lastExportReceipt || null;
  const executionId = createEventFormId("reset");
  if (summary.form.status !== "resetting") validateResetConfirmation(summary.form, summary.count, summary.fingerprint, receipt, saved, typedTitle);
  await runTransaction(db, async (tx) => {
    const current = await tx.get(formRef), job = await tx.get(jobRef);
    if (current.data()?.status === "resetting") {
      if (job.data()?.actorUid !== uid) throw new Error("초기화를 시작한 관리자만 재개할 수 있습니다.");
      if ((job.data()?.leaseUntil as Timestamp)?.toMillis() > Date.now()) throw new Error("다른 창에서 초기화가 진행 중입니다. 중단되었다면 30초 뒤 재개해주세요.");
      tx.update(jobRef, { executionId, leaseUntil: Timestamp.fromMillis(Date.now() + 30_000), updatedAt: serverTimestamp() });
      return;
    }
    if (current.data()?.status !== "closed" || current.data()?.activeVersionId !== summary.form.activeVersionId || Number(current.data()?.contentRevision || 0) !== Number(summary.form.contentRevision || 0)) throw new Error("폼이 변경되었습니다. 다시 확인해주세요.");
    tx.update(formRef, { status: "resetting", resetBy: uid, updatedBy: uid, updatedAt: serverTimestamp() });
    tx.update(doc(db, C.public, summary.form.tokenHash!), { status: "resetting", updatedAt: serverTimestamp() });
    tx.set(jobRef, { formId, actorUid: uid, executionId, leaseUntil: Timestamp.fromMillis(Date.now() + 30_000), total: summary.documents, deleted: 0, status: "running", startedAt: serverTimestamp(), updatedAt: serverTimestamp() });
  });
  const job = (await getDoc(jobRef)).data()!;
  let deleted = Number(job.deleted || 0);
  onProgress(deleted, Number(job.total));
  const remaining = await dependencies(formId);
  for (const chunk of deletionChunks(remaining.flatMap(({ snapshot }) => snapshot.docs))) {
    const batch = writeBatch(db);
    chunk.forEach((item) => batch.delete(item.ref));
    deleted += chunk.length;
    batch.update(jobRef, { deleted, executionId, leaseUntil: Timestamp.fromMillis(Date.now() + 30_000), updatedAt: serverTimestamp() });
    await batch.commit();
    onProgress(deleted, Number(job.total));
  }
  if ((await dependencies(formId)).some(({ snapshot }) => !snapshot.empty)) throw new Error("남아 있는 자료가 있어 초기화를 완료하지 않았습니다. 다시 접속해 재개해주세요.");
  const roundId = createEventFormId("round"), versionId = createEventFormId("version");
  await runTransaction(db, async (tx) => {
    const current = await tx.get(formRef), currentJob = await tx.get(jobRef);
    if (current.data()?.status !== "resetting" || currentJob.data()?.actorUid !== uid || currentJob.data()?.executionId !== executionId) throw new Error("초기화 상태를 다시 확인해주세요.");
    const original = current.data()!;
    const empty = { id: formId, slotNumber: original.slotNumber, publicToken: original.publicToken, tokenHash: original.tokenHash, ownerUid: original.ownerUid, createdBy: original.createdBy, createdAt: original.createdAt, title: `입력폼 ${original.slotNumber}`, description: "", completionMessage: "신청이 접수되었습니다.", status: "draft", activeRoundId: roundId, activeVersionId: versionId, duplicatePolicy: "warn", expectedTargetCount: 40, draftFields: [], versionCounter: 1, roundCounter: 1, updatedBy: uid, updatedAt: serverTimestamp() };
    tx.set(formRef, { ...empty, ...(original.lastExportReceipt ? { lastExportReceipt: original.lastExportReceipt } : {}) });
    tx.set(doc(db, C.rounds, roundId), { id: roundId, formId, name: "1회차", status: "draft", versionId, responseCount: 0, createdAt: serverTimestamp() });
    tx.set(doc(db, C.versions, versionId), { id: versionId, formId, roundId, version: 1, fields: [], formSnapshot: { title: empty.title, description: "", completionMessage: empty.completionMessage }, publishedAt: serverTimestamp(), publishedBy: uid });
    tx.set(doc(db, C.public, original.tokenHash), { formId, title: empty.title, description: "", eventDateTime: "", location: "", poster: null, activeRoundId: roundId, activeVersionId: versionId, fields: [], fieldIds: [], requiredQuestionIds: [], publicAssetIds: [], publicImageBytes: 0, applicationStartAt: null, applicationEndAt: null, status: "draft", completionMessage: empty.completionMessage, duplicatePolicy: "warn", duplicateFieldId: "", updatedAt: serverTimestamp(), schemaVersion: 1, tokenHashVersion: "sha256" });
    tx.update(jobRef, { status: "complete", completedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    tx.set(doc(db, C.audit, createEventFormId("audit")), { formId, actorUid: uid, action: "form_reset", details: { deletedCount: deleted, receiptHash: receipt?.sha256 || "" }, at: serverTimestamp() });
  });
}

export async function loadEventFormSlotRegistry() {
  await staff();
  return (await getDocs(collection(db, C.slots))).docs.map((item) => item.data() as { slotNumber: 1 | 2; formId: string });
}
