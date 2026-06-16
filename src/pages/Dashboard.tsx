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

  const activeUsers = users.filter((u) => u.contractStatus === "서비스중");
  const waitingUsers = users.filter((u) => u.contractStatus === "대기");
  const activeWorkers = workers.filter((w) => w.contractStatus === "근무중");
  const waitingWorkers = workers.filter((w) => w.contractStatus === "대기");

  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const newThisWeek = activeUsers.filter((u) => {
    if (!u.serviceStartDate) return false;
    try {
      return isWithinInterval(parseISO(u.serviceStartDate), { start: weekStart, end: weekEnd });
    } catch { return false; }
  });

  const availableWorkers = workers.filter((w) => w.contractStatus !== "퇴사");
  
  const topMatches = waitingUsers.map(u => {
    const results = matchUserWithWorkers(u, availableWorkers);
    return { user: u, bestMatch: results.length > 0 ? results[0] : null };
  }).filter(m => m.bestMatch && m.bestMatch.score >= 70)
    .sort((a, b) => b.bestMatch!.score - a.bestMatch!.score)
    .slice(0, 5);

  // 월별 통계 데이터 생성 (최근 6개월)
  const last6Months = eachMonthOfInterval({
    start: subMonths(now, 5),
    end: now
  });

  const monthlyStats = last6Months.map(month => {
    const monthStr = format(month, 'yyyy-MM');
    const termCount = terminations.filter(d => d.date?.startsWith(monthStr)).length;
    const handCount = handovers.filter(d => d.handoverDate?.startsWith(monthStr)).length;
    return {
      name: format(month, 'M월'),
      종결: termCount,
      인계: handCount
    };
  });

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
            <p className="text-sm text-muted-foreground">대기중 이용자</p>
            <p className="text-3xl font-bold text-foreground">{waitingUsers.length}</p>
          </CardContent>
        </Card>
        <Card className="stat-card border-l-4 border-l-info cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => navigate("/workers?status=대기")}>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">대기중 활동지원사</p>
            <p className="text-3xl font-bold text-foreground">{waitingWorkers.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* 월별 행정 현황 차트 */}
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

      {topMatches.length > 0 && (
        <Card className="border-primary/50 border-2">
          <CardHeader><CardTitle className="text-lg">✨ 대기 이용자 추천 매칭 (Top 5)</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {topMatches.map(({ user: u, bestMatch }) => (
                <div key={u.id} className="p-4 rounded-lg bg-muted/50 border flex flex-col gap-2 hover:border-primary/50 transition-colors">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-bold text-lg">{u.name}</span>
                      <span className="text-sm text-muted-foreground ml-2">이용자 ({u.address?.split(' ').slice(0, 2).join(' ')})</span>
                    </div>
                    <Badge variant="default">{bestMatch!.score.toFixed(0)}점</Badge>
                  </div>
                  <div className="text-sm">
                    <p>추천: <span className="font-medium text-primary">{bestMatch!.worker.name}</span> 활동지원사</p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      거리: {bestMatch!.details.distanceKm !== null ? `${bestMatch!.details.distanceKm.toFixed(1)}km` : '알수없음'} 
                      &nbsp;|&nbsp; 시간점수: {bestMatch!.details.timeScore.toFixed(0)}점
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
