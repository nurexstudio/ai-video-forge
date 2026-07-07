// ─── src/convex/vectorMemory.ts ──────────────────────────────────────────────
// RAG-style long-term memory. Stores 256-dim embeddings (truncated from Gemini's
// 768-dim text-embedding-004) along with a contentSummary and sourceText
// snippet. semanticSearch does full-scan cosine similarity against all of the
// user's stored embeddings — fine at MVP scale (≤ a few hundred per user).
//
// Used by: "أين وضعت فيديو المقدمة الذي تحدث عن الذكاء الاصطناعي؟" — the
// Agent embeds the query, computes similarity, returns top-3 matches with their
// stored summary + assetId.

import { v } from "convex/values";
import { action, internalMutation, internalQuery, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";

const EMBEDDING_DIM = 256; // small enough to keep many entries per Convex row limit

// ─── Pure helpers (no Convex deps, safe on V8 runtime) ───────────────────────
function truncate(vec: number[]): number[] {
  return vec.length > EMBEDDING_DIM ? vec.slice(0, EMBEDDING_DIM) : vec;
}

function normalize(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0));
  if (norm === 0) return vec;
  return vec.map((x) => x / norm);
}

function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/**
 * Deterministic "HashBag" fallback embedding. Reproducible from text alone,
 * so semanticSearch still works when no embedding API key is configured.
 * Quality is much lower than a real model but provides a usable demo.
 */
function hashBagEmbedding(text: string): number[] {
  const tokens = text.toLowerCase().split(/\s+/).filter(Boolean);
  const vec = new Array(EMBEDDING_DIM).fill(0);
  for (const tok of tokens) {
    let h = 5381;
    for (let i = 0; i < tok.length; i++) {
      h = ((h << 5) + h + tok.charCodeAt(i)) | 0;
    }
    vec[Math.abs(h) % EMBEDDING_DIM] += 1;
  }
  return vec;
}

async function getEmbedding(text: string, keys: Record<string, string>): Promise<number[]> {
  // Try Gemini first (free tier, decent quality)
  const geminiKey = keys["GEMINI_API_KEY"] || process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: "text-embedding-004", content: { parts: [{ text }] } }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        const values = data?.embedding?.values;
        if (Array.isArray(values)) {
          return normalize(truncate(values));
        }
      }
    } catch {
      // fall through to deterministic
    }
  }
  // Try OpenRouter if the user has it
  const orKey = keys["OPENROUTER_API_KEY"] || process.env.OPENROUTER_API_KEY;
  if (orKey) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
        method: "POST",
        headers: { Authorization: `Bearer ${orKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "openai/text-embedding-3-small", input: text }),
      });
      if (res.ok) {
        const data = await res.json();
        const values = data?.data?.[0]?.embedding;
        if (Array.isArray(values)) return normalize(truncate(values));
      }
    } catch {
      // fall through
    }
  }
  // Fallback to hash bag
  return normalize(hashBagEmbedding(text));
}

// ─── Insert (called from storeEmbedding action) ──────────────────────────────
export const insertMemory = internalMutation({
  args: {
    assetId: v.optional(v.id("assets")),
    embedding: v.array(v.float64()),
    summary: v.string(),
    sourceText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    return await ctx.db.insert("vectorMemory", {
      assetId: args.assetId,
      userId,
      embeddingVector: args.embedding,
      contentSummary: args.summary,
      sourceText: args.sourceText,
      createdAt: Date.now(),
    });
  },
});

// ─── Public mutation: convenience wrapper if you don't need to fetch assets ───
export const remember = mutation({
  args: {
    assetId: v.optional(v.id("assets")),
    summary: v.string(),
    sourceText: v.optional(v.string()),
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    return await ctx.db.insert("vectorMemory", {
      assetId: args.assetId,
      userId,
      embeddingVector: args.embedding,
      contentSummary: args.summary,
      sourceText: args.sourceText,
      createdAt: Date.now(),
    });
  },
});

// ─── Action: generate embedding then store (combines getEmbedding + insert) ─
export const storeEmbedding = action({
  args: {
    assetId: v.optional(v.id("assets")),
    sourceText: v.string(),
    summary: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const keys: Record<string, string> = (await ctx.runQuery((internal as any).users.getApiKeysForUser_Internal, { userId })) || {};
    const embedding = await getEmbedding(args.sourceText, keys);

    const id = await ctx.runMutation((internal as any).vectorMemory.insertMemory, {
      assetId: args.assetId,
      embedding,
      summary: args.summary ?? args.sourceText.slice(0, 200),
      sourceText: args.sourceText,
    });

    return { success: true, id, dim: embedding.length };
  },
});

// ─── Action: embed the query, scan all user's memories, return top-K ────────
export const semanticSearch = action({
  args: {
    query: v.string(),
    topK: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const keys: Record<string, string> = (await ctx.runQuery((internal as any).users.getApiKeysForUser_Internal, { userId })) || {};
    const queryVec = await getEmbedding(args.query, keys);

    const memories = await ctx.runQuery((internal as any).vectorMemory.listUserMemories, { userId });

    const scored = memories
      .filter((m: any) => Array.isArray(m.embeddingVector) && m.embeddingVector.length > 0)
      .map((m: any) => ({
        id: m._id,
        assetId: m.assetId,
        summary: m.contentSummary,
        sourceText: m.sourceText,
        score: cosine(queryVec, m.embeddingVector as number[]),
        createdAt: m.createdAt,
      }))
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, args.topK ?? 5);

    return { success: true, matches: scored };
  },
});

// ─── Internal query for the search action ────────────────────────────────────
export const listUserMemories = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("vectorMemory")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});
