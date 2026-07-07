import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { TEMPLATES } from "@/lib/store";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { motion } from "framer-motion";
import { useNavigate, useLocation } from "react-router";
import { useEffect, useState, Suspense } from "react";
import ImportModal from "@/components/ImportModal";
import { useAppStore } from "@/lib/store";
import ErrorBoundary from "@/components/ErrorBoundary";
import { NUREX_BRAND } from "@/lib/branding";
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
  Plus,
  Film,
  Clock,
  HardDrive,
  Sparkles,
  Bot,
  Music,
  BookOpen,
  Zap,
  TrendingUp,
  Search,
  Layout,
  History,
  Settings2,
  Loader2,
  CheckCircle2,
  List,
  ChevronRight,
  Upload,
  LogOut,
  MessageCircle,
} from "lucide-react";

// ─── Theme ───────────────────────────────────────────────────────────────────
// ⚠️  جميع الـ hooks هنا في أعلى المكون، لا داخل if أو try/catch
//     هذا يمنع خطأ "Rendered more hooks than during the previous render"

const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  lyric: Music,
  motivational: Zap,
  sports: TrendingUp,
  documentary: Film,
  educational: BookOpen,
};

const NAV_ITEMS = [
  { icon: Layout, label: "Dashboard", path: "/dashboard" },
  { icon: MessageCircle, label: "Chat", path: "/chat" },
  { icon: Bot, label: "AI Agent", path: "/agent" },
  { icon: Film, label: "Studio", path: "/studio" },
  { icon: Sparkles, label: "Templates", path: "/templates" },
  { icon: History, label: "History", path: "/history" },
  { icon: Settings2, label: "Settings", path: "/settings" },
];

// ─── المكون الداخلي (كل الـ hooks هنا في الأعلى) ──────────────────────────────

