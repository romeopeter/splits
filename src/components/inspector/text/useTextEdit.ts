/**
 * The selected text clip, and the ways the Text panel's tabs change it:
 * - `set` / `setStyle` commit at once (buttons, swatches, fields): one undo step.
 * - `live` / `liveStyle` edit during a drag or while typing; `done` ends the
 *   gesture, so a whole drag or a whole typing session is one undo step.
 */
import { useProject } from "../../../store/project";
import { useUi } from "../../../store/ui";
import { useGestureEdit } from "../../../hooks/useGestureEdit";
import { isLocked, trackById } from "../../../lib/timeline";
import { updateText, updateTextStyle } from "../../../lib/textClips";
import type { Project, TextClip, TextStyle, Track } from "../../../types/project";

export interface TextEdit {
  project: Project;
  clip: TextClip;
  track: Track;
  locked: boolean;
  set: (patch: Partial<TextClip>) => void;
  setStyle: (patch: Partial<TextStyle>) => void;
  live: (patch: Partial<TextClip>) => void;
  liveStyle: (patch: Partial<TextStyle>) => void;
  done: () => void;
}

export function useTextEdit(): TextEdit | null {
  const project = useProject((s) => s.project);
  const selection = useUi((s) => s.selection);
  const g = useGestureEdit();
  const clip = selection?.kind === "text" ? project.texts[selection.id] : undefined;
  const track = clip && trackById(project, clip.trackId);
  if (!clip || !track) return null;
  const id = clip.id;
  return {
    project,
    clip,
    track,
    locked: isLocked(project, clip.trackId),
    set: (patch) => useProject.getState().commit((p) => updateText(p, id, patch)),
    setStyle: (patch) => useProject.getState().commit((p) => updateTextStyle(p, id, patch)),
    live: (patch) => g.change((p) => updateText(p, id, patch)),
    liveStyle: (patch) => g.change((p) => updateTextStyle(p, id, patch)),
    done: g.done,
  };
}
