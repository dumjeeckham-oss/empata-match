/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useCollection } from "@/hooks/useFirestore";
import { type ServiceUser, type Worker, type CounselingRecord, type MatchingHistoryRecord, type HandoverDocument, type DocumentMatchingHistoryEntry, type MatchingHistoryReason, DISABILITY_TYPES, SUPPORT_TYPES, ENVIRONMENT_TAGS, VOUCHER_HOURS, TERMINATION_REASONS } from "@/types";
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
import { USERS_COLLECTION, WORKERS_COLLECTION, MATCHING_HISTORY_COLLECTION, COUNSELING_COLLECTION, HANDOVERS_COLLECTION } from "@/lib/collectionNames";
import { cascadeUserProfile } from "@/lib/cascadeSync";
import { deleteMatchingHistoryAndSync } from "@/lib/matchingHistorySync";
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
import { Trash2, PhoneCall, Edit3, Search } from "lucide-react";
import { WeeklySchedulePicker } from "@/components/WeeklySchedulePicker";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { getComparableDateValue, getFormattedDuration } from "@/lib/utils";
import { isWithinRecentMonths } from "@/lib/dashboardStats";
import { useDuplicateNameCheck } from "@/hooks/useDuplicateNameCheck";
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

function normalizePhone(phone: string): string {
  return (phone || "").replace(/\D/g, "");
}

function labelWithLast4(name: string, phone?: string): string {
  const last4 = normalizePhone(phone || "").slice(-4);
  return last4 ? `${name}(${last4})` : name;
}

/** 화면 표시용 계약상태: 계약해지일 또는 중단사유가 있으면 항상 "계약해지" 목록으로 이동 */
function effectiveUserStatus(user: ServiceUser): string {
  const raw = String(user.contractStatus || "");
  if (raw === "타기관 계약" || raw === "보류") return raw;
  const hasResign = String(user.resignationDate ?? "").trim() !== "";
  const hasReason = String(user.terminationReason ?? user.txtUMemostop ?? "").trim() !== "";
  if (raw === "계약해지" || hasResign || hasReason) return "계약해지";
  const helperCount = (user.assignedHelperIds ?? user.assigned_workers ?? []).filter(Boolean).length;
  if (raw === "서비스중" && helperCount === 0) return "작성중";
  // 최초서비스제공일이 입력되면 서비스중, 공란이면 대기로 표시
  const hasServiceStart = String(user.serviceStartDate ?? "").trim() !== "";
  if (hasServiceStart) return "서비스중";
  if (!raw) return "대기";
  if (raw === "서비스중") return "대기";
  return raw;
}

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
  receiptDate: "", matchingHistory: [],
};

type MultiMatchCleanupAction = {
  mode: "end" | "handover";
  endDate: string;
  workerStatus: "대기" | "퇴사";
};

type MatchingPeriodDraft = {
  serviceStartDate: string;
  serviceEndDate: string;
  isCurrent: boolean;
  workerStatus: "대기" | "퇴사";
  reason: MatchingHistoryReason;
  reasonDetail: string;
};

