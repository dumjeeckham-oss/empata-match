import { useState, useEffect, useCallback } from "react";
import { auth, db, collection, addDoc, updateDoc, deleteDoc, doc, onAuthStateChanged, onSnapshot, query, Timestamp, type QueryConstraint } from "@/lib/firebase";
import { normalizeServiceUser, normalizeWorker } from "@/lib/assignments";
import { sanitizeForFirestore } from "@/lib/bulkUpload";
import { USERS_COLLECTION, WORKERS_COLLECTION } from "@/lib/collectionNames";
import { toast } from "@/hooks/use-toast";

const EMPTY_CONSTRAINTS: QueryConstraint[] = [];

function getCacheKey(collectionName: string): string {
  return `cached_${collectionName}`;
}

function readCachedCollection<T>(collectionName: string): (T & { id: string })[] {
  if (typeof window === "undefined") return [];

  try {
    const cached = localStorage.getItem(getCacheKey(collectionName));
    if (!cached) return [];

    const parsed = JSON.parse(cached);
    if (!Array.isArray(parsed)) return [];

    return parsed.map((item, index) => {
      const raw = item as Record<string, unknown>;
      const normalized =
        collectionName === USERS_COLLECTION
          ? normalizeServiceUser(raw)
          : collectionName === WORKERS_COLLECTION
            ? normalizeWorker(raw)
            : raw;
      return {
        id: String(raw.id ?? `cached-${index}`),
        ...raw,
        ...normalized,
      } as T & { id: string };
    });
  } catch (err) {
    console.error(`Local cache read failed (${collectionName}):`, err);
    return [];
  }
}

function writeCachedCollection<T>(collectionName: string, items: (T & { id: string })[]): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(getCacheKey(collectionName), JSON.stringify(items));
  } catch (err) {
    console.error(`Local cache write failed (${collectionName}):`, err);
  }
}

export function getFirestoreErrorMessage(err: unknown): string {
  const firebaseErr = err as { code?: string; message?: string };
  const code = firebaseErr?.code ?? "";
  const message = firebaseErr?.message ?? String(err);

  if (message.includes("Database '(default)' not found") || message.includes("database") && message.includes("not found")) {
    return "Firestore 데이터베이스를 찾지 못했습니다. Firebase 콘솔에서 Firestore(Database) 생성 여부와 프로젝트 설정(projectId)이 올바른지 확인하세요.";
  }
  if (code === "failed-precondition" || message.includes("index")) {
    return "데이터를 불러오지 못했습니다. Firebase 인덱스를 확인하세요.";
  }
  if (code === "permission-denied") {
    return "데이터를 불러오지 못했습니다. Firebase 보안 규칙 또는 로그인 권한을 확인하세요.";
  }
  if (code === "unavailable" || code === "deadline-exceeded") {
    return "데이터를 불러오지 못했습니다. 네트워크 연결을 확인하세요.";
  }
  return `데이터를 불러오지 못했습니다. (${message})`;
}

export function useCollection<T>(collectionName: string, constraints: QueryConstraint[] = EMPTY_CONSTRAINTS) {
  const [data, setData] = useState<(T & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 새로고침 직후에는 auth.currentUser가 null로 보일 수 있으므로,
    // 인증 상태가 "확정"될 때까지는 데이터를 0명으로 결론내리지 않고 loading=true를 유지한다.
    setLoading(true);
    setError(null);

    let unsubSnapshot: (() => void) | undefined;

    const cleanupSnapshot = () => {
      unsubSnapshot?.();
      unsubSnapshot = undefined;
    };

    const startSnapshot = () => {
      cleanupSnapshot();
      try {
        if (!db || !db.app?.options?.projectId) {
          throw new Error("Firebase Firestore DB 객체가 아직 정상적으로 초기화되지 않았습니다.");
        }

        const q = query(collection(db, collectionName), ...constraints);
        unsubSnapshot = onSnapshot(
          q,
          (snap) => {
            try {
              const items = snap.docs.map((d) => {
                const raw = d.data() as Record<string, unknown>;
                const normalized =
                  collectionName === USERS_COLLECTION
                    ? normalizeServiceUser(raw)
                    : collectionName === WORKERS_COLLECTION
                      ? normalizeWorker(raw)
                      : raw;
                return { id: d.id, ...raw, ...normalized } as T & { id: string };
              });
              setData(items);
              writeCachedCollection(collectionName, items);
              setLoading(false);
              setError(null);
            } catch (mappingErr) {
              console.error(`Firestore snapshot mapping error (${collectionName}):`, mappingErr);
              const msg = getFirestoreErrorMessage(mappingErr);
              const cachedItems = readCachedCollection<T>(collectionName);
              setError(msg);
              setLoading(false);
              setData(cachedItems);
              toast({
                title: cachedItems.length ? "로컬 백업 데이터로 복구" : "데이터 로드 실패",
                description: cachedItems.length ? `${msg} 저장된 임시 데이터를 표시합니다.` : msg,
                variant: "destructive",
              });
            }
          },
          (err) => {
            console.error(`Firestore error (${collectionName}):`, err);
            const msg = getFirestoreErrorMessage(err);
            const cachedItems = readCachedCollection<T>(collectionName);
            setError(msg);
            setLoading(false);
            setData(cachedItems);
            toast({
              title: cachedItems.length ? "로컬 백업 데이터로 복구" : "데이터 로드 실패",
              description: cachedItems.length ? `${msg} 저장된 임시 데이터를 표시합니다.` : msg,
              variant: "destructive",
            });
          }
        );
      } catch (err) {
        console.error(`Firestore setup error (${collectionName}):`, err);
        const msg = getFirestoreErrorMessage(err);
        const cachedItems = readCachedCollection<T>(collectionName);
        setError(msg);
        setLoading(false);
        setData(cachedItems);
        toast({
          title: cachedItems.length ? "로컬 백업 데이터로 복구" : "데이터 로드 실패",
          description: cachedItems.length ? `${msg} 저장된 임시 데이터를 표시합니다.` : msg,
          variant: "destructive",
        });
      }
    };

    // 1) 인증 상태 확정 시점에만 snapshot을 시작(또는 재시작)
    const unsubAuth = onAuthStateChanged(
      auth,
      (user) => {
        cleanupSnapshot();

        if (!user) {
          // "진짜로 로그인 정보가 없는 경우" (인증 상태 확정)
          setData([]);
          setLoading(false);
          setError(null);
          return;
        }

        // 로그인 확정 → dong100 DB 인스턴스(db)로 실시간 구독 시작
        setLoading(true);
        setError(null);
        startSnapshot();
      },
      (authErr) => {
        console.error("Auth state check failed:", authErr);
        const cachedItems = readCachedCollection<T>(collectionName);
        setData(cachedItems);
        setLoading(false);
        setError("인증 상태 확인 중 오류가 발생했습니다. 다시 로그인해 주세요.");
      }
    );

    return () => {
      cleanupSnapshot();
      unsubAuth();
    };
  }, [collectionName, constraints]);

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
