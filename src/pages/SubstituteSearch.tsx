import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCollection } from "@/hooks/useFirestore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { USERS_COLLECTION, WORKERS_COLLECTION } from "@/lib/collectionNames";
import { adaptSubstituteData } from "@/lib/substituteAdapter";
import { searchSubstituteWorkers } from "@/lib/substituteMatching";
import type { ServiceUser, Worker } from "@/types";
import type { SubstituteRequirements, SubstituteSearchResult, SubstituteWeekday, TimeRangeInput } from "@/types/substitute";

const DAYS: SubstituteWeekday[] = ["월", "화", "수", "목", "금", "토", "일"];
const SUPPORTED_CONDITIONS = [
  ["diaperCare", "기저귀 케어"],
  ["driving", "차량 운전"],
  ["housework", "가사 지원"],
  ["disabilityExperience", "장애유형 경험"],
] as const;

const DEFAULT_REQUIREMENTS: SubstituteRequirements = {
  diaperCare: "REQUIRED",
  driving: "NONE",
  housework: "PREFERRED",
  transfer: "NONE",
  bathingAndBodyCare: "NONE",
  communication: "NONE",
  disabilityExperience: "PREFERRED",
  workerGender: "ANY",
  userDisabilityType: "ANY",
};

function localDate(offset = 0): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function slotsToRanges(slots: number[]): TimeRangeInput[] {
  const ordered = [...new Set(slots)].filter((slot) => Number.isInteger(slot) && slot >= 0 && slot <= 47).sort((a, b) => a - b);
  if (!ordered.length) return [];
  const ranges: TimeRangeInput[] = [];
  let start = ordered[0];
  let end = ordered[0];
  const format = (slot: number) => `${String(Math.floor(slot / 2)).padStart(2, "0")}:${slot % 2 ? "30" : "00"}`;
  for (const slot of ordered.slice(1)) {
    if (slot === end + 1) end = slot;
    else {
      ranges.push({ startTime: format(start), endTime: format(end + 1) });
      start = slot;
      end = slot;
    }
  }
  ranges.push({ startTime: format(start), endTime: format(end + 1) });
  return ranges;
}

function statusLabel(value: string): string {
  return value === "FULL" ? "전체 가능" : value === "PARTIAL" ? "일부 가능" : value === "NONE" ? "일정 불가" : "확인 필요";
}

function statusVariant(value: string): "default" | "secondary" | "destructive" | "outline" {
  if (value === "FULL") return "default";
  if (value === "PARTIAL") return "secondary";
  if (value === "NONE") return "destructive";
  return "outline";
}

function conditionLabel(status: string): string {
  return status === "PASS" ? "충족" : status === "FAIL" ? "미충족" : status === "NOT_APPLICABLE" ? "무관" : "확인 필요";
}

function formatRange(range: { start: number; end: number }): string {
  const format = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return `${format(range.start)}~${format(range.end)}`;
}

