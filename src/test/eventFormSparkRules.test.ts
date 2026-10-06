// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc, writeBatch } from "firebase/firestore";

const emulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const projectId = "demo-dongbaek-forms";
const tokenHash = "a".repeat(64);

const publicForm = (status = "open") => ({
  formId: "form-1", title: "가짜 교육", description: "테스트", eventDateTime: "", location: "",
  poster: null, activeRoundId: "round-1", activeVersionId: "version-1",
  fields: [{ id: "name", type: "name", title: "이름", visible: true, required: true, order: 0 }],
  fieldIds: ["name"], requiredQuestionIds: ["name"], publicAssetIds: ["asset-1"], applicationStartAt: null, applicationEndAt: null,
  publicImageBytes: 4,
  status, completionMessage: "완료", duplicatePolicy: "warn", duplicateFieldId: "", updatedAt: new Date(),
  schemaVersion: 1, tokenHashVersion: "sha256",
});

const submission = (uid: string, patch: Record<string, unknown> = {}) => ({
  formId: "form-1", roundId: "round-1", versionId: "version-1", tokenHash,
  submitterUid: uid, answersBase64: Buffer.from(JSON.stringify({ name: "가짜 신청자" }), "utf8").toString("base64"), answerIds: ["name"], answeredQuestionIds: ["name"], status: "submitted", submittedAt: serverTimestamp(), ...patch,
});

