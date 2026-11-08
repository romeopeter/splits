A square icon-only button for tools, toggles and bar actions: undo, redo, lock, hide, skip, play.

**Provide:** `icon`, a required `label` (becomes `aria-label` and the tooltip), `size` (`sm` 28, `md` 36, `lg` 44) and optionally `active` to make it a toggle (`aria-pressed`).

**Use:**
- Pair every icon with a word in `label`: "Lock Track 1", not "Lock".
- `active` shows `accent-soft` fill, `text-link` icon and a 1px `selection` ring, so the state shows by shape and tone, never by hue alone.
- Hit areas stay at least `size-hit-min` (24px); `sm` is for dense rows only.

**Don't:** draw a toggled state by swapping colour only; use `sm` for primary playback controls.
