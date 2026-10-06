import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const forms = [1, 2].map((slotNumber) => ({ id: `form-${slotNumber}`, slotNumber, title: `가짜 행사 ${slotNumber}`, description: "첫 줄\n둘째 줄", publicToken: `synthetic-token-${slotNumber}`, status: "draft" }));
vi.mock("@/lib/firebase", () => ({ usingFirebaseEmulators: true, auth: { currentUser: { getIdTokenResult: async () => ({ claims: { role: "social_worker" } }) } } }));
vi.mock("@/lib/eventFormSparkApi", () => ({ listEventForms: async () => forms, eventFormApi: {} }));
vi.mock("@/lib/eventFormResetApi", () => ({ loadEventFormSlotRegistry: async () => forms.map((form) => ({ slotNumber: form.slotNumber, formId: form.id })), linkExistingEventForm: vi.fn() }));
vi.mock("@/components/EventFormResetPanel", () => ({ EventFormResetPanel: ({ admin }: { admin: boolean }) => <span>{admin ? "관리자 위험 영역" : "전담사회복지사 결과 확인"}</span> }));
import EventForms from "@/pages/EventForms";

describe("고정 2개 슬롯 관리 화면", () => {
  it("서로 다른 링크의 카드 2개만 표시하며 사회복지사에게 위험 영역을 넘기지 않는다", async () => {
    render(<MemoryRouter><EventForms /></MemoryRouter>);
    expect(await screen.findByText("입력폼 1 · 가짜 행사 1")).toBeInTheDocument();
    expect(screen.getByText("입력폼 2 · 가짜 행사 2")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "고정 주소 복사" })).toHaveLength(2);
    expect(screen.queryByText("관리자 위험 영역")).not.toBeInTheDocument();
    expect(screen.queryByText(/입력폼 3/)).not.toBeInTheDocument();
    expect(screen.getByText(/forms\/synthetic-token-1/)).toHaveClass("break-all");
    expect(screen.getByText(/forms\/synthetic-token-2/)).toBeInTheDocument();
  });
});
