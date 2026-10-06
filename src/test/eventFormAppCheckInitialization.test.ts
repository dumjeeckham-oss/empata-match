import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const appCheckMocks = vi.hoisted(() => ({
  defaultApp: { name: "[DEFAULT]" },
  publicApp: { name: "event-form-public" },
  initialize: vi.fn(),
  providerKeys: [] as string[],
}));

vi.mock("firebase/app-check", () => ({
  initializeAppCheck: appCheckMocks.initialize,
  ReCaptchaEnterpriseProvider: class {
    constructor(siteKey: string) { appCheckMocks.providerKeys.push(siteKey); }
  },
}));
vi.mock("firebase/app", () => ({ getApp: () => appCheckMocks.defaultApp }));
vi.mock("@/lib/firebase", () => ({ usingFirebaseEmulators: false }));
vi.mock("@/lib/eventFormPublicFirebase", () => ({ getPublicEventFormApp: () => appCheckMocks.publicApp }));

describe("행사 폼 App Check 초기화", () => {
  beforeEach(() => {
    vi.resetModules();
    appCheckMocks.initialize.mockReset();
    appCheckMocks.providerKeys.length = 0;
  });

  afterEach(() => { vi.unstubAllEnvs(); });

  it("site key가 없으면 초기화를 생략한다", async () => {
    vi.stubEnv("VITE_APP_CHECK_SITE_KEY", "");
    const { initializeEventFormAppCheck } = await import("@/lib/appCheck");
    initializeEventFormAppCheck();
    expect(appCheckMocks.initialize).not.toHaveBeenCalled();
  });

  it("site key가 있으면 기본 앱과 공개 앱을 각각 한 번만 초기화한다", async () => {
    vi.stubEnv("VITE_APP_CHECK_SITE_KEY", "test-public-site-key");
    const { initializeEventFormAppCheck } = await import("@/lib/appCheck");
    initializeEventFormAppCheck();
    initializeEventFormAppCheck();
    expect(appCheckMocks.initialize).toHaveBeenCalledTimes(2);
    expect(appCheckMocks.initialize.mock.calls.map(([app]) => app)).toEqual([appCheckMocks.defaultApp, appCheckMocks.publicApp]);
    expect(appCheckMocks.providerKeys).toEqual(["test-public-site-key", "test-public-site-key"]);
  });

  it("GitHub Pages 빌드에 Repository Variable을 전달한다", () => {
    const workflow = readFileSync(".github/workflows/deploy.yml", "utf8");
    expect(workflow).toContain("VITE_APP_CHECK_SITE_KEY: ${{ vars.VITE_APP_CHECK_SITE_KEY }}");
  });
});
