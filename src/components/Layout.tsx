import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import dongbaekLogo from "@/assets/dongbaek-logo.png";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { path: "/", label: "대시보드", icon: "📊" },
  { path: "/users", label: "이용자 관리", icon: "👤" },
  { path: "/workers", label: "활동지원사 관리", icon: "🤝" },
  { path: "/matching", label: "매칭", icon: "🔗" },
  { path: "/counseling", label: "상담기록", icon: "📝" },
  { path: "/terminations", label: "종결확인서", icon: "📄" },
  { path: "/handovers", label: "인계·인수서", icon: "🔁" },
];

const Layout = ({ children }: { children: React.ReactNode }) => {
  const { logout } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-50 border-b border-border/60 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <img src={dongbaekLogo} alt="동백" className="h-8 w-auto shrink-0" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground sm:text-base">동백 활동지원센터</p>
              <p className="hidden text-xs text-muted-foreground sm:block">상담·매칭·인계 관리를 한눈에</p>
            </div>
          </div>

          <nav className="hidden flex-1 items-center justify-end gap-2 md:flex">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-2 text-sm font-medium transition-all",
                    isActive
                      ? "border-primary/20 bg-primary/10 text-primary shadow-sm"
                      : "border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground"
                  )}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="hidden rounded-full text-muted-foreground hover:text-foreground md:inline-flex"
              onClick={logout}
            >
              🚪 로그아웃
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="rounded-full text-muted-foreground hover:text-foreground md:hidden"
            >
              {mobileMenuOpen ? "✕" : "☰"}
            </Button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="border-t bg-card/95 md:hidden">
            <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-3 sm:px-6">
              {navItems.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <span className="text-base">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
              <Button
                variant="ghost"
                size="default"
                className="justify-start rounded-xl px-3 py-3 text-sm font-medium text-muted-foreground hover:text-foreground"
                onClick={logout}
              >
                🚪 로그아웃
              </Button>
            </div>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-auto">
        <div className="p-4 md:p-6 max-w-7xl mx-auto animate-fade-in">{children}</div>
      </main>
    </div>
  );
};

export default Layout;
