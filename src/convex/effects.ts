// ─── src/convex/effects.ts ───────────────────────────────────────────────────
// Dynamic Effects Registry — extension point for /hook, /trim, /effects, etc.
//
// The agent UI reads this table to render command buttons, so adding/removing
// an effect here propagates to AgentChat without rebuilding the React app
// (Open/Closed principle).
//
// Defaults are seeded on first run from the embedded JSON below, which mirrors
// effects.registry.json in the project root.

import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// ─── Default effects (mirror of effects.registry.json) ────────────────────────
// If the file changes upstream, update this list. Centralizing it here makes
// the schema independent of any filesystem read at runtime.
const DEFAULT_EFFECTS = [
  {
    name: "Ken Burns Zoom",
    command: "/effects zoom_pan",
    scriptPath: "video-server:apply-effects",
    category: "motion",
    iconName: "ZoomIn",
    description: "Slow zoom + pan on still images or video to add motion",
    paramsJson: { zoomSpeed: 1.03, easing: "smoothstep" },
    compatibleTypes: ["image", "video"],
  },
  {
    name: "Vignette",
    command: "/vignette",
    scriptPath: "video-server:apply-effects",
    category: "color",
    iconName: "Circle",
    description: "Darken the edges to focus attention on the center",
    paramsJson: { intensity: 0.3, feather: 0.5 },
    compatibleTypes: ["video", "image"],
  },
  {
    name: "Film Grain",
    command: "/effects grain",
    scriptPath: "video-server:apply-effects",
    category: "texture",
    iconName: "Sparkles",
    description: "Adds cinematic film grain for a vintage/film feel",
    paramsJson: { intensity: 3, type: "gaussian" },
    compatibleTypes: ["video", "image"],
  },
  {
    name: "Glitch",
    command: "/effects glitch",
    scriptPath: "video-server:apply-effects",
    category: "distortion",
    iconName: "Tv",
    description: "Adds digital glitch artifacts for a corrupted/VHS aesthetic",
    paramsJson: { intensity: 15, frameJitter: 2, mode: "digital" },
    compatibleTypes: ["video"],
  },
  {
    name: "VHS Tape",
    command: "/effects vhs",
    scriptPath: "video-server:apply-effects",
    category: "texture",
    iconName: "Film",
    description: "Adds VHS tape artifacts: scanlines, color bleed, and tracking distortion",
    paramsJson: { scanlines: true, colorBleed: true, tracking: 0.5 },
    compatibleTypes: ["video"],
  },
] as const;

// ─── Public queries ───────────────────────────────────────────────────────────
export const listEffects = query({
  args: { category: v.optional(v.string()) },
  handler: async (ctx, args) => {
    let q = ctx.db.query("effectsRegistry").withIndex("by_category", (idx) => idx);
    const all = await ctx.db.query("effectsRegistry").collect();
    const filtered = args.category
      ? all.filter((e) => e.category === args.category)
      : all;
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const listAllEffects = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("effectsRegistry").collect();
  },
});

// ─── Admin mutations ──────────────────────────────────────────────────────────
// Any authenticated user can add/toggle effects in MVP. In production restrict
// these to admin role via roleValidator from schema.ts.
export const addEffect = mutation({
  args: {
    name: v.string(),
    command: v.string(),
    scriptPath: v.string(),
    category: v.string(),
    iconName: v.optional(v.string()),
    description: v.optional(v.string()),
    paramsJson: v.optional(v.any()),
    compatibleTypes: v.optional(v.array(v.string())),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("effectsRegistry", {
      name: args.name,
      command: args.command,
      scriptPath: args.scriptPath,
      category: args.category,
      iconName: args.iconName,
      description: args.description,
      paramsJson: args.paramsJson,
      compatibleTypes: args.compatibleTypes,
      enabled: args.enabled ?? true,
      createdAt: Date.now(),
    } as any);
  },
});

export const toggleEffect = mutation({
  args: {
    effectId: v.id("effectsRegistry"),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.effectId, { enabled: args.enabled });
    return { ok: true };
  },
});

export const removeEffect = mutation({
  args: { effectId: v.id("effectsRegistry") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.effectId);
    return { ok: true };
  },
});

// ─── Seeding ─────────────────────────────────────────────────────────────────
// Idempotent. Call from app startup via a useEffect-once, or run manually.
export const seedEffectsFromInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("effectsRegistry").collect();
    if (existing.length > 0) return { seeded: 0, skipped: existing.length };
    let count = 0;
    for (const e of DEFAULT_EFFECTS) {
      await ctx.db.insert("effectsRegistry", {
        name: e.name,
        command: e.command,
        scriptPath: e.scriptPath,
        category: e.category,
        iconName: e.iconName,
        description: e.description,
        paramsJson: e.paramsJson,
        compatibleTypes: Array.from(e.compatibleTypes),
        enabled: true,
        createdAt: Date.now(),
      } as any);
      count++;
    }
    return { seeded: count, skipped: 0 };
  },
});

// ─── Public seed (for first-load from frontend) ──────────────────────────────
export const seedDefaultsIfEmpty = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const existing = await ctx.db.query("effectsRegistry").collect();
    if (existing.length > 0) return { seeded: 0, skipped: existing.length };
    let count = 0;
    for (const e of DEFAULT_EFFECTS) {
      await ctx.db.insert("effectsRegistry", {
        name: e.name,
        command: e.command,
        scriptPath: e.scriptPath,
        category: e.category,
        iconName: e.iconName,
        description: e.description,
        paramsJson: e.paramsJson,
        compatibleTypes: Array.from(e.compatibleTypes),
        enabled: true,
        createdAt: Date.now(),
      } as any);
      count++;
    }
    return { seeded: count, skipped: 0 };
  },
});