export default function SubstituteSearch() {
  const { role } = useAuth();
  const { data: usersRaw, loading: usersLoading, error: usersError } = useCollection<ServiceUser>(USERS_COLLECTION);
  const { data: workersRaw, loading: workersLoading, error: workersError } = useCollection<Worker>(WORKERS_COLLECTION);
  const users = useMemo(() => usersRaw || [], [usersRaw]);
  const workers = useMemo(() => workersRaw || [], [workersRaw]);
  const [startDate, setStartDate] = useState(localDate());
  const [endDate, setEndDate] = useState(localDate(4));
  const [selectedUserId, setSelectedUserId] = useState("");
  const [requirements, setRequirements] = useState<SubstituteRequirements>(DEFAULT_REQUIREMENTS);
  const [weeklySlots, setWeeklySlots] = useState<Partial<Record<SubstituteWeekday, TimeRangeInput[]>>>({
    월: [{ startTime: "09:00", endTime: "13:00" }],
    화: [{ startTime: "09:00", endTime: "13:00" }],
    수: [{ startTime: "09:00", endTime: "13:00" }],
    목: [{ startTime: "09:00", endTime: "13:00" }],
    금: [{ startTime: "09:00", endTime: "13:00" }],
  });
  const [result, setResult] = useState<SubstituteSearchResult | null>(null);
  const [formMessage, setFormMessage] = useState("");

  const adapted = useMemo(() => adaptSubstituteData(workers, users), [workers, users]);
  const selectedUser = users.find((user) => String(user.id || "") === selectedUserId);

  if (usersLoading || workersLoading) {
    return <div className="flex min-h-[280px] items-center justify-center text-muted-foreground">이용자와 활동지원사 일정을 불러오는 중입니다...</div>;
  }
  if (usersError || workersError) {
    return <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-destructive">기존 데이터를 불러오지 못했습니다. 권한과 연결 상태를 확인해 주세요.</div>;
  }

  const updateDay = (day: SubstituteWeekday, index: number, key: keyof TimeRangeInput, value: string) => {
    setWeeklySlots((current) => ({
      ...current,
      [day]: (current[day] || [{ startTime: "09:00", endTime: "13:00" }]).map((range, rangeIndex) => rangeIndex === index ? { ...range, [key]: value } : range),
    }));
  };

  const addDayRange = (day: SubstituteWeekday) => setWeeklySlots((current) => ({ ...current, [day]: [...(current[day] || []), { startTime: "14:00", endTime: "17:00" }] }));
  const removeDayRange = (day: SubstituteWeekday, index: number) => setWeeklySlots((current) => ({ ...current, [day]: (current[day] || []).filter((_, rangeIndex) => rangeIndex !== index) }));

  const copyUserConditions = () => {
    if (!selectedUser) return;
    const schedule = selectedUser.weeklySchedule || [];
    setWeeklySlots(Object.fromEntries(schedule.map((entry) => [entry.day, slotsToRanges(entry.slots)])));
    setRequirements((current) => ({
      ...current,
      diaperCare: selectedUser.usesDiaper ? "REQUIRED" : "NONE",
      driving: selectedUser.needsVehicle ? "REQUIRED" : "NONE",
      userDisabilityType: selectedUser.disabilityType || "ANY",
    }));
    setFormMessage("선택한 이용자의 기본 서비스 조건을 입력값에 복사했습니다. 검색 전 수정할 수 있습니다.");
  };

  const runSearch = () => {
    if (!startDate || !endDate || startDate > endDate) {
      setFormMessage("검색 시작일과 종료일을 확인해 주세요.");
      return;
    }
    try {
      const request = { requestId: `local-${Date.now()}`, startDate, endDate, weeklySlots, requirements };
      setResult(searchSubstituteWorkers(request, adapted.workers));
      setFormMessage(`재직 관계가 확인되는 후보 ${adapted.workers.length}명을 계산했습니다. 결과는 저장되지 않습니다.`);
    } catch {
      setFormMessage("검색 조건의 날짜·시간 형식을 확인해 주세요.");
      setResult(null);
    }
  };

  const updateRequirement = (key: keyof SubstituteRequirements, value: string) => setRequirements((current) => ({ ...current, [key]: value } as SubstituteRequirements));

  return (
    <div className="space-y-5">
      <Card className="border-primary/20 bg-primary/[0.02]">
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">대체 활동지원사 검색</CardTitle>
          <CardDescription>등록된 Worker/User 데이터와 지원사별 배정 서비스 일정을 기준으로 계산하는 읽기 전용 검색입니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            검색 결과는 등록된 일정과 조건을 기준으로 계산한 참고정보입니다. 실제 대체근무 가능 여부는 활동지원사에게 직접 확인해야 합니다.
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div><Label htmlFor="sub-user">기존 이용자 선택(선택)</Label><select id="sub-user" className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}><option value="">직접 조건 입력</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></div>
            <div className="flex items-end"><Button type="button" variant="outline" disabled={!selectedUser} onClick={copyUserConditions}>이용자 조건 복사</Button></div>
            <div className="text-xs text-muted-foreground md:pt-6">원본 이용자 문서는 변경하지 않습니다.</div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <div><Label htmlFor="sub-start">검색 시작일</Label><Input id="sub-start" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></div>
            <div><Label htmlFor="sub-end">검색 종료일</Label><Input id="sub-end" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></div>
            <div><Label>성별</Label><select className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={requirements.workerGender} onChange={(event) => updateRequirement("workerGender", event.target.value)}><option value="ANY">무관</option><option value="여성">여성</option><option value="남성">남성</option></select></div>
            <div><Label>이용자 장애유형</Label><Input value={requirements.userDisabilityType === "ANY" ? "" : requirements.userDisabilityType} placeholder="무관" onChange={(event) => updateRequirement("userDisabilityType", event.target.value || "ANY")} /></div>
          </div>
          <div className="space-y-2">
            <Label>요일별 요청시간</Label>
            <div className="grid gap-2 lg:grid-cols-2">
              {DAYS.map((day) => <div key={day} className="rounded-md border p-2"><div className="mb-2 flex items-center justify-between"><span className="w-8 font-semibold">{day}</span><Button type="button" size="sm" variant="ghost" onClick={() => addDayRange(day)}>시간 추가</Button></div>{(weeklySlots[day] || []).map((range, index) => <div key={`${day}-${index}`} className="mb-2 flex items-center gap-2 last:mb-0"><Input aria-label={`${day} 시작시간`} type="time" value={range.startTime} onChange={(event) => updateDay(day, index, "startTime", event.target.value)} /><span>~</span><Input aria-label={`${day} 종료시간`} type="time" value={range.endTime} onChange={(event) => updateDay(day, index, "endTime", event.target.value)} /><Button type="button" size="sm" variant="ghost" onClick={() => removeDayRange(day, index)}>삭제</Button></div>)}</div>)}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            {SUPPORTED_CONDITIONS.map(([key, label]) => <div key={key}><Label>{label}</Label><select className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={requirements[key]} onChange={(event) => updateRequirement(key, event.target.value)}><option value="NONE">무관</option><option value="PREFERRED">우대</option><option value="REQUIRED">필수</option></select></div>)}
          </div>
          <p className="text-xs text-muted-foreground">이동·이승, 목욕·신체, 의사소통 조건의 운영 데이터 필드와 R3-A 평가식은 아직 연결하지 않았습니다. 이 조건은 다음 단계에서 별도 승인 후 추가합니다.</p>
          <div className="flex flex-wrap items-center gap-3"><Button onClick={runSearch}>대체 지원사 검색</Button>{formMessage && <span className="text-sm text-muted-foreground">{formMessage}</span>}</div>
        </CardContent>
      </Card>

      {adapted.warnings.length > 0 && <Card className="border-amber-200"><CardHeader className="pb-2"><CardTitle className="text-base">데이터 확인 필요 {adapted.warnings.length}건</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">{[...new Set(adapted.warnings.map((warning) => warning.message))].slice(0, 6).map((message) => <p key={message}>• {message}</p>)}</CardContent></Card>}
      {result && <SearchResults result={result} contacts={adapted.contacts} role={role} />}
    </div>
  );
}

