import { db, collection, doc, getDocs, query, where, writeBatch, Timestamp } from "@/lib/firebase";
import {
  COUNSELING_COLLECTION,
  HANDOVERS_COLLECTION,
  MATCHING_HISTORY_COLLECTION,
  TERMINATIONS_COLLECTION,
  USERS_COLLECTION,
  WORKERS_COLLECTION,
} from "@/lib/collectionNames";
import type { DocumentMatchingHistoryEntry } from "@/types";

const MAX_BATCH_WRITES = 450;

type PersonSnapshot = {
  name: string;
  phone: string;
  address?: string;
  voucherTier?: number;
  disabilityType?: string;
};

type UpdateItem = { collectionName: string; id: string; data: Record<string, unknown> };

function makeUpdateKey(collectionName: string, id: string) {
  return `${collectionName}/${id}`;
}

function queueUpdate(updates: Map<string, UpdateItem>, collectionName: string, id: string, data: Record<string, unknown>) {
  const key = makeUpdateKey(collectionName, id);
  const previous = updates.get(key);
  updates.set(key, {
    collectionName,
    id,
    data: previous ? { ...previous.data, ...data } : data,
  });
}

function updateByLinkedId(ids: string[], values: string[], linkedId: string, nextValue: string): string[] {
  const next = [...values];
  const index = ids.indexOf(linkedId);
  if (index < 0) return next;
  while (next.length < ids.length) next.push("");
  next[index] = nextValue;
  return next;
}

function rewriteWorkerEntries(entries: unknown, workerId: string, next: PersonSnapshot): DocumentMatchingHistoryEntry[] | null {
  if (!Array.isArray(entries)) return null;
  let changed = false;
  const rewritten = entries.map((entry) => {
    if (!entry || typeof entry !== "object") return entry;
    const item = entry as DocumentMatchingHistoryEntry;
    if (item.workerId !== workerId) return item;
    changed = true;
    return {
      ...item,
      workerName: next.name,
      workerPhone: next.phone,
      updatedAt: new Date().toISOString(),
    };
  });
  return changed ? (rewritten as DocumentMatchingHistoryEntry[]) : null;
}

