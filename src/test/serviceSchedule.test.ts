import { describe, expect, it } from "vitest";
import {
  findAssignmentScheduleConflict,
  formatServiceScheduleOverview,
  formatUserServiceScheduleOverview,
  getMissingAssignmentScheduleIds,
} from "@/lib/serviceSchedule";

describe("assignment service schedule validation", () => {
  it("같은 이용자의 두 지원사가 같은 요일·시간을 제공하면 중복으로 판정한다", () => {
    expect(findAssignmentScheduleConflict(["a", "b"], {
      a: [{ day: "월", slots: [18, 19, 20] }],
      b: [{ day: "월", slots: [20, 21] }],
    })).toEqual({ firstWorkerId: "a", secondWorkerId: "b", day: "월", startTime: "10:00", endTime: "10:30" });
  });

  it("요일이나 시간이 다르면 중복이 아니다", () => {
    expect(findAssignmentScheduleConflict(["a", "b"], {
      a: [{ day: "월", slots: [18, 19] }],
      b: [{ day: "화", slots: [18, 19] }],
    })).toBeNull();
  });

  it("1:다에서는 시간표가 비어 있는 지원사를 찾는다", () => {
    expect(getMissingAssignmentScheduleIds(["a", "b"], { a: [{ day: "월", slots: [18] }], b: [] })).toEqual(["b"]);
    expect(getMissingAssignmentScheduleIds(["a"], {})).toEqual([]);
  });

  it("같은 평일 시간대를 이용자 명단용 한 줄 요약으로 묶는다", () => {
    const schedule = ["월", "화", "수", "목", "금"].map((day) => ({
      day: day as "월" | "화" | "수" | "목" | "금",
      slots: [16, 17, 30, 31, 32, 33, 34, 35],
    }));
    expect(formatServiceScheduleOverview(schedule)).toBe("월-금, 08:00-09:00, 15:00-18:00");
  });

  it("1:다 현재 지원사들의 제공시간을 합쳐 요약한다", () => {
    expect(formatUserServiceScheduleOverview({
      assignedHelperIds: ["a", "b"],
      assignmentSchedules: {
        a: [{ day: "월", slots: [18, 19] }, { day: "수", slots: [18, 19] }],
        b: [{ day: "화", slots: [26, 27] }, { day: "목", slots: [26, 27] }],
      },
      weeklySchedule: [],
      requiredDays: "",
      requiredHours: "",
    })).toBe("월·수, 09:00-10:00 / 화·목, 13:00-14:00");
  });

  it("시간표가 없으면 기존 필요 요일과 시간을 표시한다", () => {
    expect(formatServiceScheduleOverview([], "월~금", "09:00~13:00")).toBe("월~금, 09:00~13:00");
  });
});
