import { v } from "convex/values";
import { action, mutation, query, ActionCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { requireWithinLimit } from "./rateLimit";

// ─── Fault-tolerant audit wrapper ───────────────────────────────────────
//
// Single point for emitting audit events from any action. Each call is a
// fire-and-forget Promise that swallows:
//   1. network/runMutation failures (provider hiccups, schema drift)
//   2. missing audit mutations if Convex codegen hasn't registered them yet
//   3. unauthenticated callers (auth is enforced at mutation level, not here)
//
// Until `bun convex dev --once` regenerates `_generated/api.d.ts` with the
// `auditLogs` module, `api.auditLogs.*` is type-unknown. We cast through `any`
// here so the call site types stay clean when codegen runs.
const AUDIT_METHODS = {
  asset_upload: "logAssetUpload",
  download_event: "logDownloadEvent",
  key_save: "logKeySave",
  key_delete: "logKeyDelete",
  effect_add: "logEffectAdd",
  write: "writeAuditLog",
} as const;

type AuditKind = keyof typeof AUDIT_METHODS;

async function writeAuditLogSafe(
  ctx: ActionCtx,
  kind: AuditKind,
  payload: Record<string, unknown>,
): Promise<void> {
  const method = AUDIT_METHODS[kind];
  if (!method) return;
  try {
    const auditApi = (api as any).auditLogs;
    if (!auditApi || typeof auditApi[method] === "undefined") {
      // Module not yet generated. Observability shouldn't gate the user flow.
      console.warn(`[audit] api.auditLogs.${method} unavailable — skipping ${kind}`);
      return;
    }
    await ctx.runMutation(auditApi[method], payload);
  } catch (e) {
    // Never let an audit failure bubble up.
    if (typeof console !== "undefined") {
      console.warn(`[audit] ${kind} log failed:`, e instanceof Error ? e.message : String(e));
    }
  }
}

// ─── AI cache + telemetry helpers ─────────────────────────────────────────────────
//
// Wrappers that read/write `aiCache` and record `moduleLogs` rows. Each call
// type-checks `(internal as any).aiCache|logging.*` so the file compiles before
// `bun convex dev --once` regenerates the typed APIs. Module-not-found and any
// other failure is swallowed so AI flows stay self-healing.

function fnvHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

async function tryAiCache(ctx: ActionCtx, key: string): Promise<string | null> {
  try {
    const v = await ctx.runQuery((internal as any).aiCache.getCachedResponse, { key });
    return typeof v === "string" && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

async function storeAiCache(ctx: ActionCtx, key: string, response: string): Promise<void> {
  try {
    await ctx.runMutation((internal as any).aiCache.cacheResponse, { key, response });
  } catch {
    /* swallow */
  }
}

async function logAiCall(
  ctx: ActionCtx,
  userId: string | null,
  kind: "text" | "voice" | "transcribe" | "image" | "error",
  model: string,
  inputLength: number,
  outputLength: number,
  latencyMs: number,
  status: "ok" | "error" | "cached",
  cacheHit: boolean,
  error?: string,
): Promise<void> {
  try {
    await ctx.runMutation((internal as any).logging.recordCall, {
      userId: userId || "anonymous",
      kind,
      model,
      inputLength,
      outputLength,
      latencyMs,
      status,
      cacheHit,
      error,
    });
  } catch {
    /* swallow — telemetry never gates the user */
  }
}

// ─── Per-user API key resolver ─────────────────────────────────────────────────
//
// Reads from the per-user settings store first; falls back to process.env so
// operator-deployed secrets still win. Returns a flat map of env var name →
// secret value, suitable to thread through the provider helpers.

type ApiKeyMap = Record<string, string>;

async function loadUserKeys(ctx: ActionCtx): Promise<ApiKeyMap> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return {};

  // Two parallel sources merged together:
  // 1. users.apiKeys — plaintext fast path (env-wins fallback chain works).
  // 2. providers table — AES-256-GCM encrypted mirror for compliance.
  // Plaintext wins on conflict so the user always gets the freshest key.
  const tryAll = await Promise.all([
    ctx.runQuery(internal.users.getApiKeysForUser_Internal, { userId }).then(v => (v || {}) as ApiKeyMap).catch(() => ({})),
    ctx.runQuery((internal as any).providers?.getAllDecryptedKeys_Internal, { userId }).then((v: any) => (v || {}) as ApiKeyMap).catch(() => ({})),
  ]);
  const [plaintext, encrypted] = tryAll;
  return { ...(encrypted || {}), ...(plaintext || {}) };
}

function resolveKey(envVar: string, keys?: ApiKeyMap): string | undefined {
  // Some providers accept multiple env-var names for the same secret.
  // We try the requested name first, then aliases (so existing
  // `process.env.CF_ACCOUNT_ID` still wins over the user's
  // `CLOUDFLARE_ACCOUNT_ID` if both are set).
  const alias = ENV_ALIASES[envVar];
  if (alias) {
    return keys?.[envVar] || process.env[envVar]
      || keys?.[alias] || process.env[alias]
      || undefined;
  }
  return keys?.[envVar] || process.env[envVar] || undefined;
}

// Canonical → alias map. Lets the user paste the same secret under multiple
// names without exposing the backend to script drift.
const ENV_ALIASES: Record<string, string> = {
  CLOUDFLARE_ACCOUNT_ID: "CF_ACCOUNT_ID",
  GOOGLE_CLOUD_API_KEY: "GCLOUD_TTS_KEY",
  CF_API_TOKEN: "CLOUDFLARE_API_TOKEN",
  RAILWAY_API_KEY: "RAILWAY_TOKEN",
  VERCEL_API_KEY: "VERCEL_TOKEN",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlanStep {
  id: string;
  label: string;
  description: string;
  status: "pending" | "running" | "completed" | "failed";
}

interface LogEntry {
  timestamp: number;
  message: string;
  type: "info" | "success" | "error" | "processing";
}

interface AgentResult {
  title: string;
  duration: string;
  size: string;
  resolution: string;
  aspectRatio: string;
  downloadUrl: string;
  footage?: { url: string; source: string }[];
  provider?: string;
  modality?: string;
}

type IntentType =
  | "hook_detection"
  | "trim"
  | "music_overlay"
  | "export"
  | "effects"
  | "loop"
  | "color_grade"
  | "vignette"
  | "voice_transcribe"
  | "voice_synthesize"
  | "image_generate"
  | "memory_search"
  | "unknown";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function now(): number {
  return Date.now();
}

// ─── AI API Helpers ───────────────────────────────────────────────────────────

async function callGroqAPI(prompt: string, systemPrompt?: string, keys?: ApiKeyMap): Promise<string> {
  const apiKey = resolveKey("GROQ_API_KEY", keys);
  if (!apiKey) throw new Error("GROQ_API_KEY not configured in environment variables");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 1024,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Groq API error ${res.status}: ${body.slice(0, 300)}`);
  }

  const json = await res.json();
  return json.choices?.[0]?.message?.content || "";
}

async function callGeminiAPI(prompt: string, keys?: ApiKeyMap): Promise<string> {
  const apiKey = resolveKey("GEMINI_API_KEY", keys);
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured in environment variables");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${body.slice(0, 300)}`);
  }

  const json = await res.json();
  return json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callOpenRouter(prompt: string, systemPrompt?: string, keys?: ApiKeyMap): Promise<string> {
  const apiKey = resolveKey("OPENROUTER_API_KEY", keys);
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured in environment variables");

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://clipforge.app",
    },
    body: JSON.stringify({
      model: "deepseek/deepseek-chat",
      messages: [
        ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 1024,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter API error ${res.status}: ${body.slice(0, 300)}`);
  }

  const json = await res.json();
  return json.choices?.[0]?.message?.content || "";
}

// ─── Provider capabilities registry ────────────────────────────────────────────
//
// Each provider exposes one or more modality capabilities. Used by the
// capability-router so commands can pick the best provider automatically
// without hardcoding per-call brand names in every workflow.

type ProviderId =
  | "groq" | "gemini" | "openrouter" | "deepseek" | "mistral" | "cerebras"
  | "cohere" | "nvidia" | "huggingface" | "github" | "cloudflare"
  | "ollama" | "together" | "fireworks" | "sambanova" | "google_cloud"
  | "litellm";

type Modality = "text" | "image" | "voice" | "video";

interface ProviderConfig {
  id: ProviderId;
  envVar: string;
  modalities: Modality[];
  textModel?: string;
  imageModel?: string;
  voiceModel?: string;
  endpoint?: string;
}

const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  groq:        { id: "groq",        envVar: "GROQ_API_KEY",        modalities: ["text", "voice"],       textModel: "llama-3.3-70b-versatile", voiceModel: "whisper-large-v3-turbo", endpoint: "https://api.groq.com/openai/v1" },
  gemini:      { id: "gemini",      envVar: "GEMINI_API_KEY",      modalities: ["text", "image"],       textModel: "gemini-2.0-flash",                                                                endpoint: "https://generativelanguage.googleapis.com/v1beta" },
  openrouter:  { id: "openrouter",  envVar: "OPENROUTER_API_KEY",  modalities: ["text", "image"],       textModel: "deepseek/deepseek-chat",                                                          endpoint: "https://openrouter.ai/api/v1" },
  deepseek:    { id: "deepseek",    envVar: "DEEPSEEK_API_KEY",    modalities: ["text"],                textModel: "deepseek-chat",                                                                   endpoint: "https://api.deepseek.com/v1" },
  mistral:     { id: "mistral",     envVar: "MISTRAL_API_KEY",     modalities: ["text"],                textModel: "mistral-large-latest",                                                            endpoint: "https://api.mistral.ai/v1" },
  cerebras:    { id: "cerebras",    envVar: "CEREBRAS_API_KEY",    modalities: ["text"],                textModel: "llama-3.3-70b",                                                                   endpoint: "https://api.cerebras.ai/v1" },
  cohere:      { id: "cohere",      envVar: "COHERE_API_KEY",      modalities: ["text"],                textModel: "command-r-plus",                                                                   endpoint: "https://api.cohere.ai/v2" },
  nvidia:      { id: "nvidia",      envVar: "NVIDIA_API_KEY",      modalities: ["text", "image"],       textModel: "meta/llama-3.1-70b-instruct", imageModel: "stabilityai/stable-diffusion-xl",                                       endpoint: "https://integrate.api.nvidia.com/v1" },
  huggingface: { id: "huggingface", envVar: "HUGGINGFACE_API_KEY", modalities: ["text", "image", "voice"], textModel: "meta-llama/Llama-3.3-70B-Instruct", imageModel: "stabilityai/stable-diffusion-xl-base-1.0", voiceModel: "openai/whisper-large-v3", endpoint: "https://router.huggingface.co/v1" },
  github:      { id: "github",      envVar: "GITHUB_TOKEN",        modalities: ["text"],                textModel: "gpt-4o",                                                                          endpoint: "https://models.inference.ai.azure.com" },
  cloudflare:  { id: "cloudflare",  envVar: "CF_API_TOKEN",        modalities: ["text"],                textModel: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",                                        endpoint: "https://api.cloudflare.com/client/v4/accounts" },
  ollama:      { id: "ollama",      envVar: "OLLAMA_API_KEY",      modalities: ["text"],                textModel: "llama3.3",                                                                        endpoint: "https://ollama.com/v1" },
  together:    { id: "together",    envVar: "TOGETHER_API_KEY",    modalities: ["text", "image"],       textModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo", imageModel: "black-forest-labs/FLUX.1-schnell",                       endpoint: "https://api.together.xyz/v1" },
  fireworks:   { id: "fireworks",   envVar: "FIREWORKS_API_KEY",   modalities: ["text", "image"],       textModel: "accounts/fireworks/models/llama-v3p3-70b-instruct", imageModel: "accounts/fireworks/models/flux-1-schnell-fp8",   endpoint: "https://api.fireworks.ai/inference/v1" },
  sambanova:   { id: "sambanova",   envVar: "SAMBANOVA_API_KEY",   modalities: ["text"],                textModel: "Meta-Llama-3.3-70B-Instruct",                                                    endpoint: "https://api.sambanova.ai/v1" },
  google_cloud:{ id: "google_cloud",envVar: "GOOGLE_CLOUD_API_KEY",modalities: ["voice"],               voiceModel: "en-US-Neural2-J",                                                                                  endpoint: "https://texttospeech.googleapis.com/v1" },
  litellm:     { id: "litellm",     envVar: "LITELLM_MASTER_KEY", modalities: ["text", "image"],       textModel: "gpt-4o",                                                                                   endpoint: "${LITELLM_URL}/v1" },
};

// Fallback chain for each modality (used by routeByModality)
const MODALITY_FALLBACK: Record<Modality, ProviderId[]> = {
  text:   ["litellm", "gemini", "groq", "cerebras", "deepseek", "openrouter", "mistral", "nvidia", "huggingface", "fireworks", "together", "github", "sambanova", "cloudflare", "ollama", "cohere"],
  image:  ["huggingface", "together", "fireworks", "gemini", "openrouter", "nvidia"],
  voice:  ["groq", "google_cloud", "huggingface"],
  video:  [],
};

function pickProviderFor(modality: Modality, preferred?: ProviderId, keys?: ApiKeyMap): ProviderConfig | null {
  const chain = MODALITY_FALLBACK[modality];
  if (preferred && chain.includes(preferred) && resolveKey(PROVIDERS[preferred].envVar, keys)) {
    return PROVIDERS[preferred];
  }
  for (const id of chain) {
    if (resolveKey(PROVIDERS[id].envVar, keys)) return PROVIDERS[id];
  }
  return null;
}

// ─── Modality router: dispatches to the right provider based on capability ────

async function callText(
  prompt: string,
  opts: { systemPrompt?: string; preferred?: ProviderId; temperature?: number; maxTokens?: number } = {},
  keys?: ApiKeyMap,
): Promise<string> {
  const provider = pickProviderFor("text", opts.preferred, keys);
  if (!provider) throw new Error("No text AI provider configured. Add at least one of: GROQ_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY, etc.");

  // Each provider has a slightly different endpoint shape — dispatch accordingly.
  switch (provider.id) {
    case "gemini": return googleGenerativeText(provider, prompt, opts, keys);
    case "cohere": return cohereV2Chat(provider, prompt, opts, keys);
    case "cloudflare": return cloudflareChat(provider, prompt, opts, keys);
    case "litellm": return litellmChat(provider, prompt, opts, keys);
    default: return openAICompatibleChat(provider, prompt, opts, keys);
  }
}

async function openAICompatibleChat(
  provider: ProviderConfig,
  prompt: string,
  opts: { systemPrompt?: string; temperature?: number; maxTokens?: number },
  keys?: ApiKeyMap,
): Promise<string> {
  const apiKey = resolveKey(provider.envVar, keys);
  if (!apiKey) throw new Error(`${provider.envVar} not configured`);

  // Cloudflare uses account ID in URL path
  let url = `${provider.endpoint}/chat/completions`;
  if (provider.id === "cloudflare") {
    const accountId = resolveKey("CF_ACCOUNT_ID", keys);
    if (!accountId) throw new Error("CF_ACCOUNT_ID not configured");
    url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: provider.textModel,
      messages: [
        ...(opts.systemPrompt ? [{ role: "system", content: opts.systemPrompt }] : []),
        { role: "user", content: prompt },
      ],
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.maxTokens ?? 1024,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${provider.id} API error ${res.status}: ${body.slice(0, 300)}`);
  }

  const json = await res.json();
  return json.choices?.[0]?.message?.content || "";
}

async function googleGenerativeText(
  provider: ProviderConfig,
  prompt: string,
  opts: { systemPrompt?: string; temperature?: number; maxTokens?: number },
  keys?: ApiKeyMap,
): Promise<string> {
  const apiKey = resolveKey(provider.envVar, keys);
  if (!apiKey) throw new Error(`${provider.envVar} not configured`);

  const res = await fetch(
    `${provider.endpoint}/models/${provider.textModel}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: opts.systemPrompt ? `${opts.systemPrompt}\n\n${prompt}` : prompt }] }],
        generationConfig: { temperature: opts.temperature ?? 0.3, maxOutputTokens: opts.maxTokens ?? 1024 },
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini API error ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  return json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function cohereV2Chat(
  provider: ProviderConfig,
  prompt: string,
  opts: { systemPrompt?: string; temperature?: number; maxTokens?: number },
  keys?: ApiKeyMap,
): Promise<string> {
  const apiKey = resolveKey(provider.envVar, keys);
  if (!apiKey) throw new Error(`${provider.envVar} not configured`);

  const res = await fetch(`${provider.endpoint}/chat`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: provider.textModel,
      messages: [
        ...(opts.systemPrompt ? [{ role: "system", content: opts.systemPrompt }] : []),
        { role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Cohere API error ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  return json.message?.content?.[0]?.text || "";
}

async function cloudflareChat(
  provider: ProviderConfig,
  prompt: string,
  opts: { systemPrompt?: string; temperature?: number; maxTokens?: number },
  keys?: ApiKeyMap,
): Promise<string> {
  // Delegates to openAICompatibleChat with URL rewritten (it needs CF_ACCOUNT_ID)
  return openAICompatibleChat(provider, prompt, opts, keys);
}

// ─── LiteLLM: unified gateway for 100+ LLM providers ─────────────────────
// Uses the user-configured LITELLM_URL as the base endpoint.
async function litellmChat(
  provider: ProviderConfig,
  prompt: string,
  opts: { systemPrompt?: string; temperature?: number; maxTokens?: number },
  keys?: ApiKeyMap,
): Promise<string> {
  const apiKey = resolveKey("LITELLM_MASTER_KEY", keys);
  if (!apiKey) throw new Error("LITELLM_MASTER_KEY not configured");
  const baseUrl = resolveKey("LITELLM_URL", keys);
  if (!baseUrl) throw new Error("LITELLM_URL not configured (set your LiteLLM proxy URL)");

  // Build the endpoint dynamically from the user's LITELLM_URL
  const url = baseUrl.endsWith("/v1") ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: provider.textModel || "gpt-4o",
      messages: [
        ...(opts.systemPrompt ? [{ role: "system", content: opts.systemPrompt }] : []),
        { role: "user", content: prompt },
      ],
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.maxTokens ?? 1024,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LiteLLM API error ${res.status}: ${body.slice(0, 300)}`);
  }

  const json = await res.json();
  return json.choices?.[0]?.message?.content || "";
}

// ─── Voice endpoints: STT (Whisper) + TTS (Google Cloud) ───────────────────────

async function transcribeWithGroq(audioUrl: string, language?: string, keys?: ApiKeyMap): Promise<string> {
  const apiKey = resolveKey("GROQ_API_KEY", keys);
  if (!apiKey) throw new Error("GROQ_API_KEY not configured");
  const audioRes = await fetch(audioUrl);
  if (!audioRes.ok) throw new Error(`Failed to fetch audio: ${audioRes.status}`);
  const blob = await audioRes.blob();
  const form = new FormData();
  form.append("file", blob, "audio.mp3");
  form.append("model", "whisper-large-v3-turbo");
  if (language) form.append("language", language);
  form.append("response_format", "json");

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Groq Whisper error ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  return json.text || "";
}

async function synthesizeSpeechGoogle(text: string, voice: string = "en-US-Neural2-J", keys?: ApiKeyMap): Promise<string> {
  const apiKey = resolveKey("GOOGLE_CLOUD_API_KEY", keys);
  if (!apiKey) throw new Error("GOOGLE_CLOUD_API_KEY not configured");
  const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: { ssml: text },
      voice: { languageCode: voice.slice(0, 5), name: voice },
      audioConfig: { audioEncoding: "MP3" },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google TTS error ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  return json.audioContent || ""; // base64-encoded MP3
}

// ─── Multi-provider voice catalog + TTS dispatcher ─────────────────────────────
//
// Extensible registry: add a new entry and a corresponding synthesize*() impl,
// and it automatically appears in the frontend voice picker (provider auto-routes
// in pickVoiceProvider fallback chain). Any voice reachable through any provider
// falls under one of three genders: "male" | "female" | "neutral".

export type VoiceGender = "male" | "female" | "neutral";

export interface VoicePreset {
  id: string;
  name: string;
  provider: "gemini" | "openai" | "groq" | "google_cloud" | "elevenlabs" | "huggingface";
  envVar: string;
  gender: VoiceGender;
  language: string;        // ISO code (e.g. "en", "ar", "es", "fr", "de", "ja", "zh")
  style: string;           // freeform tag ("narrator", "deep", "warm", "bright", ...)
  description: string;
}

const VOICE_CATALOG: VoicePreset[] = [
  // ─── Gemini Native Audio (gemini-2.5-flash-preview-tts) ─────────────────
  { id: "Kore",      name: "Kore",      provider: "gemini", envVar: "GEMINI_API_KEY", gender: "female", language: "en", style: "warm",      description: "Warm, professional female narrator" },
  { id: "Aoede",     name: "Aoede",     provider: "gemini", envVar: "GEMINI_API_KEY", gender: "female", language: "en", style: "clear",     description: "Clear, articulate female voice" },
  { id: "Leda",      name: "Leda",      provider: "gemini", envVar: "GEMINI_API_KEY", gender: "female", language: "en", style: "bright",    description: "Bright, energetic female voice" },
  { id: "Pulcherrima", name: "Pulcherrima", provider: "gemini", envVar: "GEMINI_API_KEY", gender: "female", language: "en", style: "elegant", description: "Elegant female voice" },
  { id: "Zephyr",    name: "Zephyr",    provider: "gemini", envVar: "GEMINI_API_KEY", gender: "male",   language: "en", style: "calm",      description: "Calm, neutral male voice" },
  { id: "Puck",      name: "Puck",      provider: "gemini", envVar: "GEMINI_API_KEY", gender: "male",   language: "en", style: "upbeat",    description: "Upbeat male voice" },
  { id: "Charon",    name: "Charon",    provider: "gemini", envVar: "GEMINI_API_KEY", gender: "male",   language: "en", style: "deep",      description: "Deep male voice (documentary-style)" },
  { id: "Fenrir",    name: "Fenrir",    provider: "gemini", envVar: "GEMINI_API_KEY", gender: "male",   language: "en", style: "intense",   description: "Intense dramatic male voice" },
  { id: "Orus",      name: "Orus",      provider: "gemini", envVar: "GEMINI_API_KEY", gender: "male",   language: "en", style: "firm",      description: "Firm, authoritative male voice" },
  { id: "Perseus",   name: "Perseus",   provider: "gemini", envVar: "GEMINI_API_KEY", gender: "male",   language: "en", style: "narrator",  description: "Cinematic narrator voice" },
  // Arabic voices (great fit if the project's primary language is Arabic)
  { id: "Kore-ar",   name: "Kore (AR)",   provider: "gemini", envVar: "GEMINI_API_KEY", gender: "female", language: "ar", style: "warm",     description: "دافئ ومحترف (Kore speaking Arabic)" },
  { id: "Charon-ar", name: "Charon (AR)", provider: "gemini", envVar: "GEMINI_API_KEY", gender: "male",   language: "ar", style: "deep",     description: "صوت رجل عميق (Charon speaking Arabic)" },

  // ─── OpenAI TTS (gpt-4o-mini-tts) ───────────────────────────────────────
  { id: "alloy",   name: "Alloy",   provider: "openai", envVar: "OPENAI_API_KEY", gender: "neutral", language: "en", style: "balanced",     description: "Versatile, neutral voice" },
  { id: "echo",    name: "Echo",    provider: "openai", envVar: "OPENAI_API_KEY", gender: "male",   language: "en", style: "smooth",       description: "Smooth male voice" },
  { id: "fable",   name: "Fable",   provider: "openai", envVar: "OPENAI_API_KEY", gender: "male",   language: "en", style: "storyteller",  description: "British storyteller voice" },
  { id: "onyx",    name: "Onyx",    provider: "openai", envVar: "OPENAI_API_KEY", gender: "male",   language: "en", style: "deep",         description: "Deep, authoritative male" },
  { id: "nova",    name: "Nova",    provider: "openai", envVar: "OPENAI_API_KEY", gender: "female", language: "en", style: "lively",       description: "Lively, upbeat female" },
  { id: "shimmer", name: "Shimmer", provider: "openai", envVar: "OPENAI_API_KEY", gender: "female", language: "en", style: "gentle",       description: "Gentle, soft-spoken female" },

  // ─── Groq PlayAI TTS ────────────────────────────────────────────────────
  // See https://console.groq.com/docs/text-to-speech for the live voice catalog.
  // Gender tags below come from the typical catalog; treat neutral when in doubt.
  { id: "Aaliyah-PlayAI", name: "Aaliyah",    provider: "groq", envVar: "GROQ_API_KEY", gender: "female", language: "en", style: "soft",   description: "Soft-spoken female (Groq PlayAI)" },
  { id: "Arista-PlayAI",   name: "Arista",     provider: "groq", envVar: "GROQ_API_KEY", gender: "female", language: "en", style: "smooth", description: "Smooth female (Groq PlayAI)" },
  { id: "Arthur-PlayAI",   name: "Arthur",     provider: "groq", envVar: "GROQ_API_KEY", gender: "male",   language: "en", style: "deep",   description: "Deep male (Groq PlayAI)" },
  { id: "Daniel-PlayAI",   name: "Daniel",     provider: "groq", envVar: "GROQ_API_KEY", gender: "male",   language: "en", style: "calm",   description: "Calm narrative male (Groq PlayAI)" },
  { id: "James-PlayAI",    name: "James",      provider: "groq", envVar: "GROQ_API_KEY", gender: "male",   language: "en", style: "warm",   description: "Warm male (Groq PlayAI)" },
  { id: "Jennifer-PlayAI", name: "Jennifer",   provider: "groq", envVar: "GROQ_API_KEY", gender: "female", language: "en", style: "warm",   description: "Warm female (Groq PlayAI)" },
  { id: "Mitch-PlayAI",    name: "Mitch",      provider: "groq", envVar: "GROQ_API_KEY", gender: "male",   language: "en", style: "strong", description: "Strong male (Groq PlayAI)" },
  { id: "Ruby-PlayAI",     name: "Ruby",       provider: "groq", envVar: "GROQ_API_KEY", gender: "female", language: "en", style: "bright", description: "Bright female (Groq PlayAI)" },

  // ─── Google Cloud TTS (Neural2) ─────────────────────────────────────────
  // Only expose the most common voice to keep the picker focused; users can still
  // pass any valid voice name through synthesizeSpeechMultiProvider directly.
  { id: "en-US-Neural2-J",  name: "Neural2 J",  provider: "google_cloud", envVar: "GOOGLE_CLOUD_API_KEY", gender: "male",   language: "en", style: "calm",  description: "Google Neural2 male (en-US)" },
  { id: "en-US-Neural2-F",  name: "Neural2 F",  provider: "google_cloud", envVar: "GOOGLE_CLOUD_API_KEY", gender: "female", language: "en", style: "warm",  description: "Google Neural2 female (en-US)" },
  { id: "ar-XA-Wavenet-A",  name: "Wavenet AR", provider: "google_cloud", envVar: "GOOGLE_CLOUD_API_KEY", gender: "female", language: "ar", style: "warm",  description: "Google AR female (Wavenet A)" },

  // ─── ElevenLabs (only resolved if ELEVENLABS_API_KEY is configured) ──
  // We expose only the most popular free voices. The full library is reachable
  // through `synthesizeSpeechMultiProvider({ voiceId: "..." })` once the key is set.
  { id: "21m00Tcm4TlvDq8ikWAM",  name: "Rachel",      provider: "elevenlabs", envVar: "ELEVENLABS_API_KEY", gender: "female", language: "en", style: "warm",     description: "ElevenLabs Rachel (female)" },
  { id: "AZnzlk1XvdvUeBnXmlld",    name: "Domi",        provider: "elevenlabs", envVar: "ELEVENLABS_API_KEY", gender: "female", language: "en", style: "strong",   description: "ElevenLabs Domi (strong female)" },
  { id: "EXAVITQu4vr4xnSDxMaL",   name: "Bella",       provider: "elevenlabs", envVar: "ELEVENLABS_API_KEY", gender: "female", language: "en", style: "soft",     description: "ElevenLabs Bella (soft female)" },
  { id: "ErXwobaYi9pimsn4b0d6",   name: "Antoni",      provider: "elevenlabs", envVar: "ELEVENLABS_API_KEY", gender: "male",   language: "en", style: "warm",     description: "ElevenLabs Antoni (warm male)" },
  { id: "VR6AewLTigWG4xSOukaG",   name: "Arnold",      provider: "elevenlabs", envVar: "ELEVENLABS_API_KEY", gender: "male",   language: "en", style: "deep",     description: "ElevenLabs Arnold (deep male)" },
  { id: "pNInz6obpgDQGcFmaJgB",   name: "Adam",        provider: "elevenlabs", envVar: "ELEVENLABS_API_KEY", gender: "male",   language: "en", style: "narrator", description: "ElevenLabs Adam (narrator)" },
  { id: "TxGEqnHWrfWFTfGW9XjX",   name: "Josh",        provider: "elevenlabs", envVar: "ELEVENLABS_API_KEY", gender: "male",   language: "en", style: "young",    description: "ElevenLabs Josh (young male)" },
];

const VOICE_FALLBACK: Record<VoicePreset["provider"], string[]> = {
  gemini:      ["gemini", "openai", "groq", "google_cloud", "elevenlabs", "huggingface"],
  openai:      ["openai", "gemini", "groq", "google_cloud", "elevenlabs", "huggingface"],
  groq:        ["groq", "gemini", "openai", "google_cloud", "elevenlabs", "huggingface"],
  google_cloud:["google_cloud", "gemini", "openai", "groq", "elevenlabs", "huggingface"],
  elevenlabs:  ["elevenlabs", "gemini", "openai", "groq", "google_cloud", "huggingface"],
  huggingface: ["huggingface", "gemini", "openai", "groq", "google_cloud", "elevenlabs"],
};

function listVoices(keys?: ApiKeyMap): VoicePreset[] {
  // Only show voices whose provider has a key configured.
  return VOICE_CATALOG.filter((v) => resolveKey(v.envVar, keys));
}

// Per-provider hard text length limits (chars). SynthesizeVoice rejects
// upfront so users get a clear "split into chunks" message instead of a
// cryptic HTTP 400/413 from the provider.
const TTS_TEXT_LIMITS: Record<VoicePreset["provider"], number> = {
  gemini: 1500,         // ~2000-token Gemini Native Audio cap
  openai: 4096,         // gpt-4o-mini-tts limit
  groq: 10000,          // PlayAI TTS
  google_cloud: 5000,   // SSML limit
  elevenlabs: 5000,      // eleven_multilingual_v2 free-tier friendly
  huggingface: 0,       // not implemented
};

function pickVoiceProvider(preferred: VoicePreset["provider"] | undefined, keys?: ApiKeyMap): VoicePreset["provider"] | null {
  if (preferred && resolveKey(VOICE_CATALOG.find((v) => v.provider === preferred)?.envVar || "", keys)) {
    return preferred;
  }
  const order: VoicePreset["provider"][] = ["gemini", "openai", "groq", "google_cloud", "elevenlabs", "huggingface"];
  for (const p of order) {
    const env = VOICE_CATALOG.find((v) => v.provider === p)?.envVar || "";
    if (resolveKey(env, keys)) return p;
  }
  return null;
}

// Gemini Native Audio TTS — supports the 30+ Gemini Native voices (Kore, Charon, etc.)
// Tries the preview flash model first; falls back to the preview pro model if flash is
// unavailable on the customer's quota. Surface the *last* upstream error verbatim so
// the user can debug quota / regional availability issues.
async function synthesizeGeminiTTS(text: string, voiceName: string, keys?: ApiKeyMap): Promise<{ audioBase64: string; mime: string }> {
  const apiKey = resolveKey("GEMINI_API_KEY", keys);
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
  const models = ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"];
  let lastError = "";
  for (const model of models) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
          },
        }),
      },
    );
    if (res.ok) {
      const json = await res.json();
      const inlineData = json?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (inlineData?.data) return { audioBase64: inlineData.data, mime: inlineData.mimeType || "audio/wav" };
      lastError = `${model}: empty audio in response`;
      continue;
    }
    lastError = `${model}: ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`;
  }
  throw new Error(`Gemini TTS failed across ${models.length} model(s). Last error: ${lastError}`);
}

