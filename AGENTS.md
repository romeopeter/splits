# AGENTS.md

Context for AI coding agents working in this repository. Read this file first, then the documents it points to. Keep it current: when a decision in "Open decisions" is settled or a convention changes, update this file in the same change.

## What this project is

An AI-first desktop video editor for creators: AI makes the captions (offline, with whisper.cpp) and the motion graphics (Claude, from the transcript). It runs on Windows, macOS and Linux. Raw footage never leaves the machine, and every feature works offline except one: transcript-driven motion.

The signature workflow replaces a four-tool round trip (MP4 → MP3, transcribe in a chatbot, paste timings into a design tool, render and re-import):

1. Import a video.
2. Split transcribes it locally with word-level timings.
3. Claude, using the user's own API key, turns the transcript and a style prompt into Lottie motion clips.
4. The clips sit on a Motion track, stay in sync with edits, and export with the video. This is in version 1. See Feature E in the spec.

- Product name: **Split** (renamed from Splits on 2026-11-10). The design system in `split-design-system/` carries the same name (logo: an S sliced by a playhead).
- Status: version 1 in development. The app runs (`npm run tauri dev`) with import, proxies, timeline editing, captions, Claude motion and export. See README.md for setup and `learn/` for how each part works.

## Sources of truth

| Topic | File | Precedence |
| --- | --- | --- |
| Product scope, features, architecture, agent build prompt | [split-prd.md](split-prd.md) | Wins on behaviour and architecture |
| Look, layout sizes, copy, components, icons, accessibility, editor behaviour | [split-design-system/README.md](split-design-system/README.md) | Wins on anything visual or interactive |
| Workspace anatomy, timeline, selection, shortcuts | [split-design-system/editor-patterns.md](split-design-system/editor-patterns.md) | Part of the design system |
| WCAG 2.2 AA rules | [split-design-system/accessibility.md](split-design-system/accessibility.md) | Part of the design system |
| Tokens | [split-design-system/tokens.json](split-design-system/tokens.json), [tokens.css](split-design-system/tokens.css) | Part of the design system |
| Component props | [split-design-system/components/index.d.ts](split-design-system/components/index.d.ts) and each `components/*/README.md` | Part of the design system |
| Engineering learning notes | [learn/](learn/) | Explains decisions; never overrides the two above |

Not sources of truth:
- `considerations.md` is git-ignored notes from a different, static-editor version of the project. Do not use it to make decisions.

## Stack

| Layer | Choice |
| --- | --- |
| Desktop shell | Tauri v2 (Rust backend, WebView frontend) |
| UI | React + TypeScript, Vite, Tailwind CSS with its theme mapped to design-system tokens |
| Media engine | Rust background tasks driving FFmpeg (sidecar binary or bindings) |
| Playback | HTML5 `<canvas>` (WebGL) fed by 720p proxy files or frames |
| Captions | `whisper.cpp` with word-level timestamps, `tiny.en` bundled, larger models as optional downloads |
| Motion | Lottie JSON through lottie-web's light SVG build (no expression engine): live SVG in preview, rasterised into PNG overlay frames for export |
| AI motion | Claude Messages API over HTTPS + SSE from Rust (no official Rust SDK); default model `claude-opus-5-5`; key in the OS keychain |
| Chroma key | WebGL fragment shader in preview; equivalent FFmpeg filter on export |
| State | One JSON timeline tree, serialised locally and shared between React and Rust. Transcripts are per asset, with stable word IDs |

## Planned repo layout

```
src-tauri/            Rust: commands, engine (parser, proxy, transcribe, exporter), ai (Claude client, motion validation), secrets, timeline state
src/                  React app
  components/ui/      Split design-system components rebuilt in React, plus Tabs and the Phosphor icon table
  components/inspector/  The rail's panels; clip/ holds the Clip and Audio panels' shared tabs
  components/motion/  Motion panel, Lottie layer
  components/         MediaPool, PreviewPlayer, Timeline, Inspector (composed from ui/)
  hooks/  types/
split-design-system/  Design system (reference; do not edit to fit code, change code to fit it)
learn/                Engineering learning notes (see below)
.claude-skills/       Skill files for agents (see below)
```

## Non-negotiable rules

1. **Local-first.** No telemetry, and no network calls except two kinds:
   - AI motion requests to the Claude API, made only from `src-tauri/src/ai/` and only with the user's connected key.
   - User-initiated model downloads.

   Requests send transcript text, word timings, canvas size, frame rate and the style prompt. They never send audio, video, frames or file paths. Every other feature must work with no network.
