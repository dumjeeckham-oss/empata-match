import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { eventFormApi, listEventForms } from "@/lib/eventFormApi";
import type { EventFormSlot } from "@/types/eventForms";
import { useToast } from "@/hooks/use-toast";

const STATUS_LABEL = { draft: "준비 중", open: "접수 중", closed: "마감", archived: "보관" } as const;
const STATUS_CLASS = { draft: "bg-amber-100 text-amber-800", open: "bg-emerald-100 text-emerald-800", closed: "bg-slate-200 text-slate-700", archived: "bg-slate-100 text-slate-500" } as const;

export default function EventForms() {
  const [forms, setForms] = useState<EventFormSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const reload = useCallback(async () => {
    setLoading(true);
    try { setForms(await listEventForms()); }
    catch (error) { toast({ title: "폼 목록을 불러오지 못했습니다", description: error instanceof Error ? error.message : String(error), variant: "destructive" }); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { void reload(); }, [reload]);

  const create = async () => {
    setCreating(true);
    try {
      const result = await eventFormApi.create("새 행사·교육 신청서");
      navigate(`/event-forms/${result.formId}/edit`);
    } catch (error) {
      toast({ title: "폼을 만들지 못했습니다", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally { setCreating(false); }
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="text-2xl font-bold">행사·교육 참여 신청</h1><p className="text-sm text-muted-foreground">문항을 자유롭게 만들고 고정 공유 링크와 회차별 결과를 관리합니다.</p></div>
        <div className="flex gap-2"><Button variant="outline" onClick={() => void reload()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />새로고침</Button><Button onClick={() => void create()} disabled={creating}><Plus className="mr-2 h-4 w-4" />새 폼</Button></div>
      </div>
      {loading ? <div className="py-16 text-center text-muted-foreground">불러오는 중...</div> : forms.length === 0 ? (
        <Card><CardContent className="py-16 text-center"><p className="mb-4 text-muted-foreground">아직 만든 신청서가 없습니다.</p><Button onClick={() => void create()}><Plus className="mr-2 h-4 w-4" />첫 폼 만들기</Button></CardContent></Card>
      ) : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{forms.map((form) => (
        <Card key={form.id} className="overflow-hidden">
          <CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><CardTitle className="text-lg">{form.title}</CardTitle><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_CLASS[form.status]}`}>{STATUS_LABEL[form.status]}</span></div></CardHeader>
          <CardContent className="space-y-3"><p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">{form.description || "안내 설명 없음"}</p><div className="flex flex-wrap gap-2"><Button asChild size="sm"><Link to={`/event-forms/${form.id}/edit`}>편집</Link></Button><Button asChild size="sm" variant="outline"><Link to={`/event-forms/${form.id}/results`}>결과</Link></Button></div></CardContent>
        </Card>
      ))}</div>}
    </section>
  );
}
