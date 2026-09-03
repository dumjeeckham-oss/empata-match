import { describe, expect, it } from "vitest";
import { formatScheduleMilestones, formatScheduleSummary, getBoardRecommendations, getScheduleStartInfo, getVisibleScheduleStarts, shouldAutoRemoveMatchingItem } from "@/lib/workBoard";
import type { MatchingBoardItem, ServiceUser, Worker } from "@/types";

const boardItem: MatchingBoardItem = {
  targetType: "이용자",
  targetId: "user-1",
  targetName: "홍길동",
  condition: "오후 추가 매칭",
  matchMode: "1:다",
  existingAssignmentCount: 1,
};

const user = {
  id: "user-1",
  contractStatus: "서비스중",
  assignedHelperIds: ["worker-1"],
} as ServiceUser & { id: string };

describe("work board matching modes", () => {
  it("keeps an active 1:many target until an additional assignment is made", () => {
    expect(shouldAutoRemoveMatchingItem(boardItem, user)).toBe(false);
    expect(shouldAutoRemoveMatchingItem(boardItem, { ...user, assignedHelperIds: ["worker-1", "worker-2"] })).toBe(true);
  });

  it("keeps the legacy 1:1 completion behavior", () => {
    expect(shouldAutoRemoveMatchingItem({ ...boardItem, matchMode: "1:1" }, user)).toBe(true);
  });

  it("formats contiguous half-hour slots for overlap checking", () => {
    expect(formatScheduleSummary([{ day: "월", slots: [20, 21, 22, 23] }])).toBe("월 10:00~12:00");
  });

  it("shows a readable annual schedule start date and countdown", () => {
    const info = getScheduleStartInfo("2026/07/13 → 2026/07/17", new Date(2026, 6, 3));
    expect(info?.displayDate).toBe("2026년 7월 13일 (월)");
    expect(info?.relativeLabel).toBe("D-10");
  });

  it("rejects invalid annual schedule dates", () => {
    expect(getScheduleStartInfo("2026/02/30")).toBeNull();
  });

  it("sorts by preparation start date and excludes completed schedules", () => {
    const schedules = getVisibleScheduleStarts([
      { projectName: "완료 사업", status: "완료", preparationStartDate: "2026-01-01", scheduleDate: "2026/02/01", note: "", manager: "A" },
      { projectName: "두 번째", status: "예정", preparationStartDate: "2026-06-01", scheduleDate: "2026/07/01", note: "", manager: "B" },
      { projectName: "첫 번째", status: "진행중", preparationStartDate: "2026-05-01", scheduleDate: "2026/06/01", note: "", manager: "C" },
    ]);

    expect(schedules.map((schedule) => schedule.projectName)).toEqual(["첫 번째", "두 번째"]);
  });

  it("formats freely named annual schedule milestones", () => {
    expect(formatScheduleMilestones({
      projectName: "조사 사업", status: "예정", scheduleDate: "", note: "", manager: "담당자",
      milestones: [
        { id: "1", label: "사업계획", date: "2026-01-10" },
        { id: "2", label: "평가", date: "2026-03-20" },
      ],
    })).toBe("사업계획 2026-01-10 / 평가 2026-03-20");
  });

  it("recommends the top three waiting workers for a user", () => {
    const target = { id: "u1", name: "이용자", contractStatus: "대기", requiredDays: "월", requiredHours: "09:00" } as ServiceUser & { id: string };
    const workers = [1, 2, 3, 4].map((number) => ({
      id: `w${number}`, name: `지원사${number}`, contractStatus: "대기", availableDays: "월", availableHours: "09:00",
      preferredArea: "", rejectionTypes: [],
    })) as (Worker & { id: string })[];
    const recommendations = getBoardRecommendations({ ...boardItem, targetId: "u1" }, [target], workers);
    expect(recommendations).toHaveLength(3);
    expect(recommendations.every((item) => item.targetType === "활동지원사")).toBe(true);
  });

  it("recommends only waiting users for a worker", () => {
    const worker = {
      id: "w1", name: "활동지원사", contractStatus: "대기", availableDays: "월", availableHours: "09:00",
      preferredArea: "", rejectionTypes: [],
    } as Worker & { id: string };
    const users = [
      { id: "u1", name: "대기 이용자", contractStatus: "대기", requiredDays: "월", requiredHours: "09:00" },
      { id: "u2", name: "서비스 이용자", contractStatus: "서비스중", requiredDays: "월", requiredHours: "09:00" },
    ] as (ServiceUser & { id: string })[];

    const recommendations = getBoardRecommendations({ ...boardItem, targetType: "활동지원사", targetId: "w1" }, users, [worker]);

    expect(recommendations.map((item) => item.name)).toEqual(["대기 이용자"]);
    expect(recommendations[0].targetType).toBe("이용자");
  });
});
