# Simplify execute-plan While Preserving Strong Verification

Source: TODO-8b3e7e00

## Goal

Simplify `execute-plan` so the workflow stays trustworthy but becomes easier to read, maintain, and operate. The implementation should preserve the strong verification architecture added in the recent hardening work — especially fresh-context task verification, integration-regression tracking, and no-skip completion semantics — while reducing procedural legalism, removing low-ROI protocol machinery, and tightening the user interaction model around worker concerns.

## Context

`agent/skills/execute-plan/SKILL.md` on `HEAD` now contains the stronger verification model that replaced orchestrator self-audit with a verifier pass, added `Verify:`-recipe enforcement, introduced three-set integration regression tracking, and added a final integration regression gate before completion. Those changes are valuable and should remain. The main complexity concentration is in the workflow around `DONE_WITH_CONCERNS` and in highly legalistic protocol prose.

Today, the skill defines a full Step 9.7 wave-level concerns checkpoint with typed worker concerns (`correctness`, `scope`, `observation`), per-type routing menus, and protocol-repair logic for malformed concern output. The worker contract in `agent/agents/coder.md`, the task prompt in `agent/skills/execute-plan/execute-task-prompt.md`, and the high-level README description all describe that typed-concern model. Separately, Step 10's verifier architecture is already in place and should remain the primary hard gate for task correctness. The earlier hardening spec at `.pi/specs/2026-04-18-execute-plan-verification-and-failure-hardening.md` captures the stronger verification intent, but some of its more elaborate concern-routing behavior is now a candidate for simplification rather than preservation.

## Requirements

- `execute-plan` must preserve the current strong verification architecture:
  - fresh-context per-task verification in Step 10
  - mandatory `Verify:` recipes for task acceptance criteria
  - no-skip handling for unresolved task failures and blocked tasks
  - the existing baseline/deferred/new integration-regression model and final completion gate
- The skill simplification may change behavior where that reduces complexity, provided it does not materially weaken the verification guarantees above.
- `DONE_WITH_CONCERNS` handling must remain a distinct workflow outcome, but it should be simplified from the current typed-routing protocol.
- `execute-plan` must keep a single combined wave-level concerns checkpoint before Step 10 whenever one or more tasks in a drained wave return `DONE_WITH_CONCERNS`.
- The concerns checkpoint must show all concerned tasks together in one combined view so the user can review the whole wave in context.
- The concerns checkpoint must allow the user to proceed to verification, request targeted remediation for selected task(s), or stop execution.
- The concerns checkpoint should allow the user to proceed to Step 10 verification for any concern type; the workflow should not require worker-preclassified severity labels in order to continue.
- The workflow must let the user choose remediation even for neutral or observational concerns; the system should not assume that only “serious” concerns deserve action.
- Worker concerns should become freeform again rather than requiring typed labels such as `correctness`, `scope`, or `observation`.
- The typed-concern requirement must be removed end-to-end from the worker contract, task prompt, and execute-plan skill behavior so the docs and prompts do not carry dead protocol.
- The concerns checkpoint should minimize question overload. It should prefer a compact, user-driven decision model over one menu per concern or a heavy routing tree.
- Step 10 must remain fail-closed, but the spec does not require preserving exact string-level protocol ceremony where semantic equivalence is sufficient.
- The verifier contract should continue to require per-criterion pass/fail judgment, incomplete or malformed verification output should still fail verification, and command evidence should still be collected by the orchestrator rather than the verifier.
- Truncation and evidence-handling rules may be rewritten more compactly, but they must still prevent silent evidence loss and keep verification reproducible.
- The integration-regression model should be preserved semantically, but its explanation should be defined once and reused rather than restated with unnecessary repetition.
- The work must update nearby behavior-describing prompts/docs that would otherwise become misleading, including at minimum the execute-plan worker prompt, coder contract, and README text that currently describe typed concerns or the current full checkpoint behavior.
- The work does not need to rewrite historical specs as archival artifacts, but the new spec should clearly allow the implementation to supersede earlier, more elaborate concern-routing behavior.

## Constraints

- Do not remove or materially weaken the verifier-based Step 10 architecture.
- Do not remove the `Verify:`-recipe requirement from plan generation/execution.
- Do not collapse the three-set integration-regression model into a simpler but less truthful scheme.
- Do not remove the final integration regression gate before completion.
- Do not reintroduce skip-the-failed-task or skip-known-regressions semantics under a new name.
- Do not require worker-side concern typing for the simplified workflow.
- Do not broaden this work into rewriting archived specs, old plans, or unrelated workflow skills.
- Keep the simplification focused on `execute-plan` and directly related prompts/docs that describe its behavior.
- Favor less ceremony and less repeated control-flow prose, but not at the cost of ambiguity about when execution may proceed.

## Acceptance Criteria

- `agent/skills/execute-plan/SKILL.md` is materially shorter and less repetitive than the current version while preserving verifier-based task gating, integration-regression tracking, and no-skip completion semantics.
- The skill no longer requires worker concerns to carry `Type:` labels such as `correctness`, `scope`, or `observation`.
- `agent/agents/coder.md` and `agent/skills/execute-plan/execute-task-prompt.md` no longer instruct workers to emit typed concerns and instead describe a simpler freeform `DONE_WITH_CONCERNS` contract.
- When a wave contains one or more `DONE_WITH_CONCERNS` results, `execute-plan` still pauses before Step 10 and presents a single combined concerns checkpoint for the whole wave.
- The concerns checkpoint allows the user to continue to Step 10 verification, request remediation for selected task(s), or stop execution without requiring the worker to classify concerns into fixed severity buckets.
- The concerns checkpoint interaction is simpler than the current per-type routing model and does not require one menu per concern.
- Step 10 still uses a fresh-context verifier, still treats malformed or incomplete verifier output as a failed verification outcome, and still routes failed verification into normal failure handling.
- Step 10 and its surrounding prompts no longer depend on exact literal marker wording when semantic-equivalent evidence handling is sufficient, but they still preserve fail-closed verification behavior and reproducible evidence gathering.
- Steps 7, 11, and 15 still preserve the current baseline/deferred/new regression semantics and final completion blocking, but the skill text defines that model more compactly and with less repetition.
- README and other in-scope behavior-describing docs no longer claim that `DONE_WITH_CONCERNS` uses the old typed concern protocol.

## Non-Goals

- Reverting to the old orchestrator self-audit model for Step 10.
- Removing the integration-regression deferment model or the final regression gate.
- Rewriting historical spec documents solely to make old design artifacts match the simplified implementation.
- Broad redesign of blocked-task handling, worktree behavior, or other unrelated execute-plan features.
- Converting `execute-plan` into a code implementation or extension-backed refactor; this work is about skill/prompt/doc behavior, not moving the workflow out of markdown.
