import React, { useState, useCallback, useRef, useEffect } from "react";
import { type WeeklySchedule } from "@/types";
import { cn } from "@/lib/utils";

interface Props {
  value?: WeeklySchedule[];
  onChange: (value: WeeklySchedule[]) => void;
}

const DAYS = ["월", "화", "수", "목", "금", "토", "일"] as const;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const SLOTS_PER_HOUR = 2; // 30분 단위

export const WeeklySchedulePicker: React.FC<Props> = ({ value = [], onChange }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragType, setDragType] = useState<"select" | "deselect" | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const getInitialSchedule = (): Record<string, Set<number>> => {
    const schedule: Record<string, Set<number>> = {};
    DAYS.forEach((day) => {
      const found = value.find((v) => v.day === day);
      schedule[day] = new Set(found ? found.slots : []);
    });
    return schedule;
  };

  const [schedule, setSchedule] = useState<Record<string, Set<number>>>(getInitialSchedule);

  useEffect(() => {
    setSchedule(getInitialSchedule());
  }, [value]);

  const toggleSlot = useCallback((day: string, slot: number, type?: "select" | "deselect") => {
    setSchedule((prev) => {
      const next = { ...prev };
      const daySlots = new Set(next[day]);
      
      const shouldSelect = type === "select" || (type === undefined && !daySlots.has(slot));
      
      if (shouldSelect) {
        daySlots.add(slot);
      } else {
        daySlots.delete(slot);
      }
      
      next[day] = daySlots;
      
      // Update parent
      const updatedValue: WeeklySchedule[] = DAYS.map((d) => ({
        day: d,
        slots: Array.from(next[d]).sort((a, b) => a - b),
      })).filter(v => v.slots.length > 0);
      
      onChange(updatedValue);
      return next;
    });
  }, [onChange]);

  const handleMouseDown = (day: string, slot: number) => {
    setIsDragging(true);
    const isSelected = schedule[day].has(slot);
    const type = isSelected ? "deselect" : "select";
    setDragType(type);
    toggleSlot(day, slot, type);
  };

  const handleMouseEnter = (day: string, slot: number) => {
    if (isDragging && dragType) {
      toggleSlot(day, slot, dragType);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragType(null);
  };

  useEffect(() => {
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, []);

  return (
    <div className="flex flex-col space-y-2 select-none overflow-x-auto pb-4" ref={containerRef}>
      <div className="flex border-b pb-2">
        <div className="w-12 flex-shrink-0" />
        {HOURS.map((hour) => (
          <div key={hour} className="flex-1 text-[10px] text-center text-muted-foreground min-w-[30px]">
            {hour}
          </div>
        ))}
      </div>
      
      {DAYS.map((day) => (
        <div key={day} className="flex items-center h-8">
          <div className="w-12 flex-shrink-0 font-medium text-sm">{day}</div>
          <div className="flex flex-1 border rounded overflow-hidden h-full">
            {Array.from({ length: 24 * SLOTS_PER_HOUR }, (_, i) => (
              <div
                key={i}
                onMouseDown={() => handleMouseDown(day, i)}
                onMouseEnter={() => handleMouseEnter(day, i)}
                className={cn(
                  "flex-1 border-r last:border-r-0 cursor-pointer transition-colors min-w-[15px]",
                  schedule[day].has(i) ? "bg-primary" : "bg-background hover:bg-muted",
                  i % 2 === 1 ? "border-r-muted-foreground/30" : "border-r-muted/30"
                )}
              />
            ))}
          </div>
        </div>
      ))}
      
      <div className="flex justify-end space-x-4 pt-2 text-xs text-muted-foreground">
        <div className="flex items-center">
          <div className="w-3 h-3 bg-primary rounded mr-1" /> 선택됨
        </div>
        <div className="flex items-center">
          <div className="w-3 h-3 bg-background border rounded mr-1" /> 선택안됨
        </div>
      </div>
    </div>
  );
};
