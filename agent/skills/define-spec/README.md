# Define Spec skill

Interactively turn a todo, existing spec, or freeform request into a structured spec file under `docs/specs/`.

## Role in the workflow

`define-spec` answers **what are we building?** before `generate-plan` answers **how will we build it?** It captures intent, scope, constraints, open questions, and acceptance criteria in a durable artifact that later planning agents can read from disk.

## Inputs

- A todo ID such as `TODO-7ef7d441`.
- An existing spec path under `docs/specs/` to revise.
- Freeform text describing the desired work.

## Execution modes

The skill is a thin orchestrator around `procedure.md`, which is the shared spec-design procedure for both modes.

### Multiplexer mode

When a compatible pane backend is available (`cmux`, `tmux`, `zellij`, or `wezterm`), the skill dispatches the `spec-designer` subagent into its own pane. The user answers questions directly in that pane.

The mux probe mirrors `pi-interactive-subagent` backend selection, including:

- `PI_SUBAGENT_MODE=headless` forcing inline mode.
- `PI_SUBAGENT_MODE=pane` forcing pane mode.
- `PI_SUBAGENT_MUX` honoring a pinned backend without falling through to other backends.
- Backend-specific environment variable plus `command -v` checks.

### Inline mode

If no mux is available, or if the user asks for `--no-subagent` / `inline`, the current session follows `procedure.md` directly.

## Completion and validation

For mux runs, the subagent must end with:

```text
SPEC_WRITTEN: <absolute path>
```

The orchestrator validates that path before presenting it for review. It also has a conservative transcript-backed recovery path for the known case where the subagent successfully wrote exactly one `docs/specs/*.md` file but exited before emitting the final line.

## Commit gate

After the spec is written, the skill pauses for user review. Only on explicit user approval does it invoke the `commit` skill for the exact spec path. Rejected drafts can be redone, left on disk, or deleted.

After a successful commit, the skill offers to continue into `generate-plan` with the spec path.

## Model and dispatch behavior

Mux mode resolves the capable model and CLI from `~/.pi/agent/model-tiers.json`; it does not rely on subagent frontmatter defaults. This keeps the interactive `spec-designer` on the intended capable tier and matching CLI.

## Files

- `SKILL.md` — orchestrator: mode detection, dispatch, validation, commit gate, continuation offer.
- `procedure.md` — single source of truth for the actual spec-design conversation and file-writing procedure.
