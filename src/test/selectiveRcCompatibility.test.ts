// @vitest-environment node
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc, type Firestore } from "firebase/firestore";
import { createHandwritingApi } from "@/lib/counselingHandwritingApi";
import { createHandwritingApi as baselineApi } from "./fixtures/rc-baselineHandwritingApi";
import { createRegistrationHandwritingApi, newRegistrationMemo } from "@/lib/registrationHandwritingApi";
import { createCounselingRecord, updateCounselingRecord } from "@/lib/counselingRevision";
import { encodeStrokes, type HandwritingMemo } from "@/lib/counselingHandwriting";
import { COUNSELING_HANDWRITING_COLLECTION, USERS_COLLECTION, WORKERS_COLLECTION, REGISTRATION_HANDWRITING_COLLECTION } from "@/lib/collectionNames";

const production = readFileSync("src/test/fixtures/rc-production-v2.rules", "utf8");
const candidate = readFileSync("firestore.rules", "utf8");
const form = { targetType: "이용자" as const, targetId: "synthetic", targetName: "synthetic", counselorName: "synthetic", date: "2026-10-06", category: "일반상담", content: "synthetic", result: "" };
const json = encodeStrokes([{ id: "stroke", width: 4, points: [[10, 20, 0.5]] }]);
const seed: HandwritingMemo = { id: "compat-memo", schemaVersion: 1, targetType: "이용자", targetId: "synthetic", targetKey: "user:synthetic", counselingRecordId: "", createdBy: "staff", updatedBy: "staff", createdAt: null, updatedAt: null, revision: 0, width: 1600, height: 1000, strokesJson: "[]", transcribedRevision: -1, transcribedAt: null };