async function commitUpdates(updates: UpdateItem[]) {
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

/** ID를 기준으로 이용자 이름/연락처/주소를 모든 역정규화 문서에 일괄 반영한다. */
export async function cascadeUserProfile(userId: string, next: PersonSnapshot) {
  const [workers, histories, counseling, handovers, terminations] = await Promise.all([
    getDocs(collection(db, WORKERS_COLLECTION)),
    matchingDocs("userId", userId, MATCHING_HISTORY_COLLECTION),
    matchingDocs("targetId", userId, COUNSELING_COLLECTION),
    matchingDocs("userId", userId, HANDOVERS_COLLECTION),
    matchingDocs("userId", userId, TERMINATIONS_COLLECTION),
  ]);

  const updates = new Map<string, UpdateItem>();
  for (const worker of workers.docs) {
    const data = worker.data();
    const ids = Array.isArray(data.assignedUserIds) ? data.assignedUserIds : [];
    if (!ids.includes(userId)) continue;
    queueUpdate(updates, WORKERS_COLLECTION, worker.id, {
      assignedUserNames: updateByLinkedId(ids, Array.isArray(data.assignedUserNames) ? data.assignedUserNames : [], userId, next.name),
      assignedUserPhones: updateByLinkedId(ids, Array.isArray(data.assignedUserPhones) ? data.assignedUserPhones : [], userId, next.phone),
    });
  }

  histories.forEach((item) => queueUpdate(updates, MATCHING_HISTORY_COLLECTION, item.id, { userName: next.name, userPhone: next.phone }));
  counseling.forEach((item) => queueUpdate(updates, COUNSELING_COLLECTION, item.id, {
    targetName: next.name,
    targetPhone: next.phone,
    ...(next.address !== undefined ? { targetAddress: next.address } : {}),
  }));
  handovers.forEach((item) => queueUpdate(updates, HANDOVERS_COLLECTION, item.id, {
    userName: next.name,
    userPhone: next.phone,
    ...(next.address !== undefined ? { userAddress: next.address } : {}),
    ...(next.voucherTier !== undefined ? { voucherTier: next.voucherTier } : {}),
    ...(next.disabilityType !== undefined ? { disabilityType: next.disabilityType } : {}),
  }));
  terminations.forEach((item) => queueUpdate(updates, TERMINATIONS_COLLECTION, item.id, {
    userName: next.name,
    userPhone: next.phone,
    ...(next.address !== undefined ? { userAddress: next.address } : {}),
  }));

  await commitUpdates([...updates.values()]);
  return updates.size;
}

/** ID를 기준으로 활동지원사 이름/연락처/주소를 모든 역정규화 문서에 일괄 반영한다. */
export async function cascadeWorkerProfile(workerId: string, next: PersonSnapshot, previous?: PersonSnapshot) {
  const [
    users,
    histories,
    counseling,
    previousHandovers,
    nextHandovers,
    handoverPersons,
    takeoverPersons,
    terminations,
  ] = await Promise.all([
    getDocs(collection(db, USERS_COLLECTION)),
    matchingDocs("workerId", workerId, MATCHING_HISTORY_COLLECTION),
    matchingDocs("targetId", workerId, COUNSELING_COLLECTION),
    matchingDocs("prevWorkerId", workerId, HANDOVERS_COLLECTION),
    matchingDocs("nextWorkerId", workerId, HANDOVERS_COLLECTION),
    previous?.name ? matchingDocs("handoverPersonName", previous.name, HANDOVERS_COLLECTION) : Promise.resolve([]),
    previous?.name ? matchingDocs("takeoverPersonName", previous.name, HANDOVERS_COLLECTION) : Promise.resolve([]),
    previous?.name ? matchingDocs("assignedWorkerName", previous.name, TERMINATIONS_COLLECTION) : Promise.resolve([]),
  ]);

  const updates = new Map<string, UpdateItem>();
  for (const user of users.docs) {
    const data = user.data();
    const ids = Array.isArray(data.assignedHelperIds) ? data.assignedHelperIds : [];
    const dataToUpdate: Record<string, unknown> = {};
    if (ids.includes(workerId)) {
      dataToUpdate.assignedHelperNames = updateByLinkedId(ids, Array.isArray(data.assignedHelperNames) ? data.assignedHelperNames : [], workerId, next.name);
      dataToUpdate.assignedHelperPhones = updateByLinkedId(ids, Array.isArray(data.assignedHelperPhones) ? data.assignedHelperPhones : [], workerId, next.phone);
    }
    const matchingHistory = rewriteWorkerEntries(data.matchingHistory, workerId, next);
    if (matchingHistory) dataToUpdate.matchingHistory = matchingHistory;
    if (Object.keys(dataToUpdate).length > 0) {
      queueUpdate(updates, USERS_COLLECTION, user.id, dataToUpdate);
    }
  }

  histories.forEach((item) => queueUpdate(updates, MATCHING_HISTORY_COLLECTION, item.id, { workerName: next.name, workerPhone: next.phone }));
  counseling.forEach((item) => queueUpdate(updates, COUNSELING_COLLECTION, item.id, {
    targetName: next.name,
    targetPhone: next.phone,
    ...(next.address !== undefined ? { targetAddress: next.address } : {}),
  }));
  previousHandovers.forEach((item) => queueUpdate(updates, HANDOVERS_COLLECTION, item.id, { prevWorkerName: next.name, prevWorkerPhone: next.phone, handoverPersonName: next.name }));
  nextHandovers.forEach((item) => queueUpdate(updates, HANDOVERS_COLLECTION, item.id, { nextWorkerName: next.name, nextWorkerPhone: next.phone, takeoverPersonName: next.name }));
  handoverPersons.forEach((item) => queueUpdate(updates, HANDOVERS_COLLECTION, item.id, { handoverPersonName: next.name }));
  takeoverPersons.forEach((item) => queueUpdate(updates, HANDOVERS_COLLECTION, item.id, { takeoverPersonName: next.name }));
  terminations.forEach((item) => queueUpdate(updates, TERMINATIONS_COLLECTION, item.id, { assignedWorkerName: next.name }));

  await commitUpdates([...updates.values()]);
  return updates.size;
}
