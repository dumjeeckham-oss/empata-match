import type { ServiceUser, WeeklySchedule, Worker } from "@/types";
import { getWorkerServiceSchedules } from "@/lib/serviceSchedule";
import { getWorkerOperationalStatus } from "@/lib/statusLifecycle";

const DAYS: WeeklySchedule["day"][] = ["월", "화", "수", "목", "금", "토", "일"];
const COLORS = ["#dc2626", "#2563eb", "#16a34a", "#9333ea", "#d97706", "#0891b2"];
const slots = (schedule: WeeklySchedule[] | undefined, day: WeeklySchedule["day"], alternative = false) => {
  const item = schedule?.find((entry) => entry.day === day);
  return alternative ? item?.alternativeSlots || [] : item?.slots || [];
};

/** 실제 배정시간과 희망시간을 혼동하지 않도록 상태에 따라 별도로 표시한다. */
export function WorkerScheduleOverview({ worker, users }: { worker: Worker & { id: string }; users: (ServiceUser & { id: string })[] }) {
  const assignments = getWorkerServiceSchedules(worker, users);
  const status = getWorkerOperationalStatus(worker);
  const actual = assignments.length > 0 || status === "서비스 제공중";
  const usable = assignments.filter((item) => item.linked && item.source === "assigned" && item.schedule?.some((entry) => entry.slots?.length));
  const incomplete = assignments.some((item) => !item.linked || item.source !== "assigned" || !item.schedule?.some((entry) => entry.slots?.length)) || (actual && assignments.length === 0);
  const labels = actual ? usable.map((item, index) => ({ label: item.name, color: COLORS[index % COLORS.length], schedule: item.schedule })) : [
    { label: "희망시간 1안", color: COLORS[0], schedule: worker.weeklySchedule },
    { label: "희망시간 2안", color: COLORS[1], schedule: worker.weeklySchedule },
  ];

  if (status === "퇴사") return <p className="text-sm text-muted-foreground">퇴사 상태이므로 현재 활동시간을 표시하지 않습니다.</p>;
  return <div className="space-y-2">
    <p className="text-sm font-semibold">{actual ? "현재 이용자별 활동시간" : "대기 중 희망 활동시간"}</p>
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">{labels.map((item, index) => <span key={`${item.label}-${index}`} className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm" style={{ backgroundColor: item.color }} />{item.label}</span>)}</div>
    {incomplete && <p className="text-xs text-amber-700">일부 배정의 실제 시간이 없거나 배정 정보가 일치하지 않습니다. 빈 칸을 근무 가능 시간으로 판단하지 말고 확인해주세요.</p>}
    {!actual && !worker.weeklySchedule?.some((entry) => entry.slots?.length || entry.alternativeSlots?.length) && <p className="text-xs text-muted-foreground">등록된 희망시간이 없습니다.</p>}
    <div className="overflow-x-auto"><div className="min-w-[770px] space-y-1">
      <div className="flex"><div className="w-12 shrink-0" /><div className="grid flex-1 px-px" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>{Array.from({ length: 24 }, (_, hour) => <div key={hour} className="relative h-4 text-[10px] text-muted-foreground"><span className={hour ? "absolute left-0 -translate-x-1/2" : "absolute left-0"}>{hour}</span></div>)}</div></div>
      {DAYS.map((day) => <div key={day} className="flex items-center"><span className="w-12 shrink-0 text-sm font-medium">{day}</span><div className="grid h-7 flex-1 overflow-hidden rounded border" style={{ gridTemplateColumns: "repeat(48, minmax(0, 1fr))" }}>
        {Array.from({ length: 48 }, (_, slot) => {
          const matches = labels.filter((item, index) => slots(item.schedule, day, !actual && index === 1).includes(slot));
          const color = matches.length > 1 ? `linear-gradient(135deg, ${matches.flatMap((item, index) => [`${item.color} ${index * 100 / matches.length}%`, `${item.color} ${(index + 1) * 100 / matches.length}%`]).join(", ")})` : matches[0]?.color;
          const time = `${String(Math.floor(slot / 2)).padStart(2, "0")}:${slot % 2 ? "30" : "00"}`;
          return <div key={slot} title={`${day} ${time}: ${matches.map((item) => item.label).join(", ") || "등록 없음"}`} className="border-r border-muted-foreground/20 last:border-r-0" style={{ background: color || (day === "토" || day === "일" ? "#fffbeb" : "#f8fafc") }} />;
        })}
      </div></div>)}
    </div></div>
    {actual && <p className="text-xs text-muted-foreground">색은 이용자별 실제 배정시간입니다. 겹치는 시간은 두 색으로 표시됩니다.</p>}
  </div>;
}
