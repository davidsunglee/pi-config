# Code Review: Execute-Plan Blocked-Task Escalation
**Iteration:** 1 (Full Review)
**Model:** crossProvider.capable (openai-codex/gpt-5.4 via opus proxy)
**Base:** f6b9320
**Head:** 770f1fe786667876ec85614d9c1f50595c907c05

---

### Strengths

- Step 9.5 is inserted in the correct position (after Step 9, before Step 10) at SKILL.md:419, and all other step headings (9, 10, 11, 12) remain verbatim and in original order.
- Step 9's `BLOCKED` bullet (SKILL.md:415) cleanly defers to Step 9.5, names the four canonical interventions without duplicating their logic, and preserves the "Never ignore an escalation..." rule.
- Step 9.5 is well-structured with six numbered substeps mirroring the plan's required ordering: drain → collect → combined view → per-task choice → re-dispatch loop → gate exit.
- The combined escalation view requirement is fully met: header + "Wave outcomes" block listing successful same-wave tasks + "Blocked tasks" block with blocker text and files. The example layout is concrete and reinforces the prose.
- The `(m) Better model` suppression at `capable` tier is handled in three places (menu display, per-option description, and rationale tying it to the Step 9 rule) — strong defense in depth.
- The skip/stop-only exit rule is explicit: SKILL.md:505 states "skip is not a valid exit from a `BLOCKED` state" and directs Step 12's skip offer back into §4's intervention menu.
- Stop-on-one-means-stop-all is explicitly stated ("If the user picks `(x) Stop execution` for any blocked task, stop the whole plan...").
- Step 10 and Step 11 preconditions (SKILL.md:513, 523) both name Step 9.5 and explicitly withhold verification/commit/integration tests while any task is `BLOCKED`.
- Step 12 correctly scopes pacing options to blocker-free waves and addresses the specific (b) end-of-run deferral risk.

### Issues

#### Critical (Must Fix)

None.

#### Important (Should Fix)

1. **SKILL.md:429 — "before Step 10 runs" understates gate scope**
   - File: `agent/skills/execute-plan/SKILL.md` ~line 429 (Step 9 BLOCKED bullet)
   - What's wrong: The phrasing "before Step 10 runs" understates the gate's reach. Step 11 (and any later wave) are also gated.
   - Why it matters: The Step 9 bullet is the first pointer a reader sees; narrowing the gate to "before Step 10" could mislead a future editor into believing Step 11 is not gated.
   - Fix: Change "before Step 10 runs" → "before Step 10, Step 11, or any subsequent wave runs."

2. **SKILL.md:437 — Step 9.5 §1 drain guarantee is a claim about implicit behavior**
   - File: `agent/skills/execute-plan/SKILL.md` ~line 437 (Step 9.5 §1)
   - What's wrong: "`execute-plan` already waits for all dispatched workers in a wave to return before proceeding; rely on that." is a claim about implicit behavior that lacks an anchor.
   - Why it matters: If the drain guarantee lives anywhere, Step 8 is where it should be. Relying on an implicit claim weakens the gate.
   - Fix: Rephrase §1 from a claim to an affirmative requirement: replace "rely on that" phrasing so §1 itself states the orchestrator must wait for every worker to return before Step 9 classification begins, rather than implicitly trusting undocumented behavior.

3. **SKILL.md:505 — Retry budget conflation between BLOCKED re-dispatches and DONE-verification retries**
   - File: `agent/skills/execute-plan/SKILL.md` ~line 505 (Step 9.5 §5)
   - What's wrong: "Each pass through the gate counts toward the per-task retry budget defined in Step 12 (3 retries per task)." Step 12's "3 times" governs empty/missing/incorrect output after Step 10 verification, not `BLOCKED` outcomes (which never reach Step 10).
   - Why it matters: Using the same counter conflates two distinct failure modes, either burning the DONE-verification budget on BLOCKED re-dispatches or creating ambiguity about what triggers exhaustion.
   - Fix: Either distinguish a separate "blocked re-dispatch budget" or explicitly state "the 3-retry cap from Step 12 is shared across both BLOCKED re-dispatch passes and DONE-verification retries for the same task."

4. **Task 5 walkthrough — no trace artifact**
   - File: N/A (process gap)
   - What's wrong: Plan Task 5 requires Scenarios A/B/C/D to be traced through the revised prose. The diff contains no trace artifact.
   - Why it matters: Task 5's acceptance criterion ("Each of Scenarios A, B, C, D can be traced step-by-step") is unverifiable from the diff alone.
   - Fix: Confirm scenarios were walked through; no SKILL.md change needed, but the author should document the trace outcome.

#### Minor (Nice to Have)

1. **SKILL.md:429** — In Step 9's deferral line, add "(inserted between Step 9 and Step 10)" hint to make the non-integer step number less jarring on first read.
2. **SKILL.md:445** — The `🚫` emoji in the example header is inconsistent with the repo's general prose style (no emoji elsewhere).
3. **SKILL.md:455** — "Successful same-wave tasks MUST appear here" — add a note clarifying that tasks never dispatched (e.g., upstream-skipped) should not appear in the wave outcomes block.
4. **SKILL.md:486** — "between them" in the split sub-task option is awkward; "collectively" is clearer.
5. **SKILL.md:505** — The retry-budget paragraph (~200 words) is a single dense block; breaking the (a)/(b) exits into a bulleted list would improve scannability.

### Recommendations

- Fix Important #1 and #3 before merging — both are prose-consistency risks that could mislead future edits.
- For Important #2, make §1 an affirmative requirement so the drain is self-contained.
- Task 5 should be explicitly closed out by the author with a brief trace note.

### Assessment

**Ready to merge: With fixes**

**Reasoning:** The prose is structurally correct, all four tasks' acceptance criteria appear satisfied, and the gate logic is internally consistent for the common path. However, the retry-budget interaction with Step 12 and the narrow "before Step 10" phrasing in Step 9's deferral are prose-consistency risks that are cheap to fix and will prevent future drift.

---

## Remediation Log

### Iteration 1 — Batch 1 (Important issues #1, #2, #3)
**Status:** Dispatched
