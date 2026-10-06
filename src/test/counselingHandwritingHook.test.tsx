import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearAllHandwritingDrafts, clearHandwritingDraft, getHandwritingDraft, reconcileHandwritingDrafts, type HandwritingMemo } from "@/lib/counselingHandwriting";
const service = vi.hoisted(() => ({ save: vi.fn(), subscribe: vi.fn() }));
vi.mock("@/lib/counselingHandwritingApi", () => ({ handwritingApi: service, handwritingError: () => "저장 실패" }));
import { useCounselingHandwriting } from "@/hooks/useCounselingHandwriting";
const memo: HandwritingMemo = { id: "hook-memo", schemaVersion: 1, targetType: "이용자", targetId: "fake", targetKey: "user:fake", createdBy: "staff", updatedBy: "staff", createdAt: null, updatedAt: null, revision: 0, width: 1600, height: 1000, strokesJson: "[]", counselingRecordId: "", transcribedAt: null, transcribedRevision: -1 };
const strokes = [{ id: "stroke", width: 4 as const, points: [[1, 1, 0.5] as [number,number,number]] }];
beforeEach(() => { clearAllHandwritingDrafts(); vi.clearAllMocks(); service.subscribe.mockReturnValue(vi.fn()); service.save.mockResolvedValue(1); });
afterEach(() => { cleanup(); clearAllHandwritingDrafts(); vi.useRealTimers(); vi.restoreAllMocks(); });
it("저장 실패·컴포넌트 닫힘에도 미저장 메모를 같은 탭 메모리에서 복구", async () => {
  service.save.mockRejectedValue(new Error("fake"));
  const first = renderHook(() => useCounselingHandwriting(memo,"staff"));
  act(() => first.result.current.change(strokes));
  await act(async () => { await expect(first.result.current.flush()).rejects.toThrow(); });
  expect(first.result.current.strokes).toEqual(strokes); first.unmount();
  const reopened = renderHook(() => useCounselingHandwriting(memo,"staff"));
  expect(reopened.result.current.strokes).toEqual(strokes); expect(reopened.result.current.dirty).toBe(true);
});
it("원격 삭제 후 React stroke·메모리·미저장 상태를 모두 비운다", () => {
  const hook = renderHook(() => useCounselingHandwriting(memo,"staff"));
  act(() => hook.result.current.change(strokes));
  act(() => clearHandwritingDraft("staff",memo.id));
  expect(hook.result.current.strokes).toEqual([]); expect(hook.result.current.memo.strokesJson).toBe("[]");
  expect(hook.result.current.dirty).toBe(false); expect(hook.result.current.deleted).toBe(true);
  expect(getHandwritingDraft("staff",memo.id)).toBeUndefined();
});
it("로그아웃 정리는 로컬 메모리만 비우고 서버 삭제를 호출하지 않는다", () => {
  const hook = renderHook(() => useCounselingHandwriting(memo,"staff"));
  act(() => hook.result.current.change(strokes)); act(() => clearAllHandwritingDrafts());
  expect(hook.result.current.deleted).toBe(true); expect(hook.result.current.strokes).toEqual([]);
  expect(service.save).not.toHaveBeenCalled();
});
it("파싱 불가능한 서버 데이터는 화면을 중단하거나 덮어쓰지 않는다", async () => {
  const hook = renderHook(() => useCounselingHandwriting({...memo,strokesJson:"broken"},"staff"));
  expect(hook.result.current.invalid).toBe(true);
  act(() => hook.result.current.change(strokes));
  await expect(hook.result.current.flush()).rejects.toThrow();
  expect(service.save).not.toHaveBeenCalled();
});
it("서버 삭제는 미저장 필기를 보존하고 삭제된 문서의 재생성을 차단한다", async () => {
  let notify: (remote: HandwritingMemo | null) => void = () => {};
  service.subscribe.mockImplementation((_id, callback) => { notify = callback; return vi.fn(); });
  const hook = renderHook(() => useCounselingHandwriting({ ...memo, revision: 5 }, "staff"));
  act(() => hook.result.current.change(strokes));
  act(() => notify(null));
  expect(hook.result.current.strokes).toEqual(strokes);
  expect(hook.result.current.dirty).toBe(true);
  expect(getHandwritingDraft("staff", memo.id)?.strokes).toEqual(strokes);
  await expect(hook.result.current.flush()).rejects.toThrow();
  expect(service.save).not.toHaveBeenCalled();
});
it("미저장 변경이 없는 메모는 서버 삭제 후 로컬에서도 제거한다", () => {
  let notify: (remote: HandwritingMemo | null) => void = () => {};
  service.subscribe.mockImplementation((_id, callback) => { notify = callback; return vi.fn(); });
  const saved = { ...memo, revision: 5, strokesJson: JSON.stringify(strokes) };
  const hook = renderHook(() => useCounselingHandwriting(saved, "staff"));
  act(() => notify(saved));
  expect(getHandwritingDraft("staff", memo.id)).toBeDefined();
  act(() => notify(null));
  expect(hook.result.current.strokes).toEqual([]);
  expect(hook.result.current.deleted).toBe(true);
  expect(getHandwritingDraft("staff", memo.id)).toBeUndefined();
  expect(service.save).not.toHaveBeenCalled();
});
it("revision 충돌은 재열기 후에도 로컬을 보존하며 최신본 확인·명시 전환으로 복구", async () => {
  let notify: (remote: HandwritingMemo | null) => void = () => {};
  service.subscribe.mockImplementation((_id, callback) => { notify = callback; return vi.fn(); });
  const saved = { ...memo, revision: 5 };
  const remote = { ...saved, revision: 6, strokesJson: "[]" };
  const first = renderHook(() => useCounselingHandwriting(saved, "staff"));
  act(() => first.result.current.change(strokes));
  act(() => notify(remote));
  expect(first.result.current.phase).toBe("CONFLICT");
  expect(first.result.current.serverLatest).toEqual(remote);
  first.unmount();
  const next = renderHook(() => useCounselingHandwriting(remote, "staff"));
  act(() => notify(remote));
  expect(next.result.current.strokes).toEqual(strokes);
  await expect(next.result.current.flush()).rejects.toThrow();
  expect(service.save).not.toHaveBeenCalled();
  act(() => next.result.current.acceptServer());
  expect(next.result.current.memo.revision).toBe(6);
  expect(next.result.current.strokes).toEqual([]);
  expect(next.result.current.phase).toBe("CLEAN");
});
it("진행 중 필기는 unmount 이전부터 dirty·로컬 복구·종료 경고 대상", () => {
  const hook = renderHook(() => useCounselingHandwriting(memo, "staff"));
  act(() => hook.result.current.stage(strokes));
  expect(hook.result.current.dirty).toBe(true);
  expect(hook.result.current.isDrawing).toBe(true);
  const unload = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(true);
  hook.unmount();
  const reopened = renderHook(() => useCounselingHandwriting(memo, "staff"));
  expect(reopened.result.current.strokes).toEqual(strokes);
  expect(reopened.result.current.dirty).toBe(true);
});
it("닫힌 dirty 메모는 재진입 재조정 후에도 필기를 보존하고 기존 ID 재생성 불가", async () => {
  const saved = { ...memo, revision: 5 };
  const first = renderHook(() => useCounselingHandwriting(saved, "staff"));
  act(() => first.result.current.change(strokes)); first.unmount();
  reconcileHandwritingDrafts("staff", saved.targetKey, []);
  const next = renderHook(() => useCounselingHandwriting(saved, "staff"));
  expect(next.result.current.phase).toBe("REMOTE_DELETED_WITH_LOCAL_CHANGES");
  expect(next.result.current.strokes).toEqual(strokes);
  await expect(next.result.current.flush()).rejects.toThrow(); expect(service.save).not.toHaveBeenCalled();
});
it("다른 직원의 로컬 정리가 현재 직원의 미저장 필기를 지우지 않는다", () => {
  const hook = renderHook(() => useCounselingHandwriting(memo,"staff"));
  act(() => hook.result.current.change(strokes));
  act(() => clearHandwritingDraft("other-staff", memo.id));
  expect(hook.result.current.strokes).toEqual(strokes); expect(hook.result.current.dirty).toBe(true);
});
it("오프라인 저장 실패 및 초과 payload는 기존 미저장 필기를 유지", async () => {
  const hook = renderHook(() => useCounselingHandwriting(memo,"staff"));
  act(() => hook.result.current.change(strokes));
  vi.spyOn(navigator,"onLine","get").mockReturnValue(false);
  await act(async () => { await expect(hook.result.current.flush()).rejects.toThrow("offline"); });
  expect(hook.result.current.phase).toBe("SAVE_ERROR"); expect(service.save).not.toHaveBeenCalled();
  act(() => hook.result.current.change(Array.from({length:3001},()=>strokes[0])));
  expect(hook.result.current.strokes).toEqual(strokes);
  vi.restoreAllMocks();
});
it("진행 중 저장 응답보다 원격 삭제 보호가 우선하며 dirty를 지우지 않는다", async () => {
  let notify: (remote: HandwritingMemo|null)=>void=()=>{}, complete: (revision:number)=>void=()=>{};
  service.subscribe.mockImplementation((_id, callback)=>{notify=callback;return vi.fn();});
  service.save.mockImplementation(()=>new Promise<number>(resolve=>{complete=resolve;}));
  const hook=renderHook(()=>useCounselingHandwriting({...memo,revision:5},"staff"));
  act(()=>hook.result.current.change(strokes));
  let saving: Promise<void>;
  act(()=>{saving=hook.result.current.flush();});
  act(()=>notify(null));
  await act(async()=>{complete(6);await saving!;});
  expect(hook.result.current.phase).toBe("REMOTE_DELETED_WITH_LOCAL_CHANGES");
  expect(hook.result.current.strokes).toEqual(strokes); expect(hook.result.current.dirty).toBe(true);
});
it.each([5000, 10000, 15000])("30분 실제 저장 알고리즘 부하·최소 간격 %ims", async interval => {
  vi.useFakeTimers(); vi.setSystemTime(1_000_000);
  for (const pattern of ["A", "B", "C"] as const) {
    clearAllHandwritingDrafts(); service.save.mockClear();
    const writes: number[] = []; let revision = 0, maximumUnsaved = 0;
    service.save.mockImplementation(async () => { writes.push(Date.now()); return ++revision; });
    const hook = renderHook(() => useCounselingHandwriting(memo, "staff", interval));
    const drawn: typeof strokes = []; let dirtyAt: number | null = null;
    for (let second = 0; second < 1800; second++) {
      if (pattern === "A" || (pattern === "B" && second % 2 === 0) || (pattern === "C" && second % 30 < 10)) {
        drawn.push({ id: `s-${second}`, width: 4, points: [[1, 1, .5], [2, 2, .5]] });
        if (dirtyAt === null) dirtyAt = Date.now();
        act(() => hook.result.current.change([...drawn]));
      }
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
      if (dirtyAt !== null) maximumUnsaved = Math.max(maximumUnsaved, Date.now() - dirtyAt);
      if (!hook.result.current.dirty) dirtyAt = null;
    }
    await act(async () => { await vi.advanceTimersByTimeAsync(interval + 1500); });
    expect(hook.result.current.dirty).toBe(false);
    expect(writes.every((at, i) => i === 0 || at - writes[i - 1] >= interval)).toBe(true);
    expect(writes.length).toBeLessThanOrEqual(Math.ceil(1800000 / interval) + 1);
    console.info(JSON.stringify({ interval, pattern, writes: writes.length, transactionReads: writes.length, subscriptionReadEstimateSixListeners: writes.length * 6, documentBytes: new TextEncoder().encode(hook.result.current.latest().strokesJson).byteLength, maximumUnsavedMs: maximumUnsaved }));
    hook.unmount();
  }
}, 60000);
