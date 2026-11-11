/**
 * The overlay layer: captions, text clips and motion, drawn on a 2D canvas.
 * Order, bottom to top: captions, text tracks (lowest first), motion.
 *
 * One function, `renderOverlay`, serves both the preview (on screen, any
 * size) and export (an offscreen canvas at the project size, one PNG per
 * frame). That shared path is the "preview equals export" rule.
 */
import type { Ms, Project } from "../types/project";
import { firstTrackOfKind, placeMotion, placedCaptions, segmentsWithMotion, type PlacedCaption } from "./timeline";
import { fpsValue } from "./time";
import type { LottieRegistry } from "./lottie";
import { drawTexts } from "./textRender";

interface CaptionTokens {
  bg: string;
  text: string;
  font: string;
}

let tokens: CaptionTokens | null = null;

/** Caption colours come from the design tokens `caption-bg` and `caption-text`. */
function captionTokens(): CaptionTokens {
  if (!tokens) {
    const s = getComputedStyle(document.documentElement);
    tokens = {
      bg: s.getPropertyValue("--caption-bg").trim() || "rgba(0,0,0,0.72)",
      text: s.getPropertyValue("--caption-text").trim() || "white",
      font: s.getPropertyValue("--font-sans").trim() || "sans-serif",
    };
  }
  return tokens;
}

const MAX_LINE = 42;

export function wrapCaption(text: string): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > MAX_LINE) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.slice(-2);
}

/**
 * Draw one caption in project coordinates, matching the CaptionOverlay
 * component scaled to the frame: 16/24 type, 8×16 padding, `radius-sm`.
 */
export function drawCaption(ctx: CanvasRenderingContext2D, text: string, W: number, H: number, size: number, position: number) {
  const t = captionTokens();
  const fontSize = Math.max((16 * H) / 1080, H * size);
  const k = fontSize / 16;
  const lineH = 24 * k;
  const padX = 16 * k;
  const padY = 8 * k;
  ctx.font = `400 ${fontSize}px ${t.font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lines = wrapCaption(text);
  const width = Math.max(...lines.map((l) => ctx.measureText(l).width)) + padX * 2;
  const height = lines.length * lineH + padY * 2;
  const cx = W / 2;
  const cy = H * position;
  ctx.fillStyle = t.bg;
  ctx.beginPath();
  ctx.roundRect(cx - width / 2, cy - height / 2, width, height, 6 * k);
  ctx.fill();
  ctx.fillStyle = t.text;
  lines.forEach((l, i) => ctx.fillText(l, cx, cy - height / 2 + padY + lineH * (i + 0.5)));
}

export function activeCaption(captions: PlacedCaption[], t: Ms): PlacedCaption | undefined {
  return captions.find((c) => t >= c.startMs && t < c.endMs);
}

/** Draw the caption under the playhead, unless motion covers its segment. */
export function drawCaptions(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number, p: Project, t: Ms): boolean {
  const captionTrack = firstTrackOfKind(p, "caption");
  if (!captionTrack || captionTrack.hidden) return false;
  const covered = segmentsWithMotion(p);
  const cap = placedCaptions(p).find((c) => t >= c.startMs && t < c.endMs && !covered.has(`${c.assetId}/${c.segmentId}`));
  if (!cap) return false;
  const { width: W, height: H } = p.settings;
  ctx.save();
  ctx.setTransform(canvasW / W, 0, 0, canvasH / H, 0, 0);
  drawCaption(ctx, cap.text, W, H, p.captionStyle.size, p.captionStyle.position);
  ctx.restore();
  return true;
}

/** Motion clips playing at `t`, with the frame each should show. */
export function activeMotion(p: Project, t: Ms): { id: string; frame: number }[] {
  const motionTrack = firstTrackOfKind(p, "motion");
  if (!motionTrack || motionTrack.hidden) return [];
  const out: { id: string; frame: number }[] = [];
  for (const m of Object.values(p.motion)) {
    if (m.hidden) continue;
    const pl = placeMotion(p, m);
    if (pl.status === "orphaned" || t < pl.startMs || t >= pl.endMs) continue;
    out.push({ id: m.id, frame: Math.min(m.frames - 1, Math.floor(((t - pl.startMs) * fpsValue(p.settings.fps)) / 1000)) });
  }
  return out;
}

/** Preview: captions and text on the canvas, motion as live SVG above it. */
export function renderOverlay(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number, p: Project, t: Ms, lottie: LottieRegistry): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvasW, canvasH);
  drawCaptions(ctx, canvasW, canvasH, p, t);
  drawTexts(ctx, canvasW, canvasH, p, t);
  lottie.showOnly(activeMotion(p, t));
}

/** Export: captions, text and motion flattened into one frame. Returns true when anything was drawn. */
export async function renderOverlayFrame(ctx: CanvasRenderingContext2D, p: Project, t: Ms, lottie: LottieRegistry): Promise<boolean> {
  const { width, height } = ctx.canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  let drew = drawCaptions(ctx, width, height, p, t);
  drew = drawTexts(ctx, width, height, p, t) || drew;
  for (const m of activeMotion(p, t)) drew = (await lottie.rasterize(m.id, m.frame, ctx)) || drew;
  return drew;
}
