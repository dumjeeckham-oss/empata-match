import { describe, expect, it } from "vitest";
import {
  availabilityBlockToDatedRanges,
  blockAppliesOnDate,
  expandDateRange,
  expandDailyRanges,
  expandRequestDates,
  expandTimeRange,
  expandWeeklySchedule,
  intersectRanges,
  isValidDateString,
  isValidTimeString,
  minutesToTime,
  normalizeRanges,
  rangeMinutes,
  subtractRanges,
  timeToMinutes,
  weekdayOf,
} from "@/lib/substituteAvailability";
import type { SubstituteWeekday } from "@/types/substitute";

describe("substitute availability calculations", () => {
  it("validates real calendar dates", () => {
    expect(isValidDateString("2026-11-09")).toBe(true);
    expect(isValidDateString("2026-02-29")).toBe(false);
  });

  it("validates normal times and day-end 24:00", () => {
    expect(isValidTimeString("23:59")).toBe(true);
    expect(isValidTimeString("24:00", true)).toBe(true);
    expect(isValidTimeString("24:01", true)).toBe(false);
  });

  it("converts time to and from minute integers", () => {
    expect(timeToMinutes("09:30")).toBe(570);
    expect(minutesToTime(570)).toBe("09:30");
    expect(minutesToTime(1440)).toBe("24:00");
  });

  it("expands an inclusive date range without local timezone drift", () => {
    expect(expandDateRange("2026-11-09", "2026-11-13")).toEqual([
      "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13",
    ]);
  });

  it("returns Korean weekdays from UTC date arithmetic", () => {
    expect(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"].map(weekdayOf)).toEqual(["월", "화", "수", "목", "금"]);
  });

  it("splits a midnight-crossing range into two dated ranges", () => {
    expect(expandTimeRange("2026-11-09", { startTime: "22:00", endTime: "02:00" })).toEqual([
      { date: "2026-11-09", start: 1320, end: 1440 },
      { date: "2026-11-10", start: 0, end: 120 },
    ]);
  });

  it("expands multiple daily time ranges independently", () => {
    expect(expandDailyRanges("2026-11-09", [
      { startTime: "09:00", endTime: "12:00" },
      { startTime: "14:00", endTime: "17:00" },
    ])).toHaveLength(2);
  });

  it("merges overlapping and touching ranges once", () => {
    expect(normalizeRanges([{ start: 0, end: 60 }, { start: 60, end: 120 }, { start: 30, end: 90 }])).toEqual([{ start: 0, end: 120 }]);
  });

  it("does not treat an end/start boundary as an intersection", () => {
    expect(intersectRanges([{ start: 540, end: 780 }], [{ start: 780, end: 900 }])).toEqual([]);
  });

  it("calculates a one-minute intersection", () => {
    expect(intersectRanges([{ start: 540, end: 780 }], [{ start: 779, end: 900 }])).toEqual([{ start: 779, end: 780 }]);
  });

  it("subtracts a middle blocker into two remaining ranges", () => {
    expect(subtractRanges([{ start: 540, end: 780 }], [{ start: 660, end: 720 }])).toEqual([{ start: 540, end: 660 }, { start: 720, end: 780 }]);
  });

  it("calculates total minutes without double counting", () => {
    expect(rangeMinutes([{ start: 540, end: 660 }, { start: 600, end: 780 }])).toBe(240);
  });

  it("converts existing 30-minute weekly slots to ranges", () => {
    expect(expandWeeklySchedule("2026-11-09", [{ day: "월", slots: [18, 19, 20, 21] }])).toEqual([{ date: "2026-11-09", start: 540, end: 660 }]);
  });

  it("uses date overrides instead of weekly slots", () => {
    expect(expandRequestDates("2026-11-09", "2026-11-10", { 월: [{ startTime: "09:00", endTime: "13:00" }], 화: [{ startTime: "10:00", endTime: "15:00" }] }, { "2026-11-10": [{ startTime: "11:00", endTime: "12:00" }] })).toEqual([
      { date: "2026-11-09", start: 540, end: 780 },
      { date: "2026-11-10", start: 660, end: 720 },
    ]);
  });

  it("applies an active one-time block on its date", () => {
    const block = { id: "b1", workerId: "w1", type: "PERSONAL" as const, status: "ACTIVE" as const, date: "2026-11-10", startTime: "10:00", endTime: "12:00" };
    expect(blockAppliesOnDate(block, "2026-11-10")).toBe(true);
    expect(availabilityBlockToDatedRanges(block, ["2026-11-10"])).toEqual([{ date: "2026-11-10", start: 600, end: 720 }]);
  });

  it("ignores a released block", () => {
    const block = { id: "b1", workerId: "w1", type: "PERSONAL" as const, status: "RELEASED" as const, date: "2026-11-10", startTime: "10:00", endTime: "12:00" };
    expect(availabilityBlockToDatedRanges(block, ["2026-11-10"])).toEqual([]);
  });

  it("applies a weekly block only to matching weekdays", () => {
    const block = { id: "b1", workerId: "w1", type: "OTHER_JOB" as const, status: "ACTIVE" as const, weekdays: ["화"] as SubstituteWeekday[], repeat: true, startDate: "2026-11-01", startTime: "09:00", endTime: "14:00" };
    expect(blockAppliesOnDate(block, "2026-11-10")).toBe(true);
    expect(blockAppliesOnDate(block, "2026-11-09")).toBe(false);
  });

  it("includes both endpoints for a one-time date range block", () => {
    const block = { id: "b1", workerId: "w1", type: "TEMPORARY" as const, status: "ACTIVE" as const, startDate: "2026-11-10", endDate: "2026-11-12", startTime: "09:00", endTime: "10:00" };
    expect(availabilityBlockToDatedRanges(block, ["2026-11-09", "2026-11-10", "2026-11-12", "2026-11-13"]).map((range) => range.date)).toEqual(["2026-11-10", "2026-11-12"]);
  });

  it("splits a repeated block that crosses midnight", () => {
    const block = { id: "b1", workerId: "w1", type: "OTHER_JOB" as const, status: "ACTIVE" as const, weekdays: ["월"] as SubstituteWeekday[], repeat: true, startDate: "2026-11-01", startTime: "22:00", endTime: "02:00" };
    expect(availabilityBlockToDatedRanges(block, ["2026-11-09", "2026-11-10"])).toEqual([
      { date: "2026-11-09", start: 1320, end: 1440 },
      { date: "2026-11-10", start: 0, end: 120 },
    ]);
  });
});
