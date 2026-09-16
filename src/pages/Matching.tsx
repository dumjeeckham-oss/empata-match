import { Checkbox } from "@/components/ui/checkbox";
import { useMemo, useState, useEffect } from "react";
import { useCollection } from "@/hooks/useFirestore";
import { type ServiceUser, type Worker, type MatchResult, type CounselingRecord, type MatchingHistoryRecord, SUPPORT_TYPES, VOUCHER_HOURS } from "@/types";
import { matchUserWithWorkers } from "@/lib/matching";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { USERS_COLLECTION, WORKERS_COLLECTION, MATCHING_HISTORY_COLLECTION } from "@/lib/collectionNames";
import { useNavigate, useSearchParams } from "react-router-dom";
import { daysBetween, isWithinRecentMonths, percent } from "@/lib/dashboardStats";

const FAILURE_REASONS = ["거주지 거리 멀음", "시간대 불일치", "이용자 거부", "지원사 거부", "케어 난이도", "기타"] as const;
const FAILURE_SCORE_DELTA = 25;

const getHistoryStatus = (record: MatchingHistoryRecord) => {
  if (record.status) return record.status;
  if (record.type === "매칭") return "매칭 완료";
  if (record.type === "실패") return "매칭 실패";
  if (record.type === "시도") return "매칭 시도중";
  return "해제";
};

const getPairRejectionScore = (user: ServiceUser | undefined, worker: Worker | undefined) => {
  if (!user?.id || !worker?.id) return 0;
  const userScore = Number(user.rejectionScores?.[worker.id] || 0);
  const workerScore = Number(worker.rejectionScores?.[user.id] || 0);
  const score = Math.max(userScore, workerScore);
  return Number.isFinite(score) ? score : 0;
};

