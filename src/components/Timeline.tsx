import { useRef, useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToParentElement } from "@dnd-kit/modifiers";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAppStore, type TimelineClip } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { debounce } from "@/lib/debounce";
import {
  Scissors,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ZoomIn,
  ZoomOut,
  Plus,
  Trash2,
  Lock,
  Unlock,
  VolumeX,
  Volume2,
} from "lucide-react";

/* ─── Helpers ────────────────────────────────────────────────────────────────── */

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds - Math.floor(seconds)) * 10);
  return `${m}:${String(s).padStart(2, "0")}.${ms}`;
}

/** Snap a value to the nearest grid step. Default 1 second. */
function snap(value: number, step = 1): number {
  return Math.max(0, Math.round(value / step) * step);
}

/* ─── Constants ─────────────────────────────────────────────────────────────── */

const DEFAULT_DEMO_CLIPS: TimelineClip[] = [
  {
    id: "demo-1", type: "video", name: "Intro", url: "#", thumbnail: "🎬",
    start: 0, end: 8, duration: 8,
    effects: { zoomPan: false, colorGrading: "none", vignette: false, filmGrain: false },
    volume: 1, captions: [],
  },
  {
    id: "demo-2", type: "video", name: "Main Take", url: "#", thumbnail: "🎥",
    start: 8, end: 20, duration: 12,
    effects: { zoomPan: true, colorGrading: "warm", vignette: true, filmGrain: false },
    volume: 1, captions: [],
  },
  {
    id: "demo-3", type: "audio", name: "Hook BGM", url: "#",
    start: 20, end: 35, duration: 15,
    effects: { zoomPan: false, colorGrading: "none", vignette: false, filmGrain: false },
    volume: 0.8, captions: [],
  },
];

const TRACK_COLORS: Record<string, string> = {
  video: "#0055FF",
  audio: "#00CC66",
  captions: "#FFE600",
  fx: "#FF6B35",
};

/* ─── Track type ─────────────────────────────────────────────────────────────── */

interface TrackRow {
  _id: Id<"tracks">;
  name: string;
  type: "video" | "audio" | "captions" | "fx";
  order: number;
  muted?: boolean;
  locked?: boolean;
  height?: number;
}

/* ─── Draggable clip cell ────────────────────────────────────────────────────── */

/**
 * One clip cell on the timeline. The drag offset (deltaX) is captured by
 * dnd-kit; on drag end we apply `snap(deltaSeconds) → newStart`, then fire a
 * debounced Convex update so we don't spam the backend mid-gesture.
 */
function ClipCell({
  clip,
  pixelsPerSecond,
  trackTotalDuration,
  selected,
  trackMuted,
  trackLocked,
}: {
  clip: TimelineClip;
  pixelsPerSecond: number;
  trackTotalDuration: number;
  selected: boolean;
  trackMuted: boolean;
  trackLocked: boolean;
}) {
  const { selectClip } = useAppStore();
  const widthPx = Math.max(clip.duration * pixelsPerSecond, 24);
  const leftPx = clip.start * pixelsPerSecond;
  const color = TRACK_COLORS[clip.type] ?? "#888";

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `clip-${clip.id}`,
    disabled: trackLocked,
  });

  // dnd-kit gives us a transient x transform during drag — applied as a
  // visual offset only. The Timeline parent's onDragEnd handler writes the
  // final position to Zustand + Convex.
  const dx = transform?.x ?? 0;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        e.stopPropagation();
        selectClip(clip.id);
      }}
      className={`absolute h-9 border-2 border-black flex items-center px-2 cursor-grab active:cursor-grabbing
        transition-shadow hover:shadow-[2px_2px_0px_#000] group/clip overflow-hidden
        ${selected ? "ring-2 ring-black shadow-[2px_2px_0px_#000]" : ""}
        ${trackMuted || trackLocked ? "opacity-60" : ""}
        ${isDragging ? "opacity-80 z-30 shadow-[4px_4px_0px_#000]" : ""}`}
      style={{
        width: `${widthPx}px`,
        left: `${leftPx + dx}px`,
        backgroundColor: color + "30",
        borderLeft: `4px solid ${color}`,
        top: "50%",
        transform: "translateY(-50%)",
      }}
      data-clip-id={clip.id}
      data-original-start={clip.start}
    >
      {/* Thumbnail preview */}
      {clip.thumbnail && (
        <div
          className="absolute left-0 top-0 bottom-0 w-6 flex items-center justify-center text-[10px] border-r border-black/30"
          style={{ backgroundColor: color + "40" }}
          aria-hidden
        >
          {clip.thumbnail}
        </div>
      )}
      <span className="text-[10px] font-bold text-foreground truncate drop-shadow-sm ml-1">
        {clip.name}
      </span>
      <span className="ml-auto text-[9px] font-mono text-foreground/70 tabular-nums shrink-0">
        {clip.duration.toFixed(1)}s
      </span>
      {/* Resize handles (placeholder for future resize feature) */}
      <div className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-black/30" />
      <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-black/30" />
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────────── */

