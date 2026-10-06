import { collection, doc, getDoc, onSnapshot, runTransaction, serverTimestamp, type Firestore } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { REGISTRATION_HANDWRITING_COLLECTION, USERS_COLLECTION, WORKERS_COLLECTION } from "@/lib/collectionNames";
import { decodeStrokes, getHandwritingDraft, memoTargetKey, type HandwritingMemo, type MemoTargetType } from "@/lib/counselingHandwriting";
import { HandwritingConflict, requireStaff } from "@/lib/counselingHandwritingApi";
import { createManualForceDeleteApi } from "@/lib/manualForceDeleteApi";
import { sanitizeForFirestore } from "@/lib/bulkUpload";

export type RegistrationMemo = { draftId: string; targetType: MemoTargetType; targetId: string; registered: boolean; createdBy: string; createdAt: unknown; updatedBy: string; updatedAt: unknown; revision: number; width: number; height: number; strokesJson: string; schemaVersion: 1 };
export function registrationCanvasMemo(m: RegistrationMemo): HandwritingMemo {
  return { ...m, id: m.draftId, targetKey: memoTargetKey(m.targetType, m.targetId), counselingRecordId: "", transcribedRevision: -1, transcribedAt: null };
}
export function newRegistrationMemo(type: MemoTargetType, id: string, uid: string): HandwritingMemo {
  return registrationCanvasMemo({ draftId: id, targetType: type, targetId: id, registered: false, createdBy: uid, updatedBy: uid, createdAt: null, updatedAt: null, revision: 0, schemaVersion: 1, width: 1600, height: 1000, strokesJson: "[]" });
}
export function createRegistrationHandwritingApi(database: Firestore, currentStaff = requireStaff) {
 const ref = (id: string) => doc(database, REGISTRATION_HANDWRITING_COLLECTION, id);
 return {
  ...createManualForceDeleteApi(database, REGISTRATION_HANDWRITING_COLLECTION, currentStaff),
  async save(memo: HandwritingMemo, strokesJson: string, savedOnServer: boolean): Promise<number> {
   const uid = await currentStaff(); decodeStrokes(strokesJson, memo.width, memo.height);
   return runTransaction(database, async tx => {
    const snapshot = await tx.get(ref(memo.id));
    if (!snapshot.exists() && savedOnServer) throw new HandwritingConflict("서버에서 삭제된 메모입니다. 필기를 보존합니다.", "REMOTE_DELETED");
    if (snapshot.exists() && snapshot.data().revision !== memo.revision) throw new HandwritingConflict("다른 기기에서 손글씨가 변경되었습니다.");
    const revision = memo.revision + 1;
    if (snapshot.exists()) tx.update(ref(memo.id), { strokesJson, revision, updatedBy: uid, updatedAt: serverTimestamp() });
    else {
     if (memo.revision !== 0) throw new HandwritingConflict("이미 삭제된 메모입니다.", "REMOTE_DELETED");
     tx.set(ref(memo.id), { schemaVersion: 1, draftId: memo.id, targetType: memo.targetType, targetId: memo.id, registered: false, createdBy: uid, createdAt: serverTimestamp(), updatedBy: uid, updatedAt: serverTimestamp(), revision, width: memo.width, height: memo.height, strokesJson });
    }
    return revision;
   });
  },
  async register(type: MemoTargetType, draftId: string, payload: Record<string, unknown>) {
   const uid = await currentStaff();
   const local = getHandwritingDraft(uid, draftId);
   if (local?.generation || local?.recovery) throw new Error("손글씨를 임시저장한 후 등록해 주세요. 필기는 유지됩니다.");
   const targetRef = doc(database, type === "이용자" ? USERS_COLLECTION : WORKERS_COLLECTION, draftId);
   await runTransaction(database, async tx => {
    const memo = await tx.get(ref(draftId)); const target = await tx.get(targetRef);
    if (target.exists()) throw new Error("이미 등록된 대상입니다. 중복 저장하지 않았습니다.");
    if (memo.exists() && (memo.data().targetType !== type || memo.data().createdBy !== uid || memo.data().registered)) throw new Error("등록 메모와 대상이 일치하지 않습니다.");
    const clean = sanitizeForFirestore(payload);
    delete clean.registrationDraftId;
    tx.set(targetRef, { ...clean, ...(memo.exists() ? { registrationDraftId: draftId } : {}), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    if (memo.exists()) tx.update(ref(draftId), { registered: true, updatedBy: uid, updatedAt: serverTimestamp() });
   });
   return targetRef;
  },
  async load(id: string) {
   await currentStaff(); const snapshot = await getDoc(ref(id));
   return snapshot.exists() ? registrationCanvasMemo(snapshot.data() as RegistrationMemo) : null;
  },
  subscribe(id: string, receive: (memo: HandwritingMemo | null) => void, fail: (error: unknown) => void) {
   return onSnapshot(ref(id), { includeMetadataChanges: true }, snapshot => {
    if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
    receive(snapshot.exists() ? registrationCanvasMemo(snapshot.data() as RegistrationMemo) : null);
   }, fail);
  },
  subscribePending(receive: (memos: RegistrationMemo[]) => void, fail: (error: unknown) => void) {
   return onSnapshot(collection(database, REGISTRATION_HANDWRITING_COLLECTION), { includeMetadataChanges: true }, snapshot => {
    if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
    receive(snapshot.docs.map(item => item.data() as RegistrationMemo));
   }, fail);
  },
 };
}
export const registrationHandwritingApi = createRegistrationHandwritingApi(db);
