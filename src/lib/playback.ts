/**
 * Preview playback: keeps the proxy <video> elements in step with the playhead.
 *
 * One element is the **master**: the clip under the playhead that has sound,
 * else the topmost. While playing, the playhead follows the master's own
 * clock, and holds while the master is seeking or buffering. The playhead
 * therefore never runs ahead of the media, so no seek is ever needed just to
 * catch up.
 *
 * The earlier design ran the playhead on the wall clock and re-seeked any
 * element more than 120 ms behind. A seek stops decoding until the element
 * catches up, while the wall clock keeps going, so it fell behind again: a
 * seek every second in Chrome, and continuous seeking in WebKit, which
 * stuttered the picture and silenced the audio. See learn/05.
 *
 * Elements that need to **start** (on Play, or when a clip comes under the
 * playhead) are first seeked into place; they all start on the same frame
 * once every one of them is ready, so two tracks begin together.
 *
 * Other elements playing at the same time (a second video track, music)
 * **follow** the playhead. Started together, they stay within a frame or
 * two on their own, so small drift is left alone. Only a smoothed drift over
 * a second (after a real stall) seeks, aimed ahead by the measured seek time
 * so the element lands in step instead of behind again.
 *
 * Two things that look like improvements and are not, measured in WebKit:
 * - Nudging a follower's playbackRate to close small gaps: every rate change
 *   disrupts WebKit's playback, and the follower fell further behind.
 * - Re-seeking at 300 ms: ten seeks in six seconds, each blocking the frame
 *   loop for up to 250 ms. Elements whose clip starts soon are
 * **pre-rolled** (seeked to the clip's first frame) so a cut does not stall.
 *
 * There is one element per track and asset (`elementKey`), not per asset:
 * after "Detach audio" the same file plays on a video track (picture, muted)
 * and an audio track (sound), and the two can be moved apart. Clips on one
 * track never overlap, so one element per track and asset is always enough.
 *
 * A clip's speed multiplies the transport speed into the element's
 * playbackRate; that rate is set when the clip starts and not changed while
 * it plays, so it is not the harmful nudging described above.
 */
import type { MediaClip, Ms, Project, Track } from "../types/project";
import { clipAt, clipAudible, clipsOnTrack, fadeGain, sourceAt, timelineAt } from "./timeline";

/** The parts of HTMLVideoElement that playback drives, so tests can fake it. */
export interface MediaEl {
  currentTime: number;
  paused: boolean;
  seeking: boolean;
  readyState: number;
  volume: number;
  playbackRate: number;
  error: unknown;
  play(): Promise<void>;
  pause(): void;
}

const HAVE_FUTURE_DATA = 3;
/** The playhead jumps to the master's time when they differ by more than this. */
const SNAP_MS = 50;
/** Elements within this of their target time count as in place. */
const IN_PLACE_MS = 40;
/** Followers further off than this are seeked instead of nudged. */
const RESEEK_MS = 1000;
/** Weight of the newest drift reading in the smoothed drift. */
const DRIFT_SMOOTHING = 0.1;
/** First guess at how long a seek takes, before one has been measured. */
const SEEK_GUESS_MS = 250;
/** Idle elements whose clip starts within this are seeked to its first frame. */
const PREROLL_MS = 1000;
/** Longest wait for every starting element to be ready; after it, the ready ones start alone. */
const START_WAIT_MS = 1500;

export interface StepInput {
  /** Playhead before this frame. */
  t: Ms;
  /** Wall-clock time since the last frame. */
  dt: number;
  playing: boolean;
  speed: number;
  /** Preview volume, 0..1. */
  volume: number;
}

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

/** The element that plays clip `c`: one per track and asset. */
export const elementKey = (c: Pick<MediaClip, "trackId" | "assetId">): string => `${c.trackId}|${c.assetId}`;

/** Tracks whose clips need an element: visible video tracks, and audio tracks that are visible and not muted. */
function playableTracks(p: Project): Track[] {
  return p.tracks.filter((t) => !t.hidden && (t.kind === "video" || (t.kind === "audio" && !t.muted)));
}

/** For each element, the clip it plays at `t`. */
export function drivingClips(p: Project, t: Ms): Map<string, MediaClip> {
  const out = new Map<string, MediaClip>();
  for (const track of playableTracks(p)) {
    const c = clipAt(p, track.id, t);
    if (c) out.set(elementKey(c), c);
  }
  return out;
}

