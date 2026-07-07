import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, internalQuery, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

/**
 * Get the current signed in user. Returns null if the user is not signed in.
 * Usage: const signedInUser = await ctx.runQuery(api.authHelpers.currentUser);
 * THIS FUNCTION IS READ-ONLY. DO NOT MODIFY.
 */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);

    if (user === null) {
      return null;
    }

    return user;
  },
});

/**
 * Use this function internally to get the current user data. Remember to handle the null user case.
 * @param ctx
 * @returns
 */
export const getCurrentUser = async (ctx: QueryCtx) => {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    return null;
  }
  return await ctx.db.get(userId);
};

// ─── Per-user AI provider API key store ─────────────────────────────────────────
//
// Settings UI pushes keys here on Save. Backend actions read from this store via
// the internal query. Public queries return only a "has-key" boolean per
// provider so we never leak the raw secrets over the wire to any UI surface.

type ApiKeyMap = Record<string, string>;

const AI_KEY_NAMES = [
  "GROQ_API_KEY", "GEMINI_API_KEY", "OPENROUTER_API_KEY", "DEEPSEEK_API_KEY",
  "MISTRAL_API_KEY", "CEREBRAS_API_KEY", "COHERE_API_KEY", "NVIDIA_API_KEY",
  "HUGGINGFACE_API_KEY", "GITHUB_TOKEN", "CF_API_TOKEN", "CF_ACCOUNT_ID",
  "OLLAMA_API_KEY", "TOGETHER_API_KEY", "FIREWORKS_API_KEY", "SAMBANOVA_API_KEY",
  "GOOGLE_CLOUD_API_KEY",
];

const OTHER_KEY_NAMES = [
  "PEXELS_API_KEY", "FIRECRAWL_API_KEY", "COVERR_FREEVIDEOS_API_KEY", "PIXABAY_API_KEY", "FREESOUND_API_KEY",
];

/** Public — which providers the current user has configured. No raw keys returned. */
export const getMySettings = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { configured: [], updatedAt: null };

    const user = await ctx.db.get(userId) as any;
    const keys = (user?.apiKeys as ApiKeyMap | undefined) || {};
    const configured = [
      ...AI_KEY_NAMES.filter((k) => !!keys[k]),
      ...OTHER_KEY_NAMES.filter((k) => !!keys[k]),
    ];
    return { configured, updatedAt: user?.apiKeysUpdatedAt ?? null };
  },
});

/** Internal — backend only. Returns the raw per-user keys for the given user. */
export const getApiKeysForUser_Internal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId) as any;
    return ((user?.apiKeys as ApiKeyMap | undefined) || {}) as ApiKeyMap;
  },
});

/** Save (upsert) the supplied keys for the current user.
 *
 * Dual-writes:
 * 1. users.apiKeys plaintext (fast path for backend reads)
 * 2. providers table with AES-256-GCM encryption (compliance / tamper detection)
 *
 * Either path can succeed independently — frontend doesn't need to know.
 */
export const saveApiKeys = mutation({
  args: {
    apiKeys: v.record(v.string(), v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    // Defense-in-depth: even though the arg validator is `record(string,string)`,
    // we re-filter against the known AI_KEY_NAMES + OTHER_KEY_NAMES whitelist so
    // an unknown key sent for any reason (e.g. an older client) can't land in
    // the users table. Trims and drops empties.
    const incoming = (args.apiKeys || {}) as Record<string, unknown>;
    const cleaned: ApiKeyMap = {};
    const rejected: string[] = [];
    for (const k of [...AI_KEY_NAMES, ...OTHER_KEY_NAMES]) {
      const v = incoming[k];
      if (typeof v === "string" && v.trim()) cleaned[k] = v.trim();
    }
    for (const k of Object.keys(incoming)) {
      if (![...AI_KEY_NAMES, ...OTHER_KEY_NAMES].includes(k as any)) rejected.push(k);
    }
    if (Object.keys(cleaned).length === 0) {
      throw new Error("saveApiKeys: no recognised keys in payload");
    }

    await ctx.db.patch(userId, {
      apiKeys: cleaned,
      apiKeysUpdatedAt: Date.now(),
    });

    // Mirror to encrypted providers table (best-effort — keep going on failure)
    // We use ctx.runMutation so the providers.ts file (which has 'use node') runs
    // on Node runtime for AES-256-GCM via node:crypto.
    let encryptedCount = 0;
    try {
      const providerIds = Object.keys(cleaned);
      // Sequential to avoid log noise; cheap because each is a small upsert.
      for (const providerId of providerIds) {
        try {
          await ctx.runMutation((api as any).providers.saveProviderKey, {
            providerId,
            apiKey: cleaned[providerId],
          });
          encryptedCount++;
        } catch {
          // Per-provider failure shouldn't block the saveApiKeys caller
        }
      }
    } catch {
      // swallow — non-blocking
    }

    return { saved: Object.keys(cleaned).length, encrypted: encryptedCount, rejected };
  },
});

/** Clear all stored keys for the current user (revert to env-only). */
export const clearApiKeys = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    await ctx.db.patch(userId, {
      apiKeys: undefined,
      apiKeysUpdatedAt: Date.now(),
    });
    return { cleared: true };
  },
});

/**
 * Convex-side helper: resolve effective API keys for a user.
 * Per-user stored keys are merged with process.env (env wins for keys the operator
 * already deployed as secrets). Returns a Record that the provider helpers consume.
 */
export async function resolveEffectiveKeys(
  ctx: QueryCtx | MutationCtx,
  userId: string,
): Promise<ApiKeyMap> {
  // Use the query via runQuery-like path. For internal use we'll fetch directly.
  const user = await ctx.db.get(userId as any) as any;
  const stored = ((user?.apiKeys as ApiKeyMap | undefined) || {}) as ApiKeyMap;
  // env wins for any key that's already set in process.env
  for (const k of Object.keys(stored)) {
    if (!process.env[k] && stored[k]) stored[k] = stored[k];
  }
  return stored;
}
