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
});
