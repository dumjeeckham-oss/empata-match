import { describe, expect, it } from "vitest";
import { answeredQuestionIds, deletionChunks, EVENT_FORM_SLOT_NUMBERS, requiredQuestionIds, validateResetConfirmation, validateSlotAssignment } from "@/lib/eventFormReuse";
import { validateEventFormAnswers } from "@/lib/eventForms";
import type { EventFormField, EventFormSlot } from "@/types/eventForms";

const field = (patch: Partial<EventFormField>): EventFormField => ({ id: "q", type: "shortText", title: "질문", order: 0, visible: true, required: true, ...patch });
describe("재활용 입력폼 안전 계약", () => {
  it("정확히 2개 슬롯, 기존 자료의 명시적 연결만 허용", () => {
    expect(EVENT_FORM_SLOT_NUMBERS).toEqual([1, 2]);
    expect(() => validateSlotAssignment(3, "form", [])).toThrow();
    expect(() => validateSlotAssignment(2, "form", [{ slotNumber: 1, formId: "form" }])).toThrow();
    expect(() => validateSlotAssignment(2, "other", [{ slotNumber: 1, formId: "form" }])).not.toThrow();
  });
  it.each([0, 1, 400, 1000])("%i개 삭제는 400개 이하 청크로 정확히 분할", (count) => {
    const docs = Array.from({ length: count }, (_, index) => index);
    const chunks = deletionChunks(docs);
    expect(chunks.flat()).toEqual(docs);
    expect(chunks.every((chunk) => chunk.length <= 400)).toBe(true);
  });
  it.each(["shortText", "longText", "name", "phone", "email", "date"] as const)("%s 필수 공백 차단", (type) => {
    expect(validateEventFormAnswers([field({ type })], { q: " \n " }).q).toBeTruthy();
    expect(validateEventFormAnswers([field({ type, required: false })], { q: " \n " })).toEqual({});
  });
  it("달력에 존재하지 않는 날짜, 필수 동의와 기타 내용 누락 차단", () => {
    expect(validateEventFormAnswers([field({ type: "date" })], { q: "2026-02-31" }).q).toBeTruthy();
    expect(validateEventFormAnswers([field({ type: "consent", consentRequired: false })], { q: { agreed: false, consentVersion: "1", consentTextSnapshot: "가짜 안내" } }).q).toBeTruthy();
    expect(validateEventFormAnswers([field({ type: "singleChoice", allowOther: true, otherRequired: false })], { q: { optionIds: [], otherSelected: true, otherText: " " } }).q).toBeTruthy();
  });
  it("필수 ID와 실제 응답 ID를 별도로 구성", () => {
    const fields = [field({}), field({ id: "optional", required: false }), field({ id: "hidden", visible: false })];
    expect(requiredQuestionIds(fields)).toEqual(["q"]);
    expect(answeredQuestionIds(fields, { q: "예", optional: " " })).toEqual(["q"]);
  });
  it("엑셀 확인 전 초기화 차단 및 응답/버전 변경 무효화", () => {
    const form = { id: "form", title: "교육", status: "closed", activeRoundId: "r", activeVersionId: "v" } as EventFormSlot;
    const receipt = { formId: "form", roundId: "r", versionId: "v", responseCount: 1, fingerprint: "fingerprint", sha256: "a".repeat(64), actorUid: "fake-admin", downloadedAt: "2026-10-01" };
    expect(() => validateResetConfirmation(form, 1, "fingerprint", receipt, false, "교육")).toThrow();
    expect(() => validateResetConfirmation(form, 1, "fingerprint", receipt, true, "교육")).not.toThrow();
    expect(() => validateResetConfirmation(form, 2, "fingerprint", receipt, true, "교육")).toThrow();
    expect(() => validateResetConfirmation({ ...form, activeVersionId: "v2" }, 1, "fingerprint", receipt, true, "교육")).toThrow();
    expect(() => validateResetConfirmation(form, 0, "fingerprint", null, false, "교육")).not.toThrow();
  });
});