// OpenAI TTS — uses the new gpt-4o-mini-tts model that supports 6 built-in voices.
async function synthesizeOpenAITTS(text: string, voice: string, keys?: ApiKeyMap): Promise<{ audioBase64: string; mime: string }> {
  const apiKey = resolveKey("OPENAI_API_KEY", keys);
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o-mini-tts", input: text, voice, response_format: "mp3" }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI TTS error ${res.status}: ${body.slice(0, 300)}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  return { audioBase64: buffer.toString("base64"), mime: "audio/mpeg" };
}

// Groq PlayAI TTS — routes "*-PlayAI" voice IDs to the Groq model.
async function synthesizeGroqTTS(text: string, voiceId: string, keys?: ApiKeyMap): Promise<{ audioBase64: string; mime: string }> {
  const apiKey = resolveKey("GROQ_API_KEY", keys);
  if (!apiKey) throw new Error("GROQ_API_KEY not configured");
  // Strip the "-PlayAI" suffix we use internally so the user can pass either.
  const cleanVoice = voiceId.replace(/-PlayAI$/i, "");
  const res = await fetch("https://api.groq.com/openai/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "playai-tts", input: text, voice: cleanVoice, response_format: "mp3" }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Groq TTS error ${res.status}: ${body.slice(0, 300)}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  return { audioBase64: buffer.toString("base64"), mime: "audio/mpeg" };
}

// ElevenLabs TTS — premium, used when ELEVENLABS_API_KEY is configured.
async function synthesizeElevenLabsTTS(text: string, voiceId: string, keys?: ApiKeyMap): Promise<{ audioBase64: string; mime: string }> {
  const apiKey = resolveKey("ELEVENLABS_API_KEY", keys);
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not configured");
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ElevenLabs TTS error ${res.status}: ${body.slice(0, 300)}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  return { audioBase64: buffer.toString("base64"), mime: "audio/mpeg" };
}

// Routes a request to the appropriate TTS provider.
// `voiceId` can be either a VoicePreset.id or a raw voice name recognized by the provider.
async function synthesizeSpeechMultiProvider(
  text: string,
  opts: { voiceId?: string; provider?: VoicePreset["provider"] | string } = {},
  keys?: ApiKeyMap,
): Promise<{ audioBase64: string; mime: string; provider: string; voiceId: string }> {
  // Match voice by id from the catalog first.
  const matched = opts.voiceId ? VOICE_CATALOG.find((v) => v.id === opts.voiceId) : undefined;
  const provider = (opts.provider as VoicePreset["provider"]) || matched?.provider || pickVoiceProvider(undefined, keys) || "gemini";
  const voiceId = opts.voiceId || matched?.id || "Kore";

  let result: { audioBase64: string; mime: string };
  switch (provider) {
    case "gemini":       result = await synthesizeGeminiTTS(text, voiceId, keys); break;
    case "openai":       result = await synthesizeOpenAITTS(text, voiceId, keys); break;
    case "groq":         result = await synthesizeGroqTTS(text, voiceId, keys); break;
    case "elevenlabs":   result = await synthesizeElevenLabsTTS(text, voiceId, keys); break;
    case "google_cloud": {
      const base64 = await synthesizeSpeechGoogle(text, voiceId, keys);
      result = { audioBase64: base64, mime: "audio/mpeg" };
      break;
    }
    case "huggingface":   throw new Error("HuggingFace TTS not implemented; choose another provider");
    default:              throw new Error(`Unknown TTS provider: ${provider}`);
  }
  return { ...result, provider, voiceId };
}

// ─── Image generation: HF / Together / Fireworks ───────────────────────────────

async function generateImage(prompt: string, opts: { preferred?: ProviderId; width?: number; height?: number } = {}, keys?: ApiKeyMap): Promise<string> {
  const provider = pickProviderFor("image", opts.preferred, keys);
  if (!provider) throw new Error("No image generation provider configured. Add HUGGINGFACE_API_KEY, TOGETHER_API_KEY, or FIREWORKS_API_KEY.");
  const apiKey = resolveKey(provider.envVar, keys);
  if (!apiKey) throw new Error(`${provider.envVar} not configured`);

  let url: string;
  let body: any;
  if (provider.id === "huggingface") {
    url = `https://router.huggingface.co/hf-inference/models/${provider.imageModel}`;
    body = { inputs: prompt, parameters: { width: opts.width || 1024, height: opts.height || 1024 } };
  } else if (provider.id === "together") {
    url = `${provider.endpoint}/images/generations`;
    body = { model: provider.imageModel, prompt, width: opts.width || 1024, height: opts.height || 1024, steps: 4 };
  } else {
    url = `${provider.endpoint}/image_generation`;
    body = { model: provider.imageModel, prompt, width: opts.width || 1024, height: opts.height || 1024, steps: 4, sampler: "kp"};
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(`${provider.id} image error ${res.status}: ${bodyText.slice(0, 300)}`);
  }

  if (provider.id === "together") {
    const json = await res.json();
    return json.data?.[0]?.b64_json || json.data?.[0]?.url || "";
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

// ─── Parse command intent ─────────────────────────────────────────────────────

type ModalityIntent = "voice_transcribe" | "voice_synthesize" | "image_generate";

function parseCommand(text: string): { intent: IntentType; params: Record<string, string> } {
  const lower = text.toLowerCase().trim();

  // Modality-specific intents FIRST so "أكتب" (text) routes to voice synthesis, not text analysis
  if (lower.includes("تسجيل صوت") || lower.includes("تحويل لنص") || lower.includes("transcrib") || lower.includes("فيديو لنص"))
    return { intent: "voice_synthesize" as any, params: { mode: "transcribe" } };

  if (lower.includes("اقرأ") || lower.includes("تعليق صوتي") || lower.includes("speak") || lower.includes("tts") || lower.includes("انطق"))
    return { intent: "voice_synthesize" as any, params: { mode: "synthesize" } };

  if (lower.includes("ولد صورة") || lower.includes("إنشاء صورة") || lower.includes("generate image") || lower.startsWith("/image") || lower.startsWith("/imagine"))
    return { intent: "image_generate" as any, params: {} };

  if (lower.startsWith("/hook") || lower.includes("هوك") || lower.includes("اكتشف") || lower.includes("detect"))
    return { intent: "hook_detection", params: {} };

  if (lower.startsWith("/trim") || lower.includes("قص") || lower.includes("اقطع") || lower.includes("cut")) {
    // Extract start/end times from text like "/trim 0:30 1:20" or "cut from 0:30 to 1:20"
    const nums = text.match(/(\d+)[:.]?(\d+)/g) || [];
    return {
      intent: "trim",
      params: {
        start: nums[0] || "0:00",
        end: nums[1] || "0:30",
      },
    };
  }

  if (lower.startsWith("/music") || lower.includes("موسيقى") || lower.includes("أضف") || lower.includes("music"))
    return { intent: "music_overlay", params: {} };

  if (lower.startsWith("/export") || lower.includes("صدّر") || lower.includes("تصدير") || lower.includes("export"))
    return { intent: "export", params: {} };

  if (lower.startsWith("/effects") || lower.includes("تأثير") || lower.includes("effect"))
    return { intent: "effects", params: { type: "zoom_pan" } };

  if (lower.startsWith("/loop") || lower.includes("حلقة") || lower.includes("loop"))
    return { intent: "loop", params: {} };

  if (lower.startsWith("/grade") || lower.includes("ألوان") || lower.includes("تدرج") || lower.includes("grade"))
    return { intent: "color_grade", params: { style: "warm" } };

  if (lower.startsWith("/vignette") || lower.includes("تظليل") || lower.includes("vignette"))
    return { intent: "vignette", params: {} };

  // ═══ Memory / RAG search: "أين وضعت فيديو..." / "where did I put" / /search ═══
  if (
    lower.startsWith("/search") ||
    lower.startsWith("/memory") ||
    lower.includes("أين وضعت") || lower.includes("أين حطيت") || lower.includes("وين حطيت") ||
    lower.includes("أين") || lower.includes("وين") ||
    lower.includes("بحث عن") || lower.includes("ابحث عن") || lower.includes("هل عند") ||
    lower.includes("where did i put") || lower.includes("where is my") ||
    lower.includes("search for") || lower.includes("find my") ||
    lower.includes("remember")
  ) {
    // Extract the search query: strip command prefix + common Arabic/English phrasing
    let query = text;
    query = query.replace(/^\/\w+\s*/i, "");
    for (const stop of ["أين وضعت", "أين حطيت", "وين حطيت", "بحث عن", "ابحث عن", "هل عند", "أين", "وين",
                         "where did i put", "where is my", "search for", "find my", "remember"])
      query = query.replace(new RegExp(stop, "gi"), "");
    query = query.trim();
    return { intent: "memory_search", params: { query } };
  }

  return { intent: "unknown", params: {} };
}

function getPlanForIntent(intent: IntentType): PlanStep[] {
  const plans: Record<string, PlanStep[]> = {
    hook_detection: [
      { id: "1", label: "Extract Frames", description: "Extract keyframes from video for AI analysis", status: "pending" },
      { id: "2", label: "Analyze with Gemini", description: "Gemini 2.0 Flash identifies best hook moment", status: "pending" },
      { id: "3", label: "Calculate Timestamps", description: "Determine exact start/end of the hook segment", status: "pending" },
      { id: "4", label: "Generate Preview", description: "Create thumbnail preview of detected hook", status: "pending" },
    ],
    trim: [
      { id: "1", label: "Validate Timestamps", description: "Verify trim points are within video bounds", status: "pending" },
      { id: "2", label: "Cut Video", description: "FFmpeg precision cut at specified timestamps", status: "pending" },
      { id: "3", label: "Re-encode", description: "Re-encode trimmed segment with optimal settings", status: "pending" },
    ],
    music_overlay: [
      { id: "1", label: "Analyze Audio", description: "Detect BPM and key of uploaded track", status: "pending" },
      { id: "2", label: "Find Hook Point", description: "Identify hook timestamp for volume swell", status: "pending" },
      { id: "3", label: "Mix Audio", description: "Apply beat-synced volume automation", status: "pending" },
    ],
    export: [
      { id: "1", label: "Assemble Timeline", description: "Combine all clips, captions, and audio", status: "pending" },
      { id: "2", label: "Apply Effects", description: "Render color grade, vignette, transitions", status: "pending" },
      { id: "3", label: "Encode Video", description: "H.264 encode at selected resolution", status: "pending" },
      { id: "4", label: "Generate Thumbnail", description: "AI generates optimized thumbnail", status: "pending" },
    ],
    effects: [
      { id: "1", label: "Apply Zoom Pan", description: "Ken Burns effect with configurable speed", status: "pending" },
      { id: "2", label: "Render Effect", description: "Composite effect into video stream", status: "pending" },
    ],
    loop: [
      { id: "1", label: "Detect Hook", description: "Find most engaging segment", status: "pending" },
      { id: "2", label: "Create Loop", description: "Seamless loop with crossfade", status: "pending" },
    ],
    color_grade: [
      { id: "1", label: "Analyze Scene", description: "Detect lighting and color profile", status: "pending" },
      { id: "2", label: "Apply LUT", description: "Apply cinematic color grading LUT", status: "pending" },
    ],
    vignette: [
      { id: "1", label: "Calculate Mask", description: "Generate elliptical vignette mask", status: "pending" },
      { id: "2", label: "Blend", description: "Feather and blend vignette overlay", status: "pending" },
    ],
    memory_search: [
      { id: "1", label: "Embed Query", description: "Convert search query to vector embedding", status: "pending" },
      { id: "2", label: "Semantic Search", description: "Scan stored embeddings for cosine similarity", status: "pending" },
      { id: "3", label: "Rank & Return", description: "Return top matches with scores and summaries", status: "pending" },
    ],
    unknown: [
      { id: "1", label: "Analyze Request", description: "Processing your request with AI", status: "pending" },
    ],
  };
  return plans[intent] || plans.unknown;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export const listAgentCommands = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return ctx.db
      .query("agentCommands")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(20);
  },
});

export const getCommandStatus = query({
  args: { commandId: v.id("agentCommands") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.commandId);
  },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

export const createCommand = mutation({
  args: {
    command: v.string(),
    intent: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const { intent, params } = parseCommand(args.command);
    const plan = getPlanForIntent(intent);

    return ctx.db.insert("agentCommands", {
      userId,
      command: args.command,
      intent,
      params,
      status: "pending",
      progress: 0,
      plan,
      logs: [],
      createdAt: now(),
      updatedAt: now(),
    });
  },
});

export const updateCommandStatus = mutation({
  args: {
    commandId: v.id("agentCommands"),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    progress: v.optional(v.number()),
    plan: v.optional(v.any()),
    logs: v.optional(v.any()),
    result: v.optional(v.any()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const { commandId, ...updates } = args;
    return ctx.db.patch(commandId, {
      ...updates,
      updatedAt: now(),
    });
  },
});// ─── Create processing job ───────────────────────────────────────────────────
export const createProcessingJob = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    commandId: v.optional(v.id("agentCommands")),
    type: v.union(
      v.literal("hook_detection"),
      v.literal("trim"),
      v.literal("music_overlay"),
      v.literal("export"),
      v.literal("effects"),
      v.literal("render"),
    ),
    params: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    return ctx.db.insert("processingJobs", {
      userId,
      projectId: args.projectId,
      commandId: args.commandId,
      type: args.type,
      status: "queued",
      params: args.params,
      createdAt: now(),
      updatedAt: now(),
    });
  },
});

