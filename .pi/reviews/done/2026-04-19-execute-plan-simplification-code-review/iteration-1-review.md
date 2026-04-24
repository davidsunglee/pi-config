# Code Review — execute-plan Simplification — Iteration 1

## Summary

The implementation correctly removes the `Type:` concern protocol end-to-end, introduces the combined wave-level concerns checkpoint at Step 9.7, consolidates the integration-regression model into Step 7 as the single canonical source, and compacts Step 10 prose while preserving fail-closed behavior. Most acceptance criteria are met. One important issue was found in `verify-task-prompt.md` regarding the truncation marker description, and several minor issues were identified across the files.

---

## Findings

### IMPORTANT Finding 1: verify-task-prompt.md truncation marker description is still somewhat literal
**File:** `agent/skills/execute-plan/verify-task-prompt.md` (line 39)
**Issue:** Task 4's acceptance criterion states that `verify-task-prompt.md` should describe the truncation marker "semantically (not as a literal string)." The current wording partially succeeds but still leans on structural cues that assume a specific shape. The phrase "typically including the pre-truncation line count and byte count" implies a specific format rather than purely semantic intent.
**Evidence:** Line 39: `"If you see a truncation marker line in the diff — any single line indicating that diff content was omitted, typically including the pre-truncation line count and byte count — note this in your per-criterion reason: where it affects judgment..."`
**Recommendation:** The description achieves the primary semantic goal ("any single line indicating that diff content was omitted") but then narrows it with a shape hint ("typically including the pre-truncation line count and byte count"). To be fully semantic, drop the "typically including..." parenthetical. The verifier should recognize any omission marker regardless of its exact content. Example revised text: "If you see a truncation marker line in the diff — any single line indicating that diff content was omitted — note this in your per-criterion reason:..." The current form is functionally acceptable because the initial semantic clause is the operative one, but the trailing hint could still mislead a strict verifier into looking for that exact shape.

---

### MINOR Finding 2: Step 10 block length
**File:** `agent/skills/execute-plan/SKILL.md` (lines 640–709)
**Issue:** Task 4's acceptance criterion requires Step 10's block length to be under 150 lines. The Step 10 block runs from the `## Step 10: Verify wave output` header (line 640) to the "Wave gate exit" paragraph ending (line 709), which is 70 lines. However, Step 10 subsections extend through Step 10.3 ending around line 709 — well under 150. This criterion is satisfied.
**Evidence:** Steps 10, 10.1, 10.2, and 10.3 together span lines 640–709, approximately 70 lines.
**Recommendation:** No action required; this is a confirmation that the criterion is met.

---

### MINOR Finding 3: Step 9 text still references "protocol-violation re-dispatch" semantics implicitly
**File:** `agent/skills/execute-plan/SKILL.md` (line 489)
**Issue:** Step 9's `DONE_WITH_CONCERNS` bullet correctly drops typed-label language, but the phrase "Concerns do not need type labels and are not preclassified by severity" is an improvement. However, the phrase reads slightly defensively, like a remnant reminder rather than forward-looking prose. It communicates the absence of old behavior rather than asserting the new behavior.
**Evidence:** Line 489: `"Concerns do not need type labels and are not preclassified by severity."`
**Recommendation:** Rewrite as an affirmative statement, e.g., "Worker concerns are freeform bullets and carry no severity classification." This removes the implicit reference to what no longer exists.

---

### MINOR Finding 4: Step 12 text does not reference "freeform concerns" when re-dispatching from Step 9.7
**File:** `agent/skills/execute-plan/SKILL.md` (lines 821–835)
**Issue:** Step 12 describes a shared retry counter that spans blocked-task re-dispatch (Step 9.5), concerned-task remediation (Step 9.7), and verifier `VERDICT: FAIL` retries. The description is accurate and complete but refers to "Step 9.7 `(r)` remediation (concerned-task re-dispatch)" without any risk of confusion with the old typed concern system. This is consistent with the simplification — no action needed.
**Evidence:** Line 822: `"...Step 9.7 (r) remediation (concerned-task re-dispatch)..."` — clean, no typed-concern language.
**Recommendation:** No action required.

---

### MINOR Finding 5: README item 5 — phrasing of "no per-concern menu" is indirect
**File:** `README.md` (line 139)
**Issue:** The acceptance criterion requires README item 5 to "explicitly state there is no per-concern menu / no severity classification." The current README states: "...a single view with no per-concern menu and no severity classification." This meets the criterion exactly. However, the three named actions — "continue to verification," "remediate selected task(s)," "stop execution" — are all present and clearly described.
**Evidence:** Line 139: `"The user reviews the full list and chooses one of three actions: continue to verification (acknowledge all concerns and proceed), remediate selected task(s) (fix specific issues before advancing), or stop execution (halt the wave entirely)."`
**Recommendation:** No action required. All three required action names are present, no per-concern menu language is included, and no severity classification language is included.

---

