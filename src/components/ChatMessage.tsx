// ─── src/components/ChatMessage.tsx ───────────────────────────────────────────
// Individual chat message bubble for NUREX OmniChat.
// Renders: plain text, markdown, images (base64/URL), audio waves, tool results.

import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import {
  User,
  Bot,
  Wrench,
  Image as ImageIcon,
  FileText,
  ExternalLink,
  CheckCircle2,
  XCircle,
  GripVertical,
  Film,
  Clock,
} from "lucide-react";

type MessageRole = "user" | "assistant" | "tool";

interface ChatMessageData {
  _id: string;
  role: MessageRole;
  content: string;
  usedModel?: string;
  toolCalls?: any;
  toolCallId?: string;
  attachments?: string[];
  createdAt: number;
}

interface ChatMessageProps {
  message: ChatMessageData;
  onImageClick?: (url: string) => void;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function isBase64Image(text: string): boolean {
  return text.startsWith("data:image/") || /^[A-Za-z0-9+/=]{100,}$/.test(text);
}

function extractImages(content: string): string[] {
  const urls: string[] = [];
  // Markdown images
  const mdRegex = /!\[.*?\]\((.*?)\)/g;
  let m;
  while ((m = mdRegex.exec(content)) !== null) urls.push(m[1]);
  // Raw base64 / URLs
  const rawRegex = /(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|bmp))/gi;
  while ((m = rawRegex.exec(content)) !== null) urls.push(m[1]);
  return urls;
}

