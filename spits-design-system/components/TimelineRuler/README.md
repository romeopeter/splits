The scrubbable ruler and the playhead. The preview assembles them with TrackHeader, TrackLane and Clip into the full timeline.

**Provide:** `seconds` (length), `pxPerSecond` (zoom, default 15.6), `labelEvery` (default 5), `time` and `onSeek`. Render `Playhead` with `x = time * pxPerSecond` inside a `position: relative` wrapper.

**Use:**
- Ruler height is `size-ruler` (28px); labels use `ruler` (11px) in `text-muted`; ticks every second, taller every fifth.
- The playhead line is 2px in the `playhead` token (3:1 on `bg-timeline`) with a 14px head.
- Labels switch to minutes at 60 seconds (0s, 05 … 55, 1m, 05).

**Accessibility:** the ruler is a `slider` named "Timeline position" with the time as `aria-valuetext`; Left and Right move one second, Shift moves five, Home and End jump.
