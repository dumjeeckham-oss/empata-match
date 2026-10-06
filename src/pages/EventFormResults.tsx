import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { eventFormApi, loadEventForm, loadEventFormRounds, loadEventFormSubmissions, loadEventFormVersion } from "@/lib/eventFormSparkApi";
import { buildEventFormExportHeaders, buildEventFormExportRows, buildEventFormStatistics, buildEventFormSummaryRows, eventFormAnswerText, markDuplicateEventFormSubmissions, resolveEventFormPresentation, resolveEventFormResultFields } from "@/lib/eventFormResults";
import type { EventFormField, EventFormRound, EventFormSlot, EventFormSubmission, EventFormVersion } from "@/types/eventForms";

function dateText(value: unknown): string {
  const timestamp = value as { toDate?: () => Date } | undefined;
  const date = timestamp?.toDate?.() || (typeof value === "string" || typeof value === "number" ? new Date(value) : null);
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString("ko-KR") : "";
}

function submissionStatusText(status: EventFormSubmission["status"]): string {
  return status === "reviewed" ? "확인" : status === "excluded" ? "제외" : "제출";
}

function addressParts(value: unknown): { roadAddress: string; detailAddress: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { roadAddress: "", detailAddress: "" };
  const address = value as Record<string, unknown>;
  return { roadAddress: String(address.roadAddress || ""), detailAddress: String(address.detailAddress || "") };
}

