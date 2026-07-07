import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import ErrorBoundary from "@/components/ErrorBoundary";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { motion } from "framer-motion";
import { useNavigate } from "react-router";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { useLocalStorage } from "@/hooks/use-local-storage";
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
  ArrowLeft,
  Settings2,
  Sun,
  Moon,
  Eye,
  KeyRound,
  Bot,
  Monitor,
  Save,
  Globe,
  Shield,
  Palette,
  LogOut,
  ExternalLink,
  Sparkles,  Github, Cloud, Cpu, Zap, Wind, Heart, Code, Server, Users, Mail,
  Loader2, AlertCircle, CheckCircle2,
} from "lucide-react";

interface EnvField {
  key: string;
  label: string;
  placeholder: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  secret: boolean;
  category: "ai" | "other";
  apiKeyUrl?: string;
}

// Test result state machine per provider env-var name.
// `passed` is the boolean token the UI/sonner uses to score pass/fail; an
// `ok` result is `passed: true`, an `error` is `passed: false`.
type TestState =
  | { status: "idle"; passed?: undefined }
  | { status: "testing"; passed?: undefined }
  | { status: "ok"; passed: true; latencyMs: number; message: string; extra?: any }
  | { status: "error"; passed: false; message: string };

const AI_FIELDS: EnvField[] = [
  { key: "GROQ_API_KEY", label: "Groq", placeholder: "gsk_...", description: "Whisper transcription & LLM inference", icon: Zap, secret: true, category: "ai", apiKeyUrl: "https://console.groq.com/keys" },
  { key: "GEMINI_API_KEY", label: "Google AI Studio (Gemini)", placeholder: "AIza...", description: "Hook detection, visual analysis + Gemini Native Audio TTS (Kore, Charon, Perseus \u2026)", icon: Sparkles, secret: true, category: "ai", apiKeyUrl: "https://aistudio.google.com/apikey" },
  { key: "OPENAI_API_KEY", label: "OpenAI", placeholder: "sk-...", description: "GPT-4o, o1 series, embeddings + the 6 OpenAI TTS voices (alloy/echo/fable/onyx/nova/shimmer)", icon: Sparkles, secret: true, category: "ai", apiKeyUrl: "https://platform.openai.com/api-keys" },
  { key: "ELEVENLABS_API_KEY", label: "ElevenLabs", placeholder: "xi_...", description: "Premium TTS \u2014 hundreds of voices, voice cloning, multilingual narration", icon: Users, secret: true, category: "ai", apiKeyUrl: "https://elevenlabs.io/app/settings/api-keys" },
  { key: "OPENROUTER_API_KEY", label: "OpenRouter", placeholder: "sk-or-...", description: "Multi-model access (GPT-4o, Claude, DeepSeek)", icon: Globe, secret: true, category: "ai", apiKeyUrl: "https://openrouter.ai/settings/keys" },
  { key: "DEEPSEEK_API_KEY", label: "DeepSeek", placeholder: "sk-...", description: "Direct DeepSeek V3 & R1 reasoning models", icon: Code, secret: true, category: "ai", apiKeyUrl: "https://platform.deepseek.com/api_keys" },
  { key: "MISTRAL_API_KEY", label: "Mistral AI", placeholder: "...", description: "Mistral Large, Codestral & open models", icon: Wind, secret: true, category: "ai", apiKeyUrl: "https://console.mistral.ai/api-keys/" },
  { key: "CEREBRAS_API_KEY", label: "Cerebras", placeholder: "csk-...", description: "Ultra-fast inference (Llama 3.3 70B)", icon: Cpu, secret: true, category: "ai", apiKeyUrl: "https://cloud.cerebras.ai/platform/keys" },
  { key: "COHERE_API_KEY", label: "Cohere", placeholder: "...", description: "Command R+ & embedding models", icon: Sparkles, secret: true, category: "ai", apiKeyUrl: "https://dashboard.cohere.com/api-keys" },
  { key: "NVIDIA_API_KEY", label: "NVIDIA NIM", placeholder: "nvapi-...", description: "Open models on NVIDIA hardware", icon: Cpu, secret: true, category: "ai", apiKeyUrl: "https://build.nvidia.com/settings/api-keys" },
  { key: "HUGGINGFACE_API_KEY", label: "Hugging Face", placeholder: "hf_...", description: "Open models via HF Inference API", icon: Heart, secret: true, category: "ai", apiKeyUrl: "https://huggingface.co/settings/tokens" },
  { key: "GITHUB_TOKEN", label: "GitHub Models", placeholder: "ghp_...", description: "Free GPT-4o, Phi-4 & more via GitHub", icon: Github, secret: true, category: "ai", apiKeyUrl: "https://github.com/settings/tokens" },
  { key: "CF_API_TOKEN", label: "Cloudflare Workers AI", placeholder: "...", description: "Edge AI inference (Llama, Mistral)", icon: Cloud, secret: true, category: "ai", apiKeyUrl: "https://dash.cloudflare.com/profile/api-tokens" },
  { key: "CF_ACCOUNT_ID", label: "Cloudflare Account ID", placeholder: "...", description: "Required for Cloudflare Workers AI", icon: Cloud, secret: false, category: "ai", apiKeyUrl: "https://dash.cloudflare.com/" },
  { key: "OLLAMA_API_KEY", label: "Ollama Cloud", placeholder: "...", description: "Hosted Ollama models", icon: Server, secret: true, category: "ai", apiKeyUrl: "https://ollama.com/settings" },
  { key: "TOGETHER_API_KEY", label: "Together AI", placeholder: "...", description: "Open-source models at scale", icon: Users, secret: true, category: "ai", apiKeyUrl: "https://api.together.xyz/settings/api-keys" },
  { key: "FIREWORKS_API_KEY", label: "Fireworks AI", placeholder: "fw_...", description: "Fast open-source model inference", icon: Sparkles, secret: true, category: "ai", apiKeyUrl: "https://fireworks.ai/account/api-keys" },
  { key: "SAMBANOVA_API_KEY", label: "SambaNova Cloud", placeholder: "...", description: "Enterprise-scale inference", icon: Cpu, secret: true, category: "ai", apiKeyUrl: "https://cloud.sambanova.ai/settings/apis" },
];

