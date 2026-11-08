# Editor patterns

How the Spits workspace is assembled and how its parts behave together. The EditorWorkspace page shows the result.

## Anatomy

| Region | Size | Built from |
| --- | --- | --- |
| Top bar | 56px high | IconButton, Logo (mark), Select or zoom value, AvatarStack, Button (Export) |
| Tool rail | 56px wide | ToolRail with ToolRailItem |
| Inspector | 320px wide | Panel with PanelSection and PanelRow |
| Canvas | fills the rest | `bg-canvas`, a 16:9 frame at `radius-xl`, SelectionBox, CursorLabel, CaptionOverlay |
| Transport | 56px high | TransportBar |
| Timeline | ruler 28px, tracks 40px each | TrackHeader (180px), TimelineRuler, TrackLane, Clip, Playhead |

Regions sit `space-16` apart. The inspector floats over `bg-app` with `shadow-panel`; the timeline and transport share one ground, so they read as a single control surface.

## Selection

- One selected object at a time on the canvas shows a SelectionBox; clicking a clip in the timeline selects the same object in both places.
- Selecting a clip opens its panel in the inspector (Typography for a text clip, Captions for subtitles) and keeps the rail item for that tool `active`.
- Deselect with Escape or by clicking empty canvas.

## Timeline behaviour

- Time runs left to right; the ruler labels every 5 seconds and switches to minutes at 60. Zoom is pixels per second: 15.6 at the default fit, from 2 to 120.
- The playhead stays at 2px and always draws above clips (`z-playhead`). Clicking the ruler or pressing Left and Right moves it.
- Split cuts the selected clip at the playhead; the two halves keep their kind, edge and label and offset by one frame so both can be selected. This is the product's signature move, and the logo draws it.
- A locked track dims its clips to `opacity-disabled`, refuses edits and keeps its icon as a closed shackle.
- Tracks stack in z-order from top to bottom: shapes and text above subtitles, subtitles above video, video above audio. Reordering is by the grip handle or Alt+Arrow.

## Collaboration

- Each person gets one `collab-*` colour for the session, used on their avatar and cursor tag.
- Remote cursors fade after 4 seconds of stillness; remote selections draw the person's colour as a 1.5px outline with their name tag.
- Presence changes are announced in the live region ("Amara joined").

## Recommended shortcuts

Shortcuts are defaults the product can remap; single-character keys can be turned off (WCAG 2.1.4).

| Action | Shortcut |
| --- | --- |
| Play or pause | Space |
| Split at playhead | S |
| Step one frame back or forward | Left or Right |
| Step one second | Shift + Left or Right |
| Jump to start or end | Home or End |
| Trim start or end to playhead | [ or ] |
| Delete selected clip | Delete or Backspace |
| Duplicate | Ctrl or Cmd + D |
| Undo or redo | Ctrl or Cmd + Z, Shift + Z |
| Zoom timeline in or out | + or − |
| Fit timeline | Shift + 0 |
| Nudge canvas object | Arrow keys (1px), Shift + Arrow (10px) |

## Responsive notes

- Below 1100px wide, collapse the inspector to an overlay opened from the rail; keep the transport and timeline in place.
- Below 760px wide, switch to a single-column mobile layout: canvas, transport, then a timeline with 44px tracks; controls take `size-control-lg`.
