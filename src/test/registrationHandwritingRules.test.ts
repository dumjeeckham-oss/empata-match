// @vitest-environment node
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, updateDoc, serverTimestamp, setDoc, deleteDoc, getDocs, collection, writeBatch, type Firestore } from "firebase/firestore";
import { createRegistrationHandwritingApi, newRegistrationMemo } from "@/lib/registrationHandwritingApi";
import { clearAllHandwritingDrafts } from "@/lib/counselingHandwriting";
import { REGISTRATION_HANDWRITING_COLLECTION, USERS_COLLECTION, WORKERS_COLLECTION } from "@/lib/collectionNames";
const id="11111111-1111-4111-8111-111111111111",other="22222222-2222-4222-8222-222222222222";
describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST).each(["이용자", "활동지원사"] as const)("%s registration handwriting contract",(targetType)=>{
 const targetCollection=targetType==="이용자"?USERS_COLLECTION:WORKERS_COLLECTION, otherCollection=targetType==="이용자"?WORKERS_COLLECTION:USERS_COLLECTION;
 const otherType=targetType==="이용자"?"활동지원사":"이용자";
 let env:RulesTestEnvironment;
 const staff=(uid="a")=>env.authenticatedContext(uid,{role:"admin"}).firestore() as unknown as Firestore;
 const ref=(db:Firestore,draft=id)=>doc(db,REGISTRATION_HANDWRITING_COLLECTION,draft);
 const api=(db:Firestore,uid="a")=>createRegistrationHandwritingApi(db,async()=>uid);
 beforeAll(async()=>{env=await initializeTestEnvironment({projectId:"demo-dongbaek-forms",firestore:{rules:readFileSync("firestore.rules","utf8")}});},20000);
 beforeEach(async()=>{await env.clearFirestore();clearAllHandwritingDrafts();});afterAll(async()=>{await env.cleanup();});
 it("U4/U5/U8/U10/U11: save/reopen/atomic register/confirmed delete retains formal user",async()=>{
  const db=staff(),service=api(db);await service.save(newRegistrationMemo(targetType,id,"a"),'[]',false);
  const memo=(await service.load(id))!;expect(memo.revision).toBe(1);
  const target=await service.register(targetType,id,{name:"synthetic",phone:"synthetic",gender:"여성",txtUSex:"여성"});
  expect(target.id).toBe(id);expect((await getDoc(ref(db))).data()?.registered).toBe(true);
  expect((await getDoc(target)).data()?.registrationDraftId).toBe(id);
  await service.confirmForceDelete(memo);await service.forceDeleteConfirmed(memo);
  expect((await getDoc(ref(db))).exists()).toBe(false);expect((await getDoc(target)).data()?.name).toBe("synthetic");
 });
 it("U6/U7: failed registration does not remove memo; retry and duplicate rejection",async()=>{
  const db=staff(),service=api(db);await service.save(newRegistrationMemo(targetType,id,"a"),'[]',false);
  await expect(service.register(otherType,id,{name:"bad"})).rejects.toThrow();expect((await getDoc(ref(db))).exists()).toBe(true);
  await service.register(targetType,id,{name:"good"});await expect(service.register(targetType,id,{name:"duplicate"})).rejects.toThrow();expect((await getDoc(ref(db))).exists()).toBe(true);
 });
 it("I: cross-target/cross-role/draft/target ID/immutable fields DENY",async()=>{
  const db=staff(),service=api(db);await service.save(newRegistrationMemo(targetType,id,"a"),'[]',false);
  for(const patch of [{targetId:other},{draftId:other},{targetType:otherType},{createdBy:"b"},{width:1000},{schemaVersion:2},{extra:true}])await assertFails(updateDoc(ref(db),{...patch,updatedBy:"a",updatedAt:serverTimestamp()}));
  await assertFails(setDoc(doc(db,targetCollection,other),{name:"forged",registrationDraftId:id}));
  await assertFails(setDoc(doc(db,otherCollection,id),{name:"forged",registrationDraftId:id}));
  await assertFails(updateDoc(ref(staff("b")),{registered:true,updatedBy:"b",updatedAt:serverTimestamp()}));
 });
 it("I: malformed/oversized/extra fields/UID spoof/nonstaff CRUD/direct delete/stale confirmation DENY",async()=>{
  const db=staff(),service=api(db);await service.save(newRegistrationMemo(targetType,id,"a"),'[]',false);const memo=(await service.load(id))!;
  for(const patch of [{strokesJson:"x"},{strokesJson:'['+'x'.repeat(524288)+']',revision:2},{forceDeleteConfirmedBy:"b",forceDeleteConfirmedAt:serverTimestamp(),forceDeleteConfirmedRevision:1}])await assertFails(updateDoc(ref(db),{...patch,updatedBy:"a",updatedAt:serverTimestamp()}));
  await assertFails(deleteDoc(ref(db)));await service.confirmForceDelete(memo);await assertFails(deleteDoc(ref(staff("b"))));
  await service.save(memo,'[]',true);await assertFails(deleteDoc(ref(db)));
  for(const ctx of [env.unauthenticatedContext(),env.authenticatedContext("viewer",{role:"viewer"})]){const denied=ctx.firestore() as unknown as Firestore;await assertFails(getDoc(ref(denied)));await assertFails(getDocs(collection(denied,REGISTRATION_HANDWRITING_COLLECTION)));await assertFails(updateDoc(ref(denied),{updatedBy:"viewer",updatedAt:serverTimestamp()}));await assertFails(deleteDoc(ref(denied)));await assertFails(setDoc(ref(denied,other),(await getDoc(ref(db))).data()!));}
 });
 it("I: existing unrelated target cannot be linked, registered marker immutable",async()=>{
  const db=staff(),service=api(db);await service.save(newRegistrationMemo(targetType,id,"a"),'[]',false);
  await setDoc(doc(db,targetCollection,id),{name:"existing"});
  const batch=writeBatch(db);batch.update(ref(db),{registered:true,updatedBy:"a",updatedAt:serverTimestamp()});batch.update(doc(db,targetCollection,id),{registrationDraftId:id});await assertFails(batch.commit());
  expect((await getDoc(ref(db))).data()?.registered).toBe(false);
 });
 it("orphan manual force deletion needs confirmation and deletes no target",async()=>{
  const db=staff(),service=api(db);await service.save(newRegistrationMemo(targetType,id,"a"),'[]',false);
  const memo=(await service.load(id))!;await service.confirmForceDelete(memo);await service.forceDeleteConfirmed(memo);
  expect((await getDoc(doc(db,targetCollection,id))).exists()).toBe(false);
 });
 it("real Firestore oversized target write fails atomically and keeps registration memo",async()=>{
  const db=staff(),service=api(db);await service.save(newRegistrationMemo(targetType,id,"a"),'[]',false);
  await expect(service.register(targetType,id,{name:"oversized",notes:"x".repeat(1100000)})).rejects.toThrow();
  expect((await getDoc(ref(db))).data()?.registered).toBe(false);expect((await getDoc(doc(db,targetCollection,id))).exists()).toBe(false);
 });
 it("social_worker registration, latest reconfirmation and other memo/target retention",async()=>{
  const db=env.authenticatedContext("social",{role:"social_worker"}).firestore() as unknown as Firestore,service=api(db,"social");
  await service.save(newRegistrationMemo(targetType,id,"social"),'[]',false);await service.save(newRegistrationMemo(targetType,other,"social"),'[]',false);
  const memo=(await service.load(id))!;await service.confirmForceDelete(memo);await assertFails(deleteDoc(ref(db,other)));
  await service.save(memo,'[]',true);await assertFails(deleteDoc(ref(db)));
  await service.register(targetType,id,{name:"retained"});const latest=(await service.load(id))!;await service.confirmForceDelete(latest);await service.forceDeleteConfirmed(latest);
  expect((await getDoc(ref(db,other))).exists()).toBe(true);expect((await getDoc(doc(db,targetCollection,id))).data()?.name).toBe("retained");
 });
 it("business subcollection access preserved, marker cannot be changed after registration",async()=>{
  const db=staff(),service=api(db);await service.save(newRegistrationMemo(targetType,id,"a"),'[]',false);await service.register(targetType,id,{name:"retained"});
  await assertFails(updateDoc(doc(db,targetCollection,id),{registrationDraftId:other}));
  const nested=doc(db,targetCollection,id,"existingBusiness","synthetic");await setDoc(nested,{synthetic:true});expect((await getDoc(nested)).exists()).toBe(true);await deleteDoc(nested);
 });

});
