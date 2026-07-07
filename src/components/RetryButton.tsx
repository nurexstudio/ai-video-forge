import { motion } from "framer-motion";
import { RotateCcw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RetryButtonProps {
  /** Callback when retry is clicked */
  onRetry: () => void;
  /** Error message to show */
  error?: string;
  /** Whether action is currently loading */
  loading?: boolean;
  /** Custom label (default: "Retry") */
  label?: string;
  /** Extra class names */
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RetryButton({
  onRetry,
  error,
  loading = false,
  label = "Retry",
  className,
}: RetryButtonProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("flex flex-col gap-1.5", className)}
    >
      {error && (
        <p className="text-[10px] font-medium text-red-600 leading-tight max-w-[220px]">
          {error}
        </p>
      )}
      <motion.button
        whileHover={{ scale: loading ? 1 : 1.02 }}
        whileTap={{ scale: loading ? 1 : 0.97 }}
        onClick={onRetry}
        disabled={loading}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-none",
          "border-2 border-red-500 bg-red-50 text-red-700",
          "hover:bg-red-100 hover:-translate-y-0.5 transition-all",
          "shadow-[2px_2px_0px_#EF4444] hover:shadow-[3px_3px_0px_#EF4444]",
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-[2px_2px_0px_#EF4444]",
        )}
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <RotateCcw className="w-3.5 h-3.5" />
        )}
        {loading ? "Retrying..." : label}
      </motion.button>
    </motion.div>
  );
}
