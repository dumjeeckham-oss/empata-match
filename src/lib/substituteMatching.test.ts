import { describe, expect, it } from "vitest";
import { calculateSubstituteCandidate, searchSubstituteWorkers } from "@/lib/substituteMatching";
import type { SubstituteRequestInput, SubstituteWorkerInput, WorkerAvailabilityBlockInput } from "@/types/substitute";

const request = (overrides: Partial<SubstituteRequestInput> = {}): SubstituteRequestInput => ({
  requestId: "req-1",
  startDate: "2026-11-09",
  endDate: "2026-11-13",
  weeklySlots: {
    월: [{ startTime: "09:00", endTime: "13:00" }],
    화: [{ startTime: "10:00", endTime: "15:00" }],
    수: [{ startTime: "09:00", endTime: "12:00" }],
    목: [{ startTime: "13:00", endTime: "17:00" }],
    금: [{ startTime: "09:00", endTime: "13:00" }],
  },
  requirements: {
    diaperCare: "REQUIRED", driving: "NONE", housework: "PREFERRED", transfer: "NONE", bathingAndBodyCare: "NONE", communication: "NONE", disabilityExperience: "PREFERRED", workerGender: "ANY", userDisabilityType: "ANY",
  },
  ...overrides,
});
const worker = (overrides: Partial<SubstituteWorkerInput> = {}): SubstituteWorkerInput => ({
  id: "w1", name: "합성 지원사", contractStatus: "대기", leaveStatus: "ACTIVE", diaperCareStatus: "가능", ...overrides,
});
const block = (overrides: Partial<WorkerAvailabilityBlockInput> = {}): WorkerAvailabilityBlockInput => ({
  id: "b1", workerId: "w1", type: "OTHER_JOB", status: "ACTIVE", date: "2026-11-10", startTime: "10:00", endTime: "12:00", ...overrides,
});

