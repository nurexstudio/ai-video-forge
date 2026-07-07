import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

// ─── Per-request AI telemetry ────────────────────────────────────────────────
//
// One row per outbound AI call. Frontend can run an aggregate query for an
// ops dashboard (calls/day, average latency, by-model distribution, etc).
// This is *observability* — never gate the user's flow on these writes.

const LOG_KINDS = ["text", "voice", "image", "transcribe", "error"] as const;
type LogKind = typeof LOG_KINDS[number];

export const recordCall = internalMutation({
  args: {
    userId: v.string(),                   // Id<"users">; we keep it as string for hospitality across runQuery boundary
    kind: v.union(...LOG_KINDS.map((k) => v.literal(k))),
    model: v.string(),
    inputLength: v.number(),
    outputLength: v.number(),
    latencyMs: v.number(),
    status: v.union(v.literal("ok"), v.literal("error"), v.literal("cached")),
    error: v.optional(v.string()),
    cacheHit: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    try {
      await ctx.db.insert("moduleLogs", {
        userId: args.userId,
        kind: args.kind,
        model: args.model,
        inputLength: args.inputLength,
        outputLength: args.outputLength,
        latencyMs: args.latencyMs,
        status: args.status,
        error: args.error,
        cacheHit: args.cacheHit ?? false,
        createdAt: Date.now(),
      });
    } catch (e) {
      // Never break the user's flow for telemetry.
      if (typeof console !== "undefined") {
        console.warn("[logging.recordCall] failed:", e instanceof Error ? e.message : String(e));
      }
    }
  },
});

/** Public aggregate: total call counts and avg latency by model, last 24h. */
export const summary24h = query({
  args: { userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const rows = await ctx.db
      .query("moduleLogs")
      .withIndex("by_createdAt", (q) => q.gt("createdAt", since))
      .collect();
    const filtered = args.userId ? rows.filter((r) => r.userId === args.userId) : rows;
    const byModel: Record<string, { count: number; avgLatency: number; errors: number; cacheHits: number }> = {};
    let total = 0, totalErrors = 0, totalCached = 0, totalInputChars = 0, totalOutputChars = 0;
    for (const r of filtered) {
      const k = r.model;
      const cur = byModel[k] ?? { count: 0, avgLatency: 0, errors: 0, cacheHits: 0 };
      cur.count += 1;
      cur.avgLatency = (cur.avgLatency * (cur.count - 1) + r.latencyMs) / cur.count;
      if (r.status === "error") cur.errors += 1;
      if (r.cacheHit) cur.cacheHits += 1;
      byModel[k] = cur;
      total += 1;
      if (r.status === "error") totalErrors += 1;
      if (r.cacheHit) totalCached += 1;
      totalInputChars += r.inputLength;
      totalOutputChars += r.outputLength;
    }
    return {
      since,
      total,
      errors: totalErrors,
      cached: totalCached,
      totalInputChars,
      totalOutputChars,
      byModel,
    };
  },
});
