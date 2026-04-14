# Subagent Extension Comparison

**Date:** 2026-04-14
**Decision:** Migrate to badlogic/pi-mono reference implementation
**Tracking:** TODO-3bb34f62

---

## Candidates

| | nicobailon/pi-subagents ("Nico's") | badlogic/pi-mono subagent ("Mario's") |
|---|---|---|
| **Source** | https://github.com/nicobailon/pi-subagents | https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent/examples/extensions/subagent |
| **Size** | ~30+ source files, v0.13.4 | ~1100 lines across index.ts + agents.ts + agent MDs + prompt templates |
| **Modes** | Single, parallel, chain + async background | Single, parallel, chain |
| **Agent discovery** | 3-scope: builtin > user > project | 2-scope: user + project |
| **Builtin agents** | 7: scout, planner, worker, reviewer, researcher, context-builder, delegate | 4: scout, planner, worker, reviewer |
| **Author** | Nico Bailon | Mario Zechner (pi author) |

---

## nicobailon/pi-subagents

### Architecture

Full-featured orchestration framework that spawns subagents as child processes via `child_process.spawn()`. Uses `--mode json` for structured JSONL event streaming. Implements three-scope agent discovery (builtin > user > project), chain execution with shared artifact directories, and async background execution via detached `jiti` processes.

### Pros

- **Model fallback** -- ordered retry when a model is unavailable (rate limit, auth, overload)
- **Git worktree isolation** -- built-in worktree creation/cleanup for parallel tasks, with setup hooks
- **Skill injection** -- discovers and injects skills into subagent prompts from multiple scopes
- **Chain directory** -- shared temp directory with file-based artifact passing between chain steps
- **Recursion depth guard** -- `PI_SUBAGENT_DEPTH` env var prevents infinite nesting
- **Async/background execution** -- detached process with `status.json` polling and `events.jsonl` observability
- **Intercom bridge** -- subagent-to-orchestrator communication channel
- **Agent CRUD TUI** -- `/agents` manager, slash commands, keyboard shortcuts
- **Fork context** -- session branching so a subagent can inherit the parent's conversation
- **Reusable chain files** -- `.chain.md` definitions discoverable from the agent manager
- **Per-step model override** in chains via behavior resolution (step overrides > frontmatter > defaults)

### Cons

- **Complexity** -- many features that may never be used, harder to debug when things go wrong
- **Chain-centric design** -- the canonical workflow (scout > planner > worker > reviewer) is a chain pipeline that tries to own orchestration, which directly conflicts with the skill-as-orchestrator pattern used in this repo
- **Ephemeral artifact sharing** -- chain directory is auto-cleaned after 24h; this repo's skills use persistent `.pi/plans/` paths
- **Opinionated workflow** -- intercom, fork context, chain clarification TUI all assume the extension manages the workflow, not the skills
- **Maintenance burden** -- tracking upstream changes across 30+ files

---

## badlogic/pi-mono subagent

### Architecture

Minimal extension that registers a single `subagent` tool. Spawns isolated `pi` subprocess instances via `spawn()` with `--mode json -p --no-session`. Agent markdown body is written to a temp file and passed via `--append-system-prompt`. Parses `message_end` and `tool_result_end` events from stdout.

### Pros

- **Minimal and focused** -- thin dispatch layer, doesn't try to own orchestration
- **Reference implementation** -- by the pi author (Mario Zechner), guaranteed API compliance
- **Clean security model** -- project-scoped agents require explicit user confirmation
- **Fresh discovery** -- agents re-read from disk every invocation (edit mid-session)
- **Good rendering** -- collapsed/expanded views with usage stats, tool call formatting
- **Easy to extend** -- small codebase, clear patterns, straightforward to add features
- **Prompt templates** -- `/implement`, `/scout-and-plan` as composable pi prompts

### Cons

- **No model fallback** -- if the configured model is unavailable, the task fails
- **No git worktree isolation** -- parallel tasks share the working directory
- **No skill injection** -- agents only get what's in their frontmatter system prompt
- **No async/background execution** -- parent blocks until completion
- **No recursion depth guard** -- theoretically possible to infinite-loop
- **Simple text passing in chains** -- `{previous}` is string replacement, no file-based artifact sharing
- **No per-task model override in parallel mode** -- model comes from agent frontmatter only

---

## Fit for generate-plan and execute-plan Skills

This repo's skills follow a **skill-as-orchestrator** pattern where SKILL.md drives every step -- dependency graphs, wave scheduling, retry logic, cross-provider review loops, per-wave commits, integration testing. The subagent tool needs to be a dispatch mechanism, not a competing orchestrator.

| Requirement | Nico's | Mario's |
|---|---|---|
| Single agent dispatch | Yes | Yes |
| Parallel dispatch (wave execution) | Yes | Yes |
| Per-task model override | Yes (chains/inline config) | No (frontmatter only) -- needs ~10-line patch |
| Fresh context per dispatch | Yes | Yes |
| Status code parsing from output | Yes | Yes |
| No competing orchestrator | Conflict -- chain owns workflow | Clean -- no competing orchestrator |
| Persistent artifacts in `.pi/plans/` | Conflict -- uses ephemeral chain dir | Compatible -- no opinion on artifact storage |
| Worktree isolation | Built-in | Not provided (handled by `using-git-worktrees` skill) |
| Model fallback | Built-in | Not provided -- can cherry-pick (~50 lines) |

---

## Recommendation

**Use Mario's (badlogic/pi-mono) reference implementation** with two small extensions:

1. **Per-task model override in parallel mode** (~10 lines) -- add `model?: string` to parallel tasks schema, pass through to `runSingleAgent()`
2. **Model fallback** (~50 lines, optional) -- cherry-pick Nico's ordered-retry pattern for retryable errors

### Rationale

- **Architectural alignment**: skills own orchestration, extension owns dispatch. Clean separation with no overlap.
- **Debuggability**: ~1100 lines vs 30+ files. When a subagent fails, trace the issue in minutes not hours.
- **API compliance**: reference implementation by the pi author tracks the extension API correctly.
- **Existing coverage**: skills already handle worktree isolation (`using-git-worktrees`), model selection (`models.json`), retry logic (execute-plan Step 10), and workflow orchestration (SKILL.md step sequences).

### Features intentionally dropped

| Feature | Why not needed |
|---|---|
| Chain orchestration | Skills own the workflow sequence |
| Intercom bridge | Skills handle inter-step communication |
| Fork context | Fresh context is always used |
| Async/background execution | Skills wait for results synchronously |
| Agent CRUD TUI | Agents are defined in the repo |
| Recursion depth guard | Subagents don't spawn subagents in this model |
| Chain directory | Artifacts live in `.pi/plans/` |
| Skill injection | Agent prompts are assembled by skills via prompt templates |
