# CLAUDE.md

@AGENTS.md

## Skills for Claude

The project's skill files live in `.claude-skills/`. Claude Code does not load them on its own, so read the matching files with the Read tool before starting a task. Treat them as engineering constraints. The rules in AGENTS.md and the user's explicit instructions take precedence.

### Rust (`src-tauri/`)

Read before writing or changing any Rust code:
- [rust-core](.claude-skills/RUST/rust-core/SKILL.md): idiomatic Rust, ownership, types
- [rust-error-handling](.claude-skills/RUST/rust-error-handling/SKILL.md): typed errors, context, propagation across Tauri commands
- [rust-security](.claude-skills/RUST/rust-security/SKILL.md): untrusted input such as media files, paths and FFmpeg arguments

Also read when the task calls for it:

| Task | Skill |
| --- | --- |
| Engine jobs, proxy or export pipelines, progress events, cancellation | [rust-async-tokio](.claude-skills/RUST/rust-async-tokio/SKILL.md) |
| Writing or fixing tests | [rust-testing](.claude-skills/RUST/rust-testing/SKILL.md) |
| Proxy, playback, frame or export speed | [rust-performance](.claude-skills/RUST/rust-performance/SKILL.md) |
| Logging, tracing, diagnosing failures | [rust-observability](.claude-skills/RUST/rust-observability/SKILL.md) |
| Cargo layout, lints, formatting, CI | [rust-project-conventions](.claude-skills/RUST/rust-project-conventions/SKILL.md) |
| Reviewing Rust changes | [rust-code-review](.claude-skills/RUST/rust-code-review/SKILL.md) |

Skip these unless the architecture changes:
- [rust-api-web](.claude-skills/RUST/rust-api-web/SKILL.md): the app has no HTTP server.
- [rust-database](.claude-skills/RUST/rust-database/SKILL.md): Postgres-focused, and project data is local files.
- [rust-agent-architecture](.claude-skills/RUST/rust-agent-architecture/SKILL.md): for building AI agents in Rust, which this app does not do.

The overview and loading policy are in [.claude-skills/RUST/README.md](.claude-skills/RUST/README.md).

### JavaScript and React (`src/`)

| Task | Skill |
| --- | --- |
| Writing, refactoring, optimising or debugging React components and hooks | [React](.claude-skills/JS/REACT/SKILLS.md) |
| Reviewing JS or TS changes | [Reviews](.claude-skills/JS/REVIEWS/SKILLS.md) |

For any UI work, also read the design-system files listed under "Sources of truth" in AGENTS.md. The design system decides look and behaviour; the React skill decides code quality.

### Claude API (`src-tauri/src/ai/`)

Before writing or changing the Claude client or the motion prompt, invoke the built-in `claude-api` skill. It has the current model IDs, request shapes and pitfalls. Rust has no official SDK, so follow its raw-HTTP (cURL) shapes. Also read [rust-security](.claude-skills/RUST/rust-security/SKILL.md) (prompt injection, untrusted output, secrets) and [rust-async-tokio](.claude-skills/RUST/rust-async-tokio/SKILL.md) (streaming, cancellation).

## Before finishing a task

- Update `learn/` as AGENTS.md describes, whenever the change adds or alters a concept or decision.
- If an open decision in AGENTS.md was settled, record the answer there and in `splits-prd.md`.
