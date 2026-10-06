import { useCallback, useEffect, useRef, useState } from "react";
import { HandwritingConflict, handwritingApi, handwritingError } from "@/lib/counselingHandwritingApi";
import { clearHandwritingDraft, decodeStrokes, encodeStrokes, getHandwritingDraft, onHandwritingDraftCleared, setHandwritingDraft, timestampMillis, type HandwritingMemo, type HandwritingStroke } from "@/lib/counselingHandwriting";

export type HandwritingPhase = "CLEAN" | "DIRTY" | "SAVING" | "SAVE_ERROR" | "CONFLICT" | "REMOTE_DELETED" | "REMOTE_DELETED_WITH_LOCAL_CHANGES";
export const MIN_HANDWRITING_WRITE_INTERVAL = 5000;

export function useCounselingHandwriting(initial: HandwritingMemo, uid: string, writeInterval = MIN_HANDWRITING_WRITE_INTERVAL) {
  const recovered = getHandwritingDraft(uid, initial.id);
  const [seed] = useState(() => {
    try { return { strokes: recovered?.strokes || decodeStrokes(initial.strokesJson, initial.width, initial.height), invalid: false }; }
    catch { return { strokes: [] as HandwritingStroke[], invalid: true }; }
  });
  const state = useRef({ memo: recovered?.memo || initial, strokes: seed.strokes, saved: recovered?.savedOnServer ?? initial.revision > 0, generation: recovered?.generation || 0, acknowledged: 0, deleted: false, blocked: seed.invalid });
  const [view, setView] = useState({ memo: state.current.memo, strokes: state.current.strokes, status: seed.invalid ? "이 메모의 데이터를 읽을 수 없습니다. 내용을 덮어쓰지 않았습니다." : recovered?.generation ? "미저장 필기를 복구했습니다" : initial.revision ? "저장됨 ✓" : "작성 전", dirty: Boolean(recovered?.generation), deleted: false });
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const active = useRef(true);
  const flight = useRef<Promise<void> | null>(null);
  // A missing server document must never be recreated by an old local draft.
  const remoteDeleted = useRef(recovered?.recovery === "REMOTE_DELETED_WITH_LOCAL_CHANGES");
  const drawing = useRef<HandwritingStroke[] | null>(null);
  const recovery = useRef(recovered?.recovery);
  const serverLatest = useRef<HandwritingMemo | null>(null);
  const highestObservedServerRevision = useRef(initial.revision);
  const [phase, setPhase] = useState<HandwritingPhase>(recovered?.recovery || (recovered?.generation ? "DIRTY" : "CLEAN"));
  const [latestView, setLatestView] = useState<HandwritingMemo | null>(null);
  const lastWrite = useRef(Math.max(recovered?.lastWriteAt || 0, timestampMillis(initial.updatedAt)));
  const dirtySince = useRef<number | null>(null);
  const transition = useCallback((next: HandwritingPhase) => { if (active.current) setPhase(next); }, []);
  const refresh = useCallback((status: string) => {
    const current = state.current;
    if (active.current) setView({ memo: current.memo, strokes: current.strokes, status, dirty: Boolean(drawing.current) || current.generation !== current.acknowledged, deleted: current.deleted });
  }, []);
  const remember = useCallback(() => {
    const current = state.current;
    if (!current.deleted) setHandwritingDraft(uid, { ...getHandwritingDraft(uid, current.memo.id), memo: current.memo, strokes: drawing.current || current.strokes, savedOnServer: current.saved, generation: drawing.current || current.generation !== current.acknowledged ? 1 : 0, recovery: recovery.current, lastWriteAt: lastWrite.current });
  }, [uid]);

  const flush = useCallback(async () => {
    if (seed.invalid) throw new Error("읽을 수 없는 메모는 저장하지 않습니다.");
    if (drawing.current) throw new Error("진행 중인 필기를 먼저 마쳐 주세요.");
    clearTimeout(timer.current);
    if (flight.current) await flight.current;
    if (remoteDeleted.current) throw new Error("서버에서 삭제된 메모입니다. 미저장 필기는 보존되었습니다.");
    if (recovery.current === "CONFLICT") throw new Error("최신 서버 메모를 확인한 후 처리해 주세요. 내 필기는 유지됩니다.");
    const current = state.current;
    if (current.deleted || current.generation === current.acknowledged) return;
    if (!navigator.onLine) { transition("SAVE_ERROR"); refresh("오프라인 — 필기는 이 화면에서 유지됩니다. 연결 후 다시 저장해 주세요."); throw new Error("offline"); }
    transition("SAVING");
    refresh("저장 중…");
    flight.current = (async () => {
      try {
        const wait = Math.max(0, lastWrite.current + writeInterval - Date.now());
        if (wait) await new Promise(resolve => setTimeout(resolve, wait));
        // Recheck after waiting: deletion, logout, conflict or pointerdown may occur.
        if (current.deleted || remoteDeleted.current || recovery.current || drawing.current) throw new Error("현재 필기 상태를 다시 확인해 주세요.");
        const generation = current.generation;
        const json = encodeStrokes(current.strokes);
        const revision = await handwritingApi.save(current.memo, json, current.saved);
        if (current.deleted || remoteDeleted.current) return;
        // A listener can observe a later write while this request is in flight.
        // Never acknowledge an older response over that newer server state.
        if (recovery.current === "CONFLICT" || highestObservedServerRevision.current > revision) {
          current.blocked = true;
          recovery.current = "CONFLICT";
          throw new HandwritingConflict("다른 기기에서 메모가 변경되었습니다. 내 필기는 유지되어 있습니다. 최신 메모를 확인해 주세요.");
        }
        const savedMemo = { ...current.memo, strokesJson: json, revision, transcribedRevision: -1, transcribedAt: null, transcribedCounselingRevision: -1, confirmedBy: "", confirmedAt: null };
        highestObservedServerRevision.current = Math.max(highestObservedServerRevision.current, revision);
        serverLatest.current = savedMemo;
        setLatestView(savedMemo);
        current.memo = savedMemo;
        current.saved = true;
        current.acknowledged = generation;
        current.blocked = false;
        lastWrite.current = Date.now(); dirtySince.current = null;
        remember();
        transition(current.generation === generation && !drawing.current ? "CLEAN" : "DIRTY");
        refresh(current.generation === generation ? "저장됨 ✓" : "작성 중 — 다음 필기 저장 대기");
      } catch (error) {
        current.blocked = true;
        const kind = (error as { kind?: string })?.kind;
        if (kind === "REMOTE_DELETED") { remoteDeleted.current = true; recovery.current = "REMOTE_DELETED_WITH_LOCAL_CHANGES"; }
        if (kind === "CONFLICT") recovery.current = "CONFLICT";
        remember();
        transition(recovery.current || "SAVE_ERROR");
        refresh(handwritingError(error));
        throw error;
      }
    })();
    try { await flight.current; } finally { flight.current = null; }
  }, [refresh, remember, seed.invalid, transition, writeInterval]);

  const change = useCallback((strokes: HandwritingStroke[]) => {
    const current = state.current;
    if (current.deleted || seed.invalid) return;
    try { decodeStrokes(encodeStrokes(strokes), current.memo.width, current.memo.height); }
    catch (error) { refresh(error instanceof Error ? error.message : "필기량 한도에 도달했습니다."); return; }
    current.strokes = strokes;
    drawing.current = null;
    current.generation++;
    if (dirtySince.current === null) dirtySince.current = Date.now();
    current.memo = { ...current.memo, transcribedRevision: -1, transcribedAt: null, transcribedCounselingRevision: -1, confirmedBy: "", confirmedAt: null };
    remember();
    refresh("작성 중 — 임시저장 대기");
    transition(recovery.current || "DIRTY");
    clearTimeout(timer.current);
    const due = Math.max(lastWrite.current + writeInterval, Math.min(Date.now() + 1500, dirtySince.current + writeInterval));
    if (!current.blocked && !recovery.current) timer.current = setTimeout(() => { void flush().catch(() => {}); }, Math.max(0, due - Date.now()));
  }, [flush, refresh, remember, seed.invalid, transition, writeInterval]);

  useEffect(() => {
    active.current = true;
    const forget = () => {
      const current = state.current;
      current.deleted = true;
      drawing.current = null;
      current.strokes = [];
      current.memo = { ...current.memo, strokesJson: "[]" };
      current.acknowledged = current.generation;
      clearTimeout(timer.current);
      refresh("임시 손글씨가 삭제되었습니다.");
      transition("REMOTE_DELETED");
    };
    const unsubscribeClear = onHandwritingDraftCleared((id, owner) => { if (id === null || (owner === uid && id === initial.id)) forget(); });
    const unsubscribe = handwritingApi.subscribe(initial.id, remote => {
      const current = state.current;
      if (!remote) {
        if (current.saved) {
          remoteDeleted.current = true;
          clearTimeout(timer.current);
          current.blocked = true;
          if (drawing.current || current.generation !== current.acknowledged || flight.current) {
            recovery.current = "REMOTE_DELETED_WITH_LOCAL_CHANGES";
            remember();
            transition(recovery.current);
            refresh("REMOTE_DELETED_WITH_LOCAL_CHANGES — 서버 메모가 삭제되었습니다. 미저장 필기는 보존되며 자동저장은 중단되었습니다.");
          } else {
            forget(); clearHandwritingDraft(uid, initial.id);
          }
        }
        return;
      }
      if (current.deleted) return;
      if (remote.revision < highestObservedServerRevision.current) return;
      highestObservedServerRevision.current = Math.max(highestObservedServerRevision.current, remote.revision);
      serverLatest.current = remote;
      setLatestView(remote);
      if (drawing.current || current.generation !== current.acknowledged || flight.current) {
        if (remote.revision !== current.memo.revision && !flight.current) {
          recovery.current = "CONFLICT"; current.blocked = true; clearTimeout(timer.current); remember(); transition("CONFLICT");
          refresh("다른 기기에서 이 손글씨 메모가 변경되었습니다. 내 필기는 보존되어 있습니다.");
        }
        return;
      }
      try {
        current.strokes = decodeStrokes(remote.strokesJson, remote.width, remote.height);
        current.memo = remote;
        current.saved = true;
        remember();
        refresh("저장됨 ✓");
        transition("CLEAN");
      } catch { refresh("이 메모의 데이터를 읽을 수 없습니다. 내용을 덮어쓰지 않았습니다."); current.blocked = true; }
    }, error => refresh(handwritingError(error)));
    const onOnline = () => { if (!state.current.blocked) void flush().catch(() => {}); };
    const onOffline = () => refresh("오프라인 — 필기는 이 화면에서 유지됩니다.");
    const warnUnload = (event: BeforeUnloadEvent) => {
      if ((drawing.current || state.current.generation !== state.current.acknowledged) && !state.current.deleted) { event.preventDefault(); event.returnValue = ""; }
    };
    // Fallback only. Debounce/deadline/minimum interval govern completed strokes.
    const interval = setInterval(() => { if (!state.current.blocked) void flush().catch(() => {}); }, 15000);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("beforeunload", warnUnload);
    return () => {
      active.current = false;
      unsubscribe(); unsubscribeClear();
      clearTimeout(timer.current); clearInterval(interval);
      window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); window.removeEventListener("beforeunload", warnUnload);
    };
  }, [initial.id, uid, flush, refresh, remember, transition]);

  const stage = useCallback((strokes: HandwritingStroke[]) => {
    if (state.current.deleted || seed.invalid) return;
    const started = !drawing.current;
    drawing.current = strokes;
    remember();
    if (started) refresh("필기 중 — 미저장 필기를 이 브라우저에서 보호하고 있습니다.");
    if (started) transition(recovery.current || "DIRTY");
  }, [refresh, remember, seed.invalid, transition]);
  // Caller must obtain explicit confirmation before discarding unsaved local work.
  const acceptServer = useCallback(() => {
    const remote = serverLatest.current;
    if (!remote || remoteDeleted.current || drawing.current) return;
    const strokes = decodeStrokes(remote.strokesJson, remote.width, remote.height);
    const current = state.current;
    current.memo = remote; current.strokes = strokes; current.saved = true;
    current.acknowledged = current.generation; current.blocked = false;
    recovery.current = undefined; dirtySince.current = null;
    remember(); transition("CLEAN"); refresh("최신 서버 메모로 전환했습니다.");
  }, [refresh, remember, transition]);
  return { ...view, phase, serverLatest: latestView, recovery: phase === "CONFLICT" || phase === "REMOTE_DELETED_WITH_LOCAL_CHANGES", isDrawing: Boolean(drawing.current), invalid: seed.invalid, change, stage, flush, acceptServer, latest: () => state.current.memo, currentStrokes: () => drawing.current || state.current.strokes };
}
