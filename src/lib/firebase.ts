import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator, collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc, writeBatch, query, where, orderBy, onSnapshot, Timestamp, type DocumentData, type QueryConstraint } from "firebase/firestore";
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut, onAuthStateChanged, type User } from "firebase/auth";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { connectStorageEmulator, getStorage } from "firebase/storage";

const productionFirebaseConfig = {
  apiKey: "AIzaSyAAGBRs52B_pWvG9t6NOwR7mgPBNkB_LH4",
  authDomain: "dong100-51735.firebaseapp.com",
  projectId: "dong100-51735",
  storageBucket: "dong100-51735.appspot.com",
  messagingSenderId: "296812929766",
  appId: "1:296812929766:web:27f889ead244d8b9e65127"
};

export const usingFirebaseEmulators = import.meta.env.DEV || import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true";
const demoProjectId = import.meta.env.VITE_FIREBASE_DEMO_PROJECT_ID || "demo-dongbaek-forms";
const firebaseConfig = usingFirebaseEmulators
  ? {
      apiKey: "demo-api-key",
      authDomain: `${demoProjectId}.firebaseapp.com`,
      projectId: demoProjectId,
      storageBucket: `${demoProjectId}.appspot.com`,
      messagingSenderId: "000000000000",
      appId: "1:000000000000:web:emulator",
    }
  : productionFirebaseConfig;

/**
 * 배포 환경(GitHub Pages/Vite)에서 환경변수 누락으로 Firebase 설정이 깨지는 문제를 방지하기 위해
 * Firebase Config를 100% 하드코딩하고, 앱 중복 초기화도 안전하게 방지합니다.
 */
let app: FirebaseApp;
try {
  app = getApps().length ? getApp() : initializeApp(firebaseConfig);
} catch (e) {
  console.error("Firebase 초기화 자체 실패:", e);
  throw e;
}

/**
 * 핵심: 현재 운영 데이터는 Firestore 기본 데이터베이스 (default)에 저장됩니다.
 * 따라서 named databaseId를 강제하지 않고 getFirestore(app)로 기본 DB를 사용합니다.
 */
export const db = getFirestore(app);
export const auth = getAuth(app);
export const functions = getFunctions(app, import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || "asia-northeast3");
export const storage = getStorage(app);

if (usingFirebaseEmulators) {
  // demo-* 프로젝트만 허용하여 실수로 운영 Firebase에 연결되는 것을 차단한다.
  if (!app.options.projectId?.startsWith("demo-")) throw new Error("Emulator는 demo-* 프로젝트 ID에서만 실행할 수 있습니다.");
  connectFirestoreEmulator(db, "127.0.0.1", 8081);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
}

try {
  console.log(usingFirebaseEmulators ? "Firebase Emulator 연결:" : "Firebase 연결 시도 중... 프로젝트 ID:", app.options.projectId);
  console.log("Firestore 로딩 성공 여부:", !!db);
  console.log("🔥 Firebase 연결 엔진 기동 성공:", db.app.options.projectId);
} catch (e) {
  console.error("Firebase 초기화 후 로그 출력 실패:", e);
}

export {
  collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc, writeBatch,
  query, where, orderBy, onSnapshot, Timestamp,
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
  type User, type DocumentData, type QueryConstraint
};
