// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInAnonymously } from "firebase/auth";
import { collection, connectFirestoreEmulator, deleteDoc, deleteField, doc, getDoc, getDocs, getFirestore, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch, type Firestore } from "firebase/firestore";
import { createHandwritingApi } from "@/lib/counselingHandwritingApi";
import { createCounselingRecord, updateCounselingRecord } from "@/lib/counselingRevision";
import { clearAllHandwritingDrafts, encodeStrokes, getHandwritingDraft, setHandwritingDraft, type HandwritingMemo } from "@/lib/counselingHandwriting";
import { COUNSELING_COLLECTION, COUNSELING_HANDWRITING_COLLECTION } from "@/lib/collectionNames";

const rules = readFileSync(process.env.HANDWRITING_RULES_FIXTURE || "src/test/fixtures/handwriting-safe-delete-v2.rules", "utf8");
const json = encodeStrokes([{ id: "synthetic", width: 4, points: [[10, 20, 0.5]] }]);
const seed: HandwritingMemo = { id: "safe-delete", schemaVersion: 1, targetType: "이용자", targetId: "synthetic-user", targetKey: "user:synthetic-user", counselingRecordId: "", createdBy: "staff", createdAt: null, updatedBy: "staff", updatedAt: null, revision: 0, width: 1600, height: 1000, strokesJson: "[]", transcribedRevision: -1, transcribedAt: null };
const form = { targetType: seed.targetType, targetId: seed.targetId, targetName: "합성 이용자", content: "전사된 내용\n둘째 줄", result: "확인", category: "일반상담", counselorName: "합성 직원", date: "2026-10-06" };

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)("Safe Delete V2", () => {
 let env: RulesTestEnvironment;
 const staff = (uid = "staff") => env.authenticatedContext(uid, { role: "social_worker" }).firestore() as unknown as Firestore;
 const memoRef = (db: Firestore) => doc(db, COUNSELING_HANDWRITING_COLLECTION, seed.id);
 const readMemo = async (db: Firestore) => ({ ...(await getDoc(memoRef(db))).data(), id: seed.id }) as HandwritingMemo;
 const api = (db: Firestore, uid = "staff") => createHandwritingApi(db, async () => uid);
 async function transcribed(db = staff()) {
  const service = api(db);
  await service.save(seed, json, false);
  const id = await service.saveTranscription(await readMemo(db), form);
  return { db, service, id, memo: await readMemo(db) };
 }
 async function directConfirm(db: Firestore, patch: Record<string, unknown> = {}) {
  return updateDoc(memoRef(db), { confirmedBy: "staff", confirmedAt: serverTimestamp(), updatedBy: "staff", updatedAt: serverTimestamp(), ...patch });
 }
 beforeAll(async () => { env = await initializeTestEnvironment({ projectId: "demo-dongbaek-forms", firestore: { rules } }); }, 20000);
 beforeEach(async () => { await env.clearFirestore(); clearAllHandwritingDrafts(); });
 afterAll(async () => { clearAllHandwritingDrafts(); await env.cleanup(); });

 it("R1: 전사 후 확인 전 새 필기는 confirmation/delete DENY", async () => {
  const { db, service, memo } = await transcribed();
  await service.save(memo, json, true);
  await expect(service.confirmTranscription(memo)).rejects.toThrow();
  await assertFails(directConfirm(db)); await assertFails(deleteDoc(memoRef(db)));
 });
 it("R2: 확인 후 새 필기는 confirmation reset과 delete DENY", async () => {
  const { db, service, memo } = await transcribed();
  await service.confirmTranscription(memo);
  await service.save(await readMemo(db), json, true);
  expect((await readMemo(db)).confirmedAt).toBeNull();
  expect((await readMemo(db)).confirmedBy).toBe("");
  await assertFails(deleteDoc(memoRef(db)));
 });
 it.each(["staff", "second-staff"])("R3/R4: %s 상담 수정 후 과거 confirmation delete DENY", async uid => {
  const { db, service, memo, id } = await transcribed();
  await service.confirmTranscription(memo);
  await updateCounselingRecord(staff(uid), id, { content: "수정된 정식 상담" });
  await assertFails(deleteDoc(memoRef(db)));
  await expect(service.deleteConfirmed(memo)).rejects.toThrow("변경");
 });
 it("R5: 다른 UID confirmation 위조 및 다른 UID의 확인 재사용 DENY", async () => {
  const { db, service, memo } = await transcribed();
  await assertFails(directConfirm(db, { confirmedBy: "second-staff" }));
  await service.confirmTranscription(memo);
  await assertFails(deleteDoc(memoRef(staff("second-staff"))));
 });
 it("R6: 오래된 상담 revision confirmation DENY", async () => {
  const { db, service, memo, id } = await transcribed();
  await updateCounselingRecord(db, id, { result: "변경" });
  await assertFails(directConfirm(db));
  await expect(service.confirmTranscription(memo, 1)).rejects.toThrow();
 });
 it("R7: 오래된 memo revision 요청 및 metadata 되돌리기 DENY", async () => {
  const { db, service, memo, id } = await transcribed();
  await service.save(memo, json, true);
  await service.saveTranscription(await readMemo(db), form, (await service.loadRecord(id))?.updatedAt);
  await expect(service.confirmTranscription(memo)).rejects.toThrow();
  await assertFails(directConfirm(db, { revision: 1, transcribedRevision: 1 }));
 });
 it("R8: 최신 상태 확인을 별도 commit 후 삭제하고 정식 상담 유지", async () => {
  const { db, service, memo, id } = await transcribed();
  await assertFails(deleteDoc(memoRef(db)));
  await service.confirmTranscription(memo, 1);
  const confirmed = await readMemo(db);
  expect(confirmed.confirmedBy).toBe("staff"); expect(confirmed.confirmedAt).toBeTruthy();
  expect(confirmed.transcribedCounselingRevision).toBe(1);
  await service.deleteConfirmed(confirmed);
  expect((await getDoc(memoRef(db))).exists()).toBe(false);
  expect((await getDoc(doc(db, COUNSELING_COLLECTION, id))).data()?.revision).toBe(1);
 });
 it("revision invariant: 유지/감소/+2/삭제/타입/legacy 반복 초기화 DENY", async () => {
  const db = staff(), ref = await createCounselingRecord(db, form);
  for (const revision of [1, 0, 3, deleteField(), "2", 2.5]) await assertFails(updateDoc(ref, { content: "attack", revision, updatedAt: serverTimestamp() }));
  await updateCounselingRecord(db, ref.id, { result: "정상 수정" });
  expect((await getDoc(ref)).data()?.revision).toBe(2);
  await assertFails(updateDoc(ref, { revision: 1, updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db, COUNSELING_COLLECTION, "missing-revision"), { ...form, createdAt: serverTimestamp() }));
  await assertFails(updateDoc(ref, { content: "timestamp bypass", revision: 3 }));
 });
 it("legacy 조회 → 첫 수정 1 → 두 번째 수정 2; 신규 1", async () => {
  const db = staff(), ref = doc(db, COUNSELING_COLLECTION, "legacy");
  await env.withSecurityRulesDisabled(async context => { await setDoc(doc(context.firestore() as unknown as Firestore, COUNSELING_COLLECTION, ref.id), form); });
  expect((await getDoc(ref)).data()?.content).toBe(form.content);
  await updateCounselingRecord(db, ref.id, { content: "first" });
  expect((await getDoc(ref)).data()?.revision).toBe(1);
  await updateCounselingRecord(db, ref.id, { result: "second" });
  expect((await getDoc(ref)).data()?.revision).toBe(2);
 });
 it.each([null, "legacy-date"])("legacy createdAt=%s 유지하며 전사/확인/삭제 가능", async createdAt => {
  const db = staff(), service = api(db);
  await service.save(seed, json, false);
  await env.withSecurityRulesDisabled(async context => {
   const setup = context.firestore() as unknown as Firestore;
   await setDoc(doc(setup, COUNSELING_COLLECTION, "legacy"), { ...form, createdAt });
   await updateDoc(memoRef(setup), { counselingRecordId: "legacy" });
  });
  await service.saveTranscription(await readMemo(db), form, null);
  expect((await service.loadRecord("legacy"))).toMatchObject({ revision: 1, createdAt });
  await service.removeAfterTranscription(await readMemo(db), 1);
  expect((await getDoc(memoRef(db))).exists()).toBe(false);
 });
 it("formal-only recovery create/update increments revision and preserves stale-edit protection", async () => {
  const db = staff(), service = api(db);
  await service.saveRecoveredTranscription(seed, "recovery", form);
  const first = await service.loadRecord("recovery");
  expect(first?.revision).toBe(1);
  await service.saveRecoveredTranscription(seed, "recovery", { ...form, result: "updated" }, first?.updatedAt);
  expect((await service.loadRecord("recovery"))?.revision).toBe(2);
  await expect(service.saveRecoveredTranscription(seed, "recovery", form, first?.updatedAt)).rejects.toThrow();
  expect((await getDoc(memoRef(db))).exists()).toBe(false);
 });
 it("formal delete/recreate with revision 1 cannot reuse old memo confirmation", async () => {
  const { db, service, memo, id } = await transcribed();
  await service.confirmTranscription(memo);
  const ref = doc(db, COUNSELING_COLLECTION, id);
  await deleteDoc(ref);
  await setDoc(ref, { ...form, revision: 1, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await assertFails(deleteDoc(memoRef(db)));
 });
 it("新 transcription resets confirmation even when handwriting revision stays unchanged", async () => {
  const { db, service, memo, id } = await transcribed();
  await service.confirmTranscription(memo);
  await service.saveTranscription(await readMemo(db), form, (await service.loadRecord(id))?.updatedAt);
  expect((await readMemo(db)).confirmedAt).toBeNull();
  expect((await readMemo(db)).transcribedCounselingRevision).toBe(2);
  await assertFails(deleteDoc(memoRef(db)));
 });
 it("client timestamp / arbitrary transcription version / confirmation extra field DENY", async () => {
  const { db } = await transcribed();
  for (const patch of [{ confirmedAt: Timestamp.fromMillis(1) }, { transcribedCounselingRevision: 9 }, { extra: true }]) await assertFails(directConfirm(db, patch));
 });
 it("unauthenticated/non-staff CRUD DENY including confirmation", async () => {
  const { memo } = await transcribed();
  for (const context of [env.unauthenticatedContext(), env.authenticatedContext("viewer", { role: "viewer" })]) {
   const db = context.firestore() as unknown as Firestore;
   const { id: _id, ...data } = memo;
   await assertFails(setDoc(doc(db, COUNSELING_HANDWRITING_COLLECTION, "forged"), data));
   await assertFails(directConfirm(db)); await assertFails(deleteDoc(memoRef(db)));
  }
 });
 it("confirmation/delete race keeps server memo, local dirty draft, formal record; re-transcribe/re-confirm retry succeeds", async () => {
  const { db, service, memo, id } = await transcribed();
  await service.confirmTranscription(memo);
  setHandwritingDraft("staff", { memo, strokes: JSON.parse(json), savedOnServer: true, generation: 1 });
  await updateCounselingRecord(staff("second-staff"), id, { content: "他職員 수정" });
  await expect(service.deleteConfirmed(memo)).rejects.toThrow();
  expect((await getDoc(memoRef(db))).exists()).toBe(true);
  expect(getHandwritingDraft("staff", memo.id)?.generation).toBe(1);
  expect((await service.loadRecord(id))?.content).toBe("他職員 수정");
  const reopened = await readMemo(db);
  await service.saveTranscription(reopened, form, (await service.loadRecord(id))?.updatedAt);
  await service.removeAfterTranscription(await readMemo(db), 3);
  expect(getHandwritingDraft("staff", memo.id)).toBeUndefined();
  expect((await getDoc(memoRef(db))).exists()).toBe(false);
  expect((await service.loadRecord(id))?.content).toBe(form.content);
  await service.save({ ...seed, id: "new-memo" }, json, false);
 });
 it("same batch counseling change plus delete is denied by getAfter", async () => {
  const { db, service, memo, id } = await transcribed();
  await service.confirmTranscription(memo);
  const batch = writeBatch(db);
  batch.update(doc(db, COUNSELING_COLLECTION, id), { content: "race", revision: 2, updatedAt: serverTimestamp() });
  batch.delete(memoRef(db));
  await assertFails(batch.commit());
  expect((await getDoc(memoRef(db))).exists()).toBe(true);
  expect((await service.loadRecord(id))?.revision).toBe(1);
 });
 it("real demo Auth login → memo/PC/transcription/confirmation/delete lifecycle", async () => {
  const app = initializeApp({ projectId: "demo-dongbaek-forms", apiKey: "demo-key" }, `safe-delete-${crypto.randomUUID()}`);
  try {
   const auth = getAuth(app);
   connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
   const { user } = await signInAnonymously(auth);
   const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-key`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer owner" }, body: JSON.stringify({ localId: user.uid, customAttributes: JSON.stringify({ role: "admin" }) }) });
   expect(response.ok).toBe(true);
   expect((await user.getIdTokenResult(true)).claims.role).toBe("admin");
   const db = getFirestore(app);
   const [host, port] = process.env.FIRESTORE_EMULATOR_HOST!.split(":");
   connectFirestoreEmulator(db, host, Number(port));
   const service = createHandwritingApi(db, async () => user.uid);
   await service.save(seed, json, false);
   const pc = env.authenticatedContext(user.uid, { role: "admin" }).firestore() as unknown as Firestore;
   const pcService = createHandwritingApi(pc, async () => user.uid);
   const reopened = await readMemo(pc);
   expect(reopened.strokesJson).toBe(json);
   const id = await pcService.saveTranscription(reopened, form);
   const latest = await readMemo(pc);
   await pcService.confirmTranscription(latest, 1);
   await pcService.deleteConfirmed(latest);
   expect((await getDocs(collection(pc, COUNSELING_HANDWRITING_COLLECTION))).empty).toBe(true);
   expect((await pcService.loadRecord(id))?.content).toBe(form.content);
  } finally { await deleteApp(app); }
 }, 20000);
});
