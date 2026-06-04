import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error("[ErrorBoundary] Caught error:", error, info);
  }

  reset = () => this.setState({ hasError: false, error: undefined });

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="p-6 max-w-2xl mx-auto">
          <div className="border border-destructive/30 rounded-lg p-6 bg-destructive/5">
            <h2 className="text-lg font-semibold text-destructive mb-2">
              ⚠ 데이터를 불러오는 중 오류가 발생했습니다
            </h2>
            <p className="text-sm text-muted-foreground mb-4 whitespace-pre-wrap break-all">
              {this.state.error?.message || "알 수 없는 오류"}
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={this.reset}>다시 시도</Button>
              <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
                새로고침
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
