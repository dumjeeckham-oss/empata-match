import { describe, expect, it } from "vitest";
import {
  normalizeDuplicateValue,
  sanitizeSpreadsheetCell,
  validateEventFormAnswers,
  validateEventFormForPublishing,
} from "@/lib/eventForms";
import type { EventFormField } from "@/types/eventForms";

const field = (patch: Partial<EventFormField>): EventFormField => ({
  id: "field-1", type: "shortText", title: "문항", required: false, visible: true, order: 0, ...patch,
});

describe("event form schema and answer validation", () => {
  it("allows an empty draft but blocks publishing without an answerable visible field", () => {
    expect(validateEventFormForPublishing([])).toContain("응답을 받을 수 있는 표시 문항을 한 개 이상 추가해주세요.");
    expect(validateEventFormForPublishing([field({ type: "notice", title: "안내" })])).toHaveLength(1);
    expect(validateEventFormForPublishing([field({ type: "longText", title: "익명 의견" })])).toEqual([]);
  });

  it("rejects manipulated field and option ids", () => {
    const fields = [field({
      id: "choice", type: "singleChoice", title: "선택", options: [{ id: "a", label: "A", order: 0, enabled: true }],
    })];
    expect(validateEventFormAnswers(fields, { hacked: "값", choice: { optionIds: ["other-form-option"], otherSelected: false } })).toEqual({
      hacked: "현재 신청서에 없는 문항입니다.",
      choice: "현재 문항에 없는 선택지가 포함되어 있습니다.",
    });
  });

  it("requires detail address after address selection even for an optional field", () => {
    const fields = [field({ id: "address", type: "address", title: "주소" })];
    expect(validateEventFormAnswers(fields, { address: { zonecode: "14500", roadAddress: "경기 부천시 길주로 1", detailAddress: "", displayAddress: "" } })).toEqual({ address: "상세주소를 입력해주세요." });
    expect(validateEventFormAnswers(fields, {})).toEqual({});
  });

  it("enforces single date range and required consent", () => {
    const fields = [
      field({ id: "date", type: "date", title: "날짜", required: true, dateMin: "2026-10-01", dateMax: "2026-10-31" }),
      field({ id: "consent", type: "consent", title: "동의", consentText: "수집 안내", consentRequired: true }),
    ];
    expect(validateEventFormAnswers(fields, { date: "2026-09-30", consent: { agreed: false, consentVersion: "v1", consentTextSnapshot: "수집 안내" } }, "2026-09-01")).toEqual({
      date: "2026-10-01 이후 날짜를 선택해주세요.",
      consent: "필수 동의 항목에 동의해주세요.",
    });
  });

  it("validates other choice content and selection limits", () => {
    const fields = [field({ id: "multi", type: "multipleChoice", title: "복수", minSelections: 1, maxSelections: 2, allowOther: true, otherRequired: true, options: [] })];
    expect(validateEventFormAnswers(fields, { multi: { optionIds: [], otherSelected: true, otherText: "" } })).toEqual({ multi: "기타 의견을 입력해주세요." });
  });

  it("does not let a required choice pass after selecting and clearing it", () => {
    const fields = [field({ id: "required-choice", type: "singleChoice", title: "필수 선택", required: true, options: [{ id: "yes", label: "예", order: 0, enabled: true }] })];
    expect(validateEventFormAnswers(fields, { "required-choice": { optionIds: [], otherSelected: false } })).toEqual({ "required-choice": "필수 문항입니다." });
    expect(validateEventFormAnswers(fields, { "required-choice": { optionIds: ["yes", "yes"], otherSelected: false } })).toEqual({ "required-choice": "같은 선택지를 중복 선택할 수 없습니다." });
  });

  it("normalizes duplicate keys and blocks spreadsheet formulas", () => {
    expect(normalizeDuplicateValue("phone", "+82 10-1234-5678")).toBe("01012345678");
    expect(normalizeDuplicateValue("email", " Staff@Example.COM ")).toBe("staff@example.com");
    expect(sanitizeSpreadsheetCell("=HYPERLINK(\"bad\")")).toBe("'=HYPERLINK(\"bad\")");
    expect(sanitizeSpreadsheetCell("01012345678")).toBe("01012345678");
  });
});
