# Subagent Extension Migration Design

**Date:** 2026-04-14
**Status:** Approved
**Tracking:** TODO-3bb34f62
**Analysis:** [.pi/subagent_analysis.md](../../../.pi/subagent_analysis.md)

## Goal

Replace the current subagent extension (`npm:pi-subagents` by nicobailon) with a minimal fork of the reference implementation from `badlogic/pi-mono`. The fork lives at `davidsunglee/pi-subagent` (npm: `@davidsunglee/pi-subagent`), cloned at `~/Code/pi-subagent`.

### Why

The current extension is a full orchestration framework (~30+ source files) whose chain-centric design competes with the orchestration already built into generate-plan, execute-plan, and refine-code skills. The reference implementation (~1100 lines) provides core single/parallel/chain dispatch without imposing its own workflow. Additionally, there are TUI rendering bugs with the current extension that the simpler rendering code may resolve.

### Approach

**Minimal Fork (Approach A):** Copy Mario's reference implementation into the new repo. Add four features directly in the existing code. Total delta: ~100-150 lines over the base.

---

## Repository Structure

```
pi-subagent/                          # ~/Code/pi-subagent
├── package.json                      # name: @davidsunglee/pi-subagent
├── tsconfig.json
├── index.ts                          # Extension entry point (forked from Mario's)
├── agents.ts                         # Agent discovery + extended frontmatter parsing
├── agents/
│   ├── scout.md                      # Builtin: fast recon (Haiku)
│   ├── planner.md                    # Builtin: plan generation (Sonnet)
│   ├── worker.md                     # Builtin: general execution (Sonnet)
│   └── reviewer.md                   # Builtin: code review (Sonnet)
└── prompts/
    ├── implement.md                  # scout -> planner -> worker chain
    ├── scout-and-plan.md             # scout -> planner chain
    └── implement-and-review.md       # worker -> reviewer -> worker chain
```

User-scope agents at `~/.pi/agent/agents/` override builtins by name. The only collision is `planner` — the user's planner (Opus, high thinking, read-only) overrides the builtin.

After discovery, 8 agents are available:

| Agent | Source | Purpose |
|---|---|---|
| planner | User (overrides builtin) | Deep codebase analysis, plan generation |
| coder | User | Single-task execution from plans |
| plan-reviewer | User | Plan structural review |
| code-reviewer | User | Code diff review |
| code-refiner | User | Review-remediate loop orchestration |
| scout | Builtin | Fast codebase recon |
| worker | Builtin | General execution |
| reviewer | Builtin | Code review |

---

## Feature Additions

### 1. Extended Frontmatter Fields

Add two fields to `AgentConfig` and the frontmatter parser in `agents.ts`:

| Field | Type | Default | Effect |
|---|---|---|---|
| `thinking` | `"off" \| "minimal" \| "low" \| "medium" \| "high" \| "xhigh"` | none (pi default) | Passed as `--thinking <level>` CLI arg |
| `maxSubagentDepth` | `number` | 2 | Per-agent recursion cap |

### 2. Recursion Depth Guard

Prevents infinite subagent nesting:

