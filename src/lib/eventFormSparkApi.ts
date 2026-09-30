import {
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { ensureAnonymousEventFormUser, publicEventFormDb } from "@/lib/eventFormPublicFirebase";
import type {
  EventFormAnswers, EventFormField, EventFormImageBlob, EventFormImageRef,
  EventFormRound, EventFormSlot, EventFormSubmission, EventFormVersion, PublicEventFormPayload,
} from "@/types/eventForms";
import {
  collectEventFormImages, createEventFormId, createEventFormSubmissionId, createPublicEventFormToken, decodeEventFormAnswers, encodeEventFormAnswers,
  EVENT_FORM_MAX_IMAGE_ENCODED_BYTES,
  EVENT_FORM_MAX_SUBMISSION_BYTES, hashPublicEventFormToken,
  validateEventFormAnswers, validateEventFormForPublishing, validateEventFormImageLimits,
} from "@/lib/eventForms";

const STAFF_ROLES = new Set(["admin", "social_worker"]);
const ACTION = { create: "form_created", save: "draft_saved", publish: "form_published", status: "status_changed", round: "round_started", submission: "submission_updated", cleanup: "images_cleaned" } as const;
type StaffContext = { uid: string; role: "admin" | "social_worker" };

const serializable = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

async function requireStaff(): Promise<StaffContext> {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");
  const role = (await user.getIdTokenResult()).claims.role;
  if (typeof role !== "string" || !STAFF_ROLES.has(role)) throw new Error("관리자 또는 전담사회복지사 권한이 필요합니다.");
  return { uid: user.uid, role: role as StaffContext["role"] };
}

const auditRecord = (formId: string, actorUid: string, action: string, details: Record<string, unknown> = {}) => ({ formId, actorUid, action, details: serializable(details), at: serverTimestamp() });

function toPublicTime(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : Timestamp.fromDate(date);
}

function publicImageRef(image?: EventFormImageRef | null): EventFormImageRef | undefined {
  if (!image) return undefined;
  return { assetId: image.assetId, alt: image.alt, state: "active", contentType: "image/webp", encodedBytes: image.encodedBytes || 0 };
}

function publicFields(fields: EventFormField[]): EventFormField[] {
  return serializable(fields.map((field) => ({ ...field, image: publicImageRef(field.image), options: field.options?.map((option) => ({ ...option, image: publicImageRef(option.image) })) })));
}

function formSnapshot(form: EventFormSlot, poster?: EventFormImageRef | null) {
  return serializable({ title: form.title, description: form.description, eventDateTime: form.eventDateTime, location: form.location, poster: publicImageRef(poster), completionMessage: form.completionMessage, applicationStartAt: form.applicationStartAt, applicationEndAt: form.applicationEndAt, expectedTargetCount: form.expectedTargetCount, duplicatePolicy: form.duplicatePolicy, duplicateFieldId: form.duplicateFieldId });
}

function publicDocument(formId: string, form: EventFormSlot, roundId: string, versionId: string, fields: EventFormField[]) {
  const images = collectEventFormImages(fields, form.poster);
  return {
    formId, title: form.title, description: form.description, eventDateTime: form.eventDateTime || "", location: form.location || "",
    poster: publicImageRef(form.poster) || null, activeRoundId: roundId, activeVersionId: versionId, fields: publicFields(fields),
    fieldIds: fields.filter((field) => field.visible && !["notice", "divider"].includes(field.type)).map((field) => field.id),
    publicAssetIds: images.map((image) => image.assetId), publicImageBytes: images.reduce((sum, image) => sum + Number(image.encodedBytes || 0), 0), applicationStartAt: toPublicTime(form.applicationStartAt), applicationEndAt: toPublicTime(form.applicationEndAt),
    status: form.status, completionMessage: form.completionMessage, duplicatePolicy: form.duplicatePolicy, duplicateFieldId: form.duplicateFieldId || "",
    updatedAt: serverTimestamp(), schemaVersion: 1, tokenHashVersion: "sha256",
  };
}

function validatePublishLimits(fields: EventFormField[], poster?: EventFormImageRef | null) {
  const issues = [...validateEventFormForPublishing(fields), ...validateEventFormImageLimits(fields, poster)];
  const images = collectEventFormImages(fields, poster);
  if (issues.length) throw new Error(issues.join("\n"));
  return images;
}

async function ensureImageDocuments(formId: string, images: EventFormImageRef[]) {
  const snapshots = await Promise.all(images.map((image) => getDoc(doc(db, "eventFormImageBlobs", image.assetId))));
  snapshots.forEach((snapshot) => {
    if (!snapshot.exists()) throw new Error("폼에 포함된 이미지를 찾을 수 없습니다.");
    const data = snapshot.data() as EventFormImageBlob;
    if (data.formId !== formId || data.contentType !== "image/webp" || data.encodedBytes > EVENT_FORM_MAX_IMAGE_ENCODED_BYTES) throw new Error("폼에 사용할 수 없는 이미지가 포함되어 있습니다.");
  });
}

export const eventFormApi = {
  async create(title: string): Promise<{ formId: string; publicToken: string }> {
    const staff = await requireStaff();
    const formId = createEventFormId("form"), roundId = createEventFormId("round"), versionId = createEventFormId("version");
    const publicToken = createPublicEventFormToken(), tokenHash = await hashPublicEventFormToken(publicToken);
    const form: EventFormSlot & { draftFields: EventFormField[] } = { id: formId, ownerUid: staff.uid, publicToken, tokenHash, title: title.trim().slice(0, 200) || "새 행사·교육 신청서", description: "", completionMessage: "신청이 접수되었습니다.", status: "draft", activeRoundId: roundId, activeVersionId: versionId, duplicatePolicy: "warn", expectedTargetCount: 40, draftFields: [] };
    const batch = writeBatch(db);
    batch.set(doc(db, "eventForms", formId), { ...serializable(form), createdBy: staff.uid, updatedBy: staff.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), versionCounter: 1, roundCounter: 1 });
    batch.set(doc(db, "eventFormRounds", roundId), { id: roundId, formId, name: "1회차", sequence: 1, status: "draft", versionId, responseCount: 0, createdAt: serverTimestamp() });
    batch.set(doc(db, "eventFormVersions", versionId), { id: versionId, formId, roundId, version: 1, fields: [], formSnapshot: formSnapshot(form, null), publishedAt: serverTimestamp(), publishedBy: staff.uid });
    batch.set(doc(db, "eventFormPublic", tokenHash), publicDocument(formId, form, roundId, versionId, []));
    batch.set(doc(db, "eventFormAuditLogs", createEventFormId("audit")), auditRecord(formId, staff.uid, ACTION.create));
    await batch.commit();
    return { formId, publicToken };
  },

  async saveDraft(payload: Partial<EventFormSlot> & { formId: string; fields: EventFormField[] }) {
    const staff = await requireStaff();
    if (!(await getDoc(doc(db, "eventForms", payload.formId))).exists()) throw new Error("폼을 찾을 수 없습니다.");
    const update = { ...serializable({ title: String(payload.title || "").slice(0, 200), description: String(payload.description || "").slice(0, 10_000), eventDateTime: payload.eventDateTime || "", location: String(payload.location || "").slice(0, 500), poster: payload.poster || null, applicationStartAt: payload.applicationStartAt || "", applicationEndAt: payload.applicationEndAt || "", completionMessage: String(payload.completionMessage || "").slice(0, 2_000), duplicatePolicy: payload.duplicatePolicy || "none", duplicateFieldId: payload.duplicateFieldId || "", expectedTargetCount: Number(payload.expectedTargetCount || 0), draftFields: payload.fields }), updatedBy: staff.uid, updatedAt: serverTimestamp() };
    const batch = writeBatch(db);
    batch.update(doc(db, "eventForms", payload.formId), update);
    batch.set(doc(db, "eventFormAuditLogs", createEventFormId("audit")), auditRecord(payload.formId, staff.uid, ACTION.save));
    await batch.commit();
  },

  async publish(formId: string): Promise<{ versionId: string }> {
    const staff = await requireStaff();
    const formRef = doc(db, "eventForms", formId), first = await getDoc(formRef);
    if (!first.exists()) throw new Error("폼을 찾을 수 없습니다.");
    const form = { id: formId, ...first.data() } as EventFormSlot & { draftFields?: EventFormField[]; versionCounter?: number };
    const fields = serializable(form.draftFields || []), images = validatePublishLimits(fields, form.poster);
    await ensureImageDocuments(formId, images);
    const versionId = createEventFormId("version"), roundId = form.activeRoundId;
    if (!roundId || !form.tokenHash) throw new Error("활성 회차 또는 공유 token 정보가 없습니다.");
    await runTransaction(db, async (transaction) => {
      const fresh = await transaction.get(formRef);
      if (!fresh.exists() || fresh.data().activeRoundId !== roundId) throw new Error("회차가 변경되었습니다. 화면을 새로고침해주세요.");
      const version = Number(fresh.data().versionCounter || 0) + 1;
      transaction.set(doc(db, "eventFormVersions", versionId), { id: versionId, formId, roundId, version, fields: publicFields(fields), formSnapshot: formSnapshot(form, form.poster), publishedAt: serverTimestamp(), publishedBy: staff.uid });
      transaction.update(formRef, { status: "open", activeVersionId: versionId, versionCounter: version, publishedBy: staff.uid, publishedAt: serverTimestamp(), updatedBy: staff.uid, updatedAt: serverTimestamp() });
      transaction.update(doc(db, "eventFormRounds", roundId), { status: "open", versionId, openedAt: serverTimestamp() });
      transaction.set(doc(db, "eventFormPublic", form.tokenHash!), publicDocument(formId, { ...form, status: "open" }, roundId, versionId, fields));
      images.forEach((image) => transaction.update(doc(db, "eventFormImageBlobs", image.assetId), { state: "active", publicTokenHash: form.tokenHash, versionId, updatedAt: serverTimestamp(), updatedBy: staff.uid }));
      transaction.set(doc(db, "eventFormAuditLogs", createEventFormId("audit")), auditRecord(formId, staff.uid, ACTION.publish, { roundId, versionId }));
    });
    return { versionId };
  },

  async setStatus(formId: string, status: "draft" | "open" | "closed") {
    const staff = await requireStaff();
    await runTransaction(db, async (transaction) => {
      const formRef = doc(db, "eventForms", formId), snapshot = await transaction.get(formRef);
      if (!snapshot.exists()) throw new Error("폼을 찾을 수 없습니다.");
      const form = snapshot.data() as EventFormSlot;
      if (!form.tokenHash || !form.activeRoundId) throw new Error("공개 정보가 올바르지 않습니다.");
      transaction.update(formRef, { status, updatedBy: staff.uid, updatedAt: serverTimestamp() });
      transaction.update(doc(db, "eventFormRounds", form.activeRoundId), { status, ...(status === "closed" ? { closedAt: serverTimestamp() } : {}) });
      transaction.update(doc(db, "eventFormPublic", form.tokenHash), { status, updatedAt: serverTimestamp() });
      transaction.set(doc(db, "eventFormAuditLogs", createEventFormId("audit")), auditRecord(formId, staff.uid, ACTION.status, { status }));
    });
  },

  async startRound(formId: string, name: string): Promise<{ roundId: string }> {
    const staff = await requireStaff(), newRoundId = createEventFormId("round"), newVersionId = createEventFormId("version");
    await runTransaction(db, async (transaction) => {
      const formRef = doc(db, "eventForms", formId), snapshot = await transaction.get(formRef);
      if (!snapshot.exists()) throw new Error("폼을 찾을 수 없습니다.");
      const form = { id: formId, ...snapshot.data() } as EventFormSlot & { draftFields?: EventFormField[]; versionCounter?: number };
      if (!form.tokenHash) throw new Error("공유 token 정보가 없습니다.");
      const fields = serializable(form.draftFields || []), version = Number(form.versionCounter || 0) + 1, sequence = Number(snapshot.data().roundCounter || 1) + 1;
      if (form.activeRoundId) transaction.update(doc(db, "eventFormRounds", form.activeRoundId), { status: "archived", closedAt: serverTimestamp() });
      transaction.set(doc(db, "eventFormRounds", newRoundId), { id: newRoundId, formId, name: name.trim().slice(0, 80) || `${sequence}회차`, sequence, status: "draft", versionId: newVersionId, responseCount: 0, createdAt: serverTimestamp(), roundStartedBy: staff.uid, roundStartedAt: serverTimestamp() });
      transaction.set(doc(db, "eventFormVersions", newVersionId), { id: newVersionId, formId, roundId: newRoundId, version, fields: publicFields(fields), formSnapshot: formSnapshot(form, form.poster), publishedAt: serverTimestamp(), publishedBy: staff.uid });
      transaction.update(formRef, { status: "draft", activeRoundId: newRoundId, activeVersionId: newVersionId, versionCounter: version, roundCounter: sequence, updatedBy: staff.uid, updatedAt: serverTimestamp() });
      transaction.set(doc(db, "eventFormPublic", form.tokenHash), publicDocument(formId, { ...form, status: "draft" }, newRoundId, newVersionId, fields));
      transaction.set(doc(db, "eventFormAuditLogs", createEventFormId("audit")), auditRecord(formId, staff.uid, ACTION.round, { previousRoundId: form.activeRoundId || "", roundId: newRoundId, versionId: newVersionId }));
    });
    return { roundId: newRoundId };
  },

  async getPublic(token: string): Promise<PublicEventFormPayload> {
    if (!token) throw new Error("공유 주소가 올바르지 않습니다.");
    await ensureAnonymousEventFormUser();
    const tokenHash = await hashPublicEventFormToken(token), snapshot = await getDoc(doc(publicEventFormDb, "eventFormPublic", tokenHash));
    if (!snapshot.exists()) throw new Error("신청서를 찾을 수 없습니다.");
    const data = snapshot.data();
    return { formId: data.formId, roundId: data.activeRoundId, versionId: data.activeVersionId, title: data.title, description: data.description, eventDateTime: data.eventDateTime, location: data.location, poster: data.poster || null, completionMessage: data.completionMessage, status: data.status, fields: data.fields || [], duplicatePolicy: data.duplicatePolicy || "none", duplicateFieldId: data.duplicateFieldId || undefined, publicAssetIds: data.publicAssetIds || [] };
  },

  async submit(token: string, roundId: string, versionId: string, answers: EventFormAnswers): Promise<{ submissionId: string; duplicateWarning: boolean }> {
    const user = await ensureAnonymousEventFormUser(), tokenHash = await hashPublicEventFormToken(token);
    const publicSnapshot = await getDoc(doc(publicEventFormDb, "eventFormPublic", tokenHash));
    if (!publicSnapshot.exists()) throw new Error("신청서를 찾을 수 없습니다.");
    const data = publicSnapshot.data();
    if (data.status !== "open") throw new Error("현재 접수 중인 신청서가 아닙니다.");
    if (data.activeRoundId !== roundId || data.activeVersionId !== versionId) throw new Error("신청서가 새 행사로 변경되었습니다. 화면을 새로고침해 주세요.");
    const errors = validateEventFormAnswers(data.fields || [], answers);
    if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
    const encoded = encodeEventFormAnswers(answers);
    if (encoded.encodedBytes > EVENT_FORM_MAX_SUBMISSION_BYTES) throw new Error("응답 내용이 50KB를 초과합니다. 장문 응답을 줄여주세요.");
    const payload = serializable({ formId: data.formId, roundId, versionId, tokenHash, submitterUid: user.uid, answersBase64: encoded.answersBase64, answerIds: encoded.answerIds, status: "submitted" });
    const submissionId = createEventFormSubmissionId(roundId, user.uid);
    await setDoc(doc(publicEventFormDb, "eventFormSubmissions", submissionId), { ...payload, submittedAt: serverTimestamp() });
    return { submissionId, duplicateWarning: false };
  },

  async updateSubmission(submissionId: string, status: EventFormSubmission["status"], adminMemo: string) {
    const staff = await requireStaff(), submissionRef = doc(db, "eventFormSubmissions", submissionId), snapshot = await getDoc(submissionRef);
    if (!snapshot.exists()) throw new Error("응답을 찾을 수 없습니다.");
    const formId = String(snapshot.data().formId || ""), batch = writeBatch(db);
    batch.update(submissionRef, { status, adminMemo: adminMemo.slice(0, 5_000), submissionUpdatedBy: staff.uid, submissionUpdatedAt: serverTimestamp() });
    batch.set(doc(db, "eventFormAuditLogs", createEventFormId("audit")), auditRecord(formId, staff.uid, ACTION.submission, { submissionId, status }));
    await batch.commit();
  },

  async cleanupUnusedImages(formId: string): Promise<number> {
    const staff = await requireStaff();
    const [images, versions] = await Promise.all([getDocs(query(collection(db, "eventFormImageBlobs"), where("formId", "==", formId))), getDocs(query(collection(db, "eventFormVersions"), where("formId", "==", formId)))]);
    const referenced = new Set<string>();
    versions.docs.forEach((item) => { const version = item.data() as EventFormVersion; collectEventFormImages(version.fields || [], version.formSnapshot?.poster).forEach((image) => referenced.add(image.assetId)); });
    const deletable = images.docs.filter((item) => { const image = item.data() as EventFormImageBlob; return ["temp", "unused"].includes(image.state) && !referenced.has(image.assetId); });
    await Promise.all(deletable.map((item) => deleteDoc(item.ref)));
    await setDoc(doc(db, "eventFormAuditLogs", createEventFormId("audit")), auditRecord(formId, staff.uid, ACTION.cleanup, { deletedCount: deletable.length }));
    return deletable.length;
  },
};

