The left rail that switches the inspector: Add, Text, Captions, Shapes, Effects, Settings. Help sits at the bottom.

**Provide:** `ToolRailItem` children, each with `icon`, `label` and `active`; a `label` for the rail itself (default "Tools").

**Use:**
- Exactly one item is `active` at a time; it opens its panel beside the rail.
- Width is `size-rail` (56px); items are 44px (`size-control-lg`) with 24px glyphs.
- Up and Down move between items; Home and End jump to the ends.

**Don't:** add labels under the icons (the tooltip carries the name); put more than eight tools in the rail.

**Accessibility:** `role="toolbar"` with vertical orientation; each item is a toggle button named by `label`.
