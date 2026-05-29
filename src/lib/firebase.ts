import { getApps, initializeApp } from "firebase/app";
import { getFirestore, collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc, writeBatch, query, where, orderBy, onSnapshot, Timestamp, type DocumentData, type QueryConstraint } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, type User } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAAGBRs52B_pWvG9t6NOwR7mgPBNkB_LH4",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "dong100-51735.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "dong100-51735",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "dong100-51735.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "296812929766",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:296812929766:web:27f889ead244d8b9e65127",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-3S03D8H5FE"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

const firestoreDatabaseId =
  import.meta.env.VITE_FIRESTORE_DATABASE_ID ||
  import.meta.env.VITE_FIREBASE_DATABASE_ID ||
  "dong100-51735";

export const db = getFirestore(app, firestoreDatabaseId);
export const auth = getAuth(app);

try {
  console.log("Firebase 연결 시도 중... 프로젝트 ID:", app.options.projectId);
  console.log("Firestore Database ID:", firestoreDatabaseId);
  console.log("Firestore 로딩 성공 여부:", !!db);
  console.log("🔥 Firebase 연결 엔진 기동 성공:", db.app.options.projectId);
} catch (e) {
  console.error("Firebase 초기화 자체 실패:", e);
}

export {
  collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc, writeBatch,
  query, where, orderBy, onSnapshot, Timestamp,
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
  type User, type DocumentData, type QueryConstraint
};
