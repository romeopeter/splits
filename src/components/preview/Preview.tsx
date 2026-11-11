/**
 * The player preview: proxies drawn through the WebGL compositor, with the
 * caption and motion overlay on top, driven by one requestAnimationFrame loop.
 *
 * Each proxy element is a decoder we steer; `Playback` (lib/playback.ts)
 * decides when each one plays, seeks or pauses, and moves the playhead by the
 * master element's clock. Audio comes from the same elements. There is one
 * element per track and asset: a <video> on video tracks, an <audio> on audio
 * tracks (it plays the proxy's sound without decoding its picture).
 *
 * WebKit (macOS) refuses play() without a user gesture once the page has
 * paused any media, and our play() calls come from the frame loop, not from
 * the click. An element started inside a real gesture stays allowed, so every
 * key press or click unlocks the elements that are not unlocked yet.
 */
import { convertFileSrc } from "@tauri-apps/api/core";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useProject, getProject } from "../../store/project";
import { useUi } from "../../store/ui";
import { Compositor, framePointAt, layerGeometry } from "../../lib/compositor";
import { LottieRegistry, ensureFonts } from "../../lib/lottie";
import { renderOverlay } from "../../lib/overlay";
import { Playback, elementKey } from "../../lib/playback";
import { clipAt, clipEnd, fadeGain, projectDuration, trackById, updateClip, videoTracksBottomUp } from "../../lib/timeline";
import type { Project } from "../../types/project";

/** Elements already started inside a user gesture (see the file comment). */
const unlocked = new WeakSet<HTMLMediaElement>();

/** Play and immediately pause, inside a gesture, so WebKit lets the frame loop play the element later. */
function unlock(el: HTMLMediaElement) {
  if (unlocked.has(el) || !el.paused) return;
  unlocked.add(el);
  // Chrome rejects the interrupted play() with AbortError, which is fine; only a refusal means still locked.
  el.play().catch((e: unknown) => {
    if (e instanceof DOMException && e.name === "NotAllowedError") unlocked.delete(el);
  });
  el.pause();
}

function createElement(tag: "video" | "audio", src: string): HTMLMediaElement {
  const el = document.createElement(tag);
  el.preload = "auto";
  if (el instanceof HTMLVideoElement) el.playsInline = true;
  el.crossOrigin = "anonymous";
  el.preservesPitch = true; // speed changes keep voices at their pitch, as the exporter's atempo does
  el.dataset.src = src;
  el.src = src;
  return el;
}

/** One element per track and asset that has a clip, keyed by `elementKey`. */
function useMediaElements(project: Project) {
  const els = useRef(new Map<string, HTMLMediaElement>());
  const { clips, tracks, assets } = project;
  useEffect(() => {
    const map = els.current;
    const wanted = new Set<string>();
    for (const c of Object.values(clips)) {
      const a = assets[c.assetId];
      const kind = tracks.find((t) => t.id === c.trackId)?.kind;
      if (!a || a.proxy.status !== "ready" || !a.proxy.path || (kind !== "video" && kind !== "audio")) continue;
      const key = elementKey(c);
      if (wanted.has(key)) continue;
      wanted.add(key);
      const src = convertFileSrc(a.proxy.path);
      const tag = kind === "audio" || !a.hasVideo ? "audio" : "video";
      const el = map.get(key);
      if (!el || el.dataset.src !== src || el.tagName.toLowerCase() !== tag) {
        el?.pause();
        map.set(key, createElement(tag, src));
      }
    }
    for (const [key, el] of map) {
      if (!wanted.has(key)) {
        el.pause();
        el.removeAttribute("src");
        el.load(); // releases the decoder
        map.delete(key);
      }
    }
  }, [clips, tracks, assets]);

  // Unlock new elements on the next key press or click anywhere (capture, so it runs before the Play handler).
  useEffect(() => {
    const onGesture = () => {
      for (const el of els.current.values()) unlock(el);
    };
    window.addEventListener("pointerdown", onGesture, true);
    window.addEventListener("keydown", onGesture, true);
    return () => {
      window.removeEventListener("pointerdown", onGesture, true);
      window.removeEventListener("keydown", onGesture, true);
    };
  }, []);
  return els;
}

