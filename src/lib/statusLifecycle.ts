import type {
  ContractHistoryEntry,
  DocumentMatchingHistoryEntry,
  EmploymentHistoryEntry,
  ServiceUser,
  Worker,
} from "@/types";

const clean = (value: unknown) => String(value ?? "").trim();

export type WorkerBadge = { label: "재직중" | "서비스 제공중" | "대기" | "신규 대기" | "퇴사"; className: string };
export type WorkerOperationalStatus = "서비스 제공중" | "대기" | "퇴사";

const toYmd = (value: Date | string) => {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return clean(value).slice(0, 10);
};

export function getWorkerAssignmentIds(worker: unknown): string[] {
  const source = worker && typeof worker === "object" ? worker as Record<string, unknown> : {};
  const current = Array.isArray(source.assignedUserIds) ? source.assignedUserIds : [];
  const legacy = Array.isArray(source.assigned_users) ? source.assigned_users : [];
  const single = clean(source.assignedUserId);
  return Array.from(new Set([...current, ...legacy, single].map(clean).filter(Boolean)));
}

/** 오늘 기준 실제 배정과 재직 여부만으로 활동지원사 상태를 판정한다. */
export function getWorkerOperationalStatus(worker: Worker, asOf: Date | string = new Date()): WorkerOperationalStatus {
  const status = clean(worker.contractStatus).replace(/\s+/g, "");
  const today = toYmd(asOf);
  const retirementDate = clean(worker.retirementDate || worker.resignationDate).slice(0, 10);
  const assignmentCount = getWorkerAssignmentIds(worker).length;

  // A valid current contract status takes precedence over a historical resignation date.
  // Assignment state still determines whether the current worker is serving or waiting.
  if (status === "대기" || status === "근무중") {
    return assignmentCount > 0 ? "서비스 제공중" : "대기";
  }

  const retiredWithoutDate = status === "퇴사" && !retirementDate;
  const retirementIsEffective = Boolean(retirementDate) && retirementDate <= today;

  if (retiredWithoutDate || retirementIsEffective) return "퇴사";
  return assignmentCount > 0 ? "서비스 제공중" : "대기";
}

export function resolveWorkerContractStatus(worker: Worker, asOf: Date | string = new Date()): Worker["contractStatus"] {
  const status = getWorkerOperationalStatus(worker, asOf);
  if (status === "퇴사") return "퇴사";
  return status === "서비스 제공중" ? "근무중" : "대기";
}

export function isWorkerRetired(worker: Worker, asOf: Date | string = new Date()): boolean {
  return getWorkerOperationalStatus(worker, asOf) === "퇴사";
}

export function isWorkerWaitingForMatch(worker: Worker, asOf: Date | string = new Date()): boolean {
  if (worker.employedElsewhere === true) return false;
  return getWorkerOperationalStatus(worker, asOf) === "대기";
}

