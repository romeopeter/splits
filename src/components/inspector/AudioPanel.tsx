/**
 * The Audio panel. With a clip on an audio track selected (music, a sound,
 * or detached audio), it shows that clip in two tabs: Audio (volume, mute,
 * fades) and Edit (speed, split and delete). Otherwise it is where you add
 * music or a sound, at the playhead.
 *
 * Enhance voice, noise reduction, loudness and EQ join the Audio tab in
 * phase 4 of the inspector roadmap (split-prd.md).
 */
import { useUi, type AudioTab as AudioTabId } from "../../store/ui";
import { Button, Panel, PanelSection, Tabs, type TabItem } from "../ui";
import { chooseAndImportAudio } from "../../lib/actions";
import { useClipEdit } from "./clip/useClipEdit";
import { ClipSummary } from "./clip/shared";
import { AudioTab } from "./clip/AudioTab";
import { EditTab } from "./clip/EditTab";

const TABS: TabItem<AudioTabId>[] = [
  { id: "audio", text: "Audio" },
  { id: "edit", text: "Edit" },
];

export function AudioPanel() {
  const e = useClipEdit();
  const tab = useUi((s) => s.audioTab);

  if (e && !e.picture) {
    return (
      <Panel title="Audio">
        <Tabs label="Audio clip settings" tabs={TABS} value={tab} onChange={(t) => useUi.getState().set({ audioTab: t })} header={<ClipSummary e={e} />}>
          {tab === "audio" ? <AudioTab e={e} /> : <EditTab e={e} />}
        </Tabs>
      </Panel>
    );
  }

  return (
    <Panel title="Audio">
      <PanelSection>
        <Button variant="secondary" icon="add" onClick={() => void chooseAndImportAudio()}>
          Add music or sound
        </Button>
        <p className="hint">Adds audio files to an audio track at the playhead. Select an audio clip on the timeline to change its volume, fades or speed.</p>
      </PanelSection>
      {e?.asset.hasAudio && (
        <PanelSection>
          <p className="hint">The selected video clip&apos;s sound is in the Clip panel&apos;s Audio tab.</p>
          <Button
            variant="secondary"
            size="sm"
            icon="video"
            onClick={() => {
              useUi.getState().set({ clipTab: "audio" });
              useUi.getState().setPanel("clip");
            }}
          >
            Open Clip
          </Button>
        </PanelSection>
      )}
    </Panel>
  );
}
