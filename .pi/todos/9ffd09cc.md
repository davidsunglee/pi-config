{
  "id": "9ffd09cc",
  "title": "Strengthen execute-plan worker discipline and test-failure handling",
  "tags": [
    "execute-plan",
    "tdd",
    "debugging",
    "integration-tests",
    "ux-consistency"
  ],
  "status": "open",
  "created_at": "2026-04-13T20:00:00.000Z"
}

## Summary

Strengthen the execution pipeline in two related areas:
1. Give worker agents much stronger TDD guidance or direct access to the TDD skill.
2. Improve post-wave integration test failure handling in `execute-plan` Step 9b so failures are debugged systematically and user choices match suite conventions.

This todo now absorbs `TODO-845e6978` as an internal task rather than tracking it separately.

## Why this belongs together

Both tasks improve the reliability of plan execution after worker dispatch:
- stronger TDD discipline should reduce regressions introduced by workers
- better Step 9b handling should make regressions easier to diagnose and resolve when they still happen

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

#### Goal

Either inject the full TDD skill content (or a substantial subset including at minimum the rationalization prevention and verification checklist) into the worker prompt via `{TDD_BLOCK}`, or have the worker invoke the TDD skill directly.

Evaluate token cost tradeoffs — the full skill is ~306 lines, but the rationalization prevention section is what gives it teeth.

### Task 2: Improve Step 9b integration test failure handling

_Absorbed from `TODO-845e6978`._

#### Problem

`execute-plan` Step 9b (post-wave integration test failure) has two issues:

##### 2.1 Blunt retry strategy

When integration tests fail after a wave, the current behavior is:
1. Undo the wave commit
2. Re-dispatch **all** tasks in the wave with raw test output appended
3. Hope the workers figure out what broke

This does not analyze which task caused the failure, does not do targeted debugging, and re-runs tasks that were probably fine.

##### 2.2 Inconsistent user choice presentation

Step 9b uses `(r)/(s)/(x)` mnemonic letters, while other choice points in the suite use `(a)/(b)/(c)` with imperative verb phrases:

- generate-plan Step 4: `(a) Keep iterating` / `(b) Proceed with issues`
- execute-plan Step 12: `(a) Keep iterating` / `(b) Proceed with issues` / `(c) Stop execution`

#### Goal

Replace the blunt retry path with a more systematic debugging flow and align the Step 9b user choices with the suite's standard wording.

#### Expected changes

- Invoke the `systematic-debugging` skill (or an equivalent targeted debugging flow) instead of blindly re-dispatching all wave tasks
- Analyze test failure output to identify the likely regression source
- Attempt targeted fixes and re-run tests to verify
- Replace `(r)/(s)/(x)` with:
  - **(a) Debug failures** — kick off systematic debugging for the failing tests
  - **(b) Skip tests** — proceed to the next wave despite failures
  - **(c) Stop execution** — skip completion and report partial progress

## Completion criteria

This todo is complete when:
- worker-facing TDD enforcement is meaningfully stronger than the current condensed block
- `execute-plan` Step 9b no longer uses the blunt full-wave retry strategy
- Step 9b user choices follow the suite-wide `(a)/(b)/(c)` convention
- the implementation is internally consistent across prompts, skills, and orchestration flow
