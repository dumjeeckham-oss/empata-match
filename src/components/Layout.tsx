import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import dongbaekLogo from "@/assets/dongbaek-logo.png";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { InstallAppButton } from "@/components/InstallAppButton";
import { getAdjacentPath, getSwipeDirection, type SwipePoint } from "@/lib/swipeNavigation";

const navItems = [
  { path: "/", label: "대시보드", icon: "📊" },
  { path: "/work-board", label: "업무 종합 보드", icon: "🗂️" },
  { path: "/users", label: "이용자 관리", icon: "👤" },
  { path: "/workers", label: "활동지원사 관리", icon: "🤝" },
  { path: "/matching", label: "매칭 관리", icon: "🔗" },
  { path: "/counseling", label: "상담기록", icon: "📝" },
  { path: "/terminations", label: "종결확인서", icon: "📄" },
  { path: "/handovers", label: "인계·인수서", icon: "🔁" },
  { path: "/manual", label: "사용 매뉴얼", icon: "📘" },
];

const Layout = ({ children }: { children: React.ReactNode }) => {
  const { logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const touchStart = useRef<SwipePoint | null>(null);
  const [swipeDirection, setSwipeDirection] = useState<"left" | "right" | null>(null);

  useEffect(() => setSwipeDirection(null), [location.pathname]);

  const ignoreSwipeTarget = (target: EventTarget | null) =>
    target instanceof Element && Boolean(target.closest("input, textarea, select, button, a, [data-no-swipe]"));

  const handleTouchStart = (event: React.TouchEvent<HTMLElement>) => {
    if (window.innerWidth >= 768 || event.touches.length !== 1 || ignoreSwipeTarget(event.target)) return;
    const touch = event.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY, at: Date.now() };
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLElement>) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || event.changedTouches.length !== 1) return;
    const touch = event.changedTouches[0];
    const direction = getSwipeDirection(start, { x: touch.clientX, y: touch.clientY, at: Date.now() });
    if (!direction) return;
    const nextPath = getAdjacentPath(navItems.map((item) => item.path), location.pathname, direction);
    if (!nextPath) return;
    setSwipeDirection(direction);
    window.setTimeout(() => navigate(nextPath), 120);
  };

  const renderNavLink = (item: (typeof navItems)[number], mobile = false) => {
    const isActive = location.pathname === item.path;
    return (
      <Link
        key={item.path}
        to={item.path}
        className={cn(
          mobile
            ? "relative inline-flex shrink-0 items-center gap-1.5 px-3 py-3 text-sm font-semibold transition-colors"
            : "flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-2 text-sm font-medium transition-all",
          isActive
            ? mobile
              ? "text-primary after:absolute after:bottom-0 after:left-3 after:right-3 after:h-0.5 after:rounded-full after:bg-primary"
              : "border-primary/20 bg-primary/10 text-primary shadow-sm"
            : mobile
              ? "text-muted-foreground hover:text-foreground"
              : "border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground"
        )}
        aria-current={isActive ? "page" : undefined}
      >
        <span>{item.icon}</span>
        <span>{item.label}</span>
      </Link>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <img src={dongbaekLogo} alt="동백" className="h-8 w-auto shrink-0" />
              <p className="truncate text-sm font-semibold text-foreground sm:text-base">동백 활동지원센터</p>
            </div>

            <nav className="hidden flex-1 items-center justify-end gap-2 md:flex">
              {navItems.map((item) => renderNavLink(item))}
            </nav>

            <div className="flex shrink-0 items-center gap-2">
            <InstallAppButton />
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 rounded-full text-xs text-muted-foreground hover:text-foreground sm:text-sm"
              onClick={logout}
            >
              🚪 로그아웃
            </Button>
            </div>
          </div>
        </div>

        <nav className="md:hidden border-t border-border/50 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="모바일 주요 메뉴">
          <div className="flex min-w-max px-2">
            {navItems.map((item) => renderNavLink(item, true))}
          </div>
        </nav>
      </header>

      <main className="flex-1 overflow-auto" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <div className={cn("p-4 md:p-6 max-w-7xl mx-auto animate-fade-in transition-all duration-150", swipeDirection === "left" && "-translate-x-4 opacity-60", swipeDirection === "right" && "translate-x-4 opacity-60")}>{children}</div>
      </main>
    </div>
  );
};

export default Layout;



