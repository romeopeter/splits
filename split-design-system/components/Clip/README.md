A block on a track: shape, text, subtitles, video and audio.

**Provide:** `kind` (`shape` | `text` | `caption` | `video` | `audio`), `label`, `left` and `width` in px (the clip is absolutely positioned inside a `TrackLane`), `selected`; `thumbnails` (image URLs) for video; `seed` to vary an audio waveform.

**Use:**
- Fill and edge come from `clip-<kind>` and `clip-edge-<kind>`. Fills are the same in both themes; the edge carries the 3:1 boundary on `bg-timeline`.
- Labels use `clip-name` in `on-clip` ink (`text-on-accent` on subtitles). Every kind also has its own icon, so kind is never told by colour alone.
- Selected clips gain a 2px `shadow-clip-selected` outline and trim handles; trimming by keyboard is documented in Editor patterns.

**Accessibility:** a toggle button named "<Kind> clip, <label>"; add start and end times to `aria-label` in the app.
