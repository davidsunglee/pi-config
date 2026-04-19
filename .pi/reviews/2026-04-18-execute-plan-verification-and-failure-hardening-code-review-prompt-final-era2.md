<!-- Review dispatch prompt for era 2 final full-diff verification -->
# Code Review Agent

You are reviewing code changes for production readiness.

**Your task:**
1. Review Harden the generate-plan + execute-plan pipeline so (a) every plan acceptance criterion carries its own reproducible `Verify:` recipe, (b) wave verification is performed by a fresh-context verifier agent instead of the orchestrator self-auditing, (c) task and integration failures cannot silently degrade into nominally successful runs, and (d) `DONE_WITH_CONCERNS` concerns are explicitly typed and handled with a combined wave-level checkpoint. Final completion is gated on both per-task verification PASS and resolution of any deferred integration regressions.
2. Compare against the requirements below
3. Check code quality, architecture, testing
4. Categorize issues by severity
5. Assess production readiness

## What Was Implemented

Harden the generate-plan + execute-plan pipeline so (a) every plan acceptance criterion carries its own reproducible `Verify:` recipe, (b) wave verification is performed by a fresh-context verifier agent instead of the orchestrator self-auditing, (c) task and integration failures cannot silently degrade into nominally successful runs, and (d) `DONE_WITH_CONCERNS` concerns are explicitly typed and handled with a combined wave-level checkpoint. Final completion is gated on both per-task verification PASS and resolution of any deferred integration regressions.

## Requirements/Plan

# Execute-Plan Verification and Failure Hardening

Source: TODO-bf68a11b

## Goal

Strengthen `execute-plan` so wave completion is gated by independent, reproducible verification rather than orchestrator self-audit, and so task or integration failures cannot be silently skipped into a nominally successful run. The workflow should require explicit verification recipes in plan acceptance criteria, use a fresh-context verifier for per-task judgment, preserve limited mid-run deferral for integration regressions, and block final completion until both task verification and deferred integration issues are actually resolved.

## Context

`agent/skills/generate-plan/generate-plan-prompt.md` currently asks the planner to produce plans but does not require a structured verification recipe for each acceptance criterion. `agent/skills/generate-plan/review-plan-prompt.md` reviews acceptance-criteria quality in general terms, and `agent/skills/generate-plan/edit-plan-prompt.md` only says to address review findings surgically, so the plan pipeline does not yet enforce reproducible verification instructions. On the execution side, `agent/skills/execute-plan/SKILL.md` still describes Step 10 as orchestrator-led wave verification, Step 11 as allowing test failures to be skipped so later waves can continue, and Step 12 as allowing failed tasks to be skipped after retries. `agent/agents/coder.md` and `agent/skills/execute-plan/execute-task-prompt.md` support `DONE_WITH_CONCERNS`, but concerns are still free-form rather than explicitly typed for workflow handling. `README.md` also documents wave verification as orchestrator self-check. This leaves Step 10 as the weakest fresh-context boundary in a workflow that otherwise already separates planner/reviewer and coder/reviewer roles.

## Requirements

- `generate-plan` must require every acceptance criterion in newly generated plans to use a strict two-line structure:
  - a criterion line describing the expected outcome
  - an immediately following `Verify: <recipe>` line describing how to check it
