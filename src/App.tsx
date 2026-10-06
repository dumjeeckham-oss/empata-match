import { lazy, Suspense, type ComponentType } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import ErrorBoundary from "@/components/ErrorBoundary";

const lazyWithRetry = <T extends ComponentType<unknown>>(factory: () => Promise<{ default: T }>) => lazy(async () => {
  try {
    return await factory();
  } catch (error) {
    const reloadKey = "dynamic-import-reload-attempted";
    if (!window.sessionStorage.getItem(reloadKey)) {
      window.sessionStorage.setItem(reloadKey, "1");
      window.location.reload();
      await new Promise<never>(() => undefined);
    }
    window.sessionStorage.removeItem(reloadKey);
    throw error;
  }
});

const Layout = lazyWithRetry(() => import("@/components/Layout"));
const Login = lazyWithRetry(() => import("@/pages/Login"));
const Dashboard = lazyWithRetry(() => import("@/pages/Dashboard"));
const WorkBoard = lazyWithRetry(() => import("@/pages/WorkBoard"));
const UserManagement = lazyWithRetry(() => import("@/pages/UserManagement"));
const WorkerManagement = lazyWithRetry(() => import("@/pages/WorkerManagement"));
const Matching = lazyWithRetry(() => import("@/pages/Matching"));
const Counseling = lazyWithRetry(() => import("@/pages/Counseling"));
const Terminations = lazyWithRetry(() => import("@/pages/Terminations"));
const Handovers = lazyWithRetry(() => import("@/pages/Handovers"));
const Manual = lazyWithRetry(() => import("@/pages/Manual"));
const WaitingLedger = lazyWithRetry(() => import("@/pages/WaitingLedger"));
const SalaryChanges = lazyWithRetry(() => import("@/pages/SalaryChanges"));
const NotFound = lazyWithRetry(() => import("@/pages/NotFound"));
const EventForms = lazyWithRetry(() => import("@/pages/EventForms"));
const EventFormEditor = lazyWithRetry(() => import("@/pages/EventFormEditor"));
const EventFormResults = lazyWithRetry(() => import("@/pages/EventFormResults"));
const PublicEventForm = lazyWithRetry(() => import("@/pages/PublicEventForm"));

const queryClient = new QueryClient();

const PageFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-muted">
    <div className="text-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
      <p className="text-muted-foreground">화면을 불러오는 중...</p>
    </div>
  </div>
);

const AuthenticatedApp = () => {
  const { user, role, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">로딩중...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Login />;
  if (!role) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted p-4">
        <div className="w-full max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
          <h1 className="text-xl font-bold">접근 권한이 없습니다</h1>
          <p className="mt-2 text-sm text-muted-foreground">관리자 또는 전담사회복지사 권한이 있는 계정만 사용할 수 있습니다.</p>
          <button className="mt-5 rounded bg-primary px-4 py-2 text-primary-foreground" onClick={() => void logout()}>로그아웃</button>
        </div>
      </div>
    );
  }

  return (
      <Layout>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
            <Route path="/work-board" element={<ErrorBoundary><WorkBoard /></ErrorBoundary>} />
            <Route path="/users" element={<ErrorBoundary><UserManagement /></ErrorBoundary>} />
            <Route path="/workers" element={<ErrorBoundary><WorkerManagement /></ErrorBoundary>} />
            <Route path="/matching" element={<ErrorBoundary><Matching /></ErrorBoundary>} />
            <Route path="/counseling" element={<ErrorBoundary><Counseling /></ErrorBoundary>} />
            <Route path="/terminations" element={<ErrorBoundary><Terminations /></ErrorBoundary>} />
            <Route path="/handovers" element={<ErrorBoundary><Handovers /></ErrorBoundary>} />
            <Route path="/termination/new" element={<ErrorBoundary><Terminations /></ErrorBoundary>} />
            <Route path="/handover/new" element={<ErrorBoundary><Handovers /></ErrorBoundary>} />
            <Route path="/manual" element={<ErrorBoundary><Manual /></ErrorBoundary>} />
            <Route path="/waiting-ledger" element={<ErrorBoundary><WaitingLedger /></ErrorBoundary>} />
            <Route path="/salary-changes" element={<ErrorBoundary><SalaryChanges /></ErrorBoundary>} />
            <Route path="/event-forms" element={<ErrorBoundary><EventForms /></ErrorBoundary>} />
            <Route path="/event-forms/:formId/edit" element={<ErrorBoundary><EventFormEditor /></ErrorBoundary>} />
            <Route path="/event-forms/:formId/results" element={<ErrorBoundary><EventFormResults /></ErrorBoundary>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ErrorBoundary>
      </Layout>
  );
};

const App = () => {
  const Router = import.meta.env.VITE_ROUTER_MODE === "browser" ? BrowserRouter : HashRouter;
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/forms/:token" element={<PublicEventForm />} />
              <Route path="*" element={<AuthenticatedApp />} />
            </Routes>
          </Suspense>
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;

