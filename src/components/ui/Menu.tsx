/**
 * A menu of commands: the project menu under its button, and the context
 * menu at the pointer. It follows the WAI-ARIA menu pattern:
 * - Up and Down move between items (wrapping), Home and End jump to the ends,
 *   and a letter jumps to the next item starting with it.
 * - Enter or Space runs the item, and Escape or Tab closes the menu.
 * - Every key stops at the menu, so single-key editor shortcuts (S, Space)
 *   never fire behind it.
 *
 * Disabled items stay focusable, as the APG asks, so a keyboard user hears
 * them and their reason. A reason shows once under the first item that has
 * it, so a run of items disabled for the same reason reads cleanly.
 *
 * The design system has no menu component; the look comes from its menu
 * surface rules (`bg-raised`, `radius-lg`, `shadow-md`, `body` type).
 */
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";

export type MenuEntry =
  | {
      kind?: "item";
      label: string;
      /** Shown on the right as typed, such as "Shift + Delete". */
      shortcut?: string;
      disabled?: boolean;
      /** Why the item is disabled. Shown only while it is. */
      hint?: string;
      danger?: boolean;
      onSelect: () => void;
    }
  | { kind: "separator" }
  | { kind: "label"; label: string };

export interface MenuProps {
  label: string;
  entries: MenuEntry[];
  onClose: () => void;
  /** Open at this viewport point (a context menu). Without it the menu sits under its trigger, placed by CSS. */
  at?: { x: number; y: number };
  /** Gets focus back when the menu closes from the keyboard or runs an item. Defaults to whatever had focus before. */
  returnFocus?: HTMLElement | null;
  /** The button that opened the menu: a press on it toggles the menu, rather than closing and reopening it. */
  anchor?: RefObject<HTMLElement | null>;
}

/** "Cmd + Shift + Z" -> "Meta+Shift+Z", the form `aria-keyshortcuts` wants. Alternatives ("Q or W") are left out. */
function ariaKeys(shortcut: string): string | undefined {
  if (shortcut.includes(" or ")) return undefined;
  return shortcut.replace(/\s*\+\s*/g, "+").replace(/\bCmd\b/g, "Meta").replace(/\bCtrl\b/g, "Control");
}

export function Menu({ label, entries, onClose, at, returnFocus, anchor }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(at ? { left: at.x, top: at.y } : null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const back = useRef<HTMLElement | null>(returnFocus ?? (document.activeElement as HTMLElement | null));

  const items = () => Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? []);

  /** Close and give focus back, for closes the person chose (Escape, Tab, an item). */
  const finish = () => {
    closeRef.current();
    const el = back.current;
    if (el?.isConnected) el.focus({ preventScroll: true });
  };

  // Keep a context menu inside the window: flip it up or left when it would run off an edge.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!at || !el) return;
    const r = el.getBoundingClientRect();
    const m = 8;
    const left = at.x + r.width + m > window.innerWidth ? Math.max(m, at.x - r.width) : at.x;
    const top = at.y + r.height + m > window.innerHeight ? Math.max(m, at.y - r.height) : at.y;
    setPos({ left, top });
  }, [at]);

  useEffect(() => {
    const first = items().find((b) => b.getAttribute("aria-disabled") !== "true") ?? items()[0];
    first?.focus({ preventScroll: true });
    const away = (e: Event) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor?.current?.contains(t)) return;
      closeRef.current();
    };
    const close = () => closeRef.current();
    // Capture, so a press anywhere closes the menu before that press does anything else.
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("wheel", away, true);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("wheel", away, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
    // Runs once per opening; `anchor` is a stable ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    const go = (n: number) => {
      e.preventDefault();
      list[(n + list.length) % list.length]?.focus();
    };
    switch (e.key) {
      case "ArrowDown":
        return go(i + 1);
      case "ArrowUp":
        return go(i < 0 ? -1 : i - 1);
      case "Home":
        return go(0);
      case "End":
        return go(-1);
      case "Escape":
        e.preventDefault();
        return finish();
      case "Tab":
        e.preventDefault();
        return finish();
      default:
        if (e.key.length === 1 && /\S/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
          const k = e.key.toLowerCase();
          const order = [...list.slice(i + 1), ...list.slice(0, i + 1)];
          const hit = order.find((b) => b.dataset.label?.toLowerCase().startsWith(k));
          if (hit) {
            e.preventDefault();
            hit.focus();
          }
        }
    }
  };

  let lastHint: string | undefined;
  return (
    <div
      ref={ref}
      className={at ? "menu menu--context" : "menu"}
      role="menu"
      aria-label={label}
      style={pos ?? undefined}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {entries.map((entry, i) => {
        if (entry.kind === "separator") {
          lastHint = undefined;
          return <div key={i} className="menu__sep" role="separator" />;
        }
        if (entry.kind === "label") {
          lastHint = undefined;
          return (
            <div key={i} className="menu__label" role="presentation">
              {entry.label}
            </div>
          );
        }
        const hint = entry.disabled ? entry.hint : undefined;
        const showHint = hint && hint !== lastHint;
        lastHint = hint;
        const hintId = showHint ? `menu-hint-${i}` : undefined;
        return (
          <button
            key={i}
            type="button"
            role="menuitem"
            className={entry.danger ? "menu__item menu__item--danger" : "menu__item"}
            data-label={entry.label}
            aria-disabled={entry.disabled || undefined}
            aria-describedby={hintId}
            aria-keyshortcuts={entry.shortcut ? ariaKeys(entry.shortcut) : undefined}
            title={hint}
            onClick={() => {
              if (entry.disabled) return;
              finish();
              entry.onSelect();
            }}
          >
            <span className="menu__text">
              <span>{entry.label}</span>
              {showHint && (
                <span id={hintId} className="menu__hint">
                  {hint}
                </span>
              )}
            </span>
            {entry.shortcut && (
              <span className="menu__shortcut" aria-hidden="true">
                {entry.shortcut}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
