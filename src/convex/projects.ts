import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// ─── Queries ──────────────────────────────────────────────────────────────────

export const listProjects = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return ctx.db
      .query("projects")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const getProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== userId) return null;

    const clips = await ctx.db
      .query("clips")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const captions = await ctx.db
      .query("captions")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const audioTracks = await ctx.db
      .query("audioTracks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    return { ...project, clips, captions, audioTracks };
  },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

export const createProject = mutation({
  args: {
    title: v.string(),
    aspectRatio: v.union(v.literal("9:16"), v.literal("16:9"), v.literal("1:1")),
    resolution: v.union(v.literal("720p"), v.literal("1080p")),
    sourceVideoUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const now = Date.now();
    return ctx.db.insert("projects", {
      title: args.title,
      userId,
      status: "draft",
      aspectRatio: args.aspectRatio,
      resolution: args.resolution,
      sourceVideoUrl: args.sourceVideoUrl,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateProjectTitle = mutation({
  args: { projectId: v.id("projects"), title: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== userId) throw new Error("Not found");
    return ctx.db.patch(args.projectId, { title: args.title, updatedAt: Date.now() });
  },
});

export const deleteProject = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== userId) throw new Error("Not found");

    // Delete all related data
    const clips = await ctx.db.query("clips").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect();
    const captions = await ctx.db.query("captions").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect();
    const audioTracks = await ctx.db.query("audioTracks").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect();

    await Promise.all([
      ...clips.map((c) => ctx.db.delete(c._id)),
      ...captions.map((c) => ctx.db.delete(c._id)),
      ...audioTracks.map((a) => ctx.db.delete(a._id)),
    ]);

    return ctx.db.delete(args.projectId);
  },
});

// ─── Clips ────────────────────────────────────────────────────────────────────

export const addClip = mutation({
  args: {
    projectId: v.id("projects"),
    type: v.union(v.literal("video"), v.literal("audio"), v.literal("image")),
    name: v.string(),
    source: v.string(),
    start: v.number(),
    end: v.number(),
    duration: v.number(),
    order: v.number(),
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
    thumbnail: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== userId) throw new Error("Not found");

    await ctx.db.patch(args.projectId, { updatedAt: Date.now() });
    return ctx.db.insert("clips", { ...args, projectId: args.projectId });
  },
});

export const updateClipOrder = mutation({
  args: { clips: v.array(v.object({ id: v.id("clips"), order: v.number() })) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    for (const { id, order } of args.clips) {
      await ctx.db.patch(id, { order });
    }
  },
});

// Update a single clip's mutable fields. Used by the live timeline drag/split
// operations. Only the owning user can edit a clip.
export const updateClip = mutation({
  args: {
    clipId: v.id("clips"),
    start: v.optional(v.number()),
    end: v.optional(v.number()),
    duration: v.optional(v.number()),
    order: v.optional(v.number()),
    trackId: v.optional(v.id("tracks")),
    volume: v.optional(v.number()),
    effects: v.optional(
      v.object({
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
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const clip = await ctx.db.get(args.clipId);
    if (!clip) throw new Error("Clip not found");
    const project = await ctx.db.get(clip.projectId);
    if (!project || project.userId !== userId) throw new Error("Forbidden");
    const { clipId, ...updates } = args;
    return ctx.db.patch(clipId, updates);
  },
});

// Split a clip into two at a given timeline position. Returns the two new
// clipIds. The caller (Studio) drops the old clip id and renders the two new
// segments in its place.
export const splitClip = mutation({
  args: {
    clipId: v.id("clips"),
    splitPoint: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const clip = await ctx.db.get(args.clipId);
    if (!clip) throw new Error("Clip not found");
    const project = await ctx.db.get(clip.projectId);
    if (!project || project.userId !== userId) throw new Error("Forbidden");

    if (args.splitPoint <= clip.start || args.splitPoint >= clip.end) {
      throw new Error("splitPoint must be strictly between clip.start and clip.end");
    }

    const leftDuration = args.splitPoint - clip.start;
    const rightDuration = clip.end - args.splitPoint;

    // Insert the right-hand segment first so the original left keeps its start.
    // Strip auto-generated fields (_id, _creationTime) before re-inserting;
    // Convex assigns them on insert.
    const { _id: _dropId, _creationTime: _dropCt, ...clipData } = clip;
    void _dropId;
    void _dropCt;
    const rightId = await ctx.db.insert("clips", {
      ...clipData,
      start: args.splitPoint,
      end: clip.end,
      duration: rightDuration,
    });

    await ctx.db.patch(args.clipId, {
      end: args.splitPoint,
      duration: leftDuration,
    });

    return { leftId: args.clipId, rightId };
  },
});

export const deleteClip = mutation({
  args: { clipId: v.id("clips") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const clip = await ctx.db.get(args.clipId);
    if (!clip) throw new Error("Clip not found");
    const project = await ctx.db.get(clip.projectId);
    if (!project || project.userId !== userId) throw new Error("Forbidden");
    return ctx.db.delete(args.clipId);
  },
});


// ─── Tracks (dynamic layers) ─────────────────────────────────────────────────

// Phase 2C: list all clips belonging to a project so the timeline can sync
// them straight from Convex (no need to round-trip through Zustand).
export const listClipsByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== userId) return [];
    return ctx.db
      .query("clips")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const listTracksForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== userId) return [];
    return ctx.db
      .query("tracks")
      .withIndex("by_project_order", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const addTrack = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    type: v.union(v.literal("video"), v.literal("audio"), v.literal("captions"), v.literal("fx")),
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== userId) throw new Error("Forbidden");

    // Auto-place at the bottom by default (highest order).
    let order = args.order;
    if (order === undefined) {
      const existing = await ctx.db
        .query("tracks")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect();
      order = existing.length > 0 ? Math.max(...existing.map((t) => t.order)) + 1 : 0;
    }

    await ctx.db.patch(args.projectId, { updatedAt: Date.now() });
    return ctx.db.insert("tracks", {
      projectId: args.projectId,
      name: args.name,
      type: args.type,
      order,
      muted: false,
      locked: false,
    });
  },
});

