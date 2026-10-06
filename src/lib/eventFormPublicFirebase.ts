import { getApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInAnonymously, type User } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { firebaseConfig, usingFirebaseEmulators } from "@/lib/firebase";

const PUBLIC_APP_NAME = "event-form-public";
const publicApp = getApps().find((candidate) => candidate.name === PUBLIC_APP_NAME)
  ?? initializeApp(firebaseConfig, PUBLIC_APP_NAME);

export const publicEventFormAuth = getAuth(publicApp);
export const publicEventFormDb = getFirestore(publicApp);

if (usingFirebaseEmulators) {
  connectAuthEmulator(publicEventFormAuth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(publicEventFormDb, "127.0.0.1", 8081);
}

let signInPromise: Promise<User> | null = null;

export async function ensureAnonymousEventFormUser(): Promise<User> {
  const current = publicEventFormAuth.currentUser;
  if (current?.isAnonymous) return current;
  if (!signInPromise) {
    signInPromise = signInAnonymously(publicEventFormAuth)
      .then((credential) => credential.user)
      .finally(() => { signInPromise = null; });
  }
  return signInPromise;
}

export function getPublicEventFormApp() {
  return getApp(PUBLIC_APP_NAME);
}
