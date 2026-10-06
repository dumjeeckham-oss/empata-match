import type { EventFormField, EventFormSlot } from "@/types/eventForms";
import { validateEventFormAnswers } from "@/lib/eventForms";

export const EVENT_FORM_SLOT_NUMBERS = [1, 2] as const;
export const EVENT_FORM_DELETE_CHUNK = 400;

/** No implicit migration: existing forms must be explicitly selected by staff. */
export function validateSlotAssignment(slot: number, formId: string, slots: { slotNumber: number; formId: string }[]) {
  if (!EVENT_FORM_SLOT_NUMBERS.some((number) => number === slot)) throw new Error("입력폼은 2개 슬롯만 사용할 수 있습니다.");
  if (!formId.trim()) throw new Error("연결할 폼을 선택해주세요.");
  if (slots.some((item) => item.slotNumber === slot || item.formId === formId)) throw new Error("이미 연결된 슬롯 또는 폼입니다.");
}

export function requiredQuestionIds(fields: EventFormField[]) {
  return fields.filter((field) => field.visible && !["notice", "divider"].includes(field.type)
    && (field.required || (field.type === "consent" && field.consentRequired))).map((field) => field.id);
}

export function answeredQuestionIds(fields: EventFormField[], answers: Parameters<typeof validateEventFormAnswers>[1]) {
  const errors = validateEventFormAnswers(fields, answers);
  return fields.filter((field) => {
    const value = answers[field.id];
    if (!field.visible || ["notice", "divider"].includes(field.type) || errors[field.id] || value == null) return false;
    if (typeof value === "string") return Boolean(value.trim());
    if (typeof value === "object") {
      if ("optionIds" in value) return value.optionIds.length > 0 || value.otherSelected === true;
      if ("agreed" in value) return value.agreed === true;
      if ("roadAddress" in value) return Boolean(value.roadAddress.trim() && value.detailAddress.trim());
    }
    return typeof value === "number" && Number.isFinite(value);
  }).map((field) => field.id);
}

export function deletionChunks<T>(documents: T[]): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < documents.length; index += EVENT_FORM_DELETE_CHUNK) chunks.push(documents.slice(index, index + EVENT_FORM_DELETE_CHUNK));
  return chunks;
}

export type EventFormExportReceipt = {
  formId: string; roundId: string; versionId: string; responseCount: number;
  fingerprint: string; sha256: string; actorUid: string; downloadedAt: string;
};

export function validateResetConfirmation(form: EventFormSlot, count: number, fingerprint: string,
  receipt: EventFormExportReceipt | null, confirmedDownload: boolean, typedTitle: string) {
  if (form.status !== "closed") throw new Error("먼저 접수를 마감해주세요.");
  if (typedTitle !== form.title) throw new Error("폼 제목을 정확히 다시 입력해주세요.");
  if (count === 0) return;
  if (!confirmedDownload || !receipt || receipt.formId !== form.id || receipt.responseCount !== count
    || receipt.roundId !== form.activeRoundId || receipt.versionId !== form.activeVersionId
    || receipt.fingerprint !== fingerprint || !/^[a-f0-9]{64}$/.test(receipt.sha256)) {
    throw new Error("전체 회차 엑셀을 다시 저장하고 다운로드를 확인해주세요.");
  }
}
