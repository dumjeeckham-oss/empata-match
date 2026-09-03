import type { AnnualSchedule, MatchingBoardItem, ServiceUser, WeeklySchedule, Worker } from "@/types";

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

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

export function getScheduleStartInfo(value: string, today = new Date()) {
  const match = String(value || "").match(/(\d{4})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})/);
  if (!match) return null;
  const [, yearRaw, monthRaw, dayRaw] = match;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const start = new Date(year, month - 1, day);
  if (start.getFullYear() !== year || start.getMonth() !== month - 1 || start.getDate() !== day) return null;
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const daysUntil = Math.round((start.getTime() - base.getTime()) / 86400000);
  return {
    timestamp: start.getTime(),
    displayDate: `${year}년 ${month}월 ${day}일 (${WEEKDAYS[start.getDay()]})`,
    relativeLabel: daysUntil === 0 ? "오늘 시작" : daysUntil > 0 ? `D-${daysUntil}` : `D+${Math.abs(daysUntil)}`,
    daysUntil,
  };
}

export function getVisibleScheduleStarts<T extends AnnualSchedule>(schedules: T[]): T[] {
  return [...schedules]
    .filter((schedule) => schedule.status !== "완료")
    .sort((a, b) =>
      (getScheduleStartInfo(a.preparationStartDate || "")?.timestamp ?? Number.MAX_SAFE_INTEGER)
      - (getScheduleStartInfo(b.preparationStartDate || "")?.timestamp ?? Number.MAX_SAFE_INTEGER)
    );
}
