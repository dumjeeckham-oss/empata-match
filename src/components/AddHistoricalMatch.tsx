import { useState } from "react";
import { collection, doc, getDocs, query, runTransaction, serverTimestamp, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { USERS_COLLECTION, WORKERS_COLLECTION, MATCHING_HISTORY_COLLECTION } from "@/lib/collectionNames";
import { normalizeServiceUser, normalizeWorker } from "@/lib/assignments";
import { appendHistoricalMatch, appendHistoricalPeriod } from "@/lib/historicalPeriods";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DocumentMatchingHistoryEntry, ServiceUser, Worker } from "@/types";

function todayLocal() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }

export function AddHistoricalMatch({ userId: fixedUser, workerId: fixedWorker, users, workers, onSaved }: { userId?: string; workerId?: string; users: (ServiceUser & { id: string })[]; workers: (Worker & { id: string })[]; onSaved?: (id: string, history: DocumentMatchingHistoryEntry[]) => void }) {
  const [open, setOpen] = useState(false);
  const [otherId, setOtherId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const userId = fixedUser || otherId;
  const workerId = fixedWorker || otherId;
  const save = async () => {
    if (saving || !userId || !workerId) return;
    setSaving(true);
    try {
      appendHistoricalPeriod([], { startDate: start, endDate: end }, todayLocal());
      const logs = await getDocs(query(collection(db, MATCHING_HISTORY_COLLECTION), where("userId", "==", userId)));
      if (logs.docs.some((log) => { const data = log.data(); return data.workerId === workerId && data.date === start && (data.type === "매칭" || data.type === "해제"); })) throw new Error("같은 시작일의 매칭 기록이 이미 있습니다. 기존 이력을 확인해주세요.");
      const logRef = doc(db, MATCHING_HISTORY_COLLECTION, `history-${userId}-${workerId}-${start}`);
      const history = await runTransaction(db, async (tx) => {
        const userRef = doc(db, USERS_COLLECTION, userId);
        const workerRef = doc(db, WORKERS_COLLECTION, workerId);
        const [userSnap, workerSnap, existingLog] = await Promise.all([tx.get(userRef), tx.get(workerRef), tx.get(logRef)]);
        if (!userSnap.exists() || !workerSnap.exists()) throw new Error("이용자 또는 활동지원사 정보를 찾을 수 없습니다.");
        if (existingLog.exists()) throw new Error("같은 시작일의 과거 매칭이 이미 등록되어 있습니다.");
        const user = { ...userSnap.data(), ...normalizeServiceUser(userSnap.data()) } as ServiceUser;
        const worker = { ...workerSnap.data(), ...normalizeWorker(workerSnap.data()) } as Worker;
        const entries = user.matchingHistory || [];
        const entry: DocumentMatchingHistoryEntry = { id: logRef.id, workerId, workerName: worker.name || "", workerPhone: worker.phone || "", serviceStartDate: start, serviceEndDate: end, reason: "종료", reasonDetail: notes, updatedAt: new Date().toISOString() };
        const currentlyAssigned = [...(user.assignedHelperIds || []), ...(user.assigned_workers || [])].includes(workerId) || [...(worker.assignedUserIds || []), ...(worker.assigned_users || [])].includes(userId);
        const next = appendHistoricalMatch(entries, entry, currentlyAssigned, todayLocal());
        tx.update(userRef, { matchingHistory: next, updatedAt: serverTimestamp() });
        tx.set(logRef, { type: "매칭", userId, userName: user.name || "", userPhone: user.phone || "", workerId, workerName: worker.name || "", workerPhone: worker.phone || "", date: start, endDate: end, status: "매칭 완료", reason: "종료", reasonDetail: notes, notes, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        return next;
      });
      onSaved?.(userId, history);
      setOpen(false); setStart(""); setEnd(""); setNotes(""); setOtherId("");
      toast({ title: "과거 매칭 이력을 추가했습니다", description: "현재 배정과 서비스 시간은 유지됩니다." });
    } catch (error) {
      toast({ title: "과거 매칭을 추가하지 못했습니다", description: error instanceof Error ? error.message : "다시 시도해주세요.", variant: "destructive" });
    } finally { setSaving(false); }
  };
  if (!open) return <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>＋ 과거 매칭 이력 추가</Button>;
  return <div className="space-y-3 rounded-md border p-3">
    <p className="text-xs text-muted-foreground">종료된 과거 기간을 추가하며 현재 담당 배정과 시간표는 바뀌지 않습니다.</p>
    <div><Label>{fixedUser ? "활동지원사" : "이용자"}</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={otherId} onChange={(e) => setOtherId(e.target.value)}><option value="">선택해주세요</option>{(fixedUser ? workers : users).map((item) => <option key={item.id} value={item.id}>{item.name} {item.phone ? `(${item.phone})` : ""}</option>)}</select></div>
    <div className="flex flex-wrap gap-3"><div><Label>시작일</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div><div><Label>종료일</Label><Input type="date" min={start || undefined} value={end} onChange={(e) => setEnd(e.target.value)} /></div></div>
    <div><Label>비고 (선택)</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
    <div className="flex gap-2"><Button type="button" size="sm" disabled={saving || !otherId} onClick={() => void save()}>과거 매칭 저장</Button><Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => setOpen(false)}>취소</Button></div>
  </div>;
}
