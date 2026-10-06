// @vitest-environment node
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, Timestamp, updateDoc, type Firestore } from "firebase/firestore";
import { createHandwritingApi } from "@/lib/counselingHandwritingApi";
import { createCounselingRecord, updateCounselingRecord } from "@/lib/counselingRevision";
import { encodeStrokes, type HandwritingMemo } from "@/lib/counselingHandwriting";
import { COUNSELING_COLLECTION, COUNSELING_HANDWRITING_COLLECTION } from "@/lib/collectionNames";

const production = readFileSync("src/test/fixtures/production-firestore.rules", "utf8");
const finalRules = readFileSync("firestore.rules", "utf8");
const form = { targetType: "이용자" as const, targetId: "release-synthetic", targetName: "배포 검증 합성 대상", counselorName: "합성 직원", date: "2026-10-06", category: "일반상담", content: "전사된 합성 상담", result: "확인" };
const memo: HandwritingMemo = { id: "release-synthetic-memo", schemaVersion: 1, targetType: form.targetType, targetId: form.targetId, targetKey: "user:" + form.targetId, counselingRecordId: "", createdBy: "staff", updatedBy: "staff", createdAt: null, updatedAt: null, revision: 0, width: 1600, height: 1000, strokesJson: "[]", transcribedRevision: -1, transcribedAt: null };

it("release Rules artifact is the verified V2 and preserves the exact production rollback", () => {
  expect(finalRules).toBe(readFileSync("src/test/fixtures/handwriting-safe-delete-v2.rules", "utf8"));
  expect(createHash("sha256").update(production).digest("hex").toUpperCase()).toBe("04D46D9EC51D167493DD0C92ACEC89DEF0FE1DFB462B699D5E6B7C93B4F71948");
  const start = finalRules.indexOf("    // Counseling revision contract;"), end = finalRules.indexOf("    // Blaze 전용", start);
  const restored = (finalRules.slice(0, start) + finalRules.slice(end))
    .replace("        && collectionName != 'counselingHandwritingMemos'\n", "")
    .replace("        && collectionName != 'counseling'\n", "");
  expect(restored).toBe(production);
});

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)("release deployment compatibility", () => {
  it("V2 app lifecycle works under existing production Rules for both staff roles", async () => {
    const env = await initializeTestEnvironment({ projectId: "demo-dongbaek-forms", firestore: { rules: production } });
    try {
      for (const role of ["admin", "social_worker"]) {
        await env.clearFirestore();
        const db = env.authenticatedContext("staff", { role }).firestore() as unknown as Firestore;
        const api = createHandwritingApi(db, async () => "staff");
        const formal = await createCounselingRecord(db, form);
        await updateCounselingRecord(db, formal.id, { result: "수정" });
        expect((await getDoc(formal)).data()?.revision).toBe(2);
        await api.save(memo, encodeStrokes([{ id: "synthetic", width: 4, points: [[10, 20, 0.5]] }]), false);
        const ref = doc(db, COUNSELING_HANDWRITING_COLLECTION, memo.id);
        const read = async () => ({ ...(await getDoc(ref)).data(), id: memo.id }) as HandwritingMemo;
        const savedId = await api.saveTranscription(await read(), form);
        const current = await read();
        await api.confirmTranscription(current);
        await api.deleteConfirmed(await read());
        expect((await getDoc(ref)).exists()).toBe(false);
        expect((await getDoc(doc(db, COUNSELING_COLLECTION, savedId))).data()?.content).toBe(form.content);
      }
    } finally { await env.cleanup(); }
  }, 30000);

  it("Rules-first deployment rejects current client's create and update, including preserved revision", async () => {
    const env = await initializeTestEnvironment({ projectId: "demo-dongbaek-forms", firestore: { rules: finalRules } });
    try {
      await env.clearFirestore();
      const db = env.authenticatedContext("staff", { role: "admin" }).firestore() as unknown as Firestore;
      await assertFails(setDoc(doc(db, COUNSELING_COLLECTION, "old-create"), { ...form, createdAt: Timestamp.now() }));
      const ref = await createCounselingRecord(db, form);
      await assertSucceeds(getDoc(ref));
      await assertFails(updateDoc(ref, { content: "old client edit", updatedAt: Timestamp.now() }));
      expect((await getDoc(ref)).data()?.revision).toBe(1);
      await env.withSecurityRulesDisabled(async ctx => { await setDoc(doc(ctx.firestore(), COUNSELING_COLLECTION, "legacy"), form); });
      await assertFails(updateDoc(doc(db, COUNSELING_COLLECTION, "legacy"), { content: "old legacy edit", updatedAt: Timestamp.now() }));
    } finally { await env.cleanup(); }
  }, 20000);

  it("Rules rollback allows old updateDoc to preserve metadata but its revision becomes stale", async () => {
    const env = await initializeTestEnvironment({ projectId: "demo-dongbaek-forms", firestore: { rules: production } });
    try {
      await env.clearFirestore();
      const db = env.authenticatedContext("staff", { role: "social_worker" }).firestore() as unknown as Firestore;
      const ref = await createCounselingRecord(db, form);
      await updateDoc(ref, { content: "old client edit", updatedAt: Timestamp.now() });
      expect((await getDoc(ref)).data()?.revision).toBe(1);
      // An unrestricted overwrite can remove metadata, so Rules rollback is a degraded-security state.
      await assertSucceeds(setDoc(ref, { ...form, updatedAt: serverTimestamp() }));
      expect((await getDoc(ref)).data()?.revision).toBeUndefined();
      await assertSucceeds(deleteDoc(ref));
    } finally { await env.cleanup(); }
  }, 20000);
});
