import type { DocumentMatchingHistoryEntry } from "@/types";
import { getComparableDateValue } from "@/lib/utils";

export function formatServiceProviderHistory(entries: DocumentMatchingHistoryEntry[]): string {
  const ordered = [...entries]
    .filter((entry) => entry.workerName || entry.workerId)
    .sort((a, b) => getComparableDateValue(a.serviceStartDate).localeCompare(getComparableDateValue(b.serviceStartDate)));
  if (!ordered.length) return "없음";
  return ordered.reduce((label, entry, index) => {
    const name = entry.workerName || entry.workerId;
    if (index === 0) return name;
    const previous = ordered[index - 1];
    const previousEnd = previous.serviceEndDate ? new Date(previous.serviceEndDate + "T00:00:00") : null;
    const currentStart = new Date(entry.serviceStartDate + "T00:00:00");
    const continuous = !previousEnd || currentStart.getTime() <= previousEnd.getTime() + 86400000;
    return label + (continuous ? " + " : " → ") + name;
  }, "");
}