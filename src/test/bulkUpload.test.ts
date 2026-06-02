import { describe, expect, it } from "vitest";
import {
  buildHeaderMap,
  calculateExperienceFromStartDate,
  rowToWorker,
} from "@/lib/bulkUpload";

describe("worker bulk upload mapping", () => {
  it("calculates experience from service start date as of June 2026", () => {
    const asOf = new Date(2026, 5, 2);

    expect(calculateExperienceFromStartDate("2021-08-16", asOf)).toBe("4년 9개월");
    expect(calculateExperienceFromStartDate("2025-06-16", asOf)).toBe("11개월");
  });

  it("marks active workers and keeps the calculated experience", () => {
    const headers = ["이름", "연락처", "최초근무일", "퇴사일", "경력"];
    const headerMap = buildHeaderMap(headers);
    const worker = rowToWorker(["김지원", "010-1111-2222", "2021-08-16", "", "1년"], headerMap, []);

    expect(worker.contractStatus).toBe("근무중");
    expect(worker.serviceStartDate).toBe("2021-08-16");
    expect(worker.experience).toMatch(/년/);
    expect(worker.experience).not.toBe("1년");
  });

  it("normalizes Excel serial dates before saving", () => {
    const headers = ["이름", "연락처", "최초근무일"];
    const headerMap = buildHeaderMap(headers);
    const worker = rowToWorker(["박지원", "010-3333-4444", "44424"], headerMap, []);

    expect(worker.serviceStartDate).toBe("2021-08-16");
    expect(worker.contractStatus).toBe("근무중");
  });
});
