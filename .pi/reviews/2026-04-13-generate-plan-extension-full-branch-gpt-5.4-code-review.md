# Generate-Plan Extension Full Branch Code Review

- **Date:** 2026-04-13
- **Reviewer:** `reviewer` subagent
- **Model:** `gpt-5.4`
- **Worktree:** `/Users/david/Code/pi-config-generate-plan-extension`
- **Branch:** `plan/generate-plan-extension`
- **Base SHA:** `bc5a742b855f6dfac07aeff37158004eac3eb177`
- **Head SHA:** `4c02bceaf2d4b70f3eb9bf2747233e77e8c3db66`
- **Reviewed against:**
  - `.pi/plans/2026-04-12-generate-plan-extension.md`
  - `.pi/todos/d68082f8.md`

## Summary

Assessment: **With fixes**

The branch is architecturally strong and broadly aligned with the plan, but it is not fully production-ready yet. The unrelated deletion should be reverted, and the command/repair-loop/dispatch robustness issues should be fixed before merge.

## Strengths

- The overall architecture matches the plan well:
  - pure/core logic in `agent/lib/generate-plan/`
  - thin pi adapter in `agent/extensions/generate-plan/`
  - thin replacement skill
  - dedicated `plan-reviewer` agent
- Good reuse of existing deterministic infrastructure instead of re-implementing:
  - shared `plan-contract`
  - existing `settings-loader`
  - execute-plan dispatch patterns
- The engine structure is clear and mostly well-separated:
  - input resolution
  - prompt construction
  - validation gate
  - review
  - repair loop
  - finalization
- Test coverage is broad for the new library surface, especially `engine.test.ts`.
- Review-note handling and review-template filling are deterministic and match the intended “code orchestrates, model synthesizes” design.

## Issues

### Critical (Must Fix)

1. **Unrelated todo deletion is included in the branch**
   - **Reference:** `.pi/todos/70ab6b9f.md:1-22`
   - **What is wrong:** The branch deletes an unrelated completed todo (`Update whimsical extension to use phrases from ai-phrases.txt`), which is not part of the generate-plan scope.
   - **Why it matters:** This is unrelated data loss in a feature branch. It increases merge risk and makes the diff noisier and less trustworthy.
   - **How to fix:** Restore `.pi/todos/70ab6b9f.md` before merge, or move that deletion into a separate intentional cleanup change with its own justification.

### Important (Should Fix)

1. **Repair-loop escalation is off by one for the original findings**
   - **References:**
     - `agent/lib/generate-plan/engine.ts:103-112`
     - `agent/lib/generate-plan/repair-loop.ts:121-151`
     - `agent/lib/generate-plan/engine.test.ts:575-577`
   - **What is wrong:** The engine creates an empty repair state before entering the loop, so the initial validation/review findings are not seeded into `state.findings` / `state.validationErrors`. As a result, findings that already existed before the first edit are treated like newly introduced issues after the first failed edit and start at `consecutiveEditFailures: 0`.
   - **Why it matters:** The plan explicitly says issues should escalate to `partial_regen` after surviving **2 consecutive edit attempts**. Current behavior delays escalation until a later cycle, adding unnecessary model calls, latency, and cost, and weakening the intended escape hatch semantics.
   - **How to fix:** Seed the repair state with the pre-loop findings/errors before the first edit, or introduce an initializer like `createRepairState(initialValidationErrors, initialReviewIssues)`. Then update the tests so persistent original issues escalate on the correct cycle, while genuinely new issues still get their own budget.

2. **`/generate-plan` async flag parsing can corrupt legitimate user input**
   - **Reference:** `agent/extensions/generate-plan/index.ts:450-451`
   - **What is wrong:** The command handler treats any `--async` substring in `args` as the flag and removes the first match from the input text.
   - **Why it matters:** Requests like `plan support for --async workers` or a filename/spec text containing `--async` will unintentionally switch to background mode and mutate the prompt text sent to the planner.
   - **How to fix:** Parse command arguments structurally instead of regex-replacing arbitrary text. Only treat `--async` as a standalone option token, and preserve the rest of the input verbatim.

