import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate, useSearchParams } from "react-router";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/lib/store";
import { executeWithFeedback } from "@/lib/asyncWrapper";
import RetryButton from "@/components/RetryButton";
import ImportModal from "@/components/ImportModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import Timeline from "@/components/Timeline";
import MediaLibrary from "@/components/MediaLibrary";
import CaptionsEditor from "@/components/CaptionsEditor";
import AudioPanel from "@/components/AudioPanel";
import PropertiesPanel from "@/components/PropertiesPanel";
import Preview from "@/components/Preview";
import AgentChat from "@/components/AgentChat";
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
  Save,
  Download,
  PanelLeftOpen,
  PanelRightOpen,
  Bot,
  ChevronDown,
  Loader2,
  CheckCircle2,
  XCircle,
  Upload,
  ChevronUp,
  LogOut,
} from "lucide-react";

type SidebarTab = "media" | "captions" | "audio";

export default function Studio() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  if (!authLoading && !isAuthenticated) {
    navigate("/auth");
    return null;
  }

  return <StudioWorkspace />;
}

function StudioWorkspace() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const {
    aspectRatio,
    setAspectRatio,
    timelineCurrentTime,
    timelinePlaying,
    setTimelineCurrentTime,
    toggleTimelinePlayback,
  } = useAppStore();

  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("project");
  const loadedProject = useQuery(
    api.projects.getProject,
    projectId ? { projectId: projectId as Id<"projects"> } : "skip",
  );

  const [title, setTitle] = useState("Untitled Project");
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<SidebarTab>("media");
  const [agentDrawerOpen, setAgentDrawerOpen] = useState(false);
  const [agentSendCommand, setAgentSendCommand] = useState<((text: string) => void) | null>(null);
  const [agentInput, setAgentInput] = useState("");
  const [exportStatus, setExportStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [saveStatus, setSaveStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [exportError, setExportError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [actionsExpanded, setActionsExpanded] = useState(true);

  // Load project from URL params
  useEffect(() => {
    if (loadedProject && projectId) {
      setTitle(loadedProject.title);
      useAppStore.getState().setAspectRatio(
        (loadedProject.aspectRatio === "9:16" ? "9:16" :
         loadedProject.aspectRatio === "16:9" ? "16:9" : "1:1") as "9:16" | "16:9" | "1:1",
      );
      // Set resolution in store
      if (loadedProject.resolution) {
        useAppStore.getState().setResolution(
          loadedProject.resolution as "720p" | "1080p",
        );
      }
      useAppStore.getState().setCurrentProject(projectId);
    }
  }, [loadedProject, projectId]);

  const handleSave = useCallback(async () => {
    await executeWithFeedback(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 800));
        return { title };
      },
      {
        action: "export",
        loadingMessage: "Saving project...",
        successMessage: "Project saved successfully!",
        showLoadingToast: true,
        showSuccessToast: true,
        onStatusChange: (status, error) => {
          if (status === "loading") setSaveStatus("loading");
          else if (status === "success") { setSaveStatus("success"); setTimeout(() => setSaveStatus("idle"), 2000); }
          else if (status === "error") { setSaveStatus("error"); setSaveError(error || null); }
        },
      },
    );
  }, [title]);

  // Stable callback so AgentChat's useEffect only runs once
  const handleAgentReady = useCallback((send: (text: string) => void) => {
    setAgentSendCommand(() => send);
  }, []);

  const handleExport = useCallback(async () => {
    setExportStatus("loading");
    setExportError(null);
    await executeWithFeedback(
      async () => {
        // Simulate starting export — the actual export happens via PropertiesPanel's renderTimeline
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return { success: true };
      },
      {
        action: "export",
        loadingMessage: "Starting export...",
        successMessage: "Export started! Check Properties panel for progress.",
        showLoadingToast: true,
        showSuccessToast: true,
        onStatusChange: (status, error) => {
          if (status === "loading") setExportStatus("loading");
          else if (status === "success") { setExportStatus("success"); setTimeout(() => setExportStatus("idle"), 3000); }
          else if (status === "error") { setExportStatus("error"); setExportError(error || null); }
        },
      },
    );
  }, []);

  return (
    <div className="h-screen bg-background text-foreground font-sans flex flex-col overflow-hidden">
      {/* ── Top Bar ──────────────────────────────────────────────────────────── */}
      <header className="h-12 flex items-center justify-between px-4 border-b-2 border-black bg-white shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => navigate("/dashboard")}
            className="text-muted-foreground hover:text-foreground border-2 border-black rounded-none"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="w-px h-5 bg-black/20" />
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="border-0 border-b-2 border-black rounded-none bg-transparent h-8 w-44 font-bold text-sm text-foreground focus-visible:ring-0 px-1"
          />
          <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground border-2 border-black bg-transparent px-2">
            DRAFT
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {/* Aspect ratio */}
          <div className="flex border-2 border-black">
            {(["9:16", "16:9", "1:1"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setAspectRatio(r)}
                className={`px-2.5 py-1 font-bold text-[10px] transition-colors ${
                  aspectRatio === r
                    ? "bg-accent text-black"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <div className="w-px h-5 bg-black/20" />
          {/* Phase 3D: Save and Export buttons live in PropertiesPanel now
              (they're the ones wired to real Convex mutations). The header
              only carries import/agent/login to keep the top bar focused. */}
          {/* Import (Upload + Download URL) */}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setImportModalOpen(true)}
            className="text-muted-foreground hover:text-foreground border-2 border-black rounded-none"
            title="Import Media (Upload / Download URL)"
          >
            <Upload className="w-4 h-4" />
          </Button>
          {/* AI Agent button */}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setAgentDrawerOpen(!agentDrawerOpen)}
            className={`${agentDrawerOpen ? "bg-accent text-black" : "text-muted-foreground"} border-2 border-black rounded-none hover:bg-accent`}
            title="AI Agent"
          >
            <Bot className="w-4 h-4" />
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
          {/* Phase 3D: Save / Export buttons lived here previously but were
              duplicates of the real, Convex-wired buttons in PropertiesPanel.
              They have been removed; open the right sidebar for Save/Export. */}
        </div>
      </header>

      {/* ── Main Editor Area ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <AnimatePresence>
          {leftOpen && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 260, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="border-r-2 border-black bg-white shrink-0 overflow-hidden flex flex-col"
            >
              <div className="h-10 flex border-b-2 border-black shrink-0">
                {[
                  { key: "media" as const, label: "Media" },
                  { key: "captions" as const, label: "Captions" },
                  { key: "audio" as const, label: "Audio" },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex-1 font-bold text-[10px] uppercase tracking-wider transition-colors ${
                      activeTab === tab.key
                        ? "text-black bg-accent border-r-2 border-black"
                        : "text-muted-foreground hover:bg-muted border-r-2 border-black last:border-r-0"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-hidden">
                {activeTab === "media" && <MediaLibrary />}
                {activeTab === "captions" && <CaptionsEditor />}
                {activeTab === "audio" && <AudioPanel />}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Center — Preview + Timeline */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <Preview
              aspectRatio={(aspectRatio === "auto" ? "9:16" : aspectRatio === "19:6" ? "16:9" : aspectRatio) as "9:16" | "16:9" | "1:1"}
              currentTime={timelineCurrentTime}
              isPlaying={timelinePlaying}
              onTimeUpdate={setTimelineCurrentTime}
              onPlayToggle={toggleTimelinePlayback}
            />
          </div>

          <div className="h-72 shrink-0">
            <Timeline />
          </div>
        </div>

        {/* Right Sidebar — Properties */}
        <AnimatePresence>
          {rightOpen && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 260, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="border-l-2 border-black shrink-0 overflow-hidden flex flex-col bg-white"
            >
              <PropertiesPanel />
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* ── AI Agent Bottom Drawer ──────────────────────────────────────────── */}
      <AnimatePresence>
        {agentDrawerOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 320, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t-2 border-black bg-white shrink-0 overflow-hidden flex flex-col"
          >
            <div className="h-9 flex items-center justify-between px-4 border-b-2 border-black bg-white shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 bg-accent border-2 border-black flex items-center justify-center">
                  <Bot className="w-3 h-3 text-black" />
                </div>
                <span className="font-bold text-xs text-foreground">AI Agent</span>
                <span className="text-[9px] text-muted-foreground">Ask the AI to edit your video</span>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={agentInput}
                  onChange={(e) => setAgentInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && agentSendCommand) {
                      agentSendCommand(agentInput);
                      setAgentInput("");
                    }
                  }}
                  placeholder="/hook, /trim, or ask in Arabic..."
                  className="h-7 w-64 text-[10px] bg-white border-2 border-black text-foreground placeholder:text-muted-foreground focus-visible:ring-0"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setAgentDrawerOpen(false)}
                  className="text-muted-foreground hover:text-foreground border-2 border-black rounded-none"
                >
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden">
              <AgentChat
                compact
                placeholder="Ask the AI to edit your video..."
                onReady={handleAgentReady}
                onCommandResult={() => {}}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Toggle sidebars ───────────────────────────────────────────────── */ }
      {!leftOpen && (
        <button
          onClick={() => setLeftOpen(true)}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-30 border-2 border-black bg-white p-1.5 hover:bg-accent transition-colors"
        >
          <PanelLeftOpen className="w-4 h-4 text-muted-foreground" />
        </button>
      )}
      {!rightOpen && (
        <button
          onClick={() => setRightOpen(true)}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-30 border-2 border-black bg-white p-1.5 hover:bg-accent transition-colors"
        >
          <PanelRightOpen className="w-4 h-4 text-muted-foreground" />
        </button>
      )}

      {/* ── Import Modal ──────────────────────────────────────────────────── */}
      <ImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImport={(source, data) => {
          if (source === "ytdlp" && data.ytdlp) {
            const r = data.ytdlp;
            const newClip = {
              id: Math.random().toString(36).slice(2, 10),
              type: "video" as const,
              name: r.filename,
              url: r.filepath,
              start: 0,
              end: r.duration,
              duration: r.duration,
              effects: { zoomPan: false, colorGrading: "none" as const, vignette: false, filmGrain: false },
              volume: 1,
              captions: [],
            };
            useAppStore.getState().addTimelineClip(newClip);
          } else if (source === "file" && data.file) {
            const file = data.file;
            const type = file.type.startsWith("video") ? "video" as const : file.type.startsWith("audio") ? "audio" as const : "image" as const;
            const newClip = {
              id: Math.random().toString(36).slice(2, 10),
              type,
              name: file.name,
              url: URL.createObjectURL(file),
              start: 0,
              end: type === "audio" ? 30 : 10,
              duration: type === "audio" ? 30 : 10,
              effects: { zoomPan: false, colorGrading: "none" as const, vignette: false, filmGrain: false },
              volume: 1,
              captions: [],
            };
            useAppStore.getState().addTimelineClip(newClip);
          }
        }}
      />
    </div>
  );
}
