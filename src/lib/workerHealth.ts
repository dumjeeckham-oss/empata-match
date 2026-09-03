import type { Worker } from "@/types";

export type HealthCheckKind = "psychiatric" | "workplace";

export function isCurrentYearHealthDate(value: unknown, year = new Date().getFullYear()): boolean {
  const raw = String(value || "").trim();
  if (!raw) return false;
  const date = new Date(raw);
  return !Number.isNaN(date.getTime()) && date.getFullYear() === year;
}

export function getMissingHealthChecks(worker: Pick<Worker, "psychiatricCheckDate" | "psychiatricCheckUnchecked" | "workplaceCheckDate" | "workplaceCheckUnchecked">, year = new Date().getFullYear()): HealthCheckKind[] {
  const missing: HealthCheckKind[] = [];
  if (worker.psychiatricCheckUnchecked || !isCurrentYearHealthDate(worker.psychiatricCheckDate, year)) missing.push("psychiatric");
  if (worker.workplaceCheckUnchecked || !isCurrentYearHealthDate(worker.workplaceCheckDate, year)) missing.push("workplace");
  return missing;
}
