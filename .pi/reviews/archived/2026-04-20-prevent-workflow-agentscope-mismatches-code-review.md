# Code Review: Prevent Workflow agentScope Mismatches

**Date:** 2026-04-20
**Era:** v1
**Base SHA:** 0a38731cc56565c94af578c9a43800be81896991
**Head SHA:** 989a30133a35783a7e47a6d1d81cd3353ccbc869

---

## Review — Iteration 1 (Full Review)

**Model:** opus (crossProvider.capable)

All 84 tests pass, including the new guardrail.

### Strengths

- Correct scoping. Walks `path.resolve(import.meta.dirname, "..", "skills")` recursively with `readdir({ recursive: true, withFileTypes: true })`, filters on `.md` extension, and matches the plan's acceptance criteria (a)-(d) exactly.
- Uses only Node built-ins and the `node:test` runner as specified. No new dependencies, no `package.json` changes.
- Literal `line.includes("agentScope")` check with no regex, no case-folding, no exceptions — matches the plan's "no skip list / no per-line exceptions" requirement.
- Violation reporting includes repo-relative file path, 1-based line numbers, and the offending line text, which satisfies "clear, specific message."
- Correctly uses `entry.parentPath` (Node 20+ API) with a safe fallback for constructing the full path when `recursive: true` is passed to `readdir`.
- Test name is exactly `"workflow skill files must not specify agentScope"` as required.

### Issues

#### Critical (Must Fix)
None.

#### Important (Should Fix)
None.

#### Minor (Nice to Have)

1. **Trailing blank lines in SKILL.md**
   - File: `agent/skills/execute-plan/SKILL.md:747-749`
   - The commit added three trailing blank lines to the end of `SKILL.md`. Harmless but clutters the diff; consider trimming to a single trailing newline.

2. **Dead `"synthetic"` branch in test**
   - File: `agent/extensions/workflow-agent-scope.test.ts:52-55`
   - The `if (v.file === "synthetic")` branch is dead code. Likely a leftover from TDD scaffolding. Removing it would tighten the file.

3. **Missing vacuous-pass guard**
   - File: `agent/extensions/workflow-agent-scope.test.ts:7`
   - Consider adding `assert.ok(markdownFiles.length > 0)` to guard against a future refactor that silently points the walker at an empty directory and passes vacuously.

4. **Comment overstates helper behavior**
   - File: `agent/extensions/workflow-agent-scope.test.ts:11-26`
   - The "Helper function to collect all markdown files recursively" comment slightly overstates what the helper does (it's a single `readdir({ recursive: true })` call, not a manual recursion). Cosmetic only.

### Assessment

**Ready to merge: Yes**

**Reasoning:** The guardrail matches every acceptance criterion in the plan verbatim, all 84 tests pass, and the only findings are cosmetic (dead branch, stray blank lines, vacuous-pass risk). No critical or important issues.

---

## Final Verification

**Model:** opus (crossProvider.capable)
**Base SHA:** 0a38731cc56565c94af578c9a43800be81896991 (original pre-implementation)
**Head SHA:** 989a30133a35783a7e47a6d1d81cd3353ccbc869

Negative path verified: guardrail catches a violation and reports `file:line: text` correctly (injection of `agentScope: project` into `execute-plan/SKILL.md` produced the expected failure).

### Issues

#### Critical (Must Fix)
None.

#### Important (Should Fix)
None.

#### Minor (Nice to Have)

1. **Dead code branch** — `workflow-agent-scope.test.ts:53-55`
   - `if (v.file === "synthetic")` is unreachable; every `v.file` comes from `readdir`. Leftover from TDD scaffolding.

2. **Trailing blank lines** — `agent/skills/execute-plan/SKILL.md:748-750`
   - Three extra blank lines appended at EOF. Cosmetic.

3. **Vestigial `?? dir` fallback** — `workflow-agent-scope.test.ts:20`
   - `entry.parentPath ?? dir` fallback would collapse nested paths incorrectly on Node < 20.12, but repo already requires Node 22+ (`--experimental-strip-types`). The fallback is vestigial and could be removed or replaced with a direct assertion.

### Assessment

**Ready to merge: Yes**

**Reasoning:** Guardrail meets every acceptance criterion — scans only `agent/skills/**/*.md`, fails with file:line:text on any `agentScope` occurrence, cannot be bypassed, currently passes, and the full suite (84/84) remains green. Remaining issues are cosmetic and can be cleaned up opportunistically.

---

## Remediation Log

No remediation required — clean on first pass (Iteration 1 + Final Verification both returned "Ready to merge: Yes" with no Critical or Important issues).

**Result:** Clean after 1 iteration.
