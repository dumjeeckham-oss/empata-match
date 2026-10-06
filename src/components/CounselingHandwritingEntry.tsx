import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { MobileDetailDialogContent, MobileDetailDialogHeader } from "@/components/MobileDetailDialog";
import { useAuth } from "@/hooks/useAuth";
import { handwritingApi, handwritingError } from "@/lib/counselingHandwritingApi";
import { getHandwritingDraft, reconcileHandwritingDrafts, isStaleMemo, memoTargetKey, timestampMillis, type HandwritingMemo, type MemoTargetType } from "@/lib/counselingHandwriting";

const Whiteboard = lazy(() => import("@/components/CounselingWhiteboard"));
type Props = { targetType: MemoTargetType; targetId: string; targetName: string; initialMemo?: HandwritingMemo; label?: string; autoOpen?: boolean; onClosed?: () => void; onDisposed?: () => void };
function newMemo(type: MemoTargetType, id: string, uid: string): HandwritingMemo {
  const portrait = window.innerHeight > window.innerWidth;
  return { id: crypto.randomUUID(), schemaVersion: 1, targetType: type, targetId: id, targetKey: memoTargetKey(type, id), counselingRecordId: "", createdBy: uid, updatedBy: uid, createdAt: null, updatedAt: null, revision: 0, width: portrait ? 1000 : 1600, height: portrait ? 1400 : 1000, strokesJson: "[]", transcribedRevision: -1, transcribedAt: null };
}

// Keep the app's login-only Auth contract; staff visibility is local to handwriting.
function useHandwritingStaffAuth() {
  const { user, loading } = useAuth();
  const [verified, setVerified] = useState<{ user: typeof user; isStaff: boolean } | null>(null);
  useEffect(() => {
    let active = true;
    if (!user) { setVerified(null); return; }
    void user.getIdTokenResult().then(token => {
      if (active) setVerified({ user, isStaff: token.claims.role === "admin" || token.claims.role === "social_worker" });
    }).catch(() => { if (active) setVerified({ user, isStaff: false }); });
    return () => { active = false; };
  }, [user]);
  return { user, isStaff: verified?.user === user && verified?.isStaff === true, loading: loading || Boolean(user && verified?.user !== user) };
}
export function CounselingHandwritingEntry({ targetType, targetId, targetName, initialMemo, label = "✏️ 손글씨 메모", autoOpen = false, onClosed, onDisposed }: Props) {
  const { user, isStaff, loading } = useHandwritingStaffAuth();
  const [open, setOpen] = useState(autoOpen);
  const [memos, setMemos] = useState<HandwritingMemo[]>([]);
  const [selected, setSelected] = useState<HandwritingMemo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const closeRequest = useRef<(() => Promise<void>) | null>(null);
  const uid = user?.uid;
  useEffect(() => {
    if (!open || !uid || !isStaff) return;
    setLoaded(false); setError("");
    if (initialMemo) setSelected(initialMemo);
    return handwritingApi.subscribePending(serverMemos => {
      const values = reconcileHandwritingDrafts(uid, memoTargetKey(targetType, targetId), serverMemos);
      setMemos(values.sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt)));
      setLoaded(true);
    }, e => { setError(handwritingError(e)); setLoaded(true); }, { type: targetType, id: targetId });
  }, [open, uid, isStaff, targetType, targetId, initialMemo]);
  useEffect(() => { if (!loading && (!user || !isStaff)) { setOpen(false); setSelected(null); setMemos([]); } }, [user, isStaff, loading]);
  if (loading || !user || !isStaff || !targetId) return null;
  const close = () => { setSelected(null); setOpen(false); onClosed?.(); };
  return <Dialog open={open} onOpenChange={next => { if (!next && selected) { void closeRequest.current?.(); return; } setOpen(next); if (!next) close(); }}>
    {!autoOpen && <DialogTrigger asChild><Button variant="outline" className="min-h-11 whitespace-normal no-print" onClick={() => { setSelected(initialMemo || null); setOpen(true); }}>{label}</Button></DialogTrigger>}
    <MobileDetailDialogContent className="sm:h-[92dvh] sm:max-w-[1400px] no-print" onPointerDownOutside={e => e.preventDefault()}>
      <MobileDetailDialogHeader><DialogTitle>임시 손글씨 메모</DialogTitle><DialogDescription>{targetName} · {targetType}. 상담내용으로 옮긴 후 삭제해주세요.</DialogDescription></MobileDetailDialogHeader>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-3 sm:p-4">
        {selected ? <Suspense fallback={<p role="status">화이트보드를 불러오는 중…</p>}><Whiteboard key={selected.id} memo={selected} uid={user.uid} targetName={targetName} close={close} closeRequest={closeRequest} onDisposed={() => { setSelected(previous => previous ? { ...previous, strokesJson: "[]" } : null); onDisposed?.(); }} /></Suspense> : <div className="space-y-3 overflow-y-auto">
          {error && <p role="alert">{error}</p>}
          {!loaded && <p role="status">임시 손글씨를 확인하는 중…</p>}
          {loaded && !error && <>
            <p className="text-sm">아직 전사하지 않은 임시 손글씨 {memos.length}건</p>
            {memos.map(memo => <Button key={memo.id} className="h-auto min-h-11 w-full justify-start whitespace-normal text-left" variant="outline" onClick={() => setSelected(memo)}>{getHandwritingDraft(uid, memo.id)?.recovery ? "⚠ 로컬 필기 복구 필요 · " : isStaleMemo(timestampMillis(memo.createdAt)) ? "⚠ 오래된 임시메모 · " : "✏️ "}{timestampMillis(memo.createdAt) ? new Date(timestampMillis(memo.createdAt)).toLocaleString("ko-KR") : "이 브라우저의 미저장 메모"} · 이어보기</Button>)}
            <Button className="min-h-11" onClick={() => setSelected(newMemo(targetType, targetId, user.uid))}>새 상담의 손글씨 시작</Button>
          </>}
        </div>}
      </div>
    </MobileDetailDialogContent>
  </Dialog>;
}

