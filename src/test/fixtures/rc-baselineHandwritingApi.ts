import { collection, doc, getDoc, onSnapshot, query, where, runTransaction, serverTimestamp, type Firestore } from "firebase/firestore";
import { auth, db, onAuthStateChanged } from "@/lib/firebase";
import { COUNSELING_COLLECTION, COUNSELING_HANDWRITING_COLLECTION } from "@/lib/collectionNames";
import { clearAllHandwritingDrafts, clearHandwritingDraft, decodeStrokes, memoTargetKey, type HandwritingMemo, type MemoTargetType } from "@/lib/counselingHandwriting";
import type { CounselingRecord } from "@/types";
import { nextCounselingRevision } from "@/lib/counselingRevision";

let previousUid: string | null = null;
onAuthStateChanged(auth, user => {
  if (!user || (previousUid && previousUid !== user.uid)) clearAllHandwritingDrafts();
  previousUid = user?.uid || null;
});

export function handwritingError(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (code === "permission-denied" || code === "auth/unauthorized") return "이 메모에 접근할 직원 권한이 없습니다. 다시 로그인해 주세요.";
  if (code === "unavailable" || code === "deadline-exceeded") return "연결 문제로 저장하지 못했습니다. 인터넷 연결을 확인해 주세요.";
  if (error instanceof HandwritingConflict) return error.message;
  return "손글씨 작업을 완료하지 못했습니다. 임시 내용을 유지하고 다시 시도해 주세요.";
}

export class HandwritingConflict extends Error {
  constructor(message: string, public kind: "CONFLICT" | "REMOTE_DELETED" | "COUNSELING_CONFLICT" = "CONFLICT") { super(message); }
}
function sameTimestamp(a: unknown, b: unknown): boolean {
  if (a == null || b == null) return a == null && b == null;
  const x = a as { seconds?: number; nanoseconds?: number }, y = b as typeof x;
  return typeof x.seconds === "number" && x.seconds === y.seconds && x.nanoseconds === y.nanoseconds;
}

/** Firestore 경계에서 인증·역할을 다시 검사한다. 실제 허용 여부는 Rules가 결정한다. */
async function requireStaff(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new HandwritingConflict("로그인이 필요합니다.");
  const token = await user.getIdTokenResult();
  if (!["admin", "social_worker"].includes(String(token.claims.role))) {
    clearAllHandwritingDrafts();
    throw new HandwritingConflict("이 메모에 접근할 직원 권한이 없습니다.");
  }
  return user.uid;
}

