import { useEffect, useMemo, useState } from "react";
import { useCollection } from "@/hooks/useFirestore";
import { type ServiceUser, type Worker, type HandoverDocument } from "@/types";
import { HANDOVERS_COLLECTION, USERS_COLLECTION, WORKERS_COLLECTION } from "@/lib/collectionNames";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Timestamp } from "@/lib/firebase";
import { syncUserToWorkers } from "@/lib/assignments";
import { Printer, Search, X, Edit2, Trash2 } from "lucide-react";
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

function safeMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

function normalizePhone(phone: string): string {
  return (phone || "").replace(/\D/g, "");
}

function labelWithLast4(name: string, phone: string): string {
  const last4 = normalizePhone(phone).slice(-4);
  return last4 ? `${name}(${last4})` : name;
}

export default function Handovers() {
  const { data: users, update: updateUser } = useCollection<ServiceUser>(USERS_COLLECTION);
  const { data: workers, update: updateWorker } = useCollection<Worker>(WORKERS_COLLECTION);
  const { data: docs, add: addHandover, update: updateHandover, remove: removeHandover, loading } = useCollection<HandoverDocument>(HANDOVERS_COLLECTION);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string>("");
  const [isUserSearchOpen, setIsUserSearchOpen] = useState(false);
  const [nextWorkerId, setNextWorkerId] = useState<string>("");
  const [isWorkerSearchOpen, setIsWorkerSearchOpen] = useState(false);
  
  const [handoverPersonName, setHandoverPersonName] = useState<string>("");
  const [handoverDate, setHandoverDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [takeoverPersonName, setTakeoverPersonName] = useState<string>("");
  const [takeoverDate, setTakeoverDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [printDoc, setPrintDoc] = useState<HandoverDocument | null>(null);

  const selectedUser = useMemo(() => users.find((u) => u.id === userId), [users, userId]);
  const nextWorker = useMemo(() => workers.find((w) => w.id === nextWorkerId), [workers, nextWorkerId]);

  const prevWorkerId = selectedUser?.assignedHelperIds?.[0] || selectedUser?.assigned_workers?.[0] || "";
  const prevWorker = useMemo(() => {
    if (!selectedUser) return undefined;
    if (prevWorkerId) {
      const byId = workers.find((w) => w.id === prevWorkerId);
      if (byId) return byId;
    }
    const name = (selectedUser.assignedHelperNames?.[0] || "").trim();
    const phone = normalizePhone(selectedUser.assignedHelperPhones?.[0] || "");
    if (!name && !phone) return undefined;
    return workers.find((w) => {
      const wName = String(w?.name || "").trim();
      const wPhone = normalizePhone(w?.phone || "");
      if (name && phone) return wName === name && wPhone === phone;
      if (phone) return wPhone === phone;
      return wName === name;
    });
  }, [selectedUser, workers, prevWorkerId]);

  useEffect(() => {
    if (!editingId) {
      if (prevWorker?.name) {
        setHandoverPersonName(prevWorker.name);
      } else {
        const fallbackName = (selectedUser?.assignedHelperNames?.[0] || "").trim();
        if (fallbackName) setHandoverPersonName(fallbackName);
      }
    }
  }, [selectedUser, prevWorker, editingId]);

  const handleSave = async () => {
    try {
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
        updatedAt: Timestamp.now(),
      };

      if (editingId) {
        await updateHandover(editingId, payload);
        toast({ title: "업무 인계·인수서 수정 완료" });
      } else {
        (payload as any).createdAt = Timestamp.now();
        await addHandover(payload as any);
        
        // 데이터 동기화 로직 (신규 저장 시에만 수행)
        const prevHelperIds = selectedUser.assignedHelperIds ?? [];
        const newHelperIds = [nextWorker.id!];
        const updatedUser: Partial<ServiceUser> = {
          assignedHelperIds: newHelperIds,
          assigned_workers: newHelperIds,
          assignedHelperNames: [nextWorker.name],
          assignedHelperPhones: [nextWorker.phone],
        };
        await updateUser(selectedUser.id!, updatedUser as any);
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
      }

      resetForm();
    } catch (e) {
      console.error("Handover save failed:", e);
      alert(`❌ 인계·인수서 저장 실패\n사유: ${safeMsg(e)}`);
    }
  };

  const handleEdit = (doc: HandoverDocument) => {
    setEditingId(doc.id);
    setUserId(doc.userId);
    setNextWorkerId(doc.nextWorkerId);
    setHandoverPersonName(doc.handoverPersonName);
    setHandoverDate(doc.handoverDate);
    setTakeoverPersonName(doc.takeoverPersonName);
    setTakeoverDate(doc.takeoverDate);
    setReason(doc.reason);
    setNotes(doc.notes || "");
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try {
      await removeHandover(id);
      toast({ title: "삭제 완료" });
    } catch (e) {
      alert("삭제 실패: " + safeMsg(e));
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setUserId("");
    setNextWorkerId("");
    setHandoverPersonName("");
    setHandoverDate(new Date().toISOString().slice(0, 10));
    setTakeoverPersonName("");
    setTakeoverDate(new Date().toISOString().slice(0, 10));
    setReason("");
    setNotes("");
  };

  const handlePrint = (doc: HandoverDocument) => {
    setPrintDoc(doc);
    setTimeout(() => {
      window.print();
    }, 100);
  };

  const sortedDocs = useMemo(() => {
    return [...docs].sort((a, b) => (b.handoverDate || "").localeCompare(a.handoverDate || ""));
  }, [docs]);

  return (
    <div className="space-y-6">
      {/* 인쇄용 영역 */}
      {printDoc && (
        <div className="hidden print:block fixed inset-0 bg-white z-[9999] p-10 overflow-auto">
          <div className="max-w-[210mm] mx-auto border-2 border-black p-8 min-h-[280mm] flex flex-col">
            <h1 className="text-3xl font-bold text-center mb-10 underline decoration-double underline-offset-8">업무 인계 · 인수서</h1>
            
            <h2 className="text-xl font-bold mb-3">1. 수급자 인적사항</h2>
            <table className="w-full border-collapse border border-black mb-8 text-sm">
              <tbody>
                <tr>
                  <th className="border border-black bg-gray-100 p-3 w-1/6 text-center">성명</th>
                  <td className="border border-black p-3 w-2/6 text-center font-bold">{printDoc.userName}</td>
                  <th className="border border-black bg-gray-100 p-3 w-1/6 text-center">연락처</th>
                  <td className="border border-black p-3 w-2/6 text-center">{printDoc.userPhone}</td>
                </tr>
                <tr>
                  <th className="border border-black bg-gray-100 p-3 text-center">장애유형</th>
                  <td className="border border-black p-3 text-center">{printDoc.disabilityType || "—"}</td>
                  <th className="border border-black bg-gray-100 p-3 text-center">바우처구간</th>
                  <td className="border border-black p-3 text-center">{printDoc.voucherTier}구간</td>
                </tr>
                <tr>
                  <th className="border border-black bg-gray-100 p-3 text-center">주소</th>
                  <td colSpan={3} className="border border-black p-3">{printDoc.userAddress || "—"}</td>
                </tr>
              </tbody>
            </table>

            <h2 className="text-xl font-bold mb-3">2. 인계 · 인수 내용</h2>
            <table className="w-full border-collapse border border-black mb-8 text-sm">
              <tbody>
                <tr>
                  <th className="border border-black bg-gray-100 p-3 w-1/4 text-center">인계 사유</th>
                  <td colSpan={3} className="border border-black p-3 min-h-[60px]">{printDoc.reason}</td>
                </tr>
                <tr>
                  <th className="border border-black bg-gray-100 p-3 w-1/4 text-center text-red-600 font-bold">전임(인계자)</th>
                  <td className="border border-black p-3 w-1/4 text-center">{printDoc.prevWorkerName || printDoc.handoverPersonName}</td>
                  <th className="border border-black bg-gray-100 p-3 w-1/4 text-center text-blue-600 font-bold">후임(인수자)</th>
                  <td className="border border-black p-3 w-1/4 text-center">{printDoc.nextWorkerName || printDoc.takeoverPersonName}</td>
                </tr>
              </tbody>
            </table>

            <h2 className="text-xl font-bold mb-3">3. 인계 및 특이사항</h2>
            <div className="border border-black p-5 min-h-[200px] mb-8 text-sm whitespace-pre-wrap">
              {printDoc.notes || "특이사항 없음"}
            </div>

            <div className="mt-auto">
              <p className="text-center text-lg mb-10">위와 같이 업무 인계 · 인수를 확인합니다.</p>
              <p className="text-center text-xl mb-12">{new Date().getFullYear()}년 {new Date().getMonth() + 1}월 {new Date().getDate()}일</p>
              
              <div className="flex justify-around items-end mt-10">
                <div className="text-center">
                  <p className="mb-2 text-red-600 font-bold">인계자(전임)</p>
                  <div className="w-32 h-16 border border-black flex items-center justify-center relative">
                    <span className="font-bold">{printDoc.handoverPersonName}</span>
                    <span className="absolute right-2 bottom-1 text-xs">(인)</span>
                  </div>
                </div>
                <div className="text-center">
                  <p className="mb-2 text-blue-600 font-bold">인수자(후임)</p>
                  <div className="w-32 h-16 border border-black flex items-center justify-center relative">
                    <span className="font-bold">{printDoc.takeoverPersonName}</span>
                    <span className="absolute right-2 bottom-1 text-xs">(인)</span>
                  </div>
                </div>
                <div className="text-center">
                  <p className="mb-2">확인(기관)</p>
                  <div className="w-32 h-16 border border-black flex items-center justify-center relative">
                    <span className="absolute right-2 bottom-1 text-xs">(인)</span>
                  </div>
                </div>
              </div>
              
              <p className="mt-16 text-center font-bold text-2xl">동백 장애인활동지원센터</p>
            </div>
          </div>
          <button 
            onClick={() => setPrintDoc(null)} 
            className="print:hidden fixed top-4 right-4 bg-primary text-white p-2 rounded-full shadow-lg"
          >
            <X size={24} />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between no-print">
        <h1 className="page-header mb-0">업무 인계·인수서</h1>
        <Badge variant="secondary">{sortedDocs.length}건</Badge>
      </div>

      <Card className="no-print">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            {editingId ? "인계·인수서 수정" : "인계·인수서 작성"}
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
                <Popover open={isUserSearchOpen} onOpenChange={setIsUserSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={isUserSearchOpen}
                      className="w-full justify-between"
                    >
                      {selectedUser?.name || "이용자 검색 및 선택"}
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
                              onSelect={() => {
                                setUserId(u.id!);
                                setIsUserSearchOpen(false);
                              }}
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
            </div>

            <div>
              <Label>후임(인수자) 활동지원사 선택 *</Label>
              <div className="mt-1">
                <Popover open={isWorkerSearchOpen} onOpenChange={setIsWorkerSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={isWorkerSearchOpen}
                      className="w-full justify-between"
                    >
                      {nextWorker ? labelWithLast4(nextWorker.name, nextWorker.phone) : "활동지원사 검색 및 선택"}
                      <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0">
                    <Command>
                      <CommandInput placeholder="이름 또는 연락처로 검색..." />
                      <CommandList>
                        <CommandEmpty>검색 결과가 없습니다.</CommandEmpty>
                        <CommandGroup>
                          {workers.filter(w => w.contractStatus !== "퇴사").map((w) => (
                            <CommandItem
                              key={w.id}
                              value={`${w.name} ${w.phone}`}
                              onSelect={() => {
                                setNextWorkerId(w.id!);
                                setTakeoverPersonName(w.name);
                                setIsWorkerSearchOpen(false);
                              }}
                            >
                              <div className="flex flex-col">
                                <span className="font-medium">{w.name} ({w.phone})</span>
                                <span className="text-xs text-muted-foreground">{w.contractStatus} · {w.experience}</span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>

          {selectedUser && (
            <div className="border rounded-md p-3 bg-muted/30 text-sm space-y-1">
              <div className="font-semibold">수급자 인적사항(자동 불러오기)</div>
              <div>성명: {selectedUser?.name || "—"}</div>
              <div>연락처: {selectedUser?.phone || "—"}</div>
              <div className="truncate">주소: {selectedUser?.address || "—"}</div>
              <div>바우처구간: {selectedUser?.voucherTier ?? "—"}구간</div>
              <div>장애유형: {selectedUser?.disabilityType || "—"}</div>
              <div className="pt-1 text-xs text-muted-foreground">
                현재 담당(전임): {prevWorker ? labelWithLast4(prevWorker?.name || "이름없음", prevWorker?.phone || "") : "미배정"}
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
            <p className="text-sm text-muted-foreground">작성된 인계·인수서가 없습니다.</p>
          ) : (
            <div className="divide-y border rounded-md">
              {sortedDocs.map((d) => (
                <div key={d.id} className="p-3 text-sm flex flex-col gap-2 hover:bg-muted/30 transition-colors">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-1">
                    <div className="font-medium">{d?.userName || "이름없음"} ({d?.userPhone || "-"})</div>
                    <div className="text-muted-foreground">{d?.handoverDate || "-"} · {d?.reason || "-"}</div>
                  </div>
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div className="text-xs text-muted-foreground">
                      담당 변경: {d?.prevWorkerName ? labelWithLast4(d.prevWorkerName, d?.prevWorkerPhone || "") : "미배정"} → {d?.nextWorkerName ? labelWithLast4(d.nextWorkerName, d?.nextWorkerPhone || "") : "—"}
                    </div>
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
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
