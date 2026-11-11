/**
 * Lottie playback for the overlay, with lottie-web's light SVG build.
 *
 * Why SVG: lottie-web's canvas renderer draws text only from embedded glyph
 * outlines (`chars`) and never with a real font, so Claude's text layers,
 * which name a font, would not render. The SVG renderer draws text with the
 * bundled Hanken Grotesk.
 *
 * Why the *light* build: it has no expression engine (no `eval`), so even a
 * file that slipped past Rust's validation could not run an `x` expression.
 * The CSP forbids `eval` as well.
 *
 * Preview and export share one renderer:
 * - preview shows each active animation as live SVG layered over the canvas;
 * - export rasterises the same SVG (with the fonts embedded, because an SVG
 *   drawn as an image cannot see the page's fonts) and draws it into the
 *   overlay frame.
 */
import lottie from "lottie-web/build/player/lottie_light";
import type { AnimationItem } from "lottie-web";
import { readAppFile } from "./ipc";
import font400 from "../../split-design-system/fonts/HankenGrotesk-400.woff2?url";
import font500 from "../../split-design-system/fonts/HankenGrotesk-500.woff2?url";
import font700 from "../../split-design-system/fonts/HankenGrotesk-700.woff2?url";

const dataCache = new Map<string, Promise<unknown>>();

export function loadLottieData(path: string): Promise<unknown> {
  let p = dataCache.get(path);
  if (!p) {
    p = readAppFile(path).then((text) => JSON.parse(text) as unknown);
    p.catch(() => dataCache.delete(path));
    dataCache.set(path, p);
  }
  return p;
}

/** Make sure the bundled weights are ready before any text is drawn. */
export async function ensureFonts(): Promise<void> {
  try {
    await Promise.all(["400", "500", "700"].map((w) => document.fonts.load(`${w} 32px "Hanken Grotesk"`)));
  } catch {
    /* fall back to whatever is loaded */
  }
}

let fontCss: Promise<string> | null = null;

/** `@font-face` rules with the fonts inlined as data URIs, for rasterising SVG. */
function embeddedFontCss(): Promise<string> {
  fontCss ??= Promise.all(
    [
      [font400, 400],
      [font500, 500],
      [font700, 700],
    ].map(async ([url, weight]) => {
      const buf = new Uint8Array(await (await fetch(url as string)).arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return `@font-face{font-family:"Hanken Grotesk";font-weight:${weight};src:url(data:font/woff2;base64,${btoa(bin)}) format("woff2");}`;
    }),
  ).then((rules) => rules.join(""));
  return fontCss;
}

class LottieLayer {
  readonly anim: AnimationItem;
  readonly ready: Promise<void>;
  readonly el: HTMLDivElement;

  constructor(data: unknown, container: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "motion-layer";
    // Hidden with visibility, not display:none: lottie-web measures glyph
    // widths in the live DOM, and a display:none subtree measures as 0.
    this.el.style.cssText = "position:absolute;inset:0;pointer-events:none;visibility:hidden";
    container.appendChild(this.el);
    this.anim = lottie.loadAnimation({
      container: this.el,
      renderer: "svg",
      loop: false,
      autoplay: false,
      // lottie-web mutates the data it is given; keep the cache pristine.
      animationData: structuredClone(data),
      rendererSettings: { preserveAspectRatio: "xMidYMid meet", progressiveLoad: false },
    } as Parameters<typeof lottie.loadAnimation>[0]);
    this.ready = new Promise((resolve) => {
      if (this.anim.isLoaded) return resolve();
      this.anim.addEventListener("DOMLoaded", () => resolve());
      setTimeout(resolve, 3000);
    });
  }

  show(frame: number) {
    this.el.style.visibility = "visible";
    this.anim.goToAndStop(Math.max(0, frame), true);
  }

  hide() {
    this.el.style.visibility = "hidden";
  }

  /** Draw the given frame onto a 2D context at its full size. */
  async rasterize(frame: number, ctx: CanvasRenderingContext2D): Promise<void> {
    this.show(frame);
    const svg = this.el.querySelector("svg");
    if (!svg) return;
    const { width, height } = ctx.canvas;
    const copy = svg.cloneNode(true) as SVGSVGElement;
    copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    copy.setAttribute("width", String(width));
    copy.setAttribute("height", String(height));
    copy.removeAttribute("style");
    const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.textContent = await embeddedFontCss();
    copy.insertBefore(style, copy.firstChild);
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(copy))}`;
    await img.decode();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(img, 0, 0, width, height);
    ctx.restore();
    this.hide();
  }

  destroy() {
    this.anim.destroy();
    this.el.remove();
  }
}

export class LottieRegistry {
  private layers = new Map<string, { path: string; layer: LottieLayer }>();
  private pending = new Set<string>();
  private shown = new Set<string>();
  private ownContainer: HTMLElement | null = null;

  /**
   * `container` is the element the live SVG goes into (the preview frame).
   * Without one, an off-screen container is made for export.
   */
  constructor(private container: HTMLElement | null, size?: { width: number; height: number }) {
    if (!container) {
      const el = document.createElement("div");
      el.setAttribute("aria-hidden", "true");
      el.style.cssText = `position:fixed;left:-100000px;top:0;width:${size?.width ?? 1920}px;height:${size?.height ?? 1080}px;visibility:hidden;pointer-events:none`;
      document.body.appendChild(el);
      this.ownContainer = el;
      this.container = el;
    }
  }

  private make(data: unknown) {
    return new LottieLayer(data, this.container!);
  }

  /** Load clips not yet loaded; drop clips that no longer exist. */
  sync(clips: { id: string; lottiePath: string }[]) {
    const wanted = new Set(clips.map((c) => c.id));
    for (const [id, l] of this.layers) {
      if (!wanted.has(id)) {
        l.layer.destroy();
        this.layers.delete(id);
      }
    }
    for (const c of clips) {
      const have = this.layers.get(c.id);
      if (have?.path === c.lottiePath || this.pending.has(c.id)) continue;
      have?.layer.destroy();
      this.pending.add(c.id);
      loadLottieData(c.lottiePath)
        .then((data) => this.layers.set(c.id, { path: c.lottiePath, layer: this.make(data) }))
        .catch((e) => console.warn("motion clip failed to load", c.id, e))
        .finally(() => this.pending.delete(c.id));
    }
  }

  /** Load everything and wait until each animation can render (export). */
  async loadAll(clips: { id: string; lottiePath: string }[]): Promise<void> {
    for (const c of clips) {
      const data = await loadLottieData(c.lottiePath);
      this.layers.set(c.id, { path: c.lottiePath, layer: this.make(data) });
    }
    await Promise.all([...this.layers.values()].map((l) => l.layer.ready));
  }

  /** Preview: show exactly these clips at these frames, hide the rest. */
  showOnly(active: { id: string; frame: number }[]) {
    const now = new Set<string>();
    for (const a of active) {
      const l = this.layers.get(a.id);
      if (!l) continue;
      l.layer.show(a.frame);
      now.add(a.id);
    }
    for (const id of this.shown) if (!now.has(id)) this.layers.get(id)?.layer.hide();
    this.shown = now;
  }

  /** Export: draw one clip's frame into a context. */
  async rasterize(id: string, frame: number, ctx: CanvasRenderingContext2D): Promise<boolean> {
    const l = this.layers.get(id);
    if (!l) return false;
    await l.layer.rasterize(frame, ctx);
    return true;
  }

  destroy() {
    for (const l of this.layers.values()) l.layer.destroy();
    this.layers.clear();
    this.ownContainer?.remove();
  }
}
