import { useMemo, useState } from "react";
import { useCollection } from "@/hooks/useFirestore";
import { type ServiceUser, type TerminationDocument, TERMINATION_REASONS } from "@/types";
import { USERS_COLLECTION, TERMINATIONS_COLLECTION } from "@/lib/collectionNames";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Timestamp } from "@/lib/firebase";

function safeMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export default function Terminations() {
  const { data: users, update: updateUser } = useCollection<ServiceUser>(USERS_COLLECTION);
  const { data: docs, add: addDoc, loading } = useCollection<TerminationDocument>(TERMINATIONS_COLLECTION);

  const [form, setForm] = useState<Omit<TerminationDocument, "id" | "createdAt" | "updatedAt">>({
    userId: "",
    userName: "",
    userPhone: "",
    date: new Date().toISOString().slice(0, 10),
    reasons: [],
    reasonDetail: "",
    handoverNote: "",
    approverDandang: "",
    approverCenterJang: "",
  });

  const selectedUser = useMemo(
    () => users.find((u) => u.id === form.userId),
    [users, form.userId]
  );

  const handleSelectUser = (userId: string) => {
    const u = users.find((x) => x.id === userId);
    setForm((f) => ({
      ...f,
      userId,
      userName: u?.name || "",
      userPhone: u?.phone || "",
    }));
  };

  const toggleReason = (reason: string) => {
    setForm((f) => ({
      ...f,
      reasons: f.reasons.includes(reason) ? f.reasons.filter((r) => r !== reason) : [...f.reasons, reason],
    }));
  };

  const handleSave = async () => {
    try {
      if (!form.userId) {
        alert("❌ 저장 불가: 이용자를 선택해주세요.");
        return;
      }
      if (!form.date) {
        alert("❌ 저장 불가: 종결일자를 입력해주세요.");
        return;
      }
      if (form.reasons.length === 0 && !form.reasonDetail.trim()) {
        alert("❌ 저장 불가: 종결 사유를 1개 이상 선택하거나 상세 사유를 입력해주세요.");
        return;
      }

      const terminationReasonText = [
        ...form.reasons,
        form.reasonDetail.trim() ? `상세:${form.reasonDetail.trim()}` : "",
      ].filter(Boolean).join(" / ");

      // 1) terminations 문서 생성
      const payload: Omit<TerminationDocument, "id"> = {
        ...form,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };
      await addDoc(payload as any);

      // 2) 해당 이용자 상태를 즉시 "계약해지"로 업데이트(서류 존재 여부와 함께 DB에도 반영)
      await updateUser(form.userId, {
        contractStatus: "계약해지",
        terminationReason: terminationReasonText,
        txtUMemostop: terminationReasonText,
      } as any);

      toast({ title: "종결확인서 저장 완료", description: "이용자 상태가 '계약해지'로 자동 전환되었습니다." });
      setForm((f) => ({
        ...f,
        reasons: [],
        reasonDetail: "",
        handoverNote: "",
      }));
    } catch (e) {
      console.error("Termination save failed:", e);
      alert(`❌ 종결확인서 저장 실패\n사유: ${safeMsg(e)}\n\n${e instanceof Error ? e.stack ?? "" : ""}`);
    }
  };

  const sortedDocs = useMemo(() => {
    return [...docs].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [docs]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-header mb-0">종결확인서</h1>
        <Badge variant="secondary">{sortedDocs.length}건</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">종결확인서 작성</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>이용자(수급자) 선택 *</Label>
              <Select value={form.userId || "none"} onValueChange={(v) => handleSelectUser(v === "none" ? "" : v)}>
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
              {selectedUser && (
                <p className="text-xs text-muted-foreground mt-1">
                  주소: {selectedUser.address || "—"} / 바우처: {selectedUser.voucherTier}구간 / 장애유형: {selectedUser.disabilityType || "—"}
                </p>
              )}
            </div>
            <div>
              <Label>종결일자 *</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            </div>
          </div>

          <div>
            <Label>종결 사유 (복수 선택 가능) *</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
              {TERMINATION_REASONS.map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={form.reasons.includes(r)} onCheckedChange={() => toggleReason(r)} />{r}
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label>종결 사유 상세</Label>
            <Textarea value={form.reasonDetail} onChange={(e) => setForm((f) => ({ ...f, reasonDetail: e.target.value }))} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>담당 결재자</Label>
              <Input value={form.approverDandang || ""} onChange={(e) => setForm((f) => ({ ...f, approverDandang: e.target.value }))} />
            </div>
            <div>
              <Label>센터장 결재자</Label>
              <Input value={form.approverCenterJang || ""} onChange={(e) => setForm((f) => ({ ...f, approverCenterJang: e.target.value }))} />
            </div>
          </div>

          <div>
            <Label>인계 메모(선택)</Label>
            <Textarea value={form.handoverNote || ""} onChange={(e) => setForm((f) => ({ ...f, handoverNote: e.target.value }))} />
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
            <p className="text-sm text-muted-foreground">작성된 종결확인서가 없습니다.</p>
          ) : (
            <div className="divide-y border rounded-md">
              {sortedDocs.map((d) => (
                <div key={d.id} className="p-3 text-sm flex flex-col md:flex-row md:items-center md:justify-between gap-1">
                  <div className="font-medium">{d.userName} ({d.userPhone})</div>
                  <div className="text-muted-foreground">{d.date} · {(d.reasons || []).join(", ") || "—"}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

