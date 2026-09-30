import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sparkApi = readFileSync("src/lib/eventFormSparkApi.ts", "utf8");
const publicPage = readFileSync("src/pages/PublicEventForm.tsx", "utf8");
const editor = readFileSync("src/pages/EventFormEditor.tsx", "utf8");
const image = readFileSync("src/components/EventFormImage.tsx", "utf8");
const blazeApi = readFileSync("src/lib/eventFormApi.ts", "utf8");
const appCheck = readFileSync("src/lib/appCheck.ts", "utf8");
const indexes = JSON.parse(readFileSync("firestore.indexes.json", "utf8")) as {
  indexes: Array<{ collectionGroup: string; fields: Array<{ fieldPath: string; order: string }> }>;
  fieldOverrides: Array<{ collectionGroup: string; fieldPath: string; indexes: unknown[] }>;
};

describe("Spark 행사 폼 운영 아키텍처", () => {
  it("운영 행사 폼 경로가 Callable Functions와 Storage를 import하거나 호출하지 않는다", () => {
    for (const source of [sparkApi, publicPage, editor, image]) {
      expect(source).not.toContain('firebase/functions');
      expect(source).not.toContain('firebase/storage');
      expect(source).not.toContain("httpsCallable");
      expect(source).not.toContain("uploadBytes");
    }
    expect(publicPage).toContain('@/lib/eventFormSparkApi');
    expect(editor).toContain('@/lib/eventFormSparkApi');
  });

  it("기존 Blaze 구현은 삭제하지 않고 미사용 구현으로 격리한다", () => {
    expect(blazeApi).toContain("httpsCallable");
    expect(blazeApi).toContain("uploadBytes");
    expect(blazeApi).toContain("Blaze 전용 보존 API");
  });

  it("익명 인증, 결정적 제출 ID, Firestore 이미지 blob과 응답 크기 제한을 사용한다", () => {
    expect(sparkApi).toContain("ensureAnonymousEventFormUser");
    expect(sparkApi).toContain("createEventFormSubmissionId");
    expect(sparkApi).toContain('"eventFormImageBlobs"');
    expect(sparkApi).toContain("EVENT_FORM_MAX_SUBMISSION_BYTES");
    expect(sparkApi).not.toContain("RATE_LIMIT_HASH_SECRET");
  });

  it("App Check를 관리자 앱과 공개 익명 앱 모두에 초기화한다", () => {
    expect(appCheck).toContain("getPublicEventFormApp");
    expect(appCheck).toContain("ReCaptchaEnterpriseProvider");
  });

  it("Spark 운영에 필요한 인덱스만 배포 후보로 유지한다", () => {
    expect(indexes.indexes).toEqual([
      {
        collectionGroup: "eventFormSubmissions",
        queryScope: "COLLECTION",
        fields: [
          { fieldPath: "roundId", order: "ASCENDING" },
          { fieldPath: "submittedAt", order: "DESCENDING" },
        ],
      },
    ]);
    expect(indexes.fieldOverrides).toEqual([
      {
        collectionGroup: "eventFormImageBlobs",
        fieldPath: "dataBase64",
        indexes: [],
      },
    ]);
  });
});
