import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import PublicEventForm from "@/pages/PublicEventForm";

const api = vi.hoisted(() => ({ getPublic: vi.fn(async () => ({
  id: "slot-1", title: "접근성 폼", description: "설명", status: "open", roundId: "round-1", versionId: "version-1",
  completionMessage: "완료", duplicatePolicy: "none",
  fields: [
    { id: "name", type: "name", title: "이름", description: "실명을 입력하세요", required: true, visible: true, order: 0 },
    { id: "choice", type: "multipleChoice", title: "선택", required: true, visible: true, order: 1, options: [{ id: "a", label: "항목 A", enabled: true, order: 0 }] },
    { id: "consent", type: "consent", title: "개인정보 동의", required: true, consentRequired: true, consentText: "동의합니다", visible: true, order: 2 },
    { id: "address", type: "address", title: "주소", required: true, visible: true, order: 3 },
  ],
})) }));

vi.mock("@/lib/eventFormSparkApi", () => ({ eventFormApi: { getPublic: api.getPublic, submit: vi.fn() }, loadEventFormImageData: vi.fn() }));

describe("공개 행사 폼 접근성", () => {
  it("모든 입력을 제목·도움말·오류와 연결하고 첫 오류 입력에 포커스한다", async () => {
    render(<MemoryRouter initialEntries={["/forms/token"]}><Routes><Route path="/forms/:token" element={<PublicEventForm />} /></Routes></MemoryRouter>);
    const name = await screen.findByRole("textbox", { name: /이름/ });
    expect(name).toHaveAttribute("required");
    expect(name.getAttribute("aria-describedby")).toContain("help");

    fireEvent.click(screen.getByRole("button", { name: "신청서 제출" }));
    await waitFor(() => expect(name).toHaveFocus());
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name.getAttribute("aria-describedby")).toContain("error");
    expect(screen.getAllByText("필수 문항입니다.")[0]).toHaveAttribute("role", "alert");

    expect(screen.getByRole("checkbox", { name: "항목 A" })).toHaveAttribute("id");
    expect(screen.getByRole("checkbox", { name: /개인정보 동의/ })).toHaveAttribute("id");
    expect(screen.getByRole("textbox", { name: "상세주소" })).toHaveAttribute("id");
  });
});
