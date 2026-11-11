/**
 * What every tab of the Clip and Audio panels needs about the selected media
 * clip, and the two ways to change it:
 * - `set` commits at once (buttons, number fields): one undo step.
 * - `live` edits during a slider drag; `done` ends the gesture, so the whole
 *   drag becomes one undo step (`useGestureEdit`).
 */
import { useProject } from "../../../store/project";
import { useUi } from "../../../store/ui";
import { useGestureEdit } from "../../../hooks/useGestureEdit";
import { isLocked, trackById, updateClip } from "../../../lib/timeline";
import type { Asset, MediaClip, Project, Track } from "../../../types/project";

export interface ClipEdit {
  project: Project;
  clip: MediaClip;
  asset: Asset;
  track: Track;
  locked: boolean;
  /** A clip with a picture on a video track. Detached audio on an audio track is sound only. */
  picture: boolean;
  set: (patch: Partial<MediaClip>) => void;
  live: (patch: Partial<MediaClip>) => void;
  /** Live edit with any project change, for edits that move other clips (speed). */
  liveProject: (fn: (p: Project) => Project) => void;
  done: () => void;
}

/** The selected media clip with its edit helpers, or null when no media clip is selected. */
export function useClipEdit(): ClipEdit | null {
  const project = useProject((s) => s.project);
  const selection = useUi((s) => s.selection);
  const g = useGestureEdit();
  const clip = selection?.kind === "clip" ? project.clips[selection.id] : undefined;
  const asset = clip && project.assets[clip.assetId];
  const track = clip && trackById(project, clip.trackId);
  if (!clip || !asset || !track) return null;
  const edit = (patch: Partial<MediaClip>) => (p: Project) => updateClip(p, clip.id, patch);
  return {
    project,
    clip,
    asset,
    track,
    locked: isLocked(project, clip.trackId),
    picture: asset.hasVideo && track.kind === "video",
    set: (patch) => useProject.getState().commit(edit(patch)),
    live: (patch) => g.change(edit(patch)),
    liveProject: (fn) => g.change(fn),
    done: g.done,
  };
}

/** A number typed into a field, or `fallback` when it is not one. */
export const num = (v: string, fallback: number) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