- The `Verify:` recipe must be specific enough that a fresh reader can reproduce the check without re-deriving intent.
- `Verify:` recipes may describe command execution, file-pattern inspection, file-content inspection, or other concrete prose inspection steps; they do not need to be limited to executable assertions.
- `generate-plan` review and edit passes must enforce that every acceptance criterion has its own immediately associated `Verify:` line.
- Missing `Verify:` lines must be treated as blocking review errors rather than warnings or style notes.
- `execute-plan` must replace Step 10 orchestrator self-audit with a fresh-context per-task verification pass performed by a dedicated verifier role.
- The verifier role must judge each task independently against that task's acceptance criteria and `Verify:` recipes, returning per-criterion verdicts plus an overall task verdict.
- Acceptance criteria are binary: if any single criterion fails, the task is not verified and must be treated as failed.
- Command-style verification recipes must be executed by the orchestrator, not by the verifier. The orchestrator must capture the exact command, exit status, and relevant stdout/stderr and pass that evidence into verification.
- File-inspection and prose-inspection recipes may be evaluated directly by the verifier by reading the relevant files and diff context.
- The verifier must be judge-only: it may read files and supplied evidence, but it must not run extra exploratory shell commands beyond the evidence already collected for the recipe being judged.
- The verifier should default to the `standard` tier and use `capable` when verifying a task that was executed at the `capable` tier.
- Backward compatibility with older plans is not required; this change may assume future plans follow the new acceptance-criteria structure.
- `execute-plan` Step 12 must remove the option to skip failed tasks for all task-level failures. After retries are exhausted, the only available outcomes are retry again or stop execution.
- Step 10 verification failures must feed into the same binary Step 12 failure handling as any other incorrect task output.
- `execute-plan` must preserve a mid-run integration-failure deferral path in Step 11, but it must be framed as deferring integration debugging rather than skipping tests.
- While a run is active, integration tracking must distinguish three separate sets: pre-existing baseline failures, deferred integration regressions introduced during this execution, and additional new regressions introduced after deferment.
- When integration tests are not clean, user-facing summaries must present those three sets separately with explicit headings for each set.
- If the user defers integration debugging during an intermediate wave, later waves may continue, but deferred integration regressions must remain tracked and visible.
- After the final wave, unresolved deferred integration regressions must block normal completion. At that point the only available next steps are to run the integration-debugging flow or stop execution.
- `execute-plan` must not move the plan to `.pi/plans/done/`, close the linked todo, or enter branch-completion flow while unresolved deferred integration regressions remain.
- If execution stops while deferred integration regressions remain, `execute-plan` must report them clearly in the stop summary, but persistence/restoration of that tracking across a later resume is out of scope.
- If any task in a drained wave reports `DONE_WITH_CONCERNS`, `execute-plan` must pause before Step 10 and present a combined wave-level checkpoint covering all such tasks.
- The `DONE_WITH_CONCERNS` checkpoint must show all concerned tasks together, distinguish them per task, and collect choices per task rather than interrupting as each worker returns.
- `DONE_WITH_CONCERNS` concerns must be explicitly typed by the worker contract as `correctness`, `scope`, or `observation`.
- For `DONE_WITH_CONCERNS` items typed as `correctness` or `scope`, the checkpoint must require remediation or stop before verification proceeds.
- For `DONE_WITH_CONCERNS` items typed only as `observation`, the checkpoint may allow verification to proceed, but only after explicit user acknowledgment.
- The per-task concern menus must support:
  - for `correctness` or `scope`: remediate now or stop execution
  - for `observation`: acknowledge and continue to verification, remediate now, or stop execution
- The spec must include explicit user-facing wording changes for the hardened flow rather than leaving all labels and option text to planner discretion.
- The Step 11 intermediate-wave integration option must be renamed from `Skip tests` to `Defer integration debugging`, with copy that makes clear remaining waves may continue but final completion is blocked until deferred regressions are resolved.
- Step 12 user-facing failure prompts must remove all `skip the failed task` wording and leave only retry-oriented and stop-execution choices.

## Constraints

- Do not broaden this work into a general plan-schema validator or other deferred mega-todo items outside verification and failure handling.
- Do not require compatibility with already executed older plans that lack `Verify:` lines.
- Do not make the verifier a second orchestrator or a general-purpose shell runner.
- Do not remove the existing ability to defer integration debugging during intermediate waves.
- Do not allow unresolved task failures to be treated as successful execution outcomes.
- Do not allow unresolved deferred integration regressions to be treated as successful final completion outcomes.
- Do not require deferred integration tracking to persist across a future resume of the plan.
- Keep the workflow compatible with prompt-, docs-, and skill-heavy plans where verification recipes may rely on targeted file inspection rather than executable tests alone.

## Acceptance Criteria

