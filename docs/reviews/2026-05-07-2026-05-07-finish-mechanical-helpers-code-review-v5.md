**Reviewer:** openai-codex/gpt-5.5 via pi

### Outcome

**Verdict:** Not approved

**Reasoning:** The helper suite is broadly implemented and `cd agent && npm run check` passes, but one helper violates the bounded-read requirement that was central to the spec and should be fixed before approval.

### Strengths

- The implementation adds all nine requested helper CLIs with stdlib-only Python and wires them into the helper test chain (`agent/package.json:7`).
- Adoption sites shrink the markdown procedures while preserving the interactive routing policy in the skills (`agent/skills/generate-plan/SKILL.md:25-31`, `agent/skills/execute-plan/SKILL.md:300-341`).
- The helper tests are extensive and exercise happy paths plus many protocol failures; the full `cd agent && npm run check` command passes locally.

### Issues

#### Critical (Must Fix)

_None._

#### Important (Should Fix)

- **agent/skills/_shared/scripts/extract-provenance-preamble.py:49: Helper reads the entire markdown file instead of only the bounded preamble**
  - **What:** `fh.readlines()` loads the whole file before slicing to the first 40 lines or 8 lines. The spec requires this helper to read only the bounded preamble region (`spec`: first `## ` or 40 lines; `brief`: first 8 lines), preserving the bounded-read boundary for large specs/briefs.
  - **Why it matters:** Large RFCs, generated docs, or accidentally supplied logs can still be fully read into memory even though only a small preamble is needed. This misses a core requirement of moving preamble extraction into a deterministic helper.
  - **Recommendation:** Iterate line-by-line and stop as soon as the mode's bound is reached (or the first `## ` heading in spec mode), then scan only the collected bounded lines. Add a regression test using a file-like or large temp file with a sentinel after the bound to ensure the helper stops early.

#### Minor (Nice to Have)

- **agent/skills/_shared/scripts/classify-workflow-drift.py:186: Missing-SHA classification is delayed until after `git rev-parse`**
  - **What:** When the brief preamble has no valid `Git SHA:`, the helper still runs `git rev-parse HEAD` first and returns `uninspectable_c` if that git command fails. The documented pipeline routes missing/malformed brief SHA to `uninspectable_a` before later git checks.
  - **Why it matters:** In a double-failure case, users see the wrong canonical message and outcome tag for the preamble problem.
  - **Recommendation:** Return `uninspectable_a` immediately after preamble extraction fails to produce a SHA, or add an explicit test documenting the intended precedence if the current behavior is deliberate.

### Recommendations

- Add tests that assert bounded I/O behavior, not just bounded extraction results, for helpers whose contract is explicitly about reading only preamble regions.
