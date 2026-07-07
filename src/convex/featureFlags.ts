import { v } from "convex/values";
import { internalQuery, query, QueryCtx, MutationCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// ─── Feature Flag registry ────────────────────────────────────────────────────
//
// Static, code-defined flag list + dynamic per-user overrides stored in
// `featureFlagOverrides`. `isEnabled(flag, ctx)` returns the resolved boolean:
//
//   1. If a per-user override exists for the calling user → use it.
//   2. Else, if a global override exists for the flag → use it.
//   3. Else, fall back to the static default in the `FLAGS` map.
//
// Unknown flag names fail closed (returns false) so a stale flag reference
// doesn't accidentally unlock a feature for everyone.

type FlagName =
  | "agentStudioV2"
  | "bulkPasteV2"
  | "testAllBatched"
  | "experimentalTTSCatalog"
  | "rateLimitHard"
  | "memorySearchRAG";

interface FlagDef {
  default: boolean;
  description: string;
}

// Edit this list here, not in an env file or DB. These are *defaults* — per-user
// overrides still win.
const FLAGS: Record<FlagName, FlagDef> = {
  agentStudioV2:        { default: false, description: "New Studio layout with track lanes + per-asset inspector" },
  bulkPasteV2:          { default: true,  description: "Bulk Paste JSON with Preview-before-Apply panel" },
  testAllBatched:       { default: true,  description: "Test All runs in batches of 3 to avoid provider throttling" },
  experimentalTTSCatalog: { default: false, description: "Show experimental TTS voices in the catalog" },
  rateLimitHard:        { default: true,  description: "Enforce hard rate-limits on saveApiKeys + Test All" },
  memorySearchRAG:      { default: false, description: "RAG memory search backed by vectorMemory embeddings" },
};

type Ctx = QueryCtx | MutationCtx;

async function isEnabledInner(ctx: Ctx, userId: string | null, flag: string): Promise<boolean> {
  // 1. Per-user override (highest priority)
  if (userId) {
    try {
      const u = await ctx.db
        .query("featureFlagOverrides")
        .withIndex("by_user_flag", (q) => q.eq("userId", userId).eq("flag", flag))
        .first();
      if (u) return u.value;
    } catch (e) {
      console.warn("[featureFlags] user override lookup failed:", e);
    }
  }
  // 2. Global override (system-wide toggle)
  try {
    const g = await ctx.db
      .query("featureFlagOverrides")
      .withIndex("by_user_flag", (q) => q.eq("userId", "__global__").eq("flag", flag))
      .first();
    if (g) return g.value;
  } catch (e) {
    console.warn("[featureFlags] global override lookup failed:", e);
  }
  // 3. Static default — unknown flag = false (fail closed)
  return (FLAGS as Record<string, FlagDef>)[flag]?.default ?? false;
}

/** Public query — `useQuery(api.featureFlags.isEnabled, { flag: "agentStudioV2" })` */
export const isEnabled = query({
  args: { flag: v.string() },
  handler: async (ctx, args): Promise<boolean> => {
    const userId = await getAuthUserId(ctx);
    return await isEnabledInner(ctx, userId, args.flag);
  },
});

/** Internal — for use from actions where ctx.runQuery is needed */
export const isEnabledInternal = internalQuery({
  args: { flag: v.string() },
  handler: async (ctx, args): Promise<boolean> => {
    const userId = await getAuthUserId(ctx);
    return await isEnabledInner(ctx, userId, args.flag);
  },
});

/** Public — register a per-user override (admin-only intended; tail of any user can call but the override is what gets persisted) */
export const setOverride = query({
  args: { flag: v.string(), value: v.boolean() },
  handler: async () => false, // disabled by default — use internal mutation below
});

/** List known static flags for the UI to render. */
export const listFlags = query({
  args: {},
  handler: async (): Promise<Array<{ flag: string; default: boolean; description: string }>> => {
    return Object.entries(FLAGS).map(([flag, def]) => ({
      flag,
      default: def.default,
      description: def.description,
    }));
  },
});

export const FLAG_NAMES = Object.keys(FLAGS) as FlagName[];
