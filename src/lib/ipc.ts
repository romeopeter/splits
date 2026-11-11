/**
 * Typed wrappers for every Rust command and event. Components call these,
 * never `invoke` directly, so the Rust/TS contract lives in one file.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface AppError {
  kind: string;
  message: string;
}

export function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as AppError).message);
  return String(e);
}

export function errorKind(e: unknown): string | undefined {
  return e && typeof e === "object" && "kind" in e ? String((e as AppError).kind) : undefined;
}

export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// ---------- Media ----------

export interface MediaInfo {
  durationMs: number;
  hasVideo: boolean;
  hasAudio: boolean;
  width: number | null;
  height: number | null;
  fpsNum: number | null;
  fpsDen: number | null;
}

export interface MediaJobEvent {
  assetId: string;
  stage: "proxy" | "thumbnails" | "peaks";
  status: "running" | "done" | "failed";
  progress: number;
  error?: string;
  proxyPath?: string;
  thumbnails?: string[];
  thumbnailIntervalMs?: number;
  peaks?: number[];
}

export const importMedia = (assetId: string, path: string) => invoke<MediaInfo>("import_media", { assetId, path });
export const ensureMedia = (assetId: string, path: string) => invoke<void>("ensure_media", { assetId, path });
export const onMediaJob = (cb: (e: MediaJobEvent) => void): Promise<UnlistenFn> =>
  listen<MediaJobEvent>("media-job", (ev) => cb(ev.payload));

// ---------- Transcription ----------

export interface TranscriptDto {
  assetId: string;
  model: string;
  language: string;
  words: { id: string; text: string; startMs: number; endMs: number }[];
  segments: { id: string; firstWordId: string; lastWordId: string }[];
}

export interface ModelStatus {
  name: string;
  installed: boolean;
  sizeBytes: number;
}

export interface WhisperStatus {
  binary: string | null;
  models: ModelStatus[];
}

export const whisperStatus = () => invoke<WhisperStatus>("whisper_status");
export const transcribeAsset = (jobId: string, assetId: string, path: string, model: string) =>
  invoke<TranscriptDto>("transcribe_asset", { jobId, assetId, path, model });
export const downloadModel = (name: string) => invoke<void>("download_model", { name });
export const onModelDownload = (cb: (e: { name: string; progress: number }) => void) =>
  listen<{ name: string; progress: number }>("model-download", (ev) => cb(ev.payload));
export const cancelJob = (jobId: string) => invoke<boolean>("cancel_job", { jobId });

// ---------- Claude ----------

export interface KeyStatus {
  connected: boolean;
  hint: string | null;
}

export const claudeKeySet = (key: string) => invoke<KeyStatus>("claude_key_set", { key });
export const claudeKeyStatus = () => invoke<KeyStatus>("claude_key_status");
export const claudeKeyDelete = () => invoke<void>("claude_key_delete");
export const claudeTest = () => invoke<void>("claude_test");

export interface MotionRequestDto {
  requestId: string;
  projectId: string;
  stylePrompt: string;
  model: string;
  effort: string;
  width: number;
  height: number;
  fpsNum: number;
  fpsDen: number;
  segments: { segmentId: string; words: { id: string; text: string; startMs: number; endMs: number }[] }[];
}

export interface SegmentResult {
  segmentId: string;
  ok: boolean;
  clipId: string | null;
  lottiePath: string | null;
  frames: number | null;
  error: string | null;
  repaired: boolean;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}

export interface MotionResult {
  results: SegmentResult[];
  usage: Usage;
  model: string;
}

export interface MotionProgress {
  requestId: string;
  stage: "generating" | "repairing" | "done";
  doneSegments: number;
  totalSegments: number;
  receivedChars: number;
}

export const motionGenerate = (request: MotionRequestDto) => invoke<MotionResult>("motion_generate", { request });
export const onMotionProgress = (cb: (e: MotionProgress) => void) =>
  listen<MotionProgress>("motion-progress", (ev) => cb(ev.payload));
export const readAppFile = (path: string) => invoke<string>("read_app_file", { path });

// ---------- Projects ----------

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
}

export const projectSave = (project: unknown) => invoke<void>("project_save", { project });
export const projectLoadLast = () => invoke<unknown | null>("project_load_last");
export const projectLoad = (id: string) => invoke<unknown | null>("project_load", { id });
export const projectList = () => invoke<ProjectSummary[]>("project_list");

// ---------- Export ----------

export interface ExportRequestDto {
  jobId: string;
  target: "mp4" | "motion_mov";
  outputPath: string;
  width: number;
  height: number;
  fpsNum: number;
  fpsDen: number;
  durationMs: number;
  visual: {
    sourcePath: string;
    sourceWidth: number;
    sourceHeight: number;
    startMs: number;
    inMs: number;
    outMs: number;
    speed: number;
    transform: { x: number; y: number; scale: number; opacity: number; rotation: number; flipH: boolean; flipV: boolean };
    crop: { left: number; top: number; right: number; bottom: number };
    chromaKey: { color: string; similarity: number; smoothness: number } | null;
    fadeInMs: number;
    fadeOutMs: number;
  }[];
  audio: {
    sourcePath: string;
    startMs: number;
    inMs: number;
    outMs: number;
    speed: number;
    volume: number;
    fadeInMs: number;
    fadeOutMs: number;
  }[];
  overlay: { dir: string; frameCount: number } | null;
}

export const overlayBegin = (jobId: string) => invoke<string>("overlay_begin", { jobId });

/** Send one PNG frame as a raw body. `blank: "set"` stores it as the shared empty frame. */
export const overlayFrame = (jobId: string, index: number, png: Uint8Array, blank?: "set") =>
  invoke<void>("overlay_frame", png, {
    headers: { "x-job": jobId, "x-index": String(index), ...(blank ? { "x-blank": blank } : {}) },
  });

/** Reuse the shared empty frame for this index. */
export const overlayBlank = (jobId: string, index: number) =>
  invoke<void>("overlay_frame", new Uint8Array(0), { headers: { "x-job": jobId, "x-index": String(index), "x-blank": "use" } });

export const exportStart = (request: ExportRequestDto) => invoke<void>("export_start", { request });
export const onExportProgress = (cb: (e: { jobId: string; progress: number }) => void) =>
  listen<{ jobId: string; progress: number }>("export-progress", (ev) => cb(ev.payload));
export const exportLottie = (files: [string, string][], destDir: string) =>
  invoke<number>("export_lottie", { files, destDir });
