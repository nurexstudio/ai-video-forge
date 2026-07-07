import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "react-router";
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { executeWithFeedback } from "@/lib/asyncWrapper";
import RetryButton from "@/components/RetryButton";
import {
  ArrowLeft,
  Download,
  Link2,
  Clock,
  CheckCircle2,
  Loader2,
  Film,
  ExternalLink,
} from "lucide-react";

// ─── Component ────────────────────────────────────────────────────────────────

export default function DownloadPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/auth");
  }, [authLoading, isAuthenticated, navigate]);

  if (authLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground font-mono text-sm font-bold">Loading...</div>
      </div>
    );
  }

  return <DownloadTrim />;
}

// ─── Main Content ─────────────────────────────────────────────────────────────

type Status = "idle" | "processing" | "complete" | "error";

interface DownloadResult {
  filename?: string;
  filepath?: string;
  duration?: number;
  filesize?: number;
  format?: string;
  resolution?: string;
}

function DownloadTrim() {
  const navigate = useNavigate();

  const [url, setUrl] = useState("");
  const [startTime, setStartTime] = useState("0");
  const [endTime, setEndTime] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DownloadResult | null>(null);
  const [progress, setProgress] = useState("");

  const handleRetry = useCallback(() => {
    setStatus("idle");
    setError(null);
  }, []);

  const handleDownload = useCallback(async () => {
    if (!url.trim()) {
      toast.error("Please enter a URL");
      return;
    }

    setStatus("processing");
    setError(null);
    setResult(null);
    setProgress("Starting download...");

    // Simulate progress since video-server is on Railway
    const progressSteps = [
      { delay: 500, msg: "Connecting to video server..." },
      { delay: 2500, msg: "Downloading video with yt-dlp..." },
      { delay: 5000, msg: "Trimming to specified range..." },
      { delay: 6000, msg: "Encoding final output..." },
    ];

    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const step of progressSteps) {
      timers.push(setTimeout(() => setProgress(step.msg), step.delay));
    }

    try {
      const { success, data, error: wrapperError, canRetry } = await executeWithFeedback<DownloadResult>(
        async () => {
          const VIDEO_SERVER_URL = import.meta.env.VITE_VIDEO_SERVER_URL || "https://ai-terminal-studio.up.railway.app";

          const res = await fetch(`${VIDEO_SERVER_URL}/api/downloadAndTrim`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: url.trim(),
              startTime: startTime ? parseFloat(startTime) : 0,
              endTime: endTime ? parseFloat(endTime) : undefined,
              format: "mp4",
            }),
          });

          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body?.error || `Server returned ${res.status}`);
          }

          return await res.json();
        },
        {
          action: "download",
          loadingMessage: "Downloading & trimming...",
          successMessage: "Download complete!",
          maxAutoRetries: 2,
        },
      );

      // Clear progress timers
      for (const t of timers) clearTimeout(t);

      if (success && data) {
        setStatus("complete");
        setResult(data);
        setProgress("");
      } else if (canRetry) {
        setStatus("error");
        setError(wrapperError || "Download failed");
      } else {
        setStatus("error");
        setError(wrapperError || "Unknown error");
      }
    } catch (err) {
      for (const t of timers) clearTimeout(t);
      setStatus("error");
      setError(err instanceof Error ? err.message : "Download failed");
    }
  }, [url, startTime, endTime]);

  const formatSize = (bytes?: number) => {
    if (!bytes) return "—";
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDuration = (s?: number) => {
    if (!s) return "—";
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex flex-col">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="h-14 border-b-2 border-black bg-white flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => navigate("/dashboard")}
            className="border-2 border-black text-muted-foreground hover:text-foreground rounded-none"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="w-8 h-8 bg-accent border-2 border-black flex items-center justify-center">
            <Download className="w-4 h-4 text-black" />
          </div>
          <div>
            <span className="font-bold text-sm">Download &amp; Trim</span>
            <span className="text-[10px] text-muted-foreground ml-2 hidden sm:inline font-medium">
              YouTube, TikTok, and more
            </span>
          </div>
        </div>
        <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground border-2 border-black bg-transparent px-2">
          yt-dlp + FFmpeg
        </Badge>
      </header>

      {/* ── Main Content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-start justify-center p-4 md:p-8">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-2xl"
        >
          {/* Download Card */}
          <div className="border-2 border-black bg-white shadow-[6px_6px_0px_#000] p-6">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-7 h-7 bg-black border-2 border-black flex items-center justify-center">
                <Link2 className="w-3.5 h-3.5 text-white" />
              </div>
              <h2 className="text-lg font-black tracking-tight">Paste Video URL</h2>
            </div>

            {/* URL Input */}
            <div className="mb-4">
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=... or https://tiktok.com/..."
                disabled={status === "processing"}
                className="h-12 bg-white border-2 border-black text-foreground placeholder:text-muted-foreground text-sm font-medium rounded-none focus-visible:ring-0"
              />
            </div>

            {/* Time Range */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">
                  <Clock className="w-3 h-3 inline mr-1" />
                  Start Time (seconds)
                </label>
                <Input
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="0"
                  disabled={status === "processing"}
                  className="h-10 bg-white border-2 border-black text-foreground text-sm font-medium rounded-none focus-visible:ring-0"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">
                  <Clock className="w-3 h-3 inline mr-1" />
                  End Time (seconds)
                </label>
                <Input
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="Auto (full video)"
                  disabled={status === "processing"}
                  className="h-10 bg-white border-2 border-black text-foreground text-sm font-medium rounded-none focus-visible:ring-0"
                />
              </div>
            </div>

            {/* Action Button */}
            <div className="flex items-center gap-3">
              <motion.button
                whileHover={{ scale: status === "processing" ? 1 : 1.02 }}
                whileTap={{ scale: status === "processing" ? 1 : 0.97 }}
                onClick={handleDownload}
                disabled={status === "processing" || !url.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-black text-white font-bold text-sm border-2 border-black
                  shadow-[3px_3px_0px_#000] active:shadow-none active:translate-x-[3px] active:translate-y-[3px]
                  hover:bg-foreground transition-all disabled:opacity-50 disabled:cursor-not-allowed
                  disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[3px_3px_0px_#000]"
              >
                {status === "processing" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Download &amp; Trim
                  </>
                )}
              </motion.button>

              <AnimatePresence>
                {status === "error" && (
                  <RetryButton onRetry={handleDownload} error={error || undefined} />
                )}
              </AnimatePresence>
            </div>

            {/* Progress */}
            <AnimatePresence>
              {status === "processing" && progress && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-4"
                >
                  <div className="bg-muted border-2 border-black p-3 flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />
                    <span className="text-xs font-medium text-muted-foreground">{progress}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Result Card */}
          <AnimatePresence>
            {status === "complete" && result && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ delay: 0.15, duration: 0.3 }}
                className="mt-4 border-2 border-black bg-white shadow-[4px_4px_0px_#000] p-5"
              >
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <h3 className="text-sm font-black">Download Complete</h3>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="bg-muted border-2 border-black p-2">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block">File Name</span>
                    <span className="text-xs font-bold truncate">{result.filename || "video.mp4"}</span>
                  </div>
                  <div className="bg-muted border-2 border-black p-2">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block">Duration</span>
                    <span className="text-xs font-bold">{formatDuration(result.duration)}</span>
                  </div>
                  <div className="bg-muted border-2 border-black p-2">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block">Size</span>
                    <span className="text-xs font-bold">{formatSize(result.filesize)}</span>
                  </div>
                  <div className="bg-muted border-2 border-black p-2">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block">Resolution</span>
                    <span className="text-xs font-bold">{result.resolution || "—"}</span>
                  </div>
                </div>

                {result.filepath && (
                  <a
                    href={result.filepath}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 underline-offset-2 hover:underline"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Open File
                  </a>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Info Section */}
          <div className="mt-6 border-2 border-black bg-white p-4">
            <div className="flex items-center gap-2 mb-2">
              <Film className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-xs font-black uppercase tracking-tight text-muted-foreground">
                Supported Platforms
              </h3>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {["YouTube", "TikTok", "Instagram", "Twitter/X", "Vimeo", "Facebook"].map((platform) => (
                <span
                  key={platform}
                  className="px-2 py-0.5 text-[10px] font-bold bg-muted border-2 border-black"
                >
                  {platform}
                </span>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 font-medium">
              Paste any video URL and optionally set start/end times to trim. Powered by yt-dlp and FFmpeg.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