export default function EventFormResults() {
  const { formId = "" } = useParams();
  const [form, setForm] = useState<EventFormSlot | null>(null);
  const [rounds, setRounds] = useState<EventFormRound[]>([]);
  const [roundId, setRoundId] = useState("");
  const [fields, setFields] = useState<EventFormField[]>([]);
  const [version, setVersion] = useState<EventFormVersion | null>(null);
  const [submissions, setSubmissions] = useState<EventFormSubmission[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<EventFormSubmission | null>(null);
  const [search, setSearch] = useState("");
  const [choiceFilter, setChoiceFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { void Promise.all([loadEventForm(formId), loadEventFormRounds(formId)]).then(([loadedForm, loadedRounds]) => { setForm(loadedForm); setRounds(loadedRounds); setRoundId(loadedForm?.activeRoundId || loadedRounds[0]?.id || ""); }); }, [formId]);
  useEffect(() => {
    if (!roundId) return;
    let cancelled = false;
    setLoading(true);
    setVersion(null);
    setFields([]);
    setSubmissions([]);
    setSelectedSubmission(null);
    const round = rounds.find((item) => item.id === roundId);
    void Promise.all([
      round?.versionId ? loadEventFormVersion(round.versionId) : Promise.resolve(null),
      loadEventFormSubmissions(roundId),
    ]).then(([loadedVersion, rows]) => {
      if (cancelled) return;
      setVersion(loadedVersion);
      setFields(resolveEventFormResultFields(loadedVersion));
      setSubmissions(rows);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [roundId, rounds]);
  const currentRound = rounds.find((round) => round.id === roundId);
  const presentation = currentRound?.versionId
    ? (version?.id === currentRound.versionId ? resolveEventFormPresentation(form, version) : null)
    : resolveEventFormPresentation(form, null);
  const visibleFields = fields.filter((field) => field.visible && !["notice", "divider"].includes(field.type));
  const duplicateFieldId = version?.formSnapshot?.duplicateFieldId ?? form?.duplicateFieldId;
  const displaySubmissions = useMemo(() => markDuplicateEventFormSubmissions(fields, submissions, duplicateFieldId), [duplicateFieldId, fields, submissions]);
  const filtered = useMemo(() => displaySubmissions.filter((submission) => {
    const text = visibleFields.map((field) => eventFormAnswerText(field, submission.answers[field.id])).join(" ").toLowerCase();
    return (!search || text.includes(search.toLowerCase())) && (!choiceFilter || text.includes(choiceFilter.toLowerCase()));
  }), [displaySubmissions, visibleFields, search, choiceFilter]);
  const statistics = buildEventFormStatistics(fields, displaySubmissions, presentation?.expectedTargetCount);
  const filteredStatistics = buildEventFormStatistics(fields, filtered, presentation?.expectedTargetCount);
  const { attendanceCounts, choiceStats } = statistics;
  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const summary = buildEventFormSummaryRows(presentation, currentRound?.name || "", submissions.length, filtered.length, new Date().toLocaleString("ko-KR"));
    if (statistics.expectedTargetCount) summary.push(["예상 대상 인원", statistics.expectedTargetCount], ["제출률", `${statistics.submissionRate}%`]);
    summary.push(["중복 경고", statistics.duplicateWarnings]);
    if (attendanceCounts) Object.entries(attendanceCounts).forEach(([label, count]) => summary.push([label, count]));
    choiceStats.forEach(({ field, counts }) => counts.forEach(({ label, count }) => summary.push([`${field.title} - ${label}`, count])));
    const rows = buildEventFormExportRows(visibleFields, filtered, dateText);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(summary), "요약");
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows, { header: buildEventFormExportHeaders(visibleFields) }), "전체 응답");
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(fields.map((field) => ({ "문항 ID": field.id, "순서": field.order, "질문 제목": field.title, "상세설명": field.description || "", "필수 여부": field.required || field.consentRequired ? "필수" : "선택", "입력 예시": field.placeholder || "", "회차 ID": roundId, "버전 ID": version?.id || "" }))), "문항 정의");
    XLSX.writeFile(book, `${presentation?.title || "행사신청"}_${currentRound?.name || "회차"}.xlsx`);
  };
  return <section className="space-y-5 event-results-print">
    <style>{`@media print { @page { size: A4 landscape; margin: 10mm; } html,body,#root,#root>div { min-height:0!important; height:0!important; overflow:visible!important; } body * { visibility:hidden!important; } .event-results-print>:not(style):not(.event-results-paper) { display:none!important; } .event-results-paper,.event-results-paper * { visibility:visible!important; } .event-results-paper { display:block!important; position:absolute; inset:0 auto auto 0; width:100%; color:#111; font-size:10pt; line-height:1.45; } .event-print-summary { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:6px; margin:10px 0; } .event-print-summary>div,.event-response-card,.event-response-answer { border:1px solid #777; padding:7px; } .event-response-card { margin:0 0 9px; break-inside:avoid-page; page-break-inside:avoid; } .event-response-answers { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:5px; margin-top:7px; } .event-response-answer { min-width:0; overflow-wrap:anywhere; white-space:pre-wrap; } .event-response-answer dt { font-weight:700; } .event-response-answer dd { margin:3px 0 0; } .event-response-help { color:#555; font-size:8.5pt; } .no-print { display:none!important; } }`}</style>
    <div className="no-print flex flex-wrap items-center gap-2"><Button asChild variant="outline"><Link to="/event-forms">목록</Link></Button><Button asChild variant="outline"><Link to={`/event-forms/${formId}/edit`}>폼 편집</Link></Button><div className="ml-auto flex gap-2"><Button variant="outline" onClick={() => window.print()}>인쇄</Button><Button onClick={() => void exportExcel()}>엑셀 저장</Button></div></div>
    <div><h1 className="text-2xl font-bold">{presentation?.title || "결과 시트"}</h1><p className="text-sm text-muted-foreground">{currentRound?.name} · {presentation?.eventDateTime || "일시 미등록"} · {presentation?.location || "장소 미등록"}</p>{presentation?.description && <p className="mt-1 whitespace-pre-wrap text-sm">{presentation.description}</p>}<p className="text-xs text-muted-foreground">출력 {new Date().toLocaleString("ko-KR")}</p></div>
    <div className="no-print grid gap-3 sm:grid-cols-3"><label>회차<select className="mt-1 h-10 w-full rounded border bg-background px-3" value={roundId} onChange={(e) => setRoundId(e.target.value)}>{rounds.map((round) => <option key={round.id} value={round.id}>{round.name} ({round.responseCount}건)</option>)}</select></label><label>응답 검색<Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="응답 내용 검색" /></label><label>객관식 필터<Input value={choiceFilter} onChange={(e) => setChoiceFilter(e.target.value)} placeholder="예: 참석" /></label></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">전체 응답</p><p className="text-2xl font-bold">{statistics.total}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">제출 완료</p><p className="text-2xl font-bold">{statistics.completed}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">중복 경고</p><p className="text-2xl font-bold">{statistics.duplicateWarnings}</p></CardContent></Card>{statistics.expectedTargetCount && <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">예상 {statistics.expectedTargetCount}명 대비 제출률</p><p className="text-2xl font-bold">{statistics.submissionRate}%</p></CardContent></Card>}{attendanceCounts && Object.entries(attendanceCounts).map(([label, count]) => <Card key={label}><CardContent className="p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-bold">{count}</p></CardContent></Card>)}</div>
    {choiceStats.length > 0 && <div className="grid gap-3 lg:grid-cols-2">{choiceStats.map(({ field, counts }) => <Card key={field.id}><CardContent className="p-4"><h2 className="mb-3 font-semibold">{field.title}</h2>{counts.map(({ label, count }) => <div key={label} className="mb-2 flex items-center gap-3 text-sm"><span className="w-28 truncate">{label}</span><div className="h-2 flex-1 overflow-hidden rounded bg-muted"><div className="h-full bg-primary" style={{ width: `${displaySubmissions.length ? Math.round(count / displaySubmissions.length * 100) : 0}%` }} /></div><span>{count}명 ({displaySubmissions.length ? Math.round(count / displaySubmissions.length * 100) : 0}%)</span></div>)}</CardContent></Card>)}</div>}
    {loading ? <p className="py-12 text-center">결과를 불러오는 중...</p> : <div className="overflow-x-auto rounded border"><table className="min-w-max w-full text-sm"><thead className="bg-muted"><tr><th className="p-2 text-left">순번</th><th className="p-2 text-left">제출 시각</th>{visibleFields.map((field) => <th key={field.id} className="p-2 text-left">{field.title}</th>)}<th className="p-2 text-left">관리자 메모</th><th className="p-2 text-left">상태</th></tr></thead><tbody>{filtered.map((submission) => <tr key={submission.id} className="border-t align-top"><td className="p-2">{submission.sequence}</td><td className="p-2 whitespace-nowrap">{dateText(submission.submittedAt)}</td>{visibleFields.map((field) => <td key={field.id} className="max-w-xs whitespace-pre-wrap p-2">{eventFormAnswerText(field, submission.answers[field.id])}</td>)}<td className="p-2"><span className="hidden print:inline">{submission.adminMemo || ""}</span><Input className="no-print" defaultValue={submission.adminMemo || ""} onBlur={(e) => void eventFormApi.updateSubmission(submission.id!, submission.status, e.target.value)} />{submission.duplicateWarning && <span className="ml-1 text-xs text-amber-700">중복 확인</span>}</td><td className="p-2"><select className="no-print rounded border bg-background p-1" value={submission.status} onChange={(e) => { const status = e.target.value as EventFormSubmission["status"]; setSubmissions(submissions.map((item) => item.id === submission.id ? { ...item, status } : item)); void eventFormApi.updateSubmission(submission.id!, status, submission.adminMemo || ""); }}><option value="submitted">제출</option><option value="reviewed">확인</option><option value="excluded">제외</option></select><span className="hidden print:inline">{submission.status}</span></td></tr>)}{filtered.length === 0 && <tr><td colSpan={visibleFields.length + 5} className="p-8 text-center text-muted-foreground">응답이 없습니다.</td></tr>}</tbody></table></div>}
    {!loading && filtered.length > 0 && <div className="no-print flex flex-wrap gap-2">
      {filtered.map((submission) => <Button key={submission.id} size="sm" variant="outline" onClick={() => setSelectedSubmission(submission)}>#{submission.sequence} 상세 보기</Button>)}
    </div>}
    <dl className="hidden print:block">{fields.map((field) => <div key={field.id} className="break-inside-avoid border p-2"><dt>{field.title} · {field.required || field.consentRequired ? "필수" : "선택"}</dt>{field.description && <dd className="whitespace-pre-wrap">{field.description}</dd>}</div>)}</dl>
    <section className="event-results-paper hidden" aria-hidden="true">
      <header>
        <h1 className="text-2xl font-bold">{presentation?.title || "결과 시트"}</h1>
        {presentation?.description && <p className="whitespace-pre-wrap">{presentation.description}</p>}
        <p>행사 일시: {presentation?.eventDateTime || "-"} · 장소: {presentation?.location || "-"}</p>
        <p>회차: {currentRound?.name || "-"} ({roundId || "-"}) · 버전: {version?.id || "-"}</p>
        <p>인쇄 생성 시각: {new Date().toLocaleString("ko-KR")}</p>
      </header>
      <div className="event-print-summary">
        <div>전체 응답<br /><strong>{statistics.total}</strong></div>
        <div>현재 필터 결과<br /><strong>{filtered.length}</strong></div>
        <div>제출 완료<br /><strong>{filteredStatistics.completed}</strong></div>
        <div>중복 경고<br /><strong>{filteredStatistics.duplicateWarnings}</strong></div>
      </div>
      {filtered.length === 0 ? <p>현재 조건에 해당하는 응답이 없습니다.</p> : filtered.map((submission) => <article key={submission.id} className="event-response-card">
        <h2 className="font-bold">응답 #{submission.sequence}</h2>
        <p>제출 시각: {dateText(submission.submittedAt) || "-"} · 응답 상태: {submissionStatusText(submission.status)}</p>
        <p>관리자 메모: {submission.adminMemo?.trim() || "-"}</p>
        <dl className="event-response-answers">
          {visibleFields.map((field) => {
            const address = field.type === "address" ? addressParts(submission.answers[field.id]) : null;
            return <div key={field.id} className="event-response-answer">
              <dt>{field.title} · {field.required || field.consentRequired ? "필수" : "선택"}</dt>
              {field.description && <dd className="event-response-help">{field.description}</dd>}
              {address ? <dd>도로명주소: {address.roadAddress || "-"}<br />상세주소: {address.detailAddress || "-"}</dd> : <dd>{eventFormAnswerText(field, submission.answers[field.id]) || "-"}</dd>}
            </div>;
          })}
        </dl>
      </article>)}
    </section>
    <Dialog open={Boolean(selectedSubmission)} onOpenChange={(open) => { if (!open) setSelectedSubmission(null); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{presentation?.title || "응답 상세"} · #{selectedSubmission?.sequence}</DialogTitle>
          <DialogDescription>{currentRound?.name} · {presentation?.eventDateTime || "일시 미등록"} · {presentation?.location || "장소 미등록"}</DialogDescription>
        </DialogHeader>
        {presentation?.description && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{presentation.description}</p>}
        <dl className="space-y-3">
          {visibleFields.map((field) => <div key={field.id} className="rounded border p-3">
            <dt className="font-semibold">{field.title}</dt>
            {field.description && <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{field.description}</dd>}
            <dd className="mt-1 whitespace-pre-wrap text-sm">{selectedSubmission ? eventFormAnswerText(field, selectedSubmission.answers[field.id]) || "응답 없음" : ""}</dd>
          </div>)}
        </dl>
        <p className="text-xs text-muted-foreground">제출 시각: {dateText(selectedSubmission?.submittedAt)}</p>
        {selectedSubmission?.invalidPayload && <p className="rounded bg-destructive/10 p-2 text-sm font-semibold text-destructive">응답 형식을 해석할 수 없어 답변을 비워 표시했습니다.</p>}
      </DialogContent>
    </Dialog>
  </section>;
}
