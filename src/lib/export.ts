/**
 * Export orchestration.
 *
 * 1. Resolve the project into Rust's `ExportRequest` (original source paths,
 *    bottom layer first).
 * 2. If there are captions or motion, render the overlay on an offscreen
 *    canvas at the project size, one frame at a time, with the same
 *    caption and motion code the preview uses, and stream PNGs to Rust. Empty frames
 *    reuse one shared blank PNG.
 * 3. Rust runs FFmpeg and reports progress.
 */
import type { Project } from "../types/project";
import { useUi } from "../store/ui";
import { newId } from "./ids";
import * as ipc from "./ipc";
import { LottieRegistry, ensureFonts } from "./lottie";
import { renderOverlayFrame } from "./overlay";
import { clipsOnTrack, firstTrackOfKind, placeMotion, placedCaptions, projectDuration, videoTracksBottomUp } from "./timeline";
import { frameToMs, msToFrame } from "./time";

export type ExportTarget = "mp4" | "motion_mov" | "lottie";

export function buildExportRequest(p: Project, target: "mp4" | "motion_mov", outputPath: string, jobId: string): ipc.ExportRequestDto {
  const durationMs = projectDuration(p);
  const visual: ipc.ExportRequestDto["visual"] = [];
  for (const track of videoTracksBottomUp(p)) {
    if (track.hidden) continue;
    for (const c of clipsOnTrack(p, track.id)) {
      const a = p.assets[c.assetId];
      if (!a?.hasVideo || !a.width || !a.height) continue;
      visual.push({
        sourcePath: a.path,
        sourceWidth: a.width,
        sourceHeight: a.height,
        startMs: c.startMs,
        inMs: c.inMs,
        outMs: c.outMs,
        transform: c.transform,
        chromaKey: c.chromaKey.enabled ? { color: c.chromaKey.color, similarity: c.chromaKey.similarity, smoothness: c.chromaKey.smoothness } : null,
      });
    }
  }
  const audio: ipc.ExportRequestDto["audio"] = [];
  for (const track of p.tracks) {
    if (track.hidden || (track.kind !== "video" && track.kind !== "audio")) continue;
    for (const c of clipsOnTrack(p, track.id)) {
      const a = p.assets[c.assetId];
      if (!a?.hasAudio || c.volume <= 0) continue;
      audio.push({ sourcePath: a.path, startMs: c.startMs, inMs: c.inMs, outMs: c.outMs, volume: c.volume });
    }
  }
  return {
    jobId,
    target,
    outputPath,
    width: p.settings.width,
    height: p.settings.height,
    fpsNum: p.settings.fps.num,
    fpsDen: p.settings.fps.den,
    durationMs,
    visual,
    audio,
    overlay: null,
  };
}

function hasOverlay(p: Project): boolean {
  const cap = firstTrackOfKind(p, "caption");
  const mot = firstTrackOfKind(p, "motion");
  const captions = !!cap && !cap.hidden && placedCaptions(p).length > 0;
  const motion = !!mot && !mot.hidden && Object.values(p.motion).some((m) => !m.hidden && placeMotion(p, m).status !== "orphaned");
  return captions || motion;
}

function toPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? b.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)), reject) : reject(new Error("PNG encode failed"))), "image/png"),
  );
}

async function renderOverlayFrames(p: Project, jobId: string, frameCount: number, isCancelled: () => boolean, onProgress: (f: number) => void) {
  await ensureFonts();
  const canvas = document.createElement("canvas");
  canvas.width = p.settings.width;
  canvas.height = p.settings.height;
  const ctx = canvas.getContext("2d")!;
  const lottie = new LottieRegistry(null, { width: canvas.width, height: canvas.height });
  try {
    await lottie.loadAll(Object.values(p.motion).filter((m) => !m.hidden));
    let blankSet = false;
    for (let i = 0; i < frameCount; i++) {
      if (isCancelled()) throw { kind: "cancelled", message: "Cancelled." };
      const drew = await renderOverlayFrame(ctx, p, frameToMs(i, p.settings.fps), lottie);
      if (!drew && blankSet) {
        await ipc.overlayBlank(jobId, i);
      } else {
        await ipc.overlayFrame(jobId, i, await toPng(canvas), drew ? undefined : "set");
        if (!drew) blankSet = true;
      }
      if (i % 10 === 0) onProgress(i / frameCount);
    }
  } finally {
    lottie.destroy();
  }
}

/** Run a full export. Progress and outcome go to the UI store. */
export async function runExport(p: Project, target: "mp4" | "motion_mov", outputPath: string): Promise<void> {
  const set = (patch: Partial<NonNullable<ReturnType<typeof useUi.getState>["exportState"]>>) => {
    const cur = useUi.getState().exportState;
    if (cur) useUi.getState().set({ exportState: { ...cur, ...patch } });
  };
  const jobId = newId("e");
  useUi.getState().set({ exportState: { jobId, phase: "frames", progress: 0, outputPath } });
  const isCancelled = () => useUi.getState().exportState?.phase === "cancelled";
  const req = buildExportRequest(p, target, outputPath, jobId);
  if (req.durationMs <= 0) {
    set({ phase: "failed", error: "The timeline is empty. Add a clip first." });
    return;
  }
  const unlisten = await ipc.onExportProgress((e) => e.jobId === jobId && set({ phase: "encoding", progress: e.progress }));
  try {
    if (hasOverlay(p)) {
      const dir = await ipc.overlayBegin(jobId);
      const frameCount = Math.max(1, Math.ceil(msToFrame(req.durationMs, p.settings.fps)));
      await renderOverlayFrames(p, jobId, frameCount, isCancelled, (f) => set({ progress: f }));
      req.overlay = { dir, frameCount };
    } else if (target === "motion_mov") {
      set({ phase: "failed", error: "There are no captions or motion to export." });
      return;
    }
    set({ phase: "encoding", progress: 0 });
    await ipc.exportStart(req);
    set({ phase: "done", progress: 1 });
    useUi.getState().announce("Export finished.");
  } catch (e) {
    if (ipc.errorKind(e) === "cancelled" || isCancelled()) set({ phase: "cancelled" });
    else set({ phase: "failed", error: ipc.errorMessage(e) });
  } finally {
    unlisten();
  }
}

export function cancelExport(): void {
  const s = useUi.getState().exportState;
  if (!s) return;
  useUi.getState().set({ exportState: { ...s, phase: "cancelled" } });
  void ipc.cancelJob(s.jobId);
}

export async function exportLottieFiles(p: Project, destDir: string): Promise<number> {
  const files: [string, string][] = Object.values(p.motion).map((m) => [m.lottiePath, `${m.segmentId}-${m.id}`]);
  return ipc.exportLottie(files, destDir);
}
