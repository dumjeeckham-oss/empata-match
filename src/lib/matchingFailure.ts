import type { MatchingHistoryRecord, ServiceUser, Worker } from "@/types";
import { collection, db, doc, Timestamp, writeBatch } from "@/lib/firebase";
import { MATCHING_HISTORY_COLLECTION, USERS_COLLECTION, WORKERS_COLLECTION } from "@/lib/collectionNames";
import { sanitizeForFirestore } from "@/lib/bulkUpload";

export const MATCHING_FAILURE_SCORE_DELTA = 25;

export const MATCHING_FAILURE_REASONS = [
  "거주지 거리 멀음",
  "시간대 불일치",
  "주말 케어 불가",
  "반려동물",
  "이용자 거부",
  "지원사 거부",
  "케어 난이도",
  "기타",
] as const;

export function isServiceHistoryRecord(record: MatchingHistoryRecord): boolean {
  return record.type === "매칭" || record.type === "해제";
}

export function isMatchingFailure(record: MatchingHistoryRecord): boolean {
  return record.type === "실패" || record.status === "매칭 실패";
}

function rejectionTypeForReason(reason: string): string | undefined {
  if (/주말|토요일|일요일/.test(reason)) return "주말거부";
  if (/반려|동물|강아지|고양이/.test(reason)) return "반려동물거부";
  if (/기저귀|배변/.test(reason)) return "기저귀거부";
  if (/목욕/.test(reason)) return "목욕거부";
  if (/요리|조리|반찬/.test(reason)) return "요리거부";
  return undefined;
}

export function buildFailureFeedbackUpdates(
  user: ServiceUser & { id: string },
  worker: Worker & { id: string },
  reason: string,
  delta = MATCHING_FAILURE_SCORE_DELTA,
): { user: Partial<ServiceUser>; worker: Partial<Worker> } {
  const normalizedReason = reason.trim() || "기타";
  const rejectionType = rejectionTypeForReason(normalizedReason);
  const userPairScore = Number(user.rejectionScores?.[worker.id] || 0) + delta;
  const workerPairScore = Number(worker.rejectionScores?.[user.id] || 0) + delta;
  return {
    user: {
      rejectionScores: { ...(user.rejectionScores || {}), [worker.id]: userPairScore },
      matchingPreferences: {
        ...(user.matchingPreferences || {}),
        [normalizedReason]: Number(user.matchingPreferences?.[normalizedReason] || 0) + delta,
      },
    },
    worker: {
      rejectionScores: { ...(worker.rejectionScores || {}), [user.id]: workerPairScore },
      matchingPreferences: {
        ...(worker.matchingPreferences || {}),
        [normalizedReason]: Number(worker.matchingPreferences?.[normalizedReason] || 0) + delta,
      },
      rejectionTypes: rejectionType
        ? Array.from(new Set([...(worker.rejectionTypes || []), rejectionType]))
        : worker.rejectionTypes || [],
    },
  };
}

export function hasFailureWithoutSuccess(
  records: MatchingHistoryRecord[],
  userId: string,
  workerId: string,
  date: string,
): boolean {
  const samePairAndDate = records.filter((record) =>
    record.userId === userId
    && record.workerId === workerId
    && String(record.attemptDate || record.date || "") === date,
  );
  return samePairAndDate.some(isMatchingFailure)
    && !samePairAndDate.some((record) => record.type === "매칭" || record.status === "매칭 완료");
}
export async function recordMatchingFailure(
  record: MatchingHistoryRecord,
  user: ServiceUser & { id: string },
  worker: Worker & { id: string },
): Promise<void> {
  const feedback = buildFailureFeedbackUpdates(user, worker, record.failureReason || record.reasonDetail || "기타");
  const batch = writeBatch(db);
  const historyRef = doc(collection(db, MATCHING_HISTORY_COLLECTION));
  const now = Timestamp.now();
  batch.set(historyRef, {
    ...sanitizeForFirestore(record as unknown as Record<string, unknown>),
    createdAt: now,
    updatedAt: now,
  });
  batch.update(doc(db, USERS_COLLECTION, user.id), {
    ...sanitizeForFirestore(feedback.user as Record<string, unknown>),
    updatedAt: now,
  });
  batch.update(doc(db, WORKERS_COLLECTION, worker.id), {
    ...sanitizeForFirestore(feedback.worker as Record<string, unknown>),
    updatedAt: now,
  });
  await batch.commit();
}