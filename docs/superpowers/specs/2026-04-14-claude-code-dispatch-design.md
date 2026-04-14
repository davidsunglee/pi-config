# Claude Code Dispatch for Subagents

**Source:** TODO-97a8b7b4
**Date:** 2026-04-14

## Problem

Anthropic subscription plans (Max, etc.) provide included usage quotas when using Claude Code, but API calls from third-party agents like pi count as "extra usage" at higher cost. Pi's subagent extension currently only spawns `pi` processes — there is no way to route Anthropic-model tasks through the `claude` CLI to take advantage of subscription quotas.

Anthropic's stealth-mode detection (identifying non-Claude-Code clients using OAuth tokens) is an active cat-and-mouse game. Spawning the actual Claude Code CLI is the durable, ToS-compliant approach.

## Design

Two cleanly separated layers:

1. **Layer 1 (subagent extension):** General-purpose dispatch support — the subagent extension learns to spawn different CLIs based on a `dispatch` property. This works for any subagent use case, independent of planning/execution workflows.
2. **Layer 2 (skill configuration):** Workflow-specific routing — `models.json` gains a `dispatch` map that tells generate-plan and execute-plan which dispatch backend to use for each provider.

## Layer 1: Subagent Dispatch

### Agent Frontmatter

Two new optional fields in agent markdown frontmatter:

```yaml
---
name: coder
model: claude-sonnet-4-6
dispatch: claude           # pi (default) | claude
permissionMode: bypassPermissions  # bypassPermissions (default) | auto | plan
---
```

- **`dispatch`** — which CLI spawns the subagent. Default: `pi` (current behavior). When `claude`, the extension spawns the `claude` CLI instead.
- **`permissionMode`** — only applies when `dispatch: claude`. Maps to Claude Code's `--permission-mode` flag. Supported values:
  - `bypassPermissions` (default) — no permission prompts, subagents operate fully autonomously
  - `auto` — autonomous with safety guardrails
  - `plan` — read-only, no file mutations (useful for reviewers)

### Invocation-Time Override

Callers can override both fields at invocation time:

```
subagent { agent: "coder", task: "...", dispatch: "claude", permissionMode: "plan" }
```

Precedence: invocation-time override > agent frontmatter > extension default (`pi`).

### AgentConfig Changes

The `AgentConfig` interface gains two optional fields:

```typescript
interface AgentConfig {
    name: string;
    description: string;
    tools?: string[];
    model?: string;
    dispatch?: string;         // "pi" | "claude"
    permissionMode?: string;   // "bypassPermissions" | "auto" | "plan"
    systemPrompt: string;
    source: "user" | "project";
    filePath: string;
}
```

Parsed from frontmatter by `loadAgentsFromDir()` in `agents.ts`.

### SubagentParams Changes

The subagent tool's parameter schema gains optional `dispatch` and `permissionMode` fields alongside the existing `agent`, `task`, `model`, etc.

### Model Translation

When `dispatch: claude`, the extension strips the provider prefix from the pi-normalized model string:

- `anthropic/claude-opus-4-6` → `claude-opus-4-6`
- `anthropic/claude-sonnet-4-6` → `claude-sonnet-4-6`
- `anthropic/claude-haiku-4-5` → `claude-haiku-4-5`

Implementation: split on `/`, take the right side. Claude Code accepts these IDs directly via `--model`.

### CLI Argument Mapping

| pi | claude |
|---|---|
| `--mode json -p` | `-p --output-format stream-json` |
| `--model anthropic/claude-opus-4-6` | `--model claude-opus-4-6` |
| `--append-system-prompt <file>` | `--system-prompt <file>` |
| `--no-session` | `--no-session-persistence` |
| `--tools read,write,...` | *(not needed — Claude Code has all tools built in)* |
| *(n/a)* | `--permission-mode <mode>` |

### Spawn Function

A new `getClaudeInvocation(args)` function alongside the existing `getPiInvocation(args)`:

```typescript
function getClaudeInvocation(args: string[]): { command: string; args: string[] } {
    return { command: "claude", args };
}
```

`runSingleAgent()` branches on `dispatch` to choose the invocation function, arg builder, and output parser.

### Error Handling

If `dispatch: claude` is set but the `claude` CLI is not found (spawn fails with ENOENT), the subagent returns a `SingleResult` with `exitCode: 1` and a clear error message: `"Claude Code CLI not found. Install it or set dispatch to 'pi'."` No fallback to pi — an explicit dispatch choice should fail explicitly.

### Output Parsing

Claude Code's `--output-format stream-json` emits newline-delimited JSON events. The extension needs a parser that maps these to the existing `SingleResult` structure.

Claude Code JSON output (from `--output-format json`) contains:

