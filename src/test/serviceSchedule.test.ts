import { describe, expect, it } from "vitest";
import type { ServiceUser, Worker } from "@/types";
import {
  findAssignmentScheduleConflict,
  formatServiceScheduleOverview,
  formatUserServiceScheduleOverview,
  getMissingAssignmentScheduleIds,
  getWorkerServiceSchedules,
} from "@/lib/serviceSchedule";

describe("assignment service schedule validation", () => {
  it("1:다 배정에서도 해당 지원사의 이용자별 시간을 분리해서 읽는다", () => {
    const worker = { id: "w1", assignedUserIds: ["u1", "u2"], assigned_users: ["u1", "u2"] } as Worker & { id: string };
    const users = [
      { id: "u1", name: "첫 이용자", contractStatus: "서비스중", assignedHelperIds: ["w1", "w2"], assignmentSchedules: { w1: [{ day: "월", slots: [18] }], w2: [{ day: "화", slots: [20] }] } },
      { id: "u2", name: "둘째 이용자", contractStatus: "서비스중", assignedHelperIds: ["w1"], assignmentSchedules: { w1: [{ day: "수", slots: [22], alternativeSlots: [23] }] } },
    ] as unknown as (ServiceUser & { id: string })[];
    const result = getWorkerServiceSchedules(worker, users);
    expect(result.map(({ userId, schedule, linked }) => ({ userId, schedule, linked }))).toEqual([
      { userId: "u1", schedule: [{ day: "월", slots: [18] }], linked: true },
      { userId: "u2", schedule: [{ day: "수", slots: [22], alternativeSlots: [23] }], linked: true },
    ]);
    users[0].assignmentSchedules!.w1 = [{ day: "금", slots: [16] }];
    expect(getWorkerServiceSchedules(worker, users)[0].schedule).toEqual([{ day: "금", slots: [16] }]);
  });
  it("배정이 불일치하거나 1:다에서 지원사별 시간이 없으면 다른 시간표를 실제 시간으로 표시하지 않는다", () => {
    const worker = { id: "w1", assignedUserIds: ["u1", "u2"] } as Worker & { id: string };
    const users = [
      { id: "u1", name: "첫 이용자", contractStatus: "서비스중", assignedHelperIds: ["w1", "w2"], weeklySchedule: [{ day: "월", slots: [18] }] },
      { id: "u2", name: "둘째 이용자", contractStatus: "서비스중", assignedHelperIds: ["w2"], weeklySchedule: [{ day: "화", slots: [20] }] },
    ] as unknown as (ServiceUser & { id: string })[];
    const result = getWorkerServiceSchedules(worker, users);
    expect(result[0]).toMatchObject({ linked: true, schedule: undefined, source: "missing" });
    expect(result[1]).toMatchObject({ linked: false, schedule: undefined });
  });
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
