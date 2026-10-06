import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { eventFormApi, listEventForms } from "@/lib/eventFormSparkApi";
import { auth, usingFirebaseEmulators } from "@/lib/firebase";
import { linkExistingEventForm, loadEventFormSlotRegistry } from "@/lib/eventFormResetApi";
import { EVENT_FORM_SLOT_NUMBERS } from "@/lib/eventFormReuse";
import { EventFormResetPanel } from "@/components/EventFormResetPanel";
import { createPublicEventFormUrl } from "@/lib/publicEventFormUrl";
import type { EventFormSlot } from "@/types/eventForms";
import { useToast } from "@/hooks/use-toast";

const STATUS = { draft: "초안", open: "접수 중", closed: "마감", archived: "보관", resetting: "초기화 중" };
export default function EventForms() {
  const [forms, setForms] = useState<EventFormSlot[]>([]);
  const [slots, setSlots] = useState<{ slotNumber: 1 | 2; formId: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [admin, setAdmin] = useState(false);
  const { toast } = useToast();
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setForms(await listEventForms());
      if (usingFirebaseEmulators) setSlots(await loadEventFormSlotRegistry());
      setAdmin((await auth.currentUser?.getIdTokenResult())?.claims.role === "admin");
    } catch { toast({ title: "목록을 불러오지 못했습니다. 다시 시도해주세요.", variant: "destructive" }); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { void reload(); }, [reload]);
  const run = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    try { await operation(); await reload(); }
    catch (error) { toast({ title: "작업 실패", description: error instanceof Error ? error.message : "다시 시도해주세요.", variant: "destructive" }); }
    finally { setBusy(false); }
  };
  const unlinked = forms.filter((form) => !slots.some((slot) => slot.formId === form.id));
  return <section className="min-w-0 space-y-5">
    <div className="flex flex-wrap justify-between gap-3"><div><h1 className="text-2xl font-bold">재활용 행사·교육 입력폼</h1><p>고정 링크 2개를 독립적으로 운영합니다.</p></div><Button variant="outline" disabled={loading || busy} onClick={() => void reload()}>새로고침</Button></div>
    {!usingFirebaseEmulators && <p>슬롯 연결과 완전 초기화는 현재 로컬 Emulator 전용입니다.</p>}
    {loading ? <p>불러오는 중...</p> : <div className="grid min-w-0 gap-4 md:grid-cols-2">{EVENT_FORM_SLOT_NUMBERS.map((number) => {
      const form = forms.find((item) => item.id === slots.find((slot) => slot.slotNumber === number)?.formId);
      const url = form ? createPublicEventFormUrl(form.publicToken) : "";
      return <Card key={number} className="min-w-0 overflow-hidden"><CardHeader><CardTitle>입력폼 {number} · {form?.title || "연결 대기"}</CardTitle></CardHeader><CardContent className="space-y-3">
        {form ? <><p>{STATUS[form.status]}</p><p className="whitespace-pre-wrap break-words text-sm">{form.description}</p><p className="break-all text-sm">{url}</p><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={!url} onClick={() => void navigator.clipboard.writeText(url)}>고정 주소 복사</Button>{form.status !== "resetting" && <Button asChild size="sm"><Link to={`/event-forms/${form.id}/edit`}>편집·미리보기</Link></Button>}<Button asChild size="sm" variant="outline"><Link to={`/event-forms/${form.id}/results`}>결과·인쇄</Link></Button></div>{usingFirebaseEmulators && <EventFormResetPanel form={form} admin={admin} onComplete={reload} />}</> : <>
          <p className="text-sm">기존 자료는 삭제하거나 덮어쓰지 않습니다.</p>
          {unlinked.length ? <select aria-label={`입력폼 ${number} 기존 폼 연결`} className="w-full min-w-0 rounded border p-2" value="" disabled={busy || !usingFirebaseEmulators} onChange={(event) => { const id = event.target.value; if (id) void run(() => linkExistingEventForm(number, id)); }}><option value="">기존 폼 선택</option>{unlinked.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select> : <Button disabled={busy || !usingFirebaseEmulators} onClick={() => void run(() => eventFormApi.create(`입력폼 ${number}`, number))}>빈 슬롯 만들기</Button>}
        </>}
      </CardContent></Card>;
    })}</div>}
    {unlinked.length > 0 && <div className="rounded border p-3"><h2>연결하지 않은 기존 자료: {unlinked.length}개</h2><p className="text-sm">슬롯에 연결하지 않은 자료도 보존됩니다.</p>{unlinked.map((form) => <p key={form.id}><Link className="underline" to={`/event-forms/${form.id}/results`}>{form.title} · 보존 결과</Link></p>)}</div>}
  </section>;
}
