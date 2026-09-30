import { afterAll, describe, expect, it } from "vitest";
import { signOut } from "firebase/auth";
import { ensureAnonymousEventFormUser, publicEventFormAuth } from "@/lib/eventFormPublicFirebase";

const emulatorAvailable = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);

describe.skipIf(!emulatorAvailable)("Spark 공개 폼 Anonymous Auth", () => {
  afterAll(async () => { await signOut(publicEventFormAuth); });

  it("로그인 화면 없이 별도 공개 앱에서 익명 사용자를 자동 생성한다", async () => {
    const user = await ensureAnonymousEventFormUser();
    expect(user.isAnonymous).toBe(true);
    expect(publicEventFormAuth.currentUser?.uid).toBe(user.uid);
  });
});
