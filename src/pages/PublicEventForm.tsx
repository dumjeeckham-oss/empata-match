import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EventFormImage } from "@/components/EventFormImage";
import { KakaoAddressField } from "@/components/KakaoAddressField";
import { eventFormApi } from "@/lib/eventFormSparkApi";
import { validateEventFormAnswers } from "@/lib/eventForms";
import type { EventFormAddressAnswer, EventFormAnswers, EventFormAnswerValue, EventFormChoiceAnswer, EventFormField, PublicEventFormPayload } from "@/types/eventForms";

const emptyChoice = (): EventFormChoiceAnswer => ({ optionIds: [], otherSelected: false, otherText: "" });

function Field({ field, value, error, onChange }: { field: EventFormField; value: unknown; error?: string; onChange: (value: EventFormAnswerValue) => void }) {
  if (field.type === "divider") return <hr className="my-6 border-border" />;
  if (field.type === "notice") return <div className="rounded-lg bg-muted p-4"><h3 className="font-semibold">{field.title}</h3>{field.description && <p className="mt-1 whitespace-pre-wrap text-sm">{field.description}</p>}<EventFormImage image={field.image} className="mt-3 max-h-80" publicAccess /></div>;
  const choice = (value || emptyChoice()) as EventFormChoiceAnswer;
  const multiple = field.type === "multipleChoice";
  const setOption = (id: string, checked: boolean) => onChange({ ...choice, optionIds: multiple ? (checked ? [...choice.optionIds, id] : choice.optionIds.filter((item) => item !== id)) : checked ? [id] : [] });
  return <div className="space-y-3 rounded-lg border bg-card p-4 sm:p-5"><div><label className="font-semibold">{field.title}{(field.required || field.consentRequired) && <span className="ml-1 text-destructive">*</span>}</label>{field.description && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{field.description}</p>}</div><EventFormImage image={field.image} className="max-h-80 rounded" publicAccess />
    {["shortText", "name", "phone", "email", "number"].includes(field.type) && <Input type={field.type === "email" ? "email" : field.type === "number" ? "number" : "text"} inputMode={field.type === "phone" ? "tel" : undefined} value={typeof value === "string" || typeof value === "number" ? value : ""} placeholder={field.placeholder} onChange={(e) => onChange(field.type === "number" ? e.target.valueAsNumber : e.target.value)} />}
    {field.type === "longText" && <Textarea rows={5} value={typeof value === "string" ? value : ""} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />}
    {field.type === "date" && <Input type="date" min={field.dateMin} max={field.dateMax} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} />}
    {field.type === "address" && <KakaoAddressField value={value as EventFormAddressAnswer | undefined} onChange={onChange} />}
    {field.type === "consent" && <label className="flex items-start gap-3 rounded border p-3"><Checkbox checked={Boolean((value as { agreed?: boolean })?.agreed)} onCheckedChange={(checked) => onChange({ agreed: checked === true, consentVersion: field.consentVersion || "1", consentTextSnapshot: field.consentText || "" })} /><span className="text-sm whitespace-pre-wrap">{field.consentText}</span></label>}
    {["singleChoice", "multipleChoice", "attendance"].includes(field.type) && <div className="grid gap-2 sm:grid-cols-2">{(field.options || []).filter((option) => option.enabled).map((option) => { const checked = choice.optionIds.includes(option.id); return <label key={option.id} className={`flex cursor-pointer items-start gap-3 rounded border p-3 ${checked ? "border-primary bg-primary/5" : ""}`}><Checkbox checked={checked} onCheckedChange={(state) => setOption(option.id, state === true)} /><span className="min-w-0"><EventFormImage image={option.image} className="mb-2 max-h-40 rounded" publicAccess /><span>{option.label || option.image?.alt}</span></span></label>; })}</div>}
    {field.type === "dropdown" && <select className="h-11 w-full rounded border bg-background px-3" value={choice.optionIds[0] || ""} onChange={(e) => onChange({ ...choice, optionIds: e.target.value ? [e.target.value] : [] })}><option value="">선택하세요</option>{(field.options || []).filter((option) => option.enabled).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>}
    {["singleChoice", "multipleChoice", "dropdown", "attendance"].includes(field.type) && field.allowOther && <div className="space-y-2"><label className="flex items-center gap-2"><Checkbox checked={choice.otherSelected} onCheckedChange={(checked) => onChange({ ...choice, otherSelected: checked === true, otherText: checked ? choice.otherText : "" })} />기타</label>{choice.otherSelected && <Input value={choice.otherText || ""} maxLength={field.otherMaxLength} onChange={(e) => onChange({ ...choice, otherText: e.target.value })} placeholder="기타 의견" />}</div>}
    {error && <p className="text-sm font-medium text-destructive">{error}</p>}
  </div>;
}