export async function listEventForms(): Promise<EventFormSlot[]> {
  await requireStaff();
  const snapshot = await getDocs(query(collection(db, "eventForms"), orderBy("updatedAt", "desc")));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as EventFormSlot));
}

export async function loadEventForm(formId: string): Promise<(EventFormSlot & { draftFields: EventFormField[] }) | null> {
  await requireStaff();
  const snapshot = await getDoc(doc(db, "eventForms", formId));
  return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data(), draftFields: snapshot.data().draftFields || [] } as EventFormSlot & { draftFields: EventFormField[] }) : null;
}

export async function loadEventFormRounds(formId: string): Promise<EventFormRound[]> {
  await requireStaff();
  const snapshot = await getDocs(query(collection(db, "eventFormRounds"), where("formId", "==", formId)));
  const rounds = await Promise.all(snapshot.docs.map(async (item) => ({ id: item.id, ...item.data(), responseCount: (await getCountFromServer(query(collection(db, "eventFormSubmissions"), where("roundId", "==", item.id)))).data().count } as EventFormRound)));
  return rounds.sort((a, b) => Number((b as { sequence?: number }).sequence || 0) - Number((a as { sequence?: number }).sequence || 0));
}

export async function loadEventFormVersion(versionId: string): Promise<EventFormVersion | null> {
  await requireStaff();
  const snapshot = await getDoc(doc(db, "eventFormVersions", versionId));
  return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as EventFormVersion) : null;
}

