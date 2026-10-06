import { collection, doc, increment, runTransaction, serverTimestamp, type Firestore } from "firebase/firestore";
import { COUNSELING_COLLECTION } from "@/lib/collectionNames";

export function nextCounselingRevision(data?: Record<string, unknown>): number {
  if (!data || !("revision" in data)) return 1;
  if (!Number.isSafeInteger(data.revision) || Number(data.revision) < 1) throw new Error("상담기록 버전을 확인할 수 없습니다.");
  return Number(data.revision) + 1;
}

export async function createCounselingRecord(database: Firestore, payload: Record<string, unknown>) {
  const ref = doc(collection(database, COUNSELING_COLLECTION));
  await runTransaction(database, async transaction => {
    transaction.set(ref, { ...payload, revision: 1, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  });
  return ref;
}

export async function updateCounselingRecord(database: Firestore, id: string, payload: Record<string, unknown>) {
  const ref = doc(database, COUNSELING_COLLECTION, id);
  await runTransaction(database, async transaction => {
    const previous = await transaction.get(ref);
    if (!previous.exists()) throw new Error("상담기록이 존재하지 않습니다.");
    nextCounselingRevision(previous.data()); // Validate legacy/versioned state before writing.
    transaction.update(ref, { ...payload, revision: increment(1), updatedAt: serverTimestamp() });
  });
}
