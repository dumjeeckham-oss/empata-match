import { useCollection } from "@/hooks/useFirestore";
import { type ServiceUser, type Worker, type CounselingRecord, type TerminationDocument, type HandoverDocument } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { startOfWeek, endOfWeek, parseISO, isWithinInterval, format, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths } from "date-fns";
import { matchUserWithWorkers } from "@/lib/matching";
import { USERS_COLLECTION, WORKERS_COLLECTION, TERMINATIONS_COLLECTION, HANDOVERS_COLLECTION } from "@/lib/collectionNames";
import { useNavigate } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

const Dashboard = () => {
  const navigate = useNavigate();
  const { data: users } = useCollection<ServiceUser>(USERS_COLLECTION);
  const { data: workers } = useCollection<Worker>(WORKERS_COLLECTION);
  const { data: records } = useCollection<CounselingRecord>("counseling");
  const { data: terminations } = useCollection<TerminationDocument>(TERMINATIONS_COLLECTION);
  const { data: handovers } = useCollection<HandoverDocument>(HANDOVERS_COLLECTION);


  // 데이터 로딩 가드
  if (!users || !workers) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
      </div>
    );
  }

    // 최근 신규 등록 (이용자 & 활동지원사)
    const recentUsers = [...users]
      .filter((u) => u.createdAt)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
    const recentWorkers = [...workers]
      .filter((w) => w.createdAt)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);

  const activeUsers = users.filter((u) => u.contractStatus === "서비스중");
  const waitingUsers = users.filter(
    (u) =>
      u.contractStatus === "대기" &&
      (!u.assignedHelperIds || u.assignedHelperIds.length === 0)
  );
  const activeWorkers = workers.filter((w) => w.contractStatus === "근무중");
  const waitingWorkers = workers.filter(
    (w) =>
      w.contractStatus === "대기" &&
      (!w.assignedUserIds || w.assignedUserIds.length === 0)
  );

  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const newThisWeek = activeUsers.filter((u) => {
    if (!u.serviceStartDate) return false;
    try {
      return isWithinInterval(parseISO(u.serviceStartDate), { start: weekStart, end: weekEnd });
    } catch { return false; }
  });

  const availableWaitingWorkers = waitingWorkers;
  
  // Top matches: limit to top 3
  const topMatches = waitingUsers.map(u => {
    const results = matchUserWithWorkers(u, availableWaitingWorkers);
    return { user: u, bestMatch: results.length > 0 ? results[0] : null };
  }).filter(m => m.bestMatch && m.bestMatch.score >= 50)
    .sort((a, b) => b.bestMatch!.score - a.bestMatch!.score)
    .slice(0, 3);

  // 월별 통계 데이터 생성 (최근 6개월)
  const last6Months = eachMonthOfInterval({
    start: subMonths(now, 5),
    end: now
  });

  // 월별 통계: 종결 및 인계인수 데이터 집계
  const monthlyStats = last6Months.map(month => {
    const monthStr = format(month, 'yyyy-MM');
    // 종결 인원: date 기준
    const termCount = terminations.filter(d => d.date?.startsWith(monthStr)).length;
    // 인계인수 인원: handoverDate 기준
    const handCount = handovers.filter(d => d.handoverDate?.startsWith(monthStr)).length;
    return {
      name: format(month, 'M월'),
      month: monthStr,
      종결: termCount,
      인계: handCount,
      합계: termCount + handCount
    };
  });

  // 월별 통계 요약 (테이블용)
  const monthlyStatsTable = monthlyStats.map(stat => ({
    month: stat.name,
    terminated: stat.종결,
    handover: stat.인계,
    total: stat.합계
  }));

  return (
    <div className="space-y-8">
      <h1 className="page-header">대시보드</h1>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="stat-card border-l-4 border-l-primary cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => navigate("/users?status=서비스중")}>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">서비스중 이용자</p>
            <p className="text-3xl font-bold text-foreground">{activeUsers.length}</p>
          </CardContent>
        </Card>
        <Card className="stat-card border-l-4 border-l-secondary cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => navigate("/workers?status=근무중")}>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">근무중 활동지원사</p>
            <p className="text-3xl font-bold text-foreground">{activeWorkers.length}</p>
          </CardContent>
        </Card>
        <Card className="stat-card border-l-4 border-l-accent cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => navigate("/users?status=대기")}>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">대기중 이용자 (미배정)</p>
            <p className="text-3xl font-bold text-foreground">{waitingUsers.length}</p>
          </CardContent>
        </Card>
        <Card className="stat-card border-l-4 border-l-info cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => navigate("/workers?status=대기")}>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">대기중 활동지원사 (미배정)</p>
            <p className="text-3xl font-bold text-foreground">{waitingWorkers.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">📊 월별 행정 현황 (종결/인계)</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyStats}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                  cursor={{ fill: '#f1f5f9' }}
                />
                <Legend />
                <Bar dataKey="종결" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="인계" fill="hsl(var(--info))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
      </Card>

      {/* 월별 통계 테이블 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">📋 월별 종결/인계인수 현황</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3 font-semibold">월</th>
                  <th className="text-center py-2 px-3 font-semibold">종결 인원</th>
                  <th className="text-center py-2 px-3 font-semibold">인계인수 건수</th>
                  <th className="text-center py-2 px-3 font-semibold">합계</th>
                </tr>
              </thead>
              <tbody>
                {monthlyStatsTable.map((stat, idx) => (
                  <tr key={idx} className="border-b hover:bg-muted/50">
                    <td className="py-2 px-3 font-medium">{stat.month}</td>
                    <td className="text-center py-2 px-3">{stat.terminated}</td>
                    <td className="text-center py-2 px-3">{stat.handover}</td>
                    <td className="text-center py-2 px-3 font-semibold">{stat.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* 최근 신규 등록 이용자 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">👤 최근 신규 등록 이용자</CardTitle>
            <Badge variant="secondary" className="font-normal">최근 5건</Badge>
          </CardHeader>
          <CardContent>
            {recentUsers.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">신규 등록 이용자가 없습니다.</p>
            ) : (
              <div className="divide-y max-h-[250px] overflow-y-auto pr-2">
                {recentUsers.map((u) => (
                  <div key={u.id} className="py-3 flex justify-between items-center">
                    <div>
                      <span className="font-medium">{u.name}</span>
                      <span className="text-muted-foreground ml-2 text-xs">{u.gender} · {u.disabilityType}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{u.contractStatus}</Badge>
                      <span className="text-[10px] text-muted-foreground">{u.receiptDate || ""}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 최근 신규 등록 활동지원사 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">🧑‍💼 최근 신규 등록 활동지원사</CardTitle>
            <Badge variant="secondary" className="font-normal">최근 5건</Badge>
          </CardHeader>
          <CardContent>
            {recentWorkers.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">신규 등록 활동지원사가 없습니다.</p>
            ) : (
              <div className="divide-y max-h-[250px] overflow-y-auto pr-2">
                {recentWorkers.map((w) => (
                  <div key={w.id} className="py-3 flex justify-between items-center">
                    <div>
                      <span className="font-medium">{w.name}</span>
                      <span className="text-muted-foreground ml-2 text-xs">{w.gender} · {w.experience}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{w.contractStatus}</Badge>
                      <span className="text-[10px] text-muted-foreground">{w.receiptDate || ""}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 이번주 신규 서비스 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">📅 이번주 신규 서비스 시작</CardTitle>
          </CardHeader>
          <CardContent>
            {newThisWeek.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">이번 주 신규 시작 내역이 없습니다.</p>
            ) : (
              <div className="divide-y max-h-[250px] overflow-y-auto pr-2">
                {newThisWeek.map((u) => (
                  <div key={u.id} className="py-3 flex justify-between items-center">
                    <div>
                      <span className="font-medium">{u.name}</span>
                      <span className="text-muted-foreground ml-2 text-xs">{u.gender} · {u.disabilityType}</span>
                    </div>
                    <Badge variant="outline" className="text-xs">{u.serviceStartDate}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-primary/30 border-2" onClick={() => navigate("/matching")}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center justify-between">
            <span>✨ 대기 이용자 추천 매칭 (1순위)</span>
            <Badge variant="outline" className="font-normal">배정 대기자 간 자동 추천</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {topMatches.length === 0 ? (
            <div className="py-8 text-center bg-muted/30 rounded-lg border border-dashed">
              <p className="text-muted-foreground">추천하는 매칭 이용자가 없음</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {topMatches.map(({ user: u, bestMatch }, idx) => (
                <div key={u.id} className="p-4 rounded-lg bg-card border shadow-sm flex flex-col gap-3 hover:border-primary/50 transition-all cursor-pointer group" onClick={() => navigate(`/matching?userId=${u.id}`)}>
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-bold text-lg group-hover:text-primary transition-colors">{idx + 1}위</span>
                      <span className="text-sm ml-2">{u.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">({u.address?.split(' ').slice(0, 2).join(' ') || "주소미정"})</span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant="default" className="bg-primary/90">{bestMatch!.score.toFixed(0)}점</Badge>
                      <span className="text-[10px] text-muted-foreground">매칭 적합도</span>
                    </div>
                  </div>
                  <div className="bg-muted/50 p-3 rounded-md space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-1 h-1 rounded-full bg-primary" />
                      <p className="text-sm">추천 지원사: <span className="font-bold text-foreground">{bestMatch!.worker.name}</span></p>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <span>📍 거리: {bestMatch!.details.distanceKm !== null ? `${bestMatch!.details.distanceKm.toFixed(1)}km` : '알수없음'}</span>
                      <span>⏰ 시간: {bestMatch!.details.timeScore.toFixed(0)}점</span>
                      <span>⭐ 선호: {bestMatch!.details.preferenceScore.toFixed(0)}점</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-right text-muted-foreground group-hover:text-primary">클릭하여 상세 매칭 순위 보기 →</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">📋 최근 상담기록</CardTitle></CardHeader>
        <CardContent>
          {records.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">아직 상담기록이 없습니다.</p>
          ) : (
            <div className="divide-y max-h-[300px] overflow-y-auto pr-2">
              {records.slice(0, 10).map((r) => (
                <div key={r.id} className="py-3">
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-medium text-sm">{r.targetName} <Badge variant="secondary" className="ml-1 font-normal text-[10px]">{r.targetType}</Badge></span>
                    <span className="text-[11px] text-muted-foreground">{r.date}</span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{r.content}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
