// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, serverTimestamp, updateDoc, type Firestore } from "firebase/firestore";
import { createHandwritingApi } from "@/lib/counselingHandwritingApi";
import { clearAllHandwritingDrafts, encodeStrokes, getHandwritingDraft, setHandwritingDraft, type HandwritingMemo } from "@/lib/counselingHandwriting";
import { COUNSELING_COLLECTION, COUNSELING_HANDWRITING_COLLECTION } from "@/lib/collectionNames";
const seed: HandwritingMemo = { id: "force-a", schemaVersion: 1, targetType: "이용자", targetId: "synthetic", targetKey: "user:synthetic", counselingRecordId: "", createdBy: "a", updatedBy: "a", createdAt: null, updatedAt: null, revision: 0, width: 1600, height: 1000, strokesJson: "[]", transcribedRevision: -1, transcribedAt: null };
const json = encodeStrokes([{ id: "stroke", width: 4, points: [[10, 20, 0.5]] }]);
describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)("Manual Force Delete contract", () => {
 let env: RulesTestEnvironment;
 const staff = (uid="a", role="admin") => env.authenticatedContext(uid, {role}).firestore() as unknown as Firestore;
 const ref = (db: Firestore,id=seed.id) => doc(db,COUNSELING_HANDWRITING_COLLECTION,id);
 const api = (db: Firestore,uid="a") => createHandwritingApi(db,async()=>uid);
 const read = async(db:Firestore,id=seed.id)=>({... (await getDoc(ref(db,id))).data(),id}) as HandwritingMemo;
 async function setup(){const db=staff();await api(db).save(seed,json,false);return {db,service:api(db),memo:await read(db)};}
 beforeAll(async()=>{env=await initializeTestEnvironment({projectId:"demo-dongbaek-forms",firestore:{rules:readFileSync("firestore.rules","utf8")}});},20000);
 beforeEach(async()=>{await env.clearFirestore();clearAllHandwritingDrafts();});
 afterAll(async()=>{clearAllHandwritingDrafts();await env.cleanup();});
 it.each(["admin","social_worker"])("FD5/FD6/FD7/FD13: %s legacy memo confirm/delete retains formal and other memo",async role=>{
  const db=staff("a",role),service=api(db);await service.save(seed,json,false);
  await service.save({...seed,id:"force-b"},json,false);
  const recordId=await service.saveTranscription(await read(db),{targetType:seed.targetType,targetId:seed.targetId,targetName:"synthetic",date:"2026-10-06",category:"일반상담",counselorName:"staff",content:"formal",result:""});
  await service.save(await read(db),json,true);const memo=await read(db);
  expect(memo).not.toHaveProperty("forceDeleteConfirmedBy");
  setHandwritingDraft("a",{memo,strokes:[],savedOnServer:true,generation:0});
  await service.confirmForceDelete(memo);await service.forceDeleteConfirmed(memo);
  expect((await getDoc(ref(db))).exists()).toBe(false);
  expect((await getDoc(ref(db,"force-b"))).exists()).toBe(true);
  expect((await getDoc(doc(db,COUNSELING_COLLECTION,recordId))).data()?.content).toBe("formal");
  expect(getHandwritingDraft("a",memo.id)).toBeUndefined();
 });
 it("FD8/FD-R3: direct SDK delete / other memo without confirmation DENY",async()=>{
  const {db,service,memo}=await setup();await assertFails(deleteDoc(ref(db)));
  await service.save({...seed,id:"force-b"},json,false);await service.confirmForceDelete(memo);
  await assertFails(deleteDoc(ref(db,"force-b")));
 });
 it("FD9/FD-R4: forged UID and reuse by another staff DENY",async()=>{
  const {db,service,memo}=await setup();
  await assertFails(updateDoc(ref(db),{forceDeleteConfirmedBy:"b",forceDeleteConfirmedAt:serverTimestamp(),forceDeleteConfirmedRevision:memo.revision,updatedBy:"a",updatedAt:serverTimestamp()}));
  await service.confirmForceDelete(memo);await assertFails(deleteDoc(ref(staff("b"))));
 });
 it("FD10/FD11/FD-R1/FD-R2: A confirm, B save, stale delete DENY, latest reconfirm ALLOW",async()=>{
  const {db,service,memo}=await setup();await service.confirmForceDelete(memo);
  await api(staff("b"),"b").save(memo,json,true);
  await assertFails(deleteDoc(ref(db)));await expect(service.forceDeleteConfirmed(memo)).rejects.toThrow();
  expect((await getDoc(ref(db))).exists()).toBe(true);
  const latest=await read(db);await service.confirmForceDelete(latest);await service.forceDeleteConfirmed(latest);
  expect((await getDoc(ref(db))).exists()).toBe(false);
 });
 it("FD12: unauthenticated/nonstaff confirmation and delete DENY",async()=>{
  const {service,memo}=await setup();await service.confirmForceDelete(memo);
  for(const context of [env.unauthenticatedContext(),env.authenticatedContext("viewer",{role:"viewer"})]){
   const db=context.firestore() as unknown as Firestore;
   await assertFails(updateDoc(ref(db),{forceDeleteConfirmedBy:"viewer",forceDeleteConfirmedAt:serverTimestamp(),forceDeleteConfirmedRevision:1,updatedBy:"viewer",updatedAt:serverTimestamp()}));
   await assertFails(deleteDoc(ref(db)));
  }
 });
 it("force confirmation cannot edit strokes/revision, inject fields, or fake time",async()=>{
  const {db,memo}=await setup();
  for(const patch of [{forceDeleteConfirmedRevision:0},{forceDeleteConfirmedRevision:2},{forceDeleteConfirmedAt:null},{extra:true},{revision:2},{strokesJson:'[]'}]){
   await assertFails(updateDoc(ref(db),{forceDeleteConfirmedBy:"a",forceDeleteConfirmedAt:serverTimestamp(),forceDeleteConfirmedRevision:memo.revision,updatedBy:"a",updatedAt:serverTimestamp(),...patch}));
  }
 });
 it("force deletion preserves this device's dirty draft",async()=>{
  const {db,service,memo}=await setup();setHandwritingDraft("a",{memo,strokes:JSON.parse(json),savedOnServer:true,generation:1});
  await service.confirmForceDelete(memo);await service.forceDeleteConfirmed(memo);
  expect(getHandwritingDraft("a",memo.id)?.generation).toBe(1);
  await expect(service.save(memo,json,true)).rejects.toThrow();expect((await getDoc(ref(db))).exists()).toBe(false);
 });
});
