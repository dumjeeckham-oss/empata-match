import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc, query, where, orderBy, onSnapshot, Timestamp, type DocumentData, type QueryConstraint } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, type User } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAAGBRs52B_pWvG9t6NOwR7mgPBNkB_LH4",
  authDomain: "dong100-51735.firebaseapp.com",
  projectId: "dong100-51735",
  storageBucket: "dong100-51735.firebasestorage.app",
  messagingSenderId: "296812929766",
  appId: "1:296812929766:web:27f889ead244d8b9e65127",
  measurementId: "G-3S03D8H5FE"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

export {
  collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, Timestamp,
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
  type User, type DocumentData, type QueryConstraint
};
