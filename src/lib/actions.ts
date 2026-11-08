/**
 * App actions: the glue between UI events, the stores and Rust.
 * Components call these instead of orchestrating IPC themselves.
 */
import { open } from "@tauri-apps/plugin-dialog";
import type { Asset, MotionClip, Project, Transcript } from "../types/project";
import { getProject, useProject } from "../store/project";
import { useUi } from "../store/ui";
import { newId } from "./ids";
import * as ipc from "./ipc";
import {
  addClip,
  clipAt,
  deleteClip,
  duplicateClip,
  firstTrackOfKind,
  isLocked,
  segmentWords,
  splitClip,
  updateClip,
} from "./timeline";
import { msToFrame } from "./time";

const ui = () => useUi.getState();
const commit = (fn: (p: Project) => Project) => useProject.getState().commit(fn);

const basename = (p: string) => p.split(/[\\/]/).pop() ?? p;

export const ASPECTS = [
  { value: "16:9", label: "16:9 landscape", width: 1920, height: 1080 },
  { value: "9:16", label: "9:16 vertical", width: 1080, height: 1920 },
  { value: "1:1", label: "1:1 square", width: 1080, height: 1080 },
  { value: "4:5", label: "4:5 portrait", width: 1080, height: 1350 },
] as const;

export function aspectOf(p: Project): string {
  return ASPECTS.find((a) => a.width === p.settings.width && a.height === p.settings.height)?.value ?? "16:9";
}

function aspectFor(w: number, h: number) {
  const r = w / h;
  return ASPECTS.reduce((best, a) => (Math.abs(a.width / a.height - r) < Math.abs(best.width / best.height - r) ? a : best));
}

const MEDIA_EXTENSIONS = ["mp4", "mov", "m4v", "mkv", "webm", "avi", "mts", "mp3", "wav", "m4a", "aac", "flac", "ogg"];

export async function chooseAndImport(): Promise<void> {
  const picked = await open({ multiple: true, filters: [{ name: "Video and audio", extensions: MEDIA_EXTENSIONS }] });
  if (!picked) return;
  await importPaths(Array.isArray(picked) ? picked : [picked]);
}

export async function importPaths(paths: string[]): Promise<void> {
  for (const path of paths) {
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    if (!MEDIA_EXTENSIONS.includes(ext)) {
      ui().notify({ tone: "warning", text: `${basename(path)} is not a video or audio file Splits can open.` });
      continue;
    }
    const id = newId("a");
    try {
      const info = await ipc.importMedia(id, path);
      const asset: Asset = {
        id,
        path,
        name: basename(path),
        kind: info.hasVideo ? "video" : "audio",
        durationMs: info.durationMs,
        hasVideo: info.hasVideo,
        hasAudio: info.hasAudio,
        width: info.width ?? undefined,
        height: info.height ?? undefined,
        fps: info.fpsNum && info.fpsDen ? { num: info.fpsNum, den: info.fpsDen } : undefined,
        proxy: { status: "pending", progress: 0 },
      };
      commit((p) => {
        let next: Project = { ...p, assets: { ...p.assets, [id]: asset } };
        const empty = Object.keys(p.clips).length === 0;
        if (empty && asset.hasVideo && asset.width && asset.height) {
          const a = aspectFor(asset.width, asset.height);
          const fps = asset.fps && asset.fps.num / asset.fps.den <= 60 ? asset.fps : p.settings.fps;
          next = { ...next, settings: { width: a.width, height: a.height, fps } };
        }
        const track = firstTrackOfKind(next, asset.hasVideo ? "video" : "audio");
        return track ? addClip(next, asset, track.id).project : next;
      });
      ui().announce(`Added ${asset.name}. Making an editing copy…`);
    } catch (e) {
      ui().notify({ tone: "danger", text: `Could not import ${basename(path)}. ${ipc.errorMessage(e)}` });
    }
  }
}

export function handleMediaJob(e: ipc.MediaJobEvent): void {
  const { patchAsset, project } = useProject.getState();
  const asset = project.assets[e.assetId];
  if (!asset) return;
  if (e.stage === "proxy") {
    if (e.status === "failed") {
      patchAsset(e.assetId, { proxy: { status: "failed", progress: 0, error: e.error } });
      ui().notify({ tone: "danger", text: `Could not prepare ${asset.name} for editing. ${e.error ?? ""}` });
    } else if (e.status === "done") {
      patchAsset(e.assetId, { proxy: { status: "ready", progress: 1, path: e.proxyPath } });
      ui().announce(`${asset.name} is ready to edit.`);
    } else {
      patchAsset(e.assetId, { proxy: { ...asset.proxy, status: "pending", progress: e.progress } });
    }
  } else if (e.stage === "thumbnails" && e.thumbnails) {
    patchAsset(e.assetId, { thumbnails: e.thumbnails, thumbnailIntervalMs: e.thumbnailIntervalMs });
  } else if (e.stage === "peaks" && e.peaks) {
    patchAsset(e.assetId, { peaks: e.peaks });
  }
}

