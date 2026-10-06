import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicEventFormPayload } from "@/types/eventForms";

const apiMocks = vi.hoisted(() => ({
  getPublic: vi.fn(),
  submit: vi.fn(),
}));

vi.mock("@/lib/eventFormSparkApi", () => ({
  eventFormApi: apiMocks,
}));
vi.mock("@/components/EventFormImage", () => ({ EventFormImage: () => null }));

import PublicEventForm from "@/pages/PublicEventForm";

const openForm: PublicEventFormPayload = {
  formId: "form-1",
  roundId: "round-1",
  versionId: "version-1",
  title: "공개 행사 신청",
  description: "",
  completionMessage: "완료",
  status: "open",
  fields: [],
  duplicatePolicy: "none",
};

describe("공개 행사 폼 다시 시도", () => {
  beforeEach(() => {
    apiMocks.getPublic.mockReset();
    apiMocks.submit.mockReset();
  });

  it("익명 로그인 오류 원문을 숨기고 다시 시도하면 정상 폼을 표시한다", async () => {
    apiMocks.getPublic
      .mockRejectedValueOnce(Object.assign(new Error("Firebase: Error (auth/operation-not-allowed)."), { code: "auth/operation-not-allowed" }))
      .mockResolvedValueOnce(openForm);

    render(<MemoryRouter initialEntries={["/forms/public-token"]}><Routes><Route path="/forms/:token" element={<PublicEventForm />} /></Routes></MemoryRouter>);

    expect(await screen.findByText("현재 신청 서비스를 준비 중입니다. 관리자에게 문의해 주세요.")).toBeInTheDocument();
    expect(screen.queryByText(/Firebase: Error/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByRole("heading", { name: "공개 행사 신청" })).toBeInTheDocument();
    expect(apiMocks.getPublic).toHaveBeenCalledTimes(2);
  });
  it("여러 줄 상세설명을 표시하고 필수 공백 제출 시 해당 질문으로 이동한다", async () => {
    apiMocks.getPublic.mockResolvedValue({ ...openForm, description: "첫 줄\n둘째 줄", fields: [
      { id: "required", type: "shortText", title: "연락 방법", description: "상세 첫 줄\n상세 둘째 줄", required: true, visible: true, order: 0 },
      { id: "optional", type: "shortText", title: "선택 질문", description: "", required: false, visible: true, order: 1 },
    ] });
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    render(<MemoryRouter initialEntries={["/forms/synthetic"]}><Routes><Route path="/forms/:token" element={<PublicEventForm />} /></Routes></MemoryRouter>);
    expect(await screen.findByText("상세 첫 줄 상세 둘째 줄")).toHaveClass("whitespace-pre-wrap");
    const inputs = screen.getAllByRole("textbox");
    fireEvent.change(inputs[0], { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "신청서 제출" }));
    expect(apiMocks.submit).not.toHaveBeenCalled();
    expect(scroll).toHaveBeenCalled();
    expect(document.activeElement).toHaveAttribute("data-question-id", "required");
  });
});
