A single-choice group of two to five options: Align (left, center, right, justify) and Case (original, AG, ag, Ag).

**Provide:** `label` for the group; `options` as `{value, icon | text, label}` where `label` names each option for screen readers; `value` or `defaultValue`; `onChange`.

**Use:**
- The selected segment gets `bg-field-selected`, `text-primary` and a 1px `border-strong` ring; unselected segments read `text-secondary`.
- Give every icon-only option a `label` and a tooltip.

**Don't:** use more than five segments; pair it with a Select that does the same job.

**Accessibility:** `role="radiogroup"` with roving tabindex; Left and Right (or Up and Down) move and select.
