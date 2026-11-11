/**
 * Pure timeline logic: placement, edits, snapping, and word anchoring.
 *
 * Every function takes a project and returns a value or a *new* project, so
 * the store can keep old projects for undo and React can compare by identity.
 */
import type {
  Asset,
  Crop,
  MediaClip,
  MotionClip,
  Ms,
  Project,
  Segment,
  Track,
  TrackKind,
  Transcript,
  Transform,
  Word,
} from "../types/project";
import { newId } from "./ids";
import { DEFAULT_FPS, clamp, frameMs, snapToFrame } from "./time";

export const MIN_CLIP_FRAMES = 2;
export const MIN_SPEED = 0.25;
export const MAX_SPEED = 4;
/** Clip ends at speeds other than 1 can land up to this far off a frame (integer source ms; see learn/12). */
const EDGE_TOLERANCE_MS = 2;

export const DEFAULT_TRANSFORM: Transform = { x: 0, y: 0, scale: 1, opacity: 1, rotation: 0, flipH: false, flipV: false };
export const NO_CROP: Crop = { left: 0, top: 0, right: 0, bottom: 0 };
/** Each crop edge stops here, and opposite edges together leave at least this much of the picture. */
export const MAX_CROP = 0.9;

// ---------- Construction ----------

/**
 * A new project has no tracks. Tracks appear when something needs them (see
 * `ensureTrack`), so the timeline never shows empty lanes the user did not ask for.
 */
export function createProject(name = "Untitled project"): Project {
  const now = new Date().toISOString();
  return {
    version: 1,
    id: newId("p"),
    name,
    createdAt: now,
    updatedAt: now,
    settings: { width: 1920, height: 1080, fps: DEFAULT_FPS },
    assets: {},
    tracks: [],
    clips: {},
    transcripts: {},
    motion: {},
    captionStyle: { size: 0.045, position: 0.82 },
    motionStyles: [],
  };
}

export function newMediaClip(asset: Asset, trackId: string, startMs: Ms): MediaClip {
  return {
    id: newId("c"),
    trackId,
    assetId: asset.id,
    startMs,
    inMs: 0,
    outMs: asset.durationMs,
    speed: 1,
    transform: DEFAULT_TRANSFORM,
    crop: NO_CROP,
    chromaKey: { enabled: false, color: "#00FF00", similarity: 0.14, smoothness: 0.08 },
    volume: 1,
    muted: false,
    videoFadeInMs: 0,
    videoFadeOutMs: 0,
    audioFadeInMs: 0,
    audioFadeOutMs: 0,
  };
}

/**
 * Fill in fields added after a project was saved, so older projects load
 * with today's defaults (no speed change, no crop, no fades, not muted).
 */
export function normalizeProject(p: Project): Project {
  const clips: Record<string, MediaClip> = {};
  for (const [id, c] of Object.entries(p.clips)) {
    const old = c as Partial<MediaClip> & Pick<MediaClip, "id" | "trackId" | "assetId" | "startMs" | "inMs" | "outMs">;
    clips[id] = {
      ...old,
      speed: old.speed ?? 1,
      transform: { ...DEFAULT_TRANSFORM, ...old.transform },
      crop: { ...NO_CROP, ...old.crop },
      chromaKey: old.chromaKey ?? { enabled: false, color: "#00FF00", similarity: 0.14, smoothness: 0.08 },
      volume: old.volume ?? 1,
      muted: old.muted ?? false,
      videoFadeInMs: old.videoFadeInMs ?? 0,
      videoFadeOutMs: old.videoFadeOutMs ?? 0,
      audioFadeInMs: old.audioFadeInMs ?? 0,
      audioFadeOutMs: old.audioFadeOutMs ?? 0,
    };
  }
  const tracks = p.tracks.map((t) => ({ ...t, muted: t.muted ?? false }));
  return { ...p, clips, tracks };
}

// ---------- Basic queries ----------

/** Timeline length: the source range played at the clip's speed. */
export const clipLength = (c: MediaClip): Ms => Math.round((c.outMs - c.inMs) / c.speed);
export const clipEnd = (c: MediaClip): Ms => c.startMs + clipLength(c);
/** Source time (ms, may be fractional) shown at timeline time `t`. */
export const sourceAt = (c: MediaClip, t: Ms): number => c.inMs + (t - c.startMs) * c.speed;
/** Timeline time (ms, may be fractional) at which source time `s` plays. */
export const timelineAt = (c: MediaClip, s: number): number => c.startMs + (s - c.inMs) / c.speed;