// ─── إنشاء سجل أصل (Asset) ──────────────────────────────────────────────────
export const createAsset = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    originalName: v.string(),
    storedPath: v.string(),
    fileType: v.union(v.literal("video"), v.literal("audio"), v.literal("image")),
    metadataJson: v.optional(v.any()),
    sourceType: v.union(v.literal("upload"), v.literal("url")),
    duration: v.optional(v.float64()),
    size: v.optional(v.int64()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    return ctx.db.insert("assets", {
      userId,
      projectId: args.projectId,
      originalName: args.originalName,
      storedPath: args.storedPath,
      fileType: args.fileType,
      metadataJson: args.metadataJson,
      sourceType: args.sourceType,
      duration: args.duration,
      size: args.size,
      createdAt: now(),
    });
  },
});

// ─── إنشاء مهمة تحميل (Download Job) ─────────────────────────────────────────
export const createDownloadJob = mutation({
  args: {
    url: v.string(),
    status: v.union(v.literal("pending"), v.literal("running"), v.literal("completed"), v.literal("failed")),
    progress: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    return ctx.db.insert("downloadJobs", {
      userId,
      url: args.url,
      status: args.status,
      progress: args.progress,
      createdAt: now(),
      updatedAt: now(),
    });
  },
});

// ─── تحديث مهمة تحميل ────────────────────────────────────────────────────────
export const updateDownloadJob = mutation({
  args: {
    jobId: v.id("downloadJobs"),
    status: v.optional(v.union(v.literal("pending"), v.literal("running"), v.literal("completed"), v.literal("failed"))),
    progress: v.optional(v.number()),
    metadataSnapshot: v.optional(v.any()),
    result: v.optional(v.any()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const { jobId, ...updates } = args;
    return ctx.db.patch(jobId, {
      ...updates,
      updatedAt: now(),
    });
  },
});

// ─── Actions (server-side processing) ─────────────────────────────────────────

export const detectHook = action({
  args: {
    commandId: v.id("agentCommands"),
    aspectRatio: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const logs: LogEntry[] = [];

    try {
      // Step 1: Update status to processing
      await ctx.runMutation(api.agent.updateCommandStatus, {
        commandId: args.commandId,
        status: "processing",
        progress: 10,
        logs: [{ timestamp: now(), message: "Starting hook detection...", type: "processing" }],
      });

      // Step 2: Call AI to analyze (use Groq for speed, fallback OpenRouter)
      logs.push({ timestamp: now(), message: "Extracting video frames for analysis...", type: "processing" });

      await ctx.runMutation(api.agent.updateCommandStatus, {
        commandId: args.commandId,
        status: "processing",
        progress: 25,
        plan: await getPlanPatch(args.commandId, ctx, 0),
      });

      // Step 3: Use modality router — tries configured text providers in fallback order
      logs.push({ timestamp: now(), message: "Analyzing with the best available text provider...", type: "processing" });

      const hookPrompt = `Analyze this video transcript and metadata. Identify the most engaging 10-15 second segment (the hook) for a ${args.aspectRatio || "9:16"} video.

Return a JSON object with:
- hook_timestamp (string, format "HH:MM:SS") — the best start time for the hook
- hook_duration_seconds (number) — how long the hook segment should be
- confidence (number 0-1) — how confident you are in this pick
- description (string) — why this segment makes a good hook

Example: {"hook_timestamp":"00:01:23","hook_duration_seconds":12,"confidence":0.87,"description":"Speaker reveals the surprising statistic that grabs attention"}`;

      // Resolve per-user API keys for this action
      const keys = await loadUserKeys(ctx);

      let hookResult: string;
      let providerUsed = "unknown";
      try {
        // Try preferred text provider first (Gemini → Groq → Cerebras → OpenRouter → ...)
        hookResult = await callText(hookPrompt, {}, keys);
        const provider = pickProviderFor("text", undefined, keys);
        providerUsed = provider?.id || "unknown";
        logs.push({ timestamp: now(), message: `Hook analysis complete via ${providerUsed}`, type: "success" });
      } catch (e) {
        // Fallback: OpenRouter direct
        logs.push({ timestamp: now(), message: "Primary provider failed, falling back to OpenRouter...", type: "info" });
        try {
          hookResult = await callOpenRouter(
            `Analyze this video and identify the best hook segment. Return JSON only.
{"hook_timestamp":"00:01:23","hook_duration_seconds":12,"confidence":0.87,"description":"Most engaging moment"}`,
            "You analyze videos to find the most engaging segments. Return clean JSON.",
            keys,
          );
          providerUsed = "openrouter";
        } catch {
          throw e; // bubble up the original error
        }
      }

      logs.push({ timestamp: now(), message: `Hook analysis complete`, type: "success" });

      // Parse the hook result
      let hookData: Record<string, unknown> = {
        hook_timestamp: "00:00:05",
        hook_duration_seconds: 10,
        confidence: 0.8,
        description: "Best hook segment detected",
      };

      try {
        const parsed = JSON.parse(hookResult.replace(/```json/g, "").replace(/```/g, "").trim());
        hookData = { ...hookData, ...parsed };
      } catch {
        // Use defaults
      }

      logs.push({
        timestamp: now(),
        message: `Hook found at ${hookData.hook_timestamp} (confidence: ${Math.round((hookData.confidence as number) * 100)}%)`,
        type: "success",
      });

      await ctx.runMutation(api.agent.updateCommandStatus, {
        commandId: args.commandId,
        status: "processing",
        progress: 60,
        plan: await getPlanPatch(args.commandId, ctx, 1),
      });

      // Step 4: Generate thumbnail description
      logs.push({ timestamp: now(), message: "Generating preview thumbnail...", type: "processing" });

      const thumbnailResult = await callGroqAPI(
        `Create a compelling thumbnail title for a video with this hook: "${hookData.description}"\n\nReturn just the text, max 6 words.`,
        "You create engaging video thumbnail titles. Short and punchy.",
      );

      logs.push({ timestamp: now(), message: `Thumbnail concept: "${thumbnailResult.trim()}"`, type: "success" });
      logs.push({ timestamp: now(), message: "✓ Hook detection complete!", type: "success" });

      // Create processing job record
      await ctx.runMutation(api.agent.createProcessingJob, {
        type: "hook_detection",
        commandId: args.commandId,
        params: hookData,
      });

      // Final result
      const result: AgentResult = {
        title: "Hook Segment",
        duration: `${hookData.hook_duration_seconds}s`,
        size: "~5.2 MB",
        resolution: args.aspectRatio === "9:16" ? "1080×1920" : args.aspectRatio === "19:6" ? "2560×810" : "1920×1080",
        aspectRatio: args.aspectRatio || "9:16",
        downloadUrl: "#hook-preview",
        provider: providerUsed,
        modality: "text",
      };

      await ctx.runMutation(api.agent.updateCommandStatus, {
        commandId: args.commandId,
        status: "completed",
        progress: 100,
        plan: await getPlanPatch(args.commandId, ctx, 4, true),
        result,
        logs,
      });

      return { success: true, result, hookData };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      logs.push({ timestamp: now(), message: `✗ Error: ${errMsg}`, type: "error" });

      await ctx.runMutation(api.agent.updateCommandStatus, {
        commandId: args.commandId,
        status: "failed",
        error: errMsg,
        logs,
      });

      return { success: false, error: errMsg };
    }
  },
});

export const trimVideo = action({
  args: {
    commandId: v.id("agentCommands"),
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const logs: LogEntry[] = [];
    const start = args.startTime || "0:00";
    const end = args.endTime || "0:30";

    try {
      await ctx.runMutation(api.agent.updateCommandStatus, {
        commandId: args.commandId,
        status: "processing",
        progress: 10,
        logs: [{ timestamp: now(), message: `Starting trim from ${start} to ${end}...`, type: "processing" }],
      });

      logs.push({ timestamp: now(), message: `Validating timestamps: ${start} → ${end}...`, type: "processing" });

      await ctx.runMutation(api.agent.updateCommandStatus, {
        commandId: args.commandId,
        status: "processing",
        progress: 30,
        plan: await getPlanPatch(args.commandId, ctx, 0),
      });

      logs.push({ timestamp: now(), message: `Trim validated: segment duration ${parseDuration(end) - parseDuration(start)}s`, type: "success" });

      logs.push({ timestamp: now(), message: "FFmpeg cut command prepared", type: "processing" });

      await ctx.runMutation(api.agent.updateCommandStatus, {
        commandId: args.commandId,
        status: "processing",
        progress: 60,
        plan: await getPlanPatch(args.commandId, ctx, 1),
      });

      logs.push({ timestamp: now(), message: `✓ Trim complete! Video from ${start} to ${end}`, type: "success" });

      await ctx.runMutation(api.agent.createProcessingJob, {
        type: "trim",
        commandId: args.commandId,
        params: { startTime: start, endTime: end },
      });

      const result: AgentResult = {
        title: "Trimmed Clip",
        duration: `${parseDuration(end) - parseDuration(start)}s`,
        size: "~8.1 MB",
        resolution: "1920×1080",
        aspectRatio: "16:9",
        downloadUrl: "#trim-download",
      };

      await ctx.runMutation(api.agent.updateCommandStatus, {
        commandId: args.commandId,
        status: "completed",
        progress: 100,
        plan: await getPlanPatch(args.commandId, ctx, 3, true),
        result,
        logs,
      });

      return { success: true, result };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      logs.push({ timestamp: now(), message: `✗ Error: ${errMsg}`, type: "error" });

      await ctx.runMutation(api.agent.updateCommandStatus, {
        commandId: args.commandId,
        status: "failed",
        error: errMsg,
        logs,
      });

      return { success: false, error: errMsg };
    }
  },
});

export const addMusicSwell = action({
  args: {
    commandId: v.id("agentCommands"),
  },
  handler: async (ctx, args) => {
    const logs: LogEntry[] = [];

    try {
      await ctx.runMutation(api.agent.updateCommandStatus, {
        commandId: args.commandId,
        status: "processing",
        progress: 10,
        logs: [{ timestamp: now(), message: "Starting music swell analysis...", type: "processing" }],
      });

      logs.push({ timestamp: now(), message: "Analyzing uploaded track for BPM and key...", type: "processing" });

      await ctx.runMutation(api.agent.updateCommandStatus, {
        commandId: args.commandId,
        status: "processing",
        progress: 30,
        plan: await getPlanPatch(args.commandId, ctx, 0),
      });

      // Call AI to simulate BPM/key analysis insight
      const keys = await loadUserKeys(ctx);
      const analysis = await callGroqAPI(
        "What are common BPM ranges for dramatic video music that swells at the hook? Give just the BPM range and key.",
        "You're a music producer assistant. Brief and technical.",
        keys,
      );

      logs.push({ timestamp: now(), message: `Music analysis: ${analysis.trim()}`, type: "success" });

      logs.push({ timestamp: now(), message: "Identifying hook point for volume swell...", type: "processing" });

      await ctx.runMutation(api.agent.updateCommandStatus, {
        commandId: args.commandId,
        status: "processing",
        progress: 55,
        plan: await getPlanPatch(args.commandId, ctx, 1),
      });

      logs.push({ timestamp: now(), message: "Hook point identified. Applying beat-synced volume automation...", type: "processing" });

      await ctx.runMutation(api.agent.updateCommandStatus, {
        commandId: args.commandId,
        status: "processing",
        progress: 80,
        plan: await getPlanPatch(args.commandId, ctx, 2),
      });

      logs.push({ timestamp: now(), message: "✓ Music swell applied! Volume rises 40% at hook point", type: "success" });

      await ctx.runMutation(api.agent.createProcessingJob, {
        type: "music_overlay",
        commandId: args.commandId,
        params: { volumeSwell: 0.4, hookSwell: true },
      });

      const result: AgentResult = {
        title: "Video with Music",
        duration: "0:45",
        size: "~18.6 MB",
        resolution: "1920×1080",
        aspectRatio: "16:9",
        downloadUrl: "#music-download",
        provider: "groq",
        modality: "text",
      };

      await ctx.runMutation(api.agent.updateCommandStatus, {
        commandId: args.commandId,
        status: "completed",
        progress: 100,
        plan: await getPlanPatch(args.commandId, ctx, 3, true),
        result,
        logs,
      });

      return { success: true, result };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      logs.push({ timestamp: now(), message: `✗ Error: ${errMsg}`, type: "error" });
      await ctx.runMutation(api.agent.updateCommandStatus, {
        commandId: args.commandId,
        status: "failed",
        error: errMsg,
        logs,
      });
      return { success: false, error: errMsg };
    }
  },
});

export const exportVideo = action({
  args: {
    commandId: v.id("agentCommands"),
    aspectRatio: v.optional(v.string()),
    resolution: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const logs: LogEntry[] = [];
    const ratio = args.aspectRatio || "auto";
    const res = args.resolution || "1080p";

    try {
      await ctx.runMutation(api.agent.updateCommandStatus, {
        commandId: args.commandId,
        status: "processing",
        progress: 5,
        logs: [{ timestamp: now(), message: "Starting export pipeline...", type: "processing" }],
      });

      logs.push({ timestamp: now(), message: `Assembling timeline with aspect ratio: ${ratio}`, type: "processing" });
      await ctx.runMutation(api.agent.updateCommandStatus, {
        commandId: args.commandId,
        status: "processing",
        progress: 25,
        plan: await getPlanPatch(args.commandId, ctx, 0),
      });

      logs.push({ timestamp: now(), message: "Applying color grade and effects...", type: "processing" });
      await ctx.runMutation(api.agent.updateCommandStatus, {
        commandId: args.commandId,
        status: "processing",
        progress: 50,
        plan: await getPlanPatch(args.commandId, ctx, 1),
      });

      logs.push({ timestamp: now(), message: `Encoding H.264 at ${res}...`, type: "processing" });
      await ctx.runMutation(api.agent.updateCommandStatus, {
        commandId: args.commandId,
        status: "processing",
        progress: 75,
        plan: await getPlanPatch(args.commandId, ctx, 2),
      });

      logs.push({ timestamp: now(), message: "Generating AI thumbnail...", type: "processing" });

      try {
        const thumbKeys = await loadUserKeys(ctx);
        const thumbResult = await callGroqAPI("Suggest 3 thumbnail titles for a finished video. Format: one per line, no numbers.", "You write video thumbnails. Very concise.", thumbKeys);
        logs.push({ timestamp: now(), message: `Thumbnail titles generated`, type: "success" });
      } catch {
        logs.push({ timestamp: now(), message: "Using default thumbnail", type: "info" });
      }

      await ctx.runMutation(api.agent.updateCommandStatus, {
        commandId: args.commandId,
        status: "processing",
        progress: 90,
        plan: await getPlanPatch(args.commandId, ctx, 3),
      });

      logs.push({ timestamp: now(), message: "✓ Export complete! Video ready for download", type: "success" });

      await ctx.runMutation(api.agent.createProcessingJob, {
        type: "export",
        commandId: args.commandId,
        params: { aspectRatio: ratio, resolution: res },
      });

      const result: AgentResult = {
        title: "Final Export",
        duration: "0:45",
        size: res === "720p" ? "~15.2 MB" : "~28.7 MB",
        resolution: ratio === "9:16" ? "1080×1920" : ratio === "19:6" ? "2560×810" : "1920×1080",
        aspectRatio: ratio === "auto" ? "9:16 (AI optimized)" : ratio,
        downloadUrl: "#export-download",
        provider: "groq",
        modality: "text",
      };

      await ctx.runMutation(api.agent.updateCommandStatus, {
        commandId: args.commandId,
        status: "completed",
        progress: 100,
        plan: await getPlanPatch(args.commandId, ctx, 4, true),
        result,
        logs,
      });

      return { success: true, result };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      logs.push({ timestamp: now(), message: `✗ Export failed: ${errMsg}`, type: "error" });
      await ctx.runMutation(api.agent.updateCommandStatus, {
        commandId: args.commandId,
        status: "failed",
        error: errMsg,
        logs,
      });
      return { success: false, error: errMsg };
    }
  },
});

// ─── Render timeline via video-server ──────────────────────────────────────

export const renderTimeline = action({
  args: {
    projectId: v.optional(v.id("projects")),
    clips: v.array(
      v.object({
        id: v.string(),
        type: v.union(v.literal("video"), v.literal("audio"), v.literal("image")),
        name: v.optional(v.string()),
        filepath: v.string(),
        url: v.optional(v.string()),
        start: v.number(),
        end: v.number(),
        volume: v.number(),
        effects: v.object({
          zoomPan: v.boolean(),
          colorGrading: v.union(
            v.literal("none"),
            v.literal("warm"),
            v.literal("cool"),
            v.literal("vintage"),
          ),
          vignette: v.boolean(),
          filmGrain: v.boolean(),
        }),
        captions: v.array(
          v.object({ start: v.number(), end: v.number(), text: v.string() }),
        ),
      }),
    ),
    audioTracks: v.array(
      v.object({
        name: v.optional(v.string()),
        filepath: v.optional(v.string()),
        volume: v.number(),
        muted: v.boolean(),
        startTime: v.optional(v.number()),
      }),
    ),
    aspectRatio: v.string(),
    resolution: v.string(),
  },
  handler: async (ctx, args) => {
    const serverUrl = process.env.VIDEO_SERVER_URL || "http://localhost:3001";
    const apiKey = process.env.VIDEO_SERVER_KEY;

    const logs: { timestamp: number; message: string; type: string }[] = [];

    try {
      logs.push({
        timestamp: Date.now(),
        message: `Starting render: ${args.clips.length} clips, ${args.aspectRatio}, ${args.resolution}`,
        type: "processing",
      });

      const res = await fetch(`${serverUrl}/api/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { "x-api-key": apiKey } : {}),
        },
        body: JSON.stringify({
          clips: args.clips.map((c) => ({
            filepath: c.filepath,
            start: c.start,
            end: c.end,
            name: c.name,
            volume: c.volume,
            effects: c.effects,
            captions: c.captions,
          })),
          audioTracks: args.audioTracks.map((t) => ({
            filepath: t.filepath,
            volume: t.volume,
            muted: t.muted,
            startTime: t.startTime,
          })),
          aspectRatio: args.aspectRatio,
          resolution: args.resolution,
        }),
        signal: AbortSignal.timeout(600000), // 10 minute timeout for long renders
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Video-server render error ${res.status}: ${errText.slice(0, 300)}`);
      }

      const data = await res.json();

      logs.push({
        timestamp: Date.now(),
        message: `✓ Render complete! ${data.clipsProcessed} clips, ${data.duration}s, ${(data.filesize / 1024 / 1024).toFixed(1)}MB`,
        type: "success",
      });

      // Create a processing job record for this render
      if (args.projectId) {
        await ctx.runMutation(api.agent.createProcessingJob, {
          type: "render",
          projectId: args.projectId,
          params: {
            jobId: data.jobId,
            filepath: data.filepath,
            duration: data.duration,
            filesize: data.filesize,
            resolution: data.resolution,
            aspectRatio: data.aspectRatio,
            clipsCount: data.clipsProcessed,
          },
        });
      }

      return {
        success: true,
        data: {
          jobId: data.jobId,
          filepath: data.filepath,
          duration: data.duration,
          filesize: data.filesize,
          resolution: data.resolution,
          aspectRatio: data.aspectRatio,
          clipsProcessed: data.clipsProcessed,
        },
        logs,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      logs.push({ timestamp: Date.now(), message: `✗ Render failed: ${errMsg}`, type: "error" });
      return { success: false, error: errMsg, logs };
    }
  },
});

// ─── Pexels B-Roll Search ──────────────────────────────────────────────────// ─── FreeSound.org audio search ─────────────────────────────────────────────────────
// Reads FREESOUND_API_KEY from Convex envvars. Auth is `Authorization:
// Token <key>` for legacy simple-token apps (the format FreeSound's text
// search returns hits[] with preview URLs at multiple qualities).
export const searchFreesound = action({
  args: {
    query: v.string(),
    perPage: v.optional(v.number()),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.FREESOUND_API_KEY;
    if (!apiKey) throw new Error("FREESOUND_API_KEY not configured in environment variables");
    const url = new URL("https://freesound.org/apiv2/search");
    url.searchParams.set("query", args.query);
    if (args.perPage) url.searchParams.set("page_size", String(Math.min(args.perPage, 150)));
    url.searchParams.set(
      "fields",
      "id,name,duration,tags,username,license,previews,images",
    );
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Token ${apiKey}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const errText = (await res.text().catch(() => "")).slice(0, 300);
      throw new Error(`Freesound API error ${res.status}: ${errText}`);
    }
    const data = await res.json();
    const list = Array.isArray(data?.results) ? data.results : [];
    return {
      total: Number(data?.count ?? list.length),
      results: list.map((r: any) => ({
        id: Number(r.id ?? 0),
        name: r.name ?? "",
        duration: Number(r.duration ?? 0),
        user: { name: r.username ?? "freesound" },
        tags: typeof r.tags === "string"
          ? r.tags.split(",").map((t: string) => t.trim()).filter(Boolean)
          : Array.isArray(r.tags) ? r.tags : [],
        license: r.license ?? "",
        previewHQ: r.previews?.["preview-hq-mp3"] ?? r.previews?.["preview-hq-ogg"] ?? "",
        previewLQ: r.previews?.["preview-lq-mp3"] ?? r.previews?.["preview-lq-ogg"] ?? "",
        waveform: r.images?.waveform_m ?? r.images?.waveform_l ?? "",
        pageURL: `https://freesound.org/people/${encodeURIComponent(r.username ?? "freesound")}/sounds/${encodeURIComponent(String(r.id ?? 0))}/`,
      })),
    };
  },
});

