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
];

const Layout = ({ children }: { children: React.ReactNode }) => {
  const { logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="min-h-screen flex">
      <aside className={cn("bg-card border-r transition-all duration-200 flex flex-col", sidebarOpen ? "w-60" : "w-16")}>
        <div className="p-3 border-b flex items-center gap-2">
          <img src={dongbaekLogo} alt="동백" className="h-8 shrink-0" />
          {sidebarOpen && <span className="text-sm font-bold text-foreground truncate">동백 활동지원센터</span>}
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors",
                location.pathname === item.path
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <span className="text-base">{item.icon}</span>
              {sidebarOpen && <span>{item.label}</span>}
            </Link>
          ))}
        </nav>
        <div className="p-2 border-t">
          <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? "◀ 접기" : "▶"}
          </Button>
          <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={logout}>
            {sidebarOpen ? "🚪 로그아웃" : "🚪"}
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-7xl mx-auto animate-fade-in">{children}</div>
      </main>
    </div>
  );
};

export default Layout;
