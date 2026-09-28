import { performance } from "node:perf_hooks";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { buildEventFormExportRows, buildEventFormStatistics } from "@/lib/eventFormResults";
import type { EventFormField, EventFormSubmission } from "@/types/eventForms";

const fields: EventFormField[] = [
  { id: "name", type: "name", title: "이름", order: 0, visible: true, required: true },
  { id: "phone", type: "phone", title: "연락처", order: 1, visible: true, required: true },
  { id: "address", type: "address", title: "주소", order: 2, visible: true, required: true },
  {
    id: "attendance",
    type: "attendance",
    title: "참석 여부",
    order: 3,
    visible: true,
    required: true,
    options: [
      { id: "yes", label: "참석", order: 0, enabled: true },
      { id: "no", label: "불참", order: 1, enabled: true },
      { id: "pending", label: "미정", order: 2, enabled: true },
    ],
  },
];

function makeSubmissions(count: number): EventFormSubmission[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `submission-${index + 1}`,
    formId: "form-scale",
    roundId: "round-scale",
    versionId: "version-scale",
    sequence: index + 1,
    status: "submitted",
    duplicateWarning: index > 0 && index % 10 === 0,
    answers: {
      name: `가짜 신청자 ${index + 1}`,
      phone: `010${String(index).padStart(8, "0")}`,
      address: {
        zonecode: String(10000 + index),
        roadAddress: `서울특별시 테스트로 ${index + 1}`,
        detailAddress: `${index + 1}호`,
        displayAddress: `서울특별시 테스트로 ${index + 1} ${index + 1}호`,
      },
      attendance: { optionIds: [index % 3 === 0 ? "no" : index % 5 === 0 ? "pending" : "yes"], otherSelected: false },
    },
  }));
}

describe("event form scale", () => {
  it.each([100, 400])("builds statistics and export rows for %i fake submissions", (count) => {
    const submissions = makeSubmissions(count);
    const startedAt = performance.now();
    const statistics = buildEventFormStatistics(fields, submissions, 400);
    const rows = buildEventFormExportRows(fields, submissions, (value) => String(value ?? ""));
    const elapsedMs = performance.now() - startedAt;

    expect(rows).toHaveLength(count);
    expect(rows[0]["연락처"]).toBe("01000000000");
    expect(rows[count - 1]["주소"]).toContain("테스트로");
    expect(statistics.total).toBe(count);
    expect(statistics.submissionRate).toBe(Math.round(count / 400 * 1000) / 10);
    expect(elapsedMs).toBeLessThan(5_000);
  });

  it("creates an in-memory XLSX workbook for 400 address-bearing rows", () => {
    const submissions = makeSubmissions(400);
    const rows = buildEventFormExportRows(fields, submissions, (value) => String(value ?? ""));
    const startedAt = performance.now();
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "응답 목록");
    const output = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const elapsedMs = performance.now() - startedAt;

    expect(output.byteLength).toBeGreaterThan(0);
    expect(rows.filter((row) => row["중복 경고"] === "확인 필요")).toHaveLength(39);
    expect(buildEventFormStatistics(fields, submissions, 400).attendanceCounts).toEqual({
      참석: 213,
      불참: 134,
      미정: 53,
    });
    expect(elapsedMs).toBeLessThan(5_000);
  });
});