export function getWorkerStatusBadges(worker: Worker): WorkerBadge[] {
  const status = getWorkerOperationalStatus(worker);
  if (status === "퇴사") return [{ label: "퇴사", className: "bg-slate-500 text-white hover:bg-slate-500" }];
  if (status === "서비스 제공중") {
    return [
      { label: "재직중", className: "bg-blue-600 text-white hover:bg-blue-600" },
      { label: "서비스 제공중", className: "bg-emerald-600 text-white hover:bg-emerald-600" },
    ];
  }
  const hasEmploymentStarted = Boolean(clean(worker.serviceStartDate))
    || (worker.employmentHistory || []).some((entry) => Boolean(clean(entry.startDate)));
  return hasEmploymentStarted
    ? [
        { label: "재직중", className: "bg-blue-600 text-white hover:bg-blue-600" },
        { label: "대기", className: "bg-orange-500 text-white hover:bg-orange-500" },
      ]
    : [{ label: "신규 대기", className: "bg-orange-500 text-white hover:bg-orange-500" }];
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

/** 기존 종결 기간을 보존한 뒤 확인된 재계약 기간을 추가한다. */
export function prepareUserRecontract(user: ServiceUser, startDate: string): Partial<ServiceUser> {
  const end = clean(user.resignationDate);
  const start = clean(startDate);
  if (!end || !start || start < end) throw new Error("재계약 시작일은 기존 계약해지일보다 빠를 수 없습니다. 기존 계약해지일도 확인해주세요.");
  if (!clean(user.serviceStartDate) && !(user.contractHistory || []).some((entry) => clean(entry.startDate))) throw new Error("기존 계약 시작일이 없어 이전 계약 기간을 보존할 수 없습니다. 이전 시작일을 먼저 확인해주세요.");
  if (user.serviceStartDate && user.serviceStartDate > end && !(user.contractHistory || []).some((entry) => entry.endDate === end)) throw new Error("기존 계약 시작일이 계약해지일보다 늦습니다. 기존 계약 이력을 먼저 확인해주세요.");
  const existing = user.contractHistory || [];
  if (existing.filter((entry) => !entry.endDate).length > 1 || (existing.some((entry) => !entry.endDate) && existing.some((entry) => entry.endDate === end && entry.status === "계약해지")) || existing.some((entry) => clean(entry.endDate) > end || clean(entry.startDate) >= start)) throw new Error("기존 계약 이력의 기간이 중복되거나 순서가 맞지 않습니다. 이력을 먼저 확인해주세요.");
  const previousReason = existing.find((entry) => entry.endDate === end && entry.status === "계약해지")?.reason || "";
  const history = appendContractTransition(user, end, "계약해지", user.terminationReason || user.txtUMemostop || previousReason);
  history.push({ id: `contract-${start}`, startDate: start, endDate: null, status: "서비스중" });
  return { contractStatus: "서비스중", serviceStartDate: start, resignationDate: "", terminationReason: "", txtUMemostop: "", contractHistory: history };
}

/** 기존 퇴사 기간을 보존한 뒤 확인된 재입사 기간을 추가한다. */
export function prepareWorkerRehire(worker: Worker, startDate: string): Partial<Worker> {
  const end = clean(worker.retirementDate || worker.resignationDate);
  const start = clean(startDate);
  if (!end || !start || start < end) throw new Error("재입사일은 기존 퇴사일보다 빠를 수 없습니다. 기존 퇴사일도 확인해주세요.");
  if (!clean(worker.serviceStartDate) && !(worker.employmentHistory || []).some((entry) => clean(entry.startDate))) throw new Error("기존 근무 시작일이 없어 이전 근무 기간을 보존할 수 없습니다. 이전 시작일을 먼저 확인해주세요.");
  const history = [...(worker.employmentHistory || [])];
  if (history.filter((entry) => !entry.endDate).length > 1 || (history.some((entry) => !entry.endDate) && history.some((entry) => entry.endDate === end)) || history.some((entry) => clean(entry.endDate) > end || clean(entry.startDate) >= start)) throw new Error("기존 근무 이력의 기간이 중복되거나 순서가 맞지 않습니다. 이력을 먼저 확인해주세요.");
  const open = history.findIndex((entry) => !entry.endDate);
  if (open >= 0 && clean(history[open].startDate) > end) throw new Error("기존 근무 시작일이 퇴사일보다 늦습니다. 기존 근무 이력을 먼저 확인해주세요.");
  if (open < 0 && worker.serviceStartDate && worker.serviceStartDate > end && !history.some((entry) => entry.endDate === end)) throw new Error("기존 근무 시작일이 퇴사일보다 늦습니다. 기존 근무 이력을 먼저 확인해주세요.");
  if (open >= 0) history[open] = { ...history[open], endDate: end, status: "퇴사" };
  else if (worker.serviceStartDate && !history.some((entry) => entry.startDate === worker.serviceStartDate && entry.endDate === end)) {
    history.push({ id: `employment-${worker.serviceStartDate}`, startDate: worker.serviceStartDate, endDate: end, status: "퇴사" });
  }
  history.push({ id: `employment-${start}`, startDate: start, endDate: null, status: "재직중" });
  return { contractStatus: "대기", serviceStartDate: start, serviceEndDate: null, retirementDate: "", resignationDate: "", employmentHistory: history };
}

export function hasActualServicePeriod(worker: Worker): boolean {
  const startDate = clean(worker.serviceStartDate);
  if (!startDate) return false;
  const hasAssignedUser = getWorkerAssignmentIds(worker).length > 0;
  const endDate = clean(worker.serviceEndDate || (worker.contractStatus === "퇴사" ? worker.retirementDate || worker.resignationDate : ""));
  return hasAssignedUser || Boolean(endDate);
}

export function getActualEmploymentHistory(worker: Worker): EmploymentHistoryEntry[] {
  const startDate = clean(worker.serviceStartDate);
  const endDate = clean(worker.serviceEndDate || (worker.contractStatus === "퇴사" ? worker.retirementDate || worker.resignationDate : ""));
  const hasCurrentService = getWorkerAssignmentIds(worker).length > 0;
  const history = (worker.employmentHistory || []).filter((entry) => {
    const entryStart = clean(entry.startDate);
    return Boolean(entryStart) && (Boolean(clean(entry.endDate)) || (entryStart === startDate && (hasCurrentService || worker.contractStatus === "대기" || worker.contractStatus === "근무중")));
  }).map((entry) => ({ ...entry, startDate: clean(entry.startDate), endDate: clean(entry.endDate) || null }));
  if (!startDate || (!hasCurrentService && !endDate)) return history;
  const index = history.findIndex((entry) => entry.startDate === startDate);
  const current: EmploymentHistoryEntry = {
    id: index >= 0 ? history[index].id : "employment-" + startDate,
    startDate,
    endDate: endDate || null,
    status: endDate ? "퇴사" : "재직중",
    reason: endDate ? "서비스 종료" : undefined,
  };
  if (index >= 0) history[index] = { ...history[index], ...current };
  else history.push(current);
  return history.sort((a, b) => clean(a.startDate).localeCompare(clean(b.startDate)));
}

export function appendEmploymentTransition(worker: Worker, endDate: string, reason = "퇴사"): EmploymentHistoryEntry[] {
  const history = getActualEmploymentHistory(worker);
  const startDate = clean(worker.serviceStartDate);
  if (!startDate || !hasActualServicePeriod(worker)) return history;
  const index = history.findIndex((entry) => entry.startDate === startDate && !clean(entry.endDate));
  if (index >= 0) {
    history[index] = { ...history[index], endDate: clean(endDate) || null, status: "퇴사", reason };
    return history;
  }
  history.push({ id: "employment-" + startDate, startDate, endDate: clean(endDate) || null, status: "퇴사", reason });
  return history;
}

export function ensureOpenEmploymentHistory(worker: Worker): EmploymentHistoryEntry[] {
  return getActualEmploymentHistory(worker);
}
export function formatPeriodHistory(entries: Array<{ startDate: string; endDate: string | null; status: string; reason?: string }>, activeLabel: string): string[] {
  return [...entries]
    .sort((a, b) => clean(a.startDate).localeCompare(clean(b.startDate)))
    .map((entry, index) => (index + 1) + "차: " + (entry.startDate || "미등록") + " ~ " + (entry.endDate || activeLabel) + (entry.reason ? " (" + entry.reason + ")" : ""));
}
