import { createHash, createHmac, randomBytes } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { setGlobalOptions } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onObjectFinalized } from "firebase-functions/v2/storage";
import { onSchedule } from "firebase-functions/v2/scheduler";
import sharp from "sharp";

initializeApp();
setGlobalOptions({ region: "asia-northeast3", maxInstances: 3, memory: "256MiB" });

const db = getFirestore();
const MAX_FIELDS = 100;
const MAX_ANSWERS_BYTES = 200_000;
const ALLOWED_IMAGES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === "true";
const ANSWERABLE = new Set(["shortText", "longText", "name", "phone", "number", "email", "date", "singleChoice", "multipleChoice", "dropdown", "attendance", "address", "consent"]);
const CHOICE = new Set(["singleChoice", "multipleChoice", "dropdown", "attendance"]);
const STAFF_ROLES = new Set(["admin", "social_worker"]);
const RATE_LIMIT_HASH_SECRET = process.env.RATE_LIMIT_HASH_SECRET || (process.env.FUNCTIONS_EMULATOR === "true" ? "emulator-only-event-form-rate-secret" : "");

// Dynamic form payloads are validated field-by-field before use; this map is the server validation boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMap = Record<string, any>;

function requireStaff(request: { auth?: { uid: string; token: AnyMap } }): void {
  if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  if (!STAFF_ROLES.has(String(request.auth.token?.role || ""))) throw new HttpsError("permission-denied", "전담사회복지사 또는 관리자 권한이 필요합니다.");
}

function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function privateHash(value: string): string {
  if (!RATE_LIMIT_HASH_SECRET) throw new HttpsError("failed-precondition", "호출 제한 비밀값이 설정되지 않았습니다.");
  return createHmac("sha256", RATE_LIMIT_HASH_SECRET).update(value).digest("hex");
}

function token(): string {
  return randomBytes(24).toString("base64url");
}

function validateFields(fields: AnyMap[]): string[] {
  const issues: string[] = [];
  if (!Array.isArray(fields) || fields.length > MAX_FIELDS) return ["문항은 100개 이하로 구성해주세요."];
  const ids = new Set<string>();
  const visible = fields.filter((field) => field?.visible !== false);
  if (!visible.some((field) => ANSWERABLE.has(field.type))) issues.push("응답 문항을 한 개 이상 추가해주세요.");
  for (const field of fields) {
    if (!field?.id || ids.has(field.id)) issues.push("문항 식별자가 없거나 중복되었습니다.");
    ids.add(field?.id);
    if (field.type !== "divider" && !String(field.title || "").trim()) issues.push("제목이 없는 문항이 있습니다.");
    if (CHOICE.has(field.type)) {
      const options = (field.options || []).filter((option: AnyMap) => option.enabled !== false);
      if (!options.length) issues.push(`'${field.title || "객관식"}' 문항에 선택지가 필요합니다.`);
      const optionIds = new Set<string>();
      for (const option of options) {
        if (!option.id || optionIds.has(option.id)) issues.push("선택지 식별자가 없거나 중복되었습니다.");
        optionIds.add(option.id);
        if (!String(option.label || "").trim() && !String(option.image?.alt || "").trim()) issues.push("선택지 이름 또는 이미지 대체 설명이 필요합니다.");
      }
    }
    if (field.type === "consent" && !String(field.consentText || "").trim()) issues.push("동의 안내문을 입력해주세요.");
  }
  return [...new Set(issues)];
}

