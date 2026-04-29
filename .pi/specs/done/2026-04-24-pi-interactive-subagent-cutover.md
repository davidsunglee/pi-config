# Migrate Skills to pi-interactive-subagent Extension

Source: TODO-b81313c6

## Goal

Cut pi-config's orchestration surface from the `pi-subagent` extension over to `pi-interactive-subagent` in a single atomic landing, with today's blocking / async semantics preserved exactly. All workflow skills, agent frontmatter (where applicable), repo docs, and the `settings.json` package list move together; after the cutover, no pi-config file outside historical plan archives references the old extension or its single-tool parameter shapes.

## Context

Today pi-config loads `~/Code/pi-subagent`, which registers a single `subagent` tool with three parameter shapes: single `{ agent, task }` (blocking), parallel `{ tasks: [...] }` (blocking, input capped at 8, in-flight hard-coded to 4), and chain `{ chain: [...] }` (blocking, sequential with `{previous}` substitution). All skill dispatch sites use single or parallel shapes; no skill under `agent/skills/` currently uses `chain:`. Per-call CLI routing uses a `dispatch: "pi" | "claude"` argument, resolved by each skill from the `dispatch` map in `agent/model-tiers.json`.

The target extension, `~/Code/pi-interactive-subagent`, replaces that single-tool surface with separate tools:

- `subagent` — spawns an async/non-blocking sub-agent session in a multiplexer pane or a headless child process; returns immediately.
- `subagent_run_serial` — blocks by default (optional `wait: false`), runs tasks sequentially with `{previous}` substitution, returns one result per step.
- `subagent_run_parallel` — blocks by default (optional `wait: false`), runs tasks concurrently with a configurable `maxConcurrency` (default 4, hard cap 8), returns results in input-task order.
- `subagent_resume`, `subagents_list`, `subagent_run_cancel` — supporting tools; not required by current skills.

Per-call CLI routing uses a `cli: "pi" | "claude"` argument; the equivalent `dispatch:` name is not accepted. Each task in an orchestration tool's `tasks[]` requires a `name` for display.

Both extensions register a tool literally named `subagent`, so they cannot be loaded concurrently — any migration is necessarily an atomic cutover rather than a per-skill staged rollout.

Scope of today's call sites inside pi-config (verified by grep):

- `agent/skills/execute-plan/SKILL.md` — coder wave (parallel), coder sub-task mini-waves (parallel), verifier wave (parallel), sequential fallback (single-mode loop).
- `agent/skills/generate-plan/SKILL.md` — planner single-mode, optional edit-plan single-mode.
- `agent/skills/refine-code/SKILL.md` + `agent/skills/refine-code/refine-code-prompt.md` — code-refiner single-mode dispatch and the refiner's internal reviewer / coder single-mode dispatches.
- `agent/skills/requesting-code-review/SKILL.md` — code-reviewer single-mode.
- `agent/skills/using-git-worktrees/SKILL.md` — two stale mentions of a `worktree: true` subagent dispatch option that exists in neither extension.

No agent file under `agent/agents/` carries `dispatch:` or `cli:` in frontmatter today; per-call CLI routing is the single source of truth and stays that way.

## Requirements

