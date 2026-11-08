/**
 * Pure timeline logic: placement, edits, snapping, and word anchoring.
 *
 * Every function takes a project and returns a value or a *new* project, so
 * the store can keep old projects for undo and React can compare by identity.
 */
import type {
  Asset,
  MediaClip,
  MotionClip,
  Ms,
  Project,
  Segment,
  Track,
  TrackKind,
  Transcript,
  Word,
} from "../types/project";
import { newId } from "./ids";
import { DEFAULT_FPS, frameMs, snapToFrame } from "./time";

export const MIN_CLIP_FRAMES = 2;

// ---------- Construction ----------

export function createProject(name = "Untitled project"): Project {
  const now = new Date().toISOString();
  const track = (kind: TrackKind, label: string): Track => ({
    id: newId("t"),
    kind,
    name: label,
    locked: false,
    hidden: false,
  });
  return {
    version: 1,
    id: newId("p"),
    name,
    createdAt: now,
    updatedAt: now,
    settings: { width: 1920, height: 1080, fps: DEFAULT_FPS },
    assets: {},
    tracks: [track("motion", "Motion"), track("caption", "Captions"), track("video", "Video 1"), track("audio", "Audio 1")],
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
    transform: { x: 0, y: 0, scale: 1, opacity: 1 },
    chromaKey: { enabled: false, color: "#00FF00", similarity: 0.14, smoothness: 0.08 },
    volume: 1,
  };
}

// ---------- Basic queries ----------

export const clipLength = (c: MediaClip): Ms => c.outMs - c.inMs;
export const clipEnd = (c: MediaClip): Ms => c.startMs + clipLength(c);

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
  return clipsOnTrack(p, trackId).find((c) => c.id !== ignoreId && start < clipEnd(c) && end > c.startMs);
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

/** Where a source time of an asset currently plays on the timeline, if anywhere. */
export function placeSourceTime(p: Project, assetId: string, sourceMs: Ms): { clip: MediaClip; timelineMs: Ms } | null {
  let best: { clip: MediaClip; timelineMs: Ms } | null = null;
  for (const c of Object.values(p.clips)) {
    if (c.assetId !== assetId || sourceMs < c.inMs || sourceMs >= c.outMs) continue;
    const t = c.startMs + (sourceMs - c.inMs);
    if (!best || t < best.timelineMs) best = { clip: c, timelineMs: t };
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
  const end = Math.min(clipEnd(at.clip), at.clip.startMs + (w.endMs - at.clip.inMs));
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

function withClip(p: Project, c: MediaClip): Project {
  return { ...p, clips: { ...p.clips, [c.id]: c } };
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
    const prevEnd = neighbours.filter((o) => clipEnd(o) <= c.startMs).reduce((m, o) => Math.max(m, clipEnd(o)), 0);
    const earliest = Math.max(prevEnd, c.startMs - c.inMs, 0);
    const start = Math.min(Math.max(t, earliest), clipEnd(c) - minLen);
    const delta = start - c.startMs;
    return withClip(p, { ...c, startMs: start, inMs: c.inMs + delta });
  }
  const nextStart = neighbours.filter((o) => o.startMs >= clipEnd(c)).reduce((m, o) => Math.min(m, o.startMs), Infinity);
  const latest = Math.min(nextStart, c.startMs + (asset.durationMs - c.inMs));
  const end = Math.max(Math.min(t, latest), c.startMs + minLen);
  return withClip(p, { ...c, outMs: c.inMs + (end - c.startMs) });
}

/** Cut a clip in two at a timeline time. Both halves keep the clip's settings. */
export function splitClip(p: Project, id: string, atMs: Ms): { project: Project; rightId: string | null } {
  const c = p.clips[id];
  if (!c) return { project: p, rightId: null };
  const fps = p.settings.fps;
  const at = snapToFrame(atMs, fps);
  const minLen = frameMs(fps) - 0.5;
  if (at - c.startMs < minLen || clipEnd(c) - at < minLen) return { project: p, rightId: null };
  const cut = c.inMs + (at - c.startMs);
  const left: MediaClip = { ...c, outMs: cut };
  const right: MediaClip = { ...c, id: newId("c"), startMs: at, inMs: cut };
  return { project: { ...p, clips: { ...p.clips, [left.id]: left, [right.id]: right } }, rightId: right.id };
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

export function updateClip(p: Project, id: string, patch: Partial<MediaClip>): Project {
  const c = p.clips[id];
  return c ? withClip(p, { ...c, ...patch, id }) : p;
}

export function updateTrack(p: Project, id: string, patch: Partial<Track>): Project {
  return { ...p, tracks: p.tracks.map((t) => (t.id === id ? { ...t, ...patch, id } : t)) };
}

export function addTrack(p: Project, kind: "video" | "audio"): Project {
  const n = p.tracks.filter((t) => t.kind === kind).length + 1;
  const track: Track = { id: newId("t"), kind, name: `${kind === "video" ? "Video" : "Audio"} ${n}`, locked: false, hidden: false };
  // Video tracks stack above existing video (draw order bottom-up); audio goes at the bottom.
  const tracks = [...p.tracks];
  const firstVideo = tracks.findIndex((t) => t.kind === "video");
  if (kind === "video" && firstVideo >= 0) tracks.splice(firstVideo, 0, track);
  else tracks.push(track);
  return { ...p, tracks };
}

/** Video tracks in draw order: bottom first. */
export function videoTracksBottomUp(p: Project): Track[] {
  return p.tracks.filter((t) => t.kind === "video").reverse();
}

export function isLocked(p: Project, trackId: string): boolean {
  return trackById(p, trackId)?.locked ?? false;
}