/** On load, confirm proxies exist; Rust rebuilds any that are gone (cache cleared, new machine). */
export function ensureProxies(p: Project): void {
  const { patchAsset } = useProject.getState();
  for (const a of Object.values(p.assets)) {
    patchAsset(a.id, { proxy: { ...a.proxy, status: "pending", progress: 0 } });
    ipc.ensureMedia(a.id, a.path).catch((e) => patchAsset(a.id, { proxy: { status: "failed", progress: 0, error: ipc.errorMessage(e) } }));
  }
}

// ---------- Captions ----------

export async function refreshWhisper(): Promise<ipc.WhisperStatus | null> {
  try {
    const s = await ipc.whisperStatus();
    ui().set({ whisper: s });
    return s;
  } catch {
    return null;
  }
}

export async function transcribe(assetId: string): Promise<void> {
  const p = getProject();
  const asset = p.assets[assetId];
  if (!asset || !asset.hasAudio) {
    ui().notify({ tone: "warning", text: "This clip has no audio to transcribe." });
    return;
  }
  const model = ui().settings.whisperModel;
  const jobId = newId("j");
  ui().set({ transcribing: { assetId, jobId } });
  ui().announce("Generating captions…");
  try {
    const t = await ipc.transcribeAsset(jobId, assetId, asset.path, model);
    const transcript: Transcript = { ...t };
    const replaced = Object.values(getProject().motion).some((m) => m.assetId === assetId);
    commit((proj) => ({ ...proj, transcripts: { ...proj.transcripts, [assetId]: transcript } }));
    ui().announce(`Captions ready: ${transcript.segments.length} segments.`);
    ui().notify({
      tone: replaced ? "warning" : "success",
      text: replaced
        ? `Captions regenerated. Motion built on the old transcript may show as out of sync; regenerate it.`
        : `Captions ready: ${transcript.words.length} words in ${transcript.segments.length} segments.`,
    });
  } catch (e) {
    if (ipc.errorKind(e) !== "cancelled") ui().notify({ tone: "danger", text: `Captions failed. ${ipc.errorMessage(e)}` });
  } finally {
    ui().set({ transcribing: null });
  }
}

export function editWord(assetId: string, wordId: string, text: string): void {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return;
  commit((p) => {
    const tr = p.transcripts[assetId];
    if (!tr) return p;
    const words = tr.words.map((w) => (w.id === wordId ? { ...w, text: clean } : w));
    return { ...p, transcripts: { ...p.transcripts, [assetId]: { ...tr, words } } };
  });
}

// ---------- Motion ----------

export interface SegmentRef {
  assetId: string;
  segmentId: string;
}

export async function generateMotion(refs: SegmentRef[], prompt: string): Promise<void> {
  const p = getProject();
  const { settings } = ui();
  const segments = refs
    .map((r) => {
      const tr = p.transcripts[r.assetId];
      const seg = tr?.segments.find((s) => s.id === r.segmentId);
      if (!tr || !seg) return null;
      const words = segmentWords(tr, seg).map((w) => ({ id: w.id, text: w.text, startMs: w.startMs, endMs: w.endMs }));
      return { ref: r, seg, words };
    })
    .filter((s): s is NonNullable<typeof s> => !!s && s.words.length > 0);
  if (segments.length === 0) return;

  // Segment IDs repeat across assets, so send unique keys and map back.
  const keyFor = (r: SegmentRef) => `${r.assetId}__${r.segmentId}`;
  const requestId = newId("r");
  ui().set({ motion: { requestId, progress: null } });
  ui().announce(`Generating motion for ${segments.length} segment${segments.length === 1 ? "" : "s"}…`);
  try {
    const result = await ipc.motionGenerate({
      requestId,
      projectId: p.id,
      stylePrompt: prompt,
      model: settings.claudeModel,
      effort: settings.effort,
      width: p.settings.width,
      height: p.settings.height,
      fpsNum: p.settings.fps.num,
      fpsDen: p.settings.fps.den,
      segments: segments.map((s) => ({ segmentId: keyFor(s.ref), words: s.words })),
    });
    const track = firstTrackOfKind(getProject(), "motion");
    const now = new Date().toISOString();
    const made: MotionClip[] = [];
    for (const r of result.results) {
      const s = segments.find((x) => keyFor(x.ref) === r.segmentId);
      if (!s || !r.ok || !r.clipId || !r.lottiePath || !r.frames || !track) continue;
      made.push({
        id: r.clipId,
        trackId: track.id,
        assetId: s.ref.assetId,
        segmentId: s.seg.id,
        firstWordId: s.seg.firstWordId,
        lastWordId: s.seg.lastWordId,
        wordIds: s.words.map((w) => w.id),
        lottiePath: r.lottiePath,
        frames: r.frames,
        offsetMs: 0,
        hidden: false,
        prompt,
        model: result.model,
        generatedAt: now,
      });
    }
    commit((proj) => {
      const motion = { ...proj.motion };
      for (const m of made) {
        for (const [id, old] of Object.entries(motion)) {
          if (old.assetId === m.assetId && old.segmentId === m.segmentId) delete motion[id];
        }
        motion[m.id] = m;
      }
      const styles = prompt.trim() ? [prompt.trim(), ...proj.motionStyles.filter((s) => s !== prompt.trim())].slice(0, 8) : proj.motionStyles;
      return { ...proj, motion, motionStyles: styles };
    });
    ui().set({ lastUsage: result.usage });
    const failed = result.results.filter((r) => !r.ok);
    if (failed.length === 0) {
      ui().notify({ tone: "success", text: `Motion ready for ${made.length} segment${made.length === 1 ? "" : "s"}.` });
    } else {
      ui().notify({
        tone: "warning",
        text: `Motion ready for ${made.length} of ${result.results.length} segments. ${failed[0]?.error ?? ""}`,
      });
    }
    ui().announce(`Motion ready for ${made.length} segments.`);
  } catch (e) {
    if (ipc.errorKind(e) !== "cancelled") ui().notify({ tone: "danger", text: ipc.errorMessage(e) });
    else ui().announce("Motion cancelled.");
  } finally {
    ui().set({ motion: null });
  }
}

