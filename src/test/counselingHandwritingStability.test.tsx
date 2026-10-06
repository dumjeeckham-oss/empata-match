import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { clearAllHandwritingDrafts, type HandwritingMemo } from "@/lib/counselingHandwriting";
const service = vi.hoisted(() => ({ save: vi.fn(), subscribe: vi.fn() }));
vi.mock("@/lib/counselingHandwritingApi", () => ({
  handwritingApi: service,
  handwritingError: (error: unknown) => error instanceof Error ? error.message : "합성 저장 실패",
  HandwritingConflict: class HandwritingConflict extends Error {
    kind: string;
    constructor(message: string, kind = "CONFLICT") { super(message); this.kind = kind; }
  },
}));
import { useCounselingHandwriting } from "@/hooks/useCounselingHandwriting";
afterEach(() => { cleanup(); clearAllHandwritingDrafts(); vi.restoreAllMocks(); });
it.each(Array.from({ length: 100 }, (_, index) => index + 1))("지연된 save 응답보다 더 최신인 listener revision을 CLEAN으로 오인하지 않는다 #%i", async () => {
  const initial: HandwritingMemo = { id: "synthetic-stability", schemaVersion: 1, targetType: "이용자", targetId: "synthetic", targetKey: "user:synthetic", counselingRecordId: "", createdBy: "synthetic-staff", updatedBy: "synthetic-staff", createdAt: null, updatedAt: null, revision: 5, width: 1600, height: 1000, strokesJson: "[]", transcribedRevision: -1, transcribedAt: null };
  const local = [{ id: "local", width: 4 as const, points: [[1, 1, 0.5] as [number, number, number]] }];
  let notify: (memo: HandwritingMemo | null) => void = () => {};
  let resolveSave: (revision: number) => void = () => {};
  service.subscribe.mockImplementation((_id, receive) => { notify = receive; return vi.fn(); });
  service.save.mockImplementation(() => new Promise<number>(resolve => { resolveSave = resolve; }));
  const hook = renderHook(() => useCounselingHandwriting(initial, "synthetic-staff"));
  act(() => hook.result.current.change(local));
  let saving: Promise<void> = Promise.resolve();
  act(() => { saving = hook.result.current.flush(); });
  // Server has committed our revision 6, then another client's revision 7.
  // Hold only the API response to expose callback/ack ordering, not server writes.
  act(() => notify({ ...initial, revision: 7, strokesJson: '[{"id":"remote","width":4,"points":[[2,2,0.5]]}]' }));
  await act(async () => { resolveSave(6); await expect(saving).rejects.toMatchObject({ kind: "CONFLICT" }); });
  expect(hook.result.current.serverLatest?.revision).toBe(7);
  expect(hook.result.current.strokes).toEqual(local);
  expect(hook.result.current.phase).toBe("CONFLICT");
});

it("save response가 먼저 도착하고 같은 revision listener가 뒤따르면 CLEAN을 유지한다", async () => {
  const initial: HandwritingMemo = { id: "sequence-a", schemaVersion: 1, targetType: "이용자", targetId: "synthetic", targetKey: "user:synthetic", counselingRecordId: "", createdBy: "synthetic-staff", updatedBy: "synthetic-staff", createdAt: null, updatedAt: null, revision: 5, width: 1600, height: 1000, strokesJson: "[]", transcribedRevision: -1, transcribedAt: null };
  const local = [{ id: "local-a", width: 4 as const, points: [[1, 1, 0.5] as [number, number, number]] }];
  let notify: (memo: HandwritingMemo | null) => void = () => {};
  let resolveSave: (revision: number) => void = () => {};
  service.subscribe.mockImplementation((_id, receive) => { notify = receive; return vi.fn(); });
  service.save.mockImplementation(() => new Promise<number>(resolve => { resolveSave = resolve; }));
  const hook = renderHook(() => useCounselingHandwriting(initial, "synthetic-staff"));
  act(() => hook.result.current.change(local));
  let saving: Promise<void> = Promise.resolve();
  act(() => { saving = hook.result.current.flush(); });
  await act(async () => { resolveSave(6); await saving; });
  expect(hook.result.current.phase).toBe("CLEAN");
  act(() => notify({ ...initial, revision: 6, strokesJson: JSON.stringify(local) }));
  expect(hook.result.current.phase).toBe("CLEAN");
  expect(hook.result.current.strokes).toEqual(local);
});

