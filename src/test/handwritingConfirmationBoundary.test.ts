// @vitest-environment node
import { describe, expect, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, runTransaction, serverTimestamp, updateDoc, writeBatch, type Firestore } from "firebase/firestore";
import { COUNSELING_COLLECTION, COUNSELING_HANDWRITING_COLLECTION } from "@/lib/collectionNames";

// Deliberately a minimal semantics probe, NOT the application Rules candidate.
const rules = `rules_version = '2';
service cloud.firestore {
 match /databases/{database}/documents {
  function staff() { return request.auth != null && request.auth.token.role in ['admin', 'social_worker']; }
  match /counseling/{id} { allow read: if staff(); }
  match /counselingHandwritingMemos/{id} {
   allow read: if staff();
   allow update: if staff()
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['confirmedBy', 'confirmedAt'])
    && request.resource.data.confirmedBy == request.auth.uid
    && request.resource.data.confirmedAt == request.time
    && resource.data.revision == resource.data.transcribedRevision
    && get(/databases/$(database)/documents/counseling/$(resource.data.counselingRecordId)).data.revision == resource.data.transcribedCounselingRevision;
   allow delete: if staff()
    && resource.data.confirmedBy == request.auth.uid
    && resource.data.confirmedAt is timestamp
    && resource.data.revision == resource.data.transcribedRevision
    && getAfter(/databases/$(database)/documents/counseling/$(resource.data.counselingRecordId)).data.revision == resource.data.transcribedCounselingRevision;
  }
 }
}`;

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)("confirmation metadata trust boundary (not deployable Rules)", () => {
 async function fixture(work: (db: Firestore) => Promise<void>, stale = false, activeRules = rules) {
  const env = await initializeTestEnvironment({ projectId: "demo-dongbaek-forms", firestore: { rules: activeRules } });
  try {
   await env.clearFirestore();
   await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore() as unknown as Firestore;
    const batch = writeBatch(db);
    batch.set(doc(db, COUNSELING_COLLECTION, "record"), { revision: stale ? 2 : 1, content: "synthetic formal record" });
    batch.set(doc(db, COUNSELING_HANDWRITING_COLLECTION, "memo"), { revision: 1, transcribedRevision: 1, counselingRecordId: "record", transcribedCounselingRevision: 1, confirmedBy: "", confirmedAt: null });
    await batch.commit();
   });
   await work(env.authenticatedContext("staff", { role: "admin" }).firestore() as unknown as Firestore);
  } finally { await env.cleanup(); }
 }
 const ref = (db: Firestore) => doc(db, COUNSELING_HANDWRITING_COLLECTION, "memo");

 it("direct delete without confirmation is denied and memo survives", async () => {
  await fixture(async db => { await assertFails(deleteDoc(ref(db))); expect((await getDoc(ref(db))).exists()).toBe(true); });
 }, 20000);
 it("forged other UID confirmation is denied", async () => {
  await fixture(async db => { await assertFails(updateDoc(ref(db), { confirmedBy: "other-staff", confirmedAt: serverTimestamp() })); });
 }, 20000);
 it("stale formal revision confirmation is denied", async () => {
  await fixture(async db => { await assertFails(updateDoc(ref(db), { confirmedBy: "staff", confirmedAt: serverTimestamp() })); }, true);
 }, 20000);
 it("same-document confirmation then delete in one batch cannot provide persisted confirmation", async () => {
  await fixture(async db => {
   const batch = writeBatch(db);
   batch.update(ref(db), { confirmedBy: "staff", confirmedAt: serverTimestamp() });
   batch.delete(ref(db));
   await assertFails(batch.commit());
   expect((await getDoc(ref(db))).data()?.confirmedAt).toBeNull();
  });
 }, 20000);
 it("authenticated staff can issue valid confirmation and delete using SDK alone, without UI click", async () => {
  await fixture(async db => {
   await assertSucceeds(runTransaction(db, async tx => {
    await tx.get(ref(db));
    await tx.get(doc(db, COUNSELING_COLLECTION, "record"));
    tx.update(ref(db), { confirmedBy: "staff", confirmedAt: serverTimestamp() });
   }));
   await assertSucceeds(runTransaction(db, async tx => {
    await tx.get(ref(db));
    await tx.get(doc(db, COUNSELING_COLLECTION, "record"));
    tx.delete(ref(db));
   }));
   expect((await getDoc(ref(db))).exists()).toBe(false);
   expect((await getDoc(doc(db, COUNSELING_COLLECTION, "record"))).exists()).toBe(true);
  });
 }, 20000);
 it("getAfter on deleted memo cannot observe intermediate confirmation metadata", async () => {
  const afterRules = rules.replace("    && resource.data.confirmedBy == request.auth.uid", "    && getAfter(/databases/$(database)/documents/counselingHandwritingMemos/$(id)).data.confirmedBy == request.auth.uid");
  await fixture(async db => {
   const batch = writeBatch(db);
   batch.update(ref(db), { confirmedBy: "staff", confirmedAt: serverTimestamp() });
   batch.delete(ref(db));
   await assertFails(batch.commit());
   expect((await getDoc(ref(db))).exists()).toBe(true);
  }, false, afterRules);
 }, 20000);
});
