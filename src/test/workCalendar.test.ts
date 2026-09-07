import { describe, expect, it } from "vitest";
import { annualSchedulesToCalendarEvents, assignCalendarEventLanes, buildMonthGrid, eventsForCalendarDay, moveCalendarEvent, resizeCalendarEvent } from "@/lib/workCalendar";
import type { WorkCalendarEvent } from "@/types";

const event = (id: string, title: string, startDate: string, endDate: string): WorkCalendarEvent & { id: string } => ({
  id, title, startDate, endDate, note: "", color: "blue",
});

describe("work calendar", () => {
  it("builds a six-week Sunday-first month grid", () => {
    const days = buildMonthGrid(2026, 8);
    expect(days).toHaveLength(42);
    expect(days[0].date).toBe("2026-08-30");
    expect(days.some((day) => day.date === "2026-09-30" && day.inMonth)).toBe(true);
  });

  it("puts overlapping schedules on separate colored lines", () => {
    const laidOut = assignCalendarEventLanes([
      event("a", "첫 일정", "2026-09-03", "2026-09-07"),
      event("b", "겹친 일정", "2026-09-05", "2026-09-06"),
      event("c", "다음 일정", "2026-09-08", "2026-09-09"),
    ]);

    expect(laidOut.find((item) => item.id === "a")?.lane).toBe(0);
    expect(laidOut.find((item) => item.id === "b")?.lane).toBe(1);
    expect(laidOut.find((item) => item.id === "c")?.lane).toBe(0);
    expect(eventsForCalendarDay(laidOut, "2026-09-05").map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("turns annual preparation and milestone dates into linked calendar events", () => {
    const events = annualSchedulesToCalendarEvents([{
      id: "schedule-1", projectName: "안전 조사", status: "진행중", preparationStartDate: "2026-09-02",
      milestones: [{ id: "plan", label: "기안 작성", date: "2026-09-05" }],
      scheduleDate: "", note: "준비", manager: "김담당",
    }]);
    expect(events.map((item) => item.startDate)).toEqual(["2026-09-02", "2026-09-05"]);
    expect(events.every((item) => item.source === "annual" && item.color === "green")).toBe(true);
    expect(events[1].title).toContain("기안 작성");
  });

  it("moves an event while preserving its duration", () => {
    expect(moveCalendarEvent(event("a", "이동", "2026-09-03", "2026-09-05"), "2026-09-04", "2026-09-10"))
      .toEqual({ startDate: "2026-09-09", endDate: "2026-09-11" });
  });

  it("resizes either edge without reversing the date range", () => {
    const item = event("a", "조절", "2026-09-03", "2026-09-05");
    expect(resizeCalendarEvent(item, "start", "2026-09-01")).toEqual({ startDate: "2026-09-01", endDate: "2026-09-05" });
    expect(resizeCalendarEvent(item, "end", "2026-09-08")).toEqual({ startDate: "2026-09-03", endDate: "2026-09-08" });
    expect(resizeCalendarEvent(item, "start", "2026-09-10")).toEqual({ startDate: "2026-09-05", endDate: "2026-09-05" });
  });
});
