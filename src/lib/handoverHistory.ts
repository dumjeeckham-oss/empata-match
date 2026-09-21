import type { DocumentMatchingHistoryEntry, MatchingHistoryRecord, MatchingHistoryReason, WeeklySchedule } from "@/types";

type WorkerIdentity = {
  id: string;
  name: string;
  phone: string;
};

const HANDOVER_NOTE_PREFIX = "인계·인수서 작성";

function isOpen(entry: DocumentMatchingHistoryEntry): boolean {
  return !entry.serviceEndDate;
}

export function buildHandoverDocumentHistory(params: {
  entries?: DocumentMatchingHistoryEntry[];
  previousWorkerId?: string;
  nextWorker: WorkerIdentity;
  handoverDate: string;
  takeoverDate: string;
  reasonDetail: string;
  serviceSchedule?: WeeklySchedule[];
}): DocumentMatchingHistoryEntry[] {
  const {
    entries = [],
    previousWorkerId,
    nextWorker,
    handoverDate,
    takeoverDate,
    reasonDetail,
    serviceSchedule = [],
  } = params;

  const existingActiveNext = entries.find((entry) => entry.workerId === nextWorker.id && isOpen(entry));
  const next = entries.map((entry) => {
    if (entry.workerId === previousWorkerId && entry.workerId !== nextWorker.id && isOpen(entry)) {
      return {
        ...entry,
        serviceEndDate: handoverDate,
        reason: "인계" as MatchingHistoryReason,
        reasonDetail,
        updatedAt: new Date().toISOString(),
      };
    }
    if (entry === existingActiveNext) {
      return {
        ...entry,
        workerName: nextWorker.name,
        workerPhone: nextWorker.phone,
        serviceEndDate: null,
        reasonDetail,
        serviceSchedule: serviceSchedule.length ? serviceSchedule : entry.serviceSchedule,
        updatedAt: new Date().toISOString(),
      };
    }
    return entry;
  });

  if (existingActiveNext) return next;

  return [
    ...next.filter((entry) => !(entry.workerId === nextWorker.id && entry.serviceStartDate === takeoverDate)),
    {
      id: `handover-${nextWorker.id}-${takeoverDate}`,
      workerId: nextWorker.id,
      workerName: nextWorker.name,
      workerPhone: nextWorker.phone,
      serviceStartDate: takeoverDate,
      serviceEndDate: null,
      reason: "인계",
      reasonDetail,
      serviceSchedule,
      updatedAt: new Date().toISOString(),
    },
  ];
}

function isHandoverGenerated(record: MatchingHistoryRecord): boolean {
  return record.type === "매칭" && String(record.notes || "").startsWith(HANDOVER_NOTE_PREFIX);
}

/** 이미 서비스 중인 같은 이용자-지원사 매칭은 새 행을 만들지 않고 이 기록을 갱신한다. */
export function findExistingMatchForHandover(
  records: Array<MatchingHistoryRecord & { id?: string }>,
  userId: string,
  workerId: string,
): (MatchingHistoryRecord & { id?: string }) | undefined {
  return records
    .filter((record) =>
      record.userId === userId &&
      record.workerId === workerId &&
      record.type === "매칭" &&
      record.status !== "매칭 실패" &&
      !record.endDate,
    )
    .sort((a, b) => {
      const generatedDiff = Number(isHandoverGenerated(a)) - Number(isHandoverGenerated(b));
      if (generatedDiff !== 0) return generatedDiff;
      return String(a.date || "").localeCompare(String(b.date || ""));
    })[0];
}

/** 기존 데이터에 남은 '인계인수서 작성으로 생성된 중복 매칭'만 안전하게 화면에서 접는다. */
export function collapseHandoverDuplicateMatches<T extends MatchingHistoryRecord & { id?: string }>(records: T[]): T[] {
  const ordinaryMatches = records.filter((record) => record.type === "매칭" && !isHandoverGenerated(record));
  const keptGeneratedKeys = new Set<string>();

  return records.filter((record) => {
    if (!isHandoverGenerated(record)) return true;
    const pair = `${record.userId}\u0000${record.workerId}`;
    const uninterruptedOriginal = ordinaryMatches.some((original) => {
      if (original.userId !== record.userId || original.workerId !== record.workerId || original.date > record.date) return false;
      return !records.some((event) => {
        if (event.userId !== record.userId || event.workerId !== record.workerId || event.type !== "해제") return false;
        const releaseDate = event.endDate || event.date;
        return releaseDate >= original.date && releaseDate < record.date;
      });
    });
    const generatedKey = `${pair}\u0000${record.date}`;
    if (uninterruptedOriginal || keptGeneratedKeys.has(generatedKey)) return false;
    keptGeneratedKeys.add(generatedKey);
    return true;
  });
}
