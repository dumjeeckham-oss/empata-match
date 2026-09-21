import type { WeeklySchedule } from "@/types";

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
