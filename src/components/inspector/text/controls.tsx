/**
 * Controls the Text panel needs that the design system does not have:
 * a colour swatch picker and a single-choice list. Both are radio groups
 * (roving focus, arrow keys) and both name every option, so nothing is told
 * apart by colour or typeface alone.
 */
import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { ColorField, Icon } from "../../ui";
import { TEXT_SWATCHES } from "../../../lib/textStyle";

/** Move focus and selection with the arrow keys, Home and End, inside a radio group. */
function useRadioKeys<T>(items: T[], index: number, select: (item: T) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = items.length - 1;
    const next = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: last }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    e.stopPropagation();
    const n = (next + items.length) % items.length;
    const item = items[n];
    if (item === undefined) return;
    select(item);
    ref.current?.querySelectorAll<HTMLElement>("[role=radio]")[n]?.focus();
  };
  return { ref, onKeyDown };
}

/** Relative luminance, to put a dark or light check mark on a swatch. */
function isLight(hex: string): boolean {
  const n = parseInt(hex.replace("#", ""), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! > 0.4;
}

/**
 * Named swatches plus a custom colour field. The chosen swatch shows a check
 * mark; a custom colour that matches no swatch leaves them all unchecked.
 */
export function SwatchPicker({ label, value, disabled, onChange }: { label: string; value: string; disabled?: boolean; onChange: (hex: string) => void }) {
  const index = TEXT_SWATCHES.findIndex((s) => s.hex.toLowerCase() === value.toLowerCase());
  const keys = useRadioKeys(TEXT_SWATCHES, Math.max(0, index), (s) => !disabled && onChange(s.hex));
  return (
    <div className="swatch-picker">
      <div ref={keys.ref} className="swatch-grid" role="radiogroup" aria-label={label} onKeyDown={keys.onKeyDown}>
        {TEXT_SWATCHES.map((s, i) => {
          const on = i === index;
          return (
            <button
              key={s.hex}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={s.name}
              title={s.name}
              tabIndex={on || (index < 0 && i === 0) ? 0 : -1}
              disabled={disabled}
              className="text-swatch"
              // The swatch shows the person's content colour itself, so it is set inline.
              style={{ background: s.hex, color: isLight(s.hex) ? "var(--on-clip)" : "var(--caption-text)" }}
              onClick={() => onChange(s.hex)}
            >
              {on && <Icon name="check" size={16} />}
            </button>
          );
        })}
      </div>
      <ColorField label={`${label}, custom`} value={value} onChange={(hex) => !disabled && onChange(hex)} />
    </div>
  );
}

export interface ChoiceItem<T extends string> {
  value: T;
  label: string;
  /** Optional visual shown instead of the plain label (such as a font sample). The label stays the accessible name. */
  render?: ReactNode;
}

/** A vertical single-choice list: a radio group of full-width rows. */
export function ChoiceList<T extends string>({
  label,
  items,
  value,
  disabled,
  onChange,
}: {
  label: string;
  items: ChoiceItem<T>[];
  value: T;
  disabled?: boolean;
  onChange: (v: T) => void;
}) {
  const index = Math.max(0, items.findIndex((i) => i.value === value));
  const keys = useRadioKeys(items, index, (i) => !disabled && onChange(i.value));
  return (
    <div ref={keys.ref} className="choice-list" role="radiogroup" aria-label={label} onKeyDown={keys.onKeyDown}>
      {items.map((it, i) => {
        const on = i === index;
        return (
          <button
            key={it.value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={it.label}
            tabIndex={on ? 0 : -1}
            disabled={disabled}
            className="choice-list__item"
            onClick={() => onChange(it.value)}
          >
            <span className="choice-list__label">{it.render ?? it.label}</span>
            {on && <Icon name="check" size={16} />}
          </button>
        );
      })}
    </div>
  );
}
