import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import dongbaekLogo from "@/assets/dongbaek-logo.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

const Login = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setError("이메일 또는 비밀번호가 올바르지 않습니다.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted">
      <Card className="w-full max-w-md animate-fade-in">
        <CardHeader className="text-center pb-2">
          <img src={dongbaekLogo} alt="동백 장애인활동지원센터" className="h-16 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-foreground">장애인활동지원센터 매칭 프로그램</h1>
          <p className="text-sm text-muted-foreground mt-1">직원 전용 시스템입니다</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">이메일</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" required />
            </div>
            <div>
              <Label htmlFor="password">비밀번호</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="비밀번호" required />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "로그인 중..." : "로그인"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
