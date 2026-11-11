/**
 * The Clip panel: everything about the selected media clip.
 *
 * Sliders edit live and become one undo step when released (`useGestureEdit`);
 * number fields and buttons commit at once. Picture sections (transform, crop,
 * fades, chroma key) show only for a clip on a video track; a video file's
 * clip on an audio track (detached audio) is sound only.
 */
import { useProject } from "../../store/project";
import { useUi } from "../../store/ui";
import { Button, ColorField, Field, IconButton, Panel, PanelRow, PanelSection, SegmentedControl, Slider } from "../ui";
import { useGestureEdit } from "../../hooks/useGestureEdit";
import { closeGapsOnTrack, deleteSelection, detachSelectionAudio, duplicateSelection, rippleDeleteSelection, splitAtPlayhead } from "../../lib/actions";
import {
  DEFAULT_TRANSFORM,
  MAX_CROP,
  MAX_SPEED,
  MIN_SPEED,
  NO_CROP,
  clipEnd,
  clipLength,
  isLocked,
  setClipSpeed,
  trackById,
  updateClip,
} from "../../lib/timeline";
import { clamp, timecode } from "../../lib/time";
import type { ChromaKey, Crop, MediaClip, Project, Transform } from "../../types/project";

/** Longest fade the sliders offer. */
const MAX_FADE_MS = 10_000;

/** The speed slider is logarithmic: 0 is 1x, -200 is 0.25x, +200 is 4x, so slowing down and speeding up get equal room. */
const speedToSlider = (s: number) => Math.round(Math.log2(s) * 100);
const sliderToSpeed = (v: number) => Math.round(2 ** (v / 100) * 100) / 100;
const speedText = (s: number) => `${Number(s.toFixed(2))}x`;
const secondsText = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