function validateAnswers(fields: AnyMap[], answers: AnyMap): Record<string, string> {
  const errors: Record<string, string> = {};
  const visible = fields.filter((field) => field.visible !== false && ANSWERABLE.has(field.type));
  const ids = new Set(visible.map((field) => field.id));
  for (const answerId of Object.keys(answers || {})) if (!ids.has(answerId)) errors[answerId] = "현재 신청서에 없는 문항입니다.";
  for (const field of visible) {
    const value = answers?.[field.id];
    const empty = value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
    if (empty) {
      if (field.required || (field.type === "consent" && field.consentRequired)) errors[field.id] = "필수 문항입니다.";
      continue;
    }
    if (["shortText", "longText", "name", "phone", "email"].includes(field.type)) {
      if (typeof value !== "string") errors[field.id] = "문자 형식으로 입력해주세요.";
      else if (field.minLength && value.trim().length < field.minLength) errors[field.id] = `최소 ${field.minLength}자 이상 입력해주세요.`;
      else if (field.maxLength && value.trim().length > field.maxLength) errors[field.id] = `최대 ${field.maxLength}자까지 입력할 수 있습니다.`;
      else if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) errors[field.id] = "올바른 이메일 주소를 입력해주세요.";
      else if (field.type === "phone" && value.replace(/\D/g, "").length < 9) errors[field.id] = "올바른 연락처를 입력해주세요.";
    } else if (field.type === "number") {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) errors[field.id] = "숫자를 입력해주세요.";
      else if (field.min !== undefined && numeric < field.min) errors[field.id] = `${field.min} 이상 입력해주세요.`;
      else if (field.max !== undefined && numeric > field.max) errors[field.id] = `${field.max} 이하로 입력해주세요.`;
    } else if (field.type === "date") {
      const today = new Date().toISOString().slice(0, 10);
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) errors[field.id] = "올바른 날짜를 선택해주세요.";
      else if (field.dateMin && value < field.dateMin) errors[field.id] = `${field.dateMin} 이후 날짜를 선택해주세요.`;
      else if (field.dateMax && value > field.dateMax) errors[field.id] = `${field.dateMax} 이전 날짜를 선택해주세요.`;
      else if (field.allowPast === false && value < today) errors[field.id] = "과거 날짜는 선택할 수 없습니다.";
      else if (field.allowFuture === false && value > today) errors[field.id] = "미래 날짜는 선택할 수 없습니다.";
    }
    else if (field.type === "address") {
      const started = value && typeof value === "object" && (value.zonecode || value.roadAddress || value.detailAddress);
      if ((field.required || started) && (!String(value?.zonecode || "").trim() || !String(value?.roadAddress || "").trim())) errors[field.id] = "주소 검색으로 기본주소를 선택해주세요.";
      else if ((field.required || started) && !String(value?.detailAddress || "").trim()) errors[field.id] = "상세주소를 입력해주세요.";
    } else if (field.type === "consent" && field.consentRequired && value?.agreed !== true) errors[field.id] = "필수 동의 항목입니다.";
    else if (CHOICE.has(field.type)) {
      if (!value || typeof value !== "object" || !Array.isArray(value.optionIds)) {
        errors[field.id] = "선택값이 올바르지 않습니다.";
        continue;
      }
      const selected = value.optionIds;
      const allowed = new Set((field.options || []).filter((option: AnyMap) => option.enabled !== false).map((option: AnyMap) => option.id));
      if (selected.some((id: string) => !allowed.has(id))) errors[field.id] = "현재 문항에 없는 선택지입니다.";
      if (new Set(selected).size !== selected.length) errors[field.id] = "같은 선택지를 중복 선택할 수 없습니다.";
      const count = selected.length + (value?.otherSelected ? 1 : 0);
      if (field.required && count < 1) errors[field.id] = "필수 문항입니다.";
      if (field.type !== "multipleChoice" && count > 1) errors[field.id] = "하나만 선택할 수 있습니다.";
      if ((field.minSelections || 0) > count) errors[field.id] = `최소 ${field.minSelections}개를 선택해주세요.`;
      if (field.maxSelections && count > field.maxSelections) errors[field.id] = `최대 ${field.maxSelections}개까지 선택할 수 있습니다.`;
      if (value?.otherSelected && !field.allowOther) errors[field.id] = "기타 의견을 사용할 수 없습니다.";
      if (!value?.otherSelected && String(value?.otherText || "").trim()) errors[field.id] = "기타를 선택한 뒤 의견을 입력해주세요.";
      if (value?.otherSelected && field.otherRequired && !String(value.otherText || "").trim()) errors[field.id] = "기타 의견을 입력해주세요.";
      if (field.otherMaxLength && String(value?.otherText || "").length > field.otherMaxLength) errors[field.id] = `기타 의견은 최대 ${field.otherMaxLength}자까지 입력할 수 있습니다.`;
    }
  }
  return errors;
}