describe("substitute matching engine", () => {
  it("calculates the five-day baseline as 20 hours", () => {
    const result = calculateSubstituteCandidate(request(), worker());
    expect(result.schedule.requestedMinutes).toBe(1200);
  });

  it("returns FULL when no known service or common block conflicts exist", () => {
    const result = calculateSubstituteCandidate(request(), worker());
    expect(result.schedule.fit).toBe("FULL");
    expect(result.schedule.fulfillmentRate).toBe(1);
  });

  it("returns PARTIAL for a two-hour existing service conflict", () => {
    const result = calculateSubstituteCandidate(request(), worker({ assignmentSchedules: { user1: [{ day: "월", slots: [18, 19, 20, 21] }] }, assignedUserIds: ["user1"] }));
    expect(result.schedule.fit).toBe("PARTIAL");
    expect(result.schedule.availableMinutes).toBe(1080);
    expect(result.schedule.dates[0].existingServiceConflicts).toEqual([{ date: "2026-11-09", start: 540, end: 660 }]);
  });

  it("returns NONE when all requested time is blocked", () => {
    const result = calculateSubstituteCandidate(request(), worker(), [block({ date: "2026-11-10", startTime: "10:00", endTime: "15:00" })]);
    expect(result.schedule.dates[1].fit).toBe("NONE");
    expect(result.schedule.dates[1].availableMinutes).toBe(0);
    expect(result.schedule.fit).toBe("PARTIAL");
  });

  it("calculates a partial repeated other-job block", () => {
    const result = calculateSubstituteCandidate(request(), worker(), [block({ date: undefined, weekdays: ["화"], repeat: true, startDate: "2026-11-01", startTime: "09:00", endTime: "14:00" })]);
    expect(result.schedule.dates[1].availabilityBlockConflicts).toEqual([{ date: "2026-11-10", start: 600, end: 840 }]);
    expect(result.schedule.dates[1].remaining).toEqual([{ date: "2026-11-10", start: 840, end: 900 }]);
  });

  it("applies a date-specific exception to the request", () => {
    const result = calculateSubstituteCandidate(request({ dateOverrides: { "2026-11-11": [{ startTime: "10:00", endTime: "11:00" }] } }), worker());
    expect(result.schedule.requestedMinutes).toBe(1080);
    expect(result.schedule.dates[2].requestedMinutes).toBe(60);
  });

  it("supports multiple time windows on a day", () => {
    const result = calculateSubstituteCandidate(request({ startDate: "2026-11-09", endDate: "2026-11-09", weeklySlots: {}, dateOverrides: { "2026-11-09": [{ startTime: "09:00", endTime: "12:00" }, { startTime: "14:00", endTime: "17:00" }] } }), worker());
    expect(result.schedule.requestedMinutes).toBe(360);
    expect(result.schedule.dates[0].requested).toHaveLength(2);
  });

  it("fails the required diaper condition when care is unavailable", () => {
    const result = calculateSubstituteCandidate(request(), worker({ diaperCareStatus: "불가" }));
    expect(result.requiredCondition.status).toBe("FAIL");
    expect(result.recommendable).toBe(false);
    expect(result).toMatchObject({ confirmedAvailable: false });
  });

  it("reviews rather than passes an unknown diaper condition", () => {
    const result = calculateSubstituteCandidate(request(), worker({ diaperCareStatus: "미확인" }));
    expect(result.requiredCondition.status).toBe("REVIEW_REQUIRED");
    expect(result.recommendable).toBe(false);
  });

  it("reports housework as a preferred condition", () => {
    const result = calculateSubstituteCandidate(request(), worker({ supportTypes: ["가사지원"] }));
    expect(result.preferredConditions.housework.status).toBe("PASS");
  });

  it("does not filter by gender or disability type when both are ANY", () => {
    const result = searchSubstituteWorkers(request(), [worker({ id: "w1", gender: "남성" }), worker({ id: "w2", gender: "여성" })]);
    expect(result.candidates.map((candidate) => candidate.workerId)).toEqual(["w1", "w2"]);
    expect(result.candidates.every((candidate) => candidate.preferredConditions.disabilityExperience.status === "NOT_APPLICABLE")).toBe(true);
  });

  it("keeps contact checks isolated by request id", () => {
    const result = calculateSubstituteCandidate(request({ requestId: "req-1" }), worker(), [], [{ requestId: "req-2", workerId: "w1", status: "AVAILABLE" }]);
    expect(result.contactCheck).toBeUndefined();
  });

  it("attaches a matching request contact check without confirming availability", () => {
    const result = calculateSubstituteCandidate(request(), worker(), [], [{ requestId: "req-1", workerId: "w1", status: "AVAILABLE" }]);
    expect(result.contactCheck?.status).toBe("AVAILABLE");
    expect(result.confirmedAvailable).toBe(false);
  });

  it("sorts equal candidates by stable worker id", () => {
    const result = searchSubstituteWorkers(request(), [worker({ id: "w2" }), worker({ id: "w1" })]);
    expect(result.candidates.map((candidate) => candidate.workerId)).toEqual(["w1", "w2"]);
  });

  it("returns diagnostics separately from recommendable candidates", () => {
    const result = searchSubstituteWorkers(request(), [worker({ id: "good" }), worker({ id: "unknown", diaperCareStatus: "미확인" })]);
    expect(result.recommendableCandidates.map((candidate) => candidate.workerId)).toEqual(["good"]);
    expect(result.diagnostics.map((candidate) => candidate.workerId)).toContain("unknown");
  });

  it("processes 400 synthetic workers without external access", () => {
    const workers = Array.from({ length: 400 }, (_, index) => worker({ id: `w-${String(index).padStart(3, "0")}` }));
    const started = Date.now();
    const result = searchSubstituteWorkers(request(), workers);
    const elapsedMs = Date.now() - started;
    expect(result.candidates).toHaveLength(400);
    expect(elapsedMs).toBeLessThan(2000);
  });
});
