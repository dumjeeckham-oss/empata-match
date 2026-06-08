import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DayPickerProps {
  value: string;
  onChange: (days: string) => void;
  label?: string;
  placeholder?: string;
}

const DAYS = ["월", "화", "수", "목", "금", "토", "일"];

/**
 * 드래그 방식의 요일 선택 UI 컴포넌트
 * - 그리드로 배치된 요일 버튼을 마우스 드래그로 선택
 * - 기존처럼 텍스트로 직접 입력도 가능 (예: "월,화,수" 또는 "월화수")
 */
export const DayPicker = ({ value, onChange, label = "요일 선택", placeholder = "월,화,수 또는 드래그로 선택" }: DayPickerProps) => {
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedDays, setSelectedDays] = useState<Set<string>>(parseSelectedDays(value));
  const containerRef = useRef<HTMLDivElement>(null);

  /**
   * 문자열 형식의 요일을 Set으로 파싱
   * "월,화,수" 또는 "월화수" 형식 모두 지원
   */
  function parseSelectedDays(input: string): Set<string> {
    if (!input) return new Set();
    const normalized = input.replace(/[,\s]/g, "");
    const days = new Set<string>();
    for (const char of normalized) {
      if (DAYS.includes(char)) {
        days.add(char);
      }
    }
    return days;
  }

  /**
   * Set을 "월,화,수" 형식의 문자열로 변환
   */
  function formatSelectedDays(days: Set<string>): string {
    const ordered = DAYS.filter((d) => days.has(d));
    return ordered.join(",");
  }

  const handleMouseDown = (day: string) => {
    setIsSelecting(true);
    const newSelected = new Set(selectedDays);
    if (newSelected.has(day)) {
      newSelected.delete(day);
    } else {
      newSelected.add(day);
    }
    setSelectedDays(newSelected);
    onChange(formatSelectedDays(newSelected));
  };

  const handleMouseEnter = (day: string) => {
    if (!isSelecting) return;
    const newSelected = new Set(selectedDays);
    if (!newSelected.has(day)) {
      newSelected.add(day);
    }
    setSelectedDays(newSelected);
    onChange(formatSelectedDays(newSelected));
  };

  const handleMouseUp = () => {
    setIsSelecting(false);
  };

  const handleTextInputChange = (text: string) => {
    const newSelected = parseSelectedDays(text);
    setSelectedDays(newSelected);
    onChange(formatSelectedDays(newSelected));
  };

  const toggleDay = (day: string) => {
    const newSelected = new Set(selectedDays);
    if (newSelected.has(day)) {
      newSelected.delete(day);
    } else {
      newSelected.add(day);
    }
    setSelectedDays(newSelected);
    onChange(formatSelectedDays(newSelected));
  };

  const clearSelection = () => {
    setSelectedDays(new Set());
    onChange("");
  };

  return (
    <div className="space-y-3">
      <Label>{label}</Label>

      {/* 텍스트 입력 필드 */}
      <Input
        type="text"
        value={formatSelectedDays(selectedDays)}
        onChange={(e) => handleTextInputChange(e.target.value)}
        placeholder={placeholder}
        className="text-sm"
      />

      {/* 드래그 방식 요일 선택 그리드 */}
      <div
        ref={containerRef}
        className="grid grid-cols-7 gap-2 p-3 border rounded-md bg-muted/30"
        onMouseLeave={handleMouseUp}
      >
        {DAYS.map((day) => (
          <button
            key={day}
            type="button"
            onMouseDown={() => handleMouseDown(day)}
            onMouseEnter={() => handleMouseEnter(day)}
            onMouseUp={handleMouseUp}
            onClick={() => toggleDay(day)}
            className={`
              py-2 px-1 rounded-md font-medium text-sm transition-all
              select-none user-select-none
              ${
                selectedDays.has(day)
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "bg-background border border-input hover:bg-muted"
              }
            `}
          >
            {day}
          </button>
        ))}
      </div>

      {/* 초기화 버튼 */}
      {selectedDays.size > 0 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={clearSelection}
          className="w-full"
        >
          초기화
        </Button>
      )}
    </div>
  );
};
