import { describe, expect, it } from "vitest";
import { getMissingHealthChecks } from "@/lib/workerHealth";

describe("worker health-check grouping", () => {
  it("separates workplace and psychiatric missing checks", () => {
    expect(getMissingHealthChecks({ psychiatricCheckDate: "2026-03-01", workplaceCheckDate: "" }, 2026)).toEqual(["workplace"]);
    expect(getMissingHealthChecks({ psychiatricCheckDate: "", workplaceCheckDate: "2026-04-01" }, 2026)).toEqual(["psychiatric"]);
  });

  it("includes a worker in both groups when both checks are missing", () => {
    expect(getMissingHealthChecks({ psychiatricCheckDate: "", workplaceCheckDate: "" }, 2026)).toEqual(["psychiatric", "workplace"]);
  });

  it("treats an explicit unchecked flag as missing", () => {
    expect(getMissingHealthChecks({ psychiatricCheckDate: "2026-03-01", psychiatricCheckUnchecked: true, workplaceCheckDate: "2026-04-01" }, 2026)).toEqual(["psychiatric"]);
  });
});
