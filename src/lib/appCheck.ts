import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getApp } from "firebase/app";
import { usingFirebaseEmulators } from "@/lib/firebase";
import { getPublicEventFormApp } from "@/lib/eventFormPublicFirebase";

let initialized = false;

export function initializeEventFormAppCheck(): void {
  if (initialized || usingFirebaseEmulators) return;
  const siteKey = import.meta.env.VITE_APP_CHECK_SITE_KEY;
  if (!siteKey) return;
  if (import.meta.env.DEV) (self as typeof self & { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  for (const firebaseApp of [getApp(), getPublicEventFormApp()]) {
    initializeAppCheck(firebaseApp, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }
  initialized = true;
}
