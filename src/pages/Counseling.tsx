import { useState, useRef } from "react";
import { useCollection } from "@/hooks/useFirestore";
import { type ServiceUser, type Worker, type CounselingRecord, TERMINATION_REASONS } from "@/types";
import dongbaekLogo from "@/assets/dongbaek-logo.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";

const Counseling = () => {
  const { data: records, add: addRecord } = useCollection<CounselingRecord>("counseling");
  const { data: users } = useCollection<ServiceUser>("users");
  const { data: workers } = useCollection<Worker>("workers");
  const [form, setForm] = useState({ targetType: "이용자" as "이용자" | "활동지원사", targetId: "", targetName: "", counselorName: "", date: new Date().toISOString().slice(0, 10), content: "", category: "일반상담" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [terminationOpen, setTerminationOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterTarget, setFilterTarget] = useState<string>("all");

  // Termination form
  const [termForm, setTermForm] = useState({
    userId: "", date: new Date().toISOString().slice(0, 10),
    reasons: [] as string[], reasonDetail: "",
    approverDandang: "", approverCenterJang: "",
  });
  const printRef = useRef<HTMLDivElement>(null);

  const targets = form.targetType === "이용자" ? users : workers;

  const handleSaveRecord = async () => {
    if (!form.targetId || !form.content) {
      toast({ title: "대상자와 상담내용을 입력해주세요", variant: "destructive" });
      return;
    }
    await addRecord(form as any);
    toast({ title: "상담기록 저장 완료" });
    setForm((f) => ({ ...f, targetId: "", targetName: "", content: "" }));
    setDialogOpen(false);
  };

  const handleSelectTarget = (id: string) => {
    const target = targets.find((t) => t.id === id);
    setForm((f) => ({ ...f, targetId: id, targetName: target?.name || "" }));
  };

  const handleTerminationSelectUser = (id: string) => {
    setTermForm((f) => ({ ...f, userId: id }));
  };

  const toggleReason = (reason: string) => {
    setTermForm((f) => ({
      ...f,
      reasons: f.reasons.includes(reason) ? f.reasons.filter((r) => r !== reason) : [...f.reasons, reason],
    }));
  };

  const handlePrint = () => {
    if (printRef.current) {
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(`
          <html><head><title>종결승인서</title>
          <style>
            body { font-family: 'Malgun Gothic', sans-serif; padding: 40px; }
            table { border-collapse: collapse; width: 100%; }
            td, th { border: 1px solid #333; padding: 8px; }
            .logo { max-height: 60px; }
            @media print { body { padding: 20px; } }
          </style></head><body>${printRef.current.innerHTML}</body></html>
        `);
        printWindow.document.close();
        printWindow.print();
      }
    }
  };

  const selectedTermUser = users.find((u) => u.id === termForm.userId);
  const sameNameUsers = termForm.userId ? users.filter((u) => u.name === selectedTermUser?.name) : [];

  const filtered = records.filter((r) => {
    const matchSearch = !search || r.targetName.includes(search) || r.content.includes(search);
    const matchTarget = filterTarget === "all" || r.targetType === filterTarget;
    return matchSearch && matchTarget;
  }).sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-header mb-0">상담기록</h1>
        <div className="flex gap-2">
          <Dialog open={terminationOpen} onOpenChange={setTerminationOpen}>
            <DialogTrigger asChild><Button variant="outline">📄 종결승인서</Button></DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>종결승인서 작성</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>종결자 (이용자 선택)</Label>
                    <Select value={termForm.userId} onValueChange={handleTerminationSelectUser}>
                      <SelectTrigger><SelectValue placeholder="이용자 선택" /></SelectTrigger>
                      <SelectContent>
                        {users.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.name} ({u.gender}, {u.phone}, {u.disabilityType})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {sameNameUsers.length > 1 && <p className="text-xs text-destructive mt-1">⚠ 동명이인 {sameNameUsers.length}명 - 연락처로 구분해주세요</p>}
                  </div>
                  <div><Label>종결일시</Label><Input type="date" value={termForm.date} onChange={(e) => setTermForm((f) => ({ ...f, date: e.target.value }))} /></div>
                </div>
                <div>
                  <Label>종결 사유 (복수 선택 가능)</Label>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {TERMINATION_REASONS.map((r) => (
                      <label key={r} className="flex items-center gap-2 text-sm">
                        <Checkbox checked={termForm.reasons.includes(r)} onCheckedChange={() => toggleReason(r)} />{r}
                      </label>
                    ))}
                  </div>
                </div>
                <div><Label>종결 사유 상세</Label><Textarea value={termForm.reasonDetail} onChange={(e) => setTermForm((f) => ({ ...f, reasonDetail: e.target.value }))} placeholder="상세 사유를 입력하세요..." /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>담당 결재자</Label><Input value={termForm.approverDandang} onChange={(e) => setTermForm((f) => ({ ...f, approverDandang: e.target.value }))} /></div>
                  <div><Label>센터장 결재자</Label><Input value={termForm.approverCenterJang} onChange={(e) => setTermForm((f) => ({ ...f, approverCenterJang: e.target.value }))} /></div>
                </div>

                {/* Print Preview */}
                <div ref={printRef} className="border p-6 bg-card text-sm">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "20px" }}>
                    <h2 style={{ fontSize: "24px", fontWeight: "bold", textAlign: "center", flex: 1 }}>종 결 승 인 서</h2>
                    <table style={{ width: "auto", borderCollapse: "collapse" }}>
                      <tr>
                        <td style={{ border: "1px solid #333", padding: "4px 12px", textAlign: "center", fontSize: "12px" }}>담당</td>
                        <td style={{ border: "1px solid #333", padding: "4px 12px", textAlign: "center", fontSize: "12px" }}>센터장</td>
                      </tr>
                      <tr>
                        <td style={{ border: "1px solid #333", padding: "8px 12px", textAlign: "center", minHeight: "40px" }}>{termForm.approverDandang}</td>
                        <td style={{ border: "1px solid #333", padding: "8px 12px", textAlign: "center", minHeight: "40px" }}>{termForm.approverCenterJang}</td>
                      </tr>
                    </table>
                  </div>

                  <p style={{ marginBottom: "20px", lineHeight: "1.8" }}>
                    부천의료복지사회적협동조합 장애인활동지원센터에서 복지서비스를 제공받았던 수혜자를 이래와 같은 사유로 종결하고자 합니다. 검토 후 재가바랍니다.
                  </p>

                  <p style={{ marginBottom: "10px" }}>○ 사업명 : ☑ 장애인활동지원사업</p>
                  <p style={{ marginBottom: "10px" }}>
                    ○ 종결자 : {selectedTermUser?.name || "___"} {selectedTermUser ? `(${selectedTermUser.gender}, ${selectedTermUser.phone})` : ""}
                    <br />&nbsp;&nbsp;&nbsp;{selectedTermUser?.address || ""}
                  </p>
                  <p style={{ marginBottom: "10px" }}>○ 종결 일시 및 사유 : {termForm.date}</p>
                  <div style={{ marginLeft: "20px", marginBottom: "10px" }}>
                    {TERMINATION_REASONS.map((r) => (
                      <span key={r} style={{ marginRight: "12px" }}>
                        {termForm.reasons.includes(r) ? "☑" : "☐"} {r}
                      </span>
                    ))}
                  </div>
                  {termForm.reasonDetail && <p style={{ marginLeft: "20px", marginBottom: "20px" }}>상세: {termForm.reasonDetail}</p>}

                  <p style={{ textAlign: "center", marginTop: "40px", marginBottom: "40px" }}>
                    결재일 {termForm.date.replace(/-/g, ". ")}.
                  </p>

                  <div style={{ textAlign: "center", marginTop: "30px" }}>
                    <img src={dongbaekLogo} alt="동백" style={{ height: "50px", margin: "0 auto" }} />
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setTerminationOpen(false)}>닫기</Button>
                  <Button onClick={handlePrint}>🖨 인쇄</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild><Button>+ 상담기록 작성</Button></DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>상담기록 작성</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>대상 유형</Label>
                    <Select value={form.targetType} onValueChange={(v: any) => setForm((f) => ({ ...f, targetType: v, targetId: "", targetName: "" }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="이용자">이용자</SelectItem>
                        <SelectItem value="활동지원사">활동지원사</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>대상자</Label>
                    <Select value={form.targetId} onValueChange={handleSelectTarget}>
                      <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                      <SelectContent>
                        {targets.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name} ({t.gender}, {t.phone})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {form.targetId && form.targetType === "이용자" && (() => {
                  const u = users.find((u) => u.id === form.targetId);
                  if (!u) return null;
                  return (
                    <div className="bg-muted rounded p-3 text-sm grid grid-cols-2 gap-1">
                      <span>이름: {u.name}</span><span>성별: {u.gender}</span>
                      <span>연락처: {u.phone}</span><span>바우처: {u.voucherTier}구간</span>
                      <span>장애유형: {u.disabilityType}</span><span>주소: {u.address}</span>
                      <span>서비스시작일: {u.serviceStartDate}</span>
                      <span>보호자: {u.guardianName} ({u.guardianRelation}) {u.guardianPhone}</span>
                    </div>
                  );
                })()}
                <div><Label>상담일</Label><Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} /></div>
                <div><Label>상담자</Label><Input value={form.counselorName} onChange={(e) => setForm((f) => ({ ...f, counselorName: e.target.value }))} /></div>
                <div><Label>분류</Label>
                  <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["일반상담", "민원", "매칭관련", "서비스변경", "계약관련", "기타"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>상담 내용</Label><Textarea rows={5} value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} placeholder="상담 내용을 입력하세요..." /></div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
                  <Button onClick={handleSaveRecord}>저장</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        <Input className="max-w-xs" placeholder="이름 또는 내용 검색..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={filterTarget} onValueChange={setFilterTarget}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="이용자">이용자</SelectItem>
            <SelectItem value="활동지원사">활동지원사</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-muted-foreground">상담기록이 없습니다.</CardContent></Card>
        ) : (
          filtered.map((r) => (
            <Card key={r.id} className="card-hover">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={r.targetType === "이용자" ? "default" : "secondary"}>{r.targetType}</Badge>
                    <span className="font-semibold">{r.targetName}</span>
                    <Badge variant="outline">{r.category}</Badge>
                  </div>
                  <span className="text-sm text-muted-foreground">{r.date} · {r.counselorName}</span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{r.content}</p>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default Counseling;
