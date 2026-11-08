# Accessibility

Target: WCAG 2.2 level AA in the dark and light themes, with AAA contrast for body text in `text-primary` and `text-secondary`. The tokens and components build in the contrast, focus ring, naming and keyboard rules below. Behaviours marked *(product)* are for the app to supply around them. Apply the same rules to anything new.

## Contrast, measured

Ratios are computed from the token values; the lowest value in each set is shown. Disabled controls (`text-disabled`, `opacity-disabled`) are exempt by WCAG and must keep an `aria-disabled` or `disabled` state.

| Pair (lowest in the set) | Dark | Light | Requirement |
| --- | --- | --- | --- |
| `text-primary` on `bg-panel` | 17.0:1 | 18.7:1 | 4.5:1 text |
| `text-primary` on every surface (`bg-app`, `bg-canvas`, `bg-raised`, `bg-field`, `bg-field-hover`, `bg-timeline`) | 13.4:1 | 15.0:1 | 4.5:1 text |
| `text-secondary` on `bg-panel`, `bg-field`, `bg-field-hover`, `bg-field-selected` | 7.0:1 | 7.2:1 | 4.5:1 text |
| `text-muted` on `bg-panel`, `bg-field`, `bg-field-hover`, `bg-timeline` | 4.8:1 | 5.0:1 | 4.5:1 text |
| `text-link` on `bg-panel`, `bg-field` | 6.5:1 | 5.6:1 | 4.5:1 text |
| `text-on-accent` on `accent` | 5.1:1 | 6.0:1 | 4.5:1 text |
| `text-on-accent` on `accent-hover` and `accent-pressed` | 6.6:1 | 8.0:1 | 4.5:1 text |
| `text-on-accent` on `danger-fill`, `danger-fill-hover` | 4.8:1 | 5.8:1 | 4.5:1 text |
| `text-on-accent` on `collab-1` to `collab-4` | 4.9:1 | 4.9:1 | 4.5:1 text |
| `on-clip` on shape, text, video and audio clips | 6.1:1 | 6.1:1 | 4.5:1 text |
| `text-on-accent` on `clip-caption` | 6.6:1 | 6.6:1 | 4.5:1 text |
| Status colours on `bg-panel`, `bg-raised`, `bg-field` | 6.4:1 | 4.6:1 | 4.5:1 text |
| `border-control` on `bg-panel`, `bg-raised`, `bg-app` | 3.5:1 | 4.5:1 | 3:1 non-text |
| `focus-ring` and `selection` on every surface | 6.5:1 | 5.1:1 | 3:1 non-text |
| `playhead` on `bg-timeline` | 19.5:1 | 17.6:1 | 3:1 non-text |
| `clip-edge-*` on `bg-timeline` | 7.3:1 | 4.5:1 | 3:1 non-text |
| `accent` fill on `bg-panel` (button boundary) | 3.6:1 | 6.0:1 | 3:1 non-text |
| `caption-text` on `caption-bg` over a pure white frame | 9.3:1 | 9.3:1 | 4.5:1 text |

## Colour is never the only signal

- **Clip kind:** every clip has its own icon (shapes, T, captions, video, music note) and a text label as well as its fill and edge. A viewer who cannot tell yellow from green still reads "Video" from the glyph.
- **Status:** success, warning, danger and info each pair with an icon (check, warning triangle, alert, info) and a word. Success is teal, not green, so it parts from the red-orange danger on the blue–yellow axis; the two sit within 1.4:1 in lightness, so the icon and word are required, not optional.
- **Toggles:** a toggled IconButton gains a fill and a 1px ring; the lock icon changes shape (closed or open shackle); hidden tracks show a struck-through eye.
- **Collaborators:** the cursor tag always carries the person's name; the colour only groups their cursor, avatar and selections.
- **Selection:** a selected clip gains a 2px outline, trim handles and `aria-pressed`, not only a tint.

## Keyboard

