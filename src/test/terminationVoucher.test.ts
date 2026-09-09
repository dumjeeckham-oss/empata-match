import { describe, expect, it } from "vitest";
import { formatVoucherTier } from "@/lib/userVoucher";
import { OFFICIAL_TERMINATION_PROJECT_NAME, resolveTerminationWorkerRefs } from "@/lib/terminationWorkers";
import type { MatchingHistoryRecord, ServiceUser } from "@/types";

const baseUser = {
  id: "user-1", name: "홍길동", phone: "010-0000-0000", voucherTier: 0,
  voucherTierLabel: "특례 지원 구간", assignedHelperIds: [], assignedHelperNames: [], assignedHelperPhones: [],
  matchingHistory: [],
} as unknown as ServiceUser;

describe("custom voucher tier", () => {
  it("shows the directly entered tier label", () => {
    expect(formatVoucherTier(baseUser)).toBe("특례 지원 구간");
    expect(formatVoucherTier({ voucherTier: 3 })).toBe("3구간");
  });
});

describe("termination worker recovery", () => {
  it("recovers the latest worker after active assignment arrays were cleared", () => {
    const user = {
      ...baseUser,
      matchingHistory: [
        { id: "old", workerId: "worker-old", workerName: "이전지원", workerPhone: "", serviceStartDate: "2025-01-01", serviceEndDate: "2025-12-31", reason: "교체" },
        { id: "last", workerId: "worker-last", workerName: "마지막지원", workerPhone: "010-1111-2222", serviceStartDate: "2026-01-01", serviceEndDate: "2026-08-31", reason: "종료" },
      ],
    } as ServiceUser;
    const refs = resolveTerminationWorkerRefs(user, []);
    expect(refs).toEqual([{ id: "worker-last", name: "마지막지원", phone: "010-1111-2222", date: "2026-08-31" }]);
  });

  it("prefers an open document assignment over older closed periods", () => {
    const user = {
      ...baseUser,
      matchingHistory: [
        { id: "closed", workerId: "closed-worker", workerName: "종료지원", workerPhone: "", serviceStartDate: "2026-01-01", serviceEndDate: "2026-08-31", reason: "교체" },
        { id: "open", workerId: "open-worker", workerName: "마지막담당", workerPhone: "", serviceStartDate: "2026-02-01", serviceEndDate: null, reason: "추가" },
      ],
    } as ServiceUser;
    expect(resolveTerminationWorkerRefs(user, [])[0].name).toBe("마지막담당");
  });

  it("falls back to global matching history and keeps the official project name", () => {
    const records = [{
      type: "해제", userId: "user-1", userName: "홍길동", userPhone: "", workerId: "worker-2",
      workerName: "기록지원", workerPhone: "010-2222-3333", date: "2026-01-01", endDate: "2026-09-01",
    }] as MatchingHistoryRecord[];
    expect(resolveTerminationWorkerRefs(baseUser, records)[0].name).toBe("기록지원");
    expect(OFFICIAL_TERMINATION_PROJECT_NAME).toBe("부천의료복지사회적협동조합 동백 장애인활동지원센터");
  });
});

