The inspector that sits beside the canvas. The Typography panel above is the reference layout.

**Provide:** `title`; `onCollapse` to show the collapse button; `PanelSection` children; inside a section, `PanelRow` with a `label` and one or more controls (`inline` puts controls side by side).

**Use:**
- Width `size-panel` (320px), corners `radius-lg`, elevation `shadow-panel`, ground `bg-panel`.
- Sections pad `space-16` by `space-20` and separate with a `border-subtle` rule.
- Row labels are `label` style in `text-secondary`, 72px wide; controls fill the rest.
- Order sections by frequency: content, type, position, appearance.

**Accessibility:** a labelled `section` with an `h2` title; each row is a named group so the visible label is announced with its control.
