/**
 * The Clip panel: the selected clip with a picture, in tabs (AGENTS.md,
 * settled 2026-11-11):
 *
 *   Edit     speed, transform, crop, split and delete
 *   Effects  picture fades (animation, styles and outline come later)
 *   Cutout   chroma key (background removal comes later)
 *   Audio    the clip's own sound, when it has any
 *
 * A clip on an audio track is sound only and opens the Audio panel instead.
 * The tab shown is remembered (`clipTab`), so moving from clip to clip keeps
 * you on the same tab.
 */
import { useUi, type ClipTab } from "../../store/ui";
import { Button, Panel, PanelSection, Tabs, type TabItem } from "../ui";
import { useClipEdit } from "./clip/useClipEdit";
import { ClipSummary } from "./clip/shared";
import { EditTab } from "./clip/EditTab";
import { EffectsTab } from "./clip/EffectsTab";
import { CutoutTab } from "./clip/CutoutTab";
import { AudioTab } from "./clip/AudioTab";

export function ClipPanel() {
  const e = useClipEdit();
  const tab = useUi((s) => s.clipTab);

  if (!e) {
    return (
      <Panel title="Clip">
        <PanelSection>
          <p className="hint">Select a clip on the timeline to change its speed, position, crop, fades, chroma key or sound.</p>
          <Button variant="secondary" size="sm" icon="media" onClick={() => useUi.getState().setPanel("media")}>
            Open Media
          </Button>
        </PanelSection>
      </Panel>
    );
  }

  if (!e.picture) {
    return (
      <Panel title="Clip">
        <PanelSection>
          <p className="hint">The selected clip is sound only. Its settings are in Audio.</p>
          <Button variant="secondary" size="sm" icon="audio" onClick={() => useUi.getState().setPanel("audio")}>
            Open Audio
          </Button>
        </PanelSection>
      </Panel>
    );
  }

  const tabs: TabItem<ClipTab>[] = [
    { id: "edit", text: "Edit" },
    { id: "effects", text: "Effects" },
    { id: "cutout", text: "Cutout" },
    ...(e.asset.hasAudio ? [{ id: "audio" as const, text: "Audio" }] : []),
  ];
  const current = tabs.some((t) => t.id === tab) ? tab : "edit";

  return (
    <Panel title="Clip">
      <Tabs label="Clip settings" tabs={tabs} value={current} onChange={(t) => useUi.getState().set({ clipTab: t })} header={<ClipSummary e={e} />}>
        {current === "edit" && <EditTab e={e} />}
        {current === "effects" && <EffectsTab e={e} />}
        {current === "cutout" && <CutoutTab e={e} />}
        {current === "audio" && <AudioTab e={e} />}
      </Tabs>
    </Panel>
  );
}
