import { useState } from "react";
import { useCollection } from "@/hooks/useFirestore";
import { type Worker, WORKER_REJECTION_TYPES, EXPERIENCE_OPTIONS } from "@/types";
import { geocodeAddress } from "@/lib/kakao";
import { BulkUploadDialog } from "@/components/BulkUploadDialog";
import {
  rowsToEntities,
  rowToWorker,
  upsertByNamePhone,
  type FieldKey,
  type ParsedSheet,
} from "@/lib/bulkUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
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
import { Trash2 } from "lucide-react";

const emptyWorker: Omit<Worker, "id" | "createdAt" | "updatedAt"> = {
  name: "", age: 0, gender: "여성", phone: "", residenceArea: "", preferredArea: "",
  address: "", experience: "경력없음", availableDays: "", availableHours: "",
  rejectionTypes: [], rejectedTasks: "", canDrive: false, animalAllergy: false,
  certificateNumber: "", contractStatus: "대기", serviceStartDate: "", resignationDate: "", notes: "",
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
];

const WorkerManagement = () => {
  const { data: workers, add, update, remove, loading } = useCollection<Worker>("workers");
  const [form, setForm] = useState(emptyWorker);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [geocoding, setGeocoding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<(Worker & { id: string }) | null>(null);

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

    const payload = { ...form };
    if (editingId) {
      await update(editingId, payload);
      toast({ title: "수정 완료" });
    } else {
      await add(payload as Omit<Worker, "id">);
      toast({ title: "등록 완료" });
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
    return upsertByNamePhone(
      items,
      workers,
      (item) => add(item),
      (id, item) => update(id, item),
      geocodeIfNeeded
    );
  };

  const mapWorkerRows = (sheet: ParsedSheet) =>
    rowsToEntities(sheet, (row, headerMap) => {
      const entity = rowToWorker(row, headerMap);
      if (!entity.name && !entity.phone) return null;
      return entity;
    });

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
    };
    return String(map[key] ?? "");
  };

  const startEdit = (w: Worker & { id: string }) => {
    setForm({ ...w });
    setEditingId(w.id);
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
      이수증번호: "", 근무상태: "대기", 최초근무일: "", 퇴사일: "", 비고: "",
    }];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "업로드양식");
    XLSX.writeFile(wb, "활동지원사_업로드양식.xlsx");
  };

  const getFiltered = () => {
    return workers.filter((w) => {
      const matchSearch = !search || w.name.includes(search) || w.phone.includes(search);
      const matchStatus = statusFilter === "all" || w.contractStatus === statusFilter;
      return matchSearch && matchStatus;
    });
  };

  const filtered = getFiltered();

  const toggleRejection = (value: string) => {
    setForm((f) => ({
      ...f,
      rejectionTypes: f.rejectionTypes.includes(value) ? f.rejectionTypes.filter((v) => v !== value) : [...f.rejectionTypes, value],
    }));
  };

  return (
    <div>
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
              <div className="grid grid-cols-2 gap-4">
                <div><Label>이름 *</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
                <div><Label>나이 (출생연도 입력가능)</Label><Input type="number" value={form.age || ""} onChange={(e) => {
                  let val = Number(e.target.value);
                  if (val > 1900) val = new Date().getFullYear() - val;
                  setForm((f) => ({ ...f, age: val }));
                }} /></div>
                <div><Label>성별</Label>
                  <Select value={form.gender} onValueChange={(v) => setForm((f) => ({ ...f, gender: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="남성">남성</SelectItem><SelectItem value="여성">여성</SelectItem></SelectContent>
                  </Select>
                </div>
                <div><Label>연락처 *</Label><Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="010-0000-0000" /></div>
                <div><Label>거주지역</Label><Input value={form.residenceArea} onChange={(e) => setForm((f) => ({ ...f, residenceArea: e.target.value }))} /></div>
                <div><Label>희망지역</Label><Input value={form.preferredArea} onChange={(e) => setForm((f) => ({ ...f, preferredArea: e.target.value }))} /></div>
                <div className="col-span-2">
                  <Label>주소</Label>
                  <div className="flex gap-2">
                    <Input className="flex-1" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value, lat: undefined, lng: undefined }))} onBlur={(e) => handleAutoGeocode(e.target.value)} placeholder="부천시 원미구..." />
                    <Button type="button" variant="outline" onClick={handleGeocode} disabled={geocoding}>{geocoding ? "변환중..." : "📍 좌표변환"}</Button>
                  </div>
                  {form.lat && <p className="text-xs text-muted-foreground mt-1">위도: {form.lat.toFixed(4)}, 경도: {form.lng?.toFixed(4)}</p>}
                </div>
                <div><Label>경력</Label>
                  <Select value={form.experience} onValueChange={(v) => setForm((f) => ({ ...f, experience: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{EXPERIENCE_OPTIONS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>이수증번호</Label><Input value={form.certificateNumber} onChange={(e) => setForm((f) => ({ ...f, certificateNumber: e.target.value }))} /></div>
                <div><Label>근무가능 요일</Label><Input value={form.availableDays} onChange={(e) => setForm((f) => ({ ...f, availableDays: e.target.value }))} placeholder="월,화,수,목,금" /></div>
                <div><Label>근무가능 시간</Label><Input value={form.availableHours} onChange={(e) => setForm((f) => ({ ...f, availableHours: e.target.value }))} placeholder="09:00-18:00" /></div>
                <div className="col-span-2">
                  <Label>거부/기피 성향</Label>
                  <div className="flex gap-4 mt-1 flex-wrap">
                    {WORKER_REJECTION_TYPES.map((t) => (
                      <label key={t} className="flex items-center gap-2 text-sm">
                        <Checkbox checked={form.rejectionTypes.includes(t)} onCheckedChange={() => toggleRejection(t)} />{t}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="col-span-2"><Label>거부업무 상세</Label><Textarea value={form.rejectedTasks} onChange={(e) => setForm((f) => ({ ...f, rejectedTasks: e.target.value }))} placeholder="거부하는 업무 상세 내용..." /></div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.canDrive} onCheckedChange={(c) => setForm((f) => ({ ...f, canDrive: !!c }))} />운전가능</label>
                  <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.animalAllergy} onCheckedChange={(c) => setForm((f) => ({ ...f, animalAllergy: !!c }))} />동물 알러지</label>
                </div>
                <div><Label>근무상태</Label>
                  <Select value={form.contractStatus} onValueChange={(v: Worker["contractStatus"]) => setForm((f) => ({ ...f, contractStatus: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="근무중">근무중</SelectItem>
                      <SelectItem value="퇴사">퇴사</SelectItem>
                      <SelectItem value="대기">대기 (문의/등록)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>최초근무일</Label><Input type="date" value={form.serviceStartDate} onChange={(e) => setForm((f) => ({ ...f, serviceStartDate: e.target.value }))} /></div>
                <div><Label>퇴사일</Label><Input type="date" value={form.resignationDate} onChange={(e) => setForm((f) => ({ ...f, resignationDate: e.target.value }))} /></div>
                <div className="col-span-2"><Label>비고</Label><Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
                <Button onClick={handleSave}>{editingId ? "수정" : "등록"}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <Input className="w-full sm:max-w-xs" placeholder="이름 또는 연락처 검색..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full sm:w-auto overflow-x-auto">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="all">전체 ({workers.length})</TabsTrigger>
            <TabsTrigger value="근무중">근무중 ({workers.filter((w) => w.contractStatus === "근무중").length})</TabsTrigger>
            <TabsTrigger value="퇴사">퇴사 ({workers.filter((w) => w.contractStatus === "퇴사").length})</TabsTrigger>
            <TabsTrigger value="대기">대기 ({workers.filter((w) => w.contractStatus === "대기").length})</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  {["이름", "성별", "연락처", "경력", "이수증번호", "희망지역", "상태", ""].map((h) => (
                    <th key={h} className="text-left p-3 font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">로딩중...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">데이터가 없습니다.</td></tr>
                ) : (
                  filtered.map((w) => (
                    <tr key={w.id} className="hover:bg-muted/50">
                      <td className="p-3 font-medium">{w.name}</td>
                      <td className="p-3">{w.gender}</td>
                      <td className="p-3">{w.phone}</td>
                      <td className="p-3">{w.experience}</td>
                      <td className="p-3">{w.certificateNumber}</td>
                      <td className="p-3">{w.preferredArea}</td>
                      <td className="p-3">
                        <Badge variant={w.contractStatus === "근무중" ? "default" : w.contractStatus === "퇴사" ? "destructive" : "secondary"}>
                          {w.contractStatus}
                        </Badge>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <Button variant="ghost" size="sm" onClick={() => startEdit(w)}>수정</Button>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(w)} title="삭제">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="block md:hidden divide-y">
            {loading ? (
              <p className="p-8 text-center text-muted-foreground">로딩중...</p>
            ) : filtered.length === 0 ? (
              <p className="p-8 text-center text-muted-foreground">데이터가 없습니다.</p>
            ) : (
              filtered.map((w) => (
                <div key={w.id} className="p-4 flex flex-col gap-2 hover:bg-muted/30">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-base">{w.name} ({w.gender}, {w.age}세)</span>
                    <Badge variant={w.contractStatus === "근무중" ? "default" : w.contractStatus === "퇴사" ? "destructive" : "secondary"}>
                      {w.contractStatus}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1.5">
                    <p>📞 {w.phone}</p>
                    <p>💼 {w.experience} · 이수증: {w.certificateNumber || "없음"}</p>
                    <p>📍 {w.address}</p>
                  </div>
                  <div className="flex justify-end gap-2 mt-1">
                    <Button variant="outline" size="sm" onClick={() => startEdit(w)}>수정</Button>
                    <Button variant="outline" size="sm" className="text-destructive" onClick={() => setDeleteTarget(w)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>삭제 확인</AlertDialogTitle>
            <AlertDialogDescription>
              정말로 <strong>{deleteTarget?.name}</strong> 님의 정보를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default WorkerManagement;
