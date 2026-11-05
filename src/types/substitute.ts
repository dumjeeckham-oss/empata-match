export type SubstituteEmploymentEligibility = "ELIGIBLE" | "INELIGIBLE" | "REVIEW_REQUIRED";
export type SubstituteScheduleFit = "FULL" | "PARTIAL" | "NONE" | "REVIEW_REQUIRED";
export type SubstituteConditionStatus = "PASS" | "FAIL" | "REVIEW_REQUIRED" | "UNKNOWN" | "NOT_APPLICABLE";
export type DiaperCareStatus = "가능" | "불가" | "미확인";
export type AvailabilityBlockType = "OTHER_JOB" | "PERSONAL" | "TEMPORARY" | "OTHER";
export type AvailabilityBlockStatus = "ACTIVE" | "RELEASED";
export type ContactCheckStatus =
  | "NOT_CONTACTED"
  | "CONTACTED"
  | "AVAILABLE"
  | "UNAVAILABLE"
  | "PARTIAL"
  | "NO_RESPONSE"
  | "DECLINED";

export type SubstituteWeekday = "월" | "화" | "수" | "목" | "금" | "토" | "일";

export interface TimeRangeInput {
  startTime: string;
  endTime: string;
}

export interface MinuteRange {
  start: number;
  end: number;
}

export interface DatedMinuteRange extends MinuteRange {
  date: string;
}

export interface SubstituteRequestInput {
  requestId: string;
  startDate: string;
  endDate: string;
  weeklySlots?: Partial<Record<SubstituteWeekday, TimeRangeInput[]>>;
  dateOverrides?: Record<string, TimeRangeInput[]>;
  requirements?: SubstituteRequirements;
}

export interface SubstituteRequirements {
  diaperCare: "REQUIRED" | "NONE";
  driving: "REQUIRED" | "PREFERRED" | "NONE";
  housework: "REQUIRED" | "PREFERRED" | "NONE";
  transfer: "REQUIRED" | "PREFERRED" | "NONE";
  bathingAndBodyCare: "REQUIRED" | "PREFERRED" | "NONE";
  communication: "REQUIRED" | "PREFERRED" | "NONE";
  disabilityExperience: "REQUIRED" | "PREFERRED" | "NONE";
  workerGender: "ANY" | string;
  userDisabilityType: "ANY" | string;
}

export interface AssignmentScheduleInput {
  id?: string;
  schedule: WeeklyScheduleInput[];
  startDate?: string;
  endDate?: string | null;
}

export interface WeeklyScheduleInput {
  day: SubstituteWeekday;
  slots: number[];
  alternativeSlots?: number[];
}

export interface MatchingHistoryScheduleInput {
  id?: string;
  serviceSchedule?: WeeklyScheduleInput[];
  serviceStartDate?: string;
  serviceEndDate?: string | null;
}

export interface SubstituteWorkerInput {
  id: string;
  name?: string;
  contractStatus?: string;
  retirementDate?: string;
  resignationDate?: string;
  serviceStartDate?: string;
  assignedUserIds?: string[];
  assigned_users?: string[];
  employmentHistory?: Array<{
    startDate: string;
    endDate: string | null;
    status: "재직중" | "퇴사";
  }>;
  leaveStatus?: "ACTIVE" | "ON_LEAVE" | "UNKNOWN";
  diaperCareStatus?: DiaperCareStatus;
  rejectionTypes?: string[];
  supportTypes?: string[];
  houseworkStatus?: "가능" | "불가" | "미확인";
  disabilityExperienceTypes?: string[];
  gender?: string;
  canDrive?: boolean;
  weeklySchedule?: WeeklyScheduleInput[];
  availableDays?: string;
  availableHours?: string;
  assignmentSchedules?: Record<string, WeeklyScheduleInput[]>;
  assignedServiceSchedules?: AssignmentScheduleInput[];
  matchingHistory?: MatchingHistoryScheduleInput[];
}

export interface WorkerAvailabilityBlockInput {
  id: string;
  workerId: string;
  type: AvailabilityBlockType;
  status: AvailabilityBlockStatus;
  date?: string;
  startDate?: string;
  endDate?: string | null;
  weekdays?: SubstituteWeekday[];
  repeat?: boolean;
  startTime: string;
  endTime: string;
}

export interface SubstituteContactCheckInput {
  requestId: string;
  workerId: string;
  status: ContactCheckStatus;
  checkedRanges?: DatedMinuteRange[];
  checkedBy?: string;
  checkedAt?: string;
  note?: string;
}

export interface ConditionEvaluation {
  status: SubstituteConditionStatus;
  reason?: string;
}

export interface SubstituteDateResult {
  date: string;
  requested: DatedMinuteRange[];
  existingServiceConflicts: DatedMinuteRange[];
  availabilityBlockConflicts: DatedMinuteRange[];
  remaining: DatedMinuteRange[];
  requestedMinutes: number;
  availableMinutes: number;
  fulfillmentRate: number;
  fit: SubstituteScheduleFit;
  warnings: string[];
}

export interface SubstituteCandidateResult {
  requestId: string;
  workerId: string;
  workerName?: string;
  employment: {
    eligibility: SubstituteEmploymentEligibility;
    reasons: string[];
    warnings: string[];
  };
  schedule: {
    fit: SubstituteScheduleFit;
    requestedMinutes: number;
    availableMinutes: number;
    fulfillmentRate: number;
    fullDays: number;
    partialDays: number;
    noneDays: number;
    reviewDays: number;
    dates: SubstituteDateResult[];
  };
  requiredCondition: ConditionEvaluation;
  preferredConditions: {
    housework: ConditionEvaluation;
    disabilityExperience: ConditionEvaluation;
    driving: ConditionEvaluation;
  };
  contactCheck?: SubstituteContactCheckInput;
  confirmedAvailable: false;
  recommendable: boolean;
  warnings: string[];
}

export interface SubstituteSearchResult {
  requestId: string;
  requestedMinutes: number;
  candidates: SubstituteCandidateResult[];
  recommendableCandidates: SubstituteCandidateResult[];
  diagnostics: SubstituteCandidateResult[];
}
