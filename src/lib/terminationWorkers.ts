import type { MatchingHistoryRecord, ServiceUser } from "@/types";

export const OFFICIAL_TERMINATION_PROJECT_NAME = "부천의료복지사회적협동조합 동백 장애인활동지원센터";

export interface HistoricalWorkerRef { id: string; name: string; phone: string; date: string; }

const clean = (value: unknown) => String(value ?? "").trim();

export function resolveTerminationWorkerRefs(
  user: ServiceUser | undefined,
  matchingRecords: MatchingHistoryRecord[],
): HistoricalWorkerRef[] {
  if (!user) return [];
  const activeIds = (user.assignedHelperIds || user.assigned_workers || []).filter(Boolean);
  if (activeIds.length > 0) {
    return activeIds.map((id, index) => ({
      id,
      name: clean(user.assignedHelperNames?.[index]),
      phone: clean(user.assignedHelperPhones?.[index]),
      date: clean(user.resignationDate || user.serviceStartDate),
    }));
  }

  const activeDocumentHistory = (user.matchingHistory || [])
    .filter((entry) => entry.serviceEndDate === null || entry.serviceEndDate === "")
    .map((entry) => ({
      id: clean(entry.workerId), name: clean(entry.workerName), phone: clean(entry.workerPhone),
      date: clean(user.resignationDate || entry.serviceStartDate),
    }))
    .filter((item) => item.id || item.name);
  if (activeDocumentHistory.length > 0) return activeDocumentHistory;

  const documentHistory = (user.matchingHistory || []).map((entry) => ({
    id: clean(entry.workerId), name: clean(entry.workerName), phone: clean(entry.workerPhone),
    date: clean(entry.serviceEndDate || entry.serviceStartDate),
  }));
  const globalHistory = matchingRecords
    .filter((record) => record.userId === user.id && (record.type === "매칭" || record.type === "해제"))
    .map((record) => ({
      id: clean(record.workerId), name: clean(record.workerName), phone: clean(record.workerPhone),
      date: clean(record.endDate || record.date),
    }));
  const candidates = [...documentHistory, ...globalHistory]
    .filter((item) => item.id || item.name)
    .sort((a, b) => b.date.localeCompare(a.date));
  if (candidates.length === 0) {
    return (user.assignedHelperNames || []).map((name, index) => ({
      id: "", name: clean(name), phone: clean(user.assignedHelperPhones?.[index]), date: "",
    })).filter((item) => item.name);
  }
  const latestDate = candidates[0].date;
  const unique = new Map<string, HistoricalWorkerRef>();
  candidates.filter((item) => item.date === latestDate).forEach((item) => {
    unique.set(item.id || item.name, item);
  });
  return [...unique.values()];
}

