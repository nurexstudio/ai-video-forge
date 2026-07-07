import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

// ─── Source-hash-aware output cache ───────────────────────────────────────────
//
// One row per (sourceHash, kind). When a render pipeline is asked to produce
// output for the same sourceHash as before (e.g. same clip bundle + same
// effects + same aspect ratio), we return the previously produced path without
// re-running FFmpeg. Forwarded to video-server to materialize the file before
// any expensive re-encode.

export type CacheKind = "render" | "trim" | "effects";

export const getCachedOutput = internalQuery({
  args: {
    sourceHash: v.string(),
    kind: v.union(v.literal("render"), v.literal("trim"), v.literal("effects")),
  },
  handler: async (ctx, args): Promise<{ path: string; filesize: number; duration: number; createdAt: number } | null> => {
    const row = await ctx.db
      .query("cachedFiles")
      .withIndex("by_hash_kind", (q) => q.eq("sourceHash", args.sourceHash).eq("kind", args.kind))
      .first();
    if (!row) return null;
    return {
      path: row.outputPath,
      filesize: row.filesize ?? 0,
      duration: row.duration ?? 0,
      createdAt: row.createdAt,
    };
  },
});

export const recordCachedOutput = internalMutation({
  args: {
    sourceHash: v.string(),
    kind: v.union(v.literal("render"), v.literal("trim"), v.literal("effects")),
    outputPath: v.string(),
    filesize: v.optional(v.number()),
    duration: v.optional(v.number()),
    metaJson: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("cachedFiles")
      .withIndex("by_hash_kind", (q) => q.eq("sourceHash", args.sourceHash).eq("kind", args.kind))
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        outputPath: args.outputPath,
        filesize: args.filesize,
        duration: args.duration,
        metaJson: args.metaJson,
        createdAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("cachedFiles", {
      sourceHash: args.sourceHash,
      kind: args.kind,
      outputPath: args.outputPath,
      filesize: args.filesize,
      duration: args.duration,
      metaJson: args.metaJson,
      createdAt: now,
    });
  },
});

/** Cheap, deterministic hash for an arbitrary JSON-able value. */
export function stableHash(value: unknown): string {
  const json = JSON.stringify(value, Object.keys(value as any).sort?.() ?? undefined);
  // FNV-1a 32-bit, two-rounds for stability
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
