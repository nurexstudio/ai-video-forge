import { v } from "convex/values";
import { internalMutation, internalQuery, MutationCtx, QueryCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// ─── Per-user, per-action sliding-window rate limiter ──────────────────────────
//
// One row per (userId, action) pair. Each row tracks a fixed-size window:
//   - windowStartMs: the start of the current window
//   - count: how many consumes happened inside this window
//
// On each `consume(...)`, if the window has expired we reset (windowStartMs=now,
// count=1) and allow the call. Otherwise we increment and deny if count > limit.

const DEFAULTS = {
  windowMs: 60_000,            // 1 minute
  limit: {
    saveApiKeys: 30,
    clearApiKeys: 10,
    testProviderKey: 60,
    testAllKeys: 5,
    bulkApplyPaste: 20,
    callText: 60,
    synthesizeVoice: 30,
    transcribeAudio: 30,
    imageGenerate: 20,
  },
} as const;

type Action = keyof typeof DEFAULTS.limit;

// Only MutationCtx has db.patch / db.insert
async function rateLimitConsumeRaw(
  ctx: MutationCtx,
  userId: string,
  action: Action,
  overrides?: { limit?: number; windowMs?: number },
): Promise<{ ok: true; remaining: number; resetAt: number } | { ok: false; retryAfterMs: number; resetAt: number }> {
  const limit = overrides?.limit ?? DEFAULTS.limit[action];
  const windowMs = overrides?.windowMs ?? DEFAULTS.windowMs;
  const now = Date.now();

  try {
    const existing = await ctx.db
      .query("rateLimits")
      .withIndex("by_user_action", (q) =>
        // Cast userId to any so Convex index works with string type
        q.eq("userId", userId as any).eq("action", action),
      )
      .first();

    if (existing && existing.windowStartMs + windowMs <= now) {
      await ctx.db.patch(existing._id, { windowStartMs: now, count: 1, lastUpdateMs: now });
      return { ok: true, remaining: limit - 1, resetAt: now + windowMs };
    }
    if (!existing) {
      await ctx.db.insert("rateLimits", {
        userId: userId as any,
        action,
        windowStartMs: now,
        count: 1,
        lastUpdateMs: now,
      });
      return { ok: true, remaining: limit - 1, resetAt: now + windowMs };
    }
    if (existing.count >= limit) {
      return {
        ok: false,
        retryAfterMs: existing.windowStartMs + windowMs - now,
        resetAt: existing.windowStartMs + windowMs,
      };
    }
    await ctx.db.patch(existing._id, { count: existing.count + 1, lastUpdateMs: now });
    return { ok: true, remaining: limit - (existing.count + 1), resetAt: existing.windowStartMs + windowMs };
  } catch (e) {
    console.warn("[rateLimit]", action, "counter failed; allowing call:", e);
    return { ok: true, remaining: limit, resetAt: now + windowMs };
  }
}

/** Internal — callable from mutations/actions. */
export const consume = internalMutation({
  args: {
    action: v.string(),
    limit: v.optional(v.number()),
    windowMs: v.optional(v.number()),
  },
  handler: async (ctx, _args): Promise<{ ok: true; remaining: number; resetAt: number } | { ok: false; retryAfterMs: number; resetAt: number }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return { ok: true, remaining: Number.MAX_SAFE_INTEGER, resetAt: Date.now() + DEFAULTS.windowMs };
    }
    const action = _args.action as Action;
    if (!(action in DEFAULTS.limit)) {
      console.warn("[rateLimit] unknown action:", action);
      return { ok: true, remaining: Number.MAX_SAFE_INTEGER, resetAt: Date.now() + DEFAULTS.windowMs };
    }
    return rateLimitConsumeRaw(ctx, userId, action, {
      limit: _args.limit,
      windowMs: _args.windowMs,
    });
  },
});

/** Helper for callers that already resolved the userId. Throws friendlier message. */
export async function requireWithinLimit(
  ctx: MutationCtx,
  userId: string,
  action: Action,
  overrides?: { limit?: number; windowMs?: number },
): Promise<void> {
  const r = await rateLimitConsumeRaw(ctx, userId, action, overrides);
  if (!r.ok) {
    const secs = Math.max(1, Math.ceil(r.retryAfterMs / 1000));
    throw new Error(
      `Rate limit: '${action}' exceeded. Try again in ${secs}s (limit ${overrides?.limit ?? DEFAULTS.limit[action]} per ${(overrides?.windowMs ?? DEFAULTS.windowMs) / 1000}s window).`,
    );
  }
}

/** Internal — diagnostics. Returns current counters for the user across all actions. */
export const listMyCounters = internalQuery({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("rateLimits")
      .withIndex("by_user_action", (q) => q.eq("userId", userId as any))
      .collect();
  },
});

export type RateAction = Action;
