import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AsyncActionName =
  | "detectHook"
  | "trim"
  | "export"
  | "effects"
  | "loop"
  | "musicSwell"
  | "colorGrade"
  | "download"
  | "render"
  | "firecrawl";

export interface AsyncWrapperOptions {
  /** Key name of the action (used for store status tracking) */
  action: AsyncActionName;
  /** Message shown during loading */
  loadingMessage?: string;
  /** Message shown on success */
  successMessage?: string;
  /** Override default error message */
  errorMessage?: string;
  /** Maximum number of automatic retries before showing retry button (default 3) */
  maxAutoRetries?: number;
  /** Whether to show a loading toast (default true) */
  showLoadingToast?: boolean;
  /** Whether to show a success toast (default true) */
  showSuccessToast?: boolean;
  /** Callback to update Zustand store status */
  onStatusChange?: (status: "loading" | "success" | "error", error?: string) => void;
}

export interface AsyncWrapperResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  /** Whether the user can manually retry (after auto-retries exhausted) */
  canRetry: boolean;
}

// ─── User-friendly error messages ─────────────────────────────────────────────

const FALLBACK_MESSAGES: Record<string, string> = {
  "Failed to fetch": "Network connection lost. Check your internet and try again.",
  "NetworkError": "Network connection lost. Check your internet and try again.",
  "timeout": "The request timed out. The server may be busy — try again in a moment.",
  "API key": "Missing or invalid API key. Check Settings → API Keys.",
  "service unavailable": "The video processing service is temporarily unavailable. Please try again shortly.",
  "Quota exceeded": "You've reached your usage limit for this service.",
  "Invalid input": "Please check your inputs and try again.",
};

function getFriendlyMessage(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message || "An unexpected error occurred.";
    for (const [key, friendly] of Object.entries(FALLBACK_MESSAGES)) {
      if (msg.toLowerCase().includes(key.toLowerCase())) {
        return friendly;
      }
    }
    return msg;
  }
  if (typeof error === "string") return error;
  return "An unexpected error occurred. Please try again.";
}

// ─── Exponential Backoff ──────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffDelay(attempt: number): number {
  // 1s, 2s, 4s, 8s, 16s... capped at 30s
  return Math.min(1000 * Math.pow(2, attempt - 1), 30000);
}

// ─── Core Wrapper ─────────────────────────────────────────────────────────────

/**
 * Wraps an async function with:
 * - Loading/success/error toasts via Sonner
 * - Automatic retry with exponential backoff (up to maxAutoRetries)
 * - Zustand store status/error tracking
 * - User-friendly error messages
 *
 * @returns Promise with success flag, data, error msg, and canRetry indicator
 */
export async function executeWithFeedback<T>(
  fn: () => Promise<T>,
  options: AsyncWrapperOptions,
): Promise<AsyncWrapperResult<T>> {
  const {
    action,
    loadingMessage = "Processing...",
    successMessage,
    maxAutoRetries = 3,
    showLoadingToast = true,
    showSuccessToast = true,
    onStatusChange,
  } = options;

  // Set loading state
  onStatusChange?.("loading");
  let toastId: string | number | undefined;
  if (showLoadingToast) {
    toastId = toast.loading(loadingMessage, {
      description: action,
      duration: Infinity,
    });
  }

  let lastError: unknown;
  let attempts = 0;

  while (attempts <= maxAutoRetries) {
    try {
      if (attempts > 0) {
        // Update loading toast to show retry attempt
        if (toastId !== undefined) {
          toast.loading(`Retrying (${attempts}/${maxAutoRetries})...`, {
            id: toastId,
            description: action,
            duration: Infinity,
          });
        }
        await sleep(backoffDelay(attempts));
      }

      attempts++;
      const result = await fn();

      // Success
      if (toastId !== undefined) toast.dismiss(toastId);
      if (showSuccessToast && successMessage) {
        toast.success(successMessage);
      }
      onStatusChange?.("success");
      return { success: true, data: result, canRetry: false };
    } catch (error) {
      lastError = error;
      if (attempts > maxAutoRetries) break;
    }
  }

  // All retries exhausted
  const friendlyError = getFriendlyMessage(lastError);

  if (toastId !== undefined) toast.dismiss(toastId);
  toast.error("Action failed", {
    description: friendlyError,
    duration: 8000,
  });

  onStatusChange?.("error", friendlyError);

  return { success: false, error: friendlyError, canRetry: true };
}
