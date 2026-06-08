import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronUp, ChevronDown } from "lucide-react";

interface TimePickerProps {
  value: string;
  onChange: (time: string) => void;
  label?: string;
  placeholder?: string;
}

/**
 * 마우스 중심의 시간 피커 컴포넌트
 * - 마우스 클릭으로 시간과 분을 쉽게 선택
 * - HH:mm 형식으로 키보드 타이핑을 통해 수동 입력도 지원
 */
export const TimePicker = ({ value, onChange, label = "시간 선택", placeholder = "09:00" }: TimePickerProps) => {
  const [hour, setHour] = useState<number>(0);
  const [minute, setMinute] = useState<number>(0);
  const [isOpen, setIsOpen] = useState(false);
  const [manualInput, setManualInput] = useState<string>(value);
  const containerRef = useRef<HTMLDivElement>(null);

  // 초기값 파싱
  useEffect(() => {
    if (value) {
      const [h, m] = value.split(":").map(Number);
      if (!isNaN(h) && !isNaN(m)) {
        setHour(h);
        setMinute(m);
        setManualInput(value);
      }
    }
  }, [value]);

  /**
   * 시간과 분을 HH:mm 형식으로 포맷
   */
  const formatTime = (h: number, m: number): string => {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  /**
   * 시간 값 업데이트
   */
  const updateTime = (newHour: number, newMinute: number) => {
    const h = Math.max(0, Math.min(23, newHour));
    const m = Math.max(0, Math.min(59, newMinute));
    setHour(h);
    setMinute(m);
    const formatted = formatTime(h, m);
    setManualInput(formatted);
    onChange(formatted);
  };

  /**
   * 수동 입력 처리
   */
  const handleManualInput = (text: string) => {
    setManualInput(text);

    // HH:mm 형식 검증
    const match = text.match(/^(\d{1,2}):(\d{1,2})$/);
    if (match) {
      const h = Number(match[1]);
      const m = Number(match[2]);
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        setHour(h);
        setMinute(m);
        onChange(formatTime(h, m));
      }
    }
  };

  /**
   * 시간 증가
   */
  const incrementHour = () => {
    updateTime(hour + 1, minute);
  };

  /**
   * 시간 감소
   */
  const decrementHour = () => {
    updateTime(hour - 1, minute);
  };

  /**
   * 분 증가 (5분 단위)
   */
  const incrementMinute = () => {
    updateTime(hour, minute + 5);
  };

  /**
   * 분 감소 (5분 단위)
   */
  const decrementMinute = () => {
    updateTime(hour, minute - 5);
  };

  /**
   * 클릭 외부 감지
   */
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div className="space-y-2" ref={containerRef}>
      <Label>{label}</Label>

      {/* 시간 입력 필드 */}
      <div className="relative">
        <Input
          type="text"
          value={manualInput}
          onChange={(e) => handleManualInput(e.target.value)}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="text-center text-lg font-mono font-semibold"
          maxLength={5}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setIsOpen(!isOpen)}
          className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
        >
          🕐
        </Button>
      </div>

      {/* 시간 피커 팝업 */}
      {isOpen && (
        <div className="absolute z-50 mt-1 p-4 border rounded-lg bg-background shadow-lg">
          <div className="flex gap-4 items-center">
            {/* 시간 선택 */}
            <div className="flex flex-col items-center gap-2">
              <Label className="text-xs font-semibold">시간</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={incrementHour}
                className="h-8 w-8 p-0"
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              <div className="text-2xl font-bold font-mono w-12 text-center">
                {String(hour).padStart(2, "0")}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={decrementHour}
                className="h-8 w-8 p-0"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>

            {/* 구분선 */}
            <div className="text-2xl font-bold">:</div>

            {/* 분 선택 */}
            <div className="flex flex-col items-center gap-2">
              <Label className="text-xs font-semibold">분</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={incrementMinute}
                className="h-8 w-8 p-0"
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              <div className="text-2xl font-bold font-mono w-12 text-center">
                {String(minute).padStart(2, "0")}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={decrementMinute}
                className="h-8 w-8 p-0"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* 빠른 선택 버튼 */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            {["09:00", "12:00", "14:00", "16:00", "18:00", "20:00"].map((t) => (
              <Button
                key={t}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const [h, m] = t.split(":").map(Number);
                  updateTime(h, m);
                  setIsOpen(false);
                }}
                className="text-xs"
              >
                {t}
              </Button>
            ))}
          </div>

          {/* 확인 버튼 */}
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => setIsOpen(false)}
            className="w-full mt-3"
          >
            확인
          </Button>
        </div>
      )}
    </div>
  );
};
