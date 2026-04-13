# Generate-Plan Extension Post-Remediation Verification Review

- **Date:** 2026-04-13
- **Reviewer:** `reviewer` subagent
- **Model:** `gpt-5.4`
- **Worktree:** `/Users/david/Code/pi-config-generate-plan-extension`
- **Branch / state reviewed:** current worktree including uncommitted modifications
- **Reviewed against:**
  - `.pi/plans/2026-04-12-generate-plan-extension.md`
  - `.pi/todos/d68082f8.md`

## Verification evidence

- Ran:
  - `node --experimental-strip-types --test agent/lib/generate-plan/*.test.ts agent/extensions/generate-plan/*.test.ts`
- Result:
  - **173 passed, 0 failed**

## Summary

Assessment: **With fixes**

The branch is close: architecture is strong, the core flow broadly matches the plan, and the relevant suite passes. But the current worktree includes a real input-classification regression, and the new “missing file” guard still does not protect against stale pre-existing plan files. Those are production-readiness blockers for a command that orchestrates file-based generation.

## Strengths

- The three-layer design from the plan is in place and still looks good:
  - pure core logic in `agent/lib/generate-plan/`
  - thin extension adapter in `agent/extensions/generate-plan/`
  - thin skill / dedicated `plan-reviewer`
- The engine flow matches the intended architecture well: input resolution, generation, validation gate, review, repair loop, and finalization are clearly separated.
- Recent worktree changes improved robustness:
  - `fileURLToPath(import.meta.url)` fixes path handling
  - missing generated-plan-file handling in `engine.ts` is better than before
  - `createTodoReadFn` now has direct tests
- Relevant tests are green in the current worktree.

## Issues

### Critical (Must Fix)

1. **Missing path-like inputs are silently downgraded to freeform text**
   - **File:** `agent/extensions/generate-plan/index.ts:63-72`
   - **Also codified in tests:** `agent/extensions/generate-plan/index.test.ts:80-95`
   - **What is wrong:** The current worktree logic treats path-like inputs (`docs/missing-spec.md`, `./nonexistent.ts`, `config.yaml`) as freeform text when the file does not exist.
   - **Why it matters:** A typo in a spec path no longer fails fast; instead, the system can generate a plan for the literal string `docs/missing-spec.md`. That is a silent misclassification that can lead to bad plans and confusing operator behavior.
   - **How to fix:** Restore fail-fast behavior for unambiguous file-like inputs. At minimum, throw for inputs containing `/`, starting with `.`, or absolute paths when the target does not exist. If you want to preserve prose like `support node.js`, refine the heuristic rather than falling back silently. Update the tests accordingly.

2. **The engine can accept a stale pre-existing plan file as if it were freshly generated**
   - **Files:**
     - `agent/lib/generate-plan/engine.ts:60-62`
     - `agent/lib/generate-plan/engine.ts:231-250`
   - **Related:** `agent/lib/generate-plan/path-utils.ts:18-24`
   - **What is wrong:** `derivePlanPath()` deterministically reuses the same date+slug filename, and `dispatchPlanGeneratorAndReadPlan()` only checks whether `planPath` exists after dispatch. If that file already existed from an earlier run, a no-op or misdirected generator can still satisfy the existence check, and the engine will read stale content.
   - **Why it matters:** This is a silent correctness bug. The branch now has a “missing file” guard, but not a “fresh output” guard. Repeated same-day generations for the same input are plausible, so stale-plan reuse is realistic.
   - **How to fix:** Make initial generation use a fresh target:
     - either derive a unique unused filename when the canonical path already exists,
     - or delete/truncate the existing target before dispatch and verify it was recreated/updated.
     For repair cycles, verify the target was actually rewritten (mtime/content/token marker) before trusting it.

### Important (Should Fix)

1. **Spawn failures still hide the real OS/process error**
   - **File:** `agent/extensions/generate-plan/index.ts:238-246`
   - **What is wrong:** `createDispatchFn()` now captures `stderr` for non-zero exits, but `proc.on("error", () => resolve(1))` discards the actual spawn error object. If the subprocess cannot be launched at all (`ENOENT`, permissions, bad executable), the final error is still just a generic exit-code failure.
   - **Why it matters:** This weakens operational robustness and makes dispatch failures harder to diagnose in exactly the environments where diagnostics matter most.
   - **How to fix:** Capture the error from `proc.on("error", (err) => ...)` and include `err.message` in the thrown exception when no subprocess actually started cleanly. Add a focused test for an `ENOENT`-style spawn failure.

### Minor (Nice to Have)

1. **The highest-risk extension wiring still lacks direct regression tests**
   - **File:** `agent/extensions/generate-plan/index.ts:151-510`
   - **Test gap:** `agent/extensions/generate-plan/index.test.ts`
   - **What is wrong:** Current tests cover helpers (`parseInput`, formatting, arg building, todo parsing), but there is still no direct test around:
     - `createDispatchFn()`
     - `handleGeneratePlan()`
     - command/tool registration and notification behavior
   - **Why it matters:** Recent bugs and remediations have landed in exactly this file. The suite passing does not currently prove the command/tool/dispatch wiring is stable.
   - **How to fix:** Add focused tests with mocked `spawn` and a fake `ExtensionAPI` / `ExtensionContext` covering:
     - cwd propagation through real dispatch setup
     - async vs sync notification behavior
     - spawn-error propagation
     - command/tool registration wiring

## Recommendations

- Reintroduce fail-fast tests for missing path-like inputs.
- Add a regression test for stale-plan-path reuse:
  - pre-create the derived plan file
  - make the generator “succeed” without rewriting it
  - assert generation fails instead of validating old content
- Add one dispatch-level test for subprocess launch failure and one handler-level test for `/generate-plan --async`.
- Confirm whether `.pi/todos/70ab6b9f.md` should be restored and tracked in the final branch diff.

## Assessment

- **Ready to merge?** With fixes
- **Reasoning:** The branch is close: architecture is strong, the core flow broadly matches the plan, and the relevant suite passes. But the current worktree includes a real input-classification regression, and the new “missing file” guard still does not protect against stale pre-existing plan files. Those are production-readiness blockers for a file-based generation command.
