import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import HandwritingCanvas, { type HandwritingCanvasHandle } from "@/components/HandwritingCanvas";
import { useCounselingHandwriting } from "@/hooks/useCounselingHandwriting";
import { handwritingApi, handwritingError } from "@/lib/counselingHandwritingApi";
import { clearHandwritingDraft, decodeStrokes, encodeStrokes, getHandwritingDraft, setHandwritingDraft, type HandwritingMemo } from "@/lib/counselingHandwriting";
import type { CounselingRecord } from "@/types";

type Props = { memo: HandwritingMemo; uid: string; targetName: string; close: () => void; closeRequest: React.MutableRefObject<(() => Promise<void>) | null>; onDisposed: () => void };
export default function CounselingWhiteboard({ memo, uid, targetName, close, closeRequest, onDisposed }: Props) {
  const board = useCounselingHandwriting(memo, uid);
  const [showTranscription, setShowTranscription] = useState(false);
  const [form, setForm] = useState({ targetType: memo.targetType, targetId: memo.targetId, targetName, counselorName: "", date: new Date().toLocaleDateString("sv-SE"), category: "일반상담", content: "", result: "" });
  const [saved, setSaved] = useState<{ recordId: string; revision: number; counselingRevision?: number; content: string; result: string; date: string; counselorName: string; localJson: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [finished, setFinished] = useState(false);
  const [showServer, setShowServer] = useState(false);
  const [latestRecord, setLatestRecord] = useState<(CounselingRecord & { updatedAt?: unknown }) | null>(null);
  const expectedUpdatedAt = useRef<unknown>(undefined);
  const edited = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const canvasRef = useRef<HandwritingCanvasHandle>(null);
  const recordId = useRef(getHandwritingDraft(uid, memo.id)?.recoveryRecordId || memo.counselingRecordId);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    if (recordId.current) void handwritingApi.loadRecord(recordId.current).then(record => {
      if (!mounted.current || !record) return;
      expectedUpdatedAt.current = record.updatedAt ?? null;
      if (!edited.current) setForm(previous => ({ ...previous, counselorName: record.counselorName || "", date: record.date, category: record.category, content: record.content || "", result: record.result || "" }));
      // 재접속 후에는 해당 직원이 정식 기록을 다시 저장해 확인한 후 삭제한다.
    }).catch(() => { if (mounted.current) setNotice("연결된 상담기록을 불러오지 못했습니다. 삭제 기능은 비활성화됩니다."); });
    return () => { mounted.current = false; };
  }, []);

  const serverStrokes = useMemo(() => {
    if (!board.serverLatest) return null;
    try { return decodeStrokes(board.serverLatest.strokesJson, memo.width, memo.height); } catch { return null; }
  }, [board.serverLatest, memo.width, memo.height]);
  const canDelete = !board.deleted && !board.isDrawing && (!board.dirty || board.recovery) && Boolean(saved && (board.recovery || saved.revision === board.memo.revision) && saved.localJson === encodeStrokes(board.strokes) && saved.content === form.content && saved.result === form.result && saved.date === form.date && saved.counselorName === form.counselorName);
  async function requestClose() {
    if (busy) return;
    canvasRef.current?.finalize();
    if (board.recovery) {
      if (window.confirm("미저장 필기는 이 탭에서만 유지됩니다. 새로고침하거나 브라우저를 종료하면 사라질 수 있습니다. 닫을까요?")) close();
      return;
    }
    if (!board.deleted) {
      try { await board.flush(); } catch { setNotice("아직 서버에 저장되지 않았습니다. 이 브라우저를 종료하거나 새로고침하면 미저장 필기가 사라질 수 있습니다."); return; }
    }
    close();
  }
  // Dialog의 X·Escape도 같은 미저장 보호 절차를 거친다.
  closeRequest.current = requestClose;
  useEffect(() => {
    if (board.deleted) onDisposed();
  // 삭제 시 한 번만 외부 선택 상태의 stroke 원문을 비운다.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.deleted]);
  async function saveRecord() {
    if (!form.content.trim()) { setNotice("정식 상담내용을 입력해 주세요."); inputRef.current?.focus(); return; }
    setBusy(true); setNotice(""); setSaved(null);
    try {
      canvasRef.current?.finalize();
      if (!board.recovery) await board.flush();
      const source = board.phase === "CONFLICT" ? board.serverLatest : board.latest();
      if (!source) throw new Error("최신 서버 메모를 확인해 주세요.");
      const latest = { ...source, counselingRecordId: recordId.current || source.counselingRecordId };
      let id: string;
      if (board.phase === "REMOTE_DELETED_WITH_LOCAL_CHANGES") {
        const draft = getHandwritingDraft(uid, memo.id);
        const recoveryId = recordId.current || draft?.recoveryRecordId || crypto.randomUUID();
        recordId.current = recoveryId;
        if (draft) setHandwritingDraft(uid, { ...draft, recoveryRecordId: recoveryId });
        id = await handwritingApi.saveRecoveredTranscription(latest, recoveryId, form, expectedUpdatedAt.current);
      } else id = await handwritingApi.saveTranscription(latest, form as Omit<CounselingRecord, "id" | "createdAt">, expectedUpdatedAt.current);
      recordId.current = id;
      if (board.recovery) { const draft = getHandwritingDraft(uid, memo.id); if (draft) setHandwritingDraft(uid, { ...draft, recoveryRecordId: id }); }
      const record = await handwritingApi.loadRecord(id);
      if (!record || record.content !== form.content.trim() || record.result !== form.result || record.date !== form.date || record.counselorName !== form.counselorName) throw new Error("정식 기록 저장 확인에 실패했습니다. 최신 상담기록을 확인해 주세요.");
      expectedUpdatedAt.current = record?.updatedAt ?? null;
      setSaved({ recordId: id, revision: latest.revision, counselingRevision: record.revision, content: form.content, result: form.result, date: form.date, counselorName: form.counselorName, localJson: encodeStrokes(board.currentStrokes?.() || board.strokes) });
      setNotice("정식 상담기록이 저장되었습니다. 전사 내용을 확인한 후 임시 손글씨를 삭제해 주세요.");
    } catch (error) { setNotice(handwritingError(error)); }
    finally { setBusy(false); }
  }
  async function deleteMemo() {
    if (!canDelete || !saved) return;
    if (!window.confirm("손글씨 메모를 삭제하시겠습니까?\n정식 상담기록에 필요한 내용이 모두 입력되었는지 확인해주세요.\n삭제된 손글씨 메모는 복구할 수 없습니다.")) return;
    setBusy(true); setNotice("");
    try {
      canvasRef.current?.finalize();
      if (board.phase === "REMOTE_DELETED_WITH_LOCAL_CHANGES") await handwritingApi.confirmRecoveredTranscription(board.latest(), saved.recordId, expectedUpdatedAt.current);
      else await handwritingApi.removeAfterTranscription({ ...(board.phase === "CONFLICT" ? board.serverLatest || board.latest() : board.latest()), counselingRecordId: saved.recordId }, saved.counselingRevision);
      clearHandwritingDraft(uid, memo.id);
      setFinished(true); setSaved(null);
      setNotice("✓ 전사 완료 — 임시 손글씨가 삭제되었습니다.");
    } catch (error) { setNotice(handwritingError(error)); }
    finally { setBusy(false); }
  }
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3" data-no-swipe>
    <p className="text-sm text-muted-foreground">상담기록으로 저장되지 않습니다. 사무실 PC에서 상담내용으로 옮긴 후 삭제해주세요.</p>
    <div className="flex flex-wrap items-center gap-2">
      <p role="status" aria-live="polite" className="min-w-0 flex-1 break-words text-sm">{finished ? "전사 완료" : board.status}</p>
      {board.dirty && !board.deleted && <Button variant="outline" className="min-h-11" onClick={() => void board.flush().catch(() => {})}>다시 저장</Button>}
      <Button variant="outline" className="min-h-11 lg:hidden" disabled={board.deleted} onClick={() => setShowTranscription(!showTranscription)}>{showTranscription ? "필기에 집중" : "상담내용으로 전사"}</Button>
    </div>
    {notice && <p role="status" aria-live="polite" className="rounded border bg-muted/30 p-2 text-sm whitespace-pre-wrap break-words">{notice}</p>}
    {board.recovery && <section className="space-y-2 rounded border border-amber-400 p-2" aria-label="필기 충돌 복구">
      <p>현재 기기의 필기는 보존되어 있습니다. 필요한 내용을 정식 상담으로 옮긴 뒤 전사 완료를 확인해주세요. 자동 병합·덮어쓰기는 하지 않습니다.</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="min-h-11" onClick={() => setShowServer(false)}>내 필기 보기</Button>
        {serverStrokes && <Button variant="outline" className="min-h-11" onClick={() => { canvasRef.current?.finalize(); setShowServer(true); }}>최신 서버 메모 보기</Button>}
        {board.phase === "CONFLICT" && serverStrokes && <Button variant="outline" className="min-h-11" onClick={() => { canvasRef.current?.finalize(); if (window.confirm("내 미저장 필기를 버리고 최신 서버본으로 전환할까요? 필요한 내용은 먼저 정식 상담 입력란으로 옮겨주세요.")) { board.acceptServer(); setShowServer(false); setSaved(null); } }}>최신 서버본으로 전환</Button>}
      </div>
      {board.serverLatest && !serverStrokes && <p role="alert">최신 서버 필기 데이터를 읽을 수 없습니다. 내 필기는 유지되며 서버본으로 전환하지 않습니다.</p>}
    </section>}
    {(recordId.current || board.serverLatest?.counselingRecordId) && <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => void handwritingApi.loadRecord(recordId.current || board.serverLatest?.counselingRecordId || "").then(record => { if (record) { recordId.current = record.id; setLatestRecord(record); } }).catch(error => setNotice(handwritingError(error)))}>최신 상담기록 확인</Button>}
    {latestRecord && <section className="rounded border p-2 whitespace-pre-wrap break-words" aria-label="최신 상담기록 비교"><p>최신 상담내용: {latestRecord.content}</p><p>최신 상담결과: {latestRecord.result}</p><Button variant="outline" className="min-h-11" onClick={() => { if (window.confirm("최신 기록을 확인했습니다. 현재 입력 내용으로 다시 저장할 준비를 할까요? 자동 저장은 하지 않습니다.")) { expectedUpdatedAt.current = latestRecord.updatedAt ?? null; setLatestRecord(null); setSaved(null); } }}>최신 기록 확인 후 다시 저장 준비</Button></section>}
    {!board.deleted ? <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-4 overflow-y-auto lg:grid-cols-2">
      <div className={`${showTranscription ? "h-[45dvh]" : "h-full"} min-h-[320px] min-w-0 lg:h-full`}>
        <HandwritingCanvas ref={canvasRef} strokes={showServer && serverStrokes ? serverStrokes : board.strokes} width={memo.width} height={memo.height} onChange={board.change} onPending={board.stage} disabled={busy || board.invalid || showServer} />
      </div>
      <div className={`${showTranscription ? "flex" : "hidden"} min-w-0 flex-col gap-3 lg:flex`}>
        <p className="text-sm font-medium">정식 상담기록 · 이 손글씨 메모는 임시자료입니다.</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div><Label htmlFor={`memo-date-${memo.id}`}>상담일</Label><Input id={`memo-date-${memo.id}`} type="date" value={form.date} disabled={busy} onChange={e => { edited.current = true; setForm(f => ({ ...f, date: e.target.value })); }} /></div>
          <div><Label htmlFor={`memo-counselor-${memo.id}`}>상담자</Label><Input id={`memo-counselor-${memo.id}`} value={form.counselorName} disabled={busy} onChange={e => { edited.current = true; setForm(f => ({ ...f, counselorName: e.target.value })); }} /></div>
        </div>
        <div className="flex min-h-[170px] flex-1 flex-col"><Label htmlFor={`memo-content-${memo.id}`}>상담내용 *</Label><Textarea ref={inputRef} id={`memo-content-${memo.id}`} className="min-h-[160px] flex-1" required disabled={busy} value={form.content} onChange={e => { edited.current = true; setForm(f => ({ ...f, content: e.target.value })); }} /></div>
        <div><Label htmlFor={`memo-result-${memo.id}`}>상담결과</Label><Textarea id={`memo-result-${memo.id}`} rows={4} disabled={busy} value={form.result} onChange={e => { edited.current = true; setForm(f => ({ ...f, result: e.target.value })); }} /></div>
        <div className="flex flex-wrap gap-2 [&_button]:min-h-11">
          <Button disabled={busy || board.invalid || board.deleted || (!board.strokes.length && !board.memo.revision)} onClick={() => void saveRecord()}>정식 상담 저장</Button>
          <Button variant="destructive" disabled={busy || !canDelete} onClick={() => void deleteMemo()}>전사 완료 · 손글씨 삭제</Button>
        </div>
        <p className="text-xs text-muted-foreground">정식 상담 저장 성공과 전사 완료 확인 후에만 손글씨가 삭제됩니다.</p>
      </div>
    </div> : !finished && <p className="p-4">다른 기기에서 임시 손글씨가 삭제되었거나 로그아웃되었습니다.</p>}
    <div className="flex shrink-0 justify-end border-t pt-2 pb-[env(safe-area-inset-bottom)]">
      <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => void requestClose()}>닫기</Button>
    </div>
  </div>;
}
