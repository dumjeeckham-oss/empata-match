import { describe, expect, it } from "vitest";
import { appendHistoricalMatch, appendHistoricalPeriod, chronologicalPeriods } from "@/lib/historicalPeriods";
import type { DocumentMatchingHistoryEntry } from "@/types";

describe("과거 이력 추가", () => {
  it("최근 기록을 먼저 저장한 후 과거 기록을 추가해도 시간순으로 표시하고 원본 인덱스를 유지한다", () => {
    const recent = { startDate: "2026-07-17", endDate: null, id: "current" };
    const past = { startDate: "2025-08-28", endDate: "2026-05-26", id: "past" };
    const stored = appendHistoricalPeriod([recent], past, "2026-11-27");
    expect(stored.map((entry) => entry.id)).toEqual(["current", "past"]);
    expect(chronologicalPeriods(stored).map(({ entry, originalIndex }) => [entry.id, originalIndex])).toEqual([["past", 1], ["current", 0]]);
    expect(chronologicalPeriods([{ startDate: "2025.9.1", endDate: null }, { startDate: "2025-10-01", endDate: null }]).map(({ entry }) => entry.startDate)).toEqual(["2025.9.1", "2025-10-01"]);
    expect(() => appendHistoricalPeriod([], { startDate: "2025-02-30", endDate: "2025-03-01" }, "2026-11-27")).toThrow();
    expect(() => appendHistoricalPeriod(stored, { ...past, startDate: "2026-05-01", endDate: "2026-08-01" }, "2026-11-27")).toThrow();
  });
  it("같은 지원사의 과거 매칭을 추가해도 현재 매칭을 유지하고 겹치는 기간은 막는다", () => {
    const entry = (id: string, start: string, end: string | null): DocumentMatchingHistoryEntry => ({ id, workerId: "w", workerName: "지원사", workerPhone: "", serviceStartDate: start, serviceEndDate: end, reason: "추가" });
    const current = entry("current", "2026-07-17", null);
    const past = entry("past", "2025-08-28", "2026-05-26");
    expect(appendHistoricalMatch([current], past, true, "2026-11-27")).toEqual([current, past]);
    expect(() => appendHistoricalMatch([current], entry("overlap", "2026-07-01", "2026-08-01"), true, "2026-11-27")).toThrow();
    expect(() => appendHistoricalMatch([], past, true, "2026-11-27")).toThrow();
  });
});
