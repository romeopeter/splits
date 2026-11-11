import { describe, expect, it } from "vitest";
import type { Asset, Project } from "../types/project";
import { Playback, clipVolume, elementKey, type MediaEl } from "./playback";
import { addTrack, createProject, detachAudio, placeAsset, updateClip } from "./timeline";

/** A video element stand-in: records seeks, plays and rate changes, and plays when `run` is called. */
class FakeEl implements MediaEl {
  paused = true;
  seeking = false;
  readyState = 4;
  volume = 1;
  error: unknown = null;
  refuse = false;
  plays = 0;
  seeks: number[] = [];
  rates: number[] = [];
  private t = 0;
  private rate = 1;
  get currentTime() {
    return this.t;
  }
  set currentTime(v: number) {
    this.seeks.push(v);
    this.t = v;
  }
  get playbackRate() {
    return this.rate;
  }
  set playbackRate(v: number) {
    this.rates.push(v);
    this.rate = v;
  }
  play(): Promise<void> {
    this.plays++;
    if (this.refuse) return Promise.reject(new DOMException("refused", "NotAllowedError"));
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  /** Let `ms` of wall time pass for this element. */
  run(ms: number) {
    if (!this.paused && !this.seeking && this.readyState >= 3) this.t += (ms / 1000) * this.rate;
  }
}

function asset(id: string, durationMs = 20_000): Asset {
  return {
    id,
    path: `/media/${id}.mov`,
    name: id,
    kind: "video",
    durationMs,
    hasVideo: true,
    hasAudio: true,
    width: 1920,
    height: 1080,
    fps: { num: 30, den: 1 },
    proxy: { status: "ready", progress: 1 },
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

/** Elements as Preview makes them: one per track and asset, here one fake per asset shared by its clips' keys. */
function elsFor(p: Project, byAsset: Record<string, FakeEl>): Map<string, FakeEl> {
  const m = new Map<string, FakeEl>();
  for (const c of Object.values(p.clips)) {
    const el = byAsset[c.assetId];
    if (el) m.set(elementKey(c), el);
  }
  return m;
}
const FRAME = 33;

/** Run `frames` frames: each element runs for one frame, then the playback steps. */
function play(pb: Playback, p: Project, els: Map<string, FakeEl>, t: number, frames: number): number {
  for (let i = 0; i < frames; i++) {
    for (const el of els.values()) el.run(FRAME);
    t = pb.step(p, els, { t, dt: FRAME, playing: true, speed: 1, volume: 1 });
  }
  return t;
}

describe("playback", () => {
  it("while paused, seeks once per playhead position", () => {
    const a = asset("a_1");
    const p = placeAsset({ ...createProject(), assets: { a_1: a } }, a, 0).project;
    const el = new FakeEl();
    const els = elsFor(p, { a_1: el });
    const pb = new Playback();
    for (let i = 0; i < 5; i++) pb.step(p, els, { t: 1000, dt: FRAME, playing: false, speed: 1, volume: 1 });
    expect(el.seeks).toEqual([1]);
    pb.step(p, els, { t: 1500, dt: FRAME, playing: false, speed: 1, volume: 1 });
    expect(el.seeks).toEqual([1, 1.5]);
  });

  it("follows the master's clock with no seeks while playing", () => {
    const a = asset("a_1");
    const p = placeAsset({ ...createProject(), assets: { a_1: a } }, a, 0).project;
    const el = new FakeEl();
    const els = elsFor(p, { a_1: el });
    const pb = new Playback();
    const t = play(pb, p, els, 0, 90);
    expect(el.plays).toBe(1);
    expect(el.seeks).toEqual([]);
    expect(Math.abs(t - el.currentTime * 1000)).toBeLessThanOrEqual(FRAME);
  });

  it("holds the playhead while the master is seeking", () => {
    const a = asset("a_1");
    const p = placeAsset({ ...createProject(), assets: { a_1: a } }, a, 0).project;
    const el = new FakeEl();
    el.seeking = true;
    const pb = new Playback();
    const t = play(pb, p, elsFor(p, { a_1: el }), 2000, 10);
    expect(t).toBe(2000);
    expect(el.plays).toBe(0);
  });

  it("starts two tracks on the same frame, and never changes a follower's rate", () => {
    const a = asset("a_1");
    const b = asset("a_2");
    let p: Project = { ...createProject(), assets: { a_1: a, a_2: b } };
    p = placeAsset(p, a, 0).project;
    p = addTrack(p, "video");
    p = { ...p, clips: { ...p.clips } };
    const top = p.tracks[0]!.id;
    p = placeAsset(p, b, 0).project; // lands on the first video track, which is now the new top one
    expect(Object.values(p.clips).find((c) => c.assetId === "a_2")!.trackId).toBe(top);

    const ea = new FakeEl();
    const eb = new FakeEl();
    eb.seeking = true; // not ready yet
    const els = elsFor(p, { a_1: ea, a_2: eb });
    const pb = new Playback();
    let t = play(pb, p, els, 0, 5);
    expect(ea.plays + eb.plays).toBe(0); // waiting for both
    expect(t).toBe(0);
    eb.seeking = false;
    t = play(pb, p, els, t, 1);
    expect([ea.plays, eb.plays]).toEqual([1, 1]);

    t = play(pb, p, els, t, 60);
    expect(ea.rates.every((r) => r === 1) && eb.rates.every((r) => r === 1)).toBe(true);
    expect([...ea.seeks, ...eb.seeks]).toEqual([]);
  });

  it("re-seeks a follower that fell more than a second behind, aimed ahead", () => {
    const a = asset("a_1");
    const b = asset("a_2");
    let p: Project = { ...createProject(), assets: { a_1: a, a_2: b } };
    p = placeAsset(p, a, 0).project;
    p = addTrack(p, "audio");
    const audio = p.tracks.find((t) => t.kind === "audio")!.id;
    p = { ...p, clips: { ...p.clips, c_b: { ...Object.values(p.clips)[0]!, id: "c_b", assetId: "a_2", trackId: audio } } };
    const ea = new FakeEl();
    const eb = new FakeEl();
    const els = elsFor(p, { a_1: ea, a_2: eb });
    const pb = new Playback();
    let t = play(pb, p, els, 0, 30);
    const follower = pb.masterId?.endsWith("|a_1") ? eb : ea;
    follower.readyState = 2; // buffering: still "playing" but not advancing, for 1.5 s
    t = play(pb, p, els, t, 45);
    expect(follower.seeks).toEqual([]); // never seek a buffering element
    follower.readyState = 4;
    t = play(pb, p, els, t, 60); // the smoothed drift passes a second
    expect(follower.seeks.length).toBe(1);
    expect(follower.seeks[0]! * 1000).toBeGreaterThan(t - 2000);
  });

  it("does not retry a refused play() every frame, and keeps time by the wall clock", async () => {
    const a = asset("a_1");
    const p = placeAsset({ ...createProject(), assets: { a_1: a } }, a, 0).project;
    const el = new FakeEl();
    el.refuse = true;
    const els = elsFor(p, { a_1: el });
    const pb = new Playback();
    play(pb, p, els, 0, 1);
    await flush();
    const t = play(pb, p, els, 0, 30);
    expect(el.plays).toBe(1);
    expect(t).toBeGreaterThan(29 * FRAME);
  });

  it("pre-rolls the next clip to its first frame, once", () => {
    const a = asset("a_1", 2000);
    const b = asset("a_2");
    let p: Project = { ...createProject(), assets: { a_1: a, a_2: b } };
    p = placeAsset(p, a, 0).project;
    const second = placeAsset(p, b, 2000);
    p = { ...second.project, clips: { ...second.project.clips, [second.clip.id]: { ...second.clip, inMs: 5000, outMs: 9000 } } };
    const ea = new FakeEl();
    const eb = new FakeEl();
    const els = elsFor(p, { a_1: ea, a_2: eb });
    const pb = new Playback();
    play(pb, p, els, 0, 40); // to about 1.3 s: the second clip starts within a second
    expect(eb.seeks).toEqual([5]);
    play(pb, p, els, 1320, 30); // across the cut
    expect(eb.seeks).toEqual([5]);
    expect(eb.paused).toBe(false);
    expect(ea.paused).toBe(true);
  });

  it("falls back to the wall clock if the master never becomes ready", () => {
    const a = asset("a_1");
    const p = placeAsset({ ...createProject(), assets: { a_1: a } }, a, 0).project;
    const el = new FakeEl();
    el.readyState = 1;
    const pb = new Playback();
    const t = play(pb, p, elsFor(p, { a_1: el }), 0, 60);
    expect(t).toBeGreaterThan(0);
  });

  it("plays a sped-up clip at its speed and moves the playhead by timeline time", () => {
    const a = asset("a_1");
    let p = placeAsset({ ...createProject(), assets: { a_1: a } }, a, 0).project;
    const id = Object.keys(p.clips)[0]!;
    p = updateClip(p, id, { speed: 2, outMs: 20_000 });
    const el = new FakeEl();
    const pb = new Playback();
    const t = play(pb, p, elsFor(p, { a_1: el }), 0, 90);
    expect(el.rates[0]).toBe(2); // set before play(), never nudged afterwards
    expect(el.rates.every((r) => r === 2)).toBe(true);
    // Three seconds of wall time: six seconds of source, three on the timeline.
    expect(Math.abs(t - (el.currentTime * 1000) / 2)).toBeLessThanOrEqual(FRAME);
    expect(t).toBeGreaterThan(2800);
  });

  it("plays detached audio from its own element, with the video's element silent", () => {
    const a = asset("a_1");
    let p = placeAsset({ ...createProject(), assets: { a_1: a } }, a, 0).project;
    const videoId = Object.keys(p.clips)[0]!;
    p = detachAudio(p, videoId).project;
    const audio = Object.values(p.clips).find((c) => c.id !== videoId)!;
    const ev = new FakeEl();
    const ea = new FakeEl();
    const els = new Map([
      [elementKey(p.clips[videoId]!), ev],
      [elementKey(audio), ea],
    ]);
    const pb = new Playback();
    play(pb, p, els, 0, 30);
    expect(pb.masterId).toBe(elementKey(audio)); // the clock follows the clip you hear
    expect(ev.volume).toBe(0);
    expect(ea.volume).toBe(1);
    expect(ev.paused || ea.paused).toBe(false);
  });

  it("silences muted clips and tracks, and applies sound fades", () => {
    const a = asset("a_1");
    let p = placeAsset({ ...createProject(), assets: { a_1: a } }, a, 0).project;
    const c = Object.values(p.clips)[0]!;
    expect(clipVolume(p, c, 1000, 1)).toBe(1);
    expect(clipVolume(p, { ...c, muted: true }, 1000, 1)).toBe(0);
    const faded = { ...c, audioFadeInMs: 1000, audioFadeOutMs: 2000 };
    expect(clipVolume(p, faded, 0, 1)).toBe(0);
    expect(clipVolume(p, faded, 500, 1)).toBeCloseTo(0.5);
    expect(clipVolume(p, faded, 19_000, 0.8)).toBeCloseTo(0.4);
    p = { ...p, tracks: p.tracks.map((t) => ({ ...t, muted: true })) };
    expect(clipVolume(p, c, 1000, 1)).toBe(0);
  });
});