- `agent/settings.json` `packages` list swaps `~/Code/pi-subagent` for `~/Code/pi-interactive-subagent` in the same landing as the call-site edits.
- Every single-mode blocking call (`subagent { agent, task, model, dispatch }`) becomes a `subagent_run_serial { tasks: [{ name, agent, task, model, cli }] }` call. For single dispatches, `name` is the agent name (e.g. `"planner"`, `"code-refiner"`). Callers read `results[0].finalMessage` where they previously consumed the top-level result.
- Every parallel wave (`subagent { tasks: [ { agent, task, ... }, ... ] }`) becomes a `subagent_run_parallel { tasks: [ { name, agent, task, ... }, ... ] }` call. For parallel waves, `name` is a per-task distinguishing label — the plan task identifier or title (e.g. `"task-3: add-hello-extension"`) — so the mux widget and headless log stream show distinct rows per task rather than a stack of identical agent names. The `maxConcurrency` field is **omitted** at every call site so skills inherit whatever default the extension ships (currently 4, matching today's in-flight behavior; free to rise if the extension default rises later).
- Every sequential fallback loop keeps its loop structure and uses the single-mode rule above inside the loop body.
- Every per-call `dispatch: "pi" | "claude"` argument is renamed to `cli: "pi" | "claude"`.
- `agent/model-tiers.json` keeps its `dispatch` map name unchanged. The skill-level resolution step now reads as "look up `dispatch["<prefix>"]` in the model matrix and pass the result as `cli:` in the subagent call." The map value semantics (`"pi"` or `"claude"`) are unchanged.
- `execute-plan/SKILL.md` Step 5's cross-reference to `~/Code/pi-subagent/index.ts MAX_PARALLEL_TASKS` is rewritten to point at pi-interactive-subagent's `MAX_PARALLEL_HARD_CAP = 8` in `pi-extension/orchestration/types.ts`. The ≤8-tasks-per-wave split rule stays, reframed as a pi-config wave-planning convention that keeps one wave at or below the extension's in-flight hard cap even if `maxConcurrency` climbs to that ceiling.
- `using-git-worktrees/SKILL.md` has both stale references deleted: the trailing clause of the frontmatter `description` ("For automated parallel execution, use pi's built-in `worktree:true` subagent dispatch instead.") and the entire "For automated parallel task execution..." sentence in the Integration section. The two references describe a feature that exists in neither `pi-subagent` nor `pi-interactive-subagent`.
- `README.md` prose in "Installed packages" and "Subagent architecture" is updated so package name and tool-surface descriptions match the new extension. The six-agent inventory, workflow diagram, and file-artifact discussion stay as-is.
- Agent frontmatter under `agent/agents/` is not extended with a `cli:` field. The current convention (CLI routing comes from per-call `cli:` resolved from `model-tiers.json`) is preserved.
- After the cutover, a manual smoke run exercises the four dispatching skills end-to-end on a scratch todo in a throwaway worktree: `/generate-plan` (Pattern 1), `/execute-plan` on a plan with ≥2 tasks in one wave (Patterns 1 and 2), `/requesting-code-review`, and `/refine-code`. Each smoke confirms (a) the caller correctly reads `results[i].finalMessage` from the orchestration result shape, (b) `cli:` routing works for both `"pi"` and `"claude"` values observed in the chosen tier map, and (c) a parallel wave's elapsed time is close to the longest task rather than the sum.

## Constraints

- Preserve existing blocking vs. async semantics at every migrated call site. No caller adopts `wait: false` in this change. Bare `subagent` (now async-by-default) is not introduced at any current call site.
- Do not load `pi-subagent` and `pi-interactive-subagent` concurrently; they collide on the tool name `subagent` and must not be dual-resident in `settings.json`.
- Do not rename `agent/model-tiers.json`'s `dispatch` map key or change its value semantics. Only the per-call tool argument name changes.
- Do not add new fields (`wait`, `maxConcurrency`, `focus`, `fork`, `thinking`, `session-mode`, etc.) at any migrated call site unless specifically required to preserve current behavior. None are.
- Do not touch `.pi/plans/archived/` or `.pi/plans/done/`. Historical plan documents that still reference the old `subagent { chain: ... }` / `{ tasks: ... }` shapes are kept as-is.
- Do not delete the `~/Code/pi-subagent` checkout or remove any unrelated package from `settings.json`. Actual retirement is a separate follow-up todo.
- Do not restructure orchestration beyond the mechanical rename. No new skills, no refactored wave planners, no extracted dispatch helpers in this landing.

## Acceptance Criteria

- `rg -n "\bsubagent\s+\{" agent/ README.md` returns zero matches. The word-boundary-plus-required-whitespace pattern matches only the old single-tool call shape and does not false-match `subagent_run_serial {` or `subagent_run_parallel {`.
- `rg -n "\bdispatch:\s*\"(pi|claude)\"" agent/` returns zero matches. Every per-call routing argument uses `cli:`. (Note: `agent/model-tiers.json`'s `dispatch` map key has an object value, not a `"pi"` / `"claude"` string, so it does not match this pattern.)
- `rg -n "pi-subagent" agent/ README.md` returns zero matches. The string survives only in `.pi/plans/archived|done/` and in historical review/spec artifacts outside `agent/`.
- `rg -n "\bsubagent\s*\{\s*chain:" agent/ README.md` returns zero matches (reinforces today's zero-usage state).
- `rg -n "maxConcurrency" agent/` returns zero matches at any migrated call site.
- `rg -n "^(dispatch|cli):" agent/agents/` returns zero matches — no agent frontmatter adopts a `cli:` (or legacy `dispatch:`) field.
- `agent/settings.json` `packages` list includes `~/Code/pi-interactive-subagent` and excludes `~/Code/pi-subagent`.
- `agent/skills/using-git-worktrees/SKILL.md` contains no reference to `subagent dispatch` or `worktree: true` in the frontmatter `description` or the Integration section.
- `execute-plan/SKILL.md` Step 5 references pi-interactive-subagent's hard cap (`MAX_PARALLEL_HARD_CAP` in `pi-extension/orchestration/types.ts`) rather than pi-subagent's `MAX_PARALLEL_TASKS` constant.
- `README.md` "Installed packages" list and "Subagent architecture" section name `pi-interactive-subagent` and describe its multi-tool surface.
- The manual smoke run defined in Requirements completes successfully for all four skills against a scratch todo in a throwaway worktree: all dispatches return cleanly, `finalMessage` consumption works, `cli:` routing routes observable CLI invocations to the expected backend, and parallel waves observably parallelize.
- The migration lands as a revertable unit — whether a single commit, a squash-merge, or a branch whose commits revert cleanly together — such that one `git revert` (or equivalent) restores a green pi-subagent workflow with no partial-migration artifacts left in the tree.

## Non-Goals

- Retiring or deleting the `~/Code/pi-subagent` checkout. Package list only loses the entry; the directory on disk is a separate follow-up.
- Adopting async orchestration anywhere (`wait: false`, bare `subagent`, `subagent_resume`, `subagent_run_cancel`). Current blocking semantics are preserved.
- Adding automated migration guardrails (static-check scripts, pre-commit hooks) that would reject `subagent { tasks: ... }` / `dispatch:` reintroduction. The verification lives in the acceptance-criteria greps at cutover time only.
- Renaming `agent/model-tiers.json`'s `dispatch` map, or introducing a new per-agent `cli:` frontmatter convention.
- Updating `.pi/plans/archived|done/` or any `.pi/reviews/` artifacts that mention the old surface. Those are historical records.
- Raising or lowering the ≤8-tasks-per-wave planning convention in `execute-plan/SKILL.md`.
- Adding tests for orchestration behavior beyond the manual smoke run.
- Migrating any workflow outside `agent/skills/` + `agent/settings.json` + `README.md` (e.g., standalone `.pi/` utility scripts, if any exist outside the explicitly-listed files).
