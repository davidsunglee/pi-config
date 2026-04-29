### Status

**[Issues Found]**

### Issues

**[Error] — Task 3: Provenance parsing boundary is underspecified**
- **What:** Task 3 says generate-plan should scan a file input's header for `Source: TODO-<id>` and `Scout brief: .pi/briefs/<filename>` references, but it does not define the parsing boundary precisely. The current plan only says to "scan its header for provenance references" and gives example lines. It does not say where the header ends, whether parsing stops at the first `##` heading, or whether later occurrences in examples/code blocks must be ignored.
- **Why it matters:** The source spec for this plan contains example `Source:` and `Scout brief:` lines later in the document under "Spec Output Format." If implementation naively greps the full file, generate-plan can extract false provenance from illustrative text instead of the actual document header, causing the planner prompt to carry incorrect todo/brief provenance.
- **Recommendation:** Add an exact parsing rule to Task 3. For example: only inspect the top metadata block immediately after the title, stop parsing provenance at the first `##` heading, require exact line-prefix matches, and ignore later occurrences in fenced code blocks or examples.

**[Error] — Task 3: `{SOURCE_SPEC}` semantics are ambiguous for generic file inputs**
- **What:** generate-plan Step 1 currently accepts any file path input (spec, RFC, design doc). Task 3 says to "capture the spec file path itself for `{SOURCE_SPEC}`," while Task 4 defines `{SOURCE_SPEC}` as `Source spec: .pi/specs/<filename>` if the input was a spec file. The plan does not define how to determine whether an arbitrary file input qualifies as a spec file.
- **Why it matters:** Workers will have to guess what to do for non-spec file inputs such as RFCs or design docs. Different implementations could either incorrectly emit `Source spec:` for any file, omit it inconsistently, or try to infer spec-ness from content heuristics. That ambiguity can lead to inconsistent planner prompts and inconsistent plan headers.
- **Recommendation:** Make the rule explicit. The smallest fix is: only set `{SOURCE_SPEC}` when the input path is under `.pi/specs/`; otherwise leave it empty. If broader file provenance is desired, rename the placeholder to something more general and update planner header rules to match.

**[Warning] — Task 3: `{SOURCE_BRIEF}` path capture is implied, not explicitly specified**
- **What:** Task 3 explicitly says to read the scout brief and append its contents into `{TASK_DESCRIPTION}`, and to capture the spec file path for `{SOURCE_SPEC}`. But it never explicitly says to capture the scout brief path itself for later filling `{SOURCE_BRIEF}` in Task 4.
- **Why it matters:** Task 4 assumes the orchestrator already has the brief path available. A strong worker will likely infer this, but the plan leaves an avoidable handoff gap between Step 1 provenance extraction and Step 3 placeholder filling.
- **Recommendation:** In Task 3, add an explicit instruction: if a scout brief is consumed, capture its path for `{SOURCE_BRIEF}`. Also add this to Task 3's acceptance criteria.

**[Warning] — Task 5: The plan lacks an end-to-end verification of provenance flow**
- **What:** The plan includes file read-back verification for edits, but it does not include any final smoke test that exercises the actual workflow: define-spec writes a spec with provenance, generate-plan consumes it, the scout brief contents are appended into the planner prompt, and planner emits the new provenance fields in the generated plan header.
- **Why it matters:** This feature is mostly about cross-stage integration, not isolated text edits. Without at least one workflow-level verification step, the implementation can satisfy all local acceptance criteria while still failing to propagate provenance correctly across define-spec → generate-plan → planner.
- **Recommendation:** Add a final verification task or step that uses a small fixture spec (and fixture scout brief) to verify the full path. At minimum, verify the assembled planner prompt includes `Source todo:`, `Source spec:`, and `Scout brief:` lines when appropriate. Preferably, run generate-plan on the fixture and confirm the resulting plan header contains `**Source:**`, `**Spec:**`, and `**Scout brief:**`.

### Summary

The plan is well-scoped and largely aligned with the source spec: the define-spec skill content is concrete, the generate-plan continuation update is straightforward, and the planner header change is appropriately narrow. However, there are 2 errors and 2 warnings that should be addressed before execution. The two blocking issues are both in Task 3: provenance parsing must define an exact header boundary, and `{SOURCE_SPEC}` needs an explicit rule for which file inputs qualify. Once those are fixed, the remaining warning-level gaps are minor and the plan should be ready to execute.