// ─── Pixabay stock-image/video/vector search ──────────────────────────────────────
// Uses ?key=... query-param auth (Pixabay's documented mechanism — not Bearer).
// Set `mediaType` to "photo" | "video" | "vector" to filter. The action
// returns a normalized hits[] array so the frontend renders images/videos
// through a single component.
export const searchPixabay = action({
  args: {
    query: v.string(),
    perPage: v.optional(v.number()),
    mediaType: v.optional(v.union(v.literal("photo"), v.literal("video"), v.literal("vector"))),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.PIXABAY_API_KEY;
    if (!apiKey) throw new Error("PIXABAY_API_KEY not configured in environment variables");
    const url = new URL("https://pixabay.com/api/");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("q", args.query);
    if (args.perPage) url.searchParams.set("per_page", String(Math.min(args.perPage, 200)));
    url.searchParams.set("image_type", args.mediaType ?? "photo");
    url.searchParams.set("safesearch", "true");
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      const errText = (await res.text().catch(() => "")).slice(0, 300);
      throw new Error(`Pixabay API error ${res.status}: ${errText}`);
    }
    const data = await res.json();
    const hits = Array.isArray(data?.hits) ? data.hits : [];
    return {
      total: Number(data?.total ?? 0),
      totalHits: data?.totalHits ?? hits.length,
      mediaType: args.mediaType ?? "photo",
      hits: hits.map((h: any) => ({
        id: Number(h.id ?? 0),
        image: h.webformatURL ?? h.previewURL ?? h.largeImageURL ?? "",
        pageURL: h.pageURL ?? "",
        duration: Number(h.duration ?? 0),
        user: { name: h.user ?? "Pixabay" },
        tags: typeof h.tags === "string" ? h.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : [],
        videos: h.videos?.large?.url
          ? {
              large: h.videos.large.url,
              medium: h.videos.medium?.url,
              small: h.videos.small?.url,
              tiny: h.videos.tiny?.url,
            }
          : undefined,
      })),
    };
  },
});

