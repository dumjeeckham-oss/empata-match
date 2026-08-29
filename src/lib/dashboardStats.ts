export function parseDateValue(value: unknown): Date | null {
  if (!value) return null;
  const maybeTimestamp = value as { toDate?: () => Date };
  if (typeof maybeTimestamp.toDate === "function") {
    const date = maybeTimestamp.toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const compact = raw.match(/^(\d{4})[-./\s]?(\d{1,2})[-./\s]?(\d{1,2})$/);
  if (compact) {
    const [, y, m, d] = compact;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isWithinRecentMonths(value: unknown, months = 3, now = new Date()): boolean {
  const date = parseDateValue(value);
  if (!date) return false;
  const start = new Date(now);
  start.setMonth(start.getMonth() - months);
  start.setHours(0, 0, 0, 0);
  return date >= start && date <= now;
}

export function daysBetween(startValue: unknown, endValue: unknown): number | null {
  const start = parseDateValue(startValue);
  const end = parseDateValue(endValue);
  if (!start || !end) return null;
  const diff = end.getTime() - start.getTime();
  if (diff < 0) return null;
  return Math.round(diff / 86400000);
}

export function percent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}
