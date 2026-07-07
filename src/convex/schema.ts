import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove

      // Per-user AI provider API keys. Stored server-side so backend tasks can read them
      // without going through the browser. Merged with process.env on the server —
      // process.env wins by default (deployed secrets take precedence), but stored keys
      // fill the gap when the operator hasn't configured Convex-side env vars.
      apiKeys: v.optional(v.any()),
      apiKeysUpdatedAt: v.optional(v.number()),
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // ── Video Editor Projects ───────────────────────────────────────────────
    projects: defineTable({
      title: v.string(),
      userId: v.id("users"),
      status: v.union(v.literal("draft"), v.literal("processing"), v.literal("completed")),
      aspectRatio: v.union(v.literal("9:16"), v.literal("16:9"), v.literal("1:1")),
      resolution: v.union(v.literal("720p"), v.literal("1080p")),
      sourceVideoUrl: v.optional(v.string()),
      sourceVideoPath: v.optional(v.string()),
      thumbnail: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_user", ["userId"]),

    clips: defineTable({
      projectId: v.id("projects"),
      type: v.union(v.literal("video"), v.literal("audio"), v.literal("image")),
      name: v.string(),
      source: v.string(),
      storageId: v.optional(v.id("_storage")),
      start: v.number(),
      end: v.number(),
      duration: v.number(),
      order: v.number(),
      thumbnail: v.optional(v.string()),
      // Optional linkage to a tracked lane (added in Phase 2 timeline refactor).
      // Kept optional for backward compat with pre-track clips.
      trackId: v.optional(v.id("tracks")),
      volume: v.number(),
      effects: v.object({
        zoomPan: v.boolean(),
        colorGrading: v.union(
          v.literal("none"),
          v.literal("warm"),
          v.literal("cool"),
          v.literal("vintage"),
        ),
        vignette: v.boolean(),
        filmGrain: v.boolean(),
      }),
      captions: v.array(
        v.object({ start: v.number(), end: v.number(), text: v.string() }),
      ),
    }).index("by_project", ["projectId"]),

    captions: defineTable({
      projectId: v.id("projects"),
      startTime: v.number(),
      endTime: v.number(),
      text: v.string(),
      fontSize: v.number(),
      color: v.string(),
      backgroundColor: v.string(),
      position: v.union(v.literal("top"), v.literal("middle"), v.literal("bottom")),
      order: v.number(),
    }).index("by_project", ["projectId"]),

    audioTracks: defineTable({
      projectId: v.id("projects"),
      name: v.string(),
      source: v.string(),
      volume: v.number(),
      muted: v.boolean(),
      startTime: v.number(),
      duration: v.number(),
      order: v.number(),
    }).index("by_project", ["projectId"]),

    // Timeline Tracks — dynamic layers (video / audio / captions / fx).
    // `order` is the layer Z-index so the editor can render top-to-bottom.
    tracks: defineTable({
      projectId: v.id("projects"),
      name: v.string(),
      type: v.union(v.literal("video"), v.literal("audio"), v.literal("captions"), v.literal("fx")),
      order: v.number(),
      muted: v.optional(v.boolean()),
      locked: v.optional(v.boolean()),
      height: v.optional(v.number()),
    })
      .index("by_project", ["projectId"])
      .index("by_project_order", ["projectId", "order"]),
    // ── AI Agent Commands ─────────────────────────────────────────────────
    agentCommands: defineTable({
      userId: v.id("users"),
      projectId: v.optional(v.id("projects")),
      command: v.string(),
      intent: v.string(),
      params: v.optional(v.any()),
      status: v.union(
        v.literal("pending"),
        v.literal("processing"),
        v.literal("completed"),
        v.literal("failed"),
      ),
      progress: v.number(),
      plan: v.optional(v.any()),
      logs: v.optional(v.any()),
      result: v.optional(v.any()),
      error: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_user", ["userId"]),

    // ── AI Providers (encrypted API keys per user) ───────────────────────
    providers: defineTable({
      name: v.string(),
      apiKeyEncrypted: v.string(),
      userId: v.id("users"),
      createdAt: v.number(),
    }).index("by_user", ["userId"]),

    // ── Media Assets (uploaded / downloaded files) ───────────────────────
    assets: defineTable({
      projectId: v.optional(v.id("projects")),
      userId: v.id("users"),
      originalName: v.string(),
      storedPath: v.string(),
      fileType: v.union(v.literal("video"), v.literal("audio"), v.literal("image")),
      metadataJson: v.optional(v.any()),
      sourceType: v.union(v.literal("upload"), v.literal("url")),
      duration: v.optional(v.float64()),
      size: v.optional(v.int64()),
      thumbnail: v.optional(v.string()),
      createdAt: v.number(),
    }).index("by_user", ["userId"]).index("by_project", ["projectId"]),

    // ── Download Jobs (async yt-dlp queue) ───────────────────────────────
    downloadJobs: defineTable({
      userId: v.id("users"),
      url: v.string(),
      status: v.union(
        v.literal("pending"),
        v.literal("running"),
        v.literal("completed"),
        v.literal("failed"),
      ),
      progress: v.number(),
      metadataSnapshot: v.optional(v.any()),
      result: v.optional(v.any()),
      error: v.optional(v.string()),
      retryCount: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_user", ["userId"]).index("by_status", ["status"]),

    // ─── Vector Memory (RAG embeddings for semantic search) ──────────────
    vectorMemory: defineTable({
      assetId: v.optional(v.id("assets")),
      userId: v.id("users"),
      embeddingVector: v.optional(v.any()),
      contentSummary: v.string(),
      sourceText: v.optional(v.string()),
      createdAt: v.number(),
    }).index("by_user", ["userId"]).index("by_asset", ["assetId"]),

    // ─── Effects Registry (dynamic, extensible) ──────────────────────────
    effectsRegistry: defineTable({
      name: v.string(),
      command: v.string(),
      scriptPath: v.string(),
      category: v.string(),
      iconName: v.optional(v.string()),
      enabled: v.boolean(),
      createdAt: v.number(),
    }).index("by_category", ["category"]),

    // ─── Audit Logs (undo/rollback support) ──────────────────────────────
    auditLogs: defineTable({
      userId: v.id("users"),
      action: v.string(),
      detailsJson: v.optional(v.any()),
      tableName: v.optional(v.string()),
      recordId: v.optional(v.string()),
      timestamp: v.number(),
    }).index("by_user", ["userId"]).index("by_timestamp", ["timestamp"]),

    // Per-user per-action sliding-window rate counters (used by convex/rateLimit.ts)
    rateLimits: defineTable({
      userId: v.id("users"),
      action: v.string(),
      windowStartMs: v.number(),
      count: v.number(),
      lastUpdateMs: v.number(),
    })
      .index("by_user_action", ["userId", "action"])
      .index("by_user", ["userId"]),

    // Feature flag overrides. userId is either an Id<"users"> for per-user
    // overrides, or the literal string "__global__" for system-wide toggles.
    featureFlagOverrides: defineTable({
      userId: v.string(),
      flag: v.string(),
      value: v.boolean(),
      updatedAt: v.number(),
    })
      .index("by_user_flag", ["userId", "flag"])
      .index("by_user", ["userId"]),

    // AI Response Cache (per key). Default 24h TTL set per call.
    aiCache: defineTable({
      key: v.string(),
      response: v.string(),
      createdAt: v.number(),
      expiresAt: v.number(),
    })
      .index("by_key", ["key"])
      .index("by_expiresAt", ["expiresAt"]),

    // AI Telemetry (per outbound AI call). Powers an ops dashboard.
    moduleLogs: defineTable({
      userId: v.string(),
      kind: v.union(
        v.literal("text"),
        v.literal("voice"),
        v.literal("image"),
        v.literal("transcribe"),
        v.literal("error"),
      ),
      model: v.string(),
      inputLength: v.number(),
      outputLength: v.number(),
      latencyMs: v.number(),
      status: v.union(v.literal("ok"), v.literal("error"), v.literal("cached")),
      error: v.optional(v.string()),
      cacheHit: v.boolean(),
      createdAt: v.number(),
    })
      .index("by_createdAt", ["createdAt"])
      .index("by_user_createdAt", ["userId", "createdAt"]),

    // Source-Hash Output Cache (skip re-rendering unchanged source bundles).
    cachedFiles: defineTable({
      sourceHash: v.string(),
      kind: v.union(v.literal("render"), v.literal("trim"), v.literal("effects")),
      outputPath: v.string(),
      filesize: v.optional(v.number()),
      duration: v.optional(v.number()),
      metaJson: v.optional(v.any()),
      createdAt: v.number(),
    })
      .index("by_hash_kind", ["sourceHash", "kind"]),

    // ── Processing Jobs (for video-server integration) ───────────────────────
    // ─── OmniChat Sessions ──────────────────────────────────────────────
    chatSessions: defineTable({
      userId: v.id("users"),
      projectId: v.optional(v.id("projects")),
      title: v.string(),
      createdAt: v.number(),
    }).index("by_user", ["userId"]),

    // ─── OmniChat Messages ──────────────────────────────────────────────
    chatMessages: defineTable({
      sessionId: v.id("chatSessions"),
      role: v.union(v.literal("user"), v.literal("assistant"), v.literal("tool")),
      content: v.string(),
      toolCalls: v.optional(v.any()),
      toolCallId: v.optional(v.string()),
      usedModel: v.optional(v.string()),
      attachments: v.optional(v.array(v.id("assets"))),
      createdAt: v.number(),
    }).index("by_session", ["sessionId"]),

    // ── Processing Jobs ───────────────────────────────────────────────────────
    processingJobs: defineTable({
      userId: v.id("users"),
      projectId: v.optional(v.id("projects")),
      commandId: v.optional(v.id("agentCommands")),
      type: v.union(
        v.literal("hook_detection"),
        v.literal("trim"),
        v.literal("music_overlay"),
        v.literal("export"),
        v.literal("effects"),
        v.literal("render"),
      ),
      status: v.union(
        v.literal("queued"),
        v.literal("processing"),
        v.literal("completed"),
        v.literal("failed"),
      ),
      params: v.optional(v.any()),
      outputPath: v.optional(v.string()),
      error: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_user", ["userId"]).index("by_project", ["projectId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
