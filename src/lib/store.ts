import { create } from "zustand";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ActionStatus = "idle" | "loading" | "success" | "error";

// Re-export from asyncWrapper for single source of truth
export type { AsyncActionName } from "@/lib/asyncWrapper";
import type { AsyncActionName } from "@/lib/asyncWrapper";

export interface EditorClip {
  id: string;
  name: string;
  source: string;
  startTime: number;
  endTime: number;
  duration: number;
  order: number;
  color: string;
}

// ─── Timeline Types ───────────────────────────────────────────────────────────

export interface TimelineClip {
  id: string;
  type: "video" | "audio" | "image";
  name: string;
  url: string;
  filepath?: string;
  thumbnail?: string;
  start: number;
  end: number;
  duration: number;
  effects: {
    zoomPan: boolean;
    colorGrading: "none" | "warm" | "cool" | "vintage";
    vignette: boolean;
    filmGrain: boolean;
  };
  volume: number;
  captions: { start: number; end: number; text: string }[];
}

export interface Template {
  id: string;
  name: string;
  description: string;
  category: "lyric" | "motivational" | "sports" | "documentary" | "educational";
  aspectRatio: "9:16" | "16:9" | "19:6";
  duration: number;
  thumbnail: string;
  config: Record<string, unknown>;
}

export interface ProjectStats {
  totalProjects: number;
  completedVideos: number;
  totalDurationMinutes: number;
  storageUsedMB: number;
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface AppState {
  // UI
  sidebarOpen: boolean;
  darkMode: boolean;
  terminalFontSize: number;
  // Agent
  isProcessing: boolean;
  activeCommandId: string | null;
  // Project
  currentProjectId: string | null;
  aspectRatio: "auto" | "9:16" | "16:9" | "1:1" | "19:6";
  resolution: "720p" | "1080p";
  // Editor (legacy)
  clips: EditorClip[];
  currentTime: number;
  isPlaying: boolean;
  // ─── Timeline State ────────────────────────────────────────────────────
  timelineClips: TimelineClip[];
  selectedClipId: string | null;
  timelineCurrentTime: number;
  timelinePlaying: boolean;
  // 1x - 5x multiplier applied to timeline width (Phase 2 zoom controller).
  zoomLevel: number;
  // Setter for zoomLevel
  setZoomLevel: (zoom: number) => void;
  // ─── Action Status (per key action) ────────────────────────────────────
  actionStatus: Partial<Record<AsyncActionName, ActionStatus>>;
  actionError: Partial<Record<AsyncActionName, string>>;
  setActionStatus: (action: AsyncActionName, status: ActionStatus, error?: string) => void;
  clearActionStatus: (action: AsyncActionName) => void;
  clearAllActionStatuses: () => void;
  // Actions
  toggleSidebar: () => void;
  toggleDarkMode: () => void;
  setTerminalFontSize: (size: number) => void;
  setProcessing: (processing: boolean) => void;
  setActiveCommand: (id: string | null) => void;
  setCurrentProject: (id: string | null) => void;
  setAspectRatio: (ratio: "auto" | "9:16" | "16:9" | "1:1" | "19:6") => void;
  setResolution: (res: "720p" | "1080p") => void;
  addClip: (clip: EditorClip) => void;
  removeClip: (id: string) => void;
  reorderClips: (clips: EditorClip[]) => void;
  setCurrentTime: (time: number) => void;
  togglePlayback: () => void;
  // ─── Timeline Actions ───────────────────────────────────────────────────
  addTimelineClip: (clip: TimelineClip) => void;
  removeTimelineClip: (id: string) => void;
  updateTimelineClip: (id: string, updates: Partial<TimelineClip>) => void;
  selectClip: (id: string | null) => void;
  setTimelineCurrentTime: (time: number) => void;
  toggleTimelinePlayback: () => void;
  reorderTimelineClips: (clips: TimelineClip[]) => void;
  reset: () => void;
}

const initialState = {
  sidebarOpen: true,
  darkMode: false,
  terminalFontSize: 13,
  isProcessing: false,
  activeCommandId: null,
  currentProjectId: null,
  aspectRatio: "auto" as const,
  resolution: "720p" as const,
  clips: [] as EditorClip[],
  currentTime: 0,
  isPlaying: false,
  timelineClips: [] as TimelineClip[],
  selectedClipId: null as string | null,
  timelineCurrentTime: 0,
  timelinePlaying: false,
  zoomLevel: 1,
  actionStatus: {} as Partial<Record<AsyncActionName, ActionStatus>>,
  actionError: {} as Partial<Record<AsyncActionName, string>>,
};

export const useAppStore = create<AppState>((set) => ({
  ...initialState,

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),
  setTerminalFontSize: (size) => set({ terminalFontSize: size }),
  setProcessing: (processing) => set({ isProcessing: processing }),
  setActiveCommand: (id) => set({ activeCommandId: id }),
  setCurrentProject: (id) => set({ currentProjectId: id }),
  setAspectRatio: (ratio) => set({ aspectRatio: ratio }),
  setResolution: (res) => set({ resolution: res }),

  addClip: (clip) => set((s) => ({ clips: [...s.clips, clip] })),
  removeClip: (id) => set((s) => ({ clips: s.clips.filter((c) => c.id !== id) })),
  reorderClips: (clips) => set({ clips }),

  setCurrentTime: (time) => set({ currentTime: time }),
  togglePlayback: () => set((s) => ({ isPlaying: !s.isPlaying })),

  // ─── Timeline Actions ───────────────────────────────────────────────────
  addTimelineClip: (clip) => set((s) => ({ timelineClips: [...s.timelineClips, clip] })),
  removeTimelineClip: (id) => set((s) => ({ timelineClips: s.timelineClips.filter((c) => c.id !== id) })),
  updateTimelineClip: (id, updates) =>
    set((s) => ({
      timelineClips: s.timelineClips.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    })),
  selectClip: (id) => set({ selectedClipId: id }),
  setTimelineCurrentTime: (time) => set({ timelineCurrentTime: time }),
  toggleTimelinePlayback: () => set((s) => ({ timelinePlaying: !s.timelinePlaying })),
  reorderTimelineClips: (clips) => set({ timelineClips: clips }),

  setActionStatus: (action, status, error) =>
    set((s) => ({
      actionStatus: { ...s.actionStatus, [action]: status },
      actionError: status === "error" && error
        ? { ...s.actionError, [action]: error }
        : status === "idle"
          ? (() => { const copy = { ...s.actionError }; delete copy[action]; return copy; })()
          : s.actionError,
    })),
  clearActionStatus: (action) =>
    set((s) => {
      const statusCopy = { ...s.actionStatus };
      delete statusCopy[action];
      const errorCopy = { ...s.actionError };
      delete errorCopy[action];
      return { actionStatus: statusCopy, actionError: errorCopy };
    }),
  clearAllActionStatuses: () => set({ actionStatus: {}, actionError: {} }),

  // Zoom controller (Phase 2)
  setZoomLevel: (zoom) => set({ zoomLevel: zoom }),
  reset: () => set(initialState),
}));