describe.skipIf(!emulatorAvailable)("Spark 행사 폼 Firestore Rules", () => {
  let environment: RulesTestEnvironment;
  beforeAll(async () => {
    environment = await initializeTestEnvironment({ projectId, firestore: { rules: readFileSync("firestore.rules", "utf8") } });
  });
  beforeEach(async () => {
    await environment.clearFirestore();
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "eventFormPublic", tokenHash), publicForm());
      await setDoc(doc(context.firestore(), "eventForms", "form-1"), { status: "open" });
      await setDoc(doc(context.firestore(), "eventFormImageBlobs", "asset-1"), { assetId: "asset-1", formId: "form-1", state: "active", contentType: "image/webp", dataBase64: "YWJj", encodedBytes: 4, width: 1, height: 1, alt: "가짜 이미지", createdBy: "admin-1", createdAt: new Date(), updatedAt: new Date(), publicTokenHash: tokenHash, versionId: "version-1" });
    });
  });
  afterAll(async () => environment.cleanup());

  const anonymousDb = (uid = "anon-1") => environment.authenticatedContext(uid, { firebase: { sign_in_provider: "anonymous" } }).firestore();
  const staffDb = (role: "admin" | "social_worker" = "admin") => environment.authenticatedContext(`${role}-1`, { role }).firestore();

  it("admin과 social_worker만 관리자 폼을 생성·조회할 수 있다", async () => {
    for (const role of ["admin", "social_worker"] as const) {
      const db = staffDb(role), uid = `${role}-1`, formId = `form-${role}`;
      const slotNumber = role === "admin" ? 1 : 2;
      const batch = writeBatch(db);
      batch.set(doc(db, "eventFormSlots", String(slotNumber)), { formId, slotNumber, createdBy: uid, createdAt: serverTimestamp() });
      batch.set(doc(db, "eventForms", formId), { slotNumber, ownerUid: uid, publicToken: "private-token", tokenHash: "hash", title: "폼", status: "draft", createdBy: uid, updatedBy: uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      await assertSucceeds(batch.commit());
      await assertSucceeds(getDoc(doc(db, "eventForms", formId)));
    }
    const general = environment.authenticatedContext("general-1").firestore();
    await assertFails(getDoc(doc(general, "eventForms", "form-admin")));
    await assertFails(setDoc(doc(general, "eventForms", "forged"), { ownerUid: "general-1", status: "draft" }));
  });

  it("staff는 과거 회차·버전·결과를 조회할 수 있고 일반 계정은 차단된다", async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "eventFormRounds", "round-archived"), { id: "round-archived", formId: "form-1", versionId: "version-archived", status: "archived" });
      await setDoc(doc(db, "eventFormVersions", "version-archived"), { id: "version-archived", formId: "form-1", fields: [], publishedBy: "admin-1", publishedAt: new Date() });
      await setDoc(doc(db, "eventFormSubmissions", "round-archived__anon-old"), { ...submission("anon-old"), roundId: "round-archived", versionId: "version-archived", submittedAt: new Date() });
    });
    const admin = staffDb();
    await assertSucceeds(getDoc(doc(admin, "eventFormRounds", "round-archived")));
    await assertSucceeds(getDoc(doc(admin, "eventFormVersions", "version-archived")));
    await assertSucceeds(getDoc(doc(admin, "eventFormSubmissions", "round-archived__anon-old")));
    const general = environment.authenticatedContext("general-history").firestore();
    await assertFails(getDoc(doc(general, "eventFormRounds", "round-archived")));
    await assertFails(getDoc(doc(general, "eventFormVersions", "version-archived")));
    await assertFails(getDoc(doc(general, "eventFormSubmissions", "round-archived__anon-old")));
  });

  it("기존 업무 컬렉션은 staff CRUD만 허용하고 일반·익명·비로그인은 모두 차단한다", async () => {
    for (const role of ["admin", "social_worker"] as const) {
      const db = staffDb(role), ref = doc(db, "users", `staff-crud-${role}`);
      await assertSucceeds(setDoc(ref, { name: "가짜 이용자" }));
      await assertSucceeds(getDoc(ref));
      await assertSucceeds(updateDoc(ref, { name: "수정된 가짜 이용자" }));
      await assertSucceeds(deleteDoc(ref));
    }
    const blocked = [environment.authenticatedContext("general-1").firestore(), anonymousDb("anonymous-business"), environment.unauthenticatedContext().firestore()];
    for (const db of blocked) {
      for (const name of ["users", "workers", "counseling", "assignments", "terminations", "handovers"]) {
        await assertFails(getDoc(doc(db, name, "private-doc")));
        await assertFails(setDoc(doc(db, name, "forged-doc"), { value: "forged" }));
      }
    }
  });

  it("익명 사용자는 정확한 공개 문서 get만 가능하고 list와 비로그인 접근은 차단된다", async () => {
    await assertSucceeds(getDoc(doc(anonymousDb(), "eventFormPublic", tokenHash)));
    expect((await assertSucceeds(getDoc(doc(anonymousDb(), "eventFormPublic", "wrong-token-hash")))).exists()).toBe(false);
    await assertFails(getDocs(collection(anonymousDb(), "eventFormPublic")));
    await assertFails(getDoc(doc(anonymousDb(), "users", "private-user")));
    await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), "eventFormPublic", tokenHash)));
  });

  it("open 활성 회차·버전의 허용 문항만 익명 제출할 수 있다", async () => {
    const db = anonymousDb();
    await assertSucceeds(setDoc(doc(db, "eventFormSubmissions", "round-1__anon-1"), submission("anon-1")));
    await assertFails(setDoc(doc(db, "eventFormSubmissions", "round-1__anon-2"), submission("anon-1", { answerIds: ["name", "foreign"] })));
    await assertFails(setDoc(doc(db, "eventFormSubmissions", "round-1__anon-admin"), submission("anon-admin", { adminMemo: "조작", reviewedBy: "anon-admin" })));
    await assertFails(setDoc(doc(db, "eventFormSubmissions", "round-old__anon-1"), submission("anon-1", { roundId: "round-old" })));
    await assertFails(setDoc(doc(db, "eventFormSubmissions", "round-1__anon-1-wrong"), submission("anon-1", { versionId: "wrong" })));
    await assertFails(setDoc(doc(db, "eventFormSubmissions", "round-1__forged"), submission("forged")));
    await assertFails(setDoc(doc(db, "eventFormSubmissions", "round-1__anon-missing-token"), submission("anon-missing-token", { tokenHash: "f".repeat(64) })));
  });

  it("응답 Base64 50KB 상한·문항 100개·허용 최상위 필드를 Rules에서 강제한다", async () => {
    const db = anonymousDb("anon-limits");
    await assertFails(setDoc(doc(db, "eventFormSubmissions", "round-1__anon-limits"), submission("anon-limits", { answersBase64: "x".repeat(68_269) })));
    await assertFails(setDoc(doc(db, "eventFormSubmissions", "round-1__anon-limits"), submission("anon-limits", { answerIds: Array.from({ length: 101 }, () => "name") })));
    await assertFails(setDoc(doc(db, "eventFormSubmissions", "round-1__anon-limits"), submission("anon-limits", { arbitrary: "forged" })));
  });

  it("준비·마감 폼과 접수 기간 밖 제출을 차단한다", async () => {
    for (const status of ["draft", "closed"]) {
      await environment.withSecurityRulesDisabled(async (context) => setDoc(doc(context.firestore(), "eventFormPublic", tokenHash), publicForm(status)));
      await assertFails(setDoc(doc(anonymousDb(`anon-${status}`), "eventFormSubmissions", `round-1__anon-${status}`), submission(`anon-${status}`)));
    }
    await environment.withSecurityRulesDisabled(async (context) => setDoc(doc(context.firestore(), "eventFormPublic", tokenHash), { ...publicForm(), applicationStartAt: new Date(Date.now() + 86_400_000) }));
    await assertFails(setDoc(doc(anonymousDb("anon-future"), "eventFormSubmissions", "round-1__anon-future"), submission("anon-future")));
  });

  it("회차당 익명 UID 한 건만 생성되고 자신의 응답도 읽기·수정·삭제할 수 없다", async () => {
    const db = anonymousDb(), ref = doc(db, "eventFormSubmissions", "round-1__anon-1");
    await assertSucceeds(setDoc(ref, submission("anon-1")));
    await assertFails(setDoc(ref, submission("anon-1")));
    await assertFails(getDoc(ref));
    await assertFails(updateDoc(ref, { status: "excluded" }));
    await assertFails(deleteDoc(ref));
  });

  it("관리자만 결과를 조회하고 허용된 상태·메모만 수정한다", async () => {
    await environment.withSecurityRulesDisabled(async (context) => setDoc(doc(context.firestore(), "eventFormSubmissions", "round-1__anon-1"), { ...submission("anon-1"), submittedAt: new Date() }));
    const admin = staffDb(), ref = doc(admin, "eventFormSubmissions", "round-1__anon-1");
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(updateDoc(ref, { status: "reviewed", adminMemo: "확인", submissionUpdatedBy: "admin-1", submissionUpdatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { answers: { name: "변조" }, submissionUpdatedBy: "admin-1", submissionUpdatedAt: serverTimestamp() }));
  });

  it("공개 이미지는 open 폼이 참조한 정확한 문서 get만 허용한다", async () => {
    const anon = anonymousDb();
    await assertSucceeds(getDoc(doc(anon, "eventFormImageBlobs", "asset-1")));
    await assertFails(getDocs(collection(anon, "eventFormImageBlobs")));
    await environment.withSecurityRulesDisabled(async (context) => setDoc(doc(context.firestore(), "eventFormImageBlobs", "asset-other"), { assetId: "asset-other", formId: "form-other", state: "active", contentType: "image/webp", dataBase64: "YWJj", encodedBytes: 4, width: 1, height: 1, alt: "다른 폼", createdBy: "admin-1", createdAt: new Date(), updatedAt: new Date(), publicTokenHash: tokenHash, versionId: "version-1" }));
    await assertFails(getDoc(doc(anon, "eventFormImageBlobs", "asset-other")));
    await environment.withSecurityRulesDisabled(async (context) => updateDoc(doc(context.firestore(), "eventFormPublic", tokenHash), { status: "closed" }));
    await assertFails(getDoc(doc(anon, "eventFormImageBlobs", "asset-1")));
  });

  it("staff 이미지 저장은 WebP·250KB·작성자·크기를 검증하고 SVG/HTML을 거부한다", async () => {
    const admin = staffDb();
    const valid = { assetId: "asset-new", formId: "form-1", state: "temp", contentType: "image/webp", dataBase64: "YWJj", encodedBytes: 4, width: 1, height: 1, alt: "설명", createdBy: "admin-1", createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
    await assertSucceeds(setDoc(doc(admin, "eventFormImageBlobs", "asset-new"), valid));
    await assertFails(setDoc(doc(admin, "eventFormImageBlobs", "asset-svg"), { ...valid, assetId: "asset-svg", contentType: "image/svg+xml" }));
    await assertFails(setDoc(doc(admin, "eventFormImageBlobs", "asset-gif"), { ...valid, assetId: "asset-gif", contentType: "image/gif" }));
    await assertFails(setDoc(doc(admin, "eventFormImageBlobs", "asset-html"), { ...valid, assetId: "asset-html", contentType: "text/html" }));
    await assertFails(setDoc(doc(admin, "eventFormImageBlobs", "asset-large"), { ...valid, assetId: "asset-large", dataBase64: "x".repeat(250 * 1024 + 1), encodedBytes: 250 * 1024 + 1 }));
  });

  it("공개 버전은 이미지 12개·총 2MB 상한을 강제한다", async () => {
    const admin = staffDb();
    const validHash = "b".repeat(64);
    await assertSucceeds(setDoc(doc(admin, "eventFormPublic", validHash), {
      ...publicForm(),
      publicAssetIds: Array.from({ length: 12 }, (_, index) => `asset-${index}`),
      publicImageBytes: 2 * 1024 * 1024,
      updatedAt: serverTimestamp(),
    }));
    await assertFails(setDoc(doc(admin, "eventFormPublic", "c".repeat(64)), {
      ...publicForm(),
      publicAssetIds: Array.from({ length: 13 }, (_, index) => `asset-${index}`),
      publicImageBytes: 2 * 1024 * 1024,
      updatedAt: serverTimestamp(),
    }));
    await assertFails(setDoc(doc(admin, "eventFormPublic", "d".repeat(64)), {
      ...publicForm(),
      publicImageBytes: 2 * 1024 * 1024 + 1,
      updatedAt: serverTimestamp(),
    }));
  });

  it("감사 기록은 본인 UID·서버 시각·허용 action만 생성할 수 있다", async () => {
    const admin = staffDb();
    await assertSucceeds(setDoc(doc(admin, "eventFormAuditLogs", "audit-1"), { formId: "form-1", actorUid: "admin-1", action: "draft_saved", details: {}, at: serverTimestamp() }));
    await assertFails(setDoc(doc(admin, "eventFormAuditLogs", "audit-2"), { formId: "form-1", actorUid: "other", action: "draft_saved", details: {}, at: serverTimestamp() }));
    await assertFails(setDoc(doc(admin, "eventFormAuditLogs", "audit-3"), { formId: "form-1", actorUid: "admin-1", action: "arbitrary", details: {}, at: serverTimestamp() }));
  });
  it("필수 문항 ID 누락·응답 ID 위조와 초기화 중 공개 조회·제출을 차단한다", async () => {
    const anon = anonymousDb();
    await assertFails(setDoc(doc(anon, "eventFormSubmissions", "round-1__anon-1"), submission("anon-1", { answeredQuestionIds: [] })));
    await assertFails(setDoc(doc(anon, "eventFormSubmissions", "round-1__anon-1"), submission("anon-1", { answeredQuestionIds: ["foreign"] })));
    await environment.withSecurityRulesDisabled(async (context) => updateDoc(doc(context.firestore(), "eventFormPublic", tokenHash), { status: "resetting" }));
    await assertFails(getDoc(doc(anon, "eventFormPublic", tokenHash)));
    await assertFails(setDoc(doc(anon, "eventFormSubmissions", "round-1__anon-1"), submission("anon-1")));
  });
  it("social_worker·무역할·익명은 초기화 작업 생성 및 종속자료 삭제 불가", async () => {
    for (const db of [staffDb("social_worker"), environment.authenticatedContext("general").firestore(), anonymousDb()]) {
      await assertFails(setDoc(doc(db, "eventFormResetJobs", "form-1"), { formId: "form-1", actorUid: "social_worker-1", status: "running", total: 1, deleted: 0 }));
      await assertFails(deleteDoc(doc(db, "eventFormImageBlobs", "asset-1")));
    }
  });
  it("admin 삭제는 자신의 resetting 폼만 허용하고 다른 슬롯은 보존", async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), "eventForms", "form-1"), { status: "resetting" });
      await setDoc(doc(context.firestore(), "eventFormResetJobs", "form-1"), { actorUid: "admin-1" });
      await setDoc(doc(context.firestore(), "eventFormImageBlobs", "other-slot"), { formId: "other-form", state: "active" });
      await setDoc(doc(context.firestore(), "eventForms", "other-form"), { status: "open" });
    });
    await assertSucceeds(deleteDoc(doc(staffDb(), "eventFormImageBlobs", "asset-1")));
    await assertFails(deleteDoc(doc(staffDb(), "eventFormImageBlobs", "other-slot")));
    await assertFails(deleteDoc(doc(staffDb("social_worker"), "eventFormVersions", "fake-version")));
  });
  it("세 번째 슬롯과 다른 역할의 슬롯 수정·초기화 직접 호출을 차단", async () => {
    await assertFails(setDoc(doc(staffDb(), "eventFormSlots", "3"), { slotNumber: 3, formId: "third", createdBy: "admin-1", createdAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(staffDb("social_worker"), "eventForms", "form-1"), { status: "resetting", updatedBy: "social_worker-1", updatedAt: serverTimestamp() }));
  });
  it("기존 폼의 이름·고정 token·응답을 보존하며 슬롯에 명시적으로 연결한다", async () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    await environment.withSecurityRulesDisabled(async (context) => setDoc(doc(context.firestore(), "eventForms", "form-1"), { title: "기존 가짜 폼", status: "open", publicToken: "synthetic-original", tokenHash, ownerUid: "admin-1", createdBy: "admin-1", createdAt }));
    const db = staffDb();
    await assertSucceeds(getDoc(doc(db, "eventFormPublic", tokenHash)));
    const batch = writeBatch(db);
    batch.set(doc(db, "eventFormSlots", "1"), { formId: "form-1", slotNumber: 1, createdBy: "admin-1", createdAt: serverTimestamp() });
    batch.update(doc(db, "eventForms", "form-1"), { slotNumber: 1, updatedBy: "admin-1", updatedAt: serverTimestamp() });
    await assertSucceeds(batch.commit());
    const data = (await getDoc(doc(db, "eventForms", "form-1"))).data()!;
    expect(data.title).toBe("기존 가짜 폼");
    expect(data.publicToken).toBe("synthetic-original");
    expect(data.createdAt.toDate()).toEqual(createdAt);
    await assertFails(updateDoc(doc(db, "eventFormSlots", "1"), { formId: "other-form" }));
  });
});
