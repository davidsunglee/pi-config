# Strengths

- `PiExecutionIO` cleanly implements the current `ExecutionIO` surface from `types.ts`, including the required singular `dispatchSubagent()` shape with `signal` and `onProgress` pass-through (`agent/lib/execute-plan/types.ts:16-43`, `agent/extensions/execute-plan/io-adapter.ts:20-137`).
- Task 17's file/process adapter coverage is strong and directly aligned with the spec. The tests exercise stdout capture, non-zero exits without throwing, stderr capture, file round-trips, directory listing, rename/unlink behavior, and dispatch delegation (`agent/extensions/execute-plan/io-adapter.test.ts:48-213`). I re-ran `cd agent && node --experimental-strip-types --test extensions/execute-plan/io-adapter.test.ts` and got 12 passed, 0 failed.
- The adapter's `exec()` implementation correctly uses `child_process.spawn()` and maps the `close` event's `code` to `ExecResult.exitCode`, including the explicit `null -> 1` fallback described in the task (`agent/extensions/execute-plan/io-adapter.ts:81-114`).
- Aside from the missing engine export, the barrel is otherwise comprehensive: it re-exports types, parser, wave computation, model resolution, settings loading, template helpers, git/worktree/test/state/lifecycle helpers, and `TaskQueue` (`agent/lib/execute-plan/index.ts:5-125`). The targeted typecheck also passes: `cd agent && npx tsc --noEmit --target ESNext --module NodeNext --moduleResolution NodeNext --strict --esModuleInterop --skipLibCheck --allowImportingTsExtensions lib/execute-plan/index.ts extensions/execute-plan/io-adapter.ts extensions/execute-plan/io-adapter.test.ts`.

# Issues

## Critical

- **Task 14 is not complete: the barrel does not export `PlanExecutionEngine`, and the backing module is absent.**
  - **File:line:** `agent/lib/execute-plan/index.ts:124-125`
  - **What the code shows:** The barrel ends with `export { TaskQueue } from "./task-queue.js";` and contains no `PlanExecutionEngine` re-export anywhere in the file (`agent/lib/execute-plan/index.ts:39-125`).
  - **Why this violates the task spec:** Task 14 Step 1 explicitly requires `index.ts` to re-export "all public APIs from all modules ... TaskQueue, and PlanExecutionEngine," and the acceptance criteria require that the barrel export all public APIs.
  - **Verification:**
    - `cd agent && test -f lib/execute-plan/engine.ts` -> exit code `1`
    - `cd agent && rg -n 'PlanExecutionEngine|\.\/engine\.js' lib/execute-plan/index.ts` -> no matches
  - **Impact:** Consumers cannot import the engine from the package's intended public entrypoint, so the barrel does not meet Task 14's required API surface.

## Important

- None.

## Minor

- None.

# Recommendations

- Implement `agent/lib/execute-plan/engine.ts` and export `PlanExecutionEngine` from `agent/lib/execute-plan/index.ts`, then rerun the targeted typecheck against the barrel.
- Once the engine exists, add a small import-level regression check that imports `PlanExecutionEngine` from `agent/lib/execute-plan/index.ts` so Task 14's public API requirement is exercised directly, not just inferred from the barrel text.
- For Task 17, keep the current adapter and tests as-is unless later engine integration reveals a contract mismatch; I did not find a task-scope issue in `io-adapter.ts` or `io-adapter.test.ts`.

# Assessment

Task 17 looks good and is review-ready: the implementation matches the `ExecutionIO` contract, the tests are focused and green, and the targeted typecheck passes.

Task 14 is not review-ready yet. The barrel is missing the required `PlanExecutionEngine` export, and `agent/lib/execute-plan/engine.ts` is currently missing entirely. Because Task 14 is one of the two wave-3 tasks in scope, I would treat wave 3 as **not ready to merge yet** until that public API gap is closed.