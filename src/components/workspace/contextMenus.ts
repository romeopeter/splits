/**
 * What the context menu offers for the thing under the pointer (or the
 * focused thing, for Shift+F10 and the Menu key).
 *
 * Right-click selects what it lands on, as in every editor, so each command
 * here is the same action the inspector, the keyboard and the transport
 * already use on the selection. The menu adds a way in, not new behaviour.
 *
 * Targets are found from the DOM:
 * - `data-menu="clip:<id>"`, `"text:<id>"`, `"motion:<id>"` and `"track:<id>"`
 *   on timeline clips and track headers;
 * - `[data-track-id]` for the empty part of a lane, where the time comes
 *   from the pointer;
 * - `.preview-frame` for the canvas, hit-tested like a click.
 */
import type { MenuEntry } from "../ui";
import { getProject, useProject } from "../../store/project";
import { useUi } from "../../store/ui";
import {
  addTextAtPlayhead,
  chooseAndImport,
  closeGapsOnTrack,
  deleteSelection,
  detachSelectionAudio,
  duplicateSelection,
  moveTrackBy,
  removeTrack,
  rippleDeleteSelection,
  selectClip,
  selectText,
  splitAtPlayhead,
  trimSelectionToPlayhead,
} from "../../lib/actions";
import { clipAt, clipEnd, isLocked, textEnd, trackById, updateTrack, videoTracksBottomUp } from "../../lib/timeline";
import { framePointAt, layerGeometry } from "../../lib/compositor";
import { textAtPoint } from "../../lib/textRender";
import { frameMs, snapToFrame } from "../../lib/time";

export interface ContextMenuSpec {
  label: string;
  entries: MenuEntry[];
}

const ui = () => useUi.getState();
const mod = navigator.platform.toLowerCase().includes("mac") ? "Cmd" : "Ctrl";
const SEP: MenuEntry = { kind: "separator" };

/** Split and the two trims need the playhead inside the item by at least a frame. */
function playheadInside(startMs: number, endMs: number): boolean {
  const t = ui().playheadMs;
  const f = frameMs(getProject().settings.fps);
  return t - startMs >= f - 0.5 && endMs - t >= f - 0.5;
}

/** Split, trim, duplicate and delete: the commands every clip and text clip share. */
function editEntries(locked: boolean, inside: boolean): MenuEntry[] {
  const atHint = locked ? undefined : "Move the playhead over it first.";
  return [
    { label: "Split at playhead", shortcut: "S", disabled: locked || !inside, hint: atHint, onSelect: splitAtPlayhead },
    { label: "Trim start to playhead", shortcut: "[", disabled: locked || !inside, hint: atHint, onSelect: () => trimSelectionToPlayhead("start") },
    { label: "Trim end to playhead", shortcut: "]", disabled: locked || !inside, hint: atHint, onSelect: () => trimSelectionToPlayhead("end") },
    SEP,
    { label: "Duplicate", shortcut: `${mod} + D`, disabled: locked, onSelect: duplicateSelection },
  ];
}

function deleteEntries(locked: boolean): MenuEntry[] {
  return [
    { label: "Delete", shortcut: "Delete", danger: true, disabled: locked, onSelect: deleteSelection },
    { label: "Delete and close gap", shortcut: "Shift + Delete", danger: true, disabled: locked, onSelect: rippleDeleteSelection },
  ];
}

function lockedNote(trackId: string): MenuEntry[] {
  const p = getProject();
  return isLocked(p, trackId) ? [{ kind: "label", label: `${trackById(p, trackId)?.name ?? "This track"} is locked. Unlock it to edit.` }] : [];
}

function clipMenu(id: string): ContextMenuSpec | null {
  const p = getProject();
  const c = p.clips[id];
  const a = c && p.assets[c.assetId];
  if (!c || !a) return null;
  selectClip(id);
  const locked = isLocked(p, c.trackId);
  const canDetach = trackById(p, c.trackId)?.kind === "video" && a.hasAudio && !c.muted;
  return {
    label: `${a.name} clip`,
    entries: [
      ...lockedNote(c.trackId),
      ...editEntries(locked, playheadInside(c.startMs, clipEnd(c))),
      ...(canDetach ? [{ label: "Detach audio", disabled: locked, onSelect: detachSelectionAudio }] : []),
      SEP,
      ...deleteEntries(locked),
    ],
  };
}

function textMenu(id: string): ContextMenuSpec | null {
  const p = getProject();
  const t = p.texts[id];
  if (!t) return null;
  selectText(id);
  const locked = isLocked(p, t.trackId);
  return {
    label: "Text",
    entries: [
      ...lockedNote(t.trackId),
      {
        label: "Edit text",
        disabled: locked,
        onSelect: () => {
          selectText(id);
          ui().set({ textTab: "text", textEditTick: ui().textEditTick + 1 });
        },
      },
      SEP,
      ...editEntries(locked, playheadInside(t.startMs, textEnd(t))),
      SEP,
      ...deleteEntries(locked),
    ],
  };
}

function motionMenu(id: string): ContextMenuSpec | null {
  const m = getProject().motion[id];
  if (!m) return null;
  ui().select({ kind: "motion", id });
  ui().setPanel("motion");
  const locked = isLocked(getProject(), m.trackId);
  return {
    label: "Motion clip",
    entries: [
      ...lockedNote(m.trackId),
      {
        label: m.hidden ? "Show motion clip" : "Hide motion clip",
        disabled: locked,
        onSelect: () => useProject.getState().commit((p) => (p.motion[id] ? { ...p, motion: { ...p.motion, [id]: { ...p.motion[id]!, hidden: !m.hidden } } } : p)),
      },
      SEP,
      { label: "Delete", shortcut: "Delete", danger: true, disabled: locked, onSelect: deleteSelection },
    ],
  };
}