2. **Keep heavy media out of the WebView.** Rust handles decoding, proxies, audio extraction and export. React gets cache paths, frames or PCM buffers, never raw 4K sources.
3. **Originals stay untouched.** Editing and playback use proxies; only export reads the original high-res paths.
4. **Cross-platform paths.** Use Tauri path APIs (`BaseDirectory::AppData` and similar). No hard-coded or OS-specific paths.
5. **Design-system fidelity.** Use only token variables for colour, spacing, radius, shadow, type and z-index. No raw hex values and no Tailwind default palette. Use only one icon family: Phosphor, through `Icon` and its name table in `src/components/ui/Icon.tsx` (settled 2026-11-11). Never remove `shadow-focus`. Never convey state or clip kind by colour alone.
6. **Accessibility.** Every canvas and timeline action has a keyboard path, per `accessibility.md` and `editor-patterns.md`.
7. **Time is integer and frame-accurate.** Store time in integer units (ms or frames at a known rate), never floats in seconds, so splits and exports land on exact frames.
8. **Word-anchored timing.** Captions and motion clips refer to transcript word IDs, and their positions are derived from those words. Editing a word's text keeps its ID and timing.
9. **The API key is a secret.** It lives in the OS keychain, is read only by Rust, and never reaches the WebView, project files, logs or crash reports.
10. **Generated Lottie is untrusted input.** Validate every response before saving or rendering it: subset schema, project `w`/`h`/`fr`, segment length, one marker per word ID, bundled fonts only, size limits. Reject expressions and external or embedded image assets. Never render Lottie expressions.
11. **Preview equals export.** Motion is rendered by one renderer for both. Do not build a second path, such as FFmpeg text filters, that can drift from the preview.
12. **UX is first class.** A feature is not done until its experience is: the flow, every state, keyboard access and copy. Follow "UX standards" below. The design system still wins on anything visual.

## UX standards

Split is for creators, not editors by trade. Treat each of these as a requirement, the same as a failing test.

- **Design from the task.** Write the user's flow before the code, and give the common case the fewest steps. Prefer presets that look good over a wall of sliders; sliders refine a preset.
- **One home per control.** The tool rail is for things you add (Media, Text, Emoji, Audio, Voice, Captions, Motion). Selecting something opens its inspector, with tabs for its properties (a clip: Edit, Adjust, Effects, Cutout, Audio). A control lives in one place. When two panels need the same control, they render the same component.
- **Design every state.**
  - Empty states teach the next step.
  - Anything over about 1 s shows progress and offers Cancel.
  - Errors say what happened, then what to do.
  - Disabled controls say why, in a hint or tooltip.
  - Results are announced in the live region.
- **Direct and immediate.** Changes preview live while dragging. A gesture is one undo step. Each section has a Reset. Never block reversible work with a confirmation dialog; make it undoable instead.
- **Non-destructive.** Every edit can be undone, and originals are never modified.
- **Keyboard parity.** Every pointer action has a keyboard path, and every shortcut is listed in the Help panel.
- **Fast enough to feel direct.**
  - Input gets a visible response within 100 ms.
  - Slider drags keep the preview at the project frame rate.
  - Background jobs never block the UI.
- **Verify in the running app**, not only in tests: real footage, both themes, at and below 1100 px wide, a keyboard-only pass and reduced motion.
- **State the acceptance criteria.** Every UI plan and pull request lists its UX acceptance criteria, and the person doing the work checks them.

## Agent skills

Skill files live in `.claude-skills/`. Claude Code's file-by-file loading guide is in [CLAUDE.md](CLAUDE.md). Load them as engineering constraints. Repo rules above and explicit user instructions take precedence.

- Rust, always load: `RUST/rust-core`, `RUST/rust-error-handling`, `RUST/rust-security`.
- Rust, load by task: `rust-async-tokio` for engine jobs, progress streams and cancellation; `rust-testing` for tests; `rust-performance` for proxy, playback and export speed; `rust-observability` for logging; `rust-project-conventions` for Cargo and CI; `rust-code-review` for reviews.
- Rust, mostly not applicable: `rust-api-web` (no HTTP server) and `rust-database` (Postgres-focused; local storage is files). Use them only if the architecture changes.
- React: `JS/REACT/SKILLS.md` when writing, refactoring or debugging components.
- Reviews: `JS/REVIEWS/SKILLS.md`.

## The `learn/` directory

`learn/` explains how this video editor is built, from a software-engineering standpoint. A reader should be able to learn video-editing concepts, the reasoning behind each implementation choice, and how it maps to the code, without reading the code first.

### Creating it

Create `learn/` as part of the first implementation task, if it does not exist yet. Start with:
- `learn/README.md`: what the folder is for, a reading order, and an index of every note with one line each.
- `learn/01-architecture-and-stack.md`: the overall architecture and why Tauri, Rust, React and FFmpeg were chosen.

### Updating it incrementally

- **Every change that introduces or alters a concept, subsystem or design decision updates `learn/` in the same change.** Code without its note is unfinished work.
- Add a new note when a new subsystem or concept appears. Edit the existing note when its subsystem changes. Update the index in `learn/README.md` either way.
- When a decision is reversed, keep the history: add a dated "Changed" entry giving the old approach, the new one and why. Do not silently rewrite the reasoning.
- Pure refactors, typo fixes and dependency bumps need no note unless they change how something works.

### Note format

File names are numbered in reading order: `NN-kebab-case-topic.md` (`01-architecture-and-stack.md`, `02-tauri-ipc.md`). Each note uses these sections:

