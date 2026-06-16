import { useState } from "react";
import { useCollection } from "@/hooks/useFirestore";
import { type ServiceUser, type Worker, DISABILITY_TYPES, SUPPORT_TYPES, ENVIRONMENT_TAGS, VOUCHER_HOURS, TERMINATION_REASONS } from "@/types";
import { geocodeAddress } from "@/lib/kakao";
import { BulkUploadDialog } from "@/components/BulkUploadDialog";
import { MultiEntitySelect } from "@/components/MultiEntitySelect";
import {
  rowsToEntities,
  rowToServiceUser,
  upsertByNamePhoneBatch,
  makeUniqueKey,
  type FieldKey,
  type ParsedSheet,
} from "@/lib/bulkUpload";
import { USERS_COLLECTION, WORKERS_COLLECTION } from "@/lib/collectionNames";
import {
  buildHelperArraysFromIds,
  formatHelperList,
  syncUserToWorkers,
} from "@/lib/assignments";
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
import { useSearchParams } from "react-router-dom";
import { useEffect } from "react";

const emptyUser: Omit<ServiceUser, "id" | "createdAt" | "updatedAt"> = {
  name: "", age: 0, gender: "남성", phone: "", disabilityType: "", voucherTier: 1,
  requiredDays: "", requiredHours: "", supportTypes: [], environmentTags: [],
  familyMembers: "", address: "", preferredWorkerTraits: "", notes: "",
  contractStatus: "대기", serviceStartDate: "", resignationDate: "", guardianName: "", guardianRelation: "", guardianPhone: "",
  terminationReason: "", assignedHelperIds: [], assignedHelperNames: [], assignedHelperPhones: [],
};

const USER_PREVIEW_COLUMNS: { key: FieldKey; label: string }[] = [
  { key: "name", label: "이름" },
  { key: "gender", label: "성별" },
  { key: "phone", label: "연락처" },
  { key: "age", label: "나이" },
  { key: "disabilityType", label: "장애유형" },
  { key: "address", label: "주소" },
  { key: "assignedHelperName", label: "담당지원사" },
  { key: "assignedHelperPhone", label: "담당지원사연락처" },
  { key: "contractStatus", label: "계약상태" },
  { key: "terminationReason", label: "중단사유" },
];

