import { describe, expect, it } from "vitest";
import type { ServiceUser, Worker } from "@/types";
import { buildSubstituteDataSnapshot } from "@/lib/substituteDataSource";
import { calculateSubstituteCandidate } from "@/lib/substituteMatching";

const worker = (overrides: Partial<Worker> = {}): Worker => ({
  id: "w1", name: "홍길동", age: 40, gender: "여성", phone: "010-0000-0000", residenceArea: "부천",
  preferredArea: "부천", address: "", experience: "5년 이상", availableDays: "월~금", availableHours: "09:00~18:00",
  supportTypes: ["가사지원"], rejectionTypes: [], rejectedTasks: "", canDrive: true, animalAllergy: false,
  certificates: [], certificateNumber: "", contractStatus: "근무중", serviceStartDate: "2020-01-01", resignationDate: "",
  notes: "", assignedUserIds: ["u1"], assignedUserNames: [], assignedUserPhones: [], receiptDate: "2020-01-01",
  ...overrides,
});

const user = (overrides: Partial<ServiceUser> = {}): ServiceUser => ({
  id: "u1", name: "이용자", age: 30, gender: "여성", phone: "", disabilityType: "지체장애", voucherTier: 1,
  requiredDays: "월", requiredHours: "09:00~13:00", supportTypes: [], environmentTags: [], familyMembers: "",
  address: "", hasPet: false, livingWith: "", movementNote: "", houseworkNote: "", needsVehicle: false,
  usesDiaper: true, preferredWorkerTraits: "", notes: "", contractStatus: "서비스중", serviceStartDate: "2020-01-01",
  resignationDate: "", guardianName: "", guardianRelation: "", guardianPhone: "", terminationReason: "",
  assigned_workers: ["w1"], assignedHelperIds: ["w1"], assignedHelperNames: ["홍길동"], assignedHelperPhones: ["010-0000-0000"],
  receiptDate: "2020-01-01", assignmentSchedules: { w1: [{ day: "월", slots: [18, 19, 20, 21, 22, 23, 24, 25] }] },
  ...overrides,
});

describe("buildSubstituteDataSnapshot", () => {
  it("여러 배정 중 일부 일정이 누락되면 실제 충돌은 계산하고 전체 가능으로 단정하지 않는다", () => {
    const snapshot = buildSubstituteDataSnapshot([worker({ assignedUserIds: ["u1", "u2"] })], [user(), user({ id: "u2", assignmentSchedules: {} })]);
    const result = calculateSubstituteCandidate({ requestId: "r", startDate: "2026-11-09", endDate: "2026-11-09", weeklySlots: { 월: [{ startTime: "09:00", endTime: "14:00" }] } }, snapshot.workers[0]);
    expect(result.schedule.dates[0].existingServiceConflicts).toEqual([{ date: "2026-11-09", start: 540, end: 780 }]);
    expect(result.schedule.fit).toBe("REVIEW_REQUIRED");
    expect(result.recommendable).toBe(false);
  });
  it("joins user assignment schedules by worker id", () => {
    const snapshot = buildSubstituteDataSnapshot([worker()], [user()]);
    expect(snapshot.workers[0].assignmentSchedules?.u1).toEqual([{ day: "월", slots: [18, 19, 20, 21, 22, 23, 24, 25] }]);
    expect(snapshot.warnings).toEqual([]);
  });

  it("does not promote legacy availability into an actual service conflict", () => {
    const snapshot = buildSubstituteDataSnapshot([worker({ assignedUserIds: [] })], []);
    expect(snapshot.workers[0].availableHours).toBe("09:00~18:00");
    expect(snapshot.workers[0].assignmentSchedules).toEqual({});
  });

  it("keeps missing new condition fields unknown", () => {
    const snapshot = buildSubstituteDataSnapshot([worker()], [user()]);
    expect(snapshot.workers[0].diaperCareStatus).toBeUndefined();
    expect(snapshot.workers[0].disabilityExperienceTypes).toBeUndefined();
    expect(snapshot.workers[0].leaveStatus).toBe("UNKNOWN");
  });

  it("reports assigned users whose source document is missing", () => {
    const snapshot = buildSubstituteDataSnapshot([worker({ assignedUserIds: ["missing-user"] })], []);
    expect(snapshot.warnings).toContainEqual({ workerId: "w1", userId: "missing-user", message: "배정된 이용자 문서를 찾지 못했습니다." });
  });

  it("preserves input objects", () => {
    const sourceWorker = worker();
    const sourceUser = user();
    const workerJson = JSON.stringify(sourceWorker);
    const userJson = JSON.stringify(sourceUser);
    buildSubstituteDataSnapshot([sourceWorker], [sourceUser]);
    expect(JSON.stringify(sourceWorker)).toBe(workerJson);
    expect(JSON.stringify(sourceUser)).toBe(userJson);
  });
});
