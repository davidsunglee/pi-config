# Shorten execute-plan SKILL.md Without Changing Behavior

Source: TODO-bbe2c2ad

## Goal

Reduce the size and local redundancy of `agent/skills/execute-plan/SKILL.md` while preserving the skill's current behavior in effect. This follow-up is intentionally narrower than the broader execute-plan simplification work: it focuses on extracting repeated reference material, unifying one pair of near-duplicate flows, and trimming local prose redundancy so the skill becomes materially shorter and easier to maintain without changing worker dispatch shape, gate ordering, retry semantics, or integration-regression behavior.

## Context

`agent/skills/execute-plan/SKILL.md` is currently about 1000 lines, while sibling orchestration skills with comparable complexity are much shorter (`agent/skills/generate-plan/SKILL.md` is about 261 lines and `agent/skills/refine-code/SKILL.md` is about 93 lines). The main size concentration in the current execute-plan skill is not new workflow surface area so much as repeated inline reference material and duplicated control-flow prose.

Within the current file, Step 8 contains a long inline TDD block that is injected into `agent/skills/execute-plan/execute-task-prompt.md`; Step 7 contains the canonical integration-regression tracking model inline; Steps 11 and 15 each contain a long debugger-first flow that differs only in a small set of parameters; Step 10.3 spells out a four-part full-coverage verifier check that can be stated more compactly; and Steps 10, 11, and 15 each restate upstream gate preconditions that are already enforced elsewhere. The repository also already has a broader spec at `.pi/specs/2026-04-19-execute-plan-simplification.md`; this spec is a narrower follow-up for the committed docs-structural shortening work and should not be treated as replacing that broader artifact.

## Requirements

- The work must be scoped to the six committed shortening items from `TODO-bbe2c2ad`, not a broader redesign of execute-plan.
- Extract the inline TDD block from Step 8 of `agent/skills/execute-plan/SKILL.md` into a new sibling file at `agent/skills/execute-plan/tdd-block.md`.
- After the extraction, Step 8 must define `{TDD_BLOCK}` by reading `tdd-block.md` when TDD is enabled and by using an empty string when TDD is disabled.
- The TDD-block extraction must preserve the current worker-facing behavior: the orchestrator still inlines the block content into the worker prompt at dispatch time, and `agent/skills/execute-plan/execute-task-prompt.md` remains unchanged.
- Extract the inline integration regression model from Step 7 of `agent/skills/execute-plan/SKILL.md` into a new sibling file at `agent/skills/execute-plan/integration-regression-model.md`.
- After that extraction, Step 7 must keep baseline capture and the identifier-extraction contract in `SKILL.md`, while Steps 7, 11, and 15 each replace their current inline restatements with a short reference to `integration-regression-model.md`.
- Define the debugger-first flow only once and have both Step 11 and Step 15 reference that shared definition by the same name or path.
- The shared debugger-first flow must preserve the current Step 11 vs. Step 15 distinctions in scope range, success condition, and follow-up commit-message behavior rather than flattening them into one undifferentiated path.
- Remove self-referential meta-narration and cross-reference boilerplate such as repeated claims that a subsection is the single canonical definition or instructions to use text verbatim rather than restating it.
- Simplify Step 10.3's verifier full-coverage check so it asserts `S == {1..K}` plus a no-duplicate-criterion-numbers rule, while preserving the existing protocol-error routing behavior.
- Replace the opening precondition recitals at the top of Steps 10, 11, and 15 with brief upstream-gate references instead of repeating the full BLOCKED / Step 9.7 / verifier-fail gating prose in each step.
- Preserve the skill's observable behavior in effect, including worker dispatch shape, gate ordering, retry-budget semantics, integration-test classification semantics, and the user-facing integration report format.
- Preserve the current execute-plan-only scope of the integration-regression model extraction; `generate-plan` and `refine-code` should not be changed to reference the new file.
- Planning should respect the committed dependency order behind this work: the two extractions first, then debugger-flow unification and meta-narration cleanup, then the local Step 10.3 and precondition-recital cleanups.

## Constraints

- `agent/skills/execute-plan/SKILL.md` must end below 800 lines.
- The preferred outcome is below 700 lines.
- The shortening work must not introduce observable protocol changes; it is a docs-structural refactor, not a workflow redesign.
- Extracted reference files must live alongside `SKILL.md` under `agent/skills/execute-plan/`.
- The worker-prompt template must remain unchanged for the TDD-block extraction; only the source of the injected block moves.
- The extraction of the integration-regression model is execute-plan-local only; do not add new cross-skill references.
- Deferred structural-consolidation work tracked in `TODO-86666846` remains out of scope for this spec.
- Verification for this work may rely on structural assertions and dry-read checks rather than a live execute-plan smoke run, since this change is documentation-structural.

## Acceptance Criteria

- `agent/skills/execute-plan/SKILL.md` is less than 800 lines after the work lands.
- The result strongly targets less than 700 lines for `agent/skills/execute-plan/SKILL.md`.
- `agent/skills/execute-plan/tdd-block.md` exists and is non-empty.
- `agent/skills/execute-plan/SKILL.md` contains exactly one reference to `tdd-block.md`.
- The literal strings `Iron Law` and `Red-Green-Refactor` no longer appear in `agent/skills/execute-plan/SKILL.md`.
- A dry-read verification of the Step 8 substitution path shows that loading `agent/skills/execute-plan/execute-task-prompt.md`, substituting `{TDD_BLOCK}` with the contents of `tdd-block.md`, and assembling the prompt still yields a prompt string containing both `Iron Law` and `Red-Green-Refactor`.
- `agent/skills/execute-plan/integration-regression-model.md` exists and is non-empty.
- `agent/skills/execute-plan/SKILL.md` references `integration-regression-model.md` from each of Steps 7, 11, and 15.
- The literal strings `three-section block`, `Reconciliation algorithm`, and `deferred_integration_regressions := still_failing_deferred` each appear in `integration-regression-model.md` exactly once and do not appear elsewhere in `SKILL.md` outside the new references.
- `agent/skills/execute-plan/SKILL.md` no longer contains both `Debugger-first flow` and `Final-gate debugger-first flow` as separate section headers; the flow is defined once and referenced from both Step 11 and Step 15.
- Step 11 and Step 15 reference the unified debugger-first flow by the same name or path.
- Step 10.3 no longer contains the enumerated `Count.`, `Coverage.`, `Uniqueness.`, and `Range.` list, and instead asserts `S == {1..K}` plus a no-duplicates rule.
- The phrases `single canonical definition`, `verbatim here; do not restate`, and `the control-flow path is always` appear in `agent/skills/execute-plan/SKILL.md` at most once each.
- The opening paragraphs of Steps 10, 11, and 15 no longer restate the full BLOCKED / Step 9.7 / verifier-fail preconditions and instead use a one-line upstream precondition pointer.
- The implementation preserves the current effective protocol: worker dispatch shape, gate ordering, retry-budget semantics, integration-regression classification, and the user-facing report format remain unchanged.

## Non-Goals

- Merging Steps 9.5 and 9.7 into one gate.
- Trimming or redesigning the cross-restated Step 0 / Step 3 worktree logic.
- De-duplicating the retry-budget rule across Steps 9.5, 9.7, and 12.
- Broadly superseding `.pi/specs/2026-04-19-execute-plan-simplification.md`; this spec is a narrower follow-up, not a replacement.
- Adding new references to the extracted integration-regression model from sibling skills.
- Changing execute-plan's effective behavior under the guise of shortening prose.