export async function loadEventFormSubmissions(roundId: string): Promise<EventFormSubmission[]> {
  await requireStaff();
  const snapshot = await getDocs(query(collection(db, "eventFormSubmissions"), where("roundId", "==", roundId), orderBy("submittedAt", "desc")));
  return snapshot.docs.map((item, index) => {
    const data = item.data();
    const decoded = data.answers && typeof data.answers === "object"
      ? { answers: data.answers as EventFormAnswers, invalidPayload: false }
      : decodeEventFormAnswers(data.answersBase64);
    return { id: item.id, ...data, answers: decoded.answers, invalidPayload: decoded.invalidPayload, sequence: snapshot.size - index } as EventFormSubmission;
  });
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

async function decodeAndOptimizeImage(file: File): Promise<{ dataBase64: string; width: number; height: number; encodedBytes: number }> {
  if (!(["image/jpeg", "image/png", "image/webp"] as string[]).includes(file.type)) throw new Error("JPEG, PNG, WebP 이미지만 업로드할 수 있습니다.");
  if (file.size > 5 * 1024 * 1024) throw new Error("원본 이미지는 5MB 이하여야 합니다.");
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); } catch { throw new Error("실제 이미지로 확인할 수 없는 파일입니다."); }
  try {
    let scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    for (let sizeStep = 0; sizeStep < 7; sizeStep += 1) {
      const width = Math.max(1, Math.round(bitmap.width * scale)), height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height; canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);
      for (const quality of [0.86, 0.72, 0.58, 0.44, 0.32]) {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
        if (!blob) continue;
        const dataBase64 = await blobToBase64(blob), encodedBytes = new TextEncoder().encode(dataBase64).byteLength;
        if (encodedBytes <= EVENT_FORM_MAX_IMAGE_ENCODED_BYTES) return { dataBase64, width, height, encodedBytes };
      }
      scale *= 0.8;
    }
  } finally { bitmap.close(); }
  throw new Error("이미지를 250KB 이하로 최적화할 수 없습니다. 더 작은 이미지를 선택해주세요.");
}

export async function uploadEventFormImage(formId: string, file: File, alt: string): Promise<EventFormImageRef> {
  const staff = await requireStaff(), optimized = await decodeAndOptimizeImage(file), assetId = createEventFormId("asset");
  const image: EventFormImageBlob = { assetId, formId, state: "temp", contentType: "image/webp", ...optimized, alt: alt.trim().slice(0, 500), createdBy: staff.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
  await setDoc(doc(db, "eventFormImageBlobs", assetId), image);
  return { assetId, alt: image.alt, state: "temp", contentType: "image/webp", encodedBytes: image.encodedBytes };
}

const imageCache = new Map<string, string>();
export async function loadEventFormImageData(assetId: string, publicAccess = false): Promise<string> {
  if (imageCache.has(assetId)) return imageCache.get(assetId)!;
  if (publicAccess) await ensureAnonymousEventFormUser();
  const snapshot = await getDoc(doc(publicAccess ? publicEventFormDb : db, "eventFormImageBlobs", assetId));
  if (!snapshot.exists()) throw new Error("이미지를 찾을 수 없습니다.");
  const image = snapshot.data() as EventFormImageBlob, url = `data:${image.contentType};base64,${image.dataBase64}`;
  imageCache.set(assetId, url);
  return url;
}
