import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Play, Pause, SkipBack, SkipForward, Maximize2 } from "lucide-react";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface CaptionOverlay {
  id: string;
  start: number;
  end: number;
  text: string;
  position: "top" | "middle" | "bottom";
}

const DEMO_CAPTIONS: CaptionOverlay[] = [
  { id: "c1", start: 0, end: 3, text: "Welcome to ClipForge", position: "bottom" },
  { id: "c2", start: 4, end: 8, text: "Your AI Video Studio", position: "bottom" },
  { id: "c3", start: 9, end: 14, text: "Create. Edit. Export.", position: "middle" },
];

interface PreviewProps {
  aspectRatio?: "9:16" | "16:9" | "1:1";
  currentTime?: number;
  isPlaying?: boolean;
  onTimeUpdate?: (time: number) => void;
  onPlayToggle?: () => void;
}

export default function Preview({
  aspectRatio = "9:16",
  currentTime = 0,
  isPlaying = false,
  onTimeUpdate,
  onPlayToggle,
}: PreviewProps) {
  const [localTime, setLocalTime] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [showCaptions, setShowCaptions] = useState(true);
  const controlsTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const activeTime = onTimeUpdate !== undefined ? currentTime : localTime;
  const activePlaying = onPlayToggle !== undefined ? isPlaying : false;

  const activeCaptions = DEMO_CAPTIONS.filter((c) => c.start <= activeTime && c.end >= activeTime);

  const handleMouseMove = () => {
    setShowControls(true);
    clearTimeout(controlsTimeout.current);
    controlsTimeout.current = setTimeout(() => setShowControls(false), 2500);
  };

  useEffect(() => {
    return () => clearTimeout(controlsTimeout.current);
  }, []);

  return (
    <div className="h-full flex flex-col bg-white">
      <div
        className="flex-1 flex items-center justify-center bg-muted relative overflow-hidden"
        onMouseMove={handleMouseMove}
      >
        <div
          className={`relative border-2 border-black bg-white overflow-hidden shadow-[4px_4px_0px_#000] ${
            aspectRatio === "9:16"
              ? "w-[55%] max-w-[400px] aspect-[9/16]"
              : aspectRatio === "1:1"
                ? "w-[60%] max-w-[500px] aspect-square"
                : "w-[85%] max-w-[800px] aspect-video"
          }`}
        >
          <div className="absolute inset-0">
            <div className="absolute inset-0 bg-gradient-to-br from-black/5 to-transparent" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-3 border-2 border-black flex items-center justify-center bg-accent">
                  <Play className="w-8 h-8 text-black fill-black ml-0.5" />
                </div>
                <p className="font-bold text-xs text-muted-foreground">No video source loaded</p>
                <p className="text-[10px] text-muted-foreground mt-1">Add media to preview</p>
              </div>
            </div>
          </div>

          {showCaptions &&
            activeCaptions.map((cap) => (
              <motion.div
                key={cap.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={`absolute left-4 right-4 px-4 py-2 text-center ${
                  cap.position === "top" ? "top-6" : cap.position === "middle" ? "top-1/2 -translate-y-1/2" : "bottom-6"
                }`}
              >
                <span
                  className="font-bold"
                  style={{
                    fontSize: aspectRatio === "9:16" ? "18px" : "24px",
                    color: "#000",
                    background: "#FFE600",
                    padding: "2px 8px",
                    border: "2px solid #000",
                    boxShadow: "2px 2px 0px #000",
                  }}
                >
                  {cap.text}
                </span>
              </motion.div>
            ))}

          <div
            className="absolute inset-0 pointer-events-none opacity-[0.03]"
            style={{
              backgroundImage: "repeating-conic-gradient(#000 0.0001%, transparent 0.0002%)",
              backgroundSize: "2px 2px",
            }}
          />

          <div className="absolute bottom-2 right-2 font-mono text-[10px] text-black/30 font-bold">
            {formatTime(activeTime)}
          </div>
        </div>
      </div>

      <div
        className={`h-12 flex items-center gap-2 px-4 bg-white border-t-2 border-black transition-opacity shrink-0 ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
      >
        <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-foreground border-2 border-black rounded-none">
          <SkipBack className="w-4 h-4" />
        </Button>
        <Button size="icon-sm" onClick={onPlayToggle} className="bg-black text-white hover:bg-foreground border-2 border-black shadow-[2px_2px_0px_#000] active:shadow-none">
          {activePlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-white" />}
        </Button>
        <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-foreground border-2 border-black rounded-none">
          <SkipForward className="w-4 h-4" />
        </Button>
        <span className="font-mono text-xs text-muted-foreground tabular-nums ml-2 font-bold">
          {formatTime(activeTime)} / 00:30
        </span>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setShowCaptions(!showCaptions)}
          className={`${showCaptions ? "bg-accent text-black" : "text-muted-foreground"} border-2 border-black rounded-none hover:bg-accent`}
        >
          <span className="font-mono text-[10px] font-bold">CC</span>
        </Button>
        <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-foreground border-2 border-black rounded-none">
          <Maximize2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
