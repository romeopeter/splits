# AGENTS.md

Context for AI coding agents working in this repository. Read this file first, then the documents it points to. Keep it current: when a decision in "Open decisions" is settled or a convention changes, update this file in the same change.

## What this project is

A local-first desktop video editor for creators, an alternative to CapCut. It runs on Windows, macOS and Linux. Raw footage never leaves the machine, and every feature works offline except one: transcript-driven motion.

The signature workflow replaces a four-tool round trip (MP4 → MP3, transcribe in a chatbot, paste timings into a design tool, render and re-import):

1. Import a video.
2. Splits transcribes it locally with word-level timings.
3. Claude, using the user's own API key, turns the transcript and a style prompt into Lottie motion clips.
4. The clips sit on a Motion track, stay in sync with edits, and export with the video. This is in version 1. See Feature E in the spec.

- Repo and spec name: **Splits**. Brand in the design system: **Spits** (logo: an S sliced by a playhead). Not yet reconciled. See "Open decisions".
- Status: version 1 in development. The app runs (`npm run tauri dev`) with import, proxies, timeline editing, captions, Claude motion and export. See README.md for setup and `learn/` for how each part works.

## Sources of truth

| Topic | File | Precedence |
| --- | --- | --- |
| Product scope, features, architecture, agent build prompt | [splits-prd.md](splits-prd.md) | Wins on behaviour and architecture |
| Look, layout sizes, copy, components, icons, accessibility, editor behaviour | [spits-design-system/README.md](spits-design-system/README.md) | Wins on anything visual or interactive |
| Workspace anatomy, timeline, selection, shortcuts | [spits-design-system/editor-patterns.md](spits-design-system/editor-patterns.md) | Part of the design system |
| WCAG 2.2 AA rules | [spits-design-system/accessibility.md](spits-design-system/accessibility.md) | Part of the design system |
| Tokens | [spits-design-system/tokens.json](spits-design-system/tokens.json), [tokens.css](spits-design-system/tokens.css) | Part of the design system |
| Component props | [spits-design-system/components/index.d.ts](spits-design-system/components/index.d.ts) and each `components/*/README.md` | Part of the design system |
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
  components/ui/      Spits design-system components rebuilt in React
  components/motion/  Motion panel, Lottie layer
  components/         MediaPool, PreviewPlayer, Timeline, Inspector (composed from ui/)
  hooks/  types/
spits-design-system/  Design system (reference; do not edit to fit code, change code to fit it)
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
5. **Design-system fidelity.** Use only token variables for colour, spacing, radius, shadow, type and z-index. No raw hex values and no Tailwind default palette. Use only the Spits icon set. Never remove `shadow-focus`. Never convey state or clip kind by colour alone.
6. **Accessibility.** Every canvas and timeline action has a keyboard path, per `accessibility.md` and `editor-patterns.md`.
7. **Time is integer and frame-accurate.** Store time in integer units (ms or frames at a known rate), never floats in seconds, so splits and exports land on exact frames.
8. **Word-anchored timing.** Captions and motion clips refer to transcript word IDs, and their positions are derived from those words. Editing a word's text keeps its ID and timing.
9. **The API key is a secret.** It lives in the OS keychain, is read only by Rust, and never reaches the WebView, project files, logs or crash reports.
10. **Generated Lottie is untrusted input.** Validate every response before saving or rendering it: subset schema, project `w`/`h`/`fr`, segment length, one marker per word ID, bundled fonts only, size limits. Reject expressions and external or embedded image assets. Never render Lottie expressions.
11. **Preview equals export.** Motion is rendered by one renderer for both. Do not build a second path, such as FFmpeg text filters, that can drift from the preview.

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
architecture and stack · Tauri IPC and events · timeline data model (tracks, clips, time units) · media ingestion and probing · proxy pipeline · playback and canvas rendering · audio waveforms · split, trim and snapping · undo and redo · offline captions with whisper.cpp · transcripts and word-anchored timing · Lottie format and rendering · AI motion generation (prompting, streaming, validation, repair) · treating model output as untrusted input · API key storage in the OS keychain · chroma key shader · export pipeline (timeline JSON to FFmpeg filter graph) · progress and cancellation · design-system integration in React and Tailwind · keyboard and accessibility · testing strategy · packaging and bundling binaries per OS.

## Open decisions

Ask the user before resolving any of these. Record the answer here and in the spec.

Provisional defaults (chosen 2026-11-08 to get version 1 running; awaiting the user's confirmation):

1. **Layout.** Follows the design system's workspace. Media import lives in a **Media** panel opened from the tool rail, not in a fourth quadrant.
2. **Timecode format.** `hh:mm:ss:ff` (frames), in the design system's `timecode` style, because frame-accurate editing needs the frame.
3. **Split shortcuts.** Both: `S` splits at the playhead (design system), `B` switches to the blade tool, which splits where you click (spec). `V` returns to the select tool.
4. **Collaboration.** Out of scope for version 1. Avatar, AvatarStack and CursorLabel are not ported.

Still open:

5. **Name.** Splits or Spits.
6. **Motion track colour.** The design system has no motion clip kind. Motion uses `clip-shape` for now. A dedicated `clip-motion` token, with its edge and contrast checks, would need adding to the design system.
7. **No-key fallback.** Without a Claude key, motion is unavailable. Built-in offline Lottie templates filled from the transcript could fill that gap later.

Settled:

- 2026-11-08: AI motion is in version 1; users connect their own Anthropic API key; motion is Lottie JSON.
- 2026-11-08: Lottie renders with lottie-web's **light SVG build** in the WebView, live in preview and rasterised (fonts embedded) for export. The canvas renderer cannot draw font-based text. See `learn/08-rendering-lottie.md`.

## Working conventions

- Commit only when asked. Branch off `main` first.
- Keep `splits-prd.md`, this file and `learn/` consistent with the code. If they disagree, fix the docs or ask; do not leave the conflict in place.
- UI copy follows the design system's content rules: sentence case, verb buttons, no exclamation marks, no emoji.