- On spawn: set `PI_SUBAGENT_DEPTH = currentDepth + 1` in the child process env
- On tool execution: read `PI_SUBAGENT_DEPTH` from env (default 0)
- Block if `currentDepth >= maxSubagentDepth` (from agent frontmatter, clamped to never exceed parent's limit)
- Return clear error: "Subagent depth limit reached (depth N, max M)"

This allows code-refiner (`maxSubagentDepth: 1`) to dispatch code-reviewer and coder (`maxSubagentDepth: 0`), while planner and coder cannot spawn subagents.

### 3. Per-Task Model and Thinking Override

Extend the tool schema to allow model and thinking overrides per dispatch:

```typescript
// Single mode
{ agent: string, task: string, model?: string, thinking?: string, cwd?: string }

// Parallel mode
{ tasks: Array<{ agent: string, task: string, model?: string, thinking?: string, cwd?: string }> }

// Chain mode — unchanged, inherits from agent frontmatter
{ chain: Array<{ agent: string, task: string, cwd?: string }> }
```

Resolution order: **tool call field > agent frontmatter > pi default**

When present, `model` is passed as `--model <value>` and `thinking` as `--thinking <level>` to the spawned subprocess.

### 4. Model Fallback

Opt-in retry wrapper around `runSingleAgent()`:

- New optional frontmatter field: `fallbackModels` (comma-separated model list)
- On retryable error (rate limit, auth failure, overloaded, network error): try the next model in the list
- If no fallback models defined or all exhausted: throw the original error
- Record model attempt history for observability in the tool result

No current agents define `fallbackModels` — zero behavior change until explicitly configured.

---

## Agent Discovery

Unchanged from Mario's reference implementation:

| Scope | Path | Priority |
|---|---|---|
| Builtin | Package `agents/` directory | Lowest |
| User | `~/.pi/agent/agents/` | Middle |
| Project | `.pi/agents/` (nearest ancestor) | Highest |

Project-scoped agents require user confirmation when `agentScope: "both"` is used. Default scope: `"user"`.

Agents are re-read from disk on every tool invocation (edit mid-session without reload).

---

## TUI Rendering

Carried over from Mario's reference implementation unchanged:

- **Collapsed view** (default): status icon, agent name, recent tool calls as shell-style summaries, usage stats
- **Expanded view** (Ctrl+O): full task text, all tool calls, final output as Markdown, per-step usage
- **Parallel mode**: aggregated "N/M done, K running" with per-task collapsed views
- **Chain mode**: numbered steps with per-step status

No custom rendering code. TUI issues addressed as bugs if they arise.

---

## Local Development and Publishing

### Local development (now)

- Repo: `~/Code/pi-subagent` (already cloned)
- Reference from `~/.pi/agent/settings.json` as a local path, replacing `npm:pi-subagents`
- Test against skills end-to-end

### Publish later (separate todo)

- Publish to npm as `@davidsunglee/pi-subagent` with `--access public`
- Switch settings.json from local path to `npm:@davidsunglee/pi-subagent`

---

## Migration Plan

### Step 0: Characterize existing behavior

Before touching the extension, run all three skill flows end-to-end with the current Nico's extension to establish baseline behavior:

1. **generate-plan**: Plan generation + review loop
2. **execute-plan**: Wave dispatch + verification + commits
3. **refine-code**: Recursive dispatch (code-refiner -> code-reviewer + coder)

Record results: success/failure, any TUI glitches, timing.

### Step 1: Implement the fork

Copy Mario's reference source into `~/Code/pi-subagent`. Add the four features (extended frontmatter, depth guard, per-task model/thinking, model fallback).

### Step 2: Install locally

Update `~/.pi/agent/settings.json`:
- Replace `npm:pi-subagents` with local path to `~/Code/pi-subagent`
- No changes to agents or skills (tool name stays `subagent`, schema is a superset, frontmatter fields are the same)

### Step 3: Verify

Re-run the same three skill flows from Step 0. Compare against baseline:
- generate-plan: single planner dispatch, plan-reviewer dispatch, edit loop
- execute-plan: wave parallel dispatch, per-task model override, status code parsing, retry logic
- refine-code: recursive dispatch (code-refiner dispatches code-reviewer and coder)

### Step 4: Clean up

- Remove Nico's extension: `npm uninstall -g pi-subagents` (or however it was installed)
- Remove any extension-specific config at `~/.pi/agent/extensions/subagent/config.json` if present

### Rollback

If something breaks, swap settings.json back to `npm:pi-subagents`. Zero-risk — no agent or skill files are modified during migration.

---

## Features Intentionally Dropped

| Feature | Why not needed |
|---|---|
| Chain orchestration (as workflow engine) | Skills own workflow sequencing |
| Intercom bridge | Skills handle inter-step communication |
| Fork context / session branching | Fresh context always used |
| Async/background execution | Skills wait synchronously |
| Agent CRUD TUI | Agents defined in files |
| Chain directory (ephemeral artifacts) | Artifacts live in `.pi/plans/` |
| Skill injection into subagent prompts | Skills assemble prompts via templates |
| Chain clarification TUI overlay | Not needed with skill-driven dispatch |
| `.chain.md` file discovery | Prompts directory serves this role |

---

## Compatibility

| Concern | Impact |
|---|---|
| Tool name | No change — stays `subagent` |
| Tool schema | Superset — adds `model`, `thinking` fields; all existing calls valid |
| Agent frontmatter | Superset — adds `thinking`, `maxSubagentDepth`, `fallbackModels`; existing fields unchanged |
| Agent file locations | No change — `~/.pi/agent/agents/` |
| Skill SKILL.md files | No changes needed |
| Prompt templates | No changes needed |
| settings.json | Only change: package reference |