export function cancelMotion(): void {
  const m = ui().motion;
  if (m) void ipc.cancelJob(m.requestId);
}

// ---------- Editing commands ----------

/** Split the selected clip at the playhead, or every unlocked clip under it. */
export function splitAtPlayhead(): void {
  const { playheadMs, selection } = ui();
  const p = getProject();
  const ids =
    selection?.kind === "clip"
      ? [selection.id]
      : p.tracks.filter((t) => !t.locked && !t.hidden).map((t) => clipAt(p, t.id, playheadMs)?.id).filter((x): x is string => !!x);
  if (ids.length === 0) {
    ui().announce("Nothing to split at the playhead.");
    return;
  }
  let did = 0;
  commit((proj) => {
    let next = proj;
    for (const id of ids) {
      const c = next.clips[id];
      if (!c || isLocked(next, c.trackId)) continue;
      const r = splitClip(next, id, playheadMs);
      if (r.rightId) did++;
      next = r.project;
    }
    return next;
  });
  ui().announce(did ? `Split ${did} clip${did === 1 ? "" : "s"}.` : "The playhead is at a clip edge; nothing to split.");
}

export function splitClipAt(id: string, atMs: number): void {
  const p = getProject();
  const c = p.clips[id];
  if (!c || isLocked(p, c.trackId)) return;
  commit((proj) => splitClip(proj, id, atMs).project);
  ui().announce("Split clip.");
}

export function deleteSelection(): void {
  const s = ui().selection;
  if (!s) return;
  const p = getProject();
  if (s.kind === "clip") {
    const c = p.clips[s.id];
    if (!c || isLocked(p, c.trackId)) return;
    commit((proj) => deleteClip(proj, s.id));
    ui().announce("Deleted clip.");
  } else if (s.kind === "motion") {
    commit((proj) => {
      const motion = { ...proj.motion };
      delete motion[s.id];
      return { ...proj, motion };
    });
    ui().announce("Deleted motion clip.");
  }
  ui().select(null);
}

export function duplicateSelection(): void {
  const s = ui().selection;
  if (s?.kind !== "clip") return;
  let newSel: string | null = null;
  commit((p) => {
    const r = duplicateClip(p, s.id);
    newSel = r.id;
    return r.project;
  });
  if (newSel) ui().select({ kind: "clip", id: newSel });
}

/** `[` and `]`: trim the selected clip's start or end to the playhead. */
export function trimSelectionToPlayhead(edge: "start" | "end"): void {
  const s = ui().selection;
  if (s?.kind !== "clip") return;
  const t = ui().playheadMs;
  commit((p) => {
    const c = p.clips[s.id];
    if (!c || isLocked(p, c.trackId)) return p;
    const end = c.startMs + (c.outMs - c.inMs);
    if (t <= c.startMs || t >= end) return p;
    return edge === "start"
      ? updateClip(p, c.id, { startMs: t, inMs: c.inMs + (t - c.startMs) })
      : updateClip(p, c.id, { outMs: c.inMs + (t - c.startMs) });
  });
}

export function stepFrames(n: number): void {
  const p = getProject();
  const f = msToFrame(ui().playheadMs, p.settings.fps) + n;
  ui().setPlayhead((Math.max(0, f) * 1000 * p.settings.fps.den) / p.settings.fps.num);
}
