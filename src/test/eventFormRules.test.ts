// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { ref, uploadString } from "firebase/storage";

const emulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_STORAGE_EMULATOR_HOST);
const bucket = "demo-dongbaek-forms.appspot.com";

describe.skipIf(!emulatorAvailable)("행사 폼 Firebase 보안 규칙", () => {
  let environment: RulesTestEnvironment;
  beforeAll(async () => {
    environment = await initializeTestEnvironment({
      projectId: "demo-dongbaek-forms",
      firestore: { rules: readFileSync("firestore.rules", "utf8") },
      storage: { rules: readFileSync("storage.rules", "utf8") },
    });
  });
  beforeEach(async () => environment.clearFirestore());
  afterAll(async () => environment.cleanup());

  it("공개 사용자의 폼 원본과 결과 조회를 차단한다", async () => {
    const firestore = environment.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(firestore, "eventForms", "form-1")));
    await assertFails(getDoc(doc(firestore, "eventFormSubmissions", "submission-1")));
  });

  it("admin과 social_worker만 폼을 읽고 직접 쓰지는 못한다", async () => {
    await environment.withSecurityRulesDisabled(async (context) => setDoc(doc(context.firestore(), "eventForms", "form-1"), { title: "테스트" }));
    for (const role of ["admin", "social_worker"]) {
      const firestore = environment.authenticatedContext(`${role}-1`, { role }).firestore();
      await assertSucceeds(getDoc(doc(firestore, "eventForms", "form-1")));
      await assertFails(setDoc(doc(firestore, "eventForms", "form-1"), { title: "조작" }));
      await assertFails(setDoc(doc(firestore, "eventFormSubmissions", "submission-1"), { answers: {} }));
    }
    await assertFails(getDoc(doc(environment.authenticatedContext("general-1").firestore(), "eventForms", "form-1")));
  });

  it("로그인 사용자의 기존 앱 컬렉션 정책은 유지한다", async () => {
    const firestore = environment.authenticatedContext("admin-1").firestore();
    await assertSucceeds(setDoc(doc(firestore, "users", "user-1"), { name: "가짜 이용자" }));
  });

  it("Storage는 허용 이미지와 소유자 temp 경로만 쓸 수 있다", async () => {
    const storage = environment.authenticatedContext("admin-1", { role: "admin" }).storage(bucket);
    const valid = ref(storage, "eventFormAssets/form-1/temp/admin-1/asset-1/image.webp");
    await assertSucceeds(uploadString(valid, "abc", "raw", { contentType: "image/webp", customMetadata: { formId: "form-1", assetId: "asset-1" } }));
    const invalid = ref(storage, "eventFormAssets/form-1/temp/admin-1/asset-2/file.svg");
    await assertFails(uploadString(invalid, "abc", "raw", { contentType: "image/svg+xml" }));
    const otherOwner = ref(storage, "eventFormAssets/form-1/temp/admin-2/asset-3/image.png");
    await assertFails(uploadString(otherOwner, "abc", "raw", { contentType: "image/png" }));
    const general = environment.authenticatedContext("general-1").storage(bucket);
    await assertFails(uploadString(ref(general, "eventFormAssets/form-1/temp/general-1/asset-4/image.png"), "a", "raw", { contentType: "image/png", customMetadata: { formId: "form-1", assetId: "asset-4" } }));
  });
});
