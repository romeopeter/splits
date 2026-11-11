/**
 * Effects: what happens to the clip's picture over time. Today that is the
 * picture fades. Animation, Styles and Outline join this tab in phase 6 of
 * the inspector roadmap (split-prd.md).
 */
import { PanelSection } from "../../ui";
import type { ClipEdit } from "./useClipEdit";
import { FadeRows, fadeMaxFor } from "./shared";

export function EffectsTab({ e }: { e: ClipEdit }) {
  const { clip, locked } = e;
  return (
    <PanelSection>
      <h3 className="section-title">Fade</h3>
      <FadeRows
        what="Picture"
        inMs={clip.videoFadeInMs}
        outMs={clip.videoFadeOutMs}
        maxMs={fadeMaxFor(e)}
        disabled={locked}
        onChange={(edge, ms) => e.live(edge === "in" ? { videoFadeInMs: ms } : { videoFadeOutMs: ms })}
        onCommit={e.done}
      />
      <p className="hint">Fades to black on the bottom track, or to the tracks below. Sound fades are in the Audio tab.</p>
    </PanelSection>
  );
}
