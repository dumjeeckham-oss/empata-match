import { useState } from "react";
import { useCollection } from "@/hooks/useFirestore";
import { type ServiceUser, type Worker, type MatchResult, VOUCHER_HOURS } from "@/types";
import { matchUserWithWorkers } from "@/lib/matching";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const Matching = () => {
  const { data: users } = useCollection<ServiceUser>("users");
  const { data: workers } = useCollection<Worker>("workers");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [results, setResults] = useState<MatchResult[]>([]);

  const availableUsers = users.filter((u) => u.contractStatus !== "계약해지");
  const availableWorkers = workers.filter((w) => w.contractStatus !== "퇴사");
  const selectedUser = users.find((u) => u.id === selectedUserId);

  const runMatching = () => {
    if (!selectedUser) return;
    const res = matchUserWithWorkers(selectedUser, availableWorkers);
    setResults(res);
  };

  return (
    <div>
      <h1 className="page-header">이용자-활동지원사 매칭</h1>

      <Card className="mb-6">
        <CardHeader><CardTitle className="text-base">매칭 기준 안내</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>🔹 <strong>시간 적합도 (최대 40점)</strong>: 이용자 필요 요일/시간과 활동지원사 가능 요일/시간의 일치도</p>
          <p>🔹 <strong>위치 근접도 (최대 30점)</strong>: 카카오맵 기반 주소 간 직선거리 (1km 이내 30점, 3km 25점, 5km 20점, 10km 10점)</p>
          <p>🔹 <strong>선호도 반영 (최대 20점)</strong>: 이용자가 선호하는 활동지원사 특성 (성별, 운전, 경력 등) 반영</p>
          <p>🔹 <strong>거부조건 필터</strong>: 활동지원사의 거부 성향(성인/남성/흡연자 등)과 이용자 환경 불일치 시 매칭에서 제외</p>
          <p>🔹 <strong>계약 상태</strong>: 계약해지 이용자 및 퇴사 활동지원사는 매칭에서 자동 제외</p>
        </CardContent>
      </Card>

      <div className="flex gap-4 items-end mb-6">
        <div className="flex-1 max-w-md">
          <label className="text-sm font-medium mb-1 block">이용자 선택</label>
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger><SelectValue placeholder="이용자를 선택하세요" /></SelectTrigger>
            <SelectContent>
              {availableUsers.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name} ({u.gender}, {u.age}세, {u.disabilityType}, {u.voucherTier}구간)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={runMatching} disabled={!selectedUserId}>🔍 매칭 실행</Button>
      </div>

      {selectedUser && (
        <Card className="mb-6 bg-muted/30">
          <CardContent className="p-4">
            <h3 className="font-semibold mb-2">선택된 이용자 정보</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <span><strong>이름:</strong> {selectedUser.name}</span>
              <span><strong>장애유형:</strong> {selectedUser.disabilityType}</span>
              <span><strong>바우처:</strong> {selectedUser.voucherTier}구간 ({VOUCHER_HOURS[selectedUser.voucherTier]}시간)</span>
              <span><strong>필요요일:</strong> {selectedUser.requiredDays}</span>
              <span><strong>필요시간:</strong> {selectedUser.requiredHours}</span>
              <span><strong>주소:</strong> {selectedUser.address}</span>
              <span><strong>환경:</strong> {selectedUser.environmentTags?.join(", ") || "없음"}</span>
              <span><strong>선호:</strong> {selectedUser.preferredWorkerTraits || "없음"}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {results.length > 0 && (
        <div className="space-y-3">
          <h2 className="section-title">매칭 결과 ({results.length}명)</h2>
          {results.map((r, i) => (
            <Card key={r.worker.id} className="card-hover">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold text-primary">{i + 1}위</span>
                    <div>
                      <span className="font-semibold">{r.worker.name}</span>
                      <span className="text-sm text-muted-foreground ml-2">{r.worker.gender} · {r.worker.experience} · {r.worker.preferredArea}</span>
                    </div>
                    <Badge variant={r.worker.contractStatus === "근무중" ? "default" : "secondary"}>{r.worker.contractStatus}</Badge>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-bold text-primary">{r.score.toFixed(0)}</span>
                    <span className="text-sm text-muted-foreground">/90점</span>
                  </div>
                </div>
                <Progress value={(r.score / 90) * 100} className="mb-3 h-2" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div className="bg-muted rounded p-2">
                    <p className="text-muted-foreground">시간 적합도</p>
                    <p className="font-semibold">{r.details.timeScore.toFixed(1)} / 40</p>
                  </div>
                  <div className="bg-muted rounded p-2">
                    <p className="text-muted-foreground">위치 근접도</p>
                    <p className="font-semibold">{r.details.locationScore.toFixed(1)} / 30</p>
                    {r.details.distanceKm !== null && <p className="text-xs text-muted-foreground">{r.details.distanceKm.toFixed(1)}km</p>}
                  </div>
                  <div className="bg-muted rounded p-2">
                    <p className="text-muted-foreground">선호도 반영</p>
                    <p className="font-semibold">{r.details.preferenceScore.toFixed(1)} / 20</p>
                  </div>
                  <div className="bg-muted rounded p-2">
                    <p className="text-muted-foreground">연락처</p>
                    <p className="font-semibold">{r.worker.phone}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {results.length === 0 && selectedUserId && (
        <Card><CardContent className="p-8 text-center text-muted-foreground">매칭 실행 버튼을 눌러주세요.</CardContent></Card>
      )}
    </div>
  );
};

export default Matching;
