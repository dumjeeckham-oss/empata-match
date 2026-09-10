import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useCollection } from "@/hooks/useFirestore";
import { SALARY_CHANGES_COLLECTION, USERS_COLLECTION } from "@/lib/collectionNames";
import type { SalaryChangeDocument, ServiceUser, VoucherChangeHistoryEntry } from "@/types";
import { SUPPORT_TYPES, VOUCHER_HOURS } from "@/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SpellCheckButton } from "@/components/SpellCheckButton";
import { toast } from "@/hooks/use-toast";
import dongbaekLogo from "@/assets/dongbaek-logo.png";
import { formatVoucherTier } from "@/lib/userVoucher";

const today = new Date().toISOString().slice(0, 10);
const CONFIRMATIONS = ["활동지원 급여제공계획서 변경 등록", "이용자에게 급여제공계획서 변경 설명", "기타 등록"];

type Draft = {
  nextTier: number;
  nextTierLabel: string;
  nextHours: number;
  counselingNotes: string;
  changeReason: string;
  nextSupportTypes: string[];
  nextSupportDetail: string;
  confirmations: string[];
  effectiveDate: string;
  staffName: string;
  writtenDate: string;
};

const emptyDraft: Draft = {
  nextTier: 1,
  nextTierLabel: "",
  nextHours: VOUCHER_HOURS[1],
  counselingNotes: "",
  changeReason: "",
  nextSupportTypes: [],
  nextSupportDetail: "",
  confirmations: [],
  effectiveDate: today,
  staffName: "",
  writtenDate: today,
};

