import { describe, expect, it } from "vitest";
import {
  buildServiceProviderHistorySegments,
  formatServiceProviderHistory,
  getFirstServiceStartDate,
  isRecontractedUser,
} from "@/lib/serviceHistory";
import type { DocumentMatchingHistoryEntry, ServiceUser } from "@/types";

function entry(name: string, start: string, end: string | null): DocumentMatchingHistoryEntry {
  return { id: name + start, workerId: name, workerName: name, workerPhone: "", serviceStartDate: start, serviceEndDate: end, reason: "추가" };
}

describe("service provider history label", () => {
  it("groups truly overlapping providers and then shows the remaining current provider", () => {
    const entries = [
      entry("지원사1", "2026-01-01", null),
      entry("지원사2", "2026-01-01", "2026-08-31"),
    ];
    expect(formatServiceProviderHistory(entries)).toBe("(지원사1+지원사2) → 지원사1");
    expect(buildServiceProviderHistorySegments(entries, "2026-09-23").at(-1)).toMatchObject({
      label: "지원사1",
      isCurrent: true,
    });
  });

  it("uses an arrow for replacement even when service continues the next day", () => {
    expect(formatServiceProviderHistory([
      entry("기존", "2026-01-01", "2026-01-31"),
      entry("신규", "2026-02-01", null),
    ])).toBe("기존 → 신규");
  });

  it("preserves each active-provider transition when an additional worker joins and leaves", () => {
    expect(formatServiceProviderHistory([
      entry("지원사1", "2026-01-01", null),
      entry("지원사2", "2026-03-01", "2026-08-31"),
    ])).toBe("지원사1 → (지원사1+지원사2) → 지원사1");
  });

  it("derives the first service date and recontract status from contract history", () => {
    const user = {
      serviceStartDate: "2026-03-01",
      contractHistory: [
        { id: "first", startDate: "2024-01-01", endDate: "2025-12-31", status: "계약해지" },
        { id: "second", startDate: "2026-03-01", endDate: null, status: "서비스중" },
      ],
      matchingHistory: [],
    } as ServiceUser;
    expect(getFirstServiceStartDate(user)).toBe("2024-01-01");
    expect(isRecontractedUser(user)).toBe(true);
    expect(isRecontractedUser({ ...user, serviceStartDate: "2024-01-01", contractHistory: [user.contractHistory![0]] })).toBe(false);
  });
});
