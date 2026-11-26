import { describe, expect, it } from "vitest";
import { indexTerminationHistory } from "@/lib/terminationHistory";
import type { ServiceUser, TerminationDocument } from "@/types";

describe("종결 이력 이용자 연결", () => {
  it("동명이인은 이용자 ID로 구분하고 이력을 최신순으로 정렬한다", () => {
    const users = [{ id: "a", name: "홍길동", phone: "010-1111-1111" }, { id: "b", name: "홍길동", phone: "010-2222-2222" }] as ServiceUser[];
    const docs = [{ userId: "a", userName: "홍길동", userPhone: "01011111111", date: "2025-01-01" }, { userId: "b", userName: "홍길동", userPhone: "01022222222", date: "2026-01-01" }, { userId: "a", userName: "홍길동", userPhone: "", date: "2026-02-01" }] as TerminationDocument[];
    const index = indexTerminationHistory(users, docs);
    expect(index.get("a")?.map((doc) => doc.date)).toEqual(["2026-02-01", "2025-01-01"]);
    expect(index.get("b")).toEqual([docs[1]]);
  });
  it("기존 ID가 없는 문서는 이름과 연락처가 유일하게 일치할 때만 표시한다", () => {
    const first = { id: "a", name: "홍길동", phone: "010-1111-1111" } as ServiceUser;
    const legacy = { userId: "", userName: "홍길동", userPhone: "01011111111", date: "2026-01-01" } as TerminationDocument;
    expect(indexTerminationHistory([first], [legacy]).get("a")).toEqual([legacy]);
    expect(indexTerminationHistory([first, { ...first, id: "b" }], [legacy]).size).toBe(0);
  });
});
