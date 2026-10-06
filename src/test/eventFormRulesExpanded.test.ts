// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadString, type StorageReference, type UploadMetadata } from "firebase/storage";

const emulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_STORAGE_EMULATOR_HOST);
const projectId = "demo-dongbaek-forms";
const bucket = `${projectId}.appspot.com`;

function uploadTestBytes(target: StorageReference, bytes: Uint8Array, metadata: UploadMetadata) {
  return uploadString(target, "x".repeat(bytes.byteLength), "raw", metadata);
}

describe.skipIf(!emulatorAvailable)("행사 폼 Firestore 위험 매핑", () => {
  let environment: RulesTestEnvironment;

  beforeAll(async () => {
    environment = await initializeTestEnvironment({
      projectId,
      firestore: { rules: readFileSync("firestore.rules", "utf8") },
      storage: { rules: readFileSync("storage.rules", "utf8") },
    });
  });
  beforeEach(async () => {
    await environment.clearFirestore();
    await environment.clearStorage();
  });
  afterAll(async () => environment.cleanup());

  it("[FIRESTORE] 공개 사용자는 공개 여부와 무관하게 원본·결과·메모·다른 응답을 직접 조회하지 못한다", async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "eventForms", "open-form"), { status: "open" });
      await setDoc(doc(db, "eventFormSubmissions", "submission-a"), { formId: "open-form", adminMemo: "비공개" });
      await setDoc(doc(db, "eventFormSubmissions", "submission-b"), { formId: "other-form" });
    });
    const db = environment.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "eventForms", "open-form")));
    await assertFails(getDoc(doc(db, "eventFormSubmissions", "submission-a")));
    await assertFails(getDoc(doc(db, "eventFormSubmissions", "submission-b")));
  });

  it("[FIRESTORE] 공개 사용자는 준비·마감·과거 회차와 조작된 문항 제출을 포함한 모든 직접 제출을 못한다", async () => {
    const db = environment.unauthenticatedContext().firestore();
    for (const id of ["draft", "closed", "archived", "mixed-field-id"]) {
      await assertFails(setDoc(doc(db, "eventFormSubmissions", id), { formId: "form-1", roundId: id, answers: { foreignField: "조작" } }));
    }
  });

  it("[FIRESTORE] 로그인한 네 관리자 계정은 관리 데이터를 읽되 Function을 우회한 생성·수정·회차전환은 못한다", async () => {
    await environment.withSecurityRulesDisabled(async (context) => setDoc(doc(context.firestore(), "eventForms", "form-1"), { status: "open" }));
    const db = environment.authenticatedContext("social-worker-1", { role: "social_worker" }).firestore();
    await assertSucceeds(getDoc(doc(db, "eventForms", "form-1")));
    await assertFails(setDoc(doc(db, "eventForms", "new-form"), { status: "draft" }));
    await assertFails(setDoc(doc(db, "eventForms", "form-1"), { activeRoundId: "forged" }, { merge: true }));
    await assertFails(setDoc(doc(db, "eventFormRounds", "round-2"), { formId: "form-1" }));
    await assertFails(getDoc(doc(environment.authenticatedContext("general-1").firestore(), "eventForms", "form-1")));
  });

  it("[FIRESTORE] 민감한 token·중복키·호출제한·감사 데이터는 다른 폼·회차를 포함해 클라이언트 접근을 막는다", async () => {
    const db = environment.authenticatedContext("social-worker-1", { role: "social_worker" }).firestore();
    for (const collectionName of ["eventFormPublicTokens", "eventFormDuplicateKeys", "eventFormRateLimits"]) {
      await assertFails(getDoc(doc(db, collectionName, "other-form-round")));
      await assertFails(setDoc(doc(db, collectionName, "other-form-round"), { value: "forged" }));
    }
    await assertFails(setDoc(doc(db, "eventFormAuditLogs", "forged"), { formId: "other-form" }));
  });

  it("[STORAGE] 공개 사용자의 이미지 업로드·수정·삭제를 모두 차단한다", async () => {
    const storage = environment.unauthenticatedContext().storage(bucket);
    const image = ref(storage, "eventFormAssets/form-1/temp/public/asset-1/image.webp");
    const metadata = { contentType: "image/webp", customMetadata: { formId: "form-1", assetId: "asset-1" } };
    await assertFails(uploadTestBytes(image, new Uint8Array([1, 2, 3]), metadata));
    await environment.withSecurityRulesDisabled(async (context) => { await uploadTestBytes(ref(context.storage(bucket), image.fullPath), new Uint8Array([1]), metadata); });
    await assertFails(uploadTestBytes(image, new Uint8Array([4]), metadata));
    await assertFails(deleteObject(image));
  });

  it("[STORAGE] 권한 있는 계정은 자기 폼 temp 경로에 JPEG·PNG·WebP 5MB 이하만 업로드한다", async () => {
    const storage = environment.authenticatedContext("admin-1", { role: "admin" }).storage(bucket);
    for (const [extension, contentType] of [["jpg", "image/jpeg"], ["png", "image/png"], ["webp", "image/webp"]]) {
      const assetId = `asset-${extension}`;
      await assertSucceeds(uploadTestBytes(
        ref(storage, `eventFormAssets/form-1/temp/admin-1/${assetId}/image.${extension}`),
        new Uint8Array([1, 2, 3]),
        { contentType, customMetadata: { formId: "form-1", assetId } },
      ));
    }
  });

  it("[STORAGE] 5MB 초과·SVG·GIF·임의 MIME·다른 폼 metadata·다른 소유자 경로를 차단한다", async () => {
    const storage = environment.authenticatedContext("admin-1", { role: "admin" }).storage(bucket);
    const cases = [
      ["asset-large", "image.webp", "image/webp", new Uint8Array(5 * 1024 * 1024 + 1), "form-1"],
      ["asset-svg", "image.svg", "image/svg+xml", new Uint8Array([1]), "form-1"],
      ["asset-gif", "image.gif", "image/gif", new Uint8Array([1]), "form-1"],
      ["asset-bin", "image.bin", "application/octet-stream", new Uint8Array([1]), "form-1"],
      ["asset-other", "image.webp", "image/webp", new Uint8Array([1]), "form-2"],
    ] as const;
    for (const [assetId, fileName, contentType, bytes, metadataFormId] of cases) {
      await assertFails(uploadTestBytes(
        ref(storage, `eventFormAssets/form-1/temp/admin-1/${assetId}/${fileName}`),
        bytes,
        { contentType, customMetadata: { formId: metadataFormId, assetId } },
      ));
    }
    await assertFails(uploadTestBytes(
      ref(storage, "eventFormAssets/form-1/temp/admin-2/asset-owner/image.png"),
      new Uint8Array([1]),
      { contentType: "image/png", customMetadata: { formId: "form-1", assetId: "asset-owner" } },
    ));
  });

  it("[STORAGE] 공개 사용자는 open 폼의 active 자산만 읽고 과거·마감·다른 폼 이미지는 읽지 못한다", async () => {
    const activePath = "eventFormAssets/form-1/active/asset-1/image.webp";
    const archivedPath = "eventFormAssets/form-1/archived/asset-old/image.webp";
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "eventForms", "form-1"), { status: "open" });
      await setDoc(doc(db, "eventFormAssets", "asset-1"), { formId: "form-1", state: "active" });
      const adminStorage = context.storage(bucket);
      await uploadTestBytes(ref(adminStorage, activePath), new Uint8Array([1]), { contentType: "image/webp", customMetadata: { formId: "form-1", assetId: "asset-1" } });
      await uploadTestBytes(ref(adminStorage, archivedPath), new Uint8Array([1]), { contentType: "image/webp", customMetadata: { formId: "form-1", assetId: "asset-old" } });
    });
    const publicStorage = environment.unauthenticatedContext().storage(bucket);
    await assertSucceeds(getDownloadURL(ref(publicStorage, activePath)));
    await assertFails(getDownloadURL(ref(publicStorage, archivedPath)));

    await environment.withSecurityRulesDisabled(async (context) => setDoc(doc(context.firestore(), "eventForms", "form-1"), { status: "closed" }, { merge: true }));
    await assertFails(getDownloadURL(ref(publicStorage, activePath)));

    const managerStorage = environment.authenticatedContext("admin-1", { role: "admin" }).storage(bucket);
    await assertSucceeds(getDownloadURL(ref(managerStorage, archivedPath)));
  });
});
