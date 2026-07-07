import { useState, useRef, useEffect, useCallback } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { executeWithFeedback } from "@/lib/asyncWrapper";
import { useAppStore } from "@/lib/store";
import RetryButton from "@/components/RetryButton";
import {
  Send,
  Bot,
  User,
  Download,
  Loader2,
  ChevronDown,
  ChevronUp,
  Check,
  Sparkles,
  ZoomIn,
  Circle,
  Wand2,
  Filter,
  Tv,
  Film,
  Square,
} from "lucide-react";

// Map registry iconName strings → lucide-react components.
// Falls back to Wand2 if the iconName from the DB doesn't exist here.
const EFFECT_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  ZoomIn,
  Circle,
  Sparkles,
  Wand2,
  Filter,
  Tv,
  Film,
};

type MessageRole = "user" | "agent";
type AgentPhase = "intent" | "planning" | "executing" | "reporting";

interface LogEntry {
  timestamp: number;
  message: string;
  type: "info" | "success" | "error" | "processing";
}

interface PlanStep {
  id: string;
  label: string;
  description: string;
  status: "pending" | "running" | "completed" | "failed";
}

interface MemoryMatch {
  id: string;
  assetId?: string;
  summary: string;
  sourceText?: string;
  score: number;
  createdAt?: number;
}

interface AgentResult {
  title: string;
  duration: string;
  size: string;
  resolution: string;
  aspectRatio: string;
  downloadUrl: string;
  provider?: string;
  modality?: string;
  matches?: MemoryMatch[];
}

