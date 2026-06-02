import type { ServiceUser, Worker } from "@/types";

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

  return {
    ...raw,
    assignedHelperIds: ids.filter(Boolean),
    assigned_workers: ids.filter(Boolean),
    assignedHelperNames: names,
    assignedHelperPhones: phones,
    gender: String(raw.gender ?? raw.txtUSex ?? ""),
    txtUSex: String(raw.txtUSex ?? raw.gender ?? ""),
    terminationReason: String(raw.terminationReason ?? raw.txtUMemostop ?? ""),
    txtUMemostop: String(raw.txtUMemostop ?? raw.terminationReason ?? ""),
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

  return {
    ...raw,
    assignedUserIds: ids.filter(Boolean),
    assigned_users: ids.filter(Boolean),
    assignedUserNames: names,
    assignedUserPhones: phones,
    gender: String(raw.gender ?? raw.txtHSex ?? ""),
    txtHSex: String(raw.txtHSex ?? raw.gender ?? ""),
  } as Partial<Worker>;
}

export function formatHelperList(user: Pick<ServiceUser, "assignedHelperNames" | "assignedHelperIds">): string {
  if (user.assignedHelperNames?.length) return user.assignedHelperNames.join(", ");
  if (user.assignedHelperIds?.length) return `${user.assignedHelperIds.length}명 배정`;
  return "";
}

export function formatUserList(worker: Pick<Worker, "assignedUserNames" | "assignedUserIds">): string {
  if (worker.assignedUserNames?.length) return worker.assignedUserNames.join(", ");
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
