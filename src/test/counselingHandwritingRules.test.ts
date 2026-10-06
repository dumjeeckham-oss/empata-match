// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc, type Firestore } from "firebase/firestore";
import { createHandwritingApi } from "@/lib/counselingHandwritingApi";
import { clearAllHandwritingDrafts, encodeStrokes, getHandwritingDraft, setHandwritingDraft, type HandwritingMemo } from "@/lib/counselingHandwriting";
import { COUNSELING_COLLECTION, COUNSELING_HANDWRITING_COLLECTION } from "@/lib/collectionNames";

const available = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const json = encodeStrokes([{ id: "synthetic-stroke", width: 4, points: [[10, 20, 0.5], [100, 200, 1]] }]);
const initial = (id = "synthetic-memo"): HandwritingMemo => ({ id, schemaVersion: 1, targetId: "synthetic-user", targetType: "이용자", targetKey: "user:synthetic-user", counselingRecordId: "", createdBy: "staff-1", updatedBy: "staff-1", createdAt: null, updatedAt: null, revision: 0, width: 1600, height: 1000, strokesJson: "[]", transcribedRevision: -1, transcribedAt: null });
const form = { targetType: "이용자" as const, targetId: "synthetic-user", targetName: "합성 이용자", counselorName: "합성 직원", date: "2026-10-02", category: "일반상담", content: "직원이 직접 전사한 합성 상담내용", result: "전사 확인" };

