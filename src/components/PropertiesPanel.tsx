import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Save,
  Download,
  Maximize2,
  Sun,
  Moon,
  Film,
  Image as ImageIcon,
  Music,
  Check,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";

interface EffectToggle {
  key: string;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const EFFECTS: EffectToggle[] = [
  { key: "zoomPan", label: "Zoom Pan", icon: <Maximize2 className="w-3 h-3" />, description: "Slow zoom-in pan effect" },
  { key: "vignette", label: "Vignette", icon: <ImageIcon className="w-3 h-3" />, description: "Dark edges around frame" },
  { key: "filmGrain", label: "Film Grain", icon: <Film className="w-3 h-3" />, description: "2% analog film noise" },
];

const COLOR_GRADING_OPTIONS = [
  { value: "none", label: "None", icon: <Check className="w-3 h-3" /> },
  { value: "warm", label: "Warm", icon: <Sun className="w-3 h-3" /> },
  { value: "cool", label: "Cool", icon: <Moon className="w-3 h-3" /> },
  { value: "vintage", label: "Vintage", icon: <Film className="w-3 h-3" /> },
];

const ASPECT_RATIOS = [
  { value: "9:16" as const, label: "9:16 Vertical", desc: "TikTok / Reels" },
  { value: "16:9" as const, label: "16:9 HD", desc: "YouTube" },
  { value: "1:1" as const, label: "1:1 Square", desc: "Instagram" },
];

export default function PropertiesPanel() {
  const { timelineClips, selectedClipId, aspectRatio, resolution, currentProjectId, setAspectRatio, updateTimelineClip } = useAppStore();
  const renderTimeline = useAction(api.agent.renderTimeline);

  type ExportStatus = "idle" | "loading" | "success" | "error";
  const [exportStatus, setExportStatus] = useState<ExportStatus>("idle");
  const [exportResult, setExportResult] = useState<{ duration?: number; filesize?: number; resolution?: string; filepath?: string } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const selectedClip = timelineClips.find((c) => c.id === selectedClipId);

  const [localEffects, setLocalEffects] = useState(selectedClip?.effects || {
    zoomPan: false,
    colorGrading: "none" as const,
    vignette: false,
    filmGrain: false,
  });

  useEffect(() => {
    if (selectedClip) setLocalEffects(selectedClip.effects);
  }, [selectedClip]);

  const handleEffectToggle = (key: string) => {
    const updated = { ...localEffects, [key]: !localEffects[key as keyof typeof localEffects] };
    setLocalEffects(updated);
    if (selectedClipId) updateTimelineClip(selectedClipId, { effects: updated });
  };

  const handleColorGrading = (value: string) => {
    const updated = { ...localEffects, colorGrading: value as typeof localEffects.colorGrading };
    setLocalEffects(updated);
    if (selectedClipId) updateTimelineClip(selectedClipId, { effects: updated });
  };

  const handleSave = () => {
    if (selectedClipId) updateTimelineClip(selectedClipId, { effects: localEffects });
    toast("Project saved", { description: "All changes have been saved locally" });
  };

  const handleExport = async () => {
    if (timelineClips.length === 0) {
      toast("No clips to export", { description: "Add clips to the timeline first" });
      return;
    }
    setExportStatus("loading");
    setExportResult(null);
    setExportError(null);
    try {
      const renderAr = aspectRatio === "auto" ? "9:16" : aspectRatio === "19:6" ? "16:9" : aspectRatio;
      const result = await renderTimeline({
        projectId: (currentProjectId || undefined) as Id<"projects"> | undefined,
        clips: timelineClips.map((clip) => ({
          id: clip.id, type: clip.type, name: clip.name, filepath: clip.filepath || clip.url, url: clip.url,
          start: clip.start, end: clip.end, volume: clip.volume, effects: clip.effects, captions: clip.captions,
        })),
        audioTracks: [],
        aspectRatio: renderAr,
        resolution: resolution || "1080p",
      });
      if (result.success && result.data) {
        setExportStatus("success");
        setExportResult(result.data);
        toast("Export complete!", { description: `${result.data.clipsProcessed} clips · ${result.data.duration}s · ${(result.data.filesize / 1024 / 1024).toFixed(1)}MB` });
      } else {
        setExportStatus("error");
        setExportError(result.error || "Unknown error");
        toast("Export failed", { description: result.error || "An error occurred during render" });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to start export";
      setExportStatus("error");
      setExportError(msg);
      toast("Export failed", { description: msg });
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="h-12 flex items-center justify-between px-4 border-b-2 border-black shrink-0">
        <span className="font-bold text-xs uppercase tracking-widest">Properties</span>
      </div>

      <div className="flex-1 overflow-auto px-3 py-3 space-y-4">
        {selectedClip ? (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="border-2 border-black bg-white p-3 shadow-[2px_2px_0px_#000]">
            <span className="text-[9px] text-muted-foreground uppercase font-bold block mb-2">Selected Clip</span>
            <p className="font-bold text-xs text-foreground truncate">{selectedClip.name}</p>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <span className="text-[9px] text-muted-foreground block">Start</span>
                <span className="text-[11px] font-bold">{selectedClip.start.toFixed(1)}s</span>
              </div>
              <div>
                <span className="text-[9px] text-muted-foreground block">End</span>
                <span className="text-[11px] font-bold">{selectedClip.end.toFixed(1)}s</span>
              </div>
              <div>
                <span className="text-[9px] text-muted-foreground block">Duration</span>
                <span className="text-[11px] font-bold">{selectedClip.duration.toFixed(1)}s</span>
              </div>
              <div>
                <span className="text-[9px] text-muted-foreground block">Type</span>
                <span className="text-[11px] font-bold capitalize">{selectedClip.type}</span>
              </div>
            </div>
          </motion.div>
        ) : (
          <div className="border-2 border-black bg-white p-3 text-center shadow-[1px_1px_0px_#000]">
            <p className="font-bold text-xs text-muted-foreground">No clip selected</p>
            <p className="text-[10px] text-muted-foreground mt-1">Click a clip on the timeline</p>
          </div>
        )}

        {/* Aspect Ratio */}
        <div className="border-2 border-black bg-white p-3 shadow-[2px_2px_0px_#000]">
          <span className="text-[9px] text-muted-foreground uppercase font-bold block mb-2">Aspect Ratio</span>
          <div className="grid grid-cols-3 gap-1">
            {ASPECT_RATIOS.map((ar) => (
              <button
                key={ar.value}
                onClick={() => setAspectRatio(ar.value)}
                className={`p-2 border-2 border-black text-center transition-all ${
                  aspectRatio === ar.value ? "bg-accent shadow-[2px_2px_0px_#000]" : "bg-white hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[2px_2px_0px_#000]"
                }`}
              >
                <div className={`w-full h-6 mx-auto mb-1 flex items-center justify-center ${aspectRatio === ar.value ? "bg-black/10" : "bg-muted"}`}>
                  <div className={`${ar.value === "9:16" ? "w-3 h-5" : ar.value === "16:9" ? "w-5 h-3" : "w-4 h-4"} ${aspectRatio === ar.value ? "bg-black" : "bg-muted-foreground"}`} />
                </div>
                <span className="font-bold text-[9px] block">{ar.label}</span>
                <span className="text-[8px] text-muted-foreground">{ar.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Visual Effects */}
        <div className="border-2 border-black bg-white p-3 shadow-[2px_2px_0px_#000]">
          <span className="text-[9px] text-muted-foreground uppercase font-bold block mb-2">Visual Effects</span>
          <div className="space-y-2">
            {EFFECTS.map((effect) => (
              <div key={effect.key} className="flex items-center justify-between py-1.5 px-2 border border-black hover:bg-muted transition-colors">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{effect.icon}</span>
                  <div>
                    <span className="font-bold text-xs">{effect.label}</span>
                    <p className="text-[9px] text-muted-foreground">{effect.description}</p>
                  </div>
                </div>
                <Switch
                  checked={localEffects[effect.key as keyof typeof localEffects] as boolean}
                  onCheckedChange={() => handleEffectToggle(effect.key)}
                  className="data-[state=checked]:bg-accent border-2 border-black [&>span]:bg-black"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Color Grading */}
        <div className="border-2 border-black bg-white p-3 shadow-[2px_2px_0px_#000]">
          <span className="text-[9px] text-muted-foreground uppercase font-bold block mb-2">Color Grading</span>
          <div className="grid grid-cols-4 gap-1">
            {COLOR_GRADING_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleColorGrading(opt.value)}
                className={`p-2 border-2 border-black text-center transition-all ${
                  localEffects.colorGrading === opt.value ? "bg-accent shadow-[2px_2px_0px_#000]" : "bg-white hover:bg-muted"
                }`}
              >
                <span className={`block mx-auto mb-0.5 ${localEffects.colorGrading === opt.value ? "text-foreground" : "text-muted-foreground"}`}>
                  {opt.icon}
                </span>
                <span className="font-bold text-[8px]">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Volume */}
        <div className="border-2 border-black bg-white p-3 shadow-[2px_2px_0px_#000]">
          <span className="text-[9px] text-muted-foreground uppercase font-bold block mb-2">Volume</span>
          <div className="flex items-center gap-3">
            <Music className="w-4 h-4 text-muted-foreground" />
            <Input
              type="number"
              value={selectedClip ? Math.round(selectedClip.volume * 100) : 100}
              onChange={(e) => {
                const val = Number(e.target.value) / 100;
                if (selectedClipId) updateTimelineClip(selectedClipId, { volume: Math.min(Math.max(val, 0), 2) });
              }}
              className="h-7 w-20 text-xs bg-white border-2 border-black text-foreground text-center"
              min={0} max={200}
            />
            <span className="text-[10px] text-muted-foreground">%</span>
          </div>
        </div>

        <Separator className="bg-black" />

        {/* Action buttons */}
        <div className="space-y-2">
          <Button className="w-full text-xs font-bold bg-black text-white hover:bg-foreground border-2 border-black shadow-[2px_2px_0px_#000] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]" onClick={handleSave}>
            <Save className="w-3.5 h-3.5 mr-2" />
            Save Changes
          </Button>
          <Button
            variant="outline"
            className={`w-full text-xs font-bold border-2 border-black text-foreground hover:bg-accent shadow-[2px_2px_0px_#000] active:shadow-none ${exportStatus === "loading" ? "opacity-70 pointer-events-none" : ""}`}
            onClick={handleExport}
            disabled={exportStatus === "loading"}
          >
            {exportStatus === "loading" ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : exportStatus === "success" ? <CheckCircle2 className="w-3.5 h-3.5 mr-2 text-green-600" /> : exportStatus === "error" ? <XCircle className="w-3.5 h-3.5 mr-2 text-red-600" /> : <Download className="w-3.5 h-3.5 mr-2" />}
            {exportStatus === "loading" ? "Rendering..." : exportStatus === "success" ? "Export Complete" : "Export Video"}
          </Button>

          {exportResult && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="border-2 border-green-600 bg-green-50 p-2">
              <span className="font-bold text-[9px] text-green-600 uppercase block mb-1">Render Complete</span>
              <div className="grid grid-cols-2 gap-1">
                <div><span className="text-[8px] text-muted-foreground block">Duration</span><span className="font-bold text-[10px]">{exportResult.duration}s</span></div>
                <div><span className="text-[8px] text-muted-foreground block">Resolution</span><span className="font-bold text-[10px]">{exportResult.resolution}</span></div>
                <div><span className="text-[8px] text-muted-foreground block">Size</span><span className="font-bold text-[10px]">{((exportResult.filesize ?? 0) / 1024 / 1024).toFixed(1)}MB</span></div>
              </div>
            </motion.div>
          )}

          {exportError && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="border-2 border-red-600 bg-red-50 p-2">
              <span className="font-bold text-[9px] text-red-600 uppercase block mb-1">Export Failed</span>
              <p className="text-[10px] text-red-600">{exportError}</p>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
