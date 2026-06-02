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
      {/* Top Header */}
      <header className="bg-card border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            {/* Left side: Logo */}
            <div className="flex items-center gap-3">
              <img src={dongbaekLogo} alt="동백" className="h-8 w-auto shrink-0" />
              <span className="text-sm md:text-base font-bold text-foreground truncate">
                동백 활동지원센터
              </span>
            </div>

            {/* Desktop Navigation Items */}
            <nav className="hidden md:flex space-x-2">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    location.pathname === item.path
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>

            {/* Right side: Logout button (Desktop) */}
            <div className="hidden md:block">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" onClick={logout}>
                🚪 로그아웃
              </Button>
            </div>

            {/* Mobile Menu Button */}
            <div className="flex md:hidden">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="text-muted-foreground hover:text-foreground"
              >
                {mobileMenuOpen ? "✕" : "☰"}
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t bg-card animate-in slide-in-from-top duration-200">
            <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-3 rounded-md text-base font-medium transition-colors",
                    location.pathname === item.path
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <span className="text-lg">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
              <div className="border-t pt-2 mt-2">
                <Button variant="ghost" size="default" className="w-full justify-start text-muted-foreground px-3 py-3 h-auto" onClick={logout}>
                  🚪 로그아웃
                </Button>
              </div>
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