/** The next clip of each element to start within `windowMs` after `t`, for pre-roll. */
function upcomingClips(p: Project, t: Ms, windowMs: number): Map<string, MediaClip> {
  const out = new Map<string, MediaClip>();
  for (const track of playableTracks(p)) {
    for (const c of clipsOnTrack(p, track.id)) {
      if (c.startMs <= t || c.startMs > t + windowMs) continue;
      const key = elementKey(c);
      const prev = out.get(key);
      if (!prev || c.startMs < prev.startMs) out.set(key, c);
    }
  }
  return out;
}

/** What the element for clip `c` should sound like at `t`: clip volume, mute, track mute, audio fades. */
export function clipVolume(p: Project, c: MediaClip, t: Ms, previewVolume: number): number {
  const track = p.tracks.find((x) => x.id === c.trackId);
  if (!clipAudible(p, c) || track?.muted) return 0;
  const v = c.volume * previewVolume * fadeGain(c, t, c.audioFadeInMs, c.audioFadeOutMs);
  return Math.min(1, Math.max(0, v));
}

export class Playback {
  private master: string | null = null;
  /** Last seek target per element while paused or pre-rolling, so a still playhead does not re-seek every frame. */
  private seekTargets = new Map<string, number>();
  /** Elements whose play() was refused; not retried until playback restarts. */
  private refused = new Set<string>();
  private wasPlaying = false;
  /** How long `startTogether` has been waiting. */
  private waitedMs = 0;
  /** Follower seeks in flight: time spent so far. */
  private seekingFor = new Map<string, number>();
  /** Smoothed time a follower seek takes, used to aim ahead. */
  private seekMs = SEEK_GUESS_MS;
  /** Smoothed drift per follower (ms behind the playhead). */
  private drift = new Map<string, number>();

  /** The asset currently setting the clock, for tests and diagnostics. */
  get masterId(): string | null {
    return this.master;
  }

  /** Advance one frame: steer every element and return the new playhead. */
  step(p: Project, els: ReadonlyMap<string, MediaEl>, input: StepInput): Ms {
    const { t, dt, playing, speed, volume } = input;
    if (playing !== this.wasPlaying) {
      this.wasPlaying = playing;
      this.master = null;
      this.seekTargets.clear();
      this.refused.clear();
      this.seekingFor.clear();
      this.drift.clear();
    }

    if (!playing) {
      this.showStill(p, els, t);
      return t;
    }

    let driving = drivingClips(p, t);
    this.pickMaster(p, els, driving);
    const masterWaiting = this.startTogether(els, driving, t, dt, speed);
    // Hold while the master gets ready; if it never does, fall back to the wall clock.
    const next = masterWaiting ? (this.waitedMs > START_WAIT_MS ? t + dt * speed : t) : this.advanceClock(els, driving, t, dt, speed);
    if (next !== t) driving = drivingClips(p, next);

    for (const [id, el] of els) {
      const c = driving.get(id);
      if (!c) {
        if (!el.paused) el.pause();
        continue;
      }
      const v = clipVolume(p, c, next, volume);
      if (Math.abs(el.volume - v) > 0.001) el.volume = v;
      if (id === this.master) {
        setRate(el, speed * c.speed);
        continue;
      }
      this.follow(id, el, sourceAt(c, next), speed * c.speed, dt);
    }

    this.preroll(p, els, driving, next);
    return next;
  }

  /** Paused: every element shows its frame at `t`, seeking only when `t` moves. */
  private showStill(p: Project, els: ReadonlyMap<string, MediaEl>, t: Ms) {
    const driving = drivingClips(p, t);
    for (const [id, el] of els) {
      if (!el.paused) el.pause();
      const c = driving.get(id);
      if (!c) continue;
      const want = sourceAt(c, t);
      const prev = this.seekTargets.get(id);
      if (prev === undefined || !near(prev, want, 1)) {
        this.seekTargets.set(id, want);
        el.currentTime = want / 1000;
      }
    }
  }

  /** Keep the master while its clip is under the playhead; otherwise prefer a clip with sound, then the topmost. */
  private pickMaster(p: Project, els: ReadonlyMap<string, MediaEl>, driving: Map<string, MediaClip>) {
    const usable = (id: string) => {
      const el = els.get(id);
      return !!el && !el.error && !this.refused.has(id);
    };
    if (this.master && driving.has(this.master) && usable(this.master)) return;
    const ids = [...driving.keys()].filter(usable);
    const audible = ids.find((id) => {
      const c = driving.get(id);
      return !!c && clipAudible(p, c) && !p.tracks.find((t) => t.id === c.trackId)?.muted;
    });
    this.master = audible ?? ids[0] ?? null;
  }