export function PendingHandwritingMemos({ targetName }: { targetName: (type: MemoTargetType, id: string) => string }) {
  const { user, isStaff, loading } = useHandwritingStaffAuth();
  const [memos, setMemos] = useState<HandwritingMemo[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [opened, setOpened] = useState<HandwritingMemo | null>(null);
  const uid = user?.uid;
  useEffect(() => {
    if (!uid || !isStaff) { setMemos([]); setOpened(null); return; }
    return handwritingApi.subscribePending(items => { setMemos(items); setLoaded(true); }, e => { setError(handwritingError(e)); setLoaded(true); });
  }, [uid, isStaff]);
  if (loading || !user || !isStaff) return null;
  if (!loaded) return <p role="status">임시 손글씨 확인 중…</p>;
  if (error) return <p role="alert">{error}</p>;
  if (!memos.length && !opened) return null;
  return <section className="space-y-2 rounded-lg border border-amber-300 bg-amber-50/30 p-3 no-print" aria-label="미전사 임시 손글씨">
    <p className="font-medium">✏️ 전사되지 않은 임시 손글씨 {memos.length}건</p>
    <p className="text-sm">임시자료입니다. 정식 상담내용으로 옮긴 후 삭제해주세요.</p>
    <div className="flex flex-wrap gap-2">{[...memos].sort((a, b) => timestampMillis(a.createdAt) - timestampMillis(b.createdAt)).map(memo => <Button key={memo.id} variant="outline" className="min-h-11 whitespace-normal" onClick={() => setOpened(memo)}>{isStaleMemo(timestampMillis(memo.createdAt)) ? "⚠ 3일 이상 지난 메모 · " : ""}{targetName(memo.targetType, memo.targetId)} 이어보기</Button>)}</div>
    {opened && <CounselingHandwritingEntry key={opened.id} initialMemo={opened} autoOpen targetType={opened.targetType} targetId={opened.targetId} targetName={targetName(opened.targetType, opened.targetId)} onClosed={() => setOpened(null)} onDisposed={() => setOpened(previous => previous ? { ...previous, strokesJson: "[]" } : null)} />}
  </section>;
}
