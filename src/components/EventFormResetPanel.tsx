import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { eventFormApi } from "@/lib/eventFormSparkApi";
import { exportAllEventFormRounds, loadEventFormResetSummary, resetEventForm } from "@/lib/eventFormResetApi";
import type { EventFormSlot } from "@/types/eventForms";

export function EventFormResetPanel({ form, admin, onComplete }: { form: EventFormSlot; admin: boolean; onComplete: () => Promise<void> }) {
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof loadEventFormResetSummary>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState("");
  useEffect(() => { let active = true; void loadEventFormResetSummary(form.id!).then((value) => { if (active) setSummary(value); }).catch(() => { if (active) setMessage("사용량 정보를 불러오지 못했습니다."); }); return () => { active = false; }; }, [form]);
  useEffect(() => {
    if (!busy) return;
    const preventClose = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", preventClose);
    return () => window.removeEventListener("beforeunload", preventClose);
  }, [busy]);
  const perform = async (operation: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true); setMessage("");
    try { await operation(); setSummary(await loadEventFormResetSummary(form.id!)); await onComplete(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "작업이 중단되었습니다. 다시 접속해 재개해주세요."); }
    finally { setBusy(false); }
  };
  const receipt = (summary?.form as EventFormSlot & { lastExportReceipt?: { downloadedAt: string } } | undefined)?.lastExportReceipt;
  return <div className="space-y-3">
    <p className="text-sm">현재/전체 응답: {summary ? `${summary.groups[0].snapshot.docs.filter((item) => item.data().roundId === form.activeRoundId).length}/${summary.count}건` : "확인 중"} · 예상 저장량 {summary ? `${(summary.estimatedBytes / 1024).toFixed(1)}KB` : "확인 중"}</p>
    <p className="text-xs">마지막 전체 엑셀 저장: {receipt?.downloadedAt || "없음"}</p>
    <Button size="sm" variant="outline" disabled={busy || form.status === "resetting"} onClick={() => void perform(() => eventFormApi.setStatus(form.id!, "closed"))}>접수 마감</Button>
    <Button size="sm" variant="outline" disabled={busy || form.status === "resetting"} onClick={() => void perform(async () => { await eventFormApi.setStatus(form.id!, "closed"); await exportAllEventFormRounds(form.id!); setSaved(false); })}>접수 마감 후 전체 엑셀 저장</Button>
    {admin && <div className="rounded border border-destructive/50 bg-destructive/5 p-3"><p className="mb-2 text-sm font-semibold text-destructive">위험 영역: 과거 회차까지 영구 삭제</p><Dialog open={open} onOpenChange={(value) => { if (!busy) { setOpen(value); if (value) { setTitle(""); setSaved(false); } } }}><DialogTrigger asChild><Button variant="destructive" size="sm" disabled={busy || !summary}>{form.status === "resetting" ? "초기화 재개" : "완전 초기화"}</Button></DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>완전 초기화 확인</DialogTitle><DialogDescription>이 폼의 모든 응답·메모·과거 회차·문항·이미지가 삭제됩니다. 고정 링크와 슬롯은 유지되며 다른 슬롯에는 영향이 없습니다.</DialogDescription></DialogHeader>
        {summary?.count === 0 ? <p>저장된 응답이 없습니다.</p> : <label className="flex min-h-11 items-start gap-2"><Checkbox checked={saved} disabled={busy} onCheckedChange={(value) => setSaved(value === true)} />엑셀 파일이 저장됐음을 확인했습니다</label>}
        <label className="text-sm">폼 제목을 다시 입력: <strong className="break-words">{form.title}</strong><Input value={title} disabled={busy} onChange={(event) => setTitle(event.target.value)} /></label>
        <p className="text-sm">브라우저를 닫지 마세요. 중간 실패 시 같은 관리자가 다시 접속하여 재개할 수 있습니다.</p><p role="status">{progress}</p>
        <DialogFooter><DialogClose asChild><Button type="button" variant="outline" disabled={busy}>취소</Button></DialogClose><Button variant="destructive" disabled={busy || !admin || (form.status !== "resetting" && (title !== form.title || (Boolean(summary?.count) && !saved)))} onClick={() => void perform(async () => { await resetEventForm(form.id!, saved, title, (deleted, total) => setProgress(`${deleted}/${total}개 문서 삭제`)); setOpen(false); })}>{busy ? "초기화 진행 중..." : form.status === "resetting" ? "중단된 초기화 재개" : "확인 후 영구 초기화"}</Button></DialogFooter>
      </DialogContent>
    </Dialog></div>}
    {message && <p role="alert" className="break-words text-sm text-destructive">{message}</p>}
  </div>;
}
