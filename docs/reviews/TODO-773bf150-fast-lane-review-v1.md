**Reviewer:** openai-codex/gpt-5.5 via pi

### Outcome

**Verdict:** Approved

**Reasoning:** The diff stays within `pi-config`, targets the Claude-compatible non-coordinator agent prompts, and adds explicit tool-based `subagent_done` completion requirements without changing runtime or watcher behavior. I found no Critical or Important production-readiness issues.

### Strengths

- `agent/agents/coder.md:84` and `agent/agents/verifier.md:121` add clear terminal completion sections for non-artifact agents, including the important distinction that `subagent_done()` is a tool invocation rather than prose.
- `agent/agents/code-reviewer.md:65` and `agent/agents/plan-reviewer.md:95` preserve artifact-marker mode while also clarifying standalone mode should call `subagent_done()` without a structured marker message.
- `agent/agents/planner.md:248` covers both initial-generation and edit-mode planner dispatches, avoiding a completion-reporting gap in the edit path.
- `agent/agents/scout.md:23`, `agent/agents/spec-designer.md:24`, and `agent/agents/test-runner.md:158` reinforce byte-equal marker payloads for artifact handoffs and explicitly reject merely printing the marker as sufficient completion.

### Issues

#### Critical (Must Fix)

_None._

#### Important (Should Fix)

_None._

#### Minor (Nice to Have)

_None._

### Recommendations

- Continue the planned observational verification with Claude CLI-backed mux subagents, since this change intentionally hardens prompts only and leaves runtime fallback behavior out of scope.
