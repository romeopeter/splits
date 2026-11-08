/**
 * Global keyboard shortcuts (editor-patterns.md, plus B for the blade).
 * Single-key shortcuts are ignored while typing in a field (WCAG 2.1.4).
 */
import { useEffect } from "react";
import { useProject, getProject } from "../store/project";
import { useUi } from "../store/ui";
import { deleteSelection, duplicateSelection, splitAtPlayhead, stepFrames, trimSelectionToPlayhead } from "../lib/actions";
import { projectDuration } from "../lib/timeline";

function typing(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

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
          if ((e.target as HTMLElement | null)?.closest("[role=slider], .preview-frame")) return;
          e.preventDefault();
          const dir = e.key === "ArrowLeft" ? -1 : 1;
          if (e.shiftKey) ui.setPlayhead(ui.playheadMs + dir * 1000);
          else stepFrames(dir);
          break;
        }
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
          deleteSelection();
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
          if (e.shiftKey || e.key === ")") window.dispatchEvent(new Event("splits:fit-timeline"));
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
