import { readFileSync } from "node:fs";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInAnonymously } from "firebase/auth";
import { connectFirestoreEmulator, doc, getDoc, getFirestore, type Firestore } from "firebase/firestore";
import { COUNSELING_COLLECTION, COUNSELING_HANDWRITING_COLLECTION } from "@/lib/collectionNames";
import { clearAllHandwritingDrafts, getHandwritingDraft, type HandwritingMemo } from "@/lib/counselingHandwriting";

const boundary = vi.hoisted(() => ({ service: null as ReturnType<typeof import("@/lib/counselingHandwritingApi").createHandwritingApi> | null }));
vi.mock("@/lib/counselingHandwritingApi", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/counselingHandwritingApi")>();
  return { ...actual, handwritingApi: {
    save: (...args: Parameters<typeof actual.handwritingApi.save>) => boundary.service!.save(...args),
    subscribe: (...args: Parameters<typeof actual.handwritingApi.subscribe>) => boundary.service!.subscribe(...args),
  } };
});
import { createHandwritingApi } from "@/lib/counselingHandwritingApi";
import { useCounselingHandwriting } from "@/hooks/useCounselingHandwriting";
afterEach(() => { cleanup(); clearAllHandwritingDrafts(); boundary.service = null; });

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)("candidate Rules와 실제 hook autosave", () => {
  it("실제 Auth → 대상 memo → timer autosave → PC 재열기 → 전사 → 확인 → 삭제 E2E와 5초 최소 간격", async () => {
    const environment = await initializeTestEnvironment({ projectId: "demo-dongbaek-forms", firestore: { rules: readFileSync(process.env.HANDWRITING_RULES_FIXTURE || "src/test/fixtures/handwriting-safe-delete-v2.rules", "utf8") } });
    const app = initializeApp({ projectId: "demo-dongbaek-forms", apiKey: "demo-key" }, `autosave-v2-${crypto.randomUUID()}`);
    try {
      await environment.clearFirestore();
      const auth = getAuth(app);
      connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
      const { user } = await signInAnonymously(auth);
      const claim = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-key`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer owner" }, body: JSON.stringify({ localId: user.uid, customAttributes: JSON.stringify({ role: "social_worker" }) }) });
      expect(claim.ok).toBe(true);
      expect((await user.getIdTokenResult(true)).claims.role).toBe("social_worker");
      const db = getFirestore(app);
      const [host, port] = process.env.FIRESTORE_EMULATOR_HOST!.split(":");
      connectFirestoreEmulator(db, host, Number(port));
      boundary.service = createHandwritingApi(db, async () => user.uid);
      const memo: HandwritingMemo = { id: "synthetic-autosave", schemaVersion: 1, targetType: "이용자", targetId: "synthetic-user", targetKey: "user:synthetic-user", counselingRecordId: "", createdBy: "staff", updatedBy: "staff", createdAt: null, updatedAt: null, revision: 0, width: 1600, height: 1000, strokesJson: "[]", transcribedRevision: -1, transcribedAt: null };
      const hook = renderHook(() => useCounselingHandwriting(memo, user.uid));
      act(() => hook.result.current.change([{ id: "one", width: 4, points: [[10, 20, 0.5]] }]));
      await waitFor(() => expect(hook.result.current.memo.revision).toBe(1), { timeout: 8000 });
      const first = (await getDoc(doc(db, COUNSELING_HANDWRITING_COLLECTION, memo.id))).data();
      act(() => hook.result.current.change([{ id: "two", width: 4, points: [[30, 40, 0.5]] }]));
      await waitFor(() => expect(hook.result.current.memo.revision).toBe(2), { timeout: 8000 });
      const second = (await getDoc(doc(db, COUNSELING_HANDWRITING_COLLECTION, memo.id))).data();
      expect(second?.updatedAt.toMillis() - first?.updatedAt.toMillis()).toBeGreaterThanOrEqual(5000);
      expect(JSON.parse(second?.strokesJson)[0].id).toBe("two");
      expect(second?.transcribedRevision).toBe(-1);
      hook.unmount();
      const pc = environment.authenticatedContext(user.uid, { role: "social_worker" }).firestore() as unknown as Firestore;
      const service = createHandwritingApi(pc, async () => user.uid);
      const reopened = { ...(await getDoc(doc(pc, COUNSELING_HANDWRITING_COLLECTION, memo.id))).data(), id: memo.id } as HandwritingMemo;
      expect(reopened.strokesJson).toBe(second?.strokesJson);
      const id = await service.saveTranscription(reopened, { targetType: memo.targetType, targetId: memo.targetId, targetName: "합성 대상", content: "PC 전사", result: "확인", category: "일반상담", counselorName: "직원", date: "2026-10-06" });
      const transcribed = { ...(await getDoc(doc(pc, COUNSELING_HANDWRITING_COLLECTION, memo.id))).data(), id: memo.id } as HandwritingMemo;
      expect(transcribed.transcribedCounselingRevision).toBe(1);
      await service.confirmTranscription(transcribed, 1);
      expect((await getDoc(doc(pc, COUNSELING_HANDWRITING_COLLECTION, memo.id))).data()?.confirmedBy).toBe(user.uid);
      await service.deleteConfirmed(transcribed);
      expect((await getDoc(doc(pc, COUNSELING_HANDWRITING_COLLECTION, memo.id))).exists()).toBe(false);
      expect((await getDoc(doc(pc, COUNSELING_COLLECTION, id))).data()).toMatchObject({ revision: 1, content: "PC 전사" });
    } finally { cleanup(); await environment.cleanup(); await deleteApp(app); }
  }, 30000);
  it("FD14: real remote force deletion retains dirty hook and blocks resurrection", async () => {
    const env = await initializeTestEnvironment({ projectId: "demo-dongbaek-forms", firestore: { rules: readFileSync("firestore.rules", "utf8") } });
    try {
      await env.clearFirestore();
      const db = env.authenticatedContext("device-a", { role: "admin" }).firestore() as unknown as Firestore;
      const remoteDb = env.authenticatedContext("device-b", { role: "social_worker" }).firestore() as unknown as Firestore;
      boundary.service = createHandwritingApi(db, async () => "device-a");
      const seed: HandwritingMemo = { id: "force-dirty", schemaVersion: 1, targetType: "이용자", targetId: "synthetic", targetKey: "user:synthetic", counselingRecordId: "", createdBy: "device-a", updatedBy: "device-a", createdAt: null, updatedAt: null, revision: 0, width: 1600, height: 1000, strokesJson: "[]", transcribedRevision: -1, transcribedAt: null };
      await boundary.service.save(seed, "[]", false);
      const memo = { ...(await getDoc(doc(db, COUNSELING_HANDWRITING_COLLECTION, seed.id))).data(), id: seed.id } as HandwritingMemo;
      const hook = renderHook(() => useCounselingHandwriting(memo, "device-a"));
      await waitFor(() => expect(hook.result.current.phase).toBe("CLEAN"));
      act(() => hook.result.current.stage([{ id: "dirty", width: 4, points: [[10, 20, 0.5]] }]));
      const remote = createHandwritingApi(remoteDb, async () => "device-b");
      await remote.confirmForceDelete(memo); await remote.forceDeleteConfirmed(memo);
      await waitFor(() => expect(hook.result.current.phase).toBe("REMOTE_DELETED_WITH_LOCAL_CHANGES"), { timeout: 5000 });
      expect(getHandwritingDraft("device-a", memo.id)?.strokes[0].id).toBe("dirty");
      await expect(hook.result.current.flush()).rejects.toThrow();
      expect((await getDoc(doc(db, COUNSELING_HANDWRITING_COLLECTION, memo.id))).exists()).toBe(false);
      hook.unmount();
    } finally { cleanup(); await env.cleanup(); }
  }, 20000);

});