export const deleteTrack = mutation({
  args: { trackId: v.id("tracks") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const track = await ctx.db.get(args.trackId);
    if (!track) throw new Error("Track not found");
    const project = await ctx.db.get(track.projectId);
    if (!project || project.userId !== userId) throw new Error("Forbidden");

    // Promote any orphan clips back to "untracked" (trackId = undefined) so the
    // timeline doesn't lose them. We don't auto-delete.
    const orphans = await ctx.db
      .query("clips")
      .withIndex("by_project", (q) => q.eq("projectId", track.projectId))
      .collect();
    await Promise.all(
      orphans
        .filter((c) => c.trackId === args.trackId)
        .map((c) => ctx.db.patch(c._id, { trackId: undefined })),
    );

    return ctx.db.delete(args.trackId);
  },
});

export const updateTrack = mutation({
  args: {
    trackId: v.id("tracks"),
    name: v.optional(v.string()),
    muted: v.optional(v.boolean()),
    locked: v.optional(v.boolean()),
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const track = await ctx.db.get(args.trackId);
    if (!track) throw new Error("Track not found");
    const project = await ctx.db.get(track.projectId);
    if (!project || project.userId !== userId) throw new Error("Forbidden");
    const { trackId, ...updates } = args;
    return ctx.db.patch(trackId, updates);
  },
});

// ─── Captions ─────────────────────────────────────────────────────────────────

export const addCaption = mutation({
  args: {
    projectId: v.id("projects"),
    startTime: v.number(),
    endTime: v.number(),
    text: v.string(),
    fontSize: v.number(),
    color: v.string(),
    backgroundColor: v.string(),
    position: v.union(v.literal("top"), v.literal("middle"), v.literal("bottom")),
    order: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== userId) throw new Error("Not found");
    await ctx.db.patch(args.projectId, { updatedAt: Date.now() });
    return ctx.db.insert("captions", { ...args, projectId: args.projectId });
  },
});

export const updateCaption = mutation({
  args: {
    captionId: v.id("captions"),
    text: v.optional(v.string()),
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),
    fontSize: v.optional(v.number()),
    color: v.optional(v.string()),
    backgroundColor: v.optional(v.string()),
    position: v.optional(v.union(v.literal("top"), v.literal("middle"), v.literal("bottom"))),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const { captionId, ...updates } = args;
    return ctx.db.patch(captionId, updates);
  },
});

export const deleteCaption = mutation({
  args: { captionId: v.id("captions") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    return ctx.db.delete(args.captionId);
  },
});

// ─── Audio Tracks ─────────────────────────────────────────────────────────────

export const addAudioTrack = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    source: v.string(),
    volume: v.number(),
    muted: v.boolean(),
    startTime: v.number(),
    duration: v.number(),
    order: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== userId) throw new Error("Not found");
    await ctx.db.patch(args.projectId, { updatedAt: Date.now() });
    return ctx.db.insert("audioTracks", { ...args, projectId: args.projectId });
  },
});

export const updateAudioTrack = mutation({
  args: {
    trackId: v.id("audioTracks"),
    volume: v.optional(v.number()),
    muted: v.optional(v.boolean()),
    startTime: v.optional(v.number()),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const { trackId, ...updates } = args;
    return ctx.db.patch(trackId, updates);
  },
});

export const deleteAudioTrack = mutation({
  args: { trackId: v.id("audioTracks") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    return ctx.db.delete(args.trackId);
  },
});
