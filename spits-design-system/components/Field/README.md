A bordered input for values in the inspector: size, spacing, line height, X and Y, a text block.

**Provide:** a `label` (the accessible name) or a `caption` (shown under the field, and used as the name when `label` is absent); `value`; optional `unit`, `stepper`, `type` (`text` | `number`), `multiline`.

**Use:**
- Set numbers in tabular figures; right-hand `unit` text stays `text-muted` and is hidden from screen readers (put units in `label` when it matters).
- The 1px `border-control` edge is required: the fill alone is not 3:1 against the panel.
- Fields in one row share the width equally (`PanelRow inline`).

**Don't:** put the label inside the value; use placeholder as a label.

**Accessibility:** native `input` or `textarea`; Arrow Up and Down step a `type="number"` value; focus shows `shadow-focus`.
