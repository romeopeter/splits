Spits is a desktop video editor for creators: a dark-first workspace where footage is the brightest thing on screen, one blue accent marks the action, and five track colours tell the kinds of clip apart. Build every Spits screen from these rules.

## Content fundamentals

- Write in sentence case. Panel titles are one word (Typography, Captions). Buttons are verbs of one or two words: Export, Split, Add track, Fit timeline, Delete clip.
- Address the person as "you" only in help and empty states; commands and labels carry no pronoun. No exclamation marks, no emoji, no jargon the creator did not choose.
- Name the object when a verb is ambiguous: "Lock Track 2", "Delete clip", not "Lock" or "Delete".
- Say what happened, then what to do: "Export failed. Check your connection and try again." Empty state: "Drop a clip here, or choose Add media."
- Show time as `hh:mm:ss` in the `timecode` style, units in lower case (`12 px`, `60%`, `1x`), ellipsis as one character (…).
- Collaboration messages are short and factual: "Amara joined." "Tunde is editing Track 3."

## Visual foundations

**Themes.** Ship both. Dark is the default because footage reads best on a dark workspace; light carries the same roles. Switch with `data-theme="dark"` or `data-theme="light"` on a common ancestor. Overlays that sit on footage (`canvas-selection`, `canvas-handle`, `caption-bg`) and the clip fills are identical in both themes.

**Surfaces.** Stack from back to front: `bg-app` (window), `bg-canvas` (behind the video), `bg-panel` (inspector, transport, track headers), `bg-raised` (menus, dialogs), `bg-timeline` (tracks). Fields use `bg-field` with a 1px `border-control` edge; hover is `bg-field-hover`. Panels float on `bg-canvas` with `shadow-panel`; do not draw a border around them.

**Colour.** One accent: `accent` fills the primary action (Export), slider fill and toggled tools; `text-link` is the same blue as text or icon. Use the track colours only for clips and their matching timeline marks: shape `clip-shape`, text `clip-text`, subtitles `clip-caption`, video `clip-video`, audio `clip-audio`; each takes its `clip-edge-*` outline. Collaborators take `collab-1` to `collab-4`. Status colours (`status-success`, `status-warning`, `status-danger`, `status-info`) always sit beside an icon and a word. Never use a track colour for status or a status colour for a clip.

**Typography.** Set everything in Hanken Grotesk through the named styles: `display-lg` and `display-md` for launch and export screens, `heading` for dialog titles, `title` for panel titles, `body` for values and menu items, `body-strong` for emphasis, `label` for inspector row labels, `button` for buttons, `caption` for text under fields, `clip-name` for clip and track names, `timecode` for time (tabular figures), `ruler` for ruler ticks only. Do not use weights below 400 or sizes below 12px except `ruler`.

**Spacing and layout.** Use the 4px scale: `space-4` between icon buttons, `space-8` between a control and its caption, `space-12` between rows, `space-16` for panel padding and region gaps, `space-24` around dialogs. Fixed sizes: tool rail `size-rail` (56), inspector `size-panel` (320), track row `size-track-row` (40), track header `size-track-header` (180), ruler `size-ruler` (28), clip `size-clip` (32). Controls are `size-control-md` (36) by default, `size-control-sm` (28) in dense rows and `size-control-lg` (44) for the rail and play button. Never go below `size-hit-min` (24).

**Corners.** `radius-xs` (4) handles and tooltips, `radius-sm` (6) clips and swatches, `radius-md` (8) buttons and fields, `radius-lg` (12) panels and menus, `radius-xl` (16) dialogs and the canvas frame, `radius-pill` for avatars, cursor labels and the zoom track.

**Elevation.** `shadow-panel` for the inspector, `shadow-md` for menus and selects, `shadow-lg` for dialogs, `shadow-sm` for the selected segment and slider thumb, `shadow-clip-selected` for a selected clip. Dark shadows carry a 1px light edge because black shadows vanish on near-black.

**States.** Hover lifts a surface to `bg-field-hover` or washes it with `bg-hover`. Pressed darkens `accent` to `accent-pressed`. Toggled tools take `accent-soft` with a 1px `selection` ring. Disabled controls drop to `opacity-disabled`. Focus is always `shadow-focus` on `:focus-visible`: a 2px surface-coloured gap and a 2px `focus-ring`.

**Motion.** Colour and background changes take 120ms ease. Panels slide 200ms ease-out. Nothing bounces or loops, and the video is the only thing that moves on its own. Under `prefers-reduced-motion`, drop every transition and slide to an instant change.

**Imagery.** The canvas shows the user's footage. Placeholder frames in previews are flat dark gradients, never stock photos. Burn subtitles onto `caption-bg` with `caption-text`.

## Iconography

Use the Spits icon set (Icons group) through `Icon`: 24px grid, 1.5px stroke, round caps and joins, outline only except the transport and grip glyphs. Default size is 20px; use 16px in clips and dense rows and 24px in the rail. Icons take `currentColor`: `text-secondary` at rest, `text-primary` on hover, `text-link` when toggled. Never use emoji or a second icon family. An icon alone needs an accessible name from its button.

## Logo

The Spits mark is an S sliced by a playhead: four pills slide apart at the cut, the left pieces in ink and the right pieces in blue, with the playhead running through the gap. The wordmark uses the sliced S as its first letter followed by "pits", with a blue square dot on the i. Use the `Logo` component in apps (it follows the theme) and the SVGs in Logos for files: `spits-wordmark-on-dark` and `-on-light`, `spits-mark-on-dark` and `-on-light`, `spits-app-icon`. Leave clear space of one playhead head on every side; minimum heights are 20px for the wordmark and 16px for the mark. Do not recolour the halves, remove the slide, outline it, or set the name in another face.

## Components

Compose screens from the system: Button, IconButton, ToolRail, Field, Select, SegmentedControl, ColorField, Slider, Avatar, CursorLabel, Panel, TransportBar, TrackHeader, Clip, TimelineRuler, SelectionBox, CaptionOverlay, Logo, Icon. The EditorWorkspace page shows them together; follow its region sizes. Read each component's README for what to provide and what not to do.

## Accessibility

Spits is designed to WCAG 2.2 AA in both themes: every token pair is measured, and the components carry focus, naming and keyboard behaviour. Read the Accessibility section before shipping a component, and the Editor patterns section for keyboard and timeline behaviour. Never convey state or kind by colour alone, never remove `shadow-focus`, and keep every canvas action available without a pointer.
