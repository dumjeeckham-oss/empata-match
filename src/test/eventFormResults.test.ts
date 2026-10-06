import { describe, expect, it } from "vitest";
import { buildEventFormExportHeaders, buildEventFormStatistics, buildEventFormSummaryRows, eventFormAnswerText, markDuplicateEventFormSubmissions, resolveEventFormPresentation, resolveEventFormResultFields } from "@/lib/eventFormResults";
import type { EventFormSlot, EventFormSubmission, EventFormVersion } from "@/types/eventForms";

const currentForm: EventFormSlot = {
  id: "form-1",
  ownerUid: "admin-1",
  title: "수정된 현재 행사",
  description: "현재 설명",
  eventDateTime: "2027-10-01 10:00",
  location: "현재 장소",
  completionMessage: "완료",
  status: "open",
  duplicatePolicy: "none",
};

const historicalVersion: EventFormVersion = {
  id: "version-old",
  formId: "form-1",
  roundId: "round-old",
  version: 1,
  formSnapshot: {
    title: "과거 행사",
    description: "과거 설명",
    eventDateTime: "2026-05-01 14:00",
    location: "과거 장소",
    completionMessage: "과거 완료",
  },
  fields: [
    { id: "second", type: "shortText", title: "과거 두 번째 문항", required: false, visible: true, order: 2 },
    { id: "first", type: "name", title: "과거 첫 번째 문항", required: true, visible: true, order: 1 },
  ],
};

describe("행사 결과 회차 스냅샷", () => {
  it("현재 폼이 수정되어도 과거 회차 제목·일시·장소·설명을 사용한다", () => {
    expect(resolveEventFormPresentation(currentForm, historicalVersion)).toMatchObject({
      title: "과거 행사",
      description: "과거 설명",
      eventDateTime: "2026-05-01 14:00",
      location: "과거 장소",
    });
  });

  it("과거 회차 문항 제목과 순서를 버전 스냅샷에서 가져온다", () => {
    expect(resolveEventFormResultFields(historicalVersion).map((field) => field.title)).toEqual([
      "과거 첫 번째 문항",
      "과거 두 번째 문항",
    ]);
  });

  it("엑셀 요약도 과거 회차 스냅샷 정보를 사용한다", () => {
    const rows = buildEventFormSummaryRows(
      resolveEventFormPresentation(currentForm, historicalVersion),
      "과거 1회차",
      3,
      2,
      "2026. 9. 23.",
    );
    expect(rows.slice(0, 5)).toEqual([
      ["폼 제목", "과거 행사"],
      ["회차", "과거 1회차"],
      ["행사 일시", "2026-05-01 14:00"],
      ["장소", "과거 장소"],
      ["설명", "과거 설명"],
    ]);
  });

  it("Spark 모드에서는 정규화한 연락처 중복을 관리자 결과에서 경고한다", () => {
    const phoneField = { id: "phone", type: "phone" as const, title: "연락처", required: true, visible: true, order: 0 };
    const submissions = ["010-1234-5678", "+82 10 1234 5678", "010-9999-0000"].map((phone, index) => ({ id: `s-${index}`, formId: "form-1", roundId: "round-1", versionId: "version-1", sequence: index + 1, answers: { phone }, status: "submitted" as const })) satisfies EventFormSubmission[];
    expect(markDuplicateEventFormSubmissions([phoneField], submissions, "phone").map((item) => item.duplicateWarning)).toEqual([true, true, false]);
  });

  it("조작된 선택형·주소 응답도 결과와 통계 화면을 중단시키지 않는다", () => {
    const choiceField = { id: "choice", type: "multipleChoice" as const, title: "선택", required: false, visible: true, order: 0, options: [{ id: "safe", label: "정상", order: 0, enabled: true }] };
    const addressField = { id: "address", type: "address" as const, title: "주소", required: false, visible: true, order: 1 };
    const malformed = { id: "s-bad", formId: "form-1", roundId: "round-1", versionId: "version-1", sequence: 1, answers: { choice: "not-an-object", address: ["not-an-address"] }, status: "submitted" } as unknown as EventFormSubmission;
    expect(eventFormAnswerText(choiceField, malformed.answers.choice)).toBe("");
    expect(eventFormAnswerText(addressField, malformed.answers.address)).toBe("");
    expect(() => buildEventFormStatistics([choiceField], [malformed], 40)).not.toThrow();
  });

  it("응답이 0건이어도 회차 문항을 포함한 엑셀 머리글을 만든다", () => {
    expect(buildEventFormExportHeaders([
      { id: "name", type: "name", title: "신청자 이름", required: true, visible: true, order: 0 },
      { id: "address", type: "address", title: "주소", required: false, visible: true, order: 1 },
    ])).toEqual([
      "제출 순번", "제출 시각", "신청자 이름", "주소 - 도로명주소", "주소 - 상세주소", "중복 경고", "관리자 메모", "응답 상태",
    ]);
  });
});
