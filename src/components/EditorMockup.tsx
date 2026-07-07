// ─── src/components/EditorMockup.tsx ───────────────────────────────────────────
// Static decorative mockup of the ClipForge Studio editor. Used in the landing
// Hero and other copy-driven sections. Pure presentational — no logic.

import { Clock, Play, Volume2 } from "lucide-react";

export default function EditorMockup() {
  return (
    <div className="relative border-2 border-black bg-white shadow-[10px_10px_0px_#000] p-4 md:p-6">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b-2 border-black">
        <div className="w-3 h-3 bg-black" />
        <div className="w-3 h-3 bg-black" />
        <div className="w-3 h-3 bg-black" />
        <span className="ml-2 text-[11px] font-black text-muted-foreground uppercase tracking-widest">
          ClipForge Studio
        </span>
        <span className="ml-auto text-[10px] font-bold text-muted-foreground">
          00:42 / 00:58
        </span>
      </div>
      <div className="grid grid-cols-12 gap-3">
        {/* Sidebar */}
        <div className="col-span-2 border-2 border-black p-2 space-y-2 hidden md:block">
          {[
            { label: "Media", active: false },
            { label: "Captions", active: true },
            { label: "Audio", active: false },
            { label: "FX", active: false },
          ].map((item) => (
            <div
              key={item.label}
              className={`h-7 border border-black flex items-center px-2 ${item.active ? "bg-accent" : "bg-black/5"}`}
            >
              <span
                className={`text-[10px] font-black tracking-wider ${item.active ? "text-black" : "text-muted-foreground"}`}
              >
                {item.label}
              </span>
            </div>
          ))}
        </div>
        {/* Preview */}
        <div className="col-span-7 relative border-2 border-black bg-black flex items-center justify-center aspect-video overflow-hidden">
          <div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                "radial-gradient(circle at 30% 30%, #FFE600 0%, transparent 50%), radial-gradient(circle at 70% 70%, #0055FF 0%, transparent 50%)",
            }}
          />
          <div className="relative z-10 text-center">
            <div className="w-14 h-14 border-2 border-white bg-white/0 flex items-center justify-center mx-auto mb-2 backdrop-blur-sm">
              <Play className="w-6 h-6 text-white fill-white" />
            </div>
            <span className="text-[10px] font-black text-white/80 uppercase tracking-widest">
              Preview · 1080×1920
            </span>
          </div>
          {/* Caption */}
          <div className="absolute left-1/2 -translate-x-1/2 bottom-4 px-3 py-1.5 bg-accent border-2 border-black shadow-[3px_3px_0px_#000] max-w-[85%]">
            <span className="text-xs md:text-sm font-black tracking-tight">Then it vanished.</span>
          </div>
        </div>
        {/* Timeline */}
        <div className="col-span-12 md:col-span-3 border-2 border-black p-2.5 flex flex-col gap-2 bg-white">
          <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center justify-between">
            Timeline
            <span className="text-black">FPS 30</span>
          </span>
          <div className="space-y-1.5">
            <div className="h-3 bg-accent border border-black relative">
              <div className="absolute right-0 top-0 bottom-0 w-1.5 bg-black" />
            </div>
            <div className="h-3 bg-blue-500 border border-black" style={{ width: "78%" }} />
            <div className="h-3 bg-black/10 border border-black/40" style={{ width: "55%" }} />
            <div className="h-3 bg-black/5 border border-black/20" style={{ width: "92%" }} />
          </div>
          <div className="mt-auto flex items-center gap-1 text-[9px] font-bold text-muted-foreground">
            <Clock className="w-3 h-3" /> 00:42
            <Volume2 className="w-3 h-3 ml-2" /> -3dB
          </div>
        </div>
      </div>
    </div>
  );
}
