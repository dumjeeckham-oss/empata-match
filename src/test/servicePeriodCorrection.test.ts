import { describe, expect, it } from "vitest";
import { correctedPeriodLog, isValidServicePeriod } from "@/lib/servicePeriodCorrection";

describe("서비스 기간 정정", () => {
  it("시작일보다 빠른 종료일은 거부하고 종료일이 없거나 같은 날짜는 허용한다", () => {
    expect(isValidServicePeriod("2026-10-12", "2026-08-18")).toBe(false);
    expect(isValidServicePeriod("2026-10-12", "")).toBe(true);
    expect(isValidServicePeriod("2026-10-12", "2026-10-12")).toBe(true);
  });
  it("종료를 되돌릴 때 매칭 기록은 유지하고 기존 종료 이벤트는 정정으로 표시한다", () => {
    expect(correctedPeriodLog("매칭", "2026-01-01", "", true, true)).toMatchObject({ type: "매칭", endDate: "", periodCorrectionVoided: false });
    expect(correctedPeriodLog("해제", "2026-01-01", "", true, true, "2026-08-01")).toMatchObject({ periodCorrectionVoided: true, endDate: "" });
    expect(correctedPeriodLog("해제", "2026-01-01", "", false, true, "2026-08-01")).toMatchObject({ type: "매칭", periodCorrectionVoided: false });
  });
  it("진행 중인 단일 매칭에 종료일을 추가한다", () => {
    expect(correctedPeriodLog("매칭", "2026-01-01", "2026-08-01", true, false)).toMatchObject({ type: "해제", endDate: "2026-08-01", periodCorrectionVoided: false });
  });
});