const UserManagement = () => {
  const [searchParams] = useSearchParams();
  const { data: users, add, update, remove, loading, error: usersError } = useCollection<ServiceUser>(USERS_COLLECTION);
  const { data: workers, update: updateWorker } = useCollection<Worker>(WORKERS_COLLECTION);
  const [form, setForm] = useState(emptyUser);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [geocoding, setGeocoding] = useState(false);
  const [isCustomVoucher, setIsCustomVoucher] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<(ServiceUser & { id: string }) | null>(null);

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
      toast({ title: "자동 주소 변환 완료", description: `위도: ${result.lat.toFixed(4)}, 경도: ${result.lng.toFixed(4)}` });
    }
    setGeocoding(false);
  };

  const handleGeocode = async () => {
    if (!form.address) return;
    setGeocoding(true);
    const result = await geocodeAddress(form.address);
    if (result) {
      setForm((f) => ({ ...f, lat: result.lat, lng: result.lng }));
      toast({ title: "주소 변환 완료", description: `위도: ${result.lat.toFixed(4)}, 경도: ${result.lng.toFixed(4)}` });
    } else {
      toast({ title: "주소 변환 실패", description: "주소를 다시 확인해주세요.", variant: "destructive" });
    }
    setGeocoding(false);
  };

  const geocodeIfNeeded = async (item: Omit<ServiceUser, "id" | "createdAt" | "updatedAt">) => {
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

    const arrays = buildHelperArraysFromIds(form.assignedHelperIds, workers);
    const payload: Omit<ServiceUser, "id" | "createdAt" | "updatedAt"> = {
      ...form,
      assignedHelperIds: arrays.ids,
      assigned_workers: arrays.ids,
      assignedHelperNames: arrays.names,
      assignedHelperPhones: arrays.phones,
      txtUSex: form.gender,
      txtUMemostop: form.terminationReason,
    };
    // 중단/해지 사유가 입력되면 상태를 즉시 "계약해지"로 자동 전환(저장까지 반영)
    if (payload.terminationReason?.trim()) {
      payload.contractStatus = "계약해지";
      payload.txtUMemostop = payload.terminationReason;
    }
    const prevHelperIds = editingId
      ? users.find((u) => u.id === editingId)?.assignedHelperIds ?? []
      : [];

    let savedId = editingId;
    if (editingId) {
      await update(editingId, payload);
      toast({ title: "수정 완료" });
    } else {
      const key = makeUniqueKey(form.name, form.phone);
      const existing = users.find((u) => makeUniqueKey(u.name, u.phone) === key);
      if (existing?.id) {
        savedId = existing.id;
        await update(existing.id, payload);
        toast({ title: "기존 데이터 업데이트 완료", description: "동일 이름+연락처로 덮어썼습니다." });
      } else {
        const ref = await add(payload as Omit<ServiceUser, "id">);
        savedId = ref.id;
        toast({ title: "등록 완료" });
      }
    }
    if (savedId) {
      await syncUserToWorkers(savedId, payload, workers, prevHelperIds, updateWorker);
    }
    setForm(emptyUser);
    setEditingId(null);
    setDialogOpen(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget?.id) return;
    await remove(deleteTarget.id);
    toast({ title: "삭제 완료", description: `${deleteTarget.name} 님의 정보가 삭제되었습니다.` });
    setDeleteTarget(null);
  };

  const handleBulkConfirm = async (items: Omit<ServiceUser, "id" | "createdAt" | "updatedAt">[]) => {
    try {
      console.log("[UserManagement] bulk confirm start:", items.length);
      return await upsertByNamePhoneBatch({
        collectionName: USERS_COLLECTION,
        items,
        existing: users,
        beforeSave: geocodeIfNeeded,
        onSaved: async (userId, item, isUpdate) => {
          if (!item.assignedHelperIds?.length) return;
          const prev = isUpdate
            ? users.find((u) => u.id === userId)?.assignedHelperIds ?? []
            : [];
          await syncUserToWorkers(userId, item, workers, prev, updateWorker);
        },
      });
    } catch (e: any) {
      console.error("[UserManagement] 업로드 확정 처리 중 치명적 에러:", e);
      alert(
        `❌ 업로드 준비 중 오류 발생!\n` +
          `이 단계에서 코드가 멈췄습니다: 이용자 업로드 확정(handleBulkConfirm)\n` +
          `사유: ${e?.message ?? String(e)}\n` +
          (e?.stack ? `\n[stack]\n${e.stack}` : "")
      );
      throw e;
    }
  };

  const mapUserRows = (sheet: ParsedSheet) => {
    try {
      console.log("[UserManagement] mapUserRows start");
      return rowsToEntities(sheet, (row, headerMap) => {
        const entity = rowToServiceUser(row, headerMap, workers);
        if (!entity.name && !entity.phone) return null;
        return entity;
      });
    } catch (e: any) {
      console.error("[UserManagement] 엑셀 파싱/매핑 중 치명적 에러:", e);
      alert(
        `❌ 업로드 준비 중 오류 발생!\n` +
          `이 단계에서 코드가 멈췄습니다: 이용자 엑셀 매핑(mapUserRows)\n` +
          `사유: ${e?.message ?? String(e)}\n` +
          (e?.stack ? `\n[stack]\n${e.stack}` : "")
      );
      return [];
    }
  };

  const getUserPreviewValue = (item: Omit<ServiceUser, "id">, key: FieldKey): string => {
    const map: Record<string, string | number> = {
      name: item.name,
      gender: item.gender,
      phone: item.phone,
      age: item.age,
      disabilityType: item.disabilityType,
      address: item.address,
      assignedHelperName: item.assignedHelperNames?.join(", "),
      assignedHelperPhone: item.assignedHelperPhones?.join(", "),
      contractStatus: item.contractStatus,
      terminationReason: item.terminationReason,
    };
    return String(map[key] ?? "");
  };

  const startEdit = (user: ServiceUser & { id: string }) => {
    setForm({
      ...user,
      terminationReason: user.terminationReason || "",
      assignedHelperIds: user.assignedHelperIds ?? [],
      assignedHelperNames: user.assignedHelperNames ?? [],
      assignedHelperPhones: user.assignedHelperPhones ?? [],
    });
    setEditingId(user.id);
    setDialogOpen(true);
  };

  const downloadExcel = () => {
    const filtered = getFilteredUsers();
    const data = filtered.map((u) => ({
      이름: u.name, 나이: u.age, 성별: u.gender, 연락처: u.phone,
      장애유형: u.disabilityType, 바우처구간: u.voucherTier,
      "월바우처시간": VOUCHER_HOURS[u.voucherTier] || 0,
      필요요일: u.requiredDays, 필요시간: u.requiredHours,
      지원유형: u.supportTypes?.join(","), 환경태그: u.environmentTags?.join(","),
      가족구성원: u.familyMembers, 주소: u.address, 선호도: u.preferredWorkerTraits,
      담당활동지원사: u.assignedHelperNames?.join(", "), 담당지원사연락처: u.assignedHelperPhones?.join(", "),
      계약상태: u.contractStatus, 중단사유: u.terminationReason, 계약해지날짜: u.resignationDate,
      최초서비스제공일: u.serviceStartDate,
      보호자이름: u.guardianName, 보호자관계: u.guardianRelation, 보호자연락처: u.guardianPhone,
      비고: u.notes,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "이용자목록");
    XLSX.writeFile(wb, `이용자목록_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const downloadTemplate = () => {
    const template = [{
      이름: "", 나이: "", 성별: "남성", 연락처: "", 장애유형: "", 바우처구간: 1,
      필요요일: "월,화,수", 필요시간: "09:00-12:00", 지원유형: "사회지원", 환경태그: "",
      가족구성원: "", 주소: "", 선호도: "", 담당활동지원사: "홍길동, 김철수", 담당지원사연락처: "",
      계약상태: "서비스중", 중단사유: "", 계약해지날짜: "", 최초서비스제공일: "2025-01-01",
      보호자이름: "", 보호자관계: "", 보호자연락처: "", 비고: "",
    }];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "업로드양식");
    XLSX.writeFile(wb, "이용자_업로드양식.xlsx");
  };

  const getFilteredUsers = () => {
    return users.filter((u) => {
      const matchesName = String(u.name || "").includes(search);
      const matchesPhone = String(u.phone || "").includes(search);
      const matchSearch = !search || matchesName || matchesPhone;
      const matchStatus = statusFilter === "all" || String(u.contractStatus || "") === statusFilter;
      return matchSearch && matchStatus;
    });
  };

  const filtered = getFilteredUsers();

  const toggleArrayField = (field: "supportTypes" | "environmentTags", value: string) => {
    setForm((f) => ({
      ...f,
      [field]: f[field].includes(value) ? f[field].filter((v) => v !== value) : [...f[field], value],
    }));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-header mb-0">이용자 관리</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={downloadTemplate}>📥 업로드양식</Button>
          <BulkUploadDialog
            title="이용자 일괄 업로드"
            mapRows={mapUserRows}
            onConfirm={handleBulkConfirm}
            previewColumns={USER_PREVIEW_COLUMNS}
            getPreviewValue={getUserPreviewValue}
          />
          <Button variant="outline" size="sm" onClick={downloadExcel}>📊 엑셀 다운로드</Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { setForm(emptyUser); setEditingId(null); }}>+ 신규등록</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingId ? "이용자 수정" : "이용자 신규등록"}</DialogTitle>
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
                <div className="col-span-2">
                  <Label>주소</Label>
                  <div className="flex gap-2">
                    <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} onBlur={(e) => handleAutoGeocode(e.target.value)} />
                    <Button variant="outline" size="sm" onClick={handleGeocode} disabled={geocoding}>{geocoding ? "변환중..." : "좌표변환"}</Button>
                  </div>
                </div>
                <div>
                  <Label>계약상태</Label>
                  <Select value={form.contractStatus} onValueChange={(v) => setForm((f) => ({ ...f, contractStatus: v as any }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="서비스중">서비스중</SelectItem>
                      <SelectItem value="대기">대기</SelectItem>
                      <SelectItem value="계약해지">계약해지</SelectItem>
                      <SelectItem value="타기관 계약">타기관 계약</SelectItem>
                      <SelectItem value="보류">보류</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>서비스 시작일</Label><Input type="date" value={form.serviceStartDate} onChange={(e) => setForm((f) => ({ ...f, serviceStartDate: e.target.value }))} /></div>
                <div><Label>계약해지 날짜</Label><Input type="date" value={form.resignationDate} onChange={(e) => setForm((f) => ({ ...f, resignationDate: e.target.value }))} /></div>
                <div className="col-span-2">
                  <Label>중단/해지 사유</Label>
                  <Input value={form.terminationReason} onChange={(e) => setForm((f) => ({ ...f, terminationReason: e.target.value }))} placeholder="사유를 입력하면 자동으로 '계약해지' 상태로 전환됩니다." />
                </div>
                <div className="col-span-2">
                  <Label>담당 활동지원사 (N:M)</Label>
                  <MultiEntitySelect
                    entities={workers}
                    selectedIds={form.assignedHelperIds}
                    onChange={(ids) => setForm((f) => ({ ...f, assignedHelperIds: ids }))}
                    placeholder="지원사 선택..."
                  />
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
            <TabsTrigger value="서비스중">서비스중</TabsTrigger>
            <TabsTrigger value="대기">대기</TabsTrigger>
            <TabsTrigger value="계약해지">계약해지</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((user) => (
          <Card key={user.id} className="stat-card cursor-pointer" onClick={() => startEdit(user as any)}>
            <CardContent className="p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <span className="font-bold text-lg">{user.name}</span>
                  <span className="text-sm text-muted-foreground ml-2">{user.gender} · {user.age}세</span>
                </div>
                <Badge variant={user.contractStatus === "서비스중" ? "default" : user.contractStatus === "대기" ? "secondary" : "destructive"}>
                  {user.contractStatus}
                </Badge>
              </div>
              <div className="space-y-1 text-sm">
                <p><span className="text-muted-foreground">연락처:</span> {user.phone}</p>
                <p><span className="text-muted-foreground">장애유형:</span> {user.disabilityType}</p>
                <p><span className="text-muted-foreground">담당지원사:</span> {formatHelperList(user.assignedHelperNames)}</p>
                {user.contractStatus === "계약해지" && user.resignationDate && (
                  <p className="text-destructive"><span className="text-muted-foreground">해지일:</span> {user.resignationDate}</p>
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
    </div>
  );
};

export default UserManagement;
