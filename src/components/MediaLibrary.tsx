import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore, type TimelineClip } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Plus,
  Trash2,
  Film,
  Music,
  Image as ImageIcon,
  Type,
  FileVideo,
  GripVertical,
} from "lucide-react";

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

const FILE_EXAMPLES: TimelineClip[] = [
  {
    id: "ex-intro", type: "video", name: "intro_take_1.mp4", url: "#", thumbnail: "🎬",
    start: 0, end: 8, duration: 8,
    effects: { zoomPan: false, colorGrading: "none", vignette: false, filmGrain: false },
    volume: 1, captions: [],
  },
  {
    id: "ex-bg", type: "audio", name: "background_swell.wav", url: "#",
    start: 0, end: 30, duration: 30,
    effects: { zoomPan: false, colorGrading: "none", vignette: false, filmGrain: false },
    volume: 0.8, captions: [],
  },
  {
    id: "ex-overlay", type: "image", name: "logo_overlay.png", url: "#", thumbnail: "🖼️",
    start: 0, end: 30, duration: 30,
    effects: { zoomPan: false, colorGrading: "none", vignette: false, filmGrain: false },
    volume: 1, captions: [],
  },
  {
    id: "ex-vfx", type: "video", name: "broll_scene.mp4", url: "#", thumbnail: "🎥",
    start: 0, end: 15, duration: 15,
    effects: { zoomPan: true, colorGrading: "warm", vignette: true, filmGrain: true },
    volume: 0.5, captions: [],
  },
];

const TYPE_ICONS: Record<string, React.ReactNode> = {
  video: <Film className="w-3.5 h-3.5" />,
  audio: <Music className="w-3.5 h-3.5" />,
  image: <ImageIcon className="w-3.5 h-3.5" />,
};

export default function MediaLibrary() {
  const { timelineClips, addTimelineClip, removeTimelineClip } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const displayClips = timelineClips.length > 0 ? timelineClips : FILE_EXAMPLES;
  const filteredClips = searchQuery
    ? displayClips.filter((c) => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : displayClips;

  const handleFileUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      const type: "video" | "audio" | "image" = file.type.startsWith("video")
        ? "video" : file.type.startsWith("audio") ? "audio" : "image";
      const newClip: TimelineClip = {
        id: generateId(), type, name: file.name, url: URL.createObjectURL(file),
        start: 0, end: 10, duration: 10,
        effects: { zoomPan: false, colorGrading: "none", vignette: false, filmGrain: false },
        volume: 1, captions: [],
      };
      addTimelineClip(newClip);
    });
    e.target.value = "";
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-4 border-b-2 border-black shrink-0">
        <span className="font-bold text-xs uppercase tracking-widest">Media</span>
        <span className="text-[10px] text-muted-foreground">{displayClips.length} files</span>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b-2 border-black">
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search files..."
          className="h-8 text-xs bg-white border-2 border-black text-foreground placeholder:text-muted-foreground focus-visible:ring-0"
        />
      </div>

      {/* File List */}
      <ScrollArea className="flex-1 px-3 py-2">
        <AnimatePresence mode="popLayout">
          {filteredClips.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileVideo className="w-8 h-8 text-muted-foreground mb-3" />
              <p className="text-xs font-bold text-muted-foreground">No media files</p>
              <p className="text-[10px] text-muted-foreground mt-1">Upload or import clips</p>
            </div>
          )}
          {filteredClips.map((clip) => (
            <motion.div
              key={clip.id}
              layout
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="group flex items-center gap-3 px-3 py-2.5 border-2 border-black hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all cursor-pointer mb-1 shadow-[1px_1px_0px_#000] hover:shadow-[3px_3px_0px_#000] bg-white"
            >
              <GripVertical className="w-3 h-3 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="w-8 h-8 bg-white border-2 border-black flex items-center justify-center shrink-0">
                {clip.thumbnail || TYPE_ICONS[clip.type]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-xs text-foreground truncate">{clip.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {clip.duration}s · {clip.type}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => removeTimelineClip(clip.id)}
                className="text-muted-foreground hover:text-red-600 border-2 border-black rounded-none opacity-0 group-hover:opacity-100 transition-all shrink-0"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </motion.div>
          ))}
        </AnimatePresence>
      </ScrollArea>

      {/* Add buttons */}
      <div className="p-3 border-t-2 border-black space-y-2 bg-white">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="video/*,audio/*,image/*"
          onChange={handleFilesSelected}
          className="hidden"
        />
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs font-bold border-2 border-black text-foreground hover:bg-accent rounded-none shadow-[2px_2px_0px_#000] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
          onClick={handleFileUpload}
        >
          <Plus className="w-3 h-3 mr-1.5" />
          Add Clip
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs font-bold text-muted-foreground hover:text-foreground border-2 border-black rounded-none"
        >
          <Type className="w-3 h-3 mr-1.5" />
          Add Caption
        </Button>
      </div>
    </div>
  );
}
