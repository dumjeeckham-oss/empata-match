import { describe, expect, it } from "vitest";
import { getComparableDateValue } from "@/lib/utils";

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
