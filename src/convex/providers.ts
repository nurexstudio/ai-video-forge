// ─── src/convex/providers.ts ────────────────────────────────────────────────
// Per-provider encrypted API key store. Each row in the `providers` table
// holds: userId, name (providerId like "groq"), apiKeyEncrypted (AES-256-GCM).
//
// The plain "users.apiKeys" table column remains the engine for fast backend
// lookup; the `providers` table stores the encrypted version of the same data
// for compliance + tamper detection.

"use node";

import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { encryptString, decryptString } from "./lib/crypto";

// ─── Catalog of supported providers ──────────────────────────────────────────
// Mirrors the union of AI_KEY_NAMES + OTHER_KEY_NAMES in users.ts. Single source
// of truth so the UI can render an exhaustive list of supported providers even
// before a key has been set.
export const KNOWN_PROVIDERS: Record<string, { id: string; label: string; envVar: string; category: string }> = {
  GROQ_API_KEY:        { id: "groq",        label: "Groq",        envVar: "GROQ_API_KEY",        category: "text + voice" },
  GEMINI_API_KEY:      { id: "gemini",      label: "Gemini",      envVar: "GEMINI_API_KEY",      category: "text + image + embedding" },
  OPENROUTER_API_KEY:  { id: "openrouter",  label: "OpenRouter",  envVar: "OPENROUTER_API_KEY",  category: "text + image (router)" },
  DEEPSEEK_API_KEY:    { id: "deepseek",    label: "DeepSeek",    envVar: "DEEPSEEK_API_KEY",    category: "text" },
  MISTRAL_API_KEY:     { id: "mistral",     label: "Mistral",     envVar: "MISTRAL_API_KEY",     category: "text" },
  CEREBRAS_API_KEY:    { id: "cerebras",    label: "Cerebras",    envVar: "CEREBRAS_API_KEY",    category: "text" },
  COHERE_API_KEY:      { id: "cohere",      label: "Cohere",      envVar: "COHERE_API_KEY",      category: "text" },
  NVIDIA_API_KEY:      { id: "nvidia",      label: "NVIDIA NIM",  envVar: "NVIDIA_API_KEY",      category: "text + image" },
  HUGGINGFACE_API_KEY: { id: "huggingface", label: "HuggingFace", envVar: "HUGGINGFACE_API_KEY", category: "text + image + voice" },
  GITHUB_TOKEN:        { id: "github",      label: "GitHub Models", envVar: "GITHUB_TOKEN",      category: "text" },
  CF_API_TOKEN:        { id: "cloudflare",  label: "Cloudflare",  envVar: "CF_API_TOKEN",        category: "text" },
  OLLAMA_API_KEY:      { id: "ollama",      label: "Ollama Cloud", envVar: "OLLAMA_API_KEY",    category: "text" },
  TOGETHER_API_KEY:    { id: "together",    label: "Together.ai", envVar: "TOGETHER_API_KEY",    category: "text + image" },
  FIREWORKS_API_KEY:   { id: "fireworks",   label: "Fireworks",   envVar: "FIREWORKS_API_KEY",   category: "text + image" },
  SAMBANOVA_API_KEY:   { id: "sambanova",   label: "SambaNova",   envVar: "SAMBANOVA_API_KEY",   category: "text" },
  GOOGLE_CLOUD_API_KEY:{ id: "google_cloud",label: "Google Cloud (TTS)", envVar: "GOOGLE_CLOUD_API_KEY", category: "voice" },
  PEXELS_API_KEY:      { id: "pexels",      label: "Pexels",      envVar: "PEXELS_API_KEY",      category: "stock footage" },
  FIRECRAWL_API_KEY:   { id: "firecrawl",   label: "Firecrawl",   envVar: "FIRECRAWL_API_KEY",   category: "web scraping" },
};

// ─── Save encrypted provider key (called from Settings) ───────────────────────
export const saveProviderKey = mutation({
  args: {
    providerId: v.string(),
    apiKey: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    if (!KNOWN_PROVIDERS[args.providerId]) throw new Error(`Unknown provider: ${args.providerId}`);
    if (!args.apiKey.trim()) throw new Error("API key cannot be empty");

    // AES-256-GCM encrypt before persisting
    const ct = encryptString(args.apiKey.trim());

    // Upsert
    const existing = await ctx.db
      .query("providers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("name"), args.providerId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { apiKeyEncrypted: ct, createdAt: Date.now() });
      return existing._id;
    }
    return ctx.db.insert("providers", {
      userId,
      name: args.providerId,
      apiKeyEncrypted: ct,
      createdAt: Date.now(),
    });
  },
});

// ─── Remove a provider key ───────────────────────────────────────────────────
export const removeProviderKey = mutation({
  args: { providerId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const existing = await ctx.db
      .query("providers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("name"), args.providerId))
      .first();
    if (existing) await ctx.db.delete(existing._id);
    return { removed: !!existing };
  },
});

// ─── Public list — for Settings UI (no plaintext returned) ────────────────────
export const listMyProviders = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("providers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows.map((r) => {
      const meta = KNOWN_PROVIDERS[r.name];
      return {
        id: r._id,
        providerId: r.name,
        label: meta?.label || r.name,
        category: meta?.category || "unknown",
        envVar: meta?.envVar || r.name,
        hasKey: true,
        keyPreview: (function () {
          // We can't decrypt server-side in a query safely; the encrypted blob is enough to prove presence.
          // Show a short fingerprint derived from the ciphertext length for a UX signal.
          return `••••${(r.apiKeyEncrypted.length / 2).toFixed(0)}b`;
        })(),
        addedAt: r.createdAt,
      };
    });
  },
});

// ─── Internal helpers for backend actions to read decrypted keys ─────────────
export const getDecryptedProviderKey_Internal = internalQuery({
  args: { userId: v.id("users"), providerId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("providers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("name"), args.providerId))
      .first();
    if (!row) return null;
    try {
      return decryptString(row.apiKeyEncrypted);
    } catch {
      return null;
    }
  },
});

export const getAllDecryptedKeys_Internal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("providers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const out: Record<string, string> = {};
    for (const r of rows) {
      try {
        out[r.name] = decryptString(r.apiKeyEncrypted);
      } catch {
        // skip rows that fail to decrypt (corrupted / wrong master key)
      }
    }
    return out;
  },
});
