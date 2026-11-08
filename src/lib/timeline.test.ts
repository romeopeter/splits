import { describe, expect, it } from "vitest";
import type { Asset, MotionClip, Project, Transcript } from "../types/project";
import {
  addClip,
  clipEnd,
  createProject,
  moveClip,
  placeMotion,
  placedCaptions,
  projectDuration,
  segmentsWithMotion,
  snap,
  splitClip,
  trimClip,
} from "./timeline";
import { msToFrame, snapToFrame, timecode } from "./time";

function asset(id = "a_1", durationMs = 10_000): Asset {
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

function transcript(): Transcript {
  // Two segments: "Hello world" at 1.0–1.9 s, "Again here" at 5.0–5.9 s.
  return {
    assetId: "a_1",
    model: "tiny.en",
    language: "en",
    words: [
      { id: "w_1", text: "Hello", startMs: 1000, endMs: 1300 },
      { id: "w_2", text: "world", startMs: 1400, endMs: 1900 },
      { id: "w_3", text: "Again", startMs: 5000, endMs: 5300 },
      { id: "w_4", text: "here", startMs: 5400, endMs: 5900 },
    ],
    segments: [
      { id: "s_1", firstWordId: "w_1", lastWordId: "w_2" },
      { id: "s_2", firstWordId: "w_3", lastWordId: "w_4" },
    ],
  };
}

function setup(): { p: Project; clipId: string; videoTrack: string } {
  let p = createProject();
  const a = asset();
  p = { ...p, settings: { ...p.settings, fps: { num: 30, den: 1 } }, assets: { [a.id]: a }, transcripts: { a_1: transcript() } };
  const videoTrack = p.tracks.find((t) => t.kind === "video")!.id;
  const r = addClip(p, a, videoTrack, 0);
  return { p: r.project, clipId: r.clip.id, videoTrack };
}

function motion(p: Project): MotionClip {
  return {
    id: "m_1",
    trackId: p.tracks[0]!.id,
    assetId: "a_1",
    segmentId: "s_1",
    firstWordId: "w_1",
    lastWordId: "w_2",
    wordIds: ["w_1", "w_2"],
    lottiePath: "/x.json",
    frames: 36,
    offsetMs: 0,
    hidden: false,
    prompt: "",
    model: "claude-opus-5-5",
    generatedAt: "",
  };
}

describe("time", () => {
  it("formats timecode with frames", () => {
    expect(timecode(0, { num: 30, den: 1 })).toBe("00:00:00:00");
    expect(timecode(61_500, { num: 30, den: 1 })).toBe("00:01:01:15");
    expect(timecode(3_600_000, { num: 25, den: 1 })).toBe("01:00:00:00");
  });
  it("snaps to frame boundaries at NTSC rates", () => {
    const f = { num: 30000, den: 1001 };
    expect(msToFrame(snapToFrame(1234, f), f)).toBe(37);
  });
});

describe("edits", () => {
  it("splits at a frame and keeps both halves contiguous", () => {
    const { p, clipId } = setup();
    const { project, rightId } = splitClip(p, clipId, 3010);
    const left = project.clips[clipId]!;
    const right = project.clips[rightId!]!;
    expect(left.outMs).toBe(3000);
    expect(right.inMs).toBe(3000);
    expect(right.startMs).toBe(clipEnd(left));
  });

  it("refuses to split at an edge", () => {
    const { p, clipId } = setup();
    expect(splitClip(p, clipId, 0).rightId).toBeNull();
    expect(splitClip(p, clipId, 10_000).rightId).toBeNull();
  });

  it("trims within the source and never below the minimum length", () => {
    const { p, clipId } = setup();
    const trimmed = trimClip(p, clipId, "start", 2000, 0, 0);
    expect(trimmed.clips[clipId]!.inMs).toBe(2000);
    expect(trimmed.clips[clipId]!.startMs).toBe(2000);
    const tooFar = trimClip(p, clipId, "end", 99_999, 0, 0);
    expect(tooFar.clips[clipId]!.outMs).toBe(10_000);
    const collapsed = trimClip(p, clipId, "end", -50, 0, 0);
    expect(clipEnd(collapsed.clips[clipId]!)).toBeGreaterThan(0);
  });

  it("does not let clips overlap on a track", () => {
    const { p, videoTrack } = setup();
    const second = addClip(p, asset(), videoTrack);
    expect(second.clip.startMs).toBe(10_000);
    const moved = moveClip(second.project, second.clip.id, 5000, 0, 0);
    expect(moved.clips[second.clip.id]!.startMs).toBe(10_000);
  });

  it("snaps to nearby edges", () => {
    expect(snap(1040, [0, 1000, 5000], 50)).toBe(1000);
    expect(snap(1100, [0, 1000, 5000], 50)).toBe(1100);
  });
});

describe("word anchoring", () => {
  it("places captions where their words play", () => {
    const { p, clipId } = setup();
    expect(placedCaptions(p).map((c) => [c.segmentId, c.startMs])).toEqual([
      ["s_1", 1000],
      ["s_2", 5000],
    ]);
    // Trim the first 2 s away: s_1 disappears, s_2 moves with the footage.
    const trimmed = trimClip(p, clipId, "start", 2000, 0, 0);
    const moved = moveClip(trimmed, clipId, 0, 0, 0);
    const caps = placedCaptions(moved);
    expect(caps.map((c) => [c.segmentId, c.startMs])).toEqual([["s_2", 3000]]);
  });

  it("moves motion with its footage and flags it when a cut lands inside", () => {
    const { p, clipId } = setup();
    let proj: Project = { ...p, motion: { m_1: motion(p) } };
    expect(placeMotion(proj, proj.motion.m_1!)).toMatchObject({ status: "ok", startMs: 1000 });

    // Moving the whole clip keeps it in sync.
    proj = moveClip(proj, clipId, 500, 0, 0);
    expect(placeMotion(proj, proj.motion.m_1!)).toMatchObject({ status: "ok", startMs: 1500 });

    // The clip now starts at 500, so source time s plays at 500 + s.
    // Cut out the 100 ms gap between "Hello" (ends 1300) and "world" (starts 1400).
    const a = splitClip(proj, clipId, 500 + 1300);
    const b = splitClip(a.project, a.rightId!, 500 + 1400);
    let cut = { ...b.project, clips: { ...b.project.clips } };
    delete cut.clips[a.rightId!];
    cut = moveClip(cut, b.rightId!, 500 + 1300, 0, 0);
    expect(cut.clips[b.rightId!]!.startMs).toBe(1800);
    expect(placeMotion(cut, cut.motion.m_1!).status).toBe("out_of_sync");
  });

  it("orphans motion whose first word was removed and hides captions under motion", () => {
    const { p, clipId } = setup();
    const proj: Project = { ...p, motion: { m_1: motion(p) } };
    expect(segmentsWithMotion(proj).has("a_1/s_1")).toBe(true);
    const trimmed = trimClip(proj, clipId, "start", 1200, 0, 0);
    expect(placeMotion(trimmed, trimmed.motion.m_1!).status).toBe("orphaned");
  });

  it("includes motion in the project duration", () => {
    const { p } = setup();
    const proj: Project = { ...p, motion: { m_1: { ...motion(p), offsetMs: 9500 } } };
    expect(projectDuration(proj)).toBe(1000 + 9500 + 1200);
  });
});
