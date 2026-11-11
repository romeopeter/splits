/**
 * Cutout: making part of the picture transparent so the tracks below show
 * through. Today that is the chroma key; on-device background removal comes
 * in phase 8 of the inspector roadmap (split-prd.md).
 */
import { useUi } from "../../../store/ui";
import { ColorField, IconButton, PanelRow, PanelSection, SegmentedControl, Slider } from "../../ui";
import type { ChromaKey, MediaClip } from "../../../types/project";
import type { ClipEdit } from "./useClipEdit";

export function CutoutTab({ e }: { e: ClipEdit }) {
  const { clip, locked } = e;
  const eyedropper = useUi((s) => s.eyedropperClipId);
  const key = clip.chromaKey;
  const ck = (patch: Partial<ChromaKey>): Partial<MediaClip> => ({ chromaKey: { ...key, ...patch } });
  const similarity = Math.round(key.similarity * 100);
  const smoothness = Math.round(key.smoothness * 100);
  return (
    <PanelSection>
      <h3 className="section-title">Chroma key</h3>
      <p className="hint">Removes one background colour, such as a green screen, so the tracks below show through.</p>
      <PanelRow label="Key">
        <SegmentedControl
          label="Chroma key"
          value={key.enabled ? "on" : "off"}
          options={[
            { value: "off", text: "Off" },
            { value: "on", text: "On" },
          ]}
          onChange={(v) => !locked && e.set(ck({ enabled: v === "on" }))}
        />
      </PanelRow>
      <PanelRow label="Colour">
        <ColorField
          label="Key colour"
          value={key.color}
          onChange={(hex) => e.set(ck({ color: hex, enabled: true }))}
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
        <Slider label="Key similarity" min={1} max={60} value={similarity} valueText={`${similarity} percent`} disabled={locked || !key.enabled} onChange={(v) => e.live(ck({ similarity: v / 100 }))} onCommit={e.done} />
      </PanelRow>
      <PanelRow label="Edge">
        <Slider label="Key edge softness" min={0} max={40} value={smoothness} valueText={`${smoothness} percent`} disabled={locked || !key.enabled} onChange={(v) => e.live(ck({ smoothness: v / 100 }))} onCommit={e.done} />
      </PanelRow>
      {!key.enabled && <p className="hint">Turn the key on to set its range and edge.</p>}
    </PanelSection>
  );
}
