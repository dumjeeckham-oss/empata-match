import { describe, expect, it } from "vitest";
import {
  buildHeaderMap,
  makeUniqueKey,
  rowToWorker,
} from "@/lib/bulkUpload";

describe("worker bulk upload mapping", () => {
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
