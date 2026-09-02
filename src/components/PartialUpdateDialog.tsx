import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { parsePasteData, parseSpreadsheetFile, normalizePhone, type ParsedSheet } from "@/lib/bulkUpload";
import { toast } from "@/hooks/use-toast";
import { FileSpreadsheet, Upload } from "lucide-react";

type ExistingItem = { id: string; name?: string; phone?: string };

type PartialFieldConfig<T> = {
  key: keyof T & string;
  label: string;
  aliases: string[];
  parse?: (value: string) => unknown;
  allowBlank?: boolean;
};

type PreviewRow<T> = {
  rowNumber: number;
  name: string;
  phone: string;
  target?: ExistingItem;
  updates: Partial<T>;
  updateLabels: string[];
  error?: string;
};

interface PartialUpdateDialogProps<T extends ExistingItem> {
  title: string;
  triggerLabel?: string;
  existing: T[];
  fields: PartialFieldConfig<T>[];
  onUpdate: (id: string, updates: Partial<T>) => Promise<unknown>;
}

const normalizeHeader = (value: string) => String(value || "").replace(/^\uFEFF/, "").replace(/[\s_\-()/·.]/g, "").toLowerCase();
const phoneLast4 = (value: unknown) => normalizePhone(value).slice(-4);
const parseBoolean = (value: string) => /^(예|y|yes|true|1|미검진)$/i.test(String(value || "").trim());
const parseNumber = (value: string) => {
  const number = Number(String(value || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(number) ? number : undefined;
};
const todayYmd = () => {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const parseDate = (value: string) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const korean = raw.match(/^(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일?$/);
  if (korean) {
    const [, y, m, d] = korean;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const match = raw.match(/^(\d{4})[-./\s]?(\d{1,2})[-./\s]?(\d{1,2})$/);
  if (!match) return raw;
  const [, y, m, d] = match;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
};
const parseExamDate = (value: string) => {
  const raw = String(value || "").trim();
  if (/^(검진|완료|검진완료|수검|수검완료|예|y|yes|true|1|o|ok)$/i.test(raw)) return todayYmd();
  if (/^(미검진|미완료|아니오|n|no|false|0|x)$/i.test(raw)) return "";
  return parseDate(raw);
};
const parseList = (value: string) =>
  String(value || "")
    .split(/[,，、/|]/)
    .map((item) => item.trim())
    .filter(Boolean);

export const partialParsers = {
  boolean: parseBoolean,
  number: parseNumber,
  date: parseDate,
  examDate: parseExamDate,
  list: parseList,
};

export function PartialUpdateDialog<T extends ExistingItem>({
  title,
  triggerLabel = "일괄 정보 업데이트 (Excel/CSV)",
  existing,
  fields,
  onUpdate,
}: PartialUpdateDialogProps<T>) {
  const [open, setOpen] = useState(false);
  const [pasteData, setPasteData] = useState("");
  const [previewRows, setPreviewRows] = useState<PreviewRow<T>[]>([]);
  const [headerSearch, setHeaderSearch] = useState("");
  const [updating, setUpdating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setPasteData("");
    setPreviewRows([]);
    setHeaderSearch("");
  };

  const findHeaderIndex = (headers: string[], aliases: string[]) => {
    const normalizedAliases = aliases.map(normalizeHeader);
    return headers.findIndex((header) => normalizedAliases.includes(normalizeHeader(header)));
  };

  const findTarget = (name: string, phone: string) => {
    const normalizedName = String(name || "").trim();
    const normalizedPhone = normalizePhone(phone);
    const last4 = phoneLast4(phone);
    return existing.find((item) => {
      if (String(item.name || "").trim() !== normalizedName) return false;
      const itemPhone = normalizePhone(item.phone);
      if (normalizedPhone && itemPhone === normalizedPhone) return true;
      return !!last4 && itemPhone.endsWith(last4);
    });
  };

  const buildPreview = useCallback((sheet: ParsedSheet) => {
    const nameIndex = findHeaderIndex(sheet.headers, ["이름", "성명", "name"]);
    const phoneIndex = findHeaderIndex(sheet.headers, ["연락처", "전화", "휴대폰", "phone", "뒤4자리", "전화뒤4자리"]);
    if (nameIndex < 0) {
      toast({ title: "이름 열이 필요합니다", description: "이름/성명/name 중 하나의 헤더가 있어야 합니다.", variant: "destructive" });
      return;
    }

    const rows = sheet.rows
      .filter((row) => row.some((cell) => String(cell || "").trim()))
      .map((row, index) => {
        const name = String(row[nameIndex] || "").trim();
        const phone = phoneIndex >= 0 ? String(row[phoneIndex] || "").trim() : "";
        const target = findTarget(name, phone);
        const updates: Partial<T> = {};
        const updateLabels: string[] = [];

        fields.forEach((field) => {
          const idx = findHeaderIndex(sheet.headers, [field.label, field.key, ...field.aliases]);
          if (idx < 0) return;
          const raw = String(row[idx] ?? "").trim();
          if (raw === "" && !field.allowBlank) return;
          (updates as Record<string, unknown>)[field.key] = field.parse ? field.parse(raw) : raw;
          updateLabels.push(field.label);
        });

        return {
          rowNumber: index + 2,
          name,
          phone,
          target,
          updates,
          updateLabels,
          error: !name ? "이름 없음" : !target ? "대상 미확인" : updateLabels.length === 0 ? "업데이트 컬럼 없음" : undefined,
        };
      });

    setPreviewRows(rows);
    const matched = rows.filter((row) => row.target && !row.error).length;
    const failed = rows.length - matched;
    toast({ title: `업데이트 대상 ${matched}명`, description: failed ? `식별 실패/제외 ${failed}건` : "모든 행이 식별되었습니다." });
  }, [existing, fields]);

  const handleFile = async (file: File) => buildPreview(await parseSpreadsheetFile(file));
  const handlePastePreview = () => pasteData.trim() && buildPreview(parsePasteData(pasteData));

  const handleConfirm = async () => {
    const targets = previewRows.filter((row) => row.target?.id && !row.error);
    if (targets.length === 0) {
      toast({ title: "업데이트 대상이 없습니다", variant: "destructive" });
      return;
    }
    setUpdating(true);
    try {
      for (const row of targets) {
        await onUpdate(row.target!.id, row.updates);
      }
      toast({ title: "일괄 업데이트 완료", description: `${targets.length}명 정보가 부분 업데이트되었습니다.` });
      reset();
      setOpen(false);
    } finally {
      setUpdating(false);
    }
  };

  const matchedCount = previewRows.filter((row) => row.target && !row.error).length;
  const failedCount = previewRows.length - matchedCount;
  const headerGuideRows = fields
    .map((field) => ({
      label: field.label,
      aliases: [field.label, field.key, ...field.aliases].filter(Boolean),
    }))
    .filter((field) => {
      const query = headerSearch.trim().toLowerCase();
      if (!query) return true;
      return [field.label, ...field.aliases].some((value) => String(value).toLowerCase().includes(query));
    });
  const sampleHeaders = ["이름", "연락처", ...fields.slice(0, 4).map((field) => field.label)].join(",");
  const copyHeaderSample = async () => {
    try {
      await navigator.clipboard.writeText(sampleHeaders);
      toast({ title: "헤더 예시 복사", description: "CSV 첫 줄에 붙여넣어 사용할 수 있습니다." });
    } catch {
      toast({ title: "복사 실패", description: "헤더 예시를 직접 선택해 복사해 주세요.", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) reset(); }}>
      <DialogTrigger asChild><Button variant="outline" size="sm">{triggerLabel}</Button></DialogTrigger>
      <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] overflow-y-auto" onPointerDownOutside={(event) => event.preventDefault()}>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">이름과 연락처 전체 또는 뒤 4자리로 기존 대상을 찾고, 엑셀/CSV에 포함된 컬럼만 덮어씁니다. 파일 업로드와 붙여넣기 모두 탭/쉼표 구분 데이터를 지원합니다.</p>
          <div className="rounded-md border bg-muted/20 p-3 space-y-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold">CSV 헤더 안내</p>
                <p className="text-xs text-muted-foreground">수정하려는 항목명을 검색해 CSV 첫 줄에 사용할 수 있는 헤더명을 확인하세요.</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={copyHeaderSample}>헤더 예시 복사</Button>
            </div>
            <Input value={headerSearch} onChange={(e) => setHeaderSearch(e.target.value)} placeholder="예: 검진, 주소, 연락처, 이수증, 상태" />
            <div className="max-h-40 overflow-auto rounded border bg-background">
              <table className="w-full min-w-[640px] text-xs">
                <thead className="sticky top-0 bg-muted"><tr><th className="p-2 text-left">수정 항목</th><th className="p-2 text-left">인식되는 헤더 예시</th></tr></thead>
                <tbody>
                  {headerGuideRows.length === 0 ? (
                    <tr><td colSpan={2} className="p-3 text-center text-muted-foreground">검색된 헤더가 없습니다.</td></tr>
                  ) : headerGuideRows.map((field) => (
                    <tr key={field.label} className="border-t"><td className="p-2 font-medium">{field.label}</td><td className="p-2 text-muted-foreground">{field.aliases.join(", ")}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="rounded bg-background p-2 font-mono text-xs text-muted-foreground">예시: {sampleHeaders}</p>
          </div>
          <div className="rounded-lg border-2 border-dashed p-5 text-center">
            <FileSpreadsheet className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFile(file); e.target.value = ""; }} />
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}><Upload className="mr-1 h-4 w-4" />파일 선택</Button>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">또는 엑셀에서 복사한 데이터 붙여넣기</p>
            <Textarea className="min-h-[110px] font-mono text-xs" value={pasteData} onChange={(e) => setPasteData(e.target.value)} placeholder="이름, 연락처, 수정할 컬럼 헤더를 포함해 붙여넣기 (탭 또는 쉼표 구분)" />
            <Button variant="secondary" size="sm" onClick={handlePastePreview} disabled={!pasteData.trim()}>붙여넣기 미리보기</Button>
          </div>
          {previewRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2"><Badge>업데이트 대상 {matchedCount}명</Badge><Badge variant="secondary">식별 실패/제외 {failedCount}건</Badge></div>
              <div className="max-h-[320px] overflow-auto rounded-md border">
                <table className="w-full min-w-[720px] text-xs">
                  <thead className="sticky top-0 bg-muted"><tr><th className="p-2 text-left">행</th><th className="p-2 text-left">이름</th><th className="p-2 text-left">연락처</th><th className="p-2 text-left">상태</th><th className="p-2 text-left">업데이트 컬럼</th></tr></thead>
                  <tbody>{previewRows.map((row) => <tr key={row.rowNumber} className="border-t"><td className="p-2">{row.rowNumber}</td><td className="p-2 font-medium">{row.name || "-"}</td><td className="p-2">{row.phone || "뒤4자리/미입력"}</td><td className="p-2"><Badge variant={row.error ? "secondary" : "default"}>{row.error || "업데이트 가능"}</Badge></td><td className="p-2">{row.updateLabels.join(", ") || "-"}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setOpen(false)}>취소</Button><Button onClick={handleConfirm} disabled={matchedCount === 0 || updating}>{updating ? "업데이트 중..." : "확인 후 업데이트"}</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}