### MINOR Finding 6: README item 6 — "three sets" description
**File:** `README.md` (lines 141)
**Issue:** Task 5's acceptance criterion for README item 6 requires mention of "the fresh-context verifier subagent, the three sets, and that the final wave removes the defer option." All three are present. The three sets are named ("baseline failures," "deferred integration regressions," "new regressions in the current wave"). The defer-option removal on the final wave is stated ("On the final wave the defer option is removed"). The fresh-context verifier is mentioned ("a fresh-context verifier subagent re-reads the task outputs"). All criteria met.
**Evidence:** Line 141 covers all three requirements in a single paragraph.
**Recommendation:** No action required.

---

### MINOR Finding 7: Integration regression model — disjointness rule occurrence count
**File:** `agent/skills/execute-plan/SKILL.md` (lines 317–321)
**Issue:** Task 3's acceptance criterion requires that the disjointness rule `baseline_failures` / `deferred_integration_regressions` occurs exactly once. A search of the document confirms the full formulation — "baseline_failures and deferred_integration_regressions MUST remain disjoint" — appears only in Step 7 (line 319). Step 11 and Step 15 reference Step 7 rather than restate it. The criterion is met.
**Evidence:** Line 319: `"baseline_failures and deferred_integration_regressions MUST remain disjoint."` — only occurrence.
**Recommendation:** No action required.

---

### MINOR Finding 8: Step 11's "Apply the Integration regression model" reference wording
**File:** `agent/skills/execute-plan/SKILL.md` (lines 756–762)
**Issue:** Step 11 says "Apply the Integration regression model defined in Step 7 — specifically the Step 7 reconciliation algorithm — to the just-completed integration run. That subsection is the single canonical definition...Use it verbatim here; do not restate." This correctly references Step 7 without restating the model. No rules from the original model were dropped. The reconciliation algorithm, three sets, disjointness rules, and summary format all remain in Step 7.
**Evidence:** Lines 756–762 confirm the reference-not-restate pattern is clean.
**Recommendation:** No action required.

---

### MINOR Finding 9: Step 15 preserves final-gate menu and debugger-first flow
**File:** `agent/skills/execute-plan/SKILL.md` (lines 883–959)
**Issue:** Task 3's acceptance criterion requires that Step 15 "references the Step 7 model and preserves the final-gate menu / debugger-first flow semantics." Step 15 applies the Step 7 reconciliation algorithm (line 895: "Apply the Step 7 reconciliation algorithm"), uses the Step 7 three-section block (line 901), gates on `still_failing_deferred ∪ new_regressions_after_deferment` (lines 897–899), and provides the final-gate menu with `(a)` and `(c)` only — no defer option. The blocking guarantee (line 959) correctly states that completion is blocked while either set is non-empty.
**Evidence:** Lines 895–959 — all requirements verified present and correct.
**Recommendation:** No action required.

---

### MINOR Finding 10: coder.md Output Format block — freeform description is correct but placement is late
**File:** `agent/agents/coder.md` (lines 62–63)
**Issue:** The `## Output Format` block contains the `## Concerns / Needs / Blocker` section (lines 60–63) with the instruction "For DONE_WITH_CONCERNS, list concerns as freeform bullets — one concern per line. Do not prefix lines with Type: labels." This meets the requirement. The freeform description also appears earlier in the `DONE_WITH_CONCERNS` status code description (lines 27–29). Both locations are consistent and correct.
**Evidence:** Lines 27–29 and lines 62–63 are consistent; neither contains `Type:` prefix language.
**Recommendation:** No action required.

---

## Verdict

PASS_WITH_MINOR_ISSUES

The implementation correctly satisfies all critical guarantees:
- The `Type:` concern protocol has been fully removed end-to-end in `coder.md`, `execute-task-prompt.md`, `SKILL.md`, and `README.md`
- Step 9.7 presents a single combined wave-level view with exactly three options `(c)`, `(r)`, `(x)` and no per-concern menu or severity routing
- The integration-regression model is canonically defined once in Step 7; Steps 11 and 15 reference it rather than restating it
- The disjointness rule occurs exactly once (Step 7, line 319)
- Step 10 is under 150 lines and all fail-closed guarantees are preserved: missing `Verify:` = stop, malformed verifier output = FAIL, "never silently drop evidence," and `insufficient evidence` behavior
- `verify-task-prompt.md` uses a primarily semantic truncation marker description ("any single line indicating that diff content was omitted")
- README item 5 names exactly three actions, contains no per-concern menu language, and explicitly states there is no severity classification
- Final completion remains blocked when `still_failing_deferred ∪ new_regressions_after_deferment` is non-empty

The one Important finding (Finding 1) is a precision issue in `verify-task-prompt.md`: the truncation marker description uses a semantic lead clause but then appends a shape hint that partially re-literalizes it. This is not a critical failure — the operative clause is semantic — but it could be tightened. All other findings are Minor and require no corrective action.
