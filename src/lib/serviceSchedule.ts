import type { ServiceUser, WeeklySchedule } from "@/types";

export type AssignmentScheduleMap = Record<string, WeeklySchedule[]>;

export type AssignmentScheduleConflict = {
  firstWorkerId: string;
  secondWorkerId: string;
  day: WeeklySchedule["day"];
  startTime: string;
  endTime: string;
};

const slotToTime = (slot: number): string => {
  const hour = Math.floor(slot / 2);
  const minute = slot % 2 === 0 ? "00" : "30";
  return `${String(hour).padStart(2, "0")}:${minute}`;
};

const DAY_ORDER: WeeklySchedule["day"][] = ["월", "화", "수", "목", "금", "토", "일"];

function formatSlotRanges(slots: number[]): string[] {
  const ordered = [...new Set(slots)].filter((slot) => slot >= 0 && slot <= 47).sort((a, b) => a - b);
  if (!ordered.length) return [];

  const ranges: string[] = [];
  let start = ordered[0];
  let previous = ordered[0];
  for (const slot of ordered.slice(1)) {
    if (slot === previous + 1) {
      previous = slot;
      continue;
    }
    ranges.push(`${slotToTime(start)}-${slotToTime(previous + 1)}`);
    start = slot;
    previous = slot;
  }
  ranges.push(`${slotToTime(start)}-${slotToTime(previous + 1)}`);
  return ranges;
}

function formatDayGroup(days: WeeklySchedule["day"][]): string {
  const ordered = DAY_ORDER.filter((day) => days.includes(day));
  if (!ordered.length) return "";
  const indexes = ordered.map((day) => DAY_ORDER.indexOf(day));
  const consecutive = indexes.every((index, position) => position === 0 || index === indexes[position - 1] + 1);
  return consecutive && ordered.length >= 3
    ? `${ordered[0]}-${ordered[ordered.length - 1]}`
    : ordered.join("·");
}

export function combineWeeklySchedules(schedules: Array<WeeklySchedule[] | undefined>): WeeklySchedule[] {
  return DAY_ORDER.map((day) => ({
    day,
    slots: [...new Set(
      schedules.flatMap((schedule) => schedule?.find((entry) => entry.day === day)?.slots || []),
    )].sort((a, b) => a - b),
  })).filter((entry) => entry.slots.length > 0);
}

/** 이용자 명단용으로 같은 시간대의 요일을 묶어 간결하게 표시한다. */
export function formatServiceScheduleOverview(
  schedule: WeeklySchedule[] | undefined,
  fallbackDays = "",
  fallbackHours = "",
): string {
  const groups = new Map<string, WeeklySchedule["day"][]>();
  for (const day of DAY_ORDER) {
    const ranges = formatSlotRanges(schedule?.find((entry) => entry.day === day)?.slots || []);
    if (!ranges.length) continue;
    const key = ranges.join(", ");
    groups.set(key, [...(groups.get(key) || []), day]);
  }

  if (groups.size > 0) {
    return [...groups.entries()]
      .map(([times, days]) => `${formatDayGroup(days)}, ${times}`)
      .join(" / ");
  }
  return [fallbackDays, fallbackHours].map((value) => value.trim()).filter(Boolean).join(", ") || "등록된 시간 정보 없음";
}

type UserScheduleSource = Pick<
  ServiceUser,
  "assignedHelperIds" | "assignmentSchedules" | "weeklySchedule" | "requiredDays" | "requiredHours"
>;

export function formatUserServiceScheduleOverview(user: UserScheduleSource): string {
  const assignedSchedules = (user.assignedHelperIds || [])
    .map((workerId) => user.assignmentSchedules?.[workerId])
    .filter(hasServiceSchedule);
  const schedule = assignedSchedules.length > 0
    ? combineWeeklySchedules(assignedSchedules)
    : user.weeklySchedule;
  return formatServiceScheduleOverview(schedule, user.requiredDays, user.requiredHours);
}

export function hasServiceSchedule(schedule: WeeklySchedule[] | undefined): boolean {
  return (schedule || []).some((day) => (day.slots || []).length > 0);
}

export function findAssignmentScheduleConflict(
  workerIds: string[],
  schedules: AssignmentScheduleMap,
): AssignmentScheduleConflict | null {
  const uniqueWorkerIds = [...new Set(workerIds.filter(Boolean))];
  for (let firstIndex = 0; firstIndex < uniqueWorkerIds.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < uniqueWorkerIds.length; secondIndex += 1) {
      const firstWorkerId = uniqueWorkerIds[firstIndex];
      const secondWorkerId = uniqueWorkerIds[secondIndex];
      for (const firstDay of schedules[firstWorkerId] || []) {
        const secondDay = (schedules[secondWorkerId] || []).find((day) => day.day === firstDay.day);
        if (!secondDay) continue;
        const secondSlots = new Set(secondDay.slots || []);
        const overlapSlot = [...new Set(firstDay.slots || [])].sort((a, b) => a - b).find((slot) => secondSlots.has(slot));
        if (overlapSlot !== undefined) {
          return {
            firstWorkerId,
            secondWorkerId,
            day: firstDay.day,
            startTime: slotToTime(overlapSlot),
            endTime: slotToTime(overlapSlot + 1),
          };
        }
      }
    }
  }
  return null;
}

export function getMissingAssignmentScheduleIds(workerIds: string[], schedules: AssignmentScheduleMap): string[] {
  if (workerIds.length <= 1) return [];
  return [...new Set(workerIds.filter(Boolean))].filter((workerId) => !hasServiceSchedule(schedules[workerId]));
}

export function updateAssignmentSchedule(
  schedules: AssignmentScheduleMap | undefined,
  workerId: string,
  schedule: WeeklySchedule[],
): AssignmentScheduleMap {
  return { ...(schedules || {}), [workerId]: schedule };
}
