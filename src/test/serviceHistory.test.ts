import { describe, expect, it } from "vitest";
import { formatServiceProviderHistory } from "@/lib/serviceHistory";
import type { DocumentMatchingHistoryEntry } from "@/types";

function entry(name: string, start: string, end: string | null): DocumentMatchingHistoryEntry {
  return { id: name, workerId: name, workerName: name, workerPhone: "", serviceStartDate: start, serviceEndDate: end, reason: "추가" };
}

describe("service provider history label", () => {
  it("uses plus for overlapping or next-day continuous service", () => {
    expect(formatServiceProviderHistory([entry("기존", "2026-01-01", "2026-01-31"), entry("신규", "2026-01-31", null)])).toBe("기존 + 신규");
    expect(formatServiceProviderHistory([entry("기존", "2026-01-01", "2026-01-31"), entry("신규", "2026-02-01", null)])).toBe("기존 + 신규");
  });

  it("uses an arrow when a gap exists", () => {
    expect(formatServiceProviderHistory([entry("기존", "2026-01-01", "2026-01-31"), entry("신규", "2026-02-03", null)])).toBe("기존 → 신규");
  });
});