/**
 * Time helpers. The model stores integer milliseconds; the UI shows
 * `hh:mm:ss:ff` timecode, where `ff` is the frame within the second.
 */
import type { Fps, Ms } from "../types/project";

export const DEFAULT_FPS: Fps = { num: 30, den: 1 };

export function fpsValue(fps: Fps): number {
  return fps.num / fps.den;
}

export function frameMs(fps: Fps): number {
  return (1000 * fps.den) / fps.num;
}

export function msToFrame(ms: Ms, fps: Fps): number {
  return Math.round((ms * fps.num) / (1000 * fps.den));
}

export function frameToMs(frame: number, fps: Fps): Ms {
  return Math.round((frame * 1000 * fps.den) / fps.num);
}

/** Round a time to the nearest frame boundary. */
export function snapToFrame(ms: Ms, fps: Fps): Ms {
  return frameToMs(msToFrame(ms, fps), fps);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** `hh:mm:ss:ff` */
export function timecode(ms: Ms, fps: Fps): string {
  const safe = Math.max(0, ms);
  const totalFrames = msToFrame(safe, fps);
  const perSecond = Math.max(1, Math.round(fpsValue(fps)));
  const ff = totalFrames % perSecond;
  const s = Math.floor(totalFrames / perSecond);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}:${pad(ff)}`;
}

/** Spoken form for screen readers: "1 minute 5 seconds". */
export function spokenTime(ms: Ms): string {
  const s = Math.floor(Math.max(0, ms) / 1000);
  const m = Math.floor(s / 60);
  const parts = [];
  if (m) parts.push(`${m} minute${m === 1 ? "" : "s"}`);
  parts.push(`${s % 60} second${s % 60 === 1 ? "" : "s"}`);
  return parts.join(" ");
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
