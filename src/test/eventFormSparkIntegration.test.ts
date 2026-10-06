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
import { exportAllEventFormRounds, loadEventFormResetSummary, resetEventForm } from "@/lib/eventFormResetApi";

const emulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);
const projectId = "demo-dongbaek-forms";
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

describe.skipIf(!emulatorAvailable)("Spark 행사 폼 실제 Auth·Firestore 흐름", () => {
  let adminSdkApp: { name: string };
  let deleteAdminApp: (app: { name: string }) => Promise<void>;
  let seed: (formId: string, roundId: string, versionId: string, count: number) => Promise<void>;
  let expireLease: (formId: string) => Promise<void>;

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
    const { getFirestore: getAdminFirestore, Timestamp: AdminTimestamp } = adminRequire("firebase-admin/firestore");
    adminSdkApp = initializeAdminApp({ projectId }, `spark-integration-${Date.now()}`);
    deleteAdminApp = removeAdminApp;
    const adminDb = getAdminFirestore(adminSdkApp);
    seed = async (formId, roundId, versionId, count) => {
      for (let start = 0; start < count; start += 400) {
        const batch = adminDb.batch();
        for (let index = start; index < Math.min(count, start + 400); index++) batch.set(adminDb.collection("eventFormSubmissions").doc(`${roundId}__synthetic-${index}`), { formId, roundId, versionId, answersBase64: Buffer.from(JSON.stringify({ "applicant-name": `가짜 ${index}` })).toString("base64"), status: "submitted", adminMemo: "가짜 메모", submittedAt: AdminTimestamp.now() });
        await batch.commit();
      }
    };
    expireLease = async (formId) => { await adminDb.collection("eventFormResetJobs").doc(formId).update({ leaseUntil: AdminTimestamp.fromMillis(0) }); };

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

  it("2개 슬롯 제한, 전체 내보내기, 400/1000건 초기화와 중단 후 재개 및 다른 슬롯 보존", async () => {
    const second = await eventFormApi.create("두 번째 가짜 교육");
    await expect(eventFormApi.create("세 번째 금지")).rejects.toThrow();
    URL.createObjectURL = vi.fn(() => "blob:synthetic-export");
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    try {
      const secondBefore = await loadEventForm(second.formId);
      const all = await import("@/lib/eventFormSparkApi").then((api) => api.listEventForms());
      const first = all.find((form) => form.id !== second.formId)!;
      for (const count of [1, 0, 400, 1000]) {
        let current = await loadEventForm(first.id!);
        await eventFormApi.saveDraft({ ...current!, formId: first.id!, fields: [{ id: "applicant-name", type: "name", title: "가짜 이름", description: "합성 안내\n두 번째 줄", order: 0, visible: true, required: true }] });
        await eventFormApi.publish(first.id!);
        current = await loadEventForm(first.id!);
        if (count >= 400) await seed(first.id!, current!.activeRoundId!, current!.activeVersionId!, count);
        await eventFormApi.setStatus(first.id!, "closed");
        expect((await loadEventFormResetSummary(first.id!)).count).toBe(count);
        if (count > 0) {
          await expect(resetEventForm(first.id!, true, current!.title, () => {})).rejects.toThrow("엑셀");
          await exportAllEventFormRounds(first.id!);
          if (count === 400) {
            const row = (await loadEventFormSubmissions(current!.activeRoundId!))[0];
            await eventFormApi.updateSubmission(row.id!, "reviewed", "합성 변경 메모");
            await expect(resetEventForm(first.id!, true, current!.title, () => {})).rejects.toThrow("엑셀");
            await exportAllEventFormRounds(first.id!);
          }
        }
        const start = performance.now();
        if (count === 1000) {
          await expect(resetEventForm(first.id!, true, current!.title, (deleted) => { if (deleted >= 400) throw new Error("합성 중단"); })).rejects.toThrow("합성 중단");
          expect((await loadEventForm(first.id!))?.status).toBe("resetting");
          await expect(resetEventForm(first.id!, true, current!.title, () => {})).rejects.toThrow("다른 창");
          await expect(eventFormApi.getPublic(first.publicToken!)).rejects.toBeTruthy();
          await expireLease(first.id!);
        }
        await resetEventForm(first.id!, true, current!.title, () => {});
        const after = await loadEventFormResetSummary(first.id!);
        expect(after.count).toBe(0);
        expect(after.groups[2].snapshot.size).toBe(1);
        expect(after.groups[3].snapshot.size).toBe(0);
        expect(after.form.status).toBe("draft");
        expect(after.form.publicToken).toBe(first.publicToken);
        expect((await loadEventForm(second.formId))?.publicToken).toBe(secondBefore?.publicToken);
        console.info(`합성 ${count}건 초기화 측정: ${Math.round(performance.now() - start)}ms`);
      }
    } finally { click.mockRestore(); }
  }, 120_000);
});
