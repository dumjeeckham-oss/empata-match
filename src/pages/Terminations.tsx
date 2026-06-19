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
  });

  const selectedUser = useMemo(
    () => users.find((u) => u.id === form.userId),
    [users, form.userId]
  );

  const handleSelectUser = (u: ServiceUser) => {
    setForm((f) => ({
      ...f,
      userId: u.id || "",
      userName: u.name || "",
      userPhone: u.phone || "",
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
      {/* 인쇄용 영역 (화면에서는 숨김) — A4 단일 페이지 엄격 제약 */}
      {printDoc && (
        <div className="hidden print:block fixed inset-0 bg-white z-[9999]">
          {/* 인쇄 전용 스타일 */}
          <style>{`
            @page {
              size: A4;
              margin: 15mm;
            }
            @media print {
              html, body {
                margin: 0 !important;
                padding: 0 !important;
                width: 100% !important;
                height: 100% !important;
              }
              .print-root {
                margin: 0;
                padding: 0;
                width: 100%;
                min-height: 100vh;
                box-sizing: border-box;
              }
              .print-sheet {
                width: 100%;
                max-width: 100%;
                margin: 0 auto;
                padding: 0;
                box-sizing: border-box;
                font-size: 10.5px;
                line-height: 1.25;
                color: #000;
              }
              /* 모든 내부 블록은 페이지 나눔 방지 */
              .print-sheet > * {
                page-break-inside: avoid;
              }
              .print-sheet .signature-row,
              .print-sheet .info-table,
              .print-sheet .reason-block,
              .print-sheet .handover-block,
              .print-sheet .footer-block {
                page-break-inside: avoid;
              }
              /* 표 셀 간격 최소화 */
              .print-sheet table {
                border-collapse: collapse;
                margin: 0;
              }
              .print-sheet table th,
              .print-sheet table td {
                padding: 1.2mm 2mm !important;
                vertical-align: middle;
              }
              /* 불필요 요소 숨김 */
              .no-print, .print-close-btn {
                display: none !important;
              }
            }
          `}</style>

          <div className="print-root">
            <div className="print-sheet">
              {/* ── 헤더: 제목 + 결재란 (우측 상단, 가로로 붙여 배치) ── */}
              <div className="signature-row" style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: "6mm",
              }}>
                {/* 왼쪽: 문서 제목 */}
                <h1 style={{
                  fontSize: "19px",
                  fontWeight: 700,
                  textDecoration: "underline",
                  textDecorationStyle: "double",
                  textUnderlineOffset: "4px",
                  margin: 0,
                  letterSpacing: "4px",
                  lineHeight: 1.1,
                }}>
                  종 결 확 인 서
                </h1>

                {/* 오른쪽: 결재란 (담당 + 센터장, 간격 없이 붙여서) */}
                <div style={{
                  display: "flex",
                  gap: 0,
                  alignItems: "flex-start",
                }}>
                  {/* 담당 */}
                  <div style={{ textAlign: "center", borderRight: "0.5px solid #000", paddingRight: "5mm" }}>
                    <p style={{ fontSize: "9px", fontWeight: 600, margin: "0 0 1mm 0", lineHeight: 1.1 }}>담&nbsp;&nbsp;당</p>
                    <div style={{
                      width: "20mm",
                      height: "15mm",
                      border: "1px solid #000",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      position: "relative",
                    }}>
                      <span style={{ fontWeight: 700, fontSize: "9px" }}>
                        {printDoc.approverDandang || ""}
                      </span>
                      <span style={{
                        position: "absolute",
                        right: "1mm",
                        bottom: "1mm",
                        fontSize: "6px",
                      }}>(인)</span>
                    </div>
                  </div>

                  {/* 센터장 */}
                  <div style={{ textAlign: "center", paddingLeft: "5mm" }}>
                    <p style={{ fontSize: "9px", fontWeight: 600, margin: "0 0 1mm 0", lineHeight: 1.1 }}>센터장</p>
                    <div style={{
                      width: "20mm",
                      height: "15mm",
                      border: "1px solid #000",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      position: "relative",
                    }}>
                      <span style={{ fontWeight: 700, fontSize: "9px" }}>
                        {printDoc.approverCenterJang || ""}
                      </span>
                      <span style={{
                        position: "absolute",
                        right: "1mm",
                        bottom: "1mm",
                        fontSize: "6px",
                      }}>(인)</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── 기본 정보 테이블 ── */}
              <table className="info-table" style={{
                width: "100%",
                border: "1px solid #000",
                marginBottom: "4mm",
                fontSize: "10px",
              }}>
                <tbody>
                  <tr>
                    <th style={{
                      border: "1px solid #000",
                      backgroundColor: "#f5f5f5",
                      textAlign: "center",
                      width: "25%",
                    }}>수급자 성명</th>
                    <td style={{
                      border: "1px solid #000",
                      textAlign: "center",
                      fontWeight: 700,
                      width: "25%",
                    }}>{printDoc.userName}</td>
                    <th style={{
                      border: "1px solid #000",
                      backgroundColor: "#f5f5f5",
                      textAlign: "center",
                      width: "25%",
                    }}>종결 일자</th>
                    <td style={{
                      border: "1px solid #000",
                      textAlign: "center",
                      width: "25%",
                    }}>{printDoc.date}</td>
                  </tr>
                  <tr>
                    <th style={{
                      border: "1px solid #000",
                      backgroundColor: "#f5f5f5",
                      textAlign: "center",
                    }}>장애 유형</th>
                    <td style={{
                      border: "1px solid #000",
                      textAlign: "center",
                    }}>
                      {users.find(u => u.id === printDoc.userId)?.disabilityType || "—"}
                    </td>
                    <th style={{
                      border: "1px solid #000",
                      backgroundColor: "#f5f5f5",
                      textAlign: "center",
                    }}>바우처 구간</th>
                    <td style={{
                      border: "1px solid #000",
                      textAlign: "center",
                    }}>
                      {users.find(u => u.id === printDoc.userId)?.voucherTier || "—"}구간
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* ── 1. 종결 사유 ── */}
              <div className="reason-block" style={{ marginBottom: "3mm" }}>
                <h2 style={{
                  fontSize: "10.5px",
                  fontWeight: 700,
                  margin: "0 0 1.5mm 0",
                  lineHeight: 1.2,
                }}>1. 종결 사유</h2>
                <div style={{
                  border: "1px solid #000",
                  padding: "2mm 3mm",
                  minHeight: "18mm",
                  lineHeight: 1.4,
                }}>
                  {/* 체크박스 사유 목록 */}
                  <div style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "2mm 6mm",
                    marginBottom: "2mm",
                  }}>
                    {TERMINATION_REASONS.map(r => (
                      <div key={r} style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "1.5mm",
                        fontSize: "9px",
                        whiteSpace: "nowrap",
                      }}>
                        <span style={{
                          display: "inline-block",
                          width: "3.5mm",
                          height: "3.5mm",
                          border: "1px solid #000",
                          textAlign: "center",
                          lineHeight: "3.5mm",
                          fontSize: "7px",
                          fontWeight: 700,
                        }}>
                          {printDoc.reasons.includes(r) ? "✓" : ""}
                        </span>
                        <span>{r}</span>
                      </div>
                    ))}
                  </div>
                  {/* 상세 사유 */}
                  {printDoc.reasonDetail && (
                    <div style={{
                      paddingTop: "1.5mm",
                      borderTop: "1px dotted #999",
                      fontSize: "9px",
                      lineHeight: 1.35,
                      wordBreak: "keep-all",
                    }}>
                      {printDoc.reasonDetail}
                    </div>
                  )}
                </div>
              </div>

              {/* ── 2. 인계 및 기타 특이사항 ── */}
              <div className="handover-block" style={{ marginBottom: "3mm" }}>
                <h2 style={{
                  fontSize: "10.5px",
                  fontWeight: 700,
                  margin: "0 0 1.5mm 0",
                  lineHeight: 1.2,
                }}>2. 인계 및 기타 특이사항</h2>
                <div style={{
                  border: "1px solid #000",
                  padding: "2mm 3mm",
                  minHeight: "18mm",
                  fontSize: "9px",
                  lineHeight: 1.4,
                  whiteSpace: "pre-wrap",
                  wordBreak: "keep-all",
                }}>
                  {printDoc.handoverNote || "특이사항 없음"}
                </div>
              </div>

              {/* ── 하단: 확정 문구 + 센터명 + 로고 ── */}
              <div className="footer-block" style={{
                textAlign: "center",
                marginTop: "auto",
              }}>
                <p style={{
                  fontSize: "10px",
                  margin: "0 0 2mm 0",
                  lineHeight: 1.3,
                }}>
                  위와 같이 서비스 종결을 확인합니다.
                </p>
                <p style={{
                  fontSize: "9px",
                  margin: "0 0 3mm 0",
                  lineHeight: 1.2,
                }}>
                  {new Date().getFullYear()}년 {new Date().getMonth() + 1}월 {new Date().getDate()}일
                </p>
                <p style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  margin: "0 0 4mm 0",
                  lineHeight: 1.2,
                }}>
                  동백 장애인활동지원센터
                </p>
                {/* 동백 로고 */}
                <img
                  src={dongbaekLogo}
                  alt="동백 로고"
                  style={{
                    display: "block",
                    margin: "0 auto",
                    maxWidth: "35mm",
                    maxHeight: "12mm",
                    objectFit: "contain",
                  }}
                />
              </div>
            </div>
          </div>

          {/* 화면용 닫기 버튼 (인쇄 시 숨김) */}
          <button
            onClick={() => setPrintDoc(null)}
            className="print:hidden no-print print-close-btn fixed top-4 right-4 bg-primary text-white p-2 rounded-full shadow-lg z-50 hover:bg-primary/90"
          >
            <X size={20} />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between no-print">
        <h1 className="page-header mb-0">종결확인서</h1>
        <Badge variant="secondary">{sortedDocs.length}건</Badge>
      </div>

      <Card className="no-print">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            {editingId ? "종결확인서 수정" : "종결확인서 작성"}
          </CardTitle>
          {editingId && (
            <Button variant="ghost" size="sm" onClick={resetForm}>
              <X className="w-4 h-4 mr-1" /> 취소
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>이용자(수급자) 선택 *</Label>
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
              <Label>종결일자 *</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            </div>
          </div>

          <div>
            <Label>종결 사유 (복수 선택 가능) *</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
              {TERMINATION_REASONS.map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm cursor-pointer">
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
