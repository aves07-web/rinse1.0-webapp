import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Unexpected application error',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Rinse UI ErrorBoundary caught error:', error, info.componentStack);
  }

  handleResetAndReload = () => {
    try {
      window.sessionStorage.clear();
    } catch {
      // ignore blocked storage
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-[#F5F5F7] text-[#1D1D1F]">
          <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-lg p-6 space-y-4">
            <h1 className="text-lg font-bold text-slate-900">Rinse encountered a display error</h1>
            <p className="text-xs text-slate-600 leading-relaxed">
              The interface hit an unexpected error instead of loading cleanly. Reloading or resetting the workstation session usually resolves this immediately.
            </p>
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-mono text-red-700 break-words">
              {this.state.message}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-[#0071E3] text-white hover:bg-[#0062C8]"
              >
                Reload Page
              </button>
              <button
                type="button"
                onClick={this.handleResetAndReload}
                className="px-4 py-2 text-xs font-medium rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200"
              >
                Reset Session &amp; Reload
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
