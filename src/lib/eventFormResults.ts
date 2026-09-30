import type { EventFormChoiceAnswer, EventFormField, EventFormSlot, EventFormSubmission, EventFormVersion } from "@/types/eventForms";
import { normalizeDuplicateValue, sanitizeSpreadsheetCell, sortEventFormFields } from "@/lib/eventForms";

export type EventFormPresentation = Pick<
  EventFormSlot,
  "title" | "description" | "eventDateTime" | "location" | "poster" | "completionMessage" | "applicationStartAt" | "applicationEndAt" | "expectedTargetCount"
>;

export function resolveEventFormPresentation(
  form: EventFormSlot | null,
  version: EventFormVersion | null,
): EventFormPresentation | null {
  if (version?.formSnapshot) return version.formSnapshot;
  if (!form) return null;
  return {
    title: form.title,
    description: form.description,
    eventDateTime: form.eventDateTime,
    location: form.location,
    poster: form.poster,
    completionMessage: form.completionMessage,
    applicationStartAt: form.applicationStartAt,
    applicationEndAt: form.applicationEndAt,
    expectedTargetCount: form.expectedTargetCount,
  };
}

export function resolveEventFormResultFields(version: EventFormVersion | null): EventFormField[] {
  return sortEventFormFields(version?.fields || []);
}

export function buildEventFormSummaryRows(
  presentation: EventFormPresentation | null,
  roundName: string,
  totalResponses: number,
  filteredResponses: number,
  printedAt: string,
): (string | number)[][] {
  return [
    ["폼 제목", presentation?.title || ""],
    ["회차", roundName],
    ["행사 일시", presentation?.eventDateTime || ""],
    ["장소", presentation?.location || ""],
    ["설명", presentation?.description || ""],
    ["출력 일시", printedAt],
    ["전체 응답", totalResponses],
    ["현재 필터 결과", filteredResponses],
  ];
}

export function eventFormAnswerText(field: EventFormField, value: unknown): string {
  if (value === undefined || value === null) return "";
  const record = typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  if (field.type === "address") {
    if (!record) return "";
    return String(record.displayAddress || [record.roadAddress, record.detailAddress].filter(Boolean).join(" "));
  }
  if (field.type === "consent") return record?.agreed === true ? "동의" : "미동의";
  if (["singleChoice", "multipleChoice", "dropdown", "attendance"].includes(field.type)) {
    if (!record) return "";
    const optionIds = Array.isArray(record.optionIds) ? record.optionIds.filter((id): id is string => typeof id === "string").slice(0, 100) : [];
    const labels = optionIds.map((id) => field.options?.find((option) => option.id === id)?.label || id);
    if (record.otherSelected === true) labels.push(`기타: ${typeof record.otherText === "string" ? record.otherText : ""}`);
    return labels.join(", ");
  }
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : "";
}

function selectedOptionIds(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const optionIds = (value as Partial<EventFormChoiceAnswer>).optionIds;
  return Array.isArray(optionIds) ? optionIds.filter((id): id is string => typeof id === "string").slice(0, 100) : [];
}

export function markDuplicateEventFormSubmissions(fields: EventFormField[], submissions: EventFormSubmission[], duplicateFieldId?: string): EventFormSubmission[] {
  if (!duplicateFieldId) return submissions.map((item) => ({ ...item, duplicateWarning: false }));
  const field = fields.find((item) => item.id === duplicateFieldId);
  if (!field) return submissions.map((item) => ({ ...item, duplicateWarning: false }));
  const kind = field.type === "phone" ? "phone" : field.type === "email" ? "email" : "identifier";
  const counts = new Map<string, number>();
  const keys = submissions.map((item) => normalizeDuplicateValue(kind, eventFormAnswerText(field, item.answers[field.id])));
  keys.filter(Boolean).forEach((key) => counts.set(key, (counts.get(key) || 0) + 1));
  return submissions.map((item, index) => ({ ...item, duplicateWarning: Boolean(keys[index] && (counts.get(keys[index]) || 0) > 1) }));
}

export function buildEventFormStatistics(fields: EventFormField[], submissions: EventFormSubmission[], expectedTargetCount?: number) {
  const completed = submissions.filter((item) => item.status !== "excluded").length;
  const duplicateWarnings = submissions.filter((item) => item.duplicateWarning).length;
  const attendance = fields.find((field) => field.type === "attendance");
  const attendanceCounts = attendance ? Object.fromEntries((attendance.options || []).map((option) => [option.label, submissions.filter((item) => selectedOptionIds(item.answers[attendance.id]).includes(option.id)).length])) : null;
  const choiceStats = fields.filter((field) => ["singleChoice", "multipleChoice", "attendance"].includes(field.type)).map((field) => ({ field, counts: (field.options || []).map((option) => ({ label: option.label, count: submissions.filter((submission) => selectedOptionIds(submission.answers[field.id]).includes(option.id)).length })) }));
  return { total: submissions.length, completed, duplicateWarnings, expectedTargetCount, submissionRate: expectedTargetCount && expectedTargetCount > 0 ? Math.round(completed / expectedTargetCount * 1000) / 10 : null, attendanceCounts, choiceStats };
}

export function buildEventFormExportRows(fields: EventFormField[], submissions: EventFormSubmission[], dateFormatter: (value: unknown) => string) {
  return submissions.map((submission) => ({ "제출 순번": submission.sequence, "제출 시각": dateFormatter(submission.submittedAt), ...Object.fromEntries(fields.map((field) => [field.title, sanitizeSpreadsheetCell(eventFormAnswerText(field, submission.answers[field.id]))])), "중복 경고": submission.duplicateWarning ? "확인 필요" : "", "관리자 메모": sanitizeSpreadsheetCell(submission.adminMemo || ""), "응답 상태": submission.status }));
}
