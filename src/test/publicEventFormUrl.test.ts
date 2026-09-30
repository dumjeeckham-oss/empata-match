import { describe, expect, it } from "vitest";
import { createPublicEventFormUrl, resolvePublicFormRouterMode } from "@/lib/publicEventFormUrl";

describe("행사·교육 공개 폼 공유 주소", () => {
  it("HashRouter에서는 해시 경로를 생성한다", () => {
    expect(createPublicEventFormUrl("public-token", {
      origin: "https://admin.dong100.org",
      routerMode: "hash",
    })).toBe("https://admin.dong100.org/#/forms/public-token");
  });

  it("BrowserRouter에서는 일반 경로를 생성한다", () => {
    expect(createPublicEventFormUrl("public-token", {
      origin: "https://forms.dong100.org/",
      routerMode: "browser",
    })).toBe("https://forms.dong100.org/forms/public-token");
  });

  it("token을 URL 세그먼트로 안전하게 인코딩한다", () => {
    expect(createPublicEventFormUrl("행사/교육 ?#", {
      origin: "https://admin.dong100.org",
      routerMode: "hash",
    })).toBe(`https://admin.dong100.org/#/forms/${encodeURIComponent("행사/교육 ?#")}`);
  });

  it("token 또는 origin이 없거나 token을 인코딩할 수 없으면 링크를 만들지 않는다", () => {
    expect(createPublicEventFormUrl(undefined, { origin: "https://admin.dong100.org" })).toBeNull();
    expect(createPublicEventFormUrl("   ", { origin: "https://admin.dong100.org" })).toBeNull();
    expect(createPublicEventFormUrl("token", { origin: "" })).toBeNull();
    expect(createPublicEventFormUrl("\uD800", { origin: "https://admin.dong100.org" })).toBeNull();
  });

  it("설정값이 browser일 때만 BrowserRouter로 판정하고 기본은 HashRouter로 유지한다", () => {
    expect(resolvePublicFormRouterMode("browser")).toBe("browser");
    expect(resolvePublicFormRouterMode("hash")).toBe("hash");
    expect(resolvePublicFormRouterMode(undefined)).toBe("hash");
  });
});
