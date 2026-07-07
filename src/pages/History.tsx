import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { motion } from "framer-motion";
import { useNavigate } from "react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Film,
  Clock,
  Search,
  Trash2,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Play,
} from "lucide-react";

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const statusConfig: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; label: string }> = {
  draft: { icon: AlertCircle, color: "text-muted-foreground", label: "Draft" },
  processing: { icon: Loader2, color: "text-blue-600", label: "Processing" },
  completed: { icon: CheckCircle2, color: "text-green-600", label: "Completed" },
  failed: { icon: XCircle, color: "text-red-600", label: "Failed" },
};

export default function History() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const projects = useQuery(api.projects.listProjects);
  const deleteProject = useMutation(api.projects.deleteProject);
  const [searchQuery, setSearchQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/auth");
  }, [authLoading, isAuthenticated, navigate]);

  if (authLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground font-mono text-sm">Loading...</div>
      </div>
    );
  }

  const filtered = (projects || []).filter(
    (p: any) =>
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.status.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      {/* Header */}
      <header className="border-b-2 border-black bg-white px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => navigate("/dashboard")}
            className="text-muted-foreground hover:text-foreground border-2 border-black rounded-none"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="w-8 h-8 bg-accent border-2 border-black flex items-center justify-center">
            <Clock className="w-4 h-4 text-black" />
          </div>
          <span className="font-bold text-sm">Export History</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono text-muted-foreground border-2 border-black">
            {projects?.length || 0} projects
          </Badge>
        </div>
        <div className="relative w-48">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search projects..."
            className="bg-white border-2 border-black text-foreground placeholder:text-muted-foreground h-8 pl-7 text-xs focus-visible:ring-0"
          />
        </div>
      </header>

      {/* Content */}
      <div className="p-6">
        {projects === undefined ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border-2 border-black p-12 text-center shadow-[4px_4px_0px_#000]">
            <Film className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-bold text-sm text-muted-foreground mb-1">
              {searchQuery ? "No matching projects" : "No projects yet"}
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              {searchQuery ? "Try a different search" : "Create a project from the dashboard or editor"}
            </p>
            {!searchQuery && (
              <div className="flex gap-2 justify-center">
                <Button
                  onClick={() => navigate("/studio")}
                  className="bg-black text-white hover:bg-foreground rounded-none font-bold text-xs border-2 border-black shadow-[2px_2px_0px_#000]"
                >
                  <Film className="w-3.5 h-3.5 mr-1.5" />
                  New Project
                </Button>
                <Button
                  onClick={() => navigate("/dashboard")}
                  variant="outline"
                  className="border-2 border-black text-foreground hover:bg-accent rounded-none font-bold text-xs"
                >
                  Dashboard
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {/* Table header */}
            <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[10px] font-mono text-muted-foreground uppercase tracking-wider border-b-2 border-black">
              <div className="col-span-4">Project</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-2">Ratio</div>
              <div className="col-span-2">Created</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>

            {filtered.map((project: any, i: number) => {
              const status = statusConfig[project.status] || statusConfig.draft;
              const StatusIcon = status.icon;

              return (
                <motion.div
                  key={project._id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="grid grid-cols-12 gap-2 items-center px-4 py-3 bg-white border-2 border-black hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all shadow-[2px_2px_0px_#000] hover:shadow-[4px_4px_0px_#000] group"
                >
                  <div className="col-span-4 flex items-center gap-3">
                    <div className="w-7 h-7 bg-white border-2 border-black flex items-center justify-center shrink-0">
                      <Film className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-xs text-foreground truncate">{project.title}</p>
                      <p className="text-[9px] text-muted-foreground">{project._id.slice(0, 8)}</p>
                    </div>
                  </div>

                  <div className="col-span-2">
                    <Badge
                      variant="outline"
                      className={`text-[9px] px-1.5 py-0 font-mono border-2 border-black ${status.color}`}
                    >
                      <StatusIcon className={`w-2.5 h-2.5 mr-1 ${status.color} ${project.status === "processing" ? "animate-spin" : ""}`} />
                      {status.label}
                    </Badge>
                  </div>

                  <div className="col-span-2">
                    <span className="text-[10px] text-muted-foreground">{project.aspectRatio}</span>
                  </div>

                  <div className="col-span-2">
                    <span className="text-[10px] text-muted-foreground">{formatDate(project.createdAt)}</span>
                  </div>

                  <div className="col-span-2 flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => navigate(`/studio?project=${project._id}`)}
                      className="text-muted-foreground hover:text-foreground border-2 border-black rounded-none opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Open in Studio"
                    >
                      <Play className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={async () => {
                        setDeletingId(project._id);
                        try {
                          await deleteProject({ projectId: project._id });
                          toast.success("Project deleted", {
                            description: `"${project.title}" has been removed.`,
                          });
                        } catch (e) {
                          toast.error("Failed to delete project", {
                            description: e instanceof Error ? e.message : "An error occurred",
                          });
                        } finally {
                          setDeletingId(null);
                        }
                      }}
                      disabled={deletingId === project._id}
                      className="text-muted-foreground hover:text-red-600 border-2 border-black rounded-none opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete"
                    >
                      {deletingId === project._id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Stats footer */}
      <footer className="border-t-2 border-black px-6 py-3 mt-auto">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>ClipForge Studio © 2026</span>
          <div className="flex items-center gap-4">
            <span>Total: {projects?.length || 0} projects</span>
            <span>Completed: {projects?.filter((p: any) => p.status === "completed").length || 0}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
