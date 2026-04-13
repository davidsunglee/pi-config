# Review-Loop Skill Design

## Goal

Add an automated review-remediate loop that iterates between code review and remediation until the code is clean or a max iteration budget is exhausted. This replaces the current fire-and-forget code review in execute-plan Step 12, where findings are surfaced but remediation requires manual intervention.

The skill is top-level — usable standalone (manual sessions, hotfixes, PR cleanup) or invoked by execute-plan.

## Architecture Summary

Three new components:

- **`review-loop` skill** — top-level skill defining the loop protocol. Invocable from any context with a git range and optional requirements.
- **`code-reviewer` agent** — dedicated agent for reviewing diffs. Replaces the current pattern of dispatching `plan-executor` with the `code-reviewer.md` template.
- **`remediation-coordinator` agent** — orchestrates the review-remediate cycle. Dispatched by the caller, drives the inner loop, reports back.

The remediator (the agent that fixes code) is `plan-executor` — fixing issues is executing a task.

## Inputs

Provided by whoever invokes the skill:

- **Git range** — `BASE_SHA..HEAD_SHA` (required; git repo is a hard precondition)
- **Description** — what was implemented
- **Requirements/plan** — spec or plan to review against (optional; if absent, review is purely quality-focused)
- **Max iterations** — default 3
- **Model tiers** — from `~/.pi/agent/settings.json`
- **Working directory** — worktree or project root
- **Review output path** — e.g., `.pi/reviews/<plan>-code-review.md`

## The Loop Protocol

### Iteration 1

1. **Dispatch `code-reviewer`** (model: `crossProvider.capable`)
   - Full diff review: `BASE_SHA..HEAD_SHA`
   - Inputs: description, requirements, diff
   - Output: structured review (Strengths, Issues by severity, Recommendations, Assessment)

2. **Write review** to versioned output path (`<plan>-code-review-v1.md`)

3. **Assess verdict:**
   - "Ready to merge: Yes" with no Critical/Important issues → skip to Final Verification
   - Critical/Important issues exist → continue to step 4

4. **Batch findings for remediation**
   - The coordinator makes a judgment call: group related findings that can be fixed together
   - Consider file proximity, logical coupling, conflict risk
   - Prefer smaller batches — remediation should be deliberate
   - Dispatch one batch at a time (sequential, not parallel)

5. **Dispatch `plan-executor` as remediator** (model: `modelTiers.capable`)
   - Task: fix the batched findings
   - Context: relevant review findings with file:line references, the plan/spec
   - Working dir: same as the original implementation

6. **Commit remediation**
   - Message format: `fix(review): iteration <N> — <summary of fixes>`
   - Body: one line per finding addressed

7. **Record in remediation log** (held in memory, written to review file)

8. If more unbatched findings remain, repeat steps 4-7 within the same iteration before re-reviewing.

### Iteration 2..N (Hybrid Re-Review)

1. **Dispatch `code-reviewer`** (model: `crossProvider.capable`)
   - Hybrid re-review mode: remediation diff only (`prev_HEAD..new_HEAD`)
   - Context includes: previous findings, what was claimed fixed, full plan
   - Job: verify fixes addressed the findings, check for regressions in the remediation diff, flag new issues
   - Must NOT re-review already-approved code outside the remediation diff

2. **Overwrite review sections** in the current versioned review file; **append** to remediation log

3. Steps 3-8 same as iteration 1

### Final Verification

When hybrid reviews converge (no Critical/Important issues):

1. **Dispatch `code-reviewer`** for a single full-diff verification review: `BASE_SHA..current_HEAD`
2. If clean → done, report "clean"
3. If issues found → **reset the iteration budget** and re-enter the remediation loop. This starts a new "era" — create a new versioned review file (`v2`, `v3`, etc.)

### On Budget Exhaustion

When max iterations reached without convergence:

