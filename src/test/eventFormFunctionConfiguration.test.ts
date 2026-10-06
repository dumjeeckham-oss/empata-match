import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("functions/src/index.ts", "utf8");
const callableNames = [
  "createEventForm",
  "saveEventFormDraft",
  "publishEventForm",
  "setEventFormStatus",
  "startEventFormRound",
  "getPublicEventForm",
  "submitEventForm",
  "updateEventSubmission",
];

function functionDeclaration(name: string): string {
  const start = source.indexOf(`export const ${name} = onCall(`);
  const next = source.indexOf("\nexport const ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

describe("행사 폼 Functions 배포 전 보안 설정", () => {
  it("모든 공개·관리 callable에 App Check 토글과 최대 인스턴스 제한이 있다", () => {
    for (const name of callableNames) {
      const declaration = functionDeclaration(name);
      expect(declaration, name).toContain("enforceAppCheck: ENFORCE_APP_CHECK");
      expect(declaration, name).toMatch(/maxInstances:\s*[1-5]/);
    }
  });

  it("모든 관리자 callable이 서버에서 인증을 다시 검사한다", () => {
    for (const name of ["createEventForm", "saveEventFormDraft", "publishEventForm", "setEventFormStatus", "startEventFormRound", "updateEventSubmission"]) {
      expect(functionDeclaration(name), name).toContain("requireStaff(request)");
    }
    expect(source).toContain('STAFF_ROLES = new Set(["admin", "social_worker"])');
    expect(source).toContain('request.auth.token?.role');
  });

  it("생성·공개·회차 전환·응답 수정에 작업자 감사 필드를 기록한다", () => {
    expect(functionDeclaration("createEventForm")).toContain("createdBy: request.auth!.uid");
    expect(functionDeclaration("saveEventFormDraft")).toContain("updatedBy: request.auth!.uid");
    expect(functionDeclaration("publishEventForm")).toContain("publishedBy: request.auth!.uid");
    expect(functionDeclaration("startEventFormRound")).toContain("roundStartedBy: request.auth!.uid");
    expect(functionDeclaration("updateEventSubmission")).toContain("submissionUpdatedBy: request.auth!.uid");
  });

  it("공개 조회·제출은 token을 검증하고 제출은 활성 회차·버전·문항·크기·빈도를 재검사한다", () => {
    expect(functionDeclaration("getPublicEventForm")).toContain("eventFormPublicTokens");
    const submit = functionDeclaration("submitEventForm");
    expect(submit).toContain("MAX_ANSWERS_BYTES");
    expect(submit).toContain("enforceSubmissionRateLimit");
    expect(source).toContain("max: 10");
    expect(source).toContain("max: 120");
    expect(source).toContain("max: 600");
    expect(source).toContain("enforceDuplicateRetryLimit");
    expect(source).toContain("count >= 5");
    expect(source).toContain("createHmac");
    expect(submit).toContain("form.activeRoundId !== data.roundId");
    expect(submit).toContain("form.activeVersionId !== data.versionId");
    expect(submit).toContain("validateAnswers(fields, answers)");
    expect(submit).toContain("transaction.create(lockRef");
  });

  it("이미지 정리는 temp 7일·unused 30일만 대상으로 하며 active·archived는 조회하지 않는다", () => {
    const cleanup = source.slice(source.indexOf("export const cleanupEventFormImages"));
    expect(cleanup).toContain('where("state", "==", "temp")');
    expect(cleanup).toContain('where("state", "==", "unused")');
    expect(cleanup).not.toContain('where("state", "==", "active")');
    expect(cleanup).not.toContain('where("state", "==", "archived")');
    expect(cleanup).toContain("7 * 24 * 60 * 60 * 1000");
    expect(cleanup).toContain("30 * 24 * 60 * 60 * 1000");
  });
});
