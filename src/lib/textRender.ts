/**
 * Drawing text clips on a 2D canvas, in project coordinates.
 *
 * The preview overlay and the export overlay frames both call `drawTextClip`
 * (through `drawTexts` in overlay.ts) in the same WebView with the same
 * bundled fonts, so what you see is what you export (AGENTS.md rule 11).
 *
 * Order inside one clip: background, then the text with its shadow, then
 * the fill. An outline is a stroke drawn under the fill, twice the outline
 * width, so half of it shows outside the letters.
 */
import type { Ms, Project, TextAnimation, TextClip } from "../types/project";
import { canvasFont, fontById } from "./fonts";
import { textAt } from "./textClips";
import { textEnd } from "./timeline";
import { clamp } from "./time";

// ---------- Animation ----------

export interface TextAnimState {
  alpha: number;
  scale: number;
  /** Offset in project pixels. */
  dy: number;
  /** Fraction of the characters shown, 0..1 (typewriter). */
  reveal: number;
}

const easeOut = (x: number) => 1 - (1 - x) ** 3;
/** Overshoots past 1 and settles, for the pop. */
const easeOutBack = (x: number) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2;
/** How far rise and drop travel, as a fraction of canvas height. */
const SLIDE = 0.06;

/** Apply one animation at progress `k` (0 = hidden, 1 = settled) onto `s`. */
function apply(s: TextAnimState, kind: TextAnimation["kind"], k: number, H: number): void {
  switch (kind) {
    case "fade":
      s.alpha *= easeOut(k);
      break;
    case "pop":
      s.scale *= 0.6 + 0.4 * easeOutBack(k);
      s.alpha *= Math.min(1, k * 2);
      break;
    case "rise":
      s.dy += (1 - easeOut(k)) * SLIDE * H;
      s.alpha *= easeOut(k);
      break;
    case "drop":
      s.dy -= (1 - easeOut(k)) * SLIDE * H;
      s.alpha *= easeOut(k);
      break;
    case "typewriter":
      s.reveal = Math.min(s.reveal, k);
      break;
    case "none":
      break;
  }
}

/**
 * The animation state of a text clip at timeline time `t`. The in animation
 * plays over its first `animIn.durationMs`; the out animation plays the same
 * way in reverse over its last `animOut.durationMs`.
 */
export function textAnimState(c: TextClip, t: Ms, H: number): TextAnimState {
  const s: TextAnimState = { alpha: 1, scale: 1, dy: 0, reveal: 1 };
  const local = t - c.startMs;
  if (c.animIn.kind !== "none" && c.animIn.durationMs > 0 && local < c.animIn.durationMs) {
    apply(s, c.animIn.kind, clamp(local / c.animIn.durationMs, 0, 1), H);
  }
  const left = textEnd(c) - t;
  if (c.animOut.kind !== "none" && c.animOut.durationMs > 0 && left < c.animOut.durationMs) {
    apply(s, c.animOut.kind, clamp(left / c.animOut.durationMs, 0, 1), H);
  }
  return s;
}

// ---------- Layout ----------

export interface TextLayout {
  font: string;
  /** Font size in project pixels. */
  size: number;
  lines: string[];
  widths: number[];
  lineH: number;
  /** The text block without padding. */
  w: number;
  h: number;
  /** Padding around each background box. */
  padX: number;
  padY: number;
}

/** Text wraps inside 90% of the canvas width. */
const WRAP = 0.9;

let measurer: CanvasRenderingContext2D | null = null;
function measureCtx(): CanvasRenderingContext2D {
  measurer ??= document.createElement("canvas").getContext("2d")!;
  return measurer;
}

function setFont(ctx: CanvasRenderingContext2D, c: TextClip, size: number): string {
  const font = canvasFont(fontById(c.style.fontId), size);
  ctx.font = font;
  // Letter spacing where the engine supports it; preview and export share the engine, so they agree either way.
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${c.style.letterSpacing * size}px`;
  return font;
}

/** Greedy word wrap of one paragraph to `maxW`. A single word longer than the line stays whole. */
function wrap(ctx: CanvasRenderingContext2D, para: string, maxW: number): string[] {
  const words = para.split(/ +/);
  const out: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxW) {
      out.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  out.push(line);
  return out;
}

export function layoutText(ctx: CanvasRenderingContext2D, c: TextClip, W: number, H: number): TextLayout {
  const size = Math.max(1, c.style.size * H);
  const font = setFont(ctx, c, size);
  const text = c.style.caps ? c.text.toUpperCase() : c.text;
  const lines = text.split("\n").flatMap((p) => wrap(ctx, p, W * WRAP));
  const widths = lines.map((l) => ctx.measureText(l).width);
  const lineH = size * c.style.lineHeight;
  return { font, size, lines, widths, lineH, w: Math.max(0, ...widths), h: lines.length * lineH, padX: size * 0.35, padY: size * 0.12 };
}

// ---------- Drawing ----------

function rgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 6 ? h : "000000", 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${clamp(alpha, 0, 1)})`;
}

/** Left edge of line `i` inside a block centred on 0. */
function lineX(L: TextLayout, i: number, align: TextClip["style"]["align"]): number {
  const w = L.widths[i] ?? 0;
  if (align === "left") return -L.w / 2;
  if (align === "right") return L.w / 2 - w;
  return -w / 2;
}

/** The lines as far as the typewriter has typed. */
function revealed(lines: string[], reveal: number): string[] {
  if (reveal >= 1) return lines;
  const total = lines.reduce((n, l) => n + l.length, 0);
  let left = Math.floor(total * reveal);
  return lines.map((l) => {
    const part = l.slice(0, Math.max(0, left));
    left -= l.length;
    return part;
  });
}