function normalizeDuplicate(field: AnyMap, value: unknown): string {
  const text = typeof value === "string" ? value : String(value ?? "");
  if (field.type === "phone") {
    const digits = text.replace(/\D/g, "");
    return digits.startsWith("82") ? `0${digits.slice(2)}` : digits;
  }
  return field.type === "email" ? text.trim().toLowerCase() : text.replace(/\s+/g, "").toLowerCase();
}

function publicForm(form: AnyMap, round: AnyMap | null, version: AnyMap | null): AnyMap {
  const published = version?.formSnapshot || form;
  return clean({
    formId: form.id,
    roundId: round?.id || "",
    versionId: version?.id || "",
    title: published.title,
    description: published.description || "",
    eventDateTime: published.eventDateTime || "",
    location: published.location || "",
    poster: published.poster || null,
    completionMessage: published.completionMessage || "신청이 완료되었습니다.",
    status: form.status,
    fields: version?.fields?.filter((field: AnyMap) => field.visible !== false) || [],
    duplicatePolicy: form.duplicatePolicy || "none",
  });
}

function collectAssetIds(fields: AnyMap[] = [], poster?: AnyMap): Set<string> {
  const ids = new Set<string>();
  if (poster?.assetId) ids.add(poster.assetId);
  for (const field of fields) {
    if (field.image?.assetId) ids.add(field.image.assetId);
    for (const option of field.options || []) if (option.image?.assetId) ids.add(option.image.assetId);
  }
  return ids;
}

async function activateImages(formId: string, fields: AnyMap[], poster?: AnyMap): Promise<{ fields: AnyMap[]; poster?: AnyMap }> {
  const bucket = getStorage().bucket();
  const refs: AnyMap[] = [];
  if (poster) refs.push(poster);
  for (const field of fields) {
    if (field.image) refs.push(field.image);
    for (const option of field.options || []) if (option.image) refs.push(option.image);
  }
  const replacement = new Map<string, AnyMap>();
  for (const image of refs) {
    const safeImage = { ...image };
    delete safeImage.downloadUrl;
    if (image.state === "active" || image.state === "archived") {
      replacement.set(image.assetId, safeImage);
      continue;
    }
    const asset = await db.doc(`eventFormAssets/${image.assetId}`).get();
    const assetData = asset.data();
    if (!asset.exists || assetData?.verified !== true || assetData?.formId !== formId) throw new HttpsError("failed-precondition", "검증이 끝나지 않은 이미지가 있습니다.");
    if (["active", "archived"].includes(assetData.state) && assetData.storagePath) {
      await asset.ref.set({ state: "active", activatedAt: FieldValue.serverTimestamp() }, { merge: true });
      replacement.set(image.assetId, { ...safeImage, storagePath: assetData.storagePath, state: "active" });
      continue;
    }
    const extension = image.storagePath.split(".").pop() || "webp";
    const destination = `eventFormAssets/${formId}/active/${image.assetId}.${extension}`;
    await bucket.file(image.storagePath).copy(bucket.file(destination));
    await bucket.file(image.storagePath).delete({ ignoreNotFound: true });
    await asset.ref.set({ state: "active", storagePath: destination, activatedAt: FieldValue.serverTimestamp() }, { merge: true });
    replacement.set(image.assetId, { ...safeImage, storagePath: destination, state: "active" });
  }
  const replace = (image?: AnyMap) => image && (replacement.get(image.assetId) || image);
  return {
    poster: replace(poster),
    fields: clean(fields.map((field) => ({ ...field, image: replace(field.image), options: field.options?.map((option: AnyMap) => ({ ...option, image: replace(option.image) })) }))),
  };
}

