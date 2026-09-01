import React, { useState, useCallback, useRef, useEffect } from "react";
import { type WeeklySchedule } from "@/types";
import { cn } from "@/lib/utils";

interface Props {
  value?: WeeklySchedule[];
  onChange: (value: WeeklySchedule[]) => void;
  readOnly?: boolean;
}

const DAYS = ["월", "화", "수", "목", "금", "토", "일"] as const;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const SLOTS_PER_HOUR = 2; // 30분 단위

type ScheduleMode = "primary" | "secondary";
type DragType = "select" | "deselect";

export const WeeklySchedulePicker: React.FC<Props> = ({ value = [], onChange, readOnly = false }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragType, setDragType] = useState<DragType | null>(null);
  const [mode, setMode] = useState<ScheduleMode>("primary");
  const containerRef = useRef<HTMLDivElement>(null);

  const getInitialSchedule = (): Record<string, { primary: Set<number>; secondary: Set<number> }> => {
    const schedule: Record<string, { primary: Set<number>; secondary: Set<number> }> = {};
    DAYS.forEach((day) => {
      const found = value.find((v) => v.day === day);
      schedule[day] = {
        primary: new Set(found ? found.slots : []),
        secondary: new Set(found?.alternativeSlots || []),
      };
    });
    return schedule;
  };

  const [schedule, setSchedule] = useState<Record<string, { primary: Set<number>; secondary: Set<number> }>>(getInitialSchedule);

  useEffect(() => {
    setSchedule(getInitialSchedule());
  }, [value]);

  const emitChange = (next: Record<string, { primary: Set<number>; secondary: Set<number> }>) => {
    const updatedValue: WeeklySchedule[] = DAYS.map((day) => ({
      day,
      slots: Array.from(next[day].primary).sort((a, b) => a - b),
      alternativeSlots: Array.from(next[day].secondary).sort((a, b) => a - b),
    })).filter((item) => item.slots.length > 0 || (item.alternativeSlots?.length || 0) > 0);
    onChange(updatedValue);
  };

  const toggleSlot = useCallback((day: string, slot: number, type?: DragType) => {
    setSchedule((prev) => {
      const next = { ...prev };
      const daySchedule = {
        primary: new Set(next[day].primary),
        secondary: new Set(next[day].secondary),
      };
      const target = mode === "primary" ? daySchedule.primary : daySchedule.secondary;
      const other = mode === "primary" ? daySchedule.secondary : daySchedule.primary;
      const shouldSelect = type === "select" || (type === undefined && !target.has(slot));

      if (shouldSelect) {
        target.add(slot);
        other.delete(slot);
      } else {
        target.delete(slot);
      }

      next[day] = daySchedule;
      emitChange(next);
      return next;
    });
  }, [mode, onChange]);

  const handlePointerDown = (day: string, slot: number) => {
    if (readOnly) return;
    setIsDragging(true);
    const target = mode === "primary" ? schedule[day].primary : schedule[day].secondary;
    const type: DragType = target.has(slot) ? "deselect" : "select";
    setDragType(type);
    toggleSlot(day, slot, type);
  };

  const handlePointerEnter = (day: string, slot: number) => {
    if (!readOnly && isDragging && dragType) toggleSlot(day, slot, dragType);
  };

  const stopDragging = () => {
    setIsDragging(false);
    setDragType(null);
  };

  useEffect(() => {
    window.addEventListener("pointerup", stopDragging);
    return () => window.removeEventListener("pointerup", stopDragging);
  }, []);

  return (
    <div className="flex flex-col space-y-3 select-none overflow-x-auto pb-4" ref={containerRef}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-red-500" /> 필수 필요시간 (1안)</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-blue-500" /> 2안 필요시간</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-slate-700" /> 야간</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-amber-50 border" /> 주말</div>
        </div>
        <div className="inline-flex rounded-md border bg-background p-1">
          <button type="button" className={cn("rounded px-3 py-1", mode === "primary" && "bg-red-500 text-white")} disabled={readOnly} onClick={() => setMode("primary")}>1안</button>
          <button type="button" className={cn("rounded px-3 py-1", mode === "secondary" && "bg-blue-500 text-white")} disabled={readOnly} onClick={() => setMode("secondary")}>2안</button>
        </div>
      </div>

      <div className="flex border-b pb-2">
        <div className="w-12 flex-shrink-0" />
        {HOURS.map((hour) => (
          <div key={hour} className={cn("flex-1 text-[10px] text-center min-w-[30px]", (hour >= 22 || hour < 6) ? "text-slate-700 font-semibold" : "text-muted-foreground")}>{hour}</div>
        ))}
      </div>

      {DAYS.map((day) => {
        const isWeekend = day === "토" || day === "일";
        return (
          <div key={day} className="flex items-center h-8">
            <div className={cn("w-12 flex-shrink-0 font-medium text-sm", isWeekend && "text-amber-700")}>{day}</div>
            <div className="flex flex-1 border rounded overflow-hidden h-full">
              {Array.from({ length: 24 * SLOTS_PER_HOUR }, (_, i) => {
                const hour = Math.floor(i / SLOTS_PER_HOUR);
                const isNight = hour >= 22 || hour < 6;
                const isPrimary = schedule[day].primary.has(i);
                const isSecondary = schedule[day].secondary.has(i);
                return (
                  <div
                    key={i}
                    onPointerDown={() => handlePointerDown(day, i)}
                    onPointerEnter={() => handlePointerEnter(day, i)}
                    className={cn(
                      "flex-1 border-r last:border-r-0 transition-colors min-w-[15px] touch-none",
                      readOnly ? "cursor-default" : "cursor-pointer",
                      isPrimary ? "bg-red-500 hover:bg-red-600" : isSecondary ? "bg-blue-500 hover:bg-blue-600" : isNight ? "bg-slate-200 hover:bg-slate-300" : isWeekend ? "bg-amber-50 hover:bg-amber-100" : "bg-background hover:bg-muted",
                      i % 2 === 1 ? "border-r-muted-foreground/30" : "border-r-muted/30"
                    )}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