1. **Concept**: what this is in video editing generally, with no project specifics.
2. **The problem here**: what this project needs from it and which constraints apply (offline, cross-platform, WebView limits).
3. **Approach**: what was built and how data flows. A small diagram helps.
4. **Why this way**: the reasoning and trade-offs, including alternatives considered and rejected.
5. **In the code**: links to the relevant files and the main types or functions.
6. **Pitfalls**: bugs hit, edge cases and things that look wrong but are deliberate.
7. **Further reading**: primary sources such as FFmpeg docs, the Tauri guide or the whisper.cpp README.
8. **Changed** (only when needed): dated entries for reversed decisions.

Write for a software engineer who is new to video editing. Explain terms such as codec, container, keyframe, GOP, proxy, timecode, frame rate and PTS the first time each appears, then link back to that explanation. Prefer concrete examples from this codebase over generic ones.

### Expected topics

Use these as a guide, not a fixed list. Add notes as the work reaches them:
architecture and stack · Tauri IPC and events · timeline data model (tracks, clips, time units) · media ingestion and probing · proxy pipeline · playback and canvas rendering · audio waveforms · split, trim and snapping · undo and redo · offline captions with whisper.cpp · transcripts and word-anchored timing · Lottie format and rendering · AI motion generation (prompting, streaming, validation, repair) · treating model output as untrusted input · API key storage in the OS keychain · chroma key shader · export pipeline (timeline JSON to FFmpeg filter graph) · progress and cancellation · design-system integration in React and Tailwind · inspector information architecture and UX standards · keyboard and accessibility · testing strategy · packaging and bundling binaries per OS.

## Open decisions

Ask the user before resolving any of these. Record the answer here and in the spec.

Provisional defaults (chosen 2026-11-08 to get version 1 running; awaiting the user's confirmation):

1. **Layout.** Follows the design system's workspace. Media import lives in a **Media** panel opened from the tool rail, not in a fourth quadrant.
2. **Timecode format.** `hh:mm:ss:ff` (frames), in the design system's `timecode` style, because frame-accurate editing needs the frame.
3. **Shortcuts beyond the design system.**
   - `S` splits at the playhead (design system), and `B` switches to the blade tool, which splits where you click (spec). `V` returns to the select tool.
   - Up and Down jump the playhead to the previous or next edit point.
   - `Q` and `W` ripple trim the selected clip's start or end to the playhead and close the gap.

   Up and Down keep their own meaning on sliders, radio groups, the canvas, a track grip, the inspector and dialogs.
4. **Collaboration.** Out of scope for version 1. Avatar, AvatarStack and CursorLabel are not ported.

Still open:

5. **Motion track colour.** The design system has no motion clip kind. Motion uses `clip-shape` for now. A dedicated `clip-motion` token, with its edge and contrast checks, would need adding to the design system.
6. **No-key fallback.** Without a Claude key, motion is unavailable. Built-in offline Lottie templates filled from the transcript could fill that gap later.
7. **Inspector tabs.** The design system has no Tabs component. `src/components/ui/Tabs.tsx` uses the SegmentedControl's look with `tablist`/`tab` semantics (automatic activation). A Tabs component in the design system would replace it.

Settled:

- 2026-11-08: AI motion is in version 1; users connect their own Anthropic API key; motion is Lottie JSON.
- 2026-11-08: Lottie renders with lottie-web's **light SVG build** in the WebView, live in preview and rasterised (fonts embedded) for export. The canvas renderer cannot draw font-based text. See `learn/08-rendering-lottie.md`.
- 2026-11-10: The product is named **Split** (was Splits): app name, bundle identifier `com.duowork.split`, crate `split`, env vars `SPLIT_*`, spec file `split-prd.md`.
- 2026-11-11: **Inspector layout.** The rail holds things you add: Media, Clip, Text, Emoji, Audio, Voice, Captions, Motion, with Settings and Help at the bottom. Selecting an item opens its panel, with tabs.
  - A video or image clip has Edit, Adjust, Effects, Cutout and Audio.
  - Overlay is "Add as overlay" in Media, plus Blend in Edit.
  - Video effects (Fade, Animation, Styles, Outline) are the Effects tab.

  The phased roadmap is in `split-prd.md` under "Inspector roadmap".
- 2026-11-11: **Icons are Phosphor** (`@phosphor-icons/react`, regular weight; transport glyphs filled), replacing the design system's icon set in every place, so the app keeps one icon family.
- 2026-11-11: **Muted-track icon** (was open decision 7) is Phosphor's speaker-slash (`volume-off`), replacing the struck-through volume icon.
- 2026-11-11: **Background removal** comes to Cutout in a later phase. It runs on the device, with a model the person chooses to download. Chroma key ships first.
- 2026-11-11: The design system is rebranded **Split** too. `split-design-system/` replaces `spits-design-system/`, and the wordmark reads "Split".

## Working conventions

- Commit only when asked. Branch off `main` first.
- Keep `split-prd.md`, this file and `learn/` consistent with the code. If they disagree, fix the docs or ask; do not leave the conflict in place.
- UI copy follows the design system's content rules: sentence case, verb buttons, no exclamation marks, no emoji.
