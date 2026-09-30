export const PUBLIC_FORM_PREPARING_MESSAGE = "현재 신청 서비스를 준비 중입니다. 관리자에게 문의해 주세요.";
export const PUBLIC_FORM_NETWORK_MESSAGE = "인터넷 연결을 확인한 후 다시 시도해 주세요.";
export const PUBLIC_FORM_GENERIC_MESSAGE = "신청 화면을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
export const PUBLIC_FORM_ALREADY_SUBMITTED_MESSAGE = "이 회차에는 이미 제출했습니다.";

function errorCode(error: unknown): string {
  if (!error || typeof error !== "object" || !("code" in error)) return "";
  return typeof error.code === "string" ? error.code.toLowerCase() : "";
}

export function publicEventFormErrorMessage(error: unknown, phase: "load" | "submit" = "load"): string {
  const code = errorCode(error);
  if (code.endsWith("auth/operation-not-allowed") || code.endsWith("auth/admin-restricted-operation")) {
    return PUBLIC_FORM_PREPARING_MESSAGE;
  }
  if (code.includes("network-request-failed") || code.endsWith("/unavailable") || code.endsWith("/deadline-exceeded")) {
    return PUBLIC_FORM_NETWORK_MESSAGE;
  }
  if (phase === "submit" && (code.endsWith("/permission-denied") || code.endsWith("/already-exists"))) {
    return PUBLIC_FORM_ALREADY_SUBMITTED_MESSAGE;
  }
  return PUBLIC_FORM_GENERIC_MESSAGE;
}
