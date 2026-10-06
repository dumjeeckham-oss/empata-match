import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteApp } from "firebase/app";
import { signInAnonymously } from "firebase/auth";
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { COUNSELING_COLLECTION, COUNSELING_HANDWRITING_COLLECTION, USERS_COLLECTION, WORKERS_COLLECTION, REGISTRATION_HANDWRITING_COLLECTION } from "@/lib/collectionNames";

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
import WorkerManagement from "@/pages/WorkerManagement";
import UserManagement from "@/pages/UserManagement";
import { MemoryRouter } from "react-router-dom";
import { clearAllHandwritingDrafts } from "@/lib/counselingHandwriting";

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST)("actual user registration UI + demo Firebase E2E", () => {
 let env: RulesTestEnvironment;
 beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: "demo-dongbaek-forms", firestore: { rules: readFileSync(process.env.HANDWRITING_RULES_FIXTURE || "src/test/fixtures/handwriting-safe-delete-v2.rules", "utf8") } });
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
 beforeEach(async()=>{cleanup();clearAllHandwritingDrafts();await env.clearFirestore();});
 afterAll(async () => { cleanup(); clearAllHandwritingDrafts(); vi.restoreAllMocks(); vi.unstubAllGlobals(); if (env) await env.cleanup(); if (boundary.app) await deleteApp(boundary.app); });


 async function login() {
  const { user } = await signInAnonymously(boundary.auth!);
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-key`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer owner" }, body: JSON.stringify({ localId: user.uid, customAttributes: JSON.stringify({ role: "admin" }) }) });
  expect(response.ok).toBe(true); await user.getIdTokenResult(true);
 }
 it.each([["U", UserManagement, USERS_COLLECTION, "user", "이용자 신규등록"], ["W", WorkerManagement, WORKERS_COLLECTION, "worker", "활동지원사 신규등록"]] as const)("%s1-11: actual form/canvas/save/reopen/validation/cancel/register/confirmed delete", async (_code, Component, targetCollection, prefix, title) => {
  await login(); const db=boundary.db!;render(<MemoryRouter><Component/></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button",{name:"+ 신규등록"},{timeout:10000}));
  fireEvent.click(await screen.findByRole("button",{name:"✏️ 손글씨 메모"}));
  const canvas=await screen.findByRole("img",{name:"임시 손글씨 필기 영역"});
  fireEvent.pointerDown(canvas,{button:0,clientX:10,clientY:20});fireEvent.pointerUp(canvas,{clientX:30,clientY:40});
  fireEvent.click(screen.getByRole("button",{name:"임시저장"}));
  await waitFor(async()=>{const m=await getDocs(collection(db,REGISTRATION_HANDWRITING_COLLECTION));expect(m.size).toBe(1);expect(JSON.parse(m.docs[0].data().strokesJson)).toHaveLength(1);},{timeout:10000});
  fireEvent.click(screen.getByRole("button",{name:"닫기 · 임시자료 유지"}));
  fireEvent.click(await screen.findByRole("button",{name:"✏️ 손글씨 메모"}));await screen.findByRole("img",{name:"임시 손글씨 필기 영역"});
  fireEvent.click(screen.getByRole("button",{name:"닫기 · 임시자료 유지"}));
  fireEvent.click(screen.getByRole("button",{name:"저장"}));
  expect((await getDocs(collection(db,targetCollection))).empty).toBe(true);expect((await getDocs(collection(db,REGISTRATION_HANDWRITING_COLLECTION))).size).toBe(1);
  fireEvent.click(screen.getByRole("button",{name:"취소"}));
  expect((await getDocs(collection(db,REGISTRATION_HANDWRITING_COLLECTION))).size).toBe(1);
  // Cancelled memo remains an identifiable orphan; the next registration has a new UUID.
  fireEvent.click(screen.getByRole("button",{name:"+ 신규등록"}));fireEvent.click(await screen.findByRole("button",{name:"✏️ 손글씨 메모"}));
  const second=await screen.findByRole("img",{name:"임시 손글씨 필기 영역"});fireEvent.pointerDown(second,{button:0,clientX:50,clientY:60});fireEvent.pointerUp(second,{clientX:50,clientY:60});
  fireEvent.click(screen.getByRole("button",{name:" 임시저장".trim()}));
  await waitFor(async()=>expect((await getDocs(collection(db,REGISTRATION_HANDWRITING_COLLECTION))).size).toBe(2),{timeout:10000});
  fireEvent.click(screen.getByRole("button",{name:"저장 후 닫기"}));
  await waitFor(()=>expect(screen.queryByRole("img",{name:"임시 손글씨 필기 영역"})).not.toBeInTheDocument());
  fireEvent.change(document.getElementById(`${prefix}-name`)!,{target:{value:"synthetic registration"}});fireEvent.change(document.getElementById(`${prefix}-phone`)!,{target:{value:"synthetic"}});
  fireEvent.click(screen.getByRole("button",{name:"저장"}));
  await waitFor(async()=>expect((await getDocs(collection(db,targetCollection))).size).toBe(1),{timeout:10000});
  const users=await getDocs(collection(db,targetCollection)),target=users.docs[0];const memo=await getDoc(doc(db,REGISTRATION_HANDWRITING_COLLECTION,target.id));expect(memo.data()?.registered).toBe(true);expect(target.data().registrationDraftId).toBe(target.id);
  await waitFor(()=>expect(screen.queryByRole("dialog",{name:title})).not.toBeInTheDocument());
  const section=screen.getByRole("region",{name:"신규등록 임시 손글씨"});const registered=within(section).getByRole("button",{name:/등록 완료/}).parentElement!;
  vi.mocked(window.confirm).mockReturnValueOnce(false);fireEvent.click(within(registered).getByRole("button",{name:"옮겨 적은 후 삭제"}));expect((await getDoc(doc(db,REGISTRATION_HANDWRITING_COLLECTION,target.id))).exists()).toBe(true);
  fireEvent.click(within(registered).getByRole("button",{name:"옮겨 적은 후 삭제"}));
  await waitFor(async()=>expect((await getDoc(doc(db,REGISTRATION_HANDWRITING_COLLECTION,target.id))).exists()).toBe(false),{timeout:10000});
  expect((await getDoc(doc(db,targetCollection,target.id))).data()?.name).toBe("synthetic registration");expect((await getDocs(collection(db,REGISTRATION_HANDWRITING_COLLECTION))).size).toBe(1);
 },40000);
});
