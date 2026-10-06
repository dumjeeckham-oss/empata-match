// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, serverTimestamp, setDoc, type Firestore } from "firebase/firestore";
import { COUNSELING_COLLECTION, USERS_COLLECTION, WORKERS_COLLECTION } from "@/lib/collectionNames";
const boundary = vi.hoisted(() => ({ db: null as Firestore | null }));
vi.mock("@/lib/firebase", async () => {
 const sdk = await import("firebase/firestore");
 return { ...sdk, get db() { return boundary.db; } };
});
import { cascadeUserProfile, cascadeWorkerProfile } from "@/lib/cascadeSync";
import { createCounselingRecord, updateCounselingRecord } from "@/lib/counselingRevision";

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)("actual counseling write paths with V2 Rules", () => {
 let env: RulesTestEnvironment;
 beforeAll(async () => { env = await initializeTestEnvironment({ projectId: "demo-dongbaek-forms", firestore: { rules: readFileSync("src/test/fixtures/handwriting-safe-delete-v2.rules", "utf8") } }); }, 20000);
 beforeEach(async () => { await env.clearFirestore(); boundary.db = env.authenticatedContext("staff", { role: "admin" }).firestore() as unknown as Firestore; });
 afterAll(async () => { boundary.db = null; await env.cleanup(); });

 it.each(["user", "worker"])("%s profile cascade updates legacy/versioned counseling and leaves unrelated collections intact", async kind => {
  const db = boundary.db!, id = `${kind}-person`;
  const formal = { targetType: kind === "user" ? "이용자" : "활동지원사", targetId: id, targetName: "old", targetPhone: "old-phone", content: "keep content", result: "keep result", date: "2026-10-06", category: "일반상담", counselorName: "staff" };
  await env.withSecurityRulesDisabled(async context => {
   const setup = context.firestore() as unknown as Firestore;
   await setDoc(doc(setup, COUNSELING_COLLECTION, "legacy"), formal);
   await setDoc(doc(setup, COUNSELING_COLLECTION, "versioned"), { ...formal, revision: 7, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  });
  await setDoc(doc(db, USERS_COLLECTION, "linked-user"), { assignedHelperIds: id === "worker-person" ? [id] : [], assignedHelperNames: ["old"], assignedHelperPhones: ["old-phone"] });
  await setDoc(doc(db, WORKERS_COLLECTION, "linked-worker"), { assignedUserIds: id === "user-person" ? [id] : [], assignedUserNames: ["old"], assignedUserPhones: ["old-phone"] });
  const next = { name: "new", phone: "new-phone", address: "new-address" };
  const cascade = () => kind === "user" ? cascadeUserProfile(id, next) : cascadeWorkerProfile(id, next);
  await cascade();
  for (const [recordId, revision] of [["legacy", 1], ["versioned", 8]] as const) {
   const record = (await getDoc(doc(db, COUNSELING_COLLECTION, recordId))).data();
   expect(record).toMatchObject({ revision, targetName: next.name, targetPhone: next.phone, targetAddress: next.address, content: formal.content, result: formal.result });
   expect(record?.updatedAt).toBeTruthy();
  }
  await cascade();
  expect((await getDoc(doc(db, COUNSELING_COLLECTION, "legacy"))).data()?.revision).toBe(2);
  expect((await getDoc(doc(db, COUNSELING_COLLECTION, "versioned"))).data()?.revision).toBe(9);
  const linked = (await getDoc(doc(db, kind === "user" ? WORKERS_COLLECTION : USERS_COLLECTION, kind === "user" ? "linked-worker" : "linked-user"))).data();
  expect(kind === "user" ? linked?.assignedUserNames : linked?.assignedHelperNames).toEqual(["new"]);
 });
 it("generic counseling helper creates 1, ignores caller revision, then concurrent updates each increment", async () => {
  const db = boundary.db!;
  const ref = await createCounselingRecord(db, { content: "new", revision: 999 });
  expect((await getDoc(ref)).data()?.revision).toBe(1);
  await Promise.all([updateCounselingRecord(db, ref.id, { result: "first", revision: 999 }), updateCounselingRecord(db, ref.id, { category: "second" })]);
  expect((await getDoc(ref)).data()).toMatchObject({ revision: 3, content: "new", result: "first", category: "second" });
 });
});
