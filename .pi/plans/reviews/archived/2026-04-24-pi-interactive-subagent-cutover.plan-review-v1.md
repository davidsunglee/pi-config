# Plan Review: `2026-04-24-pi-interactive-subagent-cutover`

## Summary

The plan is generally strong: it is well-scoped, maps most spec requirements to concrete file edits, preserves the intended atomic-cutover rationale, and includes useful grep-based verification. It also correctly preserves the distinction between the `dispatch` map in `agent/model-tiers.json` and the new per-call `cli:` argument.

However, it has one material completeness gap: the spec requires a **manual smoke run as part of acceptance**, but the plan does not schedule that work as an executable task or completion gate. Instead, it relegates it to the Risk Assessment as an operator-side follow-up. That is a spec/plan conflict and should be treated as an **Error**, because it weakens the buildability/completion criteria for the migration.

## Detailed Findings

### Error 1 — Required manual smoke run is not planned as an execution task
**Affected area:** Overall plan structure, especially Task 8 and Risk Assessment

The spec explicitly requires a manual smoke run covering:

- `/generate-plan`
- `/execute-plan` on a plan with at least 2 tasks in one wave
- `/requesting-code-review`
- `/refine-code`

…and further requires verification of:

- `results[i].finalMessage` consumption
- `cli:` routing for both `"pi"` and `"claude"`
- actual parallel behavior

The plan acknowledges this requirement, but only in **Risk Assessment**, where it says the smoke test “must be performed by the human operator after the plan's automated waves complete and before the branch is merged,” and explicitly says the plan does not mark itself complete on the smoke result.

That is weaker than the spec. The spec makes the smoke run part of the required acceptance surface, not an optional operator-side practice.

**Why this matters:**  
Without a planned smoke task, the plan can be “completed” while still failing the most important runtime validation of the migration: that blocking semantics, `finalMessage` consumption, CLI routing, and parallel behavior all still work end-to-end after the package swap.

**What is better:**  
The **spec is better** here. For a tool-surface cutover, runtime smoke validation is part of correctness, not just risk mitigation.

---

### Warning 1 — Completion criteria are mostly grep-based and do not fully reflect the spec’s end-to-end acceptance bar
**Affected area:** Task 8 acceptance criteria

Task 8 is thorough for static verification, but all formal acceptance checks are grep-only. The spec’s acceptance criteria include both static and operational validation. Because the smoke run is omitted from the task list, the plan’s acceptance surface is narrower than the spec’s.

This overlaps with Error 1, but it is also worth calling out separately as a plan-quality issue: the current completion logic would allow a “pass” based entirely on text replacement, even if runtime behavior were broken.

**Why this matters:**  
This migration is specifically about preserving orchestration semantics. Textual replacement alone cannot prove that.

**What is better:**  
Again, the **spec is better**. Static and operational checks are both needed.

---

### Suggestion 1 — Task 8 should explicitly tie verification to all changed files, not just aggregate repo-wide grep results
**Affected area:** Task 8 positive verification

The plan’s repo-wide checks are good, but they emphasize aggregate counts (for example, “at least nine matches” for new tool names across files). That is useful as a backstop, but it is less precise than the per-file expectations already established earlier in the plan.

This is not a correctness blocker, because the earlier task-level acceptance criteria are specific. Still, if the plan is executed mechanically, aggregate counts can hide a misplaced or missing conversion in one file if another file happens to compensate numerically.

**Why this matters:**  
For migration plans, per-file verification is usually safer than aggregate-count verification.

**What is better:**  
Neither the spec nor the plan is clearly “better” here; this is just a robustness improvement opportunity.

---

## Spec vs Plan Conflicts

### Conflict 1 — Manual smoke run is required by the spec but not represented as a plan task
**Spec says:**  
The manual smoke run is part of the required post-cutover validation and appears in both Requirements and Acceptance Criteria.

**Plan says:**  
The manual smoke run is described only in Risk Assessment as something the human operator must do after automated waves complete; the plan explicitly does not treat plan completion as contingent on the smoke result.

**Judgment:**  
**The spec is better.**

**Why:**  
This migration changes the active extension package and the runtime orchestration interface. The most important failure modes here are behavioral, not textual:

- wrong result-shape consumption
- broken CLI routing
- async/blocking behavior changes
- lack of actual parallelism

Those cannot be fully proven by grep. The smoke run should therefore be part of the plan’s required execution path, not merely advisory risk handling.

---

## Strengths

- The plan closely tracks the spec’s file list and migration intent.
- The `dispatch` map vs `cli:` per-call rename is handled carefully and correctly.
- `execute-plan/SKILL.md` receives appropriately detailed treatment, including `MAX_PARALLEL_HARD_CAP` updates and result-shape wording.
- The package swap in `agent/settings.json` is correctly treated as atomic with the call-site migration.
- The plan includes sensible risk identification around tool-name collision and partial branch states.
- The verification greps are generally strong and aligned with the spec’s static acceptance criteria.

## Final Recommendation

**[Issues Found]**

The plan is largely sound and probably executable, but it does **not fully satisfy the spec** because it fails to plan the required manual smoke run as an actual task/completion gate. I would recommend approval **only after** that gap is corrected so the plan’s execution path faithfully matches the spec’s required acceptance bar.
