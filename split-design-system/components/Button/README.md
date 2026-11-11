Triggers an action: Export, Share, Split, Add track, Delete clip.

**Provide:** a verb label (sentence case); `icon` or `iconEnd` for a glyph from the Icons group; `variant` (`primary` | `secondary` | `ghost` | `danger`); `size` (`sm` 28, `md` 36, `lg` 44).

**Use:**
- One `primary` per view: Export in the top bar, Apply in a dialog. Everything else is `secondary` or `ghost`.
- `ghost` for repeated commands in dense bars (transport, timeline toolbar).
- `danger` only for destructive confirmation (Delete clip), never as a resting state.
- Keep labels to one or two words. Put the object in the label when ambiguous: Delete clip, not Delete.

**Don't:** put text on `primary` in any colour but `text-on-accent`; shrink below `sm`; use an icon alone (use IconButton, which requires a label).

**Accessibility:** renders a native `<button>`; the focus ring is `shadow-focus`; disabled buttons keep their label readable by name but are exempt from contrast.
