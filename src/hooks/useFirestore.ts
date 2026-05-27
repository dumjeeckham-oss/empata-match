import { useState, useEffect, useCallback } from "react";
import { db, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, Timestamp, type QueryConstraint } from "@/lib/firebase";
import { normalizeServiceUser, normalizeWorker } from "@/lib/assignments";
import { sanitizeForFirestore } from "@/lib/bulkUpload";
import { toast } from "@/hooks/use-toast";

export function getFirestoreErrorMessage(err: unknown): string {
  const firebaseErr = err as { code?: string; message?: string };
  const code = firebaseErr?.code ?? "";
  const message = firebaseErr?.message ?? String(err);

  if (code === "failed-precondition" || message.includes("index")) {
    return "데이터를 불러오지 못했습니다. Firebase 인덱스를 확인하세요.";
  }
  if (code === "permission-denied") {
    return "데이터를 불러오지 못했습니다. Firebase 보안 규칙(권한)을 확인하세요.";
  }
  if (code === "unavailable" || code === "deadline-exceeded") {
    return "데이터를 불러오지 못했습니다. 네트워크 연결을 확인하세요.";
  }
  return `데이터를 불러오지 못했습니다. (${message})`;
}

export function useCollection<T>(collectionName: string, constraints: QueryConstraint[] = []) {
  const [data, setData] = useState<(T & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    let unsub: (() => void) | undefined;

    try {
      const q = query(collection(db, collectionName), ...constraints);
      unsub = onSnapshot(
        q,
        (snap) => {
          const items = snap.docs.map((d) => {
            const raw = d.data() as Record<string, unknown>;
            const normalized =
              collectionName === "users"
                ? normalizeServiceUser(raw)
                : collectionName === "workers"
                  ? normalizeWorker(raw)
                  : raw;
            return { id: d.id, ...raw, ...normalized } as T & { id: string };
          });
          setData(items);
          setLoading(false);
          setError(null);
        },
        (err) => {
          console.error(`Firestore error (${collectionName}):`, err);
          const msg = getFirestoreErrorMessage(err);
          setError(msg);
          setLoading(false);
          setData([]);
          toast({
            title: "데이터 로드 실패",
            description: msg,
            variant: "destructive",
          });
        }
      );
    } catch (err) {
      console.error(`Firestore setup error (${collectionName}):`, err);
      const msg = getFirestoreErrorMessage(err);
      setError(msg);
      setLoading(false);
      toast({
        title: "데이터 로드 실패",
        description: msg,
        variant: "destructive",
      });
    }

    return () => {
      unsub?.();
    };
  }, [collectionName]);

  const add = useCallback(async (item: Omit<T, "id">) => {
    const payload = sanitizeForFirestore(item as Record<string, unknown>);
    return addDoc(collection(db, collectionName), {
      ...payload,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  }, [collectionName]);

  const update = useCallback(async (id: string, updates: Partial<T>) => {
    const payload = sanitizeForFirestore(updates as Record<string, unknown>);
    return updateDoc(doc(db, collectionName, id), {
      ...payload,
      updatedAt: Timestamp.now(),
    } as Record<string, unknown>);
  }, [collectionName]);

  const remove = useCallback(async (id: string) => {
    return deleteDoc(doc(db, collectionName, id));
  }, [collectionName]);

  return { data, loading, error, add, update, remove };
}
