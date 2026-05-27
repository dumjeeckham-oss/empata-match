import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  parseSpreadsheetFile,
  parsePasteData,
  rowsToEntities,
  type ParsedSheet,
  type FieldKey,
  buildHeaderMap,
} from "@/lib/bulkUpload";
import { toast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet } from "lucide-react";

interface BulkUploadDialogProps<T> {
  title: string;
  triggerLabel?: string;
  mapRows: (sheet: ParsedSheet) => T[];
  onConfirm: (items: T[]) => Promise<{ inserted: number; updated: number; skipped?: number }>;
  previewColumns: { key: FieldKey; label: string }[];
  getPreviewValue: (item: T, key: FieldKey) => string;
  guideHeaders?: string[];
}

export function BulkUploadDialog<T>({
  title,
  triggerLabel = "📤 일괄 업로드",
  mapRows,
  onConfirm,
  previewColumns,
  getPreviewValue,
  guideHeaders,
}: BulkUploadDialogProps<T>) {
  const [open, setOpen] = useState(false);
  const [pasteData, setPasteData] = useState("");
  const [previewItems, setPreviewItems] = useState<T[]>([]);
  const [rawSheet, setRawSheet] = useState<ParsedSheet | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetPreview = () => {
    setPreviewItems([]);
    setRawSheet(null);
  };

  const buildPreview = useCallback(
    (sheet: ParsedSheet) => {
      setRawSheet(sheet);
      const items = mapRows(sheet);
      setPreviewItems(items);
      if (items.length === 0) {
        toast({
          title: "미리보기 데이터 없음",
          description: "헤더와 데이터 행을 확인해 주세요.",
          variant: "destructive",
        });
      } else {
        toast({ title: `미리보기 ${items.length}건 준비됨`, description: "내용 확인 후 [최종 업로드 확정]을 눌러주세요." });
      }
    },
    [mapRows]
  );

  const handleFile = async (file: File) => {
    try {
      const sheet = await parseSpreadsheetFile(file);
      buildPreview(sheet);
    } catch {
      toast({ title: "파일 읽기 실패", variant: "destructive" });
    }
  };

  const handlePastePreview = () => {
    if (!pasteData.trim()) return;
    buildPreview(parsePasteData(pasteData));
  };

  const handleConfirm = async () => {
    if (previewItems.length === 0) {
      toast({ title: "업로드할 데이터가 없습니다", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const result = await onConfirm(previewItems);
      toast({
        title: "업로드 완료",
        description: `신규 ${result.inserted}건 · 수정 ${result.updated}건${result.skipped ? ` · 건너뜀 ${result.skipped}건` : ""}`,
      });
      setPasteData("");
      resetPreview();
      setOpen(false);
    } catch {
      toast({ title: "업로드 실패", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const displayHeaders = rawSheet?.headers.length
    ? rawSheet.headers
    : guideHeaders || previewColumns.map((c) => c.label);

  const headerMap = rawSheet ? buildHeaderMap(rawSheet.headers) : new Map<FieldKey, number>();

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setPasteData("");
          resetPreview();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">{triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-xs md:text-sm text-muted-foreground">
            엑셀(.xlsx, .xls, .csv) 파일을 선택하거나 데이터를 붙여넣으면 미리보기 표가 표시됩니다.
            헤더 명칭은 자동 인식되며, 빈 칸은 오류 없이 빈 값으로 처리됩니다.
          </p>

          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
              dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files[0];
              if (file) handleFile(file);
            }}
          >
            <FileSpreadsheet className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground mb-2">파일을 여기에 끌어다 놓거나</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = "";
              }}
            />
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-1" /> 파일 선택
            </Button>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">또는 엑셀에서 복사한 데이터 붙여넣기</p>
            <Textarea
              className="min-h-[120px] font-mono text-xs"
              placeholder="헤더 행 포함하여 붙여넣기 (Ctrl+V)..."
              value={pasteData}
              onChange={(e) => setPasteData(e.target.value)}
            />
            <Button variant="secondary" size="sm" onClick={handlePastePreview} disabled={!pasteData.trim()}>
              붙여넣기 미리보기
            </Button>
          </div>

          {previewItems.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">업로드 데이터 미리보기</h3>
                <Badge variant="secondary">{previewItems.length}건</Badge>
              </div>
              <div className="overflow-x-auto border rounded-md max-h-[320px] overflow-y-auto">
                <table className="min-w-max w-full text-[11px] md:text-xs border-collapse">
                  <thead className="sticky top-0 z-10 bg-muted">
                    <tr className="divide-x divide-border border-b">
                      <th className="p-1.5 text-center font-medium min-w-[28px]">#</th>
                      {previewColumns.map((col) => (
                        <th key={col.key} className="p-1.5 px-2 text-left font-semibold whitespace-nowrap">
                          {col.label}
                          {headerMap.has(col.key) && (
                            <span className="ml-1 text-[10px] text-primary">✓</span>
                          )}
                        </th>
                      ))}
                    </tr>
                    {rawSheet && displayHeaders.length > 0 && (
                      <tr className="divide-x divide-border border-b bg-muted/50 text-muted-foreground">
                        <th className="p-1 text-[10px]">원본</th>
                        {previewColumns.map((col) => {
                          const idx = headerMap.get(col.key);
                          return (
                            <th key={`raw-${col.key}`} className="p-1 px-2 text-left font-normal truncate max-w-[120px]">
                              {idx !== undefined ? displayHeaders[idx] : "—"}
                            </th>
                          );
                        })}
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {previewItems.map((item, i) => (
                      <tr key={i} className="divide-x divide-border border-b hover:bg-muted/20">
                        <td className="p-1.5 text-center text-muted-foreground">{i + 1}</td>
                        {previewColumns.map((col) => (
                          <td key={col.key} className="p-1.5 px-2 whitespace-nowrap max-w-[160px] truncate">
                            {getPreviewValue(item, col.key) || "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                ✓ 표시는 자동 매핑된 열입니다. 확인 후 아래 [최종 업로드 확정]을 눌러 저장하세요.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>취소</Button>
            <Button
              onClick={handleConfirm}
              disabled={previewItems.length === 0 || uploading}
            >
              {uploading ? "저장 중..." : "최종 업로드 확정"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
