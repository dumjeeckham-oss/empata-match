import { describe, expect, it } from "vitest";
import {
  PUBLIC_FORM_GENERIC_MESSAGE,
  PUBLIC_FORM_NETWORK_MESSAGE,
  PUBLIC_FORM_PREPARING_MESSAGE,
  publicEventFormErrorMessage,
} from "@/lib/publicEventFormErrors";

describe("공개 행사 폼 오류 안내", () => {
  it("Anonymous Auth 비활성 오류를 준비 안내로 바꾼다", () => {
    const error = Object.assign(new Error("Firebase SDK raw error"), { code: "auth/operation-not-allowed" });
    expect(publicEventFormErrorMessage(error)).toBe(PUBLIC_FORM_PREPARING_MESSAGE);
  });

  it("네트워크 오류를 연결 확인 안내로 바꾼다", () => {
    const error = Object.assign(new Error("network details"), { code: "auth/network-request-failed" });
    expect(publicEventFormErrorMessage(error)).toBe(PUBLIC_FORM_NETWORK_MESSAGE);
  });

  it("알 수 없는 오류의 원문과 내부 정보를 공개하지 않는다", () => {
    const error = Object.assign(new Error("project-id user@example.test 010-0000-0000"), { code: "internal/private-code" });
    const message = publicEventFormErrorMessage(error);
    expect(message).toBe(PUBLIC_FORM_GENERIC_MESSAGE);
    expect(message).not.toContain("project-id");
    expect(message).not.toContain("internal/private-code");
    expect(message).not.toContain("user@example.test");
  });
});