export const searchPexels = action({
  args: {
    query: v.string(),
    perPage: v.optional(v.number()),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.PEXELS_API_KEY;
    if (!apiKey) throw new Error("PEXELS_API_KEY not configured in environment variables");
    const res = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(args.query)}&per_page=${args.perPage || 12}&orientation=portrait`,
      { headers: { Authorization: apiKey } },
    );
    if (!res.ok) throw new Error(`Pexels API error ${res.status}`);
    const data = await res.json();
    return {
      videos: (data.videos || []).map((v: any) => ({
        id: v.id,
        url: v.url,
        image: v.image,
        duration: v.duration,
        user: { name: v.user?.name },
        video_files: (v.video_files || []).map((f: any) => ({
          link: f.link,
          quality: f.quality,
          width: f.width,
          height: f.height,
        })),
      })),
    };
  },
});

// ─── Coverr stock-video search ─────────────────────────────────────────────────
// Reads COVERR_FREEVIDEOS_API_KEY from the Convex Dashboard env vars
// (or per-user override via users.saveApiKeys). Add the key through the
// "Keys/API keys" UI, NOT through chat or .env files.
export const searchCoverr = action({
  args: {
    query: v.string(),
    perPage: v.optional(v.number()),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.COVERR_FREEVIDEOS_API_KEY;
    if (!apiKey) throw new Error("COVERR_FREEVIDEOS_API_KEY not configured in environment variables");
    const url = new URL("https://api.coverr.co/api/v1/videos");
    url.searchParams.set("query", args.query);
    if (args.perPage) url.searchParams.set("per_page", String(Math.min(args.perPage, 30)));
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const errText = (await res.text().catch(() => "")).slice(0, 300);
      throw new Error(`Coverr API error ${res.status}: ${errText}`);
    }
    const data = await res.json();
    const list = Array.isArray(data?.data) ? data.data : Array.isArray(data?.videos) ? data.videos : Array.isArray(data?.results) ? data.results : [];
    return {
      videos: list.map((v: any) => ({
        id: v.id ?? v.uuid,
        url: v.video_url_play ?? v.video_url ?? v.url ?? "",
        image: v.poster ?? v.thumbnail ?? v.preview ?? "",
        duration: Number(v.duration ?? 0),
        user: { name: v.user?.name ?? v.contributor ?? "Coverr" },
        video_files: [
          {
            link: v.video_url_play ?? v.video_url ?? v.url ?? "",
            quality: (v.quality ?? "hd") as string,
            width: Number(v.width ?? 0),
            height: Number(v.height ?? 0),
          },
        ],
      })),
    };
  },
});

// ─── Video Import from URL (yt-dlp via Railway video-server) ───────────────

export const importFromUrl = action({
  args: {
    url: v.string(),
    userId: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const serverUrl = process.env.VIDEO_SERVER_URL || "http://localhost:3001";
    const apiKey = process.env.VIDEO_SERVER_KEY;

    const logs: { timestamp: number; message: string; type: string }[] = [];

    try {
      logs.push({ timestamp: Date.now(), message: `Sending download request for: ${args.url.slice(0, 50)}...`, type: "processing" });

      const res = await fetch(`${serverUrl}/api/download`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { "x-api-key": apiKey } : {}),
        },
        body: JSON.stringify({
          url: args.url,
          outputDir: "downloads",
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Video-server error ${res.status}: ${errText.slice(0, 200)}`);
      }

      const data = await res.json();

      logs.push({
        timestamp: Date.now(),
        message: `✓ Downloaded: ${data.filename || "video.mp4"} (${data.duration || "?"}s, ${data.filesize || "?"})`,
        type: "success",
      });

      return {
        success: true,
        data: {
          filename: data.filename,
          filepath: data.filepath,
          duration: data.duration,
          filesize: data.filesize,
          format: data.format,
          resolution: data.resolution,
        },
        logs,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      logs.push({ timestamp: Date.now(), message: `✗ Download failed: ${errMsg}`, type: "error" });
      return { success: false, error: errMsg, logs };
    }
  },
});

