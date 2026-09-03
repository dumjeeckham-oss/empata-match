import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ExternalLink, Pencil, Plus, Search, Star, Trash2, UserRoundSearch, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCollection } from "@/hooks/useFirestore";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  ANNUAL_SCHEDULES_COLLECTION, MATCHING_BOARD_COLLECTION, USERS_COLLECTION,
  WORKERS_COLLECTION, WORK_TODOS_COLLECTION,
} from "@/lib/collectionNames";
import type {
  AnnualSchedule, AnnualScheduleStatus, MatchingBoardItem, ServiceUser, Worker, WorkTodo,
} from "@/types";

const quickLinks = [
  { label: "공지사항 수정", url: "https://app.notion.com/p/2c43f84ca160805ba164c94fb1642186", icon: "📣" },
  { label: "입사서류 안내", url: "", icon: "📁" },
  { label: "dong100.org", url: "https://dong100.org", icon: "🌐" },
  { label: "상담프로그램 (사례관리 생태도 가계도)", url: "https://canva.link/oxaa2j2npzo6y2b", icon: "🧩" },
  { label: "동백 활동지원사 업무 앱", url: "https://support.dong100.org/", icon: "📱" },
  { label: "동백 활동지원사 업무 수정", url: "https://easy-guide-pro-cms.netlify.app/", icon: "🛠️" },
  { label: "이사장 간담회", url: "https://naver.me/FJOPPWI2", icon: "🤝" },
] as const;

const emptySchedule: Omit<AnnualSchedule, "id" | "createdAt" | "updatedAt"> = {
  projectName: "", status: "예정", scheduleDate: "", note: "", manager: "",
};
const exampleSchedule: Omit<AnnualSchedule, "id" | "createdAt" | "updatedAt"> = {
  projectName: "유해위험요인 조사",
  status: "진행중",
  scheduleDate: "2026/07/13 → 2026/07/17",
  note: "-수요조사링크:6/29~7/3(일주일)",
  manager: "김광민",
};
const statusClass: Record<AnnualScheduleStatus, string> = {
  진행중: "border-blue-200 bg-blue-100 text-blue-700",
  예정: "border-amber-200 bg-amber-100 text-amber-700",
  완료: "border-slate-200 bg-slate-100 text-slate-600",
};
const EMPTY_TODOS: (WorkTodo & { id: string })[] = [];
const EMPTY_MATCHING_ITEMS: (MatchingBoardItem & { id: string })[] = [];
const EMPTY_SCHEDULES: (AnnualSchedule & { id: string })[] = [];
const EMPTY_USERS: (ServiceUser & { id: string })[] = [];
const EMPTY_WORKERS: (Worker & { id: string })[] = [];

