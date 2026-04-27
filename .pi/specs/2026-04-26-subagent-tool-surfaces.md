# Tighten subagent tool surfaces

Source: TODO-945326a7

## Goal

Make every subagent definition in `agent/agents/` declare an explicit `tools:` frontmatter that matches the agent's role intent — read-only judgment agents cannot write, judge-only agents cannot run shell, coder/coordinator agents have only the tools they need to do their job. Defer the related question of switching Claude pane/headless launches off `bypassPermissions` (recorded as an Open Question with research preserved); this spec is purely a `pi-config` frontmatter exercise.

## Context

The seven local subagent definitions live in `agent/agents/`:

- `spec-designer` (spec writer; `define-spec`)
- `planner` (plan writer + plan editor; `generate-plan`)
- `plan-reviewer` (plan judge; `generate-plan`)
- `coder` (file editor + test runner; `execute-plan`, `refine-code`)
- `verifier` (judge-only; `execute-plan`)
- `code-reviewer` (diff judge; `refine-code`)
- `code-refiner` (review-remediate coordinator; `refine-code`)

Today's `tools:` declarations are inconsistent with role intent:

- Two are correct: `spec-designer` (`read, write, grep, find, ls`), `verifier` (`read, grep, find, ls`).
- Two are wrong: `planner` and `plan-reviewer` both declare `read, grep, find, ls, bash` — even though `planner` writes the plan file directly to disk (so it needs `write` and `edit`, not `bash`) and `plan-reviewer` returns its review through `finalMessage` for the orchestrator to persist (so it needs no `write` and no `bash`).
- Three are missing: `coder`, `code-reviewer`, and `code-refiner` declare no `tools:` line at all and inherit the broad default.

`spawning: false` is already set correctly on the six worker agents and intentionally absent on the `code-refiner` coordinator; no changes to spawning here.

Tool-flag plumbing lives in the sibling `pi-interactive-subagent` repo and is **out of scope** for this spec. For reference:

- pi path: `resolvePiToolsArg` in `pi-extension/subagents/launch-spec.ts` filters the agent's `tools:` value to the seven pi builtins (`read, bash, edit, write, grep, find, ls`) and auto-merges the `caller_ping` + `subagent_done` lifecycle tools, then passes the result as `--tools`.
- Claude pane: `buildClaudeCmdParts` in `pi-extension/subagents/index.ts` maps each pi builtin to a Claude tool via `PI_TO_CLAUDE_TOOLS` (`read→Read`, `write→Write`, `edit→Edit`, `bash→Bash`, `grep→Grep`, `find→Glob`, `ls→Glob`), adds the `mcp__pi-subagent__subagent_done` lifecycle tools, and passes the result via `--tools`.
- Claude headless: `buildClaudeHeadlessArgs` in `pi-extension/subagents/backends/claude-stream.ts` performs the same Claude-tool mapping for the `-p` path.
- Claude permission mode is hard-coded: pane uses `--dangerously-skip-permissions`; headless uses `--permission-mode bypassPermissions`. Not changed by this spec (see Open Questions).

