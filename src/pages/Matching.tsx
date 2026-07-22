import { Checkbox } from "@/components/ui/checkbox";
import { useMemo, useState, useEffect } from "react";
import { useCollection } from "@/hooks/useFirestore";
import { type ServiceUser, type Worker, type MatchResult, type CounselingRecord, SUPPORT_TYPES, VOUCHER_HOURS } from "@/types";
import { matchUserWithWorkers } from "@/lib/matching";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { USERS_COLLECTION, WORKERS_COLLECTION } from "@/lib/collectionNames";
import { useNavigate, useSearchParams } from "react-router-dom";

const Matching = () => {
  const { data: users } = useCollection<ServiceUser>(USERS_COLLECTION);
  const { data: workers } = useCollection<Worker>(WORKERS_COLLECTION);
  const { data: counselingRecords } = useCollection<CounselingRecord>("counseling");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [nameSearch, setNameSearch] = useState<string>("");
  const [filterForeigners, setFilterForeigners] = useState(false);
  const [filterWeekend, setFilterWeekend] = useState(false);
  const [supportFilters, setSupportFilters] = useState<string[]>([]);
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
  const [results, setResults] = useState<MatchResult[]>([]);

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

  // 전역 추천 매칭: 대기 이용자별 상위 3명 지원사 (이용자 미선택 시 표시)
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

  return (
    <div>
      <h1 className="page-header">이용자-활동지원사 매칭</h1>

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

              <div>
                <h3 className="font-bold text-base text-foreground mb-3">💡 매칭 추천 결과 (상위 3) ({displayedResults.length}명)</h3>
                {displayedResults.length > 0 ? (
                  <div className="space-y-3">
                    {displayedResults.map((r, i) => (
                      <Card key={r.worker.id} className="card-hover">
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
    </div>
  );
};

export default Matching;