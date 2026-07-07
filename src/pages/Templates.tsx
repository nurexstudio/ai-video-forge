import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "react-router";
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore, type TimelineClip } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import CollapsibleSection from "@/components/CollapsibleSection";
import ImportModal from "@/components/ImportModal";
import {
  ArrowLeft,
  Upload,
  Download,
  Music,
  Wand2,
  Sparkles,
  Film,
  Image,
  FileVideo,
  FileAudio,
  Check,
  Link,
  Plus,
  Volume2,
  Camera,
  Palette,
} from "lucide-react";

// ─── Effect types ─────────────────────────────────────────────────────────────

interface EffectPack {
  id: string;
  name: string;
  description: string;
  category: "sound" | "visual" | "transition" | "color";
  icon: React.ComponentType<{ className?: string }>;
  files: string[];
  size: string;
  preview?: string;
}

const SOUND_EFFECTS: EffectPack[] = [
  { id: "sfx-whoosh", name: "Whoosh Transitions", description: "Fast whoosh sounds for dynamic transitions", category: "sound", icon: Volume2, files: ["whoosh_01.mp3", "whoosh_02.mp3", "whoosh_fast.mp3", "whoosh_deep.mp3"], size: "2.1 MB" },
  { id: "sfx-impact", name: "Impact Hits", description: "Heavy impact sounds for dramatic moments", category: "sound", icon: Volume2, files: ["impact_heavy.mp3", "impact_cinematic.mp3", "impact_boom.mp3", "impact_short.mp3"], size: "3.4 MB" },
  { id: "sfx-rise", name: "Risers & Builds", description: "Tension-building risers for intros and hooks", category: "sound", icon: Volume2, files: ["riser_epic.mp3", "riser_short.mp3", "riser_tension.mp3"], size: "1.8 MB" },
  { id: "sfx-ambient", name: "Ambient Textures", description: "Subtle ambient backgrounds for atmosphere", category: "sound", icon: Volume2, files: ["ambient_city.mp3", "ambient_nature.mp3", "ambient_room.mp3"], size: "5.2 MB" },
];

const VISUAL_EFFECTS: EffectPack[] = [
  { id: "vfx-film-grain", name: "Film Grain Overlays", description: "Authentic 8mm/16mm film grain textures", category: "visual", icon: Film, files: ["grain_8mm.mp4", "grain_16mm.mp4", "grain_heavy.mp4", "grain_light.mp4"], size: "12.4 MB" },
  { id: "vfx-light-leaks", name: "Light Leaks", description: "Cinematic light leak overlays for transitions", category: "visual", icon: Camera, files: ["leak_warm.mp4", "leak_cool.mp4", "leak_anamorphic.mp4", "leak_subtle.mp4"], size: "8.7 MB" },
  { id: "vfx-dust", name: "Dust & Particles", description: "Floating dust and particle overlays", category: "visual", icon: Sparkles, files: ["dust_fine.mp4", "dust_heavy.mp4", "particles_glow.mp4", "particles_sparkle.mp4"], size: "6.1 MB" },
  { id: "vfx-vignette", name: "Vignette Overlays", description: "Dark edge vignettes for cinematic look", category: "visual", icon: Image, files: ["vignette_light.png", "vignette_medium.png", "vignette_heavy.png", "vignette_oval.png"], size: "0.8 MB" },
];

const TRANSITION_EFFECTS: EffectPack[] = [
  { id: "trx-glitch", name: "Glitch Transitions", description: "Digital glitch and distortion transitions", category: "transition", icon: Wand2, files: ["glitch_01.mp4", "glitch_rgb.mp4", "glitch_datamosh.mp4"], size: "4.2 MB" },
  { id: "trx-zoom", name: "Speed Zoom", description: "Fast zoom in/out transitions for energy", category: "transition", icon: Camera, files: ["zoom_in_fast.mp4", "zoom_out_fast.mp4", "zoom_spin.mp4"], size: "3.8 MB" },
  { id: "trx-wipe", name: "Wipe & Slide", description: "Clean wipe and slide transitions", category: "transition", icon: Film, files: ["wipe_left.mp4", "wipe_right.mp4", "slide_up.mp4", "slide_diagonal.mp4"], size: "2.5 MB" },
];

