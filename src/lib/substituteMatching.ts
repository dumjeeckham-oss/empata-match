import {
  assignmentSchedulesToDatedRanges,
  collectAvailabilityBlockRanges,
  collectDatesInRange,
  expandDateRange,
  expandRequestDates,
  expandWeeklySchedule,
  intersectRanges,
  normalizeRanges,
  rangeMinutes,
  subtractRanges,
} from "@/lib/substituteAvailability";
import {
  assessWorkerEmployment,
  evaluateDiaperCare,
  evaluateDisabilityExperience,
  evaluateDriving,
  evaluateHousework,
} from "@/lib/substituteEligibility";
import type {
  AssignmentScheduleInput,
  ConditionEvaluation,
  DatedMinuteRange,
  MatchingHistoryScheduleInput,
  MinuteRange,
  SubstituteCandidateResult,
  SubstituteContactCheckInput,
  SubstituteDateResult,
  SubstituteRequestInput,
  SubstituteRequirements,
  SubstituteScheduleFit,
  SubstituteSearchResult,
  SubstituteWorkerInput,
  WeeklyScheduleInput,
  WorkerAvailabilityBlockInput,
} from "@/types/substitute";

const DEFAULT_REQUIREMENTS: SubstituteRequirements = {
  diaperCare: "REQUIRED",
  driving: "NONE",
  housework: "PREFERRED",
  transfer: "NONE",
  bathingAndBodyCare: "NONE",
  communication: "NONE",
  disabilityExperience: "PREFERRED",
  workerGender: "ANY",
  userDisabilityType: "ANY",
};

function datesForRequest(request: SubstituteRequestInput): string[] {
  return expandDateRange(request.startDate, request.endDate);
}

function groupRangesByDate(ranges: DatedMinuteRange[], dates: string[]): Record<string, DatedMinuteRange[]> {
  return Object.fromEntries(dates.map((date) => [date, ranges.filter((range) => range.date === date)]));
}

function matchingHistoryToAssignments(history: MatchingHistoryScheduleInput[] | undefined): AssignmentScheduleInput[] {
  return (history || [])
    .filter((entry) => entry.serviceSchedule && (entry.serviceEndDate === null || entry.serviceEndDate === undefined || entry.serviceEndDate === ""))
    .map((entry) => ({ id: entry.id, schedule: entry.serviceSchedule || [], startDate: entry.serviceStartDate }));
}

function workerServiceRanges(worker: SubstituteWorkerInput, dates: string[]): { ranges: DatedMinuteRange[]; warnings: string[] } {
  const warnings: string[] = [];
  const assignments: AssignmentScheduleInput[] = [
    ...(worker.assignedServiceSchedules || []),
    ...Object.entries(worker.assignmentSchedules || {}).map(([id, schedule]) => ({ id, schedule })),
    ...matchingHistoryToAssignments(worker.matchingHistory),
  ];
  if (assignments.length > 0) {
    const ranges = assignmentSchedulesToDatedRanges(dates, assignments);
    if (ranges.length === 0) warnings.push("배정별 서비스 일정이 요청 기간에 없습니다.");
    return { ranges, warnings };
  }
  if (hasAssignedUser(worker)) warnings.push("배정된 이용자는 있으나 실제 서비스 일정이 누락되었습니다.");
  if (worker.weeklySchedule?.length) warnings.push("지원사 일반 가능 일정은 참고용으로만 표시했습니다.");
  if (worker.availableDays || worker.availableHours) warnings.push("레거시 가능요일·가능시간은 충돌 판정에 사용하지 않았습니다.");
  else warnings.push("기존 서비스 일정이 없습니다.");
  return { ranges: [], warnings };
}

function hasAssignedUser(worker: SubstituteWorkerInput): boolean {
  return [...(worker.assignedUserIds || []), ...(worker.assigned_users || [])].some((id) => String(id || "").trim());
}

function fitForDate(requestedMinutes: number, availableMinutes: number, hasReviewWarning: boolean): SubstituteScheduleFit {
  if (hasReviewWarning) return "REVIEW_REQUIRED";
  if (availableMinutes <= 0) return "NONE";
  if (availableMinutes >= requestedMinutes) return "FULL";
  return "PARTIAL";
}

