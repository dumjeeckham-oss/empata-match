import type { DocumentMatchingHistoryEntry } from "@/types";
type Period = { startDate: string; endDate: string | null };

function comparableDate(value: string | null | undefined): string {
  const match = String(value || "").trim().match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if (!match) return "";
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return "";
  return `${match[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** 표시 순서와 실제 저장 위치를 분리하여 수정 대상이 바뀌지 않게 한다. */
export function chronologicalPeriods<T extends Period>(entries: T[]): Array<{ entry: T; originalIndex: number }> {
  return entries.map((entry, originalIndex) => ({ entry, originalIndex })).sort((a, b) => {
    const left = comparableDate(a.entry.startDate) || "9999-99-99";
    const right = comparableDate(b.entry.startDate) || "9999-99-99";
    return left.localeCompare(right) || a.originalIndex - b.originalIndex;
  });
}

export function appendHistoricalPeriod<T extends Period>(entries: T[], entry: T, today: string): T[] {
  const start = comparableDate(entry.startDate); const end = comparableDate(entry.endDate);
  if (!start || !end) throw new Error("과거 기간의 시작일과 종료일을 모두 입력해주세요.");
  if (end < start) throw new Error("종료일은 시작일보다 빠를 수 없습니다.");
  if (end >= today) throw new Error("과거 이력은 오늘 이전에 종료된 기간만 추가할 수 있습니다.");
  if (entries.some((old) => !comparableDate(old.startDate) || (old.endDate && (!comparableDate(old.endDate) || comparableDate(old.endDate) < comparableDate(old.startDate))))) throw new Error("기존 이력에 날짜가 없거나 순서가 맞지 않습니다. 기존 기간을 먼저 확인해주세요.");
  if (entries.some((old) => start <= (comparableDate(old.endDate) || "9999-12-31") && end >= comparableDate(old.startDate))) throw new Error("기존 이력과 기간이 겹칩니다. 날짜를 확인해주세요.");
  return [...entries, entry];
}

export function appendHistoricalMatch(entries: DocumentMatchingHistoryEntry[], entry: DocumentMatchingHistoryEntry, currentlyAssigned: boolean, today: string): DocumentMatchingHistoryEntry[] {
  const sameWorker = entries.filter((item) => item.workerId === entry.workerId);
  if (currentlyAssigned && !sameWorker.some((item) => !item.serviceEndDate)) throw new Error("현재 매칭의 시작일을 확인할 수 없습니다. 현재 서비스 기간을 먼저 확인해주세요.");
  appendHistoricalPeriod(sameWorker.map((item) => ({ startDate: item.serviceStartDate, endDate: item.serviceEndDate })), { startDate: entry.serviceStartDate, endDate: entry.serviceEndDate }, today);
  return [...entries, entry];
}
