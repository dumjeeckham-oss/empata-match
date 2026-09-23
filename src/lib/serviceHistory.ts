import type { DocumentMatchingHistoryEntry, ServiceUser } from "@/types";
import { getComparableDateValue } from "@/lib/utils";

export interface ServiceProviderHistorySegment {
  key: string;
  label: string;
  names: string[];
  startDate: string;
  isCurrent: boolean;
}

const DAY_MS = 86400000;

function nextDate(value: string): string {
  const date = new Date(value + "T00:00:00Z");
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() + DAY_MS).toISOString().slice(0, 10);
}

function entryName(entry: DocumentMatchingHistoryEntry): string {
  return String(entry.workerName || entry.workerId || "").trim();
}

function isActiveOn(entry: DocumentMatchingHistoryEntry, date: string): boolean {
  const start = getComparableDateValue(entry.serviceStartDate);
  const end = getComparableDateValue(entry.serviceEndDate || "9999-12-31");
  return Boolean(start) && start <= date && date <= end;
}

function groupKey(names: string[]): string {
  return names.join("\u0000");
}

function groupLabel(names: string[]): string {
  return names.length > 1 ? `(${names.join("+")})` : names[0] || "";
}

function localToday(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Builds a provider timeline where + means actual overlapping service and
 * → means the active provider set changed.
 */
export function buildServiceProviderHistorySegments(
  entries: DocumentMatchingHistoryEntry[],
  asOfDate = localToday(),
): ServiceProviderHistorySegment[] {
  const ordered = [...entries]
    .filter((entry) => entryName(entry) && getComparableDateValue(entry.serviceStartDate))
    .sort((a, b) => {
      const dateDiff = getComparableDateValue(a.serviceStartDate).localeCompare(getComparableDateValue(b.serviceStartDate));
      return dateDiff || entryName(a).localeCompare(entryName(b), "ko");
    });
  if (!ordered.length) return [];

  const boundaries = new Set<string>();
  for (const entry of ordered) {
    boundaries.add(getComparableDateValue(entry.serviceStartDate));
    if (entry.serviceEndDate) {
      const afterEnd = nextDate(getComparableDateValue(entry.serviceEndDate));
      if (afterEnd) boundaries.add(afterEnd);
    }
  }

  const segments: ServiceProviderHistorySegment[] = [];
  let previousKey = "";
  for (const date of [...boundaries].filter(Boolean).sort()) {
    const names = Array.from(new Set(
      ordered.filter((entry) => isActiveOn(entry, date)).map(entryName).filter(Boolean),
    ));
    if (!names.length) {
      previousKey = "";
      continue;
    }
    const key = groupKey(names);
    if (key === previousKey) continue;
    segments.push({ key, label: groupLabel(names), names, startDate: date, isCurrent: false });
    previousKey = key;
  }

  const currentNames = Array.from(new Set(
    ordered.filter((entry) => isActiveOn(entry, asOfDate)).map(entryName).filter(Boolean),
  ));
  const currentKey = groupKey(currentNames);
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    if (segments[index].startDate <= asOfDate && segments[index].key === currentKey) {
      segments[index] = { ...segments[index], isCurrent: currentNames.length > 0 };
      break;
    }
  }
  return segments;
}

export function formatServiceProviderHistory(entries: DocumentMatchingHistoryEntry[]): string {
  const segments = buildServiceProviderHistorySegments(entries);
  return segments.length ? segments.map((segment) => segment.label).join(" → ") : "없음";
}

type FirstServiceSource = Pick<ServiceUser, "serviceStartDate" | "contractHistory" | "matchingHistory">;

export function getFirstServiceStartDate(user: FirstServiceSource): string {
  const candidates = [
    user.serviceStartDate,
    ...(user.contractHistory || []).map((entry) => entry.startDate),
    ...(user.matchingHistory || []).map((entry) => entry.serviceStartDate),
  ].map(getComparableDateValue).filter(Boolean).sort();
  return candidates[0] || "";
}

export function isRecontractedUser(user: Pick<ServiceUser, "serviceStartDate" | "contractHistory">): boolean {
  const starts = new Set([
    user.serviceStartDate,
    ...(user.contractHistory || []).map((entry) => entry.startDate),
  ].map(getComparableDateValue).filter(Boolean));
  return starts.size > 1;
}
