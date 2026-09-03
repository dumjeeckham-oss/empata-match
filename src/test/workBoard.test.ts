import { describe, expect, it } from "vitest";
import { formatScheduleSummary, shouldAutoRemoveMatchingItem } from "@/lib/workBoard";
import type { MatchingBoardItem, ServiceUser } from "@/types";

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
});
