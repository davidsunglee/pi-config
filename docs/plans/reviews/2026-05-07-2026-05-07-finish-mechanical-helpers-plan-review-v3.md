**Reviewer:** openai-codex/gpt-5.5 via pi

### Outcome
**Verdict:** Not approved
**Reasoning:** The plan has critical buildability and spec-coverage gaps: two prompt-fill helpers cannot pass against the current real templates as specified, and one mandatory matching adoption site is omitted.
### Strengths
- The plan is highly detailed, decomposes helper creation and adoption into sensible dependency waves, and preserves the verification-boundary constraint explicitly.
- Most task acceptance criteria include immediate concrete `Verify:` commands, and the line/byte-count shrink gates are consistently represented for the main adoption files.
- The dependency graph correctly serializes `classify-workflow-drift` after `extract-provenance-preamble` and defers README/test-runner wiring until helper files exist.
### Issues
#### Critical (Must Fix)
- **Tasks 3 and 4 are not buildable against the real templates.** Both `fill-refine-code-prompt.py` and `fill-refine-plan-prompt.py` are required to scan the entire filled output for any remaining `\{[A-Z_][A-Z0-9_]*\}` token and fail, while their real templates intentionally contain many downstream/example placeholders such as `{REVIEWER_PROVENANCE}`, `{WHAT_WAS_IMPLEMENTED}`, `{PLAN_ARTIFACT}`, and `{REVIEW_FINDINGS}`. The planned “full success against the real template” tests and acceptance criteria therefore cannot pass without either changing the scan scope/placeholder policy or rewriting templates, which the plan does not include.
- **Tasks 5/12 omit a mandatory matching adoption site for `extract-provenance-preamble`.** The spec requires adoption “at any other site that currently parses the same line shapes by hand under the same bounded-preamble rule,” and `agent/skills/scout/SKILL.md` Step 3 currently performs a bounded first-8-lines read to extract `Git SHA: <sha>`. No task adopts the new helper there, so execution would leave prohibited parallel mechanical parsing in place.
#### Important (Should Fix)
- **Task 7 under-tests documented required-field failures.** The helper documents `plan_path_missing`, `review_paths_block_missing`, and `structural_only_missing`, but the test steps and acceptance criteria only verify a subset of missing-field failures. This weakens coverage for the spec’s “validates required-field presence per status” requirement.
- **Task 8 under-tests one documented failure label.** `parse-refine-code-summary.py` documents `review_file_block_empty`, but the planned tests/acceptance criteria cover a missing `## Review File` block, not an empty block. Add direct coverage or remove the label from the contract.
- **Task 13 has contradictory structural-only-note instructions.** The File Structure section says to replace the `Step 7.5: Compose structural-only note` block, while Task 13 says to preserve Step 7.5 unchanged as the source of truth. This should be reconciled so implementers do not remove text that later acceptance criteria require.
#### Minor (Nice to Have)
- **Task 1’s “non-reconcilable only” coverage is inconsistently described.** The File Structure asks for a non-reconcilable-only fixture/test, but Task 1’s fixture includes one stable identifier. This is low risk because other tests still exercise both buckets, but the naming/fixture intent should be aligned.
### Recommendations
- Adjust Tasks 3 and 4 before execution: either whitelist/ignore documented downstream placeholders in the coordinator prompts or constrain the unreplaced-placeholder check to the input placeholders those helpers own.
- Add a scout adoption task for `agent/skills/scout/SKILL.md` Step 3, or explicitly justify why that bounded `Git SHA:` parser is out of scope despite the spec’s “any other site” adoption clause.
- Expand Task 7 and Task 8 malformed-summary tests so every documented failure label has a concrete failing test and `Verify:` coverage.
