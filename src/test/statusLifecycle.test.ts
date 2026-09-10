import { describe, expect, it } from "vitest";
import type { ServiceUser, Worker } from "@/types";
import { appendContractTransition, closeMatchingEntries, getWorkerStatusBadges, removeUserAssignment } from "@/lib/statusLifecycle";
import { normalizeServiceUser, normalizeWorker } from "@/lib/assignments";

const worker = (overrides: Partial<Worker> = {}) => ({ contractStatus: "근무중", assignedUserIds: [], assigned_users: [], assignedUserNames: [], assignedUserPhones: [], ...overrides } as Worker);

describe("status lifecycle", () => {
  it("preserves explicit waiting states even when old start dates or reasons remain", () => {
    expect(normalizeServiceUser({ contractStatus: "대기", terminationReason: "이전 종료", serviceStartDate: "2024-01-01" }).contractStatus).toBe("대기");
    expect(normalizeWorker({ contractStatus: "대기", serviceStartDate: "2024-01-01" }).contractStatus).toBe("대기");
  });
  it("shows employed + service when at least one user remains", () => {
    expect(getWorkerStatusBadges(worker({ assignedUserIds: ["u2"] })).map((item) => item.label)).toEqual(["재직중", "서비스 제공중"]);
  });

  it("shows employed + waiting when no user remains", () => {
    expect(getWorkerStatusBadges(worker()).map((item) => item.label)).toEqual(["재직중", "대기"]);
  });

  it("removes only the terminating user from both legacy assignment fields", () => {
    const result = removeUserAssignment(worker({ assignedUserIds: ["u1", "u2"], assigned_users: ["u1", "u2"], assignedUserNames: ["가", "나"], assignedUserPhones: ["1", "2"] }), "u1");
    expect(result).toEqual({ assignedUserIds: ["u2"], assigned_users: ["u2"], assignedUserNames: ["나"], assignedUserPhones: ["2"] });
  });

  it("closes active service and appends a contract history period", () => {
    const user = { serviceStartDate: "2024-01-01", receiptDate: "2023-12-20", contractHistory: [], matchingHistory: [{ id: "m", workerId: "w", workerName: "지원사", workerPhone: "", serviceStartDate: "2024-01-01", serviceEndDate: null, reason: "추가" }] } as ServiceUser;
    expect(closeMatchingEntries(user.matchingHistory, ["w"], "2025-12-31", "타기관")[0].serviceEndDate).toBe("2025-12-31");
    expect(appendContractTransition(user, "2025-12-31", "계약해지", "타기관")[0]).toMatchObject({ startDate: "2024-01-01", endDate: "2025-12-31", status: "계약해지", reason: "타기관" });
    const closed = { ...user, contractHistory: appendContractTransition(user, "2025-12-31", "계약해지", "타기관") } as ServiceUser;
    expect(appendContractTransition(closed, "2025-12-31", "계약해지", "타기관 수정")).toHaveLength(1);
  });
});