export const MAX_STROKES_BYTES = 512 * 1024;
export type MemoTargetType = "이용자" | "활동지원사";
export type HandwritingStroke = { id: string; width: 2 | 4 | 7; points: [number, number, number][] };
export type HandwritingMemo = {
  id: string;
  schemaVersion: 1;
  targetType: MemoTargetType;
  targetId: string;
  targetKey: string;
  counselingRecordId: string;
  createdBy: string;
  updatedBy: string;
  createdAt: unknown;
  updatedAt: unknown;
  revision: number;
  width: number;
  height: number;
  strokesJson: string;
  transcribedRevision: number;
  transcribedAt: unknown;
  /** Optional only for pre-V2 in-memory drafts; API writes explicit V2 defaults. */
  transcribedCounselingRevision?: number;
  confirmedBy?: string;
  confirmedAt?: unknown;
};

export function encodeStrokes(strokes: HandwritingStroke[]): string {
  const json = JSON.stringify(strokes);
  if (new TextEncoder().encode(json).byteLength > MAX_STROKES_BYTES) throw new Error("이 메모의 저장 용량 한도에 도달했습니다. 전사 후 새 메모를 작성해 주세요.");
  return json;
}

export function decodeStrokes(json: string, width: number, height: number): HandwritingStroke[] {
  if (typeof json !== "string" || json.length > MAX_STROKES_BYTES || !/^[ -~]*$/.test(json)) throw new Error("손글씨 데이터를 읽을 수 없습니다.");
  const strokes: unknown = JSON.parse(json);
  if (!Array.isArray(strokes) || strokes.length > 3000) throw new Error("손글씨 데이터를 읽을 수 없습니다.");
  let count = 0;
  for (const stroke of strokes) {
    if (!stroke || typeof stroke.id !== "string" || !/^[\w-]{1,80}$/.test(stroke.id) || ![2, 4, 7].includes(stroke.width) || !Array.isArray(stroke.points) || !stroke.points.length) throw new Error("손글씨 데이터를 읽을 수 없습니다.");
    count += stroke.points.length;
    if (count > 50000) throw new Error("이 메모의 필기량 한도에 도달했습니다.");
    for (const point of stroke.points) {
      if (!Array.isArray(point) || point.length !== 3 || point.some(n => typeof n !== "number" || !Number.isFinite(n)) || point[0] < 0 || point[0] > width || point[1] < 0 || point[1] > height || point[2] < 0 || point[2] > 1) throw new Error("손글씨 데이터를 읽을 수 없습니다.");
    }
  }
  return strokes as HandwritingStroke[];
}

export function timestampMillis(value: unknown): number {
  if (value && typeof (value as { toMillis?: unknown }).toMillis === "function") return (value as { toMillis: () => number }).toMillis();
  if (value instanceof Date) return value.getTime();
  return 0;
}

export function isStaleMemo(createdAt: number, now = Date.now()): boolean {
  return createdAt > 0 && now - createdAt >= 3 * 86400000;
}

export function memoTargetKey(type: MemoTargetType, id: string): string {
  return `${type === "이용자" ? "user" : "worker"}:${id}`;
}

export type HandwritingRecovery = "CONFLICT" | "REMOTE_DELETED_WITH_LOCAL_CHANGES";
export type LocalHandwritingDraft = { memo: HandwritingMemo; strokes: HandwritingStroke[]; savedOnServer: boolean; generation: number; recovery?: HandwritingRecovery; recoveryRecordId?: string; lastWriteAt?: number };
// 메모리 복구만 사용한다. localStorage/IndexedDB/Firestore 영구 캐시를 사용하지 않는다.
const drafts = new Map<string, LocalHandwritingDraft>();
const listeners = new Set<(id: string | null, uid?: string) => void>();
export const getHandwritingDraft = (uid: string, id: string) => drafts.get(`${uid}:${id}`);
export const getTargetHandwritingDrafts = (uid: string, targetKey: string) => [...drafts.entries()].filter(([key, draft]) => key.startsWith(`${uid}:`) && draft.memo.targetKey === targetKey).map(([, draft]) => draft);
export const setHandwritingDraft = (uid: string, draft: LocalHandwritingDraft) => drafts.set(`${uid}:${draft.memo.id}`, draft);
/** Only call with a server-confirmed (not cached/pending-write) target query. */
export function reconcileHandwritingDrafts(uid: string, targetKey: string, server: HandwritingMemo[]): HandwritingMemo[] {
  const values = new Map(server.map(memo => [memo.id, memo]));
  for (const local of getTargetHandwritingDrafts(uid, targetKey)) {
    const remote = values.get(local.memo.id);
    if (!remote && local.savedOnServer && !local.generation) {
      // Do not broadcast a local cache eviction to an actively dirty hook.
      drafts.delete(`${uid}:${local.memo.id}`);
      continue;
    }
    if (local.generation) {
      if (!remote && local.savedOnServer) local.recovery = "REMOTE_DELETED_WITH_LOCAL_CHANGES";
      else if (remote && remote.revision !== local.memo.revision) local.recovery = "CONFLICT";
      values.set(local.memo.id, local.memo);
    } else if (!remote && !local.savedOnServer) values.set(local.memo.id, local.memo);
    else if (remote) drafts.delete(`${uid}:${local.memo.id}`);
  }
  return [...values.values()];
}
export function clearHandwritingDraft(uid: string, id: string): void {
  drafts.delete(`${uid}:${id}`);
  listeners.forEach(listener => listener(id, uid));
}
export function clearAllHandwritingDrafts(): void {
  drafts.clear();
  listeners.forEach(listener => listener(null));
}
export function onHandwritingDraftCleared(listener: (id: string | null, uid?: string) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
