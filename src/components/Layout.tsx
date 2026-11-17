import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import dongbaekLogo from "@/assets/dongbaek-logo.png";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { InstallAppButton } from "@/components/InstallAppButton";
import { getAdjacentPath, getSwipeDirection, shouldIgnoreSwipeTarget, type SwipePoint } from "@/lib/swipeNavigation";

type NavItem = { path: string; label: string; icon: string; href?: string };
type NavGroup = { id: string; label: string; icon: string; items: NavItem[] };

const KPI_APP_URL = (() => {
  const raw = String(import.meta.env.VITE_KPI_APP_URL ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
})();

const CASE_MANAGEMENT_SCALE_URL = "https://misty-glitter-abb5.dong100center.workers.dev/";

const navGroups: NavGroup[] = [
  { id: "boards", label: "보드", icon: "🗂️", items: [
    { path: "/", label: "대시보드", icon: "📊" },
    { path: "/work-board", label: "업무 종합 보드", icon: "🗂️" },
  ] },
  { id: "management", label: "관리", icon: "👥", items: [
    { path: "/users", label: "이용자 관리", icon: "👤" },
    { path: "/workers", label: "활동지원사 관리", icon: "🤝" },
    { path: "/matching", label: "활동지원사 검색·비교", icon: "🔗" },
    { path: "/substitute-search", label: "대체 지원사 검색", icon: "🔎" },
  ] },
  { id: "documents", label: "서류업무", icon: "📄", items: [
    { path: "/counseling", label: "상담기록", icon: "📝" },
    { path: "/terminations", label: "종결확인서", icon: "📄" },
    { path: "/handovers", label: "인계·인수서", icon: "🔁" },
    { path: "/salary-changes", label: "급여변경 사유서", icon: "💳" },
  ] },
  { id: "features", label: "기능", icon: "🧰", items: [
    { path: "/event-forms", label: "행사·교육 신청", icon: "📋" },
    { path: "/case-management-scale", label: "사례관리 척도조사", icon: "📏", href: CASE_MANAGEMENT_SCALE_URL },
    { path: "/manual", label: "사용 매뉴얼", icon: "📘" },
  ] },
];

const flattenNavGroups = (groups: NavGroup[]) => groups.flatMap((group) => group.items);

const preloadPath = (path: string) => {
  const loaders: Record<string, () => Promise<unknown>> = {
    "/": () => import("@/pages/Dashboard"), "/work-board": () => import("@/pages/WorkBoard"),
    "/users": () => import("@/pages/UserManagement"), "/workers": () => import("@/pages/WorkerManagement"),
    "/matching": () => import("@/pages/Matching"), "/substitute-search": () => import("@/pages/SubstituteSearch"),
    "/counseling": () => import("@/pages/Counseling"), "/terminations": () => import("@/pages/Terminations"),
    "/handovers": () => import("@/pages/Handovers"), "/salary-changes": () => import("@/pages/SalaryChanges"),
    "/event-forms": () => import("@/pages/EventForms"), "/manual": () => import("@/pages/Manual"), "/kpi": () => import("@/pages/Kpi"),
  };
  const loader = loaders[path];
  if (loader) void loader();
};

const Layout = ({ children }: { children: React.ReactNode }) => {
  const { logout, role } = useAuth();
  const canAccessKpiMenu = role === "admin" || role === "social_worker";
  const visibleNavGroups = navGroups.map((group) => ({ ...group, items: [...group.items] }));
  if (canAccessKpiMenu && KPI_APP_URL) {
    visibleNavGroups.find((group) => group.id === "features")?.items.push({ path: "/kpi", label: "2027 성과관리(KPI)", icon: "📈", href: KPI_APP_URL });
  }
  const visibleNavItems = flattenNavGroups(visibleNavGroups);
  const location = useLocation();
  const navigate = useNavigate();
  const mobileNav = useRef<HTMLElement | null>(null);
  const touchStart = useRef<SwipePoint | null>(null);
  const [swipeDirection, setSwipeDirection] = useState<"left" | "right" | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  useEffect(() => {
    setSwipeDirection(null);
    setOpenGroup(null);
    mobileNav.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [location.pathname]);

  const handleTouchStart = (event: React.TouchEvent<HTMLElement>) => {
    touchStart.current = null;
    if (window.innerWidth >= 768 || event.touches.length !== 1 || shouldIgnoreSwipeTarget(event.target)) return;
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
    const nextPath = getAdjacentPath(visibleNavItems.filter((item) => !item.href).map((item) => item.path), location.pathname, direction);
    if (!nextPath) return;
    setSwipeDirection(direction);
    window.setTimeout(() => navigate(nextPath), 120);
  };

  const renderNavLink = (item: NavItem, mobile = false) => {
    const isActive = location.pathname === item.path;
    if (item.href) return <a key={item.path} href={item.href} onClick={() => setOpenGroup(null)} className={cn(
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
    )} rel="noopener noreferrer" referrerPolicy="no-referrer" aria-label={`${item.label} 외부 서비스 열기`}><span>{item.icon}</span><span>{item.label}</span></a>;
    return (
      <Link
        key={item.path}
        to={item.path}
        onClick={() => setOpenGroup(null)}
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
        onPointerEnter={() => preloadPath(item.path)}
        onFocus={() => preloadPath(item.path)}
      >
        <span>{item.icon}</span>
        <span>{item.label}</span>
      </Link>
    );
  };

  const renderNavGroup = (group: NavGroup, mobile = false) => {
    const isActive = group.items.some((item) => item.path === location.pathname);
    if (mobile && openGroup === group.id) {
      return <div key={group.id} className="flex min-w-max items-center gap-1 px-2">
        <button type="button" className="mr-1 inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary" onClick={() => setOpenGroup(null)}>← {group.label}</button>
        {group.items.map((item) => renderNavLink(item, true))}
      </div>;
    }
    return <div key={group.id} className={cn("relative", mobile && "shrink-0")}>
      <button type="button" aria-expanded={openGroup === group.id} onClick={() => setOpenGroup((current) => current === group.id ? null : group.id)} className={cn(
        mobile ? "inline-flex shrink-0 items-center gap-1.5 px-3 py-3 text-sm font-semibold transition-colors" : "flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-2 text-sm font-medium transition-all",
        isActive || openGroup === group.id
          ? mobile ? "text-primary" : "border-primary/20 bg-primary/10 text-primary shadow-sm"
          : mobile ? "text-muted-foreground hover:text-foreground" : "border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground"
      )}><span>{group.icon}</span><span>{group.label}</span><span className="text-xs">{openGroup === group.id ? "▲" : "▼"}</span></button>
      {!mobile && openGroup === group.id && <div className="absolute left-0 top-full z-50 mt-2 min-w-[220px] rounded-xl border bg-card p-2 shadow-lg">{group.items.map((item) => renderNavLink(item))}</div>}
    </div>;
  };

  return (
    <div className="app-layout min-h-[100dvh] min-w-0 flex flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <img src={dongbaekLogo} alt="동백" className="h-7 w-auto max-w-[100px] shrink-0 object-contain sm:h-8 sm:max-w-[140px]" />
              <p className="truncate text-sm font-semibold text-foreground sm:text-base">동백 활동지원센터</p>
            </div>

            <nav className="hidden basis-full flex-wrap items-center gap-2 xl:order-3 xl:flex">
              {visibleNavGroups.map((group) => renderNavGroup(group))}
            </nav>

            <div className="ml-auto flex shrink-0 items-center gap-2">
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

        <nav ref={mobileNav} className="xl:hidden border-t border-border/50 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="모바일 주요 메뉴">
          <div className="flex min-w-max px-2">
            {openGroup ? visibleNavGroups.map((group) => group.id === openGroup ? renderNavGroup(group, true) : null) : visibleNavGroups.map((group) => renderNavGroup(group, true))}
          </div>
        </nav>
      </header>

      <main className="app-main min-w-0 flex-1" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} onTouchCancel={() => { touchStart.current = null; }}>
        <div className={cn("min-w-0 px-3 py-4 sm:p-4 md:p-6 max-w-7xl mx-auto animate-fade-in transition-all duration-150", swipeDirection === "left" && "-translate-x-4 opacity-60", swipeDirection === "right" && "translate-x-4 opacity-60")}>{children}</div>
      </main>
    </div>
  );
};

export default Layout;