function SearchResults({ result, contacts, role }: { result: SubstituteSearchResult; contacts: ReturnType<typeof adaptSubstituteData>["contacts"]; role: string | null }) {
  const contactById = new Map(contacts.map((contact) => [contact.workerId, contact]));
  return <section className="space-y-3" aria-label="대체 활동지원사 검색 결과"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-xl font-bold">검색 결과</h2><p className="text-sm text-muted-foreground">총 요청시간 {result.requestedMinutes}분 · 후보 {result.candidates.length}명</p></div><div className="flex gap-2"><Badge>추천 {result.recommendableCandidates.length}명</Badge><Badge variant="outline">확인 필요·제외 {result.diagnostics.length}명</Badge></div></div>{!result.candidates.length && <Card><CardContent className="p-8 text-center text-muted-foreground">조건에 맞는 활동지원사가 없습니다.</CardContent></Card>}{result.candidates.map((candidate) => { const contact = contactById.get(candidate.workerId); return <Card key={candidate.workerId}><CardHeader className="pb-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><CardTitle className="text-base">{candidate.workerName || "이름 미확인"}</CardTitle><CardDescription>{role ? contact?.phone || "연락처 미확인" : "연락처는 권한 확인 후 표시됩니다."} · 재직 {candidate.employment.eligibility}</CardDescription></div><Badge variant={statusVariant(candidate.schedule.fit)}>{statusLabel(candidate.schedule.fit)}</Badge></div></CardHeader><CardContent className="space-y-3 text-sm"><div className="grid gap-2 sm:grid-cols-4"><div><span className="text-muted-foreground">가능시간</span><br />{candidate.schedule.availableMinutes}분 / {candidate.schedule.requestedMinutes}분</div><div><span className="text-muted-foreground">충족률</span><br />{Math.round(candidate.schedule.fulfillmentRate * 100)}%</div><div><span className="text-muted-foreground">필수조건</span><br />{conditionLabel(candidate.requiredCondition.status)}</div><div><span className="text-muted-foreground">전화 확인</span><br />미확인</div></div><div className="flex flex-wrap gap-2 text-xs"><Badge variant="outline">가사 {conditionLabel(candidate.preferredConditions.housework.status)}</Badge><Badge variant="outline">장애경험 {conditionLabel(candidate.preferredConditions.disabilityExperience.status)}</Badge><Badge variant="outline">운전 {conditionLabel(candidate.preferredConditions.driving.status)}</Badge>{candidate.requiredCondition.reason && <Badge variant="outline">{candidate.requiredCondition.reason}</Badge>}</div><div className="space-y-2 border-t pt-3"><p className="font-semibold">날짜별 근거</p>{candidate.schedule.dates.map((date) => <div key={date.date} className="rounded-md bg-muted/50 p-2"><div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{date.date}</span><span>{statusLabel(date.fit)} · {date.availableMinutes}/{date.requestedMinutes}분</span></div><p className="text-xs text-muted-foreground">요청 {date.requested.map(formatRange).join(", ") || "없음"} · 남은 시간 {date.remaining.map(formatRange).join(", ") || "없음"}</p>{date.existingServiceConflicts.length > 0 && <p className="text-xs text-orange-700">기존 서비스 충돌: {date.existingServiceConflicts.map(formatRange).join(", ")}</p>}{date.warnings.length > 0 && <p className="text-xs text-amber-700">{date.warnings.join(" / ")}</p>}</div>)}</div></CardContent></Card>; })}</section>;
}
