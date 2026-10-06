// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch, type Firestore } from "firebase/firestore";
import { createHandwritingApi } from "@/lib/counselingHandwritingApi";
import { encodeStrokes, type HandwritingMemo } from "@/lib/counselingHandwriting";
import { COUNSELING_COLLECTION, COUNSELING_HANDWRITING_COLLECTION } from "@/lib/collectionNames";

const production = readFileSync("src/test/fixtures/production-firestore.rules", "utf8");
const candidate = readFileSync("src/test/fixtures/handwriting-hardened-firestore.rules", "utf8");
const v2 = readFileSync("src/test/fixtures/handwriting-safe-delete-v2.rules", "utf8");
const json = encodeStrokes([{ id: "synthetic", width: 4, points: [[10, 20, 0.5]] }]);
const memo: HandwritingMemo = { id: "synthetic-policy", schemaVersion: 1, targetType: "이용자", targetId: "synthetic-user", targetKey: "user:synthetic-user", counselingRecordId: "", createdBy: "staff", updatedBy: "staff", createdAt: null, updatedAt: null, revision: 0, width: 1600, height: 1000, strokesJson: "[]", transcribedRevision: -1, transcribedAt: null };
const form = { targetType: memo.targetType, targetId: memo.targetId, targetName: "합성 대상", counselorName: "합성 직원", date: "2026-10-06", category: "일반상담", content: "합성 정식 상담\n둘째 줄", result: "전사 확인" };
const ref = (db: Firestore, id = memo.id) => doc(db, COUNSELING_HANDWRITING_COLLECTION, id);
const staff = (environment: RulesTestEnvironment, role = "admin") => environment.authenticatedContext("staff", { role }).firestore() as unknown as Firestore;
function creation(): Record<string, unknown> {
  const { id: _id, ...data } = memo;
  return { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), revision: 1, strokesJson: json, transcribedCounselingRevision: -1, confirmedBy: "", confirmedAt: null };
}
async function usingRules(rules: string, work: (environment: RulesTestEnvironment) => Promise<void>) {
  const environment = await initializeTestEnvironment({ projectId: "demo-dongbaek-forms", firestore: { rules } });
  try { await environment.clearFirestore(); await work(environment); } finally { await environment.cleanup(); }
}

it("candidate는 전용 match와 wildcard 제외만 추가하고 나머지 Rules를 그대로 보존한다", () => {
  const start = candidate.indexOf("    // Handwriting-only candidate.");
  const end = candidate.indexOf("    // Blaze 전용", start);
  expect(start).toBeGreaterThan(0);
  const restored = (candidate.slice(0, start) + candidate.slice(end)).replace("        && collectionName != 'counselingHandwritingMemos'\n", "");
  expect(restored).toBe(production);
});

