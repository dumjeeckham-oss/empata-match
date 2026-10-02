import type { ServiceUser, Worker } from "@/types";
import { calculateMonthlyRequiredHours, calculateTotalVoucherHours } from "@/lib/serviceHours";
import { formatScheduleSummary } from "@/lib/workBoard";

const unique = (values: Array<string | false | null | undefined>) =>
  Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim()))));

const formatHours = (hours: number) =>
  Number.isInteger(hours) ? String(hours) : hours.toFixed(1).replace(/\.0$/, "");

export function getUserRequestTags(user: ServiceUser): string[] {
  return unique([
    ...(user.supportTypes || []),
    user.needsAftercare && "배변 뒤처리",
    user.wantsWeekendSupport && "주말 지원",
    user.needsSchoolSupport && "학교 내 지원",
    user.needsVehicle && "차량 지원",
    user.femaleOnly && "여성 지원사",
    user.maleOnly && "남성 지원사",
  ]);
}

export function getUserCautionTags(user: ServiceUser): string[] {
  return unique([
    ...(user.environmentTags || []),
    user.hasPet && (user.petNote?.trim() ? `반려동물: ${user.petNote.trim()}` : "반려동물 있음"),
    user.usesDiaper && "기저귀 케어",
    user.movementNote?.trim() && `이동: ${user.movementNote.trim()}`,
    user.houseworkNote?.trim() && `가사: ${user.houseworkNote.trim()}`,
  ]);
}

export function formatUserMatchingTime(user: ServiceUser): string {
  const schedule = formatScheduleSummary(user.weeklySchedule, user.requiredDays, user.requiredHours);
  const monthlyHours = calculateMonthlyRequiredHours(user);
  return `${schedule} / 월 ${formatHours(monthlyHours)}시간`;
}

export function formatUserVoucherHours(user: ServiceUser): string {
  return `월 ${formatHours(calculateTotalVoucherHours(user))}시간`;
}

export function getWorkerAvailableTags(worker: Worker): string[] {
  return unique([
    ...(worker.supportTypes || []),
    worker.canDrive && "운전 가능",
    worker.isForeigner && "외국인",
  ]);
}

export function getWorkerUnavailableTags(worker: Worker): string[] {
  return unique([
    ...(worker.rejectionTypes || []).map((value) => value.replace(/거부$/, " 불가")),
    worker.animalAllergy && "반려동물 불가",
    worker.rejectedTasks?.trim(),
  ]);
}

export function formatWorkerMatchingTime(worker: Worker): string {
  return formatScheduleSummary(worker.weeklySchedule, worker.availableDays, worker.availableHours);
}

