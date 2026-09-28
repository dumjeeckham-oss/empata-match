import { describe, expect, it } from "vitest";
import { buildEventFormSummaryRows, resolveEventFormPresentation, resolveEventFormResultFields } from "@/lib/eventFormResults";
import type { EventFormSlot, EventFormVersion } from "@/types/eventForms";

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
});