function makeDateResult(
  date: string,
  requested: DatedMinuteRange[],
  serviceConflicts: MinuteRange[],
  blockConflicts: MinuteRange[],
  warnings: string[],
): SubstituteDateResult {
  const requestedRanges = normalizeRanges(requested);
  const service = normalizeRanges(serviceConflicts);
  const blocks = normalizeRanges(blockConflicts);
  const blocked = normalizeRanges([...service, ...blocks]);
  const remaining = subtractRanges(requestedRanges, blocked);
  const requestedMinutes = rangeMinutes(requestedRanges);
  const availableMinutes = rangeMinutes(remaining);
  const hasReviewWarning = warnings.length > 0 && warnings.some((warning) => /확인 필요|불완전|누락/.test(warning));
  return {
    date,
    requested: requestedRanges.map((range) => ({ date, ...range })),
    existingServiceConflicts: service.map((range) => ({ date, ...range })),
    availabilityBlockConflicts: blocks.map((range) => ({ date, ...range })),
    remaining: remaining.map((range) => ({ date, ...range })),
    requestedMinutes,
    availableMinutes,
    fulfillmentRate: requestedMinutes === 0 ? 0 : availableMinutes / requestedMinutes,
    fit: fitForDate(requestedMinutes, availableMinutes, hasReviewWarning),
    warnings,
  };
}

function combineContactCheck(requestId: string, workerId: string, checks: SubstituteContactCheckInput[] | undefined): SubstituteContactCheckInput | undefined {
  return checks?.find((check) => check.requestId === requestId && check.workerId === workerId);
}

function preferredCount(candidate: SubstituteCandidateResult): number {
  return [candidate.preferredConditions.housework, candidate.preferredConditions.disabilityExperience, candidate.preferredConditions.driving]
    .filter((condition) => condition.status === "PASS").length;
}

function sortCandidates(left: SubstituteCandidateResult, right: SubstituteCandidateResult): number {
  const requiredOrder: Record<ConditionEvaluation["status"], number> = { PASS: 0, REVIEW_REQUIRED: 1, FAIL: 2, UNKNOWN: 3, NOT_APPLICABLE: 4 };
  const employmentOrder: Record<SubstituteCandidateResult["employment"]["eligibility"], number> = { ELIGIBLE: 0, REVIEW_REQUIRED: 1, INELIGIBLE: 2 };
  const scheduleOrder: Record<SubstituteScheduleFit, number> = { FULL: 0, PARTIAL: 1, NONE: 2, REVIEW_REQUIRED: 3 };
  return requiredOrder[left.requiredCondition.status] - requiredOrder[right.requiredCondition.status]
    || employmentOrder[left.employment.eligibility] - employmentOrder[right.employment.eligibility]
    || scheduleOrder[left.schedule.fit] - scheduleOrder[right.schedule.fit]
    || right.schedule.fulfillmentRate - left.schedule.fulfillmentRate
    || preferredCount(right) - preferredCount(left)
    || left.workerId.localeCompare(right.workerId);
}

function isRecommendable(candidate: SubstituteCandidateResult): boolean {
  return candidate.employment.eligibility === "ELIGIBLE"
    && candidate.requiredCondition.status === "PASS"
    && (candidate.schedule.fit === "FULL" || candidate.schedule.fit === "PARTIAL");
}

export function buildSubstituteRequestRanges(request: SubstituteRequestInput): DatedMinuteRange[] {
  return expandRequestDates(request.startDate, request.endDate, request.weeklySlots, request.dateOverrides);
}