/** Linear fade multiplier 0..1 at timeline time `t`, for fades measured from the clip's ends. */
export function fadeGain(c: MediaClip, t: Ms, fadeIn: Ms, fadeOut: Ms): number {
  const x = t - c.startMs;
  let g = 1;
  if (fadeIn > 0) g = Math.min(g, x / fadeIn);
  if (fadeOut > 0) g = Math.min(g, (clipLength(c) - x) / fadeOut);
  return clamp(g, 0, 1);
}

/** Whether the clip's own sound plays: it has audio, is not muted and is not at zero volume. */
export function clipAudible(p: Project, c: MediaClip): boolean {
  return !!p.assets[c.assetId]?.hasAudio && !c.muted && c.volume > 0;
}

/** Source width and height left after cropping. */
export function croppedSize(w: number, h: number, crop: Crop): { w: number; h: number } {
  return { w: w * (1 - crop.left - crop.right), h: h * (1 - crop.top - crop.bottom) };
}

export function trackById(p: Project, id: string): Track | undefined {
  return p.tracks.find((t) => t.id === id);
}

export function clipsOnTrack(p: Project, trackId: string): MediaClip[] {
  return Object.values(p.clips)
    .filter((c) => c.trackId === trackId)
    .sort((a, b) => a.startMs - b.startMs);
}

export function firstTrackOfKind(p: Project, kind: TrackKind): Track | undefined {
  return p.tracks.find((t) => t.kind === kind);
}

export function clipAt(p: Project, trackId: string, t: Ms): MediaClip | undefined {
  return clipsOnTrack(p, trackId).find((c) => t >= c.startMs && t < clipEnd(c));
}

export function trackEnd(p: Project, trackId: string): Ms {
  return clipsOnTrack(p, trackId).reduce((m, c) => Math.max(m, clipEnd(c)), 0);
}

function overlaps(p: Project, trackId: string, start: Ms, end: Ms, ignoreId?: string): MediaClip | undefined {
  return clipsOnTrack(p, trackId).find(
    (c) => c.id !== ignoreId && start < clipEnd(c) - EDGE_TOLERANCE_MS && end > c.startMs + EDGE_TOLERANCE_MS,
  );
}

// ---------- Word anchoring ----------

const wordIndexCache = new WeakMap<Transcript, Map<string, number>>();

export function wordIndex(tr: Transcript): Map<string, number> {
  let m = wordIndexCache.get(tr);
  if (!m) {
    m = new Map(tr.words.map((w, i) => [w.id, i]));
    wordIndexCache.set(tr, m);
  }
  return m;
}

export function segmentWords(tr: Transcript, seg: Segment): Word[] {
  const idx = wordIndex(tr);
  const a = idx.get(seg.firstWordId);
  const b = idx.get(seg.lastWordId);
  if (a === undefined || b === undefined || b < a) return [];
  return tr.words.slice(a, b + 1);
}

/**
 * Where a source time of an asset currently plays on the timeline, if anywhere.
 * Transcripts are of the sound, so a clip whose sound plays wins over a muted
 * one: after "Detach audio", captions follow the audio clip, not the silent picture.
 */
export function placeSourceTime(p: Project, assetId: string, sourceMs: Ms): { clip: MediaClip; timelineMs: Ms } | null {
  let best: { clip: MediaClip; timelineMs: Ms } | null = null;
  for (const c of Object.values(p.clips)) {
    if (c.assetId !== assetId || sourceMs < c.inMs || sourceMs >= c.outMs) continue;
    const t = Math.round(timelineAt(c, sourceMs));
    const better = !best || (best.clip.muted && !c.muted) || (best.clip.muted === c.muted && t < best.timelineMs);
    if (better) best = { clip: c, timelineMs: t };
  }
  return best;
}

export interface PlacedWord {
  word: Word;
  startMs: Ms;
  endMs: Ms;
}

export interface PlacedCaption {
  assetId: string;
  segmentId: string;
  startMs: Ms;
  endMs: Ms;
  words: PlacedWord[];
  text: string;
}

