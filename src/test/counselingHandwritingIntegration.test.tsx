import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearAllHandwritingDrafts, getTargetHandwritingDrafts, type HandwritingMemo } from "@/lib/counselingHandwriting";

const service = vi.hoisted(() => ({ save: vi.fn(), subscribe: vi.fn(), subscribePending: vi.fn(), add: vi.fn(), server: new Map<string, HandwritingMemo>() }));
const loggedInUser = vi.hoisted(() => ({ uid: "synthetic-staff", getIdTokenResult: vi.fn(async () => ({ claims: { role: "social_worker" } })) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: loggedInUser, loading: false }) }));
vi.mock("@/hooks/useFirestore", () => ({ useCollection: (name: string) => ({
  data: name === "users" ? [{ id: "a", name: "합성 A" }, { id: "b", name: "합성 B" }] : name === "workers" ? [{ id: "w", name: "합성 지원사" }] : [],
  loading: false, error: null, add: service.add,
}) }));
vi.mock("@/components/SpellCheckButton", () => ({ SpellCheckButton: () => null }));
vi.mock("@/lib/counselingHandwritingApi", () => ({ handwritingApi: service, handwritingError: () => "합성 오류" }));
import Counseling from "@/pages/Counseling";

beforeEach(() => {
  vi.clearAllMocks();
  clearAllHandwritingDrafts();
  service.server.clear();
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("PointerEvent", MouseEvent);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ width: 1600, height: 1000, left: 0, top: 0, right: 1600, bottom: 1000, x: 0, y: 0, toJSON() {} });
  Element.prototype.scrollIntoView = vi.fn();
  HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
  HTMLCanvasElement.prototype.hasPointerCapture = () => false;
  service.save.mockImplementation(async (memo: HandwritingMemo, strokesJson: string) => {
    service.server.set(memo.id, { ...memo, strokesJson, revision: memo.revision + 1 });
    return memo.revision + 1;
  });
  service.subscribe.mockImplementation(() => vi.fn());
  service.subscribePending.mockImplementation((receive, _fail, target) => {
    receive([...service.server.values()].filter(memo => !target || (memo.targetType === target.type && memo.targetId === target.id)));
    return vi.fn();
  });
});
afterEach(() => { cleanup(); clearAllHandwritingDrafts(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function newForm() {
  render(<Counseling />);
  fireEvent.click(screen.getByRole("button", { name: "+ 상담기록 작성" }));
  return screen.getByRole("dialog");
}
function selectTarget(name = "합성 A") { fireEvent.click(screen.getByRole("option", { name: new RegExp(name) })); }
async function openBoard() {
  fireEvent.click(await screen.findByRole("button", { name: "✏️ 손글씨 메모" }));
  fireEvent.click(await screen.findByRole("button", { name: "새 상담의 손글씨 시작" }));
  return screen.findByRole("img", { name: "임시 손글씨 필기 영역" });
}
async function closeBoard() {
  fireEvent.click(screen.getByRole("button", { name: "닫기" }));
  await waitFor(() => expect(screen.queryByRole("img", { name: "임시 손글씨 필기 영역" })).not.toBeInTheDocument());
}

it("UI-1: 대상 미선택은 비활성 진입점이며 draft와 저장이 없다", async () => {
  newForm();
  const entry = screen.getByRole("button", { name: "✏️ 손글씨 메모" });
  expect(entry).toBeDisabled(); fireEvent.click(entry);
  await waitFor(() => expect(service.subscribePending).toHaveBeenCalled());
  expect(service.save).not.toHaveBeenCalled();
  expect(service.subscribe).not.toHaveBeenCalled();
  expect(service.subscribePending.mock.calls.every(call => call[2] === undefined)).toBe(true);
  expect(getTargetHandwritingDrafts("synthetic-staff", "user:")).toEqual([]);
  expect(screen.queryByRole("img", { name: "임시 손글씨 필기 영역" })).not.toBeInTheDocument();
});
it("UI-2: 대상 선택 후 기존 진입점을 활성화한다", async () => {
  newForm(); selectTarget();
  expect(await screen.findByRole("button", { name: "✏️ 손글씨 메모" })).toBeEnabled();
  expect(service.save).not.toHaveBeenCalled();
});
it("UI-3: 실제 Whiteboard와 hook에 선택한 유형/ID/이름을 전달한다", async () => {
  newForm(); selectTarget(); const canvas = await openBoard();
  expect(screen.getByText(/합성 A · 이용자/)).toBeInTheDocument();
  fireEvent.pointerDown(canvas, { button: 0, clientX: 10, clientY: 10 });
  await closeBoard();
  expect(service.save.mock.calls[0][0]).toMatchObject({ targetType: "이용자", targetId: "a", targetKey: "user:a", counselingRecordId: "" });
});
it("UI-4: 닫기 후 이어보기에서 동일 draft와 필기를 유지한다", async () => {
  newForm(); selectTarget(); const canvas = await openBoard();
  fireEvent.pointerDown(canvas, { button: 0, clientX: 10, clientY: 10 });
  await closeBoard();
  const original = service.save.mock.calls[0][0] as HandwritingMemo;
  fireEvent.click(await screen.findByRole("button", { name: "✏️ 손글씨 메모" }));
  fireEvent.click(await screen.findByRole("button", { name: /이어보기/ }));
  await screen.findByRole("img", { name: "임시 손글씨 필기 영역" });
  expect(service.subscribe.mock.calls.at(-1)?.[0]).toBe(original.id);
  expect(screen.getByRole("button", { name: "전체 지우기" })).toBeEnabled();
  expect(JSON.parse(service.server.get(original.id)!.strokesJson)[0].points).toHaveLength(1);
});
it("UI-5: 손글씨 열기/닫기로 정식 content/result를 초기화하지 않는다", async () => {
  const form = newForm(); selectTarget();
  const content = within(form).getByPlaceholderText("상담 내용을 입력하세요...");
  const result = within(form).getByPlaceholderText("상담 결과를 입력하세요...");
  fireEvent.change(content, { target: { value: "기존 상담 내용" } });
  fireEvent.change(result, { target: { value: "기존 상담 결과" } });
  await openBoard(); await closeBoard();
  expect(content).toHaveValue("기존 상담 내용"); expect(result).toHaveValue("기존 상담 결과");
  expect(service.add).not.toHaveBeenCalled();
});
it("UI-6: A에서 B로 변경하면 A draft를 B에 연결하지 않는다", async () => {
  newForm(); selectTarget(); const canvas = await openBoard();
  fireEvent.pointerDown(canvas, { button: 0, clientX: 10, clientY: 10 }); await closeBoard();
  const a = service.save.mock.calls[0][0] as HandwritingMemo;
  fireEvent.change(within(screen.getByRole("dialog")).getByPlaceholderText("이름 또는 연락처 검색..."), { target: { value: "" } });
  selectTarget("합성 B");
  const bCanvas = await openBoard();
  expect(screen.getByText(/합성 B · 이용자/)).toBeInTheDocument();
  fireEvent.pointerDown(bCanvas, { button: 0, clientX: 20, clientY: 20 }); await closeBoard();
  const b = service.save.mock.calls.at(-1)?.[0] as HandwritingMemo;
  expect(b).toMatchObject({ targetType: "이용자", targetId: "b", targetKey: "user:b" });
  expect(b.id).not.toBe(a.id);
  expect(getTargetHandwritingDrafts("synthetic-staff", "user:a")[0].memo.id).toBe(a.id);
});
