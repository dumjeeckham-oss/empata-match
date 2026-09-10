import { describe, expect, it } from "vitest";
import { applyAllSpellSuggestions, buildRevisionSuggestion, replaceSpellSuggestion, type SpellSuggestion } from "@/lib/spellCheck";

const first: SpellSuggestion = { description: "", start: 0, end: 3, text: "abc", candidates: ["ABC"] };

describe("spell check replacements", () => {
  it("replaces one selected suggestion", () => {
    expect(replaceSpellSuggestion("abc def", first, "ABC")).toBe("ABC def");
  });
  it("converts Bareun revised text into an applicable suggestion", () => {
    expect(buildRevisionSuggestion("되서", "돼서")).toEqual([{ description: "바른 AI 전체 문장 교정 결과", start: 0, end: 2, text: "되서", candidates: ["돼서"] }]);
  });  it("applies suggestions from the end so offsets stay valid", () => {
    const second: SpellSuggestion = { description: "", start: 4, end: 7, text: "def", candidates: ["DEF"] };
    expect(applyAllSpellSuggestions("abc def", [first, second])).toBe("ABC DEF");
  });
});