/**
 * Draw one text clip at timeline time `t`. The context's transform must map
 * project pixels to canvas pixels (W×H project space).
 */
export function drawTextClip(ctx: CanvasRenderingContext2D, c: TextClip, W: number, H: number, t: Ms): void {
  if (!c.text.trim()) return;
  const a = textAnimState(c, t, H);
  const alpha = c.opacity * a.alpha;
  if (alpha <= 0.001 || a.reveal <= 0) return;
  const st = c.style;
  ctx.save();
  const L = layoutText(ctx, c, W, H);
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.translate(W / 2 + c.x, H / 2 + c.y + a.dy);
  ctx.rotate((c.rotation * Math.PI) / 180);
  ctx.scale(a.scale, a.scale);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const lines = revealed(L.lines, a.reveal);
  const widths = lines.map((l, i) => (l === L.lines[i] ? (L.widths[i] ?? 0) : ctx.measureText(l).width));
  const radius = L.size * 0.18;

  // Background.
  const bg = st.background;
  if (bg.shape !== "none" && bg.opacity > 0) {
    ctx.fillStyle = rgba(bg.color, bg.opacity);
    ctx.beginPath();
    if (bg.shape === "block") {
      ctx.roundRect(-L.w / 2 - L.padX, -L.h / 2 - L.padY, L.w + 2 * L.padX, L.h + 2 * L.padY, radius);
    } else {
      lines.forEach((l, i) => {
        if (!l) return;
        const y = -L.h / 2 + L.lineH * i;
        ctx.roundRect(lineX(L, i, st.align) - L.padX, y, (widths[i] ?? 0) + 2 * L.padX, L.lineH, radius);
      });
    }
    ctx.fill();
  }

  // Shadow blur and offset are in canvas pixels and ignore the transform, so scale them by hand.
  const m = ctx.getTransform();
  const px = Math.hypot(m.a, m.b);
  const shadow = () => {
    if (st.shadow.kind === "soft") {
      ctx.shadowColor = rgba(st.shadow.color, 0.6);
      ctx.shadowBlur = L.size * 0.25 * px;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = L.size * 0.04 * px;
    } else if (st.shadow.kind === "hard") {
      ctx.shadowColor = rgba(st.shadow.color, 1);
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = L.size * 0.05 * px;
      ctx.shadowOffsetY = L.size * 0.05 * px;
    }
  };
  const noShadow = () => {
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  };
  const each = (fn: (line: string, x: number, y: number) => void) =>
    lines.forEach((l, i) => l && fn(l, lineX(L, i, st.align), -L.h / 2 + L.lineH * (i + 0.5)));

  // The first pass casts the shadow (the outline when there is one), the fill goes on top without it.
  shadow();
  if (st.outline.width > 0) {
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.lineWidth = st.outline.width * L.size * 2;
    ctx.strokeStyle = st.outline.color;
    each((l, x, y) => ctx.strokeText(l, x, y));
    noShadow();
  }
  ctx.fillStyle = st.color;
  each((l, x, y) => ctx.fillText(l, x, y));
  ctx.restore();
}

/** Draw every visible text clip at `t`, lower text tracks first. Returns true when anything was drawn. */
export function drawTexts(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number, p: Project, t: Ms): boolean {
  const { width: W, height: H } = p.settings;
  let drew = false;
  const tracks = p.tracks.filter((k) => k.kind === "text" && !k.hidden).reverse();
  for (const track of tracks) {
    const c = textAt(p, track.id, t);
    if (!c) continue;
    ctx.save();
    ctx.setTransform(canvasW / W, 0, 0, canvasH / H, 0, 0);
    drawTextClip(ctx, c, W, H, t);
    ctx.restore();
    drew = true;
  }
  return drew;
}

// ---------- Hit testing and the selection box ----------

export interface TextBox {
  /** Centre in project pixels. */
  cx: number;
  cy: number;
  w: number;
  h: number;
  /** Degrees clockwise. */
  rotation: number;
}

/** Where a text clip sits at rest (no animation), including its background and outline. */
export function textBox(c: TextClip, W: number, H: number): TextBox {
  const ctx = measureCtx();
  ctx.save();
  const L = layoutText(ctx, c, W, H);
  ctx.restore();
  const bg = c.style.background.shape !== "none" && c.style.background.opacity > 0;
  const grow = c.style.outline.width * L.size;
  return {
    cx: W / 2 + c.x,
    cy: H / 2 + c.y,
    w: L.w + 2 * (bg ? L.padX : 0) + 2 * grow,
    h: L.h + 2 * (bg ? L.padY : 0) + 2 * grow,
    rotation: c.rotation,
  };
}

function inBox(b: TextBox, x: number, y: number): boolean {
  const r = (-b.rotation * Math.PI) / 180;
  const dx = x - b.cx;
  const dy = y - b.cy;
  const lx = dx * Math.cos(r) - dy * Math.sin(r);
  const ly = dx * Math.sin(r) + dy * Math.cos(r);
  return Math.abs(lx) <= b.w / 2 && Math.abs(ly) <= b.h / 2;
}

/** The top-most visible text clip under project point (x, y) at time `t`, or null. */
export function textAtPoint(p: Project, t: Ms, x: number, y: number): TextClip | null {
  const { width: W, height: H } = p.settings;
  for (const track of p.tracks) {
    if (track.kind !== "text" || track.hidden) continue;
    const c = textAt(p, track.id, t);
    if (c && c.text.trim() && inBox(textBox(c, W, H), x, y)) return c;
  }
  return null;
}
