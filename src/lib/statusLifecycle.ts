import type {
  ContractHistoryEntry,
  DocumentMatchingHistoryEntry,
  EmploymentHistoryEntry,
  ServiceUser,
  Worker,
} from "@/types";

const clean = (value: unknown) => String(value ?? "").trim();

export type WorkerBadge = { label: "재직중" | "서비스 제공중" | "대기" | "퇴사"; className: string };

export function getWorkerStatusBadges(worker: Worker): WorkerBadge[] {
  const retired = worker.contractStatus === "퇴사" || Boolean(clean(worker.retirementDate || worker.resignationDate));
  if (retired) return [{ label: "퇴사", className: "bg-slate-500 text-white hover:bg-slate-500" }];
  const activeCount = (worker.assignedUserIds || worker.assigned_users || []).filter(Boolean).length;
  return activeCount > 0
    ? [
        { label: "재직중", className: "bg-blue-600 text-white hover:bg-blue-600" },
        { label: "서비스 제공중", className: "bg-emerald-600 text-white hover:bg-emerald-600" },
      ]
    : [
        { label: "재직중", className: "bg-blue-600 text-white hover:bg-blue-600" },
        { label: "대기", className: "bg-orange-500 text-white hover:bg-orange-500" },
      ];
}

export function getUserStatusBadgeClass(status: string): string {
  if (status === "서비스중") return "bg-emerald-600 text-white hover:bg-emerald-600";
  if (status === "계약해지" || status === "타기관 계약") return "bg-red-600 text-white hover:bg-red-600";
  return "bg-orange-500 text-white hover:bg-orange-500";
}

export function closeMatchingEntries(
  entries: DocumentMatchingHistoryEntry[] | undefined,
  workerIds: string[],
  endDate: string,
  reason: string,
): DocumentMatchingHistoryEntry[] {
  const ids = new Set(workerIds.filter(Boolean));
  return (entries || []).map((entry) =>
    ids.has(entry.workerId) && (entry.serviceEndDate === null || entry.serviceEndDate === "")
      ? { ...entry, serviceEndDate: endDate, reason: "종료", reasonDetail: reason, updatedAt: new Date().toISOString() }
      : entry,
  );
}

export function removeUserAssignment(worker: Worker, userId: string): Pick<Worker, "assignedUserIds" | "assigned_users" | "assignedUserNames" | "assignedUserPhones"> {
  const ids = worker.assignedUserIds || worker.assigned_users || [];
  const index = ids.indexOf(userId);
  const nextIds = ids.filter((id) => id !== userId);
  return {
    assignedUserIds: nextIds,
    assigned_users: nextIds,
    assignedUserNames: index < 0 ? worker.assignedUserNames || [] : (worker.assignedUserNames || []).filter((_, i) => i !== index),
    assignedUserPhones: index < 0 ? worker.assignedUserPhones || [] : (worker.assignedUserPhones || []).filter((_, i) => i !== index),
  };
}

export function appendContractTransition(
  user: ServiceUser,
  endDate: string,
  status: "계약해지" | "대기",
  reason: string,
): ContractHistoryEntry[] {
  const history = [...(user.contractHistory || [])];
  const existingIndex = history.findIndex((entry) => entry.endDate === endDate && entry.status === status);
  if (existingIndex >= 0) {
    history[existingIndex] = { ...history[existingIndex], reason };
    return history;
  }
  const openIndex = history.findIndex((entry) => entry.endDate === null || entry.endDate === "");
  if (openIndex >= 0) history[openIndex] = { ...history[openIndex], endDate, status, reason };
  else history.push({ id: "contract-" + (user.serviceStartDate || endDate), startDate: user.serviceStartDate || user.receiptDate || endDate, endDate, status, reason });
  return history;
}

export function ensureOpenContractHistory(user: ServiceUser): ContractHistoryEntry[] {
  if (user.contractStatus !== "서비스중") return user.contractHistory || [];
  const history = [...(user.contractHistory || [])];
  if (!history.some((entry) => entry.endDate === null || entry.endDate === "")) {
    history.push({ id: "contract-" + (user.serviceStartDate || Date.now()), startDate: user.serviceStartDate || user.receiptDate, endDate: null, status: "서비스중" });
  }
  return history;
}

export function appendEmploymentTransition(worker: Worker, endDate: string, reason = "퇴사"): EmploymentHistoryEntry[] {
  const history = [...(worker.employmentHistory || [])];
  const existingIndex = history.findIndex((entry) => entry.endDate === endDate && entry.status === "퇴사");
  if (existingIndex >= 0) return history;
  const openIndex = history.findIndex((entry) => entry.endDate === null || entry.endDate === "");
  if (openIndex >= 0) history[openIndex] = { ...history[openIndex], endDate, status: "퇴사", reason };
  else history.push({ id: "employment-" + (worker.serviceStartDate || endDate), startDate: worker.serviceStartDate || worker.receiptDate || endDate, endDate, status: "퇴사", reason });
  return history;
}

export function ensureOpenEmploymentHistory(worker: Worker): EmploymentHistoryEntry[] {
  if (worker.contractStatus === "퇴사") return worker.employmentHistory || [];
  const history = [...(worker.employmentHistory || [])];
  if (!history.some((entry) => entry.endDate === null || entry.endDate === "")) {
    history.push({ id: "employment-" + (worker.serviceStartDate || Date.now()), startDate: worker.serviceStartDate || worker.receiptDate, endDate: null, status: "재직중" });
  }
  return history;
}

export function formatPeriodHistory(entries: Array<{ startDate: string; endDate: string | null; status: string; reason?: string }>, activeLabel: string): string[] {
  return [...entries]
    .sort((a, b) => clean(a.startDate).localeCompare(clean(b.startDate)))
    .map((entry, index) => (index + 1) + "차: " + (entry.startDate || "미등록") + " ~ " + (entry.endDate || activeLabel) + (entry.reason ? " (" + entry.reason + ")" : ""));
}