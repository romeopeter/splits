/**
 * Text: what it says and how it lines up, where it sits, and the edit
 * commands. The editor takes focus (with its words selected) right after
 * text is added or double-clicked on the canvas, so typing replaces them.
 */
import { useEffect, useRef } from "react";
import { useUi } from "../../../store/ui";
import { Button, Field, PanelRow, PanelSection, SegmentedControl, Slider } from "../../ui";
import { deleteSelection, duplicateSelection, rippleDeleteSelection, splitAtPlayhead } from "../../../lib/actions";
import type { TextAlign } from "../../../types/project";
import type { TextEdit } from "./useTextEdit";

const num = (v: string, fallback: number) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

/** The last focus request handled, so remounting the tab does not steal focus again. */
let handledTick = 0;

export function TextTab({ e }: { e: TextEdit }) {
  const { clip, locked } = e;
  const tick = useUi((s) => s.textEditTick);
  const editor = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (tick === handledTick) return;
    handledTick = tick;
    editor.current?.focus();
    editor.current?.select();
  }, [tick]);

  const opacity = Math.round(clip.opacity * 100);
  return (
    <>
      <PanelSection>
        <label className="sp-row__label" htmlFor={`text-${clip.id}`}>
          Text
        </label>
        <div className="sp-field__box text-editor">
          <textarea
            id={`text-${clip.id}`}
            ref={editor}
            className="sp-field__input"
            rows={3}
            value={clip.text}
            disabled={locked}
            placeholder="Type your text"
            spellCheck
            onChange={(ev) => e.live({ text: ev.target.value })}
            onBlur={e.done}
          />
        </div>
        <PanelRow label="Align">
          <SegmentedControl
            label="Text alignment"
            value={clip.style.align}
            options={[
              { value: "left", icon: "align-left", label: "Align left" },
              { value: "center", icon: "align-center", label: "Align centre" },
              { value: "right", icon: "align-right", label: "Align right" },
            ]}
            onChange={(v) => !locked && e.setStyle({ align: v as TextAlign })}
          />
        </PanelRow>
        <p className="hint">Press Enter for a new line. Long lines wrap to fit the frame.</p>
      </PanelSection>

      <PanelSection>
        <h3 className="section-title">Placement</h3>
        <PanelRow label="Position" inline>
          <Field label="Position X in pixels" type="number" value={Math.round(clip.x)} unit="X" disabled={locked} onCommit={(v) => e.set({ x: num(v, clip.x) })} />
          <Field label="Position Y in pixels" type="number" value={Math.round(clip.y)} unit="Y" disabled={locked} onCommit={(v) => e.set({ y: num(v, clip.y) })} />
        </PanelRow>
        <PanelRow label="Rotation">
          <Slider label="Rotation" min={-180} max={180} value={Math.round(clip.rotation)} valueText={`${Math.round(clip.rotation)} degrees`} disabled={locked} onChange={(v) => e.live({ rotation: v })} onCommit={e.done} />
          <span className="hint">{Math.round(clip.rotation)}°</span>
        </PanelRow>
        <PanelRow label="Opacity">
          <Slider label="Opacity" min={0} max={100} value={opacity} valueText={`${opacity} percent`} disabled={locked} onChange={(v) => e.live({ opacity: v / 100 })} onCommit={e.done} />
          <span className="hint">{opacity}%</span>
        </PanelRow>
        <p className="hint">Drag the text on the canvas to move it, or select it there and use the arrow keys.</p>
        <Button variant="ghost" size="sm" disabled={locked || (clip.x === 0 && clip.y === 0 && clip.rotation === 0)} onClick={() => e.set({ x: 0, y: 0, rotation: 0 })}>
          Centre text
        </Button>
      </PanelSection>

      <PanelSection>
        <h3 className="section-title">Edit</h3>
        <div className="button-row">
          <Button variant="secondary" size="sm" icon="split" disabled={locked} onClick={splitAtPlayhead}>
            Split
          </Button>
          <Button variant="secondary" size="sm" disabled={locked} onClick={duplicateSelection}>
            Duplicate text
          </Button>
          <Button variant="secondary" size="sm" icon="trash" disabled={locked} onClick={deleteSelection}>
            Delete text
          </Button>
          <Button variant="secondary" size="sm" disabled={locked} onClick={rippleDeleteSelection}>
            Delete and close gap
          </Button>
        </div>
        {locked && <p className="hint">{e.track.name} is locked. Unlock it in the timeline to edit this text.</p>}
      </PanelSection>
    </>
  );
}
