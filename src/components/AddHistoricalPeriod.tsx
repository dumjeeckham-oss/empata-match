import { useState } from "react";
import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { USERS_COLLECTION, WORKERS_COLLECTION } from "@/lib/collectionNames";
import { normalizeServiceUser, normalizeWorker } from "@/lib/assignments";
import { appendHistoricalPeriod } from "@/lib/historicalPeriods";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ContractHistoryEntry, EmploymentHistoryEntry, ServiceUser, Worker } from "@/types";

function todayLocal() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function AddHistoricalPeriod({ id, kind, onSaved }: { id: string; kind: "user" | "worker"; onSaved: (patch: Partial<ServiceUser> | Partial<Worker>) => void }) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const patch = await runTransaction(db, async (tx) => {
        const ref = doc(db, kind === "user" ? USERS_COLLECTION : WORKERS_COLLECTION, id);
        const snapshot = await tx.get(ref);
        if (!snapshot.exists()) throw new Error("대상 정보를 찾을 수 없습니다.");
        const raw = snapshot.data();
        if (kind === "user") {
          const user = { ...raw, ...normalizeServiceUser(raw) } as ServiceUser;
          if (!user.contractHistory?.length && !user.serviceStartDate) throw new Error("현재 계약 시작일을 먼저 확인해주세요.");
          const existing: ContractHistoryEntry[] = user.contractHistory?.length ? user.contractHistory : [{ id: `contract-${user.serviceStartDate}`, startDate: user.serviceStartDate, endDate: user.contractStatus === "계약해지" ? user.resignationDate || null : null, status: user.contractStatus === "계약해지" ? "계약해지" : "서비스중", reason: user.terminationReason || user.txtUMemostop || "" }];
          if (user.contractStatus === "계약해지" && !user.resignationDate && !user.contractHistory?.length) throw new Error("현재 계약의 종료일을 먼저 확인해주세요.");
          const next = appendHistoricalPeriod(existing, { id: `contract-${crypto.randomUUID()}`, startDate: start, endDate: end, status: "계약해지", reason }, todayLocal());
          tx.update(ref, { contractHistory: next, updatedAt: serverTimestamp() });
          return { contractHistory: next };
        }
        const worker = { ...raw, ...normalizeWorker(raw) } as Worker;
        if (!worker.employmentHistory?.length && !worker.serviceStartDate) throw new Error("현재 근무 시작일을 먼저 확인해주세요.");
        const retirement = worker.contractStatus === "퇴사" ? worker.retirementDate || worker.resignationDate : "";
        if (worker.contractStatus === "퇴사" && !retirement && !worker.employmentHistory?.length) throw new Error("현재 근무의 퇴사일을 먼저 확인해주세요.");
        const existing: EmploymentHistoryEntry[] = worker.employmentHistory?.length ? worker.employmentHistory : [{ id: `employment-${worker.serviceStartDate}`, startDate: worker.serviceStartDate, endDate: retirement || null, status: retirement ? "퇴사" : "재직중" }];
        const next = appendHistoricalPeriod(existing, { id: `employment-${crypto.randomUUID()}`, startDate: start, endDate: end, status: "퇴사", reason }, todayLocal());
        tx.update(ref, { employmentHistory: next, updatedAt: serverTimestamp() });
        return { employmentHistory: next };
      });
      onSaved(patch);
      setOpen(false); setStart(""); setEnd(""); setReason("");
      toast({ title: "과거 이력을 추가했습니다", description: "현재 상태와 담당 배정은 유지됩니다." });
    } catch (error) {
      toast({ title: "과거 이력을 추가하지 못했습니다", description: error instanceof Error ? error.message : "다시 시도해주세요.", variant: "destructive" });
    } finally { setSaving(false); }
  };
  if (!open) return <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>＋ 과거 {kind === "user" ? "계약" : "근무"} 이력 추가</Button>;
  return <div className="space-y-3 rounded-md border p-3">
    <p className="text-sm text-muted-foreground">이미 종료된 기간을 추가합니다. 현재 상태와 배정은 변경하지 않습니다.</p>
    <div className="flex flex-wrap gap-3"><div><Label>시작일</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div><div><Label>종료일</Label><Input type="date" min={start || undefined} value={end} onChange={(e) => setEnd(e.target.value)} /></div></div>
    <div><Label>종료 사유 (선택)</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
    <div className="flex gap-2"><Button type="button" size="sm" disabled={saving} onClick={() => void save()}>과거 이력 저장</Button><Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => setOpen(false)}>취소</Button></div>
  </div>;
}
