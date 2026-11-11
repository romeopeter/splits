Phosphor icons in the regular weight (outline, 1.5px at 24px), mapped from Split icon names; transport and grip glyphs use the fill weight. Decided 2026-11-11; the SVGs in Icons are the original set, kept for reference.

**Provide:** `name` from the app's icon table (`src/components/ui/Icon.tsx`), `size` (default 20; 16 in clips and dense rows, 24 in the rail), `title` only when the icon stands alone and carries meaning.

**Use:** icons inherit `currentColor`; set the colour on the parent from `text-secondary`, `text-primary` or `text-link`. Pair status icons (check, warning, alert, info) with a word. Phosphor glyphs fill with `currentColor`.

**Don't:** mix in another icon family, scale strokes with size, or use an icon without an accessible name from its button.
