import { describe, expect, it } from "vitest";
import {
  collectEventFormImages,
  createEventFormSubmissionId,
  createPublicEventFormToken,
  decodeEventFormAnswers,
  encodeEventFormAnswers,
  eventFormPayloadBytes,
  getEventFormUsage,
  hashPublicEventFormToken,
  normalizeDuplicateValue,
  sanitizeSpreadsheetCell,
  validateEventFormAnswers,
  validateEventFormForPublishing,
  validateEventFormImageLimits,
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

  it("creates a URL-safe public token, SHA-256 document id, and deterministic anonymous submission id", async () => {
    const token = createPublicEventFormToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(await hashPublicEventFormToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(createEventFormSubmissionId("round-1", "anonymous-uid")).toBe("round-1__anonymous-uid");
  });

  it("calculates Spark image limits without double-counting reused assets", () => {
    const image = { assetId: "asset-1", alt: "사진", state: "temp" as const, contentType: "image/webp" as const, encodedBytes: 120_000 };
    const fields = [field({ image, options: [{ id: "a", label: "A", order: 0, enabled: true, image }] })];
    expect(collectEventFormImages(fields, image)).toHaveLength(1);
    expect(getEventFormUsage(fields, image, 40)).toEqual({ fieldCount: 1, imageCount: 1, publicImageBytes: 120_000, estimatedMonthlyTransferBytes: 4_800_000, estimatedFirestoreStorageUpperBoundBytes: 2_850_720 });
  });

  it("blocks more than 12 images, a 250KB image, and a 2MB public image set", () => {
    const image = (index: number, encodedBytes: number) => ({ assetId: `asset-${index}`, alt: `사진 ${index}`, state: "temp" as const, contentType: "image/webp" as const, encodedBytes });
    const thirteen = Array.from({ length: 13 }, (_, index) => field({ id: `field-${index}`, image: image(index, 170_000) }));
    expect(validateEventFormImageLimits(thirteen)).toEqual(expect.arrayContaining([
      expect.stringContaining("최대 12개"),
      expect.stringContaining("2MB"),
    ]));
    expect(validateEventFormImageLimits([field({ image: image(1, 250 * 1024 + 1) })])).toContain("250KB를 초과하거나 크기를 확인할 수 없는 이미지가 있습니다.");
    expect(validateEventFormImageLimits([field({})])).toEqual([]);
  });

  it("encodes UTF-8 answers for the 50KB Rules guard and rejects malformed stored payloads safely", () => {
    expect(eventFormPayloadBytes({ answer: "가".repeat(10) })).toBeGreaterThan(10);
    const encoded = encodeEventFormAnswers({ answer: "한글 응답" });
    expect(encoded.encodedBytes).toBe(eventFormPayloadBytes({ answer: "한글 응답" }));
    expect(decodeEventFormAnswers(encoded.answersBase64)).toEqual({ answers: { answer: "한글 응답" }, invalidPayload: false });
    expect(decodeEventFormAnswers("not-base64!")).toEqual({ answers: {}, invalidPayload: true });
  });

  it("caps long text, ordinary strings, addresses, consent snapshots, and choice arrays", () => {
    expect(validateEventFormAnswers([field({ type: "longText" })], { "field-1": "가".repeat(5_001) })).toHaveProperty("field-1");
    expect(validateEventFormAnswers([field({ type: "name" })], { "field-1": "가".repeat(101) })).toHaveProperty("field-1");
    expect(validateEventFormAnswers([field({ type: "multipleChoice", options: Array.from({ length: 101 }, (_, index) => ({ id: `o-${index}`, label: `${index}`, order: index, enabled: true })) })], { "field-1": { optionIds: Array.from({ length: 101 }, (_, index) => `o-${index}`), otherSelected: false } })).toHaveProperty("field-1");
    expect(validateEventFormAnswers([field({ type: "address" })], { "field-1": { zonecode: "12345", roadAddress: "가".repeat(501), detailAddress: "1호", displayAddress: "" } })).toHaveProperty("field-1");
    expect(validateEventFormAnswers([field({ type: "consent" })], { "field-1": { agreed: true, consentVersion: "1", consentTextSnapshot: "가".repeat(5_001) } })).toHaveProperty("field-1");
  });
});
