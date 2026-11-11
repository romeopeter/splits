/**
 * Fonts for text clips. All of them are bundled (Fontsource packages, OFL or
 * Apache licensed, Latin subset), so text looks the same on every OS and
 * the app never fetches a font. Preview and export draw text on a canvas in
 * the same WebView, so loading these once makes both identical.
 *
 * Each choice is one family at one weight, named as people know it.
 */
import anton from "@fontsource/anton/files/anton-latin-400-normal.woff2?url";
import archivoBlack from "@fontsource/archivo-black/files/archivo-black-latin-400-normal.woff2?url";
import bebasNeue from "@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff2?url";
import caveat from "@fontsource/caveat/files/caveat-latin-600-normal.woff2?url";
import pacifico from "@fontsource/pacifico/files/pacifico-latin-400-normal.woff2?url";
import permanentMarker from "@fontsource/permanent-marker/files/permanent-marker-latin-400-normal.woff2?url";
import playfair from "@fontsource/playfair-display/files/playfair-display-latin-700-normal.woff2?url";
import spaceMono from "@fontsource/space-mono/files/space-mono-latin-700-normal.woff2?url";

export interface TextFont {
  id: string;
  /** Shown in the Font tab, set in the font itself. */
  name: string;
  /** CSS family name used on the canvas. */
  family: string;
  weight: number;
  /** Bundled file to load, or null for a face the app already loads (Hanken Grotesk, from tokens.css). */
  url: string | null;
}

export const TEXT_FONTS: TextFont[] = [
  { id: "grotesk-bold", name: "Grotesk Bold", family: "Hanken Grotesk", weight: 700, url: null },
  { id: "grotesk", name: "Grotesk", family: "Hanken Grotesk", weight: 500, url: null },
  { id: "anton", name: "Anton", family: "Split Anton", weight: 400, url: anton },
  { id: "bebas-neue", name: "Bebas Neue", family: "Split Bebas Neue", weight: 400, url: bebasNeue },
  { id: "archivo-black", name: "Archivo Black", family: "Split Archivo Black", weight: 400, url: archivoBlack },
  { id: "playfair", name: "Playfair Display", family: "Split Playfair Display", weight: 700, url: playfair },
  { id: "space-mono", name: "Space Mono", family: "Split Space Mono", weight: 700, url: spaceMono },
  { id: "permanent-marker", name: "Permanent Marker", family: "Split Permanent Marker", weight: 400, url: permanentMarker },
  { id: "caveat", name: "Caveat", family: "Split Caveat", weight: 600, url: caveat },
  { id: "pacifico", name: "Pacifico", family: "Split Pacifico", weight: 400, url: pacifico },
];

export const DEFAULT_FONT_ID = "grotesk-bold";

export function fontById(id: string): TextFont {
  return TEXT_FONTS.find((f) => f.id === id) ?? TEXT_FONTS[0]!;
}

/** A canvas `font` string for this font at `px` pixels. */
export function canvasFont(f: TextFont, px: number): string {
  return `${f.weight} ${px}px "${f.family}"`;
}

let loading: Promise<void> | null = null;

/**
 * Register and load every text font. Safe to call often; the work happens
 * once. Until it resolves, the canvas draws with a fallback face, and the
 * preview's frame loop redraws with the real one on the next frame.
 */
export function loadTextFonts(): Promise<void> {
  loading ??= Promise.all(
    TEXT_FONTS.map(async (f) => {
      try {
        if (f.url) {
          const face = new FontFace(f.family, `url(${f.url}) format("woff2")`, { weight: String(f.weight) });
          document.fonts.add(await face.load());
        } else {
          await document.fonts.load(canvasFont(f, 32));
        }
      } catch {
        /* that one font falls back; the others still load */
      }
    }),
  ).then(() => undefined);
  return loading;
}