- Newly generated plans use a strict acceptance-criteria format where each criterion line is immediately followed by its own `Verify:` line.
- Plan review fails with blocking severity if any acceptance criterion lacks an immediately associated `Verify:` line.
- Step 10 no longer relies on orchestrator self-grading; it uses a fresh-context verifier that returns per-criterion `PASS`/`FAIL` evidence and an overall task verdict.
- If any single acceptance criterion fails during verification, the task is treated as not verified and enters Step 12 failure handling.
- Step 12 no longer presents any user-facing option to skip a failed task and continue; after retries, the only user-visible task-failure choices are retry or stop.
- The Step 11 integration-failure menu no longer says `Skip tests`; it uses wording that explicitly means deferring integration debugging while preserving the requirement to resolve deferred regressions before final completion.
- When integration failures are reported, the user sees separate sections labeled `Baseline failures`, `Deferred integration regressions`, and `New regressions in this wave`.
- If a user defers integration debugging during an intermediate wave and deferred regressions still exist after the final wave, `execute-plan` offers only debug-now or stop-execution outcomes and does not proceed to normal completion.
- The plan is not moved to `.pi/plans/done/`, the linked todo is not closed, and branch-completion flow is not invoked while unresolved deferred integration regressions remain.
- When a wave contains one or more `DONE_WITH_CONCERNS` results, execution pauses after the wave drains and before verification, showing a single combined concerns checkpoint that distinguishes the affected tasks and asks for choices per task.
- `DONE_WITH_CONCERNS` reports explicitly label each concern as `correctness`, `scope`, or `observation`, and the workflow behavior depends on those labels.
- Observation-only concerns cannot silently flash by; they require explicit user acknowledgment before verification continues.
- Correctness or scope concerns cannot proceed directly into verification; they must be remediated or cause execution to stop.

## Non-Goals

- Persisting deferred integration regression state across stop/resume cycles.
- Requiring all verification recipes to be executable shell commands.
- Turning the verifier into a free-form debugging or exploration agent.
- Redesigning `BLOCKED` handling, worktree behavior, or broader resumability semantics.
- Introducing a separate schema-validation stage for plan files outside the existing generate-plan review/edit loop.

## Git Range to Review

**Base:** 5f29dc9e7c51d48246752ac11ee00df0058b22f1
**Head:** 14a898829badf056dfdbb8afcde3f2f2b143d7fe

```bash
git diff --stat 5f29dc9e7c51d48246752ac11ee00df0058b22f1..14a898829badf056dfdbb8afcde3f2f2b143d7fe
git diff 5f29dc9e7c51d48246752ac11ee00df0058b22f1..14a898829badf056dfdbb8afcde3f2f2b143d7fe
```

## Review Checklist

**Code Quality:**
- Clean separation of concerns?
- Proper error handling?
- Type safety (if applicable)?
- DRY principle followed?
- Edge cases handled?

**Architecture:**
- Sound design decisions?
- Scalability considerations?
- Performance implications?
- Security concerns?

**Testing:**
- Tests actually test logic (not mocks)?
- Edge cases covered?
- Integration tests where needed?
- All tests passing?

**Requirements:**
- All plan requirements met?
- Implementation matches spec?
- No scope creep?
- Breaking changes documented?

**Production Readiness:**
- Migration strategy (if schema changes)?
- Backward compatibility considered?
- Documentation complete?
- No obvious bugs?

## Output Format

### Strengths
[What's well done? Be specific.]

### Issues

#### Critical (Must Fix)
[Bugs, security issues, data loss risks, broken functionality]

#### Important (Should Fix)
[Architecture problems, missing features, poor error handling, test gaps]

#### Minor (Nice to Have)
[Code style, optimization opportunities, documentation improvements]

**For each issue:**
- File:line reference
- What's wrong
- Why it matters
- How to fix (if not obvious)

### Recommendations
[Improvements for code quality, architecture, or process]

### Assessment

**Ready to merge: [Yes/No/With fixes]**

**Reasoning:** [Technical assessment in 1-2 sentences]