export default function SalaryChanges() {
  const [searchParams] = useSearchParams();
  const { data: usersRaw, update: updateUser, loading, error } = useCollection<ServiceUser>(USERS_COLLECTION);
  const { data: documentsRaw, add: addDocument, update: updateDocument, loading: documentsLoading } = useCollection<SalaryChangeDocument>(SALARY_CHANGES_COLLECTION);
  const users = usersRaw || [];
  const documents = documentsRaw || [];
  const [selectedUserId, setSelectedUserId] = useState(searchParams.get("userId") || "");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [started, setStarted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingDocumentId, setEditingDocumentId] = useState<string | null>(null);

  if (loading || documentsLoading) return <div className="flex min-h-[280px] items-center justify-center text-muted-foreground">이용자 정보를 불러오는 중입니다...</div>;
  if (error) return <div className="rounded-lg border border-destructive/30 p-4 text-destructive">{error}</div>;

  const selectedUser = users.find((user) => user.id === selectedUserId);

  const startChange = () => {
    if (!selectedUser) {
      toast({ title: "이용자를 먼저 선택해 주세요.", variant: "destructive" });
      return;
    }
    if (!window.confirm("급여변경 사유서를 작성하시겠습니까?")) return;
    setDraft({
      ...emptyDraft,
      nextTier: selectedUser.voucherTier,
      nextTierLabel: selectedUser.voucherTierLabel || "",
      nextHours: Number(selectedUser.voucherHours || VOUCHER_HOURS[selectedUser.voucherTier] || 0),
      nextSupportTypes: [...(selectedUser.supportTypes || [])],
      effectiveDate: today,
      writtenDate: today,
    });
    setEditingDocumentId(null);
    setStarted(true);
  };


  const openDocument = (documentItem: SalaryChangeDocument & { id: string }) => {
    setSelectedUserId(documentItem.userId);
    setDraft({
      nextTier: documentItem.nextTier,
      nextTierLabel: documentItem.nextTierLabel || "",
      nextHours: documentItem.nextHours,
      counselingNotes: documentItem.counselingNotes,
      changeReason: documentItem.changeReason,
      nextSupportTypes: [...documentItem.nextSupportTypes],
      nextSupportDetail: documentItem.nextSupportDetail || "",
      confirmations: [...documentItem.confirmationItems],
      effectiveDate: documentItem.effectiveDate,
      staffName: documentItem.staffName,
      writtenDate: documentItem.writtenDate,
    });
    setEditingDocumentId(documentItem.id);
    setStarted(true);
  };
  const toggleSupport = (value: string) => {
    setDraft((previous) => ({
      ...previous,
      nextSupportTypes: previous.nextSupportTypes.includes(value)
        ? previous.nextSupportTypes.filter((item) => item !== value)
        : [...previous.nextSupportTypes, value],
    }));
  };

  const toggleConfirmation = (value: string) => {
    setDraft((previous) => ({
      ...previous,
      confirmations: previous.confirmations.includes(value)
        ? previous.confirmations.filter((item) => item !== value)
        : [...previous.confirmations, value],
    }));
  };

  const save = async () => {
    if (!selectedUser?.id) return;
    if (!draft.effectiveDate || !draft.changeReason.trim()) {
      const target = document.getElementById(!draft.effectiveDate ? "salary-effective-date" : "salary-change-reason");
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      (target as HTMLElement | null)?.focus();
      toast({ title: "저장할 수 없습니다.", description: !draft.effectiveDate ? "급여변경 적용일을 입력해 주세요." : "급여변경 사유를 입력해 주세요.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload: SalaryChangeDocument = {
        userId: selectedUser.id,
        userName: selectedUser.name,
        userPhone: selectedUser.phone,
        birthDate: selectedUser.birthDate,
        gender: selectedUser.gender,
        disabilityType: selectedUser.disabilityType,
        secondaryDisabilityType: selectedUser.secondaryDisabilityType,
        disabilityDegree: selectedUser.disabilityDegree,
        address: selectedUser.address,
        previousTier: selectedUser.voucherTier,
        previousTierLabel: selectedUser.voucherTierLabel,
        previousHours: Number(selectedUser.voucherHours || VOUCHER_HOURS[selectedUser.voucherTier] || 0),
        nextTier: draft.nextTier,
        nextTierLabel: draft.nextTierLabel || undefined,
        nextHours: draft.nextHours,
        counselingNotes: draft.counselingNotes,
        changeReason: draft.changeReason,
        previousSupportTypes: selectedUser.supportTypes || [],
        nextSupportTypes: draft.nextSupportTypes,
        nextSupportDetail: draft.nextSupportDetail || undefined,
        confirmationItems: draft.confirmations,
        effectiveDate: draft.effectiveDate,
        staffName: draft.staffName,
        writtenDate: draft.writtenDate,
      };
      let documentId = editingDocumentId;
      if (editingDocumentId) {
        await updateDocument(editingDocumentId, payload);
      } else {
        const ref = await addDocument(payload);
        documentId = ref.id;
        setEditingDocumentId(ref.id);
      }
      const history: VoucherChangeHistoryEntry = {
        id: "voucher-" + Date.now(),
        documentId: documentId || undefined,
        changeDate: draft.effectiveDate,
        previousTier: selectedUser.voucherTier,
        previousTierLabel: selectedUser.voucherTierLabel,
        previousHours: Number(selectedUser.voucherHours || VOUCHER_HOURS[selectedUser.voucherTier] || 0),
        nextTier: draft.nextTier,
        nextTierLabel: draft.nextTierLabel || undefined,
        nextHours: draft.nextHours,
        previousSupportTypes: selectedUser.supportTypes || [],
        nextSupportTypes: draft.nextSupportTypes,
      };
      await updateUser(selectedUser.id, {
        voucherTier: draft.nextTier,
        voucherTierLabel: draft.nextTier === 0 ? draft.nextTierLabel : "",
        voucherHours: draft.nextHours,
        supportTypes: draft.nextSupportTypes,
        voucherChangeHistory: editingDocumentId
          ? (selectedUser.voucherChangeHistory || []).map((item) => item.documentId === editingDocumentId ? history : item)
          : [...(selectedUser.voucherChangeHistory || []), history],
      });
      toast({ title: editingDocumentId ? "급여변경 사유서 수정 완료" : "급여변경 사유서 저장 완료", description: "변경 후 바우처와 지원종류가 이용자 기본정보에 반영되었습니다." });
    } catch (saveError) {
      console.error(saveError);
      toast({ title: "저장 실패", description: "네트워크와 입력 내용을 확인한 뒤 다시 시도해 주세요.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const currentTier = selectedUser ? formatVoucherTier(selectedUser) : "-";
  const nextTier = draft.nextTier === 0 ? draft.nextTierLabel || "직접 입력 구간" : String(draft.nextTier) + "구간";

  return (
    <div className="space-y-5">
      <style>{'@media print { @page { size: A4 portrait; margin: 12mm; } body * { visibility: hidden; } .salary-print, .salary-print * { visibility: visible; } .salary-print { position: absolute; inset: 0; width: 186mm; min-height: 273mm; padding: 0 !important; margin: 0 !important; box-sizing: border-box; font-size: 10pt; } .salary-print table, .salary-print tr, .salary-print td, .salary-print th { break-inside: avoid; page-break-inside: avoid; } .no-print { display: none !important; } }'}</style>
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">급여변경 사유서</h1>
          <p className="text-sm text-muted-foreground">이용자를 선택하고 변경 이력을 추가하면 A4 서식과 기본정보가 함께 저장됩니다.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-60">
            <Label>이용자</Label>
            <Select value={selectedUserId} onValueChange={(value) => { setSelectedUserId(value); setStarted(false); }}>
              <SelectTrigger><SelectValue placeholder="이용자 선택" /></SelectTrigger>
              <SelectContent>{users.map((user) => <SelectItem key={user.id} value={user.id}>{user.name} ({user.phone || "연락처 없음"})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button onClick={startChange}>바우처 변경 이력 추가</Button>
          <Button variant="outline" disabled={!started} onClick={() => window.print()}>A4 인쇄</Button>
        </div>
      </div>

      {documents.length > 0 && (
        <div className="no-print rounded-lg border bg-card p-4">
          <h2 className="mb-3 font-semibold">저장된 급여변경 사유서</h2>
          <div className="flex flex-wrap gap-2">
            {[...documents].sort((a, b) => String(b.effectiveDate).localeCompare(String(a.effectiveDate))).slice(0, 20).map((item) => (
              <Button key={item.id} variant={editingDocumentId === item.id ? "default" : "outline"} size="sm" onClick={() => openDocument(item)}>
                {item.effectiveDate} · {item.userName}
              </Button>
            ))}
          </div>
        </div>
      )}
      {!started || !selectedUser ? (
        <div className="no-print rounded-lg border border-dashed p-12 text-center text-muted-foreground">이용자를 선택한 뒤 바우처 변경 이력 추가를 눌러 주세요.</div>
      ) : (
        <>
          <div className="no-print grid gap-4 rounded-lg border bg-card p-4 md:grid-cols-2">
            <div><Label>변경 후 구간</Label><Select value={String(draft.nextTier)} onValueChange={(value) => setDraft((item) => ({ ...item, nextTier: Number(value), nextTierLabel: Number(value) === 0 ? item.nextTierLabel : "", nextHours: VOUCHER_HOURS[Number(value)] || item.nextHours }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.keys(VOUCHER_HOURS).map((value) => <SelectItem key={value} value={value}>{value}구간</SelectItem>)}<SelectItem value="0">직접 입력</SelectItem></SelectContent></Select></div>
            <div><Label>변경 후 시간</Label><Input type="number" min={0} value={draft.nextHours} onChange={(event) => setDraft((item) => ({ ...item, nextHours: Number(event.target.value) || 0 }))} /></div>
            {draft.nextTier === 0 && <div><Label>구간명</Label><Input value={draft.nextTierLabel} onChange={(event) => setDraft((item) => ({ ...item, nextTierLabel: event.target.value }))} /></div>}
            <div><Label>급여변경 적용일</Label><Input id="salary-effective-date" type="date" value={draft.effectiveDate} onChange={(event) => setDraft((item) => ({ ...item, effectiveDate: event.target.value }))} /></div>
            <div className="md:col-span-2"><Label>상담내역</Label><Textarea value={draft.counselingNotes} onChange={(event) => setDraft((item) => ({ ...item, counselingNotes: event.target.value }))} /><SpellCheckButton value={draft.counselingNotes} onApply={(value) => setDraft((item) => ({ ...item, counselingNotes: value }))} /></div>
            <div className="md:col-span-2"><Label>급여변경 사유</Label><Textarea id="salary-change-reason" value={draft.changeReason} onChange={(event) => setDraft((item) => ({ ...item, changeReason: event.target.value }))} /><SpellCheckButton value={draft.changeReason} onApply={(value) => setDraft((item) => ({ ...item, changeReason: value }))} /></div>
            <div className="md:col-span-2"><Label>변경 후 지원종류</Label><div className="flex flex-wrap gap-3">{SUPPORT_TYPES.map((type) => <label key={type} className="flex items-center gap-2"><Checkbox checked={draft.nextSupportTypes.includes(type)} onCheckedChange={() => toggleSupport(type)} />{type}</label>)}</div><Input className="mt-2" placeholder="추가 지원내용 직접 입력" value={draft.nextSupportDetail} onChange={(event) => setDraft((item) => ({ ...item, nextSupportDetail: event.target.value }))} /></div>
            <div><Label>담당자</Label><Input value={draft.staffName} onChange={(event) => setDraft((item) => ({ ...item, staffName: event.target.value }))} /></div>
            <div><Label>작성일자</Label><Input type="date" value={draft.writtenDate} onChange={(event) => setDraft((item) => ({ ...item, writtenDate: event.target.value }))} /></div>
            <div className="md:col-span-2 flex flex-wrap gap-3">{CONFIRMATIONS.map((item) => <label key={item} className="flex items-center gap-2"><Checkbox checked={draft.confirmations.includes(item)} onCheckedChange={() => toggleConfirmation(item)} />{item}</label>)}</div>
            <div className="md:col-span-2 flex justify-end"><Button disabled={saving} onClick={save}>{saving ? "저장 중..." : "저장 및 이용자 정보 반영"}</Button></div>
          </div>

          <article className="salary-print mx-auto w-full max-w-[794px] bg-white p-5 text-black shadow">
            <header className="mb-4 grid grid-cols-[1fr_84px] items-stretch gap-4">
              <h2 className="flex items-center justify-center text-center text-2xl font-bold underline">급여변경 사유서 【상담내역포함】</h2>
              <div className="grid grid-rows-2 border border-black text-center"><div className="border-b border-black p-2 text-xs">센터장</div><div /></div>
            </header>
            <table className="w-full border-collapse text-[12px] leading-relaxed">
              <tbody>
                <tr><th className="w-20 border border-black p-2" rowSpan={3}>이용자<br/>기본정보</th><th className="border border-black p-2">성명</th><td className="border border-black p-2">{selectedUser.name}</td><th className="border border-black p-2">생년월일</th><td className="border border-black p-2">{selectedUser.birthDate || "-"}</td><th className="border border-black p-2">성별</th><td className="border border-black p-2">{selectedUser.gender}</td></tr>
                <tr><th className="border border-black p-2">연락처</th><td className="border border-black p-2">{selectedUser.phone}</td><th className="border border-black p-2">장애유형</th><td className="border border-black p-2">{[selectedUser.disabilityType, selectedUser.secondaryDisabilityType].filter(Boolean).join(" / ")}</td><th className="border border-black p-2">장애정도</th><td className="border border-black p-2">{selectedUser.disabilityDegree || "-"}</td></tr>
                <tr><th className="border border-black p-2">주소</th><td className="border border-black p-2" colSpan={5}>{selectedUser.address || "-"}</td></tr>
                <tr><th className="border border-black p-2">서비스<br/>구간(시간)</th><th className="border border-black p-2">현재</th><td className="border border-black p-2" colSpan={2}>{currentTier} / {selectedUser.voucherHours || 0}시간</td><th className="border border-black p-2">변경 후</th><td className="border border-black p-2" colSpan={2}>{nextTier} / {draft.nextHours}시간</td></tr>
                <tr><th className="border border-black p-2">상담내역</th><td className="min-h-24 whitespace-pre-wrap border border-black p-2" colSpan={6}>{draft.counselingNotes || " "}</td></tr>
                <tr><th className="border border-black p-2">급여변경사유</th><td className="min-h-16 whitespace-pre-wrap border border-black p-2" colSpan={6}>{draft.changeReason || " "}</td></tr>
                <tr><th className="border border-black p-2">급여제공<br/>현재내역</th><td className="border border-black p-2" colSpan={6}>{(selectedUser.supportTypes || []).join(", ") || "-"}</td></tr>
                <tr><th className="border border-black p-2">급여제공<br/>변경내역</th><td className="border border-black p-2" colSpan={6}>{draft.nextSupportTypes.join(", ")}{draft.nextSupportDetail ? " / " + draft.nextSupportDetail : ""}</td></tr>
                <tr><th className="border border-black p-2">확인 사항</th><td className="border border-black p-2" colSpan={6}>{CONFIRMATIONS.map((item) => <div key={item}>{draft.confirmations.includes(item) ? "☑" : "☐"} {item}</div>)}</td></tr>
                <tr><th className="border border-black p-2">급여변경<br/>적용일</th><td className="border border-black p-2" colSpan={6}>{draft.effectiveDate} 부터</td></tr>
              </tbody>
            </table>
            <div className="mt-4 text-center">담당자(전담관리인력): {draft.staffName || "　　　　　　"} (서명)</div>
            <div className="mt-3 text-center">{draft.writtenDate}</div>
            <img src={dongbaekLogo} alt="부천의료복지사회적협동조합 동백 장애인활동지원센터" className="mx-auto mt-4 h-12 w-auto max-w-full object-contain" />
          </article>
        </>
      )}
    </div>
  );
}