const OTHER_FIELDS: EnvField[] = [
  { key: "GOOGLE_CLOUD_API_KEY", label: "Google Cloud (TTS)", placeholder: "AIza...", description: "Text-to-Speech for Gemini Audio", icon: Cloud, secret: true, category: "other", apiKeyUrl: "https://console.cloud.google.com/apis/credentials" },
  { key: "PEXELS_API_KEY", label: "Pexels", placeholder: "...", description: "Stock video search & import", icon: Eye, secret: true, category: "other", apiKeyUrl: "https://www.pexels.com/api/" },
  { key: "COVERR_FREEVIDEOS_API_KEY", label: "Coverr", placeholder: "...", description: "Stock video platform for B-roll", icon: Cloud, secret: true, category: "other", apiKeyUrl: "https://coverr.co/dashboard" },
  { key: "PIXABAY_API_KEY", label: "Pixabay", placeholder: "...", description: "High-quality stock photos / videos / vectors", icon: Cloud, secret: true, category: "other", apiKeyUrl: "https://pixabay.com/api/" },
  { key: "FREESOUND_API_KEY", label: "FreeSound", placeholder: "...", description: "High-quality audio / SFX recordings (CC0 / CC-BY)", icon: Sparkles, secret: true, category: "other", apiKeyUrl: "https://freesound.org/apiv2/apply" },
  { key: "FIRECRAWL_API_KEY", label: "Firecrawl", placeholder: "fc-...", description: "Website content extraction", icon: Globe, secret: true, category: "other", apiKeyUrl: "https://firecrawl.dev/account" },
  { key: "FFMPEG_MICRO_KEY", label: "FFmpeg Micro", placeholder: "ssk_...", description: "Cloud FFmpeg for heavy rendering (offloads video-server)", icon: Server, secret: true, category: "other", apiKeyUrl: "https://ffmpeg-micro.com/dashboard" },
  { key: "CLOUDFLARE_ACCOUNT_ID", label: "Cloudflare Account ID (alias)", placeholder: "cfut_...", description: "Alias for CF_ACCOUNT_ID. Either name works.", icon: Cloud, secret: false, category: "other", apiKeyUrl: "https://dash.cloudflare.com/" },
];

const ASPECT_RATIO_OPTIONS = ["auto", "9:16", "16:9", "1:1", "19:6"] as const;
const RESOLUTION_OPTIONS = ["720p", "1080p", "4K"] as const;
const MODEL_OPTIONS = [
  { value: "gpt-4o", label: "GPT-4o", provider: "OpenAI" },
  { value: "claude-3-sonnet", label: "Claude 3 Sonnet", provider: "Anthropic" },
  { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash", provider: "Google" },
  { value: "deepseek-chat", label: "DeepSeek V3", provider: "DeepSeek" },
  { value: "llama-3.3-70b", label: "Llama 3.3 70B", provider: "Meta" },
];

// All fields combined — used by the test-all / bulk-action flows.
const ALL_FIELDS: EnvField[] = [...AI_FIELDS, ...OTHER_FIELDS];

// ─── Bulk apply helper (parser pattern) ───────────────────────────────────────
//
// Accepts a JSON payload of env-style keys (e.g. `{"GEMINI_API_KEY":"AIza..."}`)
// the user pasted in. Returns the parsed split:
//   - applied: only fields that match one of our `ALL_FIELDS` (whitelisted)
//   - unknownKeys: payload keys we don't recognize (caller can surface them)
//   - emptyKeys: payload keys whose value was empty/whitespace (skipped)
//   - total: payload entry count
//
// This deliberately rejects unknown keys so a bad paste can't poison unrelated
// settings, and so the Settings UI can summarize "applied / ignored / empty"
// counts back to the user.
type BulkApplyResult = {
  applied: Record<string, string>;
  unknownKeys: string[];
  emptyKeys: string[];
  total: number;
};

function bulkApplyKeys(jsonPayload: string): BulkApplyResult {
  const empty: BulkApplyResult = { applied: {}, unknownKeys: [], emptyKeys: [], total: 0 };
  if (!jsonPayload || !jsonPayload.trim()) return empty;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonPayload);
  } catch {
    throw new Error("Couldn't parse JSON. Make sure it's valid (curly braces, quotes around keys).");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Payload must be a JSON object like { \"GEMINI_API_KEY\": \"AIza…\" }.");
  }

  const known = new Set(ALL_FIELDS.map((f) => f.key));
  const applied: Record<string, string> = {};
  const unknownKeys: string[] = [];
  const emptyKeys: string[] = [];
  let total = 0;

  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    total++;
    const valueStr = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
    if (!valueStr) {
      emptyKeys.push(k);
      continue;
    }
    if (known.has(k)) {
      applied[k] = valueStr;
    } else {
      unknownKeys.push(k);
    }
  }

  return { applied, unknownKeys, emptyKeys, total };
}

