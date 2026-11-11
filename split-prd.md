# 📑 Product Requirement Document & AI Blueprint
## Local-First Desktop Video Editor (CapCut Alternative)

**Product name:** Split (renamed from Splits on 2026-11-10). The design system shares the name: `split-design-system/` replaced `spits-design-system/` on 2026-11-11.

---

## 🎯 Architecture Summary
* **Desktop Shell:** Tauri v2 (Rust backend, WebView frontend).
* **UI Layer:** React (TypeScript), Vite, Tailwind CSS.
* **Design System:** [Split design system](split-design-system/README.md). It is the source of truth for every visual and interaction decision: tokens, type, components, icons, logo, accessibility and editor behaviour. See [§ Design System](#-design-system) below.
* **Media Engine:** Rust-native background processes executing native hardware-accelerated transcoding tasks (e.g., via `ffmpeg` CLI sidecars or native wraps).
* **Playback Renderer:** HTML5 `<canvas>` (WebGL/2D Context) inside React fed by local playback proxy frames.
* **Motion Renderer:** Lottie JSON rendered with lottie-web's light SVG build (no expression engine): live SVG above the video in preview, rasterised into transparent overlay frames for export, so preview and export use the same renderer.
* **AI Motion (optional, online):** The Claude API turns the transcript into Lottie motion clips, using the user's own API key. Requests are made from Rust; only transcript text and timings are sent. Every other feature works offline. See [Feature E](#feature-e-transcript-driven-motion-claude--lottie).
* **Data Layer:** Purely local. Timeline state managed as a unified JSON tree serialized locally and synchronized between React and Rust. Transcripts are stored per media asset with a stable ID for every word; captions and motion clips refer to word IDs, not to absolute times.

---

## 🧩 Design System
All UI is built from the Split design system in [`split-design-system/`](split-design-system/). Where this document and the design system disagree on look, layout sizes, copy or behaviour, the design system wins.

| What | Where |
| --- | --- |
| Rules for colour, type, spacing, corners, elevation, states, motion, icons, logo, copy | [README.md](split-design-system/README.md) |
| Design tokens (source) | [tokens.json](split-design-system/tokens.json) |
| Design tokens as CSS variables, dark and light themes, `@font-face` | [tokens.css](split-design-system/tokens.css) |
| Workspace anatomy, region sizes, selection, timeline, split, shortcuts | [editor-patterns.md](split-design-system/editor-patterns.md) |
| WCAG 2.2 AA requirements, focus, naming, keyboard | [accessibility.md](split-design-system/accessibility.md) |
| Components (each folder has a README and `preview.html`) | [components/](split-design-system/components/) |
| Component prop types | [components/index.d.ts](split-design-system/components/index.d.ts) |
| Assembled editor screen | [components/EditorWorkspace/](split-design-system/components/EditorWorkspace/) |
| Icons (24px grid, 1.5px stroke) | [icons/](split-design-system/icons/) |
| Logos and app icon | [logos/](split-design-system/logos/) |
| Hanken Grotesk webfonts | [fonts/](split-design-system/fonts/) |

**Implementation notes**
* Import `tokens.css` once at the app root and set `data-theme="dark"` (default) or `"light"` on the root element.
* Tailwind's theme must map to the token CSS variables (e.g. `colors.accent: 'var(--accent)'`, `spacing['16']: 'var(--space-16)'`). Do not use Tailwind's default palette, spacing or radii, and do not hard-code hex values.
* Rebuild the components listed in the design system README as React components in `src/components/ui/`, matching the props in `index.d.ts` and the behaviour in each component's README. Compose the screens in §1 from them rather than inventing new controls.
* Map timeline track types to clip tokens: text → `clip-text`, captions → `clip-caption`, video → `clip-video`, audio → `clip-audio`, shapes → `clip-shape`. Motion clips use `clip-shape` until the design system gets a motion kind (open decision in [AGENTS.md](AGENTS.md)).

---

## 🎨 1. UI/UX Interface Layout (4-Quadrant Workspace)
Region sizes, spacing and behaviour come from [editor-patterns.md](split-design-system/editor-patterns.md) and the [EditorWorkspace](split-design-system/components/EditorWorkspace/) reference screen.

> **As built (provisional, see Open decisions in AGENTS.md):** the workspace follows the design system: top bar, tool rail, inspector, canvas, transport, timeline. The media pool [A] is the **Media** panel in the rail; the rail holds Media, Clip, Audio, Captions and Motion, with Settings and Help at the bottom. Selecting a video clip opens Clip, in tabs: Edit (speed, transform, crop, commands) · Effects (fades) · Cutout (chroma key) · Audio. Selecting a clip on an audio track opens Audio: Audio · Edit. Timecode is `hh:mm:ss:ff`. `S` splits at the playhead and `B` is the blade tool. Up and Down jump between edit points; `Q` and `W` ripple trim. The planned layout for the next features is under "Inspector roadmap" below.

The app must render a fixed, non-scrolling desktop workspace divided into a **4-Quadrant Grid**:

```
+-------------------------------------------------------------------------+
| [A] MEDIA POOL & ASSETS      | [B] PLAYER PREVIEW                       |
| - Import Button (Drag & Drop)| - 16:9 / 9:16 Responsive Canvas          |
| - Video/Audio Asset Cards    | - Play/Pause, Frame Forward/Backward     |
| - Text/Caption tab           | - Timecode display (00:00:00:00)         |
+------------------------------+------------------------------------------+
| [C] TIMELINE TRACKS                                   | [D] INSPECTOR   |
| - Playhead line tracking time                         | - Transform panel|
| - Track 0: Motion (Lottie clips from the transcript)  | - Motion panel   |
| - Track 1: Text / Captions                            | - Chroma Key     |
| - Track 2: Video Clips (with visual thumbnails)       |   (Color picker) |
| - Track 3: Audio Clips (with waveform peaks)          | - Export button  |
+-------------------------------------------------------------------------+
```

### Key UI Interactions:
* **Timeline Scrubbing:** Clicking or dragging the Playhead updates the frame shown in Quadrant B instantly.
* **Clip Manipulation:** Clips in Quadrant C can be dragged left/right, snapped together, or shortened/lengthened by dragging their edges.
* **Blade/Split Tool:** Pressing `B` changes the cursor to a razor, clicking a clip splits it into two distinct JSON entities at that exact frame timestamp.

---

## ⚙️ 2. Core Functional Requirements (Non-AI Implementation)

### Feature A: Media Ingestion & Automatic Proxy Engine
* **Requirement:** Large raw video clips (like 4K footage) cannot be processed directly in the WebView layer. 
* **Workflow:**
  1. When a user imports an asset, the Rust backend registers its original absolute file path.
  2. Rust spins up an offline background pipeline using FFmpeg to quickly transcode a lightweight **Proxy File** (`720p, H.264, low-bitrate`) into the app's local cache directory (`tauri::path::BaseDirectory::AppData`).
  3. The React timeline relies exclusively on these fast proxy files for scrubbing and playback. The original high-resolution footage is untouched until final rendering.

### Feature B: Fast Offline Caption Generator (No Cloud API)
* **Requirement:** One-click automated subtitle generation without external API dependencies.
* **Workflow:**
  1. User clicks "Generate Captions" in the UI.
  2. The Rust backend extracts the audio profile of the active video layer to a lightweight, mono 16kHz WAV file locally. The user never handles an audio file (no MP4 → MP3 step).
  3. The app invokes native bindings for `whisper.cpp` bundled with the ultra-lightweight `tiny.en` model (~75MB). This executes deterministic C/C++ matrix math fully offline on the host machine.
  4. Whisper returns **word-level** timestamps. Rust stores them as the asset's transcript, in source-media time, with a stable ID per word: `[{id: "w_0001", text: "Hello", start: 1200, end: 2000}]` (in milliseconds). Captions are grouped from words into segments (phrases of a few seconds).
  5. The React state instantly populates the Text Track layer with matching caption blocks.
  6. The Captions panel shows the transcript as editable text. Correcting a word keeps its ID and timing, so motion built on it stays in sync.
* **Accuracy:** Motion (Feature E) is only as good as the word timings. `tiny.en` is the bundled default; `base.en` and `small.en` are optional, user-initiated downloads for better accuracy.

### Feature C: GPU Chroma Key / Green Screen Engine
* **Requirement:** Real-time extraction of any solid color background via the Inspector panel.
* **Workflow:**
  1. The user selects a background color using an eye-dropper color picker tool in Quadrant D.
  2. The selected RGB hex code is pushed directly down to the rendering context of Quadrant B's canvas.
  3. A custom WebGL fragment shader evaluates every pixel: if a pixel's color falls within a specific mathematical threshold (Euler distance calculated within the **HSV/YCbCr color space**), its alpha channel is dropped to `0.0` (transparent), instantly revealing the layers underneath.

### Feature C2: Core Clip and Track Edits
* **Requirement:** The everyday edits of a basic editor, on audio and video, all offline and all matched between preview and export.
* **Clips (Clip and Audio panels):**
  * Speed from 0.25x to 4x, with pitch kept. The source range stays the same; the clip's timeline length changes, and later clips on its track move with its end.
  * Rotation (any angle), horizontal and vertical flip, and crop on each edge.
  * Picture fade in and out, and sound fade in and out, measured from the clip's ends.
  * Mute a clip without losing its volume setting.
  * Detach audio: the video clip's sound becomes its own clip on an audio track, and the video clip is muted. Captions follow the clip whose sound plays.
* **Timeline:**
  * Ripple delete (Shift+Delete), ripple trim to the playhead (`Q` start, `W` end, on the selected clip) and close gaps act on one track. Captions and motion follow.
  * Up and Down jump the playhead to the previous or next edit point (any clip edge on a visible track).
* **Tracks:** mute (hidden tracks are neither seen nor heard; muted tracks are seen but not heard), and reorder within their kind by the grip or Alt+Up/Down.
* **Not yet:** colour adjustments, freeze frame, transitions, reverse, loudness normalisation and noise reduction.
* See `learn/12-core-clip-edits.md`.

### Inspector roadmap (planned, not built)
UX is first class (AGENTS.md rule 12). Decided 2026-11-11.

* **Rail = things you add:** Media · Clip · Text · Emoji · Audio · Voice · Captions · Motion. Settings and Help sit at the bottom.
* **Selection = properties, in tabs.** Selecting something opens the panel for its kind:

| Selected | Panel | Tabs |
| --- | --- | --- |
| Video or image clip | Clip | Edit (speed, transform, crop, Blend for overlays) · Adjust · Effects · Cutout · Audio |
| Audio clip | Audio | Audio · Edit |
| Voice-over clip | Voice | Voice · Audio · Edit |
| Text clip | Text | Text · Effects · Edit |
| Emoji clip | Emoji | Emoji · Effects · Edit |

* **Adjust:** Light · Colour (white balance) · HSL · Curves · Wheels · Looks, plus Compare (before and after) and Apply to all clips. All of these are colour-only, so they bake into one 3D LUT per clip. The WebGL preview samples it, and export runs it through FFmpeg `lut3d`.
* **Effects (video effects):**
  * Fade (moved from Clip).
  * Animation: in and out presets. It is named so to keep it apart from AI Motion.
  * Styles: blur, sharpen, vignette, grain.
  * Outline.
* **Overlay:** "Add as overlay" in Media puts video or images on a track above the main one. Blend modes (Normal, Multiply, Screen, Add) are in Edit.
* **Cutout:** chroma key (moved from Clip). Later, on-device Remove background, with a model the person chooses to download.
* **Audio:** volume, mute, fades, detach, plus Enhance voice, Reduce noise, Normalise loudness and EQ presets. These are rendered once by FFmpeg into a derived file that both preview and export play.
* **Voice:** record a voice-over at the playhead from a chosen microphone. Recording is done in Rust and saved into the project folder. It has a level meter and a countdown, and recordings can be transcribed for captions.
* **Text and Emoji:** clips drawn by the overlay renderer, so preview equals export. Bundled fonts and a bundled emoji set make them look the same on every OS.

**Phases:**
1. Edit shortcuts (done).
2. Inspector restructure and Phosphor icons (done).
3. Text and Emoji.
4. Audio and Voice.
5. Adjust.
6. Effects.
7. Overlay.
8. Background removal.

Each phase states its UX acceptance criteria and adds its `learn/` note.

### Feature D: Final Export Compilation
* **Requirement:** Stitching all edits together into an optimized standalone `.mp4` file.
* **Workflow:**
  1. User clicks "Export Video".
  2. The frontend serializes the entire layout into a clean multi-track JSON schema and fires it down to the Rust backend.
  3. Rust reads the *original high-res source paths*, maps out explicit FFmpeg command arguments (concatenating slices, overlaying text tracks at precise millisecond markers, applying chroma-key filters), and handles the rendering pipeline natively.
  4. Motion clips are rendered frame by frame by the same Lottie renderer used in preview, at the export resolution and frame rate. Frames go to Rust and into FFmpeg as a transparent layer over the video at each clip's timeline position. What the user sees in preview is what they export.
  5. A native progress bar stream reflects completion status back to the UI. Export can be cancelled.
* **Export targets:**
  * **Video (default):** a single `.mp4` with the motion layer included.
  * **Motion only:** the motion track as a transparent video (ProRes 4444 `.mov`), for creators who finish in another editor.
  * **Lottie:** each motion clip's `.json`, for reuse in other tools.

### Feature E: Transcript-Driven Motion (Claude → Lottie)
* **Scope:** Version 1.
* **Requirement:** Turn the transcript into animated motion graphics (kinetic captions, word emphasis, callouts) inside Split. This replaces the round trip creators use today: convert MP4 to MP3, transcribe in a chatbot, paste timings and a prompt into a design tool, render an MP4, import it into the editor.
* **Connecting Claude:**
  * Settings → Claude: the user pastes their own Anthropic API key, then chooses Test connection. Disconnect deletes the key.
  * Rust stores the key in the OS keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service, e.g. via the `keyring` crate). It never reaches the WebView, project files, logs or crash reports.
  * Without a key, the Motion panel says so and links to Settings. Everything else works.
