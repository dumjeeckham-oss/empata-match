import { describe, expect, it } from "vitest";
import { findAssignmentScheduleConflict, getMissingAssignmentScheduleIds } from "@/lib/serviceSchedule";

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
});
