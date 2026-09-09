import { describe, expect, it } from "vitest";
import { preserveWorkerDateOnStatusChange } from "@/lib/workerDatePreservation";

describe("worker date preservation on status change", () => {
  it("keeps an existing date when a status-only save provides a blank date", () => {
    expect(preserveWorkerDateOnStatusChange("", "2024-03-15", true)).toBe("2024-03-15");
  });

  it("allows an intentional blank when status did not change", () => {
    expect(preserveWorkerDateOnStatusChange("", "2024-03-15", false)).toBe("");
  });
});
