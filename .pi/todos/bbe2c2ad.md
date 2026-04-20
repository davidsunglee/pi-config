{
  "id": "bbe2c2ad",
  "title": "Simplify and shorten execute-plan SKILL.md",
  "tags": [
    "skills",
    "execute-plan",
    "refactor",
    "documentation"
  ],
  "status": "open",
  "created_at": "2026-04-19T00:00:00.000Z"
}

## Summary
`agent/skills/execute-plan/SKILL.md` is ~1000 lines. Objective review against sibling skills (refine-code at 93 lines, generate-plan at 261 lines) shows ~400–500 lines of removable bloat from duplicated reference material, near-duplicate flows, and meta-narration — without behavior change.

## High-impact extractions (~250 lines, low risk)

1. **Extract the inline TDD_BLOCK** (Step 8, ~60 lines) into a sibling file (`execute-plan/tdd-block.md`) or shrink to a 5-line iron-law summary plus a pointer to the `test-driven-development` skill. It's currently a paraphrase of that skill pasted verbatim into the worker prompt.

2. **Extract the Integration Regression Model** (Step 7, ~100 lines: three-set definition, disjointness/transition rules, reconciliation algorithm, three-section report format) into `execute-plan/integration-regression-model.md`. Steps 11 and 15 already say "use Step 7 verbatim — do not restate," yet still reproduce the report format.

3. **Unify the two debugger-first flows** (Step 11 and Step 15, ~60 lines each, near-duplicates). They differ only in: scope range (wave commit vs. `BASE_SHA..HEAD_SHA`), success criterion (`new_regressions` empty vs. both sets empty), and commit message. One parameterized flow saves ~60 lines.

## Structural consolidation (~120 lines)

4. **Merge Steps 9.5 and 9.7** into one "wave gate" step. Both share the same shape: drain → collect set → combined view → per-task choice → re-dispatch → re-enter. Differences (BLOCKED vs DONE_WITH_CONCERNS) fit a small table.

5. **Trim Step 0 + Step 3 cross-restated worktree logic.** The `(n) Create a new worktree instead` fallback path, reuse-log mandatoriness, and customizability rules are each stated 2–3 times across Step 0 and Step 3's defaults table + paragraphs. Pick one home (Step 0); have Step 3 just show the settings UI.

## Local cleanup (~80 lines)

6. **Collapse Step 10.3's four-condition full-coverage check.** Count + Coverage + Range all reduce to `S == {1..K}`. Only uniqueness is independent. Two sentences instead of four enumerated conditions.

7. **Strip meta-narration.** Phrases like "This subsection is the single canonical definition…", "Use it verbatim here; do not restate", "The control-flow path is always 9.5 → 9.7 → 10" appear 4–6 times each. State once.

8. **De-duplicate the retry-budget rule.** The shared-counter / split-doesn't-bypass rule is restated in 9.5 §5, 9.7 §3, and 12. Keep canonical version in 12; one-line pointer elsewhere.

9. **Drop precondition recitals.** Steps 10, 11, 15 each open with "if any task is BLOCKED, return to 9.5; if 9.7 not exited, return to 9.7…" That is the gate's job, not each downstream step's.

## Net estimate
~400–500 lines removable (1000 → 500–600) without behavior change. Highest ROI: extractions #1 and #2 alone clear ~160 lines and reduce repeated reading cost on every execution.

## Notes
- Do not change observable behavior of the skill — this is a docs-and-structure refactor, not a protocol change.
- Verify the worker prompt template (`execute-task-prompt.md`) still fills correctly after extracting `{TDD_BLOCK}`.
- Consider whether `refine-code` and `generate-plan` should also reference an extracted regression-model file (currently they don't need it, but cross-reference would keep the model authoritative in one place).
