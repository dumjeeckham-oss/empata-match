import { db, doc, getDoc, writeBatch, Timestamp } from "@/lib/firebase";
import { MATCHING_HISTORY_COLLECTION, USERS_COLLECTION, WORKERS_COLLECTION } from "@/lib/collectionNames";
import type { MatchingHistoryRecord } from "@/types";

function removeLinkedValue(ids: string[], values: string[], targetId: string) {
  const index = ids.indexOf(targetId);
  return index < 0 ? values : values.filter((_, valueIndex) => valueIndex !== index);
}

/** 이력 삭제와 현재 양방향 배정 해제를 하나의 Firestore 배치로 처리한다. */
export async function deleteMatchingHistoryAndSync(record: MatchingHistoryRecord & { id: string }) {
  const batch = writeBatch(db);
  batch.delete(doc(db, MATCHING_HISTORY_COLLECTION, record.id));

  const isActiveAssignment = record.type === "매칭" && !record.endDate;
  if (isActiveAssignment) {
    const [userSnapshot, workerSnapshot] = await Promise.all([
      getDoc(doc(db, USERS_COLLECTION, record.userId)),
      getDoc(doc(db, WORKERS_COLLECTION, record.workerId)),
    ]);

    if (userSnapshot.exists()) {
      const user = userSnapshot.data();
      const ids = Array.isArray(user.assignedHelperIds) ? user.assignedHelperIds : [];
      const nextIds = ids.filter((id: string) => id !== record.workerId);
      batch.update(userSnapshot.ref, {
        assignedHelperIds: nextIds,
        assigned_workers: nextIds,
        assignedHelperNames: removeLinkedValue(ids, Array.isArray(user.assignedHelperNames) ? user.assignedHelperNames : [], record.workerId),
        assignedHelperPhones: removeLinkedValue(ids, Array.isArray(user.assignedHelperPhones) ? user.assignedHelperPhones : [], record.workerId),
        contractStatus: nextIds.length ? user.contractStatus : "대기",
        updatedAt: Timestamp.now(),
      });
    }

    if (workerSnapshot.exists()) {
      const worker = workerSnapshot.data();
      const ids = Array.isArray(worker.assignedUserIds) ? worker.assignedUserIds : [];
      const nextIds = ids.filter((id: string) => id !== record.userId);
      batch.update(workerSnapshot.ref, {
        assignedUserIds: nextIds,
        assigned_users: nextIds,
        assignedUserNames: removeLinkedValue(ids, Array.isArray(worker.assignedUserNames) ? worker.assignedUserNames : [], record.userId),
        assignedUserPhones: removeLinkedValue(ids, Array.isArray(worker.assignedUserPhones) ? worker.assignedUserPhones : [], record.userId),
        updatedAt: Timestamp.now(),
      });
    }
  }

  await batch.commit();
}
