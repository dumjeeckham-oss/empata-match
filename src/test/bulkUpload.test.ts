import { describe, expect, it } from "vitest";
import {
  buildHeaderMap,
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

  it("stores Excel serial dates as uploaded raw values", () => {
    const headers = ["이름", "연락처", "최초근무일"];
    const headerMap = buildHeaderMap(headers);
    const worker = rowToWorker(["박지원", "010-3333-4444", "44424"], headerMap, []);

    expect(worker.serviceStartDate).toBe("44424");
    expect(worker.contractStatus).toBe("대기");
  });
});
