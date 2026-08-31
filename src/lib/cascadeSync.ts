import { db, collection, doc, getDocs, query, where, writeBatch, Timestamp } from "@/lib/firebase";
import {
  COUNSELING_COLLECTION,
  HANDOVERS_COLLECTION,
  MATCHING_HISTORY_COLLECTION,
  TERMINATIONS_COLLECTION,
  USERS_COLLECTION,
  WORKERS_COLLECTION,
} from "@/lib/collectionNames";

const MAX_BATCH_WRITES = 450;

type PersonSnapshot = {
  name: string;
  phone: string;
  address?: string;
  voucherTier?: number;
  disabilityType?: string;
};

async function commitUpdates(
  updates: Array<{ collectionName: string; id: string; data: Record<string, unknown> }>,
) {
  for (let offset = 0; offset < updates.length; offset += MAX_BATCH_WRITES) {
    const batch = writeBatch(db);
    for (const update of updates.slice(offset, offset + MAX_BATCH_WRITES)) {
      batch.update(doc(db, update.collectionName, update.id), {
        ...update.data,
        updatedAt: Timestamp.now(),
      });
    }
    await batch.commit();
  }
}

async function matchingDocs(field: string, id: string, collectionName: string) {
  const snapshot = await getDocs(query(collection(db, collectionName), where(field, "==", id)));
  return snapshot.docs;
}

/** ID를 기준으로 이용자 이름/연락처를 모든 역정규화 문서에 일괄 반영한다. */
export async function cascadeUserProfile(userId: string, next: PersonSnapshot) {
  const [workers, histories, counseling, handovers, terminations] = await Promise.all([
    getDocs(collection(db, WORKERS_COLLECTION)),
    matchingDocs("userId", userId, MATCHING_HISTORY_COLLECTION),
    matchingDocs("targetId", userId, COUNSELING_COLLECTION),
    matchingDocs("userId", userId, HANDOVERS_COLLECTION),
    matchingDocs("userId", userId, TERMINATIONS_COLLECTION),
  ]);

  const updates: Array<{ collectionName: string; id: string; data: Record<string, unknown> }> = [];
  for (const worker of workers.docs) {
    const data = worker.data();
    const ids = Array.isArray(data.assignedUserIds) ? data.assignedUserIds : [];
    const index = ids.indexOf(userId);
    if (index < 0) continue;
    const names = [...(Array.isArray(data.assignedUserNames) ? data.assignedUserNames : [])];
    const phones = [...(Array.isArray(data.assignedUserPhones) ? data.assignedUserPhones : [])];
    names[index] = next.name;
    phones[index] = next.phone;
    updates.push({ collectionName: WORKERS_COLLECTION, id: worker.id, data: { assignedUserNames: names, assignedUserPhones: phones } });
  }
  histories.forEach((item) => updates.push({ collectionName: MATCHING_HISTORY_COLLECTION, id: item.id, data: { userName: next.name, userPhone: next.phone } }));
  counseling.forEach((item) => updates.push({ collectionName: COUNSELING_COLLECTION, id: item.id, data: { targetName: next.name } }));
  handovers.forEach((item) => updates.push({
    collectionName: HANDOVERS_COLLECTION,
    id: item.id,
    data: {
      userName: next.name,
      userPhone: next.phone,
      ...(next.address !== undefined ? { userAddress: next.address } : {}),
      ...(next.voucherTier !== undefined ? { voucherTier: next.voucherTier } : {}),
      ...(next.disabilityType !== undefined ? { disabilityType: next.disabilityType } : {}),
    },
  }));
  terminations.forEach((item) => updates.push({ collectionName: TERMINATIONS_COLLECTION, id: item.id, data: { userName: next.name, userPhone: next.phone } }));
  await commitUpdates(updates);
}

/** ID를 기준으로 활동지원사 이름/연락처를 모든 역정규화 문서에 일괄 반영한다. */
export async function cascadeWorkerProfile(workerId: string, next: PersonSnapshot) {
  const [users, histories, counseling, previousHandovers, nextHandovers] = await Promise.all([
    getDocs(collection(db, USERS_COLLECTION)),
    matchingDocs("workerId", workerId, MATCHING_HISTORY_COLLECTION),
    matchingDocs("targetId", workerId, COUNSELING_COLLECTION),
    matchingDocs("prevWorkerId", workerId, HANDOVERS_COLLECTION),
    matchingDocs("nextWorkerId", workerId, HANDOVERS_COLLECTION),
  ]);

  const updates: Array<{ collectionName: string; id: string; data: Record<string, unknown> }> = [];
  for (const user of users.docs) {
    const data = user.data();
    const ids = Array.isArray(data.assignedHelperIds) ? data.assignedHelperIds : [];
    const index = ids.indexOf(workerId);
    if (index < 0) continue;
    const names = [...(Array.isArray(data.assignedHelperNames) ? data.assignedHelperNames : [])];
    const phones = [...(Array.isArray(data.assignedHelperPhones) ? data.assignedHelperPhones : [])];
    names[index] = next.name;
    phones[index] = next.phone;
    updates.push({ collectionName: USERS_COLLECTION, id: user.id, data: { assignedHelperNames: names, assignedHelperPhones: phones } });
  }
  histories.forEach((item) => updates.push({ collectionName: MATCHING_HISTORY_COLLECTION, id: item.id, data: { workerName: next.name, workerPhone: next.phone } }));
  counseling.forEach((item) => updates.push({ collectionName: COUNSELING_COLLECTION, id: item.id, data: { targetName: next.name } }));
  previousHandovers.forEach((item) => updates.push({ collectionName: HANDOVERS_COLLECTION, id: item.id, data: { prevWorkerName: next.name, prevWorkerPhone: next.phone, handoverPersonName: next.name } }));
  nextHandovers.forEach((item) => updates.push({ collectionName: HANDOVERS_COLLECTION, id: item.id, data: { nextWorkerName: next.name, nextWorkerPhone: next.phone, takeoverPersonName: next.name } }));
  await commitUpdates(updates);
}