1. Write final state to the current versioned review file (remaining issues + full remediation log)
2. Copy latest version to the unversioned path (`<plan>-code-review.md`)
3. Return to caller with status `max_iterations_reached`, including:
   - Remaining findings (full text)
   - Iteration count
   - What was fixed across all iterations

The caller decides:
- **Continue iterating** — re-invoke the skill (budget resets, new era/version)
- **Proceed** — move forward with known issues noted
- **Stop** — halt execution

### On Clean Review

1. Write final state to the current versioned review file (clean assessment + full remediation log)
2. Copy latest version to the unversioned path
3. Return to caller with status `clean`

## Coordinator Return Contract

The `remediation-coordinator` reports back with:

```
STATUS: clean | max_iterations_reached

## Summary
Iterations: <N>
Issues found: <X> (<N> Critical, <N> Important, <N> Minor)
Issues fixed: <Y>
Issues remaining: <Z>

## Remaining Issues (only if max_iterations_reached)
[Full text of unfixed findings]

## Review File
<path to latest versioned review file>
```

## Review File Format

Each versioned review file (`<plan>-code-review-vN.md`) is self-contained:

```markdown
### Strengths
[What's well done]

### Issues

#### Critical (Must Fix)
[...]

#### Important (Should Fix)
[...]

#### Minor (Nice to Have)
[...]

### Recommendations
[...]

### Assessment
**Ready to merge?** [Yes/No/With fixes]
**Reasoning:** [...]

## Remediation Log

### Iteration 1
- **Fixed:** <finding summary> (<severity>)
- **Fixed:** <finding summary> (<severity>)
- **Deferred:** <N> findings batched to next remediation pass

### Iteration 2
- **Fixed:** <finding summary> (<severity>)
- **Remaining:** None

**Result:** Clean after 2 iterations.
```

Review sections are overwritten each pass (reflecting current state). The remediation log is append-only (accumulating history).

The unversioned path (`<plan>-code-review.md`) is always a copy of the latest versioned file.

## New Agent Definitions

### `agent/agents/code-reviewer.md`

- Dedicated to reviewing diffs for production readiness
- System prompt focused on: reading actual code, severity calibration, structured output, clear verdicts
- No hardcoded model — the dispatcher controls model selection
- Supports two modes via the prompt it receives:
  - Full review (first pass): review entire diff
  - Hybrid re-review (subsequent passes): focus on remediation diff, verify fixes, check regressions

### `agent/agents/remediation-coordinator.md`