function FadeRows({
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

export function ClipPanel() {
  const project = useProject((s) => s.project);
  const selection = useUi((s) => s.selection);
  const eyedropper = useUi((s) => s.eyedropperClipId);
  const g = useGestureEdit();
  const clip = selection?.kind === "clip" ? project.clips[selection.id] : undefined;
  const asset = clip && project.assets[clip.assetId];
  const track = clip && trackById(project, clip.trackId);

  if (!clip || !asset || !track) {
    return (
      <Panel title="Clip">
        <PanelSection>
          <p className="hint">Select a clip on the timeline to change its speed, position, size, crop, fades, chroma key or volume.</p>
        </PanelSection>
      </Panel>
    );
  }

  const locked = isLocked(project, clip.trackId);
  const picture = asset.hasVideo && track.kind === "video";
  const edit = (patch: Partial<MediaClip>) => (p: Project) => updateClip(p, clip.id, patch);
  const set = (patch: Partial<MediaClip>) => useProject.getState().commit(edit(patch));
  const live = (patch: Partial<MediaClip>) => g.change(edit(patch));
  const tf = (patch: Partial<Transform>) => ({ transform: { ...clip.transform, ...patch } });
  const ck = (patch: Partial<ChromaKey>) => ({ chromaKey: { ...clip.chromaKey, ...patch } });
  /** Opposite edges together leave at least 10% of the picture. */
  const crop = (edge: keyof Crop, v: number): Partial<MediaClip> => {
    const other = { left: "right", right: "left", top: "bottom", bottom: "top" } as const;
    const value = clamp(v, 0, MAX_CROP - clip.crop[other[edge]]);
    return { crop: { ...clip.crop, [edge]: value } };
  };
  const num = (v: string, fallback: number) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
  const fps = project.settings.fps;
  const len = clipLength(clip);
  const fadeMax = Math.max(100, Math.min(MAX_FADE_MS, Math.floor(len / 100) * 100));
  const hasMotion = Object.values(project.motion).some((m) => m.assetId === clip.assetId);
  const cropped = clip.crop.left + clip.crop.top + clip.crop.right + clip.crop.bottom > 0;

  return (
    <Panel title="Clip">
      <PanelSection>
        <p className="panel-lead" title={asset.path}>
          {asset.name}
        </p>
        <p className="hint">
          {timecode(clip.startMs, fps)} to {timecode(clipEnd(clip), fps)}
          {clip.speed !== 1 && ` · ${speedText(clip.speed)}`}
          {clip.muted && " · Muted"}
          {locked && " · Track locked"}
        </p>
      </PanelSection>

      <PanelSection>
        <h3 className="section-title">Speed</h3>
        <PanelRow label="Speed">
          <Slider
            label="Clip speed"
            min={speedToSlider(MIN_SPEED)}
            max={speedToSlider(MAX_SPEED)}
            value={speedToSlider(clip.speed)}
            valueText={speedText(clip.speed)}
            disabled={locked}
            onChange={(v) => g.change((p) => setClipSpeed(p, clip.id, sliderToSpeed(v)))}
            onCommit={g.done}
          />
          <Field
            label="Speed multiplier"
            type="number"
            value={Number(clip.speed.toFixed(2))}
            unit="x"
            min={MIN_SPEED}
            max={MAX_SPEED}
            step={0.05}
            disabled={locked}
            onCommit={(v) => useProject.getState().commit((p) => setClipSpeed(p, clip.id, num(v, clip.speed)))}
          />
        </PanelRow>
        <p className="hint">
          From {speedText(MIN_SPEED)} to {speedText(MAX_SPEED)}. Voices keep their pitch. Later clips on this track move with the clip&apos;s end.
          {hasMotion && clip.speed !== 1 && " Motion on this clip may show as out of sync; regenerate it."}
        </p>
        <Button variant="ghost" size="sm" disabled={locked || clip.speed === 1} onClick={() => useProject.getState().commit((p) => setClipSpeed(p, clip.id, 1))}>
          Reset speed
        </Button>
      </PanelSection>

      {picture && (
        <PanelSection>
          <h3 className="section-title">Transform</h3>
          <PanelRow label="Position" inline>
            <Field label="Position X in pixels" type="number" value={clip.transform.x} unit="X" disabled={locked} onCommit={(v) => set(tf({ x: num(v, clip.transform.x) }))} />
            <Field label="Position Y in pixels" type="number" value={clip.transform.y} unit="Y" disabled={locked} onCommit={(v) => set(tf({ y: num(v, clip.transform.y) }))} />
          </PanelRow>
          <PanelRow label="Scale">
            <Slider label="Scale" min={10} max={400} value={Math.round(clip.transform.scale * 100)} valueText={`${Math.round(clip.transform.scale * 100)} percent`} disabled={locked} onChange={(v) => live(tf({ scale: v / 100 }))} onCommit={g.done} />
            <Field label="Scale percent" type="number" value={Math.round(clip.transform.scale * 100)} unit="%" disabled={locked} onCommit={(v) => set(tf({ scale: Math.max(0.1, num(v, 100) / 100) }))} />
          </PanelRow>
          <PanelRow label="Rotation">
            <Slider label="Rotation" min={-180} max={180} value={Math.round(clip.transform.rotation)} valueText={`${Math.round(clip.transform.rotation)} degrees`} disabled={locked} onChange={(v) => live(tf({ rotation: v }))} onCommit={g.done} />
            <Field
              label="Rotation in degrees"
              type="number"
              value={Math.round(clip.transform.rotation * 10) / 10}
              unit="°"
              disabled={locked}
              onCommit={(v) => set(tf({ rotation: ((((num(v, 0) + 180) % 360) + 360) % 360) - 180 }))}
            />
          </PanelRow>
          <PanelRow label="Flip" inline>
            <Button variant="secondary" size="sm" icon={clip.transform.flipH ? "check" : undefined} aria-pressed={clip.transform.flipH} disabled={locked} onClick={() => set(tf({ flipH: !clip.transform.flipH }))}>
              Horizontal
            </Button>
            <Button variant="secondary" size="sm" icon={clip.transform.flipV ? "check" : undefined} aria-pressed={clip.transform.flipV} disabled={locked} onClick={() => set(tf({ flipV: !clip.transform.flipV }))}>
              Vertical
            </Button>
          </PanelRow>
          <PanelRow label="Opacity">
            <Slider label="Opacity" min={0} max={100} value={Math.round(clip.transform.opacity * 100)} valueText={`${Math.round(clip.transform.opacity * 100)} percent`} disabled={locked} onChange={(v) => live(tf({ opacity: v / 100 }))} onCommit={g.done} />
          </PanelRow>
          <Button variant="ghost" size="sm" disabled={locked} onClick={() => set({ transform: DEFAULT_TRANSFORM })}>
            Reset transform
          </Button>
        </PanelSection>
      )}

      {picture && (
        <PanelSection>
          <h3 className="section-title">Crop</h3>
          {(["left", "right", "top", "bottom"] as const).map((edge) => {
            const pct = Math.round(clip.crop[edge] * 100);
            const name = edge[0]!.toUpperCase() + edge.slice(1);
            return (
              <PanelRow key={edge} label={name}>
                <Slider label={`Crop ${edge}`} min={0} max={MAX_CROP * 100} value={pct} valueText={`${pct} percent`} disabled={locked} onChange={(v) => live(crop(edge, v / 100))} onCommit={g.done} />
                <span className="hint">{pct}%</span>
              </PanelRow>
            );
          })}
          <Button variant="ghost" size="sm" disabled={locked || !cropped} onClick={() => set({ crop: NO_CROP })}>
            Reset crop
          </Button>
        </PanelSection>
      )}

      {picture && (
        <PanelSection>
          <h3 className="section-title">Picture fades</h3>
          <FadeRows
            what="Picture"
            inMs={clip.videoFadeInMs}
            outMs={clip.videoFadeOutMs}
            maxMs={fadeMax}
            disabled={locked}
            onChange={(edge, ms) => live(edge === "in" ? { videoFadeInMs: ms } : { videoFadeOutMs: ms })}
            onCommit={g.done}
          />
          <p className="hint">Fades to black on the bottom track, or to the tracks below.</p>
        </PanelSection>
      )}

      {picture && (
        <PanelSection>
          <h3 className="section-title">Chroma key</h3>
          <PanelRow label="Key">
            <SegmentedControl
              label="Chroma key"
              value={clip.chromaKey.enabled ? "on" : "off"}
              options={[
                { value: "off", text: "Off" },
                { value: "on", text: "On" },
              ]}
              onChange={(v) => !locked && set(ck({ enabled: v === "on" }))}
            />
          </PanelRow>
          <PanelRow label="Colour">
            <ColorField
              label="Key colour"
              value={clip.chromaKey.color}
              onChange={(hex) => set(ck({ color: hex, enabled: true }))}
              trailing={
                <IconButton
                  icon="select"
                  label={eyedropper ? "Cancel picking key colour" : "Pick key colour from the video"}
                  active={!!eyedropper}
                  disabled={locked}
                  onClick={() => useUi.getState().set({ eyedropperClipId: eyedropper ? null : clip.id })}
                />
              }
            />
          </PanelRow>
          {eyedropper && <p className="hint">Click the background colour in the canvas.</p>}
          <PanelRow label="Range">
            <Slider label="Key similarity" min={1} max={60} value={Math.round(clip.chromaKey.similarity * 100)} valueText={`${Math.round(clip.chromaKey.similarity * 100)} percent`} disabled={locked || !clip.chromaKey.enabled} onChange={(v) => live(ck({ similarity: v / 100 }))} onCommit={g.done} />
          </PanelRow>
          <PanelRow label="Edge">
            <Slider label="Key edge softness" min={0} max={40} value={Math.round(clip.chromaKey.smoothness * 100)} valueText={`${Math.round(clip.chromaKey.smoothness * 100)} percent`} disabled={locked || !clip.chromaKey.enabled} onChange={(v) => live(ck({ smoothness: v / 100 }))} onCommit={g.done} />
          </PanelRow>
        </PanelSection>
      )}

      {asset.hasAudio && (
        <PanelSection>
          <h3 className="section-title">Audio</h3>
          <PanelRow label="Volume">
            <Slider label="Clip volume" min={0} max={200} value={Math.round(clip.volume * 100)} valueText={`${Math.round(clip.volume * 100)} percent`} disabled={locked || clip.muted} onChange={(v) => live({ volume: v / 100 })} onCommit={g.done} />
            <span className="hint">{Math.round(clip.volume * 100)}%</span>
          </PanelRow>
          <PanelRow label="Sound">
            <SegmentedControl
              label="Clip sound"
              value={clip.muted ? "muted" : "on"}
              options={[
                { value: "on", text: "On" },
                { value: "muted", text: "Muted" },
              ]}
              onChange={(v) => !locked && set({ muted: v === "muted" })}
            />
          </PanelRow>
          <FadeRows
            what="Sound"
            inMs={clip.audioFadeInMs}
            outMs={clip.audioFadeOutMs}
            maxMs={fadeMax}
            disabled={locked || clip.muted}
            onChange={(edge, ms) => live(edge === "in" ? { audioFadeInMs: ms } : { audioFadeOutMs: ms })}
            onCommit={g.done}
          />
          {picture && (
            <>
              <Button variant="secondary" size="sm" icon="music" disabled={locked || clip.muted} onClick={detachSelectionAudio}>
                Detach audio
              </Button>
              <p className="hint">
                {clip.muted
                  ? "This clip is muted. Turn its sound on to detach it again."
                  : "Moves the sound to its own clip on an audio track, so you can trim or move it on its own."}
              </p>
            </>
          )}
        </PanelSection>
      )}

      <PanelSection>
        <h3 className="section-title">Edit</h3>
        <div className="button-row">
          <Button variant="secondary" size="sm" icon="split" disabled={locked} onClick={splitAtPlayhead}>
            Split
          </Button>
          <Button variant="secondary" size="sm" disabled={locked} onClick={duplicateSelection}>
            Duplicate clip
          </Button>
          <Button variant="secondary" size="sm" icon="trash" disabled={locked} onClick={deleteSelection}>
            Delete clip
          </Button>
          <Button variant="secondary" size="sm" disabled={locked} onClick={rippleDeleteSelection}>
            Delete and close gap
          </Button>
          <Button variant="ghost" size="sm" disabled={locked} onClick={() => closeGapsOnTrack(track.id)}>
            Close gaps on {track.name}
          </Button>
        </div>
      </PanelSection>
    </Panel>
  );
}
