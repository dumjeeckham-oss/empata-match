import { createRequire } from "node:module";
import { resolve } from "node:path";
import { deleteApp as deleteClientApp, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from "firebase/auth";
import { connectFunctionsEmulator, getFunctions, httpsCallable, type Functions } from "firebase/functions";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventFormAnswers, EventFormField } from "@/types/eventForms";

const emulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);
const projectId = "demo-dongbaek-forms";
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

type FormSetup = { formId: string; publicToken: string; roundId: string; versionId: string };

describe.skipIf(!emulatorAvailable)("행사 폼 Functions 자체 보안", () => {
  let managerApp: FirebaseApp;
  let publicApp: FirebaseApp;
  let socialWorkerApp: FirebaseApp;
  let generalApp: FirebaseApp;
  let managerFunctions: Functions;
  let publicFunctions: Functions;
  let socialWorkerFunctions: Functions;
  let generalFunctions: Functions;

  const invoke = async <T>(functions: Functions, name: string, data: unknown): Promise<T> => (await httpsCallable(functions, name)(data)).data as T;
  const phoneField: EventFormField = { id: "phone", type: "phone", title: "연락처", required: true, visible: true, order: 0 };
  const choiceField: EventFormField = {
    id: "choice",
    type: "singleChoice",
    title: "참석 여부",
    required: true,
    visible: true,
    order: 1,
    options: [{ id: "yes", label: "참석", order: 0, enabled: true }],
  };

  async function setupOpenForm(duplicatePolicy: "none" | "warn" | "block" = "none"): Promise<FormSetup> {
    const created = await invoke<{ formId: string; publicToken: string }>(managerFunctions, "createEventForm", { title: "Emulator 보안 테스트" });
    await invoke(managerFunctions, "saveEventFormDraft", {
      formId: created.formId,
      title: "Emulator 보안 테스트",
      fields: [phoneField, choiceField],
      duplicatePolicy,
      duplicateFieldId: duplicatePolicy === "none" ? undefined : "phone",
    });
    const published = await invoke<{ versionId: string }>(managerFunctions, "publishEventForm", { formId: created.formId });
    const payload = await invoke<{ roundId: string }>(publicFunctions, "getPublicEventForm", { token: created.publicToken });
    return { ...created, roundId: payload.roundId, versionId: published.versionId };
  }

  const validAnswers = (phone: string): EventFormAnswers => ({
    phone,
    choice: { optionIds: ["yes"], otherSelected: false },
  });

  beforeAll(async () => {
    managerApp = initializeApp({ projectId, apiKey: "demo-key", authDomain: `${projectId}.firebaseapp.com` }, `manager-${Date.now()}`);
    publicApp = initializeApp({ projectId, apiKey: "demo-key", authDomain: `${projectId}.firebaseapp.com` }, `public-${Date.now()}`);
    socialWorkerApp = initializeApp({ projectId, apiKey: "demo-key", authDomain: `${projectId}.firebaseapp.com` }, `social-${Date.now()}`);
    generalApp = initializeApp({ projectId, apiKey: "demo-key", authDomain: `${projectId}.firebaseapp.com` }, `general-${Date.now()}`);
    const adminRequire = createRequire(resolve("functions/package.json"));
    const { initializeApp: initializeAdminApp, deleteApp: deleteAdminApp } = adminRequire("firebase-admin/app");
    const { getAuth: getAdminAuth } = adminRequire("firebase-admin/auth");
    const adminApp = initializeAdminApp({ projectId }, `claims-${Date.now()}`);
    const createAccount = async (app: FirebaseApp, prefix: string, role?: "admin" | "social_worker") => {
      const auth = getAuth(app);
      connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
      const credential = await createUserWithEmailAndPassword(auth, `${prefix}-${Date.now()}@example.test`, "emulator-only-password");
      if (role) {
        await getAdminAuth(adminApp).setCustomUserClaims(credential.user.uid, { role });
        await credential.user.getIdToken(true);
      }
    };
    await createAccount(managerApp, "manager", "admin");
    await createAccount(socialWorkerApp, "social", "social_worker");
    await createAccount(generalApp, "general");
    managerFunctions = getFunctions(managerApp, "asia-northeast3");
    publicFunctions = getFunctions(publicApp, "asia-northeast3");
    socialWorkerFunctions = getFunctions(socialWorkerApp, "asia-northeast3");
    generalFunctions = getFunctions(generalApp, "asia-northeast3");
    connectFunctionsEmulator(managerFunctions, "127.0.0.1", 5001);
    connectFunctionsEmulator(publicFunctions, "127.0.0.1", 5001);
    connectFunctionsEmulator(socialWorkerFunctions, "127.0.0.1", 5001);
    connectFunctionsEmulator(generalFunctions, "127.0.0.1", 5001);
    await deleteAdminApp(adminApp);
  });

  beforeEach(async () => {
    const response = await fetch(`http://127.0.0.1:8081/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: "DELETE" });
    expect(response.ok).toBe(true);
  });

  afterAll(async () => Promise.all([deleteClientApp(managerApp), deleteClientApp(publicApp), deleteClientApp(socialWorkerApp), deleteClientApp(generalApp)]));

  it("관리 Function은 admin·social_worker만 허용하고 역할 없는 로그인 계정을 차단한다", async () => {
    await expect(invoke(publicFunctions, "createEventForm", { title: "위조" })).rejects.toMatchObject({ code: "functions/unauthenticated" });
    await expect(invoke(generalFunctions, "createEventForm", { title: "일반 계정 위조" })).rejects.toMatchObject({ code: "functions/permission-denied" });
    await expect(invoke(socialWorkerFunctions, "createEventForm", { title: "전담사회복지사 허용" })).resolves.toHaveProperty("formId");
    const form = await setupOpenForm();
    await expect(invoke(publicFunctions, "getPublicEventForm", { token: form.publicToken })).resolves.toMatchObject({ roundId: form.roundId, versionId: form.versionId });
    await expect(invoke(publicFunctions, "getPublicEventForm", { token: "invalid-token-value-000000" })).rejects.toMatchObject({ code: "functions/not-found" });
  });

  it("서버가 다른 폼의 문항·선택지 ID를 섞은 제출을 차단한다", async () => {
    const form = await setupOpenForm();
    await expect(invoke(publicFunctions, "submitEventForm", { ...form, token: form.publicToken, answers: { ...validAnswers("01011112222"), foreignField: "조작" } })).rejects.toMatchObject({ code: "functions/invalid-argument" });
    await expect(invoke(publicFunctions, "submitEventForm", { ...form, token: form.publicToken, answers: { phone: "01011112222", choice: { optionIds: ["foreign-option"], otherSelected: false } } })).rejects.toMatchObject({ code: "functions/invalid-argument" });
  });

  it("마감 폼과 현재 활성 회차가 아닌 과거 회차 제출을 차단한다", async () => {
    const closed = await setupOpenForm();
    await invoke(managerFunctions, "setEventFormStatus", { formId: closed.formId, status: "closed" });
    await expect(invoke(publicFunctions, "submitEventForm", { token: closed.publicToken, roundId: closed.roundId, versionId: closed.versionId, answers: validAnswers("01022223333") })).rejects.toMatchObject({ code: "functions/failed-precondition" });

    const switched = await setupOpenForm();
    await invoke(managerFunctions, "startEventFormRound", { formId: switched.formId, name: "새 회차" });
    await expect(invoke(publicFunctions, "submitEventForm", { token: switched.publicToken, roundId: switched.roundId, versionId: switched.versionId, answers: validAnswers("01033334444") })).rejects.toMatchObject({ code: "functions/failed-precondition" });
  });

  it("동시 중복 제출은 회차별 원자 키로 정확히 한 건만 저장한다", async () => {
    const form = await setupOpenForm("block");
    const request = { token: form.publicToken, roundId: form.roundId, versionId: form.versionId, answers: validAnswers("010-4444-5555") };
    const results = await Promise.allSettled([
      invoke(publicFunctions, "submitEventForm", request),
      invoke(publicFunctions, "submitEventForm", request),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect((results.find((result) => result.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ code: "functions/already-exists" });
  });

  it("응답 크기 200KB 초과와 token별 짧은 시간 반복 호출을 제한한다", async () => {
    const large = await setupOpenForm();
    await expect(invoke(publicFunctions, "submitEventForm", { token: large.publicToken, roundId: large.roundId, versionId: large.versionId, answers: { phone: "01055556666", choice: { optionIds: ["yes"], otherSelected: false }, oversized: "x".repeat(200_001) } })).rejects.toMatchObject({ code: "functions/invalid-argument" });

    const limited = await setupOpenForm("none");
    for (let index = 0; index < 10; index += 1) {
      await expect(invoke(publicFunctions, "submitEventForm", { token: limited.publicToken, roundId: limited.roundId, versionId: limited.versionId, answers: validAnswers(`0107777${String(index).padStart(4, "0")}`) })).resolves.toHaveProperty("submissionId");
    }
    await expect(invoke(publicFunctions, "submitEventForm", { token: limited.publicToken, roundId: limited.roundId, versionId: limited.versionId, answers: validAnswers("01088889999") })).rejects.toMatchObject({ code: "functions/resource-exhausted" });
  });
});
