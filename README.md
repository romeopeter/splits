# Splits

A local-first desktop video editor for creators, an alternative to CapCut. It runs on Windows, macOS and Linux. Your footage stays on your machine, and everything works offline except the optional AI motion feature.

> **Status: version 1 in development.** Import, proxies, timeline editing, offline captions, Claude motion and export work on macOS. Windows and Linux are untested.

## Features

- **Import with automatic proxies.** Large source files (4K included) are transcoded in the background to light 720p proxies, so scrubbing and playback stay fast. Originals are only read at export.
- **Multi-track timeline.** Separate tracks for text and captions, video and audio, with thumbnails and waveforms. Drag, snap, trim and split clips.
- **Offline captions.** One click transcribes speech on your computer with `whisper.cpp` (the `tiny.en` model by default, downloaded once in Settings), with timings for every word, then places caption clips on the timeline. You can correct the transcript in place.
- **Motion from your transcript.** Connect your own Claude API key, describe a style, and Splits turns the transcript into animated Lottie motion clips synced to each word. They stay in sync as you edit and export with the video. Only transcript text is sent, never your footage. This is the one feature that needs an internet connection.
- **Chroma key.** Pick a background colour with the eyedropper and remove it in real time with a GPU shader.
- **MP4 export.** The timeline is compiled into an FFmpeg job that renders from the original files, with live progress. You can also export the motion layer alone as transparent video, or as Lottie files.

## Stack

| Layer | Technology |
| --- | --- |
| Desktop shell | [Tauri v2](https://v2.tauri.app/) (Rust) |
| UI | React, TypeScript, Vite, Tailwind CSS |
| Media | FFmpeg, driven from Rust |
| Playback | HTML5 canvas (WebGL) |
| Speech to text | [whisper.cpp](https://github.com/ggerganov/whisper.cpp) |

## Repository

| Path | Contents |
| --- | --- |
| [splits-prd.md](splits-prd.md) | Product requirements, architecture and the agent build prompt |
| [src/](src/) | React app: timeline, preview, panels, export orchestration |
| [src-tauri/](src-tauri/) | Rust: media engine, transcription, Claude client, keychain, project files |
| [spits-design-system/](spits-design-system/) | The Spits design system: tokens, components, icons, logos, fonts, accessibility and editor patterns |
| [AGENTS.md](AGENTS.md) | Context and rules for AI coding agents |
| [CLAUDE.md](CLAUDE.md) | Claude Code entry point: imports AGENTS.md and says which skills to load |
| [learn/](learn/) | Engineering notes on how the editor is built and why |
| [.claude-skills/](.claude-skills/) | Rust and React skill files for agents |

## Design

The UI follows the [Spits design system](spits-design-system/README.md): dark first, with a light theme, one blue accent and a distinct colour for each track type, targeting WCAG 2.2 AA. Open any `spits-design-system/components/*/preview.html` in a browser to see a component, or `components/EditorWorkspace/preview.html` for the full editor screen.

## Getting started

### Prerequisites

- [Rust](https://rustup.rs/) (stable) and [Node.js](https://nodejs.org/) 20 or later
- The [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS
- **FFmpeg** with `ffmpeg` and `ffprobe` (macOS: `brew install ffmpeg`)
- **whisper.cpp** for captions (macOS: `brew install whisper-cpp`, which provides `whisper-cli`). Download a model in Settings → Transcription.
- An **Anthropic API key** for motion (Settings → Claude). Optional; everything else works offline.

Splits finds the binaries on PATH and in the usual Homebrew folders. To point at specific builds, set `SPLITS_FFMPEG`, `SPLITS_FFPROBE`, `SPLITS_WHISPER` or `SPLITS_WHISPER_MODEL`.

### Run

```bash
npm install
npm run tauri dev
```

### Test

```bash
npm test                          # timeline, time and anchoring logic
npm run typecheck
cd src-tauri && cargo test        # Rust unit tests, plus a real FFmpeg export if FFmpeg is installed
```

### Build

```bash
npm run tauri build
```

### Where things are stored

Everything lives in the app data folder (macOS: `~/Library/Application Support/com.duowork.splits`): `proxies/`, `thumbs/`, `models/`, and `projects/<id>/` with `project.json` and `motion/*.json`. Projects save automatically. Your API key is in the system keychain, not on disk.
