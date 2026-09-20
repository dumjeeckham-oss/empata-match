import { describe, expect, it } from "vitest";
import { calculateMonthlyRequiredHours, calculateTotalVoucherHours, formatRequiredVoucherGap } from "@/lib/serviceHours";
import type { WeeklySchedule } from "@/types";

describe("serviceHours", () => {
  it("주간 시간표의 30분 단위 선택값을 월 4주 시간으로 계산한다", () => {
    const weekdays: WeeklySchedule[] = ["월", "화", "수", "목", "금"].map((day) => ({
      day: day as WeeklySchedule["day"],
      slots: [26, 27, 28, 29, 30, 31, 32, 33],
    }));
    expect(calculateMonthlyRequiredHours({ weeklySchedule: weekdays, requiredDays: "", requiredHours: "" })).toBe(80);
  });

  it("시간표가 없으면 월~금, 13시~17시 문자를 해석한다", () => {
    expect(calculateMonthlyRequiredHours({ weeklySchedule: [], requiredDays: "월~금", requiredHours: "13시~17시" })).toBe(80);
  });

  it("시도와 시군구 추가시간을 바우처 총시간에 합산한다", () => {
    expect(calculateTotalVoucherHours({ voucherTier: 14, voucherHours: 90, additionalHours: 0, provinceAdditionalHours: 5, cityAdditionalHours: 5 })).toBe(100);
  });

  it("남은 시간과 부족 시간을 이해하기 쉬운 문장으로 표시한다", () => {
    const base = { weeklySchedule: [], requiredDays: "월~금", requiredHours: "13시~17시", voucherTier: 14, additionalHours: 0, provinceAdditionalHours: 0, cityAdditionalHours: 0 };
    expect(formatRequiredVoucherGap({ ...base, voucherHours: 90 })).toBe("필요시간: 월 80시간 / 바우처: 월 90시간 (10시간 남음)");
    expect(formatRequiredVoucherGap({ ...base, voucherHours: 70 })).toBe("필요시간: 월 80시간 / 바우처: 월 70시간 (10시간 부족)");
  });
});
