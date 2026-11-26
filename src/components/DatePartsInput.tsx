import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

type Props = { value?: string; onChange: (value: string) => void; label: string };

export function DatePartsInput({ value = "", onChange, label }: Props) {
  const split = (text: string) => text ? text.split("-") : ["", "", ""];
  const [parts, setParts] = useState(() => split(value));
  const emitted = useRef(value);

  useEffect(() => {
    if (value !== emitted.current) {
      emitted.current = value;
      setParts(split(value));
    }
  }, [value]);

  const changePart = (index: number, raw: string) => {
    const next = [...parts];
    next[index] = raw.replace(/\D/g, "").slice(0, index === 0 ? 4 : 2);
    setParts(next);
    const [year, month, day] = next;
    let result = "";
    if (year.length === 4 && month && day) {
      const date = new Date(Number(year), Number(month) - 1, Number(day));
      if (Number(year) >= 1000 && date.getFullYear() === Number(year) && date.getMonth() === Number(month) - 1 && date.getDate() === Number(day)) {
        result = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      }
    }
    emitted.current = result;
    onChange(result);
  };

  return (
    <div className="flex items-center gap-1" role="group" aria-label={label} data-date-invalid={parts.some(Boolean) && !value ? "true" : undefined}>
      {["년", "월", "일"].map((part, index) => (
        <Input key={part} type="text" inputMode="numeric" autoComplete="off" aria-label={`${label} ${part}`} placeholder={index === 0 ? "연도" : part} value={parts[index] || ""} onChange={(event) => changePart(index, event.target.value)} className={index === 0 ? "w-24" : "w-16"} />
      ))}
    </div>
  );
}
