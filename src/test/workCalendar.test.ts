import { describe, expect, it } from "vitest";
import { assignCalendarEventLanes, buildMonthGrid, eventsForCalendarDay } from "@/lib/workCalendar";
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
});
