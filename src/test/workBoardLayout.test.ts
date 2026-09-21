import { describe, expect, it } from "vitest";
import { moveWorkBoardWidget, normalizeWorkBoardOrder, WORK_BOARD_WIDGET_IDS } from "@/lib/workBoardLayout";
import { getWorkBoardPreferencesCollection } from "@/lib/collectionNames";

describe("work board layout", () => {
  it("저장된 순서를 유지하면서 새 위젯과 잘못된 값을 안전하게 정규화한다", () => {
    expect(normalizeWorkBoardOrder(["calendar", "todos", "invalid", "calendar"])).toEqual([
      "calendar", "todos", "scheduleStarts", "quickLinks", "matching", "annualSchedules",
    ]);
  });

  it("로그인 UID마다 서로 다른 설정 경로를 사용한다", () => {
    expect(getWorkBoardPreferencesCollection("account-a")).toBe("userPreferences/account-a/workBoard");
    expect(getWorkBoardPreferencesCollection("account-b")).not.toBe(getWorkBoardPreferencesCollection("account-a"));
  });

  it("드래그한 위젯을 대상 위치 앞으로 이동한다", () => {
    expect(moveWorkBoardWidget([...WORK_BOARD_WIDGET_IDS], "annualSchedules", "calendar")).toEqual([
      "todos", "scheduleStarts", "annualSchedules", "calendar", "quickLinks", "matching",
    ]);
  });
});
