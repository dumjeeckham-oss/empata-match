import { useMemo, useState, useEffect } from "react";
import { useCollection } from "@/hooks/useFirestore";
import { type Worker, type ServiceUser, type CounselingRecord, type MatchingHistoryRecord, WORKER_REJECTION_TYPES, EXPERIENCE_OPTIONS, SUPPORT_TYPES } from "@/types";
import { geocodeAddress } from "@/lib/kakao";
import { BulkUploadDialog } from "@/components/BulkUploadDialog";
import { MultiEntitySelect } from "@/components/MultiEntitySelect";
import {
  rowsToEntities,
  rowToWorker,
  upsertByNamePhoneBatch,
  type FieldKey,
  type ParsedSheet,
} from "@/lib/bulkUpload";
import { USERS_COLLECTION, WORKERS_COLLECTION, MATCHING_HISTORY_COLLECTION } from "@/lib/collectionNames";
import {
  buildUserArraysFromIds,
  formatUserList,
  syncWorkerToUsers,
} from "@/lib/assignments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import * as XLSX from "xlsx";
import { toast } from "@/hooks/use-toast";
import { Trash2, PhoneCall, Edit3 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { WeeklySchedulePicker } from "@/components/WeeklySchedulePicker";

const emptyWorker: Omit<Worker, "id" | "createdAt" | "updatedAt"> = {
  name: "", age: 0, gender: "여성", phone: "", residenceArea: "", preferredArea: "",
  address: "", experience: "경력없음", availableDays: "", availableHours: "",
  rejectionTypes: [], rejectedTasks: "", canDrive: false, animalAllergy: false,
  isForeigner: false, hasF4: false, hasF5: false,
  certificateNumber: "", contractStatus: "대기", serviceStartDate: "", resignationDate: "", notes: "",
  assignedUserIds: [], assignedUserNames: [], assignedUserPhones: [],
  supportTypes: [],
  certificates: [],
  receiptDate: "",
};

const WORKER_PREVIEW_COLUMNS: { key: FieldKey; label: string }[] = [
  { key: "name", label: "이름" },
  { key: "gender", label: "성별" },
  { key: "phone", label: "연락처" },
  { key: "age", label: "나이" },
  { key: "residenceArea", label: "거주지역" },
  { key: "preferredArea", label: "희망지역" },
  { key: "address", label: "주소" },
  { key: "experience", label: "경력" },
  { key: "contractStatus", label: "근무상태" },
  { key: "assignedUserName", label: "담당이용자" },
];

const DISPLAY_AS_OF_DATE = new Date(2026, 5, 2);

function parseDisplayDate(value: unknown): Date | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const serial = Number(raw);
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
    const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const compact = raw.match(/^(\d{4})[-./\s]?(\d{1,2})[-./\s]?(\d{1,2})$/);
  if (compact) {
    const [, y, m, d] = compact;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function calculateDisplayExperience(serviceStartDate: unknown, fallback: string): string {
  const start = parseDisplayDate(serviceStartDate);
  if (!start || start > DISPLAY_AS_OF_DATE) return fallback;

  let totalMonths =
    (DISPLAY_AS_OF_DATE.getFullYear() - start.getFullYear()) * 12 +
    (DISPLAY_AS_OF_DATE.getMonth() - start.getMonth());
  if (DISPLAY_AS_OF_DATE.getDate() < start.getDate()) totalMonths -= 1;
  if (totalMonths < 0) return fallback;
  if (totalMonths === 0) return "1개월 미만";

  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  if (years > 0 && months > 0) return `${years}년 ${months}개월`;
  if (years > 0) return `${years}년`;
  return `${months}개월`;
}

function toDisplayWorker(worker: Worker & { id: string }): Worker & { id: string } {
  const hasServiceStartDate = String(worker.serviceStartDate ?? "").trim() !== "";
  const hasResignationDate = String(worker.resignationDate ?? "").trim() !== "";

  return {
    ...worker,
    contractStatus: hasServiceStartDate && !hasResignationDate ? "근무중" : worker.contractStatus,
    experience: hasServiceStartDate
      ? calculateDisplayExperience(worker.serviceStartDate, worker.experience || "경력없음")
      : worker.experience,
  };
}

const WorkerManagement = () => {
  const [searchParams] = useSearchParams();
  const { data: workersRaw, add, update, remove, loading, error: workersError } = useCollection<Worker>(WORKERS_COLLECTION);
  const { data: usersRaw, update: updateUser } = useCollection<ServiceUser>(USERS_COLLECTION);
  const { data: counselingRecords } = useCollection<CounselingRecord>("counseling");
  const { data: matchingHistory } = useCollection<MatchingHistoryRecord>(MATCHING_HISTORY_COLLECTION);

  // undefined 방어벽 — 데이터가 준비되지 않았을 때도 filter/map/find 에러 방지
  const workers = workersRaw || [];
  const users = usersRaw || [];
  const counselingLogs = counselingRecords || [];
  const matchingLogs = matchingHistory || [];

  const displayWorkers = useMemo(() => workers.map(toDisplayWorker), [workers]);
  const [form, setForm] = useState(emptyWorker);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<(Worker & { id: string }) | null>(null);
  const [expandedCounselId, setExpandedCounselId] = useState<string | null>(null);
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [geocoding, setGeocoding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<(Worker & { id: string }) | null>(null);

  useEffect(() => {
    const filter = searchParams.get("status");
    if (filter) {
      setStatusFilter(filter);
    }
  }, [searchParams]);

  const handleAutoGeocode = async (address: string) => {
    if (!address || (form.lat && form.lng)) return;
    setGeocoding(true);
    const result = await geocodeAddress(address);
    if (result) {
      setForm((f) => ({ ...f, lat: result.lat, lng: result.lng }));
      toast({ title: "자동 주소 변환 완료" });
    }
    setGeocoding(false);
  };

  const handleGeocode = async () => {
    if (!form.address) return;
    setGeocoding(true);
    const result = await geocodeAddress(form.address);
    if (result) {
      setForm((f) => ({ ...f, lat: result.lat, lng: result.lng }));
      toast({ title: "주소 변환 완료" });
    } else {
      toast({ title: "주소 변환 실패", variant: "destructive" });
    }
    setGeocoding(false);
  };

  const geocodeIfNeeded = async (item: Omit<Worker, "id" | "createdAt" | "updatedAt">) => {
    const copy = { ...item };
    if (copy.address && !copy.lat) {
      const geo = await geocodeAddress(copy.address);
      if (geo) {
        copy.lat = geo.lat;
        copy.lng = geo.lng;
      }
    }
    return copy;
  };

  const handleSave = async () => {
    if (!form.name || !form.phone) {
      toast({ title: "필수 항목을 입력해주세요", variant: "destructive" });
      return;
    }
    if (!form.lat && form.address) await handleGeocode();

    const uniqueUserIds = Array.from(new Set(form.assignedUserIds || []));
    const arrays = buildUserArraysFromIds(uniqueUserIds, users);
    const payload = {
      ...form,
      assignedUserIds: arrays.ids,
      assigned_users: arrays.ids,
      assignedUserNames: arrays.names,
      assignedUserPhones: arrays.phones,
      txtHSex: form.gender,
      receiptDate: form.receiptDate || new Date().toISOString().slice(0, 10),
    };
    const prevUserIds = editingId
      ? workers.find((w) => w.id === editingId)?.assignedUserIds ?? []
      : [];

    let savedId = editingId;
    const duplicateName = workers.find((w) =>
      w.name === form.name && w.id !== editingId && w.phone !== form.phone
    );
    if (duplicateName) {
      toast({
        title: "동명이인 주의",
        description: `${form.name} 이름이 이미 등록된 활동지원사가 있습니다. 연락처를 확인하세요.`,
        variant: "warning",
      });
    }

    if (editingId) {
      await update(editingId, payload);
      toast({ title: "수정 완료" });
    } else {
      const ref = await add(payload as Omit<Worker, "id">);
      savedId = ref.id;
      toast({ title: "등록 완료" });
    }
    if (savedId) {
      await syncWorkerToUsers(savedId, payload, users, prevUserIds, updateUser);
    }
    setForm(emptyWorker);
    setEditingId(null);
    setDialogOpen(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget?.id) return;
    await remove(deleteTarget.id);
    toast({ title: "삭제 완료", description: `${deleteTarget.name} 님의 정보가 삭제되었습니다.` });
    setDeleteTarget(null);
  };

  const handleBulkConfirm = async (items: Omit<Worker, "id" | "createdAt" | "updatedAt">[]) => {
    try {
      console.log("[WorkerManagement] bulk confirm start:", items.length);
      return await upsertByNamePhoneBatch({
        collectionName: WORKERS_COLLECTION,
        items,
        existing: workers,
        beforeSave: geocodeIfNeeded,
        onSaved: async (workerId, item, isUpdate) => {
          if (!item.assignedUserIds?.length) return;
          const prev = isUpdate
            ? workers.find((w) => w.id === workerId)?.assignedUserIds ?? []
            : [];
          await syncWorkerToUsers(workerId, item, users, prev, updateUser);
        },
      });
    } catch (e: any) {
      console.error("[WorkerManagement] 업로드 확정 처리 중 치명적 에러:", e);
      alert(
        `❌ 업로드 준비 중 오류 발생!\n` +
          `이 단계에서 코드가 멈췄습니다: 활동지원사 업로드 확정(handleBulkConfirm)\n` +
          `사유: ${e?.message ?? String(e)}\n` +
          (e?.stack ? `\n[stack]\n${e.stack}` : "")
      );
      throw e;
    }
  };

  const mapWorkerRows = (sheet: ParsedSheet) => {
    try {
      console.log("[WorkerManagement] mapWorkerRows start");
      return rowsToEntities(sheet, (row, headerMap) => {
        const entity = rowToWorker(row, headerMap, users);
        if (!entity.name && !entity.phone) return null;
        return entity;
      });
    } catch (e: any) {
      console.error("[WorkerManagement] 엑셀 파싱/매핑 중 치명적 에러:", e);
      alert(
        `❌ 업로드 준비 중 오류 발생!\n` +
          `이 단계에서 코드가 멈췄습니다: 활동지원사 엑셀 매핑(mapWorkerRows)\n` +
          `사유: ${e?.message ?? String(e)}\n` +
          (e?.stack ? `\n[stack]\n${e.stack}` : "")
      );
      return [];
    }
  };

  const getWorkerPreviewValue = (item: Omit<Worker, "id">, key: FieldKey): string => {
    const map: Record<string, string | number | boolean> = {
      name: item.name,
      gender: item.gender,
      phone: item.phone,
      age: item.age,
      residenceArea: item.residenceArea,
      preferredArea: item.preferredArea,
      address: item.address,
      experience: item.experience,
      contractStatus: item.contractStatus,
      assignedUserName: item.assignedUserNames?.join(", "),
    };
    return String(map[key] ?? "");
  };

  const openDetail = (worker: Worker & { id: string }) => {
    setDetailTarget(worker);
    setExpandedCounselId(null);
    setExpandedMatchId(null);
  };

  const startEdit = (w: Worker & { id: string }) => {
    const source = workers.find((worker) => worker.id === w.id) ?? w;
    setForm({
      ...source,
      assignedUserIds: source.assignedUserIds ?? [],
      assignedUserNames: source.assignedUserNames ?? [],
      assignedUserPhones: source.assignedUserPhones ?? [],
    });
    setEditingId(source.id);
    setDialogOpen(true);
  };

  const downloadExcel = () => {
    const data = getFiltered().map((w) => ({
      이름: w.name, 나이: w.age, 성별: w.gender, 연락처: w.phone,
      거주지역: w.residenceArea, 희망지역: w.preferredArea, 주소: w.address,
      경력: w.experience, 근무가능요일: w.availableDays, 근무가능시간: w.availableHours,
      거부업무: w.rejectionTypes?.join(","), 거부업무상세: w.rejectedTasks,
      운전가능: w.canDrive ? "예" : "아니오", 동물알러지: w.animalAllergy ? "예" : "아니오",
      이수증번호: w.certificateNumber, 근무상태: w.contractStatus,
      담당이용자: w.assignedUserNames?.join(", "), 최초접수일: w.receiptDate,
      최초근무일: w.serviceStartDate, 퇴사일: w.resignationDate, 비고: w.notes,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "활동지원사목록");
    XLSX.writeFile(wb, `활동지원사목록_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const downloadTemplate = () => {
    const template = [{
      이름: "", 나이: "", 성별: "여성", 연락처: "", 거주지역: "", 희망지역: "", 주소: "",
      경력: "경력없음", 근무가능요일: "월,화,수", 근무가능시간: "09:00-18:00",
      거부업무: "", 거부업무상세: "", 운전가능: "예", 동물알러지: "아니오",
      이수증번호: "", 근무상태: "대기", 담당이용자: "홍길동, 김영희", 최초근무일: "", 퇴사일: "", 비고: "",
    }];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "업로드양식");
    XLSX.writeFile(wb, "활동지원사_업로드양식.xlsx");
  };

  const selectedCounselingLogs = useMemo(() => {
    if (!detailTarget) return [];
    return counselingLogs
      .filter((record) => record.targetType === "활동지원사" && record.targetId === detailTarget.id)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [counselingLogs, detailTarget]);

  const selectedMatchingLogs = useMemo(() => {
    if (!detailTarget) return [];
    return matchingLogs
      .filter((record) => record.workerId === detailTarget.id)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [matchingLogs, detailTarget]);

  const getFiltered = () => {
    return (displayWorkers || []).filter((w) => {
      const matchesName = String(w.name || "").includes(search);
      const matchesPhone = String(w.phone || "").includes(search);
      const matchSearch = !search || matchesName || matchesPhone;
      
      // 대기중 필터: 미배정 활동지원사만 표시
      if (statusFilter === "대기") {
        const isUnmatched = !w.assignedUserIds || w.assignedUserIds.length === 0;
        return matchSearch && w.contractStatus === "대기" && isUnmatched;
      }
      
      const matchStatus = statusFilter === "all" || String(w.contractStatus || "") === statusFilter;
      return matchSearch && matchStatus;
    });
  };

  const filtered = getFiltered();

  // ── 로딩 가드: 데이터가 완전히 로드될 때까지 안전하게 대기 ──
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">활동지원사 데이터를 안전하게 불러오는 중입니다...</p>
        </div>
      </div>
    );
  }

  const toggleRejection = (value: string) => {
    setForm((f) => ({
      ...f,
      rejectionTypes: f.rejectionTypes.includes(value) ? f.rejectionTypes.filter((v) => v !== value) : [...f.rejectionTypes, value],
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-header mb-0">활동지원사 관리</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={downloadTemplate}>📥 업로드양식</Button>
          <BulkUploadDialog
            title="활동지원사 일괄 업로드"
            mapRows={mapWorkerRows}
            onConfirm={handleBulkConfirm}
            previewColumns={WORKER_PREVIEW_COLUMNS}
            getPreviewValue={getWorkerPreviewValue}
          />
          <Button variant="outline" size="sm" onClick={downloadExcel}>📊 엑셀 다운로드</Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { setForm(emptyWorker); setEditingId(null); }}>+ 신규등록</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingId ? "활동지원사 수정" : "활동지원사 신규등록"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>이름 *</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
                  <div><Label>연락처 *</Label><Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="010-0000-0000" /></div>
                  <div>
                    <Label>성별</Label>
                    <Select value={form.gender} onValueChange={(v) => setForm((f) => ({ ...f, gender: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="남성">남성</SelectItem><SelectItem value="여성">여성</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>나이 (출생연도 입력가능)</Label>
                    <Input
                      type="number"
                      value={form.age || ""}
                      onChange={(e) => {
                        let val = Number(e.target.value);
                        if (val > 1900) val = new Date().getFullYear() - val;
                        setForm((f) => ({ ...f, age: val }));
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>지원 가능 종류</Label>
                  <div className="flex flex-wrap gap-4">
                    {SUPPORT_TYPES.map((t) => (
                      <div key={t} className="flex items-center space-x-2">
                        <Checkbox
                          id={`support-${t}`}
                          checked={form.supportTypes?.includes(t)}
                          onCheckedChange={(checked) => {
                            setForm((f) => ({
                              ...f,
                              supportTypes: checked
                                ? [...(f.supportTypes || []), t]
                                : (f.supportTypes || []).filter((v) => v !== t),
                            }));
                          }}
                        />
                        <label htmlFor={`support-${t}`} className="text-sm">{t}</label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>희망 활동 시간 및 요일 (드래그하여 선택)</Label>
                  <WeeklySchedulePicker value={form.weeklySchedule} onChange={(s) => setForm((f) => ({ ...f, weeklySchedule: s }))} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label>주소</Label>
                    <div className="flex gap-2">
                      <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} onBlur={(e) => handleAutoGeocode(e.target.value)} />
                      <Button variant="outline" size="sm" onClick={handleGeocode} disabled={geocoding}>{geocoding ? "변환중..." : "좌표변환"}</Button>
                    </div>
                  </div>
                  <div><Label>거주지역</Label><Input value={form.residenceArea} onChange={(e) => setForm((f) => ({ ...f, residenceArea: e.target.value }))} placeholder="예: 구로구" /></div>
                  <div><Label>희망지역</Label><Input value={form.preferredArea} onChange={(e) => setForm((f) => ({ ...f, preferredArea: e.target.value }))} placeholder="예: 구로구, 금천구" /></div>
                </div>

                <div className="space-y-2">
                  <Label>거부하는 지원 업무</Label>
                  <div className="flex flex-wrap gap-4">
                    {WORKER_REJECTION_TYPES.map((type) => (
                      <div key={type} className="flex items-center space-x-2">
                        <Checkbox id={type} checked={form.rejectionTypes.includes(type)} onCheckedChange={() => toggleRejection(type)} />
                        <Label htmlFor={type} className="text-sm font-normal">{type}</Label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>추가 정보</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center space-x-2"><Checkbox id="isForeigner" checked={form.isForeigner} onCheckedChange={(checked) => setForm((f) => ({ ...f, isForeigner: !!checked }))} /><Label htmlFor="isForeigner">외국인</Label></div>
                    <div className="flex items-center space-x-2"><Checkbox id="hasF4" checked={form.hasF4} onCheckedChange={(checked) => setForm((f) => ({ ...f, hasF4: !!checked }))} /><Label htmlFor="hasF4">F4 여부</Label></div>
                    <div className="flex items-center space-x-2"><Checkbox id="hasF5" checked={form.hasF5} onCheckedChange={(checked) => setForm((f) => ({ ...f, hasF5: !!checked }))} /><Label htmlFor="hasF5">F5 여부</Label></div>
                    <div className="flex items-center space-x-2"><Checkbox id="canDrive" checked={form.canDrive} onCheckedChange={(checked) => setForm((f) => ({ ...f, canDrive: !!checked }))} /><Label htmlFor="canDrive">운전가능</Label></div>
                    <div className="flex items-center space-x-2"><Checkbox id="animalAllergy" checked={form.animalAllergy} onCheckedChange={(checked) => setForm((f) => ({ ...f, animalAllergy: !!checked }))} /><Label htmlFor="animalAllergy">동물알러지</Label></div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>경력</Label>
                  <Select value={form.experience} onValueChange={(v) => setForm((f) => ({ ...f, experience: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{EXPERIENCE_OPTIONS.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>보유 자격증 (콤마로 구분)</Label>
                  <Input
                    value={form.certificates?.join(", ") || ""}
                    onChange={(e) => setForm((f) => ({ ...f, certificates: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) }))}
                    placeholder="요양보호사, 사회복지사 등"
                  />
                </div>

                <div className="space-y-2">
                  <Label>특이사항</Label>
                  <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
                </div>

                <div className="border-t pt-4 grid grid-cols-2 gap-4">
                  <div><Label>최초 접수일</Label><Input type="date" value={form.receiptDate} onChange={(e) => setForm((f) => ({ ...f, receiptDate: e.target.value }))} /></div>
                  <div>
                    <Label>근무상태</Label>
                    <Select value={form.contractStatus} onValueChange={(v) => setForm((f) => ({ ...f, contractStatus: v as any }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="근무중">근무중</SelectItem><SelectItem value="대기">대기</SelectItem><SelectItem value="퇴사">퇴사</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div><Label>최초 근무일</Label><Input type="date" value={form.serviceStartDate} onChange={(e) => setForm((f) => ({ ...f, serviceStartDate: e.target.value }))} /></div>
                  <div className="col-span-2">
                    <Label>담당 이용자 (N:M)</Label>
                    <MultiEntitySelect
                      label="담당 이용자"
                      options={users.map((u) => ({ id: u.id || "", label: u.name, sublabel: String(u.phone || "") }))}
                      selectedIds={form.assignedUserIds || []}
                      onChange={(ids) => setForm((f) => ({ ...f, assignedUserIds: ids }))}
                      placeholder="이용자 선택..."
                    />
                  </div>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
                <Button onClick={handleSave}>저장</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex-1">
          <Input placeholder="이름 또는 연락처로 검색..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full md:w-auto">
          <TabsList>
            <TabsTrigger value="all">전체</TabsTrigger>
            <TabsTrigger value="근무중">근무중</TabsTrigger>
            <TabsTrigger value="대기">대기</TabsTrigger>
            <TabsTrigger value="퇴사">퇴사</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((w) => (
          <Card key={w.id} className="stat-card group">
            <CardContent className="p-4 cursor-pointer" onClick={() => openDetail(w as any)}>
              <div className="flex justify-between items-start mb-2">
                <div>
                  <span className="font-bold text-lg">{w.name}</span>
                  <div className="flex flex-wrap gap-2 text-sm text-muted-foreground mt-1">
                    <span>{w.gender} · {w.age}세</span>
                    {w.isForeigner && <Badge variant="secondary">외국인</Badge>}
                    {w.hasF4 && <Badge variant="outline">F4</Badge>}
                    {w.hasF5 && <Badge variant="outline">F5</Badge>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={w.contractStatus === "근무중" ? "default" : w.contractStatus === "대기" ? "secondary" : "destructive"}>
                    {w.contractStatus}
                  </Badge>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); startEdit(w as any); }}
                    className="text-primary hover:text-primary/90"
                    aria-label="수정"
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(w as any); }}
                    className="text-destructive hover:text-destructive/90"
                    aria-label="삭제"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="space-y-1 text-sm">
                <p>
                  <span className="text-muted-foreground">연락처:</span>{" "}
                  <a
                    href={`tel:${w.phone}`}
                    className="text-primary hover:underline inline-flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <PhoneCall className="w-3 h-3" />
                    {w.phone}
                  </a>
                </p>
                <p><span className="text-muted-foreground">경력:</span> {w.experience}</p>
                <p><span className="text-muted-foreground">최초접수:</span> {w.receiptDate || "미등록"}</p>
                <p><span className="text-muted-foreground">담당이용자:</span> {formatUserList(w)}</p>
                {w.contractStatus === "퇴사" && w.resignationDate && (
                  <p className="text-destructive"><span className="text-muted-foreground">퇴사일:</span> {w.resignationDate}</p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>정말 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.name} 님의 모든 정보가 영구적으로 삭제됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!detailTarget} onOpenChange={(open) => !open && setDetailTarget(null)}>
        <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detailTarget ? `${detailTarget.name} 상세 정보` : "활동지원사 상세"}</DialogTitle>
          </DialogHeader>
          {detailTarget && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">이름</p>
                  <p className="font-medium">{detailTarget.name}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">최초 접수일</p>
                  <p className="font-medium">{detailTarget.receiptDate || "미등록"}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">근무상태</p>
                  <p className="font-medium">{detailTarget.contractStatus}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">담당 이용자</p>
                  <p className="font-medium">{formatUserList(detailTarget) || "없음"}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-semibold">📝 상담 이력 ({selectedCounselingLogs.length}건)</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {selectedCounselingLogs.length === 0 ? (
                      <p className="text-sm text-muted-foreground">기록된 상담 이력이 없습니다.</p>
                    ) : (
                      selectedCounselingLogs.map((record) => (
                        <div key={record.id || `${record.date}-${record.counselorName}`} className="border rounded-lg p-3 hover:bg-muted cursor-pointer" onClick={() => setExpandedCounselId(expandedCounselId === record.id ? null : record.id)}>
                          <div className="flex justify-between items-start gap-3">
                            <div>
                              <p className="font-semibold">{record.date} · {record.category}</p>
                              <p className="text-sm text-muted-foreground">{record.counselorName || "상담사 미등록"}</p>
                            </div>
                            <span className="text-xs text-muted-foreground">{expandedCounselId === record.id ? "접기" : "펼치기"}</span>
                          </div>
                          {expandedCounselId === record.id && (
                            <div className="mt-3 text-sm whitespace-pre-wrap">{record.content}</div>
                          )}
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-semibold">🔗 매칭 이력 ({selectedMatchingLogs.length}건)</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {selectedMatchingLogs.length === 0 ? (
                      <p className="text-sm text-muted-foreground">기록된 매칭 이력이 없습니다.</p>
                    ) : (
                      selectedMatchingLogs.map((match) => (
                        <div key={match.id || `${match.date}-${match.userId}`} className="border rounded-lg p-3 hover:bg-muted cursor-pointer" onClick={() => setExpandedMatchId(expandedMatchId === match.id ? null : match.id)}>
                          <div className="flex justify-between items-start gap-3">
                            <div>
                              <p className="font-semibold">{match.date} · {match.type}</p>
                              <p className="text-sm text-muted-foreground">{match.userName} · {match.userPhone}</p>
                            </div>
                            <span className="text-xs text-muted-foreground">{expandedMatchId === match.id ? "접기" : "펼치기"}</span>
                          </div>
                          {expandedMatchId === match.id && (
                            <div className="mt-3 text-sm whitespace-pre-wrap">{match.notes || "상세 없음"}</div>
                          )}
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => detailTarget && startEdit(detailTarget)}>수정</Button>
                <Button onClick={() => setDetailTarget(null)}>닫기</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WorkerManagement;
