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
import { sortEventFormFields, validateEventFormAnswers } from "@/lib/eventForms";
import { publicEventFormErrorMessage } from "@/lib/publicEventFormErrors";
import type { EventFormAddressAnswer, EventFormAnswers, EventFormAnswerValue, EventFormChoiceAnswer, EventFormField, PublicEventFormPayload } from "@/types/eventForms";

const emptyChoice = (): EventFormChoiceAnswer => ({ optionIds: [], otherSelected: false, otherText: "" });

function Field({ field, value, error, onChange }: { field: EventFormField; value: unknown; error?: string; onChange: (value: EventFormAnswerValue) => void }) {
  if (field.type === "divider") return <div><hr className="my-6 border-border" />{field.description?.trim() && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{field.description}</p>}</div>;
  if (field.type === "notice") return <div className="rounded-lg bg-muted p-4"><h3 className="font-semibold">{field.title}</h3>{field.description && <p className="mt-1 whitespace-pre-wrap text-sm">{field.description}</p>}<EventFormImage image={field.image} className="mt-3 max-h-80" publicAccess /></div>;
  const choice = (value || emptyChoice()) as EventFormChoiceAnswer;
  const multiple = field.type === "multipleChoice";
  const setOption = (id: string, checked: boolean) => onChange({ ...choice, optionIds: multiple ? (checked ? [...choice.optionIds, id] : choice.optionIds.filter((item) => item !== id)) : checked ? [id] : [] });
  const idBase = `event-field-${encodeURIComponent(field.id)}`;
  const inputId = `${idBase}-input`;
  const labelId = `${idBase}-label`;
  const helpId = `${idBase}-help`;
  const errorId = `${idBase}-error`;
  const required = Boolean(field.required || field.consentRequired);
  const describedBy = [field.description?.trim() ? helpId : "", error ? errorId : ""].filter(Boolean).join(" ") || undefined;
  const commonA11y = { "aria-labelledby": labelId, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined, "aria-required": required || undefined } as const;
  return <div data-question-id={field.id} className="min-w-0 break-words space-y-3 rounded-lg border bg-card p-4 sm:p-5"><div><h2 id={labelId} className="font-semibold">{field.title}{required && <span className="ml-1 text-destructive" aria-hidden="true">*</span>}{required && <span className="sr-only"> 필수 입력</span>}</h2>{field.description && <p id={helpId} className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{field.description}</p>}</div><EventFormImage image={field.image} className="max-h-80 rounded" publicAccess />
    {["shortText", "name", "phone", "email", "number"].includes(field.type) && <Input id={inputId} data-question-control data-question-id={field.id} type={field.type === "email" ? "email" : field.type === "number" ? "number" : "text"} inputMode={field.type === "phone" ? "tel" : undefined} value={typeof value === "string" || typeof value === "number" ? value : ""} placeholder={field.placeholder} required={required} {...commonA11y} onChange={(e) => onChange(field.type === "number" ? e.target.valueAsNumber : e.target.value)} />}
    {field.type === "longText" && <Textarea id={inputId} data-question-control rows={5} value={typeof value === "string" ? value : ""} placeholder={field.placeholder} required={required} {...commonA11y} onChange={(e) => onChange(e.target.value)} />}
    {field.type === "date" && <Input id={inputId} data-question-control type="date" min={field.dateMin} max={field.dateMax} value={typeof value === "string" ? value : ""} required={required} {...commonA11y} onChange={(e) => onChange(e.target.value)} />}
    {field.type === "address" && <KakaoAddressField value={value as EventFormAddressAnswer | undefined} onChange={onChange} idPrefix={idBase} labelledBy={labelId} describedBy={describedBy} required={required} invalid={Boolean(error)} />}
    {field.type === "consent" && <label htmlFor={inputId} className="flex min-h-11 cursor-pointer items-start gap-3 rounded border p-3"><Checkbox id={inputId} data-question-control checked={Boolean((value as { agreed?: boolean })?.agreed)} required={required} {...commonA11y} onCheckedChange={(checked) => onChange({ agreed: checked === true, consentVersion: field.consentVersion || "1", consentTextSnapshot: field.consentText || "" })} /><span className="text-sm whitespace-pre-wrap">{field.consentText}</span></label>}
    {["singleChoice", "multipleChoice", "attendance"].includes(field.type) && <div role="group" {...commonA11y} className="grid gap-2 sm:grid-cols-2">{(field.options || []).filter((option) => option.enabled).map((option) => { const checked = choice.optionIds.includes(option.id); const optionId = `${idBase}-option-${encodeURIComponent(option.id)}`; return <label key={option.id} htmlFor={optionId} className={`flex min-h-11 cursor-pointer items-start gap-3 rounded border p-3 ${checked ? "border-primary bg-primary/5" : ""}`}><Checkbox id={optionId} data-question-control checked={checked} onCheckedChange={(state) => setOption(option.id, state === true)} /><span className="min-w-0"><EventFormImage image={option.image} className="mb-2 max-h-40 rounded" publicAccess /><span>{option.label || option.image?.alt}</span></span></label>; })}</div>}
    {field.type === "dropdown" && <select id={inputId} data-question-control className="h-11 w-full rounded border bg-background px-3" value={choice.optionIds[0] || ""} required={required} {...commonA11y} onChange={(e) => onChange({ ...choice, optionIds: e.target.value ? [e.target.value] : [] })}><option value="">선택하세요</option>{(field.options || []).filter((option) => option.enabled).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>}
    {["singleChoice", "multipleChoice", "dropdown", "attendance"].includes(field.type) && field.allowOther && <div className="space-y-2"><label htmlFor={`${idBase}-other`} className="flex min-h-11 cursor-pointer items-center gap-2"><Checkbox id={`${idBase}-other`} checked={choice.otherSelected} onCheckedChange={(checked) => onChange({ ...choice, otherSelected: checked === true, otherText: checked ? choice.otherText : "" })} />기타</label>{choice.otherSelected && <><label htmlFor={`${idBase}-other-text`} className="sr-only">기타 의견</label><Input id={`${idBase}-other-text`} data-question-control value={choice.otherText || ""} maxLength={field.otherMaxLength} required={field.otherRequired} aria-label="기타 의견" aria-describedby={describedBy} aria-invalid={error ? true : undefined} onChange={(e) => onChange({ ...choice, otherText: e.target.value })} placeholder="기타 의견" /></>}</div>}
    {error && <p id={errorId} role="alert" aria-live="polite" className="text-sm font-medium text-destructive">{error}</p>}
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
  const [loadAttempt, setLoadAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setMessage("");
    setForm(null);
    void eventFormApi.getPublic(token)
      .then((nextForm) => { if (active) setForm(nextForm); })
      .catch((error: unknown) => { if (active) setMessage(publicEventFormErrorMessage(error)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, loadAttempt]);
  if (loading) return <div className="min-h-screen bg-muted p-8 text-center">신청서를 불러오는 중...</div>;
  if (message && !form) return <div className="min-h-screen bg-muted p-8 text-center"><p role="alert" className="text-destructive">{message}</p><Button className="mt-4 min-h-11 min-w-11" variant="outline" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>다시 시도</Button></div>;
  if (!form) return null;
  if (form.status === "draft") return <div className="min-h-screen bg-muted p-8 text-center"><h1 className="text-2xl font-bold">{form.title}</h1><p className="mt-4">신청서를 준비하고 있습니다.</p></div>;
  if (form.status !== "open") return <div className="min-h-screen bg-muted p-8 text-center"><h1 className="text-2xl font-bold">{form.title}</h1><p className="mt-4">접수가 마감되었습니다.</p></div>;
  if (submitted) return <div className="min-h-screen bg-muted p-4 sm:p-8"><Card className="mx-auto mt-16 max-w-xl"><CardContent className="py-12 text-center"><h1 className="text-2xl font-bold">제출 완료</h1><p className="mt-4 whitespace-pre-wrap">{form.completionMessage}</p></CardContent></Card></div>;
  const submit = async () => {
    const nextErrors = validateEventFormAnswers(form.fields, answers);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) { const firstId = Object.keys(nextErrors)[0]; const question = Array.from(document.querySelectorAll<HTMLElement>("[data-question-id]")).find((element) => element.dataset.questionId === firstId); const target = question?.querySelector<HTMLElement>("[data-question-control]") || question; target?.scrollIntoView?.({ behavior: "smooth", block: "center" }); target?.focus(); return; }
    const browserKey = `event-form-submitted:${token}:${form.roundId}`;
    if (localStorage.getItem(browserKey) && form.duplicatePolicy !== "none" && !confirm("이 브라우저에서 이미 제출한 기록이 있습니다. 다시 제출할까요?")) return;
    setBusy(true);
    try { await eventFormApi.submit(token, form.roundId, form.versionId, answers); localStorage.setItem(browserKey, new Date().toISOString()); setSubmitted(true); }
    catch (error: unknown) { setMessage(publicEventFormErrorMessage(error, "submit")); }
    finally { setBusy(false); }
  };
  return <main className="min-h-screen bg-muted/50 px-3 py-6 sm:px-6"><div className="mx-auto max-w-2xl space-y-4"><Card><CardHeader><EventFormImage image={form.poster} className="mb-4 max-h-[32rem] w-full rounded" publicAccess /><CardTitle className="text-2xl sm:text-3xl">{form.title}</CardTitle></CardHeader><CardContent className="space-y-2"><p className="whitespace-pre-wrap text-muted-foreground">{form.description}</p>{form.eventDateTime && <p><strong>일시:</strong> {form.eventDateTime.replace("T", " ")}</p>}{form.location && <p><strong>장소:</strong> {form.location}</p>}</CardContent></Card><div data-event-form-fields className="space-y-4">{sortEventFormFields(form.fields).filter((field) => field.visible).map((field) => <Field key={field.id} field={field} value={answers[field.id]} error={errors[field.id]} onChange={(value) => { setAnswers({ ...answers, [field.id]: value }); if (errors[field.id]) setErrors(({ [field.id]: _removed, ...rest }) => rest); }} />)}</div>{message && <p role="alert" className="rounded bg-destructive/10 p-3 text-sm text-destructive">{message}</p>}<Button size="lg" className="min-h-11 w-full" disabled={busy} onClick={() => void submit()}>{busy ? "제출 중..." : "신청서 제출"}</Button><p className="pb-6 text-center text-xs text-muted-foreground">주소 검색 결과는 실제 거주 사실을 인증하지 않습니다.</p></div></main>;
}
