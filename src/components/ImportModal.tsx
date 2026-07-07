import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  X,
  Link,
  Upload,
  Search,
  Video,
  Image,
  Loader2,
  Check,
  FileVideo,
  Globe,
  AlertCircle,
  Sparkles,
  Wand2,
} from "lucide-react";

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  onImport: (source: "url" | "file" | "pexels" | "ytdlp", data: { url?: string; file?: File; broll?: PexelsVideo; ytdlp?: DownloadResult }) => void;
}

interface PexelsVideo {
  id: number;
  url: string;
  image: string;
  duration: number;
  user: { name: string };
  video_files: { link: string; quality: string; width: number; height: number }[];
}

interface DownloadResult {
  filename: string;
  filepath: string;
  duration: number;
  filesize: number;
  format: string;
  resolution: string;
}

interface DownloadLog {
  timestamp: number;
  message: string;
  type: "processing" | "success" | "error";
}

const PEXELS_API_KEY = import.meta.env.VITE_PEXELS_API_KEY;

const neobrutalismInput = "bg-white border-2 border-black text-foreground placeholder:text-muted-foreground focus-visible:ring-0 h-10 text-sm";
const HF_MODELS = [
  { id: "stabilityai/stable-diffusion-xl-base-1.0", label: "Stable Diffusion XL", desc: "High quality 1024×1024", speed: "medium" },
  { id: "black-forest-labs/FLUX.1-schnell", label: "FLUX.1 Schnell", desc: "Fast generation 1024×1024", speed: "fast" },
  { id: "stabilityai/stable-diffusion-2-1", label: "Stable Diffusion 2.1", desc: "Lightweight 768×768", speed: "fast" },
  { id: "prompthero/openjourney-v4", label: "OpenJourney v4", desc: "Artistic style 512×512", speed: "fast" },
];

const cardBg = "bg-white border-2 border-black";