const Matching = () => {
  const { data: usersRaw, update: updateUser, loading, error: usersError } = useCollection<ServiceUser>(USERS_COLLECTION);
  const { data: workersRaw, update: updateWorker, error: workersError } = useCollection<Worker>(WORKERS_COLLECTION);
  const { data: counselingRecordsRaw } = useCollection<CounselingRecord>("counseling");
  const { data: matchingHistoryRaw, add: addMatchingHistory } = useCollection<MatchingHistoryRecord>(MATCHING_HISTORY_COLLECTION);
  const users = usersRaw || [];
  const workers = workersRaw || [];
  const counselingRecords = counselingRecordsRaw || [];
  const matchingHistory = matchingHistoryRaw || [];

  const [nameSearch, setNameSearch] = useState<string>("");
  const [filterForeigners, setFilterForeigners] = useState(false);
  const [filterWeekend, setFilterWeekend] = useState(false);
  const [supportFilters, setSupportFilters] = useState<string[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [results, setResults] = useState<MatchResult[]>([]);
  const [detailWorker, setDetailWorker] = useState<Worker | null>(null);
  const [manualSearch, setManualSearch] = useState<string>("");
  const [manualWorkerId, setManualWorkerId] = useState<string>("");
  const [summaryModal, setSummaryModal] = useState<{
    title: string;
    rows: Array<{ id: string; name: string; date: string; status: string; note: string; userId?: string; workerId?: string }>;
  } | null>(null);
  const [failureDialog, setFailureDialog] = useState<{ user: ServiceUser & { id: string }; worker: Worker & { id: string }; score: number } | null>(null);
  const [failureReason, setFailureReason] = useState<string>(FAILURE_REASONS[0]);
  const [failureDetail, setFailureDetail] = useState("");

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const uid = searchParams.get("userId");
    if (uid) {
      setSelectedUserId(uid);
    }
  }, [searchParams]);

  const toggleSupportFilter = (type: string) => {
    setSupportFilters((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const openWorkerDetail = (worker: Worker) => {
    setDetailWorker(worker);
  };

  const closeWorkerDetail = () => {
    setDetailWorker(null);
  };

  const openFailureDialog = (worker: Worker, score: number) => {
    if (!selectedUser?.id || !worker.id) return;
    setFailureReason(FAILURE_REASONS[0]);
    setFailureDetail("");
    setFailureDialog({ user: selectedUser as ServiceUser & { id: string }, worker: worker as Worker & { id: string }, score });
  };

  const saveMatchingFailure = async () => {
    if (!failureDialog) return;
    const { user, worker } = failureDialog;
    const previousUserScores = user.rejectionScores || {};
    const previousWorkerScores = worker.rejectionScores || {};
    const nextUserScores = {
      ...previousUserScores,
      [worker.id]: Number(previousUserScores[worker.id] || 0) + FAILURE_SCORE_DELTA,
    };
    const nextWorkerScores = {
      ...previousWorkerScores,
      [user.id]: Number(previousWorkerScores[user.id] || 0) + FAILURE_SCORE_DELTA,
    };
    const detail = failureDetail.trim();
    await addMatchingHistory({
      type: "실패",
      status: "매칭 실패",
      userId: user.id,
      userName: user.name,
      userPhone: user.phone,
      workerId: worker.id,
      workerName: worker.name,
      workerPhone: worker.phone,
      date: new Date().toISOString().slice(0, 10),
      failureReason,
      reasonDetail: detail || undefined,
      rejectionScoreDelta: FAILURE_SCORE_DELTA,
      notes: [failureReason, detail].filter(Boolean).join(" - "),
    });
    await updateUser(user.id, { rejectionScores: nextUserScores });
    await updateWorker(worker.id, { rejectionScores: nextWorkerScores });
    setFailureDialog(null);
    toast({ title: "매칭 실패 이력 저장", description: "이 조합의 거부점수가 추천 결과에 반영됩니다." });
  };

  const waitingUsers = users.filter((u) => u.contractStatus === "대기");
  const waitingWorkers = workers.filter((w) => w.contractStatus === "대기");
  const selectedUser = users.find((u) => u.id === selectedUserId);

  const filteredUsers = waitingUsers.filter((u) =>
    u.name.toLowerCase().includes(nameSearch.toLowerCase())
  );

  const filteredWorkers = useMemo(() => {
    return waitingWorkers.filter((w) => {
      if (filterForeigners && !w.isForeigner) return false;
      if (filterWeekend) {
        const hasWeekend = String(w.availableDays || "").includes("토") || String(w.availableDays || "").includes("일") ||
          (w.weeklySchedule?.some((d) => d.day === "토" || d.day === "일"));
        if (!hasWeekend) return false;
      }
      if (supportFilters.length > 0 && !w.supportTypes?.some((t) => supportFilters.includes(t))) return false;
      return true;
    });
  }, [waitingWorkers, filterForeigners, filterWeekend, supportFilters]);

  const globalTopMatches = useMemo(() => {
    return waitingUsers.map(u => {
      const matchResults = matchUserWithWorkers(u, filteredWorkers);
      const top3 = matchResults.slice(0, 3);
      return { user: u, top3 };
    }).filter(m => m.top3.length > 0 && m.top3[0].score >= 50)
      .sort((a, b) => b.top3[0].score - a.top3[0].score)
      .slice(0, 3);
  }, [waitingUsers, filteredWorkers]);

  const runMatching = () => {
    if (!selectedUser) return;
    const res = matchUserWithWorkers(selectedUser, filteredWorkers);
    setResults(res);
  };

  const handleSelectUser = (userId: string) => {
    setSelectedUserId(userId);
    setResults([]);
    navigate(`/matching?userId=${userId}`);
  };

  useEffect(() => {
    if (selectedUserId && filteredWorkers.length > 0) {
      const u = users.find(u => u.id === selectedUserId);
      if (u) {
        const res = matchUserWithWorkers(u, filteredWorkers);
        setResults(res);
      }
    }
  }, [selectedUserId, filteredWorkers, users]);

  const selectedUserRecords = counselingRecords
    .filter((r) => r.targetId === selectedUserId)
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const displayedResults = results.slice(0, 3);

  // 수동 매칭: 특정 활동지원사를 직접 선택해 점수를 확인
  const allScored = useMemo(() => {
    if (!selectedUser) return [];
    return matchUserWithWorkers(selectedUser, filteredWorkers);
  }, [selectedUser, filteredWorkers]);

  const manualCandidates = allScored.filter((r) =>
    (r.worker.name || "").toLowerCase().includes(manualSearch.toLowerCase())
  );
  const manualSelected = allScored.find((r) => r.worker.id === manualWorkerId);

  const matchingSummary = useMemo(() => {
    const successful = matchingHistory.filter((record) => record.type === "매칭" || record.status === "매칭 완료");
    const attempts = matchingHistory.filter((record) => record.type === "시도" || record.status === "매칭 시도중");
    const failures = matchingHistory.filter((record) => record.type === "실패" || record.status === "매칭 실패");
    const recentSuccessful = successful.filter((record) => isWithinRecentMonths(record.date));
    const recentAttempts = attempts.filter((record) => isWithinRecentMonths(record.date));
    const recentFailures = failures.filter((record) => isWithinRecentMonths(record.date));
    const successRate = percent(recentSuccessful.length, recentSuccessful.length + recentAttempts.length + recentFailures.length);
    const durations = successful
      .map((record) => {
        const user = users.find((u) => u.id === record.userId);
        return daysBetween(user?.receiptDate || user?.createdAt, record.date);
      })
      .filter((value): value is number => value !== null);
    const avgDays = durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0;
    const possibleRatio = waitingUsers.length ? percent(filteredWorkers.length, waitingUsers.length) : 0;
    return {
      totalSuccess: successful.length,
      recentSuccess: recentSuccessful.length,
      recentFailure: recentFailures.length,
      successRate,
      avgDays,
      possibleRatio,
      waitingUserCount: waitingUsers.length,
      possibleWorkerCount: filteredWorkers.length,
    };
  }, [matchingHistory, users, waitingUsers.length, filteredWorkers.length]);

  const openMatchingSummaryModal = (kind: "success" | "waiting" | "failure") => {
    if (kind === "success") {
      const rows = users.flatMap((user) => {
        const helperIds = user.assignedHelperIds || [];
        return helperIds.map((workerId) => {
          const worker = workers.find((item) => item.id === workerId);
          const matchLog = matchingHistory
            .filter((record) => record.userId === user.id && record.workerId === workerId && record.type === "매칭")
            .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))[0];
          return {
            id: `success-${user.id}-${workerId}`,
            name: `${user.name} - ${worker?.name || "지원사 미등록"}`,
            date: matchLog?.date || user.serviceStartDate || worker?.serviceStartDate || "미등록",
            status: "서비스중",
            note: `${user.phone || "이용자 연락처 없음"} / ${worker?.phone || "지원사 연락처 없음"}`,
            userId: user.id,
            workerId,
          };
        });
      });
      setSummaryModal({ title: `매칭 성공(성사) 명단 (총 ${rows.length}쌍)`, rows });
      return;
    }

    if (kind === "failure") {
      const rows = matchingHistory
        .filter((record) => record.type === "실패" || record.status === "매칭 실패")
        .filter((record) => isWithinRecentMonths(record.date))
        .map((record) => ({
          id: `failure-${record.id || record.userId + record.workerId + record.date}`,
          name: `${record.userName || "이용자 미등록"} - ${record.workerName || "지원사 미등록"}`,
          date: record.date || "미등록",
          status: getHistoryStatus(record),
          note: [record.failureReason, record.reasonDetail, record.notes].filter(Boolean).join(" · ") || "실패 사유 미등록",
          userId: record.userId,
          workerId: record.workerId,
        }));
      setSummaryModal({ title: `최근 3개월 매칭 실패 명단 (총 ${rows.length}건)`, rows });
      return;
    }
    const waitingUserRows = waitingUsers.map((user) => ({
      id: `waiting-user-${user.id}`,
      name: user.name,
      date: user.receiptDate || "미등록",
      status: "이용자 대기",
      note: [user.requiredDays, user.requiredHours, user.preferredWorkerTraits].filter(Boolean).join(" · ") || "희망 조건 미등록",
      userId: user.id,
    }));
    const waitingWorkerRows = waitingWorkers.map((worker) => ({
      id: `waiting-worker-${worker.id}`,
      name: worker.name,
      date: worker.receiptDate || worker.serviceEndDate || "미등록",
      status: "지원사 대기",
      note: `${worker.phone || "연락처 없음"} · ${worker.preferredArea || "희망지역 미등록"}`,
      workerId: worker.id,
    }));
    setSummaryModal({ title: `매칭 대기 명단 (총 ${waitingUserRows.length + waitingWorkerRows.length}명)`, rows: [...waitingUserRows, ...waitingWorkerRows] });
  };

  const openSummaryTarget = (row: { userId?: string; workerId?: string }) => {
    setSummaryModal(null);
    if (row.userId) {
      handleSelectUser(row.userId);
      return;
    }
    if (row.workerId) {
      const worker = workers.find((item) => item.id === row.workerId);
      if (worker) openWorkerDetail(worker);
    }
  };
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">매칭 데이터를 불러오는 중입니다...</p>
        </div>
      </div>
    );
  }

  const loadError = usersError || workersError;
  if (loadError) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="border border-destructive/30 rounded-lg p-6 bg-destructive/5">
          <h2 className="text-lg font-semibold text-destructive mb-2">데이터를 불러오지 못했습니다</h2>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-header">이용자-활동지원사 매칭</h1>
      <Card className="mb-6 border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">매칭 성과 대시보드</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-7 gap-3">
            <button type="button" onClick={() => openMatchingSummaryModal("success")} className="rounded-lg border bg-muted/30 p-3 text-left transition hover:shadow-md cursor-pointer">
              <p className="text-xs text-muted-foreground">누적 매칭 성사</p>
              <p className="text-2xl font-bold text-primary">{matchingSummary.totalSuccess}</p>
            </button>
            <button type="button" onClick={() => openMatchingSummaryModal("success")} className="rounded-lg border bg-muted/30 p-3 text-left transition hover:shadow-md cursor-pointer">
              <p className="text-xs text-muted-foreground">3개월 성사</p>
              <p className="text-2xl font-bold text-primary">{matchingSummary.recentSuccess}</p>
            </button>
            <button type="button" onClick={() => openMatchingSummaryModal("failure")} className="rounded-lg border bg-muted/30 p-3 text-left transition hover:shadow-md cursor-pointer">
              <p className="text-xs text-muted-foreground">3개월 실패</p>
              <p className="text-2xl font-bold text-destructive">{matchingSummary.recentFailure}</p>
            </button>
            <button type="button" onClick={() => openMatchingSummaryModal("success")} className="rounded-lg border bg-muted/30 p-3 text-left transition hover:shadow-md cursor-pointer">
              <p className="text-xs text-muted-foreground">최근 성공률</p>
              <p className="text-2xl font-bold">{matchingSummary.successRate}%</p>
            </button>
            <button type="button" onClick={() => openMatchingSummaryModal("success")} className="rounded-lg border bg-muted/30 p-3 text-left transition hover:shadow-md cursor-pointer">
              <p className="text-xs text-muted-foreground">평균 소요 기간</p>
              <p className="text-2xl font-bold">{matchingSummary.avgDays}<span className="text-sm text-muted-foreground">일</span></p>
            </button>
            <button type="button" onClick={() => openMatchingSummaryModal("waiting")} className="rounded-lg border bg-muted/30 p-3 text-left transition hover:shadow-md cursor-pointer">
              <p className="text-xs text-muted-foreground">대기 이용자</p>
              <p className="text-2xl font-bold">{matchingSummary.waitingUserCount}</p>
            </button>
            <button type="button" onClick={() => openMatchingSummaryModal("waiting")} className="rounded-lg border bg-muted/30 p-3 text-left transition hover:shadow-md cursor-pointer">
              <p className="text-xs text-muted-foreground">가능 지원사 비율</p>
              <p className="text-2xl font-bold">{matchingSummary.possibleRatio}%</p>
              <p className="text-[11px] text-muted-foreground">{matchingSummary.possibleWorkerCount}명 가능</p>
            </button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!summaryModal} onOpenChange={(open) => !open && setSummaryModal(null)}>
        <DialogContent className="max-w-4xl w-[95vw] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{summaryModal?.title || "대상자 상세 명단"}</DialogTitle>
          </DialogHeader>
          {summaryModal && (
            <div className="overflow-x-auto">
              {summaryModal.rows.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">해당 조건에 해당하는 대상자가 없습니다.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-3">이름</th>
                      <th className="py-2 pr-3">주요 날짜</th>
                      <th className="py-2 pr-3">상태</th>
                      <th className="py-2 pr-3">비고/사유</th>
                      <th className="py-2 text-right">바로가기</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryModal.rows.map((row) => (
                      <tr key={row.id} className="border-b hover:bg-muted/40">
                        <td className="py-2 pr-3 font-medium">{row.name}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">{row.date || "미등록"}</td>
                        <td className="py-2 pr-3"><Badge variant={row.status.includes("대기") ? "secondary" : "default"}>{row.status}</Badge></td>
                        <td className="py-2 pr-3 max-w-[360px] truncate">{row.note || "-"}</td>
                        <td className="py-2 text-right"><Button size="sm" variant="outline" onClick={() => openSummaryTarget(row)}>보기</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Card className="mb-6">
        <CardHeader className="py-3">
          <CardTitle className="text-sm">매칭 기준 안내</CardTitle>
        </CardHeader>
        <CardContent className="text-xs md:text-sm text-muted-foreground space-y-1 py-2">
          <p>🔹 <strong>시간 적합도 (최대 40점)</strong>: 이용자 필요 요일/시간과 활동지원사 가능 요일/시간의 일치도</p>
          <p>🔹 <strong>위치 근접도 (최대 30점)</strong>: 카카오맵 기반 주소 간 직선거리 (1km 이내 30점, 3km 25점, 5km 20점, 10km 10점)</p>
          <p>🔹 <strong>선호도 반영 (최대 20점)</strong>: 이용자가 선호하는 활동지원사 특성 (성별, 운전, 경력 등) 반영</p>
          <p>🔹 <strong>거부조건 필터</strong>: 활동지원사의 거부 성향(성인/남성/흡연자 등)과 이용자 환경 불일치 시 매칭에서 제외</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 좌측: 필터 + 이용자 목록 */}
        <div className="space-y-4">
          <Card className="p-4 bg-muted border rounded-lg space-y-3">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex items-center gap-2">
                <Checkbox id="filterForeigners" checked={filterForeigners} onCheckedChange={(c) => setFilterForeigners(!!c)} />
                <label htmlFor="filterForeigners" className="text-sm">외국인만</label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="filterWeekend" checked={filterWeekend} onCheckedChange={(c) => setFilterWeekend(!!c)} />
                <label htmlFor="filterWeekend" className="text-sm">주말가능</label>
              </div>
            </div>
            <div className="border-t pt-2">
              <p className="text-xs font-medium text-muted-foreground mb-2">활동지원사 업무별 가능 필터</p>
              <div className="flex flex-wrap gap-2 items-center">
                {SUPPORT_TYPES.map((type) => (
                  <div key={type} className="flex items-center gap-1.5">
                    <Checkbox
                      id={`support-filter-${type}`}
                      checked={supportFilters.includes(type)}
                      onCheckedChange={() => toggleSupportFilter(type)}
                    />
                    <label htmlFor={`support-filter-${type}`} className="text-xs cursor-pointer">
                      {type}
                    </label>
                  </div>
                ))}
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              {filteredWorkers.length}명 필터된 활동지원사
            </div>
          </Card>
          <h2 className="text-base font-semibold">이용자 선택 ({filteredUsers.length}명)</h2>
          <Input
            placeholder="이름 검색..."
            value={nameSearch}
            onChange={(e) => setNameSearch(e.target.value)}
            className="w-full"
          />
          <div className="h-[300px] lg:h-[600px] overflow-y-auto border rounded-md divide-y bg-card">
            {filteredUsers.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">검색된 이용자가 없습니다.</p>
            ) : (
              filteredUsers.map((u) => (
                <button
                  key={u.id}
                  onClick={() => handleSelectUser(u.id)}
                  className={`w-full text-left p-3 hover:bg-muted/40 transition-colors flex flex-col gap-1 ${selectedUserId === u.id ? "bg-primary/5 border-l-4 border-primary" : ""}`}
                >
                  <div className="flex justify-between items-center w-full">
                    <span className="font-bold text-sm">{u.name}</span>
                    <Badge variant={u.contractStatus === "서비스중" ? "default" : "secondary"} className="text-[10px]">
                      {u.contractStatus}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {u.gender} · {u.age}세 · {u.disabilityType}
                  </span>
                  <span className="text-[11px] text-muted-foreground truncate w-full">📍 {u.address}</span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* 우측: 추천 결과 또는 선택된 이용자 상세 */}
        <div className="lg:col-span-2 space-y-6">
          {!selectedUser ? (
            /* 이용자 미선택 시: 전역 추천 매칭 1~3순위 */
            globalTopMatches.length > 0 ? (
              <div className="space-y-4">
                <h2 className="text-lg font-bold">✨ 추천 매칭 대기 이용자 (상위 3)</h2>
                {globalTopMatches.map(({ user: u, top3 }, userIdx) => (
                  <Card key={u.id} className="cursor-pointer hover:border-primary/50 transition-all" onClick={() => handleSelectUser(u.id)}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold text-primary">{userIdx + 1}순위</span>
                          <span className="font-semibold">{u.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {u.gender} · {u.age}세 · {u.disabilityType}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">클릭하여 상세 보기 →</span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span>📍 {u.address?.split(' ').slice(0, 2).join(' ') || "주소미정"}</span>
                        <span>지원유형: {u.supportTypes?.join(", ") || "미입력"}</span>
                      </div>
                      <div className="space-y-2">
                        {top3.map((r, i) => (
                          <div key={r.worker.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-bold text-primary">{i + 1}위</span>
                              <div>
                                <span className="font-medium text-sm">{r.worker.name}</span>
                                <span className="text-xs text-muted-foreground ml-2">
                                  {r.worker.gender} · {r.worker.experience}
                                </span>
                              </div>
                              <Badge variant={r.worker.contractStatus === "근무중" ? "default" : "secondary"} className="text-[10px]">
                                {r.worker.contractStatus}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3">
                              <Progress value={(r.score / 90) * 100} className="w-24 h-2" />
                              <span className="text-sm font-bold text-primary">{r.score.toFixed(0)}점</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="h-[300px] flex items-center justify-center p-8 text-center text-muted-foreground">
                <div>
                  <p className="text-lg font-medium mb-1">🔍 매칭 가능한 대기 이용자가 없습니다</p>
                  <p className="text-sm">필터 조건을 변경하거나 대기 이용자를 등록해 주세요.</p>
                </div>
              </Card>
            )
          ) : (
            /* 이용자 선택 시: 상세 정보 + 상담이력 + 매칭결과 */
            <div className="space-y-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-base font-bold">🎯 {selectedUser.name} 이용자 정보</CardTitle>
                  <Button onClick={runMatching} className="h-9">🔍 매칭 실행</Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm border-t pt-3">
                    <span><strong>성별/나이:</strong> {selectedUser.gender} / {selectedUser.age}세</span>
                    <span><strong>장애유형:</strong> {selectedUser.disabilityType}</span>
                    <span><strong>바우처:</strong> {selectedUser.voucherTier}구간 ({VOUCHER_HOURS[selectedUser.voucherTier]}시간)</span>
                    <span><strong>필요요일:</strong> {selectedUser.requiredDays}</span>
                    <span><strong>필요시간:</strong> {selectedUser.requiredHours}</span>
                    <span><strong>가족구성:</strong> {selectedUser.familyMembers || "정보없음"}</span>
                    <span><strong>지원유형:</strong> {selectedUser.supportTypes?.join(", ") || "정보없음"}</span>
                    <span className="col-span-2"><strong>환경:</strong> {selectedUser.environmentTags?.join(", ") || "없음"}</span>
                    <span className="col-span-2"><strong>선호 특성:</strong> {selectedUser.preferredWorkerTraits || "없음"}</span>
                    <span className="col-span-2 md:col-span-3"><strong>주소:</strong> {selectedUser.address}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="py-2 border-b">
                  <CardTitle className="text-sm font-semibold">📝 상담 이력 ({selectedUserRecords.length}건)</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="max-h-[220px] overflow-y-auto divide-y">
                    {selectedUserRecords.length === 0 ? (
                      <p className="p-4 text-center text-xs text-muted-foreground">기록된 상담 이력이 없습니다.</p>
                    ) : (
                      selectedUserRecords.map((r) => (
                        <div key={r.id} className="p-3 text-xs hover:bg-muted/10">
                          <div className="flex justify-between items-center mb-1">
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline" className="text-[10px] py-0">{r.category}</Badge>
                              <span className="font-semibold text-foreground">{r.counselorName || "미입력"} 상담사</span>
                            </div>
                            <span className="text-[10px] text-muted-foreground">{r.date}</span>
                          </div>
                          <p className="text-muted-foreground whitespace-pre-wrap">{r.content}</p>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="py-2 border-b">
                  <CardTitle className="text-sm font-semibold">🖐 수동 매칭 (활동지원사 직접 선택)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-3">
                  <Input
                    placeholder="활동지원사 이름 검색..."
                    value={manualSearch}
                    onChange={(e) => setManualSearch(e.target.value)}
                  />
                  <div className="max-h-[220px] overflow-y-auto border rounded-md divide-y">
                    {manualCandidates.length === 0 ? (
                      <p className="p-4 text-center text-xs text-muted-foreground">조건에 맞는 활동지원사가 없습니다.</p>
                    ) : (
                      manualCandidates.map((r) => (
                        <button
                          key={r.worker.id}
                          onClick={() => setManualWorkerId(r.worker.id)}
                          className={`w-full text-left p-2.5 text-xs hover:bg-muted/40 flex items-center justify-between gap-2 ${manualWorkerId === r.worker.id ? "bg-primary/5 border-l-4 border-primary" : ""}`}
                        >
                          <span className="flex items-center gap-2">
                            <span className="font-semibold text-sm">{r.worker.name}</span>
                            <span className="text-muted-foreground">
                              {r.worker.gender} · {r.worker.experience} · {r.worker.preferredArea || "지역미정"}
                            </span>
                          </span>
                          <span className="font-bold text-primary">{r.score.toFixed(0)}점</span>
                        </button>
                      ))
                    )}
                  </div>
                  {manualSelected && (
                    <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">
                          {manualSelected.worker.name} · {manualSelected.worker.contractStatus}
                        </span>
                        <span className="text-sm font-bold text-primary">
                          {manualSelected.score.toFixed(0)}<span className="text-xs text-muted-foreground">/90점</span>
                        </span>
                      </div>
                      <Progress value={(manualSelected.score / 90) * 100} className="h-2" />
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        <div className="bg-card rounded p-1.5">
                          <p className="text-muted-foreground">시간 적합도</p>
                          <p className="font-semibold">{manualSelected.details.timeScore.toFixed(1)} / 40</p>
                        </div>
                        <div className="bg-card rounded p-1.5">
                          <p className="text-muted-foreground">위치 근접도</p>
                          <p className="font-semibold">{manualSelected.details.locationScore.toFixed(1)} / 30</p>
                          {manualSelected.details.distanceKm !== null && (
                            <p className="text-[10px] text-muted-foreground">{manualSelected.details.distanceKm.toFixed(1)}km</p>
                          )}
                        </div>
                        <div className="bg-card rounded p-1.5">
                          <p className="text-muted-foreground">선호도 반영</p>
                          <p className="font-semibold">{manualSelected.details.preferenceScore.toFixed(1)} / 20</p>
                        </div>
                        <div className="bg-card rounded p-1.5">
                          <p className="text-muted-foreground">거부패널티</p>
                          <p className="font-semibold">{manualSelected.details.rejectionPenalty.toFixed(0)}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[11px] text-muted-foreground">
                          📍 {manualSelected.worker.address || "주소 미입력"} · 가능요일 {manualSelected.worker.availableDays || "미입력"}
                        </p>
                        {getPairRejectionScore(selectedUser, manualSelected.worker) > 0 && (
                          <Badge variant="destructive">거부점수 {getPairRejectionScore(selectedUser, manualSelected.worker)}점</Badge>
                        )}
                        <Button size="sm" variant="outline" onClick={() => openFailureDialog(manualSelected.worker, manualSelected.score)}>
                          매칭 실패 기록
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div>
                <h3 className="font-bold text-base text-foreground mb-3">💡 매칭 추천 결과 (상위 3) ({displayedResults.length}명)</h3>
                {displayedResults.length > 0 ? (
                  <div className="space-y-3">
                    {displayedResults.map((r, i) => (
                      <Card key={r.worker.id} className="card-hover" onClick={() => openWorkerDetail(r.worker)}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <span className="text-base md:text-lg font-bold text-primary">{i + 1}위</span>
                              <div>
                                <span className="font-semibold text-sm md:text-base">{r.worker.name}</span>
                                <span className="text-xs text-muted-foreground ml-2">
                                  {r.worker.gender} · {r.worker.experience} · {r.worker.preferredArea}
                                </span>
                              </div>
                              <Badge variant={r.worker.contractStatus === "근무중" ? "default" : "secondary"} className="text-[10px]">
                                {r.worker.contractStatus}
                              </Badge>
                            </div>
                            <div className="text-right">
                              <span className="text-lg font-bold text-primary">{r.score.toFixed(0)}</span>
                              <span className="text-xs text-muted-foreground">/90점</span>
                            </div>
                          </div>
                          <Progress value={(r.score / 90) * 100} className="mb-3 h-2" />
                          {getPairRejectionScore(selectedUser, r.worker) > 0 && (
                            <Badge variant="destructive" className="mb-2">실패/거부점수 {getPairRejectionScore(selectedUser, r.worker)}점 주의</Badge>
                          )}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                            <div className="bg-muted rounded p-1.5">
                              <p className="text-muted-foreground">시간 적합도</p>
                              <p className="font-semibold">{r.details.timeScore.toFixed(1)} / 40</p>
                            </div>
                            <div className="bg-muted rounded p-1.5">
                              <p className="text-muted-foreground">위치 근접도</p>
                              <p className="font-semibold">{r.details.locationScore.toFixed(1)} / 30</p>
                              {r.details.distanceKm !== null && (
                                <p className="text-[10px] text-muted-foreground">{r.details.distanceKm.toFixed(1)}km</p>
                              )}
                            </div>
                            <div className="bg-muted rounded p-1.5">
                              <p className="text-muted-foreground">선호도 반영</p>
                              <p className="font-semibold">{r.details.preferenceScore.toFixed(1)} / 20</p>
                            </div>
                            <div className="bg-muted rounded p-1.5">
                              <p className="text-muted-foreground">거부패널티</p>
                              <p className="font-semibold">{r.details.rejectionPenalty.toFixed(0)}</p>
                            </div>
                          </div>
                          <div className="mt-3 flex justify-end">
                            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); openFailureDialog(r.worker, r.score); }}>
                              매칭 실패 기록
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="p-8 text-center text-sm text-muted-foreground">매칭 실행 버튼을 눌러 결과 추천을 받으세요.</CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      <Dialog open={!!failureDialog} onOpenChange={(open) => !open && setFailureDialog(null)}>
        <DialogContent className="max-w-lg w-[95vw]" onPointerDownOutside={(event) => event.preventDefault()}>
          <DialogHeader>
            <DialogTitle>매칭 실패 기록</DialogTitle>
          </DialogHeader>
          {failureDialog && (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <p className="font-semibold">{failureDialog.user.name} - {failureDialog.worker.name}</p>
                <p className="text-muted-foreground">현재 추천점수 {failureDialog.score.toFixed(0)}점 · 저장 시 거부점수 {FAILURE_SCORE_DELTA}점 추가</p>
              </div>
              <div>
                <label className="text-sm font-medium">실패 사유</label>
                <Select value={failureReason} onValueChange={setFailureReason}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FAILURE_REASONS.map((reason) => <SelectItem key={reason} value={reason}>{reason}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">상세 사유</label>
                <Textarea value={failureDetail} onChange={(e) => setFailureDetail(e.target.value)} placeholder="필요 시 구체적인 거절/불일치 내용을 입력하세요." />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setFailureDialog(null)}>취소</Button>
                <Button onClick={saveMatchingFailure}>저장</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Matching;












