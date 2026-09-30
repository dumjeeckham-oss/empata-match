import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { connectStorageEmulator, getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";
import { app, auth, db, usingFirebaseEmulators } from "@/lib/firebase";
import type { EventFormAnswers, EventFormField, EventFormImageRef, EventFormRound, EventFormSlot, EventFormSubmission, EventFormVersion, PublicEventFormPayload } from "@/types/eventForms";
import { createEventFormId } from "@/lib/eventForms";

// Blaze 전용 보존 API. Spark 운영 화면에서는 eventFormSparkApi를 사용한다.
const functions = getFunctions(app, import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || "asia-northeast3");
const storage = getStorage(app);
if (usingFirebaseEmulators) {
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
}

async function call<TRequest, TResponse>(name: string, data: TRequest): Promise<TResponse> {
  const serializable = JSON.parse(JSON.stringify(data)) as TRequest;
  const response = await httpsCallable<TRequest, TResponse>(functions, name)(serializable);
  return response.data;
}

export const eventFormApi = {
  create: (title: string) => call<{ title: string }, { formId: string; publicToken: string }>("createEventForm", { title }),
  saveDraft: (payload: Partial<EventFormSlot> & { formId: string; fields: EventFormField[] }) => call("saveEventFormDraft", payload),
  publish: (formId: string) => call<{ formId: string }, { versionId: string }>("publishEventForm", { formId }),
  setStatus: (formId: string, status: "draft" | "open" | "closed") => call("setEventFormStatus", { formId, status }),
  startRound: (formId: string, name: string) => call<{ formId: string; name: string }, { roundId: string }>("startEventFormRound", { formId, name }),
  getPublic: (token: string) => call<{ token: string }, PublicEventFormPayload>("getPublicEventForm", { token }),
  submit: (token: string, roundId: string, versionId: string, answers: EventFormAnswers) => call<{ token: string; roundId: string; versionId: string; answers: EventFormAnswers }, { submissionId: string; duplicateWarning: boolean }>("submitEventForm", { token, roundId, versionId, answers }),
  updateSubmission: (submissionId: string, status: EventFormSubmission["status"], adminMemo: string) => call("updateEventSubmission", { submissionId, status, adminMemo }),
};

export async function listEventForms(): Promise<EventFormSlot[]> {
  const snapshot = await getDocs(query(collection(db, "eventForms"), orderBy("updatedAt", "desc")));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as EventFormSlot));
}

export async function loadEventForm(formId: string): Promise<(EventFormSlot & { draftFields: EventFormField[] }) | null> {
  const snapshot = await getDoc(doc(db, "eventForms", formId));
  return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data(), draftFields: snapshot.data().draftFields || [] } as EventFormSlot & { draftFields: EventFormField[] }) : null;
}

export async function loadEventFormRounds(formId: string): Promise<EventFormRound[]> {
  const snapshot = await getDocs(query(collection(db, "eventFormRounds"), where("formId", "==", formId)));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as EventFormRound)).sort((a, b) => Number((b as { sequence?: number }).sequence || 0) - Number((a as { sequence?: number }).sequence || 0));
}

export async function loadEventFormVersion(versionId: string): Promise<EventFormVersion | null> {
  const snapshot = await getDoc(doc(db, "eventFormVersions", versionId));
  return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as EventFormVersion) : null;
}

export async function loadEventFormSubmissions(roundId: string): Promise<EventFormSubmission[]> {
  const snapshot = await getDocs(query(collection(db, "eventFormSubmissions"), where("roundId", "==", roundId)));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as EventFormSubmission)).sort((a, b) => b.sequence - a.sequence);
}

async function decodeAndOptimizeImage(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  if (!(["image/jpeg", "image/png", "image/webp"] as string[]).includes(file.type)) throw new Error("JPEG, PNG, WebP 이미지만 업로드할 수 있습니다.");
  if (file.size > 5 * 1024 * 1024) throw new Error("원본 이미지는 5MB 이하여야 합니다.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("실제 이미지로 확인할 수 없는 파일입니다.");
  }
  const scale = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  let quality = 0.88;
  let blob: Blob | null = null;
  do {
    blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    quality -= 0.1;
  } while (blob && blob.size > 2 * 1024 * 1024 && quality >= 0.48);
  if (!blob) throw new Error("이미지를 변환할 수 없습니다.");
  if (blob.size > 5 * 1024 * 1024) throw new Error("최적화 후 이미지가 5MB를 초과합니다.");
  return { blob, width, height };
}

export async function uploadEventFormImage(formId: string, file: File, alt: string): Promise<EventFormImageRef> {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");
  const { blob } = await decodeAndOptimizeImage(file);
  const assetId = createEventFormId("asset");
  const storagePath = `eventFormAssets/${formId}/temp/${user.uid}/${assetId}/image.webp`;
  await uploadBytes(ref(storage, storagePath), blob, { contentType: "image/webp", customMetadata: { assetId, formId } });
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => { unsubscribe(); reject(new Error("이미지 검증 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.")); }, 20_000);
    const unsubscribe = onSnapshot(doc(db, "eventFormAssets", assetId), (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data();
      window.clearTimeout(timer);
      unsubscribe();
      if (data.verified === true) resolve();
      else reject(new Error(data.error || "이미지 검증에 실패했습니다."));
    }, (error) => { window.clearTimeout(timer); unsubscribe(); reject(error); });
  });
  return { assetId, storagePath, alt: alt.trim(), state: "temp", downloadUrl: await getDownloadURL(ref(storage, storagePath)) };
}
