# Execute-Plan Blocked Task Escalation

Source: TODO-8ddd2e17

## Goal

Make `execute-plan` surface `BLOCKED` worker outcomes as soon as they become actionable, without waiting for the full run to finish under permissive wave pacing settings. The workflow should preserve already-started same-wave work, then stop before any further waves begin so the user can intervene while blocker context is still fresh.

## Context

`agent/skills/execute-plan/SKILL.md` currently defines wave pacing in Step 3 (`Pause between waves / Auto-continue / Auto-continue unless failures`), handles `BLOCKED` in Step 9 by assessing the blocker and choosing a recovery path, and applies pacing in Step 12 after failures and retries. That means the skill clearly describes what a `BLOCKED` result means, but it does not currently separate blocker escalation timing from general wave pacing behavior. The 2026-04-17 workflow evaluation in `docs/analysis/2026-04-17-workflow-evaluation.md` calls this out explicitly: under “never pause,” a `BLOCKED` task can surface only at end-of-run, after useful context has decayed and dependent later-wave work may already have been wasted. The worker protocol in `agent/agents/coder.md` also distinguishes `STATUS: BLOCKED` from `STATUS: NEEDS_CONTEXT`, so the codebase already treats `BLOCKED` as a distinct escalation case rather than just another ordinary retry condition.

## Requirements

- `execute-plan` must treat `STATUS: BLOCKED` as an immediate escalation case that bypasses normal wave pacing behavior.
- If one or more tasks in a wave return `BLOCKED`, `execute-plan` must not start any later wave before surfacing those blocked results to the user.
- `execute-plan` may allow tasks already in flight within the current wave to finish before surfacing the blocker.
- When the current wave has drained, `execute-plan` must present a combined escalation view covering every task in that wave that returned `BLOCKED`.
- The combined escalation view must include each blocked task’s identity and blocker details.
- The combined escalation view must also include a brief summary of the rest of the current wave, including which same-wave tasks completed successfully.
- The workflow must preserve the existing intervention types for blocked work: provide more context, use a better model, break the task into sub-tasks, or stop execution.
- The intervention decision must be selectable per blocked task rather than forced as a single action for the whole wave.
- The combined escalation flow must let the user see all blocked tasks before deciding which one to address first.
- A wave that contains any unresolved `BLOCKED` task must not be treated as successfully completed.
- If a wave contains both successful tasks and blocked tasks, `execute-plan` must withhold the normal post-wave commit step until the blocked tasks are addressed and the wave completes successfully.
- If a wave contains both successful tasks and blocked tasks, `execute-plan` must also withhold the normal post-wave integration test step until the blocked tasks are addressed and the wave completes successfully.

## Constraints

- This spec only changes `BLOCKED` escalation timing and presentation in `execute-plan`.
- Do not change `NEEDS_CONTEXT` behavior as part of this scope.
- Do not require cancelling already-running same-wave tasks mid-execution.
- Do not redesign general wave pacing semantics for successful waves.
- Do not introduce partial-wave checkpoint commits or partial-wave integration-test runs.
- Do not expand this spec to cover resume semantics, revision flows, or project-local model-tier overrides.

## Acceptance Criteria

- Under any wave pacing option, if at least one task in the current wave returns `BLOCKED`, no subsequent wave is started before the user is shown the blocker escalation.
- If other tasks in the same wave were already running when the first `BLOCKED` result occurred, they are allowed to finish before the escalation is shown.
- When multiple tasks in the same wave return `BLOCKED`, the user sees a single combined escalation screen covering all of them.
- The combined escalation screen includes blocker details for each blocked task and a concise summary of same-wave task outcomes, including successful completions.
- From the combined escalation flow, the user can make an intervention choice separately for each blocked task rather than being limited to one wave-wide action.
- The available interventions for each blocked task still include more context, better model, break into sub-tasks, and stop execution.
- If any task in the wave remains blocked, the workflow does not perform the normal post-wave commit.
- If any task in the wave remains blocked, the workflow does not perform the normal post-wave integration test.
- Once the blocked task or tasks are addressed and the wave completes successfully, the existing post-wave commit and integration-test flow proceeds normally.

## Non-Goals

- Changing how successful waves are paced.
- Introducing immediate cancellation of peer tasks already running in the same wave.
- Redesigning the full execution UI beyond the blocked-task escalation view.
- Changing `NEEDS_CONTEXT`, `DONE_WITH_CONCERNS`, or other worker-status handling outside this blocked-task scope.
- Defining resume/checkpoint behavior for partially completed blocked waves.