function placeWord(p: Project, assetId: string, w: Word): PlacedWord | null {
  const at = placeSourceTime(p, assetId, w.startMs);
  if (!at) return null;
  const end = Math.min(clipEnd(at.clip), Math.round(timelineAt(at.clip, w.endMs)));
  return { word: w, startMs: at.timelineMs, endMs: Math.max(end, at.timelineMs + 1) };
}

const captionCache = new WeakMap<Project, PlacedCaption[]>();

/** Every caption segment with at least one word still in the edit, in timeline order. */
export function placedCaptions(p: Project): PlacedCaption[] {
  const cached = captionCache.get(p);
  if (cached) return cached;
  const out: PlacedCaption[] = [];
  for (const tr of Object.values(p.transcripts)) {
    for (const seg of tr.segments) {
      const words = segmentWords(tr, seg)
        .map((w) => placeWord(p, tr.assetId, w))
        .filter((w): w is PlacedWord => w !== null)
        .sort((a, b) => a.startMs - b.startMs);
      const first = words[0];
      const last = words[words.length - 1];
      if (!first || !last) continue;
      out.push({
        assetId: tr.assetId,
        segmentId: seg.id,
        startMs: first.startMs,
        endMs: Math.max(last.endMs, first.startMs + 1),
        words,
        text: words.map((w) => w.word.text).join(" "),
      });
    }
  }
  out.sort((a, b) => a.startMs - b.startMs);
  captionCache.set(p, out);
  return out;
}

export type MotionPlacement =
  | { status: "ok" | "out_of_sync"; startMs: Ms; endMs: Ms }
  | { status: "orphaned" };

/**
 * A motion clip starts where its first word now plays (plus any nudge).
 * It is out of sync when any of its words no longer follows the first word
 * by the same amount as in the source, i.e. an edit cut or moved words
 * inside it. Tolerance is one frame.
 */
export function placeMotion(p: Project, m: MotionClip): MotionPlacement {
  const tr = p.transcripts[m.assetId];
  if (!tr) return { status: "orphaned" };
  const idx = wordIndex(tr);
  const firstIdx = idx.get(m.firstWordId);
  const first = firstIdx === undefined ? undefined : tr.words[firstIdx];
  if (!first) return { status: "orphaned" };
  const anchor = placeSourceTime(p, m.assetId, first.startMs);
  if (!anchor) return { status: "orphaned" };
  const startMs = anchor.timelineMs + m.offsetMs;
  const endMs = startMs + Math.round(m.frames * frameMs(p.settings.fps));
  const tol = frameMs(p.settings.fps) + 1;
  let inSync = true;
  for (const id of m.wordIds) {
    const i = idx.get(id);
    const w = i === undefined ? undefined : tr.words[i];
    const at = w ? placeSourceTime(p, m.assetId, w.startMs) : null;
    if (!w || !at || Math.abs(at.timelineMs - anchor.timelineMs - (w.startMs - first.startMs)) > tol) {
      inSync = false;
      break;
    }
  }
  return { status: inSync ? "ok" : "out_of_sync", startMs, endMs };
}

/** Segments that have a usable motion clip, keyed `assetId/segmentId`. Their plain captions are hidden. */
export function segmentsWithMotion(p: Project): Set<string> {
  const motionTrack = firstTrackOfKind(p, "motion");
  const s = new Set<string>();
  if (motionTrack?.hidden) return s;
  for (const m of Object.values(p.motion)) {
    if (!m.hidden && placeMotion(p, m).status !== "orphaned") s.add(`${m.assetId}/${m.segmentId}`);
  }
  return s;
}

export function projectDuration(p: Project): Ms {
  let end = 0;
  for (const c of Object.values(p.clips)) end = Math.max(end, clipEnd(c));
  for (const m of Object.values(p.motion)) {
    const pl = placeMotion(p, m);
    if (pl.status !== "orphaned") end = Math.max(end, pl.endMs);
  }
  return end;
}

// ---------- Snapping ----------

export function snapTargets(p: Project, playheadMs: Ms, ignoreId?: string): Ms[] {
  const t: Ms[] = [0, playheadMs];
  for (const c of Object.values(p.clips)) {
    if (c.id === ignoreId) continue;
    t.push(c.startMs, clipEnd(c));
  }
  return t;
}

