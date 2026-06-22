import { useMemo, useState } from "react";
import { useCollection } from "@/hooks/useFirestore";
import { type ServiceUser, type TerminationDocument, TERMINATION_REASONS } from "@/types";
import { USERS_COLLECTION, TERMINATIONS_COLLECTION } from "@/lib/collectionNames";
import dongbaekLogo from "@/assets/dongbaek-logo.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Timestamp } from "@/lib/firebase";
import { Search, Printer, Edit2, Trash2, X } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function safeMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export default function Terminations() {
  const { data: users, update: updateUser } = useCollection<ServiceUser>(USERS_COLLECTION);
  const { data: docs, add: addDoc, update: updateDoc, remove: removeDoc, loading } = useCollection<TerminationDocument>(TERMINATIONS_COLLECTION);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [printDoc, setPrintDoc] = useState<TerminationDocument | null>(null);

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
    projectName: "동백 장애인활동지원센터",
    residentNumber: "",
    approvalDate: new Date().toISOString().slice(0, 10),
    assignedWorkerName: "",
  });

  const selectedUser = useMemo(
    () => users.find((u) => u.id === form.userId),
    [users, form.userId]
  );

  const handleSelectUser = (u: ServiceUser) => {
    // 선택한 이용자의 담당 활동지원사를 자동으로 찾아 채움
    const workerName = u.assignedHelperNames?.[0] || "";
    setForm((f) => ({
      ...f,
      userId: u.id || "",
      userName: u.name || "",
      userPhone: u.phone || "",
      assignedWorkerName: workerName,
    }));
    setIsSearchOpen(false);
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

      if (editingId) {
        // 수정 모드
        const payload: Partial<TerminationDocument> = {
          ...form,
          updatedAt: Timestamp.now(),
        };
        await updateDoc(editingId, payload);
        
        // 이용자 정보 동기화 (상태, 사유, 해지날짜)
        await updateUser(form.userId, {
          contractStatus: "계약해지",
          terminationReason: terminationReasonText,
          txtUMemostop: terminationReasonText,
          resignationDate: form.date, // 계약해지 날짜 동기화
        } as any);

        toast({ title: "종결확인서 수정 완료", description: "이용자 프로필의 계약해지 날짜와 종결 사유가 동기화되었습니다." });
      } else {
        // 신규 저장 모드
        const payload: Omit<TerminationDocument, "id"> = {
          ...form,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        };
        await addDoc(payload as any);

        // 이용자 상태 및 데이터 동기화 (상태, 사유, 계약해지 날짜)
        await updateUser(form.userId, {
          contractStatus: "계약해지",
          terminationReason: terminationReasonText,
          txtUMemostop: terminationReasonText,
          resignationDate: form.date, // 계약해지 날짜 동기화
        } as any);

        toast({ title: "종결확인서 저장 완료", description: "이용자 상태가 '계약해지'로 자동 전환되고, 계약해지 날짜가 저장되었습니다." });
      }

      resetForm();
    } catch (e) {
      console.error("Termination save failed:", e);
      alert(`❌ 종결확인서 저장 실패\n사유: ${safeMsg(e)}\n\n${e instanceof Error ? e.stack ?? "" : ""}`);
    }
  };

  const handleEdit = (doc: TerminationDocument) => {
    setEditingId(doc.id);
    setForm({
      userId: doc.userId,
      userName: doc.userName,
      userPhone: doc.userPhone,
      date: doc.date,
      reasons: doc.reasons || [],
      reasonDetail: doc.reasonDetail || "",
      handoverNote: doc.handoverNote || "",
      approverDandang: doc.approverDandang || "",
      approverCenterJang: doc.approverCenterJang || "",
      projectName: doc.projectName || "동백 장애인활동지원센터",
      residentNumber: doc.residentNumber || "",
      approvalDate: doc.approvalDate || doc.date || new Date().toISOString().slice(0, 10),
      assignedWorkerName: doc.assignedWorkerName || "",
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try {
      await removeDoc(id);
      toast({ title: "삭제 완료" });
    } catch (e) {
      alert("삭제 실패: " + safeMsg(e));
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setForm({
      userId: "",
      userName: "",
      userPhone: "",
      date: new Date().toISOString().slice(0, 10),
      reasons: [],
      reasonDetail: "",
      handoverNote: "",
      approverDandang: "",
      approverCenterJang: "",
      projectName: "동백 장애인활동지원센터",
      residentNumber: "",
      approvalDate: new Date().toISOString().slice(0, 10),
      assignedWorkerName: "",
    });
  };

  const handlePrint = (doc: TerminationDocument) => {
    setPrintDoc(doc);
    setTimeout(() => {
      window.print();
    }, 100);
  };

  const sortedDocs = useMemo(() => {
    return [...docs].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [docs]);

  return (
    <div className="space-y-6">
      
{/* ── 인쇄용 영역: 종결승인서 A4 단일 페이지 ── */}
      {printDoc && (
        <div className="hidden print:block fixed inset-0 bg-white z-[9999]">
          <style>{`
            @page {
              size: A4;
              margin: 12mm 14mm;
            }
            @media print {
              html, body { margin: 0 !important; padding: 0 !important; }
              .print-sheet {
                width: 100%;
                font-size: 10px;
                line-height: 1.25;
                color: #000;
                font-family: 'Malgun Gothic', 'Dotum', sans-serif;
              }
              .print-sheet > * { page-break-inside: avoid; }
              .print-sheet table { border-collapse: collapse; width: 100%; }
              .print-sheet table td,
              .print-sheet table th {
                border: 1px solid #000;
                padding: 1.5mm 2mm;
                vertical-align: middle;
              }
            }
          `}</style>

          <div className="print-sheet">
            {/* ── 제목 + 결재란 (상단 박스) ── */}
            <table style={{ marginBottom: "3mm", tableLayout: "fixed" }}>
              <tbody>
                <tr>
                  <td style={{
                    textAlign: "center",
                    fontWeight: 700,
                    fontSize: "16px",
                    letterSpacing: "6px",
                    border: "1px solid #000",
                    padding: "3mm 0",
                    width: "68%",
                  }}>
                    종 결 승 인 서
                  </td>
                  <td style={{
                    textAlign: "center",
                    fontSize: "9px",
                    fontWeight: 600,
                    border: "1px solid #000",
                    width: "16%",
                    lineHeight: 1.3,
                  }}>
                    담&nbsp;&nbsp;당
                    <br />
                    <span style={{ fontSize: "10px", fontWeight: 700 }}>
                      {printDoc.approverDandang || ""}
                    </span>
                  </td>
                  <td style={{
                    textAlign: "center",
                    fontSize: "9px",
                    fontWeight: 600,
                    border: "1px solid #000",
                    width: "16%",
                    lineHeight: 1.3,
                  }}>
                    센터장
                    <br />
                    <span style={{ fontSize: "10px", fontWeight: 700 }}>
                      {printDoc.approverCenterJang || ""}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* ── 설명문 ── */}
            <div style={{
              border: "1px solid #000",
              padding: "2mm 3mm",
              fontSize: "8.5px",
              lineHeight: 1.4,
              marginBottom: "3mm",
              wordBreak: "keep-all",
            }}>
              부천의료복지사회적협동조합 동백장애인활동지원센터에서 복지서비스를 제공 받았던 수해자를 아래와 같은 사유로 종결하고자 합니다. 검토 후 재가 바랍니다.
            </div>

            {/* ── 정보 테이블 ── */}
            <table style={{ marginBottom: "3mm", fontSize: "9.5px" }}>
              <tbody>
                <tr>
                  <th style={{ backgroundColor: "#f5f5f5", width: "18%", textAlign: "center" }}>사 업 명</th>
                  <td style={{ width: "32%" }}>{printDoc.projectName || "동백 장애인활동지원센터"}</td>
                  <th style={{ backgroundColor: "#f5f5f5", width: "18%", textAlign: "center" }}>담당 활동지원사</th>
                  <td style={{ width: "32%" }}>{printDoc.assignedWorkerName || users.find(u => u.id === printDoc.userId)?.assignedHelperNames?.[0] || ""}</td>
                </tr>
                <tr>
                  <th style={{ backgroundColor: "#f5f5f5", textAlign: "center" }}>경 로 주</th>
                  <td style={{ fontWeight: 700 }}>{printDoc.userName}</td>
                  <th style={{ backgroundColor: "#f5f5f5", textAlign: "center" }}>종 결 사</th>
                  <td>{printDoc.reasons?.join(", ") || "—"}</td>
                </tr>
                <tr>
                  <th style={{ backgroundColor: "#f5f5f5", textAlign: "center" }}>주민등록번호</th>
                  <td>{printDoc.residentNumber || "—"}</td>
                  <th style={{ backgroundColor: "#f5f5f5", textAlign: "center" }}>종결 일시</th>
                  <td>{printDoc.date}</td>
                </tr>
                <tr>
                  <th style={{ backgroundColor: "#f5f5f5", textAlign: "center" }}>주 소</th>
                  <td colSpan={3}>
                    {users.find(u => u.id === printDoc.userId)?.address
                      || selectedUser?.address || "—"}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* ── 하단: 좌(종결종류) / 우(종결사유) 2단 ── */}
            <table style={{ marginBottom: "3mm", fontSize: "9px", tableLayout: "fixed" }}>
              <tbody>
                <tr>
                  <th style={{ backgroundColor: "#f5f5f5", textAlign: "center", width: "38%", fontSize: "9.5px" }}>
                    종 결 종 류
                  </th>
                  <th style={{ backgroundColor: "#f5f5f5", textAlign: "center", width: "62%", fontSize: "9.5px" }}>
                    종 결 사 유
                  </th>
                </tr>
                <tr style={{ height: "60mm" }}>
                  <td style={{ verticalAlign: "top", padding: "2mm", lineHeight: 1.6 }}>
                    {TERMINATION_REASONS.map(r => (
                      <div key={r} style={{ display: "flex", alignItems: "center", gap: "1.5mm", fontSize: "8.5px", marginBottom: "0.8mm" }}>
                        <span style={{
                          display: "inline-block",
                          width: "3mm",
                          height: "3mm",
                          border: "1px solid #000",
                          textAlign: "center",
                          lineHeight: "3mm",
                          fontSize: "6px",
                          fontWeight: 700,
                          flexShrink: 0,
                        }}>
                          {printDoc.reasons.includes(r) ? "✓" : ""}
                        </span>
                        <span>{r}</span>
                      </div>
                    ))}
                  </td>
                  <td style={{ verticalAlign: "top", padding: "2mm", fontSize: "8.5px", lineHeight: 1.4, whiteSpace: "pre-wrap", wordBreak: "keep-all" }}>
                    {printDoc.reasonDetail || ""}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* ── 하단: 결재일 + 로고 + 기관명 (중앙 정렬, 표 없이) ── */}
            <div style={{ textAlign: "center", marginTop: "3mm" }}>
              <p style={{
                fontSize: "10px",
                fontWeight: 600,
                margin: "0 0 1.5mm 0",
                lineHeight: 1.3,
              }}>
                결 재 일 : {printDoc.approvalDate || printDoc.date}
              </p>
              <img
                src={dongbaekLogo}
                alt="동백"
                style={{
                  display: "block",
                  margin: "2mm auto 1.5mm auto",
                  maxWidth: "22mm",
                  maxHeight: "10mm",
                  objectFit: "contain",
                }}
              />
              <p style={{
                fontWeight: 700,
                fontSize: "10px",
                margin: 0,
                lineHeight: 1.3,
              }}>
                동백 장애인활동지원센터
              </p>
            </div>
          </div>

          <button
            onClick={() => setPrintDoc(null)}
            className="print:hidden no-print print-close-btn fixed top-4 right-4 bg-primary text-white p-2 rounded-full shadow-lg z-50 hover:bg-primary/90"
          >
            <X size={20} />
          </button>
        </div>
      )}


      <div className="flex items-center justify-between no-print">
        <h1 className="page-header mb-0">종결승인서</h1>
        <Badge variant="secondary">{sortedDocs.length}건</Badge>
      </div>

      <Card className="no-print">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            {editingId ? "종결승인서 수정" : "종결승인서 작성"}
          </CardTitle>
          {editingId && (
            <Button variant="ghost" size="sm" onClick={resetForm}>
              <X className="w-4 h-4 mr-1" /> 취소
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* ── 사업명 ── */}
          <div>
            <Label>사업명</Label>
            <Input value={form.projectName || ""} onChange={(e) => setForm((f) => ({ ...f, projectName: e.target.value }))} placeholder="동백 장애인활동지원센터" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>이용자(경로주) 선택 *</Label>
              <div className="mt-1">
                <Popover open={isSearchOpen} onOpenChange={setIsSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={isSearchOpen}
                      className="w-full justify-between"
                    >
                      {form.userName || "이용자 검색 및 선택"}
                      <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0">
                    <Command>
                      <CommandInput placeholder="이름 또는 연락처로 검색..." />
                      <CommandList>
                        <CommandEmpty>검색 결과가 없습니다.</CommandEmpty>
                        <CommandGroup>
                          {users.map((u) => (
                            <CommandItem
                              key={u.id}
                              value={`${u.name} ${u.phone}`}
                              onSelect={() => handleSelectUser(u)}
                            >
                              <div className="flex flex-col">
                                <span className="font-medium">{u.name}</span>
                                <span className="text-xs text-muted-foreground">{u.phone}</span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              {selectedUser && (
                <p className="text-xs text-muted-foreground mt-1">
                  주소: {selectedUser.address || "—"} / 바우처: {selectedUser.voucherTier}구간 / 장애유형: {selectedUser.disabilityType || "—"}
                </p>
              )}
            </div>
            <div>
              <Label>담당 활동지원사 (자동 채움)</Label>
              <Input value={form.assignedWorkerName || ""} onChange={(e) => setForm((f) => ({ ...f, assignedWorkerName: e.target.value }))} placeholder="이용자 선택 시 자동 채움" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>종결사(코드)</Label>
              <Input value={form.reasons.join(", ") || ""} readOnly className="bg-muted" placeholder="하단 사유 선택 시 자동 채움" />
            </div>
            <div>
              <Label>주민등록번호</Label>
              <Input value={form.residentNumber || ""} onChange={(e) => setForm((f) => ({ ...f, residentNumber: e.target.value }))} placeholder="000000-0000000" />
            </div>
            <div>
              <Label>종결일시 *</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            </div>
          </div>

          <div>
            <Label>주소</Label>
            <Input value={selectedUser?.address || ""} readOnly className="bg-muted" placeholder="이용자 선택 시 자동 채움" />
          </div>

          {/* ── 좌: 종결종류 / 우: 종결사유 2단 분할 ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label>종결 종류 (복수 선택) *</Label>
              <div className="border rounded-md p-3 mt-2 space-y-1.5">
                {TERMINATION_REASONS.map((r) => (
                  <label key={r} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 px-1 py-0.5 rounded">
                    <Checkbox checked={form.reasons.includes(r)} onCheckedChange={() => toggleReason(r)} />{r}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label>종결 사유</Label>
              {form.reasons.includes("개인사정") || form.reasons.includes("기타") ? (
                <p className="text-xs text-amber-600 font-medium mt-1 mb-1">
                  ⚠ {form.reasons.filter(r => r === "개인사정" || r === "기타").join(", ")} 사유이므로 상세 내용을 반드시 작성해주세요.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-1 mb-1">
                  선택한 종결 종류: {form.reasons.length > 0 ? form.reasons.join(", ") : "없음"}
                </p>
              )}
              <Textarea
                className="min-h-[200px]"
                value={form.reasonDetail}
                onChange={(e) => setForm((f) => ({ ...f, reasonDetail: e.target.value }))}
                placeholder={form.reasons.includes("개인사정") 
                  ? "개인사정에 해당하는 구체적인 사유를 작성해주세요."
                  : form.reasons.includes("기타")
                  ? "기타에 해당하는 구체적인 사유를 작성해주세요."
                  : "종결 사유에 대한 상세 내용을 작성해주세요."}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>결재일</Label>
              <Input type="date" value={form.approvalDate || ""} onChange={(e) => setForm((f) => ({ ...f, approvalDate: e.target.value }))} />
            </div>
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

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={resetForm} disabled={loading}>초기화</Button>
            <Button onClick={handleSave} disabled={loading}>{editingId ? "수정 저장" : "신규 저장"}</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="no-print">
        <CardHeader>
          <CardTitle className="text-base">작성 내역</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {sortedDocs.length === 0 ? (
            <p className="text-sm text-muted-foreground">작성된 종결확인서가 없습니다.</p>
          ) : (
            <div className="divide-y border rounded-md">
              {sortedDocs.map((d) => (
                <div key={d.id} className="p-3 text-sm flex flex-col md:flex-row md:items-center md:justify-between gap-3 hover:bg-muted/30 transition-colors">
                  <div>
                    <div className="font-medium">{d.userName}</div>
                    <div className="text-xs text-muted-foreground">{d.userPhone}</div>
                  </div>
                  <div className="flex-grow text-muted-foreground">{d.date} · {(d.reasons || []).join(", ") || "—"}</div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => handlePrint(d)}>
                      <Printer className="w-4 h-4 mr-1" /> 인쇄
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleEdit(d)}>
                      <Edit2 className="w-4 h-4 mr-1" /> 수정
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDelete(d.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
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