- Every control is reachable in a logical order: top bar, tool rail, inspector, canvas, transport, timeline. Do not trap focus except in dialogs.
- Focus is always visible: `shadow-focus` on `:focus-visible`, a 2px surface gap and a 2px ring that holds 3:1 on every surface. Never set `outline: none` without it.
- Composite widgets follow the WAI-ARIA authoring patterns: the tool rail and transport are `toolbar`s; the segmented control is a `radiogroup` with roving tabindex; the ruler is a `slider`; the select is a native `select`.
- *(product)* Pointer-only gestures have an equivalent (WCAG 2.5.7): drag to move a clip is also Arrow keys on the focused clip (1 frame, Shift for 1 second); drag to resize an object is the Position and Size fields; drag to reorder a track is Alt+Arrow on the track's grip button.
- *(product)* Shortcuts that use a single character can be turned off or remapped in Settings (WCAG 2.1.4).

## Pointer targets

Targets are at least 24 by 24px (`size-hit-min`, WCAG 2.5.8) and normally 36 or 44. Icons inside clips are 16px but sit in a clip at least 32px tall, so the target is the clip. Keep 4px between adjacent targets.

## Screen readers and live announcements

- Every icon-only button has a visible tooltip and an `aria-label` that says what it will do ("Lock Track 2", "Split at playhead").
- Rows in the inspector are named groups: the visible label ("Weight") is announced with its control.
- *(product)* Provide one polite live region for editing results: "Split Video at 00:00:18", "Deleted Subtitles", "Undo: move Text", "Export started", "Export complete". Do not announce playback time every second; announce Play and Pause only.
- The timecode is a `timer` with a spoken name that includes the total; the ruler's `aria-valuetext` is the current time.
- Clip labels read "<Kind> clip, <name>" followed by its start and end times in the app.

## Video-specific

- **Captions** *(product)*: every export option offers burned-in captions on `caption-bg` and a sidecar file (WebVTT or SRT); the editor warns when a video with speech has no subtitle track.
- **Text on video** *(product)*: the inspector shows the contrast of a text colour against the sampled frame region and warns below 4.5:1.
- **Flashing** *(product)*: the preview warns when a clip contains more than three flashes in one second (WCAG 2.3.1).
- **Autoplay:** the editor never plays media on load; muted autoplay of the canvas thumbnail is allowed, with a pause control within reach.
- **Audio:** the volume control has a numeric value and a mute toggle; waveforms are decorative.

## Motion, zoom and reflow

- `prefers-reduced-motion: reduce` removes every transition and slide. No animation is required to understand state.
- Text resizes to 200% without loss; the inspector reflows to a single column and the timeline scrolls horizontally rather than shrinking tracks below 40px.
- Under `forced-colors: active`, borders and focus rings use system colours; clips keep their icons and labels so kind survives without colour.

## Known deviations and trade-offs

- Inputs, selects and segmented controls carry a visible 1px `border-control` edge. The reference screens draw fields as borderless fills; a fill alone is about 1.2:1 against the panel and fails 3:1 for a component boundary.
- Clip fills are the same in both themes, which keeps tracks recognisable across themes. Their boundary on `bg-timeline` comes from `clip-edge-*`, not from the fill (yellow on the light timeline is only 1.3:1 by itself).
- `ruler` text is 11px, below the 12px floor everywhere else. It repeats the timecode, so nothing depends on it, and it stays at 4.5:1.
- Hanken Grotesk is used instead of the reference screens' commercial typeface, so type metrics are close but not identical.

## Test before you ship

1. Tab through the screen with no mouse; confirm order, visible focus and that nothing is skipped.
2. Operate every tool, clip and the timeline with the keyboard only.
3. Run VoiceOver or NVDA over the inspector and timeline; confirm names, groups and live announcements.
4. Check both themes with a contrast tool, including text on the canvas.
5. Simulate deuteranopia and protanopia; confirm every clip kind and status is still identifiable.
6. Zoom to 200%, enable reduced motion, enable forced colours.
