/**
 * The Text panel's look tabs: Font, Colour, Style (outline and shadow) and
 * Animation. Each section has a Reset, and sliders preview live while
 * dragging, then become one undo step.
 */
import { useUi } from "../../../store/ui";
import { Button, PanelRow, PanelSection, SegmentedControl, Select, Slider } from "../../ui";
import { TEXT_FONTS, fontById } from "../../../lib/fonts";
import { DEFAULT_TEXT_STYLE, MAX_TEXT_SIZE, MIN_TEXT_SIZE } from "../../../lib/textStyle";
import type { TextAnimation, TextAnimationKind, TextBackgroundShape, TextShadow } from "../../../types/project";
import { ChoiceList, SwatchPicker } from "./controls";
import type { TextEdit } from "./useTextEdit";

// ---------- Font ----------

export function FontTab({ e }: { e: TextEdit }) {
  const { clip, locked, project } = e;
  const st = clip.style;
  const H = project.settings.height;
  const px = Math.round(st.size * H);
  const spacing = Math.round(st.letterSpacing * 100);
  const lineH = Math.round(st.lineHeight * 100);
  return (
    <>
      <PanelSection>
        <h3 className="section-title">Font</h3>
        <ChoiceList
          label="Font"
          value={st.fontId}
          disabled={locked}
          onChange={(fontId) => e.setStyle({ fontId })}
          items={TEXT_FONTS.map((f) => ({
            value: f.id,
            label: f.name,
            render: <span style={{ fontFamily: `"${f.family}"`, fontWeight: f.weight }}>{f.name}</span>,
          }))}
        />
      </PanelSection>
      <PanelSection>
        <h3 className="section-title">Size and spacing</h3>
        <PanelRow label="Size">
          <Slider
            label="Text size"
            min={Math.round(MIN_TEXT_SIZE * H)}
            max={Math.round(MAX_TEXT_SIZE * H)}
            value={px}
            valueText={`${px} pixels`}
            disabled={locked}
            onChange={(v) => e.liveStyle({ size: v / H })}
            onCommit={e.done}
          />
          <span className="hint">{px} px</span>
        </PanelRow>
        <PanelRow label="Letters">
          <Slider label="Letter spacing" min={-5} max={50} value={spacing} valueText={`${spacing} percent`} disabled={locked} onChange={(v) => e.liveStyle({ letterSpacing: v / 100 })} onCommit={e.done} />
          <span className="hint">{spacing}%</span>
        </PanelRow>
        <PanelRow label="Lines">
          <Slider label="Line spacing" min={80} max={200} value={lineH} valueText={`${lineH} percent`} disabled={locked} onChange={(v) => e.liveStyle({ lineHeight: v / 100 })} onCommit={e.done} />
          <span className="hint">{lineH}%</span>
        </PanelRow>
        <PanelRow label="Case">
          <SegmentedControl
            label="Letter case"
            value={st.caps ? "caps" : "typed"}
            options={[
              { value: "typed", text: "As typed" },
              { value: "caps", text: "Capitals" },
            ]}
            onChange={(v) => !locked && e.setStyle({ caps: v === "caps" })}
          />
        </PanelRow>
        <Button
          variant="ghost"
          size="sm"
          disabled={locked}
          onClick={() => {
            const d = DEFAULT_TEXT_STYLE;
            e.setStyle({ size: d.size, letterSpacing: d.letterSpacing, lineHeight: d.lineHeight, caps: d.caps });
          }}
        >
          Reset size and spacing
        </Button>
        {fontById(st.fontId).url && <p className="hint">This font covers Latin letters. Other scripts show in a system font.</p>}
      </PanelSection>
    </>
  );
}

// ---------- Colour ----------

export function ColourTab({ e }: { e: TextEdit }) {
  const { clip, locked } = e;
  const st = clip.style;
  const bg = st.background;
  const bgOpacity = Math.round(bg.opacity * 100);
  return (
    <>
      <PanelSection>
        <h3 className="section-title">Text colour</h3>
        <SwatchPicker label="Text colour" value={st.color} disabled={locked} onChange={(color) => e.setStyle({ color })} />
      </PanelSection>
      <PanelSection>
        <h3 className="section-title">Background</h3>
        <PanelRow label="Shape">
          <SegmentedControl
            label="Background shape"
            value={bg.shape}
            options={[
              { value: "none", text: "None" },
              { value: "lines", text: "Lines" },
              { value: "block", text: "Block" },
            ]}
            onChange={(v) => !locked && e.setStyle({ background: { ...bg, shape: v as TextBackgroundShape } })}
          />
        </PanelRow>
        <SwatchPicker
          label="Background colour"
          value={bg.color}
          disabled={locked}
          // Picking a colour with no background shows one, so the choice is never invisible.
          onChange={(color) => e.setStyle({ background: { ...bg, color, shape: bg.shape === "none" ? "lines" : bg.shape } })}
        />
        <PanelRow label="Opacity">
          <Slider
            label="Background opacity"
            min={0}
            max={100}
            value={bgOpacity}
            valueText={`${bgOpacity} percent`}
            disabled={locked || bg.shape === "none"}
            onChange={(v) => e.liveStyle({ background: { ...bg, opacity: v / 100 } })}
            onCommit={e.done}
          />
          <span className="hint">{bgOpacity}%</span>
        </PanelRow>
        <p className="hint">Lines puts a box behind each line, like a highlighter. Block puts one box behind all of it.</p>
      </PanelSection>
    </>
  );
}

