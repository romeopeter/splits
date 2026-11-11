/**
 * The Text panel. With a text clip selected, it shows six tabs, in the order
 * people reach for them (the feature set follows Instagram Edits' text tools):
 *
 *   Text       what it says, alignment, placement, edit commands
 *   Presets    one-click looks
 *   Font       typeface, size, spacing, capitals
 *   Colour     text colour, background shape and colour
 *   Style      outline and shadow
 *   Animation  in and out
 *
 * Six tabs do not fit as words in the 320 px panel, so they are icons, each
 * with its name as tooltip and accessible name.
 *
 * With no text selected, the panel is where you add text: plain, or straight
 * from a preset. T adds text at the playhead from anywhere.
 */
import { useUi, type TextTab as TextTabId } from "../../store/ui";
import { Button, Panel, PanelSection, Tabs, type TabItem } from "../ui";
import { addTextAtPlayhead } from "../../lib/actions";
import { presetStyle } from "../../lib/textStyle";
import { textEnd } from "../../lib/timeline";
import { timecode } from "../../lib/time";
import { useTextEdit, type TextEdit } from "./text/useTextEdit";
import { TextTab } from "./text/TextTab";
import { PresetGrid } from "./text/PresetGrid";
import { AnimationTab, ColourTab, FontTab, StyleTab } from "./text/StyleTabs";

const TABS: TabItem<TextTabId>[] = [
  { id: "text", text: "Text", icon: "edit" },
  { id: "presets", text: "Presets", icon: "presets" },
  { id: "font", text: "Font", icon: "font" },
  { id: "colour", text: "Colour", icon: "colour" },
  { id: "style", text: "Style", icon: "style" },
  { id: "animation", text: "Animation", icon: "animation" },
];

function Summary({ e }: { e: TextEdit }) {
  const fps = e.project.settings.fps;
  const first = e.clip.text.split("\n")[0]?.trim() || "Empty text";
  return (
    <div className="clip-summary">
      <p className="panel-lead">{first}</p>
      <p className="hint">
        {timecode(e.clip.startMs, fps)} to {timecode(textEnd(e.clip), fps)} · {e.track.name}
        {e.locked && " · Track locked"}
      </p>
    </div>
  );
}

export function TextPanel() {
  const e = useTextEdit();
  const tab = useUi((s) => s.textTab);

  if (!e) {
    return (
      <Panel title="Text">
        <PanelSection>
          <Button variant="secondary" icon="add" onClick={() => addTextAtPlayhead()}>
            Add text
          </Button>
          <p className="hint">Adds a title at the playhead for three seconds. Press T to add text from anywhere.</p>
        </PanelSection>
        <PanelSection>
          <h3 className="section-title">Start from a style</h3>
          <PresetGrid action="Add" onPick={(p) => addTextAtPlayhead({ style: presetStyle(p), animIn: p.animIn })} />
        </PanelSection>
      </Panel>
    );
  }

  return (
    <Panel title="Text">
      <Tabs label="Text settings" tabs={TABS} value={tab} onChange={(t) => useUi.getState().set({ textTab: t })} header={<Summary e={e} />}>
        {tab === "text" && <TextTab e={e} />}
        {tab === "presets" && (
          <PanelSection>
            <h3 className="section-title">Presets</h3>
            <PresetGrid action="Apply" disabled={e.locked} onPick={(p) => e.set({ style: presetStyle(p), ...(p.animIn ? { animIn: p.animIn } : {}) })} />
            <p className="hint">A preset replaces the font, colours and style. Your words, position and timing stay.</p>
          </PanelSection>
        )}
        {tab === "font" && <FontTab e={e} />}
        {tab === "colour" && <ColourTab e={e} />}
        {tab === "style" && <StyleTab e={e} />}
        {tab === "animation" && <AnimationTab e={e} />}
      </Tabs>
    </Panel>
  );
}