  /**
   * Seek every paused element under the playhead to its frame; once all of
   * them are ready, start them together. Returns true while the master is
   * among those waiting, so the playhead holds.
   */
  private startTogether(els: ReadonlyMap<string, MediaEl>, driving: Map<string, MediaClip>, t: Ms, dt: number, speed: number): boolean {
    const waiting: { id: string; el: MediaEl; rate: number; ready: boolean }[] = [];
    for (const [id, c] of driving) {
      const el = els.get(id);
      if (!el || !el.paused || el.error || this.refused.has(id)) continue;
      const want = sourceAt(c, t);
      if (!el.seeking && !near(el.currentTime * 1000, want, IN_PLACE_MS)) el.currentTime = want / 1000;
      waiting.push({ id, el, rate: speed * c.speed, ready: !el.seeking && el.readyState >= HAVE_FUTURE_DATA && near(el.currentTime * 1000, want, IN_PLACE_MS) });
    }
    if (waiting.length === 0) {
      this.waitedMs = 0;
      return false;
    }
    this.waitedMs += dt;
    // Start together once all are ready; after a long wait, start the ready ones rather than hold forever.
    const all = waiting.every((w) => w.ready);
    const go = waiting.filter((w) => w.ready && (all || this.waitedMs > START_WAIT_MS));
    for (const w of go) {
      setRate(w.el, w.rate); // before play(), so the clip starts at its own speed
      this.start(w.id, w.el);
    }
    if (all) this.waitedMs = 0;
    return waiting.some((w) => w.id === this.master && !go.includes(w));
  }

  /** Move the playhead by the master's clock, or by the wall clock when nothing is playing (a gap, or only overlays). */
  private advanceClock(els: ReadonlyMap<string, MediaEl>, driving: Map<string, MediaClip>, t: Ms, dt: number, speed: number): Ms {
    const wall = t + dt * speed;
    const id = this.master;
    const el = id ? els.get(id) : undefined;
    const c = id ? driving.get(id) : undefined;
    if (!id || !el || !c) return wall;
    // Just started (play() pending), seeking or buffering: hold.
    if (el.paused || el.seeking || el.readyState < HAVE_FUTURE_DATA) return t;

    const media = timelineAt(c, el.currentTime * 1000);
    if (media < t) return t; // the media has not caught up yet: hold rather than run ahead
    return Math.abs(media - wall) > SNAP_MS ? media : wall;
  }

  /** A running follower: seek it if it has fallen far off. Starting is `startTogether`'s job. `rate` is source ms per wall ms. */
  private follow(id: string, el: MediaEl, want: Ms, rate: number, dt: number) {
    const pending = this.seekingFor.get(id);
    if (pending !== undefined) {
      if (el.seeking || el.readyState < HAVE_FUTURE_DATA) {
        this.seekingFor.set(id, pending + dt);
        return;
      }
      this.seekingFor.delete(id);
      this.seekMs = Math.min(1000, 0.5 * this.seekMs + 0.5 * pending);
    }
    if (el.paused || el.seeking || el.readyState < HAVE_FUTURE_DATA) return;
    const now = want - el.currentTime * 1000;
    const smoothed = this.drift.get(id) ?? now;
    if (Math.abs(smoothed) > RESEEK_MS && Math.abs(now) > RESEEK_MS) {
      // Aim where the playhead will be when the seek completes.
      el.currentTime = (want + this.seekMs * rate) / 1000;
      this.seekingFor.set(id, 0);
      this.drift.delete(id);
      return;
    }
    const prev = this.drift.get(id);
    this.drift.set(id, prev === undefined ? now : prev + DRIFT_SMOOTHING * (now - prev));
    setRate(el, rate);
  }

  /** Seek idle elements to the first frame of a clip that starts soon, once. */
  private preroll(p: Project, els: ReadonlyMap<string, MediaEl>, driving: Map<string, MediaClip>, t: Ms) {
    for (const [id, c] of upcomingClips(p, t, PREROLL_MS)) {
      const el = els.get(id);
      if (!el || driving.has(id) || el.seeking) continue;
      if (this.seekTargets.get(id) === c.inMs) continue;
      this.seekTargets.set(id, c.inMs);
      if (!near(el.currentTime * 1000, c.inMs, 1)) el.currentTime = c.inMs / 1000;
    }
  }

  private start(id: string, el: MediaEl) {
    if (this.refused.has(id)) return;
    el.play().catch((e: unknown) => {
      // Autoplay refused or the file cannot play: stop asking every frame.
      if (!(e instanceof DOMException && e.name === "AbortError")) this.refused.add(id);
    });
  }
}

function setRate(el: MediaEl, rate: number) {
  if (Math.abs(el.playbackRate - rate) > 0.005) el.playbackRate = rate;
}
