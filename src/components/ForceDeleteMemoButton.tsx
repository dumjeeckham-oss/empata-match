import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { handwritingApi } from "@/lib/counselingHandwritingApi";
import { getHandwritingDraft, type HandwritingMemo } from "@/lib/counselingHandwriting";

export function ForceDeleteMemoButton({ memo, uid, onDeleted, service = handwritingApi }: { memo: HandwritingMemo; uid: string; onDeleted: () => void; service?: Pick<typeof handwritingApi, "confirmForceDelete" | "forceDeleteConfirmed"> }) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const remove = async () => {
    if (lock.current) return;
    lock.current = true;
    try {
      if (!window.confirm("이 손글씨는 아직 시스템에서 전사 완료로 확인되지 않았습니다. 필요한 내용을 정식 기록에 모두 옮겨 적었는지 확인해 주세요.")) return;
      if (!window.confirm("임시 손글씨를 강제로 삭제하시겠습니까? 삭제 후 복구할 수 없습니다. 정식 기록에 필요한 내용을 모두 옮겨 적은 경우에만 삭제해 주세요.")) return;
      setBusy(true); setError("");
      // This device's unsaved draft must be reviewed before deleting its server memo.
      const local = getHandwritingDraft(uid, memo.id);
      if (local?.generation || local?.recovery) throw new Error("local draft");
      await service.confirmForceDelete(memo);
      await service.forceDeleteConfirmed(memo);
      onDeleted();
    } catch {
      setError("삭제하지 못했습니다. 손글씨가 변경되었거나 권한 상태가 달라졌을 수 있습니다. 다시 확인해 주세요.");
    } finally { lock.current = false; setBusy(false); }
  };
  return <div>
    <Button variant="outline" disabled={busy || memo.revision < 1} onClick={() => void remove()}>{busy ? "삭제 중…" : "옮겨 적은 후 삭제"}</Button>
    {error && <p role="alert">{error}</p>}
  </div>;
}
