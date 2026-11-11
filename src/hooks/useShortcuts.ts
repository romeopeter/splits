/**
 * Global keyboard shortcuts: editor-patterns.md, plus B and V for tools,
 * Up and Down for edit points and Q and W for ripple trim (AGENTS.md,
 * open decision 3) and T to add text. Single-key shortcuts are ignored while typing in a
 * field (WCAG 2.1.4).
 */
import { useEffect } from "react";
import { useProject, getProject } from "../store/project";
import { useUi } from "../store/ui";
import {
  addTextAtPlayhead,
  deleteSelection,
  duplicateSelection,
  jumpToEditPoint,
  rippleDeleteSelection,
  rippleTrimSelectionToPlayhead,
  splitAtPlayhead,
  stepFrames,
  trimSelectionToPlayhead,
} from "../lib/actions";
import { projectDuration } from "../lib/timeline";

function typing(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

/** Places where Up and Down keep their own meaning. */
const UP_DOWN_OWNERS = "[role=slider], [role=radio], [role=tab], [role=listbox], [role=option], select, .preview-frame, .track-grip, .inspector, [role=dialog]";

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ui = useUi.getState();
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        if (typing(e.target)) return;
        e.preventDefault();
        if (e.shiftKey) useProject.getState().redo();
        else useProject.getState().undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSelection();
        return;
      }
      if (typing(e.target) || mod || e.altKey) return;
      // Let focused buttons handle Space/Enter themselves.
      const onButton = (e.target as HTMLElement | null)?.closest("button, [role=slider], [role=radio]");

      switch (e.key) {
        case " ":
          if (onButton) return;
          e.preventDefault();
          ui.setPlaying(!ui.playing);
          break;
        case "s":
        case "S":
          splitAtPlayhead();
          break;
        case "b":
        case "B":
          ui.setTool("blade");
          break;
        case "v":
        case "V":
          ui.setTool("select");
          break;
        case "ArrowLeft":
        case "ArrowRight": {
          // Sliders, radio groups and tabs move their own value with Left and Right.
          if ((e.target as HTMLElement | null)?.closest("[role=slider], [role=radio], [role=tab], .preview-frame")) return;
          e.preventDefault();
          const dir = e.key === "ArrowLeft" ? -1 : 1;
          if (e.shiftKey) ui.setPlayhead(ui.playheadMs + dir * 1000);
          else stepFrames(dir);
          break;
        }
        case "ArrowUp":
        case "ArrowDown":
          // Up and Down already mean something on sliders, radio groups,
          // lists, the canvas (nudge) and a track grip (reorder), and they
          // scroll the inspector and dialogs; leave them alone there.
          if ((e.target as HTMLElement | null)?.closest(UP_DOWN_OWNERS)) return;
          e.preventDefault();
          jumpToEditPoint(e.key === "ArrowUp" ? -1 : 1);
          break;
        case "t":
        case "T":
          e.preventDefault(); // the new text's editor takes focus; keep the T out of it
          addTextAtPlayhead();
          break;
        case "q":
        case "Q":
          rippleTrimSelectionToPlayhead("start");
          break;
        case "w":
        case "W":
          rippleTrimSelectionToPlayhead("end");
          break;
        case "Home":
          ui.setPlayhead(0);
          break;
        case "End":
          ui.setPlayhead(projectDuration(getProject()));
          break;
        case "[":
          trimSelectionToPlayhead("start");
          break;
        case "]":
          trimSelectionToPlayhead("end");
          break;
        case "Delete":
        case "Backspace":
          e.preventDefault();
          if (e.shiftKey) rippleDeleteSelection();
          else deleteSelection();
          break;
        case "+":
        case "=":
          ui.setZoom(ui.pxPerSecond * 1.25);
          break;
        case "-":
        case "−":
          ui.setZoom(ui.pxPerSecond / 1.25);
          break;
        case ")":
        case "0":
          if (e.shiftKey || e.key === ")") window.dispatchEvent(new Event("split:fit-timeline"));
          break;
        case "Escape":
          if (ui.eyedropperClipId) ui.set({ eyedropperClipId: null });
          else if (ui.tool !== "select") ui.setTool("select");
          else ui.select(null);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
