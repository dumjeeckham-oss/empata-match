import type {
  EventFormAnswers,
  EventFormChoiceAnswer,
  EventFormField,
  EventFormFieldType,
  EventFormImageRef,
} from "@/types/eventForms";

export const EVENT_FORM_MAX_FIELDS = 100;
export const EVENT_FORM_MAX_IMAGES = 12;
export const EVENT_FORM_MAX_IMAGE_ENCODED_BYTES = 250 * 1024;
export const EVENT_FORM_MAX_PUBLIC_IMAGE_BYTES = 2 * 1024 * 1024;
export const EVENT_FORM_MAX_SUBMISSION_BYTES = 50 * 1024;
export const EVENT_FORM_MAX_SUBMISSION_ENCODED_BYTES = 68_268;
export const EVENT_FORM_MAX_LONG_TEXT_LENGTH = 5_000;
export const EVENT_FORM_MAX_CHOICE_VALUES = 100;

export const EVENT_FORM_FIELD_LABELS: Record<EventFormFieldType, string> = {
  shortText: "한 줄 텍스트",
  longText: "여러 줄 텍스트",
  name: "이름",
  phone: "연락처",
  number: "숫자",
  email: "이메일",
  date: "날짜 선택",
  singleChoice: "단일 객관식",
  multipleChoice: "복수 객관식",
  dropdown: "드롭다운",
  attendance: "참석 여부",
  address: "도로명주소",
  consent: "개인정보 동의",
  notice: "안내문",
  divider: "구분선",
};

const ANSWERABLE_TYPES = new Set<EventFormFieldType>([
  "shortText", "longText", "name", "phone", "number", "email", "date",
  "singleChoice", "multipleChoice", "dropdown", "attendance", "address", "consent",
]);
const CHOICE_TYPES = new Set<EventFormFieldType>(["singleChoice", "multipleChoice", "dropdown", "attendance"]);

export function createEventFormId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}-${uuid}`;
  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  return `${prefix}-${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
}

