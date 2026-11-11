/**
 * Text clips on the timeline: add, move, trim, split, delete, duplicate and
 * the ripple edits. Text clips live on text tracks and never overlap on one
 * track; adding text where a track is busy makes a new text track, so two
 * titles can show at once.
 *
 * Like media clips, times are integer ms on whole frames, and every edit is
 * a pure function from project to project, so undo is just the old project.
 */
import type { Ms, Project, TextAnimation, TextClip, TextStyle } from "../types/project";
import { newId } from "./ids";
import { clamp, frameMs, snapToFrame } from "./time";
import { MIN_CLIP_FRAMES, insertTrack, snap, snapMove, snapTargets, textEnd } from "./timeline";
import { DEFAULT_TEXT_STYLE, NO_ANIMATION } from "./textStyle";

/** A new text clip lasts three seconds: long enough to read a short title. */
export const DEFAULT_TEXT_MS = 3000;
/** Same small overlap allowance as media clips (`EDGE_TOLERANCE_MS` in timeline.ts). */
const EDGE_TOLERANCE_MS = 2;

export function textsOnTrack(p: Project, trackId: string): TextClip[] {
  return Object.values(p.texts)
    .filter((t) => t.trackId === trackId)
    .sort((a, b) => a.startMs - b.startMs);
}

/** The text clip on `trackId` showing at time `t`. */
export function textAt(p: Project, trackId: string, t: Ms): TextClip | undefined {
  return textsOnTrack(p, trackId).find((x) => t >= x.startMs && t < textEnd(x));
}

function textOverlaps(p: Project, trackId: string, start: Ms, end: Ms, ignoreId?: string): TextClip | undefined {
  return textsOnTrack(p, trackId).find((x) => x.id !== ignoreId && start < textEnd(x) - EDGE_TOLERANCE_MS && end > x.startMs + EDGE_TOLERANCE_MS);
}

function withText(p: Project, t: TextClip): Project {
  return { ...p, texts: { ...p.texts, [t.id]: fitAnimations(t) } };
}

/** In and out animations never run past the clip, and together fit inside it. */
function fitAnimations(t: TextClip): TextClip {
  const a = clamp(t.animIn.durationMs, 0, t.durationMs);
  const b = clamp(t.animOut.durationMs, 0, t.durationMs);
  if (a + b <= t.durationMs) return a === t.animIn.durationMs && b === t.animOut.durationMs ? t : { ...t, animIn: { ...t.animIn, durationMs: a }, animOut: { ...t.animOut, durationMs: b } };
  const k = t.durationMs / (a + b);
  return { ...t, animIn: { ...t.animIn, durationMs: Math.floor(a * k) }, animOut: { ...t.animOut, durationMs: Math.floor(b * k) } };
}

export function newTextClip(trackId: string, startMs: Ms, durationMs: Ms, look: { style?: TextStyle; animIn?: TextAnimation } = {}): TextClip {
  return {
    id: newId("x"),
    trackId,
    startMs,
    durationMs,
    text: "Text",
    x: 0,
    y: 0,
    rotation: 0,
    opacity: 1,
    style: look.style ?? DEFAULT_TEXT_STYLE,
    animIn: look.animIn ?? NO_ANIMATION,
    animOut: NO_ANIMATION,
  };
}

/**
 * Add a text clip at `atMs`, on the first unlocked, visible text track with
 * room for it, or on a new text track on top.
 */
export function addText(p: Project, atMs: Ms, look: { style?: TextStyle; animIn?: TextAnimation } = {}): { project: Project; id: string } {
  const fps = p.settings.fps;
  const start = snapToFrame(Math.max(0, atMs), fps);
  const end = start + DEFAULT_TEXT_MS;
  let project = p;
  let track = p.tracks.find((t) => t.kind === "text" && !t.locked && !t.hidden && !textOverlaps(p, t.id, start, end));
  if (!track) ({ project, track } = insertTrack(p, "text"));
  const clip = newTextClip(track.id, start, snapToFrame(DEFAULT_TEXT_MS, fps), look);
  return { project: withText(project, clip), id: clip.id };
}

export function updateText(p: Project, id: string, patch: Partial<TextClip>): Project {
  const t = p.texts[id];
  return t ? withText(p, { ...t, ...patch }) : p;
}

export function updateTextStyle(p: Project, id: string, patch: Partial<TextStyle>): Project {
  const t = p.texts[id];
  return t ? withText(p, { ...t, style: { ...t.style, ...patch } }) : p;
}

/** Move a text clip, snapping either edge. Refuses positions that overlap another text clip. */
export function moveText(p: Project, id: string, startMs: Ms, snapThreshold: Ms, playheadMs: Ms, trackId?: string): Project {
  const c = p.texts[id];
  if (!c) return p;
  const target = trackId ?? c.trackId;
  const len = c.durationMs;
  const next = snapToFrame(Math.max(0, snapMove(startMs, len, snapTargets(p, playheadMs, id), snapThreshold)), p.settings.fps);
  if (textOverlaps(p, target, next, next + len, id)) return p;
  return withText(p, { ...c, startMs: next, trackId: target });
}

