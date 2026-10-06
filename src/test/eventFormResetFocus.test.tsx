import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EventFormResetPanel } from "@/components/EventFormResetPanel";
import type { EventFormSlot } from "@/types/eventForms";

vi.mock("@/lib/eventFormSparkApi", () => ({ eventFormApi: { setStatus: vi.fn() } }));
vi.mock("@/lib/eventFormResetApi", () => ({
  exportAllEventFormRounds: vi.fn(),
  resetEventForm: vi.fn(),
  loadEventFormResetSummary: vi.fn(async () => ({
    count: 0,
    estimatedBytes: 0,
    groups: [{ snapshot: { docs: [] } }],
    form: {},
  })),
}));

const form: EventFormSlot = {
  id: "slot-1", ownerUid: "admin", title: "입력폼 1", description: "", location: "", completionMessage: "완료",
  status: "closed", duplicatePolicy: "none", activeRoundId: "round-1",
};

describe("완전 초기화 모달 포커스", () => {
  it("Enter로 열고 Escape 또는 취소로 닫으면 실행 버튼으로 포커스가 복귀한다", async () => {
    render(<EventFormResetPanel form={form} admin onComplete={vi.fn(async () => undefined)} />);
    const trigger = await screen.findByRole("button", { name: "완전 초기화" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter" });
    fireEvent.click(trigger);
    expect(await screen.findByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
    fireEvent.keyDown(document.activeElement || document.body, { key: "Escape" });
    await waitFor(() => expect(trigger).toHaveFocus());

    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole("button", { name: "취소" }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