it("save 중 동일 revision listener는 conflict가 아니며 성공 응답을 인정한다", async () => {
  const initial: HandwritingMemo = { id: "sequence-same", schemaVersion: 1, targetType: "이용자", targetId: "synthetic", targetKey: "user:synthetic", counselingRecordId: "", createdBy: "synthetic-staff", updatedBy: "synthetic-staff", createdAt: null, updatedAt: null, revision: 5, width: 1600, height: 1000, strokesJson: "[]", transcribedRevision: -1, transcribedAt: null };
  const local = [{ id: "local-same", width: 4 as const, points: [[1, 1, 0.5] as [number, number, number]] }];
  let notify: (memo: HandwritingMemo | null) => void = () => {};
  let resolveSave: (revision: number) => void = () => {};
  service.subscribe.mockImplementation((_id, receive) => { notify = receive; return vi.fn(); });
  service.save.mockImplementation(() => new Promise<number>(resolve => { resolveSave = resolve; }));
  const hook = renderHook(() => useCounselingHandwriting(initial, "synthetic-staff"));
  act(() => hook.result.current.change(local));
  let saving: Promise<void> = Promise.resolve();
  act(() => { saving = hook.result.current.flush(); });
  act(() => notify({ ...initial, revision: 6, strokesJson: JSON.stringify(local) }));
  await act(async () => { resolveSave(6); await saving; });
  expect(hook.result.current.phase).toBe("CLEAN");
  expect(hook.result.current.serverLatest?.revision).toBe(6);
});

it("관측 revision은 단조 증가하며 더 낮은 snapshot이 최신 충돌 상태를 덮지 않는다", async () => {
  const initial: HandwritingMemo = { id: "monotonic-revision", schemaVersion: 1, targetType: "이용자", targetId: "synthetic", targetKey: "user:synthetic", counselingRecordId: "", createdBy: "synthetic-staff", updatedBy: "synthetic-staff", createdAt: null, updatedAt: null, revision: 5, width: 1600, height: 1000, strokesJson: "[]", transcribedRevision: -1, transcribedAt: null };
  const local = [{ id: "local-monotonic", width: 4 as const, points: [[1, 1, 0.5] as [number, number, number]] }];
  let notify: (memo: HandwritingMemo | null) => void = () => {};
  let resolveSave: (revision: number) => void = () => {};
  service.subscribe.mockImplementation((_id, receive) => { notify = receive; return vi.fn(); });
  service.save.mockImplementation(() => new Promise<number>(resolve => { resolveSave = resolve; }));
  const hook = renderHook(() => useCounselingHandwriting(initial, "synthetic-staff"));
  act(() => hook.result.current.change(local));
  let saving: Promise<void> = Promise.resolve();
  act(() => { saving = hook.result.current.flush(); });
  act(() => notify({ ...initial, revision: 8, strokesJson: "[]" }));
  act(() => notify({ ...initial, revision: 6, strokesJson: "[]" }));
  expect(hook.result.current.serverLatest?.revision).toBe(8);
  await act(async () => { resolveSave(6); await expect(saving).rejects.toMatchObject({ kind: "CONFLICT" }); });
  expect(hook.result.current.serverLatest?.revision).toBe(8);
  expect(hook.result.current.phase).toBe("CONFLICT");
  expect(hook.result.current.strokes).toEqual(local);
});