* **What leaves the machine:** transcript text and word timings for the segments being animated, the canvas size and frame rate, the user's style prompt, and Split's fixed system prompt. Never audio, video, frames or file paths. The Motion panel says this before the first generation.
* **Workflow:**
  1. The user selects caption segments (or all) and opens the Motion panel. They type a style prompt, e.g. "bold pop-in words, numbers highlighted in yellow", or pick a saved style.
  2. Rust builds a request for a batch of segments. The system prompt holds the Lottie rules, the available fonts and the output contract, and is the same on every request so it can be cached. The user message holds the style prompt, the canvas `w`/`h`, the frame rate `fr`, and each segment with its word IDs and word timings in frames relative to the segment start.
  3. Claude returns one Lottie animation per segment. Each animation is exactly the segment's length and has one marker per word, named by its word ID.
  4. Rust validates every animation (see *Validation*). If it fails, Rust sends one repair request with the validator's errors. If that fails too, the segment is marked "Motion failed" with a Retry action.
  5. Valid animations are saved in the project folder as `motion/<clip-id>.json`. Each one becomes a motion clip on the Motion track, anchored to its first and last word IDs.
  6. The preview renders motion clips over the video, in sync with the playhead.
  7. The user can regenerate one clip with an edited prompt, delete it, hide it, or nudge it in time. Editing the Lottie by hand is not part of version 1.
