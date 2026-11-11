The control strip between the canvas and the timeline.

**Provide:** `playing`, `current` and `total` as `hh:mm:ss`, `speed`, `volume`, and handlers `onPlayPause`, `onSplit`, `onPrev`, `onNext`.

**Use:**
- Left group: playback speed and Split. Centre: jump to start, play or pause (44px), timecode, jump to end. Right: volume, zoom out, zoom slider, zoom in, Fit timeline.
- The timecode uses the `timecode` style with tabular figures so it never jitters.
- The play button swaps its icon and its label (Play, Pause), never only its colour.

**Accessibility:** a labelled `toolbar`; the timecode is a `timer` with a spoken name that includes the total. Do not announce every second; announce state changes (Playing, Paused) in the live region.
