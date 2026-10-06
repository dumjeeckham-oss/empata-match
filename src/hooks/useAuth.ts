import { useState, useEffect } from "react";
import { auth, onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "@/lib/firebase";

export type StaffRole = "admin" | "social_worker";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<StaffRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!active) return;
      setUser(u);
      if (!u) {
        setRole(null);
        setLoading(false);
        return;
      }
      try {
        const token = await u.getIdTokenResult(true);
        const claim = token.claims.role;
        setRole(claim === "admin" || claim === "social_worker" ? claim : null);
      } catch {
        setRole(null);
      } finally {
        if (active) setLoading(false);
      }
    });
    return () => { active = false; unsub(); };
  }, []);

  const login = async (email: string, password: string) => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  const logout = async () => {
    return signOut(auth);
  };

  return { user, role, loading, login, logout };
}