/** Nearest target within `threshold`, else `value`. */
export function snap(value: Ms, targets: Ms[], threshold: Ms): Ms {
  let best = value;
  let dist = threshold + 1;
  for (const t of targets) {
    const d = Math.abs(t - value);
    if (d <= threshold && d < dist) {
      best = t;
      dist = d;
    }
  }
  return best;
}

// ---------- Edits ----------

/** Fades never run past the clip, and in and out together fit inside it. */
function fitFades(c: MediaClip): MediaClip {
  const len = clipLength(c);
  const fit = (a: Ms, b: Ms): [Ms, Ms] => {
    a = clamp(Math.round(a), 0, len);
    b = clamp(Math.round(b), 0, len);
    if (a + b <= len) return [a, b];
    const k = len / (a + b);
    return [Math.floor(a * k), Math.floor(b * k)];
  };
  const [vi, vo] = fit(c.videoFadeInMs, c.videoFadeOutMs);
  const [ai, ao] = fit(c.audioFadeInMs, c.audioFadeOutMs);
  if (vi === c.videoFadeInMs && vo === c.videoFadeOutMs && ai === c.audioFadeInMs && ao === c.audioFadeOutMs) return c;
  return { ...c, videoFadeInMs: vi, videoFadeOutMs: vo, audioFadeInMs: ai, audioFadeOutMs: ao };
}

function withClip(p: Project, c: MediaClip): Project {
  return { ...p, clips: { ...p.clips, [c.id]: fitFades(c) } };
}

/** Shift every clip on `trackId` that starts at or after `fromMs` by `deltaMs`. */
function shiftAfter(p: Project, trackId: string, fromMs: Ms, deltaMs: Ms, ignoreId?: string): Project {
  if (deltaMs === 0) return p;
  const clips = { ...p.clips };
  for (const c of clipsOnTrack(p, trackId)) {
    if (c.id !== ignoreId && c.startMs >= fromMs - EDGE_TOLERANCE_MS) clips[c.id] = { ...c, startMs: Math.max(0, c.startMs + deltaMs) };
  }
  return { ...p, clips };
}

export function addClip(p: Project, asset: Asset, trackId: string, startMs?: Ms): { project: Project; clip: MediaClip } {
  const at = snapToFrame(startMs ?? trackEnd(p, trackId), p.settings.fps);
  let clip = newMediaClip(asset, trackId, at);
  const hit = overlaps(p, trackId, clip.startMs, clipEnd(clip));
  if (hit) clip = { ...clip, startMs: trackEnd(p, trackId) };
  return { project: withClip(p, clip), clip };
}

/** Move a clip, snapping either edge. Refuses positions that overlap another clip. */
export function moveClip(p: Project, id: string, startMs: Ms, snapThreshold: Ms, playheadMs: Ms, trackId?: string): Project {
  const c = p.clips[id];
  if (!c) return p;
  const target = trackId ?? c.trackId;
  const len = clipLength(c);
  const targets = snapTargets(p, playheadMs, id);
  const sStart = snap(startMs, targets, snapThreshold);
  const sEnd = snap(startMs + len, targets, snapThreshold) - len;
  let next = Math.abs(sStart - startMs) <= Math.abs(sEnd - startMs) ? sStart : sEnd;
  next = snapToFrame(Math.max(0, next), p.settings.fps);
  if (overlaps(p, target, next, next + len, id)) return p;
  return withClip(p, { ...c, startMs: next, trackId: target });
}

/** Trim one edge to a timeline time, within the source and the neighbours. */
export function trimClip(p: Project, id: string, edge: "start" | "end", timelineMs: Ms, snapThreshold: Ms, playheadMs: Ms): Project {
  const c = p.clips[id];
  const asset = c && p.assets[c.assetId];
  if (!c || !asset) return p;
  const fps = p.settings.fps;
  const minLen = MIN_CLIP_FRAMES * frameMs(fps);
  const t = snapToFrame(snap(timelineMs, snapTargets(p, playheadMs, id), snapThreshold), fps);
  const neighbours = clipsOnTrack(p, c.trackId).filter((o) => o.id !== id);
  if (edge === "start") {
    const prevEnd = neighbours.filter((o) => clipEnd(o) <= c.startMs + EDGE_TOLERANCE_MS).reduce((m, o) => Math.max(m, clipEnd(o)), 0);
    const earliest = Math.max(prevEnd, Math.ceil(timelineAt(c, 0)), 0);
    const start = Math.min(Math.max(t, earliest), clipEnd(c) - minLen);
    const inMs = clamp(Math.round(sourceAt(c, start)), 0, c.outMs - 1);
    return withClip(p, { ...c, startMs: start, inMs });
  }
  const nextStart = neighbours.filter((o) => o.startMs >= clipEnd(c) - EDGE_TOLERANCE_MS).reduce((m, o) => Math.min(m, o.startMs), Infinity);
  const latest = Math.min(nextStart, Math.floor(timelineAt(c, asset.durationMs)));
  const end = Math.max(Math.min(t, latest), c.startMs + minLen);
  return withClip(p, { ...c, outMs: Math.min(asset.durationMs, Math.round(sourceAt(c, end))) });
}

