import { act, fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import type { HandwritingMemo } from "@/lib/counselingHandwriting";

const mocks = vi.hoisted(() => ({ save: vi.fn(), remove: vi.fn(), flush: vi.fn(), load: vi.fn(), deleted: false, dirty: false }));
vi.mock("@/lib/counselingHandwritingApi", () => ({ handwritingApi: { saveTranscription: mocks.save, removeAfterTranscription: mocks.remove, loadRecord: mocks.load }, handwritingError: () => "저장하지 못했습니다. 다시 시도해 주세요." }));
vi.mock("@/hooks/useCounselingHandwriting", () => ({ useCounselingHandwriting: (memo: HandwritingMemo) => ({ memo, strokes: [{ id: "stroke", width: 4, points: [[1, 1, 1]] }], deleted: mocks.deleted, dirty: mocks.dirty, status: "저장됨", change: vi.fn(), flush: mocks.flush, latest: () => memo }) }));
vi.mock("@/components/HandwritingCanvas", async () => {
  const { forwardRef } = await import("react");
  return { default: forwardRef(() => <div aria-label="합성 필기" />) };
});
import CounselingWhiteboard from "@/components/CounselingWhiteboard";

const memo: HandwritingMemo = { id: "memo", schemaVersion: 1, targetType: "이용자", targetId: "fake", targetKey: "user:fake", createdBy: "staff", updatedBy: "staff", createdAt: null, updatedAt: null, revision: 1, width: 1600, height: 1000, strokesJson: "[]", counselingRecordId: "", transcribedAt: null, transcribedRevision: -1 };
const renderBoard = () => render(<CounselingWhiteboard memo={memo} uid="staff" targetName="합성 이용자" close={vi.fn()} closeRequest={createRef()} onDisposed={vi.fn()} />);
beforeEach(() => { vi.clearAllMocks(); mocks.deleted = false; mocks.dirty = false; mocks.flush.mockResolvedValue(undefined); mocks.save.mockResolvedValue("record"); mocks.load.mockImplementation(async () => ({ ...mocks.save.mock.calls.at(-1)?.[1], updatedAt: null })); mocks.remove.mockResolvedValue(undefined); vi.spyOn(window, "confirm").mockReturnValue(true); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("임시 손글씨 전사 확인 UI", () => {
  it("열람·입력만으로 삭제를 허용하지 않고 정식 저장 성공 후에만 활성화", async () => {
    renderBoard(); const remove = screen.getByRole("button", { name: "전사 완료 · 손글씨 삭제" });
    expect(remove).toBeDisabled();
    fireEvent.change(screen.getByLabelText("상담내용 *"), { target: { value: "합성 전사내용" } });
    expect(remove).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "정식 상담 저장" }));
    await waitFor(() => expect(remove).toBeEnabled());
    fireEvent.change(screen.getByLabelText("상담결과"), { target: { value: "수정" } });
    expect(remove).toBeDisabled(); expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("정식 저장 실패 시 삭제 비활성화 및 메모 유지", async () => {
    mocks.save.mockRejectedValue(new Error("synthetic failure")); renderBoard();
    fireEvent.change(screen.getByLabelText("상담내용 *"), { target: { value: "합성 내용" } });
    fireEvent.click(screen.getByRole("button", { name: "정식 상담 저장" }));
    await screen.findByText("저장하지 못했습니다. 다시 시도해 주세요.");
    expect(screen.getByRole("button", { name: "전사 완료 · 손글씨 삭제" })).toBeDisabled();
    expect(screen.getByLabelText("합성 필기")).toBeInTheDocument(); expect(mocks.remove).not.toHaveBeenCalled();
    expect(screen.getByLabelText("상담내용 *")).toHaveValue("합성 내용");
  });
  it("확인 취소 시 삭제하지 않고 명시적 확인·서버 성공 후 완료 안내", async () => {
    renderBoard(); fireEvent.change(screen.getByLabelText("상담내용 *"), { target: { value: "합성 내용" } });
    fireEvent.click(screen.getByRole("button", { name: "정식 상담 저장" }));
    const remove = screen.getByRole("button", { name: "전사 완료 · 손글씨 삭제" });
    await waitFor(() => expect(remove).toBeEnabled());
    vi.mocked(window.confirm).mockReturnValueOnce(false); fireEvent.click(remove);
    expect(mocks.remove).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(remove); });
    expect(mocks.remove).toHaveBeenCalledOnce();
    expect(screen.getByText("✓ 전사 완료 — 임시 손글씨가 삭제되었습니다.")).toBeInTheDocument();
  });
});
