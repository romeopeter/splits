/**
 * The timeline: ruler, track headers, lanes and clips.
 *
 * - Media clips drag (with snapping), trim by their handles, and split with
 *   the blade tool. A drag is one undo step (begin/live/end gesture).
 * - Caption clips are derived from transcript words; they follow the footage
 *   and cannot be dragged on their own.
 * - Motion clips follow their anchor word; dragging nudges `offsetMs`.
 */
import { convertFileSrc } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { useProject, getProject } from "../../store/project";
import { useUi } from "../../store/ui";
import { Button, Clip, Playhead, TimelineRuler, TrackHeader, TrackLane } from "../ui";
import {
  addTrack,
  clipEnd,
  clipLength,
  clipsOnTrack,
  isLocked,
  moveClip,
  moveTrack,
  placeMotion,
  placedCaptions,
  projectDuration,
  trackById,
  trimClip,
  updateTrack,
} from "../../lib/timeline";
import { chooseAndImport, moveTrackBy, removeTrack, splitClipAt } from "../../lib/actions";
import { spokenTime, timecode } from "../../lib/time";
import type { Asset, MediaClip, Track } from "../../types/project";

const HEADER = 180;
const DRAG_THRESHOLD = 3;
const SNAP_PX = 8;
const PEAKS_PER_SECOND = 50;
const THUMB_W = 36;

/** Follow a pointer drag on window; `moved` is false for a plain click. */
function drag(e: RPointerEvent, onMove: (dx: number, ev: PointerEvent) => void, onUp: (moved: boolean) => void) {
  const x0 = e.clientX;
  const y0 = e.clientY;
  let moved = false;
  const move = (ev: PointerEvent) => {
    const dx = ev.clientX - x0;
    if (!moved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(ev.clientY - y0) < DRAG_THRESHOLD) return;
    moved = true;
    onMove(dx, ev);
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    onUp(moved);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
}

function bars(asset: Asset, c: MediaClip, width: number): number[] | undefined {
  if (!asset.peaks?.length) return undefined;
  const n = Math.max(4, Math.floor((width - 40) / 5));
  const out: number[] = [];
  const span = c.outMs - c.inMs;
  for (let i = 0; i < n; i++) {
    const a = Math.floor(((c.inMs + (span * i) / n) / 1000) * PEAKS_PER_SECOND);
    const b = Math.max(a + 1, Math.floor(((c.inMs + (span * (i + 1)) / n) / 1000) * PEAKS_PER_SECOND));
    let m = 0;
    for (let k = a; k < b && k < asset.peaks.length; k++) m = Math.max(m, asset.peaks[k] ?? 0);
    out.push(m);
  }
  return out;
}

function thumbs(asset: Asset, c: MediaClip, width: number, px: number): string[] {
  const list = asset.thumbnails;
  const interval = asset.thumbnailIntervalMs;
  if (!list?.length || !interval) return [];
  const n = Math.ceil(width / THUMB_W);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const src = c.inMs + ((i * THUMB_W) / px) * 1000 * c.speed;
    const idx = Math.min(list.length - 1, Math.max(0, Math.floor(src / interval)));
    out.push(convertFileSrc(list[idx]!));
  }
  return out;
}

