import { describe, expect, it } from "vitest";
import { buildFailureFeedbackUpdates, hasFailureWithoutSuccess, isServiceHistoryRecord } from "@/lib/matchingFailure";
import type { MatchingHistoryRecord, ServiceUser, Worker } from "@/types";

const user = { id: "u1", rejectionScores: {}, matchingPreferences: {} } as ServiceUser & { id: string };
const worker = { id: "w1", rejectionScores: {}, matchingPreferences: {}, rejectionTypes: [] } as Worker & { id: string };

describe("matching failure isolation", () => {
  it("never treats a failure or attempt as a service period", () => {
    expect(isServiceHistoryRecord({ type: "실패" } as MatchingHistoryRecord)).toBe(false);
    expect(isServiceHistoryRecord({ type: "시도" } as MatchingHistoryRecord)).toBe(false);
    expect(isServiceHistoryRecord({ type: "매칭" } as MatchingHistoryRecord)).toBe(true);
  });

  it("adds pair feedback without changing statuses", () => {
    const updates = buildFailureFeedbackUpdates(user, worker, "주말 케어 불가");
    expect(updates.user.rejectionScores).toEqual({ w1: 25 });
    expect(updates.worker.rejectionScores).toEqual({ u1: 25 });
    expect(updates.worker.rejectionTypes).toContain("주말거부");
    expect(updates.user).not.toHaveProperty("contractStatus");
    expect(updates.worker).not.toHaveProperty("contractStatus");
  });

  it("identifies a failed legacy pair only when no success exists for the same date", () => {
    const failed = { type: "실패", userId: "u1", workerId: "w1", date: "2026-09-09" } as MatchingHistoryRecord;
    expect(hasFailureWithoutSuccess([failed], "u1", "w1", "2026-09-09")).toBe(true);
    const success = { ...failed, type: "매칭" } as MatchingHistoryRecord;
    expect(hasFailureWithoutSuccess([failed, success], "u1", "w1", "2026-09-09")).toBe(false);
  });
});