function renderContent(content: string, role: MessageRole): React.ReactNode {
  // Tool messages show JSON results as formatted code
  if (role === "tool") {
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      return <pre className="text-[10px] font-mono whitespace-pre-wrap break-all bg-muted p-2 border-2 border-black max-h-40 overflow-y-auto">{content}</pre>;
    }

    // ═══ Pexels search results — render as draggable cards ═══
    if (parsed.videos && Array.isArray(parsed.videos) && parsed.videos.length > 0) {
      const CLIP_MIME = "application/x-clipforge-clip";
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-green-600 text-[10px] font-bold">
            <CheckCircle2 className="w-3 h-3" />
            <span>{parsed.videos.length} Pexels results — drag into Studio timeline</span>
          </div>
          <div className="grid grid-cols-1 gap-2 max-h-80 overflow-y-auto">
            {parsed.videos.map((v: any, i: number) => {
              const clipId = `pexels-${v.id || i}`;
              const clipData: any = {
                id: clipId,
                type: "video",
                name: `Pexels: ${(v.user || "stock").slice(0, 20)}`,
                url: v.video_files?.[0]?.link || v.url || "",
                thumbnail: v.image || "",
                start: 0,
                end: v.duration || 10,
                duration: v.duration || 10,
                effects: { zoomPan: false, colorGrading: "none", vignette: false, filmGrain: false },
                volume: 1,
                captions: [],
              };
              return (
                <div
                  key={clipId}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(CLIP_MIME, JSON.stringify(clipData));
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  className="flex items-center gap-2 border-2 border-black bg-white p-2 hover:bg-accent/20 transition-colors cursor-grab active:cursor-grabbing shadow-[1px_1px_0px_#000]"
                >
                  {/* Thumbnail */}
                  <div className="w-16 h-10 border-2 border-black bg-black/5 shrink-0 overflow-hidden flex items-center justify-center">
                    {v.image ? (
                      <img src={v.image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Film className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold">
                      <GripVertical className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="truncate">{v.user || "Stock Video"}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
                      <Clock className="w-2.5 h-2.5" />
                      <span>{v.duration || "?"}s</span>
                      {v.video_files?.[0]?.width && (
                        <>
                          <span>·</span>
                          <Film className="w-2.5 h-2.5" />
                          <span>{v.video_files[0].width}×{v.video_files[0].height}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Drag hint */}
                  <Badge variant="outline" className="text-[8px] px-1 py-0 font-mono border-2 border-black shrink-0">
                    Drag to Studio
                  </Badge>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    // ═══ Generic tool result header ═══
    if (parsed.success !== undefined) {
      const Icon = parsed.success ? CheckCircle2 : XCircle;
      const color = parsed.success ? "text-green-600" : "text-red-600";
      return (
        <div className={`flex items-center gap-1.5 ${color} text-[10px] font-bold`}>
          <Icon className="w-3 h-3" />
          <span>{parsed.success ? "Tool executed successfully" : parsed.error || "Tool failed"}</span>
          {parsed.transcript && <span className="text-muted-foreground">· Transcribed</span>}
        </div>
      );
    }

    return <pre className="text-[10px] font-mono whitespace-pre-wrap break-all bg-muted p-2 border-2 border-black max-h-32 overflow-y-auto">{content.slice(0, 500)}</pre>;
  }

  // Detect images in content
  const images = extractImages(content);
  const textContent = content.replace(/!\[.*?\]\(.*?\)/g, "").trim();

  return (
    <div className="space-y-2">
      {textContent && (
        <div className="text-xs whitespace-pre-wrap leading-relaxed font-medium break-words">
          {textContent}
        </div>
      )}
      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5">
          {images.slice(0, 4).map((url, i) => (
            <div key={i} className="border-2 border-black bg-black/5 aspect-video flex items-center justify-center overflow-hidden">
              {url.startsWith("data:") || url.startsWith("http") ? (
                <img
                  src={url}
                  alt={`Image ${i + 1}`}
                  className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => window.open(url, "_blank")}
                />
              ) : (
                <ImageIcon className="w-5 h-5 text-muted-foreground" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ChatMessage({ message, onImageClick }: ChatMessageProps) {
  const isUser = message.role === "user";
  const isTool = message.role === "tool";
  const isAssistant = message.role === "assistant";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-2 ${isUser ? "justify-end" : "justify-start"}`}
    >
      {/* Agent/Tool avatar */}
      {!isUser && (
        <div className={`w-7 h-7 border-2 border-black flex items-center justify-center shrink-0 mt-0.5 ${
          isTool ? "bg-muted" : "bg-white"
        }`}>
          {isTool ? <Wrench className="w-3.5 h-3.5 text-muted-foreground" /> : <Bot className="w-3.5 h-3.5" />}
        </div>
      )}

      <div
        className={`max-w-[85%] ${
          isUser
            ? "bg-accent text-black border-2 border-black shadow-[2px_2px_0px_#000]"
            : isTool
              ? "bg-muted/30 border-2 border-black/50 shadow-[1px_1px_0px_#000]"
              : "bg-white border-2 border-black shadow-[1px_1px_0px_#000]"
        } p-2.5`}
      >
        {/* Header */}
        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
          <Badge
            className={`text-[9px] px-1.5 py-0 font-bold border-2 border-black ${
              isUser ? "bg-accent text-black" : isTool ? "bg-muted text-muted-foreground" : "bg-blue-500 text-white"
            }`}
          >
            {isUser ? "YOU" : isTool ? "TOOL" : "NUREX"}
          </Badge>
          {isAssistant && message.usedModel && message.usedModel !== "none" && (
            <span className="text-[8px] font-mono text-muted-foreground">{message.usedModel}</span>
          )}
          <span className="text-[8px] text-muted-foreground ml-auto">{formatTime(message.createdAt)}</span>
        </div>

        {/* Content */}
        {renderContent(message.content, message.role)}

        {/* Attachments */}
        {isUser && message.attachments && message.attachments.length > 0 && (
          <div className="flex items-center gap-1 mt-1.5 text-[9px] text-muted-foreground">
            <FileText className="w-3 h-3" />
            <span>{message.attachments.length} file(s) attached</span>
          </div>
        )}

        {/* Tool call info */}
        {isTool && message.toolCalls && (
          <div className="flex items-center gap-1 mt-1 text-[9px] font-mono text-blue-600">
            <Wrench className="w-3 h-3" />
            <span>{JSON.stringify(message.toolCalls).slice(0, 60)}</span>
          </div>
        )}
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="w-7 h-7 border-2 border-black bg-accent flex items-center justify-center shrink-0 mt-0.5">
          <User className="w-3.5 h-3.5 text-black" />
        </div>
      )}
    </motion.div>
  );
}
