import type {
  AssignmentScheduleInput,
  DatedMinuteRange,
  MinuteRange,
  SubstituteWeekday,
  TimeRangeInput,
  WeeklyScheduleInput,
  WorkerAvailabilityBlockInput,
} from "@/types/substitute";

const WEEKDAYS: SubstituteWeekday[] = ["일", "월", "화", "수", "목", "금", "토"];
const WEEKDAY_INDEX: Record<SubstituteWeekday, number> = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };

export const MINUTES_PER_DAY = 24 * 60;

export function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function isValidTimeString(value: string, allow24 = false): boolean {
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [hour, minute] = value.split(":").map(Number);
  if (minute < 0 || minute > 59) return false;
  return allow24 ? hour >= 0 && hour <= 24 && (hour < 24 || minute === 0) : hour >= 0 && hour <= 23;
}

export function timeToMinutes(value: string, allow24 = false): number {
  if (!isValidTimeString(value, allow24)) throw new Error(`Invalid time: ${value}`);
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function minutesToTime(minutes: number): string {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > MINUTES_PER_DAY) throw new Error(`Invalid minute: ${minutes}`);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function addDays(date: string, days: number): string {
  if (!isValidDateString(date)) throw new Error(`Invalid date: ${date}`);
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function weekdayOf(date: string): SubstituteWeekday {
  if (!isValidDateString(date)) throw new Error(`Invalid date: ${date}`);
  return WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
}

export function expandDateRange(startDate: string, endDate: string): string[] {
  if (!isValidDateString(startDate) || !isValidDateString(endDate) || startDate > endDate) throw new Error("Invalid date range");
  const dates: string[] = [];
  for (let date = startDate; date <= endDate; date = addDays(date, 1)) dates.push(date);
  return dates;
}

export function normalizeRanges(ranges: MinuteRange[]): MinuteRange[] {
  const valid = ranges
    .filter((range) => Number.isInteger(range.start) && Number.isInteger(range.end) && range.start >= 0 && range.end <= MINUTES_PER_DAY && range.end > range.start)
    .map((range) => ({ start: range.start, end: range.end }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: MinuteRange[] = [];
  for (const range of valid) {
    const previous = merged[merged.length - 1];
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}

export function intersectRanges(left: MinuteRange[], right: MinuteRange[]): MinuteRange[] {
  const intersections: MinuteRange[] = [];
  for (const first of normalizeRanges(left)) {
    for (const second of normalizeRanges(right)) {
      const start = Math.max(first.start, second.start);
      const end = Math.min(first.end, second.end);
      if (start < end) intersections.push({ start, end });
    }
  }
  return normalizeRanges(intersections);
}

export function subtractRanges(source: MinuteRange[], subtract: MinuteRange[]): MinuteRange[] {
  let remaining = normalizeRanges(source);
  for (const blocker of normalizeRanges(subtract)) {
    const next: MinuteRange[] = [];
    for (const range of remaining) {
      if (blocker.end <= range.start || blocker.start >= range.end) {
        next.push(range);
        continue;
      }
      if (range.start < blocker.start) next.push({ start: range.start, end: blocker.start });
      if (blocker.end < range.end) next.push({ start: blocker.end, end: range.end });
    }
    remaining = normalizeRanges(next);
  }
  return remaining;
}

export function rangeMinutes(ranges: MinuteRange[]): number {
  return normalizeRanges(ranges).reduce((total, range) => total + range.end - range.start, 0);
}

export function expandTimeRange(date: string, input: TimeRangeInput): DatedMinuteRange[] {
  if (!isValidDateString(date)) throw new Error(`Invalid date: ${date}`);
  const start = timeToMinutes(input.startTime);
  const end = timeToMinutes(input.endTime, true);
  if (start === end) throw new Error("A time range cannot have equal start and end");
  if (end > start) return [{ date, start, end }];
  return [
    { date, start, end: MINUTES_PER_DAY },
    { date: addDays(date, 1), start: 0, end },
  ];
}

export function expandDailyRanges(date: string, inputs: TimeRangeInput[]): DatedMinuteRange[] {
  return inputs.flatMap((input) => expandTimeRange(date, input));
}

export function expandWeeklySchedule(date: string, schedule: WeeklyScheduleInput[]): DatedMinuteRange[] {
  const slots = schedule.find((entry) => entry.day === weekdayOf(date))?.slots || [];
  const normalizedSlots = [...new Set(slots)].filter((slot) => Number.isInteger(slot) && slot >= 0 && slot <= 47).sort((a, b) => a - b);
  const ranges: MinuteRange[] = [];
  for (const slot of normalizedSlots) {
    const start = slot * 30;
    const end = Math.min(start + 30, MINUTES_PER_DAY);
    ranges.push({ start, end });
  }
  return normalizeRanges(ranges).map((range) => ({ date, ...range }));
}

export function expandRequestDates(
  startDate: string,
  endDate: string,
  weeklySlots: Partial<Record<SubstituteWeekday, TimeRangeInput[]>> = {},
  dateOverrides: Record<string, TimeRangeInput[]> = {},
): DatedMinuteRange[] {
  return expandDateRange(startDate, endDate).flatMap((date) => {
    const inputs = Object.prototype.hasOwnProperty.call(dateOverrides, date)
      ? dateOverrides[date]
      : weeklySlots[weekdayOf(date)] || [];
    return expandDailyRanges(date, inputs);
  });
}

export function weeklyScheduleToDatedRanges(date: string, schedule: WeeklyScheduleInput[]): DatedMinuteRange[] {
  return expandWeeklySchedule(date, schedule);
}

export function assignmentSchedulesToDatedRanges(dates: string[], assignments: AssignmentScheduleInput[]): DatedMinuteRange[] {
  return dates.flatMap((date) => assignments
    .filter((assignment) => (!assignment.startDate || date >= assignment.startDate) && (!assignment.endDate || date < assignment.endDate))
    .flatMap((assignment) => expandWeeklySchedule(date, assignment.schedule)));
}

export function blockAppliesOnDate(block: WorkerAvailabilityBlockInput, date: string): boolean {
  if (block.status !== "ACTIVE") return false;
  if (!isValidDateString(date)) return false;
  if (block.date && block.date !== date) return false;
  if (block.startDate && date < block.startDate) return false;
  if (block.endDate && date > block.endDate) return false;
  if (block.repeat || block.weekdays?.length) return block.weekdays?.includes(weekdayOf(date)) ?? false;
  return Boolean(block.date || block.startDate);
}

export function availabilityBlockToDatedRanges(block: WorkerAvailabilityBlockInput, dates: string[]): DatedMinuteRange[] {
  return dates.filter((date) => blockAppliesOnDate(block, date)).flatMap((date) => expandTimeRange(date, { startTime: block.startTime, endTime: block.endTime }));
}

export function collectAvailabilityBlockRanges(blocks: WorkerAvailabilityBlockInput[], workerId: string, dates: string[]): DatedMinuteRange[] {
  return blocks
    .filter((block) => block.workerId === workerId)
    .flatMap((block) => availabilityBlockToDatedRanges(block, dates));
}

export function collectDatesInRange(ranges: DatedMinuteRange[], dates: string[]): Record<string, MinuteRange[]> {
  return Object.fromEntries(dates.map((date) => [date, normalizeRanges(ranges.filter((range) => range.date === date))]));
}

export function weekdayIndex(day: SubstituteWeekday): number {
  return WEEKDAY_INDEX[day];
}
