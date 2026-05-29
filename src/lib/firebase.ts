import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getFirestore, collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc, writeBatch, query, where, orderBy, onSnapshot, Timestamp, type DocumentData, type QueryConstraint } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, type User } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAAGBRs52B_pWvG9t6NOwR7mgPBNkB_LH4",
  authDomain: "dong100-51735.firebaseapp.com",
  projectId: "dong100-51735",
  storageBucket: "dong100-51735.appspot.com",
  messagingSenderId: "296812929766",
  appId: "1:296812929766:web:27f889ead244d8b9e65127"
};

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

export const db = getFirestore(app);
export const auth = getAuth(app);

try {
  console.log("Firebase 연결 시도 중... 프로젝트 ID:", app.options.projectId);
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
