// ─── src/convex/ffmpegMicro.ts ─────────────────────────────────────────────────
// FFmpeg Micro API wrapper.
// Heavy rendering (transcode, effects, probe) is offloaded here to reduce load on
// the video-server (Railway). Light tasks (yt-dlp, stream-copy trim) stay on the
// video-server.
//
// Flow: upload file → create transcode job → poll until done → return download URL
//
// Authentication: Bearer token via FFMPEG_MICRO_KEY (stored in user settings or
// process.env.FFMPEG_MICRO_KEY).

import { v } from "convex/values";
import { action, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { api, internal } from "./_generated/api";

const MICRO_BASE = "https://api.ffmpeg-micro.com/v1";

// ─── Helper: resolve FFmpeg Micro key ─────────────────────────────────────────
async function getMicroKey(ctx: any): Promise<string> {
  const userId = await getAuthUserId(ctx);
  const envKey = process.env.FFMPEG_MICRO_KEY;
  if (envKey) return envKey;
  if (!userId) throw new Error("FFMPEG_MICRO_KEY not configured");
  const keys: Record<string, string> =
    (await ctx.runQuery(internal.users.getApiKeysForUser_Internal, { userId })) || {};
  return keys["FFMPEG_MICRO_KEY"] || (() => { throw new Error("FFMPEG_MICRO_KEY not configured. Add it in Settings."); })();
}

function headers(key: string) {
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

// ─── Step 1: Get presigned upload URL ──────────────────────────────────────────
export const getPresignedUrl = action({
  args: { filename: v.string(), contentType: v.string(), fileSize: v.number() },
  handler: async (ctx, args) => {
    const key = await getMicroKey(ctx);
    const res = await fetch(`${MICRO_BASE}/upload/presigned-url`, {
      method: "POST",
      headers: headers(key),
      body: JSON.stringify({ filename: args.filename, contentType: args.contentType, fileSize: args.fileSize }),
    });
    if (!res.ok) throw new Error(`presigned-url error ${res.status}: ${await res.text()}`);
    return await res.json(); // { uploadUrl, fileId }
  },
});

// ─── Step 2: Confirm upload ────────────────────────────────────────────────────
export const confirmUpload = action({
  args: { fileId: v.string() },
  handler: async (ctx, args) => {
    const key = await getMicroKey(ctx);
    const res = await fetch(`${MICRO_BASE}/upload/confirm`, {
      method: "POST",
      headers: headers(key),
      body: JSON.stringify({ fileId: args.fileId }),
    });
    if (!res.ok) throw new Error(`confirm error ${res.status}: ${await res.text()}`);
    return await res.json();
  },
});

// ─── Step 3: Create transcode job (simple mode) ───────────────────────────────
export const createTranscode = action({
  args: {
    fileId: v.string(),
    outputFormat: v.optional(v.string()),
    quality: v.optional(v.string()),
    resolution: v.optional(v.string()),
    options: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const key = await getMicroKey(ctx);
    const body: Record<string, any> = { fileId: args.fileId };
    if (args.outputFormat) body.outputFormat = args.outputFormat;
    if (args.quality) body.quality = args.quality;
    if (args.resolution) body.resolution = args.resolution;
    if (args.options) body.options = args.options;

    const res = await fetch(`${MICRO_BASE}/transcodes`, {
      method: "POST",
      headers: headers(key),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`transcode error ${res.status}: ${await res.text()}`);
    return await res.json(); // { id, status }
  },
});

// ─── Step 4: Poll transcode job until complete ────────────────────────────────
export const waitForTranscode = action({
  args: { transcodeId: v.string(), maxPollSeconds: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const key = await getMicroKey(ctx);
    const maxPolls = (args.maxPollSeconds ?? 120) / 2;
    for (let i = 0; i < maxPolls; i++) {
      const res = await fetch(`${MICRO_BASE}/transcodes/${args.transcodeId}`, {
        headers: headers(key),
      });
      if (!res.ok) throw new Error(`poll error ${res.status}: ${await res.text()}`);
      const data = await res.json();
      if (data.status === "completed") {
        // Get download URL
        const dlRes = await fetch(`${MICRO_BASE}/transcodes/${args.transcodeId}/download`, {
          headers: headers(key),
        });
        if (!dlRes.ok) throw new Error(`download-url error ${dlRes.status}`);
        const dlData = await dlRes.json();
        return { ...data, downloadUrl: dlData.downloadUrl || dlData.url };
      }
      if (data.status === "failed") {
        return { ...data, status: "failed", error: data.error || "Transcode failed" };
      }
      // Wait 2s before next poll
      await new Promise((r) => setTimeout(r, 2000));
    }
    return { status: "timeout", error: `Did not complete within ${args.maxPollSeconds ?? 120}s` };
  },
});

// ─── Full pipeline: presignedUrl → confirm → transcode → poll ────────────────
//     The FILE UPLOAD step (PUT to presignedUrl) must be done by the CALLER
//     (video-server or browser) because Convex actions have ~50MB memory limits.
//     This action handles the control-plane: confirm, createJob, poll.

export const uploadAndTranscode = action({
  args: {
    fileId: v.string(),
    outputFormat: v.optional(v.string()),
    quality: v.optional(v.string()),
    resolution: v.optional(v.string()),
    options: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const key = await getMicroKey(ctx);

    // 1. Confirm upload
    await ctx.runAction((api as any).ffmpegMicro.confirmUpload, { fileId: args.fileId }).catch(() => {});

    // 2. Create transcode job
    const transcode: any = await ctx.runAction((api as any).ffmpegMicro.createTranscode, {
      fileId: args.fileId,
      outputFormat: args.outputFormat || "mp4",
      quality: args.quality || "high",
      resolution: args.resolution || "1080p",
      options: args.options,
    });

    if (!transcode?.id) throw new Error("Failed to create transcode job");

    // 3. Poll for completion
    const result: any = await ctx.runAction((api as any).ffmpegMicro.waitForTranscode, {
      transcodeId: transcode.id,
      maxPollSeconds: 180,
    });

    return {
      success: result.status === "completed",
      status: result.status,
      downloadUrl: result.downloadUrl || "",
      error: result.error || null,
      transcodeId: transcode.id,
    };
  },
});

// ─── Direct file upload to FFmpeg Micro (for small files hosted at URLs) ────
//     Only use this for SMALL files (<10MB). Larger files should use
//     the video-server proxy which streams directly to the presigned URL.
export const transcodeFromUrl = action({
  args: {
    url: v.string(),
    outputFormat: v.optional(v.string()),
    quality: v.optional(v.string()),
    resolution: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Get presigned URL
    const presigned: any = await ctx.runAction((api as any).ffmpegMicro.getPresignedUrl, {
      filename: `input_${Date.now()}.mp4`,
      contentType: "video/mp4",
      fileSize: 0,
    });
    if (!presigned?.uploadUrl) throw new Error("Failed to get presigned URL");

    const fileId = presigned.fileId || "";

    // Fetch and upload (⚠ memory-limited — use for small files only)
    const downloadRes = await fetch(args.url);
    if (!downloadRes.ok) throw new Error(`Failed to fetch: ${args.url}`);
    const blob = await downloadRes.blob();
    if (blob.size > 10 * 1024 * 1024) {
      throw new Error("File too large for Convex proxy (>10MB). Use video-server endpoint instead.");
    }
    const uploadRes = await fetch(presigned.uploadUrl, {
      method: "PUT",
      body: blob,
    });
    if (!uploadRes.ok) throw new Error(`Upload failed: ${await uploadRes.text()}`);

    // Delegate to uploadAndTranscode
    return await ctx.runAction((api as any).ffmpegMicro.uploadAndTranscode, {
      fileId,
      outputFormat: args.outputFormat,
      quality: args.quality,
      resolution: args.resolution,
    });
  },
});

// ─── Note on probe: use video-server /api/probe (ffprobe) instead ────────────
//     FFmpeg Micro doesn't have a dedicated probe endpoint, and a full transcode
//     round-trip is far more expensive than local ffprobe. Metadata extraction
//     stays on the video-server.
