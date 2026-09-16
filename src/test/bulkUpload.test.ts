import { describe, expect, it } from "vitest";
import {
  buildHeaderMap,
  makeUniqueKey,
  rowToWorker,
} from "@/lib/bulkUpload";
import { normalizeWorker } from "@/lib/assignments";
import { partialParsers } from "@/components/PartialUpdateDialog";

describe("worker bulk upload mapping", () => {
  it("normalizes Excel serial health-check dates in partial updates", () => {
    expect(partialParsers.examDate("44424")).toBe("2021-08-16");
    expect(partialParsers.examDate("2026. 7. 13")).toBe("2026-07-13");
  });

  it("applies the current year to Korean month-day health-check cells", () => {
    const year = new Date().getFullYear();

    expect(partialParsers.examDate("06월 01일")).toBe(`${year}-06-01`);
    expect(partialParsers.examDate("5월 16일")).toBe(`${year}-05-16`);
    expect(partialParsers.examDate("25.12.26")).toBe("2025-12-26");
  });

  it("recovers previously stored Korean month-day health-check values", () => {
    const year = new Date().getFullYear();
    const worker = normalizeWorker({
      psychiatricCheckDate: "01월 14일",
      workplaceCheckDate: "07월10일",
    });

    expect(worker.psychiatricCheckDate).toBe(`${year}-01-14`);
    expect(worker.workplaceCheckDate).toBe(`${year}-07-10`);
  });

  it("does not treat string false health-check flags as unchecked", () => {
    const worker = normalizeWorker({
      workplaceCheckDate: "2026-07-13",
      workplaceCheckUnchecked: "false",
      psychiatricCheckDate: "2026-07-13",
      psychiatricCheckUnchecked: "아니오",
    });

    expect(worker.workplaceCheckUnchecked).toBe(false);
    expect(worker.psychiatricCheckUnchecked).toBe(false);
  });

  it("keeps uploaded worker status and experience unchanged", () => {
    const headers = ["이름", "연락처", "최초근무일", "퇴사일", "경력"];
    const headerMap = buildHeaderMap(headers);
    const worker = rowToWorker(["김지원", "010-1111-2222", "2021-08-16", "", "1년"], headerMap, []);

    expect(worker.contractStatus).toBe("대기");
    expect(worker.serviceStartDate).toBe("2021-08-16");
    expect(worker.experience).toBe("1년");
  });

  it("normalizes Excel serial dates into YYYY-MM-DD strings", () => {
    const headers = ["이름", "연락처", "최초근무일"];
    const headerMap = buildHeaderMap(headers);
    const worker = rowToWorker(["박지원", "010-3333-4444", "44424"], headerMap, []);

    expect(worker.serviceStartDate).toBe("2021-08-16");
    expect(worker.contractStatus).toBe("대기");
  });

  it("uses a stable fallback key when phone is missing", () => {
    const keyWithPhone = makeUniqueKey("홍길동", "010-1234-5678");
    const keyWithoutPhone = makeUniqueKey("홍길동", "", "1988");

    expect(keyWithPhone).toBe("홍길동::01012345678");
    expect(keyWithoutPhone).toContain("홍길동::UNKNOWN");
    expect(keyWithoutPhone).toContain("1988");
  });
});
