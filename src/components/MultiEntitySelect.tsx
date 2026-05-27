import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X } from "lucide-react";

export interface EntityOption {
  id: string;
  label: string;
  sublabel?: string;
}

interface MultiEntitySelectProps {
  label: string;
  placeholder?: string;
  options: EntityOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  emptyHint?: string;
}

export function MultiEntitySelect({
  label,
  placeholder = "추가할 항목 선택...",
  options,
  selectedIds,
  onChange,
  emptyHint = "미배정",
}: MultiEntitySelectProps) {
  const [pickId, setPickId] = useState("");

  const available = options.filter((o) => !selectedIds.includes(o.id));
  const selected = selectedIds
    .map((id) => options.find((o) => o.id === id))
    .filter(Boolean) as EntityOption[];

  const add = (id: string) => {
    if (!id || selectedIds.includes(id)) return;
    onChange([...selectedIds, id]);
    setPickId("");
  };

  const remove = (id: string) => {
    onChange(selectedIds.filter((x) => x !== id));
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold">{label}</Label>
      <div className="flex flex-wrap gap-2 min-h-[32px]">
        {selected.length === 0 ? (
          <span className="text-xs text-muted-foreground py-1">{emptyHint}</span>
        ) : (
          selected.map((item) => (
            <Badge key={item.id} variant="secondary" className="pl-2 pr-1 py-1 gap-1 text-sm">
              <span>{item.label}</span>
              {item.sublabel && <span className="text-muted-foreground text-xs">({item.sublabel})</span>}
              <button
                type="button"
                className="ml-0.5 rounded-full hover:bg-muted p-0.5"
                onClick={() => remove(item.id)}
                aria-label={`${item.label} 제거`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))
        )}
      </div>
      {available.length > 0 && (
        <div className="flex gap-2">
          <Select value={pickId || "none"} onValueChange={(v) => { if (v !== "none") add(v); }}>
            <SelectTrigger className="flex-1 h-9">
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none" disabled>{placeholder}</SelectItem>
              {available.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.label}{o.sublabel ? ` (${o.sublabel})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {selected.length > 0 && (
        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onChange([])}>
          전체 해제
        </Button>
      )}
    </div>
  );
}
