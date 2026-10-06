import { doc, runTransaction, serverTimestamp, type Firestore } from "firebase/firestore";
import { clearHandwritingDraft, getHandwritingDraft, type HandwritingMemo } from "@/lib/counselingHandwriting";

export function createManualForceDeleteApi(database: Firestore, collectionName: string, currentStaff: () => Promise<string>) {
 const ref = (id: string) => doc(database, collectionName, id);
 return {
    async confirmForceDelete(memo: HandwritingMemo): Promise<void> {
      const uid = await currentStaff();
      await runTransaction(database, async transaction => {
        const snapshot = await transaction.get(ref(memo.id));
        if (!snapshot.exists() || snapshot.data().revision !== memo.revision) throw new Error("손글씨가 변경되었거나 삭제되었습니다. 다시 확인해 주세요.");
        transaction.update(ref(memo.id), { forceDeleteConfirmedBy: uid, forceDeleteConfirmedAt: serverTimestamp(), forceDeleteConfirmedRevision: memo.revision, updatedBy: uid, updatedAt: serverTimestamp() });
      });
    },
    async forceDeleteConfirmed(memo: HandwritingMemo): Promise<void> {
      const uid = await currentStaff();
      await runTransaction(database, async transaction => {
        const snapshot = await transaction.get(ref(memo.id));
        if (!snapshot.exists()) throw new Error("이미 삭제된 임시 손글씨입니다.");
        const current = snapshot.data();
        if (current.revision !== memo.revision || current.forceDeleteConfirmedRevision !== current.revision || current.forceDeleteConfirmedBy !== uid || !current.forceDeleteConfirmedAt) throw new Error("손글씨가 변경되었거나 권한 상태가 달라졌습니다. 다시 확인해 주세요.");
        transaction.delete(ref(memo.id));
      });
      const local = getHandwritingDraft(uid, memo.id);
      if (!local?.generation && !local?.recovery) clearHandwritingDraft(uid, memo.id);
    },
 };
}