export default function PublicEventForm() {
  const { token = "" } = useParams();
  const [form, setForm] = useState<PublicEventFormPayload | null>(null);
  const [answers, setAnswers] = useState<EventFormAnswers>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void eventFormApi.getPublic(token).then(setForm).catch((error) => setMessage(error instanceof Error ? error.message : "신청서를 찾을 수 없습니다.")).finally(() => setLoading(false)); }, [token]);
  if (loading) return <div className="min-h-screen bg-muted p-8 text-center">신청서를 불러오는 중...</div>;
  if (message && !form) return <div className="min-h-screen bg-muted p-8 text-center text-destructive">{message}</div>;
  if (!form) return null;
  if (form.status === "draft") return <div className="min-h-screen bg-muted p-8 text-center"><h1 className="text-2xl font-bold">{form.title}</h1><p className="mt-4">신청서를 준비하고 있습니다.</p></div>;
  if (form.status !== "open") return <div className="min-h-screen bg-muted p-8 text-center"><h1 className="text-2xl font-bold">{form.title}</h1><p className="mt-4">접수가 마감되었습니다.</p></div>;
  if (submitted) return <div className="min-h-screen bg-muted p-4 sm:p-8"><Card className="mx-auto mt-16 max-w-xl"><CardContent className="py-12 text-center"><h1 className="text-2xl font-bold">제출 완료</h1><p className="mt-4 whitespace-pre-wrap">{form.completionMessage}</p></CardContent></Card></div>;
  const submit = async () => {
    const nextErrors = validateEventFormAnswers(form.fields, answers);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) { document.querySelector("[data-event-form-fields]")?.scrollIntoView({ behavior: "smooth" }); return; }
    const browserKey = `event-form-submitted:${token}:${form.roundId}`;
    if (localStorage.getItem(browserKey) && form.duplicatePolicy !== "none" && !confirm("이 브라우저에서 이미 제출한 기록이 있습니다. 다시 제출할까요?")) return;
    setBusy(true);
    try { await eventFormApi.submit(token, form.roundId, form.versionId, answers); localStorage.setItem(browserKey, new Date().toISOString()); setSubmitted(true); }
    catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setMessage(text.includes("permission-denied") || text.includes("already-exists") ? "이 회차에는 이미 제출했습니다." : text);
    }
    finally { setBusy(false); }
  };
  return <main className="min-h-screen bg-muted/50 px-3 py-6 sm:px-6"><div className="mx-auto max-w-2xl space-y-4"><Card><CardHeader><EventFormImage image={form.poster} className="mb-4 max-h-[32rem] w-full rounded" publicAccess /><CardTitle className="text-2xl sm:text-3xl">{form.title}</CardTitle></CardHeader><CardContent className="space-y-2"><p className="whitespace-pre-wrap text-muted-foreground">{form.description}</p>{form.eventDateTime && <p><strong>일시:</strong> {form.eventDateTime.replace("T", " ")}</p>}{form.location && <p><strong>장소:</strong> {form.location}</p>}</CardContent></Card><div data-event-form-fields className="space-y-4">{form.fields.map((field) => <Field key={field.id} field={field} value={answers[field.id]} error={errors[field.id]} onChange={(value) => setAnswers({ ...answers, [field.id]: value })} />)}</div>{message && <p className="rounded bg-destructive/10 p-3 text-sm text-destructive">{message}</p>}<Button size="lg" className="w-full" disabled={busy} onClick={() => void submit()}>{busy ? "제출 중..." : "신청서 제출"}</Button><p className="pb-6 text-center text-xs text-muted-foreground">주소 검색 결과는 실제 거주 사실을 인증하지 않습니다.</p></div></main>;
}
