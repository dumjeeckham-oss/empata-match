import type { ServiceUser, Worker } from "@/types";

function normalizePhone(phone: unknown): string {
  return String(phone ?? "").replace(/\D/g, "");
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function parseDisplayDate(raw: unknown): Date | null {
  if (!raw) return null;

  // Firestore Timestamp 형태 지원 (toDate())
  const maybeTs = raw as { toDate?: () => Date };
  if (typeof maybeTs?.toDate === "function") {
    const d = maybeTs.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const str = String(raw).trim();
  if (!str) return null;

  // Excel serial date (대략 2000년 이후 범위)
  const serial = Number(str);
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
    const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  // YYYYMMDD / YYYY-MM-DD / YYYY.MM.DD
  const compact = str.match(/^(\d{4})[-./\s]?(\d{1,2})[-./\s]?(\d{1,2})$/);
  if (compact) {
    const [, y, m, d] = compact;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(str);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toYmd(raw: unknown): string {
  const d = parseDisplayDate(raw);
  if (!d) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function personLabel(name: string, phone?: string): string {
  const last4 = normalizePhone(phone).slice(-4);
  return last4 ? `${name}(${last4})` : name;
}

function calcExperienceFromStartDate(startDateRaw: unknown, now = new Date()): string | null {
  const startStr = String(startDateRaw ?? "").trim();
  if (!startStr) return null;
  const start = new Date(startStr);
  if (Number.isNaN(start.getTime())) return null;

  let totalMonths =
    (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) totalMonths -= 1;
  if (totalMonths < 0) totalMonths = 0;

  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  if (years <= 0 && months <= 0) return "1개월 미만";
  if (years > 0 && months > 0) return `${years}년 ${months}개월`;
  if (years > 0) return `${years}년`;
  return `${months}개월`;
}

/** 레거시 단일 필드 → 배열 마이그레이션 */
export function normalizeServiceUser(raw: Record<string, unknown>): Partial<ServiceUser> {
  const ids = Array.isArray(raw.assignedHelperIds)
    ? (raw.assignedHelperIds as string[])
    : Array.isArray(raw.assigned_workers)
      ? (raw.assigned_workers as string[])
    : raw.assignedHelperId
      ? [String(raw.assignedHelperId)]
      : [];
  const names = Array.isArray(raw.assignedHelperNames)
    ? (raw.assignedHelperNames as string[])
    : raw.assignedHelperName
      ? [String(raw.assignedHelperName)]
      : [];
  const phones = Array.isArray(raw.assignedHelperPhones)
    ? (raw.assignedHelperPhones as string[])
    : raw.assignedHelperPhone
      ? [String(raw.assignedHelperPhone)]
      : [];

  const terminationReason = String(raw.terminationReason ?? raw.txtUMemostop ?? raw["중단사유"] ?? raw["종결사유"] ?? "");
  const serviceStartDate = toYmd(
    raw.serviceStartDate ??
      raw.firstServiceDate ??
      raw["최초서비스제공일"] ??
      raw["최초서비스제공날짜"] ??
      raw["계약일"] ??
      raw.startDate ??
      raw.contractDate
  );

  const contractStatusRaw = String(raw.contractStatus ?? "").trim();
  const contractStatus: ServiceUser["contractStatus"] =
    terminationReason.trim()
      ? "계약해지"
      : contractStatusRaw === "서비스중" || contractStatusRaw === "대기" || contractStatusRaw === "계약해지"
        ? (contractStatusRaw as ServiceUser["contractStatus"])
        : serviceStartDate
          ? "서비스중"
          : "대기";

  return {
    ...raw,
    assignedHelperIds: ids.filter(Boolean),
    assigned_workers: ids.filter(Boolean),
    assignedHelperNames: names,
    assignedHelperPhones: phones,
    gender: String(raw.gender ?? raw.txtUSex ?? ""),
    txtUSex: String(raw.txtUSex ?? raw.gender ?? ""),
    terminationReason,
    txtUMemostop: String(raw.txtUMemostop ?? raw.terminationReason ?? ""),
    // 중단사유/종결 정보가 들어오면 화면 상태를 자동으로 계약해지로 표시
    contractStatus,
    // 엑셀/Firestore의 날짜 형식을 YYYY-MM-DD로 통일하여 화면 Input(type=date)에 즉시 반영
    serviceStartDate,
  } as Partial<ServiceUser>;
}

export function normalizeWorker(raw: Record<string, unknown>): Partial<Worker> {
  const ids = Array.isArray(raw.assignedUserIds)
    ? (raw.assignedUserIds as string[])
    : Array.isArray(raw.assigned_users)
      ? (raw.assigned_users as string[])
    : raw.assignedUserId
      ? [String(raw.assignedUserId)]
      : [];
  const names = Array.isArray(raw.assignedUserNames)
    ? (raw.assignedUserNames as string[])
    : raw.assignedUserName
      ? [String(raw.assignedUserName)]
      : [];
  const phones = Array.isArray(raw.assignedUserPhones)
    ? (raw.assignedUserPhones as string[])
    : raw.assignedUserPhone
      ? [String(raw.assignedUserPhone)]
      : [];

  const resignationDate = toYmd(raw.resignationDate);
  const serviceStartDate = toYmd(raw.serviceStartDate);

  // 퇴사일이 없고 최초근무일(입사일)이 있으면 "근무중"으로 표시
  const derivedStatus: Worker["contractStatus"] =
    resignationDate
      ? "퇴사"
      : serviceStartDate
        ? "근무중"
        : (String(raw.contractStatus ?? "").trim() === "퇴사" ? "퇴사" : "대기");

  // 최초근무일을 기준으로 현재까지 경력(년/개월)을 실시간 산정
  const derivedExperience =
    calcExperienceFromStartDate(serviceStartDate) ??
    String(raw.experience ?? "경력없음");

  return {
    ...raw,
    assignedUserIds: ids.filter(Boolean),
    assigned_users: ids.filter(Boolean),
    assignedUserNames: names,
    assignedUserPhones: phones,
    gender: String(raw.gender ?? raw.txtHSex ?? ""),
    txtHSex: String(raw.txtHSex ?? raw.gender ?? ""),
    contractStatus: derivedStatus,
    experience: derivedExperience,
    serviceStartDate,
    resignationDate,
  } as Partial<Worker>;
}

export function formatHelperList(user: Pick<ServiceUser, "assignedHelperNames" | "assignedHelperIds" | "assignedHelperPhones">): string {
  if (user.assignedHelperNames?.length) {
    const labels = user.assignedHelperNames.map((name, idx) => personLabel(name, user.assignedHelperPhones?.[idx]));
    // 동명이인(이름만 같음)으로 2번 표시되는 문제 방지: 표시 레벨에서 중복 제거
    return Array.from(new Set(labels.filter(Boolean))).join(", ");
  }
  if (user.assignedHelperIds?.length) return `${user.assignedHelperIds.length}명 배정`;
  return "";
}

export function formatUserList(worker: Pick<Worker, "assignedUserNames" | "assignedUserIds" | "assignedUserPhones">): string {
  if (worker.assignedUserNames?.length) {
    const labels = worker.assignedUserNames.map((name, idx) => personLabel(name, worker.assignedUserPhones?.[idx]));
    return Array.from(new Set(labels.filter(Boolean))).join(", ");
  }
  if (worker.assignedUserIds?.length) return `${worker.assignedUserIds.length}명 담당`;
  return "";
}

/** 이용자 저장 시 활동지원사 쪽 N:M 역참조 동기화 */
export async function syncUserToWorkers(
  userId: string,
  user: Pick<ServiceUser, "name" | "phone" | "assignedHelperIds">,
  workers: (Worker & { id: string })[],
  prevHelperIds: string[],
  updateWorker: (id: string, data: Partial<Worker>) => Promise<unknown>
) {
  const prev = new Set(prevHelperIds);
  const next = new Set(user.assignedHelperIds ?? []);

  for (const workerId of next) {
    const worker = workers.find((w) => w.id === workerId);
    if (!worker) continue;
    const existIdx = (worker.assignedUserIds ?? []).indexOf(userId);
    const ids = existIdx >= 0
      ? [...(worker.assignedUserIds ?? [])]
      : [...new Set([...(worker.assignedUserIds ?? []), userId])];
    const names = [...(worker.assignedUserNames ?? [])];
    const phones = [...(worker.assignedUserPhones ?? [])];
    if (existIdx >= 0) {
      names[existIdx] = user.name;
      phones[existIdx] = user.phone;
    } else {
      names.push(user.name);
      phones.push(user.phone);
    }
    if (!prev.has(workerId) || existIdx >= 0) {
      const updates = { assignedUserIds: ids, assigned_users: ids, assignedUserNames: names, assignedUserPhones: phones };
      await updateWorker(workerId, updates);
      Object.assign(worker, updates);
    }
  }

  for (const workerId of prev) {
    if (next.has(workerId)) continue;
    const worker = workers.find((w) => w.id === workerId);
    if (!worker) continue;
    const removeIdx = (worker.assignedUserIds ?? []).indexOf(userId);
    if (removeIdx < 0) continue;
    const updates = {
      assignedUserIds: (worker.assignedUserIds ?? []).filter((id) => id !== userId),
      assigned_users: (worker.assignedUserIds ?? []).filter((id) => id !== userId),
      assignedUserNames: (worker.assignedUserNames ?? []).filter((_, i) => i !== removeIdx),
      assignedUserPhones: (worker.assignedUserPhones ?? []).filter((_, i) => i !== removeIdx),
    };
    await updateWorker(workerId, updates);
    Object.assign(worker, updates);
  }
}

/** 활동지원사 저장 시 이용자 쪽 N:M 역참조 동기화 */
export async function syncWorkerToUsers(
  workerId: string,
  worker: Pick<Worker, "name" | "phone" | "assignedUserIds">,
  users: (ServiceUser & { id: string })[],
  prevUserIds: string[],
  updateUser: (id: string, data: Partial<ServiceUser>) => Promise<unknown>
) {
  const prev = new Set(prevUserIds);
  const next = new Set(worker.assignedUserIds ?? []);

  for (const userId of next) {
    const user = users.find((u) => u.id === userId);
    if (!user) continue;
    const existIdx = (user.assignedHelperIds ?? []).indexOf(workerId);
    const ids = existIdx >= 0
      ? [...(user.assignedHelperIds ?? [])]
      : [...new Set([...(user.assignedHelperIds ?? []), workerId])];
    const names = [...(user.assignedHelperNames ?? [])];
    const phones = [...(user.assignedHelperPhones ?? [])];
    if (existIdx >= 0) {
      names[existIdx] = worker.name;
      phones[existIdx] = worker.phone;
    } else {
      names.push(worker.name);
      phones.push(worker.phone);
    }
    if (!prev.has(userId) || existIdx >= 0) {
      const updates = { assignedHelperIds: ids, assigned_workers: ids, assignedHelperNames: names, assignedHelperPhones: phones };
      await updateUser(userId, updates);
      Object.assign(user, updates);
    }
  }

  for (const userId of prev) {
    if (next.has(userId)) continue;
    const user = users.find((u) => u.id === userId);
    if (!user) continue;
    const removeIdx = (user.assignedHelperIds ?? []).indexOf(workerId);
    if (removeIdx < 0) continue;
    const updates = {
      assignedHelperIds: (user.assignedHelperIds ?? []).filter((id) => id !== workerId),
      assigned_workers: (user.assignedHelperIds ?? []).filter((id) => id !== workerId),
      assignedHelperNames: (user.assignedHelperNames ?? []).filter((_, i) => i !== removeIdx),
      assignedHelperPhones: (user.assignedHelperPhones ?? []).filter((_, i) => i !== removeIdx),
    };
    await updateUser(userId, updates);
    Object.assign(user, updates);
  }
}

export function buildHelperArraysFromIds(
  helperIds: string[],
  workers: (Worker & { id: string })[]
): { ids: string[]; names: string[]; phones: string[] } {
  const ids: string[] = [];
  const names: string[] = [];
  const phones: string[] = [];
  for (const id of helperIds) {
    const w = workers.find((x) => x.id === id);
    if (w) {
      ids.push(w.id);
      names.push(w.name);
      phones.push(w.phone);
    }
  }
  return { ids, names, phones };
}

export function buildUserArraysFromIds(
  userIds: string[],
  users: (ServiceUser & { id: string })[]
): { ids: string[]; names: string[]; phones: string[] } {
  const ids: string[] = [];
  const names: string[] = [];
  const phones: string[] = [];
  for (const id of userIds) {
    const u = users.find((x) => x.id === id);
    if (u) {
      ids.push(u.id);
      names.push(u.name);
      phones.push(u.phone);
    }
  }
  return { ids, names, phones };
}
