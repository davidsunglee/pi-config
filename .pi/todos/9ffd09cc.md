{
  "id": "9ffd09cc",
  "title": "Strengthen execute-plan worker discipline, test-failure handling, and subagent limits",
  "tags": [
    "execute-plan",
    "tdd",
    "debugging",
    "integration-tests",
    "ux-consistency"
  ],
  "status": "done",
  "created_at": "2026-04-13T20:00:00.000Z"
}

## Summary

Strengthen the execution pipeline in three related areas:
1. Give worker agents much stronger TDD guidance by using a **hybrid approach**: embed a substantially stronger TDD block in the worker prompt, instruct workers to consult the full `test-driven-development` skill when implementing or fixing code, and require brief RED/GREEN evidence in worker reports when TDD is enabled and production code changes.
2. Improve post-wave integration test failure handling in `execute-plan` **Step 11** so failures are debugged systematically and user choices match suite conventions.
3. Align the execute-plan wave size limit with the pi-subagent extension's `MAX_PARALLEL_TASKS` constant (currently 8) instead of hardcoding a separate value.

This todo now absorbs `TODO-845e6978` as an internal task rather than tracking it separately.

## Why this belongs together

All three tasks improve the reliability of plan execution after worker dispatch:
- stronger TDD discipline should reduce regressions introduced by workers
- better Step 11 handling should make regressions easier to diagnose and resolve when they still happen
- respecting the subagent extension's own limits prevents the skill from either under-utilizing capacity or exceeding the extension's enforced maximum

## Tasks

### Task 1: Strengthen TDD guidance for workers

#### Problem

The full TDD skill (`test-driven-development/SKILL.md`) is 306 lines with rationalization prevention, red flags, verification checklists, and debugging integration. Workers currently receive only a short condensed version inlined via `{TDD_BLOCK}` in the worker prompt.

The condensed version drops:
- Rationalization prevention table (10+ excuses and counters) — specifically designed for LLMs that want to skip the red phase
- 8-point verification checklist
- 13 red-flag stop conditions
- "When stuck" troubleshooting table

The workers — the agents that actually need TDD discipline — get the weakest version. The orchestrator, who doesn't write code, has access to the full skill.

#### Design decision

Use a **hybrid approach**:
- strengthen `{TDD_BLOCK}` substantially so the worker prompt itself carries the most behavior-shaping TDD guidance
- also instruct workers to consult the full `test-driven-development/SKILL.md` when doing implementation or bug-fix work
- require workers to include compact **RED/GREEN evidence** in their report when TDD is enabled and they changed production code

Rationale:
- the worker prompt is the highest-salience instruction surface and should carry the core discipline directly
- the full skill remains available as supporting depth and reference material
- RED/GREEN evidence makes TDD behavior observable rather than purely aspirational
- this is stronger than merely pointing workers at the full skill, but less brittle than relying on a tiny summary alone

#### Goal

Replace the current minimal `{TDD_BLOCK}` with a much stronger excerpt from the TDD skill, update the worker instructions so coders are explicitly told to read or consult the full TDD skill when implementing or fixing code, and make the worker report format require concise RED/GREEN evidence when TDD is enabled and production code changed.

At minimum, the strengthened prompt block should preserve the TDD skill sections that give it teeth:
- Iron Law / no production code without a failing test first
- red/green verification steps
- rationalization prevention guidance
- red-flag stop conditions
- verification checklist
- debugging / when-stuck guidance

Evaluate prompt-size tradeoffs, but prioritize preserving the anti-rationalization and verification content over keeping the block short.

#### Expected changes

- Expand `{TDD_BLOCK}` in `agent/skills/execute-plan/SKILL.md` so it contains a substantially richer TDD excerpt than the current 8-line summary
- Update `agent/skills/execute-plan/execute-task-prompt.md` so workers are told that when they are implementing or fixing code, they must consult the full `test-driven-development` skill in addition to following the embedded TDD block
- Update the worker report instructions so that when TDD is enabled and production code changed, `## Tests` includes brief RED/GREEN evidence:
  - **RED:** what failing test was added or run first, and the expected failure reason
  - **GREEN:** what passed after implementation
- Keep the worker-facing guidance internally consistent between the skill assembly instructions, the dispatched prompt template, and the expected report format

### Task 2: Improve Step 11 integration test failure handling

_Absorbed from `TODO-845e6978`._

#### Problem

`execute-plan` **Step 11** (post-wave integration test failure handling) has two issues:

##### 2.1 Blunt retry strategy

When integration tests fail after a wave, the current behavior is:
1. Undo the wave commit
2. Re-dispatch **all** tasks in the wave with raw test output appended
3. Hope the workers figure out what broke

