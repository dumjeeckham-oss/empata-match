import type { AnnualSchedule, CalendarEventColor, WorkCalendarEvent } from "@/types";

export type CalendarDay = { date: string; day: number; inMonth: boolean };
export type CalendarDisplayEvent = WorkCalendarEvent & {
  id: string;
  source?: "calendar" | "annual";
  annualScheduleId?: string;
  annualStatus?: AnnualSchedule["status"];
};
export type CalendarEventWithLane = CalendarDisplayEvent & { lane: number };

export function toLocalYmd(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function buildMonthGrid(year: number, monthIndex: number): CalendarDay[] {
  const first = new Date(year, monthIndex, 1);
  const cursor = new Date(year, monthIndex, 1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + index);
    return { date: toLocalYmd(date), day: date.getDate(), inMonth: date.getMonth() === monthIndex };
  });
}

export function assignCalendarEventLanes(events: CalendarDisplayEvent[]): CalendarEventWithLane[] {
  const laneEnds: string[] = [];
  return [...events]
    .filter((event) => event.startDate && event.endDate && event.startDate <= event.endDate)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate) || a.title.localeCompare(b.title))
    .map((event) => {
      let lane = laneEnds.findIndex((endDate) => endDate < event.startDate);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = event.endDate;
      return { ...event, lane };
    });
}

const annualStatusColor: Record<AnnualSchedule["status"], CalendarEventColor> = {
  진행중: "green",
  예정: "violet",
  완료: "slate",
};

export function annualSchedulesToCalendarEvents(schedules: (AnnualSchedule & { id: string })[]): CalendarDisplayEvent[] {
  return schedules.flatMap((schedule) => {
    const common = {
      note: [schedule.manager && `담당: ${schedule.manager}`, schedule.note].filter(Boolean).join("\n"),
      color: annualStatusColor[schedule.status],
      source: "annual" as const,
      annualScheduleId: schedule.id,
      annualStatus: schedule.status,
    };
    const preparation = schedule.preparationStartDate ? [{
      ...common, id: `annual-${schedule.id}-preparation`, title: `${schedule.projectName} · 업무준비 시작`,
      startDate: schedule.preparationStartDate, endDate: schedule.preparationStartDate,
    }] : [];
    const milestones = (schedule.milestones || []).filter((item) => item.date).map((item) => ({
      ...common, id: `annual-${schedule.id}-${item.id}`, title: `${schedule.projectName} · ${item.label}`,
      startDate: item.date, endDate: item.date,
    }));
    return [...preparation, ...milestones];
  });
}

export function eventsForCalendarDay(events: CalendarEventWithLane[], date: string): CalendarEventWithLane[] {
  return events.filter((event) => event.startDate <= date && event.endDate >= date).sort((a, b) => a.lane - b.lane);
}