// ─── Templates ────────────────────────────────────────────────────────────────

export const TEMPLATES: Template[] = [
  {
    id: "lyric-classic",
    name: "Lyric Video",
    description: "Classic lyric video with glass captions, music swell, and cinematic fade transitions. Perfect for music releases.",
    category: "lyric",
    aspectRatio: "9:16",
    duration: 45,
    thumbnail: "🎵",
    config: {
      effects: ["glass_captions", "film_grain_2%", "vignette"],
      audio: { musicSwell: true, bassBoost: 3, dialogueDuck: false },
      captions: { style: "glass", fontSize: 32, position: "bottom" },
    },
  },
  {
    id: "motivational-grind",
    name: "Motivational Short",
    description: "High-energy motivational reel with zoom-pan, bold captions, and dramatic orchestral swell.",
    category: "motivational",
    aspectRatio: "9:16",
    duration: 30,
    thumbnail: "💪",
    config: {
      effects: ["zoom_pan", "color_grade_warm", "film_grain_2%"],
      audio: { orchestralSwell: true, bassBoost: 6 },
      captions: { style: "bold", fontSize: 36, position: "middle" },
    },
  },
  {
    id: "sports-highlight",
    name: "Sports Documentary",
    description: "Dynamic sports clip with slow-motion replays, stats overlay, and cinematic color grading.",
    category: "sports",
    aspectRatio: "16:9",
    duration: 60,
    thumbnail: "🏃",
    config: {
      effects: ["slow_motion", "color_grade_cool", "stats_overlay"],
      audio: { commentaryMix: true, crowdBoost: true },
      captions: { style: "lower_third", fontSize: 24, position: "bottom" },
    },
  },
  {
    id: "educational-explainer",
    name: "Educational Explainer",
    description: "Clean educational video with clear narration, animated text, and subtle background music.",
    category: "educational",
    aspectRatio: "16:9",
    duration: 120,
    thumbnail: "📚",
    config: {
      effects: ["animated_text", "subtle_zoom", "vignette_light"],
      audio: { narration: true, backgroundMusic: true, ducking: true },
      captions: { style: "clean", fontSize: 28, position: "bottom" },
    },
  },
  {
    id: "documentary-cinematic",
    name: "Cinematic Documentary",
    description: "Cinematic storytelling with LUT color grading, ambient sound design, and smooth transitions.",
    category: "documentary",
    aspectRatio: "19:6",
    duration: 180,
    thumbnail: "🎬",
    config: {
      effects: ["color_grade_film", "film_grain_2%", "heavy_vignette", "letterbox"],
      audio: { ambientDesign: true, narrationMix: true, musicSwell: true },
      captions: { style: "cinematic", fontSize: 22, position: "bottom" },
    },
  },
];