// ─── OpenRouter Factory: جلب القائمة الديناميكية للنماذج ──────────────────────
//     بدلاً من تثبيت أسماء النماذج، نستدعي /api/v1/models من OpenRouter
//     ونعرضها تلقائياً في قائمة Preferred AI Model

interface OpenRouterModel {
  id: string;
  name: string;
  context_length: number;
  pricing: { prompt: string; completion: string };
}

async function fetchOpenRouterModels(apiKey: string): Promise<OpenRouterModel[]> {
  if (!apiKey) return [];
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}`, "HTTP-Referer": "https://clipforge.app" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const json = await res.json();
    return (json.data || []).map((m: any) => ({
      id: m.id,
      name: m.name || m.id,
      context_length: m.context_length || 0,
      pricing: { prompt: String(m.pricing?.prompt || ""), completion: String(m.pricing?.completion || "") },
    }));
  } catch {
    return [];
  }
}

export default function Settings() {
  const { isAuthenticated, isLoading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const saveApiKeysMut = useMutation(api.users.saveApiKeys);
  const clearApiKeysMut = useMutation(api.users.clearApiKeys);
  const serverSettings = useQuery(api.users.getMySettings, isAuthenticated ? {} : "skip");
  // envValues is persisted to localStorage via useLocalStorage; the hook
  // hydrates on first render and persists on every setter call so cross-tab
  // changes and HMR reloads don't lose the user's pasted keys.
  const [envValues, setEnvValues, _clearEnvValues] = useLocalStorage<Record<string, string>>("clipforge_env_keys", {});
  // darkMode mirrors the <html class="dark"> class on mount then hydrates
  // from localStorage so reloads don't flash the wrong theme.
  const [darkMode, setDarkMode] = useLocalStorage<boolean>("clipforge_dark_mode", () => {
    if (typeof document === "undefined") return false;
    return document.documentElement.classList.contains("dark");
  });
  const [preferredModel, setPreferredModel] = useState("gpt-4o");
  const [defaultRatio, setDefaultRatio] = useState<string>("auto");
  const [defaultResolution, setDefaultResolution] = useState("1080p");
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);

  // ─── Per-provider test results (independent of save state) ───
  const [testResults, setTestResults] = useState<Record<string, TestState>>({});
  const testProviderKeyAction = useAction(api.agent.testProviderKey);

  // Reset test result for a field whenever its value changes — so a stale "✅ ok"
  // badge can't fool the user after they pasted a new key.
  useEffect(() => {
    setTestResults((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const f of ALL_FIELDS) {
        const cur = envValues[f.key] || "";
        const last = next[f.key];
        if (cur && (last?.status === "ok" || last?.status === "error")) {
          // keep existing; freshness is up to the user clicking Test again.
        }
      }
      return changed ? next : prev;
    });
    // intentional: we only listen to envValues; this useEffect is a placeholder so
    // future "invalidate on change" logic has a single point of extension.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envValues]);

  const handleTest = useCallback(async (field: EnvField) => {
    if (!isAuthenticated) {
      toast.error("Sign in first", { description: "Test connection requires a sign-in so the backend can read your synced keys." });
      return;
    }
    // Cloudflare is special: test the *pair* (token + account id).
    const target = field.key === "CLOUDFLARE_ACCOUNT_ID" ? "cloudflare" : field.key;
    setTestResults((prev) => ({ ...prev, [field.key]: { status: "testing" } }));
    try {
      const res = await testProviderKeyAction({ provider: target });
      if (res?.ok) {
        setTestResults((prev) => ({
          ...prev,
          [field.key]: {
            status: "ok",
            passed: true,
            latencyMs: res.latencyMs,
            message: res.message,
            extra: res.extra,
          },
        }));
      } else {
        setTestResults((prev) => ({
          ...prev,
          [field.key]: {
            status: "error",
            passed: false,
            message: res?.message || "Connection failed",
          },
        }));
      }
    } catch (e) {
      setTestResults((prev) => ({
        ...prev,
        [field.key]: { status: "error", passed: false, message: e instanceof Error ? e.message : "Network error" },
      }));
    }
  }, [isAuthenticated, testProviderKeyAction]);

  // ─── Test All: iterate every filled field in parallel and score results ───
  const [testAllRunning, setTestAllRunning] = useState(false);
  const handleTestAll = useCallback(async () => {
    if (!isAuthenticated) {
      toast.error("Sign in first", { description: "Test All needs a sign-in to read your synced keys." });
      return;
    }
    // Cloudflare is a coupled pair — only run the test when BOTH halves are set.
    const cfToken = (envValues["CF_API_TOKEN"] || "").trim();
    const cfAcct = (envValues["CF_ACCOUNT_ID"] || envValues["CLOUDFLARE_ACCOUNT_ID"] || "").trim();
    const filled = ALL_FIELDS.filter((f) => {
      const v = (envValues[f.key] || "").trim();
      if (!v) return false;
      // Don't test Cloudflare Account ID on its own — only when paired with token.
      if (f.key === "CLOUDFLARE_ACCOUNT_ID") return !!cfToken;
      return true;
    });
    if (filled.length === 0) {
      toast("Nothing to test", { description: "Fill at least one API key above first." });
      return;
    }
    setTestAllRunning(true);
    // Optimistically mark every filled key as testing so badges turn to
    // spinners. Preserve previous results for keys that aren't being re-tested.
    setTestResults((prev) => {
      const next = { ...prev };
      for (const f of filled) next[f.key] = { status: "testing" };
      return next;
    });

    // ── Batched execution: chunks of 3 with a 150ms gap between batches. ──
    // Avoids instantaneous fan-out to ~20+ provider endpoints which frequently
    // hits per-minute rate caps. The UI feels "snappy but paced" and badges
    // stream through in waves instead of all firing at once.
    const BATCH_SIZE = 3;
    const BATCH_DELAY_MS = 150;
    type TestResult = { key: string; passed: boolean; latencyMs?: number; message?: string; label: string };
    const results: TestResult[] = [];
    for (let i = 0; i < filled.length; i += BATCH_SIZE) {
      const batch = filled.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (f): Promise<TestResult> => {
          const target = f.key === "CLOUDFLARE_ACCOUNT_ID" ? "cloudflare" : f.key;
          try {
            const r = await testProviderKeyAction({ provider: target });
            if (r?.ok) {
              const next: TestState = { status: "ok", passed: true, latencyMs: r.latencyMs, message: r.message, extra: r.extra };
              setTestResults((prev) => ({ ...prev, [f.key]: next }));
              return { key: f.key, passed: true, latencyMs: r.latencyMs, label: f.label };
            }
            const next: TestState = { status: "error", passed: false, message: r?.message || "Connection failed" };
            setTestResults((prev) => ({ ...prev, [f.key]: next }));
            return { key: f.key, passed: false, message: r?.message || "Connection failed", label: f.label };
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Network error";
            setTestResults((prev) => ({ ...prev, [f.key]: { status: "error", passed: false, message: msg } }));
            return { key: f.key, passed: false, message: msg, label: f.label };
          }
        }),
      );
      results.push(...batchResults);
      // Give the providers (and the UI) a breath between batches.
      if (i + BATCH_SIZE < filled.length) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    const passed = results.filter((r) => r.passed).length;
    const failed = results.length - passed;
    const batchCount = Math.ceil(filled.length / BATCH_SIZE);
    const slowest = results.reduce((m, r) => Math.max(m, r.latencyMs ?? 0), 0);
    setTestAllRunning(false);

    // Sonner summary based on the `passed` token, with pacing context.
    if (failed === 0) {
      toast.success(`All ${passed}/${results.length} passed`, {
        description: `Slowest ${slowest}ms · ${batchCount} batch${batchCount === 1 ? "" : "es"} of 3 · backend can reach every provider`,
      });
    } else if (passed === 0) {
      toast.error(`0/${results.length} passed`, {
        description: `Every tested key failed · first error: ${(results.find((r) => !r.passed)?.message ?? "").slice(0, 160)}`,
      });
    } else {
      toast(`${passed}/${results.length} passed`, {
        description: `${failed} failed · first failure: ${(results.find((r) => !r.passed)?.message ?? "").slice(0, 160)}`,
      });
    }
  }, [isAuthenticated, testProviderKeyAction, envValues]);

  // ─── Bulk paste: apply a JSON payload to envValues then save via saveApiKeys ───
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const handleBulkApply = useCallback(
    async (andSave: boolean) => {
      let parsed: BulkApplyResult;
      try {
        parsed = bulkApplyKeys(bulkText);
      } catch (e) {
        toast.error("Bulk apply failed", { description: e instanceof Error ? e.message : "Invalid JSON" });
        return;
      }
      const keys = Object.keys(parsed.applied);
      // Compute the merged state ONCE so subsequent reads (localStorage, save)
      // are in lock-step with the staged envValues — avoids stale-closure writes
      // on rapid successive applies.
      const merged = { ...envValues, ...parsed.applied };
      if (keys.length === 0 && !andSave) {
        toast("Nothing matched", {
          description: parsed.total === 0
            ? "Empty payload."
            : `${parsed.emptyKeys.length} empty · ${parsed.unknownKeys.length} unknown (not a Settings field)`,
        });
        return;
      }
      // Stage the recognized keys in envValues. Don't truncate what the user already typed.
      setEnvValues(merged);
      setBulkOpen(false);
      setBulkText("");
      toast(`${keys.length} key${keys.length === 1 ? "" : "s"} applied`, {
        description:
          (parsed.unknownKeys.length ? `Ignored ${parsed.unknownKeys.length} unknown · ` : "") +
          (parsed.emptyKeys.length ? `Skipped ${parsed.emptyKeys.length} empty · ` : "") +
          (andSave ? "Saved & synced" : "Staged locally — Save to sync"),
      });

      if (andSave && isAuthenticated && saveApiKeysMut) {
        try {
          await saveApiKeysMut({ apiKeys: merged });
        } catch (e) {
          toast.error("Save failed", { description: e instanceof Error ? e.message : "Unknown error" });
        }
      }
    },
    [bulkText, envValues, isAuthenticated, saveApiKeysMut],
  );

  // OpenRouter Factory: جلب النماذج ديناميكياً عند إدخال مفتاح OpenRouter
  const [openRouterModels, setOpenRouterModels] = useState<OpenRouterModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  // ═══ جلب النماذج عند تغيّر مفتاح OpenRouter ═══
  useEffect(() => {
    const key = envValues["OPENROUTER_API_KEY"] || "";
    if (!key || key.length < 10) { setOpenRouterModels([]); return; }
    let cancelled = false;
    setLoadingModels(true);
    fetchOpenRouterModels(key).then((models) => {
      if (!cancelled) { setOpenRouterModels(models); setLoadingModels(false); }
    });
    return () => { cancelled = true; };
  }, [envValues["OPENROUTER_API_KEY"]]);

  // ═══ Auto-save on paste: عند لصق المفتاح، يتم الحفظ فوراً ═══
  //     يُربط بـ onPaste في حقل OpenRouter تحديداً
  const handlePaste = useCallback(() => {
    const timer = setTimeout(async () => {
      if (isAuthenticated && saveApiKeysMut) {
        try { await saveApiKeysMut({ apiKeys: envValues }); } catch {}
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [envValues, isAuthenticated, saveApiKeysMut]);

  // ═══ دمج النماذج الديناميكية من OpenRouter (بدون تكرار) ═══
  const staticValues = new Set(MODEL_OPTIONS.map((m) => m.value));
  const dynamicModels = openRouterModels
    .filter((m) => !staticValues.has(m.id))
    .slice(0, 20)
    .map((m) => ({
      value: m.id,
      label: m.name.split(":").pop()?.slice(0, 30) || m.id.slice(0, 30),
      provider: m.id.split("/")[0] || "OpenRouter",
    }));
  const allModels = [...MODEL_OPTIONS, ...dynamicModels];

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/auth");
  }, [authLoading, isAuthenticated, navigate]);

  if (authLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground font-mono text-sm">Loading...</div>
      </div>
    );
  }
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("clipforge_dark_mode", String(darkMode));
  }, [darkMode]);

  // Apply <html class="dark"> whenever darkMode flips. useLocalStorage handles
  // the persistence layer; this effect just mirrors state to the DOM.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (darkMode) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, [darkMode]);

  const handleSave = async () => {
    // useLocalStorage already persists envValues to localStorage on every set.
    if (!isAuthenticated) {
      toast("Saved locally", {
        description: "Sign in to sync your API keys to the server so the backend agent can use them.",
      });
      return;
    }

    setSaving(true);
    try {
      const res = await saveApiKeysMut({ apiKeys: envValues });
      toast("API keys synced", {
        description: `${res.saved} key${res.saved === 1 ? "" : "s"} saved server-side · backend tasks will use them automatically`,
      });
    } catch (e) {
      toast.error("Couldn't sync keys to server", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    }
    setSaving(false);
  };

  const handleClearAll = async () => {
    if (!isAuthenticated) return;
    setClearing(true);
    try {
      await clearApiKeysMut({});
      setEnvValues({});
      localStorage.removeItem("clipforge_env_keys");
      toast("Keys cleared", { description: "Backend will fall back to server-side env vars" });
    } catch (e) {
      toast.error("Couldn't clear keys", { description: e instanceof Error ? e.message : "" });
    }
    setClearing(false);
  };

  const configuredCount = serverSettings?.configured.length ?? 0;

  // Phase 3A: per-page ErrorBoundary — if a query/mutation throws a Convex
  // error, we surface error.message directly so users (and QA) can debug
  // instead of seeing the generic "Something went wrong".
  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background text-foreground font-sans">
      {/* Header */}
      <header className="border-b-2 border-black bg-white px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => navigate("/dashboard")}
            className="text-muted-foreground hover:text-foreground border-2 border-black rounded-none"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="w-8 h-8 bg-accent border-2 border-black flex items-center justify-center">
            <Settings2 className="w-4 h-4 text-black" />
          </div>
          <span className="font-bold text-sm">Settings</span>
        </div>
        <div className="flex items-center gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-red-600 border-2 border-black rounded-none"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure you want to sign out?</AlertDialogTitle>
                <AlertDialogDescription>
                  You will be redirected to the login page.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => signOut().finally(() => navigate("/auth"))}>
                  Sign Out
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="bg-black text-white hover:bg-foreground rounded-none font-bold text-xs border-2 border-black shadow-[2px_2px_0px_#000] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
          >
            <Save className="w-3.5 h-3.5 mr-1.5" />
            {saving ? "Syncing..." : `Save & Sync (${configuredCount} live)`}
          </Button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-6 space-y-8">
        {/* ── API Keys ─────────────────────────────────────────────────────── */}
        <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <KeyRound className="w-4 h-4" />
            <h2 className="font-bold text-sm">API Keys</h2>
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-mono text-muted-foreground border-2 border-black">
              Server-synced · Required for AI features
            </Badge>
            <button
              type="button"
              onClick={() => setBulkOpen((v) => !v)}
              className="ml-auto text-[10px] font-bold border-2 border-black bg-white hover:bg-accent px-2 py-0.5 shadow-[1px_1px_0px_#000] active:shadow-none active:translate-x-[1px] active:translate-y-[1px]"
              title="Paste a JSON object with env-style keys (e.g. {'GEMINI_API_KEY':'…'}). Unknown keys are ignored."
            >
              {bulkOpen ? "Close bulk paste" : "Bulk paste JSON"}
            </button>
            <button
              type="button"
              onClick={handleTestAll}
              disabled={testAllRunning}
              className="text-[10px] font-bold border-2 border-black bg-white hover:bg-accent px-2 py-0.5 shadow-[1px_1px_0px_#000] active:shadow-none active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
              title="Test every filled key against its provider in parallel"
            >
              {testAllRunning ? (
                <><Loader2 className="w-3 h-3 animate-spin" /> Testing…</>
              ) : (
                <><CheckCircle2 className="w-3 h-3" /> Test All</>
              )}
            </button>
            {isAuthenticated && configuredCount > 0 && (
              <button
                onClick={handleClearAll}
                disabled={clearing}
                className="text-[10px] font-bold text-muted-foreground hover:text-red-600 transition-colors"
                title="Remove all synced keys — backend falls back to env vars"
              >
                {clearing ? "Clearing..." : `Clear (${configuredCount})`}
              </button>
            )}
          </div>

          {bulkOpen && (
            <div className="mb-4 bg-white border-2 border-black p-3 shadow-[2px_2px_0px_#000]">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-bold text-[11px] uppercase tracking-wide">Bulk Paste</span>
                <span className="text-[9px] text-muted-foreground font-mono">
                  {`{ "GEMINI_API_KEY": "AIza…", "OPENAI_API_KEY": "sk-…" }`}
                </span>
              </div>
              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder='Paste JSON here, e.g. {"GROQ_API_KEY":"gsk_…","ELEVENLABS_API_KEY":"xi_…"}'
                rows={4}
                className="w-full bg-white border-2 border-black px-2 py-1.5 text-[11px] font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => handleBulkApply(false)}
                  className="text-[10px] font-bold border-2 border-black bg-white hover:bg-accent px-3 py-1 shadow-[2px_2px_0px_#000] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
                >
                  Apply
                </button>
                <button
                  type="button"
                  onClick={() => handleBulkApply(true)}
                  className="text-[10px] font-bold border-2 border-black bg-black text-white hover:bg-foreground px-3 py-1 shadow-[2px_2px_0px_#000] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
                  title="Apply keys AND save to the server in one click"
                >
                  Apply & Save
                </button>
                <button
                  type="button"
                  onClick={() => { setBulkText(""); setBulkOpen(false); }}
                  className="text-[10px] font-bold text-muted-foreground hover:text-red-600 px-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {(() => {
            const renderField = (field: EnvField) => {
              const Icon = field.icon;
              const isVisible = showSecrets[field.key];
              const t = testResults[field.key];
              const cfgConfigured = serverSettings?.configured.includes(field.key);
              return (
                <div
                  key={field.key}
                  className="bg-white border-2 border-black p-4 hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all shadow-[2px_2px_0px_#000] hover:shadow-[4px_4px_0px_#000]"
                >
                  <div className="flex items-start justify-between mb-2 gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 bg-white border-2 border-black flex items-center justify-center shrink-0">
                        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <label className="font-bold text-xs text-foreground block truncate">{field.label}</label>
                          {cfgConfigured && !t && (
                            <span className="text-[8px] font-bold uppercase tracking-wider text-green-700 border border-green-700 px-1 py-0.5">
                              synced
                            </span>
                          )}
                          {t?.status === "ok" && (
                            <span className="text-[8px] font-bold uppercase tracking-wider text-green-700 border border-green-700 px-1 py-0.5 flex items-center gap-0.5">
                              <CheckCircle2 className="w-2 h-2" /> ok · {t.latencyMs}ms
                            </span>
                          )}
                          {t?.status === "error" && (
                            <span className="text-[8px] font-bold uppercase tracking-wider text-red-600 border border-red-600 px-1 py-0.5 flex items-center gap-0.5">
                              <AlertCircle className="w-2 h-2" /> failed
                            </span>
                          )}
                        </div>
                        <p className="text-[9px] text-muted-foreground leading-tight">{field.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {field.apiKeyUrl && (
                        <a
                          href={field.apiKeyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground text-[10px] font-bold flex items-center gap-0.5 transition-colors"
                          title={`Get your ${field.label} API key`}
                        >
                          Get key
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                      {field.secret && (
                        <button
                          onClick={() => setShowSecrets((s) => ({ ...s, [field.key]: !isVisible }))}
                          className="text-muted-foreground hover:text-foreground text-[10px] font-bold"
                        >
                          {isVisible ? "Hide" : "Show"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleTest(field)}
                        disabled={t?.status === "testing" || !envValues[field.key]?.trim()}
                        className="text-[10px] font-bold border-2 border-black bg-white hover:bg-accent px-2 py-0.5 shadow-[1px_1px_0px_#000] active:shadow-none active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                        title="Send 1 upstream request to verify the key is valid"
                      >
                        {t?.status === "testing" ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Testing
                          </>
                        ) : (
                          <>Test</>
                        )}
                      </button>
                    </div>
                  </div>
                  <Input
                    type={field.secret && !isVisible ? "password" : "text"}
                    value={envValues[field.key] || ""}
                    onChange={(e) => setEnvValues((s) => ({ ...s, [field.key]: e.target.value }))}
                    onPaste={field.key === "OPENROUTER_API_KEY" ? handlePaste : undefined}
                    placeholder={field.placeholder}
                    className="bg-white border-2 border-black text-foreground placeholder:text-muted-foreground h-8 text-xs focus-visible:ring-0"
                  />
                  {t && (t.status === "ok" || t.status === "error") && (
                    <div
                      className={`mt-1.5 text-[9px] font-mono leading-snug break-words border-2 ${
                        t.status === "ok"
                          ? "border-green-700 bg-green-50 text-green-700"
                          : "border-red-600 bg-red-50 text-red-700"
                      } px-2 py-1`}
                    >
                      {t.message}
                      {t.status === "ok" && t.extra?.modelCount != null && (
                        <span className="ml-2 opacity-75">· {t.extra.modelCount} models reachable</span>
                      )}
                    </div>
                  )}
                </div>
              );
            };

            return (
              <>
                {/* ── AI Providers subsection ──────────────────────────── */}
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Bot className="w-3.5 h-3.5" />
                    <h3 className="font-bold text-xs uppercase tracking-wide">AI Providers</h3>
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-mono text-muted-foreground border-2 border-black">
                      {AI_FIELDS.length} services
                    </Badge>
                  </div>
                  <div className="space-y-3">{AI_FIELDS.map(renderField)}</div>
                </div>

                <div className="border-t-2 border-black/20 my-6" />

                {/* ── Other Integrations subsection ────────────────────── */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Settings2 className="w-3.5 h-3.5" />
                    <h3 className="font-bold text-xs uppercase tracking-wide">Other Integrations</h3>
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-mono text-muted-foreground border-2 border-black">
                      {OTHER_FIELDS.length} services
                    </Badge>
                  </div>
                  <div className="space-y-3">{OTHER_FIELDS.map(renderField)}</div>
                </div>
              </>
            );
          })()}
        </motion.section>

        <Separator className="bg-black" />

        {/* ── Preferences ──────────────────────────────────────────────────── */}
        <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div className="flex items-center gap-2 mb-4">
            <Palette className="w-4 h-4" />
            <h2 className="font-bold text-sm">Preferences</h2>
          </div>

          <div className="space-y-4">
            {/* Dark Mode */}
            <div className="bg-white border-2 border-black p-4 shadow-[2px_2px_0px_#000]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 bg-white border-2 border-black flex items-center justify-center">
                    {darkMode ? <Moon className="w-3.5 h-3.5 text-muted-foreground" /> : <Sun className="w-3.5 h-3.5 text-muted-foreground" />}
                  </div>
                  <div>
                    <span className="font-bold text-xs text-foreground">Dark Mode</span>
                    <p className="text-[9px] text-muted-foreground">Toggle dark/light theme</p>
                  </div>
                </div>
                <Switch
                  checked={darkMode}
                  onCheckedChange={setDarkMode}
                  className="data-[state=checked]:bg-accent border-2 border-black [&>span]:bg-black"
                />
              </div>
            </div>

            {/* Preferred AI Model (Fixed + OpenRouter Dynamic) */}
            <div className="bg-white border-2 border-black p-4 shadow-[2px_2px_0px_#000]">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-7 h-7 bg-white border-2 border-black flex items-center justify-center">
                  <Bot className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <span className="font-bold text-xs text-foreground">Preferred AI Model</span>
                  <p className="text-[9px] text-muted-foreground">
                    Default model for agent commands
                    {loadingModels && <span className="ml-2 inline-block animate-pulse">· Fetching from OpenRouter...</span>}
                    {!loadingModels && openRouterModels.length > 0 && (
                      <span className="ml-2 text-green-600">· {openRouterModels.length} dynamic models loaded</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                {allModels.map((model) => (
                  <button
                    key={model.value}
                    onClick={() => setPreferredModel(model.value)}
                    className={`p-2 border-2 border-black text-left transition-all ${
                      preferredModel === model.value
                        ? "bg-accent text-black shadow-[2px_2px_0px_#000]"
                        : "bg-white text-foreground hover:bg-muted hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[2px_2px_0px_#000]"
                    }`}
                  >
                    <span className="font-bold text-[11px] block">{model.label}</span>
                    <span className="text-[8px] text-muted-foreground">{model.provider}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Default Export Settings */}
            <div className="bg-white border-2 border-black p-4 shadow-[2px_2px_0px_#000]">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-7 h-7 bg-white border-2 border-black flex items-center justify-center">
                  <Monitor className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
                <div>
                  <span className="font-bold text-xs text-foreground">Default Export Settings</span>
                  <p className="text-[9px] text-muted-foreground">Aspect ratio and resolution defaults</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[9px] text-muted-foreground uppercase block mb-2 font-bold">Aspect Ratio</label>
                  <div className="flex border-2 border-black">
                    {ASPECT_RATIO_OPTIONS.map((r) => (
                      <button
                        key={r}
                        onClick={() => setDefaultRatio(r)}
                        className={`flex-1 py-1.5 text-[10px] font-bold transition-colors ${
                          defaultRatio === r
                            ? "bg-accent text-black"
                            : "bg-white text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[9px] text-muted-foreground uppercase block mb-2 font-bold">Resolution</label>
                  <div className="flex border-2 border-black">
                    {RESOLUTION_OPTIONS.map((r) => (
                      <button
                        key={r}
                        onClick={() => setDefaultResolution(r)}
                        className={`flex-1 py-1.5 text-[10px] font-bold transition-colors ${
                          defaultResolution === r
                            ? "bg-accent text-black"
                            : "bg-white text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.section>

        <Separator className="bg-black" />

        {/* ── About ────────────────────────────────────────────────────────── */}
        <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <div className="flex items-center gap-2 mb-4">
            <Heart className="w-4 h-4" />
            <h2 className="font-bold text-sm">Need help?</h2>
          </div>
          {/* mailto link — opens the user's mail client so they can reach out
              for one-on-one support. Pre-fills subject/body to reduce friction. */}
          <a
            href="mailto:support@clipforge.app?subject=ClipForge%20support&body=Hi%20team%2C%20I%20need%20help%20with%20%E2%80%A6"
            className="flex items-center justify-between bg-white border-2 border-black p-4 shadow-[2px_2px_0px_#000] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_#000] transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 bg-white border-2 border-black flex items-center justify-center">
                <Mail className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <div>
                <span className="font-bold text-xs text-foreground block">Contact support</span>
                <p className="text-[9px] text-muted-foreground">Opens your mail client to support@clipforge.app</p>
              </div>
            </div>
            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
          </a>
        </motion.section>

        <Separator className="bg-black" />

        <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-4 h-4" />
            <h2 className="font-bold text-sm">About</h2>
          </div>

          <div className="bg-white border-2 border-black p-4 shadow-[2px_2px_0px_#000]">
            <div className="space-y-3 text-[11px] text-muted-foreground">
              <div className="flex justify-between">
                <span>Version</span>
                <span className="text-foreground font-bold">2.0.0</span>
              </div>
              <Separator className="bg-black/20" />
              <div className="flex justify-between">
                <span>Framework</span>
                <span className="text-foreground font-bold">React 19 + Convex + FFmpeg</span>
              </div>
              <Separator className="bg-black/20" />
              <div className="flex justify-between">
                <span>AI Providers</span>
                <span className="text-foreground font-bold">16 AI services supported</span>
              </div>
              <Separator className="bg-black/20" />
              <div className="flex justify-between">
                <span>Video Processing</span>
                <span className="text-foreground font-bold">FFmpeg (Railway)</span>
              </div>
              <Separator className="bg-black/20" />
              <div className="flex justify-between">
                <span>Hosting</span>
                <span className="text-foreground font-bold">Vercel + Convex Cloud + Railway</span>
              </div>
            </div>
          </div>
        </motion.section>
      </div>
    </div>
    </ErrorBoundary>
  );
}
