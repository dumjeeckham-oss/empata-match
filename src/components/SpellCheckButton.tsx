import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  applyAllSpellSuggestions,
  getSpellCheckErrorMessage,
  hasSpellCheckCredentials,
  replaceSpellSuggestion,
  requestSpellCheck,
  setRuntimeSpellCheckApiKey,
  type SpellSuggestion,
} from "@/lib/spellCheck";

interface SpellCheckButtonProps {
  value: string;
  onApply: (value: string) => void;
}

export function SpellCheckButton({ value, onApply }: SpellCheckButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checkedText, setCheckedText] = useState("");
  const [suggestions, setSuggestions] = useState<SpellSuggestion[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [needsApiKey, setNeedsApiKey] = useState(false);

  const check = async (apiKeyOverride = "") => {
    setOpen(true);
    setError("");
    setSuggestions([]);
    if (!value.trim()) {
      setError("검사할 내용을 먼저 입력해주세요.");
      return;
    }
    if (!hasSpellCheckCredentials() && !apiKeyOverride.trim()) {
      setNeedsApiKey(true);
      setError("바른 AI API 키가 필요합니다. 키는 현재 화면의 메모리에만 보관되며 저장되지 않습니다.");
      return;
    }
    if (apiKeyOverride.trim()) setRuntimeSpellCheckApiKey(apiKeyOverride);
    setNeedsApiKey(false);
    setCheckedText(value);
    setLoading(true);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 12000);
    try {
      setSuggestions(await requestSpellCheck(value, controller.signal, apiKeyOverride));
    } catch (requestError) {
      setError(getSpellCheckErrorMessage(requestError));
      if ((requestError instanceof Error ? requestError.message : String(requestError)).includes("AUTH")) setNeedsApiKey(true);
    } finally {
      window.clearTimeout(timer);
      setLoading(false);
    }
  };

  const applyOne = (suggestion: SpellSuggestion, candidate: string) => {
    onApply(replaceSpellSuggestion(checkedText, suggestion, candidate));
    setOpen(false);
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void check()}>
        <Sparkles className="mr-1 h-4 w-4 text-amber-500" />✨ 맞춤법 검사
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>맞춤법 검사 결과</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">검사 버튼을 누른 이 입력란의 내용만 맞춤법 검사 서버로 전송됩니다.</p>
          {needsApiKey && <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <Label htmlFor="bareun-api-key">바른 AI API 키</Label>
            <Input id="bareun-api-key" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="koba-..." autoComplete="off" />
            <p className="text-xs text-muted-foreground">API 키는 브라우저 저장소나 문서에 저장하지 않고 현재 실행 중인 화면에서만 사용합니다.</p>
            <Button type="button" size="sm" disabled={!apiKey.trim() || loading} onClick={() => void check(apiKey)}>키 입력 후 검사</Button>
          </div>}
          {loading ? <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />문장을 검사하고 있습니다.</div>
            : error ? <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</p>
            : suggestions.length === 0 ? <p className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-700">교정할 내용을 찾지 못했습니다.</p>
            : <div className="space-y-3">{suggestions.map((suggestion, index) => (
              <div key={suggestion.start + "-" + suggestion.end + "-" + index} className="rounded-lg border p-3">
                <p className="text-sm"><mark className="rounded bg-rose-100 px-1 text-rose-800">{suggestion.text}</mark></p>
                {suggestion.description && <p className="mt-1 text-xs text-muted-foreground">{suggestion.description}</p>}
                <div className="mt-2 flex flex-wrap gap-2">{suggestion.candidates.map((candidate) => <Button key={candidate} type="button" size="sm" variant="secondary" onClick={() => applyOne(suggestion, candidate)}>{candidate} 적용</Button>)}</div>
              </div>
            ))}</div>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>닫기</Button>
            {!loading && suggestions.length > 0 && <Button type="button" onClick={() => { onApply(applyAllSpellSuggestions(checkedText, suggestions)); setOpen(false); }}>전체 교정 적용</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}