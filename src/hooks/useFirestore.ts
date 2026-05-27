import { useState, useEffect, useCallback } from "react";
import { db, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, Timestamp, type QueryConstraint } from "@/lib/firebase";

export function useCollection<T>(collectionName: string, constraints: QueryConstraint[] = []) {
  const [data, setData] = useState<(T & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, collectionName), ...constraints);
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as T & { id: string }));
      setData(items);
      setLoading(false);
    }, (err) => {
      console.error(`Firestore error (${collectionName}):`, err);
      setLoading(false);
    });
    return unsub;
  }, [collectionName]);

  const add = useCallback(async (item: Omit<T, "id">) => {
    return addDoc(collection(db, collectionName), { ...item, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
  }, [collectionName]);

  const update = useCallback(async (id: string, updates: Partial<T>) => {
    return updateDoc(doc(db, collectionName, id), { ...updates, updatedAt: Timestamp.now() } as any);
  }, [collectionName]);

  const remove = useCallback(async (id: string) => {
    return deleteDoc(doc(db, collectionName, id));
  }, [collectionName]);

  return { data, loading, add, update, remove };
}
