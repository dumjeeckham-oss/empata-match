import { describe, expect, it } from "vitest";
import type { ServiceUser, Worker } from "@/types";
import { appendContractTransition, closeMatchingEntries, getWorkerOperationalStatus, getWorkerStatusBadges, isWorkerRetired, isWorkerWaitingForMatch, removeUserAssignment } from "@/lib/statusLifecycle";
import { normalizeServiceUser, normalizeWorker } from "@/lib/assignments";
import { matchUserWithWorkers } from "@/lib/matching";

const worker = (overrides: Partial<Worker> = {}) => ({ contractStatus: "근무중", assignedUserIds: [], assigned_users: [], assignedUserNames: [], assignedUserPhones: [], ...overrides } as Worker);

describe("status lifecycle", () => {
  it("preserves explicit waiting states even when old start dates or reasons remain", () => {
    expect(normalizeServiceUser({ contractStatus: "대기", terminationReason: "이전 종료", serviceStartDate: "2024-01-01" }).contractStatus).toBe("대기");
    expect(normalizeWorker({ contractStatus: "대기", serviceStartDate: "2024-01-01" }).contractStatus).toBe("대기");
  });
  it("keeps a newly entered worker waiting even when receipt or start dates exist", () => {
    const normalized = normalizeWorker({ contractStatus: "근무중", receiptDate: "2026-09-01", serviceStartDate: "2026-09-02", assignedUserIds: [] });
    expect(normalized.contractStatus).toBe("대기");
    expect(getWorkerOperationalStatus(normalized as Worker, "2026-09-16")).toBe("대기");
  });

  it("changes to service only when an actual user assignment exists", () => {
    const normalized = normalizeWorker({ contractStatus: "대기", assignedUserIds: ["u1"], serviceStartDate: "2026-09-20" });
    expect(normalized.contractStatus).toBe("근무중");
    expect(getWorkerOperationalStatus(normalized as Worker, "2026-09-16")).toBe("서비스 제공중");
  });

  it("honors resignation today but not a scheduled future resignation", () => {
    const resigned = worker({ contractStatus: "퇴사", retirementDate: "2026-09-15" });
    const scheduled = worker({ contractStatus: "퇴사", retirementDate: "2026-09-20" });
    expect(isWorkerRetired(resigned, "2026-09-16")).toBe(true);
    expect(isWorkerRetired(scheduled, "2026-09-16")).toBe(false);
    expect(isWorkerWaitingForMatch(scheduled, "2026-09-16")).toBe(true);
  });

  it("allows rehire status to override old resignation dates", () => {
    const rehired = normalizeWorker({ contractStatus: "대기", retirementDate: "2025-12-31", resignationDate: "2025-12-31", assignedUserIds: [] });
    expect(rehired.contractStatus).toBe("대기");
    expect(isWorkerRetired(rehired as Worker, "2026-09-16")).toBe(false);
  });
  it("shows employed + service when at least one user remains", () => {
    expect(getWorkerStatusBadges(worker({ assignedUserIds: ["u2"] })).map((item) => item.label)).toEqual(["재직중", "서비스 제공중"]);
  });

  it("shows employed + waiting when no user remains", () => {
    expect(getWorkerStatusBadges(worker({ serviceStartDate: "2025-01-01" })).map((item) => item.label)).toEqual(["재직중", "대기"]);
  });

  it("excludes retired workers from matching but allows a rehired waiting worker", () => {
    const user = { id: "u1", age: 30, gender: "여성", requiredDays: "월", requiredHours: "10:00", address: "부천", environmentTags: [] } as ServiceUser;
    const retired = worker({ id: "retired", name: "퇴사자", contractStatus: "퇴사", retirementDate: "2026-09-01", preferredArea: "부천", availableDays: "월", availableHours: "10:00" });
    const rehired = worker({ id: "rehired", name: "재입사자", contractStatus: "대기", retirementDate: "2025-01-01", preferredArea: "부천", availableDays: "월", availableHours: "10:00" });
    expect(matchUserWithWorkers(user, [retired, rehired]).map((result) => result.worker.id)).toEqual(["rehired"]);
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