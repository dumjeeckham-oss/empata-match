import { getWorkerOperationalStatus } from "@/lib/statusLifecycle";
import type {
  ConditionEvaluation,
  DiaperCareStatus,
  SubstituteEmploymentEligibility,
  SubstituteRequirements,
  SubstituteWorkerInput,
} from "@/types/substitute";

export interface EmploymentAssessment {
  eligibility: SubstituteEmploymentEligibility;
  reasons: string[];
  warnings: string[];
}

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function hasAssignment(worker: SubstituteWorkerInput): boolean {
  return [...(worker.assignedUserIds || []), ...(worker.assigned_users || [])].some((id) => clean(id));
}

function historyAssessment(worker: SubstituteWorkerInput, date: string): "ACTIVE" | "INACTIVE" | "CONFLICT" | "UNKNOWN" {
  const history = worker.employmentHistory || [];
  if (!history.length) return "UNKNOWN";
  const matching = history.filter((entry) => entry.startDate <= date && (!entry.endDate || date < entry.endDate));
  if (matching.length > 1 && new Set(matching.map((entry) => entry.status)).size > 1) return "CONFLICT";
  if (matching.some((entry) => entry.status === "재직중")) return "ACTIVE";
  if (matching.some((entry) => entry.status === "퇴사")) return "INACTIVE";
  return "UNKNOWN";
}

export function assessWorkerEmployment(worker: SubstituteWorkerInput, date: string): EmploymentAssessment {
  const reasons: string[] = [];
  const warnings: string[] = [];
  if (!worker.id) return { eligibility: "REVIEW_REQUIRED", reasons: ["지원사 식별자가 없습니다."], warnings };

  const operational = getWorkerOperationalStatus({
    ...worker,
    contractStatus: (worker.contractStatus || "") as never,
    assignedUserIds: worker.assignedUserIds || worker.assigned_users || [],
  } as never, date);
  if (operational === "퇴사") return { eligibility: "INELIGIBLE", reasons: ["검색 기준일에 퇴사 상태입니다."], warnings };

  const status = clean(worker.contractStatus).replace(/\s+/g, "");
  if (status && !["근무중", "대기", "변경", "퇴사"].includes(status)) {
    reasons.push(`알 수 없는 상태값: ${status}`);
  }
  if (!status) warnings.push("상태값 미확인");

  const history = historyAssessment(worker, date);
  if (history === "INACTIVE") return { eligibility: "INELIGIBLE", reasons: ["고용 이력상 검색 기준일에 재직하지 않습니다."], warnings };
  if (history === "CONFLICT") reasons.push("고용 이력의 재직·퇴사 기간이 겹칩니다.");

  if (worker.leaveStatus === "ON_LEAVE") return { eligibility: "INELIGIBLE", reasons: ["검색 기준일에 휴직 상태입니다."], warnings };
  if (worker.leaveStatus !== "ACTIVE") warnings.push("휴직·근무중단 여부 확인 필요");

  if (worker.retirementDate && worker.resignationDate && worker.retirementDate !== worker.resignationDate) {
    reasons.push("퇴사일 필드가 서로 다릅니다.");
  }
  if (history === "CONFLICT" || reasons.length > 0 || worker.leaveStatus !== "ACTIVE") {
    return { eligibility: "REVIEW_REQUIRED", reasons, warnings };
  }
  const futureRetirementIsActive = status === "퇴사" && Boolean(worker.retirementDate) && worker.retirementDate > date;
  if (worker.leaveStatus === "ACTIVE" && (status === "근무중" || status === "대기" || status === "변경" || futureRetirementIsActive || hasAssignment(worker))) {
    return { eligibility: "ELIGIBLE", reasons, warnings };
  }
  return { eligibility: "REVIEW_REQUIRED", reasons: ["재직 관계를 확인할 수 없습니다."], warnings };
}

export function evaluateDiaperCare(worker: SubstituteWorkerInput, requirement: SubstituteRequirements["diaperCare"]): ConditionEvaluation {
  if (requirement !== "REQUIRED") return { status: "NOT_APPLICABLE", reason: "기저귀 케어 조건 없음" };
  const status: DiaperCareStatus = worker.diaperCareStatus || "미확인";
  const legacyRefusal = worker.rejectionTypes?.includes("기저귀거부") === true;
  if (legacyRefusal && status === "가능") return { status: "REVIEW_REQUIRED", reason: "기존 기저귀거부와 신규 가능 상태가 충돌합니다." };
  if (status === "가능") return { status: "PASS" };
  if (status === "불가" || legacyRefusal) return { status: "FAIL", reason: "기저귀 케어 불가 또는 거부 이력이 있습니다." };
  return { status: "REVIEW_REQUIRED", reason: "기저귀 케어 확인이 필요합니다." };
}

export function evaluateHousework(worker: SubstituteWorkerInput, requirement: SubstituteRequirements["housework"]): ConditionEvaluation {
  if (requirement === "NONE") return { status: "NOT_APPLICABLE", reason: "가사 지원 조건 없음" };
  if (worker.houseworkStatus === "가능" || worker.supportTypes?.includes("가사지원")) return { status: "PASS" };
  if (worker.houseworkStatus === "불가") return { status: "FAIL" };
  return { status: "UNKNOWN", reason: "가사 지원 정보가 없습니다." };
}

export function evaluateDriving(worker: SubstituteWorkerInput, requirement: SubstituteRequirements["driving"]): ConditionEvaluation {
  if (requirement === "NONE") return { status: "NOT_APPLICABLE", reason: "운전 조건 없음" };
  if (worker.canDrive === true) return { status: "PASS" };
  if (worker.canDrive === false) return { status: "FAIL" };
  return { status: "UNKNOWN", reason: "운전 정보가 없습니다." };
}

export function evaluateDisabilityExperience(
  worker: SubstituteWorkerInput,
  requirement: SubstituteRequirements["disabilityExperience"],
  userDisabilityType: SubstituteRequirements["userDisabilityType"],
): ConditionEvaluation {
  if (requirement === "NONE" || userDisabilityType === "ANY") return { status: "NOT_APPLICABLE", reason: "장애유형이 ANY입니다." };
  if (worker.disabilityExperienceTypes?.includes(userDisabilityType)) return { status: "PASS" };
  if (worker.disabilityExperienceTypes?.length) return { status: "FAIL" };
  return { status: "UNKNOWN", reason: "장애유형별 경험 정보가 없습니다." };
}

export function evaluateRequiredConditions(worker: SubstituteWorkerInput, requirements: SubstituteRequirements): ConditionEvaluation {
  return evaluateDiaperCare(worker, requirements.diaperCare);
}