export function calculateSubstituteCandidate(
  request: SubstituteRequestInput,
  worker: SubstituteWorkerInput,
  blocks: WorkerAvailabilityBlockInput[] = [],
  contactChecks: SubstituteContactCheckInput[] = [],
): SubstituteCandidateResult {
  const dates = datesForRequest(request);
  const requestedRanges = buildSubstituteRequestRanges(request);
  const requestedByDate = groupRangesByDate(requestedRanges, dates);
  const service = workerServiceRanges(worker, dates);
  const serviceByDate = groupRangesByDate(service.ranges, dates);
  const blockRanges = collectAvailabilityBlockRanges(blocks, worker.id, dates);
  const blocksByDate = groupRangesByDate(blockRanges, dates);
  const dateResults = dates.map((date) => makeDateResult(
    date,
    requestedByDate[date] || [],
    intersectRanges(requestedByDate[date] || [], serviceByDate[date] || []),
    intersectRanges(requestedByDate[date] || [], blocksByDate[date] || []),
    [...service.warnings, ...(blocksByDate[date]?.length ? ["공통 불가 일정과 충돌합니다."] : [])],
  ));
  const requestedMinutes = dateResults.reduce((sum, result) => sum + result.requestedMinutes, 0);
  const availableMinutes = dateResults.reduce((sum, result) => sum + result.availableMinutes, 0);
  const reviewDays = dateResults.filter((result) => result.fit === "REVIEW_REQUIRED").length;
  const fullDays = dateResults.filter((result) => result.fit === "FULL").length;
  const partialDays = dateResults.filter((result) => result.fit === "PARTIAL").length;
  const noneDays = dateResults.filter((result) => result.fit === "NONE").length;
  const scheduleFit: SubstituteScheduleFit = reviewDays > 0
    ? "REVIEW_REQUIRED"
    : availableMinutes <= 0
      ? "NONE"
      : availableMinutes >= requestedMinutes
        ? "FULL"
        : "PARTIAL";
  const requirements = { ...DEFAULT_REQUIREMENTS, ...(request.requirements || {}) };
  const employment = dates
    .map((date) => assessWorkerEmployment(worker, date))
    .reduce((current, next) => ({
      eligibility: current.eligibility === "INELIGIBLE" || next.eligibility === "INELIGIBLE"
        ? "INELIGIBLE"
        : current.eligibility === "REVIEW_REQUIRED" || next.eligibility === "REVIEW_REQUIRED"
          ? "REVIEW_REQUIRED"
          : "ELIGIBLE",
      reasons: [...current.reasons, ...next.reasons],
      warnings: [...current.warnings, ...next.warnings],
    }), { eligibility: "ELIGIBLE" as const, reasons: [] as string[], warnings: [] as string[] });
  const requiredCondition = evaluateDiaperCare(worker, requirements.diaperCare);
  const preferredConditions = {
    housework: evaluateHousework(worker, requirements.housework),
    disabilityExperience: evaluateDisabilityExperience(worker, requirements.disabilityExperience, requirements.userDisabilityType),
    driving: evaluateDriving(worker, requirements.driving),
  };
  const contactCheck = combineContactCheck(request.requestId, worker.id, contactChecks);
  const warnings = [...new Set([...employment.warnings, ...service.warnings, ...dateResults.flatMap((result) => result.warnings)])];
  const candidate: SubstituteCandidateResult = {
    requestId: request.requestId,
    workerId: worker.id,
    workerName: worker.name,
    employment: { ...employment, reasons: [...new Set(employment.reasons)], warnings: [...new Set(employment.warnings)] },
    schedule: {
      fit: scheduleFit,
      requestedMinutes,
      availableMinutes,
      fulfillmentRate: requestedMinutes === 0 ? 0 : availableMinutes / requestedMinutes,
      fullDays,
      partialDays,
      noneDays,
      reviewDays,
      dates: dateResults,
    },
    requiredCondition,
    preferredConditions,
    contactCheck,
    confirmedAvailable: false,
    recommendable: false,
    warnings,
  };
  candidate.recommendable = isRecommendable(candidate);
  return candidate;
}

export function searchSubstituteWorkers(
  request: SubstituteRequestInput,
  workers: SubstituteWorkerInput[],
  blocks: WorkerAvailabilityBlockInput[] = [],
  contactChecks: SubstituteContactCheckInput[] = [],
): SubstituteSearchResult {
  const candidates = workers.map((worker) => calculateSubstituteCandidate(request, worker, blocks, contactChecks)).sort(sortCandidates);
  return {
    requestId: request.requestId,
    requestedMinutes: candidates[0]?.schedule.requestedMinutes ?? rangeMinutes(buildSubstituteRequestRanges(request)),
    candidates,
    recommendableCandidates: candidates.filter((candidate) => candidate.recommendable),
    diagnostics: candidates.filter((candidate) => !candidate.recommendable),
  };
}

export function attachContactCheckToCandidate(
  candidate: SubstituteCandidateResult,
  contactCheck: SubstituteContactCheckInput,
): SubstituteCandidateResult {
  if (candidate.requestId !== contactCheck.requestId || candidate.workerId !== contactCheck.workerId) return candidate;
  return { ...candidate, contactCheck };
}

export function summarizeCandidateDates(candidate: SubstituteCandidateResult): Record<string, SubstituteDateResult> {
  return Object.fromEntries(candidate.schedule.dates.map((date) => [date.date, date]));
}