/** Cut a clip in two at a timeline time. Both halves keep the clip's settings. */
export function splitClip(p: Project, id: string, atMs: Ms): { project: Project; rightId: string | null } {
  const c = p.clips[id];
  if (!c) return { project: p, rightId: null };
  const fps = p.settings.fps;
  const at = snapToFrame(atMs, fps);
  const minLen = frameMs(fps) - 0.5;
  if (at - c.startMs < minLen || clipEnd(c) - at < minLen) return { project: p, rightId: null };
  const cut = Math.round(sourceAt(c, at));
  // The fade in stays on the left half and the fade out on the right, so the cut itself plays at full level.
  const left: MediaClip = { ...c, outMs: cut, videoFadeOutMs: 0, audioFadeOutMs: 0 };
  const right: MediaClip = { ...c, id: newId("c"), startMs: at, inMs: cut, videoFadeInMs: 0, audioFadeInMs: 0 };
  return { project: withClip(withClip(p, left), right), rightId: right.id };
}

export function deleteClip(p: Project, id: string): Project {
  if (!p.clips[id]) return p;
  const clips = { ...p.clips };
  delete clips[id];
  return { ...p, clips };
}

export function duplicateClip(p: Project, id: string): { project: Project; id: string | null } {
  const c = p.clips[id];
  if (!c) return { project: p, id: null };
  const len = clipLength(c);
  let start = clipEnd(c);
  if (overlaps(p, c.trackId, start, start + len)) start = trackEnd(p, c.trackId);
  const copy: MediaClip = { ...c, id: newId("c"), startMs: start };
  return { project: withClip(p, copy), id: copy.id };
}

/**
 * Delete a clip and close the gap: every later clip on the same track moves
 * left by the clip's length. Captions and motion follow, because they are
 * placed from the clips.
 */
export function rippleDeleteClip(p: Project, id: string): Project {
  const c = p.clips[id];
  if (!c) return p;
  return shiftAfter(deleteClip(p, id), c.trackId, clipEnd(c), -clipLength(c));
}

/** Pack a track's clips end to end from the start of the timeline, keeping their order. */
export function closeGaps(p: Project, trackId: string): Project {
  const fps = p.settings.fps;
  const clips = { ...p.clips };
  let cursor = 0;
  let changed = false;
  for (const c of clipsOnTrack(p, trackId)) {
    const start = snapToFrame(cursor, fps);
    if (start < c.startMs) {
      clips[c.id] = { ...c, startMs: start };
      changed = true;
    }
    cursor = (clips[c.id] ?? c).startMs + clipLength(c);
  }
  return changed ? { ...p, clips } : p;
}

/**
 * Ripple trim (Q and W): trim one edge to timeline time `t`, then pull every
 * later clip on the track left by the length removed, so no gap is left.
 * A start trim keeps the clip where it began; the cut-away source is gone
 * and the rest of the clip slides into its place. Returns `p` unchanged
 * when `t` is not at least a frame inside the clip.
 */
export function rippleTrimClip(p: Project, id: string, edge: "start" | "end", t: Ms): Project {
  const c = p.clips[id];
  if (!c) return p;
  const fps = p.settings.fps;
  const at = snapToFrame(t, fps);
  const oneFrame = frameMs(fps) - 0.5;
  if (at - c.startMs < oneFrame || clipEnd(c) - at < oneFrame) return p;
  const trimmed = trimClip(p, id, edge, at, 0, at);
  const n = trimmed.clips[id];
  if (!n) return p;
  const removed = clipLength(c) - clipLength(n);
  if (removed <= 0) return p;
  const placed = edge === "start" ? withClip(trimmed, { ...n, startMs: c.startMs }) : trimmed;
  return shiftAfter(placed, c.trackId, clipEnd(c), -removed, id);
}

