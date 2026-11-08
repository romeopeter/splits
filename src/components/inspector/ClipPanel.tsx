import { useProject } from "../../store/project";
import { useUi } from "../../store/ui";
import { Button, ColorField, Field, IconButton, Panel, PanelRow, PanelSection, SegmentedControl, Slider } from "../ui";
import { useGestureEdit } from "../../hooks/useGestureEdit";
import { deleteSelection, duplicateSelection, splitAtPlayhead } from "../../lib/actions";
import { clipEnd, isLocked, updateClip } from "../../lib/timeline";
import { timecode } from "../../lib/time";
import type { ChromaKey, MediaClip, Transform } from "../../types/project";

export function ClipPanel() {
  const project = useProject((s) => s.project);
  const selection = useUi((s) => s.selection);
  const eyedropper = useUi((s) => s.eyedropperClipId);
  const g = useGestureEdit();
  const clip = selection?.kind === "clip" ? project.clips[selection.id] : undefined;
  const asset = clip && project.assets[clip.assetId];

  if (!clip || !asset) {
    return (
      <Panel title="Clip">
        <PanelSection>
          <p className="hint">Select a clip on the timeline to change its position, size, chroma key or volume.</p>
        </PanelSection>
      </Panel>
    );
  }

  const locked = isLocked(project, clip.trackId);
  const set = (patch: Partial<MediaClip>) => useProject.getState().commit((p) => updateClip(p, clip.id, patch));
  const live = (patch: Partial<MediaClip>) => g.change((p) => updateClip(p, clip.id, patch));
  const tf = (patch: Partial<Transform>) => ({ transform: { ...clip.transform, ...patch } });
  const ck = (patch: Partial<ChromaKey>) => ({ chromaKey: { ...clip.chromaKey, ...patch } });
  const num = (v: string, fallback: number) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
  const fps = project.settings.fps;

  return (
    <Panel title="Clip">
      <PanelSection>
        <p className="panel-lead" title={asset.path}>
          {asset.name}
        </p>
        <p className="hint">
          {timecode(clip.startMs, fps)} to {timecode(clipEnd(clip), fps)}
          {locked && " · Track locked"}
        </p>
      </PanelSection>

      {asset.hasVideo && (
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
          <PanelRow label="Opacity">
            <Slider label="Opacity" min={0} max={100} value={Math.round(clip.transform.opacity * 100)} valueText={`${Math.round(clip.transform.opacity * 100)} percent`} disabled={locked} onChange={(v) => live(tf({ opacity: v / 100 }))} onCommit={g.done} />
          </PanelRow>
          <Button variant="ghost" size="sm" disabled={locked} onClick={() => set({ transform: { x: 0, y: 0, scale: 1, opacity: 1 } })}>
            Reset transform
          </Button>
        </PanelSection>
      )}

      {asset.hasVideo && (
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
            <Slider label="Clip volume" min={0} max={200} value={Math.round(clip.volume * 100)} valueText={`${Math.round(clip.volume * 100)} percent`} disabled={locked} onChange={(v) => live({ volume: v / 100 })} onCommit={g.done} />
            <span className="hint">{Math.round(clip.volume * 100)}%</span>
          </PanelRow>
        </PanelSection>
      )}

      <PanelSection>
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
        </div>
      </PanelSection>
    </Panel>
  );
}
