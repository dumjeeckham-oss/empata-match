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
import { PendingHandwritingMemos } from "@/components/CounselingHandwritingEntry";
import { handwritingApi } from "@/lib/counselingHandwritingApi";
import { type HandwritingMemo } from "@/lib/counselingHandwriting";
import UserManagement from "@/pages/UserManagement";
import { MemoryRouter } from "react-router-dom";
import { clearAllHandwritingDrafts } from "@/lib/counselingHandwriting";

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST)("actual Force Delete UI + demo Firebase E2E", () => {
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

 it("FD1-FD7: actual pending list, both cancel gates, confirmed delete, formal/other memo retention",async()=>{
  await login();const db=boundary.db!,uid=boundary.auth!.currentUser!.uid;
  const seed:HandwritingMemo={id:"fd-a",schemaVersion:1,targetType:"이용자",targetId:"fd-target-a",targetKey:"user:fd-target-a",counselingRecordId:"",createdBy:uid,updatedBy:uid,createdAt:null,updatedAt:null,revision:0,width:1600,height:1000,strokesJson:"[]",transcribedRevision:-1,transcribedAt:null};
  await handwritingApi.save(seed,"[]",false);
  const memo=()=>getDoc(doc(db,COUNSELING_HANDWRITING_COLLECTION,seed.id));
  const read=async()=>({... (await memo()).data(),id:seed.id}) as HandwritingMemo;
  const recordId=await handwritingApi.saveTranscription(await read(),{targetType:seed.targetType,targetId:seed.targetId,targetName:"synthetic",content:"formal retained",result:"",date:"2026-10-06",category:"일반상담",counselorName:"synthetic"});
  await handwritingApi.save(await read(),"[]",true);
  await handwritingApi.save({...seed,id:"fd-b",targetId:"fd-target-b",targetKey:"user:fd-target-b"},"[]",false);
  render(<PendingHandwritingMemos targetName={(_type,id)=>id}/>);
  const open=await screen.findByRole("button",{name:"fd-target-a 열기"},{timeout:10000}),row=open.parentElement!;
  const remove=within(row).getByRole("button",{name:"옮겨 적은 후 삭제"});expect(remove).toBeEnabled();
  vi.mocked(window.confirm).mockReturnValueOnce(false);fireEvent.click(remove);expect((await memo()).exists()).toBe(true);expect((await memo()).data()).not.toHaveProperty("forceDeleteConfirmedBy");
  vi.mocked(window.confirm).mockReturnValueOnce(true).mockReturnValueOnce(false);fireEvent.click(remove);expect((await memo()).exists()).toBe(true);expect((await memo()).data()).not.toHaveProperty("forceDeleteConfirmedBy");
  fireEvent.click(remove);await screen.findByText("임시 손글씨를 삭제했습니다.",{}, {timeout:10000});
  expect((await memo()).exists()).toBe(false);expect((await getDoc(doc(db,COUNSELING_COLLECTION,recordId))).data()?.content).toBe("formal retained");expect((await getDoc(doc(db,COUNSELING_HANDWRITING_COLLECTION,"fd-b"))).exists()).toBe(true);
 },20000);
});
