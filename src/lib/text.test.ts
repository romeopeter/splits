import { describe, expect, it } from "vitest";
import type { Project } from "../types/project";
import { createProject, deleteTrack, editPoints, normalizeProject, projectDuration, snapTargets, textEnd, trackContents } from "./timeline";
import {
  DEFAULT_TEXT_MS,
  addText,
  duplicateText,
  moveText,
  rippleDeleteText,
  rippleTrimText,
  splitText,
  textAt,
  trimText,
  updateText,
} from "./textClips";
import { textAnimState } from "./textRender";
import { DEFAULT_TEXT_STYLE, presetStyle, TEXT_PRESETS } from "./textStyle";

const H = 1080;

function project(): Project {
  const p = createProject();
  return { ...p, settings: { ...p.settings, fps: { num: 30, den: 1 } } };
}

describe("adding text", () => {
  it("puts a three-second text clip at the playhead on a new text track", () => {
    const { project: p, id } = addText(project(), 1000);
    const t = p.texts[id]!;
    expect([t.startMs, t.durationMs]).toEqual([1000, DEFAULT_TEXT_MS]);
    expect(p.tracks.map((x) => [x.kind, x.name])).toEqual([["text", "Text 1"]]);
  });

  it("reuses a text track with room, and adds a track on top when the time is taken", () => {
    const a = addText(project(), 0);
    const b = addText(a.project, 5000); // room on Text 1
    expect(b.project.texts[b.id]!.trackId).toBe(a.project.texts[a.id]!.trackId);
    const c = addText(b.project, 1000); // overlaps the first
    expect(c.project.tracks.map((x) => x.name)).toEqual(["Text 2", "Text 1"]);
    expect(c.project.texts[c.id]!.trackId).toBe(c.project.tracks[0]!.id);
  });

  it("lands on a whole frame", () => {
    const { project: p, id } = addText(project(), 1010);
    expect(p.texts[id]!.startMs).toBe(1000);
  });
});

describe("editing text clips", () => {
  function two() {
    const a = addText(project(), 0); // 0–3 s
    const b = addText(a.project, 3000); // 3–6 s, same track
    return { p: b.project, a: a.id, b: b.id };
  }

  it("will not move onto another text clip on the same track", () => {
    const { p, a } = two();
    expect(moveText(p, a, 2000, 0, 0)).toBe(p);
    expect(moveText(p, a, 7000, 0, 0).texts[a]!.startMs).toBe(7000);
  });

  it("snaps to other edges and counts in snapping, edit points and length", () => {
    const { p, b } = two();
    expect(moveText(p, b, 3500, 200, 3600).texts[b]!.startMs).toBe(3600); // snaps to the playhead within 200 ms
    expect(snapTargets(p, 0)).toEqual(expect.arrayContaining([0, 3000, 6000]));
    expect(editPoints(p)).toEqual([0, 3000, 6000]);
    expect(projectDuration(p)).toBe(6000);
  });

  it("trims within its neighbours and never below two frames", () => {
    const { p, a, b } = two();
    expect(textEnd(trimText(p, a, "end", 5000, 0, 0).texts[a]!)).toBe(3000); // b starts at 3 s
    const short = trimText(p, b, "start", 5990, 0, 0).texts[b]!;
    expect(short.durationMs).toBe(67); // two frames at 30 fps
    expect(textEnd(trimText(p, b, "end", 9000, 0, 0).texts[b]!)).toBe(9000); // text can grow freely
  });

  it("splits, keeping the in animation on the left and the out animation on the right", () => {
    const { p: p0, a } = two();
    const p = updateText(p0, a, { animIn: { kind: "fade", durationMs: 500 }, animOut: { kind: "pop", durationMs: 500 } });
    const { project, rightId } = splitText(p, a, 1500);
    const left = project.texts[a]!;
    const right = project.texts[rightId!]!;
    expect([left.durationMs, left.animIn.kind, left.animOut.kind]).toEqual([1500, "fade", "none"]);
    expect([right.startMs, right.animIn.kind, right.animOut.kind, right.text]).toEqual([1500, "none", "pop", "Text"]);
    expect(splitText(p, a, 10).rightId).toBeNull(); // within a frame of the edge
  });

  it("ripple delete and ripple trim pull later text on the track left", () => {
    const { p, a, b } = two();
    expect(rippleDeleteText(p, a).texts[b]!.startMs).toBe(0);
    const trimmed = rippleTrimText(p, a, "start", 1000);
    expect([trimmed.texts[a]!.startMs, trimmed.texts[a]!.durationMs, trimmed.texts[b]!.startMs]).toEqual([0, 2000, 2000]);
    expect(rippleTrimText(p, a, "end", 4000)).toBe(p); // playhead outside the clip
  });

  it("duplicates after the clip, or at the end of the track when that is taken", () => {
    const { p, a } = two();
    const r = duplicateText(p, a);
    expect(r.project.texts[r.id!]!.startMs).toBe(6000);
  });

  it("keeps animations inside a clip that gets shorter", () => {
    const { p: p0, a } = two();
    const p = updateText(p0, a, { animIn: { kind: "fade", durationMs: 2000 }, animOut: { kind: "fade", durationMs: 2000 } });
    const t = trimText(p, a, "end", 1000, 0, 0).texts[a]!;
    expect(t.animIn.durationMs + t.animOut.durationMs).toBeLessThanOrEqual(t.durationMs);
  });

  it("is found by time on its track, and deleting the track takes its text", () => {
    const { p, a } = two();
    const track = p.texts[a]!.trackId;
    expect(textAt(p, track, 2999)?.id).toBe(a);
    expect(trackContents(p, p.tracks[0]!)).toBe("2 text clips");
    expect(Object.keys(deleteTrack(p, track).texts)).toEqual([]);
  });
});

