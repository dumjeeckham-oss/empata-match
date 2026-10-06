// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInAnonymously, signOut } from "firebase/auth";

const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const apps: FirebaseApp[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(app => deleteApp(app))); });
describe.skipIf(!host)("손글씨 demo Auth claim contract", () => {
  function demoAuth() {
    const app = initializeApp({ projectId: "demo-dongbaek-forms", apiKey: "demo-key" }, `handwriting-auth-${crypto.randomUUID()}`);
    apps.push(app);
    const auth = getAuth(app);
    connectAuthEmulator(auth, `http://${host}`, { disableWarnings: true });
    return auth;
  }
  it("익명 로그인은 staff claim이 없고 로그아웃할 수 있다", async () => {
    const auth = demoAuth();
    const { user } = await signInAnonymously(auth);
    expect((await user.getIdTokenResult()).claims.role).toBeUndefined();
    await signOut(auth);
    expect(auth.currentUser).toBeNull();
  });
  it.each(["admin", "social_worker"])("실제 SDK getIdTokenResult에서 demo %s claim을 읽는다", async role => {
    const { user } = await signInAnonymously(demoAuth());
    const response = await fetch(`http://${host}/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-key`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer owner" },
      body: JSON.stringify({ localId: user.uid, customAttributes: JSON.stringify({ role }) }),
    });
    expect(response.ok).toBe(true);
    expect((await user.getIdTokenResult(true)).claims.role).toBe(role);
  });
});
