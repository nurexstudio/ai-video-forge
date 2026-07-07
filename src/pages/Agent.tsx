import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router";
import { useState, useEffect, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import { useAppStore } from "@/lib/store";
import type { AsyncActionName } from "@/lib/asyncWrapper";
import RetryButton from "@/components/RetryButton";
import AgentChat from "@/components/AgentChat";
import ImportModal from "@/components/ImportModal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  Bot,
  Zap,
  Scissors,
  Music,
  Wand2,
  Palette,
  Repeat,
  Monitor,
  Image,
  Upload,
  Link,
  Loader2,
  LogOut,
} from "lucide-react";

type AspectRatio = "auto" | "9:16" | "16:9" | "19:6";

interface QuickAction {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  command: string;
  actionName: AsyncActionName;
}

const quickActions: QuickAction[] = [
  { icon: Wand2, label: "Detect Hook", command: "/hook", actionName: "detectHook" },
  { icon: Scissors, label: "Trim", command: "/trim", actionName: "trim" },
  { icon: Music, label: "Music Swell", command: "/music", actionName: "musicSwell" },
  { icon: Zap, label: "Export", command: "/export", actionName: "export" },
  { icon: Palette, label: "Effects", command: "/effects", actionName: "effects" },
  { icon: Repeat, label: "Loop", command: "/loop", actionName: "loop" },
  { icon: Monitor, label: "Color Grade", command: "/grade", actionName: "colorGrade" },
  { icon: Image, label: "Vignette", command: "/vignette", actionName: "effects" },
];

const aspectRatios: { value: AspectRatio; label: string; desc: string }[] = [
  { value: "auto", label: "Auto (AI)", desc: "AI picks best ratio" },
  { value: "9:16", label: "9:16", desc: "TikTok · Shorts · Reels" },
  { value: "16:9", label: "16:9", desc: "YouTube · HD" },
  { value: "19:6", label: "19:6", desc: "Cinematic Wide" },
];

export default function Agent() {
  const { isAuthenticated, isLoading: authLoading, signOut } = useAuth();
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

  return <AgentPage />;
}

function AgentPage() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("auto");
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [sendCommand, setSendCommand] = useState<((text: string) => void) | null>(null);
  const { actionStatus } = useAppStore();

  const handleQuickAction = useCallback((action: QuickAction) => {
    sendCommand?.(action.command);
  }, [sendCommand]);

  // Stable callback so AgentChat's useEffect doesn't re-fire on every render
  const handleAgentReady = useCallback((send: (text: string) => void) => {
    setSendCommand(() => send);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex flex-col">
      {/* ── Header ────────────────────────────────────────────────────────────── */}
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
            <Bot className="w-4 h-4 text-black" />
          </div>
          <div>
            <span className="font-bold text-sm text-foreground">ClipForge AI</span>
            <span className="text-[10px] text-muted-foreground ml-2 hidden sm:inline font-medium">
              Agent Terminal
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setImportModalOpen(true)}
            className="text-muted-foreground hover:text-foreground border-2 border-black rounded-none"
            title="Download from URL"
          >
            <Link className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setImportModalOpen(true)}
            className="text-muted-foreground hover:text-foreground border-2 border-black rounded-none"
            title="Upload from Device"
          >
            <Upload className="w-4 h-4" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-red-600 border-2 border-black rounded-none"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure you want to sign out?</AlertDialogTitle>
                <AlertDialogDescription>
                  You will be redirected to the login page.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => signOut().finally(() => navigate("/auth"))}>
                  Sign Out
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <div className="flex border-2 border-black">
            {aspectRatios.map((ar) => (
              <button
                key={ar.value}
                onClick={() => setAspectRatio(ar.value)}
                title={ar.desc}
                className={`px-2.5 py-1 text-[10px] font-bold transition-colors whitespace-nowrap ${
                  aspectRatio === ar.value
                    ? "bg-accent text-black"
                    : "bg-white text-muted-foreground hover:bg-muted"
                }`}
              >
                {ar.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── Quick Action Chips ────────────────────────────────────────────────── */}
      <div className="border-b-2 border-black bg-white px-4 py-2 overflow-x-auto shrink-0">
        <div className="flex gap-2 min-w-max">
          {quickActions.map((action) => {
            const status = actionStatus[action.actionName];
            const isLoading = status === "loading";
            const isError = status === "error";
            return (
              <div key={action.label} className="flex items-center gap-1">
                <button
                  onClick={() => handleQuickAction(action)}
                  disabled={isLoading}
                  className={`flex items-center gap-1.5 border-2 border-black px-3 py-1.5 text-xs font-bold transition-all shadow-[2px_2px_0px_#000] ${
                    isLoading
                      ? "bg-muted text-muted-foreground cursor-not-allowed"
                      : isError
                        ? "bg-red-50 text-red-700 border-red-500 shadow-[2px_2px_0px_#EF4444]"
                        : "text-foreground bg-white hover:bg-accent hover:-translate-y-0.5 hover:shadow-[3px_3px_0px_#000]"
                  }`}
                >
                  {isLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <action.icon className="w-3.5 h-3.5" />
                  )}
                  {action.label}
                </button>
                <AnimatePresence>
                  {isError && (
                    <RetryButton
                      onRetry={() => handleQuickAction(action)}
                      loading={false}
                    />
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Agent Chat ───────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden bg-white">
        <AgentChat onReady={handleAgentReady} />
      </div>

      {/* ── Import Modal ─────────────────────────────────────────────────────── */}
      <ImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImport={(source, data) => {
          if (source === "ytdlp" && data.ytdlp) {
            const r = data.ytdlp;
            sendCommand?.(`📥 Imported: ${r.filename} (${r.duration}s, ${(r.filesize / 1024 / 1024).toFixed(1)}MB)`);
          }
        }}
      />
    </div>
  );
}