async function enforceSubmissionRateLimit(publicToken: string, roundId: string, ipAddress: string): Promise<void> {
  const minute = Math.floor(Date.now() / 60_000);
  const tenMinutes = Math.floor(Date.now() / 600_000);
  const scope = privateHash(`${publicToken}:${roundId}`).slice(0, 24);
  const rules = [
    { ref: db.doc(`eventFormRateLimits/ip_${scope}_${privateHash(ipAddress || "unknown").slice(0, 24)}_${minute}`), max: 10, expiresAt: (minute + 10) * 60_000, kind: "ip-minute" },
    { ref: db.doc(`eventFormRateLimits/token_${scope}_${minute}`), max: 120, expiresAt: (minute + 10) * 60_000, kind: "token-minute" },
    { ref: db.doc(`eventFormRateLimits/token10_${scope}_${tenMinutes}`), max: 600, expiresAt: (tenMinutes + 2) * 600_000, kind: "token-ten-minutes" },
  ];
  await db.runTransaction(async (transaction) => {
    const snapshots = await Promise.all(rules.map((rule) => transaction.get(rule.ref)));
    snapshots.forEach((snapshot, index) => {
      if (Number(snapshot.data()?.count || 0) >= rules[index].max) throw new HttpsError("resource-exhausted", "잠시 후 다시 제출해주세요.");
    });
    rules.forEach((rule, index) => transaction.set(rule.ref, { count: Number(snapshots[index].data()?.count || 0) + 1, kind: rule.kind, expiresAt: Timestamp.fromMillis(rule.expiresAt), updatedAt: FieldValue.serverTimestamp() }, { merge: true }));
  });
}