The pre-existing constraint that `code-refiner` must run on `pi` (the Claude path's MCP plugin only exposes `subagent_done`, not the orchestration tools `subagent_run_serial` / `subagent_run_parallel`) is preserved by `pi-config`'s existing model-tier wiring and is not revisited here.

## Requirements

Each agent in `agent/agents/` declares an explicit `tools:` frontmatter matching the role-intent matrix below. All other frontmatter fields (`name:`, `description:`, `spawning:`, `session-mode:`, `auto-exit:`, `system-prompt:`, `thinking:`, `cli:`, etc.) are unchanged. Agent body content (the markdown after the closing `---`) is unchanged.

| Agent | Required `tools:` line | Rationale |
|---|---|---|
| `spec-designer` | `read, write, grep, find, ls` | Already correct. Writes specs as full-file overwrites (`write`); existing-spec branch overwrites at the same path. No shell. |
| `planner` | `read, write, edit, grep, find, ls` | Writes the plan file in initial-generation mode (`write`); the edit-pass body says "Edit surgically against those findings; do not rewrite unflagged sections" — surgical patches argue for `edit`. Codebase analysis is read-based; no shell needed. |
| `plan-reviewer` | `read, grep, find, ls` | Judge-only. Returns the review text via `finalMessage`; the `generate-plan` orchestrator (Step 4.1.4–5) writes the file. No `write`, no shell. |
| `coder` | `read, write, edit, grep, find, ls, bash` | Implements task steps (write/edit existing files), runs tests and other tooling (bash). |
| `verifier` | `read, grep, find, ls` | Already correct. Judge-only; the `execute-plan` orchestrator captures command evidence and inlines it into the verifier prompt. The verifier reads only files in `## Verifier-Visible Files` and renders verdicts. |
| `code-reviewer` | `read, grep, find, ls, bash` | Returns review via `finalMessage`; the `code-refiner` coordinator persists the file. Needs `bash` for the `git diff` invocations baked into `review-code-prompt.md` and for ad-hoc test runs. No `write`. |
| `code-refiner` | `read, write, edit, grep, find, ls, bash` | Coordinator. Reads prompt templates, writes versioned review files, runs `git add` / `git commit` after each remediation batch, and dispatches `code-reviewer` / `coder` subagents (spawning stays enabled — `spawning: false` is intentionally absent). |

## Constraints

- No changes to the `pi-interactive-subagent` repo. Every edit lands in `pi-config`.
- No changes to Claude permission-mode flags. Pane keeps `--dangerously-skip-permissions`; headless keeps `--permission-mode bypassPermissions`. Switching to `dontAsk` is deferred (see Open Questions).
- No new tool names introduced. The vocabulary is the seven existing pi builtins (`read, write, edit, bash, grep, find, ls`); anything outside that set is filtered out by `resolvePiToolsArg` before reaching pi, and untranslated tokens are dropped on the Claude path by `PI_TO_CLAUDE_TOOLS`. Only those seven canonical names appear in any `tools:` line written by this work.
- No changes to `spawning:`, `session-mode:`, `auto-exit:`, `system-prompt:`, `thinking:`, `cli:`, or any other frontmatter field besides `tools:`. This is a `tools:`-only edit per agent.
- No changes to agent body content. If a smoke run surfaces a body bug, it is reported as a finding and resolved as a separate decision rather than silently patched.
- The `code-refiner`-runs-on-pi constraint already established by `.pi/plans/done/2026-04-19-refine-code-prompt-user-when-coordinator-dispatch-is-not-pi.md` is preserved; no work in this spec is allowed to invalidate it.

## Acceptance Criteria

- Every `agent/agents/<name>.md` file's `tools:` line matches the corresponding row in the Requirements matrix — exactly the listed tool tokens, comma-separated, with no extras and no omissions. The other frontmatter fields and the body of each file are byte-identical to before, except for the `tools:` line.
- A `generate-plan` smoke run on a trivial input (small todo or short freeform task) completes end-to-end without errors: the `planner` writes a plan under `.pi/plans/`, the `plan-reviewer` returns a review whose file the orchestrator persists under `.pi/plans/reviews/`, and neither subagent reports `BLOCKED` or `NEEDS_CONTEXT`.
- An `execute-plan` smoke run on a single-task throwaway plan completes end-to-end: the `coder` produces the expected output file(s), the wave commit is made, and the `verifier` returns `VERDICT: PASS` for the task.
- A `refine-code` smoke run on a trivial diff (e.g., a small change with no real issues) completes: the `code-refiner` dispatches `code-reviewer` (and `coder` if remediation triggers), persists a versioned review file under `.pi/reviews/`, and returns `STATUS: clean` (or `STATUS: max_iterations_reached` with a clearly bounded finding set). No dispatched subagent reports `BLOCKED`.
- The seven `tools:` edits ship as a single, atomic change with a commit message that names the role-intent motivation.

## Non-Goals

- Changing Claude pane (`--dangerously-skip-permissions`) or headless (`--permission-mode bypassPermissions`) flags. The permission-mode posture stays as-is.
- Modifying the `pi-interactive-subagent` repo (`launch-spec.ts`, `index.ts`, `claude-stream.ts`, `tool-map.ts`, plugin/MCP server, etc.).
- Adding new tools to `PI_BUILTIN_TOOLS` or `PI_TO_CLAUDE_TOOLS`, or otherwise expanding the seven-token vocabulary.
- Refactoring agent body content. If a smoke run surfaces a body bug, it is a finding to surface, not a silent edit.
- Changing `spawning:`, `session-mode:`, `auto-exit:`, `system-prompt:`, `thinking:`, `cli:`, or any frontmatter field besides `tools:`.
- Defining per-bash-command sub-allowlists. Bash remains binary (allowed/not) per the existing pi and Claude wiring.
- Revisiting the `code-refiner`-must-run-on-pi constraint already documented in `.pi/plans/done/2026-04-19-refine-code-prompt-user-when-coordinator-dispatch-is-not-pi.md`.
- Updating `agent/AGENTS.md` or other documentation. The `tools:` line itself is the authoritative declaration.

## Open Questions

- **Evaluate `dontAsk` permission mode as a follow-up.** Anthropic's official Claude Code docs (`code.claude.com/docs/en/permission-modes`, under the "Auto Mode" heading) describe `dontAsk` as the recommended posture for headless agents: tool requests that would otherwise prompt are auto-denied, while pre-approved tools (via `permissions.allow` or `--allowedTools`) and read-only Bash commands continue to work. Once this spec lands and every agent has an explicit `tools:` allowlist, `dontAsk` becomes a much lower-risk swap on both pane and headless paths than it is today. The relevant code sites for the follow-up are `pi-extension/subagents/index.ts` (pane: today emits `--dangerously-skip-permissions`; would emit `--permission-mode dontAsk`) and `pi-extension/subagents/backends/claude-stream.ts` (headless: today emits `--permission-mode bypassPermissions`; would emit `--permission-mode dontAsk`). Open empirical questions for that follow-up:
  - Does the `coder` agent ever hit a `bash` operation that `dontAsk` would block (i.e., something beyond "read-only Bash commands" plus the explicit allowlist)? Likely candidates: `git add` / `git commit`, `mkdir`, package-manager invocations during tests.
  - Does the `code-refiner` coordinator's commit-and-dispatch flow run cleanly under `dontAsk` — it runs `git add -A` / `git commit` directly between remediation batches.
  - How do pane vs. headless behave under `dontAsk` in practice — is the pane truly "no prompts to the user," or are there interactive escape hatches Claude tries to invoke?
- The valid `--permission-mode` values surfaced by the research, recorded for the follow-up: `default`, `acceptEdits`, `plan`, `dontAsk`, `bypassPermissions`. There is no literal `auto` mode — what the docs call "Auto Mode" is `dontAsk`.
