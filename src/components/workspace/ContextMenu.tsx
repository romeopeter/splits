/**
 * The app's own context menu, in place of the WebView's.
 *
 * The WebView's menu offers Reload, Back and Inspect Element, which mean
 * nothing in an editor (and Reload throws away the session). So a right-click
 * anywhere is stopped, and on a clip, text, track, lane or the canvas the
 * app's menu opens instead (see `contextMenus.ts`).
 *
 * Text fields keep the system menu: it has Cut, Copy, Paste and spelling,
 * which people expect there and which the WebView can do without clipboard
 * permissions.
 *
 * Keyboard: Shift+F10 or the Menu key opens the same menu for the focused
 * item, below it (WAI-ARIA APG, menu button and context menu practice).
 */
import { useEffect, useState } from "react";
import { Menu, type MenuEntry } from "../ui";
import { contextMenuFor } from "./contextMenus";

interface Open {
  at: { x: number; y: number };
  label: string;
  entries: MenuEntry[];
  returnFocus: HTMLElement | null;
}

/** Fields where the system menu stays: typing, not editing the timeline. */
function editable(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable || el.tagName === "TEXTAREA") return true;
  return el instanceof HTMLInputElement && ["text", "search", "password", "email", "url", "number", "tel"].includes(el.type);
}

export function ContextMenu() {
  const [menu, setMenu] = useState<Open | null>(null);

  useEffect(() => {
    const open = (target: Element, x: number, y: number, keyboard: boolean): boolean => {
      const spec = contextMenuFor(target, x, y, keyboard);
      if (!spec || spec.entries.length === 0) return false;
      const focusable = target.closest<HTMLElement>("button, [tabindex]");
      setMenu({ at: { x, y }, label: spec.label, entries: spec.entries, returnFocus: focusable ?? (document.activeElement as HTMLElement | null) });
      return true;
    };
    const onContextMenu = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (!t || editable(t)) return;
      e.preventDefault();
      if (t.closest(".menu")) return;
      open(t, e.clientX, e.clientY, false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ContextMenu" && !(e.shiftKey && e.key === "F10")) return;
      const el = document.activeElement;
      if (!el || el === document.body || editable(el) || el.closest(".menu")) return;
      const r = el.getBoundingClientRect();
      // Below the item, or at the playhead's spot for a wide one such as the canvas.
      if (open(el, r.left + Math.min(r.width / 2, 16), r.top + Math.min(r.height, r.height / 2 + 16), true)) e.preventDefault();
    };
    window.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!menu) return null;
  return <Menu key={`${menu.at.x},${menu.at.y},${menu.label}`} label={menu.label} entries={menu.entries} at={menu.at} returnFocus={menu.returnFocus} onClose={() => setMenu(null)} />;
}
