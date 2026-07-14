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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Printer } from "lucide-react";
import { USERS_COLLECTION, WORKERS_COLLECTION } from "@/lib/collectionNames";

const Counseling = () => {
  const { data: records, add: addRecord } = useCollection<CounselingRecord>("counseling");
  const { data: users } = useCollection<ServiceUser>(USERS_COLLECTION);
  const { data: workers } = useCollection<Worker>(WORKERS_COLLECTION);
  const [form, setForm] = useState({ targetType: "이용자" as "이용자" | "활동지원사", targetId: "", targetName: "", counselorName: "", date: new Date().toISOString().slice(0, 10), content: "", result: "", category: "일반상담" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isTargetLocked, setIsTargetLocked] = useState(false);
  const [terminationOpen, setTerminationOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterTarget, setFilterTarget] = useState<string>("all");

  // Quick Counseling Candidate Selection States
  const [candidateTab, setCandidateTab] = useState<"이용자" | "활동지원사">("이용자");
  const [candidateSearch, setCandidateSearch] = useState("");

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
    await addRecord({ ...form } as any);
    toast({ title: "상담기록 저장 완료" });
    setForm((f) => ({ ...f, targetId: "", targetName: "", content: "", result: "" }));
    setDialogOpen(false);
  };

  const handleSelectTarget = (id: string) => {
    const target = targets.find((t) => t.id === id);
    setForm((f) => ({ ...f, targetId: id, targetName: target?.name || "" }));
  };

  const handleOpenQuickCounsel = (type: "이용자" | "활동지원사", id: string) => {
    const targetList = type === "이용자" ? users : workers;
    const target = targetList.find((t) => t.id === id);
    setForm({
      targetType: type,
      targetId: id,
      targetName: target?.name || "",
      counselorName: "",
      date: new Date().toISOString().slice(0, 10),
      content: "",
      result: "",
      category: "일반상담"
    });
    setIsTargetLocked(true);
    setDialogOpen(true);
  };

  const handleOpenNewCounsel = () => {
    setForm({
      targetType: "이용자",
      targetId: "",
      targetName: "",
      counselorName: "",
      date: new Date().toISOString().slice(0, 10),
      content: "",
      result: "",
      category: "일반상담"
    });
    setIsTargetLocked(false);
    setDialogOpen(true);
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

  const handlePrintRecord = (r: CounselingRecord) => {
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      const target = r.targetType === "이용자" ? users.find(u => u.id === r.targetId) : workers.find(w => w.id === r.targetId);
      const partnerInfo = r.targetType === "이용자" 
        ? (target as ServiceUser)?.assignedHelperNames?.map((name, i) => `${name}(${(target as ServiceUser).assignedHelperPhones?.[i] || "-"})`).join(", ")
        : (target as Worker)?.assignedUserNames?.map((name, i) => `${name}(${(target as Worker).assignedUserPhones?.[i] || "-"})`).join(", ");

      printWindow.document.write(`
        <html><head><title>상담일지 - ${r.targetName}</title>
        <style>
          body { font-family: 'Malgun Gothic', sans-serif; padding: 40px; line-height: 1.6; color: #333; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 30px; }
          .title { font-size: 24px; font-bold; }
          .info-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          .info-table th, .info-table td { border: 1px solid #333; padding: 10px; text-align: left; }
          .info-table th { background-color: #f5f5f5; width: 20%; }
          .content-box { border: 1px solid #333; padding: 20px; min-height: 200px; white-space: pre-wrap; }
          .footer { margin-top: 50px; text-align: right; }
          @media print { body { padding: 20px; } .no-print { display: none; } }
        </style></head><body>
          <div class="header">
            <div class="title">상담일지</div>
            <img src="${dongbaekLogo}" style="height: 40px;" />
          </div>
          <table class="info-table">
            <tr>
              <th>상담대상</th><td>${r.targetName} (${r.targetType})</td>
              <th>상담일자</th><td>${r.date}</td>
            </tr>
            <tr>
              <th>상담자</th><td>${r.counselorName || "-"}</td>
              <th>상담분류</th><td>${r.category}</td>
            </tr>
            <tr>
              <th>매칭관계</th><td colspan="3">${partnerInfo || "배정된 인원 없음"}</td>
            </tr>
          </table>
          <div style="font-weight: bold; margin-bottom: 10px;">상담 내용</div>
          <div class="content-box">${r.content}</div>
          <div style="font-weight: bold; margin-top: 20px; margin-bottom: 10px;">상담 결과</div>
          <div class="content-box">${r.result || ""}</div>
          <div class="footer">
            부천의료복지사회적협동조합 동백장애인활동지원센터
          </div>
        </body></html>
      `);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => { printWindow.print(); }, 500);
    }
  };

  const selectedTermUser = users.find((u) => u.id === termForm.userId);
  const sameNameUsers = termForm.userId ? users.filter((u) => u.name === selectedTermUser?.name) : [];

  const filtered = records.filter((r) => {
    const matchSearch = !search || r.targetName.includes(search) || r.content.includes(search) || r.result?.includes(search);
    const matchTarget = filterTarget === "all" || r.targetType === filterTarget;
    return matchSearch && matchTarget;
  }).sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  // Filter candidate lists based on candidateSearch
  const filteredCandidates = (candidateTab === "이용자" ? users : workers).filter((c) =>
    c.name.toLowerCase().includes(candidateSearch.toLowerCase()) ||
    (c.phone && c.phone.includes(candidateSearch))
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-header mb-0">상담기록</h1>
        <div className="flex gap-2">
          <Dialog open={terminationOpen} onOpenChange={setTerminationOpen}>
            <DialogTrigger asChild><Button variant="outline">📄 종결승인서</Button></DialogTrigger>
            <DialogContent className="max-w-3xl w-[95vw] max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>종결승인서 작성</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>종결자 (이용자 선택)</Label>
                    <Select value={termForm.userId} onValueChange={handleTerminationSelectUser}>
                      <SelectTrigger><SelectValue placeholder="이용자 선택" /></SelectTrigger>
                      <SelectContent>
                        {(users ?? []).filter((u) => !!u?.id).map((u) => (
                          <SelectItem key={u.id} value={u.id!}>
                            {u?.name || "이름없음"} ({u?.gender || "-"}, {u?.phone || "-"}, {u?.disabilityType || "-"})
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
                <div ref={printRef} className="border p-6 bg-card text-sm overflow-x-auto">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "20px" }}>
                    <h2 style={{ fontSize: "20px", fontWeight: "bold", textAlign: "center", flex: 1 }}>종 결 승 인 서</h2>
                    <table style={{ width: "auto", borderCollapse: "collapse" }}>
                      <tr>
                        <td style={{ border: "1px solid #333", padding: "4px 8px", textAlign: "center", fontSize: "11px" }}>담당</td>
                        <td style={{ border: "1px solid #333", padding: "4px 8px", textAlign: "center", fontSize: "11px" }}>센터장</td>
                      </tr>
                      <tr>
                        <td style={{ border: "1px solid #333", padding: "8px 12px", textAlign: "center", minWidth: "40px" }}>{termForm.approverDandang}</td>
                        <td style={{ border: "1px solid #333", padding: "8px 12px", textAlign: "center", minWidth: "40px" }}>{termForm.approverCenterJang}</td>
                      </tr>
                    </table>
                  </div>

                  <p style={{ marginBottom: "20px", lineHeight: "1.6" }}>
                    부천의료복지사회적협동조합 장애인활동지원센터에서 복지서비스를 제공받았던 수혜자를 아래와 같은 사유로 종결하고자 합니다. 검토 후 재가바랍니다.
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

                  <p style={{ textAlign: "center", marginTop: "30px", marginBottom: "30px" }}>
                    결재일 {termForm.date.replace(/-/g, ". ")}.
                  </p>

                  <div style={{ textAlign: "center", marginTop: "20px" }}>
                    <img src={dongbaekLogo} alt="동백" style={{ height: "40px", margin: "0 auto" }} />
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setTerminationOpen(false)}>닫기</Button>
                  <Button onClick={handlePrint}>🖨 인쇄</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Button onClick={handleOpenNewCounsel}>+ 상담기록 작성</Button>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent className="max-w-lg w-[95vw] max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>상담기록 작성</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>대상 유형</Label>
                    {isTargetLocked ? (
                      <Input value={form.targetType} disabled />
                    ) : (
                      <Select value={form.targetType} onValueChange={(v: any) => setForm((f) => ({ ...f, targetType: v, targetId: "", targetName: "" }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="이용자">이용자</SelectItem>
                          <SelectItem value="활동지원사">활동지원사</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div><Label>대상자</Label>
                    {isTargetLocked ? (
                      <Input value={form.targetName} disabled />
                    ) : (
                      <Select value={form.targetId} onValueChange={handleSelectTarget}>
                        <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                        <SelectContent>
                          {(targets ?? []).filter((t) => !!t?.id).map((t) => (
                            <SelectItem key={t.id} value={t.id!}>
                              {t?.name || "이름없음"} ({t?.gender || "-"}, {t?.phone || "-"})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
                {form.targetId && form.targetType === "이용자" && (() => {
                  const u = users.find((u) => u?.id === form.targetId);
                  if (!u) return null;
                  const matchedWorkers = (u.assignedHelperNames || []).map((name, i) => ({ name, phone: u.assignedHelperPhones?.[i] }));
                  return (
                    <div className="space-y-2">
                      <div className="bg-muted rounded p-3 text-xs grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        <span className="font-bold sm:col-span-2 text-primary border-b pb-1 mb-1">이용자 정보</span>
                        <span>이름: {u?.name || "—"} ({u?.gender || "-"})</span><span>연락처: {u?.phone || "—"}</span>
                        <span>바우처: {u?.voucherTier ?? "—"}구간</span><span>장애유형: {u?.disabilityType || "—"}</span>
                        <span className="sm:col-span-2">주소: {u?.address || "—"}</span>
                        <span>서비스시작일: {u?.serviceStartDate || "—"}</span>
                        <span className="sm:col-span-2">보호자: {u?.guardianName || "—"} ({u?.guardianRelation || "-"}) {u?.guardianPhone || ""}</span>
                      </div>
                      {matchedWorkers.length > 0 && (
                        <div className="bg-blue-50/50 border border-blue-100 rounded p-3 text-xs">
                          <span className="font-bold text-blue-700 block mb-1">🔗 배정된 활동지원사</span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {matchedWorkers.map((mw, i) => (
                              <span key={i}>{mw.name} ({mw.phone || "연락처 없음"})</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
                {form.targetId && form.targetType === "활동지원사" && (() => {
                  const w = workers.find((w) => w?.id === form.targetId);
                  if (!w) return null;
                  const matchedUsers = (w.assignedUserNames || []).map((name, i) => ({ name, phone: w.assignedUserPhones?.[i] }));
                  return (
                    <div className="space-y-2">
                      <div className="bg-muted rounded p-3 text-xs grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        <span className="font-bold sm:col-span-2 text-primary border-b pb-1 mb-1">활동지원사 정보</span>
                        <span>이름: {w?.name || "—"} ({w?.gender || "-"})</span><span>연락처: {w?.phone || "—"}</span>
                        <span>경력: {w?.experience || "—"}</span><span>희망지역: {w?.preferredArea || "—"}</span>
                        <span className="sm:col-span-2">주소: {w?.address || "—"}</span>
                      </div>
                      {matchedUsers.length > 0 && (
                        <div className="bg-blue-50/50 border border-blue-100 rounded p-3 text-xs">
                          <span className="font-bold text-blue-700 block mb-1">🔗 담당 이용자</span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {matchedUsers.map((mu, i) => (
                              <span key={i}>{mu.name} ({mu.phone || "연락처 없음"})</span>
                            ))}
                          </div>
                        </div>
                      )}
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
                <div><Label>상담 내용</Label><Textarea rows={3} value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} placeholder="상담 내용을 입력하세요..." /></div>
                <div><Label>상담 결과</Label><Textarea rows={3} value={form.result} onChange={(e) => setForm((f) => ({ ...f, result: e.target.value }))} placeholder="상담 결과를 입력하세요..." /></div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
                  <Button onClick={handleSaveRecord}>저장</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel: Target Selection for Quick Entry */}
        <div className="space-y-4">
          <h2 className="text-base font-semibold">대상자 빠른 작성</h2>
          <Tabs value={candidateTab} onValueChange={(v: any) => setCandidateTab(v)} className="w-full">
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="이용자">이용자 ({users.length})</TabsTrigger>
              <TabsTrigger value="활동지원사">활동지원사 ({workers.length})</TabsTrigger>
            </TabsList>
          </Tabs>
          <Input 
            placeholder="이름 또는 연락처 검색..." 
            value={candidateSearch} 
            onChange={(e) => setCandidateSearch(e.target.value)} 
            className="w-full"
          />
          <div className="h-[250px] lg:h-[550px] overflow-y-auto border rounded-md divide-y bg-card">
            {filteredCandidates.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">검색된 대상자가 없습니다.</p>
            ) : (
              filteredCandidates.map((c) => (
                <div key={c.id} className="p-3 hover:bg-muted/30 transition-colors flex items-center justify-between gap-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-bold text-sm text-foreground">{c.name} ({c.gender})</span>
                    <span className="text-[11px] text-muted-foreground">{c.phone || "연락처 없음"}</span>
                  </div>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => handleOpenQuickCounsel(candidateTab, c.id)}
                    className="h-8 text-xs shrink-0"
                  >
                    📝 작성
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Panel: Counseling Records History */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-base font-semibold">상담 기록 내역 ({filtered.length}건)</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <Input className="w-full sm:max-w-xs" placeholder="이름 또는 내용 검색..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <Select value={filterTarget} onValueChange={setFilterTarget}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 대상</SelectItem>
                <SelectItem value="이용자">이용자만</SelectItem>
                <SelectItem value="활동지원사">활동지원사만</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3 max-h-[300px] lg:max-h-[600px] overflow-y-auto pr-1">
            {filtered.length === 0 ? (
              <Card><CardContent className="p-8 text-center text-muted-foreground">검색 또는 조건에 부합하는 상담기록이 없습니다.</CardContent></Card>
            ) : (
              filtered.map((r) => (
                <Card key={r.id} className="card-hover">
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={r.targetType === "이용자" ? "default" : "secondary"} className="text-[10px]">{r.targetType}</Badge>
                        <span className="font-semibold text-sm">{r.targetName}</span>
                        <Badge variant="outline" className="text-[10px]">{r.category}</Badge>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6 text-muted-foreground hover:text-primary"
                          onClick={() => handlePrintRecord(r)}
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <span className="text-xs text-muted-foreground">{r.date} · {r.counselorName || "미입력"}</span>
                    </div>
                    <p className="text-xs md:text-sm text-foreground whitespace-pre-wrap leading-relaxed">{r.content}</p>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Counseling;