* **Staying in sync with edits:**
  * A motion clip's timeline position comes from its anchor words. When footage moves or ripples, the motion moves with it.
  * If a cut removes or retimes words inside a motion clip, its word markers no longer match. The clip is marked "Out of sync" (with an icon and the words, not colour alone) and offers Regenerate for that clip only.
* **Validation (generated Lottie is untrusted input):**
  * It must parse as JSON and match Split's supported Lottie subset.
  * `w`, `h` and `fr` must match the project, and `op − ip` must equal the segment length in frames.
  * Every word ID must have a marker.
  * Fonts must be bundled with Split (Hanken Grotesk to start).
  * **Reject expressions** (the `x` fields that hold JavaScript) and any external or embedded image assets. Use a renderer build with expression support removed.
  * Enforce limits on file size, layer count and keyframe count.
* **Claude API call (raw HTTPS from Rust; there is no official Rust SDK):**
  * `POST https://api.anthropic.com/v1/messages` with **streaming (SSE)**, since Lottie output is long. Use a high `max_tokens` (around 64000). The Motion panel has a Cancel button that aborts the stream.
  * The default model is `claude-opus-5-5`, selectable in Settings. Use adaptive thinking (`thinking: {type: "adaptive"}`) and set `output_config.effort` explicitly, because the default on Opus 5.5 is `medium`. Tune the effort level on real transcripts.
  * Output: JSON requested in the prompt, as an envelope `{"animations": [{"segmentId", "lottie"}]}`, validated locally. Strict structured outputs were not used: they require `additionalProperties: false` throughout, and Lottie is a large free-form tree.
  * Do not use assistant prefill, `temperature`/`top_p`/`top_k` or forced `tool_choice`. Current models reject all of them.
  * Check `stop_reason` before reading content. On `max_tokens`, split the batch smaller and retry. On `refusal`, show a plain message. Enable the server-side refusal fallback (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`).
  * Put `cache_control` on the system prompt so repeat batches reuse it.
  * Errors:
    * 401: "Claude key rejected. Check it in Settings."
    * 429: retry after the `retry-after` delay.
    * No network: "Motion needs an internet connection."
  * Record token usage per generation and show the last generation's usage in the Motion panel.

---

## 🛠️ 3. Complete Master Prompt for Your AI Agent

```text
Act as an expert Software Engineer specializing in cross-platform Tauri desktop applications, Rust, and React/TypeScript. Build a local-first desktop video editor alternative to CapCut that runs on Windows, macOS, and Linux. Every feature works offline except transcript-driven motion (Feature E), which calls the Claude API with the user's own key.

### 🛠️ Architecture & Tech Stack
1. Desktop Core: Tauri v2 (Rust backend, webview frontend).
2. Frontend UI: React, TypeScript, Vite, Tailwind CSS.
3. Cross-Platform Video Engine: Native HTML5 Canvas element inside the React app, driven by high-speed frame extraction from the Rust backend via system-native video handling pipelines (using ffmpeg wrappers or native WebCodecs).
4. Audio Visualizer: Web Audio API on the frontend parsing PCM buffers sent from Rust.
5. Transcription: whisper.cpp with word-level timestamps, bundled `tiny.en` model.
6. Motion: Lottie JSON rendered by lottie-web's light SVG build (no expressions): live SVG in preview, rasterised with embedded fonts into the export overlay frames.
7. Claude API: HTTPS + SSE streaming from Rust (e.g. `reqwest`). The API key lives in the OS keychain (e.g. `keyring`).

### 🎨 Design System (read before writing any UI)
The visual design is fully specified in `split-design-system/`. Read `README.md`, `editor-patterns.md`, `accessibility.md`, `components/index.d.ts` and each `components/*/README.md` before writing UI code. Import `tokens.css`, map Tailwind's theme to its CSS variables, rebuild the listed components in `src/components/ui/`, and build every screen from them. The design system overrides this prompt on anything visual.

### 📂 Directory Structure to Generate
Please initialize the following directory layout with full file contents:
├── src-tauri/
│   ├── src/
│   │   ├── main.rs          # Tauri command registration & window lifecycle
│   │   ├── engine/          # Video/Audio processing pipeline
│   │   │   ├── mod.rs       # Module exporter
│   │   │   ├── parser.rs    # Reads local media properties (resolution, fps, length)
│   │   │   ├── proxy.rs     # Generates 720p H.264 offline editing cache files
│   │   │   ├── transcribe.rs # Audio extraction + whisper.cpp word-level transcripts
│   │   │   └── exporter.rs  # Compiles final edit by generating native FFmpeg script commands
│   │   ├── ai/
│   │   │   ├── mod.rs
│   │   │   ├── claude.rs    # Messages API client: streaming, errors, cancellation
│   │   │   └── motion.rs    # Prompt building, Lottie validation, repair retry
│   │   ├── secrets.rs       # API key in the OS keychain
│   │   └── state/
│   │       ├── mod.rs
│   │       └── timeline.rs  # Rust representations of multi-track timeline JSON data schemas
│   ├── Cargo.toml           # Multi-platform dependency layout (tauri, serde, tokio)
│   └── tauri.conf.json      # Cross-platform security permissions & window setups
└── src/                     # React / TypeScript Application
    ├── main.tsx             # App mounting
    ├── App.tsx              # 4-Quadrant UI Dashboard layout
    ├── index.css            # Tailwind injections + import of split-design-system/tokens.css
    ├── components/
    │   ├── ui/              # Split design system components (Button, Clip, TransportBar, …)
    │   ├── motion/          # Motion panel, Lottie layer for preview and export frames
    │   └── …                # MediaPool, PreviewPlayer, Timeline, Inspector (composed from ui/)
    ├── hooks/               # useTimelineState, useNativeEvents
    └── types/               # Timeline and Clip Type Definitions

### ⚙️ Strict Implementation Rules for the AI Agent
- Webview Decoupling: Never attempt to render massive raw 4K source videos inside the webview. Always process media inside Rust background threads, sending lightweight local cache paths or frame streams down to the React layer.
- Cross-Platform System Compatibility: Keep code fully compatible with Windows (MSVC), macOS (Apple Silicon/Intel), and standard Linux. Avoid rigid hardcoded directory paths. Use Tauri's native app data directory APIs (`tauri::path::BaseDirectory::AppData`) to write proxy media cache files safely across file systems.
- Design System Fidelity: Use only design-system tokens for colour, spacing, radius, shadow, type and z-index (no raw hex or Tailwind defaults). Use only the Split icon set. Keep `shadow-focus` on every focusable control and meet the WCAG 2.2 AA rules in `accessibility.md`.
- Network Boundary: Only `src-tauri/src/ai/` may make network calls, and only to the Claude API. Send transcript text and timings only, never media, frames or file paths. The WebView never sees the API key.
- Generated Lottie Is Untrusted: Validate every Claude response before it is saved or rendered, as Feature E describes. Never render Lottie expressions.
- Word-Anchored Timing: Captions and motion clips refer to transcript word IDs. Their timeline positions are derived from those words, so edits to the footage move them correctly.
- Canvas-Based Playback: Implement a high-refresh HTML5 `<canvas>` wrapper inside the React PreviewPlayer component. The canvas must read either local proxy streams or frame buffers synchronized with the global timeline playhead timecode position.

Generate the initial base project structures, complete configurations, state definitions, and functional UI wrappers now.
```
