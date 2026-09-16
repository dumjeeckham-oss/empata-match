export interface SpellSuggestion {
  description: string;
  start: number;
  end: number;
  text: string;
  candidates: string[];
}

const OFFICIAL_BAREUN_ENDPOINT = "https://api.bareun.ai/bareun.RevisionService/CorrectError";
let runtimeApiKey = "";

export function setRuntimeSpellCheckApiKey(apiKey: string): void {
  runtimeApiKey = apiKey.trim();
}

export function hasSpellCheckCredentials(): boolean {
  return Boolean(runtimeApiKey || import.meta.env.VITE_BAREUN_API_KEY || import.meta.env.VITE_SPELL_CHECK_ENDPOINT);
}

export function buildRevisionSuggestion(origin: string, revised: string): SpellSuggestion[] {
  if (!revised || revised === origin) return [];
  return [{ description: "바른 AI 전체 문장 교정 결과", start: 0, end: origin.length, text: origin, candidates: [revised] }];
}

const LOCAL_SPELL_RULES: Array<{ pattern: RegExp; replacement: string; description: string }> = [
  { pattern: /되요/g, replacement: "돼요", description: "오프라인 기본 교정: 되어요의 준말은 '돼요'입니다." },
  { pattern: /안되(?=[가-힣]|\s|[.,!?]|$)/g, replacement: "안 돼", description: "오프라인 기본 교정: 부정 표현의 띄어쓰기를 확인했습니다." },
  { pattern: /할수/g, replacement: "할 수", description: "오프라인 기본 교정: 의존 명사 '수'를 띄어 씁니다." },
  { pattern: /할때/g, replacement: "할 때", description: "오프라인 기본 교정: 의존 명사 '때'를 띄어 씁니다." },
  { pattern: /\s+([,.!?])/g, replacement: "$1", description: "오프라인 기본 교정: 문장부호 앞 공백을 제거합니다." },
];

export function buildLocalSpellSuggestions(origin: string): SpellSuggestion[] {
  const suggestions: SpellSuggestion[] = [];
  for (const rule of LOCAL_SPELL_RULES) {
    for (const match of origin.matchAll(rule.pattern)) {
      if (match.index === undefined) continue;
      const replacement = match[0].replace(rule.pattern, rule.replacement);
      if (!replacement || replacement === match[0]) continue;
      suggestions.push({
        description: rule.description,
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
        candidates: [replacement],
      });
    }
  }
  return suggestions
    .sort((a, b) => a.start - b.start)
    .filter((item, index, items) => index === 0 || item.start >= items[index - 1].end);
}
async function parseSpellResponse(response: Response, origin: string): Promise<SpellSuggestion[]> {
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error("SPELL_CHECK_AUTH");
    if (response.status === 429) throw new Error("SPELL_CHECK_RATE_LIMIT");
    throw new Error("SPELL_CHECK_HTTP_" + response.status);
  }
  const body = await response.json() as { suggestions?: unknown; revised?: unknown };
  if (Array.isArray(body.suggestions)) {
    return body.suggestions.filter((item): item is SpellSuggestion => {
      if (!item || typeof item !== "object") return false;
      const value = item as Partial<SpellSuggestion>;
      return typeof value.start === "number" && typeof value.end === "number"
        && typeof value.text === "string" && Array.isArray(value.candidates)
        && value.candidates.every((candidate) => typeof candidate === "string");
    });
  }
  if (typeof body.revised === "string") return buildRevisionSuggestion(origin, body.revised);
  throw new Error("SPELL_CHECK_INVALID_RESPONSE");
}

export async function requestSpellCheck(text: string, signal?: AbortSignal, apiKeyOverride?: string): Promise<SpellSuggestion[]> {
  const proxyEndpoint = String(import.meta.env.VITE_SPELL_CHECK_ENDPOINT || "").trim();
  const fallbackEndpoint = String(import.meta.env.VITE_SPELL_CHECK_FALLBACK_ENDPOINT || "").trim();
  const apiKey = (apiKeyOverride || runtimeApiKey || import.meta.env.VITE_BAREUN_API_KEY || "").trim();
  const attempts: Array<() => Promise<SpellSuggestion[]>> = [];

  if (proxyEndpoint) {
    attempts.push(async () => parseSpellResponse(await fetch(proxyEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal,
    }), text));
  }
  if (apiKey) {
    attempts.push(async () => parseSpellResponse(await fetch(OFFICIAL_BAREUN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": apiKey },
      body: JSON.stringify({
        document: { content: text, language: "ko-KR" },
        encoding_type: "UTF32",
      }),
      signal,
    }), text));
  }
  if (fallbackEndpoint && fallbackEndpoint !== proxyEndpoint) {
    attempts.push(async () => parseSpellResponse(await fetch(fallbackEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal,
    }), text));
  }

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (error) {
      lastError = error;
      if ((error as Error)?.name === "AbortError") break;
    }
  }
  const localSuggestions = buildLocalSpellSuggestions(text);
  if (localSuggestions.length > 0) return localSuggestions;
  if (attempts.length === 0) throw new Error("SPELL_CHECK_CONFIGURATION_MISSING");
  throw lastError instanceof Error ? lastError : new Error("SPELL_CHECK_UNAVAILABLE");
}

export function getSpellCheckErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("CONFIGURATION_MISSING")) return "바른 AI API 키가 필요합니다. 아래 입력란에 키를 입력한 뒤 다시 검사해 주세요.";
  if (message.includes("AUTH")) return "바른 AI API 키가 올바르지 않거나 사용 권한이 없습니다.";
  if (message.includes("RATE_LIMIT")) return "맞춤법 검사 사용량 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.";
  if (message.includes("Failed to fetch") || message.includes("NetworkError")) return "맞춤법 검사 서버 연결이 차단되었습니다. 네트워크 또는 CORS 허용 설정을 확인해 주세요.";
  if (message.includes("AbortError")) return "맞춤법 검사 응답 시간이 초과되었습니다.";
  return "맞춤법 검사 서버에 연결하지 못했습니다. 원문은 변경되지 않았습니다.";
}

export function replaceSpellSuggestion(text: string, suggestion: SpellSuggestion, candidate: string): string {
  return text.slice(0, suggestion.start) + candidate + text.slice(suggestion.end);
}

export function applyAllSpellSuggestions(text: string, suggestions: SpellSuggestion[]): string {
  return [...suggestions]
    .filter((item) => item.candidates[0])
    .sort((a, b) => b.start - a.start)
    .reduce((result, item) => replaceSpellSuggestion(result, item, item.candidates[0]), text);
}