### Verification Summary
- Overall status: Fully remediated
- Verified commands:
  - `git rev-parse --abbrev-ref HEAD && git rev-parse --short HEAD` -> `plan/generate-plan-extension`, `6dbd559`
  - `cd agent && node --experimental-strip-types -e "import ext from './extensions/generate-plan/index.ts'; console.log(typeof ext)"` -> `function`
  - `cd agent && node --experimental-strip-types --test lib/generate-plan/*.test.ts extensions/generate-plan/*.test.ts` -> `120` tests passed, `0` failed

### Per-Finding Verification
1. dispatch/process failures are now surfaced in a way the engine can act on
   - Status: Fixed
   - Evidence: `createDispatchFn()` now turns process errors into a non-zero result and throws on any non-zero exit (`agent/extensions/generate-plan/index.ts:176-188`), instead of returning `{ text, exitCode }` for the engine to ignore. That means the generation and repair dispatches at `agent/lib/generate-plan/engine.ts:72-76` and `agent/lib/generate-plan/engine.ts:120-125` now fail fast rather than falling through to `readFile(planPath)`. Review fallback also now receives the signal it expects, because `runReview()` still retries only when `dispatchSubagent()` throws (`agent/lib/generate-plan/engine.ts:248-267`). The fallback behavior is covered by the passing test `agent/lib/generate-plan/engine.test.ts:705-733`.

2. `/generate-plan --async` now surfaces a clear start acknowledgement to the user
   - Status: Fixed
   - Evidence: In async mode, `handleGeneratePlan()` returns `{ success: true, message: "Plan generation started in background..." }` immediately (`agent/extensions/generate-plan/index.ts:356-364`). The command handler now always notifies `result.message` for successful and failed runs alike (`agent/extensions/generate-plan/index.ts:384-389`), so the async acknowledgement is no longer dropped.

3. todo parsing now matches or properly follows the canonical JSON-frontmatter parser behavior
   - Status: Fixed
   - Evidence: The generate-plan extension now uses a string/escape-aware `findJsonObjectEnd()` (`agent/extensions/generate-plan/index.ts:217-236`) and extracts the todo body with `replace(/^\r?\n+/, "")` (`agent/extensions/generate-plan/index.ts:273-277`). Those behaviors match the canonical todo parser's frontmatter splitting logic in `agent/extensions/todos.ts:839-893`, which uses the same string-aware brace scan and the same leading-newline removal for the body. This resolves the prior brace-in-string parsing drift and the old body-trimming mismatch.

4. dispatcher now forwards/handles agent tool allowlists appropriately, or otherwise resolves the contract drift concern
   - Status: Fixed
   - Evidence: `loadAgentConfig()` parses `tools` from agent frontmatter (`agent/extensions/execute-plan/subagent-dispatch.ts:188-200`), and `createDispatchFn()` now forwards that allowlist with `--tools` (`agent/extensions/generate-plan/index.ts:103-105`). That means the spawned generate-plan worker now honors the declared allowlist in `agent/agents/plan-generator.md:1-5`. Generate-plan's own dispatch contract does not currently expose a per-call `tools` override (`agent/lib/generate-plan/types.ts:35-39`), so while this path is narrower than execute-plan's dispatcher, there is no remaining contract drift within the generate-plan extension itself.

### Verdict
- Yes. The Task 12 review can be closed on the current branch state. All four prior findings are remediated in the code at `6dbd559`, and the verified import/test commands pass on this branch.