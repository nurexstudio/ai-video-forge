// ─── src/convex/auditLogs.ts ─────────────────────────────────────────────────
// Centralized audit log writer. Every privileged mutation/action should call
// writeAuditLog so Undo/Rollback and compliance logging work.

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// ─── Public query: most recent audit logs for the current user ───────────────
export const listRecentAuditLogs = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("auditLogs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

// ─── Public mutation: write a new audit log entry ────────────────────────────
// Returns null if not authenticated (silent skip rather than throw — the caller
// is already inside a mutation that raised auth). Audit logs should never
// break the user's flow.
export const writeAuditLog = mutation({
  args: {
    action: v.string(),
    tableName: v.optional(v.string()),
    recordId: v.optional(v.string()),
    detailsJson: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db.insert("auditLogs", {
      userId,
      action: args.action,
      tableName: args.tableName,
      recordId: args.recordId,
      detailsJson: args.detailsJson,
      timestamp: Date.now(),
    });
  },
});

// ─── Convenience helpers ─────────────────────────────────────────────────────
// These thin wrappers keep callers concise. Each accepts a "log" argument that
// is passed-through to writeAuditLog. Note: they are mutations, so the return
// type is Fire-and-forget; the caller doesn't await the audit result.
export const logKeySave = mutation({
  args: { providerId: v.string(), keyLength: v.number() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return ctx.db.insert("auditLogs", {
      userId,
      action: "key_save",
      tableName: "providers",
      recordId: args.providerId,
      detailsJson: { keyLength: args.keyLength, encrypted: true },
      timestamp: Date.now(),
    });
  },
});

export const logKeyDelete = mutation({
  args: { providerId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return ctx.db.insert("auditLogs", {
      userId,
      action: "key_delete",
      tableName: "providers",
      recordId: args.providerId,
      timestamp: Date.now(),
    });
  },
});

export const logAssetUpload = mutation({
  args: {
    assetId: v.string(),
    originalName: v.string(),
    fileType: v.string(),
    targetFolder: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return ctx.db.insert("auditLogs", {
      userId,
      action: "asset_upload",
      tableName: "assets",
      recordId: args.assetId,
      detailsJson: {
        originalName: args.originalName,
        fileType: args.fileType,
        targetFolder: args.targetFolder,
      },
      timestamp: Date.now(),
    });
  },
});

export const logDownloadEvent = mutation({
  args: {
    jobId: v.string(),
    event: v.string(), // "started" | "completed" | "failed" | "retried"
    url: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return ctx.db.insert("auditLogs", {
      userId,
      action: `download_${args.event}`,
      tableName: "downloadJobs",
      recordId: args.jobId,
      detailsJson: { url: args.url, error: args.error },
      timestamp: Date.now(),
    });
  },
});

export const logEffectAdd = mutation({
  args: { effectId: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return ctx.db.insert("auditLogs", {
      userId,
      action: "effect_add",
      tableName: "effectsRegistry",
      recordId: args.effectId,
      detailsJson: { name: args.name },
      timestamp: Date.now(),
    });
  },
});