export default function Timeline() {
  const {
    timelineClips,
    timelineCurrentTime,
    timelinePlaying,
    setTimelineCurrentTime,
    toggleTimelinePlayback,
    currentProjectId,
    selectedClipId,
    updateTimelineClip,
    zoomLevel,
    setZoomLevel,
  } = useAppStore();
  const timelineRef = useRef<HTMLDivElement>(null);

  /* ─── Backend hooks (only when a project is loaded) ─── */
  const backendTracks = useQuery(
    api.projects.listTracksForProject,
    currentProjectId ? { projectId: currentProjectId as Id<"projects"> } : "skip",
  );
  // Phase 2C: pull the project's clips straight from Convex so the timeline
  // mirrors the DB after each mutation refetch.
  const backendClips = useQuery(
    api.projects.listClipsByProject,
    currentProjectId ? { projectId: currentProjectId as Id<"projects"> } : "skip",
  );
  const updateClipMut = useMutation(api.projects.updateClip);
  const splitClipMut = useMutation(api.projects.splitClip);
  const addTrackMut = useMutation(api.projects.addTrack);
  const deleteTrackMut = useMutation(api.projects.deleteTrack);

  /* ─── Tracks ─── */
  // Backend tracks preferred when available; otherwise use local demo tracks.
  const tracks: TrackRow[] = useMemo(() => {
    if (backendTracks && backendTracks.length > 0) {
      const reversed = [...backendTracks].sort((a, b) => b.order - a.order);
      return reversed.map((t) => ({ ...t, height: t.height ?? 56 }));
    }
    // Local fallback so the UI never shows an empty timeline.
    return [
      { _id: "local-fx" as unknown as Id<"tracks">, name: "FX", type: "fx", order: 2, height: 40 },
      { _id: "local-audio" as unknown as Id<"tracks">, name: "Audio", type: "audio", order: 1, height: 56 },
      { _id: "local-video" as unknown as Id<"tracks">, name: "Video", type: "video", order: 0, height: 56 },
    ];
  }, [backendTracks]);

  /* ─── Clips on each track ─── */
  // For each visible track, find clips whose type matches. We support
  // backend-clip mapping later via `trackId`; for now the type→track pairing
  // works for the existing demo data.
  const clipsByTrack = useMemo(() => {
    const displayed = timelineClips.length > 0 ? timelineClips : DEFAULT_DEMO_CLIPS;
    const map: Record<string, TimelineClip[]> = {};
    for (const t of tracks) map[t._id] = [];
    for (const c of displayed) {
      // Prefer explicit trackId mapping if present, else fall back to type.
      const track = tracks.find((t) => t._id === (c as any).trackId) ?? tracks.find((t) => t.type === c.type);
      if (track) map[track._id].push(c);
    }
    return map;
  }, [tracks, timelineClips]);

  /* ─── Total project duration ─── */
  const totalDuration = Math.max(
    (timelineClips.length > 0 ? timelineClips : DEFAULT_DEMO_CLIPS).reduce((sum, c) => Math.max(sum, c.end), 0),
    30,
  );

  /* ─── Zoom-aware pixels-per-second ─── */
  const basePixelsPerSecond = 40;
  const pixelsPerSecond = basePixelsPerSecond * zoomLevel;
  const totalWidthPx = totalDuration * pixelsPerSecond;
  const playheadPx = timelineCurrentTime * pixelsPerSecond;

  /* ─── Snap-to-grid mutation ─── */
  // Debounced so a single drag gesture writes once at the end, not on every
  // pointer move. Keeps the Convex DB from getting hammered. The returned
  // cancel() is invoked on unmount to avoid writing to a stale clip id.
  const persistClipMove = useMemo(
    () =>
      debounce((clipId: string, newStart: number) => {
        if (!currentProjectId) return; // local-only mode has nothing to persist
        void updateClipMut({ clipId: clipId as Id<"clips">, start: newStart }).catch((err) => {
          toast.error("Couldn't save clip position", {
            description: err instanceof Error ? err.message : "Unknown Convex error",
          });
        });
      }, 350),
    [currentProjectId, updateClipMut],
  );
  // Cancel any pending debounced write when the component unmounts so we
  // never fire a mutation after the timeline is gone.
  useEffect(() => () => persistClipMove.cancel(), [persistClipMove]);

  /* ─── DnD handlers ─── */
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragEnd = (e: DragEndEvent) => {
    const clipId = String(e.active.id).replace(/^clip-/, "");
    const deltaPx = e.delta.x;
    const deltaSec = deltaPx / pixelsPerSecond;
    const clip = timelineClips.find((c) => c.id === clipId);
    if (!clip) return;
    const newStart = snap(clip.start + deltaSec);
    updateTimelineClip(clipId, { start: newStart });
    persistClipMove(clipId, newStart);
  };

  /* ─── Click-to-seek on ruler ─── */
  const handleTimelineClick = (e: React.MouseEvent) => {
    if (!timelineRef.current) return;
    if ((e.target as HTMLElement).dataset?.clipId) return; // ignore clicks on clips
    const rect = timelineRef.current.getBoundingClientRect();
    const scrollLeft = timelineRef.current.scrollLeft;
    const x = e.clientX - rect.left + scrollLeft;
    const sec = snap(x / pixelsPerSecond, 0.5);
    setTimelineCurrentTime(Math.min(sec, totalDuration));
  };

  /* ─── Split selected clip at playhead ─── */
  const handleSplit = async () => {
    if (!selectedClipId) {
      toast.message("Select a clip first", { description: "Click a clip on the timeline, then press Split." });
      return;
    }
    const clip = timelineClips.find((c) => c.id === selectedClipId);
    if (!clip) return;
    if (timelineCurrentTime <= clip.start || timelineCurrentTime >= clip.end) {
      toast.error("Playhead must be inside the selected clip", {
        description: `Clip range ${clip.start}s–${clip.end}s, playhead at ${timelineCurrentTime}s.`,
      });
      return;
    }
    try {
      // Persist split server-side when possible. Locally, simulate by creating
      // a new clip id so the UI updates immediately even without a backend.
      if (currentProjectId && (clip as any)._id) {
        await splitClipMut({ clipId: (clip as any)._id, splitPoint: timelineCurrentTime });
      } else {
        // Local split simulation: replace clip with two halves in local store.
        const left: TimelineClip = { ...clip, id: `${clip.id}-L-${Date.now()}`, end: timelineCurrentTime, duration: timelineCurrentTime - clip.start };
        const right: TimelineClip = { ...clip, id: `${clip.id}-R-${Date.now()}`, start: timelineCurrentTime, duration: clip.end - timelineCurrentTime };
        const others = timelineClips.filter((c) => c.id !== clip.id);
        useAppStore.setState({ timelineClips: [...others, left, right] });
      }
      toast.success("Clip split", { description: `Split at ${timelineCurrentTime.toFixed(1)}s` });
    } catch (err) {
      toast.error("Split failed", {
        description: err instanceof Error ? err.message : "Unknown error from server",
      });
    }
  };

  /* ─── Add Track ─── */
  const handleAddTrack = async (type: "video" | "audio") => {
    if (!currentProjectId) {
      toast.info("Sign in to add persistent tracks", {
        description: "Local tracks are not saved across reloads without a project.",
      });
      return;
    }
    try {
      const labelMap = { video: `Video ${tracks.filter((t) => t.type === "video").length + 1}`, audio: `Audio ${tracks.filter((t) => t.type === "audio").length + 1}` };
      await addTrackMut({ projectId: currentProjectId as Id<"projects">, name: labelMap[type], type });
      toast.success(`New ${type} track added`);
    } catch (err) {
      toast.error("Couldn't add track", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };

  /* ─── Delete Track (skips local demo tracks) ─── */
  const handleDeleteTrack = async (track: TrackRow) => {
    if (String(track._id).startsWith("local-")) {
      toast.info("Local demo track", { description: "Sign in and load a project to delete real tracks." });
      return;
    }
    try {
      await deleteTrackMut({ trackId: track._id });
      toast.success(`${track.name} removed`);
    } catch (err) {
      toast.error("Couldn't delete track", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };

  /* ─── Loading state when tracks query is still resolving ─── */
  const isLoadingTracks = currentProjectId && backendTracks === undefined;

  return (
    <div className="h-full flex flex-col bg-white border-t-2 border-black">
      {/* ── Transport bar ── */}
      <div className="h-10 flex items-center gap-2 px-3 border-b-2 border-black bg-muted shrink-0">
        <Button variant="ghost" size="icon-sm" onClick={() => setTimelineCurrentTime(0)} className="text-muted-foreground hover:text-foreground">
          <SkipBack className="w-3.5 h-3.5" />
        </Button>
        <Button size="icon-sm" onClick={toggleTimelinePlayback} className="bg-black text-white hover:bg-foreground border-2 border-black">
          {timelinePlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-white" />}
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => setTimelineCurrentTime(totalDuration)} className="text-muted-foreground hover:text-foreground">
          <SkipForward className="w-3.5 h-3.5" />
        </Button>
        <span className="font-mono text-xs text-muted-foreground tabular-nums ml-2">
          {formatTime(timelineCurrentTime)} / {formatTime(totalDuration)}
        </span>

        <div className="w-px h-5 bg-black/20 mx-2" />

        <Button
          size="icon-sm"
          variant="outline"
          onClick={handleSplit}
          disabled={!selectedClipId || timelinePlaying}
          className="border-2 border-black rounded-none font-bold text-[10px] gap-1 px-2 w-auto"
          title={selectedClipId ? "Split selected clip at playhead" : "Select a clip first"}
        >
          <Scissors className="w-3.5 h-3.5" />
          <span>Split</span>
        </Button>

        <div className="flex-1" />

        {/* Zoom controls */}
        <Button size="icon-sm" variant="ghost" onClick={() => setZoomLevel(Math.max(1, zoomLevel - 1))} className="text-muted-foreground hover:text-foreground" disabled={zoomLevel <= 1}>
          <ZoomOut className="w-3.5 h-3.5" />
        </Button>
        <div className="flex items-center gap-1 w-32">
          <Slider
            min={1}
            max={5}
            step={1}
            value={[zoomLevel]}
            onValueChange={(v) => setZoomLevel(v[0] ?? 1)}
            className="cursor-pointer"
            aria-label="Zoom level"
          />
          <span className="text-[10px] font-mono text-muted-foreground w-7 text-right">{zoomLevel}x</span>
        </div>
        <Button size="icon-sm" variant="ghost" onClick={() => setZoomLevel(Math.min(5, zoomLevel + 1))} className="text-muted-foreground hover:text-foreground" disabled={zoomLevel >= 5}>
          <ZoomIn className="w-3.5 h-3.5" />
        </Button>

        <div className="w-px h-5 bg-black/20 mx-1" />

        {/* Add Track dropdown */}
        <DropdownTrackMenu onAdd={handleAddTrack} disabled={!currentProjectId} />
      </div>

      {/* ── Scroll canvas ── */}
      <div className="flex-1 overflow-auto" ref={timelineRef} onClick={handleTimelineClick}>
        <DndContext sensors={sensors} modifiers={[restrictToParentElement]} onDragEnd={handleDragEnd}>
          {/* Ruler (click to seek). Width follows zoom. */}
          <div className="h-6 flex items-end border-b-2 border-black bg-white sticky top-0 z-10" style={{ minWidth: `${totalWidthPx + 96}px` }}>
            <div className="w-24 shrink-0 border-r-2 border-black px-2 sticky left-0 bg-white z-20" />
            <div className="relative" style={{ width: `${totalWidthPx}px`, height: "100%" }}>
              {Array.from({ length: Math.ceil(totalDuration / 5) + 1 }).map((_, i) => {
                const leftPx = i * 5 * pixelsPerSecond;
                return (
                  <div
                    key={i}
                    className="absolute bottom-0 font-mono text-[9px] text-muted-foreground border-l-2 border-black pl-1 h-full flex items-end pb-0.5"
                    style={{ left: `${leftPx}px`, width: `${5 * pixelsPerSecond}px`, minWidth: 40 }}
                  >
                    {formatTime(i * 5)}
                  </div>
                );
              })}
              {/* Playhead inside ruler for nice alignment */}
              <div className="absolute top-0 bottom-0 w-0.5 bg-black z-20 pointer-events-none" style={{ left: `${playheadPx}px` }} />
            </div>
          </div>

          {/* Tracks */}
          {isLoadingTracks ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-12 w-full bg-muted" />
              <Skeleton className="h-12 w-full bg-muted" />
              <Skeleton className="h-12 w-full bg-muted" />
            </div>
          ) : (
            tracks.map((track) => {
              const cellWidth = Math.max(totalWidthPx, 200 * pixelsPerSecond);
              return (
                <div key={String(track._id)} className="flex border-b-2 border-black">
                  {/* Track header (sticky left) */}
                  <div className="w-24 shrink-0 border-r-2 border-black flex items-center justify-between px-2 bg-muted sticky left-0 z-10" style={{ height: `${track.height ?? 56}px` }}>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">
                        {track.name}
                      </span>
                      <span className="text-[8px] font-mono text-muted-foreground/70">
                        {track.type}
                      </span>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <button
                        onClick={() => /* track mute toggling omitted in local mode */ null}
                        className="text-muted-foreground hover:text-foreground"
                        title={track.muted ? "Unmute" : "Mute"}
                      >
                        {track.muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                      </button>
                      <button
                        onClick={() => handleDeleteTrack(track)}
                        className="text-muted-foreground hover:text-red-600"
                        title="Delete track"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Lane content (zoom-aware width) */}
                  <div
                    className="relative bg-white"
                    style={{ height: `${track.height ?? 56}px`, width: `${cellWidth}px` }}
                  >
                    {/* Playhead */}
                    <div className="absolute top-0 bottom-0 w-0.5 bg-black z-20 pointer-events-none" style={{ left: `${playheadPx}px` }} />
                    {(clipsByTrack[track._id] || []).map((clip) => (
                      <ClipCell
                        key={clip.id}
                        clip={clip}
                        pixelsPerSecond={pixelsPerSecond}
                        trackTotalDuration={totalDuration}
                        selected={selectedClipId === clip.id}
                        trackMuted={!!track.muted}
                        trackLocked={!!track.locked}
                      />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </DndContext>
      </div>

      {/* ── Footer hint ── */}
      {timelineClips.length === 0 && (
        <div className="px-3 py-2 border-t-2 border-black bg-muted text-[10px] text-muted-foreground font-mono">
          Drop clips here · drag to reposition · press Split to slice at playhead
        </div>
      )}
    </div>
  );
}

/* ─── Small dropdown for adding tracks ─────────────────────────────────────── */

function DropdownTrackMenu({ onAdd, disabled }: { onAdd: (t: "video" | "audio") => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen((s) => !s)}
        disabled={disabled}
        className="border-2 border-black rounded-none font-bold text-[10px] gap-1 px-2 h-7"
        title="Add a new track row"
      >
        <Plus className="w-3.5 h-3.5" />
        Add Track
      </Button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute right-0 top-9 z-30 border-2 border-black bg-white shadow-[3px_3px_0px_#000] w-40"
          >
            <button
              onClick={() => { onAdd("video"); setOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-accent text-xs font-bold border-b border-black/20"
            >
              + Video track
            </button>
            <button
              onClick={() => { onAdd("audio"); setOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-accent text-xs font-bold"
            >
              + Audio track
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
