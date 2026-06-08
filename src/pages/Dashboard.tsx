import { useCollection } from "@/hooks/useFirestore";
import { type ServiceUser, type Worker, type CounselingRecord, VOUCHER_HOURS } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { startOfWeek, endOfWeek, parseISO, isWithinInterval } from "date-fns";
import { matchUserWithWorkers } from "@/lib/matching";
import { USERS_COLLECTION, WORKERS_COLLECTION } from "@/lib/collectionNames";
import { useNavigate } from "react-router-dom";

const Dashboard = () => {
  const navigate = useNavigate();
  const { data: users } = useCollection<ServiceUser>(USERS_COLLECTION);
  const { data: workers } = useCollection<Worker>(WORKERS_COLLECTION);
  const { data: records } = useCollection<CounselingRecord>("counseling");

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

  return (
    <div>
      <h1 className="page-header">대시보드</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card className="stat-card border-l-4 border-l-primary cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => navigate("/users")}>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">서비스중 이용자</p>
            <p className="text-3xl font-bold text-foreground">{activeUsers.length}</p>
          </CardContent>
        </Card>
        <Card className="stat-card border-l-4 border-l-secondary cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => navigate("/workers")}>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">근무중 활동지원사</p>
            <p className="text-3xl font-bold text-foreground">{activeWorkers.length}</p>
          </CardContent>
        </Card>
        <Card className="stat-card border-l-4 border-l-accent cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => navigate("/users")}>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">대기중 이용자</p>
            <p className="text-3xl font-bold text-foreground">{waitingUsers.length}</p>
          </CardContent>
        </Card>
        <Card className="stat-card border-l-4 border-l-info cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => navigate("/workers")}>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">대기중 활동지원사</p>
            <p className="text-3xl font-bold text-foreground">{waitingWorkers.length}</p>
          </CardContent>
        </Card>
      </div>

      {newThisWeek.length > 0 && (
        <Card className="mb-8">
          <CardHeader><CardTitle className="text-lg">📅 이번주 신규 서비스 시작 이용자</CardTitle></CardHeader>
          <CardContent>
            <div className="divide-y">
              {newThisWeek.map((u) => (
                <div key={u.id} className="py-2 flex justify-between items-center">
                  <div>
                    <span className="font-medium">{u.name}</span>
                    <span className="text-muted-foreground ml-2 text-sm">{u.gender} · {u.disabilityType} · {u.voucherTier}구간</span>
                  </div>
                  <span className="text-sm text-muted-foreground">시작일: {u.serviceStartDate}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {topMatches.length > 0 && (
        <Card className="mb-8 border-primary/50 border-2">
          <CardHeader><CardTitle className="text-lg">✨ 대기 이용자 추천 매칭 (Top 5)</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {topMatches.map(({ user: u, bestMatch }) => (
                <div key={u.id} className="p-4 rounded-lg bg-muted/50 border flex flex-col gap-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-bold text-lg">{u.name}</span>
                      <span className="text-sm text-muted-foreground ml-2">이용자 ({u.address?.split(' ').slice(0, 2).join(' ')})</span>
                    </div>
                    <Badge variant="default">{bestMatch!.score.toFixed(0)}점</Badge>
                  </div>
                  <div className="text-sm">
                    <p>추천: <span className="font-medium text-primary">{bestMatch!.worker.name}</span> 활동지원사</p>
                    <p className="text-muted-foreground mt-1">
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
            <p className="text-muted-foreground text-sm">아직 상담기록이 없습니다.</p>
          ) : (
            <div className="divide-y">
              {records.slice(0, 10).map((r) => (
                <div key={r.id} className="py-2">
                  <div className="flex justify-between">
                    <span className="font-medium">{r.targetName} ({r.targetType})</span>
                    <span className="text-sm text-muted-foreground">{r.date}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{r.content}</p>
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