const COLOR_LUTS: EffectPack[] = [
  { id: "lut-cinematic", name: "Cinematic LUTs", description: "Hollywood-style cinematic color grades", category: "color", icon: Palette, files: ["lut_cinematic_warm.cube", "lut_cinematic_cool.cube", "lut_teal_orange.cube"], size: "0.3 MB" },
  { id: "lut-vintage", name: "Vintage LUTs", description: "Retro and vintage film color grades", category: "color", icon: Palette, files: ["lut_vintage_70s.cube", "lut_vintage_fade.cube", "lut_sepia.cube"], size: "0.2 MB" },
  { id: "lut-moody", name: "Moody LUTs", description: "Dark, moody color grades for drama", category: "color", icon: Palette, files: ["lut_moody_dark.cube", "lut_moody_blues.cube", "lut_noir.cube"], size: "0.2 MB" },
];

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Effect Card (extracted for stability) ──────────────────────────────────

function EffectCard({ effect, onDownload }: { effect: EffectPack; onDownload: (e: EffectPack) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      className="bg-white border-2 border-black p-4 shadow-[3px_3px_0px_#000] hover:shadow-[5px_5px_0px_#000] transition-all"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 bg-accent border-2 border-black flex items-center justify-center shrink-0">
          <effect.icon className="w-5 h-5" />
        </div>
        <Badge variant="outline" className="text-[9px] font-mono border-2 border-black">{effect.size}</Badge>
      </div>
      <h3 className="font-bold text-xs text-foreground mb-1">{effect.name}</h3>
      <p className="text-[10px] text-muted-foreground mb-3 leading-relaxed">{effect.description}</p>
      <div className="flex flex-wrap gap-1 mb-3">
        {effect.files.slice(0, 3).map((f) => (
          <span key={f} className="text-[9px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 border border-black truncate max-w-[120px]">
            {f}
          </span>
        ))}
        {effect.files.length > 3 && (
          <span className="text-[9px] font-mono text-muted-foreground">+{effect.files.length - 3} more</span>
        )}
      </div>
      <Button
        size="sm"
        onClick={() => onDownload(effect)}
        className="w-full bg-black text-white hover:bg-foreground border-2 border-black shadow-[2px_2px_0px_#000] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] font-bold text-[10px] h-8"
      >
        <Download className="w-3 h-3 mr-1.5" />
        Add to Studio
      </Button>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Templates() {
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

  return <TemplatesPage />;
}

function TemplatesPage() {
  const navigate = useNavigate();
  const { addTimelineClip } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; size: number; type: string }[]>([]);
  const [dragover, setDragover] = useState(false);

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragover(false);
    const dropped = Array.from(e.dataTransfer.files);
    processFiles(dropped);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    processFiles(Array.from(files));
    e.target.value = "";
  };

  const processFiles = (files: File[]) => {
    const newFiles = files.map((f) => ({
      name: f.name,
      size: f.size,
      type: f.type,
    }));
    setUploadedFiles((prev) => [...prev, ...newFiles]);

    // Add to Studio timeline via store
    files.forEach((file) => {
      const type: "video" | "audio" | "image" = file.type.startsWith("video")
        ? "video" : file.type.startsWith("audio") ? "audio" : "image";
      const newClip: TimelineClip = {
        id: generateId(),
        type,
        name: file.name,
        url: URL.createObjectURL(file),
        start: 0,
        end: type === "audio" ? 30 : 10,
        duration: type === "audio" ? 30 : 10,
        effects: { zoomPan: false, colorGrading: "none", vignette: false, filmGrain: false },
        volume: 1,
        captions: [],
      };
      addTimelineClip(newClip);
    });
  };

  const handleDownloadEffect = (effect: EffectPack) => {
    // Simulate downloading effect pack — adds to Studio media library
    effect.files.forEach((fileName) => {
      const isAudio = fileName.endsWith(".mp3") || fileName.endsWith(".wav");
      const isImage = fileName.endsWith(".png") || fileName.endsWith(".cube");
      const type = isAudio ? "audio" : isImage ? "image" : "video";

      const newClip: TimelineClip = {
        id: generateId(),
        type,
        name: fileName,
        url: `effects://${effect.id}/${fileName}`,
        start: 0,
        end: isAudio ? 5 : 10,
        duration: isAudio ? 5 : 10,
        effects: { zoomPan: false, colorGrading: "none", vignette: false, filmGrain: false },
        volume: 1,
        captions: [],
      };
      addTimelineClip(newClip);
    });

    setUploadedFiles((prev) => [
      ...prev,
      { name: `${effect.name} (${effect.files.length} files)`, size: 0, type: "effect_pack" },
    ]);
  };



  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="h-14 border-b-2 border-black bg-white flex items-center justify-between px-4 sticky top-0 z-40">
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
            <Sparkles className="w-4 h-4 text-black" />
          </div>
          <div>
            <span className="font-bold text-sm text-foreground">Effects & Templates</span>
            <span className="text-[10px] text-muted-foreground ml-2 hidden sm:inline font-medium">
              مكتبة المؤثرات
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
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="bg-black text-white hover:bg-foreground rounded-none font-bold text-xs border-2 border-black shadow-[2px_2px_0px_#000] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
          >
            <Upload className="w-3.5 h-3.5 mr-1.5" />
            Upload Files
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="video/*,audio/*,image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* ─── Upload Section ──────────────────────────────────────────────── */}
        <CollapsibleSection
          title="Upload from Device"
          icon={<Upload className="w-4 h-4" />}
          defaultOpen={true}
          badge={uploadedFiles.length > 0 ? `${uploadedFiles.length} files` : undefined}
        >
          <div
            onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
            onDragLeave={() => setDragover(false)}
            onDrop={handleFileDrop}
            className={`border-2 border-dashed border-black p-8 text-center transition-all ${
              dragover ? "bg-accent/20 border-accent" : "bg-muted/30 hover:bg-muted/50"
            }`}
          >
            <Upload className={`w-10 h-10 mx-auto mb-3 ${dragover ? "text-accent-foreground" : "text-muted-foreground"}`} />
            <p className="text-sm font-bold text-foreground mb-1">Drop files here to add to Studio</p>
            <p className="text-xs text-muted-foreground mb-4">Video, audio, images — up to 2GB per file</p>
            <label>
              <input
                type="file"
                multiple
                accept="video/*,audio/*,image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
              <span className="inline-flex items-center gap-2 px-4 py-2 bg-white border-2 border-black text-xs font-bold text-foreground hover:bg-accent hover:shadow-[2px_2px_0px_#000] hover:-translate-y-0.5 transition-all cursor-pointer shadow-[2px_2px_0px_#000] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]">
                <Plus className="w-3.5 h-3.5" />
                Browse Files
              </span>
            </label>

            <AnimatePresence>
              {uploadedFiles.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="mt-4 space-y-1.5 text-left max-h-40 overflow-y-auto"
                >
                  {uploadedFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 bg-green-50 p-2 border-2 border-green-600">
                      {f.type === "effect_pack" ? (
                        <Sparkles className="w-3.5 h-3.5 text-green-600 shrink-0" />
                      ) : f.type.startsWith("video") ? (
                        <FileVideo className="w-3.5 h-3.5 text-green-600 shrink-0" />
                      ) : f.type.startsWith("audio") ? (
                        <FileAudio className="w-3.5 h-3.5 text-green-600 shrink-0" />
                      ) : (
                        <Image className="w-3.5 h-3.5 text-green-600 shrink-0" />
                      )}
                      <span className="text-xs font-bold text-green-700 truncate flex-1">{f.name}</span>
                      {f.size > 0 && (
                        <span className="text-[10px] text-green-600">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                      )}
                      <Check className="w-3.5 h-3.5 text-green-600 shrink-0" />
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {uploadedFiles.length > 0 && (
            <p className="text-[10px] text-muted-foreground mt-2">
              ✅ Files added to Studio media library — open <button onClick={() => navigate("/studio")} className="underline font-bold hover:text-foreground">Studio</button> to use them
            </p>
          )}
        </CollapsibleSection>

        {/* ─── Sound Effects ────────────────────────────────────────────────── */}
        <CollapsibleSection
          title="Sound Effects"
          icon={<Music className="w-4 h-4" />}
          defaultOpen={true}
          badge={`${SOUND_EFFECTS.length} packs`}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
            {SOUND_EFFECTS.map((effect) => (
              <EffectCard key={effect.id} effect={effect} onDownload={handleDownloadEffect} />
            ))}
          </div>
        </CollapsibleSection>

        {/* ─── Visual Effects ───────────────────────────────────────────────── */}
        <CollapsibleSection
          title="Visual Effects"
          icon={<Camera className="w-4 h-4" />}
          defaultOpen={false}
          badge={`${VISUAL_EFFECTS.length} packs`}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
            {VISUAL_EFFECTS.map((effect) => (
              <EffectCard key={effect.id} effect={effect} onDownload={handleDownloadEffect} />
            ))}
          </div>
        </CollapsibleSection>

        {/* ─── Transition Effects ────────────────────────────────────────────── */}
        <CollapsibleSection
          title="Transition Effects"
          icon={<Wand2 className="w-4 h-4" />}
          defaultOpen={false}
          badge={`${TRANSITION_EFFECTS.length} packs`}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
            {TRANSITION_EFFECTS.map((effect) => (
              <EffectCard key={effect.id} effect={effect} onDownload={handleDownloadEffect} />
            ))}
          </div>
        </CollapsibleSection>

        {/* ─── Color Grading LUTs ────────────────────────────────────────────── */}
        <CollapsibleSection
          title="Color Grading LUTs"
          icon={<Palette className="w-4 h-4" />}
          defaultOpen={false}
          badge={`${COLOR_LUTS.length} packs`}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
            {COLOR_LUTS.map((effect) => (
              <EffectCard key={effect.id} effect={effect} onDownload={handleDownloadEffect} />
            ))}
          </div>
        </CollapsibleSection>
      </div>

      {/* ── Import Modal (Download from URL) ────────────────────────────────── */}
      <ImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImport={(source, data) => {
          if (source === "ytdlp" && data.ytdlp) {
            const r = data.ytdlp;
            const newClip: TimelineClip = {
              id: generateId(),
              type: "video",
              name: r.filename,
              url: r.filepath,
              start: 0,
              end: r.duration,
              duration: r.duration,
              effects: { zoomPan: false, colorGrading: "none", vignette: false, filmGrain: false },
              volume: 1,
              captions: [],
            };
            addTimelineClip(newClip);
            setUploadedFiles((prev) => [...prev, { name: r.filename, size: r.filesize, type: "video" }]);
          } else if (source === "file" && data.file) {
            const file = data.file;
            const type: "video" | "audio" | "image" = file.type.startsWith("video")
              ? "video" : file.type.startsWith("audio") ? "audio" : "image";
            const newClip: TimelineClip = {
              id: generateId(),
              type,
              name: file.name,
              url: URL.createObjectURL(file),
              start: 0,
              end: type === "audio" ? 30 : 10,
              duration: type === "audio" ? 30 : 10,
              effects: { zoomPan: false, colorGrading: "none", vignette: false, filmGrain: false },
              volume: 1,
              captions: [],
            };
            addTimelineClip(newClip);
            setUploadedFiles((prev) => [...prev, { name: file.name, size: file.size, type: file.type }]);
          }
        }}
      />
    </div>
  );
}