async function enforceDuplicateRetryLimit(publicToken: string, roundId: string, fieldId: string, normalizedValue: string): Promise<void> {
  const tenMinutes = Math.floor(Date.now() / 600_000);
  const ref = db.doc(`eventFormRateLimits/duplicate_${privateHash(`${publicToken}:${roundId}:${fieldId}:${normalizedValue}`).slice(0, 40)}_${tenMinutes}`);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const count = Number(snapshot.data()?.count || 0);
    if (count >= 5) throw new HttpsError("resource-exhausted", "중복된 정보로 반복 제출되었습니다. 잠시 후 다시 시도해주세요.");
    transaction.set(ref, { count: count + 1, kind: "duplicate-ten-minutes", expiresAt: Timestamp.fromMillis((tenMinutes + 2) * 600_000), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
}

export const createEventForm = onCall({ maxInstances: 2, enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  requireStaff(request);
  const now = FieldValue.serverTimestamp();
  const formRef = db.collection("eventForms").doc();
  const roundRef = db.collection("eventFormRounds").doc();
  const publicToken = token();
  const form = {
    id: formRef.id,
    ownerUid: request.auth!.uid,
    title: String(request.data?.title || "새 행사 신청서").slice(0, 120),
    description: "",
    completionMessage: "신청이 완료되었습니다.",
    status: "draft",
    activeRoundId: roundRef.id,
    duplicatePolicy: "warn",
    publicToken,
    draftFields: [],
    versionCounter: 0,
    createdAt: now,
    updatedAt: now,
    createdBy: request.auth!.uid,
    updatedBy: request.auth!.uid,
  };
  const batch = db.batch();
  batch.set(formRef, form);
  batch.set(roundRef, { id: roundRef.id, formId: formRef.id, name: "1회차", status: "draft", responseCount: 0, createdAt: now });
  batch.set(db.doc(`eventFormPublicTokens/${hash(publicToken)}`), { formId: formRef.id, createdAt: now });
  batch.set(db.collection("eventFormAuditLogs").doc(), { formId: formRef.id, action: "create", actorUid: request.auth!.uid, at: now });
  await batch.commit();
  return { formId: formRef.id, publicToken };
});

export const saveEventFormDraft = onCall({ maxInstances: 2, enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  requireStaff(request);
  const formId = String(request.data?.formId || "");
  const fields = clean(request.data?.fields || []);
  if (!formId || !Array.isArray(fields) || fields.length > MAX_FIELDS) throw new HttpsError("invalid-argument", "폼 또는 문항 정보가 올바르지 않습니다.");
  const ref = db.doc(`eventForms/${formId}`);
  const existingSnapshot = await ref.get();
  if (!existingSnapshot.exists) throw new HttpsError("not-found", "폼을 찾을 수 없습니다.");
  const existing = existingSnapshot.data() as AnyMap;
  const allowed = ["title", "description", "eventDateTime", "location", "poster", "applicationStartAt", "applicationEndAt", "completionMessage", "duplicatePolicy", "duplicateFieldId"];
  const patch: AnyMap = { draftFields: fields, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth!.uid };
  for (const key of allowed) if (request.data?.[key] !== undefined) patch[key] = clean(request.data[key]);
  if (request.data?.expectedTargetCount !== undefined) {
    const expectedTargetCount = Number(request.data.expectedTargetCount);
    if (!Number.isInteger(expectedTargetCount) || expectedTargetCount < 0 || expectedTargetCount > 100_000) throw new HttpsError("invalid-argument", "예상 대상 인원은 1명 이상 100,000명 이하로 입력해주세요.");
    patch.expectedTargetCount = expectedTargetCount === 0 ? FieldValue.delete() : expectedTargetCount;
  }
  const oldAssets = collectAssetIds(existing.draftFields || [], existing.poster);
  const nextAssets = collectAssetIds(fields, patch.poster === undefined ? existing.poster : patch.poster);
  const removed = [...oldAssets].filter((assetId) => !nextAssets.has(assetId));
  const batch = db.batch();
  batch.set(ref, patch, { merge: true });
  for (const assetId of removed) {
    const assetRef = db.doc(`eventFormAssets/${assetId}`);
    const asset = (await assetRef.get()).data();
    if (!asset) continue;
    batch.set(assetRef, asset.state === "active" ? { state: "archived", archivedAt: FieldValue.serverTimestamp() } : { state: "unused", unusedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  await batch.commit();
  return { ok: true };
});

export const publishEventForm = onCall({ maxInstances: 2, enforceAppCheck: ENFORCE_APP_CHECK, timeoutSeconds: 60 }, async (request) => {
  requireStaff(request);
  const formId = String(request.data?.formId || "");
  const formRef = db.doc(`eventForms/${formId}`);
  const snap = await formRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "폼을 찾을 수 없습니다.");
  const form = { id: snap.id, ...snap.data() } as AnyMap;
  const issues = validateFields(form.draftFields || []);
  if (issues.length) throw new HttpsError("invalid-argument", issues.join("\n"));
  const activated = await activateImages(formId, form.draftFields, form.poster);
  const versionRef = db.collection("eventFormVersions").doc();
  const roundRef = db.doc(`eventFormRounds/${form.activeRoundId}`);
  await db.runTransaction(async (transaction) => {
    const fresh = (await transaction.get(formRef)).data() as AnyMap;
    if (!fresh || fresh.activeRoundId !== form.activeRoundId) throw new HttpsError("aborted", "회차가 변경되었습니다. 새로고침해 주세요.");
    const versionNumber = Number(fresh.versionCounter || 0) + 1;
    transaction.set(versionRef, { id: versionRef.id, formId, roundId: form.activeRoundId, version: versionNumber, fields: activated.fields, formSnapshot: clean({ title: form.title, description: form.description || "", eventDateTime: form.eventDateTime || "", location: form.location || "", poster: activated.poster || null, completionMessage: form.completionMessage || "신청이 완료되었습니다.", applicationStartAt: form.applicationStartAt || "", applicationEndAt: form.applicationEndAt || "", expectedTargetCount: form.expectedTargetCount || null }), publishedAt: FieldValue.serverTimestamp(), publishedBy: request.auth!.uid });
    transaction.set(roundRef, { status: "open", versionId: versionRef.id, openedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.set(formRef, { status: "open", activeVersionId: versionRef.id, versionCounter: versionNumber, poster: activated.poster || null, draftFields: activated.fields, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth!.uid, publishedAt: FieldValue.serverTimestamp(), publishedBy: request.auth!.uid }, { merge: true });
  });
  return { versionId: versionRef.id };
});

export const setEventFormStatus = onCall({ maxInstances: 2, enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  requireStaff(request);
  const formId = String(request.data?.formId || "");
  const status = String(request.data?.status || "");
  if (!["draft", "open", "closed"].includes(status)) throw new HttpsError("invalid-argument", "허용되지 않은 상태입니다.");
  const formRef = db.doc(`eventForms/${formId}`);
  const form = (await formRef.get()).data();
  if (!form) throw new HttpsError("not-found", "폼을 찾을 수 없습니다.");
  if (status === "open" && !form.activeVersionId) throw new HttpsError("failed-precondition", "먼저 문항을 공개해주세요.");
  const batch = db.batch();
  batch.set(formRef, { status, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth!.uid }, { merge: true });
  batch.set(db.doc(`eventFormRounds/${form.activeRoundId}`), { status, ...(status === "closed" ? { closedAt: FieldValue.serverTimestamp() } : {}) }, { merge: true });
  await batch.commit();
  return { ok: true };
});

export const startEventFormRound = onCall({ maxInstances: 1, enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  requireStaff(request);
  const formId = String(request.data?.formId || "");
  const newRoundRef = db.collection("eventFormRounds").doc();
  await db.runTransaction(async (transaction) => {
    const formRef = db.doc(`eventForms/${formId}`);
    const formSnap = await transaction.get(formRef);
    if (!formSnap.exists) throw new HttpsError("not-found", "폼을 찾을 수 없습니다.");
    const form = formSnap.data() as AnyMap;
    const oldRoundRef = db.doc(`eventFormRounds/${form.activeRoundId}`);
    const oldRoundSnap = await transaction.get(oldRoundRef);
    const nextNumber = Number(oldRoundSnap.data()?.sequence || 1) + 1;
    transaction.set(oldRoundRef, { status: "archived", closedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.set(newRoundRef, { id: newRoundRef.id, formId, name: String(request.data?.name || `${nextNumber}회차`).slice(0, 80), sequence: nextNumber, status: "draft", responseCount: 0, expectedTargetCount: form.expectedTargetCount || null, createdAt: FieldValue.serverTimestamp(), roundStartedBy: request.auth!.uid, roundStartedAt: FieldValue.serverTimestamp() });
    transaction.set(formRef, { activeRoundId: newRoundRef.id, activeVersionId: FieldValue.delete(), status: "draft", updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth!.uid }, { merge: true });
    transaction.set(db.collection("eventFormAuditLogs").doc(), { formId, action: "startRound", previousRoundId: form.activeRoundId, roundId: newRoundRef.id, actorUid: request.auth!.uid, at: FieldValue.serverTimestamp() });
  });
  return { roundId: newRoundRef.id };
});

export const getPublicEventForm = onCall({ maxInstances: 5, enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const publicToken = String(request.data?.token || "");
  if (publicToken.length < 20) throw new HttpsError("not-found", "신청서를 찾을 수 없습니다.");
  const mapSnap = await db.doc(`eventFormPublicTokens/${hash(publicToken)}`).get();
  if (!mapSnap.exists) throw new HttpsError("not-found", "신청서를 찾을 수 없습니다.");
  const formSnap = await db.doc(`eventForms/${mapSnap.data()!.formId}`).get();
  if (!formSnap.exists) throw new HttpsError("not-found", "신청서를 찾을 수 없습니다.");
  const form = { id: formSnap.id, ...formSnap.data() } as AnyMap;
  if (form.status !== "open") return publicForm(form, null, null);
  const [roundSnap, versionSnap] = await Promise.all([db.doc(`eventFormRounds/${form.activeRoundId}`).get(), db.doc(`eventFormVersions/${form.activeVersionId}`).get()]);
  if (!roundSnap.exists || !versionSnap.exists || roundSnap.data()?.status !== "open") throw new HttpsError("failed-precondition", "현재 접수 중인 회차가 없습니다.");
  const now = Date.now();
  if (form.applicationStartAt && Date.parse(form.applicationStartAt) > now) return { ...publicForm(form, null, null), status: "draft" };
  if (form.applicationEndAt && Date.parse(form.applicationEndAt) < now) return { ...publicForm(form, null, null), status: "closed" };
  return publicForm(form, { id: roundSnap.id, ...roundSnap.data() }, { id: versionSnap.id, ...versionSnap.data() });
});

export const submitEventForm = onCall({ maxInstances: 5, enforceAppCheck: ENFORCE_APP_CHECK, timeoutSeconds: 30 }, async (request) => {
  const data = request.data || {};
  const publicToken = String(data.token || "");
  const answers = clean(data.answers || {});
  if (Buffer.byteLength(JSON.stringify(answers), "utf8") > MAX_ANSWERS_BYTES) throw new HttpsError("invalid-argument", "응답 내용이 너무 큽니다.");
  const mapSnap = await db.doc(`eventFormPublicTokens/${hash(publicToken)}`).get();
  if (!mapSnap.exists) throw new HttpsError("not-found", "신청서를 찾을 수 없습니다.");
  const formRef = db.doc(`eventForms/${mapSnap.data()!.formId}`);
  const preflightFormSnap = await formRef.get();
  const preflightForm = preflightFormSnap.data() as AnyMap | undefined;
  if (!preflightForm || preflightForm.status !== "open" || preflightForm.activeRoundId !== data.roundId || preflightForm.activeVersionId !== data.versionId) throw new HttpsError("failed-precondition", "신청서가 새 행사로 변경되었습니다. 화면을 새로고침해 주세요.");
  await enforceSubmissionRateLimit(publicToken, preflightForm.activeRoundId, request.rawRequest.ip || "unknown");
  if (["warn", "block"].includes(preflightForm.duplicatePolicy) && preflightForm.duplicateFieldId) {
    const version = (await db.doc(`eventFormVersions/${preflightForm.activeVersionId}`).get()).data() as AnyMap | undefined;
    const duplicateField = version?.fields?.find((field: AnyMap) => field.id === preflightForm.duplicateFieldId);
    const normalized = duplicateField ? normalizeDuplicate(duplicateField, answers[preflightForm.duplicateFieldId]) : "";
    if (normalized) {
      const lock = await db.doc(`eventFormDuplicateKeys/${preflightForm.activeRoundId}_${preflightForm.duplicateFieldId}_${hash(normalized)}`).get();
      if (lock.exists) await enforceDuplicateRetryLimit(publicToken, preflightForm.activeRoundId, preflightForm.duplicateFieldId, normalized);
    }
  }
  const submissionRef = db.collection("eventFormSubmissions").doc();
  let duplicateWarning = false;
  await db.runTransaction(async (transaction) => {
    const formSnap = await transaction.get(formRef);
    const form = formSnap.data() as AnyMap | undefined;
    if (!form || form.status !== "open" || form.activeRoundId !== data.roundId || form.activeVersionId !== data.versionId) {
      throw new HttpsError("failed-precondition", "신청서가 새 행사로 변경되었습니다. 화면을 새로고침해 주세요.");
    }
    const now = Date.now();
    if ((form.applicationStartAt && Date.parse(form.applicationStartAt) > now) || (form.applicationEndAt && Date.parse(form.applicationEndAt) < now)) {
      throw new HttpsError("failed-precondition", "현재 신청을 받을 수 없습니다.");
    }
    const roundRef = db.doc(`eventFormRounds/${form.activeRoundId}`);
    const versionRef = db.doc(`eventFormVersions/${form.activeVersionId}`);
    const [roundSnap, versionSnap] = await Promise.all([transaction.get(roundRef), transaction.get(versionRef)]);
    if (!roundSnap.exists || roundSnap.data()?.status !== "open" || !versionSnap.exists) throw new HttpsError("failed-precondition", "현재 신청을 받을 수 없습니다.");
    const fields = versionSnap.data()!.fields || [];
    const errors = validateAnswers(fields, answers);
    if (Object.keys(errors).length) throw new HttpsError("invalid-argument", "입력 내용을 확인해주세요.", errors);
    for (const field of fields.filter((item: AnyMap) => item.type === "consent")) {
      if (answers[field.id]?.agreed) answers[field.id] = { agreed: true, consentVersion: field.consentVersion || versionSnap.id, consentTextSnapshot: field.consentText || "", agreedAt: new Date().toISOString() };
    }
    if (["warn", "block"].includes(form.duplicatePolicy) && form.duplicateFieldId) {
      const duplicateField = fields.find((field: AnyMap) => field.id === form.duplicateFieldId);
      const normalized = duplicateField ? normalizeDuplicate(duplicateField, answers[form.duplicateFieldId]) : "";
      if (normalized) {
        const lockRef = db.doc(`eventFormDuplicateKeys/${form.activeRoundId}_${form.duplicateFieldId}_${hash(normalized)}`);
        if ((await transaction.get(lockRef)).exists) {
          if (form.duplicatePolicy === "block") throw new HttpsError("already-exists", "이미 제출된 정보입니다.");
          duplicateWarning = true;
        } else transaction.create(lockRef, { formId: formSnap.id, roundId: form.activeRoundId, fieldId: form.duplicateFieldId, createdAt: FieldValue.serverTimestamp() });
      }
    }
    const sequence = Number(roundSnap.data()?.responseCount || 0) + 1;
    transaction.set(submissionRef, { id: submissionRef.id, formId: formSnap.id, roundId: form.activeRoundId, versionId: form.activeVersionId, sequence, answers, status: "submitted", duplicateWarning, submittedAt: FieldValue.serverTimestamp() });
    transaction.set(roundRef, { responseCount: sequence }, { merge: true });
  });
  return { submissionId: submissionRef.id, duplicateWarning };
});

export const updateEventSubmission = onCall({ maxInstances: 2, enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  requireStaff(request);
  const submissionId = String(request.data?.submissionId || "");
  const status = String(request.data?.status || "submitted");
  if (!["submitted", "reviewed", "excluded"].includes(status)) throw new HttpsError("invalid-argument", "응답 상태가 올바르지 않습니다.");
  await db.doc(`eventFormSubmissions/${submissionId}`).set({ status, adminMemo: String(request.data?.adminMemo || "").slice(0, 5000), reviewedBy: request.auth!.uid, reviewedAt: FieldValue.serverTimestamp(), submissionUpdatedBy: request.auth!.uid, submissionUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true };
});

export const verifyEventFormImage = onObjectFinalized({ maxInstances: 2, memory: "512MiB" }, async (event) => {
  const object = event.data;
  const path = object.name || "";
  const match = path.match(/^eventFormAssets\/([^/]+)\/temp\/([^/]+)\/([^/]+)\/(.+)$/);
  if (!match) return;
  const [, formId, ownerUid, assetId] = match;
  const bucket = getStorage().bucket(object.bucket);
  const file = bucket.file(path);
  try {
    if (!object.contentType || !ALLOWED_IMAGES.has(object.contentType) || Number(object.size || 0) > 5 * 1024 * 1024) throw new Error("허용되지 않은 이미지 형식 또는 크기");
    const [buffer] = await file.download();
    const metadata = await sharp(buffer).metadata();
    if (!metadata.width || !metadata.height || metadata.width > 2560 || metadata.height > 2560) throw new Error("이미지 해상도 제한 초과");
    await db.doc(`eventFormAssets/${assetId}`).set({ assetId, formId, ownerUid, storagePath: path, contentType: object.contentType, size: Number(object.size || 0), width: metadata.width, height: metadata.height, verified: true, state: "temp", createdAt: FieldValue.serverTimestamp() });
  } catch (error) {
    await file.delete({ ignoreNotFound: true });
    await db.doc(`eventFormAssets/${assetId}`).set({ assetId, formId, ownerUid, storagePath: path, verified: false, error: error instanceof Error ? error.message : "이미지 검증 실패", createdAt: FieldValue.serverTimestamp() });
  }
});

// 운영 배포 미승인: Emulator에서 보관 정책을 검증하기 위한 로컬 구현만 포함한다.
export const cleanupEventFormImages = onSchedule({ schedule: "every day 03:00", maxInstances: 1 }, async () => {
  const now = Timestamp.now();
  const tempLimit = Timestamp.fromMillis(now.toMillis() - 7 * 24 * 60 * 60 * 1000);
  const unusedLimit = Timestamp.fromMillis(now.toMillis() - 30 * 24 * 60 * 60 * 1000);
  const snapshots = await Promise.all([
    db.collection("eventFormAssets").where("state", "==", "temp").where("createdAt", "<", tempLimit).limit(100).get(),
    db.collection("eventFormAssets").where("state", "==", "unused").where("unusedAt", "<", unusedLimit).limit(100).get(),
  ]);
  const bucket = getStorage().bucket();
  for (const asset of snapshots.flatMap((snapshot) => snapshot.docs)) {
    const data = asset.data();
    // active/archived 참조는 쿼리 대상이 아니므로 오래됐다는 이유만으로 삭제되지 않는다.
    if (data.storagePath) await bucket.file(data.storagePath).delete({ ignoreNotFound: true });
    await asset.ref.delete();
  }
  const rateLimits = await db.collection("eventFormRateLimits").where("expiresAt", "<", now).limit(200).get();
  const batch = db.batch();
  rateLimits.docs.forEach((item) => batch.delete(item.ref));
  if (!rateLimits.empty) await batch.commit();
});
