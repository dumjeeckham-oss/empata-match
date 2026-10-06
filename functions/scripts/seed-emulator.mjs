import { createHash } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { Timestamp, getFirestore } from "firebase-admin/firestore";

process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8081";
const projectId = "demo-dongbaek-forms";
initializeApp({ projectId });
const auth = getAuth();
const db = getFirestore();

for (let index = 1; index <= 4; index += 1) {
  const email = `social-worker-${index}@example.test`;
  let user;
  try { user = await auth.getUserByEmail(email); }
  catch { user = await auth.createUser({ email, password: "emulator-only-1234", displayName: `가짜 전담사회복지사 ${index}`, emailVerified: true }); }
  await auth.setCustomUserClaims(user.uid, { role: index === 1 ? "admin" : "social_worker" });
}

const publicToken = "demo-public-form-token-0000000001";
const formId = "demo-event-form";
const roundId = "demo-event-round-1";
const versionId = "demo-event-version-1";
const now = Timestamp.now();
const fields = [
  { id: "demo-name", type: "name", title: "성명", required: true, visible: true, order: 0 },
  { id: "demo-phone", type: "phone", title: "연락처", required: true, visible: true, order: 1 },
  { id: "demo-attendance", type: "attendance", title: "참석 여부", required: true, visible: true, order: 2, options: [
    { id: "attend", label: "참석", order: 0, enabled: true },
    { id: "absent", label: "불참", order: 1, enabled: true },
    { id: "undecided", label: "미정", order: 2, enabled: true },
  ] },
  { id: "demo-address", type: "address", title: "도로명주소", required: false, visible: true, order: 3 },
  { id: "demo-consent", type: "consent", title: "개인정보 수집·이용 동의", required: true, visible: true, order: 4, consentRequired: true, consentVersion: "1", consentText: "행사 신청 확인을 위해 입력 정보를 수집·이용하는 것에 동의합니다." },
];

const batch = db.batch();
batch.set(db.doc(`eventForms/${formId}`), { id: formId, ownerUid: "emulator-seed", publicToken, title: "가짜 행사 참여 신청", description: "Emulator 검증 전용이며 실제 개인정보를 입력하지 마세요.", completionMessage: "가짜 신청이 접수되었습니다.", status: "open", activeRoundId: roundId, activeVersionId: versionId, duplicatePolicy: "warn", duplicateFieldId: "demo-phone", expectedTargetCount: 40, draftFields: fields, versionCounter: 1, createdAt: now, updatedAt: now, createdBy: "emulator-seed", updatedBy: "emulator-seed" });
batch.set(db.doc(`eventFormRounds/${roundId}`), { id: roundId, formId, name: "가짜 1회차", sequence: 1, status: "open", versionId, responseCount: 0, createdAt: now, openedAt: now });
batch.set(db.doc(`eventFormVersions/${versionId}`), { id: versionId, formId, roundId, version: 1, fields, formSnapshot: { title: "가을 건강교육 신청", description: "로컬 Emulator 전용 가짜 데이터입니다.", eventDateTime: "2026-10-15 14:00", location: "동백 교육실", poster: null, completionMessage: "신청이 완료되었습니다.", applicationStartAt: "", applicationEndAt: "", expectedTargetCount: 40 }, publishedAt: now, publishedBy: "emulator-seed" });
batch.set(db.doc(`eventFormPublicTokens/${createHash("sha256").update(publicToken).digest("hex")}`), { formId, createdAt: now });
await batch.commit();
console.log("Emulator fake data ready:");
console.log("- Admin: social-worker-1@example.test ~ social-worker-4@example.test");
console.log("- Password: emulator-only-1234");
console.log(`- Public form: http://127.0.0.1:5000/forms/${publicToken}`);