export default function ImportModal({ open, onClose, onImport }: ImportModalProps) {
  const importFromUrlAction = useAction(api.agent.importFromUrl);

  const [url, setUrl] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [pexelsQuery, setPexelsQuery] = useState("");
  const [pexelsResults, setPexelsResults] = useState<PexelsVideo[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedTab, setSelectedTab] = useState("url");
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importLogs, setImportLogs] = useState<DownloadLog[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<DownloadResult | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // ── AI Generate state ─────────────────────────────────────────────────
  const HF_TOKEN = import.meta.env.VITE_Huggingface_API_KEY;
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiModel, setAiModel] = useState(HF_MODELS[0].id);
  const [generating, setGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<{ url: string; prompt: string; model: string }[]>([]);
  const [aiError, setAiError] = useState<string | null>(null);
  const generatedUrlsRef = useRef<string[]>([]);

  // Revoke blob URLs on unmount (uses ref to avoid stale closure)
  useEffect(() => {
    return () => generatedUrlsRef.current.forEach(URL.revokeObjectURL);
  }, []);

  const handleAIGenerate = async () => {
    if (!aiPrompt.trim()) return;
    if (!HF_TOKEN) {
      setAiError("Hugging Face API key not configured. Add VITE_Huggingface_API_KEY to .env");
      return;
    }
    setGenerating(true);
    setAiError(null);
    try {
      const res = await fetch(
        `https://api-inference.huggingface.co/models/${aiModel}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${HF_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ inputs: aiPrompt }),
        },
      );
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`API ${res.status}: ${errText.slice(0, 100)}`);
      }
      const blob = await res.blob();
      if (!blob.type.startsWith("image/")) throw new Error("Response was not an image — model may be loading");
      const url = URL.createObjectURL(blob);
      generatedUrlsRef.current.push(url);
      setGeneratedImages((prev) => [...prev, { url, prompt: aiPrompt, model: aiModel }]);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Generation failed — check your API key and model");
    }
    setGenerating(false);
  };

  const handleAIImageSelect = async (img: { url: string; prompt: string; model: string }) => {
    try {
      const blobRes = await fetch(img.url);
      const blob = await blobRes.blob();
      const file = new File([blob], `ai_${Date.now()}.png`, { type: "image/png" });
      onImport("file", { file });
      onClose();
    } catch {
      console.error("Failed to convert generated image to File");
    }
  };

  const handlePexelsSearch = async () => {
    if (!pexelsQuery.trim()) return;
    if (!PEXELS_API_KEY) { console.error("PEXELS_API_KEY not configured"); return; }
    setSearching(true);
    try {
      const res = await fetch(
        `https://api.pexels.com/videos/search?query=${encodeURIComponent(pexelsQuery)}&per_page=12&orientation=portrait`,
        { headers: { Authorization: PEXELS_API_KEY } },
      );
      if (!res.ok) throw new Error(`Pexels API error ${res.status}`);
      const data = await res.json();
      setPexelsResults(data.videos || []);
    } catch (e) { console.error("Pexels search failed:", e); }
    setSearching(false);
  };

  const handleBrollSelect = (video: PexelsVideo) => {
    const bestFile = video.video_files.find((f) => f.quality === "hd") || video.video_files[0];
    if (bestFile) { onImport("pexels", { broll: video }); onClose(); }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    setFiles((prev) => [...prev, ...dropped]);
  };

  const handleUrlImport = async () => {
    if (!url.trim()) return;
    setImporting(true);
    setImportProgress(10);
    setImportLogs([{ timestamp: Date.now(), message: "Connecting to video-server...", type: "processing" }]);
    setImportError(null);
    setImportResult(null);

    const progressInterval = setInterval(() => setImportProgress((p) => Math.min(p + 5, 85)), 2000);

    try {
      const result = await importFromUrlAction({ url: url.trim() });
      clearInterval(progressInterval);

      if (result.success && result.data) {
        setImportProgress(100);
        const successLogs: DownloadLog[] = (result.logs || []).map((l: any) => ({
          timestamp: l.timestamp,
          message: l.message,
          type: (l.type === "success" ? "success" : l.type === "error" ? "error" : "processing") as DownloadLog["type"],
        }));
        setImportLogs((prev) => [...prev, ...successLogs, { timestamp: Date.now(), message: "✓ Download complete! Ready to use.", type: "success" }]);
        setImportResult(result.data as DownloadResult);
        setTimeout(() => { onImport("ytdlp", { ytdlp: result.data as DownloadResult }); onClose(); }, 1500);
      } else {
        clearInterval(progressInterval);
        setImportProgress(0);
        setImportError(result.error || "Download failed");
        const errorLogs: DownloadLog[] = (result.logs || []).map((l: any) => ({
          timestamp: l.timestamp,
          message: l.message,
          type: (l.type === "success" ? "success" : l.type === "error" ? "error" : "processing") as DownloadLog["type"],
        }));
        setImportLogs((prev) => [...prev, ...errorLogs, { timestamp: Date.now(), message: `✗ ${result.error || "Download failed"}`, type: "error" }]);
      }
    } catch (err) {
      clearInterval(progressInterval);
      const msg = err instanceof Error ? err.message : "Connection failed";
      setImportProgress(0);
      setImportError(msg);
      setImportLogs((prev) => [...prev, { timestamp: Date.now(), message: `✗ Error: ${msg}`, type: "error" }]);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl bg-white border-2 border-black shadow-[8px_8px_0px_#000]"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b-2 border-black">
              <div className="flex items-center gap-3">
                <Globe className="w-4 h-4" />
                <span className="font-bold text-sm">Import Media</span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono text-muted-foreground border-2 border-black">
                  yt-dlp + Pexels
                </Badge>
              </div>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tabs */}
            <Tabs value={selectedTab} onValueChange={setSelectedTab} className="p-4">
              <TabsList className="bg-white border-2 border-black w-full">
                <TabsTrigger value="url" className="rounded-none flex-1 h-10 text-xs font-bold data-[state=active]:bg-accent data-[state=active]:text-black data-[state=active]:shadow-none text-muted-foreground border-r-2 border-black">
                  <Link className="w-3.5 h-3.5 mr-1.5" /> URL
                </TabsTrigger>
                <TabsTrigger value="upload" className="rounded-none flex-1 h-10 text-xs font-bold data-[state=active]:bg-accent data-[state=active]:text-black data-[state=active]:shadow-none text-muted-foreground border-r-2 border-black">
                  <Upload className="w-3.5 h-3.5 mr-1.5" /> Upload
                </TabsTrigger>
                <TabsTrigger value="broll" className="rounded-none flex-1 h-10 text-xs font-bold data-[state=active]:bg-accent data-[state=active]:text-black data-[state=active]:shadow-none text-muted-foreground border-r-2 border-black">
                  <Image className="w-3.5 h-3.5 mr-1.5" /> B-Roll
                </TabsTrigger>
                <TabsTrigger value="aigen" className="rounded-none flex-1 h-10 text-xs font-bold data-[state=active]:bg-accent data-[state=active]:text-black data-[state=active]:shadow-none text-muted-foreground">
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" /> AI Generate
                </TabsTrigger>
              </TabsList>

              {/* URL Tab */}
              <TabsContent value="url" className="mt-4 space-y-4">
                <div className={`${cardBg} p-4 space-y-3 shadow-[3px_3px_0px_#000]`}>
                  <p className="text-xs text-muted-foreground">
                    Paste a YouTube, TikTok, or any video URL — the server will download it via yt-dlp.
                  </p>
                  <div className="flex gap-2">
                    <Input value={url} onChange={(e) => setUrl(e.target.value)} disabled={importing}
                      placeholder="https://youtube.com/watch?v=..." className={neobrutalismInput}
                      onKeyDown={(e) => e.key === "Enter" && handleUrlImport()} />
                    <Button onClick={handleUrlImport} disabled={!url.trim() || importing}
                      className="bg-black text-white hover:bg-foreground border-2 border-black shadow-[2px_2px_0px_#000] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] font-bold">
                      {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
                      {importing ? "Downloading..." : "Extract"}
                    </Button>
                  </div>

                  {importing && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Downloading from video-server...</span><span>{importProgress}%</span>
                      </div>
                      <Progress value={importProgress} className="h-1.5 [&>div]:bg-accent border-2 border-black bg-white" />
                    </div>
                  )}

                  {importLogs.length > 0 && (
                    <div className="bg-white border-2 border-black p-2 max-h-28 overflow-y-auto space-y-1">
                      {importLogs.map((log, i) => (
                        <div key={i} className="flex items-start gap-2 text-[10px] font-mono">
                          <span className={`shrink-0 mt-px ${log.type === "success" ? "text-green-600" : log.type === "error" ? "text-red-600" : "text-blue-600"}`}>
                            {log.type === "success" ? "✓" : log.type === "error" ? "✗" : "→"}
                          </span>
                          <span className="text-muted-foreground">{new Date(log.timestamp).toLocaleTimeString()}</span>
                          <span className="text-foreground">{log.message}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {importError && (
                    <div className="bg-red-50 border-2 border-red-600 p-3 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-bold text-red-600">Download Error</p>
                        <p className="text-[10px] text-red-600 mt-1">{importError}</p>
                      </div>
                    </div>
                  )}

                  {importResult && (
                    <div className="bg-green-50 border-2 border-green-600 p-3 space-y-1">
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-green-600" />
                        <span className="text-xs font-bold text-green-600">Downloaded!</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] text-muted-foreground">
                        <span>File:</span><span className="text-foreground font-bold">{importResult.filename}</span>
                        <span>Duration:</span><span className="text-foreground font-bold">{importResult.duration}s</span>
                        <span>Size:</span><span className="text-foreground font-bold">{(importResult.filesize / 1024 / 1024).toFixed(1)} MB</span>
                        <span>Resolution:</span><span className="text-foreground font-bold">{importResult.resolution}</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className={`${cardBg} p-4 shadow-[2px_2px_0px_#000]`}>
                  <p className="text-xs text-muted-foreground mb-2">Supported platforms:</p>
                  <div className="flex flex-wrap gap-2">
                    {["YouTube", "TikTok", "Instagram", "Twitter/X", "Facebook", "Vimeo", "Dailymotion"].map((p) => (
                      <Badge key={p} variant="outline" className="text-[10px] font-mono text-muted-foreground border-2 border-black bg-white">{p}</Badge>
                    ))}
                  </div>
                </div>
              </TabsContent>

              {/* Upload Tab */}
              <TabsContent value="upload" className="mt-4">
                <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleFileDrop}
                  className={`${cardBg} p-8 text-center transition-all shadow-[3px_3px_0px_#000] ${dragOver ? "border-accent bg-accent/5 shadow-accent/50" : ""}`}>
                  <Upload className={`w-10 h-10 mx-auto mb-3 ${dragOver ? "text-accent-foreground" : "text-muted-foreground"}`} />
                  <p className="text-sm font-bold text-foreground mb-1">Drop video or audio files here</p>
                  <p className="text-xs text-muted-foreground mb-4">MP4, MOV, AVI, MP3, WAV, FLAC — up to 4GB</p>
                  <label>
                    <input type="file" multiple accept="video/*,audio/*" className="hidden"
                      onChange={(e) => setFiles(Array.from(e.target.files || []))} />
                    <span className="inline-flex items-center gap-2 px-4 py-2 bg-white border-2 border-black text-xs font-bold text-foreground hover:shadow-[2px_2px_0px_#000] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      Browse Files
                    </span>
                  </label>

                  {files.length > 0 && (
                    <div className="mt-4 space-y-2 text-left">
                      {files.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 bg-white p-2 border-2 border-black">
                          <FileVideo className="w-3.5 h-3.5 shrink-0" />
                          <span className="text-xs font-bold text-foreground truncate flex-1">{f.name}</span>
                          <span className="text-[10px] text-muted-foreground">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                          <Check className="w-3.5 h-3.5 text-green-600" />
                        </div>
                      ))}
                      <Button onClick={() => { onImport("file", { file: files[0] }); onClose(); }}
                        className="w-full bg-black text-white hover:bg-foreground border-2 border-black shadow-[2px_2px_0px_#000] active:shadow-none font-bold mt-2">
                        Import {files.length > 1 ? `${files.length} files` : "file"}
                      </Button>
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* B-Roll Tab */}
              <TabsContent value="broll" className="mt-4 space-y-4">
                <div className={`${cardBg} p-4 shadow-[3px_3px_0px_#000]`}>
                  <p className="text-xs text-muted-foreground mb-3">Search millions of free stock videos from Pexels. Perfect for B-roll and background footage.</p>
                  <div className="flex gap-2">
                    <Input value={pexelsQuery} onChange={(e) => setPexelsQuery(e.target.value)}
                      placeholder="Search: nature, city, technology, sports..." className={neobrutalismInput}
                      onKeyDown={(e) => e.key === "Enter" && handlePexelsSearch()} />
                    <Button onClick={handlePexelsSearch} disabled={!pexelsQuery.trim() || searching}
                      className="bg-white text-foreground hover:bg-accent border-2 border-black shadow-[2px_2px_0px_#000] active:shadow-none font-bold">
                      {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                {pexelsResults.length > 0 && (
                  <div className="grid grid-cols-3 gap-3">
                    {pexelsResults.map((video) => (
                      <div key={video.id} onClick={() => handleBrollSelect(video)}
                        className={`${cardBg} overflow-hidden cursor-pointer group hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all shadow-[2px_2px_0px_#000] hover:shadow-[4px_4px_0px_#000]`}>
                        <div className="aspect-video bg-white relative overflow-hidden border-b-2 border-black">
                          <img src={video.image} alt={video.url} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                              <Video className="w-6 h-6 text-white" />
                            </div>
                          </div>
                        </div>
                        <div className="p-2">
                          <p className="text-[10px] text-muted-foreground truncate">@{video.user.name}</p>
                          <p className="text-[10px] text-muted-foreground">{video.duration}s · {video.video_files[0]?.width}×{video.video_files[0]?.height}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!searching && pexelsResults.length === 0 && (
                  <div className={`${cardBg} p-8 text-center shadow-[2px_2px_0px_#000]`}>
                    <Search className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">Search for stock videos to use as B-roll</p>
                  </div>
                )}
              </TabsContent>

              {/* AI Generate Tab */}
              <TabsContent value="aigen" className="mt-4 space-y-4">
                <div className={`${cardBg} p-4 shadow-[3px_3px_0px_#000]`}>
                  <p className="text-xs text-muted-foreground mb-3">
                    Generate B-roll images from text prompts using Hugging Face AI models.
                  </p>

                  {/* Model selector */}
                  <div className="mb-3">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                      Model
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {HF_MODELS.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => setAiModel(m.id)}
                          className={`p-2 border-2 border-black text-left transition-all text-xs ${
                            aiModel === m.id
                              ? "bg-accent text-black shadow-[2px_2px_0px_#000]"
                              : "bg-white text-muted-foreground hover:bg-muted hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[2px_2px_0px_#000]"
                          }`}
                        >
                          <span className="font-bold block">{m.label}</span>
                          <span className="text-[9px]">{m.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Prompt input */}
                  <div className="flex gap-2">
                    <Input
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      placeholder="Describe the image: cinematic city skyline, sunset, 4k..."
                      className={neobrutalismInput}
                      onKeyDown={(e) => e.key === "Enter" && handleAIGenerate()}
                      disabled={generating}
                    />
                    <Button
                      onClick={handleAIGenerate}
                      disabled={!aiPrompt.trim() || generating}
                      className="bg-black text-white hover:bg-foreground border-2 border-black shadow-[2px_2px_0px_#000] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] font-bold"
                    >
                      {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                      {generating ? "Generating..." : "Generate"}
                    </Button>
                  </div>

                  {aiError && (
                    <div className="mt-3 bg-red-50 border-2 border-red-600 p-2 flex items-start gap-2">
                      <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                      <p className="text-[10px] text-red-600">{aiError}</p>
                    </div>
                  )}
                </div>

                {/* Generated images grid */}
                {generatedImages.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs">Generated Images ({generatedImages.length})</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          generatedUrlsRef.current.forEach(URL.revokeObjectURL);
                          generatedUrlsRef.current = [];
                          setGeneratedImages([]);
                        }}
                        className="text-[10px] text-muted-foreground hover:text-red-600 border-2 border-black rounded-none h-6 px-2"
                      >
                        Clear All
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {generatedImages.map((img, i) => (
                        <div
                          key={i}
                          onClick={() => handleAIImageSelect(img)}
                          className={`${cardBg} overflow-hidden cursor-pointer group hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all shadow-[2px_2px_0px_#000] hover:shadow-[4px_4px_0px_#000]`}
                        >
                          <div className="aspect-square bg-white relative overflow-hidden border-b-2 border-black">
                            <img
                              src={img.url}
                              alt={img.prompt}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                <Check className="w-8 h-8 text-white" />
                              </div>
                            </div>
                          </div>
                          <div className="p-2">
                            <p className="text-[10px] font-bold truncate">{img.prompt}</p>
                            <p className="text-[8px] text-muted-foreground truncate">{img.model.split("/").pop()}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
