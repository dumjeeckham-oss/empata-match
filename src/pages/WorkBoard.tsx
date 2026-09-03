import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock, CalendarDays, Check, ChevronLeft, ChevronRight, ExternalLink, Pencil, Plus, Search, Star, Trash2, UserRoundSearch, X } from "lucide-react";
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
import { assignCalendarEventLanes, buildMonthGrid, eventsForCalendarDay, toLocalYmd } from "@/lib/workCalendar";
import { formatScheduleMilestones, formatScheduleSummary, getAssignmentCount, getBoardRecommendations, getScheduleStartInfo, getVisibleScheduleStarts, shouldAutoRemoveMatchingItem } from "@/lib/workBoard";
import {
  ANNUAL_SCHEDULES_COLLECTION, MATCHING_BOARD_COLLECTION, USERS_COLLECTION, WORK_CALENDAR_EVENTS_COLLECTION,
  WORKERS_COLLECTION, WORK_TODOS_COLLECTION,
} from "@/lib/collectionNames";
import type {
  AnnualSchedule, AnnualScheduleMilestone, AnnualScheduleStatus, CalendarEventColor, MatchingBoardItem, ServiceUser, Worker, WorkCalendarEvent, WorkTodo,
} from "@/types";
import dongbaekCenterLogo from "@/assets/dongbaek-center-logo.png";

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
  projectName: "", status: "예정", preparationStartDate: "", milestones: [], scheduleDate: "", note: "", manager: "",
};
const createMilestone = (): AnnualScheduleMilestone => ({
  id: `milestone-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  label: "",
  date: "",
});
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
const EMPTY_CALENDAR_EVENTS: (WorkCalendarEvent & { id: string })[] = [];
const emptyCalendarEvent = (date: string): Omit<WorkCalendarEvent, "id" | "createdAt" | "updatedAt"> => ({
  title: "", note: "", startDate: date, endDate: date, color: "blue",
});
const calendarColorClass: Record<CalendarEventColor, string> = {
  blue: "bg-blue-500 text-white", green: "bg-emerald-500 text-white", amber: "bg-amber-400 text-amber-950",
  rose: "bg-rose-500 text-white", violet: "bg-violet-500 text-white", slate: "bg-slate-500 text-white",
};
const calendarColorLabel: Record<CalendarEventColor, string> = { blue: "파랑", green: "초록", amber: "노랑", rose: "빨강", violet: "보라", slate: "회색" };

const WorkBoard = () => {
  const navigate = useNavigate();
  const todosStore = useCollection<WorkTodo>(WORK_TODOS_COLLECTION);
  const matchingStore = useCollection<MatchingBoardItem>(MATCHING_BOARD_COLLECTION);
  const scheduleStore = useCollection<AnnualSchedule>(ANNUAL_SCHEDULES_COLLECTION);
  const usersStore = useCollection<ServiceUser>(USERS_COLLECTION);
  const workersStore = useCollection<Worker>(WORKERS_COLLECTION);
  const calendarStore = useCollection<WorkCalendarEvent>(WORK_CALENDAR_EVENTS_COLLECTION);
  const todos = todosStore.data || EMPTY_TODOS;
  const matchingItems = matchingStore.data || EMPTY_MATCHING_ITEMS;
  const schedules = scheduleStore.data || EMPTY_SCHEDULES;
  const users = usersStore.data || EMPTY_USERS;
  const workers = workersStore.data || EMPTY_WORKERS;
  const calendarEvents = calendarStore.data || EMPTY_CALENDAR_EVENTS;
  const loading = todosStore.loading || matchingStore.loading || scheduleStore.loading || usersStore.loading || workersStore.loading || calendarStore.loading;
  const loadError = todosStore.error || matchingStore.error || scheduleStore.error || usersStore.error || workersStore.error || calendarStore.error;

  const [todoTitle, setTodoTitle] = useState("");
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [matchingDialogOpen, setMatchingDialogOpen] = useState(false);
  const [targetType, setTargetType] = useState<MatchingBoardItem["targetType"]>("이용자");
  const [matchMode, setMatchMode] = useState<NonNullable<MatchingBoardItem["matchMode"]>>("1:1");
  const [targetSearch, setTargetSearch] = useState("");
  const [targetId, setTargetId] = useState("");
  const [matchingCondition, setMatchingCondition] = useState("");
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduleForm, setScheduleForm] = useState(emptySchedule);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [missingLinkDialogOpen, setMissingLinkDialogOpen] = useState(false);
  const [onboardingUrl, setOnboardingUrl] = useState(() => localStorage.getItem("quickLink_onboarding") || "");
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [calendarDialogOpen, setCalendarDialogOpen] = useState(false);
  const [editingCalendarEventId, setEditingCalendarEventId] = useState<string | null>(null);
  const [calendarForm, setCalendarForm] = useState(() => emptyCalendarEvent(toLocalYmd(new Date())));
  useEffect(() => {
    if (loading || loadError || matchingItems.length === 0) return;
    const completedIds = matchingItems.filter((item) => {
      const target = item.targetType === "이용자"
        ? users.find((user) => user.id === item.targetId)
        : workers.find((worker) => worker.id === item.targetId);
      return shouldAutoRemoveMatchingItem(item, target);
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
  const selectedTarget = selectedPool.find((item) => item.id === targetId);
  const currentServiceInfo = (() => {
    if (!selectedTarget || matchMode !== "1:다") return [];
    if (targetType === "이용자") {
      const user = selectedTarget as ServiceUser;
      return [
        `현재 배정 지원사: ${user.assignedHelperNames?.filter(Boolean).join(", ") || "없음"}`,
        `등록된 이용시간: ${formatScheduleSummary(user.weeklySchedule, user.requiredDays, user.requiredHours)}`,
      ];
    }
    const worker = selectedTarget as Worker;
    const assignedUsers = (worker.assignedUserIds || [])
      .map((id) => users.find((user) => user.id === id))
      .filter((user): user is ServiceUser & { id: string } => Boolean(user));
    const lines = assignedUsers.map((user) =>
      `${user.name}: ${formatScheduleSummary(user.weeklySchedule, user.requiredDays, user.requiredHours)}`
    );
    if (!lines.length && worker.assignedUserNames?.length) {
      lines.push(`현재 배정 이용자: ${worker.assignedUserNames.filter(Boolean).join(", ")} (시간 정보 없음)`);
    }
    return [
      `지원 가능시간: ${formatScheduleSummary(worker.weeklySchedule, worker.availableDays, worker.availableHours)}`,
      ...lines,
    ];
  })();
  const visibleTodos = todos
    .filter((todo) => showCompleted || !todo.completed)
    .sort((a, b) => Number(b.important) - Number(a.important) || Number(a.completed) - Number(b.completed));
  const scheduleStartItems = getVisibleScheduleStarts(schedules);
  const recommendationMap = new Map(
    matchingItems.map((item) => [item.id, getBoardRecommendations(item, users, workers)]),
  );
  const calendarDays = buildMonthGrid(calendarMonth.getFullYear(), calendarMonth.getMonth());
  const calendarEventsWithLanes = assignCalendarEventLanes(calendarEvents);
  const today = toLocalYmd(new Date());

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
    await matchingStore.add({
      targetType,
      targetId: target.id,
      targetName: target.name,
      condition: matchingCondition.trim(),
      matchMode,
      existingAssignmentCount: getAssignmentCount(targetType, target),
    });
    setMatchingDialogOpen(false);
    setTargetId("");
    setTargetSearch("");
    setMatchingCondition("");
    setMatchMode("1:1");
  };
  const openScheduleDialog = (schedule?: AnnualSchedule & { id: string }) => {
    if (schedule) {
      setEditingScheduleId(schedule.id);
      setScheduleForm({
        projectName: schedule.projectName, status: schedule.status, preparationStartDate: schedule.preparationStartDate || "", scheduleDate: schedule.scheduleDate,
        milestones: (schedule.milestones || []).map((milestone) => ({ ...milestone })),
        note: schedule.note, manager: schedule.manager,
      });
    } else {
      setEditingScheduleId(null);
      setScheduleForm({ ...emptySchedule, milestones: [createMilestone()] });
    }
    setScheduleDialogOpen(true);
  };
  const updateMilestone = (id: string, patch: Partial<AnnualScheduleMilestone>) => {
    setScheduleForm((current) => ({
      ...current,
      milestones: (current.milestones || []).map((milestone) => milestone.id === id ? { ...milestone, ...patch } : milestone),
    }));
  };
  const removeMilestone = (id: string) => {
    setScheduleForm((current) => ({
      ...current,
      milestones: (current.milestones || []).filter((milestone) => milestone.id !== id),
    }));
  };
  const saveSchedule = async () => {
    const milestones = (scheduleForm.milestones || []).filter((milestone) => milestone.label.trim() && milestone.date.trim());
    if (!scheduleForm.projectName.trim() || !scheduleForm.preparationStartDate?.trim() || !milestones.length || !scheduleForm.manager.trim()) {
      toast({ title: "사업명, 업무준비 시작일, 세부 일정 1개 이상, 담당을 입력해주세요.", variant: "destructive" });
      return;
    }
    const payload = { ...scheduleForm, milestones, scheduleDate: milestones.map((milestone) => `${milestone.label} ${milestone.date}`).join(" / ") };
    if (editingScheduleId) await scheduleStore.update(editingScheduleId, payload);
    else await scheduleStore.add(payload);
    setScheduleDialogOpen(false);
  };
  const openCalendarDialog = (date: string, event?: WorkCalendarEvent & { id: string }) => {
    setEditingCalendarEventId(event?.id || null);
    setCalendarForm(event ? { title: event.title, note: event.note || "", startDate: event.startDate, endDate: event.endDate, color: event.color } : emptyCalendarEvent(date));
    setCalendarDialogOpen(true);
  };
  const saveCalendarEvent = async () => {
    if (!calendarForm.title.trim() || !calendarForm.startDate || !calendarForm.endDate) {
      toast({ title: "일정 제목과 시작일·종료일을 입력해주세요.", variant: "destructive" });
      return;
    }
    if (calendarForm.startDate > calendarForm.endDate) {
      toast({ title: "종료일은 시작일보다 빠를 수 없습니다.", variant: "destructive" });
      return;
    }
    const payload = { ...calendarForm, title: calendarForm.title.trim(), note: calendarForm.note.trim() };
    if (editingCalendarEventId) await calendarStore.update(editingCalendarEventId, payload);
    else await calendarStore.add(payload);
    setCalendarDialogOpen(false);
  };
  const deleteCalendarEvent = async () => {
    if (!editingCalendarEventId || !confirm("이 달력 일정을 삭제할까요?")) return;
    await calendarStore.remove(editingCalendarEventId);
    setCalendarDialogOpen(false);
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
      <div className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="w-full max-w-[560px] overflow-hidden rounded-lg bg-white p-2">
            <img src={dongbaekCenterLogo} alt="부천의료복지사회적협동조합 동백 장애인활동지원센터" className="h-auto w-full object-contain" />
          </div>
          <div><div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><h1 className="page-header mb-0">업무 종합 보드</h1><p className="text-sm font-medium text-primary sm:text-base">오늘도 행복한 하루를~</p></div><p className="mt-1 text-sm text-muted-foreground">오늘의 업무와 매칭, 연간 일정을 한곳에서 관리합니다.</p></div>
        </div>
        <Button className="self-start lg:self-auto" variant="outline" onClick={() => navigate("/")}>대시보드로 이동</Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader className="bg-muted/30"><CardTitle className="flex items-center justify-between text-lg"><span>✅ 할 일 목록</span><Badge variant="secondary">미완료 {todos.filter((todo) => !todo.completed).length}</Badge></CardTitle></CardHeader>
          <CardContent className="space-y-4 pt-5">
            <div className="flex gap-2"><Input value={todoTitle} onChange={(event) => setTodoTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveTodo(); }} placeholder="할 일을 입력하세요" /><Button onClick={() => void saveTodo()}><Plus className="mr-1 h-4 w-4" />{editingTodoId ? "수정" : "추가"}</Button></div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2"><label className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Checkbox checked={showCompleted} onCheckedChange={(checked) => setShowCompleted(checked === true)} />완료한 항목 모아보기</label><Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => void clearCompleted()}>완료 항목 비우기</Button></div>
            <div className="max-h-80 divide-y overflow-y-auto">
              {!visibleTodos.length ? <p className="py-10 text-center text-sm text-muted-foreground">표시할 할 일이 없습니다.</p> : visibleTodos.map((todo) => (
                <div key={todo.id} className={cn("flex items-center gap-2 rounded-md px-2 py-3", todo.completed && "my-1 border border-dashed bg-muted/50 opacity-75")}>
                  <Checkbox checked={todo.completed} onCheckedChange={(checked) => todo.id && void todosStore.update(todo.id, { completed: checked === true })} />
                  <span className={cn("min-w-0 flex-1 text-sm font-medium", todo.completed && "text-xs font-normal italic text-muted-foreground line-through")}>{todo.title}</span>
                  {todo.completed && <Badge variant="secondary" className="text-[10px] font-normal">완료</Badge>}
                  <Button variant="ghost" size="icon" aria-label="중요도 변경" onClick={() => todo.id && void todosStore.update(todo.id, { important: !todo.important })}><Star className={cn("h-4 w-4", todo.important && "fill-amber-400 text-amber-500")} /></Button>
                  <Button variant="ghost" size="icon" aria-label="수정" onClick={() => { setEditingTodoId(todo.id || null); setTodoTitle(todo.title); }}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" aria-label="삭제" onClick={() => todo.id && void todosStore.remove(todo.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="bg-muted/30"><CardTitle className="flex items-center gap-2 text-lg"><CalendarClock className="h-5 w-5 text-primary" />연간일정 시작일</CardTitle><p className="text-xs text-muted-foreground">아래 연간일정 현황에서 수정하면 이곳에도 실시간으로 반영됩니다.</p></CardHeader>
          <CardContent className="pt-5">
            {!scheduleStartItems.length ? <p className="py-10 text-center text-sm text-muted-foreground">등록된 연간 일정이 없습니다.</p> : <div className="max-h-80 space-y-3 overflow-y-auto pr-1">{scheduleStartItems.map((schedule) => {
              const startInfo = getScheduleStartInfo(schedule.preparationStartDate || "");
              return <div key={schedule.id} className={cn("rounded-xl border p-4", startInfo && startInfo.daysUntil >= 0 && startInfo.daysUntil <= 14 ? "border-amber-300 bg-amber-50" : "bg-card")}>
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold">{schedule.projectName}</p><p className="mt-1 text-xs font-medium text-muted-foreground">업무준비 시작일</p><p className="text-lg font-bold tracking-tight text-primary">{startInfo?.displayDate || "미등록"}</p><p className="mt-1 text-xs text-muted-foreground">전체 시행일: {schedule.scheduleDate}</p></div><div className="flex shrink-0 flex-col items-end gap-1"><Badge variant="outline" className={statusClass[schedule.status]}>{schedule.status}</Badge><Badge variant={startInfo && startInfo.daysUntil >= 0 && startInfo.daysUntil <= 14 ? "default" : "secondary"}>{startInfo?.relativeLabel || "날짜 등록 필요"}</Badge></div></div>
              </div>;
            })}</div>}
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="bg-muted/30">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><CardTitle className="flex items-center gap-2 text-lg"><CalendarDays className="h-5 w-5 text-primary" />이번 달 업무 달력</CardTitle><p className="mt-1 text-xs text-muted-foreground">날짜를 누르면 일정을 등록하고, 색상 일정 선을 누르면 수정·삭제할 수 있습니다.</p></div>
            <div className="flex items-center gap-1"><Button variant="outline" size="icon" aria-label="이전 달" onClick={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button><Button variant="ghost" className="min-w-28 font-bold" onClick={() => setCalendarMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>{calendarMonth.getFullYear()}년 {calendarMonth.getMonth() + 1}월</Button><Button variant="outline" size="icon" aria-label="다음 달" onClick={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></Button></div>
          </div>
        </CardHeader>
        <CardContent className="p-0 sm:p-4">
          <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-xs font-semibold"><div className="py-2 text-rose-500">일</div><div className="py-2">월</div><div className="py-2">화</div><div className="py-2">수</div><div className="py-2">목</div><div className="py-2">금</div><div className="py-2 text-blue-500">토</div></div>
          <div className="grid grid-cols-7 gap-px bg-border">{calendarDays.map((day, dayIndex) => {
            const dayEvents = eventsForCalendarDay(calendarEventsWithLanes, day.date);
            const laneCount = dayEvents.length ? Math.max(...dayEvents.map((event) => event.lane)) + 1 : 0;
            return <div key={day.date} role="button" tabIndex={0} className={cn("min-h-28 min-w-0 bg-background p-1 transition hover:bg-muted/30", !day.inMonth && "bg-muted/20 text-muted-foreground")} onClick={() => openCalendarDialog(day.date)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") openCalendarDialog(day.date); }}>
              <div className={cn("mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs", day.date === today && "bg-primary font-bold text-primary-foreground", dayIndex % 7 === 0 && day.date !== today && "text-rose-500", dayIndex % 7 === 6 && day.date !== today && "text-blue-500")}>{day.day}</div>
              <div className="space-y-0.5">{Array.from({ length: laneCount }, (_, lane) => {
                const event = dayEvents.find((item) => item.lane === lane);
                if (!event) return <div key={lane} className="h-5" />;
                const starts = event.startDate === day.date;
                const ends = event.endDate === day.date;
                return <button key={event.id} type="button" title={`${event.title}${event.note ? ` · ${event.note}` : ""}`} className={cn("block h-5 w-[calc(100%+4px)] truncate px-1 text-left text-[10px] font-semibold leading-5 shadow-sm", calendarColorClass[event.color], starts && "ml-0 rounded-l-md", !starts && "-ml-1", ends && "w-full rounded-r-md")} onClick={(clickEvent) => { clickEvent.stopPropagation(); openCalendarDialog(day.date, event); }}>{starts || dayIndex % 7 === 0 || day.day === 1 ? event.title : ""}</button>;
              })}</div>
            </div>;
          })}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="bg-muted/30"><CardTitle className="text-lg">🔗 바로 가기</CardTitle></CardHeader>
        <CardContent className="grid gap-3 pt-5 sm:grid-cols-2 lg:grid-cols-4">
          {quickLinks.map((link) => <button key={link.label} onClick={() => openQuickLink(link.url)} className="group flex min-h-20 items-center gap-3 rounded-xl border bg-card p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"><span className="text-2xl">{link.icon}</span><span className="flex-1 text-sm font-semibold leading-snug">{link.label}</span><ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary" /></button>)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between bg-muted/30"><CardTitle className="text-lg">🎯 매칭 필요 명단</CardTitle><Button size="sm" onClick={() => setMatchingDialogOpen(true)}><UserRoundSearch className="mr-1 h-4 w-4" />명단 추가</Button></CardHeader>
        <CardContent className="pt-5">
          {!matchingItems.length ? <p className="py-10 text-center text-sm text-muted-foreground">현재 매칭이 필요한 등록 대상이 없습니다.</p> : <div className="grid gap-3 md:grid-cols-2">{matchingItems.map((item) => {
            const recommendations = recommendationMap.get(item.id) || [];
            return (
            <div key={item.id} className="flex items-start gap-3 rounded-xl border p-4">
              <div className="flex shrink-0 flex-col gap-1"><Badge variant="outline">{item.targetType}</Badge><Badge variant={item.matchMode === "1:다" ? "default" : "secondary"}>{item.matchMode || "1:1"}</Badge></div>
              <div className="min-w-0 flex-1">
                <button className="font-semibold text-primary hover:underline" onClick={() => navigate(item.targetType === "이용자" ? `/users?detailId=${encodeURIComponent(item.targetId)}` : `/workers?detailId=${encodeURIComponent(item.targetId)}`)}>{item.targetName}</button>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{item.condition}</p>
                <div className="mt-3 rounded-lg bg-muted/50 p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-1"><p className="text-xs font-semibold">{item.targetType === "이용자" ? "추천 활동지원사" : "추천 이용자"} 1~3순위</p><Badge variant="outline" className="text-[10px]">메모 조건 반영</Badge></div>
                  {recommendations.length ? <div className="space-y-1.5">{recommendations.map((recommendation, index) => (
                    <button key={recommendation.id} className="flex w-full items-center gap-2 rounded-md bg-background px-2 py-1.5 text-left text-xs hover:bg-primary/10" onClick={() => navigate(recommendation.targetType === "이용자" ? `/users?detailId=${encodeURIComponent(recommendation.id)}` : `/workers?detailId=${encodeURIComponent(recommendation.id)}`)}>
                      <Badge variant="outline" className="h-5 px-1.5">{index + 1}위</Badge><span className="flex-1 font-medium">{recommendation.name}</span><span className="text-muted-foreground">{Math.round(recommendation.score)}점</span>
                    </button>
                  ))}</div> : <p className="text-xs text-muted-foreground">조건에 맞는 대기 대상이 없습니다.</p>}
                </div>
              </div>
              <Button variant="ghost" size="icon" aria-label={`${item.targetName} 제거`} onClick={() => item.id && void matchingStore.remove(item.id)}><X className="h-4 w-4" /></Button>
            </div>
          );})}</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between bg-muted/30"><CardTitle className="text-lg">📅 연간 일정 현황</CardTitle><Button size="sm" onClick={() => openScheduleDialog()}><Plus className="mr-1 h-4 w-4" />신규 일정</Button></CardHeader>
        <CardContent className="pt-5"><div className="overflow-x-auto"><table className="w-full min-w-[960px] text-sm"><thead><tr className="border-b bg-muted/40"><th className="px-3 py-3 text-left">연간사업명</th><th className="px-3 py-3 text-left">상태</th><th className="px-3 py-3 text-left">업무준비 시작일</th><th className="px-3 py-3 text-left">시행날짜</th><th className="px-3 py-3 text-left">비고</th><th className="px-3 py-3 text-left">담당</th><th className="px-3 py-3 text-right">관리</th></tr></thead><tbody>
          {!schedules.length ? <tr><td colSpan={7} className="py-12 text-center text-muted-foreground">일정을 준비하고 있습니다.</td></tr> : schedules.map((schedule) => <tr key={schedule.id} className="border-b hover:bg-muted/20"><td className="px-3 py-3 font-medium">{schedule.projectName}</td><td className="px-3 py-3"><Badge variant="outline" className={statusClass[schedule.status]}>{schedule.status}</Badge></td><td className="whitespace-nowrap px-3 py-3">{schedule.preparationStartDate || "미등록"}</td><td className="min-w-64 px-3 py-3">{schedule.milestones?.length ? <div className="space-y-1">{schedule.milestones.map((milestone) => <div key={milestone.id} className="flex items-center gap-2"><Badge variant="secondary" className="font-normal">{milestone.label}</Badge><span className="whitespace-nowrap">{milestone.date}</span></div>)}</div> : formatScheduleMilestones(schedule)}</td><td className="max-w-xs whitespace-pre-wrap px-3 py-3 text-muted-foreground">{schedule.note || "-"}</td><td className="px-3 py-3">{schedule.manager}</td><td className="px-3 py-3"><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" aria-label="일정 수정" onClick={() => openScheduleDialog(schedule)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label="일정 삭제" onClick={() => schedule.id && confirm("이 일정을 삭제할까요?") && void scheduleStore.remove(schedule.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div></td></tr>)}
        </tbody></table></div></CardContent>
      </Card>

      <Dialog open={matchingDialogOpen} onOpenChange={setMatchingDialogOpen}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>매칭 필요 대상 추가</DialogTitle></DialogHeader><div className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>대상 구분</Label><Select value={targetType} onValueChange={(value) => { setTargetType(value as MatchingBoardItem["targetType"]); setTargetId(""); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="이용자">이용자</SelectItem><SelectItem value="활동지원사">활동지원사</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>매칭 형태</Label><Select value={matchMode} onValueChange={(value) => setMatchMode(value as NonNullable<MatchingBoardItem["matchMode"]>)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1:1">1:1 (기본 매칭)</SelectItem><SelectItem value="1:다">1:다 (기존 매칭에 추가)</SelectItem></SelectContent></Select></div></div><div className="space-y-2"><Label>이름 검색</Label><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={targetSearch} onChange={(event) => setTargetSearch(event.target.value)} placeholder="이름을 입력하세요" /></div><div className="max-h-40 divide-y overflow-y-auto rounded-md border">{matchingCandidates.map((candidate) => <button key={candidate.id} className={cn("flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted", targetId === candidate.id && "bg-primary/10 text-primary")} onClick={() => setTargetId(candidate.id)}><span>{candidate.name}</span>{targetId === candidate.id && <Check className="h-4 w-4" />}</button>)}</div></div>{matchMode === "1:다" && selectedTarget && <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><p className="mb-2 font-semibold">⚠️ 현재 서비스 시간 — 새 매칭과 겹치지 않도록 확인하세요</p><div className="space-y-1">{currentServiceInfo.map((line) => <p key={line} className="whitespace-pre-wrap">{line}</p>)}</div><p className="mt-2 text-xs text-amber-800">현재 배정 {getAssignmentCount(targetType, selectedTarget)}명 · 추가 배정이 확인되면 이 명단에서 자동 제거됩니다.</p></div>}<div className="space-y-2"><Label>매칭 필요 조건 *</Label><Textarea value={matchingCondition} onChange={(event) => setMatchingCondition(event.target.value)} placeholder="예: 10:00~14:00 중동 인근 9월부터 추가 매칭필요" /></div></div><DialogFooter><Button variant="outline" onClick={() => setMatchingDialogOpen(false)}>취소</Button><Button onClick={() => void saveMatchingItem()}>등록</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{editingScheduleId ? "연간 일정 수정" : "신규 연간 일정"}</DialogTitle></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2 sm:col-span-2"><Label>연간사업명 *</Label><Input value={scheduleForm.projectName} onChange={(event) => setScheduleForm({ ...scheduleForm, projectName: event.target.value })} placeholder="유해위험요인 조사" /></div><div className="space-y-2"><Label>상태</Label><Select value={scheduleForm.status} onValueChange={(value) => setScheduleForm({ ...scheduleForm, status: value as AnnualScheduleStatus })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="진행중">진행중</SelectItem><SelectItem value="예정">예정</SelectItem><SelectItem value="완료">완료</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>담당 *</Label><Input value={scheduleForm.manager} onChange={(event) => setScheduleForm({ ...scheduleForm, manager: event.target.value })} placeholder="김광민" /></div><div className="space-y-2 sm:col-span-2"><Label>업무준비 시작일 *</Label><Input type="date" value={scheduleForm.preparationStartDate || ""} onChange={(event) => setScheduleForm({ ...scheduleForm, preparationStartDate: event.target.value })} /></div><div className="space-y-3 sm:col-span-2"><div className="flex items-center justify-between gap-3"><div><Label>세부 시행 일정 *</Label><p className="text-xs text-muted-foreground">사업계획, 기안 작성, 조사, 예약, 시행일, 평가 등 필요한 단계를 자유롭게 추가하세요.</p></div><Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => setScheduleForm((current) => ({ ...current, milestones: [...(current.milestones || []), createMilestone()] }))}><Plus className="mr-1 h-4 w-4" />일정 추가</Button></div>{!(scheduleForm.milestones || []).length && scheduleForm.scheduleDate && <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">기존 시행날짜: {scheduleForm.scheduleDate}<br />수정 저장하려면 세부 일정을 하나 이상 추가해주세요.</p>}<div className="space-y-2">{(scheduleForm.milestones || []).map((milestone) => <div key={milestone.id} className="grid grid-cols-[minmax(0,1fr)_150px_36px] gap-2"><Input value={milestone.label} onChange={(event) => updateMilestone(milestone.id, { label: event.target.value })} placeholder="예: 기안 작성" /><Input type="date" value={milestone.date} onChange={(event) => updateMilestone(milestone.id, { date: event.target.value })} /><Button type="button" variant="ghost" size="icon" aria-label="세부 일정 삭제" onClick={() => removeMilestone(milestone.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>)}</div></div><div className="space-y-2 sm:col-span-2"><Label>비고</Label><Textarea value={scheduleForm.note} onChange={(event) => setScheduleForm({ ...scheduleForm, note: event.target.value })} placeholder="-수요조사링크:6/29~7/3(일주일)" /></div></div><DialogFooter><Button variant="outline" onClick={() => setScheduleDialogOpen(false)}>취소</Button><Button onClick={() => void saveSchedule()}>{editingScheduleId ? "수정 저장" : "일정 추가"}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={calendarDialogOpen} onOpenChange={setCalendarDialogOpen}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{editingCalendarEventId ? "달력 일정 수정" : "달력 일정 등록"}</DialogTitle></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label>일정 제목 *</Label><Input value={calendarForm.title} onChange={(event) => setCalendarForm({ ...calendarForm, title: event.target.value })} placeholder="예: 이용자 가정 방문" /></div><div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label>시작일 *</Label><Input type="date" value={calendarForm.startDate} onChange={(event) => setCalendarForm({ ...calendarForm, startDate: event.target.value, endDate: calendarForm.endDate < event.target.value ? event.target.value : calendarForm.endDate })} /></div><div className="space-y-2"><Label>종료일 *</Label><Input type="date" min={calendarForm.startDate} value={calendarForm.endDate} onChange={(event) => setCalendarForm({ ...calendarForm, endDate: event.target.value })} /></div></div><div className="space-y-2"><Label>표시 색상</Label><div className="flex flex-wrap gap-2">{(Object.keys(calendarColorClass) as CalendarEventColor[]).map((color) => <button key={color} type="button" className={cn("rounded-full border-2 px-3 py-1 text-xs font-semibold", calendarColorClass[color], calendarForm.color === color ? "border-foreground ring-2 ring-ring ring-offset-2" : "border-transparent")} onClick={() => setCalendarForm({ ...calendarForm, color })}>{calendarColorLabel[color]}</button>)}</div></div><div className="space-y-2"><Label>메모</Label><Textarea value={calendarForm.note} onChange={(event) => setCalendarForm({ ...calendarForm, note: event.target.value })} placeholder="준비사항이나 참고 내용을 자유롭게 입력하세요." /></div></div><DialogFooter className="gap-2 sm:justify-between"><div>{editingCalendarEventId && <Button variant="destructive" onClick={() => void deleteCalendarEvent()}><Trash2 className="mr-1 h-4 w-4" />삭제</Button>}</div><div className="flex gap-2"><Button variant="outline" onClick={() => setCalendarDialogOpen(false)}>취소</Button><Button onClick={() => void saveCalendarEvent()}>{editingCalendarEventId ? "수정 저장" : "일정 등록"}</Button></div></DialogFooter></DialogContent></Dialog>

      <Dialog open={missingLinkDialogOpen} onOpenChange={setMissingLinkDialogOpen}><DialogContent><DialogHeader><DialogTitle>입사서류 안내 링크 입력</DialogTitle></DialogHeader><div className="space-y-2"><Label>URL</Label><Input value={onboardingUrl} onChange={(event) => setOnboardingUrl(event.target.value)} placeholder="https://..." /><p className="text-xs text-muted-foreground">현재 브라우저에 저장되며 다음부터 새 탭에서 열립니다.</p></div><DialogFooter><Button variant="outline" onClick={() => setMissingLinkDialogOpen(false)}>취소</Button><Button onClick={saveOnboardingLink}>저장</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
};

export default WorkBoard;