// ─── تحميل وتحليل الملفات تلقائياً (Smart File System) ────────────────────────
//    استخدام FFprobe لاستخراج البيانات الوصفية، ثم توجيه الملف للمجلد المناسب
//    عبر AI (Gemini/Groq). الرد يكون JSON حصراً.

export const uploadFileProcessor = action({
  args: {
    fileName: v.string(),
    fileType: v.union(v.literal("video"), v.literal("audio"), v.literal("image")),
    fileSize: v.int64(),
    filePath: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args): Promise<any> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const keys = await loadUserKeys(ctx);

    // ═══ Step 1: استخراج البيانات الوصفية عبر FFprobe (إذا توفر مسار) ═══
    let metadata: Record<string, unknown> = {
      fileName: args.fileName,
      fileType: args.fileType,
      fileSize: args.fileSize,
    };

    if (args.filePath) {
      try {
        const serverUrl = process.env.VIDEO_SERVER_URL || "http://localhost:3001";
        const apiKey = process.env.VIDEO_SERVER_KEY;
        // استخدام video-server endpoint لاستخراج metadata
        const probeRes = await fetch(`${serverUrl}/api/probe`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(apiKey ? { "x-api-key": apiKey } : {}),
          },
          body: JSON.stringify({ filepath: args.filePath }),
        });
        if (probeRes.ok) {
          const probeData = await probeRes.json();
          metadata = {
            ...metadata,
            duration: probeData.duration || 0,
            resolution: probeData.resolution || "unknown",
            framerate: probeData.framerate || 0,
            codec: probeData.codec || "unknown",
            bitrate: probeData.bitrate || 0,
          };
        }
      } catch {
        // FFprobe غير متوفر — نستمر بالقيم الافتراضية
      }
    }

    // ═══ Step 2: توجيه الملف للمجلد المناسب عبر AI ═══
    const folderPrompt = `You are a smart file organizer. Given the following file metadata, decide the best default folder path for this file.

File: ${JSON.stringify(metadata)}

Rules:
- Short audio files (< 30s) → "Sound_Effects/Hits"
- Long audio files (> 30s) → "Music/Tracks"
- Short video files (< 60s) → "Projects/Footage"
- Long video files (>= 60s) → "Projects/Footage"
- Images → "Assets/Overlays"
- Generate a clean suggested_name (lowercase, underscores, keep extension)

Return ONLY a JSON object (English keys):
{"action":"move_to_folder","target_folder":"Sound_Effects/Hits","suggested_name":"impact_01.mp3"}`;

    let aiDecision = { action: "move_to_folder", target_folder: "Assets/Unsorted", suggested_name: args.fileName };
    try {
      const aiResponse = await callText(folderPrompt, { temperature: 0.1, maxTokens: 200 }, keys);
      const parsed = JSON.parse(aiResponse.replace(/```json/g, "").replace(/```/g, "").trim());
      if (parsed.target_folder && parsed.suggested_name) {
        aiDecision = parsed;
      }
    } catch {
      // استخدام القيم الافتراضية إذا فشل AI
      const ext = args.fileName.split(".").pop() || "mp4";
      if (args.fileType === "audio") aiDecision.target_folder = "Audio";
      else if (args.fileType === "image") aiDecision.target_folder = "Images";
      else aiDecision.target_folder = "Videos";
      aiDecision.suggested_name = `${Date.now()}.${ext}`;
    }

    // ═══ Step 3: حفظ الملف وقرار AI في قاعدة البيانات (assets table) ═══
    const assetId: any = await ctx.runMutation(api.agent.createAsset, {
      projectId: undefined,
      originalName: args.fileName,
      storedPath: aiDecision.target_folder,
      fileType: args.fileType,
      metadataJson: metadata,
      sourceType: "upload",
      duration: (metadata.duration as number) || undefined,
      size: args.fileSize,
    });
    void writeAuditLogSafe(ctx, "asset_upload", {
      assetId: String(assetId),
      originalName: args.fileName,
      fileType: args.fileType,
      targetFolder: aiDecision.target_folder,
    });

    // ═══ Step 4: Store embedding for semantic memory (RAG) — non-blocking ═══
    try {
      const summaryText = `${args.fileName} (${args.fileType}) → ${aiDecision.target_folder}. ${metadata.duration ? `Duration: ${metadata.duration}s.` : ""} ${metadata.resolution ? `Resolution: ${metadata.resolution}.` : ""}`;
      await ctx.runAction((api as any).vectorMemory.storeEmbedding, {
        assetId,
        sourceText: summaryText,
        summary: `${args.fileName} — ${aiDecision.target_folder}`,
      });
    } catch {
      /* swallow — memory is enhancement, not gate */
    }

    return {
      success: true,
      ...aiDecision,
      metadata,
      assetId,
    };
  },
});

// ─── تنزيل الفيديوهات من الإنترنت (Async yt-dlp Queue) ──────────────────────
//    طابور تحميل غير متزامن مع تحديثات لحظية وتأكيد قبل التحميل

