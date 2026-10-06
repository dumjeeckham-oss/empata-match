import { cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";

const session = vi.hoisted(() => ({ user: null as User | null }));
const service = vi.hoisted(() => ({ save: vi.fn(), subscribePending: vi.fn((receive: (items: never[]) => void) => { receive([]); return vi.fn(); }) }));
vi.mock("@/lib/firebase", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/firebase")>(),
  onAuthStateChanged: (_auth: unknown, receive: (user: User | null) => void) => { receive(session.user); return vi.fn(); },
}));
vi.mock("@/lib/counselingHandwritingApi", () => ({ handwritingApi: service, handwritingError: () => "오류" }));
vi.mock("@/hooks/useFirestore", () => ({ useCollection: (name: string) => ({ data: name === "users" ? [{ id: "a", name: "합성 A" }] : [], loading: false, error: null, add: vi.fn() }) }));
vi.mock("@/components/SpellCheckButton", () => ({ SpellCheckButton: () => null }));
vi.mock("@/components/Layout", () => ({ default: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/pages/Login", () => ({ default: () => <p>로그인 필요</p> }));
vi.mock("@/pages/Dashboard", () => ({ default: () => null }));
vi.mock("@/pages/WorkBoard", () => ({ default: () => null }));
vi.mock("@/pages/UserManagement", () => ({ default: () => null }));
vi.mock("@/pages/WorkerManagement", () => ({ default: () => null }));
vi.mock("@/pages/Matching", () => ({ default: () => null }));
vi.mock("@/pages/Terminations", () => ({ default: () => null }));
vi.mock("@/pages/Handovers", () => ({ default: () => null }));
vi.mock("@/pages/Manual", () => ({ default: () => null }));
vi.mock("@/pages/WaitingLedger", () => ({ default: () => null }));
vi.mock("@/pages/SalaryChanges", () => ({ default: () => null }));
vi.mock("@/pages/NotFound", () => ({ default: () => null }));
import App from "@/App";
import { useAuth } from "@/hooks/useAuth";
import { CounselingHandwritingEntry } from "@/components/CounselingHandwritingEntry";

function user(role: string) {
  return { uid: "synthetic-staff", getIdTokenResult: vi.fn(async () => ({ claims: { role } })) } as unknown as User;
}
function openForm() {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "+ 상담기록 작성" }));
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
  session.user = user("social_worker");
  window.location.hash = "#/counseling";
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("AUTH-1: 실제 원격 useAuth는 role 없는 contract를 유지한다", () => {
  const { result } = renderHook(() => useAuth());
  expect(result.current.user).toBe(session.user);
  expect(result.current.loading).toBe(false);
  expect(result.current).not.toHaveProperty("role");
});
it.each(["admin", "social_worker"])("AUTH-2: 실제 App/router/useAuth에서 %s 대상 선택 후 Entry 표시", async role => {
  session.user = user(role);
  openForm();
  fireEvent.click(screen.getByRole("option", { name: /합성 A/ }));
  expect(await screen.findByRole("button", { name: "✏️ 손글씨 메모" })).toBeEnabled();
  expect(session.user.getIdTokenResult).toHaveBeenCalled();
});
it("AUTH-3: 실제 신규 상담 대상 미선택은 비활성이며 저장 없음", async () => {
  openForm();
  const button = screen.getByRole("button", { name: "✏️ 손글씨 메모" });
  expect(button).toBeDisabled();
  fireEvent.click(button);
  await waitFor(() => expect(service.subscribePending).toHaveBeenCalled());
  expect(service.save).not.toHaveBeenCalled();
});
it("AUTH-4: 미로그인은 실제 App과 독립 Entry 모두 진입 불가", () => {
  session.user = null;
  render(<App />);
  expect(screen.getByText("로그인 필요")).toBeInTheDocument();
  render(<CounselingHandwritingEntry targetType="이용자" targetId="a" targetName="합성 A" autoOpen />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(service.subscribePending).not.toHaveBeenCalled();
});
it("AUTH-5: App 로그인 guard를 유지하면서 비직원의 손글씨 진입은 차단", async () => {
  session.user = user("viewer");
  openForm();
  fireEvent.click(screen.getByRole("option", { name: /합성 A/ }));
  await waitFor(() => expect(session.user?.getIdTokenResult).toHaveBeenCalled());
  expect(screen.queryByRole("button", { name: "✏️ 손글씨 메모" })).not.toBeInTheDocument();
  expect(service.subscribePending).not.toHaveBeenCalled();
  expect(service.save).not.toHaveBeenCalled();
});
it("claim 조회 실패는 손글씨 진입을 허용하지 않는다", async () => {
  session.user = { ...user("admin"), getIdTokenResult: vi.fn().mockRejectedValue(new Error("offline")) };
  render(<CounselingHandwritingEntry targetType="이용자" targetId="a" targetName="합성 A" />);
  await waitFor(() => expect(session.user?.getIdTokenResult).toHaveBeenCalled());
  expect(screen.queryByRole("button", { name: "✏️ 손글씨 메모" })).not.toBeInTheDocument();
  expect(service.subscribePending).not.toHaveBeenCalled();
});
