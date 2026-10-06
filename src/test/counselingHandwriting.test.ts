import { describe, expect, it } from "vitest";
import { clearAllHandwritingDrafts, getHandwritingDraft, reconcileHandwritingDrafts, setHandwritingDraft, decodeStrokes, encodeStrokes, isStaleMemo, MAX_STROKES_BYTES, type HandwritingMemo, type HandwritingStroke } from "@/lib/counselingHandwriting";

describe("단기 손글씨 데이터", () => {
  const stroke: HandwritingStroke = { id: "test-1", width: 4, points: [[10, 20, 0.5], [30, 40, 1]] };
  it("펜 좌표를 저장하고 다시 그릴 수 있다", () => {
    expect(decodeStrokes(encodeStrokes([stroke]), 1600, 1000)).toEqual([stroke]);
  });
  it("잘못된 JSON·좌표·데이터 크기를 차단한다", () => {
    for (const value of ["<script>", "{}", '[{"id":"x","width":4,"points":[[-1,0,1]]}]', " ".repeat(MAX_STROKES_BYTES + 1)]) {
      expect(() => decodeStrokes(value, 1600, 1000)).toThrow();
    }
  });
  it("3일 이상 지난 미전사 메모만 안내 대상이다", () => {
    const now = Date.UTC(2026, 9, 2);
    expect(isStaleMemo(now - 3 * 86400000, now)).toBe(true);
    expect(isStaleMemo(now - 86400000, now)).toBe(false);
  });
  it("닫힌 clean 캐시는 서버 확인 후 제거하고 dirty 캐시는 삭제 복구 상태로 보존", () => {
    clearAllHandwritingDrafts();
    const memo = { id: "closed", targetKey: "user:fake", revision: 5 } as HandwritingMemo;
    setHandwritingDraft("staff", { memo, strokes: [stroke], savedOnServer: true, generation: 0 });
    expect(reconcileHandwritingDrafts("staff", "user:fake", [])).toEqual([]);
    expect(getHandwritingDraft("staff", "closed")).toBeUndefined();
    setHandwritingDraft("staff", { memo, strokes: [stroke], savedOnServer: true, generation: 1 });
    expect(reconcileHandwritingDrafts("staff", "user:fake", [])).toHaveLength(1);
    expect(getHandwritingDraft("staff", "closed")?.recovery).toBe("REMOTE_DELETED_WITH_LOCAL_CHANGES");
    expect(getHandwritingDraft("staff", "closed")?.strokes).toEqual([stroke]);
    clearAllHandwritingDrafts();
  });
});
