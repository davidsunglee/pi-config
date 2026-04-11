# Wave 2b Code Review

## Strengths

- The new `ExecutionIO`-based helpers are generally well-factored. `worktree-ops.ts`, `test-ops.ts`, `state-manager.ts`, and `task-queue.ts` keep shell/filesystem behavior behind a narrow seam, which made the wave easy to review and test.
- `state-manager.ts` consistently routes writes through `writeStateAtomic()` (`agent/lib/execute-plan/state-manager.ts:23-33`), and the tests explicitly check the `.tmp` -> rename flow (`agent/lib/execute-plan/state-manager.test.ts:169-190`, `agent/lib/execute-plan/state-manager.test.ts:335-357`).
- Separating pure formatting into `tui-formatters.ts` was the right move for Task 20. The code review summary formatting in particular is easy to reason about and has good focused coverage (`agent/extensions/execute-plan/tui-formatters.ts:112-176`, `agent/extensions/execute-plan/tui-formatters.test.ts:211-295`).
- The small follow-up edits in `plan-parser.ts`, `settings-loader.ts`, `template-filler.ts`, and `wave-computation.ts` were narrow and did not raise new wave-specific concerns during this review.

## Issues

### Critical

- **Task 13's acceptance gate is still red: `npx tsc --noEmit` does not pass.**
  - Verification run: `cd agent && npx tsc --noEmit`
  - New wave errors:
    - `agent/extensions/execute-plan/judgment.ts:81` - `registerTool.execute` does not match the required 5-argument extension API signature and does not return an `AgentToolResult`.
    - `agent/extensions/execute-plan/judgment.test.ts:27` - the test harness calls the tool execute function with the wrong arity.
    - `agent/lib/execute-plan/task-queue.test.ts:41` - `config`/`options` are implicit `any` under `strict` mode.
  - There is also an unresolved earlier repo-wide type error at `agent/extensions/todos.ts:1767`, so Task 13's stated acceptance (`tsc --noEmit` passes after adding `lib/**/*.ts`) is not currently met.

### Important

- **`closeTodo()` still mutates the Markdown body, which conflicts with Task 11's final round-trip acceptance.**
  - `agent/lib/execute-plan/plan-lifecycle.ts:101-156` updates the JSON status and then appends `Completed by plan: ...` to the body.
  - Task 11 Step 5 / acceptance explicitly requires the round-trip test to prove the Markdown body is unchanged.
  - I verified this with a targeted `node --experimental-strip-types` check: closing a todo changes `Body line.` into `Body line.\n\nCompleted by plan: plan.md`.
  - The test that is supposed to guard this (`agent/lib/execute-plan/plan-lifecycle.test.ts:283-348`) only checks that original substrings are still present, so it misses the exact-body regression.

- **`findActiveRunInRepo()` does not ignore completed/stopped states if they still have a live lock.**
  - In `agent/lib/execute-plan/state-manager.ts:315-329`, the function returns the first state with a non-stale lock, without checking `state.status`.
  - Task 10's acceptance explicitly says completed/stopped state files must be ignored.
  - I verified this with a targeted `node --experimental-strip-types` script: a state marked `"completed"` with a live PID is currently returned as the active run.

- **`dispatchWorker()` misses two key Task 18 runtime requirements: live progress and reliable abort escalation.**
  - `agent/extensions/execute-plan/subagent-dispatch.ts:288-296` only calls `onProgress` from `message_end`, so progress is not forwarded from live streamed worker updates.
  - `agent/extensions/execute-plan/subagent-dispatch.ts:320-325` sends `SIGTERM` and then checks `proc.killed` before `SIGKILL`. In Node, `ChildProcess.killed` flips when the signal is sent, not when the child has actually exited, so the `SIGKILL` fallback will not fire for a process that ignores `SIGTERM`.
  - Both behaviors fall short of Task 18's acceptance criteria.

- **Task 20's TUI contract is only partially implemented.**
  - `SettingsConfirmationComponent` shows plan name, goal, and task count, but not wave count (`agent/extensions/execute-plan/tui.ts:112-117`).
  - `formatResumeStatus()` / `ResumePromptComponent` omit the required stop granularity and the explicit `"Previous execution did not exit cleanly."` messaging for running states (`agent/extensions/execute-plan/tui-formatters.ts:73-101`, `agent/extensions/execute-plan/tui.ts:304-323`).
  - These are explicit acceptance points in Tasks 20, not optional polish.

- **`sendJudgmentRequest()` is wired to `sendUserMessage()` instead of the plan's required `sendMessage()` path, and the tests were adjusted to match that divergence.**
  - Implementation: `agent/extensions/execute-plan/judgment.ts:113-119`
  - Test harness: `agent/extensions/execute-plan/judgment.test.ts:18-21`
  - Task 19 Step 4 explicitly called for `pi.sendMessage()`. Using `sendUserMessage()` changes the session semantics and means the planned judgment-injection path still is not what was implemented.

### Minor

- **`WaveProgressWidget` bypasses the formatter layer that Task 20 introduced.**
  - `agent/extensions/execute-plan/tui.ts:505-527` renders wave/task status directly instead of delegating to `formatWaveProgress()` from `agent/extensions/execute-plan/tui-formatters.ts:180-201`.
  - This is not a correctness bug today, but it weakens the separation the task explicitly asked for.

- **Some acceptance-critical paths are still effectively untested.**
  - `agent/extensions/execute-plan/subagent-dispatch.test.ts:7-10` only imports/tests `parseWorkerResponse()` and `loadAgentConfig()`; there is no coverage for `dispatchWorker()`, abort behavior, progress callbacks, or temp-file cleanup.
  - `agent/lib/execute-plan/plan-lifecycle.test.ts:320-348` reimplements brace-matching locally instead of exercising the canonical `todos.ts` parsing path, which helped the body-mutation bug slip through.

## Recommendations

- Fix the typecheck gate first. Make `registerJudgmentTool()` use the full extension-tool execute signature and return a proper `AgentToolResult`, fix the test harness arity, and add explicit parameter types in `task-queue.test.ts`. Then rerun `cd agent && npx tsc --noEmit`.
- Change `closeTodo()` so it only mutates JSON frontmatter status and preserves the Markdown body byte-for-byte. Strengthen the round-trip test with an exact body equality assertion.
- Update `findActiveRunInRepo()` to require `state.status === "running"` before honoring a live lock, and add a regression test for completed/stopped + live lock.
- Rework `dispatchWorker()` to emit progress from streaming events instead of only `message_end`, and track child exit separately from `proc.killed` so the SIGKILL fallback can actually execute.
- Finish the Task 20 UI contract by surfacing wave counts, stop granularity, and the explicit dirty-exit message. Also route `WaveProgressWidget` through `formatWaveProgress()` to keep formatting centralized.
- Once engine wiring lands, add a regression check that proves `isWorktreeDirectoryIgnored()` is actually consulted before worktree creation. I did not find a non-test call site for it in this worktree.

## Assessment

Focused tests for this wave are green, but the wave is not ready to land yet.

The biggest blocker is straightforward: Task 13's required typecheck is still failing. Beyond that, there are still contract mismatches in deterministic todo closing, repo-wide active-run detection, subagent abort/progress handling, and the TUI acceptance surface. I would treat this as **needs another pass before merge** rather than a final-review-quality wave.
