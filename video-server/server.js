import express from "express";
import cors from "cors";
import morgan from "morgan";
import { execSync, execFile } from "child_process";
import { promisify } from "util";
import { createWriteStream, existsSync, mkdirSync, readFileSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";

const __dirname = dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);

const app = express();
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.VIDEO_SERVER_KEY || "clipforge-dev-key";

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(morgan("short"));
app.use(express.json({ limit: "50mb" }));

// API key verification
app.use((req, res, next) => {
  if (req.path === "/health") return next();
  const key = req.headers["x-api-key"];
  if (key !== API_KEY) {
    return res.status(401).json({ error: "Unauthorized - invalid x-api-key" });
  }
  next();
});

// ─── Helper: verify yt-dlp is available ──────────────────────────────────────
try {
  execSync("which yt-dlp || echo 'not found'", { encoding: "utf8" });
  console.log("[✓] yt-dlp available");
} catch {
  console.log("[!] yt-dlp not found. Install: pip install yt-dlp");
}

try {
  execSync("which ffmpeg || echo 'not found'", { encoding: "utf8" });
  console.log("[✓] FFmpeg available");
} catch {
  console.log("[!] FFmpeg not found. Install: apt install ffmpeg");
}

// ─── FFmpeg Micro integration ────────────────────────────────────────────────
// When FFMPEG_MICRO_KEY is set, heavy encoding tasks are delegated to the cloud
// FFmpeg Micro service instead of running locally, reducing video-server load.
const FFMPEG_MICRO_KEY = process.env.FFMPEG_MICRO_KEY || "";
const MICRO_BASE = "https://api.ffmpeg-micro.com/v1";

/**
 * Get a presigned upload URL from FFmpeg Micro.
 * The caller then does a direct PUT upload to the returned URL.
 */
