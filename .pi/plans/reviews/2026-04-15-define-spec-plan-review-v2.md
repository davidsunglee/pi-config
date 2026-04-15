### Status

**[Issues Found]**

### Prior Findings Check

1. **Provenance parsing boundary was underspecified.**  
   **Addressed** — Task 3 now explicitly limits parsing to the preamble between `# Title` and the first `## ` heading, requires exact prefix matches, and says to ignore later matches, including examples/code blocks.

2. **`{SOURCE_SPEC}` semantics were ambiguous for generic file inputs.**  
   **Addressed** — Task 3 now states that `{SOURCE_SPEC}` is populated only when the input path is under `.pi/specs/`; other file inputs leave it empty.

3. **`{SOURCE_BRIEF}` path capture was implied, not explicit.**  
   **Addressed** — Task 3 explicitly says to capture the brief file path for `{SOURCE_BRIEF}`, and Task 4 adds explicit fill instructions for that placeholder.

4. **The plan lacked an end-to-end verification of provenance flow.**  
   **Partially Addressed** — The updated plan now verifies individual handoff pieces better: provenance parsing (Task 3), placeholder wiring (Task 4), and planner header instructions (Task 5). However, it still does not include a final integration check that actually runs the flow from spec input through generate-plan to confirm the provenance appears correctly in the resulting planner prompt/plan output.

### Issues

**Error — Task 3-5: End-to-end provenance flow is still not verified**
- **What:** The plan validates the parsing rules, placeholder additions, and planner instructions in isolation, but it never includes a final execution/inspection step proving that a spec with both `Source:` and `Scout brief:` lines actually results in the correct `{SOURCE_TODO}`, `{SOURCE_SPEC}`, `{SOURCE_BRIEF}`, appended brief content, and final plan header fields.
- **Why it matters:** This feature is an integration path across multiple files. All edits can be individually correct while the combined flow still fails due to formatting mismatch, missing placeholder filling, or planner prompt/header drift.
- **Recommendation:** Add a dedicated verification task that runs `generate-plan` against a representative `.pi/specs/...` file containing both provenance lines and confirms the generated planner input/output carries `Source`, `Spec`, and `Scout brief` correctly, along with the appended brief content.

**Warning — Task 3: Missing-file behavior for `Scout brief:` references is still unspecified**
- **What:** Task 3 says to read the brief referenced by `Scout brief: .pi/briefs/<filename>`, but it does not define what generate-plan should do if that referenced file no longer exists.
- **Why it matters:** Specs can be edited manually or become stale over time. Without explicit fallback behavior, generate-plan may fail unexpectedly on a valid-looking spec that references a deleted/moved brief.
- **Recommendation:** Add explicit handling for a missing referenced brief during provenance extraction, such as continuing without appended brief content and emitting a note rather than failing the workflow.

### Summary

The updated plan is materially stronger: prior findings 1-3 are addressed with clearer provenance parsing rules, explicit `{SOURCE_SPEC}` semantics, and explicit `{SOURCE_BRIEF}` capture. Prior finding 4 is only partially addressed, because the plan still lacks a real end-to-end verification of provenance flow across define-spec, generate-plan, and planner output. There is also one new robustness gap around stale `Scout brief:` references. With those two items resolved, the plan should be ready for execution.
