/**
 * Text clip defaults, presets and colour swatches. No timeline logic here,
 * so `timeline.ts` can fill in defaults for older projects without an
 * import cycle.
 */
import type { TextAnimation, TextClip, TextStyle } from "../types/project";
import { DEFAULT_FONT_ID } from "./fonts";

export const DEFAULT_TEXT_STYLE: TextStyle = {
  fontId: DEFAULT_FONT_ID,
  size: 0.08,
  caps: false,
  letterSpacing: 0,
  lineHeight: 1.15,
  align: "center",
  color: "#FFFFFF",
  background: { shape: "none", color: "#000000", opacity: 0.72 },
  outline: { width: 0, color: "#000000" },
  shadow: { kind: "soft", color: "#000000" },
};

export const NO_ANIMATION: TextAnimation = { kind: "none", durationMs: 400 };

/** Size limits as fractions of canvas height, so text never vanishes or swamps the frame. */
export const MIN_TEXT_SIZE = 0.02;
export const MAX_TEXT_SIZE = 0.3;

/**
 * Named colours for text and backgrounds. They are content colours (what
 * the person puts on their video), so they are not design tokens. Each has
 * a name, so a swatch is never told apart by colour alone.
 */
export const TEXT_SWATCHES: { name: string; hex: string }[] = [
  { name: "White", hex: "#FFFFFF" },
  { name: "Black", hex: "#000000" },
  { name: "Yellow", hex: "#FFD60A" },
  { name: "Orange", hex: "#FF9F0A" },
  { name: "Red", hex: "#FF453A" },
  { name: "Pink", hex: "#FF5FA2" },
  { name: "Purple", hex: "#BF5AF2" },
  { name: "Blue", hex: "#0A84FF" },
  { name: "Cyan", hex: "#64D2FF" },
  { name: "Green", hex: "#30D158" },
];

export function swatchName(hex: string): string | null {
  return TEXT_SWATCHES.find((s) => s.hex.toLowerCase() === hex.toLowerCase())?.name ?? null;
}

export interface TextPreset {
  id: string;
  name: string;
  style: Partial<TextStyle>;
  animIn?: TextAnimation;
}

/** One-click looks, the starting point before any slider (AGENTS.md: presets before sliders). */
export const TEXT_PRESETS: TextPreset[] = [
  { id: "clean", name: "Clean", style: { fontId: "grotesk-bold" } },
  {
    id: "subtitle",
    name: "Subtitle",
    style: { fontId: "grotesk", size: 0.05, shadow: { kind: "none", color: "#000000" }, background: { shape: "block", color: "#000000", opacity: 0.72 } },
  },
  {
    id: "highlight",
    name: "Highlight",
    style: { fontId: "grotesk-bold", color: "#000000", shadow: { kind: "none", color: "#000000" }, background: { shape: "lines", color: "#FFFFFF", opacity: 1 } },
  },
  { id: "headline", name: "Headline", style: { fontId: "anton", size: 0.12, caps: true, letterSpacing: 0.02 } },
  {
    id: "outline",
    name: "Outline",
    style: { fontId: "archivo-black", size: 0.1, outline: { width: 0.08, color: "#000000" }, shadow: { kind: "none", color: "#000000" } },
  },
  { id: "poster", name: "Poster", style: { fontId: "bebas-neue", size: 0.14, letterSpacing: 0.04, color: "#FFD60A", shadow: { kind: "hard", color: "#000000" } } },
  { id: "marker", name: "Marker", style: { fontId: "permanent-marker", color: "#FFD60A", shadow: { kind: "hard", color: "#000000" } } },
  { id: "elegant", name: "Elegant", style: { fontId: "playfair", size: 0.09 } },
  { id: "script", name: "Script", style: { fontId: "pacifico", color: "#FF5FA2", shadow: { kind: "soft", color: "#000000" } } },
  { id: "note", name: "Note", style: { fontId: "caveat", size: 0.1 } },
  {
    id: "typewriter",
    name: "Typewriter",
    style: { fontId: "space-mono", size: 0.06, shadow: { kind: "none", color: "#000000" }, background: { shape: "lines", color: "#000000", opacity: 0.85 } },
    animIn: { kind: "typewriter", durationMs: 1200 },
  },
];

/** A preset's full style, built on the defaults so nothing from an earlier look leaks through. */
export function presetStyle(preset: TextPreset): TextStyle {
  return { ...DEFAULT_TEXT_STYLE, ...preset.style };
}

/** Fill in fields an older saved text clip did not have. */
export function normalizeTextClip(c: TextClip): TextClip {
  const s: Partial<TextStyle> = c.style ?? {};
  return {
    ...c,
    x: c.x ?? 0,
    y: c.y ?? 0,
    rotation: c.rotation ?? 0,
    opacity: c.opacity ?? 1,
    style: {
      ...DEFAULT_TEXT_STYLE,
      ...s,
      background: { ...DEFAULT_TEXT_STYLE.background, ...s.background },
      outline: { ...DEFAULT_TEXT_STYLE.outline, ...s.outline },
      shadow: { ...DEFAULT_TEXT_STYLE.shadow, ...s.shadow },
    },
    animIn: { ...NO_ANIMATION, ...c.animIn },
    animOut: { ...NO_ANIMATION, ...c.animOut },
  };
}
