/**
 * Edit: speed, then for a clip with a picture its transform and crop, then
 * the edit commands. Shared by the Clip panel and the Audio panel (which
 * shows only speed and the commands).
 */
import { useProject } from "../../../store/project";
import { Button, Field, PanelRow, PanelSection, Slider } from "../../ui";
import { closeGapsOnTrack, deleteSelection, duplicateSelection, rippleDeleteSelection, splitAtPlayhead } from "../../../lib/actions";
import { DEFAULT_TRANSFORM, MAX_CROP, MAX_SPEED, MIN_SPEED, NO_CROP, setClipSpeed } from "../../../lib/timeline";
import { clamp } from "../../../lib/time";
import type { Crop, MediaClip, Transform } from "../../../types/project";
import { num, type ClipEdit } from "./useClipEdit";
import { speedText } from "./shared";

/** The speed slider is logarithmic: 0 is 1x, -200 is 0.25x, +200 is 4x, so slowing down and speeding up get equal room. */
const speedToSlider = (s: number) => Math.round(Math.log2(s) * 100);
const sliderToSpeed = (v: number) => Math.round(2 ** (v / 100) * 100) / 100;

function SpeedSection({ e }: { e: ClipEdit }) {
  const { clip, locked, project } = e;
  const hasMotion = Object.values(project.motion).some((m) => m.assetId === clip.assetId);
  const commitSpeed = (s: number) => useProject.getState().commit((p) => setClipSpeed(p, clip.id, s));
  return (
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
          onChange={(v) => e.liveProject((p) => setClipSpeed(p, clip.id, sliderToSpeed(v)))}
          onCommit={e.done}
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
          onCommit={(v) => commitSpeed(num(v, clip.speed))}
        />
      </PanelRow>
      <p className="hint">
        From {speedText(MIN_SPEED)} to {speedText(MAX_SPEED)}. Voices keep their pitch. Later clips on this track move with the clip&apos;s end.
        {hasMotion && clip.speed !== 1 && " Motion on this clip may show as out of sync; regenerate it."}
      </p>
      <Button variant="ghost" size="sm" disabled={locked || clip.speed === 1} onClick={() => commitSpeed(1)}>
        Reset speed
      </Button>
    </PanelSection>
  );
}

function TransformSection({ e }: { e: ClipEdit }) {
  const { clip, locked, set, live } = e;
  const tf = (patch: Partial<Transform>): Partial<MediaClip> => ({ transform: { ...clip.transform, ...patch } });
  const t = clip.transform;
  const scale = Math.round(t.scale * 100);
  const opacity = Math.round(t.opacity * 100);
  return (
    <PanelSection>
      <h3 className="section-title">Transform</h3>
      <PanelRow label="Position" inline>
        <Field label="Position X in pixels" type="number" value={t.x} unit="X" disabled={locked} onCommit={(v) => set(tf({ x: num(v, t.x) }))} />
        <Field label="Position Y in pixels" type="number" value={t.y} unit="Y" disabled={locked} onCommit={(v) => set(tf({ y: num(v, t.y) }))} />
      </PanelRow>
      <PanelRow label="Scale">
        <Slider label="Scale" min={10} max={400} value={scale} valueText={`${scale} percent`} disabled={locked} onChange={(v) => live(tf({ scale: v / 100 }))} onCommit={e.done} />
        <Field label="Scale percent" type="number" value={scale} unit="%" disabled={locked} onCommit={(v) => set(tf({ scale: Math.max(0.1, num(v, 100) / 100) }))} />
      </PanelRow>
      <PanelRow label="Rotation">
        <Slider label="Rotation" min={-180} max={180} value={Math.round(t.rotation)} valueText={`${Math.round(t.rotation)} degrees`} disabled={locked} onChange={(v) => live(tf({ rotation: v }))} onCommit={e.done} />
        <Field
          label="Rotation in degrees"
          type="number"
          value={Math.round(t.rotation * 10) / 10}
          unit="°"
          disabled={locked}
          onCommit={(v) => set(tf({ rotation: ((((num(v, 0) + 180) % 360) + 360) % 360) - 180 }))}
        />
      </PanelRow>
      <PanelRow label="Flip" inline>
        <Button variant="secondary" size="sm" icon={t.flipH ? "check" : undefined} aria-pressed={t.flipH} disabled={locked} onClick={() => set(tf({ flipH: !t.flipH }))}>
          Horizontal
        </Button>
        <Button variant="secondary" size="sm" icon={t.flipV ? "check" : undefined} aria-pressed={t.flipV} disabled={locked} onClick={() => set(tf({ flipV: !t.flipV }))}>
          Vertical
        </Button>
      </PanelRow>
      <PanelRow label="Opacity">
        <Slider label="Opacity" min={0} max={100} value={opacity} valueText={`${opacity} percent`} disabled={locked} onChange={(v) => live(tf({ opacity: v / 100 }))} onCommit={e.done} />
      </PanelRow>
      <Button variant="ghost" size="sm" disabled={locked} onClick={() => set({ transform: DEFAULT_TRANSFORM })}>
        Reset transform
      </Button>
    </PanelSection>
  );
}

function CropSection({ e }: { e: ClipEdit }) {
  const { clip, locked } = e;
  /** Opposite edges together leave at least 10% of the picture. */
  const crop = (edge: keyof Crop, v: number): Partial<MediaClip> => {
    const other = { left: "right", right: "left", top: "bottom", bottom: "top" } as const;
    return { crop: { ...clip.crop, [edge]: clamp(v, 0, MAX_CROP - clip.crop[other[edge]]) } };
  };
  const cropped = clip.crop.left + clip.crop.top + clip.crop.right + clip.crop.bottom > 0;
  return (
    <PanelSection>
      <h3 className="section-title">Crop</h3>
      {(["left", "right", "top", "bottom"] as const).map((edge) => {
        const pct = Math.round(clip.crop[edge] * 100);
        return (
          <PanelRow key={edge} label={edge[0]!.toUpperCase() + edge.slice(1)}>
            <Slider label={`Crop ${edge}`} min={0} max={MAX_CROP * 100} value={pct} valueText={`${pct} percent`} disabled={locked} onChange={(v) => e.live(crop(edge, v / 100))} onCommit={e.done} />
            <span className="hint">{pct}%</span>
          </PanelRow>
        );
      })}
      <Button variant="ghost" size="sm" disabled={locked || !cropped} onClick={() => e.set({ crop: NO_CROP })}>
        Reset crop
      </Button>
    </PanelSection>
  );
}

function CommandsSection({ e }: { e: ClipEdit }) {
  const { locked, track } = e;
  return (
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
      {locked && <p className="hint">{track.name} is locked. Unlock it in the timeline to edit this clip.</p>}
    </PanelSection>
  );
}

export function EditTab({ e }: { e: ClipEdit }) {
  return (
    <>
      <SpeedSection e={e} />
      {e.picture && <TransformSection e={e} />}
      {e.picture && <CropSection e={e} />}
      <CommandsSection e={e} />
    </>
  );
}
