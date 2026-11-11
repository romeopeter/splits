/**
 * The project: one JSON tree, edited in React, saved by Rust.
 *
 * Time is integer milliseconds everywhere. Timeline positions are snapped to
 * the project frame rate when they are created, so splits and exports land
 * on whole frames.
 *
 * Captions and motion clips are anchored to transcript *words*, not to times.
 * Their place on the timeline is derived from where those words currently sit
 * in the edit (see `lib/timeline.ts`), so trimming or moving footage carries
 * them along.
 */

export type Ms = number;

export interface Fps {
  num: number;
  den: number;
}

export type ProxyStatus = "pending" | "ready" | "failed";

export interface Asset {
  id: string;
  /** Absolute path of the original file. Only export reads it. */
  path: string;
  name: string;
  kind: "video" | "audio";
  durationMs: Ms;
  hasVideo: boolean;
  hasAudio: boolean;
  width?: number;
  height?: number;
  fps?: Fps;
  proxy: { status: ProxyStatus; path?: string; progress: number; error?: string };
  thumbnails?: string[];
  thumbnailIntervalMs?: Ms;
  /** Waveform peaks 0..1, `PEAKS_PER_SECOND` per second of source. */
  peaks?: number[];
}

export type TrackKind = "motion" | "text" | "caption" | "video" | "audio";

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  locked: boolean;
  /** Hidden tracks are neither seen nor heard. */
  hidden: boolean;
  /** Muted tracks are still seen (video) but not heard. */
  muted: boolean;
}

export interface Transform {
  /** Offset from canvas centre, in project pixels. */
  x: number;
  y: number;
  /** 1 = fit inside the canvas. */
  scale: number;
  /** 0..1 */
  opacity: number;
  /** Degrees clockwise around the clip's centre. */
  rotation: number;
  /** Mirror left to right. */
  flipH: boolean;
  /** Mirror top to bottom. */
  flipV: boolean;
}

/** Fractions of the source width or height cut off each edge, before fitting. */
export interface Crop {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ChromaKey {
  enabled: boolean;
  /** `#RRGGBB` */
  color: string;
  /** 0..1 chroma distance that becomes fully transparent. */
  similarity: number;
  /** 0..1 soft edge width. */
  smoothness: number;
}

/**
 * A clip of an asset on a video or audio track.
 *
 * `inMs`..`outMs` is the source range; at `speed` 2 it plays in half that
 * time, so the clip's length on the timeline is `(outMs - inMs) / speed`
 * (see `clipLength`). Fades are timeline time, measured from the clip's ends.
 */
export interface MediaClip {
  id: string;
  trackId: string;
  assetId: string;
  /** Timeline position of the clip's first frame. */
  startMs: Ms;
  /** Source range used. */
  inMs: Ms;
  outMs: Ms;
  /** Playback speed, `MIN_SPEED`..`MAX_SPEED`, 1 = unchanged. Audio keeps its pitch. */
  speed: number;
  transform: Transform;
  crop: Crop;
  chromaKey: ChromaKey;
  /** 0..2, 1 = unchanged. */
  volume: number;
  /** Silenced without losing `volume` (also set when the audio is detached to its own clip). */
  muted: boolean;
  /** Picture fades from and to transparent (black when nothing is below). */
  videoFadeInMs: Ms;
  videoFadeOutMs: Ms;
  audioFadeInMs: Ms;
  audioFadeOutMs: Ms;
}

export interface Word {
  id: string;
  text: string;
  /** Source time in the asset. */
  startMs: Ms;
  endMs: Ms;
}

export interface Segment {
  id: string;
  firstWordId: string;
  lastWordId: string;
}

export interface Transcript {
  assetId: string;
  model: string;
  language: string;
  words: Word[];
  segments: Segment[];
}

export type MotionStatus = "ready" | "failed";

/** A Lottie animation generated for one caption segment. */
export interface MotionClip {
  id: string;
  trackId: string;
  assetId: string;
  segmentId: string;
  firstWordId: string;
  lastWordId: string;
  /** Every word the animation was built for, in order. Used to detect drift. */
  wordIds: string[];
  /** Absolute path of the Lottie JSON in the project folder. */
  lottiePath: string;
  /** Animation length in frames at the project rate. */
  frames: number;
  /** Manual nudge relative to the anchor word. */
  offsetMs: Ms;
  hidden: boolean;
  prompt: string;
  model: string;
  generatedAt: string;
}

/** How a text clip comes in or goes out. Durations are timeline ms, measured from the clip's ends. */
export type TextAnimationKind = "none" | "fade" | "pop" | "rise" | "drop" | "typewriter";

export interface TextAnimation {
  kind: TextAnimationKind;
  durationMs: Ms;
}

export type TextAlign = "left" | "center" | "right";
/** None, one box behind the whole block, or one box behind each line (a highlighter look). */
export type TextBackgroundShape = "none" | "block" | "lines";
export type TextShadow = "none" | "soft" | "hard";

/**
 * How a text clip looks. Colours here are the person's content, not
 * interface colours, so they are stored as `#RRGGBB` like the chroma key.
 */
export interface TextStyle {
  /** A bundled font (`lib/fonts.ts`). */
  fontId: string;
  /** Font size as a fraction of canvas height. */
  size: number;
  /** Show the text in capitals without changing what was typed. */
  caps: boolean;
  /** Extra space between letters, as a fraction of the font size (-0.05..0.5). */
  letterSpacing: number;
  /** Line height as a multiple of the font size. */
  lineHeight: number;
  align: TextAlign;
  color: string;
  background: { shape: TextBackgroundShape; color: string; /** 0..1 */ opacity: number };
  /** Outline width as a fraction of the font size; 0 = none. */
  outline: { width: number; color: string };
  shadow: { kind: TextShadow; color: string };
}

/**
 * A title or label drawn over the video. Unlike captions and motion, text is
 * placed in time by the person, not anchored to words.
 */
export interface TextClip {
  id: string;
  trackId: string;
  startMs: Ms;
  durationMs: Ms;
  /** What was typed; `\n` starts a new line. */
  text: string;
  /** Centre of the text block, offset from the canvas centre, in project pixels. */
  x: number;
  y: number;
  /** Degrees clockwise. */
  rotation: number;
  /** 0..1 */
  opacity: number;
  style: TextStyle;
  animIn: TextAnimation;
  animOut: TextAnimation;
}

export interface CaptionStyle {
  /** Font size as a fraction of canvas height. */
  size: number;
  /** Vertical centre of the caption plate as a fraction of canvas height. */
  position: number;
}

export interface ProjectSettings {
  width: number;
  height: number;
  fps: Fps;
}

export interface Project {
  version: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  settings: ProjectSettings;
  assets: Record<string, Asset>;
  /** Top to bottom: draw order is bottom first. */
  tracks: Track[];
  clips: Record<string, MediaClip>;
  transcripts: Record<string, Transcript>;
  motion: Record<string, MotionClip>;
  texts: Record<string, TextClip>;
  captionStyle: CaptionStyle;
  /** Style prompts the person has used, most recent first. */
  motionStyles: string[];
}

export type Selection =
  | { kind: "clip"; id: string }
  | { kind: "segment"; assetId: string; segmentId: string }
  | { kind: "motion"; id: string }
  | { kind: "text"; id: string }
  | null;
