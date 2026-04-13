### Strengths
- The extension shape is close to the planned architecture: `agent/extensions/generate-plan/index.ts` stays relatively thin, constructs `PiGenerationIO`, instantiates `PlanGenerationEngine`, and wires the user-facing callbacks through the extension context (`agent/extensions/generate-plan/index.ts:296-351`).
- The success message formatting is good and meets the intended UX content: it includes the generated plan path, review status, optional review-path details, and a concrete `/execute-plan` follow-up (`agent/extensions/generate-plan/index.ts:260-287`).
- The review-file ownership boundary is in the right place. The dispatch layer returns text/exit status only (`agent/extensions/generate-plan/index.ts:84-199`), while the engine writes review output itself (`agent/lib/generate-plan/engine.ts:220-273`). That matches the desired separation of concerns.
- Verification is strong at the library level. I re-ran:
  - `cd agent && node --experimental-strip-types -e "import ext from './extensions/generate-plan/index.ts'; console.log(typeof ext)"` -> `function`
  - `cd agent && node --experimental-strip-types --test lib/generate-plan/*.test.ts extensions/generate-plan/*.test.ts` -> 120/120 passing

### Issues

#### Critical
- **Real subagent/process failures are not surfaced in a way the engine can act on, so fallback and failure handling are broken in the actual extension path.** `createDispatchFn()` always resolves with `{ text, exitCode }`, even when the child process errors or exits non-zero (`agent/extensions/generate-plan/index.ts:129-182`). But `PlanGenerationEngine.runReview()` only triggers the cross-provider fallback when `dispatchSubagent()` throws (`agent/lib/generate-plan/engine.ts:248-268`), and the generation/edit paths ignore `exitCode` entirely (`agent/lib/generate-plan/engine.ts:72-76,120-125`). In practice, that means a failed review dispatch can quietly become an empty/parse-error review instead of falling back, and a failed generate/edit dispatch can fall through to `readFile(planPath)` and potentially reuse stale or missing plan output instead of failing fast.

#### Important
- **`/generate-plan --async` computes a start message but never actually shows it to the user.** `handleGeneratePlan()` returns `"Plan generation started in background..."` for async runs (`agent/extensions/generate-plan/index.ts:333-341`), but the command handler only notifies on failure and drops successful results (`agent/extensions/generate-plan/index.ts:361-370`). That misses the Task 12 requirement to return immediately with a clear "generation started" message when background execution is used.
- **Todo parsing does not match the project's canonical JSON-frontmatter parser and can reject valid todo files.** `createTodoReadFn()` finds the end of the frontmatter by counting `{`/`}` without tracking quoted strings or escapes, then `trim()`s the entire body (`agent/extensions/generate-plan/index.ts:223-253`). The canonical todo parser in `agent/extensions/todos.ts` is string-aware and only strips leading blank lines after the JSON block (`agent/extensions/todos.ts:839-893`). A valid todo title or other JSON string containing braces can terminate the scan early here and break `readTodo()`.

#### Minor
- **The generate-plan dispatcher loads agent config but ignores the agent's declared tool allowlist.** `createDispatchFn()` forwards model and system prompt only (`agent/extensions/generate-plan/index.ts:95-125`), unlike the execute-plan dispatcher which also passes tools from config/frontmatter (`agent/extensions/execute-plan/subagent-dispatch.ts:226-228`). That means `plan-generator`'s declared tools (`agent/agents/plan-generator.md:2-5`) are not actually part of the spawned-process contract, which is a drift risk even if current CLI defaults happen to work.

### Recommendations
- Make `createDispatchFn()` fail loudly on spawn errors and non-zero exits, or have the engine explicitly validate `SubagentOutput.exitCode` before proceeding. Add an extension-level regression test that exercises a real non-zero dispatch and proves the review-model fallback fires.
- Surface the async start acknowledgment from the command path. The simplest fix is to notify on successful async `handleGeneratePlan()` results instead of only notifying on errors.
- Reuse the canonical todo frontmatter splitting logic from `agent/extensions/todos.ts`, or copy it exactly with string/escape-aware brace handling and body extraction semantics.
- Add focused tests for `agent/extensions/generate-plan/index.ts`; the current green suite is almost entirely library-level and does not cover the command/tool wrapper, async UX, or process-dispatch failure semantics.

### Assessment
**Ready to merge?** No.

**Reasoning:** The overall design is solid and the core/library test suite is green, but there is still one production-path blocker in the extension layer: dispatch failures are not surfaced in the way the engine expects, which undermines both review fallback and failure handling. The async start-message gap and the todo-parser drift are smaller, but still worth fixing before calling Task 12 complete.