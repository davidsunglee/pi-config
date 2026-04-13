{
  "id": "9ffd09cc",
  "title": "Strengthen TDD in workers and make plan review surgical instead of full regen",
  "tags": ["execute-plan", "generate-plan", "tdd", "plan-review"],
  "status": "open",
  "created_at": "2026-04-13T20:00:00.000Z"
}

## Problem 1: TDD integration is shallow

The full TDD skill (test-driven-development/SKILL.md) is 306 lines with rationalization prevention, red flags, verification checklists, and debugging integration. Workers receive a 10-line condensed version inlined via `{TDD_BLOCK}` in implementer-prompt.md.

The condensed version drops:
- Rationalization prevention table (10+ excuses and counters) — specifically designed for LLMs that want to skip the red phase
- 8-point verification checklist
- 13 red-flag stop conditions
- "When stuck" troubleshooting table

The workers — the agents that actually need TDD discipline — get the weakest version. The orchestrator, who doesn't write code, has access to the full skill.

### Goal

Either inject the full skill content (or a substantial subset including at minimum the rationalization prevention and verification checklist) into the worker prompt via `{TDD_BLOCK}`, or have the worker invoke the TDD skill directly. Evaluate token cost tradeoff — the full skill is ~306 lines but the rationalization prevention section is what gives it teeth.

## Problem 2: Plan regeneration is wasteful

In generate-plan Step 3.5, when the reviewer finds errors and the user chooses "Re-generate," the plan-generator runs from scratch with reviewer findings appended. A plan with 8 good tasks and 1 bad task gets fully regenerated, potentially losing good structure or introducing new issues. There is no versioning — the original plan is overwritten.

### Goal

Replace full regeneration with surgical plan editing:

- Add a `plan-editor` mode (new agent or extended generator capability) that receives the existing plan + reviewer findings and produces targeted edits rather than a full rewrite
- Preserve plan versions: when editing, save the original as `<plan>.v1.md` (or similar) before applying edits
- Fallback: if the editor can't resolve issues surgically, offer full regeneration as a last resort
- Consider having the reviewer output concrete, actionable diffs rather than prose findings to make surgical edits easier