// ---------- Style ----------

export function StyleTab({ e }: { e: TextEdit }) {
  const { clip, locked } = e;
  const st = clip.style;
  const width = Math.round(st.outline.width * 100);
  return (
    <>
      <PanelSection>
        <h3 className="section-title">Outline</h3>
        <PanelRow label="Width">
          <Slider
            label="Outline width"
            min={0}
            max={20}
            value={width}
            valueText={width === 0 ? "No outline" : `${width} percent of the text size`}
            disabled={locked}
            onChange={(v) => e.liveStyle({ outline: { ...st.outline, width: v / 100 } })}
            onCommit={e.done}
          />
          <span className="hint">{width === 0 ? "None" : `${width}%`}</span>
        </PanelRow>
        <SwatchPicker
          label="Outline colour"
          value={st.outline.color}
          disabled={locked}
          onChange={(color) => e.setStyle({ outline: { color, width: st.outline.width || 0.06 } })}
        />
      </PanelSection>
      <PanelSection>
        <h3 className="section-title">Shadow</h3>
        <PanelRow label="Shadow">
          <SegmentedControl
            label="Shadow"
            value={st.shadow.kind}
            options={[
              { value: "none", text: "None" },
              { value: "soft", text: "Soft" },
              { value: "hard", text: "Hard" },
            ]}
            onChange={(v) => !locked && e.setStyle({ shadow: { ...st.shadow, kind: v as TextShadow } })}
          />
        </PanelRow>
        {st.shadow.kind !== "none" && <SwatchPicker label="Shadow colour" value={st.shadow.color} disabled={locked} onChange={(color) => e.setStyle({ shadow: { ...st.shadow, color } })} />}
        <Button
          variant="ghost"
          size="sm"
          disabled={locked}
          onClick={() => e.setStyle({ outline: DEFAULT_TEXT_STYLE.outline, shadow: DEFAULT_TEXT_STYLE.shadow })}
        >
          Reset outline and shadow
        </Button>
      </PanelSection>
    </>
  );
}

// ---------- Animation ----------

const ANIMATIONS: { value: TextAnimationKind; label: string }[] = [
  { value: "none", label: "None" },
  { value: "fade", label: "Fade" },
  { value: "pop", label: "Pop" },
  { value: "rise", label: "Rise" },
  { value: "drop", label: "Drop" },
  { value: "typewriter", label: "Typewriter" },
];

function AnimationRows({ what, anim, maxMs, locked, onSet, onLive, onDone }: {
  what: "In" | "Out";
  anim: TextAnimation;
  maxMs: number;
  locked: boolean;
  onSet: (a: TextAnimation) => void;
  onLive: (a: TextAnimation) => void;
  onDone: () => void;
}) {
  const secs = (anim.durationMs / 1000).toFixed(1);
  return (
    <>
      <PanelRow label={what}>
        <Select label={`${what} animation`} value={anim.kind} options={ANIMATIONS} disabled={locked} onChange={(v) => onSet({ ...anim, kind: v as TextAnimationKind })} />
      </PanelRow>
      <PanelRow label="Length">
        <Slider
          label={`${what} animation length`}
          min={100}
          max={Math.max(100, maxMs)}
          step={100}
          value={Math.min(anim.durationMs, Math.max(100, maxMs))}
          valueText={`${secs} seconds`}
          disabled={locked || anim.kind === "none"}
          onChange={(v) => onLive({ ...anim, durationMs: v })}
          onCommit={onDone}
        />
        <span className="hint">{secs} s</span>
      </PanelRow>
    </>
  );
}

export function AnimationTab({ e }: { e: TextEdit }) {
  const { clip, locked } = e;
  const playhead = useUi((s) => s.playheadMs);
  const local = playhead - clip.startMs;
  // A paused playhead inside the in animation shows the text partly in, or not at all, which reads as "my text vanished".
  const midIn = clip.animIn.kind !== "none" && local >= 0 && local < clip.animIn.durationMs;
  // Each animation may take up to half the clip, in 100 ms steps, and no more than 3 s.
  const maxMs = Math.min(3000, Math.floor(clip.durationMs / 2 / 100) * 100);
  const preview = () => {
    const ui = useUi.getState();
    ui.setPlayhead(clip.startMs);
    ui.setPlaying(true);
  };
  return (
    <PanelSection>
      <h3 className="section-title">Animation</h3>
      <AnimationRows what="In" anim={clip.animIn} maxMs={maxMs} locked={locked} onSet={(animIn) => e.set({ animIn })} onLive={(animIn) => e.live({ animIn })} onDone={e.done} />
      <AnimationRows what="Out" anim={clip.animOut} maxMs={maxMs} locked={locked} onSet={(animOut) => e.set({ animOut })} onLive={(animOut) => e.live({ animOut })} onDone={e.done} />
      <div className="button-row">
        <Button variant="secondary" size="sm" icon="play" onClick={preview}>
          Play from text start
        </Button>
      </div>
      {midIn && <p className="hint">The playhead is inside the in animation, so the text is not fully in yet. Play from the text start to see it.</p>}
      <p className="hint">The in animation plays as the text appears, the out animation as it leaves. Splitting text keeps the in animation on the first part and the out animation on the second.</p>
    </PanelSection>
  );
}