const MATCH_REASON_OPTIONS: MatchingHistoryReason[] = ["교체", "추가", "종료", "인계"];
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
  const { data: counselingRecords } = useCollection<CounselingRecord>(COUNSELING_COLLECTION);
  const { data: matchingHistory, add: addMatchingHistory, update: updateMatchingHistory, remove: removeMatchingHistory } = useCollection<MatchingHistoryRecord>(MATCHING_HISTORY_COLLECTION);
  const { data: handoverDocsRaw } = useCollection<HandoverDocument>(HANDOVERS_COLLECTION);

  // undefined 방어벽 — 데이터가 준비되지 않았을 때도 filter/map/find 에러 방지
  const users = usersRaw || [];
  const workers = workersRaw || [];
  const counselingLogs = counselingRecords || [];
  const matchingLogs = matchingHistory || [];
  const handoverDocs = handoverDocsRaw || [];

  const [form, setForm] = useState(emptyUser);
  const [ageInput, setAgeInput] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<(ServiceUser & { id: string }) | null>(null);
  const [expandedCounselId, setExpandedCounselId] = useState<string | null>(null);
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);
  const [matchHistoryForm, setMatchHistoryForm] = useState<{type: string; workerId: string; workerName: string; workerPhone: string; date: string; endDate: string; reason: MatchingHistoryReason; reasonDetail: string; notes: string} | null>(null);
  const [editingMatchHistoryId, setEditingMatchHistoryId] = useState<string | null>(null);
  const [matchHistoryDialogOpen, setMatchHistoryDialogOpen] = useState(false);
  const [isMatchWorkerSearchOpen, setIsMatchWorkerSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [geocoding, setGeocoding] = useState(false);
  const [isCustomVoucher, setIsCustomVoucher] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<(ServiceUser & { id: string }) | null>(null);
  const [pendingProfileSync, setPendingProfileSync] = useState<{
    id: string;
    changedFields: string[];
    snapshot: { name: string; phone: string; address: string; voucherTier: number; disabilityType: string };
  } | null>(null);
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

  // 계약해지 시 매칭된 활동지원사 상태 후속 처리
  const [cascadeTarget, setCascadeTarget] = useState<{
    userName: string;
    workers: (Worker & { id: string })[];
  } | null>(null);
  const [cascadeAction, setCascadeAction] = useState<"유지" | "대기" | "퇴사">("유지");
  const [cascadeDate, setCascadeDate] = useState(new Date().toISOString().slice(0, 10));
  const navigate = useNavigate();

  // 기존 매칭 활동지원사를 다른 활동지원사로 교체할 때 인계·인수서 작성을 먼저 요구
  const [handoverGate, setHandoverGate] = useState<{
    userId: string;
    userName: string;
    prevWorkerNames: string;
    nextWorkerId: string;
    nextWorkerName: string;
    payload: Omit<ServiceUser, "id" | "createdAt" | "updatedAt">;
    prevHelperIds: string[];
    addedHelperIds: string[];
  } | null>(null);
  const [handoverMode, setHandoverMode] = useState<"end" | "handover">("end");
  const [handoverEndDate, setHandoverEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [handoverNote, setHandoverNote] = useState("");
  const [handoverWorkerStatus, setHandoverWorkerStatus] = useState<"대기" | "퇴사">("대기");
  const [cleanupTarget, setCleanupTarget] = useState<(ServiceUser & { id: string }) | null>(null);
  const [cleanupActions, setCleanupActions] = useState<Record<string, MultiMatchCleanupAction>>({});
  const [matchingPeriodDrafts, setMatchingPeriodDrafts] = useState<Record<string, MatchingPeriodDraft>>({});
  const [workerServiceEndMigrationDone, setWorkerServiceEndMigrationDone] = useState(false);
  const [serviceCloseTarget, setServiceCloseTarget] = useState<{ user: ServiceUser & { id: string }; entry: DocumentMatchingHistoryEntry } | null>(null);
  const [serviceCloseForm, setServiceCloseForm] = useState<{ endDate: string; workerStatus: "대기" | "퇴사"; reason: MatchingHistoryReason; reasonDetail: string }>({
    endDate: new Date().toISOString().slice(0, 10),
    workerStatus: "대기",
    reason: "종료",
    reasonDetail: "",
  });
  const [postServiceEndTarget, setPostServiceEndTarget] = useState<{
    userId: string;
    workerId: string;
    endDate: string;
    nextWorkerId?: string;
  } | null>(null);
  const [summaryModal, setSummaryModal] = useState<{
    title: string;
    rows: Array<{ id: string; name: string; date: string; status: string; note: string; userId?: string }>;
  } | null>(null);


  const applyCascade = async () => {
    if (!cascadeTarget) return;
    const targets = cascadeTarget.workers;
    setCascadeTarget(null);
    if (cascadeAction === "유지") return;
    for (const w of targets) {
      if (cascadeAction === "퇴사") {
        await updateWorker(w.id, { contractStatus: "퇴사", resignationDate: cascadeDate });
      } else {
        await updateWorker(w.id, { contractStatus: "대기", resignationDate: "" });
      }
    }
    toast({
      title: cascadeAction === "퇴사" ? "활동지원사 퇴사 처리 완료" : "활동지원사 대기 처리 완료",
      description: `${targets.length}명 상태를 변경했습니다.`,
    });
  };

  const { checking: nameChecking, duplicates: nameDuplicates } = useDuplicateNameCheck(form.name, users, editingId);


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
    if (form.serviceStartDate && !form.receiptDate) {
      toast({
        title: "최초 접수일이 필요합니다",
        description: "최초 서비스제공일을 입력하려면 최초 접수일을 먼저 기록해주세요.",
        variant: "destructive",
      });
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
    // 계약해지/타기관 계약/보류는 사용자가 직접 지정한 상태이므로 자동 전환하지 않음
    // (담당 활동지원사 연결은 삭제하지 않고 그대로 유지 → 이력이 끊기지 않음)
    if (payload.contractStatus === "계약해지") {
      payload.txtUMemostop = payload.terminationReason;
      payload.resignationDate = payload.resignationDate || new Date().toISOString().slice(0, 10);
    } else if (payload.contractStatus === "타기관 계약" || payload.contractStatus === "보류") {
      // 그대로 유지
    } else if (payload.terminationReason?.trim()) {
      payload.contractStatus = "계약해지";
      payload.txtUMemostop = payload.terminationReason;
      payload.resignationDate = payload.resignationDate || new Date().toISOString().slice(0, 10);
    } else {
      payload.resignationDate = "";
      const attemptedService = payload.contractStatus === "서비스중" || !!payload.serviceStartDate?.trim();
      if (arrays.ids.length === 0 && attemptedService) {
        payload.contractStatus = "작성중";
        toast({
          title: "상태가 작성중으로 변경됩니다",
          description: "담당 활동지원사가 없는 경우 서비스중 상태로 설정할 수 없습니다. '작성중' 상태로 전환됩니다.",
        });
      } else {
        payload.contractStatus = payload.serviceStartDate?.trim() && arrays.ids.length > 0 ? "서비스중" : payload.contractStatus === "작성중" ? "작성중" : "대기";
      }
    }


    const prevHelperIds = editingId
      ? users.find((u) => u.id === editingId)?.assignedHelperIds ?? []
      : [];

    // 기존 담당 활동지원사를 다른 활동지원사로 교체하는 경우 → 인계·인수서 작성 후에만 수정 가능
    if (editingId) {
      const removed = prevHelperIds.filter((id) => !arrays.ids.includes(id));
      const added = arrays.ids.filter((id) => !prevHelperIds.includes(id));
      if (prevHelperIds.length > 0 && added.length > 0) {
        const nextWorker = workers.find((w) => w.id === added[0]);
        setHandoverMode("end");
        setHandoverEndDate(new Date().toISOString().slice(0, 10));
        setHandoverNote("");
        setHandoverGate({
          userId: editingId,
          userName: form.name,
          prevWorkerNames: prevHelperIds
            .map((id) => workers.find((w) => w.id === id)?.name || id)
            .join(", "),
          nextWorkerId: added[0],
          nextWorkerName: nextWorker?.name || "",
          payload,
          prevHelperIds,
          addedHelperIds: added,
        });
        return;
      }
    }



    let savedId = editingId;
    const duplicateName = users.find((u) =>
      u.name === form.name && u.id !== editingId && u.phone !== form.phone
    );
    if (duplicateName) {
      toast({
        title: "동명이인 주의",
        description: `${form.name} 이름이 이미 등록된 이용자가 있습니다. 연락처를 확인하세요.`,
        variant: "destructive",
      });
    }

    if (editingId) {
      const previous = users.find((u) => u.id === editingId);
      const changedFields = [
        previous?.name !== payload.name ? "이름" : "",
        previous?.phone !== payload.phone ? "전화번호" : "",
        previous?.address !== payload.address ? "주소" : "",
      ].filter(Boolean);
      await update(editingId, payload);
      if (changedFields.length > 0) {
        setPendingProfileSync({
          id: editingId,
          changedFields,
          snapshot: {
            name: payload.name,
            phone: payload.phone,
            address: payload.address,
            voucherTier: payload.voucherTier,
            disabilityType: payload.disabilityType,
          },
        });
      }
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
      // 매칭 히스토리 자동 기록
      const prevSet = new Set(prevHelperIds);
      const nextSet = new Set(payload.assignedHelperIds || []);
      for (const wid of nextSet) {
        if (!prevSet.has(wid)) {
          const w = workers.find((x) => x.id === wid);
          if (w) {
            await addMatchingHistory({
              type: "매칭",
              userId: savedId,
              userName: payload.name,
              userPhone: payload.phone,
              workerId: w.id,
              workerName: w.name,
              workerPhone: w.phone,
              date: new Date().toISOString().slice(0, 10),
              notes: "활동지원사 배정",
            } as any);
          }
        }
      }
      for (const wid of prevSet) {
        if (!nextSet.has(wid)) {
          const w = workers.find((x) => x.id === wid);
          if (w) {
            await addMatchingHistory({
              type: "해제",
              userId: savedId,
              userName: payload.name,
              userPhone: payload.phone,
              workerId: w.id,
              workerName: w.name,
              workerPhone: w.phone,
              date: new Date().toISOString().slice(0, 10),
              notes: "활동지원사 배정 해제",
            } as any);
          }
        }
      }
    }
    // 계약해지로 전환된 경우, 매칭되어 있던 활동지원사 후속 처리를 확인
    if (payload.contractStatus === "계약해지") {
      const linked = (payload.assignedHelperIds || [])
        .map((id) => workers.find((w) => w.id === id))
        .filter((w): w is Worker & { id: string } => !!w && w.contractStatus !== "퇴사");
      if (linked.length > 0) {
        setCascadeAction("유지");
        setCascadeDate(payload.resignationDate || new Date().toISOString().slice(0, 10));
        setCascadeTarget({ userName: payload.name, workers: linked });
      }
    }

    setForm(emptyUser);
    setAgeInput("");
    setEditingId(null);
    setDialogOpen(false);
  };

  const finalizeHandoverSave = async () => {
    if (!handoverGate) return;
    if (!handoverEndDate) {
      toast({ title: "기존 지원사의 서비스 종료일을 입력해주세요", variant: "destructive" });
      return;
    }
    if (handoverMode === "handover" && !handoverNote.trim()) {
      toast({ title: "인계인수서 내용을 입력해주세요", variant: "destructive" });
      return;
    }

    const activeAddedIds = handoverGate.addedHelperIds.slice(-1);
    const arrays = buildHelperArraysFromIds(activeAddedIds, workers);
    const handoverUser = users.find((u) => u.id === handoverGate.userId);
    const handoverBaseHistory = handoverUser ? getDocumentMatchingEntries(handoverUser) : [];
    const startDateForHandover = handoverGate.payload.serviceStartDate || new Date().toISOString().slice(0, 10);
    const handoverHistoryByWorker = new Map<string, DocumentMatchingHistoryEntry>();
    for (const entry of handoverBaseHistory) {
      handoverHistoryByWorker.set(entry.workerId, {
        ...entry,
        serviceEndDate: handoverGate.prevHelperIds.includes(entry.workerId) ? handoverEndDate : entry.serviceEndDate,
        reason: handoverGate.prevHelperIds.includes(entry.workerId) ? (handoverMode === "handover" ? "인계" : "종료") : entry.reason,
        reasonDetail: handoverGate.prevHelperIds.includes(entry.workerId) ? handoverNote : entry.reasonDetail,
        updatedAt: new Date().toISOString(),
      });
    }
    for (const workerId of activeAddedIds) {
      const worker = workers.find((w) => w.id === workerId);
      if (!worker) continue;
      handoverHistoryByWorker.set(workerId, {
        id: handoverHistoryByWorker.get(workerId)?.id || `${workerId}-${Date.now()}`,
        workerId,
        workerName: worker.name,
        workerPhone: worker.phone,
        serviceStartDate: startDateForHandover,
        serviceEndDate: null,
        reason: handoverMode === "handover" ? "인계" : "교체",
        reasonDetail: handoverNote,
        updatedAt: new Date().toISOString(),
      });
    }
    const finalPayload: Omit<ServiceUser, "id" | "createdAt" | "updatedAt"> = {
      ...handoverGate.payload,
      assignedHelperIds: arrays.ids,
      assigned_workers: arrays.ids,
      assignedHelperNames: arrays.names,
      assignedHelperPhones: arrays.phones,
      matchingHistory: Array.from(handoverHistoryByWorker.values()),
    };

    await update(handoverGate.userId, finalPayload);
    await syncUserToWorkers(handoverGate.userId, finalPayload, workers, handoverGate.prevHelperIds, updateWorker);

    if (handoverMode === "end") {
      for (const workerId of handoverGate.prevHelperIds) {
        if (handoverGate.addedHelperIds.includes(workerId)) continue;
        await updateWorker(workerId, {
          contractStatus: handoverWorkerStatus,
          serviceEndDate: handoverEndDate,
          retirementDate: handoverWorkerStatus === "퇴사" ? handoverEndDate : "",
          resignationDate: handoverWorkerStatus === "퇴사" ? handoverEndDate : "",
        });
      }
    }

    for (const workerId of activeAddedIds) {
      const worker = workers.find((w) => w.id === workerId);
      if (!worker) continue;
      await updateWorker(workerId, { contractStatus: "근무중", serviceStartDate: startDateForHandover, serviceEndDate: null, retirementDate: "", resignationDate: "" });
      await addMatchingHistory({
        type: "매칭",
        userId: handoverGate.userId,
        userName: finalPayload.name,
        userPhone: finalPayload.phone,
        workerId: worker.id,
        workerName: worker.name,
        workerPhone: worker.phone,
        date: finalPayload.serviceStartDate || new Date().toISOString().slice(0, 10),
        notes: handoverMode === "handover" ? `인계인수 교체: ${handoverNote}` : "기존 지원사 종료 후 신규 매칭",
      } as any);
    }

    for (const workerId of handoverGate.prevHelperIds) {
      if (activeAddedIds.includes(workerId)) continue;
      const worker = workers.find((w) => w.id === workerId);
      if (!worker) continue;
      await addMatchingHistory({
        type: "해제",
        userId: handoverGate.userId,
        userName: finalPayload.name,
        userPhone: finalPayload.phone,
        workerId: worker.id,
        workerName: worker.name,
        workerPhone: worker.phone,
        date: finalPayload.serviceStartDate || new Date().toISOString().slice(0, 10),
        endDate: handoverEndDate,
        notes: handoverMode === "handover" ? `인계인수 교체 종료: ${handoverNote}` : `기존 지원사 종료 처리 (${handoverWorkerStatus})`,
      } as any);
    }

    toast({ title: handoverMode === "handover" ? "인계인수 교체 완료" : "기존 지원사 종료 후 매칭 완료" });
    setHandoverGate(null);
    setHandoverNote("");
    setHandoverWorkerStatus("대기");
    setForm(emptyUser);
    setAgeInput("");
    setEditingId(null);
    setDialogOpen(false);
  };

  const openCleanupDialog = (user: ServiceUser & { id: string }) => {
    const today = new Date().toISOString().slice(0, 10);
    const actions = Object.fromEntries(
      (user.assignedHelperIds || []).map((workerId) => [workerId, { mode: "end" as const, endDate: today, workerStatus: "대기" as const }])
    );
    setCleanupTarget(user);
    setCleanupActions(actions);
  };

  const updateCleanupAction = (workerId: string, patch: Partial<MultiMatchCleanupAction>) => {
    setCleanupActions((prev) => ({
      ...prev,
      [workerId]: { ...(prev[workerId] || { mode: "end", endDate: new Date().toISOString().slice(0, 10), workerStatus: "대기" }), ...patch },
    }));
  };

  const cleanupWorkerAssignment = async (workerId: string) => {
    if (!cleanupTarget) return;
    const action = cleanupActions[workerId];
    const worker = workers.find((w) => w.id === workerId);
    if (!worker || !action) return;

    if (action.mode === "handover") {
      setCleanupTarget(null);
      navigate(`/handovers?${new URLSearchParams({ userId: cleanupTarget.id, prevWorkerId: worker.id }).toString()}`);
      return;
    }

    if (!action.endDate) {
      toast({ title: "서비스 종료일을 입력해주세요", variant: "destructive" });
      return;
    }

    const nextIds = (cleanupTarget.assignedHelperIds || []).filter((id) => id !== workerId);
    const arrays = buildHelperArraysFromIds(nextIds, workers);
    const payload: Partial<ServiceUser> = {
      assignedHelperIds: arrays.ids,
      assigned_workers: arrays.ids,
      assignedHelperNames: arrays.names,
      assignedHelperPhones: arrays.phones,
    };
    await update(cleanupTarget.id, payload);
    await syncUserToWorkers(cleanupTarget.id, { ...cleanupTarget, ...payload }, workers, cleanupTarget.assignedHelperIds || [], updateWorker);
    await updateWorker(workerId, {
      contractStatus: action.workerStatus,
      serviceEndDate: action.endDate,
      retirementDate: action.workerStatus === "퇴사" ? action.endDate : "",
      resignationDate: action.workerStatus === "퇴사" ? action.endDate : "",
    });
    await addMatchingHistory({
      type: "해제",
      userId: cleanupTarget.id,
      userName: cleanupTarget.name,
      userPhone: cleanupTarget.phone,
      workerId: worker.id,
      workerName: worker.name,
      workerPhone: worker.phone,
      date: cleanupTarget.serviceStartDate || new Date().toISOString().slice(0, 10),
      endDate: action.endDate,
      notes: `1:다 매칭 정돈 - 종료 처리 (${action.workerStatus})`,
    } as any);

    const updatedTarget = { ...cleanupTarget, ...payload } as ServiceUser & { id: string };
    setCleanupTarget(updatedTarget.assignedHelperIds.length > 1 ? updatedTarget : null);
    if (detailTarget?.id === cleanupTarget.id) setDetailTarget(updatedTarget);
    toast({ title: "1:다 매칭 정돈 완료", description: `${worker.name} 지원사를 담당 목록에서 제외했습니다.` });
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

  const getDocumentMatchingEntries = (user: ServiceUser & { id: string }): DocumentMatchingHistoryEntry[] => {
    const byWorker = new Map<string, DocumentMatchingHistoryEntry>();
    const today = new Date().toISOString().slice(0, 10);

    for (const entry of user.matchingHistory || []) {
      if (!entry.workerId) continue;
      const worker = workers.find((w) => w.id === entry.workerId);
      byWorker.set(entry.workerId, {
        id: entry.id || `${entry.workerId}-${entry.serviceStartDate || today}`,
        workerId: entry.workerId,
        workerName: entry.workerName || worker?.name || "",
        workerPhone: entry.workerPhone || worker?.phone || "",
        serviceStartDate: entry.serviceStartDate || user.serviceStartDate || today,
        serviceEndDate: entry.serviceEndDate ?? null,
        reason: entry.reason || "추가",
        reasonDetail: entry.reasonDetail || "",
        updatedAt: entry.updatedAt,
      });
    }

    for (const workerId of user.assignedHelperIds || []) {
      const worker = workers.find((w) => w.id === workerId);
      const existing = byWorker.get(workerId);
      const existingEnded = existing && existing.serviceEndDate !== null && existing.serviceEndDate !== "";
      byWorker.set(workerId, {
        id: existing?.id || `${workerId}-${user.serviceStartDate || today}`,
        workerId,
        workerName: existing?.workerName || worker?.name || user.assignedHelperNames?.[(user.assignedHelperIds || []).indexOf(workerId)] || "",
        workerPhone: existing?.workerPhone || worker?.phone || user.assignedHelperPhones?.[(user.assignedHelperIds || []).indexOf(workerId)] || "",
        serviceStartDate: existing?.serviceStartDate || user.serviceStartDate || today,
        serviceEndDate: existingEnded ? existing.serviceEndDate : null,
        reason: existing?.reason || "추가",
        reasonDetail: existing?.reasonDetail || "",
        updatedAt: existing?.updatedAt,
      });
    }

    for (const log of matchingLogs.filter((record) => record.userId === user.id)) {
      if (!log.workerId || byWorker.has(log.workerId)) continue;
      byWorker.set(log.workerId, {
        id: log.id || `${log.workerId}-${log.date || today}`,
        workerId: log.workerId,
        workerName: log.workerName,
        workerPhone: log.workerPhone,
        serviceStartDate: log.date || today,
        serviceEndDate: log.endDate || (log.type === "해제" ? today : null),
        reason: log.reason || (log.type === "해제" ? "종료" : "추가"),
        reasonDetail: log.reasonDetail || log.notes || "",
        updatedAt: undefined,
      });
    }

    return Array.from(byWorker.values()).sort((a, b) => {
      const activeDiff = Number(a.serviceEndDate !== null) - Number(b.serviceEndDate !== null);
      if (activeDiff !== 0) return activeDiff;
      return getComparableDateValue(b.serviceStartDate).localeCompare(getComparableDateValue(a.serviceStartDate));
    });
  };


  const getCurrentMatchingEntry = (user: ServiceUser & { id: string }): DocumentMatchingHistoryEntry | null => {
    const active = getDocumentMatchingEntries(user)
      .filter((entry) => entry.serviceEndDate === null || entry.serviceEndDate === "")
      .sort((a, b) => getComparableDateValue(b.serviceStartDate).localeCompare(getComparableDateValue(a.serviceStartDate)));
    return active[0] || null;
  };

  const formatCurrentHelper = (user: ServiceUser & { id: string }): string => {
    const current = getCurrentMatchingEntry(user);
    if (!current) return "";
    const last4 = String(current.workerPhone || "").replace(/\D/g, "").slice(-4);
    return last4 ? `${current.workerName}(${last4})` : current.workerName;
  };

  const getActiveMatchingEntries = (user: ServiceUser & { id: string }): DocumentMatchingHistoryEntry[] => {
    return getDocumentMatchingEntries(user)
      .filter((entry) => entry.serviceEndDate === null || entry.serviceEndDate === "")
      .sort((a, b) => getComparableDateValue(b.serviceStartDate).localeCompare(getComparableDateValue(a.serviceStartDate)));
  };

  const getUniqueEntriesByWorker = (entries: DocumentMatchingHistoryEntry[]) => {
    const byWorker = new Map<string, DocumentMatchingHistoryEntry>();
    for (const entry of entries) {
      if (!entry.workerId) continue;
      const previous = byWorker.get(entry.workerId);
      if (!previous || getComparableDateValue(entry.serviceStartDate).localeCompare(getComparableDateValue(previous.serviceStartDate)) >= 0) {
        byWorker.set(entry.workerId, entry);
      }
    }
    return Array.from(byWorker.values());
  };

  const periodsOverlap = (a: DocumentMatchingHistoryEntry, b: DocumentMatchingHistoryEntry) => {
    const aStart = getComparableDateValue(a.serviceStartDate);
    const bStart = getComparableDateValue(b.serviceStartDate);
    const aEnd = getComparableDateValue(a.serviceEndDate || "9999-12-31");
    const bEnd = getComparableDateValue(b.serviceEndDate || "9999-12-31");
    return aStart <= bEnd && bStart <= aEnd;
  };

  const getOverlappingHelperNames = (entries: DocumentMatchingHistoryEntry[]) => {
    const unique = getUniqueEntriesByWorker(entries);
    for (let i = 0; i < unique.length; i += 1) {
      const overlapping = unique.filter((entry, index) => index !== i && periodsOverlap(unique[i], entry));
      if (overlapping.length > 0) {
        return Array.from(new Set([unique[i], ...overlapping].map((entry) => entry.workerName || entry.workerId).filter(Boolean)));
      }
    }
    return [];
  };

  const formatCurrentHelperPreview = (user: ServiceUser & { id: string }): string => {
    const entries = getUniqueEntriesByWorker(getDocumentMatchingEntries(user));
    const overlappingNames = getOverlappingHelperNames(entries);
    if (overlappingNames.length > 1) return `1:다 (${overlappingNames.join(", ")})`;

    const chronologicalNames = Array.from(new Set(
      entries
        .filter((entry) => entry.workerName || entry.workerId)
        .sort((a, b) => getComparableDateValue(a.serviceStartDate).localeCompare(getComparableDateValue(b.serviceStartDate)))
        .map((entry) => entry.workerName || entry.workerId)
    ));
    if (chronologicalNames.length > 1) return chronologicalNames.join(" → ");

    const activeEntries = getActiveMatchingEntries(user);
    if (activeEntries.length === 1) return activeEntries[0].workerName || activeEntries[0].workerId;
    if (chronologicalNames.length === 1) return chronologicalNames[0];
    return formatHelperList(user);
  };
  const getHelperHistoryLabel = (user: ServiceUser & { id: string }): string => {
    const seen = new Set<string>();
    const names: string[] = [];
    const chronological = matchingLogs
      .filter((record) => record.userId === user.id && record.type !== "시도" && !!record.workerName)
      .sort((a, b) => getComparableDateValue((a as any).startDate || a.date).localeCompare(getComparableDateValue((b as any).startDate || b.date)));

    for (const record of chronological) {
      const key = record.workerId || record.workerName.trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      names.push(record.workerName.trim());
    }
    (user.assignedHelperNames || []).forEach((name, index) => {
      const key = user.assignedHelperIds?.[index] || name.trim();
      if (!key || seen.has(key)) return;
      seen.add(key);
      names.push(name.trim());
    });
    return names.filter(Boolean).join(" → ") || "없음";
  };

  const resetMatchingPeriodDrafts = (user: ServiceUser & { id: string }) => {
    const next = Object.fromEntries(
      getDocumentMatchingEntries(user).map((entry) => [
        entry.workerId,
        {
          serviceStartDate: entry.serviceStartDate || "",
          serviceEndDate: entry.serviceEndDate || "",
          isCurrent: entry.serviceEndDate === null || entry.serviceEndDate === "",
          workerStatus: "대기" as const,
          reason: entry.reason || "추가",
          reasonDetail: entry.reasonDetail || "",
        },
      ])
    );
    setMatchingPeriodDrafts(next);
  };

  const updateMatchingPeriodDraft = (workerId: string, patch: Partial<MatchingPeriodDraft>) => {
    setMatchingPeriodDrafts((prev) => ({
      ...prev,
      [workerId]: {
        ...(prev[workerId] || { serviceStartDate: "", serviceEndDate: "", isCurrent: true, workerStatus: "대기", reason: "추가", reasonDetail: "" }),
        ...patch,
      },
    }));
  };

  const saveMatchingPeriod = async (user: ServiceUser & { id: string }, workerId: string) => {
    const draft = matchingPeriodDrafts[workerId];
    const worker = workers.find((w) => w.id === workerId);
    if (!draft || !worker) return;
    if (!draft.serviceStartDate) {
      toast({ title: "서비스 시작일을 입력해주세요", variant: "destructive" });
      return;
    }
    if (!draft.isCurrent && !draft.serviceEndDate) {
      toast({ title: "종료 처리하려면 서비스 종료일을 입력해주세요", variant: "destructive" });
      return;
    }

    const now = new Date().toISOString();
    const existingEntries = getDocumentMatchingEntries(user);
    const nextEntry: DocumentMatchingHistoryEntry = {
      id: existingEntries.find((entry) => entry.workerId === workerId)?.id || `${workerId}-${Date.now()}`,
      workerId,
      workerName: worker.name,
      workerPhone: worker.phone,
      serviceStartDate: draft.serviceStartDate,
      serviceEndDate: draft.isCurrent ? null : draft.serviceEndDate,
      reason: draft.reason,
      reasonDetail: draft.reasonDetail,
      updatedAt: now,
    };
    const nextHistory = [
      ...existingEntries.filter((entry) => entry.workerId !== workerId),
      nextEntry,
    ];
    const activeEntries = nextHistory
      .filter((entry) => entry.serviceEndDate === null || entry.serviceEndDate === "")
      .sort((a, b) => getComparableDateValue(b.serviceStartDate).localeCompare(getComparableDateValue(a.serviceStartDate)));
    const activeIds = draft.isCurrent
      ? [workerId]
      : activeEntries.filter((entry) => entry.workerId !== workerId).slice(0, 1).map((entry) => entry.workerId);
    const arrays = buildHelperArraysFromIds(activeIds, workers);
    const nextStatus = user.contractStatus === "계약해지" || user.contractStatus === "타기관 계약" || user.contractStatus === "보류"
      ? user.contractStatus
      : arrays.ids.length > 0
        ? "서비스중"
        : "대기";
    const payload: Partial<ServiceUser> = {
      assignedHelperIds: arrays.ids,
      assigned_workers: arrays.ids,
      assignedHelperNames: arrays.names,
      assignedHelperPhones: arrays.phones,
      matchingHistory: nextHistory,
      contractStatus: nextStatus,
    };

    await update(user.id, payload);
    await syncUserToWorkers(user.id, { ...user, ...payload }, workers, user.assignedHelperIds || [], updateWorker);
    if (draft.isCurrent) {
      await updateWorker(workerId, { contractStatus: "근무중", serviceStartDate: draft.serviceStartDate, serviceEndDate: null, retirementDate: "", resignationDate: "" });
    } else {
      await updateWorker(workerId, {
        contractStatus: draft.workerStatus,
        serviceEndDate: draft.serviceEndDate,
        retirementDate: draft.workerStatus === "퇴사" ? draft.serviceEndDate : "",
        resignationDate: draft.workerStatus === "퇴사" ? draft.serviceEndDate : "",
      });
    }
    await addMatchingHistory({
      type: draft.isCurrent ? "매칭" : "해제",
      userId: user.id,
      userName: user.name,
      userPhone: user.phone,
      workerId,
      workerName: worker.name,
      workerPhone: worker.phone,
      date: draft.serviceStartDate,
      endDate: draft.isCurrent ? undefined : draft.serviceEndDate,
      reason: draft.reason,
      reasonDetail: draft.reasonDetail,
      notes: draft.reasonDetail || draft.reason,
    } as any);

    const updatedUser = { ...user, ...payload } as ServiceUser & { id: string };
    if (detailTarget?.id === user.id) setDetailTarget(updatedUser);
    if (editingId === user.id) setForm((prev) => ({ ...prev, ...payload }));
    resetMatchingPeriodDrafts(updatedUser);
    toast({ title: draft.isCurrent ? "현재 담당으로 저장했습니다" : "종료 이력으로 전환했습니다" });
    if (!draft.isCurrent && draft.serviceEndDate) {
      setPostServiceEndTarget({
        userId: user.id,
        workerId,
        endDate: draft.serviceEndDate,
      });
    }
  };

  const openServiceCloseDialog = (user: ServiceUser & { id: string }, entry: DocumentMatchingHistoryEntry) => {
    const draft = matchingPeriodDrafts[entry.workerId];
    setServiceCloseTarget({ user, entry });
    setServiceCloseForm({
      endDate: draft?.serviceEndDate || entry.serviceEndDate || new Date().toISOString().slice(0, 10),
      workerStatus: draft?.workerStatus || "대기",
      reason: "종료",
      reasonDetail: draft?.reasonDetail || "",
    });
  };

  const finalizeServiceClose = async () => {
    if (!serviceCloseTarget) return;
    if (!serviceCloseForm.endDate) {
      toast({ title: "서비스 종료일을 입력해주세요", variant: "destructive" });
      return;
    }
    const { user, entry } = serviceCloseTarget;
    const worker = workers.find((w) => w.id === entry.workerId);
    if (!worker) return;

    const existingEntries = getDocumentMatchingEntries(user);
    const closedEntry: DocumentMatchingHistoryEntry = {
      ...entry,
      workerName: worker.name,
      workerPhone: worker.phone,
      serviceStartDate: entry.serviceStartDate || user.serviceStartDate || new Date().toISOString().slice(0, 10),
      serviceEndDate: serviceCloseForm.endDate,
      reason: serviceCloseForm.reason,
      reasonDetail: serviceCloseForm.reasonDetail,
      updatedAt: new Date().toISOString(),
    };
    const nextHistory = [
      ...existingEntries.filter((item) => item.workerId !== entry.workerId),
      closedEntry,
    ];
    const nextActiveIds = nextHistory
      .filter((item) => item.workerId !== entry.workerId && (item.serviceEndDate === null || item.serviceEndDate === ""))
      .sort((a, b) => getComparableDateValue(b.serviceStartDate).localeCompare(getComparableDateValue(a.serviceStartDate)))
      .slice(0, 1)
      .map((item) => item.workerId);
    const arrays = buildHelperArraysFromIds(nextActiveIds, workers);
    const payload: Partial<ServiceUser> = {
      assignedHelperIds: arrays.ids,
      assigned_workers: arrays.ids,
      assignedHelperNames: arrays.names,
      assignedHelperPhones: arrays.phones,
      matchingHistory: nextHistory,
      contractStatus: user.contractStatus === "계약해지" || user.contractStatus === "타기관 계약" || user.contractStatus === "보류"
        ? user.contractStatus
        : arrays.ids.length > 0
          ? "서비스중"
          : "작성중",
    };

    await update(user.id, payload);
    await syncUserToWorkers(user.id, { ...user, ...payload }, workers, user.assignedHelperIds || [], updateWorker);
    await updateWorker(entry.workerId, {
      contractStatus: serviceCloseForm.workerStatus,
      serviceEndDate: serviceCloseForm.endDate,
      retirementDate: serviceCloseForm.workerStatus === "퇴사" ? serviceCloseForm.endDate : "",
      resignationDate: serviceCloseForm.workerStatus === "퇴사" ? serviceCloseForm.endDate : "",
    });
    await addMatchingHistory({
      type: "해제",
      userId: user.id,
      userName: user.name,
      userPhone: user.phone,
      workerId: entry.workerId,
      workerName: worker.name,
      workerPhone: worker.phone,
      date: closedEntry.serviceStartDate,
      endDate: serviceCloseForm.endDate,
      reason: serviceCloseForm.reason,
      reasonDetail: serviceCloseForm.reasonDetail,
      notes: serviceCloseForm.reasonDetail || serviceCloseForm.reason,
    } as any);

    const updatedUser = { ...user, ...payload } as ServiceUser & { id: string };
    if (detailTarget?.id === user.id) setDetailTarget(updatedUser);
    if (editingId === user.id) setForm((prev) => ({ ...prev, ...payload }));
    resetMatchingPeriodDrafts(updatedUser);
    setServiceCloseTarget(null);
    setPostServiceEndTarget({
      userId: user.id,
      workerId: entry.workerId,
      endDate: serviceCloseForm.endDate,
    });
    toast({ title: "서비스 종료/교체 처리 완료", description: `${worker.name} 지원사를 현재 담당에서 제외했습니다.` });
  };
  const renderMatchingPeriodEditor = (user: ServiceUser & { id: string }) => {
    const entries = getDocumentMatchingEntries(user);
    const currentCount = entries.filter((entry) => {
      const draft = matchingPeriodDrafts[entry.workerId];
      return draft ? draft.isCurrent : entry.serviceEndDate === null || entry.serviceEndDate === "";
    }).length;

    if (entries.length === 0) {
      return <p className="text-sm text-muted-foreground">연결된 활동지원사가 없습니다.</p>;
    }

    return (
      <div className="space-y-3">
        {currentCount > 1 && (
          <Alert variant="destructive">
            <AlertTitle>현재 서비스 중인 지원사가 2명 이상입니다.</AlertTitle>
            <AlertDescription>실제 담당자 1명만 '서비스 중'으로 유지하거나 기간을 정리해 주세요.</AlertDescription>
          </Alert>
        )}
        {entries.map((entry) => {
          const draft = matchingPeriodDrafts[entry.workerId] || {
            serviceStartDate: entry.serviceStartDate || "",
            serviceEndDate: entry.serviceEndDate || "",
            isCurrent: entry.serviceEndDate === null || entry.serviceEndDate === "",
            workerStatus: "대기" as const,
            reason: entry.reason || "추가",
            reasonDetail: entry.reasonDetail || "",
          };
          return (
            <div key={entry.workerId} className="border rounded-lg p-3 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{entry.workerName || entry.workerId}</p>
                  <p className="text-xs text-muted-foreground">{entry.workerPhone || "연락처 없음"}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge variant={draft.isCurrent ? "default" : "secondary"}>{draft.isCurrent ? "서비스 중" : "종료(이력)"}</Badge>
                  <Button size="sm" variant="outline" onClick={() => openServiceCloseDialog(user, entry)}>서비스 종료/교체</Button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="space-y-2">
                  <Label>서비스 시작일</Label>
                  <Input type="date" value={draft.serviceStartDate} onChange={(e) => updateMatchingPeriodDraft(entry.workerId, { serviceStartDate: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>현재 서비스 중</Label>
                  <div className="h-10 flex items-center gap-2">
                    <Checkbox
                      checked={draft.isCurrent}
                      onCheckedChange={(checked) => updateMatchingPeriodDraft(entry.workerId, { isCurrent: checked === true, serviceEndDate: checked === true ? "" : draft.serviceEndDate })}
                    />
                    <span className="text-sm">서비스 중</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>서비스 종료일</Label>
                  <Input type="date" disabled={draft.isCurrent} value={draft.serviceEndDate} onChange={(e) => updateMatchingPeriodDraft(entry.workerId, { serviceEndDate: e.target.value })} />
                </div>
                {!draft.isCurrent && (
                  <div className="space-y-2">
                    <Label>종료 후 지원사 상태</Label>
                    <Select value={draft.workerStatus} onValueChange={(v) => updateMatchingPeriodDraft(entry.workerId, { workerStatus: v as "대기" | "퇴사" })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="대기">대기</SelectItem>
                        <SelectItem value="퇴사">퇴사</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>변경 사유</Label>
                  <Select value={draft.reason} onValueChange={(v) => updateMatchingPeriodDraft(entry.workerId, { reason: v as MatchingHistoryReason })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MATCH_REASON_OPTIONS.map((reason) => <SelectItem key={reason} value={reason}>{reason}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>상세 사유(선택)</Label>
                  <Input value={draft.reasonDetail} onChange={(e) => updateMatchingPeriodDraft(entry.workerId, { reasonDetail: e.target.value })} placeholder="필요 시 간단히 입력" />
                </div>
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={() => saveMatchingPeriod(user, entry.workerId)}>기간 저장</Button>
              </div>
            </div>
          );
        })}
      </div>
    );
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


  const openUserSummaryModal = (kind: "contracts" | "terminations" | "waiting" | "handover" | "counseling") => {
    const helperText = (user: ServiceUser & { id: string }) => formatCurrentHelper(user) || formatHelperList(user) || "담당자 없음";
    const makeUserRow = (user: ServiceUser & { id: string }, date: string, note: string) => ({
      id: `${kind}-${user.id}`,
      name: user.name,
      date,
      status: effectiveUserStatus(user),
      note,
      userId: user.id,
    });

    let title = "";
    let rows: Array<{ id: string; name: string; date: string; status: string; note: string; userId?: string }> = [];

    if (kind === "contracts") {
      rows = users
        .filter((user) => isWithinRecentMonths(user.serviceStartDate || user.receiptDate))
        .map((user) => makeUserRow(user, user.serviceStartDate || user.receiptDate || "미등록", `담당: ${helperText(user)}`));
      title = `최근 3개월 신규 계약/접수 명단 (총 ${rows.length}명)`;
    } else if (kind === "terminations") {
      rows = users
        .filter((user) => effectiveUserStatus(user) === "계약해지" || isWithinRecentMonths(user.resignationDate))
        .map((user) => makeUserRow(user, user.resignationDate || "미등록", user.terminationReason || user.txtUMemostop || "해지 사유 미등록"));
      title = `해지/종결 이용자 명단 (총 ${rows.length}명)`;
    } else if (kind === "waiting") {
      rows = users
        .filter((user) => effectiveUserStatus(user) === "대기" || !(user.assignedHelperIds || []).length)
        .map((user) => makeUserRow(user, user.receiptDate || "미등록", [user.requiredDays, user.requiredHours, user.preferredWorkerTraits].filter(Boolean).join(" · ") || "희망 조건 미등록"));
      title = `현재 대기 이용자 명단 (총 ${rows.length}명)`;
    } else if (kind === "handover") {
      rows = matchingLogs
        .filter((log) => isWithinRecentMonths(log.date) && (log.reason === "인계" || String(log.notes || log.reasonDetail || "").includes("인계") || String(log.notes || log.reasonDetail || "").includes("교체")))
        .map((log) => ({
          id: `handover-${log.id || log.userId}-${log.workerId}`,
          name: log.userName,
          date: log.date,
          status: log.reason || log.type,
          note: `${log.workerName || "지원사 미등록"} · ${log.notes || log.reasonDetail || "상세 없음"}`,
          userId: log.userId,
        }));
      title = `최근 3개월 인계인수/변경 명단 (총 ${rows.length}건)`;
    } else {
      rows = counselingLogs
        .filter((record) => record.targetType === "이용자" && isWithinRecentMonths(record.date))
        .map((record) => ({
          id: `counsel-${record.id || record.targetId}-${record.date}`,
          name: record.targetName,
          date: record.date,
          status: record.result || record.category || "상담",
          note: record.content || "상담 내용 없음",
          userId: record.targetId,
        }));
      title = `최근 이용자/보호자 상담 기록 (총 ${rows.length}건)`;
    }

    setSummaryModal({ title, rows });
  };

  const openSummaryUser = (userId?: string) => {
    if (!userId) return;
    const target = users.find((user) => user.id === userId);
    if (target) openDetail(target);
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
  const selectedHandoverDocs = useMemo(() => {
    if (!detailTarget) return [];
    return handoverDocs.filter((doc) => doc.userId === detailTarget.id);
  }, [handoverDocs, detailTarget]);

  const getHandoverForMatch = (match: MatchingHistoryRecord) => {
    return selectedHandoverDocs.find((doc) =>
      doc.userId === match.userId &&
      (doc.prevWorkerId === match.workerId || doc.nextWorkerId === match.workerId) &&
      (!match.endDate || doc.handoverDate === match.endDate || doc.takeoverDate === match.endDate || doc.handoverDate === match.date || doc.takeoverDate === match.date)
    );
  };

  const openHandoverFromMatch = (match: MatchingHistoryRecord) => {
    const params = new URLSearchParams({
      userId: match.userId,
      oldWorkerId: match.workerId,
      endDate: match.endDate || match.date,
    });
    navigate(`/handovers?${params.toString()}`);
  };

  const selectedMatchHistoryWorker = useMemo(() => {
    if (!matchHistoryForm?.workerId) return null;
    return workers.find((worker) => worker.id === matchHistoryForm.workerId) || null;
  }, [workers, matchHistoryForm?.workerId]);

  const selectMatchHistoryWorker = (worker: Worker & { id?: string }) => {
    if (!matchHistoryForm || !worker.id) return;
    setMatchHistoryForm({
      ...matchHistoryForm,
      workerId: worker.id,
      workerName: worker.name,
      workerPhone: worker.phone,
    });
    setIsMatchWorkerSearchOpen(false);
  };

  const getFilteredUsers = () => {
    return users.filter((u) => {
      const matchesName = String(u.name || "").includes(search);
      const matchesPhone = String(u.phone || "").includes(search);
      // 매칭된 활동지원사 이름/연락처로도 검색 가능
      const matchesHelper =
        (u.assignedHelperNames || []).some((n) => String(n || "").includes(search)) ||
        (u.assignedHelperPhones || []).some((p) => String(p || "").includes(search));
      const matchSearch = !search || matchesName || matchesPhone || matchesHelper;

      const status = effectiveUserStatus(u);

      // 대기중 필터: 미배정 사용자만 표시
      if (statusFilter === "대기") {
        const isUnmatched = !u.assignedHelperIds || u.assignedHelperIds.length === 0;
        return matchSearch && status === "대기" && isUnmatched;
      }

      const matchStatus = statusFilter === "all" || status === statusFilter;
      return matchSearch && matchStatus;
    });
  };

  const filtered = getFilteredUsers();
  const terminatedCount = users.filter((u) => effectiveUserStatus(u) === "계약해지").length;
  const activeCount = users.filter((u) => effectiveUserStatus(u) === "서비스중").length;

  const userSummary = useMemo(() => {
    const recentContracts = users.filter((u) => isWithinRecentMonths(u.serviceStartDate)).length;
    const recentTerminations = users.filter((u) => isWithinRecentMonths(u.resignationDate)).length;
    const waiting = users.filter((u) => effectiveUserStatus(u) === "대기" || !(u.assignedHelperIds || []).length).length;
    const handoverEvents = matchingLogs.filter((log) =>
      isWithinRecentMonths(log.date) &&
      (log.reason === "인계" || String(log.notes || log.reasonDetail || "").includes("인계") || String(log.notes || log.reasonDetail || "").includes("교체"))
    ).length;
    const recentCounseling = counselingLogs.filter((record) => record.targetType === "이용자" && isWithinRecentMonths(record.date)).length;
    const unresolvedCounseling = counselingLogs.filter((record) =>
      record.targetType === "이용자" &&
      isWithinRecentMonths(record.date) &&
      (!record.result || String(record.result).includes("미처리"))
    ).length;
    return { recentContracts, recentTerminations, waiting, handoverEvents, recentCounseling, unresolvedCounseling };
  }, [users, matchingLogs, counselingLogs]);

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
                  <div>
                    <Label>이름 *</Label>
                    <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                    {nameChecking ? (
                      <p className="text-xs text-muted-foreground mt-1">동명이인 확인 중...</p>
                    ) : nameDuplicates.length > 0 ? (
                      <p className="text-xs text-destructive mt-1">
                        ⚠️ 동명이인 {nameDuplicates.length}명 존재: {nameDuplicates.map((d) => d.phone || "연락처 없음").join(", ")}
                      </p>
                    ) : null}
                  </div>
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
                    <Select
                      value={form.contractStatus}
                      onValueChange={(v) =>
                        setForm((f) => ({
                          ...f,
                          contractStatus: v as any,
                          resignationDate:
                            v === "계약해지"
                              ? f.resignationDate || new Date().toISOString().slice(0, 10)
                              : "",
                        }))
                      }
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="서비스중">서비스중</SelectItem>
                        <SelectItem value="작성중">작성중</SelectItem>
                        <SelectItem value="대기">대기</SelectItem>
                        <SelectItem value="계약해지">계약해지</SelectItem>
                        <SelectItem value="타기관 계약">타기관 계약</SelectItem>
                        <SelectItem value="보류">보류</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>최초 접수일</Label>
                    <Input type="date" value={form.receiptDate} onChange={(e) => setForm((f) => ({ ...f, receiptDate: e.target.value }))} />
                  </div>
                  <div>
                    <Label>최초 서비스제공일</Label>
                    <Input
                      type="date"
                      value={form.serviceStartDate}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          serviceStartDate: e.target.value,
                          contractStatus:
                            f.contractStatus === "계약해지" || f.contractStatus === "타기관 계약" || f.contractStatus === "보류"
                              ? f.contractStatus
                              : e.target.value
                                ? "서비스중"
                                : "대기",
                        }))
                      }
                    />
                    {form.serviceStartDate && !form.receiptDate && (
                      <p className="text-xs text-destructive mt-1">
                        ⚠ 최초 서비스제공일을 입력하려면 최초 접수일을 먼저 기록해야 합니다.
                      </p>
                    )}
                  </div>
                  {form.contractStatus === "계약해지" && (
                    <>
                      <div>
                        <Label>계약 해지일</Label>
                        <Input type="date" value={form.resignationDate} onChange={(e) => setForm((f) => ({ ...f, resignationDate: e.target.value }))} />
                      </div>
                      <div>
                        <Label>중단/해지 사유</Label>
                        <Input value={form.terminationReason} onChange={(e) => setForm((f) => ({ ...f, terminationReason: e.target.value }))} placeholder="사유 입력" />
                      </div>
                    </>
                  )}

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
                  {editingId && (
                    <div className="col-span-2 space-y-3">
                      <div>
                        <Label>활동지원사별 서비스 기간</Label>
                        <p className="text-xs text-muted-foreground mt-1">지원사별 시작일/종료일을 저장하면 현재 담당과 과거 이력이 자동으로 분리됩니다.</p>
                      </div>
                      {renderMatchingPeriodEditor({ ...form, id: editingId })}
                    </div>
                  )}
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


      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5 xl:items-start">
        <section className="space-y-4 xl:col-span-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">전체 이용자 명단 ({filtered.length}명)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input placeholder="이름·연락처 또는 담당 활동지원사로 검색..." value={search} onChange={(e) => setSearch(e.target.value)} />
              <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full overflow-x-auto">
                <TabsList className="min-w-max">
                  <TabsTrigger value="all">전체</TabsTrigger>
                  <TabsTrigger value="서비스중">서비스중 {activeCount}</TabsTrigger>
                  <TabsTrigger value="대기">대기</TabsTrigger>
                  <TabsTrigger value="계약해지">계약해지 {terminatedCount}</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {filtered.length === 0 ? (
              <Card className="md:col-span-2">
                <CardContent className="py-10 text-center text-sm text-muted-foreground">검색된 이용자가 없습니다.</CardContent>
              </Card>
            ) : (
              filtered.map((user) => (
                <Card key={user.id} className="stat-card group">
                  <CardContent className="p-4 cursor-pointer" onClick={() => openDetail(user as any)}>
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <span className="font-bold text-lg">{user.name}</span>
                        <span className="text-sm text-muted-foreground ml-2">{user.gender} · {user.age}세</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={effectiveUserStatus(user) === "서비스중" ? "default" : effectiveUserStatus(user) === "대기" ? "secondary" : "destructive"}>
                          {effectiveUserStatus(user)}
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
                      <p><span className="text-muted-foreground">바우처 시간:</span> 월 {VOUCHER_HOURS[user.voucherTier] || 0}시간 ({user.voucherTier || "-"}구간)</p>
                      <p><span className="text-muted-foreground">최초접수:</span> {user.receiptDate || "미등록"}</p>
                      <p><span className="text-muted-foreground">서비스 기간:</span> {user.serviceStartDate ? `총 ${getFormattedDuration(user.serviceStartDate)}째 서비스 중` : "미등록"}</p>
                      <p><span className="text-muted-foreground">담당지원사:</span> {formatCurrentHelperPreview(user as ServiceUser & { id: string }) || "없음"}</p>
                      <p><span className="text-muted-foreground">담당지원사 이력:</span> {getHelperHistoryLabel(user)}</p>
                      {(user.assignedHelperIds?.length || 0) > 1 && (
                        <Button
                          size="sm"
                          variant="destructive"
                          className="mt-2 h-8"
                          onClick={(e) => { e.stopPropagation(); openCleanupDialog(user as ServiceUser & { id: string }); }}
                        >
                          ⚠️ 1:다 매칭 정돈
                        </Button>
                      )}
                      {user.contractStatus === "계약해지" && user.resignationDate && (
                        <p className="text-destructive"><span className="text-muted-foreground">해지일:</span> {user.resignationDate}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </section>

        <aside className="space-y-4 xl:col-span-2 xl:sticky xl:top-32">
          <Card className="border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">이용자 현황 요약 대시보드</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                <button type="button" onClick={() => openUserSummaryModal("contracts")} className="rounded-lg border bg-muted/30 p-3 text-left transition hover:shadow-md cursor-pointer">
                  <p className="text-xs text-muted-foreground">3개월 신규 계약</p>
                  <p className="text-2xl font-bold text-primary">{userSummary.recentContracts}</p>
                </button>
                <button type="button" onClick={() => openUserSummaryModal("terminations")} className="rounded-lg border bg-muted/30 p-3 text-left transition hover:shadow-md cursor-pointer">
                  <p className="text-xs text-muted-foreground">3개월 서비스 해지</p>
                  <p className="text-2xl font-bold text-destructive">{userSummary.recentTerminations}</p>
                </button>
                <button type="button" onClick={() => openUserSummaryModal("waiting")} className="rounded-lg border bg-muted/30 p-3 text-left transition hover:shadow-md cursor-pointer">
                  <p className="text-xs text-muted-foreground">현재 대기자</p>
                  <p className="text-2xl font-bold">{userSummary.waiting}</p>
                </button>
                <button type="button" onClick={() => openUserSummaryModal("handover")} className="rounded-lg border bg-muted/30 p-3 text-left transition hover:shadow-md cursor-pointer">
                  <p className="text-xs text-muted-foreground">인계/변경</p>
                  <p className="text-2xl font-bold text-primary">{userSummary.handoverEvents}</p>
                </button>
                <button type="button" onClick={() => openUserSummaryModal("counseling")} className="rounded-lg border bg-muted/30 p-3 text-left transition hover:shadow-md cursor-pointer">
                  <p className="text-xs text-muted-foreground">이용자 상담</p>
                  <p className="text-2xl font-bold">{userSummary.recentCounseling}</p>
                </button>
                <button type="button" onClick={() => openUserSummaryModal("counseling")} className="rounded-lg border bg-muted/30 p-3 text-left transition hover:shadow-md cursor-pointer">
                  <p className="text-xs text-muted-foreground">미처리 상담</p>
                  <p className="text-2xl font-bold text-destructive">{userSummary.unresolvedCounseling}</p>
                </button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{summaryModal?.title || "선택된 현황 상세 명단"}</CardTitle>
            </CardHeader>
            <CardContent>
              {!summaryModal ? (
                <p className="py-8 text-center text-sm text-muted-foreground">상단 현황 카드를 선택하면 조건별 명단이 표시됩니다.</p>
              ) : summaryModal.rows.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">해당 조건에 해당하는 대상자가 없습니다.</p>
              ) : (
                <div className="max-h-[520px] overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-3">이름</th>
                        <th className="py-2 pr-3">주요 일자</th>
                        <th className="py-2 pr-3">상태</th>
                        <th className="py-2 pr-3">비고/사유</th>
                        <th className="py-2 text-right">바로가기</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summaryModal.rows.map((row) => (
                        <tr key={row.id} className="border-b hover:bg-muted/40 cursor-pointer" onClick={() => openSummaryUser(row.userId)}>
                          <td className="py-2 pr-3 font-medium">{row.name}</td>
                          <td className="py-2 pr-3 whitespace-nowrap">{row.date || "미등록"}</td>
                          <td className="py-2 pr-3"><Badge variant={row.status.includes("해지") ? "destructive" : row.status.includes("대기") ? "secondary" : "default"}>{row.status}</Badge></td>
                          <td className="py-2 pr-3 max-w-[260px] truncate">{row.note || "-"}</td>
                          <td className="py-2 text-right"><Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); openSummaryUser(row.userId); }}>상세</Button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
      <AlertDialog open={!!postServiceEndTarget} onOpenChange={(open) => !open && setPostServiceEndTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>서비스 종료 후 다음 작업을 선택해 주세요</AlertDialogTitle>
            <AlertDialogDescription>
              담당 활동지원사의 서비스 종료일이 입력되었습니다. 진행할 후속 절차를 선택하세요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-3 py-2">
            <Button variant="outline" className="h-auto justify-start py-3 text-left" onClick={async () => {
              if (!postServiceEndTarget) return;
              await update(postServiceEndTarget.userId, { contractStatus: "대기" });
              if (detailTarget?.id === postServiceEndTarget.userId) {
                setDetailTarget((prev) => prev ? { ...prev, contractStatus: "대기" } : prev);
              }
              setPostServiceEndTarget(null);
              toast({ title: "대기 상태 전환 완료", description: "이용자를 매칭 대기 상태로 변경했습니다." });
            }}>
              ⏳ 대기 상태 전환
            </Button>
            <Button variant="outline" className="h-auto justify-start py-3 text-left" onClick={async () => {
              if (!postServiceEndTarget) return;
              const target = postServiceEndTarget;
              await update(target.userId, {
                contractStatus: "계약해지",
                resignationDate: target.endDate,
              });
              setPostServiceEndTarget(null);
              navigate(`/termination/new?userId=${encodeURIComponent(target.userId)}&endDate=${encodeURIComponent(target.endDate)}`);
            }}>
              📄 종결승인서 작성
            </Button>
            <Button variant="outline" className="h-auto justify-start py-3 text-left" onClick={() => {
              if (!postServiceEndTarget) return;
              const target = postServiceEndTarget;
              setPostServiceEndTarget(null);
              navigate(`/handover/new?userId=${encodeURIComponent(target.userId)}&oldWorkerId=${encodeURIComponent(target.workerId)}${target.nextWorkerId ? `&nextWorkerId=${encodeURIComponent(target.nextWorkerId)}` : ""}&endDate=${encodeURIComponent(target.endDate)}`);
            }}>
              🔄 인계인수서 작성
            </Button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPostServiceEndTarget(null)}>닫기/취소</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingProfileSync} onOpenChange={(open) => !open && setPendingProfileSync(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>연관 데이터 일괄 업데이트</AlertDialogTitle>
            <AlertDialogDescription>
              정보 변경({pendingProfileSync?.changedFields.join(", ")})이 감지되었습니다. 변경된 내용을 이 이용자와 연결된 모든 매칭 이력, 인계인수서, 종결확인서, 상담기록에도 일괄 반영하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingProfileSync(null)}>아니요</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              if (!pendingProfileSync) return;
              const updatedCount = await cascadeUserProfile(pendingProfileSync.id, pendingProfileSync.snapshot);
              setPendingProfileSync(null);
              toast({ title: "연관 데이터 업데이트 완료", description: `${updatedCount}개 연결 문서에 변경 내용을 반영했습니다.` });
            }}>
              확인/승인
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      <AlertDialog open={!!cascadeTarget} onOpenChange={(open) => !open && setCascadeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>매칭된 활동지원사 상태도 변경할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {cascadeTarget?.userName} 이용자가 계약해지로 변경되었습니다. 매칭되어 있던 활동지원사
              ({cascadeTarget?.workers.map((w) => w.name).join(", ")})의 상태를 어떻게 처리할까요?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>처리 방법</Label>
              <Select value={cascadeAction} onValueChange={(v) => setCascadeAction(v as typeof cascadeAction)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="유지">그대로 유지</SelectItem>
                  <SelectItem value="대기">대기로 변경</SelectItem>
                  <SelectItem value="퇴사">퇴사로 변경</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {cascadeAction === "퇴사" && (
              <div className="space-y-2">
                <Label>퇴사일</Label>
                <Input type="date" value={cascadeDate} onChange={(e) => setCascadeDate(e.target.value)} />
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCascadeTarget(null)}>나중에</AlertDialogCancel>
            <AlertDialogAction onClick={applyCascade}>적용</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!cleanupTarget} onOpenChange={(open) => !open && setCleanupTarget(null)}>
        <DialogContent className="max-w-3xl w-[95vw] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>⚠️ 1:다 매칭 정돈</DialogTitle>
          </DialogHeader>
          {cleanupTarget && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {cleanupTarget.name} 이용자에게 활동지원사가 {cleanupTarget.assignedHelperIds.length}명 연결되어 있습니다.
                각 지원사를 종료 처리하거나 인계인수 교체로 넘겨 정돈하세요.
              </p>
              <div className="space-y-3">
                {(cleanupTarget.assignedHelperIds || []).map((workerId) => {
                  const worker = workers.find((w) => w.id === workerId);
                  const action = cleanupActions[workerId] || { mode: "end", endDate: new Date().toISOString().slice(0, 10), workerStatus: "대기" };
                  if (!worker) return null;
                  return (
                    <div key={workerId} className="border rounded-lg p-3 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{worker.name}</p>
                          <p className="text-xs text-muted-foreground">{worker.phone || "연락처 없음"}</p>
                        </div>
                        <Badge variant={worker.contractStatus === "퇴사" ? "destructive" : worker.contractStatus === "근무중" ? "default" : "secondary"}>
                          {worker.contractStatus}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="space-y-2">
                          <Label>처리 방식</Label>
                          <Select value={action.mode} onValueChange={(v) => updateCleanupAction(workerId, { mode: v as "end" | "handover" })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="end">종료 처리</SelectItem>
                              <SelectItem value="handover">인계인수로 교체</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {action.mode === "end" ? (
                          <>
                            <div className="space-y-2">
                              <Label>서비스 종료일</Label>
                              <Input type="date" value={action.endDate} onChange={(e) => updateCleanupAction(workerId, { endDate: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                              <Label>지원사 상태</Label>
                              <Select value={action.workerStatus} onValueChange={(v) => updateCleanupAction(workerId, { workerStatus: v as "대기" | "퇴사" })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="대기">대기</SelectItem>
                                  <SelectItem value="퇴사">퇴사</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </>
                        ) : (
                          <div className="md:col-span-2 text-sm text-muted-foreground flex items-end">
                            이 지원사를 전임자(인계자)로 지정하여 인계인수서 작성 화면으로 이동합니다.
                          </div>
                        )}
                      </div>
                      <div className="flex justify-end">
                        <Button size="sm" onClick={() => cleanupWorkerAssignment(workerId)}>
                          {action.mode === "handover" ? "인계인수서 작성" : "종료 처리 적용"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!handoverGate} onOpenChange={(open) => !open && setHandoverGate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>담당자 변경을 위해서는 인계인수서 작성이 필요합니다</AlertDialogTitle>
            <AlertDialogDescription>
              {handoverGate?.userName} 이용자에게 이미 담당 활동지원사({handoverGate?.prevWorkerNames})가 있습니다.
              기존 지원사를 종료 처리할지, 인계인수 교체로 진행할지 선택해야 변경이 반영됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>변경 방식</Label>
              <Select value={handoverMode} onValueChange={(v) => setHandoverMode(v as "end" | "handover")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="end">기존 지원사 종료</SelectItem>
                  <SelectItem value="handover">인계인수 교체</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>기존 지원사 서비스 종료일</Label>
              <Input type="date" value={handoverEndDate} onChange={(e) => setHandoverEndDate(e.target.value)} />
            </div>
            {handoverMode === "end" && (
              <div className="space-y-2">
                <Label>종료 후 기존 지원사 상태</Label>
                <Select value={handoverWorkerStatus} onValueChange={(v) => setHandoverWorkerStatus(v as "대기" | "퇴사")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="대기">대기</SelectItem>
                    <SelectItem value="퇴사">퇴사</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>{handoverMode === "handover" ? "인계인수서 내용" : "처리 메모"}</Label>
              <Textarea
                value={handoverNote}
                onChange={(e) => setHandoverNote(e.target.value)}
                placeholder="변경 사유, 인계할 서비스 내용, 특이사항을 입력하세요."
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setHandoverGate(null)}>취소</AlertDialogCancel>
            <AlertDialogAction onClick={finalizeHandoverSave}>선택 내용 저장 후 변경</AlertDialogAction>
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
                  <p className="font-medium">{formatCurrentHelper(detailTarget) || "없음"}</p>
                  {(detailTarget.assignedHelperIds?.length || 0) > 1 && (
                    <Button size="sm" variant="destructive" className="mt-2" onClick={() => openCleanupDialog(detailTarget)}>
                      ⚠️ 1:다 매칭 정돈
                    </Button>
                  )}
                </div>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-semibold">활동지원사별 서비스 기간</CardTitle>
                </CardHeader>
                <CardContent>
                  {renderMatchingPeriodEditor(detailTarget)}
                </CardContent>
              </Card>

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
                  <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-sm font-semibold">📋 매칭 이력 ({selectedMatchingLogs.length}건)</CardTitle>
                    <Button size="sm" variant="outline" onClick={() => {
                      setMatchHistoryForm({type: "매칭", workerId: "", workerName: "", workerPhone: "", date: new Date().toISOString().slice(0,10), endDate: "", reason: "추가", reasonDetail: "", notes: ""});
                      setEditingMatchHistoryId(null);
                      setMatchHistoryDialogOpen(true);
                    }}>＋ 기록 추가</Button>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {selectedMatchingLogs.length === 0 ? (
                      <p className="text-sm text-muted-foreground">기록된 매칭 이력이 없습니다.</p>
                    ) : (
                      selectedMatchingLogs.map((match) => {
                        const handoverDoc = getHandoverForMatch(match);
                        return (
                        <div key={match.id || [match.date, match.workerId].join("-")} className="border rounded-lg p-3 hover:bg-muted">
                          <div className="flex justify-between items-start gap-3">
                            <div className="cursor-pointer flex-1" onClick={() => setExpandedMatchId(expandedMatchId === match.id ? null : match.id)}>
                              <p className="font-semibold">{match.date}{match.endDate ? ` ~ ${match.endDate}` : ""} · {match.type}</p>
                              <p className="text-sm text-muted-foreground">{match.workerName} · {match.workerPhone}</p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <Badge variant={handoverDoc ? "default" : "secondary"}>{handoverDoc ? "인계인수서 작성완료" : "인계인수서 미작성"}</Badge>
                                {!handoverDoc && (match.type === "해제" || match.reason === "인계" || match.reason === "교체" || match.endDate) && (
                                  <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={(e) => { e.stopPropagation(); openHandoverFromMatch(match); }}>작성하기</Button>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setMatchHistoryForm({type: match.type, workerId: match.workerId, workerName: match.workerName, workerPhone: match.workerPhone, date: match.date, endDate: match.endDate || "", reason: match.reason || "추가", reasonDetail: match.reasonDetail || "", notes: match.notes || ""}); setEditingMatchHistoryId(match.id || null); setMatchHistoryDialogOpen(true); }}>✏️</Button>
                              {match.id && <Button size="sm" variant="ghost" onClick={async (e) => { e.stopPropagation(); await deleteMatchingHistoryAndSync({ ...match, id: match.id }); toast({ title: "매칭 이력 삭제 및 배정 정보 동기화 완료" }); }}>🗑️</Button>}
                            </div>
                          </div>
                          {expandedMatchId === match.id && (
                            <div className="mt-3 text-sm whitespace-pre-wrap">{match.notes || "상세 없음"}</div>
                          )}
                        </div>
                        );
                      })
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
      
            {/* 매칭 히스토리 추가/수정 다이얼로그 */}
            <Dialog open={matchHistoryDialogOpen} onOpenChange={setMatchHistoryDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingMatchHistoryId ? "매칭 이력 수정" : "매칭 이력 추가"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium">구분</label>
                    <Select value={matchHistoryForm?.type || "매칭"} onValueChange={(v) => matchHistoryForm && setMatchHistoryForm({...matchHistoryForm, type: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="매칭">매칭 (배정)</SelectItem>
                        <SelectItem value="해제">해제</SelectItem>
                        <SelectItem value="시도">시도 (미성사)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">활동지원사</label>
                    <Popover open={isMatchWorkerSearchOpen} onOpenChange={setIsMatchWorkerSearchOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={isMatchWorkerSearchOpen}
                          className="mt-1 w-full justify-between"
                        >
                          {selectedMatchHistoryWorker ? labelWithLast4(selectedMatchHistoryWorker.name, selectedMatchHistoryWorker.phone) : "활동지원사 이름 검색 및 선택"}
                          <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[min(420px,90vw)] p-0">
                        <Command>
                          <CommandInput placeholder="이름 또는 연락처 일부로 검색..." />
                          <CommandList>
                            <CommandEmpty>검색 결과가 없습니다.</CommandEmpty>
                            <CommandGroup>
                              {workers.map((worker) => (
                                <CommandItem
                                  key={worker.id}
                                  value={`${worker.name} ${worker.phone}`}
                                  onSelect={() => selectMatchHistoryWorker(worker)}
                                >
                                  <div className="flex flex-col">
                                    <span className="font-medium">{labelWithLast4(worker.name, worker.phone)}</span>
                                    <span className="text-xs text-muted-foreground">{worker.contractStatus} · {worker.experience || "경력 미등록"}</span>
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-sm font-medium">시작일</label>
                      <Input type="date" value={matchHistoryForm?.date || ""} onChange={(e) => matchHistoryForm && setMatchHistoryForm({...matchHistoryForm, date: e.target.value})} />
                    </div>
                    <div>
                      <label className="text-sm font-medium">종료일</label>
                      <Input type="date" value={matchHistoryForm?.endDate || ""} onChange={(e) => matchHistoryForm && setMatchHistoryForm({...matchHistoryForm, endDate: e.target.value, type: e.target.value ? "해제" : matchHistoryForm.type})} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div>
                      <label className="text-sm font-medium">변경 사유</label>
                      <Select value={matchHistoryForm?.reason || "추가"} onValueChange={(v) => matchHistoryForm && setMatchHistoryForm({...matchHistoryForm, reason: v as MatchingHistoryReason})}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {MATCH_REASON_OPTIONS.map((reason) => <SelectItem key={reason} value={reason}>{reason}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium">상세 사유</label>
                      <Input placeholder="상세 사유 입력" value={matchHistoryForm?.reasonDetail || ""} onChange={(e) => matchHistoryForm && setMatchHistoryForm({...matchHistoryForm, reasonDetail: e.target.value})} />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium">비고</label>
                    <Input placeholder="비고 입력" value={matchHistoryForm?.notes || ""} onChange={(e) => matchHistoryForm && setMatchHistoryForm({...matchHistoryForm, notes: e.target.value})} />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setMatchHistoryDialogOpen(false)}>취소</Button>
                  <Button disabled={!matchHistoryForm?.workerId || !matchHistoryForm?.date} onClick={async () => {
                    if (!matchHistoryForm || !detailTarget) return;
                    const w = workers.find(x => x.id === matchHistoryForm.workerId);
                    if (!w?.id) return;
                    const existingCurrent = getCurrentMatchingEntry(detailTarget);
                    const isEnded = !!matchHistoryForm.endDate || matchHistoryForm.type === "해제";
                    const payload: any = {
                      type: isEnded ? "해제" : matchHistoryForm.type,
                      userId: detailTarget.id,
                      userName: detailTarget.name,
                      userPhone: detailTarget.phone,
                      workerId: matchHistoryForm.workerId,
                      workerName: w.name || "",
                      workerPhone: w.phone || "",
                      date: matchHistoryForm.date,
                      endDate: matchHistoryForm.endDate || undefined,
                      reason: matchHistoryForm.reason || (isEnded ? "종료" : "추가"),
                      reasonDetail: matchHistoryForm.reasonDetail || undefined,
                      notes: matchHistoryForm.notes || matchHistoryForm.reasonDetail || undefined,
                    };
                    if (editingMatchHistoryId) {
                      await updateMatchingHistory(editingMatchHistoryId, payload);
                      toast({ title: "매칭 이력 수정 완료" });
                    } else {
                      await addMatchingHistory(payload);
                      toast({ title: "매칭 이력 추가 완료" });
                    }

                    const existingEntries = getDocumentMatchingEntries(detailTarget).filter((entry) => entry.workerId !== matchHistoryForm.workerId);
                    const nextEntry: DocumentMatchingHistoryEntry = {
                      id: editingMatchHistoryId || `${matchHistoryForm.workerId}-${matchHistoryForm.date}`,
                      workerId: matchHistoryForm.workerId,
                      workerName: w.name || "",
                      workerPhone: w.phone || "",
                      serviceStartDate: matchHistoryForm.date,
                      serviceEndDate: matchHistoryForm.endDate || (isEnded ? matchHistoryForm.date : null),
                      reason: payload.reason,
                      reasonDetail: matchHistoryForm.reasonDetail || matchHistoryForm.notes || "",
                      updatedAt: new Date().toISOString(),
                    };
                    const nextHistory = [...existingEntries, nextEntry];
                    const activeIds = nextHistory
                      .filter((entry) => entry.serviceEndDate === null || entry.serviceEndDate === "")
                      .sort((a, b) => getComparableDateValue(b.serviceStartDate).localeCompare(getComparableDateValue(a.serviceStartDate)))
                      .map((entry) => entry.workerId);
                    const arrays = buildHelperArraysFromIds(Array.from(new Set(activeIds)), workers);
                    const userPayload: Partial<ServiceUser> = {
                      matchingHistory: nextHistory,
                      assignedHelperIds: arrays.ids,
                      assigned_workers: arrays.ids,
                      assignedHelperNames: arrays.names,
                      assignedHelperPhones: arrays.phones,
                      contractStatus: detailTarget.contractStatus === "계약해지" || detailTarget.contractStatus === "타기관 계약" || detailTarget.contractStatus === "보류"
                        ? detailTarget.contractStatus
                        : arrays.ids.length > 0 ? "서비스중" : "대기",
                    };
                    await update(detailTarget.id, userPayload);
                    await syncUserToWorkers(detailTarget.id, { ...detailTarget, ...userPayload }, workers, detailTarget.assignedHelperIds || [], updateWorker);
                    if (!isEnded) {
                      await updateWorker(matchHistoryForm.workerId, { contractStatus: "근무중", serviceStartDate: matchHistoryForm.date, serviceEndDate: null, retirementDate: "", resignationDate: "" });
                    } else {
                      await updateWorker(matchHistoryForm.workerId, { contractStatus: "대기", serviceEndDate: matchHistoryForm.endDate || matchHistoryForm.date });
                    }

                    const updatedUser = { ...detailTarget, ...userPayload } as ServiceUser & { id: string };
                    setDetailTarget(updatedUser);
                    resetMatchingPeriodDrafts(updatedUser);
                    setMatchHistoryDialogOpen(false);
                    setMatchHistoryForm(null);
                    if (isEnded || (existingCurrent?.workerId && existingCurrent.workerId !== matchHistoryForm.workerId)) {
                      setPostServiceEndTarget({
                        userId: detailTarget.id,
                        workerId: isEnded ? matchHistoryForm.workerId : existingCurrent?.workerId || matchHistoryForm.workerId,
                        nextWorkerId: isEnded ? undefined : matchHistoryForm.workerId,
                        endDate: matchHistoryForm.endDate || matchHistoryForm.date,
                      });
                    }
                  }}>저장</Button>
                </div>
              </DialogContent>
            </Dialog>
</Dialog>
    </div>
  );
};

export default UserManagement;












































