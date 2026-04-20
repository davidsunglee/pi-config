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
`agent/skills/execute-plan/SKILL.md` is ~1000 lines. Sibling skills (refine-code at 93 lines, generate-plan at 261 lines) carry comparable orchestration with far less prose. Reduce execute-plan by extracting two reference sections, unifying two near-duplicate flows, and removing local redundancy — without changing observable behavior. Target outcome: roughly 500–700 lines.

## Goal
Reduce `agent/skills/execute-plan/SKILL.md` to roughly 500–700 lines while keeping the skill's protocol byte-identical in effect (worker dispatch shape, gate ordering, retry budget, integration-test classification).

## Scope (committed)
Six items, organized in three waves with explicit dependencies.

### Wave 1 — independent extractions (parallel)

**Item 1: extract the inline TDD_BLOCK from Step 8.**
- Move the ~60-line TDD block (Iron Law, Red-Green-Refactor cycle, Rationalizations, Red flags, Verification checklist, When stuck, Bug fixes) to a new sibling file: `agent/skills/execute-plan/tdd-block.md`.
- Update Step 8 of `SKILL.md` so that `{TDD_BLOCK}` is filled by reading `tdd-block.md` (when TDD enabled) or with an empty string (when TDD disabled).
- Worker-prompt template `execute-task-prompt.md` is unchanged. The orchestrator still inlines the block content into the prompt at dispatch — only the source moves from inline prose to a sibling file.

**Item 2: extract the Integration Regression Model from Step 7.**
- Move the ~100-line block (three-set definition, disjointness/transition rules, reconciliation algorithm, three-section user-facing report format) to a new sibling file: `agent/skills/execute-plan/integration-regression-model.md`.
- Step 7 retains baseline capture and the identifier-extraction contract; everything from "Integration regression model" header through the three-section report format moves to the new file.
- Steps 7, 11, and 15 each replace their existing in-line restatements with a single short reference to the new file (e.g., "See `integration-regression-model.md`").
- Scope is execute-plan only. `refine-code` and `generate-plan` do not reference the new file — they don't use the regression model.

### Wave 2 — depends on wave 1 (parallel)

**Item 3: unify the two debugger-first flows.**
- Step 11's "Debugger-first flow" (~60 lines) and Step 15's "Final-gate debugger-first flow" (~60 lines) are near-duplicates. They differ in three parameters: scope range (wave commit vs. `BASE_SHA..HEAD_SHA`), success criterion (`new_regressions_after_deferment` empty vs. both `still_failing_deferred` and `new_regressions_after_deferment` empty), and commit message format.
- Replace both with one shared flow defined once (location TBD by planner — likely a new `debugger-first-flow.md` sibling, or a single block inside `SKILL.md` referenced from both steps). The shared flow takes the three differing values as named parameters; Steps 11 and 15 each pass their parameter set.
- Easier to do after item 2 because the success criteria reference the regression-model sets that are now centralized.

**Item 7: strip meta-narration.**
- Remove repeated phrases like "This subsection is the single canonical definition…", "Use it verbatim here; do not restate", "The control-flow path is always 9.5 → 9.7 → 10", and similar self-referential framing. State each cross-reference once, briefly.
- Most occurrences live inside the just-extracted regression-model section and the just-unified debugger flow, so doing this after wave 1 means we're cleaning the new files in one place.

### Wave 3 — depends on wave 2 (parallel)

**Item 6: collapse Step 10.3's four-condition full-coverage check.**
- The current four conditions (Count, Coverage, Uniqueness, Range) reduce to two independent checks: `S == {1..K}` (which subsumes Count, Coverage, and Range) and "no duplicate criterion numbers" (Uniqueness).
- Rewrite as two sentences. Keep the protocol-error routing rule unchanged.

**Item 9: drop precondition recitals at the top of Steps 10, 11, 15.**
- Each of those steps currently opens with a paragraph restating "if any task is BLOCKED, return to 9.5; if 9.7 hasn't exited, return to 9.7; if any verifier verdict is FAIL, return to 12." That's the gate's responsibility, not each downstream step's.
- Replace with a single short precondition line referencing the upstream gate(s) by step number.