3. **Async failures and non-converged runs are surfaced as info-level notifications**
   - **References:**
     - `agent/extensions/generate-plan/index.ts:366-379`
     - `agent/extensions/generate-plan/index.ts:418-423`
   - **What is wrong:** `createCallbacks()` always notifies async completion at `"info"` level, and the async catch path reports background errors via `callbacks.onProgress`, which is also `"info"`.
   - **Why it matters:** The spec says async mode should notify on completion **or escalate if repair doesn't converge**. Info-level toasts for `errors_found` or hard failures are too easy to miss and read like success.
   - **How to fix:** Choose notification severity from the result:
     - `approved` → `info`
     - `approved_with_notes` → `warning` or `info`
     - `errors_found` → `error` or at least `warning`
     - caught async exceptions → `error`
     Consider adding a dedicated error callback or calling `notify()` directly in the async catch path.

4. **Dispatch does not fail fast when an agent definition is missing or malformed**
   - **Reference:** `agent/extensions/generate-plan/index.ts:141-171`
   - **What is wrong:** `createDispatchFn()` calls `loadAgentConfig()`, but if it returns `null`, dispatch still proceeds with no validated agent config, no guaranteed system prompt, and potentially missing model/tools.
   - **Why it matters:** If `plan-generator.md` or `plan-reviewer.md` is missing, renamed, or has broken frontmatter, the extension silently falls back to a generic assistant-style invocation instead of failing loudly. That can produce bad plans/reviews with no obvious root cause.
   - **How to fix:** Treat missing/malformed agent config as a hard error. Throw a descriptive exception including the agent name and expected file path before spawning the subprocess. Add tests for both missing and malformed agent files.

5. **`partial_regen` prompts do not identify real sections for general review findings**
   - **Reference:** `agent/lib/generate-plan/prompt-builder.ts:129-157`
   - **What is wrong:** `getAffectedSections()` maps non-task findings to `"General"`, and it only derives section names from validation errors when there are **no** review findings.
   - **Why it matters:** The plan specifically requires partial regeneration to target affected sections by name. Prompts like “regenerate `General`” are not actionable for issues such as dependency problems, architecture gaps, spec coverage gaps, or file-structure defects, which makes the escape hatch much less likely to converge.
   - **How to fix:** Derive concrete section names from review findings as well as validation errors. Examples:
     - dependency issues → `Dependencies`
     - architecture issues → `Architecture Summary`
     - file mapping issues → `File Structure`
     - spec coverage gaps → relevant `Task N` or `Tasks`
     - task-numbered findings → `Task N`
     Merge both review-derived and validation-derived sections instead of ignoring validation errors whenever review findings exist.

### Minor (Nice to Have)

1. **Review parser is too strict about the issue-header dash character**
   - **Reference:** `agent/lib/generate-plan/review-parser.ts:80`
   - **What is wrong:** The parser only accepts headers with an em dash (`—`), not a hyphen (`-`) or en dash (`–`).
   - **Why it matters:** LLM output can drift slightly even with a strong format prompt. A visually correct review using a different dash will be treated as malformed and can trigger unnecessary repair cycles.
   - **How to fix:** Broaden the header regex to accept common dash variants, e.g. `[—–-]`, and add tests for each case.

2. **Slug generation can produce empty/degenerate filenames**
   - **References:**
     - `agent/lib/generate-plan/input-resolver.ts:7-18`
     - `agent/lib/generate-plan/path-utils.ts:17-20`
   - **What is wrong:** `slugify()` strips everything outside `[a-z0-9]`. Inputs such as punctuation-only text or non-Latin titles can collapse to an empty string, producing filenames like `2026-04-13-.md`.
   - **Why it matters:** That creates poor UX, increases collision risk, and handles internationalized input badly.
   - **How to fix:** Add a fallback slug such as `plan` or `untitled-plan`, and optionally make slugging more unicode-aware.

## Recommendations

- Restore the unrelated deleted todo before merge.
- Fix the repair-loop accounting first; it is central to the branch’s intended semantics.
- Add extension-level tests for:
  - `/generate-plan --async` flag parsing
  - async notification severity on failure / non-convergence
  - missing or malformed `plan-generator` / `plan-reviewer` agent config
- Add prompt-builder tests covering general/non-task reviewer findings in `partial_regen`.
- Add a small smoke/integration test around real dispatch argument construction so agent-loading regressions are caught earlier.

## Assessment

- **Ready to merge?** With fixes
- **Reasoning:** The branch is architecturally strong and broadly aligned with the plan, but it is not fully production-ready yet. The unrelated deletion should be reverted, and the command/repair-loop/dispatch robustness issues should be fixed before merge.
