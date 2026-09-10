import { describe, expect, it } from "vitest";
import { buildWaitingUserLedgerRows, formatDesiredServiceTime } from "@/lib/waitingUserLedger";
import type { MatchingHistoryRecord, ServiceUser } from "@/types";

const user = {
  id: "user-1", name: "홍길동", age: 60, gender: "남성", disabilityType: "뇌병변",
  voucherTier: 0, voucherTierLabel: "특례 지원 구간", voucherHours: 90, provinceAdditionalHours: 10, cityAdditionalHours: 5,
  receiptDate: "2026-08-26", requiredDays: "월·금", requiredHours: "오전 9~12시",
  weeklySchedule: [{ day: "월", slots: [18, 19, 20, 21, 22, 23] }, { day: "금", slots: [28, 29, 30, 31] }],
  supportTypes: ["신체지원", "가사지원", "목욕"], movementNote: "휠체어 이동",
  houseworkNote: "반찬 조리", preferredWorkerTraits: "여성 지원사", notes: "차량 지원 희망",
} as ServiceUser;

const attempts: MatchingHistoryRecord[] = [
  {
    id: "attempt-2", type: "실패", userId: "user-1", userName: "홍길동", userPhone: "",
    workerId: "worker-2", workerName: "지원사2", workerPhone: "", date: "2026-09-05",
    attemptDate: "2026-09-05", attemptResult: "시간대 불일치",
  },
  {
    id: "attempt-1", type: "시도", userId: "user-1", userName: "홍길동", userPhone: "",
    workerId: "worker-1", workerName: "지원사1", workerPhone: "", date: "2026-09-01",
    attemptDate: "2026-09-01", attemptResult: "유선 연락 후 검토 중",
  },
];

describe("waiting user Word ledger data", () => {
  it("uses clicked weekly slots for 희망 제공시간", () => {
    expect(formatDesiredServiceTime(user)).toBe("월 09:00~12:00\n금 14:00~16:00");
  });

  it("uses receipt date first, then ordered matching attempts and results", () => {
    const rows = buildWaitingUserLedgerRows([user], attempts);
    expect(rows).toHaveLength(5);
    expect(rows[0].name).toContain("홍길동");
    expect(rows[0].stage).toBe("초기 상담");
    expect(rows[0].consultationDate).toBe("2026-08-26");
    expect(rows[0].desiredServiceTime).toContain("월 09:00~12:00");
    expect(rows[0].supportTypes).toContain("■ 목욕");
    expect(rows[0].disabilityVoucher).toContain("특례 지원 구간");
    expect(rows[0].consultationContent).toContain("[주소]");
    expect(rows[1]).toMatchObject({ stage: "2차 상담", consultationDate: "2026-09-01" });
    expect(rows[1].consultationContent).toContain("2차: 활동지원사 지원사1 매칭 시도");
    expect(rows[2]).toMatchObject({ stage: "3차 상담", consultationDate: "2026-09-05" });
    expect(rows[2].consultationContent).toContain("3차: 활동지원사 지원사2 매칭 실패");
  });

  it("filters users by receipt or attempt date in the selected range", () => {
    expect(buildWaitingUserLedgerRows([user], attempts, { startDate: "2026-09-01", endDate: "2026-09-03" })[1].consultationDate).toBe("2026-09-01");
    expect(buildWaitingUserLedgerRows([user], attempts, { startDate: "2027-01-01", endDate: "2027-01-31" })).toEqual([]);
  });
});