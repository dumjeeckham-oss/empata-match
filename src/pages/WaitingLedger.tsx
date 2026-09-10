import { useState } from "react";
import { useCollection } from "@/hooks/useFirestore";
import { MATCHING_HISTORY_COLLECTION, USERS_COLLECTION } from "@/lib/collectionNames";
import type { MatchingHistoryRecord, ServiceUser } from "@/types";
import { buildWaitingUserLedgerBlob, buildWaitingUserLedgerRows } from "@/lib/waitingUserLedger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

const today = new Date().toISOString().slice(0, 10);
const yearStart = today.slice(0, 4) + "-01-01";

export default function WaitingLedger() {
  const { data: usersRaw, loading: usersLoading, error: usersError } = useCollection<ServiceUser>(USERS_COLLECTION);
  const { data: recordsRaw, loading: recordsLoading, error: recordsError } = useCollection<MatchingHistoryRecord>(MATCHING_HISTORY_COLLECTION);
  const users = usersRaw || [];
  const records = recordsRaw || [];
  const [startDate, setStartDate] = useState(yearStart);
  const [endDate, setEndDate] = useState(today);

  if (usersLoading || recordsLoading) {
    return <div className="flex min-h-[280px] items-center justify-center text-muted-foreground">대기 매칭대장을 불러오는 중입니다...</div>;
  }
  if (usersError || recordsError) {
    return <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-destructive">{usersError || recordsError}</div>;
  }

  const waitingUsers = users.filter((user) =>
    user.contractStatus === "대기" || user.contractStatus === "작성중" || !(user.assignedHelperIds || []).length
  );
  const range = { startDate: startDate || undefined, endDate: endDate || undefined };
  const rows = buildWaitingUserLedgerRows(waitingUsers, records, range);

  const downloadWord = async () => {
    if (!rows.length) {
      toast({ title: "선택한 기간에 출력할 대기 기록이 없습니다." });
      return;
    }
    const blob = await buildWaitingUserLedgerBlob(waitingUsers, records, range);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "이용자_매칭_상담대장_" + today + ".docx";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <style>{'@media print { @page { size: A4 landscape; margin: 10mm; } body * { visibility: hidden; } .waiting-ledger-print, .waiting-ledger-print * { visibility: visible; } .waiting-ledger-print { position: absolute; inset: 0; width: 100%; font-size: 9pt; } .waiting-ledger-print tr { break-inside: avoid; page-break-inside: avoid; } .no-print { display: none !important; } }'}</style>
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">대기 매칭대장 미리보기</h1>
          <p className="text-sm text-muted-foreground">기간을 선택하면 최초 상담과 매칭 시도·실패 기록이 날짜순으로 표시됩니다.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div><Label htmlFor="ledger-start">시작일</Label><Input id="ledger-start" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></div>
          <div><Label htmlFor="ledger-end">종료일</Label><Input id="ledger-end" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></div>
          <Button variant="outline" onClick={downloadWord}>Word 저장</Button>
          <Button onClick={() => window.print()}>A4 인쇄</Button>
        </div>
      </div>

      <section className="waiting-ledger-print overflow-x-auto rounded-lg bg-white p-4 text-black shadow-sm">
        <h2 className="mb-4 text-center text-2xl font-bold">이용자 매칭 상담 대장</h2>
        <p className="mb-2 text-right text-xs">조회기간 {startDate || "전체"} ~ {endDate || "전체"}</p>
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-slate-100">
              {["이름", "장애유형 / 바우처", "지원종류", "희망 제공시간", "상담차수", "상담일", "상담내용 / 매칭시도 결과"].map((label) => (
                <th key={label} className="border border-black p-1.5 text-center">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.userId + "-" + String(index)}>
                <td className="whitespace-pre-line border border-black p-1.5 text-center align-middle">{row.name}</td>
                <td className="whitespace-pre-line border border-black p-1.5 text-center align-middle">{row.disabilityVoucher}</td>
                <td className="whitespace-pre-line border border-black p-1.5 align-middle">{row.supportTypes}</td>
                <td className="whitespace-pre-line border border-black p-1.5 text-center align-middle">{row.desiredServiceTime}</td>
                <td className="border border-black p-1.5 text-center align-middle">{row.stage}</td>
                <td className="border border-black p-1.5 text-center align-middle">{row.consultationDate}</td>
                <td className="whitespace-pre-line border border-black p-1.5 align-middle">{row.consultationContent}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="border border-black p-8 text-center">선택한 기간에 해당하는 기록이 없습니다.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}