function DashboardContent() {
  // ── كل الـ hooks تُستدعى أولاً، قبل أي return ──────────────────────────
  const { isAuthenticated, isLoading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const projects = useQuery(api.projects.listProjects);

  // ⚠️  كل useState و useEffect في أعلى المكون، وليس داخل if/try
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [importModalOpen, setImportModalOpen] = useState(false);

  // إعادة التوجيه لصفحة المصادقة إذا لم يكن المستخدم مسجلاً
  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/auth");
  }, [authLoading, isAuthenticated, navigate]);

  // ── بعد استدعاء جميع الـ hooks، نتحقق من حالة التحميل ──────────────────
  if (authLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground font-mono text-sm">
          Loading dashboard...
        </div>
      </div>
    );
  }

  // ── حسابات غير hook (آمنة بعد الـ return المبكر) ───────────────────────
  const filteredTemplates = TEMPLATES.filter(
    (t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.category.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const projectList = projects || [];
  const totalProjects = projectList.length;
  const completedCount = projectList.filter((p: { status: string }) => p.status === "completed").length;

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex">
      {/* ── Sidebar Navigation ──────────────────────────────────────────────── */}
      <motion.aside
        initial={{ width: sidebarOpen ? 200 : 0 }}
        animate={{ width: sidebarOpen ? 200 : 0 }}
        className={`bg-white border-r-2 border-black shrink-0 overflow-hidden flex flex-col ${sidebarOpen ? "" : "w-0"}`}
      >
        <div className="h-14 flex items-center gap-3 px-4 border-b-2 border-black shrink-0">
          <div className="w-7 h-7 bg-accent border-2 border-black flex items-center justify-center shrink-0">
            <Film className="w-3.5 h-3.5 text-black" />
          </div>
          <span className="font-bold text-xs text-foreground truncate">ClipForge</span>
        </div>

        <div className="flex-1 py-3 px-2 space-y-0.5 overflow-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold transition-colors border-2 ${
                  isActive
                    ? "bg-accent text-black border-black shadow-[2px_2px_0px_#000]"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted border-transparent hover:border-black"
                }`}
              >
                <item.icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="p-3 border-t-2 border-black">
          <p className="text-[8px] font-mono text-muted-foreground">ClipForge v2.0.0</p>
        </div>
      </motion.aside>

      {/* ── Main Content ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b-2 border-black bg-white px-6 h-14 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight className={`w-4 h-4 transition-transform ${sidebarOpen ? "rotate-180" : ""}`} />
            </button>
            <div className="w-px h-6 bg-black/20" />
            <span className="font-bold text-sm text-foreground">Dashboard</span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono text-muted-foreground border-2 border-black hidden sm:inline">
              {totalProjects} projects
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-40 hidden md:block">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search templates..."
                className="bg-white border-2 border-black text-foreground placeholder:text-muted-foreground h-8 pl-7 text-xs focus-visible:ring-0"
              />
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setImportModalOpen(true)}
              className="text-muted-foreground hover:text-foreground border-2 border-black rounded-none"
              title="Import Media (Upload / Download URL)"
            >
              <Upload className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => navigate("/agent")}
              className="text-muted-foreground hover:text-foreground border-2 border-black rounded-none"
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
            <Button
              size="sm"
              onClick={() => navigate("/studio")}
              className="bg-black text-white hover:bg-foreground rounded-none font-bold text-xs border-2 border-black shadow-[2px_2px_0px_#000] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
            >
              <Plus className="w-3.5 h-3.5" />
              New Project
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-auto">
          {/* ── Stats Grid ────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-6">
            {[
              { icon: Film, label: "Projects", value: String(totalProjects), color: "text-black" },
              { icon: CheckCircle2, label: "Completed", value: String(completedCount), color: "text-green-600" },
              { icon: Clock, label: "Minutes Rendered", value: "—", color: "text-blue-600" },
              { icon: HardDrive, label: "Storage Used", value: "—", color: "text-yellow-600" },
            ].map((stat) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white border-2 border-black p-4 shadow-[4px_4px_0px_#000] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <stat.icon className={`w-4 h-4 ${stat.color}`} />
                  <span className="text-lg font-bold text-foreground">{stat.value || "0"}</span>
                </div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">{stat.label}</p>
              </motion.div>
            ))}
          </div>

          {/* ── Quick Actions Row ─────────────────────────────────────────── */}
          <div className="px-6 pb-4 flex gap-2 flex-wrap">
            {[
              { icon: Bot, label: "AI Agent", path: "/agent" },
              { icon: Film, label: "Studio Editor", path: "/studio" },
              { icon: Sparkles, label: "Templates & Effects", path: "/templates" },
              { icon: History, label: "Export History", path: "/history" },
              { icon: Settings2, label: "Settings", path: "/settings" },
            ].map((action) => (
              <button
                key={action.path}
                onClick={() => navigate(action.path)}
                className="flex items-center gap-1.5 border-2 border-black bg-white px-3 py-1.5 text-xs font-bold hover:bg-accent hover:-translate-y-0.5 transition-all shadow-[2px_2px_0px_#000] hover:shadow-[3px_3px_0px_#000]"
              >
                <action.icon className="w-3.5 h-3.5" />
                {action.label}
                <ChevronRight className="w-3 h-3" />
              </button>
            ))}
          </div>

          {/* ── Templates ──────────────────────────────────────────────────── */}
          <div className="px-6 pb-6">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-accent" />
              <h2 className="font-bold text-sm text-foreground">Quick Start Templates</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
              {filteredTemplates.map((template, i) => {
                const Icon = categoryIcons[template.category] || Film;
                return (
                  <motion.div
                    key={template.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="bg-white border-2 border-black p-4 group hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all cursor-pointer shadow-[3px_3px_0px_#000] hover:shadow-[5px_5px_0px_#000]"
                    onClick={() => navigate("/agent")}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-8 h-8 bg-white border-2 border-black flex items-center justify-center">
                        <Icon className="w-4 h-4 text-muted-foreground group-hover:text-accent-foreground" />
                      </div>
                      <span className="text-lg">{template.thumbnail}</span>
                    </div>

                    <h3 className="font-bold text-xs text-foreground mb-1 truncate">{template.name}</h3>
                    <p className="text-[10px] text-muted-foreground mb-3 leading-relaxed line-clamp-2 font-medium">
                      {template.description}
                    </p>

                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-mono text-muted-foreground border-2 border-black">
                        {template.aspectRatio}
                      </Badge>
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-mono text-muted-foreground border-2 border-black">
                        {template.duration}s
                      </Badge>
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-mono text-muted-foreground border-2 border-black capitalize">
                        {template.category}
                      </Badge>
                    </div>

                    <Button
                      size="sm"
                      className="w-full mt-3 bg-white border-2 border-black text-muted-foreground hover:text-foreground hover:bg-accent rounded-none font-bold text-[10px] h-7 shadow-[2px_2px_0px_#000] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
                    >
                      <Zap className="w-3 h-3 mr-1" />
                      Use Template
                    </Button>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* ── Recent Projects ────────────────────────────────────────────── */}
          <div className="px-6 pb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <List className="w-4 h-4" />
                <h2 className="font-bold text-sm text-foreground">Recent Projects</h2>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/history")}
                className="text-muted-foreground hover:text-foreground border-2 border-black rounded-none font-bold text-xs"
              >
                View All
                <ChevronRight className="w-3 h-3 ml-1" />
              </Button>
            </div>

            {projects === undefined ? (
              <div className="bg-white border-2 border-black p-8 text-center shadow-[3px_3px_0px_#000]">
                <Loader2 className="w-5 h-5 text-muted-foreground animate-spin mx-auto" />
              </div>
            ) : projectList.length === 0 ? (
              <div className="bg-white border-2 border-black p-8 text-center shadow-[3px_3px_0px_#000]">
                <Film className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-bold text-muted-foreground mb-1">No projects yet</p>
                <p className="text-xs text-muted-foreground mb-4">Start with a template or create a new project</p>
                <div className="flex gap-2 justify-center">
                  <Button
                    onClick={() => navigate("/studio")}
                    className="bg-black text-white hover:bg-foreground rounded-none font-bold text-xs border-2 border-black shadow-[2px_2px_0px_#000] active:shadow-none"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    New Project
                  </Button>
                  <Button
                    onClick={() => navigate("/agent")}
                    variant="outline"
                    className="border-2 border-black text-foreground hover:bg-accent rounded-none font-bold text-xs shadow-[2px_2px_0px_#000]"
                  >
                    <Bot className="w-3.5 h-3.5" />
                    AI Agent
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {projectList.slice(0, 5).map((project: typeof projectList[number], i: number) => (
                  <motion.div
                    key={project._id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="bg-white border-2 border-black p-3 flex items-center justify-between hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all shadow-[2px_2px_0px_#000] hover:shadow-[4px_4px_0px_#000]"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-7 h-7 bg-white border-2 border-black flex items-center justify-center shrink-0">
                        <Film className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-xs text-foreground truncate">{project.title}</p>
                        <p className="text-[9px] text-muted-foreground">
                          {project.aspectRatio} · {new Date(project.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant="outline"
                        className={`text-[9px] px-1.5 py-0 font-mono border-2 border-black capitalize ${
                          project.status === "completed" ? "text-green-600 bg-green-50" : project.status === "processing" ? "text-blue-600 bg-blue-50" : "text-muted-foreground"
                        }`}
                      >
                        {project.status}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => navigate(`/studio?project=${project._id}`)}
                        className="text-muted-foreground hover:text-foreground border-2 border-black rounded-none"
                        title="Open in Studio"
                      >
                        <Film className="w-3 h-3" />
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>

        <footer className="border-t-2 border-black px-6 py-3">
          <div className="flex flex-col md:flex-row items-center justify-between gap-2 text-[10px] text-muted-foreground font-medium">
            <div className="flex items-center gap-3 flex-wrap justify-center">
              <span className="font-bold text-foreground">ClipForge Studio © 2026</span>
              <span>·</span>
              <span>
                Built With <span className="font-bold text-foreground">{NUREX_BRAND.studio}</span>
              </span>
            </div>
            <div className="flex items-center gap-3 flex-wrap justify-center">
              <a href={NUREX_BRAND.youtubeUrl} target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">YouTube</a>
              <span>·</span>
              <a href={`mailto:${NUREX_BRAND.email}`} className="hover:text-foreground transition-colors">{NUREX_BRAND.email}</a>
              <span>·</span>
              <a href={NUREX_BRAND.instagramUrl} target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">@{NUREX_BRAND.instagramUrl.split("/").pop()}</a>
              <span className="ml-2 text-foreground">· v2.0 · Groq · Gemini · FFmpeg</span>
            </div>
          </div>
        </footer>
      </div>

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

// ─── المكون المُصدَّر (مُغلَّف بـ ErrorBoundary و Suspense) ─────────────────
//     إذا حدث خطأ غير متوقع، يُعرض زر "إعادة تحميل" بدلاً من تعطيل الصفحة بالكامل

export default function Dashboard() {
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div className="min-h-screen bg-background flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground font-mono text-sm">
              Loading dashboard...
            </div>
          </div>
        }
      >
        <DashboardContent />
      </Suspense>
    </ErrorBoundary>
  );
}
