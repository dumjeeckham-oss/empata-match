import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildWaitingUserLedgerWorkbook } from "@/lib/waitingUserLedger";
import type { CounselingRecord, ServiceUser } from "@/types";

const user = {
  id: "user-1", name: "홍길동", age: 60, gender: "남성", disabilityType: "뇌병변",
  voucherTier: 1, voucherHours: 90, provinceAdditionalHours: 10, cityAdditionalHours: 5,
  requiredDays: "월·금", requiredHours: "오전 9~12시", supportTypes: ["신체활동"], notes: "차량 지원 희망",
} as ServiceUser;
const counseling = {
  targetType: "이용자", targetId: "user-1", targetName: "홍길동", counselorName: "담당자",
  date: "2026-09-01", category: "방문상담", content: "초기 상담 내용", result: "매칭 대기",
} as CounselingRecord;

describe("buildWaitingUserLedgerWorkbook", () => {
  it("creates five consultation rows per waiting user with merged profile cells", () => {
    const workbook = buildWaitingUserLedgerWorkbook([user], [counseling]);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
    expect(matrix).toHaveLength(8);
    expect(matrix[0][0]).toBe("이용자 매칭 상담 대장");
    expect(matrix[3][0]).toContain("홍길동");
    expect(matrix[3][1]).toContain("105시간");
    expect(matrix[3][4]).toBe("초기상담");
    expect(matrix[3][7]).toBe("■ 대면상담");
    expect(matrix[7][4]).toBe("5차상담");
    expect(sheet["!merges"]).toContainEqual({ s: { r: 3, c: 0 }, e: { r: 7, c: 0 } });
  });
});