/** Trim one edge to timeline time `t`, within the neighbours and at least two frames long. Text has no source, so it can grow freely. */
export function trimText(p: Project, id: string, edge: "start" | "end", t: Ms, snapThreshold: Ms, playheadMs: Ms): Project {
  const c = p.texts[id];
  if (!c) return p;
  const fps = p.settings.fps;
  const minLen = MIN_CLIP_FRAMES * frameMs(fps);
  const at = snapToFrame(snap(t, snapTargets(p, playheadMs, id), snapThreshold), fps);
  const others = textsOnTrack(p, c.trackId).filter((o) => o.id !== id);
  const end = textEnd(c);
  if (edge === "start") {
    const prevEnd = others.filter((o) => textEnd(o) <= c.startMs + EDGE_TOLERANCE_MS).reduce((m, o) => Math.max(m, textEnd(o)), 0);
    const start = Math.round(Math.min(Math.max(at, prevEnd, 0), end - minLen));
    return withText(p, { ...c, startMs: start, durationMs: end - start });
  }
  const nextStart = others.filter((o) => o.startMs >= end - EDGE_TOLERANCE_MS).reduce((m, o) => Math.min(m, o.startMs), Infinity);
  const newEnd = Math.round(Math.max(Math.min(at, nextStart), c.startMs + minLen));
  return withText(p, { ...c, durationMs: newEnd - c.startMs });
}

/**
 * Cut a text clip in two. Both halves keep the text and style; the in
 * animation stays on the left half and the out animation on the right, so
 * the cut itself shows the text steady (as fades do for media clips).
 */
export function splitText(p: Project, id: string, atMs: Ms): { project: Project; rightId: string | null } {
  const c = p.texts[id];
  if (!c) return { project: p, rightId: null };
  const at = snapToFrame(atMs, p.settings.fps);
  const oneFrame = frameMs(p.settings.fps) - 0.5;
  if (at - c.startMs < oneFrame || textEnd(c) - at < oneFrame) return { project: p, rightId: null };
  const left: TextClip = { ...c, durationMs: at - c.startMs, animOut: { ...c.animOut, kind: "none" } };
  const right: TextClip = { ...c, id: newId("x"), startMs: at, durationMs: textEnd(c) - at, animIn: { ...c.animIn, kind: "none" } };
  return { project: withText(withText(p, left), right), rightId: right.id };
}

export function deleteText(p: Project, id: string): Project {
  if (!p.texts[id]) return p;
  const texts = { ...p.texts };
  delete texts[id];
  return { ...p, texts };
}

/** A copy right after the clip, or at the end of its track when that spot is taken. */
export function duplicateText(p: Project, id: string): { project: Project; id: string | null } {
  const c = p.texts[id];
  if (!c) return { project: p, id: null };
  let start = textEnd(c);
  if (textOverlaps(p, c.trackId, start, start + c.durationMs)) start = textsOnTrack(p, c.trackId).reduce((m, o) => Math.max(m, textEnd(o)), 0);
  const copy: TextClip = { ...c, id: newId("x"), startMs: start };
  return { project: withText(p, copy), id: copy.id };
}

/** Shift every text clip on `trackId` that starts at or after `fromMs` by `deltaMs`. */
function shiftTextsAfter(p: Project, trackId: string, fromMs: Ms, deltaMs: Ms, ignoreId?: string): Project {
  if (deltaMs === 0) return p;
  const texts = { ...p.texts };
  for (const t of textsOnTrack(p, trackId)) {
    if (t.id !== ignoreId && t.startMs >= fromMs - EDGE_TOLERANCE_MS) texts[t.id] = { ...t, startMs: Math.max(0, t.startMs + deltaMs) };
  }
  return { ...p, texts };
}

/** Delete a text clip and pull later text clips on its track left into the gap. */
export function rippleDeleteText(p: Project, id: string): Project {
  const c = p.texts[id];
  if (!c) return p;
  return shiftTextsAfter(deleteText(p, id), c.trackId, textEnd(c), -c.durationMs);
}

/** Q and W for text: trim an edge to `t` and close the gap on the track (see `rippleTrimClip`). */
export function rippleTrimText(p: Project, id: string, edge: "start" | "end", t: Ms): Project {
  const c = p.texts[id];
  if (!c) return p;
  const fps = p.settings.fps;
  const at = snapToFrame(t, fps);
  const oneFrame = frameMs(fps) - 0.5;
  if (at - c.startMs < oneFrame || textEnd(c) - at < oneFrame) return p;
  const trimmed = trimText(p, id, edge, at, 0, at);
  const n = trimmed.texts[id];
  if (!n) return p;
  const removed = c.durationMs - n.durationMs;
  if (removed <= 0) return p;
  const placed = edge === "start" ? withText(trimmed, { ...n, startMs: c.startMs }) : trimmed;
  return shiftTextsAfter(placed, c.trackId, textEnd(c), -removed, id);
}
