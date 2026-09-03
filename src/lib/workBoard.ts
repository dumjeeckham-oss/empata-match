import type { MatchingBoardItem, ServiceUser, WeeklySchedule, Worker } from "@/types";

type MatchTarget = (ServiceUser & { id: string }) | (Worker & { id: string });

const slotToTime = (slot: number) => {
  const hour = Math.floor(slot / 2);
  const minute = slot % 2 === 0 ? "00" : "30";
  return `${String(hour).padStart(2, "0")}:${minute}`;
};

const formatSlotRanges = (slots: number[]) => {
  const sorted = [...new Set(slots)].filter((slot) => slot >= 0 && slot < 48).sort((a, b) => a - b);
  if (!sorted.length) return "";
  const ranges: string[] = [];
  let start = sorted[0];
  let end = sorted[0];
  for (const slot of sorted.slice(1)) {
    if (slot === end + 1) {
      end = slot;
      continue;
    }
    ranges.push(`${slotToTime(start)}~${slotToTime(end + 1)}`);
    start = slot;
    end = slot;
  }
  ranges.push(`${slotToTime(start)}~${slotToTime(end + 1)}`);
  return ranges.join(", ");
};

export function formatScheduleSummary(schedule?: WeeklySchedule[], fallbackDays = "", fallbackHours = ""): string {
  const details = (schedule || []).flatMap((item) => {
    const primary = formatSlotRanges(item.slots || []);
    const secondary = formatSlotRanges(item.alternativeSlots || []);
    if (!primary && !secondary) return [];
    const values = [primary, secondary ? `2안 ${secondary}` : ""].filter(Boolean).join(" / ");
    return `${item.day} ${values}`;
  });
  if (details.length) return details.join(" · ");
  return [fallbackDays, fallbackHours].filter((value) => String(value || "").trim()).join(" ") || "등록된 시간 정보 없음";
}

export function getAssignmentCount(targetType: MatchingBoardItem["targetType"], target?: MatchTarget): number {
  if (!target) return 0;
  if (targetType === "이용자") {
    const user = target as ServiceUser;
    return (user.assignedHelperIds ?? user.assigned_workers ?? []).filter(Boolean).length;
  }
  const worker = target as Worker;
  return (worker.assignedUserIds ?? worker.assigned_users ?? []).filter(Boolean).length;
}

export function shouldAutoRemoveMatchingItem(item: MatchingBoardItem, target?: MatchTarget): boolean {
  if (!target) return false;
  if (item.matchMode === "1:다") {
    return getAssignmentCount(item.targetType, target) > (item.existingAssignmentCount ?? 0);
  }
  return item.targetType === "이용자"
    ? (target as ServiceUser).contractStatus === "서비스중"
    : (target as Worker).contractStatus === "근무중";
}
