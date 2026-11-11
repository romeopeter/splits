import { describe, expect, it } from "vitest";
import type { Asset, MotionClip, Project, Transcript } from "../types/project";
import {
  addClip,
  adjacentEditPoint,
  editPoints,
  rippleTrimClip,
  clipEnd,
  clipLength,
  addTrack,
  closeGaps,
  createProject,
  deleteTrack,
  detachAudio,
  moveTrack,
  normalizeProject,
  placeSourceTime,
  rippleDeleteClip,
  setClipSpeed,
  updateClip,
  ensureTrack,
  moveClip,
  placeAsset,
  placeMotion,
  placedCaptions,
  projectDuration,
  segmentsWithMotion,
  snap,
  snapMove,
  splitClip,
  trackContents,
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
  const r = placeAsset(p, a, 0);
  return { p: r.project, clipId: r.clip.id, videoTrack: r.clip.trackId };
}

function motion(p: Project): MotionClip {
  return {
    id: "m_1",
    trackId: p.tracks.find((t) => t.kind === "motion")?.id ?? "t_motion",
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

describe("tracks", () => {
  const order = (p: Project) => p.tracks.map((t) => t.name);

  it("starts a project with no tracks", () => {
    expect(createProject().tracks).toEqual([]);
  });

  it("creates the track an asset needs, once", () => {
    const { p, videoTrack } = setup();
    expect(order(p)).toEqual(["Video 1"]);
    const again = placeAsset(p, asset("a_2"));
    expect(again.clip.trackId).toBe(videoTrack);
    expect(order(again.project)).toEqual(["Video 1"]);
    const sound = placeAsset(p, { ...asset("a_3"), hasVideo: false, kind: "audio" });
    expect(order(sound.project)).toEqual(["Video 1", "Audio 1"]);
  });

  it("stacks kinds top to bottom: motion, captions, video, audio", () => {
    let p = createProject();
    p = addTrack(p, "audio");
    p = addTrack(p, "video");
    p = ensureTrack(p, "caption").project;
    p = ensureTrack(p, "motion").project;
    p = addTrack(p, "video");
    p = addTrack(p, "audio");
    expect(order(p)).toEqual(["Motion", "Captions", "Video 2", "Video 1", "Audio 1", "Audio 2"]);
    expect(ensureTrack(p, "motion").project).toBe(p);
  });

  it("numbers new tracks past the highest number in use", () => {
    let p = addTrack(addTrack(createProject(), "video"), "video");
    p = deleteTrack(p, p.tracks.find((t) => t.name === "Video 1")!.id);
    expect(order(addTrack(p, "video"))).toEqual(["Video 3", "Video 2"]);
  });

  it("deletes a track with its clips and motion, keeping transcripts", () => {
    const { p, clipId, videoTrack } = setup();
    const withMotion = ensureTrack(p, "motion");
    const proj: Project = { ...withMotion.project, motion: { m_1: { ...motion(withMotion.project), trackId: withMotion.track.id } } };
    expect(trackContents(proj, withMotion.track)).toBe("1 motion clip");
    expect(trackContents(proj, proj.tracks.find((t) => t.id === videoTrack)!)).toBe("1 clip");

    const noMotion = deleteTrack(proj, withMotion.track.id);
    expect(noMotion.motion).toEqual({});
    expect(noMotion.clips[clipId]).toBeDefined();

    const noVideo = deleteTrack(proj, videoTrack);
    expect(noVideo.clips).toEqual({});
    expect(noVideo.transcripts.a_1).toBeDefined();
    expect(order(noVideo)).toEqual(["Motion"]);
  });
});

describe("speed", () => {
  it("changes the clip's timeline length, in whole frames, and keeps its source range", () => {
    const { p, clipId } = setup();
    const fast = setClipSpeed(p, clipId, 2).clips[clipId]!;
    expect([fast.inMs, fast.outMs, clipLength(fast)]).toEqual([0, 10_000, 5000]);
    const slow = setClipSpeed(p, clipId, 0.5).clips[clipId]!;
    expect(clipLength(slow)).toBe(20_000);
    expect(setClipSpeed(p, clipId, 9).clips[clipId]!.speed).toBe(4);
  });

  it("moves later clips on the track with the clip's end", () => {
    const { p: p0, clipId } = setup();
    const second = addClip(p0, asset(), p0.clips[clipId]!.trackId); // starts at 10 s
    const after = setClipSpeed(second.project, clipId, 2);
    expect(after.clips[second.clip.id]!.startMs).toBe(5000);
    expect(setClipSpeed(after, clipId, 1).clips[second.clip.id]!.startMs).toBe(10_000);
  });

  it("places words and splits by source time at the clip's speed", () => {
    const { p, clipId } = setup();
    const fast = setClipSpeed(p, clipId, 2);
    expect(placeSourceTime(fast, "a_1", 5000)?.timelineMs).toBe(2500);
    expect(placedCaptions(fast)[1]!.startMs).toBe(2500);
    const { project, rightId } = splitClip(fast, clipId, 1000);
    expect(project.clips[clipId]!.outMs).toBe(2000);
    expect(project.clips[rightId!]!.inMs).toBe(2000);
    expect(clipEnd(project.clips[rightId!]!)).toBe(5000);
  });

  it("trims in timeline time at the clip's speed", () => {
    const { p, clipId } = setup();
    const fast = setClipSpeed(p, clipId, 2);
    const t = trimClip(fast, clipId, "start", 1000, 0, 0).clips[clipId]!;
    expect([t.startMs, t.inMs, clipEnd(t)]).toEqual([1000, 2000, 5000]);
  });
});

describe("ripple and gaps", () => {
  it("ripple delete closes the gap and captions follow", () => {
    const { p: p0, clipId } = setup();
    const { project: split, rightId } = splitClip(p0, clipId, 3000);
    const p = rippleDeleteClip(split, clipId); // remove 0–3 s; the rest moves to 0
    expect(p.clips[rightId!]!.startMs).toBe(0);
    expect(placedCaptions(p).map((c) => c.startMs)).toEqual([2000]); // "Again here" was at 5 s
  });

  it("close gaps packs a track from the start, in order", () => {
    const { p: p0, clipId, videoTrack } = setup();
    let p = updateClip(p0, clipId, { startMs: 2000 });
    const b = addClip(p, asset(), videoTrack, 15_000);
    p = closeGaps(b.project, videoTrack);
    expect(p.clips[clipId]!.startMs).toBe(0);
    expect(p.clips[b.clip.id]!.startMs).toBe(10_000);
    expect(closeGaps(p, videoTrack)).toBe(p);
  });
});

describe("snapping a moved clip", () => {
  it("snaps whichever edge is nearer a target, and leaves it alone when neither is", () => {
    // A 3 s item dragged to 3.1 s: its start is 100 ms from the 3 s target, its end (6.1 s) is near nothing.
    expect(snapMove(3100, 3000, [0, 3000], 200)).toBe(3000);
    // Its end is 50 ms from 6 s, nearer than its start is to anything.
    expect(snapMove(2950, 3000, [0, 2700, 6000], 400)).toBe(3000);
    expect(snapMove(4000, 3000, [0, 3000], 200)).toBe(4000);
  });

  it("snaps a media clip's start to the playhead when dragged near it", () => {
    const { p: p0, clipId } = setup();
    expect(moveClip(p0, clipId, 2950, 100, 3000).clips[clipId]!.startMs).toBe(3000);
  });
});

describe("edit points", () => {
  it("lists clip edges on visible tracks once each, with the start and end", () => {
    const { p: p0, clipId, videoTrack } = setup();
    const { project: split } = splitClip(p0, clipId, 3000);
    const b = addClip(split, asset(), videoTrack, 12_000); // gap 10–12 s
    expect(editPoints(b.project)).toEqual([0, 3000, 10_000, 12_000, 22_000]);
    const hidden = { ...b.project, tracks: b.project.tracks.map((t) => (t.id === videoTrack ? { ...t, hidden: true } : t)) };
    // Hidden-track edges are skipped; the timeline's end still counts.
    expect(editPoints(hidden)).toEqual([0, 22_000]);
  });

  it("steps past the point the playhead stands on, within half a frame", () => {
    const pts = [0, 3000, 10_000];
    const tol = 1000 / 30 / 2;
    expect(adjacentEditPoint(pts, 3000, 1, tol)).toBe(10_000);
    expect(adjacentEditPoint(pts, 3010, -1, tol)).toBe(0);
    expect(adjacentEditPoint(pts, 2000, 1, tol)).toBe(3000);
    expect(adjacentEditPoint(pts, 2000, -1, tol)).toBe(0);
    expect(adjacentEditPoint(pts, 10_000, 1, tol)).toBeNull();
    expect(adjacentEditPoint(pts, 0, -1, tol)).toBeNull();
  });
});

describe("ripple trim", () => {
  /** One 10 s clip at 0, then a second clip right after it at 10 s, and an audio clip that must not move. */
  function twoClips() {
    const { p: p0, clipId, videoTrack } = setup();
    const b = addClip(p0, asset(), videoTrack, 10_000);
    const audio = ensureTrack(b.project, "audio");
    const c = addClip(audio.project, asset(), audio.track.id, 10_000);
    return { p: c.project, clipId, nextId: b.clip.id, audioId: c.clip.id };
  }

  it("trims the start, keeps the clip in place and pulls later clips left", () => {
    const { p: p0, clipId, nextId, audioId } = twoClips();
    const p = rippleTrimClip(p0, clipId, "start", 4000);
    const c = p.clips[clipId]!;
    expect([c.startMs, c.inMs, clipEnd(c)]).toEqual([0, 4000, 6000]);
    expect(p.clips[nextId]!.startMs).toBe(6000);
    expect(p.clips[audioId]!.startMs).toBe(10_000); // other tracks stay put
    // "Again here" (source 5 s) moves from 5 s to 1 s; "Hello world" now comes from the next clip, at 7 s.
    expect(placedCaptions(p).map((x) => x.startMs)).toEqual([1000, 7000]);
  });

  it("trims the end and pulls later clips left", () => {
    const { p: p0, clipId, nextId } = twoClips();
    const p = rippleTrimClip(p0, clipId, "end", 7000);
    expect(p.clips[clipId]!.outMs).toBe(7000);
    expect(p.clips[nextId]!.startMs).toBe(7000);
  });

  it("works in timeline time at the clip's speed", () => {
    const { p: p0, clipId, nextId } = twoClips();
    const fast = setClipSpeed(p0, clipId, 2); // 0–5 s on the timeline; the next clip moves to 5 s
    const p = rippleTrimClip(fast, clipId, "start", 1000);
    const c = p.clips[clipId]!;
    expect([c.startMs, c.inMs, clipEnd(c)]).toEqual([0, 2000, 4000]);
    expect(p.clips[nextId]!.startMs).toBe(4000);
  });

  it("does nothing outside the clip or within a frame of its edges", () => {
    const { p, clipId } = twoClips();
    expect(rippleTrimClip(p, clipId, "start", 12_000)).toBe(p);
    expect(rippleTrimClip(p, clipId, "start", 0)).toBe(p);
    expect(rippleTrimClip(p, clipId, "end", 10_000)).toBe(p);
    expect(rippleTrimClip(p, clipId, "end", 9990)).toBe(p);
  });

  it("keeps fades inside the shorter clip", () => {
    const { p: p0, clipId } = twoClips();
    const faded = updateClip(p0, clipId, { videoFadeInMs: 4000, videoFadeOutMs: 4000 });
    const c = rippleTrimClip(faded, clipId, "end", 2000).clips[clipId]!;
    expect(c.videoFadeInMs + c.videoFadeOutMs).toBeLessThanOrEqual(clipLength(c));
  });
});

describe("fades", () => {
  it("keep the fade in on the left half of a split and the fade out on the right", () => {
    const { p: p0, clipId } = setup();
    const p = updateClip(p0, clipId, { videoFadeInMs: 1000, videoFadeOutMs: 1000, audioFadeInMs: 500, audioFadeOutMs: 500 });
    const { project, rightId } = splitClip(p, clipId, 4000);
    const l = project.clips[clipId]!;
    const r = project.clips[rightId!]!;
    expect([l.videoFadeInMs, l.videoFadeOutMs, l.audioFadeInMs, l.audioFadeOutMs]).toEqual([1000, 0, 500, 0]);
    expect([r.videoFadeInMs, r.videoFadeOutMs, r.audioFadeInMs, r.audioFadeOutMs]).toEqual([0, 1000, 0, 500]);
  });

  it("never run past a clip that is trimmed short", () => {
    const { p: p0, clipId } = setup();
    const p = updateClip(p0, clipId, { videoFadeInMs: 3000, videoFadeOutMs: 3000 });
    const c = trimClip(p, clipId, "end", 2000, 0, 0).clips[clipId]!;
    expect(c.videoFadeInMs + c.videoFadeOutMs).toBeLessThanOrEqual(clipLength(c));
  });
});

describe("detach audio", () => {
  it("copies the sound to an audio track and mutes the video clip", () => {
    const { p, clipId } = setup();
    const r = detachAudio(p, clipId);
    const audio = r.project.clips[r.clipId!]!;
    expect(r.project.tracks.find((t) => t.id === audio.trackId)?.kind).toBe("audio");
    expect(r.project.clips[clipId]!.muted).toBe(true);
    expect([audio.startMs, audio.inMs, audio.outMs, audio.muted]).toEqual([0, 0, 10_000, false]);
    expect(detachAudio(r.project, clipId).clipId).toBeNull(); // already detached
  });

  it("captions follow the audio clip when it moves", () => {
    const { p, clipId } = setup();
    const r = detachAudio(p, clipId);
    const moved = updateClip(r.project, r.clipId!, { startMs: 2000 });
    expect(placedCaptions(moved)[0]!.startMs).toBe(3000);
  });
});

describe("track order and old projects", () => {
  it("moves a track only among tracks of its kind", () => {
    const { p: p0 } = setup();
    let p = addTrack(addTrack(p0, "video"), "audio");
    p = ensureTrack(p, "caption").project;
    const [v2, v1] = p.tracks.filter((t) => t.kind === "video");
    const down = moveTrack(p, v2!.id, 1);
    expect(down.tracks.filter((t) => t.kind === "video").map((t) => t.id)).toEqual([v1!.id, v2!.id]);
    expect(moveTrack(down, v2!.id, 1)).toBe(down); // next is the audio track
    const caption = p.tracks.find((t) => t.kind === "caption")!;
    expect(moveTrack(p, caption.id, 1)).toBe(p);
  });

  it("fills in fields an older project did not have", () => {
    const { p } = setup();
    const c = Object.values(p.clips)[0]!;
    const { speed: _s, crop: _c, muted: _m, videoFadeInMs: _a, videoFadeOutMs: _b, audioFadeInMs: _d, audioFadeOutMs: _e, ...rest } = c;
    const old = {
      ...p,
      clips: { [c.id]: { ...rest, transform: { x: 0, y: 0, scale: 1, opacity: 1 } } },
      tracks: p.tracks.map(({ muted: _x, ...t }) => t),
    } as unknown as Project;
    const n = normalizeProject(old);
    expect(n.clips[c.id]).toEqual(c);
    expect(n.tracks[0]!.muted).toBe(false);
  });
});