## Out of scope (deferred to TODO-86666846)
The three structural-consolidation items below are tracked in TODO-86666846 ("Structural consolidation of execute-plan SKILL.md"). That follow-up should be planned and executed after this todo lands.

- **Item 4: merge Steps 9.5 and 9.7 into one wave gate.** Independently valuable but restructures section boundaries; cleaner as a separate change.
- **Item 5: trim Step 0 + Step 3 cross-restated worktree logic.** Touches the user-visible settings UI shape; warrants its own scoped change.
- **Item 8: de-duplicate the retry-budget rule across 9.5/9.7/12.** Depends on item 4 since the section anchors it references change in that merge.

## Acceptance criteria

### Soft line-count sanity check
- Expect roughly 300–500 lines removed from `SKILL.md`. Flag for review if fewer than 150 lines were removed (likely under-applied) or more than 600 lines were removed (likely over-aggressive — risks behavior change).
- This is a sanity range, not a hard gate. Per-item structural assertions are the real verification.

### Per-item structural assertions
- **Item 1:**
  - `agent/skills/execute-plan/tdd-block.md` exists and is non-empty.
  - `SKILL.md` contains exactly one reference to `tdd-block.md`.
  - The literal strings "Iron Law" and "Red-Green-Refactor" do NOT appear in `SKILL.md` (they live in `tdd-block.md`).
- **Item 2:**
  - `agent/skills/execute-plan/integration-regression-model.md` exists and is non-empty.
  - `SKILL.md` contains references to `integration-regression-model.md` from each of Steps 7, 11, and 15.
  - The literal strings "three-section block", "Reconciliation algorithm", and "deferred_integration_regressions := still_failing_deferred" each appear in `integration-regression-model.md` exactly once and do NOT appear in `SKILL.md` outside the references.
- **Item 3:**
  - The phrases "Debugger-first flow" and "Final-gate debugger-first flow" no longer both appear as section headers in `SKILL.md`. Either one shared header exists, or the body lives in a referenced file with each step pointing to it.
  - Both Step 11 and Step 15 in `SKILL.md` reference the unified flow by the same name/path.
- **Item 6:**
  - Step 10.3 in `SKILL.md` no longer contains the enumerated list "Count.", "Coverage.", "Uniqueness.", "Range." The replacement asserts `S == {1..K}` and a no-duplicates check in two sentences.
- **Item 7:**
  - The phrases "single canonical definition", "verbatim here; do not restate", and "the control-flow path is always" each appear in `SKILL.md` at most once (down from 4–6 occurrences each currently).
- **Item 9:**
  - The opening paragraphs of Steps 10, 11, and 15 in `SKILL.md` no longer restate the BLOCKED/9.7/VERDICT gating; each has a one-line precondition pointer instead.

### Behavioral / dry-read check
- One verification task: load `agent/skills/execute-plan/execute-task-prompt.md`, perform the `{TDD_BLOCK}` substitution as described in Step 8 (reading from `tdd-block.md`), and assert the resulting prompt string contains both "Iron Law" and "Red-Green-Refactor".
- No live execute-plan smoke run required — changes are docs-structural.

## Constraints
- **No observable behavior change.** The skill's protocol must be byte-identical in effect: worker dispatch shape, gate ordering (9.5 → 9.7 → 10 → 11 → 12), retry budget semantics, integration-test classification model, and the user-facing report format.
- Extracted files live alongside `SKILL.md` at `agent/skills/execute-plan/*.md`.
- Existing references to Step 7's regression model from elsewhere (none currently in sibling skills, per item 2 scope) are not added.

## Design decisions (resolved during refinement)
- **TDD-block extraction shape:** orchestrator inlines the file content into `{TDD_BLOCK}` at dispatch time. Worker prompt template is unchanged.
- **Regression-model cross-skill scope:** scoped to execute-plan only. Sibling skills do not reference the new file.
- **Wave ordering:** wave 1 extractions first (lowest risk, enable later items); wave 2 unification + meta-narration cleanup (touches the just-extracted content); wave 3 local cleanups last (avoids merge friction).

## Notes
- This is a docs-and-structure refactor, not a protocol change. Acceptance criteria deliberately use grep/file-existence assertions rather than test runs because the skill has no test suite.
- The deferred items (4, 5, 8) are tracked together in TODO-86666846 — they are independently valuable but not prerequisites for this work.
