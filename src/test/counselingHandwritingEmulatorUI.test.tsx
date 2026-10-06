import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteApp } from "firebase/app";
import { signInAnonymously } from "firebase/auth";
import { collection, doc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { COUNSELING_COLLECTION, COUNSELING_HANDWRITING_COLLECTION, USERS_COLLECTION } from "@/lib/collectionNames";

const boundary = vi.hoisted(() => ({ app: null as import("firebase/app").FirebaseApp | null, auth: null as import("firebase/auth").Auth | null, db: null as import("firebase/firestore").Firestore | null }));
// Substitute only Firebase initialization. Actual SDK, Auth hook, collections, UI,
// handwriting API, pointer handling and autosave hook run unchanged against demo.
vi.mock("@/lib/firebase", async () => {
 const apps = await import("firebase/app"), authSdk = await import("firebase/auth"), firestore = await import("firebase/firestore");
 boundary.app = apps.initializeApp({ projectId: "demo-dongbaek-forms", apiKey: "demo-key" }, `ui-v2-${crypto.randomUUID()}`);
 boundary.auth = authSdk.getAuth(boundary.app); boundary.db = firestore.getFirestore(boundary.app);
 if (process.env.FIREBASE_AUTH_EMULATOR_HOST) authSdk.connectAuthEmulator(boundary.auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
 if (process.env.FIRESTORE_EMULATOR_HOST) {
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
  firestore.connectFirestoreEmulator(boundary.db, host, Number(port));
 }
 return { ...firestore, ...authSdk, get db() { return boundary.db; }, get auth() { return boundary.auth; } };
});
import Counseling from "@/pages/Counseling";
import { clearAllHandwritingDrafts } from "@/lib/counselingHandwriting";

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST)("actual Counseling UI + demo Firebase V2 E2E", () => {
 let env: RulesTestEnvironment;
 beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: "demo-dongbaek-forms", firestore: { rules: readFileSync("src/test/fixtures/handwriting-safe-delete-v2.rules", "utf8") } });
  await env.clearFirestore();
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("PointerEvent", MouseEvent);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null); // jsdom has no raster backend.
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ width: 1600, height: 1000, left: 0, top: 0, right: 1600, bottom: 1000, x: 0, y: 0, toJSON() {} });
  Element.prototype.scrollIntoView = vi.fn();
  HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
  HTMLCanvasElement.prototype.hasPointerCapture = () => false;
  vi.spyOn(window, "confirm").mockReturnValue(true);
 }, 20000);
 afterAll(async () => { cleanup(); clearAllHandwritingDrafts(); vi.restoreAllMocks(); vi.unstubAllGlobals(); if (env) await env.cleanup(); if (boundary.app) await deleteApp(boundary.app); });

 async function openForm() {
  render(<Counseling />);
  fireEvent.click(screen.getByRole("button", { name: "+ 상담기록 작성" }));
  const button = screen.getByRole("button", { name: "✏️ 손글씨 메모" });
  expect(button).toBeDisabled();
  fireEvent.click(await screen.findByRole("option", { name: /합성 E2E 대상/ }));
  await waitFor(() => expect(screen.getByRole("button", { name: "✏️ 손글씨 메모" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "✏️ 손글씨 메모" }));
 }

 it("login/target gate/pointer/autosave/PC reopen/transcription/cancel/confirmation/safe delete", async () => {
  const { user } = await signInAnonymously(boundary.auth!);
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-key`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer owner" }, body: JSON.stringify({ localId: user.uid, customAttributes: JSON.stringify({ role: "admin" }) }) });
  expect(response.ok).toBe(true); expect((await user.getIdTokenResult(true)).claims.role).toBe("admin");
  const db = boundary.db!;
  await setDoc(doc(db, USERS_COLLECTION, "e2e-target"), { name: "합성 E2E 대상", phone: "synthetic", createdAt: serverTimestamp() });
  await openForm();
  expect((await getDocs(collection(db, COUNSELING_HANDWRITING_COLLECTION))).empty).toBe(true);
  fireEvent.click(await screen.findByRole("button", { name: "새 상담의 손글씨 시작" }));
  const canvas = await screen.findByRole("img", { name: "임시 손글씨 필기 영역" });
  fireEvent.pointerDown(canvas, { button: 0, clientX: 10, clientY: 20 });
  fireEvent.pointerMove(canvas, { clientX: 30, clientY: 40 });
  fireEvent.pointerUp(canvas, { clientX: 30, clientY: 40 });
  await waitFor(async () => {
   const memos = await getDocs(collection(db, COUNSELING_HANDWRITING_COLLECTION));
   expect(memos.size).toBe(1); expect(memos.docs[0].data()).toMatchObject({ targetId: "e2e-target", targetKey: "user:e2e-target", revision: 1 });
   expect(JSON.parse(memos.docs[0].data().strokesJson)[0].points.length).toBeGreaterThanOrEqual(2);
  }, { timeout: 10000 });
  const memoId = (await getDocs(collection(db, COUNSELING_HANDWRITING_COLLECTION))).docs[0].id;
  fireEvent.click(screen.getByRole("button", { name: "닫기" }));
  await waitFor(() => expect(screen.queryByRole("img", { name: "임시 손글씨 필기 영역" })).not.toBeInTheDocument());
  cleanup(); clearAllHandwritingDrafts(); // New PC view with no in-memory memo cache.
  await openForm();
  fireEvent.click(await screen.findByRole("button", { name: / · 이어보기$/ }));
  const reopenedCanvas = await screen.findByRole("img", { name: "임시 손글씨 필기 영역" });
  fireEvent.pointerDown(reopenedCanvas, { button: 0, clientX: 50, clientY: 60 });
  fireEvent.pointerUp(reopenedCanvas, { clientX: 50, clientY: 60 });
  await waitFor(async () => {
   const memos = await getDocs(collection(db, COUNSELING_HANDWRITING_COLLECTION));
   expect(memos.size).toBe(1); expect(memos.docs[0].id).toBe(memoId);
   expect(memos.docs[0].data().revision).toBe(2);
   expect(JSON.parse(memos.docs[0].data().strokesJson)).toHaveLength(2);
  }, { timeout: 10000 });
  const whiteboard = within(screen.getByRole("dialog", { name: "임시 손글씨 메모" }));
  fireEvent.change(whiteboard.getByLabelText("상담내용 *"), { target: { value: "실제 UI 전사 내용" } });
  fireEvent.change(whiteboard.getByLabelText("상담결과"), { target: { value: "실제 UI 확인" } });
  fireEvent.click(whiteboard.getByRole("button", { name: "정식 상담 저장" }));
  const remove = whiteboard.getByRole("button", { name: "전사 완료 · 손글씨 삭제" });
  await waitFor(() => expect(remove).toBeEnabled(), { timeout: 10000 });
  vi.mocked(window.confirm).mockReturnValueOnce(false); fireEvent.click(remove);
  const unconfirmed = (await getDocs(collection(db, COUNSELING_HANDWRITING_COLLECTION))).docs[0].data();
  expect(unconfirmed.confirmedAt).toBeNull(); expect(unconfirmed.transcribedCounselingRevision).toBe(1);
  fireEvent.click(remove);
  await screen.findByText("✓ 전사 완료 — 임시 손글씨가 삭제되었습니다.", {}, { timeout: 10000 });
  expect((await getDocs(collection(db, COUNSELING_HANDWRITING_COLLECTION))).empty).toBe(true);
  const formal = await getDocs(collection(db, COUNSELING_COLLECTION));
  expect(formal.size).toBe(1); expect(formal.docs[0].data()).toMatchObject({ targetId: "e2e-target", targetName: "합성 E2E 대상", revision: 1, content: "실제 UI 전사 내용", result: "실제 UI 확인" });
 }, 40000);
});
