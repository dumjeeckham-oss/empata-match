import { describe, expect, it } from "vitest";
import type { ServiceUser, Worker } from "@/types";
import { appendContractTransition, contractPeriodRevision, correctContractPeriod, closeMatchingEntries, getWorkerOperationalStatus, getWorkerStatusBadges, isWorkerRetired, isWorkerWaitingForMatch, removeUserAssignment, prepareUserRecontract, prepareWorkerRehire, getActualEmploymentHistory } from "@/lib/statusLifecycle";
import { normalizeServiceUser, normalizeWorker } from "@/lib/assignments";
import { matchUserWithWorkers } from "@/lib/matching";

const worker = (overrides: Partial<Worker> = {}) => ({ contractStatus: "근무중", assignedUserIds: [], assigned_users: [], assignedUserNames: [], assignedUserPhones: [], ...overrides } as Worker);

describe("status lifecycle", () => {
  it("화면과 저장소의 빈 값과 필드 순서 차이는 무시하고 실제 계약 변경은 감지한다", () => {
    const stored = { contractStatus: "서비스중", serviceStartDate: "2026-07-16", resignationDate: null, assignedHelperIds: ["worker"], contractHistory: [{ id: "a", startDate: "2025-08-15", endDate: "2026-06-15", status: "계약해지", reason: "종료" }, { id: "b", startDate: "2026-07-16", endDate: null, status: "서비스중" }] };
    const latest = normalizeServiceUser(stored) as ServiceUser;
    const screen = { ...latest, resignationDate: "", contractHistory: [{ reason: "종료", status: "계약해지", endDate: "2026-06-15", startDate: "2025-08-15", id: "a" }, { status: "서비스중", endDate: "", id: "b", startDate: "2026-07-16" }] } as ServiceUser;
    expect(contractPeriodRevision(latest)).toBe(contractPeriodRevision(screen));
    expect(contractPeriodRevision({ ...latest, serviceStartDate: "2026-07-17" })).not.toBe(contractPeriodRevision(screen));
    const patch = correctContractPeriod(latest, 0, "2025-08-15", "2026-06-15");
    expect(patch.contractHistory).toHaveLength(2);
  });
  it("잘못된 종결 기간을 사람이 정정한 뒤 기존 이력을 보존해 재계약한다", () => {
    const user = { serviceStartDate: "2026-07-16", resignationDate: "2026-06-15", contractStatus: "계약해지", terminationReason: "개인사정", contractHistory: [{ id: "old", startDate: "2026-07-16", endDate: "2026-06-15", status: "계약해지", reason: "개인사정" }] } as ServiceUser;
    expect(() => prepareUserRecontract(user, "2026-07-16")).toThrow();
    const corrected = correctContractPeriod(user, 0, "2025-08-15", "2026-06-15");
    expect(corrected.serviceStartDate).toBe("2025-08-15");
    expect(prepareUserRecontract({ ...user, ...corrected }, "2026-07-16").contractHistory).toMatchObject([{ startDate: "2025-08-15", endDate: "2026-06-15", reason: "개인사정" }, { startDate: "2026-07-16", endDate: null }]);
    expect(() => correctContractPeriod(user, 0, "2026-07-16", "2026-06-15")).toThrow();
  });
  it("기록이 없는 이전 계약도 정정하고 겹치는 계약 기간을 거부한다", () => {
    const user = { serviceStartDate: "2026-07-16", resignationDate: "2026-05-26", contractStatus: "계약해지" } as ServiceUser;
    expect(correctContractPeriod(user, 0, "2025-08-28", "2026-05-26").contractHistory).toMatchObject([{ startDate: "2025-08-28", endDate: "2026-05-26" }]);
    const two = { ...user, contractHistory: [{ id: "a", startDate: "2025-08-28", endDate: "2026-05-26", status: "계약해지" }, { id: "b", startDate: "2026-07-17", endDate: null, status: "서비스중" }] } as ServiceUser;
    expect(() => correctContractPeriod(two, 0, "2025-08-28", "2026-07-17")).toThrow();
  });
  it("기존 이용자 계약을 보존하고 새 재계약 기간을 추가한다", () => {
    const user = { serviceStartDate: "2024-01-01", resignationDate: "2025-12-31", terminationReason: "개인사정", contractStatus: "계약해지", contractHistory: [] } as unknown as ServiceUser;
    const patch = prepareUserRecontract(user, "2026-02-01");
    expect(patch.contractHistory).toMatchObject([{ startDate: "2024-01-01", endDate: "2025-12-31", status: "계약해지" }, { startDate: "2026-02-01", endDate: null, status: "서비스중" }]);
    expect(patch).toMatchObject({ resignationDate: "", terminationReason: "", txtUMemostop: "" });
    expect(() => prepareUserRecontract(user, "2025-01-01")).toThrow();
    const previouslyClosed = { ...user, terminationReason: "", contractHistory: [{ id: "old", startDate: "2024-01-01", endDate: "2025-12-31", status: "계약해지", reason: "기존 사유" }] } as ServiceUser;
    expect(prepareUserRecontract(previouslyClosed, "2026-02-01").contractHistory?.[0].reason).toBe("기존 사유");
  });
  it("기존 근무 기간을 보존하고 새 재입사 기간을 추가한다", () => {
    const retired = worker({ serviceStartDate: "2023-01-01", retirementDate: "2025-12-31", contractStatus: "퇴사", employmentHistory: [] });
    const patch = prepareWorkerRehire(retired, "2026-01-01");
    expect(patch.employmentHistory).toMatchObject([{ startDate: "2023-01-01", endDate: "2025-12-31", status: "퇴사" }, { startDate: "2026-01-01", endDate: null, status: "재직중" }]);
    expect(getActualEmploymentHistory({ ...retired, ...patch } as Worker)).toHaveLength(2);
    expect(() => prepareWorkerRehire(retired, "2025-12-30")).toThrow();
    expect(prepareWorkerRehire(retired, "2025-12-31").employmentHistory).toHaveLength(2);
  });
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
  it("excludes other-institution workers without changing retirement semantics", () => {
    const employedElsewhere = worker({ id: "elsewhere", contractStatus: "대기", employedElsewhere: true });
    const returned = worker({ id: "returned", contractStatus: "대기", employedElsewhere: false, retirementDate: "2025-12-31" });
    expect(getWorkerOperationalStatus(employedElsewhere, "2026-09-16")).toBe("대기");
    expect(isWorkerWaitingForMatch(employedElsewhere, "2026-09-16")).toBe(false);
    expect(isWorkerWaitingForMatch(returned, "2026-09-16")).toBe(true);
    const user = { id: "u1", age: 30, gender: "여성", requiredDays: "월", requiredHours: "10:00", address: "부천", environmentTags: [] } as ServiceUser;
    expect(matchUserWithWorkers(user, [employedElsewhere, returned]).map((result) => result.worker.id)).toEqual(["returned"]);
  });
  it("keeps an explicitly active worker current despite a historical resignation date", () => {
    const rehired = normalizeWorker({ contractStatus: "근무중", retirementDate: "2025-12-31", assignedUserIds: ["u1"] });
    expect(rehired.contractStatus).toBe("근무중");
    expect(getWorkerOperationalStatus(rehired as Worker, "2026-09-16")).toBe("서비스 제공중");
  });
  it("uses the historical-date fallback when no valid current status is supplied", () => {
    const unknown = normalizeWorker({ contractStatus: "알 수 없음", retirementDate: "2025-12-31", assignedUserIds: [] });
    expect(unknown.contractStatus).toBe("퇴사");
    expect(isWorkerRetired(unknown as Worker, "2026-09-16")).toBe(true);
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
