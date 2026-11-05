import type { ServiceUser, Worker } from "@/types";
import type {
  MatchingHistoryScheduleInput,
  SubstituteWorkerInput,
  WeeklyScheduleInput,
} from "@/types/substitute";

export interface SubstituteWorkerContact {
  workerId: string;
  name: string;
  phone: string;
  gender: string;
  contractStatus: string;
}

export interface SubstituteDataWarning {
  workerId?: string;
  userId?: string;
  message: string;
}

export interface SubstituteDataSnapshot {
  workers: SubstituteWorkerInput[];
  contacts: SubstituteWorkerContact[];
  warnings: SubstituteDataWarning[];
}

function scheduleOf(value: unknown): WeeklyScheduleInput[] {
  return Array.isArray(value) ? value as WeeklyScheduleInput[] : [];
}

function uniqueIds(...values: Array<string[] | undefined>): string[] {
  return [...new Set(values.flatMap((items) => (items || []).map((id) => String(id || "").trim()).filter(Boolean)))];
}

function activeMatchingHistory(worker: Worker): MatchingHistoryScheduleInput[] {
  return (worker.matchingHistory || [])
    .filter((entry) => entry.serviceSchedule && (entry.serviceEndDate === null || entry.serviceEndDate === undefined || entry.serviceEndDate === ""))
    .map((entry) => ({
      id: entry.id,
      serviceSchedule: scheduleOf(entry.serviceSchedule),
      serviceStartDate: entry.serviceStartDate,
      serviceEndDate: entry.serviceEndDate,
    }));
}

/**
 * 운영 Worker/User 문서를 R3-A 순수 엔진 입력으로 변환한다.
 * 이 함수는 원본 객체를 수정하지 않으며, 기존 일정이 없는 경우 일반 가능시간을
 * 실제 서비스 충돌 일정으로 승격하지 않는다.
 */
export function buildSubstituteDataSnapshot(workers: Worker[], users: ServiceUser[]): SubstituteDataSnapshot {
  const warnings: SubstituteDataWarning[] = [];
  const usersById = new Map(users.map((user) => [String(user.id || ""), user]));

  const workerInputs = workers
    .filter((worker) => String(worker.id || "").trim())
    .map((worker) => {
      const workerId = String(worker.id);
      const assignedUserIds = uniqueIds(worker.assignedUserIds, worker.assigned_users);
      const assignmentSchedules: Record<string, WeeklyScheduleInput[]> = {};

      for (const user of users) {
        const userId = String(user.id || "");
        if (!userId || !uniqueIds(user.assignedHelperIds, user.assigned_workers).includes(workerId)) continue;
        const schedule = scheduleOf(user.assignmentSchedules?.[workerId]);
        if (schedule.length) assignmentSchedules[userId] = schedule;
        else warnings.push({ workerId, userId, message: "배정된 이용자의 지원사별 실제 서비스 일정이 없습니다." });
      }

      const missingAssignedUsers = assignedUserIds.filter((userId) => !usersById.has(userId));
      missingAssignedUsers.forEach((userId) => warnings.push({ workerId, userId, message: "배정된 이용자 문서를 찾지 못했습니다." }));

      if (assignedUserIds.length > 0 && Object.keys(assignmentSchedules).length === 0 && !activeMatchingHistory(worker).length) {
        warnings.push({ workerId, message: "배정 정보는 있으나 충돌 판정용 실제 서비스 일정이 없습니다." });
      }

      const input: SubstituteWorkerInput = {
        id: workerId,
        name: worker.name,
        contractStatus: worker.contractStatus,
        retirementDate: worker.retirementDate,
        resignationDate: worker.resignationDate,
        serviceStartDate: worker.serviceStartDate,
        assignedUserIds,
        assigned_users: worker.assigned_users,
        employmentHistory: worker.employmentHistory?.map((entry) => ({
          startDate: entry.startDate,
          endDate: entry.endDate,
          status: entry.status,
        })),
        // 기존 Worker에는 공식 휴직 필드가 없으므로 자동 ACTIVE 판정 금지
        leaveStatus: "UNKNOWN",
        // 신규 등록항목이 없으면 미확인으로 유지
        diaperCareStatus: undefined,
        rejectionTypes: worker.rejectionTypes || [],
        supportTypes: worker.supportTypes || [],
        houseworkStatus: worker.supportTypes?.includes("가사지원") ? "가능" : "미확인",
        disabilityExperienceTypes: undefined,
        gender: worker.gender || worker.txtHSex,
        canDrive: worker.canDrive,
        weeklySchedule: scheduleOf(worker.weeklySchedule),
        availableDays: worker.availableDays,
        availableHours: worker.availableHours,
        assignmentSchedules,
        matchingHistory: activeMatchingHistory(worker),
      };

      return input;
    });

  return {
    workers: workerInputs,
    contacts: workers
      .filter((worker) => String(worker.id || "").trim())
      .map((worker) => ({
        workerId: String(worker.id),
        name: worker.name,
        phone: worker.phone,
        gender: worker.gender || worker.txtHSex || "미확인",
        contractStatus: worker.contractStatus,
      })),
    warnings,
  };
}
