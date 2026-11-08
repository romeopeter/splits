The outline and handles around the selected object on the video canvas.

**Provide:** `x`, `y`, `width`, `height` in px inside a positioned canvas; children are the object.

**Use:** the outline is `canvas-selection`, handles are 10px `canvas-handle` discs with a 1px `canvas-handle-edge` ring so they read on bright and dark frames. These tokens are the same in both themes because they sit on footage, not on the UI.

**Accessibility:** handles are decorative for assistive tech. Every canvas move, resize and rotate must also be available as numbers in the inspector (Position, Size, Rotation) and by Arrow keys (1px, Shift 10px) on the focused object.
