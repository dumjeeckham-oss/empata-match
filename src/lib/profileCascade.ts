import type { DocumentMatchingHistoryEntry } from "@/types";

export type CascadePersonSnapshot = {
  name: string;
  phone: string;
  address?: string;
  voucherTier?: number;
  disabilityType?: string;
};

export function getLinkedWorkerIds(raw: Record<string, unknown>): string[] {
  const modern = Array.isArray(raw.assignedHelperIds) ? raw.assignedHelperIds : [];
  const legacy = Array.isArray(raw.assigned_workers) ? raw.assigned_workers : [];
  const single = raw.assignedHelperId ? [raw.assignedHelperId] : [];
  return Array.from(new Set([...modern, ...legacy, ...single].map(String).filter(Boolean)));
}

export function rewriteWorkerEntries(
  entries: unknown,
  workerId: string,
  next: CascadePersonSnapshot,
  previous?: CascadePersonSnapshot,
): DocumentMatchingHistoryEntry[] | null {
  if (!Array.isArray(entries)) return null;
  let changed = false;
  const previousPhone = String(previous?.phone || "").replace(/\D/g, "");
  const rewritten = entries.map((entry) => {
    if (!entry || typeof entry !== "object") return entry;
    const item = entry as DocumentMatchingHistoryEntry;
    const entryPhone = String(item.workerPhone || "").replace(/\D/g, "");
    const isLegacyIdentityMatch = !item.workerId && (
      previousPhone
        ? entryPhone === previousPhone
        : !!previous?.name && item.workerName === previous.name
    );
    if (item.workerId !== workerId && !isLegacyIdentityMatch) return item;
    changed = true;
    return {
      ...item,
      workerId: item.workerId || workerId,
      workerName: next.name,
      workerPhone: next.phone,
      updatedAt: new Date().toISOString(),
    };
  });
  return changed ? (rewritten as DocumentMatchingHistoryEntry[]) : null;
}

export function replacePersonName(value: unknown, previousName: string | undefined, nextName: string): string | null {
  if (!previousName || typeof value !== "string") return null;
  const parts = value.split(/(\s*[,/·]\s*)/);
  let changed = false;
  const rewritten = parts.map((part) => {
    if (part.trim() !== previousName.trim()) return part;
    changed = true;
    return part.replace(previousName.trim(), nextName);
  }).join("");
  return changed ? rewritten : null;
}
