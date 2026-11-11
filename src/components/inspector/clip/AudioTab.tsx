/**
 * Audio: the clip's own sound. The same tab shows in the Clip panel (a video
 * clip with sound) and the Audio panel (a clip on an audio track), so the
 * controls live in one place (AGENTS.md, UX standards).
 */
import { Button, PanelRow, PanelSection, SegmentedControl, Slider } from "../../ui";
import { detachSelectionAudio } from "../../../lib/actions";
import type { ClipEdit } from "./useClipEdit";
import { FadeRows, fadeMaxFor } from "./shared";

export function AudioTab({ e }: { e: ClipEdit }) {
  const { clip, locked, picture } = e;
  const volume = Math.round(clip.volume * 100);
  return (
    <PanelSection>
      <h3 className="section-title">Sound</h3>
      <PanelRow label="Volume">
        <Slider label="Clip volume" min={0} max={200} value={volume} valueText={`${volume} percent`} disabled={locked || clip.muted} onChange={(v) => e.live({ volume: v / 100 })} onCommit={e.done} />
        <span className="hint">{volume}%</span>
      </PanelRow>
      <PanelRow label="Sound">
        <SegmentedControl
          label="Clip sound"
          value={clip.muted ? "muted" : "on"}
          options={[
            { value: "on", text: "On" },
            { value: "muted", text: "Muted" },
          ]}
          onChange={(v) => !locked && e.set({ muted: v === "muted" })}
        />
      </PanelRow>
      <FadeRows
        what="Sound"
        inMs={clip.audioFadeInMs}
        outMs={clip.audioFadeOutMs}
        maxMs={fadeMaxFor(e)}
        disabled={locked || clip.muted}
        onChange={(edge, ms) => e.live(edge === "in" ? { audioFadeInMs: ms } : { audioFadeOutMs: ms })}
        onCommit={e.done}
      />
      {clip.muted && <p className="hint">This clip is muted. Turn its sound on to change the volume and fades.</p>}
      {picture && (
        <>
          <Button variant="secondary" size="sm" icon="music" disabled={locked || clip.muted} onClick={detachSelectionAudio}>
            Detach audio
          </Button>
          <p className="hint">
            {clip.muted
              ? "Turn the sound on to detach it again."
              : "Moves the sound to its own clip on an audio track, so you can trim or move it on its own."}
          </p>
        </>
      )}
    </PanelSection>
  );
}
