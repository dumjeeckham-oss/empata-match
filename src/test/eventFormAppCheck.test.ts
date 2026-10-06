import { deleteApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from "firebase/auth";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { describe, expect, it } from "vitest";

const enabled = process.env.EXPECT_APP_CHECK_ENFORCED === "true" && Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);

describe.skipIf(!enabled)("행사 폼 App Check 강제 모드", () => {
  it("유효한 Auth만 있고 App Check 토큰이 없으면 관리자 callable을 차단한다", async () => {
    const projectId = "demo-dongbaek-forms";
    const app = initializeApp({ projectId, apiKey: "demo-key", authDomain: `${projectId}.firebaseapp.com` }, `app-check-${Date.now()}`);
    try {
      const auth = getAuth(app);
      connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
      await createUserWithEmailAndPassword(auth, `app-check-${Date.now()}@example.test`, "emulator-only-password");
      const functions = getFunctions(app, "asia-northeast3");
      connectFunctionsEmulator(functions, "127.0.0.1", 5001);
      await expect(httpsCallable(functions, "createEventForm")({ title: "차단되어야 함" })).rejects.toMatchObject({ code: "functions/unauthenticated" });
    } finally {
      await deleteApp(app);
    }
  }, 30_000);
});