describe.skipIf(!available)("임시 손글씨 Rules·전달·즉시 폐기", () => {
  let environment: RulesTestEnvironment;
  const ref = (database: Firestore, id = "synthetic-memo") => doc(database, COUNSELING_HANDWRITING_COLLECTION, id);
  // Rules test contexts expose compat types; modular SDK accepts their underlying instance.
  const staff = (uid = "staff-1", role = "admin") => environment.authenticatedContext(uid, { role }).firestore() as unknown as Firestore;
  const api = (database: Firestore, uid = "staff-1") => createHandwritingApi(database, async () => uid);
  const readMemo = async (database: Firestore, id = "synthetic-memo") => ({ ...(await getDoc(ref(database, id))).data(), id }) as HandwritingMemo;
  beforeAll(async () => { environment = await initializeTestEnvironment({ projectId: "demo-dongbaek-forms", firestore: { rules: readFileSync(process.env.HANDWRITING_RULES_FIXTURE || "src/test/fixtures/production-firestore.rules", "utf8") } }); });
  beforeEach(async () => { await environment.clearFirestore(); clearAllHandwritingDrafts(); });
  afterAll(async () => { clearAllHandwritingDrafts(); await environment.cleanup(); });

  it("Temporary Data Lifecycle: 태블릿 → PC → 정식 저장 → 손글씨 0건·로컬 0건·정식 기록 유지", async () => {
    const tablet = staff(), desktop = staff("staff-2", "social_worker");
    const tabletApi = api(tablet), desktopApi = api(desktop, "staff-2");
    const start = initial();
    await tabletApi.save(start, json, false);
    expect((await getDoc(ref(tablet))).exists()).toBe(true);
    const onPC = await readMemo(desktop);
    expect(onPC.strokesJson).toBe(json);
    setHandwritingDraft("staff-2", { memo: onPC, savedOnServer: true, strokes: [], generation: 0 });
    const recordId = await desktopApi.saveTranscription(onPC, form);
    const saved = await readMemo(desktop);
    expect(saved.counselingRecordId).toBe(recordId);
    await desktopApi.removeAfterTranscription(saved);
    expect((await getDocs(collection(desktop, COUNSELING_HANDWRITING_COLLECTION))).size).toBe(0);
    expect(getHandwritingDraft("staff-2", saved.id)).toBeUndefined();
    const formal = await getDoc(doc(desktop, COUNSELING_COLLECTION, recordId));
    expect(formal.data()?.content).toBe(form.content);
    expect(formal.data()?.result).toBe(form.result);
    expect(formal.data()).not.toHaveProperty("strokesJson");
    expect(formal.data()).not.toHaveProperty("handwritingHistory");
    await expect(tabletApi.save({ ...onPC, revision: 1 }, json, true)).rejects.toThrow("이미 삭제");
    expect((await getDoc(ref(tablet))).exists()).toBe(false);
  });

  it("읽기·전사 입력 시작·저장 실패로는 메모가 삭제되지 않는다", async () => {
    const database = staff(), service = api(database);
    await service.save(initial(), json, false);
    const memo = await readMemo(database);
    await expect(service.saveTranscription(memo, { ...form, content: "   " })).rejects.toThrow();
    await expect(service.removeAfterTranscription(memo)).rejects.toThrow("먼저 저장");
    await assertFails(deleteDoc(ref(database)));
    expect((await getDoc(ref(database))).data()?.strokesJson).toBe(json);
  });

  it("다른 기기 revision 충돌을 차단하고 기존 필기를 덮어쓰지 않는다", async () => {
    const database = staff(), service = api(database);
    await service.save(initial(), json, false);
    const previous = await readMemo(database);
    const nextJson = encodeStrokes([{ id: "second", width: 2, points: [[5, 5, 0.5]] }]);
    await service.save(previous, nextJson, true);
    await expect(api(staff("staff-2"), "staff-2").save(previous, json, true)).rejects.toThrow("다른 기기");
    expect((await readMemo(database)).strokesJson).toBe(nextJson);
  });

  it("정식 저장 후 새 필기가 있으면 삭제를 다시 차단한다", async () => {
    const database = staff(), service = api(database);
    await service.save(initial(), json, false);
    await service.saveTranscription(await readMemo(database), form);
    const before = await readMemo(database);
    await service.save(before, json, true);
    await expect(service.removeAfterTranscription(before)).rejects.toThrow();
    await assertFails(deleteDoc(ref(database)));
  });

  it("정식 기록 삭제·다른 대상·미저장 연결 위조를 차단한다", async () => {
    const database = staff(), service = api(database);
    await service.save(initial(), json, false);
    const memo = await readMemo(database);
    await expect(service.saveTranscription(memo, { ...form, targetId: "other-user" })).rejects.toThrow();
    await assertFails(updateDoc(ref(database), { counselingRecordId: "missing", transcribedRevision: 1, transcribedAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: "staff-1" }));
    const recordId = await service.saveTranscription(memo, form);
    await deleteDoc(doc(database, COUNSELING_COLLECTION, recordId));
    await assertFails(deleteDoc(ref(database)));
  });

  it("두 PC가 동시에 저장해 상담기록이 중복 생성되지 않는다", async () => {
    const database = staff(), service = api(database);
    await service.save(initial(), json, false);
    const memo = await readMemo(database);
    const results = await Promise.allSettled([service.saveTranscription(memo, form), api(staff("staff-2"), "staff-2").saveTranscription(memo, form)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((await getDocs(collection(database, COUNSELING_COLLECTION))).size).toBe(1);
  });
  it("기존 상담을 두 PC가 수정하면 stale 저장은 거부되고 첫 내용·손글씨·기록 1건 유지", async () => {
    const a = staff(), b = staff("staff-2", "social_worker"), aa = api(a), bb = api(b, "staff-2");
    await aa.save(initial(), json, false);
    const id = await aa.saveTranscription(await readMemo(a), form);
    const beforeA = await aa.loadRecord(id), beforeB = await bb.loadRecord(id);
    const memoA = await readMemo(a), memoB = await readMemo(b);
    await aa.saveTranscription(memoA, { ...form, content: "PC A" }, beforeA?.updatedAt ?? null);
    await expect(bb.saveTranscription(memoB, { ...form, content: "PC B" }, beforeB?.updatedAt ?? null)).rejects.toThrow("먼저 수정");
    expect((await aa.loadRecord(id))?.content).toBe("PC A");
    expect((await getDocs(collection(a, COUNSELING_COLLECTION))).size).toBe(1);
    expect((await getDoc(ref(a))).exists()).toBe(true);
  });

  it("admin·social_worker만 허용, 익명·일반·비로그인은 모든 접근 차단", async () => {
    await api(staff()).save(initial(), json, false);
    const permitted = staff("worker-1", "social_worker");
    await assertSucceeds(getDoc(ref(permitted)));
    await api(permitted, "worker-1").save(await readMemo(permitted), json, true);
    const blocked = [environment.unauthenticatedContext().firestore(), environment.authenticatedContext("general").firestore(), environment.authenticatedContext("anonymous", { firebase: { sign_in_provider: "anonymous" } }).firestore()] as unknown as Firestore[];
    for (const database of blocked) {
      await assertFails(getDoc(ref(database)));
      await assertFails(getDocs(collection(database, COUNSELING_HANDWRITING_COLLECTION)));
      await assertFails(setDoc(ref(database, "forged"), {}));
      await assertFails(updateDoc(ref(database), { strokesJson: "[]" }));
      await assertFails(deleteDoc(ref(database)));
    }
  });

  it("staff도 잘못된 타입·누락 필드의 malformed 문서를 직접 생성할 수 없다", async () => {
    await assertFails(setDoc(ref(staff(), "malformed"), { targetId: 42, strokesJson: [] }));
  });

  it("작성자·대상·revision·추가 필드·512KiB 초과를 Rules에서 차단", async () => {
    const database = staff(); await api(database).save(initial(), json, false);
    for (const patch of [{ targetId: "other" }, { createdBy: "other" }, { revision: 8 }, { backup: "stroke" }, { strokesJson: "x".repeat(524289) }]) {
      await assertFails(updateDoc(ref(database), { updatedAt: serverTimestamp(), updatedBy: "staff-1", ...patch }));
    }
  });

  it("삭제 대상 메모만 제거하고 다른 상담·다른 메모는 보존", async () => {
    const database = staff(), service = api(database);
    await service.save(initial(), json, false);
    await service.save(initial("another-memo"), json, false);
    await service.saveTranscription(await readMemo(database), form);
    await service.removeAfterTranscription(await readMemo(database));
    expect((await getDoc(ref(database, "another-memo"))).exists()).toBe(true);
    expect((await getDocs(collection(database, COUNSELING_COLLECTION))).size).toBe(1);
  });
  it("삭제된 dirty 메모는 정식 기록만 복구하고 임시 문서 재생성 없이 확인 후 로컬 정리", async () => {
    const database = staff(), service = api(database), memo = initial();
    setHandwritingDraft("staff-1", { memo, strokes: [], savedOnServer: true, generation: 1, recovery: "REMOTE_DELETED_WITH_LOCAL_CHANGES" });
    const id = await service.saveRecoveredTranscription(memo, "recovered-formal", form);
    const record = await service.loadRecord(id);
    expect((await getDoc(ref(database))).exists()).toBe(false);
    await service.confirmRecoveredTranscription(memo, id, record?.updatedAt);
    expect(getHandwritingDraft("staff-1", memo.id)).toBeUndefined();
    expect((await service.loadRecord(id))?.content).toBe(form.content);
  });
  it("updatedAt 없는 legacy 상담도 첫 수정 후 stale PC를 차단", async () => {
    const database = staff(), service = api(database);
    await service.save(initial(), json, false);
    await environment.withSecurityRulesDisabled(async context => { await setDoc(doc(context.firestore() as unknown as Firestore, COUNSELING_COLLECTION, "legacy"), { ...form, createdAt: serverTimestamp() }); });
    await environment.withSecurityRulesDisabled(async context => { await updateDoc(ref(context.firestore() as unknown as Firestore), { counselingRecordId: "legacy" }); });
    const before = await readMemo(database);
    await service.saveTranscription(before, { ...form, content: "legacy A" }, null);
    await expect(api(staff("staff-2"), "staff-2").saveTranscription(before, { ...form, content: "legacy B" }, null)).rejects.toThrow("먼저 수정");
    expect((await service.loadRecord("legacy"))?.content).toBe("legacy A");
  });
  it("직접 공격 28건: 비직원 CRUD/list·업무쓰기·불변필드·하위 경로 모두 deny", async () => {
    const database = staff(); await api(database).save(initial(), json, false);
    let denied = 0;
    const contexts = [environment.unauthenticatedContext(), environment.authenticatedContext("general"), environment.authenticatedContext("viewer", { role: "viewer" }), environment.authenticatedContext("anonymous", { firebase: { sign_in_provider: "anonymous" } })];
    for (const context of contexts) {
      const blocked = context.firestore() as unknown as Firestore;
      for (const operation of [() => getDoc(ref(blocked)), () => setDoc(ref(blocked, "attack"), {}), () => deleteDoc(ref(blocked)), () => getDocs(collection(blocked, COUNSELING_HANDWRITING_COLLECTION)), () => setDoc(doc(blocked, "users", "attack"), {})]) { await assertFails(operation()); denied++; }
    }
    for (const patch of [{ createdBy: "other" }, { createdAt: serverTimestamp() }, { targetType: "활동지원사" }, { targetId: "other" }, { draftId: "extra" }, { revision: 9 }, { archive: json }]) {
      await assertFails(updateDoc(ref(database), { updatedAt: serverTimestamp(), updatedBy: "staff-1", ...patch })); denied++;
    }
    await assertFails(setDoc(doc(database, COUNSELING_HANDWRITING_COLLECTION, "synthetic-memo", "archive", "extra"), { strokesJson: json })); denied++;
    expect(denied).toBe(28);
  });
  it("삭제 실패·재확인·중복 삭제는 정식 기록을 유지", async () => {
    const database = staff(), service = api(database);
    await service.save(initial(), json, false);
    const id = await service.saveTranscription(await readMemo(database), form);
    const memo = await readMemo(database);
    await updateDoc(doc(database, COUNSELING_COLLECTION, id), { revision: 2, updatedAt: serverTimestamp() });
    await expect(service.removeAfterTranscription(memo)).rejects.toThrow();
    expect((await getDoc(ref(database))).exists()).toBe(true);
    await service.saveTranscription(await readMemo(database), form, (await service.loadRecord(id))?.updatedAt);
    await service.removeAfterTranscription(await readMemo(database));
    await service.removeAfterTranscription(memo);
    expect((await getDocs(collection(database, COUNSELING_COLLECTION))).size).toBe(1);
  });
});
