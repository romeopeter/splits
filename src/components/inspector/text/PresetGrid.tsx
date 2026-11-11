/**
 * Presets: one-click looks, each previewed in its own font and colours.
 * With a text clip selected, a preset restyles it; in the empty Text panel,
 * a preset adds new text with that look.
 */
import { useEffect } from "react";
import { fontById, loadTextFonts } from "../../../lib/fonts";
import { TEXT_PRESETS, presetStyle, type TextPreset } from "../../../lib/textStyle";

function PresetSample({ preset }: { preset: TextPreset }) {
  const s = presetStyle(preset);
  const f = fontById(s.fontId);
  const bg = s.background.shape !== "none";
  return (
    <span
      className="preset__sample"
      // Each sample shows the preset's own content colours and font.
      style={{
        fontFamily: `"${f.family}"`,
        fontWeight: f.weight,
        color: s.color,
        textTransform: s.caps ? "uppercase" : undefined,
        background: bg ? s.background.color : undefined,
        WebkitTextStroke: s.outline.width > 0 ? `1.5px ${s.outline.color}` : undefined,
      }}
    >
      {preset.name}
    </span>
  );
}

export function PresetGrid({ action, disabled, onPick }: { action: "Apply" | "Add"; disabled?: boolean; onPick: (p: TextPreset) => void }) {
  useEffect(() => {
    void loadTextFonts();
  }, []);
  return (
    <div className="preset-grid">
      {TEXT_PRESETS.map((p) => (
        <button
          key={p.id}
          type="button"
          className="preset"
          disabled={disabled}
          aria-label={action === "Apply" ? `Apply the ${p.name} style` : `Add text in the ${p.name} style`}
          title={p.name}
          onClick={() => onPick(p)}
        >
          <PresetSample preset={p} />
        </button>
      ))}
    </div>
  );
}