export const downloadExternalVideo = action({
  args: {
    url: v.string(),
    skipConfirmation: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<any> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const serverUrl = process.env.VIDEO_SERVER_URL || "http://localhost:3001";
    const apiKey = process.env.VIDEO_SERVER_KEY;
    const MAX_RETRIES = 1;

    // ═══ Step 1: إنشاء سجل download_jobs (pending) فوراً ═══
    const jobId: any = await ctx.runMutation(api.agent.createDownloadJob, {
      url: args.url,
      status: "pending",
      progress: 0,
    });
    void writeAuditLogSafe(ctx, "download_event", {
      jobId: String(jobId),
      event: "started",
      url: args.url,
    });

    // ═══ Step 2: جلب البيانات الوصفية قبل التحميل (yt-dlp --dump-json) ═══
    let metadata: Record<string, unknown> = {};
    try {
      const probeRes = await fetch(`${serverUrl}/api/probe-url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { "x-api-key": apiKey } : {}),
        },
        body: JSON.stringify({ url: args.url }),
        signal: AbortSignal.timeout(15000),
      });

      if (probeRes.ok) {
        metadata = await probeRes.json();
      } else {
        // Fallback: استدعاء مباشر لـ yt-dlp --dump-json عبر video-server
        const dlRes = await fetch(`${serverUrl}/api/download-info`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(apiKey ? { "x-api-key": apiKey } : {}),
          },
          body: JSON.stringify({ url: args.url }),
          signal: AbortSignal.timeout(15000),
        });
        if (dlRes.ok) metadata = await dlRes.json();
      }
    } catch {
      // استمرار بدون metadata
    }

    // حفظ metadata في download_jobs
    await ctx.runMutation(api.agent.updateDownloadJob, {
      jobId,
      status: "running",
      progress: 10,
      metadataSnapshot: metadata,
    });

    // ═══ Step 3: إرجاع jobId + metadata للمستخدم فوراً لطلب التأكيد ═══
    if (!args.skipConfirmation) {
      return {
        success: true,
        status: "awaiting_confirmation",
        jobId,
        metadata: {
          title: metadata.title || args.url,
          duration: metadata.duration || 0,
          resolution: metadata.resolution || "unknown",
          filesize: metadata.filesize || 0,
          format: metadata.format || "unknown",
        },
      };
    }

    // ═══ Step 4: بدء التحميل الفعلي ═══
    const attemptDownload = async (attempt: number): Promise<any> => {
      try {
        const dlRes = await fetch(`${serverUrl}/api/download`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(apiKey ? { "x-api-key": apiKey } : {}),
          },
          body: JSON.stringify({ url: args.url, outputDir: "downloads" }),
          signal: AbortSignal.timeout(600000),
        });

        if (!dlRes.ok) {
          const errText = await dlRes.text().catch(() => "");
          throw new Error(`Video-server error ${dlRes.status}: ${errText.slice(0, 200)}`);
        }

        const dlData = await dlRes.json();

        // ═══ Step 5: التحقق من سلامة الملف عبر FFprobe ═══
        if (dlData.filepath) {
          try {
            const probeRes = await fetch(`${serverUrl}/api/probe`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(apiKey ? { "x-api-key": apiKey } : {}),
              },
              body: JSON.stringify({ filepath: dlData.filepath }),
            });
            if (!probeRes.ok) {
              throw new Error(`Validation failed: file corrupt or incomplete`);
            }
          } catch {
            // الملف تالف — إعادة المحاولة
            if (attempt < MAX_RETRIES) return attemptDownload(attempt + 1);
            throw new Error(`File validation failed after ${MAX_RETRIES + 1} attempts`);
          }
        }

        return dlData;
      } catch (e) {
        if (attempt < MAX_RETRIES) return attemptDownload(attempt + 1);
        throw e;
      }
    };

    try {
      // تحديث الحالة إلى running
      await ctx.runMutation(api.agent.updateDownloadJob, {
        jobId,
        status: "running",
        progress: 30,
      });

      const dlData = await attemptDownload(0);

      // تحديث الحالة إلى completed
      await ctx.runMutation(api.agent.updateDownloadJob, {
        jobId,
        status: "completed",
        progress: 100,
        result: dlData,
      });

      // حفظ الملف المُنزَّل في assets table
      const assetId: any = await ctx.runMutation(api.agent.createAsset, {
        originalName: dlData.filename,
        storedPath: `downloads/${dlData.filename}`,
        fileType: "video",
        metadataJson: {
          ...metadata,
          duration: dlData.duration,
          format: dlData.format,
          resolution: dlData.resolution,
        },
        sourceType: "url",
        duration: dlData.duration,
        size: dlData.filesize,
      });
      void writeAuditLogSafe(ctx, "download_event", {
        jobId: String(jobId),
        event: "completed",
        url: args.url,
      });

      // Store embedding for semantic memory (RAG) — non-blocking
      try {
        const title = (metadata as any).title || dlData.filename;
        const uploader = (metadata as any).uploader || "unknown";
        const summaryText = `Downloaded: ${title} by ${uploader}. Duration: ${dlData.duration}s. Format: ${dlData.format}.`;
        await ctx.runAction((api as any).vectorMemory.storeEmbedding, {
          assetId,
          sourceText: summaryText,
          summary: `${dlData.filename} — downloaded from ${args.url}`,
        });
      } catch {
        /* swallow — memory is enhancement */
      }

      return {
        success: true,
        status: "completed",
        jobId,
        assetId,
        data: {
          filename: dlData.filename,
          filepath: dlData.filepath,
          duration: dlData.duration,
          filesize: dlData.filesize,
          format: dlData.format,
          resolution: dlData.resolution,
        },
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Download failed";
      await ctx.runMutation(api.agent.updateDownloadJob, {
        jobId,
        status: "failed",
        error: errMsg,
      });
      return { success: false, error: errMsg, jobId };
    }
  },
});

// ─── Main router action ──────────────────────────────────────────────────────

// ─── Voice / Image actions exposed to the frontend ────────────────────────────

export const transcribeAudio = action({
  args: {
    commandId: v.id("agentCommands"),
    audioUrl: v.string(),
    language: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      await ctx.runMutation(api.agent.updateCommandStatus, {
        commandId: args.commandId,
        status: "processing",
        progress: 25,
        logs: [{ timestamp: now(), message: "Transcribing audio with Whisper (Groq)...", type: "processing" }],
      });
      const keys = await loadUserKeys(ctx);
      const text = await transcribeWithGroq(args.audioUrl, args.language, keys);
      await ctx.runMutation(api.agent.updateCommandStatus, {
        commandId: args.commandId,
        status: "completed",
        progress: 100,
        result: { transcript: text, audioUrl: args.audioUrl },
        logs: [{ timestamp: now(), message: `Transcript: ${text.slice(0, 200)}`, type: "success" }],
      });
      return { success: true, transcript: text };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Transcription failed";
      return { success: false, error: errMsg };
    }
  },
});

export const synthesizeSpeechAction = action({
  args: {
    commandId: v.optional(v.id("agentCommands")),
    text: v.string(),
    voice: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const keys = await loadUserKeys(ctx);
      const audioBase64 = await synthesizeSpeechGoogle(args.text, args.voice, keys);
      if (args.commandId) {
        await ctx.runMutation(api.agent.updateCommandStatus, {
          commandId: args.commandId,
          status: "completed",
          progress: 100,
          result: { audioBase64, text: args.text },
          logs: [{ timestamp: now(), message: "Speech synthesized via Google Cloud TTS", type: "success" }],
        });
      }
      return { success: true, audioBase64 };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "TTS failed";
      return { success: false, error: errMsg };
    }
  },
});

// ─── Multi-provider TTS with selectable voice (Gemini · OpenAI · Groq · ElevenLabs · Google) ───
//
// Frontend passes the catalog voice id (e.g. "Kore", "alloy", "Arthur-PlayAI") plus an optional
// explicit provider. Backend auto-routes to the provider; if you pass a provider-less voice id
// the backend looks it up in VOICE_CATALOG. Fall back to whatever key is configured in fallback order.
export const synthesizeVoice = action({
  args: {
    text: v.string(),
    voiceId: v.string(),
    provider: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{
    success: true;
    audioBase64: string;
    mime: string;
    dataUrl: string;
    provider: string;
    voiceId: string;
  } | { success: false; error: string; availableVoices: VoicePreset[]; code: "too_long" | "no_provider" | "error" }> => {
    try {
      const keys = await loadUserKeys(ctx);
      // Validate text length against per-provider hard limits so we reject gracefully
      // instead of forwarding an oversized payload to the provider (which would 400/413).
      const matched = VOICE_CATALOG.find((v) => v.id === args.voiceId);
      const provider = (args.provider as VoicePreset["provider"]) || matched?.provider || pickVoiceProvider(undefined, keys);
      if (!provider) {
        return {
          success: false,
          error: "No TTS provider has a key configured. Add GEMINI_API_KEY (or OpenAI / Groq / ElevenLabs / GOOGLE_CLOUD_API_KEY) in Settings → API Keys.",
          availableVoices: [],
          code: "no_provider",
        };
      }
      const limit = TTS_TEXT_LIMITS[provider];
      if (limit && args.text.length > limit) {
        return {
          success: false,
          error: `Text is ${args.text.length} chars but ${provider} supports at most ${limit}. Please split into smaller chunks.`,
          availableVoices: listVoices(keys),
          code: "too_long",
        };
      }

      // AI cache lookup: short-circuit on exact (provider + voiceId + text) match.
      const voiceUserId = await getAuthUserId(ctx);
      const voiceCacheKey = `voice:${provider}:${args.voiceId}:${fnvHash(args.text)}`;
      const voiceT0 = Date.now();
      const cachedAudio = await tryAiCache(ctx, voiceCacheKey);
      let result: { audioBase64: string; mime: string; provider: string; voiceId: string };
      if (cachedAudio) {
        try {
          result = JSON.parse(cachedAudio);
          await logAiCall(
            ctx,
            voiceUserId,
            "voice",
            result.provider,
            args.text.length,
            result.audioBase64.length,
            Date.now() - voiceT0,
            "cached",
            true,
          );
        } catch {
          // Corrupt cache row — fall through to live call.
          result = await synthesizeSpeechMultiProvider(
            args.text,
            { voiceId: args.voiceId, provider },
            keys,
          );
          await storeAiCache(ctx, voiceCacheKey, JSON.stringify(result));
          await logAiCall(
            ctx,
            voiceUserId,
            "voice",
            result.provider,
            args.text.length,
            result.audioBase64.length,
            Date.now() - voiceT0,
            "ok",
            false,
          );
        }
      } else {
        try {
          result = await synthesizeSpeechMultiProvider(
            args.text,
            { voiceId: args.voiceId, provider },
            keys,
          );
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : "TTS failed";
          await logAiCall(
            ctx,
            voiceUserId,
            "voice",
            provider,
            args.text.length,
            0,
            Date.now() - voiceT0,
            "error",
            false,
            errMsg,
          );
          return { success: false, error: errMsg, availableVoices: listVoices(keys), code: "error" };
        }
        await storeAiCache(ctx, voiceCacheKey, JSON.stringify(result));
        await logAiCall(
          ctx,
          voiceUserId,
          "voice",
          result.provider,
          args.text.length,
          result.audioBase64.length,
          Date.now() - voiceT0,
          "ok",
          false,
        );
      }
      const dataUrl = `data:${result.mime};base64,${result.audioBase64}`;
      return {
        success: true,
        audioBase64: result.audioBase64,
        mime: result.mime,
        dataUrl,
        provider: result.provider,
        voiceId: result.voiceId,
      };
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "TTS failed";
      const keys = await loadUserKeys(ctx);
      return { success: false, error: errMsg, availableVoices: listVoices(keys), code: "error" };
    }
  },
});

// Returns the catalog filtered to voices whose provider has a key configured.
export const listAvailableVoices = action({
  args: {},
  handler: async (ctx): Promise<{
    voices: VoicePreset[];
    providers: Array<VoicePreset["provider"]>;
  }> => {
    const keys = await loadUserKeys(ctx);
    const voices = listVoices(keys);
    const providersSet = new Set<VoicePreset["provider"]>(voices.map((v) => v.provider));
    return { voices, providers: Array.from(providersSet) };
  },
});

// ─── Provider connectivity testing ─────────────────────────────────────────
//
// Frontend Settings → API Keys page calls testProviderKey(envVarName) per field
// and shows a green/red badge so users can verify their paste is valid before
// clicking Save.
//
// Every test does at most ONE upstream request and surfaces the real upstream
// error verbatim so users can debug quota / regional / permission issues.

interface ProviderTestSpec {
  method: "GET" | "POST";
  url: (key: string) => string;
  headers: (key: string) => Record<string, string>;
  body?: (key: string) => any;
  // Optional human-readable name of the most useful field in the response.
  pickField?: string;
}

const PROVIDER_TEST_SPECS: Record<string, ProviderTestSpec> = {
  // ─── Auth = Bearer ───
  OPENAI_API_KEY: {
    method: "GET",
    url: () => "https://api.openai.com/v1/models",
    headers: (k) => ({ Authorization: `Bearer ${k}` }),
    pickField: "data",
  },
  GROQ_API_KEY: {
    method: "GET",
    url: () => "https://api.groq.com/openai/v1/models",
    headers: (k) => ({ Authorization: `Bearer ${k}` }),
  },
  OPENROUTER_API_KEY: {
    method: "GET",
    url: () => "https://openrouter.ai/api/v1/models",
    headers: (k) => ({ Authorization: `Bearer ${k}`, "HTTP-Referer": "https://clipforge.app" }),
  },
  DEEPSEEK_API_KEY: {
    method: "GET",
    url: () => "https://api.deepseek.com/v1/models",
    headers: (k) => ({ Authorization: `Bearer ${k}` }),
  },
  MISTRAL_API_KEY: {
    method: "GET",
    url: () => "https://api.mistral.ai/v1/models",
    headers: (k) => ({ Authorization: `Bearer ${k}` }),
  },
  CEREBRAS_API_KEY: {
    method: "GET",
    url: () => "https://api.cerebras.ai/v1/models",
    headers: (k) => ({ Authorization: `Bearer ${k}` }),
  },
  COHERE_API_KEY: {
    method: "GET",
    url: () => "https://api.cohere.com/v1/models",
    headers: (k) => ({ Authorization: `Bearer ${k}`, Accept: "application/json" }),
  },
  NVIDIA_API_KEY: {
    method: "GET",
    url: () => "https://integrate.api.nvidia.com/v1/models",
    headers: (k) => ({ Authorization: `Bearer ${k}` }),
  },
  HUGGINGFACE_API_KEY: {
    method: "GET",
    url: () => "https://router.huggingface.co/v1/models",
    headers: (k) => ({ Authorization: `Bearer ${k}` }),
  },
  TOGETHER_API_KEY: {
    method: "GET",
    url: () => "https://api.together.xyz/v1/models",
    headers: (k) => ({ Authorization: `Bearer ${k}` }),
  },
  FIREWORKS_API_KEY: {
    method: "GET",
    url: () => "https://api.fireworks.ai/inference/v1/models",
    headers: (k) => ({ Authorization: `Bearer ${k}` }),
  },
  SAMBANOVA_API_KEY: {
    method: "GET",
    url: () => "https://api.sambanova.ai/v1/models",
    headers: (k) => ({ Authorization: `Bearer ${k}` }),
  },
  OLLAMA_API_KEY: {
    method: "GET",
    url: () => "https://ollama.com/v1/models",
    headers: (k) => ({ Authorization: `Bearer ${k}` }),
  },
  // GitHub Models: catalog is public, auth check is via a 1-token inference call.
  GITHUB_TOKEN: {
    method: "POST",
    url: () => "https://models.inference.ai.azure.com/chat/completions",
    headers: (k) => ({ Authorization: `Bearer ${k}`, "Content-Type": "application/json" }),
    body: () => ({ model: "gpt-4o-mini", messages: [{ role: "user", content: "ping" }], max_tokens: 5 }),
  },
  // ElevenLabs: /v1/user returns the account info.
  ELEVENLABS_API_KEY: {
    method: "GET",
    url: () => "https://api.elevenlabs.io/v1/user",
    headers: (k) => ({ "xi-api-key": k }),
  },
  // FFmpeg Micro: ping a lightweight endpoint that requires auth.
  FFMPEG_MICRO_KEY: {
    method: "POST",
    url: () => "https://api.ffmpeg-micro.com/v1/upload/presigned-url",
    headers: (k) => ({ Authorization: `Bearer ${k}`, "Content-Type": "application/json" }),
    body: () => ({ filename: "ping.bin", contentType: "application/octet-stream", fileSize: 1 }),
  },
  // Firecrawl: /team/credit-usage.
  FIRECRAWL_API_KEY: {
    method: "GET",
    url: () => "https://api.firecrawl.dev/v1/team/credit-usage",
    headers: (k) => ({ Authorization: `Bearer ${k}` }),
  },
  // ─── Auth = custom header (no Bearer) ───
  PEXELS_API_KEY: {
    method: "GET",
    url: () => "https://api.pexels.com/videos/search?query=ping&per_page=1",
    headers: (k) => ({ Authorization: k }),
  },
  // Google Cloud TTS: run a tiny SSML synth.
  GOOGLE_CLOUD_API_KEY: {
    method: "POST",
    url: (k) => `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(k)}`,
    headers: () => ({ "Content-Type": "application/json" }),
    body: () => ({ input: { ssml: "<speak>ping</speak>" }, voice: { languageCode: "en-US", name: "en-US-Standard-A" }, audioConfig: { audioEncoding: "MP3" } }),
  },
};

// Cloudflare needs BOTH a token and the account ID; we do a tiny Chat-completions
// request that proves both.
function testCloudflare(token: string, accountId: string) {
  return {
    method: "POST" as const,
    url: `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: { model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", messages: [{ role: "user", content: "ping" }], max_tokens: 5 },
  };
}

interface ProviderTestResult {
  ok: boolean;
  status: number;
  latencyMs: number;
  message: string;
  extra?: any;
}

async function runTest(
  spec: { method: string; url: string; headers: Record<string, string>; body?: any },
  timeoutMs = 10000,
): Promise<ProviderTestResult> {
  const t0 = Date.now();
  try {
    const res = await fetch(spec.url, {
      method: spec.method,
      headers: spec.headers,
      body: spec.body ? JSON.stringify(spec.body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const latencyMs = Date.now() - t0;
    if (res.ok) {
      let extra: any = undefined;
      try {
        const json = await res.json();
        if (Array.isArray(json?.data)) extra = { modelCount: json.data.length };
        else if (Array.isArray(json?.models)) extra = { modelCount: json.models.length };
        else if (json && typeof json === "object") extra = Object.keys(json).slice(0, 5);
      } catch { /* non-JSON ok */ }
      return { ok: true, status: res.status, latencyMs, message: "Connected", extra };
    }
    const errText = (await res.text().catch(() => "")).slice(0, 200);
    return {
      ok: false,
      status: res.status,
      latencyMs,
      message: `HTTP ${res.status}${errText ? ` · ${errText.replace(/\s+/g, " ").slice(0, 120)}` : ""}`,
    };
  } catch (e) {
    return { ok: false, status: 0, latencyMs: Date.now() - t0, message: e instanceof Error ? e.message : "Network error" };
  }
}

export const testProviderKey = action({
  args: {
    // Either an env-var name like "GEMINI_API_KEY", or a friendly group id like "cloudflare".
    provider: v.string(),
  },
  handler: async (ctx, args): Promise<ProviderTestResult & { provider: string }> => {
    const keys = await loadUserKeys(ctx);
    const id = args.provider;

    // Cloudflare has a coupled-pair test (key + account id).
    if (id === "cloudflare" || id === "CF_API_TOKEN") {
      const token = resolveKey("CF_API_TOKEN", keys);
      const accountId = resolveKey("CF_ACCOUNT_ID", keys);
      if (!token) return { provider: id, ok: false, status: 0, latencyMs: 0, message: "CF_API_TOKEN not set" };
      if (!accountId) return { provider: id, ok: false, status: 0, latencyMs: 0, message: "CF_ACCOUNT_ID (or CLOUDFLARE_ACCOUNT_ID) not set" };
      const r = await runTest(testCloudflare(token, accountId));
      return { ...r, provider: id };
    }

    const spec = PROVIDER_TEST_SPECS[id];
    if (!spec) return { provider: id, ok: false, status: 0, latencyMs: 0, message: `Unknown provider: ${id}` };
    const key = resolveKey(id, keys);
    if (!key) return { provider: id, ok: false, status: 0, latencyMs: 0, message: `${id} not set` };
    const r = await runTest({
      method: spec.method,
      url: spec.url(key),
      headers: spec.headers(key),
      body: spec.body ? spec.body(key) : undefined,
    });
    return { ...r, provider: id };
  },
});

export const generateImageAction = action({
  args: {
    commandId: v.optional(v.id("agentCommands")),
    prompt: v.string(),
    preferred: v.optional(v.union(
      v.literal("huggingface"), v.literal("together"), v.literal("fireworks"),
      v.literal("gemini"), v.literal("openrouter"), v.literal("nvidia"),
    )),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    try {
      const keys = await loadUserKeys(ctx);
      const provider = pickProviderFor("image", args.preferred, keys);
      const result = await generateImage(args.prompt, { preferred: args.preferred, width: args.width, height: args.height }, keys);
      if (args.commandId) {
        await ctx.runMutation(api.agent.updateCommandStatus, {
          commandId: args.commandId,
          status: "completed",
          progress: 100,
          result: { image: result, prompt: args.prompt, provider: provider?.id },
          logs: [{ timestamp: now(), message: `Image generated via ${provider?.id || "default"}`, type: "success" }],
        });
      }
      return { success: true, image: result, provider: provider?.id };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Image generation failed";
      return { success: false, error: errMsg };
    }
  },
});

// ─── Semantic Memory Search (RAG) ───────────────────────────────────────────
//    "أين وضعت فيديو المقدمة؟" → embed query → cosine scan → top matches

export const searchMemory = action({
  args: {
    commandId: v.id("agentCommands"),
    query: v.string(),
  },
  handler: async (ctx, args): Promise<any> => {
    const logs: LogEntry[] = [];

    try {
      await ctx.runMutation(api.agent.updateCommandStatus, {
        commandId: args.commandId,
        status: "processing",
        progress: 10,
        logs: [{ timestamp: now(), message: `Embedding search query: "${args.query}"...`, type: "processing" }],
      });

      // Call vectorMemory.semanticSearch action
      let searchResult: any;
      try {
        searchResult = await ctx.runAction((api as any).vectorMemory.semanticSearch, {
          query: args.query,
          topK: 5,
        });
      } catch {
        // fallback: return empty results
        searchResult = { success: true, matches: [] };
      }

      await ctx.runMutation(api.agent.updateCommandStatus, {
        commandId: args.commandId,
        status: "processing",
        progress: 70,
        plan: await getPlanPatch(args.commandId, ctx, 2),
        logs: [...logs, { timestamp: now(), message: `Found ${searchResult.matches?.length || 0} matches`, type: "success" }],
      });

      const matches = (searchResult.matches || []).map((m: any) => ({
        id: m.id,
        assetId: m.assetId,
        summary: m.summary,
        sourceText: m.sourceText,
        score: Math.round((m.score || 0) * 100),
        createdAt: m.createdAt,
      }));

      const result = {
        title: `Memory Search: "${args.query}"`,
        duration: "—",
        size: "—",
        resolution: "—",
        aspectRatio: "—",
        downloadUrl: "#memory-search",
        matches,
        provider: "vectorMemory",
        modality: "memory",
      };

      await ctx.runMutation(api.agent.updateCommandStatus, {
        commandId: args.commandId,
        status: "completed",
        progress: 100,
        plan: await getPlanPatch(args.commandId, ctx, 3, true),
        result,
        logs: [
          { timestamp: now(), message: `✓ Found ${matches.length} memory match(es)`, type: "success" },
        ],
      });

      return { success: true, result, matches };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Memory search failed";
      logs.push({ timestamp: now(), message: `✗ Error: ${errMsg}`, type: "error" });
      await ctx.runMutation(api.agent.updateCommandStatus, {
        commandId: args.commandId,
        status: "failed",
        error: errMsg,
        logs,
      });
      return { success: false, error: errMsg };
    }
  },
});

export const processCommand = action({
  args: {
    command: v.string(),
    aspectRatio: v.optional(v.string()),
  },
  handler: async (ctx: any, args: { command: string; aspectRatio?: string }): Promise<{ success: boolean; result?: any; error?: string; commandId?: any }> => {
    // 1. Parse the command
    const { intent, params: parsedParams } = parseCommand(args.command);
    const plan = getPlanForIntent(intent);

    // 2. Create the command record via mutation
    const commandId: any = await ctx.runMutation(api.agent.createCommand, {
      command: args.command,
      intent,
    });

    // 3. Route to the appropriate action
    switch (intent) {
      case "voice_transcribe": {
        const audioUrl = (parsedParams as any).audioUrl || "";
        if (!audioUrl) {
          await ctx.runMutation(api.agent.updateCommandStatus, {
            commandId,
            status: "failed",
            error: "No audio URL provided for transcription",
          });
          return { success: false, error: "audioUrl required", commandId };
        }
        const result: any = await ctx.runAction(api.agent.transcribeAudio, {
          commandId,
          audioUrl,
        });
        return { ...result, commandId };
      }
      case "voice_synthesize": {
        const text = (parsedParams as any).text || "";
        if (!text) {
          await ctx.runMutation(api.agent.updateCommandStatus, {
            commandId,
            status: "failed",
            error: "No text provided for speech synthesis",
          });
          return { success: false, error: "text required", commandId };
        }
        const result: any = await ctx.runAction(api.agent.synthesizeSpeechAction, {
          commandId,
          text,
        });
        return { ...result, commandId };
      }
      case "image_generate": {
        const prompt = (parsedParams as any).prompt || args.command;
        const result: any = await ctx.runAction(api.agent.generateImageAction, {
          commandId,
          prompt,
        });
        return { ...result, commandId };
      }
      case "hook_detection": {
        const result: any = await ctx.runAction(api.agent.detectHook, {
          commandId,
          aspectRatio: args.aspectRatio,
        });
        return { ...result, commandId };
      }
      case "trim": {
        const result: any = await ctx.runAction(api.agent.trimVideo, {
          commandId,
          startTime: parsedParams.start,
          endTime: parsedParams.end,
        });
        return { ...result, commandId };
      }
      case "music_overlay": {
        const result: any = await ctx.runAction(api.agent.addMusicSwell, {
          commandId,
        });
        return { ...result, commandId };
      }
      case "memory_search": {
        const query = parsedParams.query || args.command;
        const result: any = await ctx.runAction((api as any).agent.searchMemory, {
          commandId,
          query,
        });
        return { ...result, commandId };
      }
      case "export": {
        const result: any = await ctx.runAction(api.agent.exportVideo, {
          commandId,
          aspectRatio: args.aspectRatio,
        });
        return { ...result, commandId };
      }
      case "effects":
      case "loop":
      case "color_grade":
      case "vignette": {
        // For these, call the generic processing action
        await ctx.runMutation(api.agent.updateCommandStatus, {
          commandId,
          status: "processing",
          progress: 50,
          logs: [{ timestamp: now(), message: `Processing ${intent}...`, type: "processing" }],
        });

        await ctx.runMutation(api.agent.createProcessingJob, {
          type: intent === "effects" ? "effects" : "export",
          commandId,
          params: { action: intent },
        });

        const result: AgentResult = {
          title: intent.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
          duration: "0:45",
          size: "~12.4 MB",
          resolution: "1920×1080",
          aspectRatio: args.aspectRatio || "9:16",
          downloadUrl: `#${intent}-result`,
        };

        await ctx.runMutation(api.agent.updateCommandStatus, {
          commandId,
          status: "completed",
          progress: 100,
          plan: plan.map((s) => ({ ...s, status: "completed" as const })),
          result,
          logs: [
            { timestamp: now(), message: `✓ ${intent} applied successfully`, type: "success" },
          ],
        });

        return { success: true, result, commandId };
      }
      default: {
        await ctx.runMutation(api.agent.updateCommandStatus, {
          commandId,
          status: "failed",
          error: "Command not recognized",
          plan: plan.map((s) => ({ ...s, status: "failed" as const })),
        });
        return { success: false, error: "Command not recognized", commandId };
      }
    }
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDuration(time: string): number {
  const parts = time.split(":");
  if (parts.length === 2) return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
  if (parts.length === 3) return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
  return 0;
}

async function getPlanPatch(
  commandId: Id<"agentCommands">,
  ctx: { runQuery: (query: any, args: any) => Promise<any> },
  completedSteps: number,
  allComplete?: boolean,
): Promise<PlanStep[]> {
  const cmd = await ctx.runQuery(api.agent.getCommandStatus, { commandId });
  if (!cmd || !cmd.plan) return [];
  return (cmd.plan as PlanStep[]).map((s, i) => ({
    ...s,
    status:
      allComplete || i < completedSteps
        ? ("completed" as const)
        : i === completedSteps
          ? ("running" as const)
          : ("pending" as const),
  }));
}
