import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ServiceUser, Worker } from "@/types";
import { WorkerScheduleOverview } from "@/components/WorkerScheduleOverview";

afterEach(cleanup);

describe("활동지원사 시간표", () => {
  it("재직자의 여러 이용자 시간을 이름과 함께 표시한다", () => {
    const worker = { id: "w", contractStatus: "근무중", assignedUserIds: ["a", "b"] } as Worker & { id: string };
    const users = [
      { id: "a", name: "이용자 A", contractStatus: "서비스중", assignedHelperIds: ["w"], assignmentSchedules: { w: [{ day: "월", slots: [18] }] } },
      { id: "b", name: "이용자 B", contractStatus: "서비스중", assignedHelperIds: ["w"], assignmentSchedules: { w: [{ day: "월", slots: [19] }] } },
    ] as unknown as (ServiceUser & { id: string })[];
    render(<WorkerScheduleOverview worker={worker} users={users} />);
    expect(screen.getByText("현재 이용자별 활동시간")).toBeInTheDocument();
    expect(screen.getByTitle("월 09:00: 이용자 A")).toBeInTheDocument();
    expect(screen.getByTitle("월 09:30: 이용자 B")).toBeInTheDocument();
  });
  it("대기자는 희망시간을 표시하고 불완전한 배정은 빈 시간으로 단정하지 않는다", () => {
    const worker = { id: "w", contractStatus: "대기", assignedUserIds: [], weeklySchedule: [{ day: "화", slots: [18], alternativeSlots: [19] }] } as Worker & { id: string };
    const view = render(<WorkerScheduleOverview worker={worker} users={[]} />);
    expect(screen.getByTitle("화 09:00: 희망시간 1안")).toBeInTheDocument();
    expect(screen.getByTitle("화 09:30: 희망시간 2안")).toBeInTheDocument();
    view.rerender(<WorkerScheduleOverview worker={{ ...worker, assignedUserIds: ["missing"] }} users={[]} />);
    expect(screen.getByText(/빈 칸을 근무 가능 시간으로 판단하지 말고/)).toBeInTheDocument();
  });
});
