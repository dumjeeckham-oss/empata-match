import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { WeeklySchedulePicker } from "@/components/WeeklySchedulePicker";

afterEach(() => vi.restoreAllMocks());

describe("서비스 시간 전체 초기화", () => {
  it("확인하면 1안과 2안 모두 빈 시간표로 변경한다", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onChange = vi.fn();
    render(<WeeklySchedulePicker value={[{ day: "월", slots: [1], alternativeSlots: [2] }]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "시간 전체 초기화" }));
    expect(onChange).toHaveBeenCalledWith([]);
  });
  it("취소하면 변경하지 않고 읽기 전용 화면에는 버튼을 표시하지 않는다", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const onChange = vi.fn();
    const value = [];
    const view = render(<WeeklySchedulePicker value={value} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "시간 전체 초기화" }));
    expect(onChange).not.toHaveBeenCalled();
    view.rerender(<WeeklySchedulePicker value={value} onChange={onChange} readOnly />);
    expect(screen.queryByRole("button", { name: "시간 전체 초기화" })).toBeNull();
  });
});