// ---------- Edit points ----------

/**
 * Every place the picture or sound can change: the start and end of each
 * clip on a visible track, plus the start and end of the timeline. Sorted,
 * without repeats. Locked tracks count, because moving the playhead is not
 * an edit.
 */
export function editPoints(p: Project): Ms[] {
  const visible = new Set(p.tracks.filter((t) => !t.hidden).map((t) => t.id));
  const points = new Set<Ms>([0, projectDuration(p)]);
  for (const c of Object.values(p.clips)) {
    if (!visible.has(c.trackId)) continue;
    points.add(c.startMs);
    points.add(clipEnd(c));
  }
  return [...points].sort((a, b) => a - b);
}

/**
 * The first edit point before (`dir` -1) or after (`dir` 1) time `t`, or null.
 * Points within `toleranceMs` of `t` are skipped, so standing on a cut moves
 * on to the next one instead of staying put.
 */
export function adjacentEditPoint(points: Ms[], t: Ms, dir: -1 | 1, toleranceMs: Ms): Ms | null {
  if (dir > 0) return points.find((x) => x > t + toleranceMs) ?? null;
  for (let i = points.length - 1; i >= 0; i--) {
    const x = points[i]!;
    if (x < t - toleranceMs) return x;
  }
  return null;
}

/**
 * Change a clip's speed. Its source range stays the same, so its length on
 * the timeline changes; later clips on the same track move with its end so
 * nothing overlaps and no gap opens. The new length is whole frames.
 */
export function setClipSpeed(p: Project, id: string, speed: number): Project {
  const c = p.clips[id];
  const asset = c && p.assets[c.assetId];
  if (!c || !asset || !Number.isFinite(speed)) return p;
  const s = Math.round(clamp(speed, MIN_SPEED, MAX_SPEED) * 100) / 100;
  if (s === c.speed) return p;
  const fps = p.settings.fps;
  const len = Math.max(MIN_CLIP_FRAMES * frameMs(fps), snapToFrame((c.outMs - c.inMs) / s, fps));
  const outMs = Math.min(asset.durationMs, c.inMs + Math.round(len * s));
  const next: MediaClip = { ...c, speed: s, outMs };
  const delta = clipLength(next) - clipLength(c);
  return withClip(shiftAfter(p, c.trackId, clipEnd(c), delta, id), next);
}

/**
 * Detach a video clip's sound: a copy of the clip goes on an audio track
 * (the first with room, or a new one) and the video clip is muted. Both keep
 * the same source range and speed, so they stay in sync until moved.
 */
export function detachAudio(p: Project, id: string): { project: Project; clipId: string | null } {
  const c = p.clips[id];
  const asset = c && p.assets[c.assetId];
  const track = c && trackById(p, c.trackId);
  if (!c || !asset?.hasAudio || track?.kind !== "video" || c.muted) return { project: p, clipId: null };
  const end = clipEnd(c);
  let next = p;
  let target = p.tracks.find((t) => t.kind === "audio" && !t.locked && !overlaps(p, t.id, c.startMs, end));
  if (!target) {
    const made = insertTrack(p, "audio");
    next = made.project;
    target = made.track;
  }
  const audio: MediaClip = {
    ...c,
    id: newId("c"),
    trackId: target.id,
    transform: DEFAULT_TRANSFORM,
    crop: NO_CROP,
    chromaKey: { ...c.chromaKey, enabled: false },
    videoFadeInMs: 0,
    videoFadeOutMs: 0,
  };
  next = withClip(withClip(next, { ...c, muted: true }), audio);
  return { project: next, clipId: audio.id };
}

export function updateClip(p: Project, id: string, patch: Partial<MediaClip>): Project {
  const c = p.clips[id];
  return c ? withClip(p, { ...c, ...patch, id }) : p;
}

export function updateTrack(p: Project, id: string, patch: Partial<Track>): Project {
  return { ...p, tracks: p.tracks.map((t) => (t.id === id ? { ...t, ...patch, id } : t)) };
}

// ---------- Tracks ----------

