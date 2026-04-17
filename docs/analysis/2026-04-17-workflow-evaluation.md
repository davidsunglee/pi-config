# Workflow Evaluation: define-spec → generate-plan → execute-plan

Objective strengths/weaknesses review of the three-skill development workflow and the ranked gaps it surfaced.

## Context

The pi-config repo ships an opinionated, human-in-the-loop dev workflow built from three sequenced skills:

- `define-spec` — interactive spec writing from a todo or freeform description → `.pi/specs/<date>-<topic>.md`
- `generate-plan` — structured plan generation with a cross-provider review loop → `.pi/plans/<date>-<topic>.md`
- `execute-plan` — dependency-ordered wave execution with verification gates → commits + `.pi/plans/done/`

Supporting skills (`using-git-worktrees`, `finishing-a-development-branch`, `refine-code`, `test-driven-development`, `systematic-debugging`) are invoked at defined points in the flow.

This document records an evaluation performed 2026-04-17, the gaps it surfaced, and where each gap landed as an actionable todo.

## Strengths

1. **Artifact-first handoff.** Each step writes a file; the next reads it from disk. Prompts carry paths, not inlined contents. Resumable, debuggable, subagents stay lean.
2. **Fresh-context subagents.** Planner, plan-reviewer, coder, code-refiner all start clean. No session-forking bias. Cross-provider review on the planner is a thoughtful hedge against same-model blind spots.
3. **Iterate-until-clean with a budget.** Same pattern across plan review, refine-code, and coder retries — 3 iterations, then escalate with three canonical options (keep iterating / proceed / stop). Consistent mental model. (See companion analysis: `2026-04-14-skill-decomposition-and-code-boundary.md` for the proposed `converge` primitive.)
4. **Real safety rails.** Worktree auto-detection, main-branch confirm-once, per-wave commits as checkpoints, baseline-diffed integration tests (only NEW failures flagged), and `finishing-a-development-branch` hand-off. These are not cosmetic.
5. **Provenance chain.** `Source: TODO-<id>` threads spec → plan → auto-close on completion. When the chain is intact, the loop is genuinely closed.

## Weaknesses

1. **Inter-skill contracts are prose, not schema.** Execute-plan parses conventions the planner is never required to produce: the `Dependencies` section format ("Task X depends on: Y, Z"), the `**Source:** TODO-<id>` line, per-task `**Files:**` and model recommendation. Malformed output silently breaks wave ordering or skips todo auto-close.
2. **Acceptance-criteria verification is LLM-manual.** Step 10 asks the orchestrator to verify output against AC "point-by-point." This is the weakest gate in the system — the place where "DONE" and "actually done" quietly diverge.
3. **Mechanical logic duplicated across four skills.** Model-tier resolution, provenance extraction, dispatch-map lookup are re-described in English in define-spec, generate-plan, execute-plan, refine-code. Every duplicate is a drift surface. (Prior analysis `2026-04-14-skill-decomposition-and-code-boundary.md` flagged this; still unresolved.)
4. **No revision loop.** Workflow is strictly forward. If wave 3 reveals the spec was wrong, there is no structured path to amend the spec, regenerate only affected tasks, and resume from the last checkpoint. The user either commits partial work and restarts the chain or abandons.
5. **Scout brief is aspirational.** Generate-plan verifies the file exists and passes the path to the planner, but the planner is not required to read it. "Context" is on the honor system.
6. **Wave pacing vs. escalation.** With "never pause," a `BLOCKED` task surfaces at end-of-run when context has decayed. Todo `8ddd2e17` identifies this; still unresolved.
7. **No resume semantics.** Skill prose claims plans can be resumed; no checkpoint file, no stale-baseline handling, no "re-enter at wave N" path.

## Meta-weakness

The entire workflow is prose executed by an LLM. Every failure mode above reduces to the same root cause: *the agent is trusted to follow long documents correctly, every time.* The more skill prose grows, the more drift. Moving mechanical concerns into helper tools (already started in `pi-subagent`) is the right direction but not yet pulled through.

## Ranked gaps

Ordered by priority (blockers and enablers first). Each maps to an actionable todo below.

1. **Validate artifacts at the seams.** A `validate-plan` tool at generate-plan's exit gate and execute-plan's Step 2 rejects plans missing a parseable Dependencies section, Source line, per-task model recommendation, or acceptance criteria. Closes half the implicit-contract risks in one move.
2. **Make acceptance criteria machine-checkable.** Require each AC to be either (a) a test the coder must add, (b) a command whose exit code is the gate, or (c) a file-content assertion. Unlocks (3).
3. **Add a `verify-task` subagent.** Replaces orchestrator self-audit with a fresh-context verifier dispatched per task (not per wave — wave tasks are independent by definition, and the coder already dispatches N-per-wave in parallel so symmetric verifier dispatch is nearly free in wall-clock terms).
4. **Extract mechanical duplicates.** Tier resolution, provenance extraction, dependency parsing, wave assignment, template filling — move from prose to helper tools.
5. **Pull `BLOCKED` out of wave pacing.** Always surface immediately. Pacing should control only successful wave cadence, not escalation latency.
6. **Design checkpoint + resume semantics.** Spike that produces a design doc, not code. Prerequisite for (7).
7. **Revision primitive.** Amend-spec → regenerate-affected-tasks → resume-at-wave-N. Depends on (6).
8. **Tighten scout-brief contract.** Either make the planner required to read it (enforced in prompt + reviewer check) or drop the field. Recommend the former if scout briefs are load-bearing in practice.

## Actionable todos

| # | Gap | Todo | Status |
|---|-----|------|--------|
| 1 | Validate artifacts at seams | `7e1fa3d2` item 1 | open |
| 2 | Machine-checkable AC | `7e1fa3d2` item 2 | open |
| 3 | `verify-task` subagent | `7e1fa3d2` item 3 | open (depends on 2) |
| 4 | Extract mechanical helpers | `a36603c9` (Task 10 added for `extract-provenance`) | open |
| 5 | BLOCKED immediacy | `8ddd2e17` (existing section, cross-referenced) | open |
| 6+7 | Checkpoint + resume, revision primitive | `b4e2d71a` (merged, also absorbs `8ddd2e17` resumability section) | open |
| 8 | Tighten scout-brief contract | `7e1fa3d2` item 8 | open |

Parent/grouping todo: `7e1fa3d2`.

Related prior analysis: `docs/analysis/2026-04-14-skill-decomposition-and-code-boundary.md` (overlaps gap 4 on mechanical extraction).