- Orchestrates the review-remediate cycle
- Model: `claude-sonnet-4-6` (coordinates, doesn't write code)
- Responsibilities:
  - Dispatch `code-reviewer` for each review pass
  - Assess findings and make batching judgment calls
  - Dispatch `plan-executor` for remediation (one batch at a time, sequentially)
  - Commit per iteration with detailed messages
  - Manage the review file (overwrite review sections, append remediation log)
  - Handle convergence detection and budget tracking
  - Trigger final full-diff verification when hybrid reviews converge

## Prompt Templates

### `review-loop/remediation-prompt.md`

Template filled by the caller and dispatched to `remediation-coordinator`. Placeholders:

- `{PLAN_GOAL}` — what was built
- `{PLAN_CONTENTS}` — full plan/spec (optional; empty if no plan)
- `{BASE_SHA}` — original baseline
- `{HEAD_SHA}` — current HEAD after implementation
- `{REVIEW_OUTPUT_PATH}` — base path for review files (coordinator adds version suffixes)
- `{MAX_ITERATIONS}` — default 3
- `{MODEL_TIERS}` — full modelTiers object for selecting reviewer and remediator models
- `{WORKING_DIR}` — worktree or project root

Contains the full loop protocol so the coordinator is self-contained.

### `review-loop/re-review-block.md`

Content that the coordinator loads and inserts into the `{RE_REVIEW_BLOCK}` placeholder in `requesting-code-review/code-reviewer.md` for iteration 2+. On the first pass, `{RE_REVIEW_BLOCK}` is filled with an empty string.

Placeholders within the block:

- `{PREVIOUS_FINDINGS}` — what was flagged in the prior pass
- `{REMEDIATION_DIFF}` — diff of remediation commits since last review
- Instructions: verify fixes, check regressions in remediation diff, do not re-review already-approved code

## Integration with execute-plan

### Git Precondition

Execute-plan now requires a git repository. Step 0 verifies:

```bash
git rev-parse --git-dir 2>/dev/null
```

If that fails: stop with "execute-plan requires a git repository."

This removes all no-git conditional paths throughout the skill.

### Simplified Settings (Step 3)

Checkpoint commits are always on (git guaranteed). Per-wave spec check subagent is removed (orchestrator-only task verification). Settings are flattened and ordered by execution phase:

```
Plan:  <plan filename>
Goal:  <plan goal>
Tasks: <count> across <N> waves

    Workspace:          <worktree or current>
    TDD:                enabled
    Execution:          parallel, pause on failure
    Integration test:   enabled (npm test)
    Final review:       enabled (max 3 remediation iterations)

Ready to execute: (s)tart / (c)ustomize / (q)uit
```

Customization sequence:
1. Workspace — New worktree / Current workspace (only if not auto-detected)
2. TDD — Enabled / Disabled
3. Execution mode — Sequential / Parallel
4. Wave pacing (if parallel) — Always pause / Never pause / Pause on failure
5. Integration test — Enabled / Disabled (+ custom command if enabling)
6. Final review — Enabled / Disabled (+ max iterations if enabling)

### New Step 12

The current 65 lines of template loading, placeholder filling, model selection, and fallback logic are replaced with:

1. Gather inputs: `PRE_EXECUTION_SHA`, current HEAD, plan goal, plan contents, working dir, max iterations, model tiers
2. Invoke `review-loop` skill
3. Handle coordinator return:
   - `clean` → include review summary in completion report, proceed to Step 13
   - `max_iterations_reached` → present remaining findings, offer: (a) continue iterating, (b) proceed with known issues, (c) stop

### Task Verification (Renamed from "Spec Check")

Per-wave task verification is now orchestrator-only. After each wave, the orchestrator reads output files and checks acceptance criteria against the plan — no subagent dispatch. This is the existing Step 9 behavior minus the spec-reviewer subagent.

`agent/skills/execute-plan/spec-reviewer.md` is removed.

## File Changes Summary

### New Files

| File | Purpose |
|---|---|
| `agent/agents/code-reviewer.md` | Agent definition — reviewing diffs for production readiness |
| `agent/agents/remediation-coordinator.md` | Agent definition — orchestrates review-remediate loop |
| `agent/skills/review-loop/SKILL.md` | Top-level skill — loop protocol |
| `agent/skills/review-loop/remediation-prompt.md` | Template dispatched to remediation-coordinator |
| `agent/skills/review-loop/re-review-block.md` | Conditional block for hybrid re-review passes |

### Modified Files

| File | Change |
|---|---|
| `agent/skills/execute-plan/SKILL.md` | Git precondition, flattened settings, task verification (orchestrator-only), Step 12 replaced with skill invocation |
| `agent/skills/requesting-code-review/code-reviewer.md` | Add `{RE_REVIEW_BLOCK}` placeholder. This existing template serves as the prompt dispatched to the new `code-reviewer` agent — no second template is created. |

### Removed Files

| File | Reason |
|---|---|
| `agent/skills/execute-plan/spec-reviewer.md` | Replaced by orchestrator-only task verification |

### Runtime Artifacts

| Artifact | Path | Lifecycle |
|---|---|---|
| Review v1 | `.pi/reviews/<plan>-code-review-v1.md` | Created on first full review |
| Review v2..N | `.pi/reviews/<plan>-code-review-vN.md` | Created on budget reset (new era) |
| Latest review | `.pi/reviews/<plan>-code-review.md` | Copy of latest version, always current |
| Remediation commits | Git history | `fix(review): iteration N — <summary>` |