async function ffmpegMicroPresignedUrl(filename, contentType, fileSize) {
  if (!FFMPEG_MICRO_KEY) return null;
  const res = await fetch(`${MICRO_BASE}/upload/presigned-url`, {
    method: "POST",
    headers: { Authorization: `Bearer ${FFMPEG_MICRO_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ filename, contentType, fileSize }),
  });
  if (!res.ok) {
    console.error(`[FFmpegMicro] presigned-url error ${res.status}`);
    return null;
  }
  return await res.json();
}

/**
 * Confirm a file is uploaded, then create and wait for a transcode job.
 * Returns the download URL on success.
 */
async function ffmpegMicroTranscode(fileId, opts = {}) {
  if (!FFMPEG_MICRO_KEY) throw new Error("FFMPEG_MICRO_KEY not set");

  // Confirm upload
  await fetch(`${MICRO_BASE}/upload/confirm`, {
    method: "POST",
    headers: { Authorization: `Bearer ${FFMPEG_MICRO_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fileId }),
  }).catch(() => {});

  // Create transcode job
  const body = { fileId };
  if (opts.outputFormat) body.outputFormat = opts.outputFormat;
  if (opts.quality) body.quality = opts.quality;
  if (opts.resolution) body.resolution = opts.resolution;
  if (opts.options) body.options = opts.options;

  const tRes = await fetch(`${MICRO_BASE}/transcodes`, {
    method: "POST",
    headers: { Authorization: `Bearer ${FFMPEG_MICRO_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!tRes.ok) throw new Error(`Transcode create error ${tRes.status}: ${await tRes.text()}`);
  const tData = await tRes.json();
  if (!tData.id) throw new Error("No transcode ID returned");

  // Poll for completion (up to 180s)
  const maxPolls = 90;
  for (let i = 0; i < maxPolls; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const pRes = await fetch(`${MICRO_BASE}/transcodes/${tData.id}`, {
      headers: { Authorization: `Bearer ${FFMPEG_MICRO_KEY}` },
    });
    if (!pRes.ok) continue;
    const pData = await pRes.json();
    if (pData.status === "completed") {
      const dRes = await fetch(`${MICRO_BASE}/transcodes/${tData.id}/download`, {
        headers: { Authorization: `Bearer ${FFMPEG_MICRO_KEY}` },
      });
      const dData = dRes.ok ? await dRes.json() : {};
      return { filepath: dData.downloadUrl || dData.url, duration: pData.duration, filesize: pData.filesize };
    }
    if (pData.status === "failed") {
      throw new Error(`Transcode failed: ${pData.error || "Unknown"}`);
    }
  }
  throw new Error("Transcode timed out after 180s");
}

// ─── Health Check ────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: Date.now(),
    tools: {
      ytDlp: execSync("which yt-dlp", { encoding: "utf8" }).trim() || null,
      ffmpeg: execSync("which ffmpeg", { encoding: "utf8" }).trim() || null,
    },
  });
});

// ─── Download video via yt-dlp ───────────────────────────────────────────────
app.post("/api/download", async (req, res) => {
  const { url, outputDir = "downloads" } = req.body;

  if (!url) return res.status(400).json({ error: "url required" });

  const jobId = uuidv4().slice(0, 8);
  const outputPath = join(__dirname, outputDir, jobId);
  mkdirSync(outputPath, { recursive: true });

  try {
    console.log(`[${jobId}] Downloading: ${url.slice(0, 60)}...`);

    // Get video info first
    const infoRaw = execSync(
      `yt-dlp --dump-json --no-playlist --flat-playlist "${url}" 2>/dev/null | head -1`,
      { encoding: "utf8", timeout: 15000 },
    );
    const info = JSON.parse(infoRaw);
    const ext = info.ext || "mp4";

    // Download best video+audio
    const outputTemplate = join(outputPath, `video.%(ext)s`);
    execSync(
      `yt-dlp -f "bv*+ba/b" --merge-output-format mp4 -o "${outputTemplate}" --no-playlist "${url}" 2>&1`,
      { encoding: "utf8", timeout: 300000 },
    );

    // Find the output file
    const fs = await import("fs");
    const files = fs.readdirSync(outputPath);
    const videoFile = files.find((f) => f.endsWith(".mp4") || f.endsWith(".mkv")) || files[0];
    const filePath = join(outputPath, videoFile);
    const stats = fs.statSync(filePath);

    // Get duration via ffprobe
    let duration = info.duration || 0;
    try {
      const { stdout } = await execFileAsync("ffprobe", [
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "csv=p=0",
        filePath,
      ]);
      duration = Math.round(parseFloat(stdout.trim()));
    } catch {}

    console.log(`[${jobId}] ✓ Downloaded: ${videoFile} (${duration}s, ${(stats.size / 1024 / 1024).toFixed(1)}MB)`);

    res.json({
      success: true,
      jobId,
      filename: videoFile,
      filepath: filePath,
      duration,
      filesize: stats.size,
      format: "mp4",
      resolution: `${info.width || 1920}x${info.height || 1080}`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Download failed";
    console.error(`[${jobId}] ✗ Error: ${msg}`);
    // Cleanup
    try { const fs = await import("fs"); fs.rmSync(outputPath, { recursive: true, force: true }); } catch {}
    res.status(500).json({ error: msg, jobId });
  }
});

// ─── Trim video with FFmpeg ──────────────────────────────────────────────────
app.post("/api/trim", async (req, res) => {
  const { filepath, startTime, endTime, outputPath } = req.body;
  if (!filepath || startTime === undefined) {
    return res.status(400).json({ error: "filepath and startTime required" });
  }

  const output = outputPath || filepath.replace(".mp4", `_trimmed_${uuidv4().slice(0, 6)}.mp4`);

  try {
    const args = ["-i", filepath];
    if (startTime) args.push("-ss", String(startTime));
    if (endTime) args.push("-to", String(endTime));
    args.push("-c", "copy", "-y", output);

    await execFileAsync("ffmpeg", args, { timeout: 120000 });
    const fs = await import("fs");
    const stats = fs.statSync(output);

    res.json({
      success: true,
      filepath: output,
      filesize: stats.size,
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Trim failed" });
  }
});

// ─── Apply effects (vignette, grain, zoom-pan) ───────────────────────────────
app.post("/api/apply-effects", async (req, res) => {
  const { filepath, effects = [] } = req.body;
  if (!filepath) return res.status(400).json({ error: "filepath required" });

  const output = filepath.replace(".mp4", `_fx_${uuidv4().slice(0, 6)}.mp4`);

  try {
    let filter = "";
    for (const effect of effects) {
      switch (effect.type) {
        case "vignette":
          filter += `,drawbox=x=0:y=0:w=iw:h=ih:color=black@${effect.intensity || 0.3}:t=${Math.round((effect.intensity || 0.3) * 10)}`;
          break;
        case "grain":
          filter += `,noise=alls=${effect.intensity || 2}:allf=t+u`;
          break;
        case "warm_color":
          filter += `,colorbalance=rs=0.1:gs=-0.05:bs=-0.1`;
          break;
        case "glitch":
          // Digital glitch: noise overlay + crop jitter (horizontal shift) + pad back
          // noise=alls=N creates static/snow; crop shifts frame left; pad restores size
          const j = Math.round(effect.frameJitter || 2);
          const n = Math.round(effect.intensity || 15);
          filter += `,noise=alls=${n}:allf=t+u,crop=iw-${j}:ih:${j}:0,pad=iw+${j}:ih:0:0:black`;
          break;
        case "vhs":
          // VHS tape: scanlines (drawgrid) + noise + color bleed + vignette
          filter += `,drawgrid=w=iw:h=2:t=1:c=black@0.25,noise=alls=4:allf=t+v,eq=contrast=1.05:brightness=0.02,vignette=PI/4`;
          break;
        default:
          break;
      }
    }

    const args = ["-i", filepath, "-vf", filter.slice(1) || "copy", "-c:a", "copy", "-y", output];
    await execFileAsync("ffmpeg", args, { timeout: 180000 });

    res.json({ success: true, filepath: output });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Effects failed" });
  }
});

// ─── Extract audio ───────────────────────────────────────────────────────────
app.post("/api/extract-audio", async (req, res) => {
  const { filepath, format = "wav" } = req.body;
  if (!filepath) return res.status(400).json({ error: "filepath required" });

  const output = filepath.replace(/\.\w+$/, `_audio.${format}`);

  try {
    await execFileAsync("ffmpeg", ["-i", filepath, "-vn", "-acodec", format === "wav" ? "pcm_s16le" : "libmp3lame", "-ar", "44100", "-y", output], { timeout: 60000 });
    res.json({ success: true, filepath: output });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Extract audio failed" });
  }
});

// ─── Helper: upload a local file to FFmpeg Micro via presigned URL ───────────
async function uploadFileToMicro(localPath, filename) {
  const fs = await import("fs");
  const stats = fs.statSync(localPath);

  const presigned = await ffmpegMicroPresignedUrl(filename, "video/mp4", stats.size);
  if (!presigned || !presigned.uploadUrl) {
    throw new Error("Failed to get FFmpeg Micro presigned URL");
  }

  // Stream the file to avoid OOM on large videos (100MB+)
  const fileStream = fs.createReadStream(localPath);
  const uploadRes = await fetch(presigned.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4" },
    body: fileStream,
  });
  if (!uploadRes.ok) throw new Error(`FFmpeg Micro upload failed: ${await uploadRes.text()}`);

  return presigned.fileId || presigned.id || "";
}

// ─── Helper: decide if a render should use FFmpeg Micro ─────────────────────
// "Large" project: ≥3 clips, OR has effects/captions/audio mixing
function shouldUseMicro(clips, audioTracks) {
  if (!FFMPEG_MICRO_KEY) return false;
  if (clips.length >= 3) return true;
  const hasEffects = clips.some((c) => c.effects?.zoomPan || c.effects?.filmGrain || c.effects?.vignette || (c.effects?.colorGrading && c.effects.colorGrading !== "none"));
  const hasCaptions = clips.some((c) => c.captions && c.captions.length > 0);
  const hasAudioMix = audioTracks.some((t) => !t.muted && t.filepath);
  return hasEffects || hasCaptions || hasAudioMix;
}

// ─── Render full timeline ───────────────────────────────────────────────────
// When FFMPEG_MICRO_KEY is set AND the project qualifies as "large",
// heavy encoding (caption burn + audio mix + final encode) is delegated to
// FFmpeg Micro cloud. Local FFmpeg still handles clip trimming (needs disk I/O).
app.post("/api/render", async (req, res) => {
  const {
    clips = [],
    audioTracks = [],
    aspectRatio = "9:16",
    resolution = "1080p",
    outputDir = "renders",
  } = req.body;

  if (!clips.length) return res.status(400).json({ error: "At least one clip required" });

  const jobId = uuidv4().slice(0, 8);
  const workDir = join(__dirname, outputDir, jobId);
  mkdirSync(workDir, { recursive: true });
  const finalOutput = join(workDir, "final.mp4");
  const fs = await import("fs");
  const useMicro = shouldUseMicro(clips, audioTracks);

  // Determine target dimensions
  const dims = {
    "9:16": { w: 1080, h: 1920 },
    "16:9": { w: 1920, h: 1080 },
    "1:1": { w: 1080, h: 1080 },
  };
  const scaleFactor = resolution === "720p" ? 0.5 : 1;
  const target = dims[aspectRatio] || dims["9:16"];
  const targetW = Math.round(target.w * scaleFactor);
  const targetH = Math.round(target.h * scaleFactor);

  try {
    console.log(`[${jobId}] Starting render: ${clips.length} clips, ${aspectRatio}, ${resolution}${useMicro ? " [cloud]" : " [local]"}`);

    // ── Stage 1: Process each clip individually ──────────────────────────
    // Trim to [start, end], scale to target, apply effects, normalize audio
    const processedFiles: string[] = [];
    let cumulativeDuration = 0;

    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const clipId = `clip_${i + 1}`;
      const clipOutput = join(workDir, `${clipId}.mp4`);
      const trimDuration = clip.end - clip.start;

      if (!fs.existsSync(clip.filepath)) {
        throw new Error(`Clip ${i + 1} file not found: ${clip.filepath}`);
      }

      console.log(`[${jobId}] Processing clip ${i + 1}/${clips.length}: ${clip.name || `Clip ${i + 1}`}`);

      // Build filter complex for this clip
      // Scale to fill target, crop to aspect ratio, pad if needed
      const scaleFilter = `scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2`;

      // Apply zoom pan (Ken Burns effect — slow zoom in)
      let zoomFilter = "";
      if (clip.effects?.zoomPan && trimDuration > 0) {
        zoomFilter = `,zoompan=z='if(lte(on,1),1,${trimDuration > 3 ? 1.03 : 1.01})':d=${Math.round(trimDuration * 30)}:s=${targetW}x${targetH}`;
      }

      // Apply color grading
      let colorFilter = "";
      const grade = clip.effects?.colorGrading || "none";
      if (grade === "warm") {
        colorFilter = `,colorbalance=rs=0.08:gs=-0.03:bs=-0.06`;
      } else if (grade === "cool") {
        colorFilter = `,colorbalance=rs=-0.06:gs=-0.02:bs=0.1`;
      } else if (grade === "vintage") {
        colorFilter = `,curves=vintage,colorbalance=rs=0.05:gs=0:bs=-0.05`;
      }

      // Apply film grain
      let grainFilter = "";
      if (clip.effects?.filmGrain) {
        grainFilter = `,noise=alls=3:allf=t+u`;
      }

      // Apply vignette
      let vignetteFilter = "";
      if (clip.effects?.vignette) {
        vignetteFilter = `,vignette=PI/4`;
      }

      const videoFilter = `${scaleFilter}${colorFilter}${grainFilter}${vignetteFilter}${zoomFilter}`;

      // Trim, scale, apply effects, normalize volume
      const ffmpegArgs = [
        "-ss", String(clip.start),
        "-i", clip.filepath,
        "-to", String(trimDuration),
        "-vf", videoFilter,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "22",
        "-c:a", "aac",
        "-b:a", "128k",
        "-af", `volume=${clip.volume || 1}`,
        "-y", clipOutput,
      ];

      await execFileAsync("ffmpeg", ffmpegArgs, { timeout: 600000 });
      processedFiles.push(clipOutput);

      // Accrue cumulative duration for caption offsetting
      clip._cumulativeStart = cumulativeDuration;
      cumulativeDuration += trimDuration;
    }

    // ── Stage 2: Concatenate all processed clips ─────────────────────────
    console.log(`[${jobId}] Concatenating ${processedFiles.length} clips...`);

    const concatFile = join(workDir, "concat.txt");
    const concatContent = processedFiles.map((f) => `file '${f}'`).join("\n");
    fs.writeFileSync(concatFile, concatContent, "utf8");

    const concatOutput = join(workDir, "concatenated.mp4");
    await execFileAsync("ffmpeg", [
      "-f", "concat",
      "-safe", "0",
      "-i", concatFile,
      "-c", "copy",
      "-y", concatOutput,
    ], { timeout: 300000 });

    // ═══ CLOUD PATH: if FFmpeg Micro is configured, offload remaining stages ═══
    // Build caption filter list here so cloud path can use it (same logic as local Stage 3)
    const nonMutedAudio = audioTracks.filter((t) => !t.muted && t.filepath);
    const cloudCaptionFilters = [];
    for (const clip of clips) {
      const clipOffset = clip._cumulativeStart || 0;
      for (const cap of clip.captions || []) {
        const capStart = clipOffset + cap.start;
        const capEnd = clipOffset + cap.end;
        const text = (cap.text || "")
          .replace(/'/g, "’")
          .replace(/:/g, "\\:")
          .replace(/'/g, "\\'")
          .replace(/\\/g, "\\\\");
        cloudCaptionFilters.push(
          `drawtext=text='${text}':fontsize=${Math.round(targetH * 0.04)}:fontcolor=white:box=1:boxcolor=black@0.5:boxborderw=8:x=(w-text_w)/2:y=h-text_h-80:enable='between(t,${capStart},${capEnd})'`
        );
      }
    }

    if (useMicro) {
      console.log(`[${jobId}] Delegating caption burn + audio mix + final encode to FFmpeg Micro...`);
      try {
        // Upload concatenated file to FFmpeg Micro
        const fileId = await uploadFileToMicro(concatOutput, `concat_${jobId}.mp4`);
        if (!fileId) throw new Error("Failed to upload to FFmpeg Micro");

        // Build advanced FFmpeg options: captions + audio mix + final encode
        // NOTE: per-clip effects (zoom, color, grain, vignette) were already baked
        // into each clip in Stage 1, so we do NOT re-apply them here.
        const advancedOptions = [];
        if (cloudCaptionFilters.length > 0) {
          advancedOptions.push("-vf", cloudCaptionFilters.join(","));
        }
        if (nonMutedAudio.length > 0) {
          const amixParts = nonMutedAudio.map((t) => `volume=${t.volume || 1}`);
          advancedOptions.push("-af", `volume=1,${amixParts.join(",")}`);
        }
        advancedOptions.push("-c:v", "libx264", "-preset", "fast", "-crf", "22");
        advancedOptions.push("-c:a", "aac", "-b:a", "128k");

        // Create transcode job on FFmpeg Micro
        const transcodeResult = await ffmpegMicroTranscode(fileId, {
          outputFormat: "mp4",
          quality: "high",
          resolution: resolution,
          options: advancedOptions,
        });

        if (!transcodeResult || !transcodeResult.filepath) {
          throw new Error("FFmpeg Micro transcode returned no download URL");
        }

        console.log(`[${jobId}] ✓ Cloud render complete: ${transcodeResult.filepath}`);
        res.json({
          success: true,
          jobId,
          filepath: transcodeResult.filepath,
          duration: cumulativeDuration,
          filesize: transcodeResult.filesize || 0,
          format: "mp4",
          resolution: `${targetW}x${targetH}`,
          aspectRatio,
          clipsProcessed: clips.length,
          renderedBy: "ffmpeg-micro",
        });
        return;
      } catch (microError) {
        console.log(`[${jobId}] FFmpeg Micro failed (${microError.message}), falling back to local FFmpeg...`);
        // Fall through to local FFmpeg processing below
      }
    }

    // ── Stage 3: Burn captions ───────────────────────────────────────────
    // Collect all captions with global timeline offsets
    let captionsOutput = concatOutput;
    let hasCaptions = false;
    const captionFilters: string[] = [];

    for (const clip of clips) {
      const clipOffset = clip._cumulativeStart || 0;
      for (const cap of clip.captions || []) {
        hasCaptions = true;
        const capStart = clipOffset + cap.start;
        const capEnd = clipOffset + cap.end;
        // Escape special chars for drawtext
        const text = (cap.text || "")
          .replace(/'/g, "’")
          .replace(/:/g, "\\:")
          .replace(/'/g, "\\'")
          .replace(/\\/g, "\\\\");

        captionFilters.push(
          `drawtext=text='${text}':` +
          `fontsize=${Math.round(targetH * 0.04)}:` +
          `fontcolor=white:` +
          `box=1:boxcolor=black@0.5:boxborderw=8:` +
          `x=(w-text_w)/2:y=h-text_h-80:` +
          `enable='between(t,${capStart},${capEnd})'`
        );
      }
    }

    if (hasCaptions) {
      console.log(`[${jobId}] Burning ${captionFilters.length} captions...`);
      const captionedOutput = join(workDir, "captioned.mp4");
      await execFileAsync("ffmpeg", [
        "-i", concatOutput,
        "-vf", captionFilters.join(","),
        "-c:a", "copy",
        "-y", captionedOutput,
      ], { timeout: 300000 });
      captionsOutput = captionedOutput;
    }

    // ── Stage 4: Mix audio tracks ─────────────────────────────────────────
    // nonMutedAudio was already declared before the cloud path block
    let finalInput = captionsOutput;

    if (nonMutedAudio.length > 0) {
      console.log(`[${jobId}] Mixing ${nonMutedAudio.length} audio tracks...`);

      // Build amix inputs: original video audio + each external track
      const amixInputs = ["-i", captionsOutput];
      const inputs = [];

      // Original audio at volume 1
      inputs.push("[0:a]volume=1[a0]");

      for (let i = 0; i < nonMutedAudio.length; i++) {
        const track = nonMutedAudio[i];
        const idx = i + 1;
        amixInputs.push("-i", track.filepath);
        // For audio that starts at a specific point, use adelay
        if (track.startTime && track.startTime > 0) {
          inputs.push(`[${idx}:a]adelay=${track.startTime * 1000}|${track.startTime * 1000},volume=${track.volume || 1}[a${idx}]`);
        } else {
          inputs.push(`[${idx}:a]volume=${track.volume || 1}[a${idx}]`);
        }
      }

      const allInputLabels = inputs.map((_, i) => `[a${i}]`).join("");
      const amixOutput = join(workDir, "mixed.mp4");

      await execFileAsync("ffmpeg", [
        ...amixInputs,
        "-filter_complex", `${inputs.join(";")};${allInputLabels}amix=inputs=${inputs.length}:duration=first:dropout_transition=2[aout]`,
        "-map", "[aout]",
        "-map", "0:v",
        "-c:v", "copy",
        "-y", amixOutput,
      ], { timeout: 300000 });

      finalInput = amixOutput;
    }

    // ── Stage 5: Copy to final output ───────────────────────────────────
    if (finalInput !== finalOutput) {
      fs.copyFileSync(finalInput, finalOutput);
    }

    // Get final file stats
    const stats = fs.statSync(finalOutput);

    console.log(`[${jobId}] ✓ Render complete: ${(stats.size / 1024 / 1024).toFixed(1)}MB, ${cumulativeDuration}s`);

    res.json({
      success: true,
      jobId,
      filepath: finalOutput,
      duration: cumulativeDuration,
      filesize: stats.size,
      format: "mp4",
      resolution: `${targetW}x${targetH}`,
      aspectRatio,
      clipsProcessed: clips.length,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Render failed";
    console.error(`[${jobId}] ✗ Error: ${msg}`);
    // Cleanup on failure
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
    res.status(500).json({ error: msg, jobId });
  }
});

// ─── Get file info (metadata) ───────────────────────────────────────────────
app.get("/api/info", async (req, res) => {
  const { filepath } = req.query;
  if (!filepath) return res.status(400).json({ error: "filepath required" });

  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration,size,bit_rate,format_name",
      "-of", "json",
      String(filepath),
    ]);
    res.json({ success: true, ...JSON.parse(stdout) });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Info failed" });
  }
});

// ─── FFprobe metadata extraction (POST) for uploadFileProcessor ──────────────
//     يستخرج duration + resolution + framerate + codec + bitrate في أقل من 0.5 ثانية
app.post("/api/probe", async (req, res) => {
  const { filepath } = req.body;
  if (!filepath) return res.status(400).json({ error: "filepath required" });

  try {
    const fs = await import("fs");
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: "file not found" });
    }

    // Run ffprobe with all-metadata extraction
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error",
      "-print_format", "json",
      "-show_format",
      "-show_streams",
      filepath,
    ]);

    const probe = JSON.parse(stdout);
    const videoStream = (probe.streams || []).find((s) => s.codec_type === "video");
    const format = probe.format || {};

    res.json({
      success: true,
      duration: Math.round(parseFloat(format.duration || "0")),
      filesize: parseInt(format.size || "0", 10),
      resolution: videoStream
        ? `${videoStream.width || 1920}x${videoStream.height || 1080}`
        : "unknown",
      framerate: videoStream
        ? parseFloat(videoStream.r_frame_rate || "30").toFixed(2)
        : 0,
      codec: videoStream?.codec_name || "unknown",
      bitrate: parseInt(format.bit_rate || "0", 10),
      format: format.format_name || "unknown",
      probed_at: Date.now(),
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Probe failed" });
  }
});

// ─── Probe URL metadata via yt-dlp (no download) ──────────────────────────────
//     SECURITY: استخدام execFile مع array args يحقن الـ url عبر argv ولا يدخل shell
app.post("/api/probe-url", async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== "string") return res.status(400).json({ error: "url string required" });

  try {
    // ✅ Shell-safe: url يُمرَّر كـ argv[] (لا shell interpolation)
    const { stdout } = await execFileAsync("yt-dlp", [
      "--dump-json", "--no-playlist", "--flat-playlist", "--skip-download", url,
    ], { timeout: 15000 });
    const info = JSON.parse(stdout.split("\n").filter(Boolean)[0] || "{}");

    res.json({
      success: true,
      title: info.title || "Unknown",
      duration: Math.round(info.duration || 0),
      filesize: info.filesize_approx || info.filesize || 0,
      resolution: `${info.width || 1920}x${info.height || 1080}`,
      framerate: info.fps || 30,
      format: info.ext || "mp4",
      uploader: info.uploader || info.channel || "Unknown",
      webpage_url: info.webpage_url || url,
      thumbnail: info.thumbnail || null,
      probed_at: Date.now(),
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "URL probe failed" });
  }
});

// ─── Alternative: yt-dlp --dump-single-json for richer metadata ──────────────────
app.post("/api/download-info", async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== "string") return res.status(400).json({ error: "url string required" });

  try {
    // ✅ Shell-safe: url كـ argv[]
    const { stdout } = await execFileAsync("yt-dlp", [
      "--dump-single-json", "--no-playlist", "--skip-download", url,
    ], { timeout: 15000 });
    const info = JSON.parse(stdout);

    res.json({
      success: true,
      title: info.title || "Unknown",
      duration: Math.round(info.duration || 0),
      filesize: info.filesize_approx || info.filesize || 0,
      resolution: `${info.width || 1920}x${info.height || 1080}`,
      framerate: info.fps || 30,
      format: info.ext || "mp4",
      uploader: info.uploader || info.channel || "Unknown",
      webpage_url: info.webpage_url || url,
      thumbnail: info.thumbnail || null,
      probed_at: Date.now(),
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "download-info failed" });
  }
});

// ─── Start server ────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  🎬 ClipForge Video Server`);
  console.log(`  ────────────────────────`);
  console.log(`  Port:     ${PORT}`);
  console.log(`  yt-dlp:   ${execSync("which yt-dlp 2>/dev/null && echo '✓' || echo '✗'", { encoding: "utf8" }).trim()}`);
  console.log(`  FFmpeg:   ${execSync("which ffmpeg 2>/dev/null && echo '✓' || echo '✗'", { encoding: "utf8" }).trim()}`);
  console.log(`\n  Endpoints:`);
  console.log(`  POST /api/download     — yt-dlp download`);
  console.log(`  POST /api/trim         — FFmpeg trim`);
  console.log(`  POST /api/apply-effects — FFmpeg effects`);
  console.log(`  POST /api/extract-audio — Audio extraction`);
  console.log(`  POST /api/render       — Full timeline render`);
  console.log(`  GET  /api/info         — Media metadata`);
  console.log(`  POST /api/probe        — FFprobe full metadata (for upload)`);
  console.log(`  POST /api/probe-url    — yt-dlp --dump-json (yt-dlp metadata)`);
  console.log(`  POST /api/download-info — yt-dlp --dump-single-json`);
  console.log(`  GET  /health           — Health check\n`);
});
