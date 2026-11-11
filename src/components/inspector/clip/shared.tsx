/** Pieces shared by the Clip and Audio panels' tabs. */
import { PanelRow, Slider } from "../../ui";
import { clipEnd, clipLength } from "../../../lib/timeline";
import { timecode } from "../../../lib/time";
import type { ClipEdit } from "./useClipEdit";

/** Longest fade the sliders offer. */
const MAX_FADE_MS = 10_000;

export const secondsText = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
export const speedText = (s: number) => `${Number(s.toFixed(2))}x`;

/** The longest fade this clip allows, in 100 ms steps (at least 100 ms so the slider has a range). */
export const fadeMaxFor = (e: ClipEdit) => Math.max(100, Math.min(MAX_FADE_MS, Math.floor(clipLength(e.clip) / 100) * 100));

/** The clip's name and place on the timeline, above the tabs. */
export function ClipSummary({ e }: { e: ClipEdit }) {
  const { clip, asset, project, locked } = e;
  const fps = project.settings.fps;
  return (
    <div className="clip-summary">
      <p className="panel-lead" title={asset.path}>
        {asset.name}
      </p>
      <p className="hint">
        {timecode(clip.startMs, fps)} to {timecode(clipEnd(clip), fps)}
        {clip.speed !== 1 && ` · ${speedText(clip.speed)}`}
        {clip.muted && " · Muted"}
        {locked && " · Track locked"}
      </p>
    </div>
  );
}

export function FadeRows({
  what,
  inMs,
  outMs,
  maxMs,
  disabled,
  onChange,
  onCommit,
}: {
  what: "Picture" | "Sound";
  inMs: number;
  outMs: number;
  maxMs: number;
  disabled: boolean;
  onChange: (edge: "in" | "out", ms: number) => void;
  onCommit: () => void;
}) {
  return (
    <>
      <PanelRow label="Fade in">
        <Slider label={`${what} fade in`} min={0} max={maxMs} step={100} value={inMs} valueText={secondsText(inMs)} disabled={disabled} onChange={(v) => onChange("in", v)} onCommit={onCommit} />
        <span className="hint">{secondsText(inMs)}</span>
      </PanelRow>
      <PanelRow label="Fade out">
        <Slider label={`${what} fade out`} min={0} max={maxMs} step={100} value={outMs} valueText={secondsText(outMs)} disabled={disabled} onChange={(v) => onChange("out", v)} onCommit={onCommit} />
        <span className="hint">{secondsText(outMs)}</span>
      </PanelRow>
    </>
  );
}
