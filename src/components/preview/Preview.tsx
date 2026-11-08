/**
 * The player preview: proxies drawn through the WebGL compositor, with the
 * caption and motion overlay on top, driven by one requestAnimationFrame loop.
 *
 * Playback model: the playhead advances on the wall clock while playing.
 * Each proxy <video> is a decoder we steer: when a clip is under the
 * playhead its element is seeked to the matching source time (and played,
 * re-synced if it drifts more than 120 ms); otherwise it is paused. Audio
 * comes from the same elements.
 */
import { convertFileSrc } from "@tauri-apps/api/core";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useProject, getProject } from "../../store/project";
import { useUi } from "../../store/ui";
import { Compositor, placeRect } from "../../lib/compositor";
import { LottieRegistry, ensureFonts } from "../../lib/lottie";
import { renderOverlay } from "../../lib/overlay";
import { clipAt, clipEnd, projectDuration, updateClip, videoTracksBottomUp } from "../../lib/timeline";
import type { MediaClip, Project } from "../../types/project";

const DRIFT_MS = 120;

function useMediaElements(project: Project) {
  const els = useRef(new Map<string, HTMLVideoElement>());
  useEffect(() => {
    const map = els.current;
    for (const a of Object.values(project.assets)) {
      if (a.proxy.status !== "ready" || !a.proxy.path) continue;
      const src = convertFileSrc(a.proxy.path);
      let el = map.get(a.id);
      if (!el || el.dataset.src !== src) {
        el?.pause();
        el = document.createElement("video");
        el.preload = "auto";
        el.playsInline = true;
        el.crossOrigin = "anonymous";
        el.dataset.src = src;
        el.src = src;
        map.set(a.id, el);
      }
    }
    for (const [id, el] of map) {
      if (!project.assets[id]) {
        el.pause();
        el.removeAttribute("src");
        map.delete(id);
      }
    }
  }, [project.assets]);
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
    const seekTargets = new Map<string, number>();

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const ui = useUi.getState();
      const p = getProject();
      const dt = now - last;
      last = now;
      let t = ui.playheadMs;
      if (ui.playing) {
        t += dt * ui.speed;
        const end = projectDuration(p);
        if (t >= end) {
          t = end;
          ui.setPlaying(false);
        }
        ui.setPlayhead(t);
      }

      // Which clip drives each asset element right now?
      const driving = new Map<string, MediaClip>();
      for (const track of p.tracks) {
        if (track.hidden || (track.kind !== "video" && track.kind !== "audio")) continue;
        const c = clipAt(p, track.id, t);
        if (c && !driving.has(c.assetId)) driving.set(c.assetId, c);
      }
      for (const [assetId, el] of els.current) {
        const c = driving.get(assetId);
        if (!c) {
          if (!el.paused) el.pause();
          continue;
        }
        const want = c.inMs + (t - c.startMs);
        el.volume = Math.min(1, Math.max(0, c.volume * ui.previewVolume));
        el.playbackRate = ui.speed;
        if (ui.playing) {
          if (el.paused) {
            el.currentTime = want / 1000;
            void el.play().catch(() => {});
          } else if (Math.abs(el.currentTime * 1000 - want) > DRIFT_MS) {
            el.currentTime = want / 1000;
          }
        } else {
          if (!el.paused) el.pause();
          const prev = seekTargets.get(assetId);
          if (prev === undefined || Math.abs(prev - want) >= 1) {
            seekTargets.set(assetId, want);
            el.currentTime = want / 1000;
          }
        }
      }

      // Video layers, bottom first.
      comp.begin(p.settings.width, p.settings.height);
      for (const track of videoTracksBottomUp(p)) {
        if (track.hidden) continue;
        const c = clipAt(p, track.id, t);
        const a = c && p.assets[c.assetId];
        const el = c && els.current.get(c.assetId);
        if (!c || !a || !el || el.readyState < 2 || !a.hasVideo) continue;
        comp.draw(el, el.videoWidth || a.width || 16, el.videoHeight || a.height || 9, c.transform, c.chromaKey, p.settings.width, p.settings.height);
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
  const selVisible = selClip && selAsset?.hasVideo && playhead >= selClip.startMs && playhead < clipEnd(selClip);
  const rect = selVisible && selAsset ? placeRect(selAsset.width ?? 16, selAsset.height ?? 9, selClip.transform, W, H) : null;

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
    const el = c && els.current.get(c.assetId);
    if (!c || !a || !el || !el.videoWidth) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const py = ((e.clientY - r.top) / r.height) * H;
    const rr = placeRect(a.width ?? el.videoWidth, a.height ?? el.videoHeight, c.transform, W, H);
    if (px < rr.x || py < rr.y || px >= rr.x + rr.w || py >= rr.y + rr.h) {
      useUi.getState().announce("Click inside the clip to pick its key colour.");
      return;
    }
    const cv = document.createElement("canvas");
    cv.width = el.videoWidth;
    cv.height = el.videoHeight;
    const cx = cv.getContext("2d", { willReadFrequently: true })!;
    cx.drawImage(el, 0, 0);
    const sx = Math.floor(((px - rr.x) / rr.w) * cv.width);
    const sy = Math.floor(((py - rr.y) / rr.h) * cv.height);
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
            style={{ left: rect.x * scale, top: rect.y * scale, width: rect.w * scale, height: rect.h * scale, cursor: "move", touchAction: "none" }}
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
