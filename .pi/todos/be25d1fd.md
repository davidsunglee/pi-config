{
  "id": "be25d1fd",
  "title": "Add dispatch routing to skills via model-tiers.json dispatch map",
  "tags": [
    "execute-plan",
    "generate-plan",
    "refine-code",
    "model-tiers",
    "dispatch",
    "claude-code",
    "pi-subagent"
  ],
  "status": "done",
  "created_at": "2026-04-14T16:40:00.000Z"
}

## Summary

Add a `dispatch` key to `model-tiers.json` that maps provider prefixes to CLI dispatch targets, and update the generate-plan, execute-plan, and refine-code skills to resolve and pass `dispatch` on every subagent call. This is **Layer 2** of the Claude Code dispatch design (Layer 1 — general-purpose dispatch support in pi-subagent — is tracked separately in the pi-subagent repo, spec at `.pi/designs/2026-04-14-claude-code-dispatch-design.md`).

## Motivation

Anthropic subscription plans (Max, etc.) include usage quotas when using Claude Code, but API calls from pi count as extra usage at higher cost. Layer 1 gave the pi-subagent extension the ability to spawn `claude` instead of `pi`. Layer 2 makes the skills actually use it — routing Anthropic-model tasks through the Claude Code CLI while leaving cross-provider tasks on pi.

## Configuration

A new `dispatch` key in `~/.pi/agent/model-tiers.json`. The value is an object keyed by provider prefix (the left side of `provider/model-id` strings), with each value being the dispatch target string passed to the subagent's `dispatch` property.

### Example

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
        "anthropic": "claude",
        "openai-codex": "pi"
    }
}
```

### Resolution logic

Given a resolved model string like `anthropic/claude-opus-4-6`:
1. Extract the provider prefix — the substring before the first `/` (e.g., `anthropic/claude-opus-4-6` → `anthropic`)
2. Look up `dispatch["anthropic"]` → `"claude"`
3. Pass `dispatch: "claude"` in the subagent call

Always pass `dispatch` explicitly on every subagent call, even when it resolves to `"pi"`. This makes routing visible and auditable.

If the `dispatch` key is absent from `model-tiers.json` or the provider has no entry in the dispatch map, default to `"pi"` (current behavior, fully backward-compatible).

### Layer 1 accepted values

The pi-subagent extension (`VALID_DISPATCHES` in `pi-subagent/claude-args.ts`) currently accepts:
- `"pi"` — route through the pi CLI (default)
- `"claude"` — route through the Claude Code CLI

Resolution order in the extension: tool call `dispatch` override → agent frontmatter `dispatch` → `"pi"` (default).

### Future dispatch targets

The `dispatch` field is a string, not an enum. Future values include `"codex-cli"` and `"gemini-cli"` as those backends are added to pi-subagent (Layer 1 for each).

## Affected skills

### generate-plan (`agent/skills/generate-plan/SKILL.md`)

Subagent calls that need `dispatch`:

| Step | Agent | Model tier | Current call |
|------|-------|-----------|-------------|
| Step 3 | `planner` | `capable` | `subagent { agent: "planner", task: "...", model: "<capable>" }` |
| Step 4.1 | `plan-reviewer` | `crossProvider.capable` | `subagent { agent: "plan-reviewer", task: "...", model: "<crossProvider.capable>" }` |
| Step 4.1 fallback | `plan-reviewer` | `capable` | retry with `capable` on cross-provider failure |
| Step 4.3 | `planner` | `capable` | `subagent { agent: "planner", task: "...", model: "<capable>" }` |

### execute-plan (`agent/skills/execute-plan/SKILL.md`)

Subagent calls that need `dispatch`:

| Step | Agent | Model tier | Current call |
|------|-------|-----------|-------------|
| Step 7 parallel | `coder` | per-task tier | `subagent { tasks: [{ agent: "coder", task: "...", model: "<resolved>" }, ...] }` |
| Step 7 sequential | `coder` | per-task tier | `subagent { agent: "coder", task: "...", model: "<resolved>" }` |
| Step 10 re-dispatch | `coder` | per-task tier | same as Step 7, with appended context |

Note: execute-plan Step 12 invokes the `refine-code` skill (not a direct subagent call). Dispatch for Step 12's reviewers and remediator is handled transitively — the refine-code section below covers those calls. Step 9 (wave output verification) is performed by the orchestrator directly and has no subagent dispatch.

### refine-code (`agent/skills/refine-code/SKILL.md` + `refine-code-prompt.md`)

The outer skill dispatches once; the inner prompt (run by `code-refiner`) dispatches multiple times:

| Location | Agent | Model tier | Current call |
|----------|-------|-----------|-------------|
| SKILL.md Step 4 | `code-refiner` | `standard` | `subagent { agent: "code-refiner", task: "...", model: "<standard>" }` |
| Prompt: iteration 1 | `code-reviewer` | `crossProvider.capable` | dispatched by code-refiner |
| Prompt: iteration 2..N | `code-reviewer` | `standard` | dispatched by code-refiner |
| Prompt: remediator | `coder` | `capable` | dispatched by code-refiner |
| Prompt: final verification | `code-reviewer` | `crossProvider.capable` | dispatched by code-refiner |

The `refine-code-prompt.md` passes the full model matrix JSON via `{MODEL_MATRIX}` — the code-refiner already has the tier data. The prompt instructions will need to explain dispatch resolution so the code-refiner passes it correctly.

## Expected changes

### model-tiers.json
- Add the `dispatch` key with provider-to-target mappings

### All three SKILL.md files
- After resolving the model tier, also resolve the dispatch target by extracting the provider prefix and looking it up in `dispatch`
- Add `dispatch: "<resolved>"` to every `subagent { ... }` call example
- Document the resolution logic once (likely in execute-plan Step 6 where model tiers are already resolved, with cross-references from the other skills)
- Ensure fallback paths also resolve dispatch for the fallback model — when falling back from `crossProvider.capable` to `capable`, the dispatch target will change if the providers differ (e.g., `openai-codex/gpt-5.4` dispatches to `pi`, fallback to `anthropic/claude-opus-4-6` dispatches to `claude`)

### refine-code-prompt.md
- Rename the existing "Use these model tiers for dispatch:" heading to "Model tier assignments" to avoid collision with the `dispatch` property name
- Add dispatch resolution instructions so the code-refiner knows how to derive the dispatch target from the model matrix it receives (the `dispatch` map is included in `{MODEL_MATRIX}` since it's part of `model-tiers.json`)

### Backward compatibility
- If `dispatch` key is absent from `model-tiers.json`, all dispatch values default to `"pi"` — existing behavior preserved
- No changes to pi-subagent extension (Layer 1 already supports the `dispatch` property)

## Dependencies

- **Layer 1** (pi-subagent Claude Code dispatch): must be implemented and working before this todo is actionable. Tracked in `pi-subagent` repo, design spec at `.pi/designs/2026-04-14-claude-code-dispatch-design.md`.

## Completion criteria

This todo is complete when:
- `model-tiers.json` has a `dispatch` key that maps provider prefixes to dispatch targets
- generate-plan, execute-plan, and refine-code skills resolve and pass `dispatch` on every subagent call
- cross-provider fallback paths resolve dispatch for the fallback model
- the refine-code coordinator prompt includes dispatch resolution instructions
- omitting the `dispatch` key from `model-tiers.json` preserves current behavior (default to `"pi"`)
