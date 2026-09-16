export interface SpellSuggestion {
  description: string;
  start: number;
  end: number;
  text: string;
  candidates: string[];
}

const SPELL_CHECK_ENDPOINT = "https://speller.town";

export async function requestSpellCheck(text: string, signal?: AbortSignal): Promise<SpellSuggestion[]> {
  const response = await fetch(SPELL_CHECK_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal,
  });
  if (!response.ok) throw new Error(`SPELL_CHECK_HTTP_${response.status}`);
  const body = await response.json() as { suggestions?: unknown };
  if (!Array.isArray(body.suggestions)) throw new Error("SPELL_CHECK_INVALID_RESPONSE");
  return body.suggestions.filter((item): item is SpellSuggestion => {
    if (!item || typeof item !== "object") return false;
    const value = item as Partial<SpellSuggestion>;
    return typeof value.start === "number" && typeof value.end === "number"
      && typeof value.text === "string" && Array.isArray(value.candidates)
      && value.candidates.every((candidate) => typeof candidate === "string");
  });
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