export function Timeline() {
  const project = useProject((s) => s.project);
  const px = useUi((s) => s.pxPerSecond);
  const playhead = useUi((s) => s.playheadMs);
  const playing = useUi((s) => s.playing);
  const selection = useUi((s) => s.selection);
  const tool = useUi((s) => s.tool);
  const scroller = useRef<HTMLDivElement>(null);
  const fps = project.settings.fps;

  const [viewWidth, setViewWidth] = useState(0);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const duration = projectDuration(project);
  // Lanes always fill the visible area, and extend 10 s past the last clip.
  const seconds = Math.max(30, Math.ceil(duration / 1000) + 10, Math.ceil((viewWidth - HEADER) / px));
  const width = seconds * px;
  const captions = useMemo(() => placedCaptions(project), [project]);

  // Keep the playhead in view while playing.
  useEffect(() => {
    const el = scroller.current;
    if (!el || !playing) return;
    const x = HEADER + (playhead / 1000) * px;
    if (x > el.scrollLeft + el.clientWidth - 40 || x < el.scrollLeft + HEADER) el.scrollLeft = x - HEADER - 40;
  }, [playhead, playing, px]);

  // Fit timeline: published for the transport's Fit button and Shift+0.
  useEffect(() => {
    const fit = () => {
      const el = scroller.current;
      const d = Math.max(5000, projectDuration(getProject()));
      if (el) useUi.getState().setZoom((el.clientWidth - HEADER - 48) / (d / 1000));
    };
    window.addEventListener("split:fit-timeline", fit);
    return () => window.removeEventListener("split:fit-timeline", fit);
  }, []);

  const msAt = (clientX: number) => {
    const el = scroller.current!;
    const r = el.getBoundingClientRect();
    return Math.max(0, ((clientX - r.left + el.scrollLeft - HEADER) / px) * 1000);
  };

  const snapMs = (SNAP_PX / px) * 1000;
  const ui = useUi.getState;
  const store = useProject.getState;

  const onMediaDown = (c: MediaClip, e: RPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const locked = isLocked(getProject(), c.trackId);
    if (tool === "blade") {
      if (!locked) splitClipAt(c.id, msAt(e.clientX));
      return;
    }
    ui().select({ kind: "clip", id: c.id });
    ui().setPanel("clip"); // editor-patterns: selecting a clip opens its panel
    if (locked) return;
    const start0 = c.startMs;
    const kind = trackById(getProject(), c.trackId)?.kind;
    store().beginGesture();
    drag(
      e,
      (dx, ev) => {
        const under = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>("[data-track-id]");
        const tid = under?.dataset.trackId;
        const target = tid && trackById(getProject(), tid)?.kind === kind && !isLocked(getProject(), tid) ? tid : undefined;
        store().live((p) => moveClip(p, c.id, start0 + (dx / px) * 1000, snapMs, ui().playheadMs, target));
      },
      (moved) => (moved ? store().endGesture() : store().cancelGesture()),
    );
  };

  const onTrimDown = (c: MediaClip, edge: "start" | "end", e: RPointerEvent<HTMLSpanElement>) => {
    e.stopPropagation();
    e.preventDefault();
    if (isLocked(getProject(), c.trackId)) return;
    store().beginGesture();
    drag(
      e,
      (_dx, ev) => store().live((p) => trimClip(p, c.id, edge, msAt(ev.clientX), snapMs, ui().playheadMs)),
      (moved) => (moved ? store().endGesture() : store().cancelGesture()),
    );
  };

  const onMotionDown = (id: string, e: RPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    ui().select({ kind: "motion", id });
    ui().setPanel("motion");
    const m = getProject().motion[id];
    if (!m || isLocked(getProject(), m.trackId)) return;
    const off0 = m.offsetMs;
    store().beginGesture();
    drag(
      e,
      (dx) =>
        store().live((p) => {
          const cur = p.motion[id];
          return cur ? { ...p, motion: { ...p.motion, [id]: { ...cur, offsetMs: Math.round(off0 + (dx / px) * 1000) } } } : p;
        }),
      (moved) => (moved ? store().endGesture() : store().cancelGesture()),
    );
  };

  const toggle = (t: Track, key: "locked" | "hidden" | "muted") => store().commit((p) => updateTrack(p, t.id, { [key]: !t[key] }));

  /** Drag a track's grip over another track of the same kind to move it there; one undo step. */
  const onGripDown = (t: Track, e: RPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    store().beginGesture();
    drag(
      e,
      (_dx, ev) => {
        const row = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>("[data-track-row]");
        const overId = row?.dataset.trackRow;
        if (!overId || overId === t.id) return;
        store().live((p) => {
          const from = p.tracks.findIndex((x) => x.id === t.id);
          const to = p.tracks.findIndex((x) => x.id === overId);
          if (from < 0 || p.tracks[to]?.kind !== t.kind) return p;
          const dir = to > from ? 1 : -1;
          let next = p;
          for (let i = from; i !== to; i += dir) next = moveTrack(next, t.id, dir);
          return next;
        });
      },
      (moved) => (moved ? store().endGesture() : store().cancelGesture()),
    );
  };

  const lane = (t: Track) => {
    const dim = t.locked || t.hidden;
    if (t.kind === "caption") {
      return captions.map((c) => {
        const sel = selection?.kind === "segment" && selection.segmentId === c.segmentId && selection.assetId === c.assetId;
        return (
          <Clip
            key={`${c.assetId}/${c.segmentId}`}
            kind="caption"
            label={c.text}
            left={(c.startMs / 1000) * px}
            width={((c.endMs - c.startMs) / 1000) * px}
            selected={sel}
            dimmed={dim}
            ariaLabel={`Subtitles clip, ${c.text}, ${timecode(c.startMs, fps)} to ${timecode(c.endMs, fps)}`}
            onClick={() => {
              ui().select({ kind: "segment", assetId: c.assetId, segmentId: c.segmentId });
              ui().setPanel("captions");
            }}
          />
        );
      });
    }
    if (t.kind === "motion") {
      return Object.values(project.motion).map((m) => {
        const pl = placeMotion(project, m);
        if (pl.status === "orphaned") return null;
        const tr = project.transcripts[m.assetId];
        const label = tr?.words.filter((w) => m.wordIds.includes(w.id)).map((w) => w.text).join(" ") ?? "Motion";
        return (
          <Clip
            key={m.id}
            kind="motion"
            label={label}
            left={(pl.startMs / 1000) * px}
            width={((pl.endMs - pl.startMs) / 1000) * px}
            selected={selection?.kind === "motion" && selection.id === m.id}
            dimmed={dim || m.hidden}
            status={pl.status === "out_of_sync" ? { icon: "warning", text: "Out of sync" } : undefined}
            ariaLabel={`Motion clip, ${label}${pl.status === "out_of_sync" ? ", out of sync" : ""}, ${timecode(pl.startMs, fps)} to ${timecode(pl.endMs, fps)}`}
            onPointerDown={(e) => onMotionDown(m.id, e)}
            onClick={() => {
              ui().select({ kind: "motion", id: m.id });
              ui().setPanel("motion");
            }}
          />
        );
      });
    }
    return clipsOnTrack(project, t.id).map((c) => {
      const a = project.assets[c.assetId];
      if (!a) return null;
      const w = (clipLength(c) / 1000) * px;
      const sel = selection?.kind === "clip" && selection.id === c.id;
      const pending = a.proxy.status === "pending";
      // Speed and mute are spelled out in the label, so they never rely on colour.
      const notes = [c.speed !== 1 && `${Number(c.speed.toFixed(2))}x`, c.muted && a.hasAudio && "muted"].filter(Boolean).join(", ");
      const name = notes ? `${a.name} · ${notes}` : a.name;
      return (
        <Clip
          key={c.id}
          kind={t.kind === "audio" || !a.hasVideo ? "audio" : "video"}
          label={pending ? `${a.name} (preparing ${Math.round(a.proxy.progress * 100)}%)` : name}
          left={(c.startMs / 1000) * px}
          width={w}
          selected={sel}
          dimmed={dim}
          trimmable={!t.locked}
          thumbnails={a.hasVideo && t.kind === "video" ? thumbs(a, c, w, px) : undefined}
          bars={t.kind === "audio" || !a.hasVideo ? bars(a, c, w) : undefined}
          status={a.proxy.status === "failed" ? { icon: "alert", text: "Not ready" } : undefined}
          ariaLabel={`${a.hasVideo && t.kind === "video" ? "Video" : "Audio"} clip, ${name}, ${timecode(c.startMs, fps)} to ${timecode(clipEnd(c), fps)}`}
          style={tool === "blade" ? { cursor: "crosshair" } : undefined}
          onPointerDown={(e) => onMediaDown(c, e)}
          onClick={() => {
            if (tool !== "select") return;
            ui().select({ kind: "clip", id: c.id });
            ui().setPanel("clip");
          }}
          onTrimPointerDown={(edge, e) => onTrimDown(c, edge, e)}
        />
      );
    });
  };

  return (
    <div className="timeline" aria-label="Timeline">
      <div ref={scroller} className="timeline__scroll">
        <div className="timeline__content" style={{ width: HEADER + width }}>
          <div className="timeline__row">
            <div className="timeline__corner">
              <Button variant="ghost" size="sm" icon="plus" onClick={() => store().commit((p) => addTrack(p, "video"))}>
                Video track
              </Button>
            </div>
            <TimelineRuler
              seconds={seconds}
              pxPerSecond={px}
              timeMs={playhead}
              valueText={spokenTime(playhead)}
              onSeek={(ms) => ui().setPlayhead(ms)}
              onScrubStart={() => ui().setPlaying(false)}
            />
          </div>
          {project.tracks.length === 0 && (
            // Kept in view while the ruler scrolls sideways.
            <div className="timeline__empty" style={{ width: viewWidth || undefined }}>
              <p className="hint">Drop a clip here, or choose Add media.</p>
              <Button variant="secondary" size="sm" icon="add" onClick={() => void chooseAndImport()}>
                Add media
              </Button>
            </div>
          )}
          {project.tracks.map((t) => {
            const media = t.kind === "video" || t.kind === "audio";
            const movable = project.tracks.filter((x) => x.kind === t.kind).length > 1;
            return (
            <div className="timeline__row" key={t.id} data-track-row={t.id}>
              <div className="timeline__header">
                <TrackHeader
                  name={t.name}
                  locked={t.locked}
                  hidden={t.hidden}
                  onToggleLock={() => toggle(t, "locked")}
                  onToggleHidden={() => toggle(t, "hidden")}
                  onDelete={() => void removeTrack(t.id)}
                  muted={t.muted}
                  onToggleMuted={media ? () => toggle(t, "muted") : undefined}
                  onMove={movable ? (dir) => moveTrackBy(t.id, dir) : undefined}
                  onGripPointerDown={movable ? (e) => onGripDown(t, e) : undefined}
                />
              </div>
              <div data-track-id={t.id}>
                <TrackLane
                  width={width}
                  label={`${t.name} lane`}
                  onPointerDown={(e) => {
                    if (e.target === e.currentTarget) ui().select(null);
                  }}
                >
                  {lane(t)}
                </TrackLane>
              </div>
            </div>
            );
          })}
          <div className="timeline__row">
            <div className="timeline__corner">
              <Button variant="ghost" size="sm" icon="plus" onClick={() => store().commit((p) => addTrack(p, "audio"))}>
                Audio track
              </Button>
            </div>
          </div>
          <div className="timeline__playhead" style={{ left: HEADER }}>
            <Playhead x={(playhead / 1000) * px} />
          </div>
        </div>
      </div>
    </div>
  );
}