export function createHandwritingApi(database: Firestore, currentStaff: () => Promise<string> = requireStaff) {
  const ref = (id: string) => doc(database, COUNSELING_HANDWRITING_COLLECTION, id);
  return {
    async save(memo: HandwritingMemo, strokesJson: string, savedOnServer: boolean): Promise<number> {
      const uid = await currentStaff();
      decodeStrokes(strokesJson, memo.width, memo.height);
      return runTransaction(database, async transaction => {
        const snapshot = await transaction.get(ref(memo.id));
        if (savedOnServer && !snapshot.exists()) throw new HandwritingConflict("이 임시메모는 이미 삭제되었습니다. 미저장 필기는 보존됩니다.", "REMOTE_DELETED");
        if (snapshot.exists() && snapshot.data().revision !== memo.revision) throw new HandwritingConflict("다른 기기에서 메모가 변경되었습니다. 내 필기를 유지한 채 최신 메모를 다시 확인해 주세요.");
        const revision = memo.revision + 1;
        if (!snapshot.exists()) {
          if (memo.revision !== 0) throw new HandwritingConflict("이 임시메모는 이미 삭제되었습니다.");
          const { id: _id, ...data } = memo;
          transaction.set(ref(memo.id), { ...data, createdBy: uid, updatedBy: uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), strokesJson, revision, transcribedRevision: -1, transcribedAt: null, transcribedCounselingRevision: -1, confirmedBy: "", confirmedAt: null });
        } else {
          transaction.update(ref(memo.id), { strokesJson, revision, updatedBy: uid, updatedAt: serverTimestamp(), transcribedRevision: -1, transcribedAt: null, transcribedCounselingRevision: -1, confirmedBy: "", confirmedAt: null });
        }
        return revision;
      });
    },
    async saveTranscription(memo: HandwritingMemo, form: Omit<CounselingRecord, "id" | "createdAt">, expectedUpdatedAt?: unknown): Promise<string> {
      const uid = await currentStaff();
      if (!form.content.trim() || form.targetId !== memo.targetId || form.targetType !== memo.targetType) throw new HandwritingConflict("해당 대상자의 정식 상담내용을 입력해 주세요.");
      const recordRef = memo.counselingRecordId ? doc(database, COUNSELING_COLLECTION, memo.counselingRecordId) : doc(collection(database, COUNSELING_COLLECTION));
      return runTransaction(database, async transaction => {
        const snapshot = await transaction.get(ref(memo.id));
        const record = await transaction.get(recordRef);
        if (!snapshot.exists() || snapshot.data().revision !== memo.revision) throw new HandwritingConflict("손글씨가 변경되거나 삭제되었습니다. 최신 메모를 확인한 뒤 저장해 주세요.");
        if (snapshot.data().counselingRecordId !== memo.counselingRecordId) throw new HandwritingConflict("다른 기기에서 정식 상담기록을 저장했습니다. 해당 기록을 다시 열어 주세요.");
        if (record.exists() && (record.data().targetId !== memo.targetId || record.data().targetType !== memo.targetType)) throw new HandwritingConflict("상담 대상자가 일치하지 않습니다.");
        if (record.exists() && (expectedUpdatedAt === undefined || !sameTimestamp(record.data().updatedAt, expectedUpdatedAt))) throw new HandwritingConflict("다른 직원이 이 상담기록을 먼저 수정했습니다. 현재 입력한 내용은 유지됩니다. 최신 상담기록을 확인한 후 다시 처리해주세요.", "COUNSELING_CONFLICT");
        const counselingRevision = nextCounselingRevision(record.exists() ? record.data() : undefined);
        transaction.set(recordRef, { ...form, revision: counselingRevision, content: form.content.trim(), result: form.result || "", createdAt: record.exists() && "createdAt" in record.data() ? record.data().createdAt : serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
        transaction.update(ref(memo.id), { counselingRecordId: recordRef.id, transcribedRevision: memo.revision, transcribedCounselingRevision: counselingRevision, transcribedAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: uid, confirmedBy: "", confirmedAt: null });
        return recordRef.id;
      });
    },
    async confirmTranscription(memo: HandwritingMemo, expectedCounselingRevision?: number): Promise<void> {
      const uid = await currentStaff();
      await runTransaction(database, async transaction => {
        const snapshot = await transaction.get(ref(memo.id));
        if (!snapshot.exists()) return;
        const current = snapshot.data();
        if (current.revision !== memo.revision || current.transcribedRevision !== current.revision || !current.counselingRecordId) throw new HandwritingConflict("최신 손글씨의 정식 상담기록을 먼저 저장해 주세요.");
        const record = await transaction.get(doc(database, COUNSELING_COLLECTION, current.counselingRecordId));
        if (!record.exists() || record.data().targetId !== current.targetId || record.data().targetType !== current.targetType || record.data().revision !== current.transcribedCounselingRevision || (expectedCounselingRevision !== undefined && record.data().revision !== expectedCounselingRevision) || !String(record.data().content || "").trim()) throw new HandwritingConflict("상담기록 또는 손글씨가 변경되어 삭제할 수 없습니다. 최신 내용을 다시 확인해 주세요.");
        transaction.update(ref(memo.id), { confirmedBy: uid, confirmedAt: serverTimestamp(), updatedBy: uid, updatedAt: serverTimestamp() });
      });
    },
    async deleteConfirmed(memo: HandwritingMemo): Promise<void> {
      const uid = await currentStaff();
      await runTransaction(database, async transaction => {
        const snapshot = await transaction.get(ref(memo.id));
        if (!snapshot.exists()) return;
        const current = snapshot.data();
        if (current.revision !== memo.revision || current.transcribedRevision !== current.revision || !current.counselingRecordId) throw new HandwritingConflict("최신 손글씨의 정식 상담기록을 먼저 저장해 주세요.");
        const record = await transaction.get(doc(database, COUNSELING_COLLECTION, current.counselingRecordId));
        if (!record.exists() || record.data().targetId !== current.targetId || record.data().targetType !== current.targetType || record.data().revision !== current.transcribedCounselingRevision || current.confirmedBy !== uid || !current.confirmedAt || !String(record.data().content || "").trim()) throw new HandwritingConflict("상담기록 또는 손글씨가 변경되어 삭제할 수 없습니다. 최신 내용을 다시 확인해 주세요.");
        transaction.delete(ref(memo.id));
      });
      clearHandwritingDraft(uid, memo.id);
    },
    /** Caller invokes only after explicit confirmation. Two separate commits recheck state. */
    async removeAfterTranscription(memo: HandwritingMemo, expectedCounselingRevision?: number): Promise<void> {
      const service = createHandwritingApi(database, currentStaff);
      await service.confirmTranscription(memo, expectedCounselingRevision);
      await service.deleteConfirmed(memo);
    },
    /** Explicit recovery writes ONLY formal counseling, never resurrects the deleted memo. */
    async saveRecoveredTranscription(memo: HandwritingMemo, id: string, form: Omit<CounselingRecord, "id" | "createdAt">, expectedUpdatedAt?: unknown): Promise<string> {
      await currentStaff();
      if (!form.content.trim() || form.targetId !== memo.targetId || form.targetType !== memo.targetType) throw new HandwritingConflict("해당 대상자의 정식 상담내용을 입력해 주세요.");
      const recordRef = doc(database, COUNSELING_COLLECTION, id);
      return runTransaction(database, async transaction => {
        const original = await transaction.get(ref(memo.id));
        const record = await transaction.get(recordRef);
        if (original.exists()) throw new HandwritingConflict("서버 메모 상태를 다시 확인해 주세요.");
        if (record.exists() && (record.data().targetId !== memo.targetId || record.data().targetType !== memo.targetType || expectedUpdatedAt === undefined || !sameTimestamp(record.data().updatedAt, expectedUpdatedAt))) throw new HandwritingConflict("다른 직원이 이 상담기록을 먼저 수정했습니다. 입력 내용은 유지됩니다.", "COUNSELING_CONFLICT");
        transaction.set(recordRef, { ...form, revision: nextCounselingRevision(record.exists() ? record.data() : undefined), content: form.content.trim(), result: form.result || "", createdAt: record.exists() && "createdAt" in record.data() ? record.data().createdAt : serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
        return id;
      });
    },
    async confirmRecoveredTranscription(memo: HandwritingMemo, id: string, expectedUpdatedAt: unknown): Promise<void> {
      const uid = await currentStaff();
      await runTransaction(database, async transaction => {
        const original = await transaction.get(ref(memo.id));
        const record = await transaction.get(doc(database, COUNSELING_COLLECTION, id));
        if (original.exists() || !record.exists() || !sameTimestamp(record.data().updatedAt, expectedUpdatedAt) || record.data().targetId !== memo.targetId || record.data().targetType !== memo.targetType || !String(record.data().content || "").trim()) throw new HandwritingConflict("정식 상담기록 저장 상태를 다시 확인해 주세요.");
      });
      clearHandwritingDraft(uid, memo.id);
    },
    async loadRecord(id: string): Promise<(CounselingRecord & { id: string; updatedAt?: unknown }) | null> {
      await currentStaff();
      const snapshot = await getDoc(doc(database, COUNSELING_COLLECTION, id));
      return snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } as CounselingRecord & { id: string; updatedAt?: unknown } : null;
    },
    subscribe(memoId: string, receive: (memo: HandwritingMemo | null) => void, fail: (error: unknown) => void) {
      return onSnapshot(ref(memoId), { includeMetadataChanges: true }, snapshot => {
        // 메모리 캐시의 일시적인 missing을 실제 서버 삭제로 오해하지 않는다.
        const fromCache = snapshot.metadata.fromCache;
        if (fromCache || snapshot.metadata.hasPendingWrites) return;
        receive(snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } as HandwritingMemo : null);
      }, fail);
    },
    subscribePending(receive: (memos: HandwritingMemo[]) => void, fail: (error: unknown) => void, target?: { type: MemoTargetType; id: string }) {
      const all = collection(database, COUNSELING_HANDWRITING_COLLECTION);
      return onSnapshot(target ? query(all, where("targetKey", "==", memoTargetKey(target.type, target.id))) : all, { includeMetadataChanges: true }, snapshot => {
        if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
        receive(snapshot.docs.map(item => ({ ...item.data(), id: item.id }) as HandwritingMemo));
      }, fail);
    },
  };
}
export const handwritingApi = createHandwritingApi(db);
