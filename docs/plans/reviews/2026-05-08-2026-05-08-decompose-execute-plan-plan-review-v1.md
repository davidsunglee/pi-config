**Reviewer:** openai-codex/gpt-5.5 via pi

### Outcome

**Verdict:** Not approved

**Reasoning:** The plan is broadly well structured, but two Important spec-compliance issues need remediation before execution: Task 6 would copy menu policy into `integration-regression-gate.md` despite the spec requiring menus to remain caller-owned, and Task 1's optional `PHASE:` parser handling appears to allow an empty present `PHASE: ` value instead of treating empty/omitted unambiguously.

### Strengths

- The plan covers the spec's chosen architecture: one `_shared/` test-runner dispatch protocol, three execute-plan-local protocol docs, the parser/prompt migration, and the define-spec rename.
- Dependencies are mostly accurate: move tasks depend on parser/prompt prep, SKILL.md rewriting depends on the extracted protocol docs and moved artifacts, and final cleanup depends on reference updates.
- Acceptance criteria are generally concrete and include one-to-one `Verify:` recipes naming files, commands, and expected conditions.
- The risk assessment usefully calls out line-budget pressure, post-move parser path resolution, stale-reference greps, and temporary Wave 1 references to Wave 2 paths.

### Issues

#### Critical (Must Fix)

_None._

#### Important (Should Fix)

- **Task 6: `integration-regression-gate.md` would preserve caller-owned menu policy inline**
  - **What:** Task 6 Step 4 says to copy the predecessor `## Pass/fail classification` section byte-for-byte. The current predecessor section includes menu prescriptions such as `(d) Debug failures now / (c) Continue despite failures / (x) Stop plan execution`. This conflicts with spec Requirement 13, which says `integration-regression-gate.md` MUST NOT prescribe menus, debug-vs-continue-vs-stop options, commits, or retry-budget interactions.
  - **Why it matters:** Implementing Task 6 as written would build a gate protocol doc that contradicts the spec's layer boundary and the plan's own architecture summary, making menu behavior appear gate-owned instead of execute-plan-owned.
  - **Recommendation:** Revise Task 6 so only the data model, identifier contract, reconciliation rules, and canonical summary format are preserved verbatim where required; remove or reword menu bullets from the gate doc's pass/fail classification and leave menu specifics solely in caller-owned sections such as `execute-plan/SKILL.md`.

- **Task 1: Empty present `PHASE:` value is not rejected**
  - **What:** Task 1 Step 3 says any first line starting with `PHASE: ` is consumed as the phase value, while only `PHASE` and `PHASE:` are rejected as malformed. That would accept a line like `PHASE: ` with an empty value and emit an empty-string phase, and the planned malformed fixture only covers `PHASE:`.
  - **Why it matters:** The spec states `phase_label` is optional, empty string is treated identically to omitted, and absent/empty should have no ambiguity. Accepting a present-but-empty `PHASE: ` line would allow a malformed artifact shape and produce a third state (`""`) instead of either a non-empty phase string or `null`.
  - **Recommendation:** Update Task 1 to reject `PHASE: ` and whitespace-only phase values as malformed, and add/adjust a fixture and test so the parser only accepts non-empty `PHASE: <value>` or no `PHASE:` line at all.

#### Minor (Nice to Have)

_None._

### Recommendations

- After fixing the Task 6 gate boundary, keep the final grep checks focused on live files while allowing historical spec/plan artifacts as Task 17 already describes.
