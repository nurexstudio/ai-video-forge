// ─── src/pages/ChatLab.tsx ────────────────────────────────────────────────────
// NUREX OmniChat — full chat interface.
// Left sidebar: session list (new + existing). Right: message thread + input.
// Quick actions: Transcribe Audio, Find B-Roll, Generate Image, Apply Effect.

import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "react-router";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import ChatMessage from "@/components/ChatMessage";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  MessageCircle,
  Plus,
  Trash2,
  Send,
  Bot,
  Loader2,
  LogOut,
  ArrowLeft,
  Sparkles,
  Music,
  Image,
  Zap,
  Search,
  PanelLeftClose,
  PanelLeft,
  Clock,
} from "lucide-react";

const QUICK_ACTIONS = [
  { icon: Music, label: "Transcribe Audio", command: "Transcribe this audio file and return the text." },
  { icon: Search, label: "Find B-Roll", command: "Search Pexels for stock footage about " },
  { icon: Image, label: "Generate Image", command: "Generate an image of " },
  { icon: Zap, label: "Apply Effect", command: "Apply Glitch effect to the current project" },
];

export default function ChatLab() {
  const { isAuthenticated, isLoading: authLoading, signOut } = useAuth();
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

  return <ChatLabContent />;
}

function ChatLabContent() {
  const navigate = useNavigate();
  const { signOut } = useAuth();

  // ── State ──────────────────────────────────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeSessionId, setActiveSessionId] = useState<any>(() => localStorage.getItem("nurex_chat_session") || null);
  const [input, setInput] = useState("");
  const [processing, setProcessing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Queries ────────────────────────────────────────────────
  const sessions = useQuery((api as any).chat.listSessions as any);
  const messages = useQuery(
    (api as any).chat.getMessages as any,
    activeSessionId ? { sessionId: activeSessionId, limit: 100 } : "skip",
  );

  // ── Mutations & Actions ────────────────────────────────────
  const createSessionMut = useMutation((api as any).chat.createSession as any);
  const deleteSessionMut = useMutation((api as any).chat.deleteSession as any);
  const sendMessageMut = useMutation((api as any).chat.sendMessage as any);
  const executeToolAction = useAction((api as any).chat.executeToolCall as any);

  // ── Session persistence + initial creation ────────────────────
  useEffect(() => {
    // Restore session from localStorage
    const saved = localStorage.getItem("nurex_chat_session");
    if (sessions) {
      if (saved && sessions.some((s: any) => s._id === saved)) {
        setActiveSessionId(saved);
      } else if (!activeSessionId) {
        if (sessions.length === 0) {
          createSessionMut({ title: "New Chat" }).then((id: any) => { setActiveSessionId(id); localStorage.setItem("nurex_chat_session", id); });
        } else {
          setActiveSessionId(sessions[0]._id);
        }
      }
    }
  }, [sessions, activeSessionId, createSessionMut]);

  // Sync active session to localStorage
  useEffect(() => {
    if (activeSessionId) localStorage.setItem("nurex_chat_session", String(activeSessionId));
  }, [activeSessionId]);

  // ── Auto-scroll on new messages ─────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Handlers ────────────────────────────────────────────────
  const handleNewSession = useCallback(async () => {
    const id = await createSessionMut({ title: "New Chat" });
    setActiveSessionId(id);
  }, [createSessionMut]);

  const handleDeleteSession = useCallback(async (sessionId: any, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteSessionMut({ sessionId });
    if (activeSessionId === sessionId) {
      const remaining = (sessions || []).filter((s: any) => s._id !== sessionId);
      setActiveSessionId(remaining[0]?._id || null);
    }
  }, [deleteSessionMut, activeSessionId, sessions]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || !activeSessionId || processing) return;

    const userText = input.trim();
    setInput("");
    setProcessing(true);

    try {
      // Store user message
      const userMsgId = await sendMessageMut({
        sessionId: activeSessionId,
        content: userText,
      });

      // Execute AI call with tool routing
      const result = await executeToolAction({
        sessionId: activeSessionId,
        userMessageId: userMsgId,
        userContent: userText,
      });

      if (!result?.success) {
        console.error("Chat error:", result?.error);
      }
    } catch (err) {
      console.error("Send error:", err);
    }

    setProcessing(false);
  }, [input, activeSessionId, processing, sendMessageMut, executeToolAction]);

  const handleQuickAction = useCallback((command: string) => {
    setInput(command);
  }, []);

  const sortedSessions = [...(sessions || [])].sort(
    (a: any, b: any) => b.createdAt - a.createdAt,
  );
  const sortedMessages = [...(messages || [])].reverse(); // most recent last

  return (
    <div className="h-screen bg-background text-foreground font-sans flex flex-col overflow-hidden">
      {/* ── Top Bar ───────────────────────────────────────────── */}
      <header className="h-12 border-b-2 border-black bg-white flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => navigate("/dashboard")}
            className="text-muted-foreground hover:text-foreground border-2 border-black rounded-none"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-muted-foreground hover:text-foreground">
            {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
          </button>
          <div className="w-px h-5 bg-black/20" />
          <div className="w-7 h-7 bg-accent border-2 border-black flex items-center justify-center">
            <MessageCircle className="w-3.5 h-3.5 text-black" />
          </div>
          <span className="font-bold text-sm text-foreground">NUREX OmniChat</span>
          <Badge variant="outline" className="text-[9px] font-mono border-2 border-black">Dynamic Tools</Badge>
          <span className="text-[10px] text-muted-foreground hidden sm:inline">Universal AI Assistant</span>
        </div>

        <div className="flex items-center gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-red-600 border-2 border-black rounded-none">
                <LogOut className="w-4 h-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Sign out?</AlertDialogTitle>
                <AlertDialogDescription>You will be redirected to the login page.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => signOut().finally(() => navigate("/auth"))}>Sign Out</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* ── Sessions Sidebar ──────────────────────────────── */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 240, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="border-r-2 border-black bg-white shrink-0 overflow-hidden flex flex-col"
            >
              <div className="p-3 border-b-2 border-black">
                <Button
                  size="sm"
                  onClick={handleNewSession}
                  className="w-full bg-black text-white hover:bg-foreground rounded-none font-bold text-xs border-2 border-black shadow-[2px_2px_0px_#000]"
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  New Chat
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {sortedSessions.map((session: any) => (
                  <button
                    key={session._id}
                    onClick={() => setActiveSessionId(session._id)}
                    className={`group w-full flex items-center gap-2 p-2 text-left text-xs font-bold border-2 transition-all ${
                      activeSessionId === session._id
                        ? "bg-accent text-black border-black shadow-[2px_2px_0px_#000]"
                        : "bg-white text-muted-foreground border-transparent hover:border-black hover:text-foreground"
                    }`}
                  >
                    <MessageCircle className="w-3 h-3 shrink-0" />
                    <span className="truncate flex-1">{session.title}</span>
                    <button
                      onClick={(e) => handleDeleteSession(session._id, e)}
                      className="opacity-0 group-hover:opacity-100 hover:text-red-600 shrink-0"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </button>
                ))}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* ── Main Chat Area ─────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Quick Actions + Attachment */}
          {sortedMessages.length === 0 && (
            <div className="border-b-2 border-black bg-white px-4 py-2 shrink-0 overflow-x-auto">
              <div className="flex gap-2 min-w-max">
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.label}
                    onClick={() => handleQuickAction(action.command)}
                    disabled={processing}
                    className="shrink-0 flex items-center gap-1 border-2 border-black bg-white px-2.5 py-1 text-[10px] font-bold hover:bg-accent transition-colors shadow-[1px_1px_0px_#000]"
                  >
                    <action.icon className="w-3 h-3" />
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {sortedMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                <Bot className="w-12 h-12 mb-3" />
                <p className="font-bold text-sm mb-1">Welcome to NUREX OmniChat</p>
                <p className="text-xs max-w-md">
                  Ask me anything — coding, math, science, video editing, image generation, research, or just chat.
                  I'll use the tools you've configured to get real results.
                </p>
              </div>
            )}

            {sortedMessages.map((msg: any) => (
              <ChatMessage key={msg._id} message={msg} />
            ))}

            {processing && (
              <div className="flex gap-2">
                <div className="w-7 h-7 border-2 border-black bg-white flex items-center justify-center shrink-0">
                  <Bot className="w-3.5 h-3.5" />
                </div>
                <div className="bg-white border-2 border-black p-2 shadow-[1px_1px_0px_#000]">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span className="text-xs font-bold text-muted-foreground">NUREX is thinking...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t-2 border-black bg-white p-3 shrink-0">
            <div className="flex items-center gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Ask NUREX anything — coding, math, research, effects, editing..."
                disabled={!activeSessionId || processing}
                className="flex-1 bg-white border-2 border-black text-foreground placeholder:text-muted-foreground h-10 text-xs focus-visible:ring-0"
              />
              <Button
                size="icon-sm"
                onClick={handleSend}
                disabled={!input.trim() || !activeSessionId || processing}
                className="shrink-0 bg-black text-white hover:bg-foreground border-2 border-black shadow-[2px_2px_0px_#000] active:shadow-none"
              >
                {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