export function Preview() {
  const project = useProject((s) => s.project);
  const selection = useUi((s) => s.selection);
  const eyedropper = useUi((s) => s.eyedropperClipId);
  const els = useMediaElements(project);
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoCanvas = useRef<HTMLCanvasElement>(null);
  const overlayCanvas = useRef<HTMLCanvasElement>(null);
  const motionLayer = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 640, h: 360 });
  const [error, setError] = useState<string | null>(null);
  const { width: W, height: H } = project.settings;

  // Fit the frame inside the available area, keeping the project aspect.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      const scale = Math.min(width / W, height / H);
      setBox({ w: Math.max(2, Math.floor(W * scale)), h: Math.max(2, Math.floor(H * scale)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [W, H]);

  // Main loop.
  useEffect(() => {
    const vc = videoCanvas.current;
    const oc = overlayCanvas.current;
    if (!vc || !oc) return;
    let comp: Compositor;
    try {
      comp = new Compositor(vc);
    } catch (e) {
      setError(String(e));
      return;
    }
    const octx = oc.getContext("2d")!;
    const lottie = new LottieRegistry(motionLayer.current);
    void ensureFonts();
    let raf = 0;
    let last = performance.now();
    const playback = new Playback();

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const ui = useUi.getState();
      const p = getProject();
      // Cap the step so a stalled frame (a hidden window) does not jump the playhead.
      const dt = Math.min(now - last, 250);
      last = now;
      let t = playback.step(p, els.current, { t: ui.playheadMs, dt, playing: ui.playing, speed: ui.speed, volume: ui.previewVolume });
      if (ui.playing) {
        const end = projectDuration(p);
        if (t >= end) {
          t = end;
          ui.setPlaying(false);
        }
        if (t !== ui.playheadMs) ui.setPlayhead(t);
      }

      // Video layers, bottom first.
      comp.begin(p.settings.width, p.settings.height);
      for (const track of videoTracksBottomUp(p)) {
        if (track.hidden) continue;
        const c = clipAt(p, track.id, t);
        const a = c && p.assets[c.assetId];
        const el = c && els.current.get(elementKey(c));
        if (!c || !a || !(el instanceof HTMLVideoElement) || el.readyState < 2 || !a.hasVideo) continue;
        const fade = fadeGain(c, t, c.videoFadeInMs, c.videoFadeOutMs);
        comp.draw(el, el.videoWidth || a.width || 16, el.videoHeight || a.height || 9, c, fade, p.settings.width, p.settings.height);
      }

      // Captions and motion.
      lottie.sync(Object.values(p.motion));
      renderOverlay(octx, oc.width, oc.height, p, t, lottie);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      lottie.destroy();
      for (const el of els.current.values()) el.pause();
    };
  }, [els]);

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const pxW = Math.min(W, Math.round(box.w * dpr));
  const pxH = Math.min(H, Math.round(box.h * dpr));
  const scale = box.w / W;

  // Selected video clip under the playhead gets a selection box you can drag.
  const playhead = useUi((s) => s.playheadMs);
  const selClip = selection?.kind === "clip" ? project.clips[selection.id] : undefined;
  const selAsset = selClip && project.assets[selClip.assetId];
  const selOnVideo = selClip && trackById(project, selClip.trackId)?.kind === "video";
  const selVisible = selClip && selOnVideo && selAsset?.hasVideo && playhead >= selClip.startMs && playhead < clipEnd(selClip);
  const geom = selVisible && selAsset ? layerGeometry(selAsset.width ?? 16, selAsset.height ?? 9, selClip.transform, selClip.crop, W, H) : null;
  const rect = geom?.rect;

  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const onBoxDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!selClip) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, tx: selClip.transform.x, ty: selClip.transform.y };
    useProject.getState().beginGesture();
  };
  const onBoxMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || !selClip) return;
    const x = Math.round(d.tx + (e.clientX - d.x) / scale);
    const y = Math.round(d.ty + (e.clientY - d.y) / scale);
    useProject.getState().live((p) => updateClip(p, selClip.id, { transform: { ...selClip.transform, x, y } }));
  };
  const onBoxUp = () => {
    drag.current = null;
    useProject.getState().endGesture();
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!selClip || !selVisible) return;
    const step = e.shiftKey ? 10 : 1;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    e.stopPropagation();
    useProject.getState().commit((p) => updateClip(p, selClip.id, { transform: { ...selClip.transform, x: selClip.transform.x + d[0]!, y: selClip.transform.y + d[1]! } }));
  };

  // Eyedropper: sample the clip being keyed, at the pointer.
  const onCanvasClick = (e: PointerEvent<HTMLDivElement>) => {
    if (!eyedropper) return;
    const p = getProject();
    const c = p.clips[eyedropper];
    const a = c && p.assets[c.assetId];
    const el = c && els.current.get(elementKey(c));
    if (!c || !a || !(el instanceof HTMLVideoElement) || !el.videoWidth) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const py = ((e.clientY - r.top) / r.height) * H;
    const at = framePointAt(layerGeometry(a.width ?? el.videoWidth, a.height ?? el.videoHeight, c.transform, c.crop, W, H), px, py);
    if (!at) {
      useUi.getState().announce("Click inside the clip to pick its key colour.");
      return;
    }
    const cv = document.createElement("canvas");
    cv.width = el.videoWidth;
    cv.height = el.videoHeight;
    const cx = cv.getContext("2d", { willReadFrequently: true })!;
    cx.drawImage(el, 0, 0);
    const sx = Math.min(cv.width - 1, Math.floor(at.u * cv.width));
    const sy = Math.min(cv.height - 1, Math.floor(at.v * cv.height));
    const [R = 0, G = 0, B = 0] = cx.getImageData(sx, sy, 1, 1).data;
    const hex = `#${[R, G, B].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
    useProject.getState().commit((proj) => updateClip(proj, c.id, { chromaKey: { ...c.chromaKey, enabled: true, color: hex } }));
    useUi.getState().set({ eyedropperClipId: null });
    useUi.getState().announce(`Key colour set to ${hex}.`);
  };

  const empty = Object.keys(project.clips).length === 0;

  return (
    <div ref={wrapRef} className="preview-area">
      <div
        className="preview-frame"
        style={{ width: box.w, height: box.h, cursor: eyedropper ? "crosshair" : undefined }}
        onPointerDown={onCanvasClick}
        tabIndex={selVisible ? 0 : -1}
        onKeyDown={onKey}
        aria-label={selVisible ? "Canvas. Arrow keys move the selected clip." : "Canvas"}
        role="group"
      >
        <canvas ref={videoCanvas} width={pxW} height={pxH} style={{ width: box.w, height: box.h }} aria-hidden="true" />
        <canvas ref={overlayCanvas} width={pxW} height={pxH} style={{ width: box.w, height: box.h }} aria-hidden="true" />
        <div ref={motionLayer} className="motion-host" aria-hidden="true" />
        {rect && !eyedropper && (
          <div
            className="sp-sel"
            style={{
              left: rect.x * scale,
              top: rect.y * scale,
              width: rect.w * scale,
              height: rect.h * scale,
              transform: selClip?.transform.rotation ? `rotate(${selClip.transform.rotation}deg)` : undefined,
              cursor: "move",
              touchAction: "none",
            }}
            onPointerDown={onBoxDown}
            onPointerMove={onBoxMove}
            onPointerUp={onBoxUp}
          >
            {(["tl", "tm", "tr", "ml", "mr", "bl", "bm", "br"] as const).map((k) => (
              <span key={k} className={`sp-sel__h sp-sel__h--${k}`} aria-hidden="true" />
            ))}
          </div>
        )}
        {empty && (
          <div className="preview-empty">
            <p>Drop a clip here, or choose Add media.</p>
          </div>
        )}
        {error && <div className="preview-empty">{error}</div>}
      </div>
    </div>
  );
}