export function createPublicEventFormToken(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  const binary = Array.from(bytes, (value) => String.fromCharCode(value)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function hashPublicEventFormToken(token: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

export function createEventFormSubmissionId(roundId: string, uid: string): string {
  return `${roundId}__${uid}`;
}

export function eventFormPayloadBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

export function encodeEventFormAnswers(answers: EventFormAnswers): { answersBase64: string; encodedBytes: number; answerIds: string[] } {
  const bytes = new TextEncoder().encode(JSON.stringify(answers));
  return { answersBase64: bytesToBase64(bytes), encodedBytes: bytes.byteLength, answerIds: Object.keys(answers) };
}

export function decodeEventFormAnswers(value: unknown): { answers: EventFormAnswers; invalidPayload: boolean } {
  if (typeof value !== "string" || !value) return { answers: {}, invalidPayload: true };
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { answers: {}, invalidPayload: true };
    return { answers: parsed as EventFormAnswers, invalidPayload: false };
  } catch {
    return { answers: {}, invalidPayload: true };
  }
}

export function collectEventFormImages(fields: EventFormField[], poster?: EventFormImageRef | null): EventFormImageRef[] {
  const refs = [poster || undefined, ...fields.flatMap((field) => [field.image, ...(field.options || []).map((option) => option.image)])]
    .filter((image): image is EventFormImageRef => Boolean(image?.assetId));
  return [...new Map(refs.map((image) => [image.assetId, image])).values()];
}

export function getEventFormUsage(fields: EventFormField[], poster?: EventFormImageRef | null, expectedResponses = 0) {
  const images = collectEventFormImages(fields, poster);
  const publicImageBytes = images.reduce((sum, image) => sum + Number(image.encodedBytes || 0), 0);
  return {
    fieldCount: fields.length,
    imageCount: images.length,
    publicImageBytes,
    estimatedMonthlyTransferBytes: publicImageBytes * Math.max(0, expectedResponses),
    estimatedFirestoreStorageUpperBoundBytes: publicImageBytes + EVENT_FORM_MAX_SUBMISSION_ENCODED_BYTES * Math.max(0, expectedResponses),
  };
}

export function validateEventFormImageLimits(fields: EventFormField[], poster?: EventFormImageRef | null): string[] {
  const images = collectEventFormImages(fields, poster);
  const total = images.reduce((sum, image) => sum + Number(image.encodedBytes || 0), 0);
  const issues: string[] = [];
  if (images.length > EVENT_FORM_MAX_IMAGES) issues.push(`공개 버전 이미지는 최대 ${EVENT_FORM_MAX_IMAGES}개까지 사용할 수 있습니다.`);
  if (images.some((image) => !image.encodedBytes || image.encodedBytes > EVENT_FORM_MAX_IMAGE_ENCODED_BYTES)) {
    issues.push("250KB를 초과하거나 크기를 확인할 수 없는 이미지가 있습니다.");
  }
  if (total > EVENT_FORM_MAX_PUBLIC_IMAGE_BYTES) issues.push("공개 버전 이미지 합계가 2MB를 초과합니다.");
  return issues;
}

export function sortEventFormFields(fields: EventFormField[]): EventFormField[] {
  return [...fields].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export function validateEventFormForPublishing(fields: EventFormField[]): string[] {
  const issues: string[] = [];
  if (fields.length > EVENT_FORM_MAX_FIELDS) issues.push(`문항은 최대 ${EVENT_FORM_MAX_FIELDS}개까지 만들 수 있습니다.`);
  const visible = fields.filter((field) => field.visible);
  if (!visible.some((field) => ANSWERABLE_TYPES.has(field.type))) {
    issues.push("응답을 받을 수 있는 표시 문항을 한 개 이상 추가해주세요.");
  }
  for (const field of visible) {
    if (!field.title.trim() && field.type !== "divider") issues.push("제목이 없는 문항이 있습니다.");
    if (CHOICE_TYPES.has(field.type)) {
      const enabled = (field.options || []).filter((option) => option.enabled);
      if (enabled.length < 1) issues.push(`'${field.title || "객관식"}' 문항에 사용 가능한 선택지를 추가해주세요.`);
      if (enabled.some((option) => !option.label.trim() && !option.image?.alt.trim())) {
        issues.push(`'${field.title || "객관식"}' 문항의 모든 선택지에는 이름 또는 이미지 대체 설명이 필요합니다.`);
      }
    }
    if (field.type === "consent" && !field.consentText?.trim()) {
      issues.push(`'${field.title || "동의"}' 문항의 동의 안내문을 입력해주세요.`);
    }
  }
  return [...new Set(issues)];
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && !value.trim()) || (Array.isArray(value) && value.length === 0);
}

function validateText(field: EventFormField, value: unknown): string | null {
  if (typeof value !== "string") return "문자 형식으로 입력해주세요.";
  const trimmed = value.trim();
  if (field.minLength && trimmed.length < field.minLength) return `최소 ${field.minLength}자 이상 입력해주세요.`;
  const typeLimit = field.type === "longText" ? EVENT_FORM_MAX_LONG_TEXT_LENGTH
    : field.type === "name" ? 100
      : field.type === "phone" ? 30
        : field.type === "email" ? 320
          : 500;
  const maxLength = Math.min(field.maxLength || typeLimit, typeLimit);
  if (trimmed.length > maxLength) return `최대 ${maxLength}자까지 입력할 수 있습니다.`;
  if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return "올바른 이메일 주소를 입력해주세요.";
  if (field.type === "phone" && normalizeDuplicateValue("phone", trimmed).length < 9) return "올바른 연락처를 입력해주세요.";
  return null;
}

function validateChoice(field: EventFormField, value: unknown): string | null {
  if (!value || typeof value !== "object") return "선택값이 올바르지 않습니다.";
  const answer = value as EventFormChoiceAnswer;
  if (!Array.isArray(answer.optionIds)) return "선택값이 올바르지 않습니다.";
  if (answer.optionIds.length > EVENT_FORM_MAX_CHOICE_VALUES) return `선택값은 최대 ${EVENT_FORM_MAX_CHOICE_VALUES}개까지 저장할 수 있습니다.`;
  const allowed = new Set((field.options || []).filter((option) => option.enabled).map((option) => option.id));
  if (answer.optionIds.some((id) => !allowed.has(id))) return "현재 문항에 없는 선택지가 포함되어 있습니다.";
  if (new Set(answer.optionIds).size !== answer.optionIds.length) return "같은 선택지를 중복 선택할 수 없습니다.";
  const count = answer.optionIds.length + (answer.otherSelected ? 1 : 0);
  if (field.required && count < 1) return "필수 문항입니다.";
  if (field.type !== "multipleChoice" && count > 1) return "하나의 항목만 선택할 수 있습니다.";
  if ((field.minSelections || 0) > count) return `최소 ${field.minSelections}개를 선택해주세요.`;
  if (field.maxSelections && count > field.maxSelections) return `최대 ${field.maxSelections}개까지 선택할 수 있습니다.`;
  if (answer.otherSelected && !field.allowOther) return "기타 의견을 사용할 수 없는 문항입니다.";
  if (!answer.otherSelected && answer.otherText?.trim()) return "기타를 선택한 뒤 의견을 입력해주세요.";
  if (answer.otherSelected && !answer.otherText?.trim()) return "기타 의견을 입력해주세요.";
  const otherMaxLength = Math.min(field.otherMaxLength || 1_000, 1_000);
  if (answer.otherText && answer.otherText.length > otherMaxLength) return `기타 의견은 최대 ${otherMaxLength}자까지 입력할 수 있습니다.`;
  return null;
}

function localToday(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function validateEventFormAnswers(
  fields: EventFormField[],
  answers: EventFormAnswers,
  today = localToday(),
): Record<string, string> {
  const errors: Record<string, string> = {};
  const visibleFields = fields.filter((field) => field.visible && ANSWERABLE_TYPES.has(field.type));
  const visibleIds = new Set(visibleFields.map((field) => field.id));
  for (const answerId of Object.keys(answers)) {
    if (!visibleIds.has(answerId)) errors[answerId] = "현재 신청서에 없는 문항입니다.";
  }
  for (const field of visibleFields) {
    const value = answers[field.id];
    if (isEmpty(value)) {
      if (field.required || (field.type === "consent" && field.consentRequired)) errors[field.id] = "필수 문항입니다.";
      continue;
    }
    let error: string | null = null;
    if (["shortText", "longText", "name", "phone", "email"].includes(field.type)) error = validateText(field, value);
    else if (field.type === "number") {
      const numeric = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(numeric)) error = "숫자를 입력해주세요.";
      else if (field.min !== undefined && numeric < field.min) error = `${field.min} 이상 입력해주세요.`;
      else if (field.max !== undefined && numeric > field.max) error = `${field.max} 이하로 입력해주세요.`;
    } else if (CHOICE_TYPES.has(field.type)) error = validateChoice(field, value);
    else if (field.type === "date") {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) error = "올바른 날짜를 선택해주세요.";
      else if (field.dateMin && value < field.dateMin) error = `${field.dateMin} 이후 날짜를 선택해주세요.`;
      else if (field.dateMax && value > field.dateMax) error = `${field.dateMax} 이전 날짜를 선택해주세요.`;
      else if (field.allowPast === false && value < today) error = "과거 날짜는 선택할 수 없습니다.";
      else if (field.allowFuture === false && value > today) error = "미래 날짜는 선택할 수 없습니다.";
    } else if (field.type === "address") {
      if (!value || typeof value !== "object") error = "주소 검색을 이용해 주소를 입력해주세요.";
      else {
        const address = value as unknown as Record<string, unknown>;
        const started = Boolean(address.zonecode || address.roadAddress || address.detailAddress);
        if ((field.required || started) && (!String(address.zonecode || "").trim() || !String(address.roadAddress || "").trim())) error = "주소 검색을 이용해 기본주소를 선택해주세요.";
        else if ((field.required || started) && !String(address.detailAddress || "").trim()) error = "상세주소를 입력해주세요.";
        else if (String(address.zonecode || "").length > 10 || String(address.roadAddress || "").length > 500 || String(address.jibunAddress || "").length > 500 || String(address.detailAddress || "").length > 200 || String(address.extraAddress || "").length > 200 || String(address.displayAddress || "").length > 1_000) error = "주소 입력 길이가 허용 범위를 초과했습니다.";
      }
    } else if (field.type === "consent") {
      if (!value || typeof value !== "object") error = "동의 여부를 선택해주세요.";
      else if ((field.required || field.consentRequired) && (value as { agreed?: boolean }).agreed !== true) error = "필수 동의 항목에 동의해주세요.";
      else if (String((value as { consentVersion?: unknown }).consentVersion || "").length > 100 || String((value as { consentTextSnapshot?: unknown }).consentTextSnapshot || "").length > EVENT_FORM_MAX_LONG_TEXT_LENGTH) error = "동의 정보 길이가 허용 범위를 초과했습니다.";
    }
    if (error) errors[field.id] = error;
  }
  return errors;
}

export function normalizeDuplicateValue(type: "phone" | "email" | "identifier", value: string): string {
  const trimmed = value.trim();
  if (type === "phone") {
    const digits = trimmed.replace(/\D/g, "");
    if (digits.startsWith("82")) return `0${digits.slice(2)}`;
    return digits;
  }
  return type === "email" ? trimmed.toLowerCase() : trimmed.replace(/\s+/g, "").toLowerCase();
}

export function sanitizeSpreadsheetCell(value: unknown): string | number | boolean {
  if (typeof value === "number" || typeof value === "boolean") return value;
  const text = String(value ?? "");
  return /^[\t\r ]*[=+\-@]/.test(text) ? `'${text}` : text;
}
