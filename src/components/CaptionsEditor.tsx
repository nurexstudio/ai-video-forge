import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Upload,
  Download,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Clock,
} from "lucide-react";

interface Caption {
  id: string;
  start: number;
  end: number;
  text: string;
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function formatTimeSRT(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function parseSRT(srt: string): Caption[] {
  const blocks = srt.trim().split(/\n\s*\n/);
  return blocks
    .map((block) => {
      const lines = block.trim().split("\n");
      if (lines.length < 3) return null;
      const timeMatch = lines[1].match(
        /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/,
      );
      if (!timeMatch) return null;
      const start = Number(timeMatch[1]) * 3600 + Number(timeMatch[2]) * 60 + Number(timeMatch[3]) + Number(timeMatch[4]) / 1000;
      const end = Number(timeMatch[5]) * 3600 + Number(timeMatch[6]) * 60 + Number(timeMatch[7]) + Number(timeMatch[8]) / 1000;
      const text = lines.slice(2).join("\n");
      return { id: generateId(), start, end, text };
    })
    .filter(Boolean) as Caption[];
}

function toSRT(captions: Caption[]): string {
  return captions
    .map((cap, i) => `${i + 1}\n${formatTimeSRT(cap.start)} --> ${formatTimeSRT(cap.end)}\n${cap.text}`)
    .join("\n\n");
}

function formatTimeShort(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}.${String(Math.floor((seconds % 1) * 10))}`;
}

const DEMO_CAPTIONS: Caption[] = [
  { id: "c1", start: 0.5, end: 3.0, text: "Welcome to ClipForge" },
  { id: "c2", start: 3.5, end: 7.0, text: "Your AI-powered video studio" },
  { id: "c3", start: 7.5, end: 12.0, text: "Create viral shorts in minutes" },
  { id: "c4", start: 12.5, end: 16.0, text: "Just describe what you want" },
];

export default function CaptionsEditor() {
  const [captions, setCaptions] = useState<Caption[]>(DEMO_CAPTIONS);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const addCaption = () => {
    const lastEnd = captions.length > 0 ? captions[captions.length - 1].end : 0;
    const newCap: Caption = { id: generateId(), start: lastEnd, end: lastEnd + 3, text: "New caption" };
    setCaptions((prev) => [...prev, newCap]);
    setEditingId(newCap.id);
  };

  const updateCaption = (id: string, field: keyof Caption, value: string | number) => {
    setCaptions((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  };

  const removeCaption = (id: string) => {
    setCaptions((prev) => prev.filter((c) => c.id !== id));
    toast("Caption deleted");
  };

  const moveCaption = (id: string, dir: "up" | "down") => {
    setCaptions((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      if (idx === -1) return prev;
      const newIdx = dir === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr;
    });
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      const parsed = parseSRT(content);
      if (parsed.length > 0) {
        setCaptions(parsed);
        toast(`Imported ${parsed.length} captions`);
      } else {
        toast("Invalid SRT file");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleExport = () => {
    const srt = toSRT(captions);
    const blob = new Blob([srt], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "captions.srt";
    a.click();
    URL.revokeObjectURL(url);
    toast("Captions exported as SRT");
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-4 border-b-2 border-black shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-xs uppercase tracking-widest">Captions</span>
          <span className="text-[10px] text-muted-foreground bg-white border-2 border-black px-1.5 py-0.5">{captions.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <input ref={fileInputRef} type="file" accept=".srt,.vtt" onChange={handleImport} className="hidden" />
          <Button variant="ghost" size="icon-sm" onClick={() => fileInputRef.current?.click()} className="text-muted-foreground hover:text-foreground border-2 border-black rounded-none" title="Import SRT">
            <Upload className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={handleExport} className="text-muted-foreground hover:text-foreground border-2 border-black rounded-none" title="Export SRT">
            <Download className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Caption list */}
      <ScrollArea className="flex-1 px-3 py-2">
        <AnimatePresence mode="popLayout">
          {captions.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Clock className="w-8 h-8 text-muted-foreground mb-3" />
              <p className="text-xs font-bold text-muted-foreground">No captions</p>
              <p className="text-[10px] text-muted-foreground mt-1">Add or import an SRT file</p>
            </div>
          )}
          {captions.map((cap, idx) => (
            <motion.div
              key={cap.id}
              layout
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0, overflow: "hidden" }}
              className="group relative mb-2 border-2 border-black bg-white hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all shadow-[1px_1px_0px_#000] hover:shadow-[3px_3px_0px_#000]"
            >
              <div className="flex items-center gap-2 px-2 py-1.5 border-b-2 border-black bg-muted">
                <GripVertical className="w-3 h-3 text-muted-foreground cursor-grab shrink-0" />
                <span className="text-[10px] text-muted-foreground w-5">#{idx + 1}</span>
                <div className="flex-1" />
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon-sm" onClick={() => moveCaption(cap.id, "up")} className="w-5 h-5 text-muted-foreground hover:text-foreground">
                    <ChevronUp className="w-3 h-3" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => moveCaption(cap.id, "down")} className="w-5 h-5 text-muted-foreground hover:text-foreground">
                    <ChevronDown className="w-3 h-3" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => removeCaption(cap.id)} className="w-5 h-5 text-muted-foreground hover:text-red-600 ml-1">
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>

              <div className="px-3 py-2 cursor-text" onClick={() => setEditingId(editingId === cap.id ? null : cap.id)}>
                {editingId === cap.id ? (
                  <Textarea
                    value={cap.text}
                    onChange={(e) => updateCaption(cap.id, "text", e.target.value)}
                    className="min-h-[60px] text-xs bg-white border-2 border-black text-foreground focus-visible:ring-0 mb-2"
                    autoFocus
                    placeholder="Caption text..."
                  />
                ) : (
                  <p className="font-bold text-xs text-foreground leading-relaxed">{cap.text}</p>
                )}

                <div className="flex items-center gap-2 mt-1.5">
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] text-muted-foreground">In</span>
                    <Input
                      type="number"
                      value={cap.start}
                      onChange={(e) => updateCaption(cap.id, "start", Number(e.target.value))}
                      className="h-6 w-16 text-[10px] bg-white border-2 border-black text-foreground px-1 text-center"
                      step={0.1} min={0}
                    />
                    <span className="text-[9px] text-muted-foreground">{formatTimeShort(cap.start)}</span>
                  </div>
                  <span className="text-[9px] text-muted-foreground">→</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] text-muted-foreground">Out</span>
                    <Input
                      type="number"
                      value={cap.end}
                      onChange={(e) => updateCaption(cap.id, "end", Number(e.target.value))}
                      className="h-6 w-16 text-[10px] bg-white border-2 border-black text-foreground px-1 text-center"
                      step={0.1} min={0}
                    />
                    <span className="text-[9px] text-muted-foreground">{formatTimeShort(cap.end)}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </ScrollArea>

      {/* Add button */}
      <div className="p-3 border-t-2 border-black bg-white">
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs font-bold border-2 border-black text-foreground hover:bg-accent rounded-none shadow-[2px_2px_0px_#000] active:shadow-none"
          onClick={addCaption}
        >
          <Plus className="w-3 h-3 mr-1.5" />
          Add Caption
        </Button>
      </div>
    </div>
  );
}
