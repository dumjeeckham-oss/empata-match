/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState, useEffect } from "react";
import { useCollection } from "@/hooks/useFirestore";
import { type Worker, type ServiceUser, type CounselingRecord, type MatchingHistoryRecord, WORKER_REJECTION_TYPES, EXPERIENCE_OPTIONS, SUPPORT_TYPES } from "@/types";
import { geocodeAddress } from "@/lib/kakao";
import { BulkUploadDialog } from "@/components/BulkUploadDialog";
import { PartialUpdateDialog, partialParsers } from "@/components/PartialUpdateDialog";
import { MultiEntitySelect } from "@/components/MultiEntitySelect";
import { useDuplicateNameCheck } from "@/hooks/useDuplicateNameCheck";
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
import { cascadeWorkerProfile } from "@/lib/cascadeSync";
import { deleteMatchingHistoryAndSync } from "@/lib/matchingHistorySync";
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
import { useSearchParams, useNavigate } from "react-router-dom";
import { WeeklySchedulePicker } from "@/components/WeeklySchedulePicker";
import { getComparableDateValue, getFormattedDuration } from "@/lib/utils";
import { isWithinRecentMonths } from "@/lib/dashboardStats";

const emptyWorker: Omit<Worker, "id" | "createdAt" | "updatedAt"> = {
  name: "", age: 0, gender: "여성", phone: "", residenceArea: "", preferredArea: "",
  address: "", experience: "경력없음", availableDays: "", availableHours: "",
  rejectionTypes: [], rejectedTasks: "", canDrive: false, animalAllergy: false,
  isForeigner: false, hasF4: false, hasF5: false,
  certificateNumber: "", certificateDate: "", contractStatus: "대기", serviceStartDate: "", serviceEndDate: null, retirementDate: "", resignationDate: "", psychiatricCheckDate: "", psychiatricCheckUnchecked: false, workplaceCheckDate: "", workplaceCheckUnchecked: false, notes: "",
  assignedUserIds: [], assignedUserNames: [], assignedUserPhones: [],
  supportTypes: [],
  certificates: [],
  receiptDate: "",
};

const WORKER_PARTIAL_UPDATE_FIELDS = [
  { key: "phone", label: "연락처", aliases: ["전화", "휴대폰", "새연락처"] },
  { key: "certificateNumber", label: "이수증번호", aliases: ["이수번호", "자격번호"] },
  { key: "certificateDate", label: "이수일자", aliases: ["이수일", "교육이수일"], parse: partialParsers.date },
  { key: "psychiatricCheckDate", label: "향정신성/마약검사일", aliases: ["향정신성건강검진일", "향정신성 검진일", "향정신성검진일", "마약검사일", "마약검진일", "마약검사", "마약검진"], parse: partialParsers.date },
  { key: "psychiatricCheckUnchecked", label: "향정신성/마약미검진", aliases: ["마약검사미검진", "마약미검진"], parse: partialParsers.boolean },
  { key: "workplaceCheckDate", label: "직장검진일", aliases: ["직장 건강검진일", "직장건강검진일", "건강검진일", "직장검사일"], parse: partialParsers.date },
  { key: "workplaceCheckUnchecked", label: "직장검진미검진", aliases: ["직장미검진"], parse: partialParsers.boolean },
  { key: "contractStatus", label: "근무상태", aliases: ["상태"] },
  { key: "serviceStartDate", label: "최초근무일", aliases: ["입사일", "근무시작일"] },
  { key: "retirementDate", label: "퇴사일", aliases: ["퇴사일자"] },
  { key: "address", label: "주소", aliases: ["거주지"] },
  { key: "notes", label: "비고", aliases: ["메모", "특이사항"] },
] as const;
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

/** 화면 표시용 근무상태: 퇴사일이 있으면 항상 "퇴사" 목록으로 이동 */
function effectiveWorkerStatus(worker: Worker): string {
  const raw = String(worker.contractStatus || "");
  if (raw === "퇴사" || String(worker.retirementDate ?? worker.resignationDate ?? "").trim() !== "") return "퇴사";
  return raw;
}

function toDisplayWorker(worker: Worker & { id: string }): Worker & { id: string } {

  const hasServiceStartDate = String(worker.serviceStartDate ?? "").trim() !== "";
  const hasResignationDate = String(worker.retirementDate ?? worker.resignationDate ?? "").trim() !== "";
  const isResigned = worker.contractStatus === "퇴사" || hasResignationDate;

  return {
    ...worker,
    // 직접 "퇴사"로 지정한 경우는 자동으로 "근무중"으로 되돌리지 않음
    contractStatus: isResigned
      ? "퇴사"
      : worker.contractStatus === "변경"
        ? "변경"
        : hasServiceStartDate
        ? "근무중"
        : worker.contractStatus,
    experience: hasServiceStartDate
      ? calculateDisplayExperience(worker.serviceStartDate, worker.experience || "경력없음")
      : worker.experience,
  };
}


function hasActiveWorkerMatching(user: ServiceUser, workerId?: string): boolean {
  if (!workerId) return false;
  const history = Array.isArray(user.matchingHistory) ? user.matchingHistory : [];
  if (history.some((entry) => entry.workerId === workerId && (entry.serviceEndDate === null || entry.serviceEndDate === ""))) {
    return true;
  }
  return (user.assignedHelperIds || []).includes(workerId);
}

function formatAssignedUsersPreview(worker: Worker, users: Array<ServiceUser & { id: string }>): string {
  const activeNames = users
    .filter((user) => hasActiveWorkerMatching(user, worker.id))
    .map((user) => String(user.name || "").trim())
    .filter(Boolean);
  const fallbackNames = (worker.assignedUserNames || []).map((name) => String(name || "").trim()).filter(Boolean);
  const names = Array.from(new Set(activeNames.length > 0 ? activeNames : fallbackNames));
  if (names.length > 1) return `1:다 (${names.join(", ")})`;
  if (names.length === 1) return names[0];
  return formatUserList(worker);
}
const joinNonEmpty = (items: unknown[], fallback = "미등록") => {
  const values = items.map((item) => String(item ?? "").trim()).filter(Boolean);
  return values.length > 0 ? values.join(" · ") : fallback;
};

