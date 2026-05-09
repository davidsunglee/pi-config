**Reviewer:** openai-codex/gpt-5.5 via pi

### Outcome

**Verdict:** Approved

**Reasoning:** The implementation meets the requested architecture: a shared helper is used by both plan extraction and plan-writing workflows, the dedicated `ambiguous_nested_fence` error preserves the existing stderr shape, and the targeted regression/smoke tests pass.

### Strengths

- `agent/skills/_shared/scripts/plan_fence_hardening.py:92-142` provides structured detection metadata with line, marker, fence lengths, and remediation hints as required.
- `agent/skills/execute-plan/scripts/extract-plan-tasks.py:222-239` checks ambiguous fences before required-section validation and returns the new protocol error without mixing in misleading missing-section failures.
- `agent/skills/_shared/scripts/tests/test_plan_fence_hardening.py` and `agent/skills/execute-plan/scripts/tests/test_extract_plan_tasks.py` cover malformed, safe-tilde, safe-long-backtick, CLI rewrite, and rewrite-then-parse behavior; the requested unittest command passed locally.
- `agent/skills/generate-plan/SKILL.md:79-83` and `agent/skills/refine-plan/refine-plan-prompt.md:92-96,198-202` wire hardening into the planned workflow points before refinement/re-review continues.

### Issues

#### Critical (Must Fix)

_None._

#### Important (Should Fix)

_None._

#### Minor (Nice to Have)

- **agent/skills/_shared/scripts/plan_fence_hardening.py:187: Rewriting drops outer fence info strings**
  - **What:** `_build_replacement_line` preserves indentation and newline but discards any info string on an ambiguous outer opener, e.g. rewriting ` ```markdown ` to `~~~` rather than `~~~markdown`.
  - **Why it matters:** This does not affect parser correctness, but it changes more than the fence marker/length and can remove useful markdown language metadata from examples.
  - **Recommendation:** Preserve `m.group(3)` when rewriting opener lines, while still emitting a bare closer line for the intended outer closer.

### Recommendations

_None._
