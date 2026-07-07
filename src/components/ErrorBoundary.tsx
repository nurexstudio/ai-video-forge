import { Component, type ErrorInfo, type ReactNode } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, RefreshCw } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] Unhandled error:", error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="max-w-md w-full"
          >
            {/* Error card */}
            <div className="border-2 border-black bg-white shadow-[6px_6px_0px_#000] p-8 text-center">
              {/* Icon */}
              <div className="mx-auto mb-4 w-16 h-16 bg-red-100 border-2 border-black flex items-center justify-center rounded-none">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>

              <h1 className="text-xl font-black mb-2 tracking-tight">
                Something went wrong
              </h1>

              <p className="text-sm text-muted-foreground font-medium mb-4">
                An unexpected error occurred. Please reload the page to continue.
              </p>

              {/* Error details */}
              {this.state.error && (
                <div className="mb-6 bg-muted border-2 border-black p-3 text-left">
                  <p className="text-[10px] font-mono text-red-600 break-all leading-relaxed">
                    {this.state.error.message || "Unknown error"}
                  </p>
                </div>
              )}

              {/* Reload button */}
              <button
                onClick={this.handleReload}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-black text-white font-bold text-sm border-2 border-black
                  shadow-[3px_3px_0px_#000] active:shadow-none active:translate-x-[3px] active:translate-y-[3px]
                  hover:bg-foreground transition-all"
              >
                <RefreshCw className="w-4 h-4" />
                Reload Page
              </button>
            </div>

            {/* Footer */}
            <p className="text-center text-[10px] text-muted-foreground mt-4 font-medium">
              If the problem persists, please contact support.
            </p>
          </motion.div>
        </div>
      );
    }

    return this.props.children;
  }
}
