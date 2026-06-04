import { useMemo, useState } from "react";
import { useCollection } from "@/hooks/useFirestore";
import { type ServiceUser, type Worker, type HandoverDocument } from "@/types";
import { HANDOVERS_COLLECTION, USERS_COLLECTION, WORKERS_COLLECTION } from "@/lib/collectionNames";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Timestamp } from "@/lib/firebase";
import { syncUserToWorkers } from "@/lib/assignments";

function safeMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

function labelWithLast4(name: string, phone: string): string {
  const last4 = normalizePhone(phone).slice(-4);
  return last4 ? `${name}(${last4})` : name;
}

export default function Handovers() {
  const { data: users, update: updateUser } = useCollection<ServiceUser>(USERS_COLLECTION);
  const { data: workers, update: updateWorker } = useCollection<Worker>(WORKERS_COLLECTION);
  const { data: docs, add: addHandover, loading } = useCollection<HandoverDocument>(HANDOVERS_COLLECTION);

  const [userId, setUserId] = useState<string>("");
  const [nextWorkerId, setNextWorkerId] = useState<string>("");
  const [handoverPersonName, setHandoverPersonName] = useState<string>("");
  const [handoverDate, setHandoverDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [takeoverPersonName, setTakeoverPersonName] = useState<string>("");
  const [takeoverDate, setTakeoverDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const selectedUser = useMemo(() => users.find((u) => u.id === userId), [users, userId]);
  const nextWorker = useMemo(() => workers.find((w) => w.id === nextWorkerId), [workers, nextWorkerId]);

  const prevWorkerId = selectedUser?.assignedHelperIds?.[0] || "";
  const prevWorker = useMemo(
    () => (prevWorkerId ? workers.find((w) => w.id === prevWorkerId) : undefined),
    [workers, prevWorkerId]
  );

  // Auto-fill handoverPersonName when user is selected
  useMemo(() => {
    if (prevWorker && !handoverPersonName) {
      setHandoverPersonName(prevWorker.name);
    }
  }, [prevWorker, handoverPersonName]);

  const handleSave = async () => {
    try {
      // 필수 값 검증
      if (!selectedUser?.id) {
        alert("❌ 저장 불가: 이용자(수급자)를 선택해주세요.");
        return;
      }
      if (!handoverPersonName.trim() || !handoverDate) {
        alert("❌ 저장 불가: 인계자 성명/인계일은 필수입니다.");
        return;
      }
      if (!takeoverPersonName.trim() || !takeoverDate) {
        alert("❌ 저장 불가: 인수자 성명/인수일은 필수입니다.");
        return;
      }
      if (!reason.trim()) {
        alert("❌ 저장 불가: 인계 사유는 필수입니다.");
        return;
      }
      if (!nextWorker?.id) {
        alert("❌ 저장 불가: 후임 활동지원사를 선택해주세요.");
        return;
      }

      // 1) handovers 문서 저장
      const payload: Omit<HandoverDocument, "id"> = {
        userId: selectedUser.id!,
        userName: selectedUser.name,
        userPhone: selectedUser.phone,
        userAddress: selectedUser.address,
        voucherTier: selectedUser.voucherTier,
        disabilityType: selectedUser.disabilityType,
        reason: reason.trim(),
        handoverPersonName: handoverPersonName.trim(),
        handoverDate,
        takeoverPersonName: takeoverPersonName.trim(),
        takeoverDate,
        prevWorkerId: prevWorker?.id,
        prevWorkerName: prevWorker?.name,
        prevWorkerPhone: prevWorker?.phone,
        nextWorkerId: nextWorker.id!,
        nextWorkerName: nextWorker.name,
        nextWorkerPhone: nextWorker.phone,
        notes: notes.trim(),
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };
      await addHandover(payload as any);

      // 2) users 담당 활동지원사 자동 변경 (후임자로 교체)
      const prevHelperIds = selectedUser.assignedHelperIds ?? [];
      const newHelperIds = [nextWorker.id!];
      const updatedUser: Partial<ServiceUser> = {
        assignedHelperIds: newHelperIds,
        assigned_workers: newHelperIds,
        assignedHelperNames: [nextWorker.name],
        assignedHelperPhones: [nextWorker.phone],
      };

      await updateUser(selectedUser.id!, updatedUser as any);

      // 3) workers 쪽 역참조(N:M) 자동 동기화 (전임자 제거 + 후임자 추가)
      await syncUserToWorkers(
        selectedUser.id!,
        { name: selectedUser.name, phone: selectedUser.phone, assignedHelperIds: newHelperIds },
        workers as any,
        prevHelperIds,
        updateWorker as any
      );

      toast({
        title: "업무 인계·인수서 저장 완료",
        description: `담당 활동지원사가 ${prevWorker?.name || "미배정"} → ${nextWorker.name}로 변경되었습니다.`,
      });

      // 폼 일부 초기화
      setReason("");
      setNotes("");
    } catch (e) {
      console.error("Handover save failed:", e);
      alert(`❌ 인계·인수서 저장 실패\n사유: ${safeMsg(e)}\n\n${e instanceof Error ? e.stack ?? "" : ""}`);
    }
  };

  const sortedDocs = useMemo(() => {
    return [...docs].sort((a, b) => (b.handoverDate || "").localeCompare(a.handoverDate || ""));
  }, [docs]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-header mb-0">업무 인계·인수서</h1>
        <Badge variant="secondary">{sortedDocs.length}건</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">인계·인수서 작성</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>이용자(수급자) 선택 *</Label>
              <Select value={userId || "none"} onValueChange={(v) => setUserId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="이용자 선택" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">선택 안함</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id!}>
                      {u.name} ({u.phone})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>후임(인수자) 활동지원사 선택 *</Label>
              <Select value={nextWorkerId || "none"} onValueChange={(v) => setNextWorkerId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="활동지원사 선택" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">선택 안함</SelectItem>
                  {workers.map((w) => (
                    <SelectItem key={w.id} value={w.id!}>
                      {labelWithLast4(w.name, w.phone)} · {w.contractStatus}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedUser && (
            <div className="border rounded-md p-3 bg-muted/30 text-sm space-y-1">
              <div className="font-semibold">수급자 인적사항(자동 불러오기)</div>
              <div>성명: {selectedUser.name}</div>
              <div>연락처: {selectedUser.phone}</div>
              <div className="truncate">주소: {selectedUser.address || "—"}</div>
              <div>바우처구간: {selectedUser.voucherTier}구간</div>
              <div>장애유형: {selectedUser.disabilityType || "—"}</div>
              <div className="pt-1 text-xs text-muted-foreground">
                현재 담당(전임): {prevWorker ? `${labelWithLast4(prevWorker.name, prevWorker.phone)}` : "미배정"}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>인계자(전임자) 성명 *</Label>
              <Input value={handoverPersonName} onChange={(e) => setHandoverPersonName(e.target.value)} placeholder="예: 홍길동" />
            </div>
            <div>
              <Label>인계일 *</Label>
              <Input type="date" value={handoverDate} onChange={(e) => setHandoverDate(e.target.value)} />
            </div>
            <div>
              <Label>인수자(후임자) 성명 *</Label>
              <Input value={takeoverPersonName} onChange={(e) => setTakeoverPersonName(e.target.value)} placeholder="예: 김철수" />
            </div>
            <div>
              <Label>인수일 *</Label>
              <Input type="date" value={takeoverDate} onChange={(e) => setTakeoverDate(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>인계 사유 *</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 담당 활동지원사 변경, 개인사정, 기관변경 등" />
          </div>

          <div>
            <Label>비고</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={loading}>저장</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">작성 내역</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {sortedDocs.length === 0 ? (
            <p className="text-sm text-muted-foreground">작성된 인계·인수서가 없습니다.</p>
          ) : (
            <div className="divide-y border rounded-md">
              {sortedDocs.map((d) => (
                <div key={d.id} className="p-3 text-sm flex flex-col gap-1">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-1">
                    <div className="font-medium">{d.userName} ({d.userPhone})</div>
                    <div className="text-muted-foreground">{d.handoverDate} · {d.reason}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    담당 변경: {d.prevWorkerName ? labelWithLast4(d.prevWorkerName, d.prevWorkerPhone || "") : "미배정"} → {d.nextWorkerName ? labelWithLast4(d.nextWorkerName, d.nextWorkerPhone || "") : "—"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
