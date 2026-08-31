import { describe, expect, it } from "vitest";
import { getComparableDateValue, getFormattedDuration } from "@/lib/utils";

describe("getComparableDateValue", () => {
  it("normalizes timestamp-like values and empty values", () => {
    const timestamp = { toDate: () => new Date("2024-04-01T00:00:00.000Z") };

    expect(getComparableDateValue(timestamp)).toBe("2024-04-01");
    expect(getComparableDateValue(undefined)).toBe("");
    expect(getComparableDateValue("2024-02-10")).toBe("2024-02-10");
  });

  it("keeps sorting stable even when some dates are missing", () => {
    const items = [
      { date: undefined },
      { date: "2024-01-02" },
      { date: { toDate: () => new Date("2024-01-03T00:00:00.000Z") } },
    ];

    const sorted = [...items].sort((a, b) =>
      getComparableDateValue(b.date).localeCompare(getComparableDateValue(a.date)),
    );

    expect(sorted.map((item) => getComparableDateValue(item.date))).toEqual(["2024-01-03", "2024-01-02", ""]);
  });
});

describe("getFormattedDuration", () => {
  it("완료된 연도와 월을 정확히 계산한다", () => {
    expect(getFormattedDuration("2023-03-01", "2026-08-31")).toBe("3년 5개월");
    expect(getFormattedDuration("2021-05-15", "2026-08-31")).toBe("5년 3개월");
  });

  it("월의 기준일이 지나지 않았으면 한 달을 빼고 잘못된 날짜는 미등록으로 표시한다", () => {
    expect(getFormattedDuration("2026-01-31", "2026-02-28")).toBe("0년 0개월");
    expect(getFormattedDuration("", "2026-08-31")).toBe("미등록");
  });
});
