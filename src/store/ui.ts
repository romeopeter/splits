/**
 * Editor UI state that is not part of the saved project: playhead, playback,
 * zoom, active tool and panel, selection, settings, and background job status.
 */
import { create } from "zustand";
import type { Ms, Selection } from "../types/project";
import { loadSettings, saveSettings, type Settings } from "../lib/settings";
import type { KeyStatus, MotionProgress, Usage, WhisperStatus } from "../lib/ipc";

export type PanelId = "media" | "clip" | "text" | "audio" | "captions" | "motion" | "settings" | "help";
/** Tabs of the Clip panel (a clip on a video track). */
export type ClipTab = "edit" | "effects" | "cutout" | "audio";
/** Tabs of the Audio panel (a clip on an audio track). */
export type AudioTab = "audio" | "edit";
/** Tabs of the Text panel. */
export type TextTab = "text" | "presets" | "font" | "colour" | "style" | "animation";
export type Tool = "select" | "blade";

export interface Notice {
  tone: "info" | "success" | "warning" | "danger";
  text: string;
}

export interface ExportState {
  jobId: string;
  phase: "frames" | "encoding" | "done" | "failed" | "cancelled";
  progress: number;
  outputPath: string;
  error?: string;
}

interface UiState {
  playheadMs: Ms;
  playing: boolean;
  pxPerSecond: number;
  tool: Tool;
  panel: PanelId;
  /** The tab each panel last showed, kept while the person moves between clips. */
  clipTab: ClipTab;
  audioTab: AudioTab;
  textTab: TextTab;
  /** Bumped to ask the Text panel to focus its editor (after adding text, or a double-click on the canvas). */
  textEditTick: number;
  selection: Selection;
  settings: Settings;
  liveMessage: string;
  notice: Notice | null;
  keyStatus: KeyStatus | null;
  whisper: WhisperStatus | null;
  transcribing: { assetId: string; jobId: string } | null;
  motion: { requestId: string; progress: MotionProgress | null } | null;
  lastUsage: Usage | null;
  exportState: ExportState | null;
  exportOpen: boolean;
  downloads: Record<string, number>;
  /** Clip whose chroma key colour the next canvas click will set. */
  eyedropperClipId: string | null;
  previewVolume: number;
  speed: number;

  setPlayhead: (ms: Ms) => void;
  setPlaying: (v: boolean) => void;
  setZoom: (px: number) => void;
  setTool: (t: Tool) => void;
  setPanel: (p: PanelId) => void;
  select: (s: Selection) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  announce: (msg: string) => void;
  notify: (n: Notice | null) => void;
  set: (patch: Partial<UiState>) => void;
}

export const ZOOM_MIN = 2;
export const ZOOM_MAX = 120;
export const ZOOM_DEFAULT = 15.6;

export const useUi = create<UiState>((set, get) => ({
  playheadMs: 0,
  playing: false,
  pxPerSecond: ZOOM_DEFAULT,
  tool: "select",
  panel: "media",
  clipTab: "edit",
  audioTab: "audio",
  textTab: "text",
  textEditTick: 0,
  selection: null,
  settings: loadSettings(),
  liveMessage: "",
  notice: null,
  keyStatus: null,
  whisper: null,
  transcribing: null,
  motion: null,
  lastUsage: null,
  exportState: null,
  exportOpen: false,
  downloads: {},
  eyedropperClipId: null,
  previewVolume: 0.8,
  speed: 1,

  setPlayhead: (ms) => set({ playheadMs: Math.max(0, Math.round(ms)) }),
  setPlaying: (v) => {
    if (v !== get().playing) set({ playing: v, liveMessage: v ? "Playing" : "Paused" });
  },
  setZoom: (px) => set({ pxPerSecond: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, px)) }),
  setTool: (tool) => set({ tool, liveMessage: tool === "blade" ? "Blade tool. Click a clip to split it." : "Select tool" }),
  setPanel: (panel) => set({ panel }),
  select: (selection) => set({ selection }),
  updateSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    saveSettings(settings);
    set({ settings });
  },
  announce: (msg) => {
    // Clear first so repeating the same message is announced again.
    set({ liveMessage: "" });
    queueMicrotask(() => set({ liveMessage: msg }));
  },
  notify: (notice) => set({ notice }),
  set: (patch) => set(patch),
}));
