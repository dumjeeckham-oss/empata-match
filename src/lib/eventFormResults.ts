import type { EventFormChoiceAnswer, EventFormField, EventFormSlot, EventFormSubmission, EventFormVersion } from "@/types/eventForms";
import { sanitizeSpreadsheetCell, sortEventFormFields } from "@/lib/eventForms";

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
  const record = value as Record<string, unknown>;
  if (field.type === "address") return String(record.displayAddress || [record.roadAddress, record.detailAddress].filter(Boolean).join(" "));
  if (field.type === "consent") return record.agreed ? "동의" : "미동의";
  if (["singleChoice", "multipleChoice", "dropdown", "attendance"].includes(field.type)) {
    const choice = value as unknown as EventFormChoiceAnswer;
    const labels = (choice.optionIds || []).map((id) => field.options?.find((option) => option.id === id)?.label || id);
    if (choice.otherSelected) labels.push(`기타: ${choice.otherText || ""}`);
    return labels.join(", ");
  }
  return String(value);
}

export function buildEventFormStatistics(fields: EventFormField[], submissions: EventFormSubmission[], expectedTargetCount?: number) {
  const completed = submissions.filter((item) => item.status !== "excluded").length;
  const duplicateWarnings = submissions.filter((item) => item.duplicateWarning).length;
  const attendance = fields.find((field) => field.type === "attendance");
  const attendanceCounts = attendance ? Object.fromEntries((attendance.options || []).map((option) => [option.label, submissions.filter((item) => ((item.answers[attendance.id] as EventFormChoiceAnswer | undefined)?.optionIds || []).includes(option.id)).length])) : null;
  const choiceStats = fields.filter((field) => ["singleChoice", "multipleChoice", "attendance"].includes(field.type)).map((field) => ({ field, counts: (field.options || []).map((option) => ({ label: option.label, count: submissions.filter((submission) => ((submission.answers[field.id] as EventFormChoiceAnswer | undefined)?.optionIds || []).includes(option.id)).length })) }));
  return { total: submissions.length, completed, duplicateWarnings, expectedTargetCount, submissionRate: expectedTargetCount && expectedTargetCount > 0 ? Math.round(completed / expectedTargetCount * 1000) / 10 : null, attendanceCounts, choiceStats };
}

export function buildEventFormExportRows(fields: EventFormField[], submissions: EventFormSubmission[], dateFormatter: (value: unknown) => string) {
  return submissions.map((submission) => ({ "제출 순번": submission.sequence, "제출 시각": dateFormatter(submission.submittedAt), ...Object.fromEntries(fields.map((field) => [field.title, sanitizeSpreadsheetCell(eventFormAnswerText(field, submission.answers[field.id]))])), "중복 경고": submission.duplicateWarning ? "확인 필요" : "", "관리자 메모": sanitizeSpreadsheetCell(submission.adminMemo || ""), "응답 상태": submission.status }));
}
