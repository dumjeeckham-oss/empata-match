import { VOUCHER_HOURS, type ServiceUser, type WeeklySchedule } from "@/types";

type ServiceHoursSource = Pick<
  ServiceUser,
  | "weeklySchedule"
  | "requiredDays"
  | "requiredHours"
  | "voucherTier"
  | "voucherHours"
  | "additionalHours"
  | "provinceAdditionalHours"
  | "cityAdditionalHours"
>;

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"] as const;

const numberValue = (value: unknown): number => {
  const parsed = Number(String(value ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatHours = (hours: number): string =>
  Number.isInteger(hours) ? String(hours) : hours.toFixed(1).replace(/\.0$/, "");

export function calculateWeeklyScheduleHours(schedule: WeeklySchedule[] | undefined): number {
  return (schedule || []).reduce((total, day) => {
    const uniquePrimarySlots = new Set((day.slots || []).filter((slot) => Number.isInteger(slot) && slot >= 0 && slot <= 47));
    return total + uniquePrimarySlots.size * 0.5;
  }, 0);
}

export function countRequestedDays(value: string | undefined): number {
  const normalized = String(value || "").replace(/\s+/g, "");
  if (!normalized) return 0;
  if (/평일/.test(normalized)) return 5;
  if (/매일|주7일/.test(normalized)) return 7;

  const selected = new Set<string>();
  const rangePattern = /([월화수목금토일])(?:요일)?\s*[~～\-–→]\s*([월화수목금토일])(?:요일)?/g;
  for (const match of normalized.matchAll(rangePattern)) {
    const start = WEEKDAYS.indexOf(match[1] as (typeof WEEKDAYS)[number]);
    const end = WEEKDAYS.indexOf(match[2] as (typeof WEEKDAYS)[number]);
    if (start >= 0 && end >= start) WEEKDAYS.slice(start, end + 1).forEach((day) => selected.add(day));
  }
  normalized.replace(rangePattern, "").match(/[월화수목금토일]/g)?.forEach((day) => selected.add(day));
  return selected.size;
}

function timeToMinutes(hourText: string, minuteText?: string): number {
  return Number(hourText) * 60 + Number(minuteText || 0);
}

export function parseRequestedDailyHours(value: string | undefined): number {
  const normalized = String(value || "").trim();
  if (!normalized) return 0;
  const match = normalized.match(/(\d{1,2})(?:\s*시|:)(?:\s*(\d{1,2})(?:\s*분)?)?\s*[~～\-–→]\s*(\d{1,2})(?:\s*시|:)(?:\s*(\d{1,2})(?:\s*분)?)?/);
  if (!match) return 0;
  const start = timeToMinutes(match[1], match[2]);
  const end = timeToMinutes(match[3], match[4]);
  return end > start ? (end - start) / 60 : 0;
}

/** 선택한 주간 시간표를 우선 사용하고, 없을 때 기존 필요요일/필요시간 문자를 해석합니다. */
export function calculateMonthlyRequiredHours(source: Pick<ServiceHoursSource, "weeklySchedule" | "requiredDays" | "requiredHours">): number {
  const weeklyHours = calculateWeeklyScheduleHours(source.weeklySchedule);
  const fallbackWeeklyHours = countRequestedDays(source.requiredDays) * parseRequestedDailyHours(source.requiredHours);
  return (weeklyHours > 0 ? weeklyHours : fallbackWeeklyHours) * 4;
}

export function calculateTotalVoucherHours(source: Pick<ServiceHoursSource, "voucherTier" | "voucherHours" | "additionalHours" | "provinceAdditionalHours" | "cityAdditionalHours">): number {
  const base = numberValue(source.voucherHours) || VOUCHER_HOURS[source.voucherTier] || 0;
  const splitAdditional = numberValue(source.provinceAdditionalHours) + numberValue(source.cityAdditionalHours);
  const additional = splitAdditional > 0 ? splitAdditional : numberValue(source.additionalHours);
  return base + additional;
}

export function formatRequiredVoucherGap(source: ServiceHoursSource): string {
  const required = calculateMonthlyRequiredHours(source);
  const voucher = calculateTotalVoucherHours(source);
  const difference = voucher - required;
  const gap = difference > 0
    ? `${formatHours(difference)}시간 남음`
    : difference < 0
      ? `${formatHours(Math.abs(difference))}시간 부족`
      : "차이 없음";
  return `필요시간: 월 ${formatHours(required)}시간 / 바우처: 월 ${formatHours(voucher)}시간 (${gap})`;
}
