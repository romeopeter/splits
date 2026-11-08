/**
 * Spits controls, rebuilt in React from the design system's bundle.
 * Markup and class names match `spits-design-system/components/bundle.css`,
 * so the system's CSS styles them unchanged.
 */
import { useState, type ButtonHTMLAttributes, type ChangeEvent, type KeyboardEvent, type ReactNode } from "react";
import { Icon } from "./Icon";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: Size;
  icon?: string;
  iconEnd?: string;
}

export function Button({ variant = "primary", size = "md", icon, iconEnd, children, className, type, ...rest }: ButtonProps) {
  const is = size === "sm" ? 16 : 20;
  return (
    <button type={type ?? "button"} className={cx("sp-btn", `sp-btn--${variant}`, `sp-btn--${size}`, className)} {...rest}>
      {icon && <Icon name={icon} size={is} />}
      {children != null && <span>{children}</span>}
      {iconEnd && <Icon name={iconEnd} size={is} />}
    </button>
  );
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: string;
  /** Required: becomes `aria-label` and the tooltip. Name the object ("Lock Track 2"). */
  label: string;
  size?: Size;
  /** Makes it a toggle (`aria-pressed`). */
  active?: boolean;
  iconSize?: number;
}

export function IconButton({ icon, label, size = "md", active, iconSize, className, title, type, ...rest }: IconButtonProps) {
  return (
    <button
      type={type ?? "button"}
      aria-label={label}
      title={title ?? label}
      aria-pressed={active === undefined ? undefined : active}
      className={cx("sp-ibtn", `sp-ibtn--${size}`, className)}
      {...rest}
    >
      <Icon name={icon} size={iconSize ?? (size === "sm" ? 16 : size === "lg" ? 24 : 20)} />
    </button>
  );
}

export interface FieldProps {
  label?: string;
  caption?: string;
  value: string | number;
  unit?: string;
  type?: "text" | "number" | "password";
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
  id?: string;
  className?: string;
  onChange?: (value: string) => void;
  onCommit?: (value: string) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}

export function Field(p: FieldProps) {
  const common = {
    className: "sp-field__input",
    "aria-label": p.label ?? p.caption,
    placeholder: p.placeholder,
    disabled: p.disabled,
    id: p.id,
    // Controlled with onChange; otherwise uncontrolled and committed on Enter or blur,
    // re-keyed so outside changes (undo, another control) show up.
    ...(p.onChange ? { value: p.value } : { defaultValue: p.value }),
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => p.onChange?.(e.target.value),
    onBlur: (e: { target: { value: string } }) => p.onCommit?.(e.target.value),
    onKeyDown: (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !p.multiline) p.onCommit?.((e.target as HTMLInputElement).value);
      p.onKeyDown?.(e);
    },
    spellCheck: p.type === "text" || p.multiline ? undefined : false,
  };
  return (
    <div className={cx("sp-field", p.className)}>
      <div className={cx("sp-field__box", p.multiline && "sp-field__box--multi")}>
        {p.multiline ? (
          <textarea key={p.onChange ? undefined : String(p.value)} rows={p.rows ?? 2} {...common} />
        ) : (
          <input
            key={p.onChange ? undefined : String(p.value)}
            type={p.type ?? "text"}
            inputMode={p.type === "number" ? "decimal" : undefined}
            min={p.min}
            max={p.max}
            step={p.step}
            {...common}
          />
        )}
        {p.unit && (
          <span className="sp-field__unit" aria-hidden="true">
            {p.unit}
          </span>
        )}
      </div>
      {p.caption && <span className="sp-field__cap">{p.caption}</span>}
    </div>
  );
}

export interface SelectProps {
  label: string;
  value: string;
  options: readonly (string | { value: string; label: string })[];
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export function Select({ label, value, options, onChange, disabled, id, className }: SelectProps) {
  return (
    <div className={cx("sp-select", className)}>
      <select aria-label={label} value={value} disabled={disabled} id={id} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => {
          const v = typeof o === "string" ? o : o.value;
          return (
            <option key={v} value={v}>
              {typeof o === "string" ? o : o.label}
            </option>
          );
        })}
      </select>
      <Icon name="chevron-down" size={16} />
    </div>
  );
}

export interface SegmentedControlProps {
  label: string;
  options: { value: string; icon?: string; text?: string; label?: string }[];
  value: string;
  onChange: (value: string) => void;
}

export function SegmentedControl({ label, options, value, onChange }: SegmentedControlProps) {
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!d) return;
    const i = Math.max(0, options.findIndex((o) => o.value === value));
    const n = (i + d + options.length) % options.length;
    const next = options[n];
    if (!next) return;
    onChange(next.value);
    e.preventDefault();
    (e.currentTarget.querySelectorAll("[role=radio]")[n] as HTMLElement | undefined)?.focus();
  };
  return (
    <div className="sp-seg" role="radiogroup" aria-label={label} onKeyDown={onKey}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            aria-label={o.label}
            title={o.label}
            className="sp-seg__item"
            onClick={() => onChange(o.value)}
          >
            {o.icon ? <Icon name={o.icon} size={18} /> : o.text}
          </button>
        );
      })}
    </div>
  );
}

export interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  /** Extra button after the hex input, e.g. the eyedropper. */
  trailing?: ReactNode;
}

const HEX = /^[0-9a-f]{6}$/i;

/** Swatch (opens the system picker), hex value, and optional trailing action. */
export function ColorField({ label, value, onChange, trailing }: ColorFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value.replace("#", "").toUpperCase();
  const commit = (v: string) => {
    const h = v.replace("#", "").trim();
    if (HEX.test(h)) onChange(`#${h.toUpperCase()}`);
    setDraft(null);
  };
  return (
    <div className="sp-color">
      <div className="sp-field__box sp-color__main">
        <label className="sp-swatch" style={{ background: value, position: "relative", overflow: "hidden" }}>
          <span className="sr-only">{label} swatch, open picker</span>
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
            aria-label={`${label} swatch, open picker`}
          />
        </label>
        <input
          className="sp-field__input"
          aria-label={`${label} hex`}
          value={shown}
          spellCheck={false}
          maxLength={7}
          style={{ fontVariantNumeric: "tabular-nums" }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && commit((e.target as HTMLInputElement).value)}
        />
        <span className="sp-field__unit" aria-hidden="true">
          hex
        </span>
      </div>
      {trailing}
    </div>
  );
}

export interface SliderProps {
  label: string;
  min?: number;
  max?: number;
  step?: number;
  value: number;
  valueText?: string;
  disabled?: boolean;
  onChange: (v: number) => void;
  onCommit?: () => void;
  className?: string;
}

export function Slider({ label, min = 0, max = 100, step = 1, value, valueText, disabled, onChange, onCommit, className }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      className={cx("sp-slider", className)}
      min={min}
      max={max}
      step={step}
      value={value}
      aria-label={label}
      aria-valuetext={valueText}
      disabled={disabled}
      style={{ ["--pct" as string]: `${pct}%` }}
      onChange={(e) => onChange(Number(e.target.value))}
      onPointerUp={onCommit}
      onKeyUp={onCommit}
    />
  );
}
