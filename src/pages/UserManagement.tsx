import { useState, useMemo } from "react";
import { useCollection } from "@/hooks/useFirestore";
import { type ServiceUser, type Worker, type CounselingRecord, type MatchingHistoryRecord, DISABILITY_TYPES, SUPPORT_TYPES, ENVIRONMENT_TAGS, VOUCHER_HOURS, TERMINATION_REASONS } from "@/types";
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
import { USERS_COLLECTION, WORKERS_COLLECTION, MATCHING_HISTORY_COLLECTION } from "@/lib/collectionNames";
import {
  buildHelperArraysFromIds,
  formatHelperList,
  syncUserToWorkers,
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
import { WeeklySchedulePicker } from "@/components/WeeklySchedulePicker";
import { useSearchParams } from "react-router-dom";
import { useEffect } from "react";
import { getComparableDateValue } from "@/lib/utils";

const emptyUser: Omit<ServiceUser, "id" | "createdAt" | "updatedAt"> = {
  name: "", age: 0, gender: "남성", phone: "", disabilityType: "", voucherTier: 1,
  requiredDays: "", requiredHours: "", supportTypes: [], environmentTags: [],
  familyMembers: "", address: "", preferredWorkerTraits: "", notes: "",
  contractStatus: "대기", serviceStartDate: "", resignationDate: "", guardianName: "", guardianRelation: "", guardianPhone: "",
  terminationReason: "", assignedHelperIds: [], assignedHelperNames: [], assignedHelperPhones: [],
  hasPet: false,
  livingWith: "",
  needsVehicle: false,
  usesDiaper: false,
  needsAftercare: false,
  wantsWeekendSupport: false,
  femaleOnly: false,
  maleOnly: false,
  receiptDate: "",
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
  const { data: usersRaw, add, update, remove, loading, error: usersError } = useCollection<ServiceUser>(USERS_COLLECTION);
  const { data: workersRaw, update: updateWorker } = useCollection<Worker>(WORKERS_COLLECTION);
  const { data: counselingRecords } = useCollection<CounselingRecord>("counseling");
  const { data: matchingHistory } = useCollection<MatchingHistoryRecord>(MATCHING_HISTORY_COLLECTION);

  // undefined 방어벽 — 데이터가 준비되지 않았을 때도 filter/map/find 에러 방지
  const users = usersRaw || [];
  const workers = workersRaw || [];
  const counselingLogs = counselingRecords || [];
  const matchingLogs = matchingHistory || [];

  const [form, setForm] = useState(emptyUser);
  const [ageInput, setAgeInput] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<(ServiceUser & { id: string }) | null>(null);
  const [expandedCounselId, setExpandedCounselId] = useState<string | null>(null);
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [geocoding, setGeocoding] = useState(false);
  const [isCustomVoucher, setIsCustomVoucher] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<(ServiceUser & { id: string }) | null>(null);
  const [pendingOverwrite, setPendingOverwrite] = useState<{
    existingId: string;
    payload: Omit<ServiceUser, "id" | "createdAt" | "updatedAt">;
  } | null>(null);
  const [bulkConflicts, setBulkConflicts] = useState<string[] | null>(null);
  const [pendingBulkItems, setPendingBulkItems] = useState<
    Omit<ServiceUser, "id" | "createdAt" | "updatedAt">[] | null
  >(null);
  const [bulkConflictPreview, setBulkConflictPreview] = useState<
    Array<{
      id: string;
      itemKey: string;
      label: string;
      existingName?: string;
      action: "overwrite" | "skip";
    }>
  >([]);

  const parseAgeInput = (val: string): number => {
    const clean = val.trim();
    if (!clean) return 0;
    
    const num = Number(clean);
    if (!Number.isNaN(num) && num > 0) {
      if (num >= 1900) {
        const currentYear = new Date().getFullYear();
        return Math.max(0, currentYear - num);
      }
      return num;
    }

    const digits = clean.replace(/\D/g, "");
    if (!digits) return 0;

    const currentYear = new Date().getFullYear();

    if (digits.length === 4) {
      const y = Number(digits);
      if (y >= 1900 && y <= currentYear) {
        return currentYear - y;
      }
    }

    if (digits.length === 6) {
      const yy = Number(digits.slice(0, 2));
      const y = yy < 30 ? 2000 + yy : 1900 + yy;
      return Math.max(0, currentYear - y);
    }

    if (digits.length === 8) {
      const y = Number(digits.slice(0, 4));
      if (y >= 1900 && y <= currentYear) {
        return currentYear - y;
      }
    }

    if (digits.length <= 2) {
      return Number(digits);
    }

    const parsedNum = Number(digits);
    if (!Number.isNaN(parsedNum) && parsedNum > 0) {
      if (parsedNum >= 1900) {
        return Math.max(0, currentYear - parsedNum);
      }
      return parsedNum;
    }
    return 0;
  };

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

  const getIdentityFallbackContext = (item: { name?: string; phone?: string; age?: number; receiptDate?: string }) => {
    return [item.age ? String(item.age) : "", item.receiptDate ? String(item.receiptDate) : ""]
      .filter(Boolean)
      .join("::");
  };

  const handleSave = async () => {
    if (!form.name || !form.phone) {
      toast({ title: "필수 항목을 입력해주세요", variant: "destructive" });
      return;
    }
    if (!form.lat && form.address) await handleGeocode();

    const uniqueHelperIds = Array.from(new Set(form.assignedHelperIds || []));
    const arrays = buildHelperArraysFromIds(uniqueHelperIds, workers);
    const payload: Omit<ServiceUser, "id" | "createdAt" | "updatedAt"> = {
      ...form,
      assignedHelperIds: arrays.ids,
      assigned_workers: arrays.ids,
      assignedHelperNames: arrays.names,
      assignedHelperPhones: arrays.phones,
      txtUSex: form.gender,
      txtUMemostop: form.terminationReason,
      receiptDate: form.receiptDate || new Date().toISOString().slice(0, 10),
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
    const duplicateName = users.find((u) =>
      u.name === form.name && u.id !== editingId && u.phone !== form.phone
    );
    if (duplicateName) {
      toast({
        title: "동명이인 주의",
        description: `${form.name} 이름이 이미 등록된 이용자가 있습니다. 연락처를 확인하세요.`,
        variant: "warning",
      });
    }

    if (editingId) {
      await update(editingId, payload);
      toast({ title: "수정 완료" });
    } else {
      const key = makeUniqueKey(form.name, form.phone, getIdentityFallbackContext(form));
      const existing = users.find((u) => makeUniqueKey(u.name, u.phone, getIdentityFallbackContext(u as any)) === key);
      if (existing?.id) {
        // require explicit confirmation before overwriting existing record
        setPendingOverwrite({ existingId: existing.id, payload });
        return;
      }
      const ref = await add(payload as Omit<ServiceUser, "id">);
      savedId = ref.id;
      toast({ title: "등록 완료" });
    }
    if (savedId) {
      await syncUserToWorkers(savedId, payload, workers, prevHelperIds, updateWorker);
    }
    setForm(emptyUser);
    setAgeInput("");
    setEditingId(null);
    setDialogOpen(false);
  };

  const confirmPendingOverwrite = async (proceed: boolean) => {
    if (!pendingOverwrite) return;
    const { existingId, payload } = pendingOverwrite;
    setPendingOverwrite(null);
    if (!proceed) {
      // create new record instead of overwriting
      const ref = await add(payload as Omit<ServiceUser, "id">);
      toast({ title: "신규 등록 완료 (덮어쓰기 거부)" });
      if (ref?.id) {
        await syncUserToWorkers(ref.id, payload, workers, [], updateWorker);
      }
      return;
    }
    await update(existingId, payload);
    toast({ title: "기존 데이터 덮어쓰기 완료" });
    await syncUserToWorkers(existingId, payload, workers, [], updateWorker);
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
      // detect conflicts by composite key
      const existingKeys = new Set(
        users.map((u) => makeUniqueKey(u.name, u.phone, getIdentityFallbackContext(u as any)))
      );
      const conflictEntries = items
        .map((it) => {
          const key = makeUniqueKey(it.name, it.phone, getIdentityFallbackContext(it as any));
          if (!existingKeys.has(key)) return null;
          const existing = users.find((u) => makeUniqueKey(u.name, u.phone, getIdentityFallbackContext(u as any)) === key);
          return {
            id: `${key}-${Math.random().toString(36).slice(2,8)}`,
            itemKey: key,
            label: `${it.name || "이름 없음"}${it.phone ? ` (${it.phone})` : ""}`,
            existingName: existing?.name,
            action: "skip" as const,
          };
        })
        .filter(Boolean) as Array<{
          id: string;
          itemKey: string;
          label: string;
          existingName?: string;
          action: "overwrite" | "skip";
        }>;

      if (conflictEntries.length > 0) {
        setBulkConflicts(Array.from(new Set(conflictEntries.map((entry) => entry.itemKey))));
        setPendingBulkItems(items);
        setBulkConflictPreview(conflictEntries);
        return null;
      }

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

  const confirmBulkOverwrite = async (proceed: boolean) => {
    if (!bulkConflicts) return;
    setBulkConflicts(null);
    const items = pendingBulkItems;
    setPendingBulkItems(null);
    setBulkConflictPreview([]);
    if (!proceed || !items) return;
    try {
      let inserted = 0;
      let updated = 0;
      let skipped = 0;
      const conflictMap = new Map(bulkConflictPreview.map((entry) => [entry.itemKey, entry]));

      for (const item of items) {
        const itemKey = makeUniqueKey(item.name, item.phone, getIdentityFallbackContext(item as any));
        const conflict = conflictMap.get(itemKey);
        if (conflict?.action === "skip") {
          skipped += 1;
          continue;
        }

        const payload = await geocodeIfNeeded(item);
        const existing = users.find((u) => makeUniqueKey(u.name, u.phone, getIdentityFallbackContext(u as any)) === itemKey);
        if (existing?.id) {
          await update(existing.id, payload as Omit<ServiceUser, "id" | "createdAt" | "updatedAt">);
          updated += 1;
          await syncUserToWorkers(existing.id, payload as Omit<ServiceUser, "id" | "createdAt" | "updatedAt">, workers, existing.assignedHelperIds ?? [], updateWorker);
        } else {
          const ref = await add(payload as Omit<ServiceUser, "id">);
          inserted += 1;
          await syncUserToWorkers(ref.id, payload as Omit<ServiceUser, "id" | "createdAt" | "updatedAt">, workers, [], updateWorker);
        }
      }

      toast({
        title: "일괄 업로드 완료",
        description: `신규 ${inserted}건 · 수정 ${updated}건 · 건너뜀 ${skipped}건`,
      });
      return { inserted, updated, skipped };
    } catch (e) {
      console.error("bulk overwrite error", e);
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

  const openDetail = (user: ServiceUser & { id: string }) => {
    setDetailTarget(user);
    setExpandedCounselId(null);
    setExpandedMatchId(null);
  };

  const startEdit = (user: ServiceUser & { id: string }) => {
    setForm({
      ...user,
      terminationReason: user.terminationReason || "",
      assignedHelperIds: user.assignedHelperIds ?? [],
      assignedHelperNames: user.assignedHelperNames ?? [],
      assignedHelperPhones: user.assignedHelperPhones ?? [],
    });
    setAgeInput(user.age ? String(user.age) : "");
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

  const selectedCounselingLogs = useMemo(() => {
    if (!detailTarget) return [];
    return counselingLogs
      .filter((record) => record.targetType === "이용자" && record.targetId === detailTarget.id)
      .sort((a, b) => getComparableDateValue(b.date).localeCompare(getComparableDateValue(a.date)));
  }, [counselingLogs, detailTarget]);

  const selectedMatchingLogs = useMemo(() => {
    if (!detailTarget) return [];
    return matchingLogs
      .filter((record) => record.userId === detailTarget.id)
      .sort((a, b) => getComparableDateValue(b.date).localeCompare(getComparableDateValue(a.date)));
  }, [matchingLogs, detailTarget]);

  const getFilteredUsers = () => {
    return users.filter((u) => {
      const matchesName = String(u.name || "").includes(search);
      const matchesPhone = String(u.phone || "").includes(search);
      const matchSearch = !search || matchesName || matchesPhone;
      
      // 대기중 필터: 미배정 사용자만 표시
      if (statusFilter === "대기") {
        const isUnmatched = !u.assignedHelperIds || u.assignedHelperIds.length === 0;
        return matchSearch && u.contractStatus === "대기" && isUnmatched;
      }
      
      const matchStatus = statusFilter === "all" || String(u.contractStatus || "") === statusFilter;
      return matchSearch && matchStatus;
    });
  };

  const filtered = getFilteredUsers();

  // ── 로딩 가드: 데이터가 완전히 로드될 때까지 안전하게 대기 ──
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">이용자 데이터를 안전하게 불러오는 중입니다...</p>
        </div>
      </div>
    );
  }

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
              <Button onClick={() => { setForm(emptyUser); setAgeInput(""); setEditingId(null); }}>+ 신규등록</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingId ? "이용자 수정" : "이용자 신규등록"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>이름 *</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
                  <div><Label>연락처 *</Label><Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="010-0000-0000" /></div>
                  <div>
                    <Label>나이 (생년 또는 생년월일 입력 시 자동변환)</Label>
                    <Input 
                      placeholder="예: 25, 1995, 950504" 
                      value={ageInput} 
                      onChange={(e) => {
                        const val = e.target.value;
                        setAgeInput(val);
                        const clean = val.trim();
                        if (!clean) {
                          setForm((f) => ({ ...f, age: 0 }));
                          return;
                        }
                        const digits = clean.replace(/\D/g, "");
                        const currentYear = new Date().getFullYear();
                        let calculatedAge = 0;
                        let valid = false;

                        if (digits.length <= 2 && Number(digits) > 0) {
                          calculatedAge = Number(digits);
                          valid = true;
                        } else if (digits.length === 4) {
                          const y = Number(digits);
                          if (y >= 1900 && y <= currentYear) {
                            calculatedAge = currentYear - y;
                            valid = true;
                          }
                        } else if (digits.length === 6) {
                          const yy = Number(digits.slice(0, 2));
                          const y = yy < 30 ? 2000 + yy : 1900 + yy;
                          calculatedAge = currentYear - y;
                          valid = true;
                        } else if (digits.length === 8) {
                          const y = Number(digits.slice(0, 4));
                          if (y >= 1900 && y <= currentYear) {
                            calculatedAge = currentYear - y;
                            valid = true;
                          }
                        }

                        if (valid) {
                          setForm((f) => ({ ...f, age: calculatedAge }));
                        }
                      }}
                      onBlur={() => {
                        const calculatedAge = parseAgeInput(ageInput);
                        setForm((f) => ({ ...f, age: calculatedAge }));
                        setAgeInput(calculatedAge > 0 ? String(calculatedAge) : "");
                      }}
                    />
                  </div>
                  <div>
                    <Label>성별</Label>
                    <Select value={form.gender} onValueChange={(v) => setForm((f) => ({ ...f, gender: v }))}>
                      <SelectTrigger><SelectValue placeholder="선택..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="남성">남성</SelectItem>
                        <SelectItem value="여성">여성</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>장애유형</Label>
                    <Select value={form.disabilityType} onValueChange={(v) => setForm((f) => ({ ...f, disabilityType: v }))}>
                      <SelectTrigger><SelectValue placeholder="선택..." /></SelectTrigger>
                      <SelectContent>
                        {DISABILITY_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>바우처 등급</Label>
                    <Select value={String(form.voucherTier)} onValueChange={(v) => setForm((f) => ({ ...f, voucherTier: Number(v) }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.keys(VOUCHER_HOURS).map(v => <SelectItem key={v} value={v}>{v}구간 ({VOUCHER_HOURS[Number(v)]}시간)</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>지원 종류</Label>
                  <div className="flex flex-wrap gap-4">
                    {SUPPORT_TYPES.map(t => (
                      <div key={t} className="flex items-center space-x-2">
                        <Checkbox id={`support-${t}`} checked={form.supportTypes.includes(t)} onCheckedChange={() => toggleArrayField("supportTypes", t)} />
                        <label htmlFor={`support-${t}`} className="text-sm">{t}</label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>추가 요청 사항</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center space-x-2"><Checkbox id="needsAftercare" checked={form.needsAftercare} onCheckedChange={(checked) => setForm((f) => ({ ...f, needsAftercare: !!checked }))} /><label htmlFor="needsAftercare" className="text-sm">배변뒤처리 필요</label></div>
                    <div className="flex items-center space-x-2"><Checkbox id="wantsWeekendSupport" checked={form.wantsWeekendSupport} onCheckedChange={(checked) => setForm((f) => ({ ...f, wantsWeekendSupport: !!checked }))} /><label htmlFor="wantsWeekendSupport" className="text-sm">주말지원 희망</label></div>
                    <div className="flex items-center space-x-2"><Checkbox id="femaleOnly" checked={form.femaleOnly} onCheckedChange={(checked) => setForm((f) => ({ ...f, femaleOnly: !!checked }))} /><label htmlFor="femaleOnly" className="text-sm">여성만 원함</label></div>
                    <div className="flex items-center space-x-2"><Checkbox id="maleOnly" checked={form.maleOnly} onCheckedChange={(checked) => setForm((f) => ({ ...f, maleOnly: !!checked }))} /><label htmlFor="maleOnly" className="text-sm">남성만 원함</label></div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>필요 요일 및 시간 (드래그하여 선택)</Label>
                  <WeeklySchedulePicker value={form.weeklySchedule} onChange={(s) => setForm(f => ({ ...f, weeklySchedule: s }))} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label>주소</Label>
                    <div className="flex gap-2">
                      <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} onBlur={(e) => handleAutoGeocode(e.target.value)} />
                      <Button variant="outline" size="sm" onClick={handleGeocode} disabled={geocoding}>{geocoding ? "변환중..." : "좌표변환"}</Button>
                    </div>
                  </div>
                  <div><Label>거주자</Label><Input value={form.livingWith} onChange={(e) => setForm((f) => ({ ...f, livingWith: e.target.value }))} placeholder="예: 독거, 부모님 등" /></div>
                  <div className="flex items-center space-x-4 h-full pt-6">
                    <div className="flex items-center space-x-2">
                      <Checkbox id="hasPet" checked={form.hasPet} onCheckedChange={(checked) => setForm(f => ({ ...f, hasPet: !!checked }))} />
                      <Label htmlFor="hasPet">반려동물 여부</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="needsVehicle" checked={form.needsVehicle} onCheckedChange={(checked) => setForm(f => ({ ...f, needsVehicle: !!checked }))} />
                      <Label htmlFor="needsVehicle">차량 필요</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="usesDiaper" checked={form.usesDiaper} onCheckedChange={(checked) => setForm(f => ({ ...f, usesDiaper: !!checked }))} />
                      <Label htmlFor="usesDiaper">기저귀 사용</Label>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>이동 시 유의점</Label>
                  <Textarea value={form.movementNote} onChange={(e) => setForm(f => ({ ...f, movementNote: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>가사 지원 시 유의점</Label>
                  <Textarea value={form.houseworkNote} onChange={(e) => setForm(f => ({ ...f, houseworkNote: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>희망 활동지원사 (선호도)</Label>
                  <Textarea value={form.preferredWorkerTraits} onChange={(e) => setForm(f => ({ ...f, preferredWorkerTraits: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>특이사항</Label>
                  <Textarea value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} />
                </div>

                <div className="border-t pt-4 grid grid-cols-2 gap-4">
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
                  <div className="col-span-2">
                    <Label>담당 활동지원사 (N:M)</Label>
                    <MultiEntitySelect
                      label="담당 활동지원사"
                      options={workers.map((w) => ({ id: w.id || "", label: w.name, sublabel: String(w.phone || "") }))}
                      selectedIds={form.assignedHelperIds || []}
                      onChange={(ids) => setForm((f) => ({ ...f, assignedHelperIds: ids }))}
                      placeholder="지원사 선택..."
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

      <div className="sticky top-16 z-20 bg-background/90 backdrop-blur-sm py-3 mb-6">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col md:flex-row gap-4">
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
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((user) => (
          <Card key={user.id} className="stat-card group">
            <CardContent className="p-4 cursor-pointer" onClick={() => openDetail(user as any)}>
              <div className="flex justify-between items-start mb-2">
                <div>
                  <span className="font-bold text-lg">{user.name}</span>
                  <span className="text-sm text-muted-foreground ml-2">{user.gender} · {user.age}세</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={user.contractStatus === "서비스중" ? "default" : user.contractStatus === "대기" ? "secondary" : "destructive"}>
                    {user.contractStatus}
                  </Badge>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); startEdit(user as any); }}
                    className="text-primary hover:text-primary/90"
                    aria-label="수정"
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(user as any); }}
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
                    href={`tel:${user.phone}`} 
                    className="text-primary hover:underline inline-flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <PhoneCall className="w-3 h-3" />
                    {user.phone}
                  </a>
                </p>
                <p><span className="text-muted-foreground">장애유형:</span> {user.disabilityType}</p>
                <p><span className="text-muted-foreground">최초접수:</span> {user.receiptDate || "미등록"}</p>
                <p><span className="text-muted-foreground">담당지원사:</span> {formatHelperList(user)}</p>
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

      <AlertDialog open={!!pendingOverwrite} onOpenChange={(open) => !open && setPendingOverwrite(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>기존 데이터 덮어쓰기 확인</AlertDialogTitle>
            <AlertDialogDescription>
              동일한 이름+연락처의 이용자가 이미 존재합니다. 기존 데이터를 덮어쓰시겠습니까? (아니오 선택 시 신규로 저장됩니다)
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => confirmPendingOverwrite(false)}>아니오 (신규로 저장)</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmPendingOverwrite(true)}>예, 덮어쓰기</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!bulkConflicts} onOpenChange={(open) => {
        if (!open) {
          setBulkConflicts(null);
          setBulkConflictPreview([]);
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>업로드 충돌 감지</AlertDialogTitle>
            <AlertDialogDescription>
              업로드할 항목 중 기존 데이터와 충돌되는 {bulkConflicts?.length ?? 0}개의 항목이 발견되었습니다.
              각 항목별로 덮어쓰기 또는 건너뛰기를 선택한 뒤 진행해 주세요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 max-h-72 overflow-y-auto p-1">
            {bulkConflictPreview.map((entry) => (
              <div key={entry.id} className="border rounded-md p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-sm">{entry.label}</p>
                    {entry.existingName && <p className="text-xs text-muted-foreground">기존 항목: {entry.existingName}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={entry.action === "overwrite" ? "default" : "outline"}
                      onClick={() => setBulkConflictPreview((prev) => prev.map((item) => item.id === entry.id ? { ...item, action: "overwrite" } : item))}
                    >
                      덮어쓰기
                    </Button>
                    <Button
                      size="sm"
                      variant={entry.action === "skip" ? "secondary" : "outline"}
                      onClick={() => setBulkConflictPreview((prev) => prev.map((item) => item.id === entry.id ? { ...item, action: "skip" } : item))}
                    >
                      건너뛰기
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => confirmBulkOverwrite(false)}>취소</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmBulkOverwrite(true)}>선택 내용으로 계속</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!detailTarget} onOpenChange={(open) => !open && setDetailTarget(null)}>
        <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detailTarget ? `${detailTarget.name} 상세 정보` : "이용자 상세"}</DialogTitle>
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
                  <p className="text-sm text-muted-foreground">계약상태</p>
                  <p className="font-medium">{detailTarget.contractStatus}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">담당 활동지원사</p>
                  <p className="font-medium">{formatHelperList(detailTarget) || "없음"}</p>
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
                        <div key={match.id || `${match.date}-${match.workerId}`} className="border rounded-lg p-3 hover:bg-muted cursor-pointer" onClick={() => setExpandedMatchId(expandedMatchId === match.id ? null : match.id)}>
                          <div className="flex justify-between items-start gap-3">
                            <div>
                              <p className="font-semibold">{match.date} · {match.type}</p>
                              <p className="text-sm text-muted-foreground">{match.workerName} · {match.workerPhone}</p>
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

export default UserManagement;