const yesNo = (value: unknown) => (value ? "예" : "아니오");
const currentYear = new Date().getFullYear();
const isCurrentYearDate = (value?: string) => {
  const raw = String(value || "").trim();
  if (!raw) return false;
  const date = new Date(raw);
  return !Number.isNaN(date.getTime()) && date.getFullYear() === currentYear;
};
const formatExamStatus = (date?: string, unchecked?: boolean) => unchecked ? "미검진" : isCurrentYearDate(date) ? date || "검진완료" : "미검진";
const WorkerManagement = () => {
  const [searchParams] = useSearchParams();
  const { data: workersRaw, add, update, remove, loading, error: workersError } = useCollection<Worker>(WORKERS_COLLECTION);
  const { data: usersRaw, update: updateUser } = useCollection<ServiceUser>(USERS_COLLECTION);
  const { data: counselingRecords } = useCollection<CounselingRecord>("counseling");
  const { data: matchingHistory, add: addMatchingHistory, update: updateMatchingHistory, remove: removeMatchingHistory } = useCollection<MatchingHistoryRecord>(MATCHING_HISTORY_COLLECTION);

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
  const [matchHistoryForm, setMatchHistoryForm] = useState<{type: string; userId: string; userName: string; userPhone: string; workerId: string; date: string; endDate: string; notes: string} | null>(null);
  const [editingMatchHistoryId, setEditingMatchHistoryId] = useState<string | null>(null);
  const [matchHistoryDialogOpen, setMatchHistoryDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [supportFilter, setSupportFilter] = useState<string>("all");
  const [geocoding, setGeocoding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<(Worker & { id: string }) | null>(null);
  const [pendingProfileSync, setPendingProfileSync] = useState<{
    id: string;
    changedFields: string[];
    snapshot: { name: string; phone: string; address: string };
    previous: { name: string; phone: string; address: string };
  } | null>(null);
  const [summaryModal, setSummaryModal] = useState<{
    title: string;
    rows: Array<{ id: string; name: string; date: string; status: string; note: string; workerId?: string }>;
  } | null>(null);
  // 퇴사 시 매칭된 이용자 상태 후속 처리
  const [cascadeTarget, setCascadeTarget] = useState<{
    workerName: string;
    users: (ServiceUser & { id: string })[];
  } | null>(null);
  const [cascadeAction, setCascadeAction] = useState<"유지" | "대기" | "계약해지" | "인계인수">("유지");
  const [cascadeDate, setCascadeDate] = useState(new Date().toISOString().slice(0, 10));
  const navigate = useNavigate();

  // 기존 담당 이용자를 다른 이용자로 교체할 때 인계·인수서 작성을 먼저 요구
  const [handoverGate, setHandoverGate] = useState<{
    workerId: string;
    workerName: string;
    prevUserNames: string;
    prevUserId: string;
  } | null>(null);


  const applyCascade = async () => {
    if (!cascadeTarget) return;
    const targets = cascadeTarget.users;
    setCascadeTarget(null);
    if (cascadeAction === "유지") return;
    if (cascadeAction === "인계인수") {
      const first = targets[0];
      navigate(`/handovers${first ? `?userId=${first.id}` : ""}`);
      return;
    }
    for (const u of targets) {
      if (cascadeAction === "계약해지") {
        await updateUser(u.id, { contractStatus: "계약해지", resignationDate: cascadeDate });
      } else {
        await updateUser(u.id, { contractStatus: "대기", resignationDate: "" });
      }
    }
    toast({
      title: cascadeAction === "계약해지" ? "이용자 계약해지 처리 완료" : "이용자 대기 처리 완료",
      description: `${targets.length}명 상태를 변경했습니다.`,
    });
  };





  // 업무별 가능/거부: 기본값은 둘 다 미체크(미정)
  const [explicitOks, setExplicitOks] = useState<Set<string>>(new Set());

  const { checking: nameChecking, duplicates: nameDuplicates } = useDuplicateNameCheck(form.name, workers, editingId);

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
      // 퇴사 선택 시 퇴사일 자동 보정, 퇴사가 아니면 퇴사일 제거
      // (담당 이용자 배정은 유지되어 이력이 끊기지 않음)
      resignationDate:
        form.contractStatus === "퇴사"
          ? form.resignationDate || new Date().toISOString().slice(0, 10)
          : "",
    };

    const prevUserIds = editingId
      ? workers.find((w) => w.id === editingId)?.assignedUserIds ?? []
      : [];

    // 기존 담당 이용자를 다른 이용자로 교체하는 경우 → 인계·인수서 작성 후에만 수정 가능
    if (editingId) {
      const removedUsers = prevUserIds.filter((id) => !arrays.ids.includes(id));
      const addedUsers = arrays.ids.filter((id) => !prevUserIds.includes(id));
      if (removedUsers.length > 0 && addedUsers.length > 0) {
        setHandoverGate({
          workerId: editingId,
          workerName: form.name,
          prevUserId: removedUsers[0],
          prevUserNames: removedUsers
            .map((id) => users.find((u) => u.id === id)?.name || id)
            .join(", "),
        });
        return;
      }
    }



    let savedId = editingId;
    const duplicateName = workers.find((w) =>
      w.name === form.name && w.id !== editingId && w.phone !== form.phone
    );
    if (duplicateName) {
      toast({
        title: "동명이인 주의",
        description: `${form.name} 이름이 이미 등록된 활동지원사가 있습니다. 연락처를 확인하세요.`,
        variant: "destructive",
      });
    }

    if (editingId) {
      const previous = workers.find((w) => w.id === editingId);
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
          snapshot: { name: payload.name, phone: payload.phone, address: payload.address },
          previous: { name: previous?.name || "", phone: previous?.phone || "", address: previous?.address || "" },
        });
      }
      toast({ title: "수정 완료" });
    } else {
      const ref = await add(payload as Omit<Worker, "id">);
      savedId = ref.id;
      toast({ title: "등록 완료" });
    }
    if (savedId) {
      await syncWorkerToUsers(savedId, payload, users, prevUserIds, updateUser);
      // 매칭 히스토리 자동 기록
      const prevSetW = new Set(prevUserIds);
      const nextSetW = new Set(arrays.ids);
      for (const uid of nextSetW) {
        if (!prevSetW.has(uid)) {
          const u = users.find((x) => x.id === uid);
          if (u) {
            await addMatchingHistory({
              type: "매칭",
              userId: u.id,
              userName: u.name,
              userPhone: u.phone,
              workerId: savedId,
              workerName: payload.name,
              workerPhone: payload.phone,
              date: payload.serviceStartDate || new Date().toISOString().slice(0, 10),
              notes: "이용자 배정",
            } as any);
          }
        }
      }
      for (const uid of prevSetW) {
        if (!nextSetW.has(uid)) {
          const u = users.find((x) => x.id === uid);
          if (u) {
            await addMatchingHistory({
              type: "해제",
              userId: u.id,
              userName: u.name,
              userPhone: u.phone,
              workerId: savedId,
              workerName: payload.name,
              workerPhone: payload.phone,
              date: new Date().toISOString().slice(0, 10),
              notes: "이용자 배정 해제",
            } as any);
          }
        }
      }
      // 이용자 계약상태 자동 전환: 배정 → "서비스중", 해제 → 남은 담당자가 없으면 "대기"
      const nextSet = new Set(arrays.ids);
      const touched = new Set([...prevUserIds, ...arrays.ids]);
      for (const userId of touched) {
        const target = users.find((u) => u.id === userId);
        if (!target) continue;
        if (target.terminationReason?.trim()) continue;
        // 직접 지정한 상태는 자동 전환하지 않음 (연결 관계는 그대로 유지)
        if (["계약해지", "타기관 계약", "보류"].includes(String(target.contractStatus || ""))) continue;

        if (nextSet.has(userId)) {
          if (!target.contractStatus || target.contractStatus === "대기") {
            await updateUser(userId, { contractStatus: "서비스중" });
            target.contractStatus = "서비스중";
          }
        } else if (!(target.assignedHelperIds ?? []).length && target.contractStatus === "서비스중") {
          await updateUser(userId, { contractStatus: "작성중" });
          target.contractStatus = "작성중";
        }
      }
    }

    // 퇴사로 전환된 경우, 매칭되어 있던 이용자 후속 처리를 확인
    if (payload.contractStatus === "퇴사") {
      const linked = arrays.ids
        .map((id) => users.find((u) => u.id === id))
        .filter((u): u is ServiceUser & { id: string } => !!u && u.contractStatus !== "계약해지");
      if (linked.length > 0) {
        setCascadeAction("유지");
        setCascadeDate(payload.resignationDate || new Date().toISOString().slice(0, 10));
        setCascadeTarget({ workerName: payload.name, users: linked });
      }
    }



    setForm(emptyWorker);
    setExplicitOks(new Set());
    setEditingId(null);
    setDialogOpen(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget?.id) return;
    const prevUserIds = deleteTarget.assignedUserIds || [];
    await syncWorkerToUsers(
      deleteTarget.id,
      { name: deleteTarget.name, phone: deleteTarget.phone, assignedUserIds: [] },
      users,
      prevUserIds,
      updateUser
    );
    for (const log of matchingLogs.filter((record) => record.workerId === deleteTarget.id && record.id)) {
      await removeMatchingHistory(log.id as string);
    }
    await remove(deleteTarget.id);
    toast({ title: "삭제 완료", description: `${deleteTarget.name} 님의 정보와 연결된 매칭 이력을 정리했습니다.` });
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
      receiptDate: item.receiptDate,
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
    // 수정 시: 거부에 없고 worker에 명시된 가능 항목이 있으면 복원 (레거시 호환)
    const oks = new Set<string>();
    WORKER_REJECTION_TYPES.forEach(t => {
      if (!source.rejectionTypes?.includes(t)) oks.add(t.replace("거부", "가능"));
    });
    setExplicitOks(oks);
    setEditingId(source.id);
    setDialogOpen(true);
  };


  const openWorkerSummaryModal = (kind: "joined" | "resigned" | "working" | "waiting" | "handover" | "counseling" | "health") => {
    const makeWorkerRow = (worker: Worker & { id: string }, date: string, note: string) => ({
      id: `${kind}-${worker.id}`,
      name: worker.name,
      date,
      status: effectiveWorkerStatus(worker),
      note,
      workerId: worker.id,
    });
    let title = "";
    let rows: Array<{ id: string; name: string; date: string; status: string; note: string; workerId?: string }> = [];

    if (kind === "health") {
      rows = displayWorkers
        .filter((worker) => worker.psychiatricCheckUnchecked || worker.workplaceCheckUnchecked || !isCurrentYearDate(worker.psychiatricCheckDate) || !isCurrentYearDate(worker.workplaceCheckDate))
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ko"))
        .map((worker) => makeWorkerRow(worker, `${currentYear}년`, `연락처 ${worker.phone || "미등록"} · 향정신성/마약 ${formatExamStatus(worker.psychiatricCheckDate, worker.psychiatricCheckUnchecked)} · 직장 ${formatExamStatus(worker.workplaceCheckDate, worker.workplaceCheckUnchecked)} · 전화/문자 안내 필요`));
      title = `${currentYear}년 건강검진 미검진자 명단 (총 ${rows.length}명)`;
    } else if (kind === "joined") {
      rows = displayWorkers
        .filter((worker) => isWithinRecentMonths(worker.serviceStartDate))
        .map((worker) => makeWorkerRow(worker, worker.serviceStartDate || "미등록", worker.phone || "연락처 없음"));
      title = `최근 3개월 입사자 명단 (총 ${rows.length}명)`;
    } else if (kind === "resigned") {
      rows = displayWorkers
        .filter((worker) => effectiveWorkerStatus(worker) === "퇴사" || isWithinRecentMonths(worker.retirementDate || worker.resignationDate))
        .map((worker) => makeWorkerRow(worker, worker.retirementDate || worker.resignationDate || "미등록", worker.notes || "퇴사 사유 미등록"));
      title = `퇴사자 명단 (총 ${rows.length}명)`;
    } else if (kind === "working") {
      rows = displayWorkers
        .filter((worker) => effectiveWorkerStatus(worker) === "근무중")
        .map((worker) => makeWorkerRow(worker, worker.serviceStartDate || "미등록", `담당: ${(worker.assignedUserNames || []).join(", ") || "담당 이용자 없음"}`));
      title = `현재 근무 중 활동지원사 명단 (총 ${rows.length}명)`;
    } else if (kind === "waiting") {
      rows = displayWorkers
        .filter((worker) => effectiveWorkerStatus(worker) === "대기" && !(worker.assignedUserIds || []).length)
        .map((worker) => makeWorkerRow(worker, worker.receiptDate || worker.serviceEndDate || "미등록", worker.preferredArea || "희망지역 미등록"));
      title = `현재 매칭 대기 활동지원사 명단 (총 ${rows.length}명)`;
    } else if (kind === "handover") {
      rows = matchingLogs
        .filter((log) => isWithinRecentMonths(log.date) && (log.reason === "인계" || String(log.notes || log.reasonDetail || "").includes("인계") || String(log.notes || log.reasonDetail || "").includes("교체")))
        .map((log) => ({
          id: `handover-${log.id || log.workerId}-${log.userId}`,
          name: log.workerName,
          date: log.date,
          status: log.reason || log.type,
          note: `${log.userName || "이용자 미등록"} · ${log.notes || log.reasonDetail || "상세 없음"}`,
          workerId: log.workerId,
        }));
      title = `최근 지원사 기준 인계인수 명단 (총 ${rows.length}건)`;
    } else {
      rows = counselingLogs
        .filter((record) => record.targetType === "활동지원사" && isWithinRecentMonths(record.date))
        .map((record) => ({
          id: `counsel-${record.id || record.targetId}-${record.date}`,
          name: record.targetName,
          date: record.date,
          status: record.result || record.category || "상담",
          note: record.content || "상담/보고 내용 없음",
          workerId: record.targetId,
        }));
      title = `최근 상담/고충/보고 명단 (총 ${rows.length}건)`;
    }

    setSummaryModal({ title, rows });
  };

  const isHealthSummary = summaryModal?.title.includes("건강검진") ?? false;
  const getHealthCopyRows = () => (summaryModal?.rows || []).map((row) => {
    const phone = row.note.match(/연락처\s*([^·]+)/)?.[1]?.trim() || "";
    const missingItems: string[] = [];
    if (row.note.includes("향정신성/마약 미검진") || row.note.includes("향정신성 미검진")) missingItems.push("향정신성/마약검사");
    if (row.note.includes("직장 미검진")) missingItems.push("직장검진");
    if (missingItems.length === 0) missingItems.push("건강검진 확인 필요");
    return { name: row.name, phone, missingItems: missingItems.join(", ") };
  });

  const copyHealthCheckRows = async () => {
    const text = getHealthCopyRows().map((row) => `${row.name}\t${row.phone}\t${row.missingItems}`).join("\n");
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "복사 완료", description: "이름, 연락처, 미검진 항목을 탭 구분 표로 복사했습니다." });
    } catch {
      toast({ title: "복사 실패", description: "표 영역을 드래그해 Ctrl+C로 복사해 주세요.", variant: "destructive" });
    }
  };
  const openSummaryWorker = (workerId?: string) => {
    if (!workerId) return;
    const target = displayWorkers.find((worker) => worker.id === workerId);
    if (target) openDetail(target);
  };
  const downloadExcel = () => {
    const data = getFiltered().map((w) => ({
      이름: w.name, 나이: w.age, 성별: w.gender, 연락처: w.phone,
      거주지역: w.residenceArea, 희망지역: w.preferredArea, 주소: w.address,
      경력: w.experience, 근무가능요일: w.availableDays, 근무가능시간: w.availableHours,
      거부업무: w.rejectionTypes?.join(","), 거부업무상세: w.rejectedTasks,
      운전가능: w.canDrive ? "예" : "아니오", 동물알러지: w.animalAllergy ? "예" : "아니오",
      이수증번호: w.certificateNumber, 이수일자: w.certificateDate || "", 근무상태: w.contractStatus,
      담당이용자: w.assignedUserNames?.join(", "), 최초접수일: w.receiptDate,
      최초근무일: w.serviceStartDate, 퇴사일: w.retirementDate || w.resignationDate, 서비스종료일: w.serviceEndDate || "", "향정신성/마약검사일": w.psychiatricCheckDate || "", "향정신성/마약미검진": w.psychiatricCheckUnchecked ? "예" : "아니오", 직장검진일: w.workplaceCheckDate || "", 직장검진미검진: w.workplaceCheckUnchecked ? "예" : "아니오", 비고: w.notes,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "활동지원사목록");
    XLSX.writeFile(wb, `활동지원사목록_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const getUserHistoryLabel = (worker: Worker & { id: string }): string => {
    const seen = new Set<string>();
    const names: string[] = [];
    const chronological = matchingLogs
      .filter((record) => record.workerId === worker.id && record.type !== "시도" && !!record.userName)
      .sort((a, b) => getComparableDateValue((a as any).startDate || a.date).localeCompare(getComparableDateValue((b as any).startDate || b.date)));

    for (const record of chronological) {
      const key = record.userId || record.userName.trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      names.push(record.userName.trim());
    }
    (worker.assignedUserNames || []).forEach((name, index) => {
      const key = worker.assignedUserIds?.[index] || name.trim();
      if (!key || seen.has(key)) return;
      seen.add(key);
      names.push(name.trim());
    });
    return names.filter(Boolean).join(" → ") || "없음";
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
      .sort((a, b) => getComparableDateValue(b.date).localeCompare(getComparableDateValue(a.date)));
  }, [counselingLogs, detailTarget]);

  const selectedMatchingLogs = useMemo(() => {
    if (!detailTarget) return [];
    return matchingLogs
      .filter((record) => record.workerId === detailTarget.id)
      .sort((a, b) => getComparableDateValue(b.date).localeCompare(getComparableDateValue(a.date)));
  }, [matchingLogs, detailTarget]);

  const getFiltered = () => {
    return (displayWorkers || []).filter((w) => {
      const matchesName = String(w.name || "").includes(search);
      const matchesPhone = String(w.phone || "").includes(search);
      // 매칭된 이용자 이름/연락처로도 검색 가능
      const matchesUser =
        (w.assignedUserNames || []).some((n) => String(n || "").includes(search)) ||
        (w.assignedUserPhones || []).some((p) => String(p || "").includes(search));
      const matchSearch = !search || matchesName || matchesPhone || matchesUser;

      const status = effectiveWorkerStatus(w);

      // 대기중 필터: 미배정 활동지원사만 표시
      if (statusFilter === "대기") {
        const isUnmatched = !w.assignedUserIds || w.assignedUserIds.length === 0;
        return matchSearch && status === "대기" && isUnmatched;
      }

      const matchStatus = statusFilter === "all" || status === statusFilter;
      const matchSupport = supportFilter === "all" || (w.supportTypes || []).includes(supportFilter);
      return matchSearch && matchStatus && matchSupport;
    });
  };

  const filtered = getFiltered();
  const resignedCount = displayWorkers.filter((w) => effectiveWorkerStatus(w) === "퇴사").length;
  const workingCount = displayWorkers.filter((w) => effectiveWorkerStatus(w) === "근무중").length;
  const waitingCount = displayWorkers.filter((w) => effectiveWorkerStatus(w) === "대기").length;

  const workerSummary = useMemo(() => {
    const recentJoined = displayWorkers.filter((w) => isWithinRecentMonths(w.serviceStartDate)).length;
    const recentResigned = displayWorkers.filter((w) => isWithinRecentMonths(w.retirementDate || w.resignationDate)).length;
    const waiting = displayWorkers.filter((w) => effectiveWorkerStatus(w) === "대기").length;
    const working = displayWorkers.filter((w) => effectiveWorkerStatus(w) === "근무중").length;
    const handoverEvents = matchingLogs.filter((log) =>
      isWithinRecentMonths(log.date) &&
      (log.reason === "인계" || String(log.notes || log.reasonDetail || "").includes("인계") || String(log.notes || log.reasonDetail || "").includes("교체"))
    ).length;
    const counselingIssues = counselingLogs.filter((record) =>
      record.targetType === "활동지원사" &&
      isWithinRecentMonths(record.date) &&
      (["고충", "보고", "모니터링"].some((word) => String(record.category || record.content || "").includes(word)) || true)
    ).length;
    return { recentJoined, recentResigned, waiting, working, handoverEvents, counselingIssues };
  }, [displayWorkers, matchingLogs, counselingLogs]);

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
          <PartialUpdateDialog<Worker & { id: string }> title="활동지원사 일괄 정보 업데이트" existing={displayWorkers} fields={WORKER_PARTIAL_UPDATE_FIELDS as any} onUpdate={(id, updates) => update(id, { ...updates, ...(updates.psychiatricCheckDate ? { psychiatricCheckUnchecked: false } : {}), ...(updates.workplaceCheckDate ? { workplaceCheckUnchecked: false } : {}) })} />
          <Button variant="outline" size="sm" onClick={() => openWorkerSummaryModal("health")}>미검진자 모아보기</Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { setForm(emptyWorker); setEditingId(null); setExplicitOks(new Set()); }}>+ 신규등록</Button>
            </DialogTrigger>
            <DialogContent className="max-w-5xl w-[96vw] max-h-[92vh] overflow-y-auto" onPointerDownOutside={(event) => event.preventDefault()}>
              <DialogHeader>
                <DialogTitle>{editingId ? "활동지원사 수정" : "활동지원사 신규등록"}</DialogTitle>
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
                  <Label>업무별 가능/거부 여부</Label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 p-3 bg-muted/30 rounded-lg">
                    {WORKER_REJECTION_TYPES.map((type) => {
                      const okKey = type.replace("거부", "가능");
                      const isOk = explicitOks.has(okKey);
                      const isRejected = form.rejectionTypes.includes(type);
                      return (
                      <div key={type} className="flex flex-col space-y-1">
                        <span className="text-xs font-medium text-muted-foreground">{type.replace("거부", "")}</span>
                        <div className="flex items-center space-x-4">
                          <div className="flex items-center space-x-1">
                            <Checkbox 
                              id={`${type}-ok`} 
                              checked={isOk}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setExplicitOks(prev => new Set(prev).add(okKey));
                                  setForm(f => ({ ...f, rejectionTypes: f.rejectionTypes.filter(v => v !== type) }));
                                } else {
                                  setExplicitOks(prev => { const s = new Set(prev); s.delete(okKey); return s; });
                                }
                              }}
                            />
                            <Label htmlFor={`${type}-ok`} className="text-xs font-normal cursor-pointer">가능</Label>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Checkbox 
                              id={`${type}-no`} 
                              checked={isRejected}
                              onCheckedChange={(checked) => {
                                if (checked && !form.rejectionTypes.includes(type)) {
                                  setForm(f => ({ ...f, rejectionTypes: [...f.rejectionTypes, type] }));
                                  setExplicitOks(prev => { const s = new Set(prev); s.delete(okKey); return s; });
                                }
                              }}
                            />
                            <Label htmlFor={`${type}-no`} className="text-xs font-normal text-destructive cursor-pointer">거부</Label>
                          </div>
                        </div>
                      </div>
                      );
                    })}
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
                  <Label>건강검진 관리</Label>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2 rounded-md border p-3">
                      <Label>향정신성/마약검사일</Label>
                      <Input type="date" value={form.psychiatricCheckDate || ""} disabled={!!form.psychiatricCheckUnchecked} onChange={(e) => setForm((f) => ({ ...f, psychiatricCheckDate: e.target.value }))} />
                      <div className="flex items-center gap-2"><Checkbox id="psychiatric-unchecked" checked={!!form.psychiatricCheckUnchecked} onCheckedChange={(checked) => setForm((f) => ({ ...f, psychiatricCheckUnchecked: !!checked, psychiatricCheckDate: checked ? "" : f.psychiatricCheckDate }))} /><Label htmlFor="psychiatric-unchecked" className="text-sm font-normal">미검진</Label></div>
                    </div>
                    <div className="space-y-2 rounded-md border p-3">
                      <Label>직장검진일</Label>
                      <Input type="date" value={form.workplaceCheckDate || ""} disabled={!!form.workplaceCheckUnchecked} onChange={(e) => setForm((f) => ({ ...f, workplaceCheckDate: e.target.value }))} />
                      <div className="flex items-center gap-2"><Checkbox id="workplace-unchecked" checked={!!form.workplaceCheckUnchecked} onCheckedChange={(checked) => setForm((f) => ({ ...f, workplaceCheckUnchecked: !!checked, workplaceCheckDate: checked ? "" : f.workplaceCheckDate }))} /><Label htmlFor="workplace-unchecked" className="text-sm font-normal">미검진</Label></div>
                    </div>
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

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div><Label>이수증번호</Label><Input value={form.certificateNumber || ""} onChange={(e) => setForm((f) => ({ ...f, certificateNumber: e.target.value }))} placeholder="이수증 번호" /></div>
                  <div><Label>이수일자</Label><Input type="date" value={form.certificateDate || ""} onChange={(e) => setForm((f) => ({ ...f, certificateDate: e.target.value }))} /></div>
                </div>

                <div className="space-y-2">
                  <Label>특이사항</Label>
                  <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
                </div>

                <div className="border-t pt-4 grid grid-cols-2 gap-4">
                  <div><Label>최초 접수일</Label><Input type="date" value={form.receiptDate} onChange={(e) => setForm((f) => ({ ...f, receiptDate: e.target.value }))} /></div>
                  <div>
                    <Label>근무상태</Label>
                    <Select
                      value={form.contractStatus}
                      onValueChange={(v) =>
                        setForm((f) => ({
                          ...f,
                          contractStatus: v as any,
                          resignationDate:
                            v === "퇴사"
                              ? f.resignationDate || new Date().toISOString().slice(0, 10)
                              : "",
                        }))
                      }
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="근무중">근무중</SelectItem><SelectItem value="대기">대기</SelectItem><SelectItem value="변경">변경</SelectItem><SelectItem value="퇴사">퇴사</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div><Label>최초 근무일</Label><Input type="date" value={form.serviceStartDate} onChange={(e) => setForm((f) => ({ ...f, serviceStartDate: e.target.value }))} /></div>
                  {form.contractStatus === "퇴사" && (
                    <div>
                      <Label>퇴사일</Label>
                      <Input type="date" value={form.retirementDate || form.resignationDate} onChange={(e) => setForm((f) => ({ ...f, retirementDate: e.target.value, resignationDate: e.target.value }))} />
                    </div>
                  )}

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
              <div className="sticky bottom-0 z-10 -mx-6 mt-6 flex justify-end gap-2 border-t bg-background/95 px-6 py-3 backdrop-blur">
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
              <CardTitle className="text-base">전체 활동지원사 명단 ({filtered.length}명)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input placeholder="이름·연락처 또는 담당 이용자로 검색..." value={search} onChange={(e) => setSearch(e.target.value)} />
              <div className="flex flex-col gap-4 md:flex-row md:items-end">
                <div className="flex-1 space-y-1.5">
                  <Label className="text-[10px] text-muted-foreground uppercase tracking-wider ml-1">상태 필터</Label>
                  <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full overflow-x-auto">
                    <TabsList className="min-w-max">
                      <TabsTrigger value="all" className="text-xs">전체 {displayWorkers.length}</TabsTrigger>
                      <TabsTrigger value="근무중" className="text-xs">근무중 {workingCount}</TabsTrigger>
                      <TabsTrigger value="대기" className="text-xs">대기 {waitingCount}</TabsTrigger>
                      <TabsTrigger value="퇴사" className="text-xs">퇴사 {resignedCount}</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                <div className="flex-1 space-y-1.5">
                  <Label className="text-[10px] text-muted-foreground uppercase tracking-wider ml-1">지원 가능 종류 필터</Label>
                  <Tabs value={supportFilter} onValueChange={setSupportFilter} className="w-full overflow-x-auto">
                    <TabsList className="min-w-max">
                      <TabsTrigger value="all" className="text-xs">전체</TabsTrigger>
                      {SUPPORT_TYPES.map(t => (
                        <TabsTrigger key={t} value={t} className="text-xs">{t}</TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {filtered.length === 0 ? (
              <Card className="md:col-span-2">
                <CardContent className="py-10 text-center text-sm text-muted-foreground">검색된 활동지원사가 없습니다.</CardContent>
              </Card>
            ) : (
              filtered.map((w) => (
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
                        <Badge variant={effectiveWorkerStatus(w) === "근무중" ? "default" : effectiveWorkerStatus(w) === "대기" ? "secondary" : "destructive"}>
                          {effectiveWorkerStatus(w)}
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
                      {w.supportTypes && w.supportTypes.length > 0 && (
                        <div className="flex flex-wrap gap-1 py-0.5">
                          <span className="text-muted-foreground">지원가능:</span>
                          {w.supportTypes.map(t => (
                            <Badge key={t} variant="outline" className="text-[10px] px-1 h-4 bg-blue-50/30">{t}</Badge>
                          ))}
                        </div>
                      )}
                      <p><span className="text-muted-foreground">최초접수:</span> {w.receiptDate || "미등록"}</p>
                      <p><span className="text-muted-foreground">동백 재직기간:</span> {getFormattedDuration(w.serviceStartDate)}</p>
                      <p><span className="text-muted-foreground">담당이용자:</span> {formatAssignedUsersPreview(w, users)}</p>
                      <p><span className="text-muted-foreground">담당이용자 이력:</span> {getUserHistoryLabel(w)}</p>
                      {w.contractStatus === "퇴사" && w.resignationDate && (
                        <p className="text-destructive"><span className="text-muted-foreground">퇴사일:</span> {w.resignationDate}</p>
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
              <CardTitle className="text-base">활동지원사 현황 요약 대시보드</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                <button type="button" onClick={() => openWorkerSummaryModal("joined")} className="rounded-lg border bg-muted/30 p-3 text-left transition hover:shadow-md cursor-pointer">
                  <p className="text-xs text-muted-foreground">3개월 신규 입사</p>
                  <p className="text-2xl font-bold text-primary">{workerSummary.recentJoined}</p>
                </button>
                <button type="button" onClick={() => openWorkerSummaryModal("resigned")} className="rounded-lg border bg-muted/30 p-3 text-left transition hover:shadow-md cursor-pointer">
                  <p className="text-xs text-muted-foreground">3개월 퇴사</p>
                  <p className="text-2xl font-bold text-destructive">{workerSummary.recentResigned}</p>
                </button>
                <button type="button" onClick={() => openWorkerSummaryModal("working")} className="rounded-lg border bg-muted/30 p-3 text-left transition hover:shadow-md cursor-pointer">
                  <p className="text-xs text-muted-foreground">현재 근무 중</p>
                  <p className="text-2xl font-bold">{workerSummary.working}</p>
                </button>
                <button type="button" onClick={() => openWorkerSummaryModal("waiting")} className="rounded-lg border bg-muted/30 p-3 text-left transition hover:shadow-md cursor-pointer">
                  <p className="text-xs text-muted-foreground">현재 대기</p>
                  <p className="text-2xl font-bold">{workerSummary.waiting}</p>
                </button>
                <button type="button" onClick={() => openWorkerSummaryModal("handover")} className="rounded-lg border bg-muted/30 p-3 text-left transition hover:shadow-md cursor-pointer">
                  <p className="text-xs text-muted-foreground">인계/변경</p>
                  <p className="text-2xl font-bold text-primary">{workerSummary.handoverEvents}</p>
                </button>
                <button type="button" onClick={() => openWorkerSummaryModal("counseling")} className="rounded-lg border bg-muted/30 p-3 text-left transition hover:shadow-md cursor-pointer">
                  <p className="text-xs text-muted-foreground">상담/보고</p>
                  <p className="text-2xl font-bold">{workerSummary.counselingIssues}</p>
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
                <div className="space-y-3">
                  {isHealthSummary && (
                    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">엑셀형 복사용 표</p>
                        <Button size="sm" variant="outline" onClick={copyHealthCheckRows}>이름+연락처 복사</Button>
                      </div>
                      <table className="w-full border-collapse bg-background text-xs">
                        <thead><tr className="bg-muted"><th className="border p-2 text-left">이름</th><th className="border p-2 text-left">연락처</th><th className="border p-2 text-left">미검진 항목</th></tr></thead>
                        <tbody>{getHealthCopyRows().map((row) => <tr key={`${row.name}-${row.phone}`}><td className="border p-2">{row.name}</td><td className="border p-2">{row.phone}</td><td className="border p-2">{row.missingItems}</td></tr>)}</tbody>
                      </table>
                    </div>
                  )}
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
                        <tr key={row.id} className="border-b hover:bg-muted/40 cursor-pointer" onClick={() => openSummaryWorker(row.workerId)}>
                          <td className="py-2 pr-3 font-medium">{row.name}</td>
                          <td className="py-2 pr-3 whitespace-nowrap">{row.date || "미등록"}</td>
                          <td className="py-2 pr-3"><Badge variant={row.status.includes("퇴사") ? "destructive" : row.status.includes("대기") ? "secondary" : "default"}>{row.status}</Badge></td>
                          <td className="py-2 pr-3 max-w-[260px] truncate">{row.note || "-"}</td>
                          <td className="py-2 text-right"><Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); openSummaryWorker(row.workerId); }}>상세</Button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
      <AlertDialog open={!!pendingProfileSync} onOpenChange={(open) => !open && setPendingProfileSync(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>연관 데이터 일괄 업데이트</AlertDialogTitle>
            <AlertDialogDescription>
              정보 변경({pendingProfileSync?.changedFields.join(", ")})이 감지되었습니다. 변경된 내용을 이 활동지원사와 연결된 모든 매칭 이력, 인계인수서, 종결확인서, 상담기록에도 일괄 반영하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingProfileSync(null)}>아니요</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              if (!pendingProfileSync) return;
              const updatedCount = await cascadeWorkerProfile(pendingProfileSync.id, pendingProfileSync.snapshot, pendingProfileSync.previous);
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
              정말 이 기록(또는 인원)을 삭제하시겠습니까? 연결된 매칭 이력도 함께 정리됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!cascadeTarget} onOpenChange={(open) => !open && setCascadeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>담당 이용자 상태도 변경할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {cascadeTarget?.workerName} 활동지원사가 퇴사로 변경되었습니다. 담당하던 이용자
              ({cascadeTarget?.users.map((u) => u.name).join(", ")})를 어떻게 처리할까요?
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
                  <SelectItem value="계약해지">계약해지로 변경</SelectItem>
                  <SelectItem value="인계인수">인계인수서 작성</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {cascadeAction === "계약해지" && (
              <div className="space-y-2">
                <Label>계약 해지일</Label>
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

      <AlertDialog open={!!handoverGate} onOpenChange={(open) => !open && setHandoverGate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>인계·인수서 작성이 필요합니다</AlertDialogTitle>
            <AlertDialogDescription>
              {handoverGate?.workerName} 활동지원사의 담당 이용자({handoverGate?.prevUserNames})를 다른
              이용자로 변경하려고 합니다. 인계·인수서를 먼저 작성해야 담당 변경이 저장됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setHandoverGate(null)}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!handoverGate) return;
                const params = new URLSearchParams({
                  userId: handoverGate.prevUserId,
                  prevWorkerId: handoverGate.workerId,
                });
                setHandoverGate(null);
                setDialogOpen(false);
                navigate(`/handovers?${params.toString()}`);
              }}
            >
              인계·인수서 작성으로 이동
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>



      <Dialog open={!!detailTarget} onOpenChange={(open) => !open && setDetailTarget(null)}>
        <DialogContent className="max-w-5xl w-[96vw] max-h-[92vh] overflow-y-auto" onPointerDownOutside={(event) => event.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{detailTarget ? `${detailTarget.name} 상세 정보` : "활동지원사 상세"}</DialogTitle>
          </DialogHeader>
          {detailTarget && (
            <div className="space-y-6">
              <div className="bg-muted/30 rounded-lg p-4 space-y-3">
                <span className="text-sm font-bold text-primary block border-b pb-1 mb-2">업무별 가능/거부 현황</span>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {WORKER_REJECTION_TYPES.map((type) => {
                    const isRejected = detailTarget.rejectionTypes?.includes(type);
                    return (
                      <div key={type} className={`flex items-center justify-between px-2 py-1.5 rounded border ${isRejected ? 'bg-red-50/50 border-red-100' : 'bg-green-50/50 border-green-100'}`}>
                        <span className="text-[11px] font-medium">{type.replace("거부", "")}</span>
                        <Badge variant={isRejected ? "destructive" : "default"} className={`text-[9px] h-4 px-1 ${!isRejected && 'bg-green-600'}`}>
                          {isRejected ? "거부" : "가능"}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
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
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-semibold">입력 정보 상세</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div><p className="text-sm text-muted-foreground">성별 / 나이</p><p className="font-medium">{joinNonEmpty([detailTarget.gender, detailTarget.age ? `${detailTarget.age}세` : ""])}</p></div>
                    <div><p className="text-sm text-muted-foreground">연락처</p><p className="font-medium">{detailTarget.phone || "미등록"}</p></div>
                    <div><p className="text-sm text-muted-foreground">경력</p><p className="font-medium">{detailTarget.experience || "미등록"}</p></div>
                    <div><p className="text-sm text-muted-foreground">거주지역</p><p className="font-medium">{detailTarget.residenceArea || "미등록"}</p></div>
                    <div><p className="text-sm text-muted-foreground">희망지역</p><p className="font-medium">{detailTarget.preferredArea || "미등록"}</p></div>
                    <div><p className="text-sm text-muted-foreground">지원 가능 종류</p><p className="font-medium">{joinNonEmpty(detailTarget.supportTypes || [])}</p></div>
                    <div className="md:col-span-2"><p className="text-sm text-muted-foreground">주소</p><p className="font-medium">{detailTarget.address || "미등록"}</p></div>
                    <div><p className="text-sm text-muted-foreground">운전 / 동물알러지</p><p className="font-medium">운전 {yesNo(detailTarget.canDrive)} · 동물알러지 {yesNo(detailTarget.animalAllergy)}</p></div>
                    <div><p className="text-sm text-muted-foreground">외국인 / 체류</p><p className="font-medium">{joinNonEmpty([detailTarget.isForeigner ? "외국인" : "", detailTarget.hasF4 ? "F4" : "", detailTarget.hasF5 ? "F5" : ""])}</p></div>
                    <div><p className="text-sm text-muted-foreground">자격증</p><p className="font-medium">{joinNonEmpty(detailTarget.certificates || [])}</p></div>
                    <div><p className="text-sm text-muted-foreground">이수증번호</p><p className="font-medium">{detailTarget.certificateNumber || "미등록"}</p></div>
                    <div><p className="text-sm text-muted-foreground">이수일자</p><p className="font-medium">{detailTarget.certificateDate || "미등록"}</p></div>
                    <div><p className="text-sm text-muted-foreground">근무 시작 / 퇴사일</p><p className="font-medium">{joinNonEmpty([detailTarget.serviceStartDate, detailTarget.retirementDate || detailTarget.resignationDate])}</p></div>
                    <div><p className="text-sm text-muted-foreground">향정신성/마약검사</p><p className="font-medium">{formatExamStatus(detailTarget.psychiatricCheckDate, detailTarget.psychiatricCheckUnchecked)}</p></div>
                    <div><p className="text-sm text-muted-foreground">직장검진</p><p className="font-medium">{formatExamStatus(detailTarget.workplaceCheckDate, detailTarget.workplaceCheckUnchecked)}</p></div>
                  </div>
                  <div>
                    <p className="mb-2 text-sm text-muted-foreground">희망 활동 시간 및 요일</p>
                    <WeeklySchedulePicker value={detailTarget.weeklySchedule} onChange={() => undefined} readOnly />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">특이사항</p>
                    <p className="whitespace-pre-wrap rounded-md bg-muted/30 p-3 text-sm">{detailTarget.notes || "미등록"}</p>
                  </div>
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
                      setMatchHistoryForm({type: "매칭", userId: "", userName: "", userPhone: "", workerId: detailTarget?.id || "", date: new Date().toISOString().slice(0,10), endDate: "", notes: ""});
                      setEditingMatchHistoryId(null);
                      setMatchHistoryDialogOpen(true);
                    }}>＋ 기록 추가</Button>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {selectedMatchingLogs.length === 0 ? (
                      <p className="text-sm text-muted-foreground">기록된 매칭 이력이 없습니다.</p>
                    ) : (
                      selectedMatchingLogs.map((match) => (
                        <div key={match.id || [match.date, match.userId].join("-")} className="border rounded-lg p-3 hover:bg-muted">
                          <div className="flex justify-between items-start gap-3">
                            <div className="cursor-pointer flex-1" onClick={() => setExpandedMatchId(expandedMatchId === match.id ? null : match.id)}>
                              <p className="font-semibold">{match.date}{match.endDate ? ` ~ ${match.endDate}` : ""} · {match.type}</p>
                              <p className="text-sm text-muted-foreground">{match.userName} · {match.userPhone}</p>
                            </div>
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setMatchHistoryForm({type: match.type, userId: match.userId, userName: match.userName, userPhone: match.userPhone, workerId: match.workerId, date: match.date, endDate: match.endDate || "", notes: match.notes || ""}); setEditingMatchHistoryId(match.id || null); setMatchHistoryDialogOpen(true); }}>✏️</Button>
                              {match.id && <Button size="sm" variant="ghost" onClick={async (e) => { e.stopPropagation(); if (!confirm("정말 이 기록(또는 인원)을 삭제하시겠습니까? 연결된 매칭 이력도 함께 정리됩니다.")) return; await deleteMatchingHistoryAndSync({ ...match, id: match.id }); toast({ title: "매칭 이력 삭제 및 배정 정보 동기화 완료" }); }}>삭제</Button>}
                            </div>
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
                <Button variant="destructive" onClick={() => { if (detailTarget) { setDeleteTarget(detailTarget); setDetailTarget(null); } }}>삭제</Button>
                <Button variant="outline" onClick={() => detailTarget && startEdit(detailTarget)}>수정</Button>
                <Button onClick={() => setDetailTarget(null)}>닫기</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
            {/* 매칭 히스토리 추가/수정 다이얼로그 */}
            <Dialog open={matchHistoryDialogOpen} onOpenChange={setMatchHistoryDialogOpen}>
              <DialogContent className="max-w-3xl w-[95vw]" onPointerDownOutside={(event) => event.preventDefault()}>
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
                        <SelectItem value="시도">시도 (진행중)</SelectItem>
                        <SelectItem value="실패">실패 (거부/불일치)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">이용자</label>
                    <Select value={matchHistoryForm?.userId || ""} onValueChange={(v) => {
                      if (!matchHistoryForm) return;
                      const u = users.find(x => x.id === v);
                      setMatchHistoryForm({...matchHistoryForm, userId: v, userName: u?.name || "", userPhone: u?.phone || ""});
                    }}>
                      <SelectTrigger><SelectValue placeholder="이용자 선택" /></SelectTrigger>
                      <SelectContent>
                        {users.map(u => <SelectItem key={u.id} value={u.id}>{u.name} ({u.phone || "연락처 없음"})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-sm font-medium">시작일</label>
                      <Input type="date" value={matchHistoryForm?.date || ""} onChange={(e) => matchHistoryForm && setMatchHistoryForm({...matchHistoryForm, date: e.target.value})} />
                    </div>
                    {matchHistoryForm?.type === "해제" && (
                      <div>
                        <label className="text-sm font-medium">종료일</label>
                        <Input type="date" value={matchHistoryForm?.endDate || ""} onChange={(e) => matchHistoryForm && setMatchHistoryForm({...matchHistoryForm, endDate: e.target.value})} />
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-medium">비고</label>
                    <Input placeholder="비고 입력" value={matchHistoryForm?.notes || ""} onChange={(e) => matchHistoryForm && setMatchHistoryForm({...matchHistoryForm, notes: e.target.value})} />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setMatchHistoryDialogOpen(false)}>취소</Button>
                  <Button disabled={!matchHistoryForm?.userId || !matchHistoryForm?.date} onClick={async () => {
                    if (!matchHistoryForm || !detailTarget) return;
                    const u = users.find(x => x.id === matchHistoryForm.userId);
                    const payload: any = {
                      type: matchHistoryForm.type,
                      userId: matchHistoryForm.userId,
                      userName: u?.name || "",
                      userPhone: u?.phone || "",
                      workerId: detailTarget.id,
                      workerName: detailTarget.name,
                      workerPhone: detailTarget.phone,
                      date: matchHistoryForm.date,
                      endDate: matchHistoryForm.endDate || undefined,
                      notes: matchHistoryForm.notes || undefined,
                    };
                    if (editingMatchHistoryId) {
                      await updateMatchingHistory(editingMatchHistoryId, payload);
                      toast({ title: "매칭 이력 수정 완료" });
                    } else {
                      await addMatchingHistory(payload);
                      toast({ title: "매칭 이력 추가 완료" });
                    }
                    setMatchHistoryDialogOpen(false);
                    setMatchHistoryForm(null);
                  }}>저장</Button>
                </div>
              </DialogContent>
            </Dialog>
    </div>
  );
};

export default WorkerManagement;