interface Message {
  id: string;
  role: MessageRole;
  text: string;
  timestamp: number;
  phase?: AgentPhase;
  plan?: PlanStep[];
  currentStep?: number;
  progress?: number;
  logs?: LogEntry[];
  logsExpanded?: boolean;
  result?: AgentResult;
  command?: string;
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function now(): number {
  return Date.now();
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ═══ Typewriter — character-by-character reveal ═══
export function TypewriterText({
  text,
  speed = 24,
  onDone,
}: {
  text: string;
  speed?: number;
  onDone?: () => void;
}) {
  const [displayed, setDisplayed] = useState("");
  const doneRef = useRef(false);

  // Reset when text changes
  useEffect(() => {
    setDisplayed("");
    doneRef.current = false;
  }, [text]);

  useEffect(() => {
    if (doneRef.current || displayed.length >= text.length) {
      if (!doneRef.current && displayed.length >= text.length) {
        doneRef.current = true;
        onDone?.();
      }
      return;
    }
    const chars = Math.floor(Math.random() * 3) + 2; // 2-4 chars per tick
    const next = Math.min(displayed.length + chars, text.length);
    const delay = speed + Math.random() * 12;
    const t = setTimeout(() => setDisplayed(text.slice(0, next)), delay);
    return () => clearTimeout(t);
  }, [displayed, text, speed, onDone]);

  return (
    <span className="whitespace-pre-wrap">
      {displayed}
      {displayed.length < text.length && (
        <span className="inline-block w-[2px] h-[13px] bg-foreground ml-0.5 align-text-bottom animate-pulse" />
      )}
    </span>
  );
}

const WELCOME_MESSAGE: Message = {
  id: "welcome",
  role: "agent",
  text: "مرحباً! أنا وكيل ClipForge الذكي 🤖\n\nأستطيع مساعدتك في:\n• `/hook` — اكتشاف أفضل مقطع (هوك)\n• `/trim` — قص جزء من الفيديو\n• `/music` — إضافة موسيقى مع تضخيم\n• `/export` — تصدير الفيديو النهائي\n• `/effects` — تأثيرات بصرية\n• `/loop` — حلقة من الهوك\n• `/grade` — تدرج ألوان\n• `/vignette` — تظليل الأطراف\n• `/search` — البحث في الذاكرة الدلالية 🔍\n\nأو اكتب أمرك بالعربية مباشرة! 🎬\nمثال: \"أين وضعت فيديو المقدمة؟\"",
  timestamp: now(),
};

interface AgentChatProps {
  compact?: boolean;
  onCommandResult?: (result: AgentResult) => void;
  placeholder?: string;
  onReady?: (send: (text: string) => void) => void;
}

export default function AgentChat({
  compact = false,
  onCommandResult,
  placeholder = "$ /hook or اكتب أمراً بالعربية...",
  onReady,
}: AgentChatProps) {
  const setActionStatus = useAppStore((s) => s.setActionStatus);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const processCommandAction = useAction((api as any).agent.processCommand as any);
  const seedEffects = useMutation((api as any).effects.seedDefaultsIfEmpty as any);

  // ═══ Dynamic Effects Registry consumer ═══
  // Reads from Convex `effectsRegistry` table; if empty on first mount, seeds
  // the 3 defaults. This is Open/Closed: add new effects in Admin / via
  // effects.ts:addEffect, and a button appears here without rebuilding.
  const allEffects = useQuery((api as any).effects.listAllEffects as any);
  const [seedTried, setSeedTried] = useState(false);
  useEffect(() => {
    if (seedTried) return;
    if (allEffects && allEffects.length === 0) {
      setSeedTried(true);
      void seedEffects().catch(() => setSeedTried(false));
    } else if (allEffects && allEffects.length > 0) {
      setSeedTried(true);
    }
  }, [allEffects, seedEffects, seedTried]);
  const enabledEffects = (allEffects ?? []).filter((e: any) => e.enabled !== false);

  const [messages, setMessages] = useState<Message[]>(compact ? [] : [WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // ═══ Streaming + abort refs ═══
  // Tracks the plan-message ID for the in-flight action. The phase-progress
  // interval and the action resolver both check this ref to decide whether
  // late updates should be applied or dropped (cancel-safe).
  const cancelRef = useRef<string | null>(null);

  // Cancel handler — flips cancelRef, clears processing flag, prunes the
  // pending planning bubble so the user sees an immediate end-state.
  const handleCancel = useCallback(() => {
    cancelRef.current = null;
    setIsProcessing(false);
    setMessages((prev) =>
      prev.map((m) =>
        m.phase === "planning" || m.phase === "executing"
          ? {
              ...m,
              phase: "reporting",
              text: "⏹️ تم الإيقاف بواسطة المستخدم",
              progress: 0,
              logs: [{ timestamp: Date.now(), message: "Cancelled by user", type: "error" as const }],
              logsExpanded: true,
            }
          : m,
      ),
    );
  }, []);

  // Ref to the latest sendMessage — declared BEFORE the useEffect/function that uses it
  const latestSendMessage = useRef<(text: string) => Promise<void>>(undefined as unknown as (text: string) => Promise<void>);

  const sendMessageRef = useRef<(text: string) => void>(undefined);

  // Register the external send command (called once when onReady is provided)
  useEffect(() => {
    const wrapped = (text: string) => {
      setInput(text);
      setTimeout(() => latestSendMessage.current?.(text), 50);
    };
    sendMessageRef.current = wrapped;
    onReady?.(wrapped);
    // Intentionally only run once — onReady is now stable (useCallback in parent)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isProcessing) return;

    const userMsg: Message = { id: generateId(), role: "user", text: text.trim(), timestamp: now() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsProcessing(true);

    const cmd = text.toLowerCase();
    let intentText: string;
    if (cmd.includes("/hook") || cmd.includes("هوك") || cmd.includes("اكتشف")) intentText = "🔍 فهمت! تريد اكتشاف أفضل مقطع (هوك) في الفيديو.";
    else if (cmd.includes("/trim") || cmd.includes("قص") || cmd.includes("اقطع")) intentText = "✂️ فهمت! تريد قص الفيديو.";
    else if (cmd.includes("/music") || cmd.includes("موسيقى") || cmd.includes("أضف")) intentText = "🎵 فهمت! تريد إضافة موسيقى مع تضخيم.";
    else if (cmd.includes("/export") || cmd.includes("صدّر") || cmd.includes("تصدير")) intentText = "📤 فهمت! تريد تصدير الفيديو.";
    else if (cmd.includes("/effects") || cmd.includes("تأثير")) intentText = "✨ فهمت! تريد إضافة تأثيرات بصرية.";
    else if (cmd.includes("/loop") || cmd.includes("حلقة")) intentText = "🔄 فهمت! تريد عمل حلقة من الهوك.";
    else if (cmd.includes("/grade") || cmd.includes("ألوان") || cmd.includes("تدرج")) intentText = "🎨 فهمت! تريد تطبيق تدرج ألوان.";
    else if (cmd.includes("/vignette") || cmd.includes("تظليل")) intentText = "🌑 فهمت! تريد إضافة تظليل للأطراف.";
    else if (cmd.includes("/search") || cmd.includes("أين وضعت") || cmd.includes("بحث") || cmd.includes("وين") || cmd.includes("where did") || cmd.includes("find my")) intentText = "🔍 جاري البحث في ذاكرتك الدلالية...";
    else intentText = "🔍 جاري تحليل طلبك...";

    const thinkMsgId = generateId();
    setMessages((prev) => [...prev, { id: thinkMsgId, role: "agent", text: intentText, timestamp: now(), phase: "intent" }]);

    const planMsgId = generateId();
    cancelRef.current = planMsgId;
    setMessages((prev) => [
      ...prev,
      { id: planMsgId, role: "agent", text: "📋 **معالجة عبر خوادم AI...**", timestamp: now(), phase: "planning", plan: [], currentStep: 0, progress: 0, logs: [], logsExpanded: false },
    ]);

    // Compute action name for store tracking
    const actionName = cmd.includes("/hook") || cmd.includes("هوك") ? "detectHook"
      : cmd.includes("/trim") || cmd.includes("قص") ? "trim"
      : cmd.includes("/music") || cmd.includes("موسيقى") ? "musicSwell"
      : cmd.includes("/export") || cmd.includes("صدّر") ? "export"
      : cmd.includes("/effects") || cmd.includes("تأثير") ? "effects"
      : cmd.includes("/loop") || cmd.includes("حلقة") ? "loop"
      : cmd.includes("/grade") || cmd.includes("تدرج") ? "colorGrade"
      : cmd.includes("vignette") || cmd.includes("تظليل") ? "effects"
      : cmd.includes("/search") || cmd.includes("أين وضعت") || cmd.includes("بحث") || cmd.includes("وين") || cmd.includes("where did") || cmd.includes("find my") ? "memorySearch" as any
      : "export" as const;

    setActionStatus(actionName, "loading");

    // ═══ Phase progression animator (frontend-only streaming) ═══
    // While waiting on the server action, ramp the planning → executing →
    // reporting phases visually. Stops as soon as the action resolves.
    const PHASE_ORDER: AgentPhase[] = ["planning", "executing", "reporting"];
    const PHASE_TARGET: Record<AgentPhase, number> = {
      intent: 5,
      planning: 35,
      executing: 75,
      reporting: 99,
      // (the `intent` initial state has its own bubble, so we jump past it)
    };
    const PHASE_TEXT: Record<AgentPhase, string> = {
      intent: "🔍 جاري تحليل طلبك…",
      planning: "📋 معالجة عبر خوادم AI…",
      executing: "⚙️ تنفيذ العملية…",
      reporting: "📤 تجميع النتيجة…",
    };
    const PHASE_INTERVAL_MS = 1500;
    const ORDER_RANK: Record<AgentPhase, number> = {
      intent: 0,
      planning: 1,
      executing: 2,
      reporting: 3,
    };
    let lastIdx = 0;
    const animTimer = setInterval(() => {
      if (cancelRef.current !== planMsgId) {
        clearInterval(animTimer);
        return;
      }
      if (lastIdx >= PHASE_ORDER.length) return;
      const nextPhase = PHASE_ORDER[lastIdx];
      lastIdx++;
      const nextProgress = PHASE_TARGET[nextPhase];
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== planMsgId) return m;
          if (m.phase === "reporting") return m; // already complete
          const currentRank = ORDER_RANK[m.phase ?? "intent"] ?? 0;
          if (ORDER_RANK[nextPhase] < currentRank) return m;
          return { ...m, phase: nextPhase, text: PHASE_TEXT[nextPhase], progress: nextProgress };
        }),
      );
    }, PHASE_INTERVAL_MS);

    try {
      const { success, data, error: wrapperError, canRetry } = await executeWithFeedback(
        async () => {
          const result = await processCommandAction({ command: text.trim() });
          if (!result.success) throw new Error(result.error || "Action failed");
          return result.result as AgentResult;
        },
        {
          action: actionName,
          loadingMessage: `Processing ${text.split(" ")[0] || "command"}...`,
          successMessage: "Command completed!",
          showLoadingToast: true,
          showSuccessToast: true,
          onStatusChange: (status, error) => {
            if (status === "success") setActionStatus(actionName, "success");
            else if (status === "error") setActionStatus(actionName, "error", error);
          },
        },
      );

      clearInterval(animTimer);

      // If user cancelled mid-flight, drop the late result silently.
      if (cancelRef.current !== planMsgId) return;

      if (success && data) {
        const r = data as AgentResult;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === planMsgId ? { ...m, phase: "reporting" as AgentPhase, plan: [], progress: 100, logs: [], result: r } : m,
          ),
        );
        onCommandResult?.(r);
      } else if (canRetry) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === planMsgId
              ? {
                  ...m,
                  text: `❌ ${wrapperError || "Action failed"}`,
                  phase: "reporting" as AgentPhase,
                  progress: 0,
                  logs: [{ timestamp: now(), message: `Error: ${wrapperError || "Unknown"}`, type: "error" as const }],
                  logsExpanded: true,
                }
              : m,
          ),
        );
      }
    } catch (err) {
      clearInterval(animTimer);
      if (cancelRef.current !== planMsgId) return;
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === planMsgId
            ? { ...m, text: `❌ خطأ: ${errMsg}`, phase: "reporting" as AgentPhase, progress: 0, logs: [{ timestamp: now(), message: `Error: ${errMsg}`, type: "error" as const }], logsExpanded: true }
            : m,
        ),
      );
    } finally {
      cancelRef.current = null;
      setIsProcessing(false);
    }
  };

  // Keep latestSendMessage.current updated with the current sendMessage on every render
  latestSendMessage.current = sendMessage;

  const toggleLogs = (msgId: string) => {
    setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, logsExpanded: !m.logsExpanded } : m)));
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-auto" ref={scrollRef}>
        <div className="px-3 py-3 space-y-3">
          <AnimatePresence>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "agent" && (
                  <div className="w-7 h-7 border-2 border-black bg-white flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                )}

                <div
                  className={`max-w-[90%] ${
                    msg.role === "user"
                      ? "bg-accent text-black border-2 border-black shadow-[2px_2px_0px_#000]"
                      : "bg-white border-2 border-black shadow-[1px_1px_0px_#000]"
                  } p-2.5`}
                >
                  {!msg.plan && <div className="text-xs whitespace-pre-wrap leading-relaxed font-bold">{msg.text}</div>}

                  {msg.plan && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge
                          className={`text-[9px] px-1.5 py-0 font-bold border-2 border-black ${
                            msg.phase === "intent"
                              ? "bg-accent text-black"
                              : msg.phase === "planning"
                                ? "bg-blue-500 text-white"
                                : msg.phase === "executing"
                                  ? "bg-orange-500 text-white"
                                  : "bg-green-500 text-white"
                          }`}
                        >
                          {msg.phase === "intent" ? "INTENT" : msg.phase === "planning" ? "PLAN" : msg.phase === "executing" ? "EXEC" : "DONE"}
                        </Badge>
                        <span className="text-[9px] text-muted-foreground">{formatTimestamp(msg.timestamp)}</span>
                      </div>

                      {msg.text && <p className="text-xs font-bold">{msg.text}</p>}

                      {msg.progress !== undefined && (
                        <div className="space-y-0.5">
                          <div className="flex justify-between text-[9px] font-bold text-muted-foreground">
                            <span>Progress</span>
                            <span>{msg.progress}%</span>
                          </div>
                          <Progress value={msg.progress} className="h-1.5 [&>div]:bg-accent border-2 border-black bg-white" />
                        </div>
                      )}                          {msg.result && (
                          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="border-2 border-black bg-white p-2.5 space-y-1.5 shadow-[2px_2px_0px_#000]">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Check className="w-3.5 h-3.5 text-green-600" />
                            <span className="text-xs font-bold text-green-600">{msg.result.modality === "memory" ? "Matches Found!" : "Complete!"}</span>
                            {msg.result.provider && (
                              <span className="text-[9px] font-bold text-muted-foreground border-2 border-black bg-accent/30 px-1.5 py-0.5">
                                via <span className="text-foreground">{msg.result.provider}</span>
                                {msg.result.modality && msg.result.modality !== "text" && (
                                  <span className="text-muted-foreground"> · {msg.result.modality}</span>
                                )}
                              </span>
                            )}
                          </div>

                          {/* Memory search results */}
                          {msg.result.matches && msg.result.matches.length > 0 && (
                            <div className="space-y-1.5">
                              {msg.result.matches.map((m: MemoryMatch, i: number) => (
                                <div key={m.id || i} className="border-2 border-black bg-muted/30 p-2 space-y-1">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-foreground truncate max-w-[70%]">{m.summary}</span>
                                    <Badge className="text-[8px] px-1 py-0 border-2 border-black bg-green-100 text-green-700">
                                      {m.score}% match
                                    </Badge>
                                  </div>
                                  {m.sourceText && <p className="text-[9px] text-muted-foreground truncate">{m.sourceText}</p>}
                                  {m.assetId && (
                                    <span className="text-[9px] font-mono text-blue-600">asset: {String(m.assetId).slice(0, 8)}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Non-memory result card — typed out */}
                          {!msg.result.matches && (() => {
                            const lines = [
                              `📁 ${msg.result.title}.mp4`,
                              `⏱  ${msg.result.duration}`,
                              `💾  ${msg.result.size}`,
                              `📐  ${msg.result.resolution}`,
                            ];
                            const full = lines.join("\n");
                            return (
                              <>
                                <div className="text-[11px] leading-relaxed font-mono font-bold">
                                  <TypewriterText text={full} />
                                </div>
                                <Button size="sm" className="w-full h-7 text-[10px] font-bold bg-black text-white hover:bg-foreground border-2 border-black shadow-[2px_2px_0px_#000] active:shadow-none" onClick={() => {}}>
                                  <Download className="w-3 h-3 mr-1" />
                                  Download
                                </Button>
                              </>
                            );
                          })()}
                        </motion.div>
                      )}

                      {msg.progress !== undefined && msg.progress === 0 && msg.logs?.some((l) => l.type === "error") && (() => {
                        const userIndex = messages.indexOf(msg) - 1;
                        const originalCommand = userIndex >= 0 && messages[userIndex]?.role === "user" ? messages[userIndex].text : "";
                        return (
                          <RetryButton
                            onRetry={() => {
                              if (originalCommand) {
                                setInput(originalCommand);
                                setTimeout(() => sendMessage(originalCommand), 50);
                              }
                            }}
                            label="إعادة المحاولة"
                          />
                        );
                      })()}

                      {msg.logs && msg.logs.length > 0 && (
                        <div>
                          <button onClick={() => toggleLogs(msg.id)} className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-foreground">
                            {msg.logsExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            Logs ({msg.logs.length})
                          </button>
                          <AnimatePresence>
                            {msg.logsExpanded && (
                              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                <div className="mt-1 border-2 border-black bg-white p-1.5 max-h-24 overflow-y-auto space-y-0.5">
                                  {msg.logs.map((log, i) => (
                                    <div key={i} className="flex items-start gap-1.5 text-[9px] font-mono">
                                      <span className={`shrink-0 ${log.type === "success" ? "text-green-600" : log.type === "error" ? "text-red-600" : log.type === "processing" ? "text-blue-600" : "text-muted-foreground"}`}>
                                        {log.type === "success" ? "✓" : log.type === "error" ? "✗" : log.type === "processing" ? "→" : "•"}
                                      </span>
                                      <span className="text-muted-foreground">{formatTimestamp(log.timestamp)}</span>
                                      <span className="text-foreground">{log.message}</span>
                                    </div>
                                  ))}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {msg.role === "user" && (
                  <div className="w-7 h-7 border-2 border-black bg-accent flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-3.5 h-3.5 text-black" />
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {isProcessing && (
            <div className="flex gap-2">
              <div className="w-7 h-7 border-2 border-black bg-white flex items-center justify-center shrink-0 relative">
                <Bot className="w-3.5 h-3.5" />
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-accent border border-black animate-pulse" />
              </div>
              <div className="bg-white border-2 border-black p-2 shadow-[1px_1px_0px_#000] flex items-center gap-1.5">
                <span className="text-xs font-bold text-muted-foreground">Thinking</span>
                <span className="flex gap-0.5 ml-0.5">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="w-1.5 h-1.5 bg-black rounded-full"
                      animate={{ opacity: [0.2, 1, 0.2], y: [0, -2, 0] }}
                      transition={{
                        duration: 0.9,
                        repeat: Infinity,
                        delay: i * 0.15,
                        ease: "easeInOut",
                      }}
                    />
                  ))}
                </span>
                <button
                  onClick={handleCancel}
                  title="إيقاف (Cancel)"
                  className="ml-2 flex items-center gap-1 border-2 border-black bg-red-50 hover:bg-red-100 text-red-700 px-2 py-0.5 text-[10px] font-black tracking-widest uppercase"
                >
                  <Square className="w-2.5 h-2.5 fill-current" />
                  Stop
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {!compact && enabledEffects.length > 0 && (
        <div className="border-t-2 border-black bg-muted/40 px-2 py-1.5 shrink-0">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground shrink-0">
              <Sparkles className="w-3 h-3 inline mr-0.5" />
              Effects
            </span>
            {enabledEffects.map((effect: any) => {
              const IconComp = EFFECT_ICON_MAP[effect.iconName || ""] || Wand2;
              return (
                <button
                  key={effect._id}
                  type="button"
                  disabled={isProcessing}
                  onClick={() => latestSendMessage.current?.(effect.command)}
                  title={effect.description || effect.name}
                  className="shrink-0 flex items-center gap-1 border-2 border-black bg-white px-1.5 py-0.5 text-[10px] font-bold hover:bg-accent hover:text-black transition-colors shadow-[1px_1px_0px_#000] active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <IconComp className="w-3 h-3" />
                  <span>{effect.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!compact && (
        <div className="border-t-2 border-black bg-white p-2 shrink-0">
          <div className="flex items-center gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!isProcessing) sendMessage(input); } }}
              placeholder={placeholder}
              disabled={isProcessing}
              className="flex-1 text-xs bg-white border-2 border-black text-foreground placeholder:text-muted-foreground focus-visible:ring-0 h-8"
            />
            {isProcessing ? (
              <Button
                size="icon-sm"
                onClick={handleCancel}
                title="إيقاف (Cancel)"
                aria-label="Cancel"
                className="shrink-0 bg-red-600 text-white hover:bg-red-700 border-2 border-black shadow-[2px_2px_0px_#000] active:shadow-none"
              >
                <Square className="w-3 h-3 fill-current" />
              </Button>
            ) : (
              <Button
                size="icon-sm"
                onClick={() => sendMessage(input)}
                disabled={!input.trim()}
                aria-label="Send command"
                className="shrink-0 bg-black text-white hover:bg-foreground border-2 border-black shadow-[2px_2px_0px_#000] active:shadow-none"
              >
                <Send className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
