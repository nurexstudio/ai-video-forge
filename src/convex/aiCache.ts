import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";

// ─── AI response cache (Convex-backed) ────────────────────────────────────────
//
// Caches model responses keyed by a hash of (user content + last 3 context msgs
// + model name). Hits return the stored response instantly — no API call,
// no LLM cost. TTL is configurable per call; the default is 24h.

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/** Cheap, stable hash for an arbitrary string (32-bit FNV-1a). Browser + node safe. */
export function fnv1aHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Compose a stable cache key from the call shape. */
export function buildCacheKey(parts: { model: string; systemPrompt?: string; userContent: string; contextMsgs?: Array<{ role: string; content: string }> }): string {
  const ctx = (parts.contextMsgs ?? [])
    .slice(-3)
    .map((m) => `${m.role}:${m.content.slice(0, 400)}`)
    .join("|");
  const raw = [parts.model, parts.systemPrompt ?? "", parts.userContent, ctx].join("\u241F");
  return `${parts.model}:${fnv1aHash(raw)}`;
}

/** Public query — UI can display "served from cache" if it wants. */
export const peek = query({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("aiCache")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    if (!row) return null;
    if (row.expiresAt < Date.now()) return null;
    return { key: row.key, response: row.response, createdAt: row.createdAt, ttlMs: row.expiresAt - Date.now() };
  },
});

/** Internal — look up a cache row; returns just the response. */
export const getCachedResponse = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, args): Promise<string | null> => {
    const row = await ctx.db
      .query("aiCache")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    if (!row) return null;
    if (row.expiresAt < Date.now()) return null;
    return row.response;
  },
});

/** Internal — store a cache row. Idempotent on `key`. */
export const cacheResponse = internalMutation({
  args: {
    key: v.string(),
    response: v.string(),
    ttlMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const ttlMs = args.ttlMs ?? DEFAULT_TTL_MS;
    // Upsert by `key`.
    const existing = await ctx.db
      .query("aiCache")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        response: args.response,
        createdAt: now,
        expiresAt: now + ttlMs,
      });
      return existing._id;
    }
    return await ctx.db.insert("aiCache", {
      key: args.key,
      response: args.response,
      createdAt: now,
      expiresAt: now + ttlMs,
    });
  },
});

/** Public mutation — manual flush of one cache row (useful for ops). */
export const invalidate = mutation({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("aiCache")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    if (row) await ctx.db.delete(row._id);
    return { deleted: !!row };
  },
});
