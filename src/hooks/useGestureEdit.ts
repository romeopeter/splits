import { useRef } from "react";
import { useProject } from "../store/project";
import type { Project } from "../types/project";

/**
 * Continuous edits (sliders, scrubbing a number) as one undo step:
 * the first change begins a gesture, later changes apply live, and
 * `done()` (pointer or key up) records it.
 */
export function useGestureEdit() {
  const active = useRef(false);
  return {
    change(fn: (p: Project) => Project) {
      const s = useProject.getState();
      if (!active.current) {
        s.beginGesture();
        active.current = true;
      }
      s.live(fn);
    },
    done() {
      if (!active.current) return;
      active.current = false;
      useProject.getState().endGesture();
    },
  };
}