it("V2는 counseling/handwriting match와 두 wildcard 제외 외 기존 Rules를 그대로 보존한다", () => {
  const start = v2.indexOf("    // Counseling revision contract;");
  const end = v2.indexOf("    // Blaze 전용", start);
  expect(start).toBeGreaterThan(0);
  const restored = (v2.slice(0, start) + v2.slice(end))
    .replace("        && collectionName != 'counselingHandwritingMemos'\n", "")
    .replace("        && collectionName != 'counseling'\n", "");
  expect(restored).toBe(production);
});

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)("handwriting Rules 정책·schema 한계", () => {
  it("전용 deny match도 기존 wildcard staff allow를 무효화하지 못한다", async () => {
    const rules = production.replace("    // Blaze 전용", "    match /counselingHandwritingMemos/{memoId} { allow read, write: if false; }\n    // Blaze 전용");
    await usingRules(rules, async environment => {
      const db = staff(environment);
      await assertSucceeds(setDoc(ref(db), { malformed: true }));
      await assertSucceeds(deleteDoc(ref(db)));
    });
  }, 20000);

  it.each(["admin", "social_worker"])("%s create/read/target query/stroke update/PC 재열기/transcription 허용", async role => {
    await usingRules(v2, async environment => {
      const db = staff(environment, role), service = createHandwritingApi(db, async () => "staff");
      expect(await service.save(memo, json, false)).toBe(1);
      const saved = { ...memo, ...(await getDoc(ref(db))).data() } as HandwritingMemo;
      expect(await service.save(saved, json, true)).toBe(2);
      const pc = environment.authenticatedContext("other-staff", { role: "social_worker" }).firestore() as unknown as Firestore;
      const pending = await getDocs(query(collection(pc, COUNSELING_HANDWRITING_COLLECTION), where("targetKey", "==", memo.targetKey)));
      expect(pending.size).toBe(1);
      const latest = { ...memo, ...pending.docs[0].data() } as HandwritingMemo;
      const id = await service.saveTranscription(latest, form);
      expect((await service.loadRecord(id))?.content).toBe(form.content);
      expect((await getDoc(ref(db))).data()?.transcribedRevision).toBe(2);
      await assertFails(deleteDoc(ref(db))); // explicit acknowledgement is mandatory
      await service.confirmTranscription(await getDoc(ref(db)).then(s => ({ ...s.data(), id: memo.id }) as HandwritingMemo));
      await service.deleteConfirmed(await getDoc(ref(db)).then(s => ({ ...s.data(), id: memo.id }) as HandwritingMemo));
    });
  });

  it("필수 18필드 누락·추가 키·잘못된 타입·초기 revision·target linkage를 모두 거부", async () => {
    await usingRules(v2, async environment => {
      const db = staff(environment);
      await assertSucceeds(setDoc(ref(db, "control"), creation()));
      for (const key of Object.keys(creation())) {
        const invalid = creation(); delete invalid[key];
        await assertFails(setDoc(ref(db, `missing-${key}`), invalid));
      }
      const patches = [{ targetName: "extra" }, { id: "forged" }, { schemaVersion: "1" }, { targetType: "other" }, { targetId: "" }, { targetId: 42 }, { targetId: "bad/path", targetKey: "user:bad/path" }, { targetKey: "worker:synthetic-user" }, { counselingRecordId: "forged" }, { createdBy: "other" }, { createdAt: null }, { updatedBy: "other" }, { updatedAt: null }, { revision: 2 }, { revision: 1.5 }, { width: "1600" }, { height: 0 }, { strokesJson: [] }, { strokesJson: "not-json" }, { transcribedRevision: 1 }, { transcribedAt: serverTimestamp() }];
      for (const [index, patch] of patches.entries()) await assertFails(setDoc(ref(db, `invalid-${index}`), { ...creation(), ...patch }));
    });
  });

  it("ASCII payload 512KiB 경계 허용·초과와 비ASCII 거부", async () => {
    await usingRules(v2, async environment => {
      const db = staff(environment);
      await assertSucceeds(setDoc(ref(db, "limit"), { ...creation(), strokesJson: `[${" ".repeat(524286)}]` }));
      await assertFails(setDoc(ref(db, "over"), { ...creation(), strokesJson: `[${" ".repeat(524287)}]` }));
      await assertFails(setDoc(ref(db, "unicode"), { ...creation(), strokesJson: '["가"]' }));
    });
  });

  it("targetKey/dimensions/created identity 변경·revision 생략·재연결 거부", async () => {
    await usingRules(v2, async environment => {
      const db = staff(environment), service = createHandwritingApi(db, async () => "staff");
      await service.save(memo, json, false);
      for (const patch of [{ targetKey: "user:other" }, { width: 1000 }, { height: 1400 }, { createdBy: "other" }, { createdAt: serverTimestamp() }, { strokesJson: "[]" }]) {
        await assertFails(updateDoc(ref(db), { ...patch, updatedBy: "staff", updatedAt: serverTimestamp() }));
      }
      const saved = { ...memo, ...(await getDoc(ref(db))).data() } as HandwritingMemo;
      await service.saveTranscription(saved, form);
      await assertFails(updateDoc(ref(db), { counselingRecordId: "other", transcribedRevision: 1, transcribedAt: serverTimestamp(), updatedBy: "staff", updatedAt: serverTimestamp() }));
      await assertFails(setDoc(doc(db, COUNSELING_HANDWRITING_COLLECTION, memo.id, "archive", "extra"), { strokesJson: json }));
    });
  });

  it("비로그인·missing/wrong-type/forged-role claim과 문서 role 위조를 거부", async () => {
    await usingRules(v2, async environment => {
      const contexts = [environment.unauthenticatedContext(), environment.authenticatedContext("general"), environment.authenticatedContext("viewer", { role: "viewer" }), environment.authenticatedContext("bad-type", { role: ["admin"] })];
      for (const context of contexts) {
        const db = context.firestore() as unknown as Firestore;
        await assertFails(setDoc(ref(db), { ...creation(), role: "admin", createdBy: context === contexts[0] ? "staff" : "general" }));
        await assertFails(getDocs(collection(db, COUNSELING_HANDWRITING_COLLECTION)));
      }
    });
  });

  it("기존 users/workers/counseling/matching 등 staff CRUD와 행사 Rules는 유지", async () => {
    await usingRules(v2, async environment => {
      const db = staff(environment);
      for (const name of ["users", "workers", "matchingHistory", "matchingBoard", "handovers", "terminations", "workTodos", "annualSchedules"]) {
        const document = doc(db, name, "synthetic-impact");
        await assertSucceeds(setDoc(document, { synthetic: 1 }));
        await assertSucceeds(getDoc(document));
        await assertSucceeds(updateDoc(document, { synthetic: 2 }));
        await assertSucceeds(deleteDoc(document));
      }
      const formal = doc(db, COUNSELING_COLLECTION, "synthetic-impact");
      await assertSucceeds(setDoc(formal, { ...form, revision: 1, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
      await assertSucceeds(updateDoc(formal, { content: "updated", revision: 2, updatedAt: serverTimestamp() }));
      await assertSucceeds(getDoc(formal));
      await assertSucceeds(deleteDoc(formal));
      await assertSucceeds(getDocs(collection(db, "eventForms")));
      await assertFails(setDoc(doc(db, "eventForms", "malformed"), {}));
    });
  });

  it("SCHEMA GAP: timestamp-only 삭제는 확인 metadata 없이도 허용되고 상담 변경을 놓친다", async () => {
    // Counterexample to the tempting timestamp-only policy, NOT the candidate policy.
    const weakDelete = candidate.replace("      allow delete: if false;\n    }\n\n    // Blaze", "      allow delete: if staff() && resource.data.transcribedRevision == resource.data.revision && resource.data.counselingRecordId != '' && matchingRecord(get(/databases/$(database)/documents/counseling/$(resource.data.counselingRecordId)).data) && get(/databases/$(database)/documents/counseling/$(resource.data.counselingRecordId)).data.updatedAt == resource.data.transcribedAt;\n    }\n\n    // Blaze");
    expect(weakDelete).not.toBe(candidate);
    await usingRules(weakDelete, async environment => {
      const db = staff(environment), id = "historical-record";
      const { id: _id, ...legacy } = memo;
      await setDoc(ref(db), { ...legacy, revision: 1, strokesJson: json, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      const batch = writeBatch(db);
      batch.set(doc(db, COUNSELING_COLLECTION, id), { ...form, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      batch.update(ref(db), { counselingRecordId: id, transcribedRevision: 1, transcribedAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: "staff" });
      await batch.commit();
      const before = (await getDoc(doc(db, COUNSELING_COLLECTION, id))).data();
      await updateDoc(doc(db, COUNSELING_COLLECTION, id), { content: "다른 직원의 변경, updatedAt 그대로" });
      const after = (await getDoc(doc(db, COUNSELING_COLLECTION, id))).data();
      expect(after?.updatedAt).toEqual(before?.updatedAt);
      expect(after?.content).not.toBe(before?.content);
      await assertSucceeds(deleteDoc(ref(db))); // no persisted confirmation exists
    });
  });
});
