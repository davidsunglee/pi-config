# Review: `23b7ebeffc1833e82b1e2cee874f254318688f70..88baddca7c77395f32cee34de63d0cf8e716f7d2`

## Scope
Reviewed the changes in this git range against:
- `docs/superpowers/plans/2026-04-13-review-loop.md`
- `docs/superpowers/specs/2026-04-13-review-and-remediate-design.md`

Also checked for internal consistency across the changed skills, agents, and prompt templates.

## Summary
The core review-loop architecture is present and mostly aligned with the intended direction, but there are material contradictions between the plan and the design spec, plus several implementation-level contract mismatches and stale references.

---

## A. Document contradictions

### 1. Model-matrix key names conflict
- **Plan:** `docs/superpowers/plans/2026-04-13-review-loop.md:351-354`
  - Uses: `crossProvider.capable`, `standard`, `capable`
- **Spec:** `docs/superpowers/specs/2026-04-13-review-and-remediate-design.md:21-25`
  - Uses: `crossProvider.capable`, `modelTiers.standard`, `modelTiers.capable`
- **Why it matters:** This changes the expected shape of `~/.pi/agent/models.json` and therefore how model lookup should work at runtime.
- **Review impact:** The implementation is inconsistent here, so conformance depends on which document is treated as authoritative.

### 2. Hybrid re-review placeholder contract conflicts
- **Plan:** `docs/superpowers/plans/2026-04-13-review-loop.md:419-428`
  - Uses `{PREV_HEAD}` / `{NEW_HEAD}` and renders the remediation diff from those SHAs
- **Spec:** `docs/superpowers/specs/2026-04-13-review-and-remediate-design.md:224-228`
  - Uses `{REMEDIATION_DIFF}`
- **Why it matters:** This changes what the coordinator is supposed to inject into `re-review-block.md`.
- **Review impact:** The implementation follows the **plan**, not the spec.

## Review approach
Because of these contradictions, implementation was judged primarily against the **more specific plan** plus internal consistency across the changed files.

---

## B. Implementation issues

### 1. `execute-plan` still uses the old `modelTiers.*` contract after switching to `models.json`
- **File:** `agent/skills/execute-plan/SKILL.md:158-177`
- **What:** Step 6 reads `~/.pi/agent/models.json`, but the mapping table and instructions still refer to `modelTiers.capable`, `modelTiers.standard`, and `modelTiers.cheap`.
- **Why it matters:** This conflicts with the new review-loop files, which assume top-level keys like `standard` and `capable`. Model lookup is ambiguous or broken depending on the actual `models.json` shape.

### 2. Main-branch confirmation still offers a removed “disable commits/checkpoints” path
- **File:** `agent/skills/execute-plan/SKILL.md:224-225`
- **What:** The text says that answering `n` disables commit-per-wave and proceeds without checkpoints.
- **Why it matters:** Later in the same file, Step 9b unconditionally commits wave changes. The skill now presents an option the rest of the flow no longer supports.

### 3. A removed spec-review step is still referenced
- **File:** `agent/skills/execute-plan/SKILL.md:299`
- **What:** The file says post-wave actions happen after “spec review complete successfully.”
- **Why it matters:** Spec review was removed and `agent/skills/execute-plan/spec-reviewer.md` was deleted. This is a stale instruction in the main execution flow.

### 4. Review-loop fills the wrong placeholder for “What Was Implemented”
- **Template:** `agent/skills/requesting-code-review/code-reviewer.md:13-16`
  - `## What Was Implemented` renders `{DESCRIPTION}`
- **Caller instructions:**
  - `agent/skills/review-loop/remediation-prompt.md:39-45`
  - `agent/skills/review-loop/remediation-prompt.md:101-106`
  - `agent/skills/review-loop/remediation-prompt.md:118-122`
- **What:** The review-loop instructions set `{DESCRIPTION}` to strings like `"Review-loop: full review"`, `"hybrid re-review"`, and `"final verification"`, while the actual implementation summary goes into `{WHAT_WAS_IMPLEMENTED}`.
- **Why it matters:** The reviewer prompt’s “What Was Implemented” section will show the loop phase instead of the actual feature/change summary.

### 5. “Ready to merge” verdict format is inconsistent across the new review-loop flow
- **Reviewer template:** `agent/skills/requesting-code-review/code-reviewer.md:91-95`
  - Uses `**Ready to merge?** [Yes/No/With fixes]`
- **Review-loop logic:**
  - `agent/skills/review-loop/remediation-prompt.md:59-60`
  - `agent/skills/review-loop/re-review-block.md:27`
  - Looks for or instructs `"Ready to merge: Yes"`
- **Why it matters:** Clean-pass detection is brittle. A reviewer following the template exactly may emit `Ready to merge? Yes`, while the coordinator logic expects `Ready to merge: Yes`.

---

## C. Notable things that look correct

### 1. The core architecture landed as intended
New review-loop components exist:
- `agent/agents/code-reviewer.md`
- `agent/agents/remediation-coordinator.md`
- `agent/skills/review-loop/SKILL.md`
- `agent/skills/review-loop/remediation-prompt.md`
- `agent/skills/review-loop/re-review-block.md`

### 2. The reusable review prompt was extended in the right place
- **File:** `agent/skills/requesting-code-review/code-reviewer.md:21-33`
- `{RE_REVIEW_BLOCK}` was inserted between the git-range section and the review checklist, matching the intended hybrid re-review flow.

### 3. `requesting-code-review` now dispatches the dedicated reviewer agent
- **File:** `agent/skills/requesting-code-review/SKILL.md:43-52`
- This correctly stops repurposing the implementer agent for review.

### 4. `execute-plan` picked up the major structural changes
- Git precondition added: `agent/skills/execute-plan/SKILL.md:12-17`
- Settings flattened: `agent/skills/execute-plan/SKILL.md:70-118`
- Step 12 delegated to `review-loop`: `agent/skills/execute-plan/SKILL.md:384-408`
- `spec-reviewer.md` removed as planned

---

## Verdict
The architectural refactor is mostly in place, but the implementation is not yet fully conformant because of:
- document-level contradictions that were not resolved into one consistent runtime contract
- model-key contract drift
- stale execute-plan wording/paths
- review-loop prompt contract mismatches

These should be fixed before considering the review-loop work internally consistent and fully aligned with its plan/spec.
