import type { ServiceUser, Worker } from "@/types";
import { calculateMonthlyRequiredHours, calculateTotalVoucherHours } from "@/lib/serviceHours";
import { formatScheduleSummary } from "@/lib/workBoard";

const cleanText = (value: unknown): string => {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  return "";
};

const cleanList = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean);
  const single = cleanText(value);
  return single ? single.split(/[,/]/).map((item) => item.trim()).filter(Boolean) : [];
};

const unique = (values: unknown[]) => Array.from(new Set(values.map(cleanText).filter(Boolean)));

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
    ...cleanList(worker.supportTypes),
    worker.canDrive && "운전 가능",
  ]);
}

export function getWorkerAdditionalInfoTags(worker: Worker): string[] {
  return unique([
    worker.isForeigner && "외국인",
    worker.hasF4 && "F4 체류자격",
    worker.hasF5 && "F5 체류자격",
  ]);
}

export function getWorkerUnavailableTags(worker: Worker): string[] {
  return unique([
    ...cleanList(worker.rejectionTypes).map((value) => value.replace(/거부$/, " 불가")),
    worker.animalAllergy && "반려동물 불가",
    cleanText(worker.rejectedTasks),
  ]);
}

export function getWorkerPreviewAddress(worker: Worker): string {
  const legacyAddress = worker as Worker & { roadAddress?: unknown; detailAddress?: unknown };
  const roadAddress = cleanText(legacyAddress.roadAddress);
  const detailAddress = cleanText(legacyAddress.detailAddress);
  if (roadAddress) return [roadAddress, detailAddress].filter(Boolean).join(" ");
  return cleanText(worker.address) || cleanText(worker.residenceArea);
}

export function getWorkerPreviewNotes(worker: Worker): string {
  return cleanText(worker.notes);
}

export function formatWorkerMatchingTime(worker: Worker): string {
  return formatScheduleSummary(worker.weeklySchedule, worker.availableDays, worker.availableHours);
}