describe("text animation", () => {
  const clip = (inKind: "fade" | "pop" | "rise" | "typewriter", outKind: "fade" | "drop") => {
    const { project: p, id } = addText(project(), 0);
    return updateText(p, id, { animIn: { kind: inKind, durationMs: 1000 }, animOut: { kind: outKind, durationMs: 1000 } }).texts[id]!;
  };

  it("is settled in the middle and hidden at the very start", () => {
    const c = clip("fade", "fade");
    expect(textAnimState(c, 1500, H)).toEqual({ alpha: 1, scale: 1, dy: 0, reveal: 1 });
    expect(textAnimState(c, 0, H).alpha).toBe(0);
    expect(textAnimState(c, 500, H).alpha).toBeGreaterThan(0.5); // eases out: past halfway at half time
  });

  it("plays the out animation over the last part", () => {
    const c = clip("fade", "drop");
    const near = textAnimState(c, 2900, H);
    expect(near.alpha).toBeLessThan(0.5);
    expect(near.dy).toBeLessThan(0); // drop leaves upwards in reverse
  });

  it("rise starts below and arrives; pop overshoots before it settles; typewriter reveals", () => {
    expect(textAnimState(clip("rise", "fade"), 0, H).dy).toBeCloseTo(0.06 * H);
    const pop = [600, 800, 900].map((t) => textAnimState(clip("pop", "fade"), t, H).scale);
    expect(Math.max(...pop)).toBeGreaterThan(1);
    expect(textAnimState(clip("typewriter", "fade"), 500, H).reveal).toBeCloseTo(0.5);
  });
});

describe("presets and older projects", () => {
  it("builds each preset on the defaults", () => {
    for (const preset of TEXT_PRESETS) {
      const s = presetStyle(preset);
      expect(Object.keys(s).sort()).toEqual(Object.keys(DEFAULT_TEXT_STYLE).sort());
    }
  });

  it("gives a project saved before text an empty text list, and fills missing text fields", () => {
    const old = project() as Partial<Project>;
    delete old.texts;
    expect(normalizeProject(old as Project).texts).toEqual({});
    const { project: p, id } = addText(project(), 0);
    const partial = { ...p.texts[id]!, style: { fontId: "anton" } } as unknown as Project["texts"][string];
    const n = normalizeProject({ ...p, texts: { [id]: partial } }).texts[id]!;
    expect(n.style.fontId).toBe("anton");
    expect(n.style.outline).toEqual(DEFAULT_TEXT_STYLE.outline);
  });
});
