import type { WorkCalendarEvent } from "@/types";

export type CalendarDay = { date: string; day: number; inMonth: boolean };
export type CalendarEventWithLane = WorkCalendarEvent & { id: string; lane: number };

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

export function assignCalendarEventLanes(events: (WorkCalendarEvent & { id: string })[]): CalendarEventWithLane[] {
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

export function eventsForCalendarDay(events: CalendarEventWithLane[], date: string): CalendarEventWithLane[] {
  return events.filter((event) => event.startDate <= date && event.endDate >= date).sort((a, b) => a.lane - b.lane);
}