This does not analyze which task caused the failure, does not do targeted debugging, and re-runs tasks that were probably fine.

##### 2.2 Inconsistent user choice presentation

The Step 11 integration-test failure branch uses `(r)/(s)/(x)` mnemonic letters, while other choice points in the suite use `(a)/(b)/(c)` with imperative verb phrases:

- generate-plan Step 4: `(a) Keep iterating` / `(b) Proceed with issues`
- execute-plan Step 12: `(a) Keep iterating` / `(b) Proceed with issues` / `(c) Stop execution`

#### Design decision

Use a **debugger-first flow** without introducing a new agent type in this iteration:
- on post-wave integration test failure, dispatch a **debugging-oriented pass first** rather than immediately re-running the whole wave
- the debugging pass should use the existing worker agent shape with a prompt that explicitly follows the `systematic-debugging` skill
- if the debugging pass identifies a clear, localized fix with high confidence, it may both diagnose and remediate in the same dispatch
- if the issue is not clearly localized, the debugging pass should return a diagnosis that drives a follow-up **targeted** remediation dispatch for only the implicated task(s) or files
- do **not** add a new `debugger` agent as part of this todo unless the implementation work uncovers a compelling need that should be split into a separate follow-up

Rationale:
- this preserves root-cause-first discipline without forcing two additional subagent dispatches for every test failure
- it avoids the scope increase of defining, validating, and integrating a brand-new agent type
- it still replaces blunt full-wave redispatch with a more surgical debugging/remediation flow

#### Goal

Replace the blunt retry path in Step 11 with a more systematic debugging flow and align the Step 11 user choices with the suite's standard wording.

#### Expected changes

- Invoke the `systematic-debugging` skill (or an equivalent targeted debugging flow) instead of blindly re-dispatching all wave tasks
- Analyze test failure output to identify the likely regression source
- Start with a debugging-oriented dispatch that can either:
  - diagnose **and** remediate when the root cause is clear and localized, or
  - return a diagnosis that triggers targeted follow-up remediation for only the implicated task(s)
- Avoid re-running unaffected tasks from the wave unless the diagnosis genuinely implicates them
- Replace `(r)/(s)/(x)` with:
  - **(a) Debug failures** — kick off systematic debugging for the failing tests
  - **(b) Skip tests** — proceed to the next wave despite failures
  - **(c) Stop execution** — skip completion and report partial progress

### Task 3: Align wave size limit with pi-subagent extension

#### Problem

The `execute-plan` skill hardcodes a wave size limit of 7 tasks (SKILL.md line 154: "If a wave has more than 7 tasks, split it into sequential sub-waves of ≤7 tasks each"). Meanwhile, the pi-subagent extension enforces its own maximum of 8 parallel tasks (`MAX_PARALLEL_TASKS = 8` in `pi-subagent/index.ts:31`), rejecting any dispatch that exceeds it.

These two limits are defined independently. The skill's limit (7) is more restrictive than the extension's (8), which wastes one slot of available parallelism. More importantly, the two values can drift apart — if the extension's limit changes, the skill won't know, and could either under-utilize capacity or attempt dispatches that get rejected.

#### Goal

The execute-plan skill should never dispatch more parallel agents than the pi-subagent extension allows. The skill's wave size limit should be derived from or explicitly aligned with the extension's `MAX_PARALLEL_TASKS` (currently 8), not hardcoded separately.

#### Expected changes

- Update the wave splitting threshold in `execute-plan/SKILL.md` from ≤7 to ≤8, matching the extension's current `MAX_PARALLEL_TASKS`
- Add a comment or note anchoring the value to the pi-subagent extension's limit so future maintainers know the source of truth
- Verify that no other locations in the execute-plan skill or related orchestration code hardcode a different parallel task limit

## Completion criteria

This todo is complete when:
- worker-facing TDD enforcement follows the hybrid approach: a substantially stronger embedded TDD block, explicit worker instruction to consult the full TDD skill, and RED/GREEN report evidence when TDD is enabled and production code changed
- the strengthened worker-facing TDD guidance is meaningfully stronger than the current condensed block
- `execute-plan` Step 11 no longer uses the blunt full-wave retry strategy
- post-wave test failure handling follows the debugger-first flow: diagnose first, remediate in the same dispatch when localized, otherwise target only the implicated follow-up work
- Step 11 user choices follow the suite-wide `(a)/(b)/(c)` convention
- the execute-plan wave size limit matches the pi-subagent extension's `MAX_PARALLEL_TASKS` (currently 8)
- the implementation is internally consistent across prompts, skills, and orchestration flow

Completed via plan: .pi/plans/done/2026-04-17-strengthen-execute-plan-worker-discipline-test-failure-handling-and-subagent-limits.md