/** Top-to-bottom order of track kinds (design system: overlays above subtitles above video above audio). */
const KIND_RANK: Record<TrackKind, number> = { motion: 0, caption: 1, video: 2, audio: 3 };
const KIND_NAME: Record<TrackKind, string> = { motion: "Motion", caption: "Captions", video: "Video", audio: "Audio" };

/** "Motion" and "Captions" are single tracks; video and audio are numbered past the highest number in use. */
function trackName(p: Project, kind: TrackKind): string {
  if (kind === "motion" || kind === "caption") return KIND_NAME[kind];
  const used = p.tracks.filter((t) => t.kind === kind).map((t) => Number(/ (\d+)$/.exec(t.name)?.[1] ?? 0));
  return `${KIND_NAME[kind]} ${Math.max(0, ...used) + 1}`;
}

/**
 * Insert a new track where its kind belongs. A new video track goes on top of
 * the other video tracks, because higher tracks draw over lower ones; every
 * other kind goes below the tracks of its own kind.
 */
function insertTrack(p: Project, kind: TrackKind): { project: Project; track: Track } {
  const track: Track = { id: newId("t"), kind, name: trackName(p, kind), locked: false, hidden: false, muted: false };
  const rank = KIND_RANK[kind];
  let at = p.tracks.findIndex((t) => (kind === "video" ? KIND_RANK[t.kind] >= rank : KIND_RANK[t.kind] > rank));
  if (at < 0) at = p.tracks.length;
  const tracks = [...p.tracks];
  tracks.splice(at, 0, track);
  return { project: { ...p, tracks }, track };
}

/** The user's "add track" buttons. */
export function addTrack(p: Project, kind: "video" | "audio"): Project {
  return insertTrack(p, kind).project;
}

/** The first track of `kind`, created if the project has none. */
export function ensureTrack(p: Project, kind: TrackKind): { project: Project; track: Track } {
  const existing = firstTrackOfKind(p, kind);
  return existing ? { project: p, track: existing } : insertTrack(p, kind);
}

/** Put an asset at the end of the first video track (or audio track, for sound only), creating the track if needed. */
export function placeAsset(p: Project, asset: Asset, startMs?: Ms): { project: Project; clip: MediaClip } {
  const { project, track } = ensureTrack(p, asset.hasVideo ? "video" : "audio");
  return addClip(project, asset, track.id, startMs);
}

/**
 * Remove a track and what sits on it: its media clips, or for the Motion
 * track its motion clips. Deleting the Captions track stops captions showing,
 * but transcripts stay: motion anchors to their words, and the track can be
 * added back without transcribing again.
 */
export function deleteTrack(p: Project, id: string): Project {
  if (!trackById(p, id)) return p;
  const clips = Object.fromEntries(Object.entries(p.clips).filter(([, c]) => c.trackId !== id));
  const motion = Object.fromEntries(Object.entries(p.motion).filter(([, m]) => m.trackId !== id));
  return { ...p, tracks: p.tracks.filter((t) => t.id !== id), clips, motion };
}

/** What deleting a track would remove, for the confirmation; null when it is empty. */
export function trackContents(p: Project, t: Track): string | null {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (t.kind === "caption") return placedCaptions(p).length > 0 ? "captions" : null;
  if (t.kind === "motion") {
    const n = Object.values(p.motion).filter((m) => m.trackId === t.id).length;
    return n > 0 ? plural(n, "motion clip") : null;
  }
  const n = clipsOnTrack(p, t.id).length;
  return n > 0 ? plural(n, "clip") : null;
}

/**
 * Move a track one place up (-1) or down (+1) among tracks of its own kind.
 * Kinds keep their fixed order (motion, captions, video, audio), so a track
 * never crosses into another kind's group.
 */
export function moveTrack(p: Project, id: string, dir: -1 | 1): Project {
  const i = p.tracks.findIndex((t) => t.id === id);
  const j = i + dir;
  const a = p.tracks[i];
  const b = p.tracks[j];
  if (!a || !b || a.kind !== b.kind) return p;
  const tracks = [...p.tracks];
  tracks[i] = b;
  tracks[j] = a;
  return { ...p, tracks };
}

/** Video tracks in draw order: bottom first. */
export function videoTracksBottomUp(p: Project): Track[] {
  return p.tracks.filter((t) => t.kind === "video").reverse();
}

export function isLocked(p: Project, trackId: string): boolean {
  return trackById(p, trackId)?.locked ?? false;
}
