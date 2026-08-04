import { useEffect, useState } from "react";

export interface DuplicateNameMatch {
  id: string;
  name: string;
  phone?: string;
}

/**
 * 이름 입력값을 디바운스(400ms)하여 동명이인 후보를 찾아 반환합니다.
 * - 저장 시점이 아니라 입력 중에 즉시 경고를 표시하기 위한 용도입니다.
 * - editingId 본인은 항상 제외합니다.
 */
export function useDuplicateNameCheck<T extends { id: string; name?: string; phone?: string }>(
  name: string,
  items: T[],
  editingId: string | null,
  delay = 400
): { checking: boolean; duplicates: DuplicateNameMatch[] } {
  const [debounced, setDebounced] = useState("");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const trimmed = (name || "").trim();
    if (!trimmed) {
      setDebounced("");
      setChecking(false);
      return;
    }
    setChecking(true);
    const timer = setTimeout(() => {
      setDebounced(trimmed);
      setChecking(false);
    }, delay);
    return () => clearTimeout(timer);
  }, [name, delay]);

  const duplicates = !debounced
    ? []
    : (items || [])
        .filter((it) => it?.id && it.id !== editingId && (it.name || "").trim() === debounced)
        .map((it) => ({ id: it.id, name: it.name || "", phone: it.phone }));

  return { checking, duplicates };
}
