import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const authState = vi.hoisted(() => ({ value: { user: null as { uid: string; getIdTokenResult: () => Promise<{ claims: { role: string } }> } | null, loading: true } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authState.value }));
vi.mock("@/lib/counselingHandwritingApi", () => ({ handwritingApi: { subscribePending: vi.fn(() => vi.fn()) }, handwritingError: () => "오류" }));
import { CounselingHandwritingEntry } from "@/components/CounselingHandwritingEntry";
afterEach(cleanup);
it("인증 로딩 후 PC 이어보기 자동 열림을 유지한다", async () => {
  authState.value = { user: null, loading: true };
  const view = render(<CounselingHandwritingEntry targetType="이용자" targetId="fake" targetName="합성 대상" autoOpen />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  authState.value = { user: { uid: "fake-staff", getIdTokenResult: async () => ({ claims: { role: "social_worker" } }) }, loading: false };
  view.rerender(<CounselingHandwritingEntry targetType="이용자" targetId="fake" targetName="합성 대상" autoOpen />);
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
});