it("RC compatibility uses the exact production Safe Delete V2 Rules", () => {
  expect(createHash("sha256").update(production).digest("hex").toUpperCase()).toBe("5D7418D1948883ACA400F6BBBCAE027D9FD77A337CA3AAB7EA2869E1A8999487");
});

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)("selective RC deployment / rollback compatibility", () => {
  it.each(["admin", "social_worker"])("C1 %s: RC Web + production V2 Rules", async role => {
    const env = await initializeTestEnvironment({ projectId: "demo-dongbaek-forms", firestore: { rules: production } });
    try {
      await env.clearFirestore();
      const db = env.authenticatedContext("staff", { role }).firestore() as unknown as Firestore;
      const api = createHandwritingApi(db, async () => "staff");
      const formal = await createCounselingRecord(db, form);
      await updateCounselingRecord(db, formal.id, { content: "updated" });
      expect((await getDoc(formal)).data()?.revision).toBe(2);
      const ref = doc(db, COUNSELING_HANDWRITING_COLLECTION, seed.id);
      const read = async () => ({ ...(await getDoc(ref)).data(), id: seed.id }) as HandwritingMemo;
      await api.save(seed, json, false);
      await api.save(await read(), json, true);
      const current = await read();
      await expect(api.confirmForceDelete(current)).rejects.toMatchObject({ code: "permission-denied" });
      expect((await getDoc(ref)).exists()).toBe(true);
      await api.saveTranscription(await read(), form);
      await api.confirmTranscription(await read());
      await api.deleteConfirmed(await read());
      expect((await getDoc(ref)).exists()).toBe(false);
      const registration = createRegistrationHandwritingApi(db, async () => "staff");
      for (const [type, collection] of [["이용자", USERS_COLLECTION], ["활동지원사", WORKERS_COLLECTION]] as const) {
        const id = crypto.randomUUID();
        // Existing wildcard grants staff access to the newly introduced collection.
        await registration.register(type, id, { name: "synthetic" });
        expect((await getDoc(doc(db, collection, id))).data()?.name).toBe("synthetic");
        const existing = doc(db, collection, "existing");
        await setDoc(existing, { name: "old" });
        await updateDoc(existing, { name: "updated" });
        expect((await getDoc(existing)).data()?.name).toBe("updated");
        const withMemo = crypto.randomUUID();
        await registration.save(newRegistrationMemo(type, withMemo, "staff"), json, false);
        await registration.register(type, withMemo, { name: "memo target" });
        expect((await getDoc(doc(db, collection, withMemo))).data()?.registrationDraftId).toBe(withMemo);
        // Compatibility is functional but fails the new registration security contract.
        await deleteDoc(doc(db, REGISTRATION_HANDWRITING_COLLECTION, withMemo));
        expect((await getDoc(doc(db, REGISTRATION_HANDWRITING_COLLECTION, withMemo))).exists()).toBe(false);
        await setDoc(doc(db, REGISTRATION_HANDWRITING_COLLECTION, "malformed-synthetic"), { malformed: true });
        expect((await getDoc(doc(db, REGISTRATION_HANDWRITING_COLLECTION, "malformed-synthetic"))).data()?.malformed).toBe(true);
      }
    } finally { await env.cleanup(); }
  }, 30000);

  it.each(["admin", "social_worker"])("C2 %s: baseline production Web + RC Rules", async role => {
    const env = await initializeTestEnvironment({ projectId: "demo-dongbaek-forms", firestore: { rules: candidate } });
    try {
      await env.clearFirestore();
      const db = env.authenticatedContext("staff", { role }).firestore() as unknown as Firestore;
      const api = baselineApi(db, async () => "staff");
      const formal = await createCounselingRecord(db, form);
      await updateCounselingRecord(db, formal.id, { content: "updated" });
      expect((await getDoc(formal)).data()?.revision).toBe(2);
      const ref = doc(db, COUNSELING_HANDWRITING_COLLECTION, seed.id);
      const read = async () => ({ ...(await getDoc(ref)).data(), id: seed.id }) as HandwritingMemo;
      await api.save(seed, json, false);
      await api.save(await read(), json, true);
      await api.saveTranscription(await read(), form);
      await api.confirmTranscription(await read());
      await api.deleteConfirmed(await read());
      expect((await getDoc(ref)).exists()).toBe(false);
      for (const collection of [USERS_COLLECTION, WORKERS_COLLECTION]) {
        const ref = doc(db, collection, "baseline-new");
        await setDoc(ref, { name: "synthetic" });
        await updateDoc(ref, { name: "updated" });
        expect((await getDoc(ref)).data()?.name).toBe("updated");
        const child = doc(db, collection, "baseline-new", "business", "child");
        await setDoc(child, { value: true });
        expect((await getDoc(child)).data()?.value).toBe(true);
      }
    } finally { await env.cleanup(); }
  }, 30000);

  it("Rules-only rollback preserves artifacts, blocks force-metadata edits, and loses registration protection", async () => {
    const env = await initializeTestEnvironment({ projectId: "demo-dongbaek-forms", firestore: { rules: candidate } });
    try {
      await env.clearFirestore();
      const db = env.authenticatedContext("staff", { role: "admin" }).firestore() as unknown as Firestore;
      const api = createHandwritingApi(db, async () => "staff");
      const memoRef = doc(db, COUNSELING_HANDWRITING_COLLECTION, seed.id);
      const read = async () => ({ ...(await getDoc(memoRef)).data(), id: seed.id }) as HandwritingMemo;
      await api.save(seed, json, false);
      await api.confirmForceDelete(await read());
      const registration = createRegistrationHandwritingApi(db, async () => "staff");
      const draft = crypto.randomUUID();
      await registration.save(newRegistrationMemo("이용자", draft, "staff"), json, false);
      await registration.register("이용자", draft, { name: "synthetic" });
      await env.cleanup();
      const rollback = await initializeTestEnvironment({ projectId: "demo-dongbaek-forms", firestore: { rules: production } });
      try {
        const db = rollback.authenticatedContext("staff", { role: "admin" }).firestore() as unknown as Firestore;
        const api = createHandwritingApi(db, async () => "staff");
        const current = { ...(await getDoc(doc(db, COUNSELING_HANDWRITING_COLLECTION, seed.id))).data(), id: seed.id } as HandwritingMemo;
        await expect(api.save(current, json, true)).rejects.toMatchObject({ code: "permission-denied" });
        await expect(api.forceDeleteConfirmed(current)).rejects.toMatchObject({ code: "permission-denied" });
        const registration = createRegistrationHandwritingApi(db, async () => "staff");
        await registration.register("활동지원사", crypto.randomUUID(), { name: "synthetic" });
        const target = doc(db, USERS_COLLECTION, draft);
        await updateDoc(target, { name: "updated" });
        expect((await getDoc(target)).data()?.name).toBe("updated");
        await rollback.withSecurityRulesDisabled(async ctx => {
          expect((await getDoc(doc(ctx.firestore(), REGISTRATION_HANDWRITING_COLLECTION, draft))).exists()).toBe(true);
          expect((await getDoc(doc(ctx.firestore(), COUNSELING_HANDWRITING_COLLECTION, seed.id))).data()?.strokesJson).toBe(json);
        });
        await registration.save((await registration.load(draft))!, json, true);
        // Keep the real rollback artifact; use a sibling to prove unsafe direct deletion.
        const sibling = crypto.randomUUID();
        await registration.save(newRegistrationMemo("활동지원사", sibling, "staff"), json, false);
        await deleteDoc(doc(db, REGISTRATION_HANDWRITING_COLLECTION, sibling));
        expect((await getDoc(doc(db, REGISTRATION_HANDWRITING_COLLECTION, sibling))).exists()).toBe(false);
        // Baseline Web's ordinary workflow can resume after Web + Rules rollback.
        const old = baselineApi(db, async () => "staff");
        const oldSeed = { ...seed, id: "rollback-clean-memo" };
        const oldRef = doc(db, COUNSELING_HANDWRITING_COLLECTION, oldSeed.id);
        const oldRead = async () => ({ ...(await getDoc(oldRef)).data(), id: oldSeed.id }) as HandwritingMemo;
        await old.save(oldSeed, json, false);
        await old.saveTranscription(await oldRead(), form);
        await old.confirmTranscription(await oldRead());
        await old.deleteConfirmed(await oldRead());
        expect((await getDoc(oldRef)).exists()).toBe(false);
      } finally { await rollback.cleanup(); }
    } finally { await env.cleanup(); }
  }, 30000);
});
