import { createRequire } from "node:module";
import { resolve } from "node:path";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { auth } from "@/lib/firebase";
import { publicEventFormAuth } from "@/lib/eventFormPublicFirebase";
import {
  eventFormApi,
  loadEventForm,
  loadEventFormRounds,
  loadEventFormSubmissions,
  loadEventFormVersion,
} from "@/lib/eventFormSparkApi";
import type { EventFormField } from "@/types/eventForms";

const emulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);
const projectId = "demo-dongbaek-forms";
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

describe.skipIf(!emulatorAvailable)("Spark 행사 폼 실제 Auth·Firestore 흐름", () => {
  let adminSdkApp: { name: string };
  let deleteAdminApp: (app: { name: string }) => Promise<void>;

  beforeAll(async () => {
    const [authClear, firestoreClear] = await Promise.all([
      fetch(`http://127.0.0.1:9099/emulator/v1/projects/${projectId}/accounts`, { method: "DELETE" }),
      fetch(`http://127.0.0.1:8081/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: "DELETE" }),
    ]);
    expect(authClear.ok).toBe(true);
    expect(firestoreClear.ok).toBe(true);

    await Promise.all([signOut(auth), signOut(publicEventFormAuth)]);
    const adminRequire = createRequire(resolve("functions/package.json"));
    const { initializeApp: initializeAdminApp, deleteApp: removeAdminApp } = adminRequire("firebase-admin/app");
    const { getAuth: getAdminAuth } = adminRequire("firebase-admin/auth");
    adminSdkApp = initializeAdminApp({ projectId }, `spark-integration-${Date.now()}`);
    deleteAdminApp = removeAdminApp;

    const credential = await createUserWithEmailAndPassword(auth, `spark-admin-${Date.now()}@example.test`, "emulator-only-password");
    await getAdminAuth(adminSdkApp).setCustomUserClaims(credential.user.uid, { role: "admin" });
    await credential.user.getIdToken(true);
  });

  afterAll(async () => {
    await Promise.all([signOut(auth), signOut(publicEventFormAuth)]);
    await deleteAdminApp(adminSdkApp);
  });

  it("관리자 작성부터 익명 제출·결과·고정 링크 새 회차까지 직접 Firestore로 처리한다", async () => {
    const created = await eventFormApi.create("Spark 가짜 교육");
    const form = await loadEventForm(created.formId);
    expect(form?.status).toBe("draft");
    expect(form?.publicToken).toBe(created.publicToken);

    const fields: EventFormField[] = [{
      id: "applicant-name",
      type: "name",
      title: "신청자 이름",
      required: true,
      visible: true,
      order: 0,
      maxLength: 50,
    }];
    await eventFormApi.saveDraft({
      ...form!,
      formId: created.formId,
      title: "Spark 가짜 교육",
      description: "Emulator 통합 검증",
      location: "가짜 장소",
      fields,
    });
    const published = await eventFormApi.publish(created.formId);
    const publicForm = await eventFormApi.getPublic(created.publicToken);
    expect(publicForm).toMatchObject({ status: "open", title: "Spark 가짜 교육", versionId: published.versionId });

    const submission = await eventFormApi.submit(created.publicToken, publicForm.roundId, publicForm.versionId, { "applicant-name": "가짜 신청자" });
    expect(submission.submissionId).toContain(`${publicForm.roundId}__`);
    await expect(eventFormApi.submit(created.publicToken, publicForm.roundId, publicForm.versionId, { "applicant-name": "가짜 신청자" })).rejects.toBeTruthy();

    const [submissions, versionBeforeRoundChange] = await Promise.all([
      loadEventFormSubmissions(publicForm.roundId),
      loadEventFormVersion(publicForm.versionId),
    ]);
    expect(submissions).toHaveLength(1);
    expect(submissions[0].answers["applicant-name"]).toBe("가짜 신청자");
    expect(versionBeforeRoundChange?.formSnapshot?.title).toBe("Spark 가짜 교육");

    const next = await eventFormApi.startRound(created.formId, "2회차");
    const sameLinkNextRound = await eventFormApi.getPublic(created.publicToken);
    expect(sameLinkNextRound).toMatchObject({ status: "draft", roundId: next.roundId });
    expect(sameLinkNextRound.roundId).not.toBe(publicForm.roundId);

    const rounds = await loadEventFormRounds(created.formId);
    expect(rounds.map((round) => round.status)).toEqual(expect.arrayContaining(["draft", "archived"]));
    expect(await loadEventFormSubmissions(publicForm.roundId)).toHaveLength(1);
    expect((await loadEventFormVersion(publicForm.versionId))?.formSnapshot?.title).toBe("Spark 가짜 교육");
  });
});
