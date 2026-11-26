import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DatePartsInput } from "@/components/DatePartsInput";

describe("날짜 분리 입력", () => {
  it("연도, 월, 일을 순서대로 입력해 유효한 날짜를 전달한다", () => {
    const onChange = vi.fn();
    render(<DatePartsInput label="생년월일" value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("생년월일 년"), { target: { value: "1990" } });
    fireEvent.change(screen.getByLabelText("생년월일 월"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("생년월일 일"), { target: { value: "3" } });
    expect(onChange).toHaveBeenLastCalledWith("1990-02-03");
  });
  it("존재하지 않는 날짜를 저장값으로 전달하지 않는다", () => {
    const onChange = vi.fn();
    render(<DatePartsInput label="접수일" value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("접수일 년"), { target: { value: "2026" } });
    fireEvent.change(screen.getByLabelText("접수일 월"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("접수일 일"), { target: { value: "31" } });
    expect(onChange).toHaveBeenLastCalledWith("");
  });
});
