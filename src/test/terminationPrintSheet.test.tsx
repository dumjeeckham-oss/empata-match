import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TerminationPrintSheet } from "@/components/TerminationPrintSheet";
import type { TerminationDocument } from "@/types";

describe("종결승인서 인쇄", () => {
  it("기타 내용과 종결사유를 각각 해당 위치에 표시한다", () => {
    const document: TerminationDocument = {
      userId: "u", userName: "이용자", userPhone: "", date: "2026-01-01",
      reasons: ["기타"], otherReason: "기타 설명", reasonDetail: "별도 종결사유",
    };
    const html = renderToStaticMarkup(<TerminationPrintSheet document={document} address="" workerNames="" logoSrc="" />);
    expect(html).toMatch(/기타.*기타 설명/);
    expect(html).toContain("별도 종결사유");
    expect(html.indexOf("기타 설명")).toBeLessThan(html.indexOf("별도 종결사유"));
  });
});