function trackMenu(id: string): ContextMenuSpec | null {
  const p = getProject();
  const t = trackById(p, id);
  if (!t) return null;
  const media = t.kind === "video" || t.kind === "audio";
  const same = p.tracks.filter((x) => x.kind === t.kind);
  const i = same.findIndex((x) => x.id === id);
  const toggle = (key: "locked" | "hidden" | "muted") => useProject.getState().commit((proj) => updateTrack(proj, id, { [key]: !t[key] }));
  return {
    label: t.name,
    entries: [
      { label: t.hidden ? "Show track" : "Hide track", onSelect: () => toggle("hidden") },
      { label: t.locked ? "Unlock track" : "Lock track", onSelect: () => toggle("locked") },
      ...(media ? [{ label: t.muted ? "Unmute track" : "Mute track", onSelect: () => toggle("muted") }] : []),
      SEP,
      { label: "Move up", shortcut: "Alt + Up", disabled: i <= 0, hint: same.length > 1 ? "It is already the top one of its kind." : "It is the only track of its kind.", onSelect: () => moveTrackBy(id, -1) },
      { label: "Move down", shortcut: "Alt + Down", disabled: i >= same.length - 1, hint: same.length > 1 ? "It is already the bottom one of its kind." : "It is the only track of its kind.", onSelect: () => moveTrackBy(id, 1) },
      ...(media ? [{ label: "Close gaps", disabled: t.locked, hint: "Unlock the track first.", onSelect: () => closeGapsOnTrack(id) }] : []),
      SEP,
      { label: "Delete track", danger: true, onSelect: () => void removeTrack(id) },
    ],
  };
}

/** The empty part of a lane: the time under the pointer is where things go. */
function laneMenu(lane: HTMLElement, x: number): ContextMenuSpec {
  const p = getProject();
  const r = lane.getBoundingClientRect();
  const ms = snapToFrame(Math.max(0, ((x - r.left) / ui().pxPerSecond) * 1000), p.settings.fps);
  ui().select(null);
  const trackId = lane.closest<HTMLElement>("[data-track-id]")?.dataset.trackId;
  const t = trackId ? trackById(p, trackId) : undefined;
  const media = t && (t.kind === "video" || t.kind === "audio");
  return {
    label: "Timeline",
    entries: [
      { label: "Move playhead here", onSelect: () => ui().setPlayhead(ms) },
      {
        label: "Add text here",
        shortcut: "T",
        onSelect: () => {
          ui().setPlayhead(ms);
          addTextAtPlayhead();
        },
      },
      { label: "Add media here…", onSelect: () => void chooseAndImport({ atMs: ms }) },
      ...(media && t ? [SEP, { label: "Close gaps", disabled: t.locked, hint: "Unlock the track first.", onSelect: () => closeGapsOnTrack(t.id) }] : []),
    ],
  };
}

/**
 * The canvas: text under the pointer, then the video clip under it (top
 * track first), then the canvas itself. From the keyboard, the selection.
 */
function canvasMenu(frame: HTMLElement, x: number, y: number, keyboard: boolean): ContextMenuSpec | null {
  const p = getProject();
  const { width: W, height: H } = p.settings;
  const t = ui().playheadMs;
  if (keyboard) {
    const s = ui().selection;
    if (s?.kind === "text") return textMenu(s.id);
    if (s?.kind === "clip") return clipMenu(s.id);
  }
  const r = frame.getBoundingClientRect();
  const px = keyboard ? W / 2 : ((x - r.left) / r.width) * W;
  const py = keyboard ? H / 2 : ((y - r.top) / r.height) * H;
  if (!keyboard) {
    const hit = textAtPoint(p, t, px, py);
    if (hit) return textMenu(hit.id);
    for (const track of [...videoTracksBottomUp(p)].reverse()) {
      if (track.hidden) continue;
      const c = clipAt(p, track.id, t);
      const a = c && p.assets[c.assetId];
      if (!c || !a?.hasVideo) continue;
      if (framePointAt(layerGeometry(a.width ?? 16, a.height ?? 9, c.transform, c.crop, W, H), px, py)) return clipMenu(c.id);
    }
  }
  return {
    label: "Canvas",
    entries: [
      { label: "Add text here", shortcut: keyboard ? "T" : undefined, onSelect: () => addTextAtPlayhead({}, keyboard ? undefined : { x: px - W / 2, y: py - H / 2 }) },
      { label: "Add media…", onSelect: () => void chooseAndImport() },
    ],
  };
}

/** The menu for `target`, or null when there is none (the native menu is still suppressed). */
export function contextMenuFor(target: Element, x: number, y: number, keyboard: boolean): ContextMenuSpec | null {
  const tagged = target.closest<HTMLElement>("[data-menu]");
  if (tagged) {
    const [kind, id = ""] = (tagged.dataset.menu ?? "").split(":");
    if (kind === "clip") return clipMenu(id);
    if (kind === "text") return textMenu(id);
    if (kind === "motion") return motionMenu(id);
    if (kind === "track") return trackMenu(id);
  }
  const frame = target.closest<HTMLElement>(".preview-frame");
  if (frame) return canvasMenu(frame, x, y, keyboard);
  const lane = target.closest<HTMLElement>("[data-track-id]")?.querySelector<HTMLElement>(".sp-lane");
  if (lane && !keyboard) return laneMenu(lane, x);
  return null;
}