const WorkBoard = () => {
  const navigate = useNavigate();
  const todosStore = useCollection<WorkTodo>(WORK_TODOS_COLLECTION);
  const matchingStore = useCollection<MatchingBoardItem>(MATCHING_BOARD_COLLECTION);
  const scheduleStore = useCollection<AnnualSchedule>(ANNUAL_SCHEDULES_COLLECTION);
  const usersStore = useCollection<ServiceUser>(USERS_COLLECTION);
  const workersStore = useCollection<Worker>(WORKERS_COLLECTION);
  const todos = todosStore.data || EMPTY_TODOS;
  const matchingItems = matchingStore.data || EMPTY_MATCHING_ITEMS;
  const schedules = scheduleStore.data || EMPTY_SCHEDULES;
  const users = usersStore.data || EMPTY_USERS;
  const workers = workersStore.data || EMPTY_WORKERS;
  const loading = todosStore.loading || matchingStore.loading || scheduleStore.loading || usersStore.loading || workersStore.loading;
  const loadError = todosStore.error || matchingStore.error || scheduleStore.error || usersStore.error || workersStore.error;

  const [todoTitle, setTodoTitle] = useState("");
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [matchingDialogOpen, setMatchingDialogOpen] = useState(false);
  const [targetType, setTargetType] = useState<MatchingBoardItem["targetType"]>("이용자");
  const [targetSearch, setTargetSearch] = useState("");
  const [targetId, setTargetId] = useState("");
  const [matchingCondition, setMatchingCondition] = useState("");
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduleForm, setScheduleForm] = useState(emptySchedule);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [missingLinkDialogOpen, setMissingLinkDialogOpen] = useState(false);
  const [onboardingUrl, setOnboardingUrl] = useState(() => localStorage.getItem("quickLink_onboarding") || "");
  const seededExample = useRef(false);

  useEffect(() => {
    if (loading || loadError || seededExample.current || schedules.length > 0) return;
    seededExample.current = true;
    void scheduleStore.add(exampleSchedule).catch(() => {
      seededExample.current = false;
      toast({ title: "예시 일정을 등록하지 못했습니다.", variant: "destructive" });
    });
  }, [loadError, loading, scheduleStore, schedules.length]);

  useEffect(() => {
    if (loading || loadError || matchingItems.length === 0) return;
    const completedIds = matchingItems.filter((item) => {
      const target = item.targetType === "이용자"
        ? users.find((user) => user.id === item.targetId)
        : workers.find((worker) => worker.id === item.targetId);
      return item.targetType === "이용자"
        ? target?.contractStatus === "서비스중"
        : target?.contractStatus === "근무중";
    }).map((item) => item.id).filter((id): id is string => Boolean(id));
    if (completedIds.length === 0) return;
    void Promise.all(completedIds.map(matchingStore.remove))
      .then(() => toast({ title: "매칭 완료 대상 자동 정리", description: `${completedIds.length}명을 명단에서 제거했습니다.` }))
      .catch(() => toast({ title: "매칭 완료 대상 자동 정리에 실패했습니다.", variant: "destructive" }));
  }, [loadError, loading, matchingItems, matchingStore.remove, users, workers]);

  if (loading) {
    return <div className="flex min-h-[320px] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" /></div>;
  }
  if (loadError) {
    return <Card className="border-destructive/40"><CardContent className="py-10 text-center text-sm text-destructive">업무 종합 보드 데이터를 불러오지 못했습니다.<br />{loadError}</CardContent></Card>;
  }

  const selectedPool = targetType === "이용자" ? users : workers;
  const query = targetSearch.trim().toLowerCase();
  const matchingCandidates = (query ? selectedPool.filter((item) => item.name.toLowerCase().includes(query)) : selectedPool).slice(0, 8);
  const visibleTodos = todos
    .filter((todo) => showCompleted || !todo.completed)
    .sort((a, b) => Number(b.important) - Number(a.important) || Number(a.completed) - Number(b.completed));

  const saveTodo = async () => {
    const title = todoTitle.trim();
    if (!title) return;
    if (editingTodoId) {
      await todosStore.update(editingTodoId, { title });
      setEditingTodoId(null);
    } else {
      await todosStore.add({ title, completed: false, important: false });
    }
    setTodoTitle("");
  };
  const clearCompleted = async () => {
    const ids = todos.filter((todo) => todo.completed && todo.id).map((todo) => todo.id as string);
    if (!ids.length || !confirm(`완료한 할 일 ${ids.length}개를 비울까요?`)) return;
    await Promise.all(ids.map(todosStore.remove));
    toast({ title: "완료 항목을 비웠습니다." });
  };
  const saveMatchingItem = async () => {
    const target = selectedPool.find((item) => item.id === targetId);
    if (!target || !matchingCondition.trim()) {
      toast({ title: "대상자와 매칭 필요 조건을 입력해주세요.", variant: "destructive" });
      return;
    }
    if (matchingItems.some((item) => item.targetType === targetType && item.targetId === target.id)) {
      toast({ title: "이미 명단에 등록된 대상입니다.", variant: "destructive" });
      return;
    }
    await matchingStore.add({ targetType, targetId: target.id, targetName: target.name, condition: matchingCondition.trim() });
    setMatchingDialogOpen(false);
    setTargetId("");
    setTargetSearch("");
    setMatchingCondition("");
  };
  const openScheduleDialog = (schedule?: AnnualSchedule & { id: string }) => {
    if (schedule) {
      setEditingScheduleId(schedule.id);
      setScheduleForm({
        projectName: schedule.projectName, status: schedule.status, scheduleDate: schedule.scheduleDate,
        note: schedule.note, manager: schedule.manager,
      });
    } else {
      setEditingScheduleId(null);
      setScheduleForm(emptySchedule);
    }
    setScheduleDialogOpen(true);
  };
  const saveSchedule = async () => {
    if (!scheduleForm.projectName.trim() || !scheduleForm.scheduleDate.trim() || !scheduleForm.manager.trim()) {
      toast({ title: "사업명, 시행날짜, 담당을 입력해주세요.", variant: "destructive" });
      return;
    }
    if (editingScheduleId) await scheduleStore.update(editingScheduleId, scheduleForm);
    else await scheduleStore.add(scheduleForm);
    setScheduleDialogOpen(false);
  };
  const openQuickLink = (url: string) => {
    const destination = url || onboardingUrl;
    if (!destination) return setMissingLinkDialogOpen(true);
    window.open(destination, "_blank", "noopener,noreferrer");
  };
  const saveOnboardingLink = () => {
    try {
      const normalized = new URL(onboardingUrl.trim()).toString();
      if (!["http:", "https:"].includes(new URL(normalized).protocol)) throw new Error("invalid protocol");
      localStorage.setItem("quickLink_onboarding", normalized);
      setOnboardingUrl(normalized);
      setMissingLinkDialogOpen(false);
      toast({ title: "입사서류 안내 링크를 저장했습니다." });
    } catch {
      toast({ title: "http:// 또는 https://로 시작하는 올바른 URL을 입력해주세요.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="page-header">업무 종합 보드</h1><p className="mt-1 text-sm text-muted-foreground">오늘의 업무와 매칭, 연간 일정을 한곳에서 관리합니다.</p></div>
        <Button variant="outline" onClick={() => navigate("/")}>대시보드로 이동</Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader className="bg-muted/30"><CardTitle className="flex items-center justify-between text-lg"><span>✅ 할 일 목록</span><Badge variant="secondary">미완료 {todos.filter((todo) => !todo.completed).length}</Badge></CardTitle></CardHeader>
          <CardContent className="space-y-4 pt-5">
            <div className="flex gap-2"><Input value={todoTitle} onChange={(event) => setTodoTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveTodo(); }} placeholder="할 일을 입력하세요" /><Button onClick={() => void saveTodo()}><Plus className="mr-1 h-4 w-4" />{editingTodoId ? "수정" : "추가"}</Button></div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><label className="flex items-center gap-2"><Checkbox checked={showCompleted} onCheckedChange={(checked) => setShowCompleted(checked === true)} />완료한 항목 모아보기</label><Button variant="ghost" size="sm" onClick={() => void clearCompleted()}>완료 항목 비우기</Button></div>
            <div className="max-h-80 divide-y overflow-y-auto">
              {!visibleTodos.length ? <p className="py-10 text-center text-sm text-muted-foreground">표시할 할 일이 없습니다.</p> : visibleTodos.map((todo) => (
                <div key={todo.id} className="flex items-center gap-2 py-3">
                  <Checkbox checked={todo.completed} onCheckedChange={(checked) => todo.id && void todosStore.update(todo.id, { completed: checked === true })} />
                  <span className={cn("min-w-0 flex-1 text-sm", todo.completed && "text-muted-foreground line-through")}>{todo.title}</span>
                  <Button variant="ghost" size="icon" aria-label="중요도 변경" onClick={() => todo.id && void todosStore.update(todo.id, { important: !todo.important })}><Star className={cn("h-4 w-4", todo.important && "fill-amber-400 text-amber-500")} /></Button>
                  <Button variant="ghost" size="icon" aria-label="수정" onClick={() => { setEditingTodoId(todo.id || null); setTodoTitle(todo.title); }}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" aria-label="삭제" onClick={() => todo.id && void todosStore.remove(todo.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="bg-muted/30"><CardTitle className="text-lg">🔗 바로 가기</CardTitle></CardHeader>
          <CardContent className="grid gap-3 pt-5 sm:grid-cols-2">
            {quickLinks.map((link) => <button key={link.label} onClick={() => openQuickLink(link.url)} className="group flex min-h-20 items-center gap-3 rounded-xl border bg-card p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"><span className="text-2xl">{link.icon}</span><span className="flex-1 text-sm font-semibold leading-snug">{link.label}</span><ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary" /></button>)}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between bg-muted/30"><CardTitle className="text-lg">🎯 매칭 필요 명단</CardTitle><Button size="sm" onClick={() => setMatchingDialogOpen(true)}><UserRoundSearch className="mr-1 h-4 w-4" />명단 추가</Button></CardHeader>
        <CardContent className="pt-5">
          {!matchingItems.length ? <p className="py-10 text-center text-sm text-muted-foreground">현재 매칭이 필요한 등록 대상이 없습니다.</p> : <div className="grid gap-3 md:grid-cols-2">{matchingItems.map((item) => (
            <div key={item.id} className="flex items-start gap-3 rounded-xl border p-4">
              <Badge variant="outline" className="shrink-0">{item.targetType}</Badge>
              <div className="min-w-0 flex-1"><button className="font-semibold text-primary hover:underline" onClick={() => navigate(item.targetType === "이용자" ? `/users?detailId=${encodeURIComponent(item.targetId)}` : `/workers?detailId=${encodeURIComponent(item.targetId)}`)}>{item.targetName}</button><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{item.condition}</p></div>
              <Button variant="ghost" size="icon" aria-label={`${item.targetName} 제거`} onClick={() => item.id && void matchingStore.remove(item.id)}><X className="h-4 w-4" /></Button>
            </div>
          ))}</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between bg-muted/30"><CardTitle className="text-lg">📅 연간 일정 현황</CardTitle><Button size="sm" onClick={() => openScheduleDialog()}><Plus className="mr-1 h-4 w-4" />신규 일정</Button></CardHeader>
        <CardContent className="pt-5"><div className="overflow-x-auto"><table className="w-full min-w-[840px] text-sm"><thead><tr className="border-b bg-muted/40"><th className="px-3 py-3 text-left">연간사업명</th><th className="px-3 py-3 text-left">상태</th><th className="px-3 py-3 text-left">시행날짜</th><th className="px-3 py-3 text-left">비고</th><th className="px-3 py-3 text-left">담당</th><th className="px-3 py-3 text-right">관리</th></tr></thead><tbody>
          {!schedules.length ? <tr><td colSpan={6} className="py-12 text-center text-muted-foreground">일정을 준비하고 있습니다.</td></tr> : schedules.map((schedule) => <tr key={schedule.id} className="border-b hover:bg-muted/20"><td className="px-3 py-3 font-medium">{schedule.projectName}</td><td className="px-3 py-3"><Badge variant="outline" className={statusClass[schedule.status]}>{schedule.status}</Badge></td><td className="whitespace-nowrap px-3 py-3">{schedule.scheduleDate}</td><td className="max-w-xs whitespace-pre-wrap px-3 py-3 text-muted-foreground">{schedule.note || "-"}</td><td className="px-3 py-3">{schedule.manager}</td><td className="px-3 py-3"><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" aria-label="일정 수정" onClick={() => openScheduleDialog(schedule)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label="일정 삭제" onClick={() => schedule.id && confirm("이 일정을 삭제할까요?") && void scheduleStore.remove(schedule.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div></td></tr>)}
        </tbody></table></div></CardContent>
      </Card>

      <Dialog open={matchingDialogOpen} onOpenChange={setMatchingDialogOpen}><DialogContent><DialogHeader><DialogTitle>매칭 필요 대상 추가</DialogTitle></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label>대상 구분</Label><Select value={targetType} onValueChange={(value) => { setTargetType(value as MatchingBoardItem["targetType"]); setTargetId(""); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="이용자">이용자</SelectItem><SelectItem value="활동지원사">활동지원사</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>이름 검색</Label><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={targetSearch} onChange={(event) => setTargetSearch(event.target.value)} placeholder="이름을 입력하세요" /></div><div className="max-h-40 divide-y overflow-y-auto rounded-md border">{matchingCandidates.map((candidate) => <button key={candidate.id} className={cn("flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted", targetId === candidate.id && "bg-primary/10 text-primary")} onClick={() => setTargetId(candidate.id)}><span>{candidate.name}</span>{targetId === candidate.id && <Check className="h-4 w-4" />}</button>)}</div></div><div className="space-y-2"><Label>매칭 필요 조건 *</Label><Textarea value={matchingCondition} onChange={(event) => setMatchingCondition(event.target.value)} placeholder="예: 10:00~14:00 중동 인근 9월부터 매칭필요" /></div></div><DialogFooter><Button variant="outline" onClick={() => setMatchingDialogOpen(false)}>취소</Button><Button onClick={() => void saveMatchingItem()}>등록</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>{editingScheduleId ? "연간 일정 수정" : "신규 연간 일정"}</DialogTitle></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2 sm:col-span-2"><Label>연간사업명 *</Label><Input value={scheduleForm.projectName} onChange={(event) => setScheduleForm({ ...scheduleForm, projectName: event.target.value })} placeholder="유해위험요인 조사" /></div><div className="space-y-2"><Label>상태</Label><Select value={scheduleForm.status} onValueChange={(value) => setScheduleForm({ ...scheduleForm, status: value as AnnualScheduleStatus })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="진행중">진행중</SelectItem><SelectItem value="예정">예정</SelectItem><SelectItem value="완료">완료</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>담당 *</Label><Input value={scheduleForm.manager} onChange={(event) => setScheduleForm({ ...scheduleForm, manager: event.target.value })} placeholder="김광민" /></div><div className="space-y-2 sm:col-span-2"><Label>시행날짜 *</Label><Input value={scheduleForm.scheduleDate} onChange={(event) => setScheduleForm({ ...scheduleForm, scheduleDate: event.target.value })} placeholder="2026/07/13 → 2026/07/17" /></div><div className="space-y-2 sm:col-span-2"><Label>비고</Label><Textarea value={scheduleForm.note} onChange={(event) => setScheduleForm({ ...scheduleForm, note: event.target.value })} placeholder="-수요조사링크:6/29~7/3(일주일)" /></div></div><DialogFooter><Button variant="outline" onClick={() => setScheduleDialogOpen(false)}>취소</Button><Button onClick={() => void saveSchedule()}>{editingScheduleId ? "수정 저장" : "일정 추가"}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={missingLinkDialogOpen} onOpenChange={setMissingLinkDialogOpen}><DialogContent><DialogHeader><DialogTitle>입사서류 안내 링크 입력</DialogTitle></DialogHeader><div className="space-y-2"><Label>URL</Label><Input value={onboardingUrl} onChange={(event) => setOnboardingUrl(event.target.value)} placeholder="https://..." /><p className="text-xs text-muted-foreground">현재 브라우저에 저장되며 다음부터 새 탭에서 열립니다.</p></div><DialogFooter><Button variant="outline" onClick={() => setMissingLinkDialogOpen(false)}>취소</Button><Button onClick={saveOnboardingLink}>저장</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
};

export default WorkBoard;