```json
{
    "type": "result",
    "result": "...",
    "stop_reason": "end_turn",
    "total_cost_usd": 0.124,
    "usage": {
        "input_tokens": 3,
        "output_tokens": 4,
        "cache_read_input_tokens": 0,
        "cache_creation_input_tokens": 19863
    },
    "duration_ms": 27266
}
```

The `stream-json` format emits incremental events suitable for real-time progress updates. The parser maps these to `SingleResult` fields:

- `result` → `finalOutput` (the agent's text response)
- `stop_reason` → `exitCode` (0 for `end_turn`, 1 for errors)
- `usage` → mapped to `UsageStats`
- `total_cost_usd` → `usage.cost`
- `duration_ms` → available for progress tracking

The exact `stream-json` event schema should be verified during implementation by inspecting Claude Code's streaming output.

### Extensibility

The `dispatch` field is a string, not a boolean. This accommodates future dispatch targets (e.g., `codex-cli`) without schema changes. Each new target requires:

1. An invocation function (how to find/spawn the CLI)
2. An arg builder (how to translate pi's args to the target CLI's args)
3. An output parser (how to map the target CLI's output to `SingleResult`)

## Layer 2: Skill Configuration

### models.json

The existing `models.json` gains a `dispatch` section:

```json
{
    "capable": "anthropic/claude-opus-4-6",
    "standard": "anthropic/claude-sonnet-4-6",
    "cheap": "anthropic/claude-haiku-4-5",
    "crossProvider": {
        "capable": "openai-codex/gpt-5.4",
        "standard": "openai-codex/gpt-5.4"
    },
    "dispatch": {
        "anthropic": "claude"
    }
}
```

The `dispatch` map is keyed by provider name. When a skill resolves a model tier and the model's provider appears in the map, the skill passes the mapped dispatch value as an override to the subagent call.

Providers not in the map use the agent's frontmatter default (which defaults to `pi`).

### Skill Changes

`generate-plan` and `execute-plan` SKILL.md files each gain a small step after model tier resolution:

> Read the `dispatch` section of `models.json`. Extract the provider from the resolved model string (the part before `/`). If the provider has a dispatch entry, pass `dispatch: <value>` in the subagent call.

Example flow in execute-plan:
1. Task has model recommendation `capable`
2. Resolve: `capable` → `anthropic/claude-opus-4-6`
3. Extract provider: `anthropic`
4. Look up dispatch: `anthropic` → `claude`
5. Dispatch: `subagent { agent: "coder", task: "...", model: "anthropic/claude-opus-4-6", dispatch: "claude" }`

### crossProvider Models

`crossProvider` models (e.g., `openai-codex/gpt-5.4`) are unaffected. The provider `openai-codex` has no entry in the dispatch map, so those tasks continue to route through pi.

## Layer Boundaries

**Layer 1 (subagent extension) knows:**
- How to spawn `pi` or `claude` based on a `dispatch` value
- How to translate args for each CLI
- How to parse each CLI's output into `SingleResult`
- How to read `dispatch` and `permissionMode` from agent frontmatter
- How to accept `dispatch` and `permissionMode` as invocation-time overrides

**Layer 1 does NOT know:**
- What `models.json` is or what model tiers are
- Anything about planning or execution workflows

**Layer 2 (skill configuration) knows:**
- How to read `models.json` including the `dispatch` map
- How to resolve a model tier to a provider and look up its dispatch target
- How to pass `dispatch` as an override when calling `subagent { ... }`

**Layer 2 does NOT know:**
- How to spawn CLIs or parse their output
- What `--permission-mode` means
- Anything about Claude Code's arg format

## Scope

### In scope
- Layer 1: Add `dispatch` and `permissionMode` support to pi's built-in subagent extension, with Claude Code as the first non-pi dispatch target
- Layer 2: Add `dispatch` section to `models.json` and update `generate-plan` and `execute-plan` skills to read it and pass overrides
- Output parsing for Claude Code's `stream-json` format

### Not in scope
- Codex CLI dispatch — the design accommodates it via the extensible `dispatch` field, but implementation is for a future TODO
- Other extensions to the built-in subagent framework (artifacts, async, etc.) — separate TODO
- Changes to agent system prompts or prompt templates — Claude Code has equivalent tools, and the prompts are tool-agnostic
- Changes to `refine-code` / `requesting-code-review` — they use the same subagent dispatch path and inherit dispatch support automatically

### Assumption

Agent system prompts (coder, planner, plan-reviewer, code-reviewer, code-refiner) work without modification when run in Claude Code. They describe what to do, not which tools to call by name. If any prompt references pi-specific tool names, that would need a follow-up fix.
