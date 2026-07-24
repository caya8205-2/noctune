import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[Noctune Error Boundary caught error]:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center bg-base-950 px-6 text-white">
          <div className="surface-panel flex max-w-md flex-col items-center p-8 text-center shadow-2xl">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10 text-red-400">
              <AlertTriangle size={28} />
            </div>
            <h1 className="font-display text-2xl font-bold text-white">Something went wrong</h1>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              {this.state.error?.message || 'An unexpected application error occurred.'}
            </p>
            <div className="mt-6 flex items-center gap-3">
              <button
                onClick={this.handleReload}
                className="btn-accent flex items-center gap-2 px-5 py-2 text-xs font-semibold"
              >
                <RotateCw size={14} />
                Reload Application
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
