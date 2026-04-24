# Execute-Plan Extension: Move Orchestration from Prose to Code

## Goal

Replace the 300-line prose `SKILL.md` driving `execute-plan` with a pi extension backed by a pure TypeScript core library. The extension handles all deterministic orchestration (plan parsing, wave computation, model resolution, subagent dispatch, state tracking, git operations, test running, TUI). Agents are only consulted for judgment calls (BLOCKED, DONE_WITH_CONCERNS, spec review interpretation, retry strategy). The core library exports a `PlanExecutionEngine` driven by an injected `ExecutionIO` interface, keeping the extension as a thin pi adapter.

## Architecture Summary

Three layers with clear boundaries:

1. **Core library** (`agent/lib/execute-plan/`) — Pure TypeScript, no pi imports. All deterministic logic: plan parsing, wave computation, model resolution, template filling, state management, git operations, test operations, worktree setup, settings loading. Exports helper modules **and** a `PlanExecutionEngine` that owns the full deterministic execution loop, driven by an injected `ExecutionIO` interface. Testable in isolation with mock I/O.

2. **Pi extension** (`agent/extensions/execute-plan/`) — Thin wrapper implementing `ExecutionIO` using pi APIs. Registers `/execute-plan` command **and** `execute_plan` tool. Owns TUI (settings confirmation, wave progress, failure handling, review summary), subagent dispatch implementation (loading agent config, resolving system prompt and tools, spawning pi processes), user interaction, and agent handoff for judgment calls. Delegates all orchestration to the core engine.

3. **Thin skill** (`agent/skills/execute-plan/SKILL.md`) — Drastically reduced from 300 lines. Tells the agent to use `/execute-plan` or the `execute_plan` tool and how to respond to judgment calls.

**Key design principle:** Code orchestrates; agents judge.

**Key architectural decisions that address reviewer findings:**

1. **State manager has a general `updateState` method.** Instead of narrow APIs, the state manager exposes `updateState(io, cwd, planFileName, updater: (state: RunState) => RunState)` alongside convenience methods. This lets the engine write `preExecutionSha`, `baselineTest`, cancellation fields (`status`, `stoppedAt`, `stopGranularity`), and any future field without inventing new methods per field.

2. **Engine owns a task queue with AbortSignal for cancellation.** `dispatchSubagents` on `ExecutionIO` does NOT accept an array of configs for bulk dispatch. Instead, the engine owns concurrency control: it enqueues individual `io.dispatchSubagent()` calls through a `TaskQueue` with a concurrency limit and `AbortSignal`. "Stop after current task" aborts the queue (no more tasks launched), while "stop after current wave" lets the queue drain. This makes both cancellation granularities implementable without redesigning the I/O interface.

3. **Worktree callback returns a choice, engine creates the worktree.** `requestWorktreeSetup` returns `WorkspaceChoice` (`{ type: "worktree"; branch: string } | { type: "current" }`), NOT `WorkspaceInfo`. The engine then calls `worktree-ops.createWorktree()` to produce the actual `WorkspaceInfo`. This eliminates the contradiction where the callback returned final data before the worktree existed.

4. **Engine has explicit branching rules for every JudgmentResponse action.** The engine documents and tests what happens for each action: `retry` re-dispatches with optional model/context override, `skip` marks the task done and proceeds, `stop` halts execution, `provide_context` re-dispatches with extra context appended, `accept` proceeds (for DONE_WITH_CONCERNS/code review), `escalate` notifies user via `requestFailureAction`.

5. **Judgment tool is registered once globally by the extension.** The judgment bridge manages only pending Promises, not tool registration. `registerJudgmentTool` is called once in the extension factory. `createJudgmentBridge` attaches/detaches a pending resolver without re-registering the tool.

6. **Custom test command input is explicitly assigned.** The SettingsConfirmationComponent handles custom test command entry during customize mode, and the extension also exposes a dedicated TestCommandInputComponent for the no-detected-command path.

7. **Retry metadata is persisted in run state.** `RunState` includes a typed `retryState` structure for task-level, wave-level, and final-review retry tracking. The engine updates it via `updateState()` before each retry so resume logic can continue with the real persisted attempt count instead of in-memory counters.

8. **Final code review findings have an explicit engine → TUI contract.** The engine emits a typed `code_review_completed` progress event carrying a `CodeReviewSummary`. The extension caches that summary and passes it to `ReviewSummaryComponent`, so the final review UI does not depend on side channels or ad-hoc log parsing.

9. **Plan review stays out of execute-plan scope.** `plan-reviewer.md` remains part of `generate-plan`. This extension only loads and fills implementer, spec-reviewer, and code-reviewer templates.

## Tech Stack

- **Language:** TypeScript (ESNext, NodeNext modules)
- **Runtime:** Node.js with `--experimental-strip-types`
- **Testing:** `node:test` + `node:assert/strict` (project convention)
- **TUI:** `@mariozechner/pi-tui` (Container, Text, SelectList, DynamicBorder, Input, etc.)
- **Extension API:** `@mariozechner/pi-coding-agent` (ExtensionAPI, ExtensionContext, etc.)
- **Type validation:** `@sinclair/typebox`

## File Structure

### Core Library (no pi dependencies)
- `agent/lib/execute-plan/types.ts` (Create) — Shared types: Plan, PlanTask, Wave, ExecutionSettings, RunState, RetryState, RetryRecord, ExecutionIO interface (single-dispatch only, no bulk dispatchSubagents), EngineCallbacks interface (with typed decision methods and WorkspaceChoice return), SubagentConfig, SubagentResult, WorkerStatus, ModelTiers, JudgmentRequest, JudgmentResponse (with explicit action semantics), CodeReviewFinding, CodeReviewSummary, CancellationState, ProgressEvent (including `code_review_completed`), WorkspaceInfo, WorkspaceChoice, TaskQueue
- `agent/lib/execute-plan/plan-parser.ts` (Create) — Parse plan markdown: extract header/tasks/dependencies/risks/test-command, validate all 5 required sections including file structure
- `agent/lib/execute-plan/wave-computation.ts` (Create) — Build dependency graph, assign tasks to waves, enforce ≤7 tasks per wave
- `agent/lib/execute-plan/model-resolver.ts` (Create) — Map task recommendations (cheap/standard/capable) to concrete model strings from a provided ModelTiers object, resolve crossProvider tiers
- `agent/lib/execute-plan/settings-loader.ts` (Create) — Read and validate settings.json, extract modelTiers, provide clear errors for missing/malformed config
- `agent/lib/execute-plan/template-filler.ts` (Create) — Load and fill the execute-plan templates: implementer-prompt.md, spec-reviewer.md, code-reviewer.md (`plan-reviewer.md` stays under generate-plan scope)
- `agent/lib/execute-plan/state-manager.ts` (Create) — Read/write `.pi/plan-runs/<plan>.state.json`, general `updateState()` method, repo-wide lock management, acquire/release/stale detection, crash detection, resume validation
- `agent/lib/execute-plan/git-ops.ts` (Create) — Detect branch/worktree, stage+commit with structured messages (mandatory, uses --allow-empty), reset on retry, verify commit SHAs, check if in git repo, check dirty state, detect main branch
- `agent/lib/execute-plan/worktree-ops.ts` (Create) — Create worktrees, select worktree directory, suggest branch names, verify worktree exists, cleanup helpers
- `agent/lib/execute-plan/test-ops.ts` (Create) — Run test command, capture baseline, compare post-wave results, detect regressions
- `agent/lib/execute-plan/plan-lifecycle.ts` (Create) — Move plan to done/, extract and close linked todo deterministically (direct file manipulation), delete state file
- `agent/lib/execute-plan/task-queue.ts` (Create) — Concurrency-limited task queue with AbortSignal support for both cancellation granularities
- `agent/lib/execute-plan/engine.ts` (Create) — `PlanExecutionEngine` class: owns the full deterministic execution loop. Uses typed `EngineCallbacks` for all decision points. Contains retry, resume, and cancellation state machine logic, persists retry metadata into `RunState`, and emits typed final-review summary events for the TUI. Has explicit branching rules for every JudgmentResponse action.
- `agent/lib/execute-plan/index.ts` (Create) — Re-export all public APIs

### Core Library Tests
- `agent/lib/execute-plan/plan-parser.test.ts` (Create) — Tests for plan parsing and validation
- `agent/lib/execute-plan/wave-computation.test.ts` (Create) — Tests for dependency graph and wave assignment
- `agent/lib/execute-plan/model-resolver.test.ts` (Create) — Tests for model tier resolution
- `agent/lib/execute-plan/settings-loader.test.ts` (Create) — Tests for settings.json loading and validation
- `agent/lib/execute-plan/template-filler.test.ts` (Create) — Tests for all 3 execute-plan template types (implementer, spec-reviewer, code-reviewer)
- `agent/lib/execute-plan/state-manager.test.ts` (Create) — Tests for state file CRUD, general updateState, repo-wide locking, resume validation
- `agent/lib/execute-plan/git-ops.test.ts` (Create) — Tests for git operations via mock ExecutionIO
- `agent/lib/execute-plan/worktree-ops.test.ts` (Create) — Tests for worktree creation, directory selection, branch naming
- `agent/lib/execute-plan/test-ops.test.ts` (Create) — Tests for test baseline capture and regression detection
- `agent/lib/execute-plan/plan-lifecycle.test.ts` (Create) — Tests for plan move-to-done and deterministic todo closing
- `agent/lib/execute-plan/task-queue.test.ts` (Create) — Tests for task queue concurrency control, abort, both cancellation granularities
- `agent/lib/execute-plan/engine.test.ts` (Create) — Tests for PlanExecutionEngine: full lifecycle, persisted retry logic, resume, cancellation, wave sequencing, explicit JudgmentResponse action handling, and final review summary events

### Extension
- `agent/extensions/execute-plan/index.ts` (Create) — Extension entry point: command + tool registration, judgment tool registered once globally, instantiates engine, wires typed callbacks to TUI/agent, and forwards `code_review_completed` summaries into `ReviewSummaryComponent`
- `agent/extensions/execute-plan/tui.ts` (Create) — TUI components: settings confirmation (with custom test command input), resume prompt, wave progress widget, failure handling, worktree selection, cancellation selection, main branch warning, review summary display for typed `CodeReviewSummary`
- `agent/extensions/execute-plan/tui-formatters.ts` (Create) — Pure data-transformation functions for TUI components: settings grid formatting, resume status formatting, code review summary to Markdown, wave progress text, failure context display
- `agent/extensions/execute-plan/tui-formatters.test.ts` (Create) — Tests for all TUI formatting helpers
- `agent/extensions/execute-plan/subagent-dispatch.ts` (Create) — Subagent spawn/parse logic: loads agent config (system prompt, tools, model), spawns pi process with correct flags, parses JSON event stream
- `agent/extensions/execute-plan/subagent-dispatch.test.ts` (Create) — Tests for worker response parsing and dispatch abort handling
- `agent/extensions/execute-plan/io-adapter.ts` (Create) — Implements ExecutionIO using pi extension APIs and Node.js fs (single dispatchSubagent only, no bulk dispatch)
- `agent/extensions/execute-plan/io-adapter.test.ts` (Create) — Tests for I/O adapter: exec stdout/stderr/exitCode capture, file operation round-trips, dispatch delegation
- `agent/extensions/execute-plan/judgment.ts` (Create) — Agent handoff: sendJudgmentRequest formats context, registerJudgmentTool called once globally, createJudgmentBridge manages only pending Promises (no tool registration/unregistration)
- `agent/extensions/execute-plan/judgment.test.ts` (Create) — Tests for judgment bridge Promise lifecycle, timeout, stale resolver rejection

### Skill (Thin Replacement)
- `agent/skills/execute-plan/SKILL.md` (Modify) — Replace 300-line prose with thin stub pointing to extension

### Config Updates
- `agent/tsconfig.json` (Modify) — Add `lib/**/*.ts` to include array
- `agent/package.json` (Modify) — Update test script to also run `lib/**/*.test.ts`

**Source:** `TODO-0ecb4b31`

---

## Tasks

### Task 1: Core types, ExecutionIO interface, and EngineCallbacks contract

**Files:**
- Create: `agent/lib/execute-plan/types.ts`

**Steps:**
- [ ] **Step 1: Create the lib directory structure** — Create `agent/lib/execute-plan/` directory.
- [ ] **Step 2: Define the ExecutionIO interface** — Write `types.ts` with the `ExecutionIO` interface. This interface supports only single-dispatch — no `dispatchSubagents` bulk method. The engine owns concurrency via TaskQueue.
  ```typescript
  export interface ExecutionIO {
    readFile(path: string): Promise<string>;
    writeFile(path: string, content: string): Promise<void>;
    exec(command: string, args: string[], cwd: string): Promise<ExecResult>;
    fileExists(path: string): Promise<boolean>;
    mkdir(path: string): Promise<void>;
    unlink(path: string): Promise<void>;
    rename(src: string, dest: string): Promise<void>;
    readdir(path: string): Promise<string[]>;
    /** Dispatch a single subagent. The engine manages concurrency and cancellation via TaskQueue,
     *  while this method carries per-worker progress back up to the engine/TUI. */
    dispatchSubagent(
      config: SubagentConfig,
      options?: {
        signal?: AbortSignal;
        onProgress?: (taskNumber: number, status: string) => void;
      }
    ): Promise<SubagentResult>;
    getPid(): number;
    getSessionId(): string;
  }
  ```
  Note: `dispatchSubagent` accepts both an `AbortSignal` and an `onProgress` callback. The engine's TaskQueue uses `signal` for cancellation and forwards `onProgress` so live worker updates can flow end-to-end from the subprocess parser → I/O adapter → TaskQueue → engine → WaveProgressWidget. There is no `dispatchSubagents` method — the engine loops over tasks itself, which is what makes "stop after current task" implementable.
- [ ] **Step 3: Define WorkspaceChoice and EngineCallbacks interface** — This is the critical contract between engine and extension. WorkspaceChoice is what the callback returns; WorkspaceInfo is what the engine produces after creating the worktree.
  ```typescript
  /** What the user chose — NOT the final workspace. Engine creates the worktree. */
  export type WorkspaceChoice =
    | { type: "worktree"; branch: string }
    | { type: "current" };

  /** Final workspace info after engine creates worktree or uses current dir. */
  export interface WorkspaceInfo {
    type: "worktree" | "current";
    path: string;
    branch: string;
  }

  export interface EngineCallbacks {
    /** Show settings to user, return confirmed settings. The engine provides detected defaults. */
    requestSettings(plan: Plan, detected: Partial<ExecutionSettings>): Promise<ExecutionSettings>;

    /** Ask user whether to continue, restart, or cancel when a state file is found. */
    requestResumeAction(state: RunState): Promise<"continue" | "restart" | "cancel">;

    /** Warn user about committing directly to main branch. Returns true to proceed. */
    confirmMainBranch(branch: string): Promise<boolean>;

    /** Ask user whether to set up a worktree or use current workspace.
     *  Returns a CHOICE — engine handles creation via worktree-ops. */
    requestWorktreeSetup(suggestedBranch: string, cwd: string): Promise<WorkspaceChoice>;

    /** Present failure to user with retry/skip/stop options. */
    requestFailureAction(context: FailureContext): Promise<"retry" | "skip" | "stop">;

    /** Present test regression to user with retry/skip/stop options. */
    requestTestRegressionAction(context: TestRegressionContext): Promise<"retry" | "skip" | "stop">;

    /** Present custom test command input when user enables integration tests but no command is detected. */
    requestTestCommand(): Promise<string | null>;

    /** Ask agent for judgment on BLOCKED, DONE_WITH_CONCERNS, spec review, etc. */
    requestJudgment(request: JudgmentRequest): Promise<JudgmentResponse>;

    /** Fire-and-forget progress updates for TUI rendering. Does not block the engine. */
    onProgress(event: ProgressEvent): void;
  }
  ```
- [ ] **Step 4: Define plan data types** — In the same file, define:
  - `ExecResult` — `{ stdout: string; stderr: string; exitCode: number }`
  - `PlanHeader` — `{ goal: string; architectureSummary: string; techStack: string }`
  - `FileStructureEntry` — `{ path: string; action: "Create" | "Modify"; description: string }`
  - `PlanTask` — `{ number: number; title: string; files: { create: string[]; modify: string[]; test: string[] }; steps: string[]; acceptanceCriteria: string[]; modelRecommendation: "cheap" | "standard" | "capable" | null }`
  - `PlanDependencies` — `Map<number, number[]>` (task number → dependency task numbers)
  - `Plan` — `{ header: PlanHeader; fileStructure: FileStructureEntry[]; tasks: PlanTask[]; dependencies: PlanDependencies; risks: string; testCommand: string | null; rawContent: string; sourceTodoId: string | null; fileName: string }`
- [ ] **Step 5: Define execution and state types** — Define:
  - `Wave` — `{ number: number; taskNumbers: number[] }`
  - `ExecutionSettings` — `{ execution: "parallel" | "sequential"; tdd: boolean; finalReview: boolean; specCheck: boolean; integrationTest: boolean; testCommand: string | null }`
  - `WaveState` — `{ wave: number; tasks: number[]; status: "pending" | "in-progress" | "done"; commitSha: string | null }` — commitSha is `string` for done waves (mandatory checkpoint), `null` for pending/in-progress
  - `LockInfo` — `{ pid: number; session: string; acquiredAt: string }`
  - `BaselineTest` — `{ exitCode: number; output: string; failingTests: string[] }`
  - `RetryRecord` — `{ attempts: number; maxAttempts: number; lastFailure: string; lastFailureAt: string; lastContext: string | null; lastModel: string | null }`
  - `RetryState` — `{ tasks: Record<string, RetryRecord>; waves: Record<string, RetryRecord>; finalReview: RetryRecord | null }`
  - `CancellationState` — `{ requested: boolean; granularity: "wave" | "task" | null }`
  - `RunState` — `{ plan: string; status: "running" | "stopped" | "completed"; lock: LockInfo | null; startedAt: string; stoppedAt: string | null; stopGranularity: "wave" | "task" | null; settings: ExecutionSettings; workspace: WorkspaceInfo; preExecutionSha: string; baselineTest: BaselineTest | null; retryState: RetryState; waves: WaveState[] }`
- [ ] **Step 6: Define subagent, context, and judgment types** — Define:
  - `SubagentConfig` — `{ agent: string; taskNumber: number; task: string; model: string; tools?: string[]; systemPromptPath?: string; cwd: string }`
  - `WorkerStatus` — `"DONE" | "DONE_WITH_CONCERNS" | "NEEDS_CONTEXT" | "BLOCKED"`
  - `SubagentResult` — `{ taskNumber: number; status: WorkerStatus; output: string; concerns: string | null; needs: string | null; blocker: string | null; filesChanged: string[] }`
  - `ModelTiers` — `{ capable: string; standard: string; cheap: string; crossProvider?: { capable: string; standard: string } }`
  - `FailureContext` — `{ taskNumber: number; wave: number; error: string; attempts: number; maxAttempts: number }`
  - `TestRegressionContext` — `{ wave: number; newFailures: string[]; testOutput: string }`
  - `CodeReviewFinding` — `{ severity: "critical" | "important" | "minor"; title: string; details: string; file?: string | null }`
  - `CodeReviewSummary` — `{ findings: CodeReviewFinding[]; strengths: string[]; recommendations: string[]; overallAssessment: string; rawOutput: string }`
  - `JudgmentRequest` — discriminated union on `type`: `"blocked"`, `"done_with_concerns"`, `"needs_context"`, `"spec_review_failed"`, `"retry_exhausted"`, `"code_review"` — each with relevant context fields (taskNumber, wave, details, etc.). The `"code_review"` variant includes `review: CodeReviewSummary` so judgment and UI consume the same structured findings.
  - `JudgmentResponse` — `{ action: JudgmentAction; context?: string; model?: string }` where:
    ```typescript
    /** Every action has explicit engine semantics documented here:
     *  - "retry": Re-dispatch the task. If `model` provided, use that model. If `context` provided, append to task prompt.
     *  - "skip": Mark the task as done-with-skip, proceed to next task/wave. Wave still commits.
     *  - "stop": Halt execution immediately. Persist stopped state. Don't commit partial wave.
     *  - "provide_context": Re-dispatch the task with `context` appended to the prompt. Same model unless `model` overridden.
     *  - "accept": Accept the current state (for DONE_WITH_CONCERNS: log concerns and proceed; for code review: proceed despite findings).
     *  - "escalate": Present to user via requestFailureAction(). The agent is saying "I can't decide this."
     */
    export type JudgmentAction = "retry" | "skip" | "stop" | "provide_context" | "accept" | "escalate";
    ```
  - `ProgressEvent` — discriminated union: `"wave_started"`, `"wave_completed"`, `"task_started"`, `"task_progress"`, `"task_completed"`, `"code_review_completed"`, `"execution_completed"`, `"execution_stopped"`, `"cancellation_acknowledged"`. The `"code_review_completed"` event carries `review: CodeReviewSummary` so final findings can flow deterministically from engine to `ReviewSummaryComponent`.

**Acceptance criteria:**
- All types compile with `tsc --noEmit`
- `ExecutionIO` has only `dispatchSubagent` (singular) with `options?: { signal?: AbortSignal; onProgress?: ... }` — NO `dispatchSubagents` bulk method
- `dispatchSubagent` provides an end-to-end progress callback path so live worker updates can reach the engine and TUI
- `EngineCallbacks.requestWorktreeSetup` returns `WorkspaceChoice` (not `WorkspaceInfo`)
- `WorkspaceChoice` is `{ type: "worktree"; branch: string } | { type: "current" }` — a choice, not final data
- `EngineCallbacks.requestSettings` returns `ExecutionSettings`, not void
- `EngineCallbacks.requestTestCommand` returns `string | null` for custom test command entry
- `JudgmentAction` has documented engine semantics for all 6 actions as JSDoc
- `RunState` includes `preExecutionSha`, `baselineTest`, `retryState`, `stoppedAt`, `stopGranularity` — all state manager fields, including persisted retry metadata
- `SubagentConfig` includes `tools` and `systemPromptPath` fields for agent resolution
- `ProgressEvent` includes `code_review_completed` carrying `CodeReviewSummary` so final review findings can reach the TUI without side channels
- Types cover the full state.json schema from the spec

**Model recommendation:** standard

---

### Task 2: Plan parser and validator

**Files:**
- Create: `agent/lib/execute-plan/plan-parser.ts`
- Test: `agent/lib/execute-plan/plan-parser.test.ts`

**Steps:**
- [ ] **Step 1: Write failing tests for plan parsing** — Create `plan-parser.test.ts` with tests for:
  (a) parsing a valid plan extracts header with all 3 fields (goal, architecture summary, tech stack),
  (b) parsing extracts file structure section with Create/Modify entries and their descriptions,
  (c) parsing extracts numbered tasks with files, steps, acceptance criteria, model recommendation,
  (d) parsing extracts dependencies,
  (e) parsing extracts risk assessment,
  (f) parsing extracts optional `## Test Command` from fenced bash code block,
  (g) parsing extracts `**Source:** TODO-<id>`,
  (h) validation fails if header is missing goal,
  (i) validation fails if file structure section is missing,
  (j) validation fails if tasks section is missing,
  (k) validation fails if dependencies section is missing,
  (l) validation fails if risk assessment is missing,
  (m) validation passes for a complete plan with all 5 required sections,
  (n) validation fails if a dependency references a non-existent task number.
  Use a realistic plan string as test fixture modeled on the plan format from `.pi/plans/`.
- [ ] **Step 2: Run the tests to verify they fail** — Execute `node --experimental-strip-types --test agent/lib/execute-plan/plan-parser.test.ts` and confirm all tests fail.
- [ ] **Step 3: Implement parsePlan function** — Write `plan-parser.ts` exporting `parsePlan(content: string, fileName: string): Plan`. Parse markdown using regex/string operations:
  - Extract `## Goal` content for `header.goal`
  - Extract `## Architecture Summary` (or `## Architecture`) for `header.architectureSummary`
  - Extract `## Tech Stack` for `header.techStack`
  - Extract `## File Structure` section, parsing lines matching `` - `path/to/file` (Create|Modify) — description `` into `FileStructureEntry[]`
  - Extract numbered `### Task N:` blocks for tasks (each with `**Files:**`, checkbox items, `**Acceptance criteria:**`, `**Model recommendation:**`)
  - Extract `## Dependencies` for dependency map
  - Extract `## Risk Assessment` for risks string
  - Extract `## Test Command` for test command (content of bash fenced code block)
  - Extract `**Source:** TODO-<id>` for sourceTodoId
- [ ] **Step 4: Implement validatePlan function** — Export `validatePlan(plan: Plan): { valid: boolean; errors: string[] }` that checks all 5 required sections present and all dependency references valid.
- [ ] **Step 5: Run the tests and verify they pass** — Execute the test command and confirm all tests pass.
- [ ] **Step 6: Test against a real plan file** — Add a test that reads an inline snapshot of a real plan (at least 50 lines covering all sections) and verifies parsing produces the correct structure.

**Acceptance criteria:**
- `parsePlan` correctly parses all 5 required sections plus optional test command and source todo
- `validatePlan` returns errors listing each missing required section
- Tests cover edge cases: plan with no test command, plan with no source todo, plan with tasks that have no model recommendation
- Real plan content parses successfully

**Model recommendation:** standard

---

### Task 3: Wave computation

**Files:**
- Create: `agent/lib/execute-plan/wave-computation.ts`
- Test: `agent/lib/execute-plan/wave-computation.test.ts`

**Steps:**
- [ ] **Step 1: Write failing tests for wave computation** — Create tests for: (a) tasks with no dependencies all go in wave 1, (b) tasks depending on wave 1 tasks go in wave 2, (c) transitive dependencies produce wave 3+, (d) wave with >7 tasks splits into sub-waves of ≤7, (e) cyclic dependency detection (should error), (f) dependency on non-existent task (should error), (g) diamond dependency pattern produces correct waves.
- [ ] **Step 2: Run the tests to verify they fail** — Execute test command and confirm failures.
- [ ] **Step 3: Implement computeWaves** — Write `wave-computation.ts` exporting `computeWaves(tasks: PlanTask[], dependencies: PlanDependencies): Wave[]`. Build adjacency list, topologically sort, assign each task to the earliest wave where all deps are satisfied. Split any wave >7 tasks into sequential sub-waves.
- [ ] **Step 4: Run the tests and verify they pass** — Execute test command and confirm all pass.

**Acceptance criteria:**
- Correct wave assignment for linear, diamond, and wide dependency graphs
- Waves of >7 tasks are split
- Cyclic dependencies produce a clear error
- Missing dependency references produce a clear error

**Model recommendation:** standard

---

### Task 4: Model tier resolver

**Files:**
- Create: `agent/lib/execute-plan/model-resolver.ts`
- Test: `agent/lib/execute-plan/model-resolver.test.ts`

**Steps:**
- [ ] **Step 1: Write failing tests** — Test: (a) resolves "cheap" → modelTiers.cheap, (b) resolves "standard" → modelTiers.standard, (c) resolves "capable" → modelTiers.capable, (d) resolves cross-provider capable → modelTiers.crossProvider.capable, (e) resolves cross-provider standard → modelTiers.crossProvider.standard, (f) task with null recommendation defaults based on heuristic (file count), (g) handles missing modelTiers gracefully (error), (h) fallback from crossProvider.capable to capable when crossProvider is missing.
- [ ] **Step 2: Run tests to verify failures** — Confirm tests fail.
- [ ] **Step 3: Implement resolveModelForTask and resolveReviewModel** — Write `model-resolver.ts` exporting:
  - `resolveModelForTask(task: PlanTask, tiers: ModelTiers): string` — maps `task.modelRecommendation` to the corresponding tier. For null recommendation, apply heuristic: 1-2 create files → cheap, >2 files or any modify → standard, tasks with "architecture" or "design" in title → capable.
  - `resolveReviewModel(tiers: ModelTiers, type: "spec" | "code"): string` — spec review uses `tiers.standard`, code review uses `tiers.crossProvider?.capable ?? tiers.capable`.
- [ ] **Step 4: Run tests and verify pass** — All tests pass.

**Acceptance criteria:**
- Exact string match from modelTiers — no interpolation
- Null recommendation fallback is deterministic
- Cross-provider review model resolved with fallback
- Error when modelTiers is missing required fields

**Model recommendation:** cheap

---

### Task 5: Settings loader

**Files:**
- Create: `agent/lib/execute-plan/settings-loader.ts`
- Test: `agent/lib/execute-plan/settings-loader.test.ts`

**Steps:**
- [ ] **Step 1: Write failing tests** — Test via mock ExecutionIO:
  (a) `loadModelTiers` reads settings.json and extracts modelTiers,
  (b) returns error when file doesn't exist,
  (c) returns error for invalid JSON,
  (d) returns error when modelTiers key is missing,
  (e) returns error when any of capable/standard/cheap is missing,
  (f) succeeds when crossProvider is missing.
- [ ] **Step 2: Run tests to verify failures** — Confirm failures.
- [ ] **Step 3: Implement settings-loader** — Write `settings-loader.ts` exporting `loadModelTiers(io: ExecutionIO, agentDir: string): Promise<{ ok: true; tiers: ModelTiers } | { ok: false; error: string }>`. Reads `<agentDir>/settings.json` via ExecutionIO, validates required fields.
- [ ] **Step 4: Run tests and verify pass** — All tests pass.

**Acceptance criteria:**
- Settings.json read via `ExecutionIO.readFile` — no direct fs access
- Clear error messages for each failure mode
- `crossProvider` is optional
- Does not modify settings.json

**Model recommendation:** cheap

---

### Task 6: Template filler

**Files:**
- Create: `agent/lib/execute-plan/template-filler.ts`
- Test: `agent/lib/execute-plan/template-filler.test.ts`

**Steps:**
- [ ] **Step 1: Write failing tests** — Test:
  (a) fills `{TASK_SPEC}` in implementer-prompt,
  (b) fills `{CONTEXT}` in implementer-prompt,
  (c) fills `{WORKING_DIR}` in implementer-prompt,
  (d) fills `{TDD_BLOCK}` with TDD instructions when enabled,
  (e) fills `{TDD_BLOCK}` with empty string when disabled,
  (f) fills spec-reviewer placeholders,
  (g) fills code-reviewer placeholders (`{WHAT_WAS_IMPLEMENTED}`, `{PLAN_OR_REQUIREMENTS}`, `{BASE_SHA}`, `{HEAD_SHA}`, `{DESCRIPTION}`),
  (h) `getTemplatePath` returns correct path for each execute-plan template type,
  (i) unfilled placeholders in output raise an error.
- [ ] **Step 2: Run tests to verify failures** — Confirm failures.
- [ ] **Step 3: Implement template filler** — Write `template-filler.ts` with:
  - Template path constants: `TEMPLATE_PATHS` mapping template types to skill-relative paths under the agent directory. Note that templates live in different skill directories:
    - `implementer`: `skills/execute-plan/implementer-prompt.md`
    - `spec-reviewer`: `skills/execute-plan/spec-reviewer.md`
    - `code-reviewer`: `skills/requesting-code-review/code-reviewer.md` (lives under `requesting-code-review`, not `execute-plan`)
  - `getTemplatePath(agentDir: string, type: TemplateType): string`
  - `fillImplementerPrompt(template, params: { taskSpec, context, workingDir, tddEnabled }): string`
  - `fillSpecReviewerPrompt(template, params: { taskSpec, implementerReport }): string`
  - `fillCodeReviewerPrompt(template, params: { whatWasImplemented, planOrRequirements, baseSha, headSha, description }): string`
  - `buildTaskContext(plan, task, wave, completedWaves, allTasks): string`
  - `validateNoUnfilledPlaceholders(filled: string): void`

  Note: `execute-plan` does **not** fill or dispatch `plan-reviewer.md`. Plan review remains part of the `generate-plan` workflow, so this module only supports implementer, spec-reviewer, and code-reviewer templates.
- [ ] **Step 4: Run tests and verify pass** — All tests pass.

**Acceptance criteria:**
- All 3 execute-plan template types supported
- `plan-reviewer.md` is explicitly out of scope for this module and not referenced by the workflow
- TDD block matches existing SKILL.md content
- Context builder includes prior wave summaries
- Unfilled placeholders detected and error raised

**Model recommendation:** standard

---

### Task 7: Git operations

**Files:**
- Create: `agent/lib/execute-plan/git-ops.ts`
- Test: `agent/lib/execute-plan/git-ops.test.ts`

**Steps:**
- [ ] **Step 1: Write failing tests** — Test via mock ExecutionIO:
  (a) `isGitRepo` returns true/false based on git command,
  (b) `isDirty` detects uncommitted changes,
  (c) `getCurrentBranch` returns branch name,
  (d) `isMainBranch` returns true for main/master/develop,
  (e) `commitWave` stages all and commits with correct message format using `--allow-empty`,
  (f) `commitWave` always returns a SHA string (never null),
  (g) `resetWaveCommit` does two-step reset,
  (h) `verifyCommitExists` checks SHA exists,
  (i) `getHeadSha` returns HEAD SHA,
  (j) `isInWorktree` detects worktree.
- [ ] **Step 2: Run tests to verify failures** — Confirm failures.
- [ ] **Step 3: Implement git operations** — Write `git-ops.ts`. All functions take `io: ExecutionIO` and `cwd: string`. `commitWave` uses `--allow-empty` and always returns `string`. Commit message format:
  ```
  feat(plan): wave <N> - <goal summary, truncated to ~72 chars>

  - Task <X>: <task title>
  - Task <Y>: <task title>
  ```
- [ ] **Step 4: Run tests and verify pass** — All tests pass.

**Acceptance criteria:**
- All git operations use `ExecutionIO.exec`
- Commit message format matches spec exactly
- `commitWave` ALWAYS returns string SHA (uses `--allow-empty`)
- Main branch detection covers main, master, develop

**Model recommendation:** standard

---

### Task 8: Worktree operations

**Files:**
- Create: `agent/lib/execute-plan/worktree-ops.ts`
- Test: `agent/lib/execute-plan/worktree-ops.test.ts`

**Steps:**
- [ ] **Step 1: Write failing tests** — Test via mock ExecutionIO:
  (a) `suggestBranchName` derives branch from plan filename,
  (b) `findWorktreeDir` checks `.worktrees/` then `worktrees/`,
  (c) `createWorktree` runs git worktree add and returns `WorkspaceInfo`,
  (d) `verifyWorktreeExists` checks path and git worktree list,
  (e) `isWorktreeDirectoryIgnored` checks via git check-ignore.
- [ ] **Step 2: Run tests to verify failures** — Confirm failures.
- [ ] **Step 3: Implement worktree operations** — Write `worktree-ops.ts`:
  - `suggestBranchName(planFileName): string` — strips date prefix and `.md`, prepends `plan/`
  - `findWorktreeDir(io, cwd): Promise<string | null>` — checks `.worktrees/` then `worktrees/`
  - `createWorktree(io, cwd, worktreeDir, branch): Promise<WorkspaceInfo>` — creates worktree, returns `WorkspaceInfo` with `type: "worktree"`
  - `verifyWorktreeExists(io, worktreePath): Promise<boolean>`
  - `removeWorktree(io, cwd, worktreePath): Promise<void>`
  - `isWorktreeDirectoryIgnored(io, cwd, dir): Promise<boolean>`

  Note: the engine calls `createWorktree` AFTER receiving a `WorkspaceChoice` from the callback. The callback does NOT create the worktree — it just returns the user's choice (branch name or "use current"). The engine also calls `isWorktreeDirectoryIgnored()` before `createWorktree()`, so this helper has a concrete workflow use instead of being dead code.
- [ ] **Step 4: Run tests and verify pass** — All tests pass.

**Acceptance criteria:**
- Branch name suggestion strips date prefix and adds `plan/` prefix
- `createWorktree` produces `WorkspaceInfo` — called by the engine, not the callback
- `isWorktreeDirectoryIgnored()` is consumed by the engine before creating a worktree
- All operations use `ExecutionIO.exec`

**Model recommendation:** standard

---

### Task 9: Test operations

**Files:**
- Create: `agent/lib/execute-plan/test-ops.ts`
- Test: `agent/lib/execute-plan/test-ops.test.ts`

**Steps:**
- [ ] **Step 1: Write failing tests** — Test via mock ExecutionIO: (a) `captureBaseline` with exit 0 returns clean baseline, (b) `captureBaseline` with exit 1 returns baseline with failing tests, (c) `compareResults` with clean baseline and clean result → pass, (d) `compareResults` with clean baseline and failing → fail with new failures, (e) `compareResults` with pre-existing failures and same failures → pass, (f) `compareResults` with pre-existing and new → fail listing only new, (g) `detectTestCommand` detects from `package.json` (npm/node), (h) `detectTestCommand` detects from `Cargo.toml` (Rust), (i) `detectTestCommand` detects from `go.mod` (Go), (j) `detectTestCommand` detects from `pytest.ini`/`setup.py`/`pyproject.toml` (Python), (k) `detectTestCommand` detects from `Makefile` with `test` target.
- [ ] **Step 2: Run tests to verify failures** — Confirm failures.
- [ ] **Step 3: Implement test operations** — Write `test-ops.ts` exporting `captureBaseline`, `runTests`, `compareResults`, `detectTestCommand`.
- [ ] **Step 4: Run tests and verify pass** — All tests pass.

**Acceptance criteria:**
- Baseline capture records exit code and failing test names
- Regression detection only flags genuinely new failures
- Test command auto-detection covers all 5 project types: npm (`package.json`), Cargo (`Cargo.toml`), Go (`go.mod`), Python (`pytest.ini`/`setup.py`/`pyproject.toml`), Make (`Makefile` with `test` target)

**Model recommendation:** standard

---

### Task 10: State manager with general update and repo-wide locking

**Files:**
- Create: `agent/lib/execute-plan/state-manager.ts`
- Test: `agent/lib/execute-plan/state-manager.test.ts`

**Steps:**
- [ ] **Step 1: Write failing tests** — Test via mock ExecutionIO:
  (a) `createState` writes valid JSON to `.pi/plan-runs/<name>.state.json` with all initial fields (status "running", empty preExecutionSha, null baselineTest, empty `retryState`, null stoppedAt, null stopGranularity),
  (b) `readState` parses existing state file,
  (c) `readState` returns null for non-existent state,
  (d) `updateState` with updater that sets `preExecutionSha` persists the change,
  (e) `updateState` with updater that sets `baselineTest` persists the baseline,
  (f) `updateState` with updater that sets `status: "stopped"`, `stoppedAt`, `stopGranularity` persists cancellation fields,
  (g) `updateState` with updater that sets `retryState.tasks["3"]` persists task retry count, last failure, context, and model override,
  (h) `updateState` with updater that sets `retryState.waves["2"]` persists wave retry metadata for spec-review/test reruns,
  (i) `updateState` with updater that sets `retryState.finalReview` persists final code review retry metadata,
  (j) `updateWaveStatus` transitions wave to done with commitSha (must be non-empty string),
  (k) `updateWaveStatus` rejects null/empty commitSha for "done" status,
  (l) `acquireLock` writes lock info,
  (m) `acquireLock` fails when lock exists with live PID,
  (n) `acquireLock` detects stale lock (dead PID),
  (o) `releaseLock` clears lock,
  (p) `deleteState` removes file,
  (q) `validateResume` checks workspace, branch, commit SHAs,
  (r) `findActiveRunInRepo` scans all state files, returns first with active lock,
  (s) `findActiveRunInRepo` returns null when no active locks,
  (t) `findActiveRunInRepo` ignores stale/completed/stopped state files.
- [ ] **Step 2: Run tests to verify failures** — Confirm failures.
- [ ] **Step 3: Implement state manager** — Write `state-manager.ts` with functions:
  - `getStateDir()` → `".pi/plan-runs"`
  - `getStateFilePath(planFileName: string)` → `".pi/plan-runs/<planFileName>.state.json"`
  - `createState(io, cwd, planFileName, settings, workspace): Promise<RunState>` — creates initial state with `status: "running"`, `preExecutionSha: ""`, `baselineTest: null`, `retryState: { tasks: {}, waves: {}, finalReview: null }`, `stoppedAt: null`, `stopGranularity: null`
  - `readState(io, cwd, planFileName): Promise<RunState | null>`
  - `writeStateAtomic(io, path, content): Promise<void>` — writes to `path + '.tmp'` then renames to `path`. All state writes go through this helper to prevent corruption on crash.
  - `updateState(io, cwd, planFileName, updater: (state: RunState) => RunState): Promise<RunState>` — **the general update method.** Reads current state, applies the updater function, writes back atomically via `writeStateAtomic`. This is how the engine sets `preExecutionSha`, `baselineTest`, cancellation fields, retry metadata, and any other RunState field:
    ```typescript
    // Engine usage examples:
    await updateState(io, cwd, planName, (s) => ({ ...s, preExecutionSha: sha }));
    await updateState(io, cwd, planName, (s) => ({ ...s, baselineTest: baseline }));
    await updateState(io, cwd, planName, (s) => ({
      ...s,
      retryState: {
        ...s.retryState,
        tasks: {
          ...s.retryState.tasks,
          [String(taskNumber)]: {
            attempts: 2,
            maxAttempts: 3,
            lastFailure: blocker,
            lastFailureAt: new Date().toISOString(),
            lastContext: extraContext ?? null,
            lastModel: overrideModel ?? null,
          },
        },
      },
    }));
    await updateState(io, cwd, planName, (s) => ({
      ...s, status: "stopped", stoppedAt: new Date().toISOString(), stopGranularity: "wave"
    }));
    ```
  - `updateWaveStatus(io, cwd, state, waveNumber, status, commitSha): Promise<RunState>` — convenience method for the common case. `commitSha` is required (non-empty string) when status is "done".
  - `acquireLock(io, cwd, state, pid, session): Promise<RunState>`
  - `releaseLock(io, cwd, state): Promise<RunState>`
  - `isLockStale(io, lock): Promise<boolean>` — check PID via `kill -0`
  - `deleteState(io, cwd, planFileName): Promise<void>`
  - `validateResume(io, state, cwd): Promise<{ valid: boolean; issues: string[] }>`
  - `findActiveRunInRepo(io, cwd): Promise<{ planName: string; state: RunState } | null>`
- [ ] **Step 4: Run tests and verify pass** — All tests pass.

**Acceptance criteria:**
- All state writes use `writeStateAtomic` (write to `.tmp` then rename) to prevent corruption on crash
- `updateState` is a general updater that can modify ANY RunState field
- Tests explicitly verify writing `preExecutionSha`, `baselineTest`, cancellation fields, and `retryState` via `updateState`
- `updateWaveStatus` requires non-empty commitSha for "done" status
- Repo-wide lock enforcement via `findActiveRunInRepo`
- Resume validation checks workspace, branch, commit SHAs
- State file JSON matches the schema from the spec, including persisted retry metadata

**Model recommendation:** standard

---

### Task 11: Plan lifecycle with deterministic todo closing

**Files:**
- Create: `agent/lib/execute-plan/plan-lifecycle.ts`
- Test: `agent/lib/execute-plan/plan-lifecycle.test.ts`

**Steps:**
- [ ] **Step 1: Write failing tests** — Test via mock ExecutionIO:
  (a) `movePlanToDone` creates `.pi/plans/done/` and moves the file,
  (b) `extractSourceTodoId` extracts ID from plan's sourceTodoId field,
  (c) `extractSourceTodoId` returns null when no source todo,
  (d) `closeTodo` reads todo file, updates status to "done", appends completion note,
  (e) `closeTodo` silently skips if todo file doesn't exist,
  (f) `closeTodo` silently skips if already closed,
  (g) `buildCompletionSummary` includes task count, wave count, closed todo reference.
- [ ] **Step 2: Run tests to verify failures** — Confirm failures.
- [ ] **Step 3: Implement plan lifecycle** — Write `plan-lifecycle.ts`:
  - `movePlanToDone(io, cwd, planPath): Promise<string>`
  - `extractSourceTodoId(plan: Plan): string | null`
  - `closeTodo(io, cwd, todoId, planFileName): Promise<void>` — deterministic, no agent. Directly manipulates the todo file's JSON frontmatter (same format as `todos.ts`). The canonical format is JSON-frontmatter: a raw JSON object `{ "id": "...", "title": "...", "tags": [...], "status": "...", "created_at": "..." }` at the top of the file, followed by a blank line and Markdown body. `closeTodo` must parse using the same brace-matching approach as `todos.ts` (`findJsonObjectEnd`), update `"status"` to `"done"`, and re-serialize. Include a `// Canonical format: see agent/extensions/todos.ts parseFrontMatter/splitFrontMatter` comment at the parsing call site.
  - `buildCompletionSummary(state, plan, closedTodoId): string`
- [ ] **Step 4: Run tests and verify pass** — All tests pass.
- [ ] **Step 5: Add format round-trip compatibility test** — Add a test that takes a realistic todo file (JSON frontmatter with all fields including `assigned_to_session`, tags array, Markdown body with headings), passes it through `closeTodo`, and verifies: (a) only the `status` field changed to `"done"`, (b) all other frontmatter fields are preserved exactly, (c) the Markdown body is unchanged, (d) the result is re-parseable by the same `splitFrontMatter`/`parseFrontMatter` logic.

**Acceptance criteria:**
- `closeTodo` directly manipulates todo file — NO agent involvement
- Handles edge cases: missing file, already closed
- Todo format matches `todos.ts` JSON-frontmatter convention
- Parsing uses brace-matching (not regex or `---` delimiters) matching the canonical `todos.ts` implementation
- Source comment points to `todos.ts` as canonical format reference
- Round-trip test verifies format compatibility: all fields preserved, body unchanged, re-parseable

**Model recommendation:** standard

---

### Task 12: Task queue with concurrency control and abort

**Files:**
- Create: `agent/lib/execute-plan/task-queue.ts`
- Test: `agent/lib/execute-plan/task-queue.test.ts`

**Steps:**
- [ ] **Step 1: Write failing tests** — Test:
  (a) `TaskQueue` runs tasks up to concurrency limit,
  (b) `TaskQueue` queues excess tasks and runs them as slots free up,
  (c) `TaskQueue` with concurrency 1 runs tasks sequentially,
  (d) aborting the signal stops new tasks from launching but lets in-flight tasks complete,
  (e) `TaskQueue.run()` returns a Map<number, SubagentResult> of all completed tasks,
  (f) tasks that were never launched (due to abort) are not in the result map,
  (g) `abortAfterCurrent()` (task-level cancel) stops launching, returns partial results,
  (h) `drainAndStop()` (wave-level cancel) lets in-flight finish, stops after wave.
- [ ] **Step 2: Run tests to verify failures** — Confirm failures.
- [ ] **Step 3: Implement TaskQueue** — Write `task-queue.ts` exporting:
  ```typescript
  export class TaskQueue {
    constructor(
      private io: ExecutionIO,
      private concurrency: number,
    ) {}

    /**
     * Run all configs through io.dispatchSubagent with concurrency control.
     * Supports two abort modes:
     * - abortAfterCurrent(): stop launching new tasks, let in-flight finish → partial results
     * - signal.abort(): kill everything (used for hard cancellation)
     */
    async run(
      configs: SubagentConfig[],
      options?: {
        signal?: AbortSignal;
        onTaskComplete?: (result: SubagentResult) => void;
        onTaskProgress?: (taskNumber: number, status: string) => void;
      }
    ): Promise<Map<number, SubagentResult>>;

    /** Stop launching new tasks. In-flight tasks complete. Returns when drained. */
    abortAfterCurrent(): void;
  }
  ```
  Implementation:
  - Maintains a queue of pending configs and a set of in-flight promises
  - Launches up to `concurrency` tasks simultaneously
  - When a task completes, pulls next from queue (unless aborted)
  - `abortAfterCurrent()` sets a flag that prevents pulling from queue
  - Passes both `signal` and `onTaskProgress` to each `io.dispatchSubagent(config, { signal, onProgress })` call
  - Forwards worker progress through `onTaskProgress(taskNumber, status)` so the engine can emit `task_progress`
  - Returns Map keyed by `config.taskNumber`
- [ ] **Step 4: Run tests and verify pass** — All tests pass.

**Acceptance criteria:**
- Concurrency limit is respected
- `abortAfterCurrent()` stops new launches, in-flight complete — this implements "stop after current task"
- Signal abort kills in-flight — this implements hard cancellation
- Wave-level cancel: engine calls `abortAfterCurrent()` then waits for `run()` to resolve
- Results map only contains tasks that actually ran
- `onTaskProgress` is invoked for live worker updates, enabling real-time WaveProgressWidget rendering

**Model recommendation:** standard

---

### Task 13: Update project config for lib/ directory

**Files:**
- Modify: `agent/tsconfig.json`
- Modify: `agent/package.json`

**Steps:**
- [ ] **Step 1: Update tsconfig.json include** — Change `"include": ["extensions/**/*.ts"]` to `"include": ["extensions/**/*.ts", "lib/**/*.ts"]`. Do not change compiler options.
  - **Constraint:** File must remain valid JSON. Only the `include` array changes.
- [ ] **Step 2: Update package.json test script** — Change test script to `"test": "node --experimental-strip-types --experimental-test-coverage --test extensions/**/*.test.ts lib/**/*.test.ts"`.
  - **Constraint:** File must remain valid JSON. All other fields unchanged.
- [ ] **Step 3: Verify both files are valid** — Run `npx tsc --noEmit` from `agent/`.

**Acceptance criteria:**
- `tsc --noEmit` passes including lib/ files
- `npm test` discovers both `extensions/` and `lib/` test files
- No other fields modified

**Model recommendation:** cheap

---

### Task 14: Barrel index

**Files:**
- Create: `agent/lib/execute-plan/index.ts`

**Steps:**
- [ ] **Step 1: Create barrel index** — Write `index.ts` re-exporting all public APIs from all modules: types, parsePlan, validatePlan, computeWaves, resolveModelForTask, resolveReviewModel, loadModelTiers, all template-filler exports, all git-ops, all worktree-ops, all test-ops, all state-manager functions, all plan-lifecycle functions, TaskQueue, and PlanExecutionEngine.
- [ ] **Step 2: Verify barrel compiles** — Run `npx tsc --noEmit` from `agent/`.

**Acceptance criteria:**
- Barrel exports all public APIs
- No circular dependencies
- TypeScript compiles

**Model recommendation:** cheap

---

### Task 15: PlanExecutionEngine — startup, workspace, and lifecycle

**Files:**
- Create: `agent/lib/execute-plan/engine.ts`
- Test: `agent/lib/execute-plan/engine.test.ts`

**Steps:**
- [ ] **Step 1: Write failing tests for engine startup and lifecycle** — Create `engine.test.ts` with tests using mock `ExecutionIO` and mock `EngineCallbacks`. Test:
  (a) engine parses plan and computes waves,
  (b) engine calls `callbacks.requestSettings()` and uses returned settings,
  (c) engine calls `callbacks.requestResumeAction()` when state file found,
  (d) engine calls `callbacks.confirmMainBranch()` when on main and using the current workspace — **before** state creation/lock acquisition — and halts cleanly if false,
  (e) engine calls `callbacks.requestWorktreeSetup()` when on main — receives `WorkspaceChoice`, verifies the chosen worktree directory is gitignored, then calls `worktreeOps.createWorktree()` if type is "worktree",
  (f) engine fails early with a clear error and does **not** call `createWorktree()` when `isWorktreeDirectoryIgnored()` returns false for the chosen worktree directory,
  (g) engine does NOT call `worktreeOps.createWorktree()` when WorkspaceChoice is `{ type: "current" }`,
  (h) engine writes `preExecutionSha` to state via `updateState` before first wave,
  (i) engine writes `baselineTest` to state via `updateState` after baseline capture,
  (j) engine enforces repo-wide single-run via `findActiveRunInRepo`,
  (k) engine calls `callbacks.requestTestCommand()` when integration tests enabled but no test command detected,
  (l) engine resumes from correct wave on resume and consumes persisted retry counts instead of resetting in-memory attempts,
  (m) engine moves plan to done, closes todo, deletes state on completion,
  (n) engine releases lock and persists final unlocked state on completion.
- [ ] **Step 2: Run the tests to verify they fail** — Execute test command and confirm failures.
- [ ] **Step 3: Implement PlanExecutionEngine class — startup and lifecycle shell** — Write `engine.ts`:
  ```typescript
  export class PlanExecutionEngine {
    private cancellation: CancellationState = { requested: false, granularity: null };
    private taskQueue: TaskQueue | null = null;

    constructor(
      private io: ExecutionIO,
      private cwd: string,
      private agentDir: string,
    ) {}

    async execute(planPath: string, callbacks: EngineCallbacks): Promise<void>;
    requestCancellation(granularity: "wave" | "task"): void;
  }
  ```

  Implement the `execute` method **startup** (steps 1-10) and **completion** (steps 14-15), with a placeholder `executeWaves()` private method that Task 16 will fill in. **Error handling contract:** The full lifecycle is wrapped in try/finally — on any unhandled error, release the lock, persist state with `status: "stopped"`, emit `execution_stopped`, and re-throw:

  **Startup (this task):**
  1. Parse and validate plan
  2. Load modelTiers via settings-loader
  3. Check repo-wide lock via `findActiveRunInRepo` — reject if another plan is active
  4. Check for existing state file → call `callbacks.requestResumeAction()` if found
  5. Call `callbacks.requestSettings(plan, detectedSettings)` → get settings
     - During settings: if `integrationTest` enabled but no test command → call `callbacks.requestTestCommand()`
  6. Compute waves, resolve models. Do **not** run a plan-review phase here; `plan-reviewer.md` remains part of `generate-plan`, not `execute-plan`.
  7. Determine workspace:
     a. Check both `isMainBranch` and `isInWorktree`
     b. If on main AND NOT already in a worktree → call `callbacks.requestWorktreeSetup(suggestedBranch, cwd)` → `WorkspaceChoice`
     c. If choice is `{ type: "worktree" }` → resolve the target worktree directory, call `worktreeOps.isWorktreeDirectoryIgnored()` on it, and fail early with a clear error if it is not gitignored; otherwise call `worktreeOps.createWorktree()` → `WorkspaceInfo`
     d. If choice is `{ type: "current" }` on main → call `callbacks.confirmMainBranch(branch)` **before any state is created**; if false, return early with no state file/lock side effects; if true, create `WorkspaceInfo` from current dir/branch
     e. If choice is `{ type: "current" }` off-main → create `WorkspaceInfo` from current dir/branch without prompting
     f. If already in a worktree, or not on main and no prompt is needed → use current workspace without prompting
  8. Create state file, acquire lock
  9. Capture baseline if integration tests enabled → write to state via `updateState`
  10. Record pre-execution SHA → write to state via `updateState`

  **Wave loop placeholder (filled by Task 16):**
  11. `private async executeWaves(...)` — stub that iterates waves and calls TODO methods. Task 16 fills in the full implementation.

  **Completion (this task):**
  14. Release lock and persist final unlocked state
  15. Move plan to done, close todo, delete state, emit `execution_completed`

  **Resume logic (this task):** When resuming, read persisted `retryState` from `RunState` and pass it into the wave loop so attempt counters are not reset in memory.

  `requestCancellation(granularity)`:
  - Sets `this.cancellation = { requested: true, granularity }`
  - If "task" granularity and `this.taskQueue` exists → `this.taskQueue.abortAfterCurrent()`
  - If "wave" granularity → checked between waves in the loop
- [ ] **Step 4: Run the tests and verify they pass** — All tests pass.
- [ ] **Step 5: Update barrel index** — Add `PlanExecutionEngine` to exports.

**Acceptance criteria:**
- Engine startup: parses plan, loads settings, checks lock, resolves workspace, creates state, captures baseline, records pre-execution SHA
- Engine calls `callbacks.requestWorktreeSetup()` only when `isMainBranch && !isInWorktree`, receives `WorkspaceChoice`, verifies the chosen worktree directory is gitignored, then calls `createWorktree()` for "worktree" type
- Engine fails early with a clear error and does not create a worktree when the chosen worktree directory is not gitignored
- Engine does NOT call `createWorktree()` for "current" type and does not prompt at all when already in a worktree
- `callbacks.confirmMainBranch()` runs before state creation/lock acquisition when the user chooses the current workspace on main; declining leaves no orphaned state file or lock
- Resume logic consumes persisted `retryState` instead of resetting attempt counters in memory
- Completion: releases lock, moves plan to done, closes todo, deletes state, emits `execution_completed`
- `execute-plan` does not reference or dispatch `plan-reviewer.md`
- Repo-wide lock checked before execution
- Engine calls `callbacks.requestTestCommand()` when needed
- `executeWaves()` exists as a private method (stub or minimal loop) that Task 16 will complete
- `execute()` wraps the full lifecycle in try/finally that guarantees lock release and state persistence on unhandled errors

**Model recommendation:** capable

---

### Task 16: PlanExecutionEngine — wave execution, dispatch, and judgment handling

**Files:**
- Modify: `agent/lib/execute-plan/engine.ts`
- Modify: `agent/lib/execute-plan/engine.test.ts`

**Steps:**
- [ ] **Step 1: Write failing tests for wave execution and judgment handling** — Add tests to `engine.test.ts` using the same mock `ExecutionIO` and mock `EngineCallbacks` pattern from Task 15. Test:
  (a) engine dispatches workers via `TaskQueue` which calls `io.dispatchSubagent()` for each task,
  (b) engine commits after each successful wave (always produces SHA),
  (c) engine runs tests after each wave if enabled,
  (d) engine calls `callbacks.requestTestRegressionAction()` on regression,
  (e) engine persists `retryState.tasks` before task-level retries and re-dispatches with optional model/context,
  (f) engine handles JudgmentResponse `"skip"`: proceeds to next task,
  (g) engine handles JudgmentResponse `"stop"`: halts, persists stopped state,
  (h) engine handles JudgmentResponse `"provide_context"`: re-dispatches with context appended,
  (i) engine handles JudgmentResponse `"accept"`: logs concerns and proceeds,
  (j) engine handles JudgmentResponse `"escalate"`: calls `callbacks.requestFailureAction()`,
  (k) engine retries waves/spec-review/test-regression paths up to 3 times, persisting `retryState.waves` and undoing commits each time,
  (l) engine dispatches spec reviews if enabled,
  (m) engine dispatches final code review if enabled, parses a `CodeReviewSummary`, and emits `code_review_completed`,
  (n) engine persists `retryState.finalReview` for final-review retries and reuses that state on resume,
  (o) engine persists state after each wave via `updateState`/`updateWaveStatus`,
  (p) engine handles "stop after wave" cancellation: calls `taskQueue.abortAfterCurrent()` between waves, completes current wave, commits, stops,
  (q) engine handles "stop after task" cancellation: calls `taskQueue.abortAfterCurrent()` during wave dispatch, doesn't commit partial wave, persists cancellation state via `updateState`.
- [ ] **Step 2: Run the tests to verify they fail** — Execute test command and confirm failures.
- [ ] **Step 3: Implement the wave execution loop** — Fill in `executeWaves()` and supporting private methods in `engine.ts`:

  11. For each wave:
      a. Emit `wave_started`, update wave state to "in-progress"
      b. Fill worker prompts
      c. Create `TaskQueue`, dispatch via `io.dispatchSubagent()` per task, forwarding `onTaskProgress` so worker status lines flow into `callbacks.onProgress({ type: "task_progress", ... })`
      d. Check cancellation between task dispatches:
         - "task" granularity → `taskQueue.abortAfterCurrent()`, don't commit partial wave, persist stop state
         - "wave" granularity → let current wave finish, then stop after commit
      e. Collect results, handle by status with explicit JudgmentResponse branching:
         - DONE → proceed
         - BLOCKED / NEEDS_CONTEXT / DONE_WITH_CONCERNS → call `callbacks.requestJudgment(...)`
         - Before every retry branch, persist `retryState.tasks[String(taskNumber)]` via `updateState` with attempt count, last failure, optional model override, and appended context
         - `retry` → re-dispatch with optional model/context override
         - `skip` → mark done, proceed
         - `stop` → halt, persist state
         - `provide_context` → re-dispatch with context appended
         - `accept` → proceed (for BLOCKED, treat as skip)
         - `escalate` → `callbacks.requestFailureAction()`
      f. If specCheck enabled: dispatch spec reviews, and on retry-worthy failure persist `retryState.waves[String(wave.number)]` before re-running the wave/review path
      g. Commit wave via git-ops → always returns SHA
      h. Run integration tests, compare baseline
         - On regression → `callbacks.requestTestRegressionAction()`
         - On "retry": persist `retryState.waves[String(wave.number)]`, `resetWaveCommit`, re-dispatch (up to 3 times)
         - On "skip": proceed with warning
         - On "stop": halt
      i. Update state via `updateWaveStatus(... "done", commitSha)`
      j. Check cancellation ("wave" granularity → stop here)
  13. If final review enabled:
      a. Dispatch final code review using `code-reviewer.md`
      b. Parse reviewer output into `CodeReviewSummary`
      c. Emit `callbacks.onProgress({ type: "code_review_completed", review, ... })`
      d. Call `callbacks.requestJudgment({ type: "code_review", review, ... })`
      e. On `retry`, persist `retryState.finalReview`, dispatch fix-up work with the review findings in the prompt, then re-run final review until accepted/stopped/max-attempts reached
      f. On `accept`, proceed
      g. On `stop`, halt

- [ ] **Step 4: Run the tests and verify they pass** — All tests pass.

**Acceptance criteria:**
- Engine uses `TaskQueue` for dispatch — not bulk `dispatchSubagents`
- Engine writes all retry metadata to state via `updateState`
- Engine writes cancellation fields to state via `updateState` on stop
- Engine has explicit branching for ALL 6 JudgmentResponse actions (retry, skip, stop, provide_context, accept, escalate) with tests for each
- Final code review findings are emitted as a typed `code_review_completed` progress event carrying `CodeReviewSummary`
- "Stop after task" calls `taskQueue.abortAfterCurrent()`, doesn't commit partial wave
- "Stop after wave" lets current wave complete, commits, then stops
- Live worker progress is forwarded from dispatch → TaskQueue → engine `onProgress` so `task_progress` events are actually implementable
- Wave commit, test regression, and spec review retry paths persist `retryState.waves` before each retry

**Model recommendation:** capable

---

### Task 17: Extension I/O adapter

**Files:**
- Create: `agent/extensions/execute-plan/io-adapter.ts`
- Test: `agent/extensions/execute-plan/io-adapter.test.ts`

**Steps:**
- [ ] **Step 1: Create extensions/execute-plan directory** — Create `agent/extensions/execute-plan/`.
- [ ] **Step 2: Write failing tests for I/O adapter** — Create `io-adapter.test.ts` with tests using a temp directory (`fs.mkdtemp`):
  (a) `exec` captures stdout from a real process (`echo hello` → `{ stdout: "hello\n", stderr: "", exitCode: 0 }`),
  (b) `exec` returns non-zero exit code without throwing (`node -e "process.exit(1)"` → `{ exitCode: 1 }`),
  (c) `exec` captures stderr (`node -e "console.error('err')"` → stderr contains "err"),
  (d) `readFile` / `writeFile` round-trip through temp directory,
  (e) `fileExists` returns true for existing file and false for non-existent,
  (f) `mkdir` creates directory, `readdir` lists contents,
  (g) `rename` moves file, `unlink` removes file,
  (h) `dispatchSubagent` delegates to provided `dispatchFn` and passes through `signal` and `onProgress`.
- [ ] **Step 3: Run tests to verify failures** — Confirm failures.
- [ ] **Step 4: Implement PiExecutionIO** — Write `io-adapter.ts` exporting `PiExecutionIO` implementing `ExecutionIO`. Constructor takes a `dispatchFn: (config: SubagentConfig, options?: { signal?: AbortSignal; onProgress?: (taskNumber: number, status: string) => void }) => Promise<SubagentResult>`.
  - File operations: Node.js `fs.promises`
  - `exec`: `child_process.spawn` collecting stdout/stderr. Note: Node's `ChildProcess` close event provides `code` (not `exitCode`) — map to `ExecResult.exitCode`.
  - `dispatchSubagent(config, options)`: delegates to `dispatchFn(config, options)`
  - `getPid()`: `process.pid`
  - `getSessionId()`: from constructor parameter

  Note: NO `dispatchSubagents` method — only singular dispatch. The engine's `TaskQueue` manages concurrency and passes through both cancellation and live progress callbacks.
- [ ] **Step 5: Run tests and verify pass** — All tests pass.

**Acceptance criteria:**
- Implements full `ExecutionIO` interface (singular dispatch only)
- File operations use Node.js fs
- `exec` correctly maps Node's process close `code` to `ExecResult.exitCode`
- `exec` returns non-zero exit codes without throwing
- AbortSignal passed through to dispatch function
- All file operations tested via temp directory round-trips

**Model recommendation:** standard

---

### Task 18: Subagent dispatch with agent resolution

**Files:**
- Create: `agent/extensions/execute-plan/subagent-dispatch.ts`
- Test: `agent/extensions/execute-plan/subagent-dispatch.test.ts`

**Steps:**
- [ ] **Step 1: Write failing tests for response parsing** — Create `subagent-dispatch.test.ts` with tests for:
  (a) `parseWorkerResponse` parses DONE status with output,
  (b) `parseWorkerResponse` parses BLOCKED status with blocker field,
  (c) `parseWorkerResponse` parses DONE_WITH_CONCERNS with concerns,
  (d) `parseWorkerResponse` parses NEEDS_CONTEXT with needs field,
  (e) `parseWorkerResponse` extracts filesChanged from output,
  (f) `parseWorkerResponse` handles malformed output gracefully (returns BLOCKED with parse error),
  (g) `loadAgentConfig` returns null for non-existent agent,
  (h) `loadAgentConfig` extracts model, tools, and systemPrompt from frontmatter.
- [ ] **Step 2: Run tests to verify failures** — Confirm failures.
- [ ] **Step 3: Study existing subagent pattern** — Locate the pi-coding-agent subagent example via `node -e "console.log(require.resolve('@mariozechner/pi-coding-agent/package.json'))"` to find the package root, then read `examples/extensions/subagent/index.ts` and `agents.ts` relative to that root. Key patterns to extract: process spawning via `getPiInvocation`, JSON event stream parsing, and `AbortSignal` → `killProc` wiring.
- [ ] **Step 4: Implement parseWorkerResponse** — Export `parseWorkerResponse(output: string, taskNumber: number): SubagentResult`. Parse STATUS line and report sections.
- [ ] **Step 5: Implement loadAgentConfig** — Export `loadAgentConfig(agentDir: string, agentName: string): AgentConfig | null`. Same discovery as the subagent extension's `agents.ts`: read frontmatter from `<agentDir>/agents/<agentName>.md`, extract name/description/model/tools/systemPrompt.
- [ ] **Step 6: Run tests and verify pass** — All parsing and config tests pass.
- [ ] **Step 7: Implement dispatchWorker** — Export `dispatchWorker(config: SubagentConfig, agentDir: string, options?: { signal?: AbortSignal; onProgress?: (taskNumber: number, status: string) => void }): Promise<SubagentResult>`.
  1. Load agent config
  2. Build args: `["--mode", "json", "-p", "--no-session"]`
  3. Add `--model`, `--tools`, `--append-system-prompt` from loaded config
  4. Spawn via `getPiInvocation` pattern
  5. Parse JSON event stream
  6. Support `AbortSignal` — on abort, kill the spawned process
  7. On streamed JSON/message events, call `options?.onProgress?.(config.taskNumber, statusText)` so progress can propagate up to the engine/TUI
  8. Return `SubagentResult`
- [ ] **Step 8: Implement createDispatchFunction** — Export `createDispatchFunction(agentDir: string): (config: SubagentConfig, options?: { signal?: AbortSignal; onProgress?: (taskNumber: number, status: string) => void }) => Promise<SubagentResult>`.

**Acceptance criteria:**
- `parseWorkerResponse` handles all 4 status codes and malformed output
- `loadAgentConfig` handles missing agents gracefully
- Workers dispatched via `pi --mode json -p --no-session` with `--model`, `--tools`, `--append-system-prompt`
- AbortSignal kills spawned process (SIGTERM then SIGKILL after timeout)
- Progress callback is invoked from streamed worker output so live status can reach the engine/TUI
- Temp files cleaned up after dispatch

**Model recommendation:** capable

---

### Task 19: Agent judgment handoff (bridge manages Promises only, tool registered globally)

**Files:**
- Create: `agent/extensions/execute-plan/judgment.ts`
- Test: `agent/extensions/execute-plan/judgment.test.ts`

**Steps:**
- [ ] **Step 1: Write failing tests for judgment bridge** — Create `judgment.test.ts` with tests using mock `ExtensionAPI` (stub `registerTool`, `sendMessage`):
  (a) `createJudgmentBridge.requestJudgment` returns a Promise that resolves when resolver is called,
  (b) calling `requestJudgment` twice without resolving the first rejects the first Promise (or queues — pick one, but test the behavior),
  (c) resolver called with no pending request returns error (via `getResolver() => null`),
  (d) `requestJudgment` Promise rejects after 5-minute timeout,
  (e) `setResolver(null)` clears the pending resolver so subsequent tool calls return error,
  (f) `sendJudgmentRequest` calls `pi.sendMessage` with content varying by judgment type (test at least `blocked` and `code_review` variants).
- [ ] **Step 2: Run tests to verify failures** — Confirm failures.
- [ ] **Step 3: Implement registerJudgmentTool** — Export `registerJudgmentTool(pi: ExtensionAPI, getResolver: () => ((response: JudgmentResponse) => void) | null): void`. Registers `execute_plan_judgment` tool ONCE globally via `pi.registerTool()`. When the agent calls the tool:
  1. Constructs `JudgmentResponse` from params
  2. Calls `getResolver()` to get the current pending resolver
  3. If resolver exists, calls it with the response
  4. If no resolver (no pending judgment), returns an error message to the agent

  TypeBox schema:
  ```typescript
  {
    action: "retry" | "skip" | "stop" | "provide_context" | "accept" | "escalate",
    context?: string,  // Additional context (for provide_context, retry with context)
    model?: string     // Model override (for retry with different model)
  }
  ```
- [ ] **Step 4: Implement sendJudgmentRequest** — Export `sendJudgmentRequest(pi: ExtensionAPI, request: JudgmentRequest): void`. Uses `pi.sendMessage()` to inject context into the session. Message content varies by judgment type (blocked, done_with_concerns, spec_review_failed, retry_exhausted, code_review, needs_context). Each message tells the agent to respond via `execute_plan_judgment`.
- [ ] **Step 5: Implement createJudgmentBridge** — Export `createJudgmentBridge(pi: ExtensionAPI): { requestJudgment: (request: JudgmentRequest) => Promise<JudgmentResponse>; setResolver: (resolver: ((response: JudgmentResponse) => void) | null) => void }`.
  - `requestJudgment`: sends the judgment message via `sendJudgmentRequest`, creates a Promise, stores its resolver via `setResolver`, returns the Promise. Includes timeout (5 minutes).
  - `setResolver`: stores/clears the current resolver. The globally registered tool calls `getResolver()` to find this.
  - No `cleanup()` that unregisters tools — the tool stays registered for the session lifetime.
- [ ] **Step 6: Run tests and verify pass** — All tests pass.

**Acceptance criteria:**
- `registerJudgmentTool` is called ONCE — not per execution, not per judgment request
- `createJudgmentBridge` manages only Promises — it does NOT register/unregister tools
- The global tool uses `getResolver()` to find the current pending resolver
- No duplicate tool registration possible — single owner (extension factory)
- Timeout prevents infinite hang
- Bridge Promise lifecycle is tested: resolution, timeout, stale resolver rejection

**Model recommendation:** standard

---

### Task 20: TUI components with custom test command input and review summary

**Files:**
- Create: `agent/extensions/execute-plan/tui.ts`
- Create: `agent/extensions/execute-plan/tui-formatters.ts`
- Test: `agent/extensions/execute-plan/tui-formatters.test.ts`

**Steps:**
- [ ] **Step 1: Write failing tests for TUI formatting helpers** — Create `tui-formatters.test.ts` with tests for the pure data-transformation functions that feed TUI components:
  (a) `formatSettingsGrid` produces rows from `ExecutionSettings` (correct labels, on/off values, test command shown when present),
  (b) `formatResumeStatus` produces correct status text for "running" vs "stopped" states including stop granularity and timestamp,
  (c) `formatCodeReviewSummary` groups `CodeReviewFinding[]` by severity and produces sections in critical → important → minor order,
  (d) `formatCodeReviewSummary` handles empty findings array,
  (e) `formatCodeReviewSummary` includes strengths and recommendations when present,
  (f) `formatWaveProgress` produces correct N/M progress text and per-task status lines from a wave number, total, and task status map,
  (g) `formatFailureContext` produces a readable summary from `FailureContext` with attempt count.
- [ ] **Step 2: Run tests to verify failures** — Confirm failures.
- [ ] **Step 3: Implement TUI formatting helpers** — Write `tui-formatters.ts` exporting pure functions:
  - `formatSettingsGrid(settings: ExecutionSettings): Array<{ label: string; value: string }>` — maps each setting to a display row
  - `formatResumeStatus(state: RunState): { statusLine: string; progressLine: string; settingsLines: string[] }` — extracts display-ready status
  - `formatCodeReviewSummary(review: CodeReviewSummary): string` — produces Markdown string with findings grouped by severity, strengths, recommendations, and overall assessment
  - `formatWaveProgress(waveNumber: number, totalWaves: number, taskStatuses: Map<number, string>): string` — produces progress display text
  - `formatFailureContext(context: FailureContext): string` — produces readable failure summary
- [ ] **Step 4: Run tests and verify pass** — All tests pass.
- [ ] **Step 5: Implement SettingsConfirmationComponent** — Component displaying plan name, goal, task count, wave count, settings grid (using `formatSettingsGrid`). Supports Enter to accept, 'c' to customize, Esc to quit. During customize mode: each setting is a SelectList choice. When user enables integration tests and no test command is detected, show an Input component prompting "Enter test command (e.g., `npm test`):" — this returns the entered command or null if cancelled. Uses DynamicBorder, Text, SelectList, Input from pi-tui. Checkpoint commit NOT shown (always on).
- [ ] **Step 6: Implement ResumePromptComponent** — Shows plan name, progress (N of M waves), stored settings (using `formatResumeStatus`). Three choices: Continue / Restart / Cancel. If status "running": show "Previous execution did not exit cleanly." If status "stopped": show stop granularity and timestamp.
- [ ] **Step 7: Implement WorktreeSetupComponent** — Shown only when the engine requests worktree setup, which happens on main/master/develop **and not already inside a worktree**. Two options:
  - **(w) Create worktree** — Shows suggested branch, allows editing via Input component.
  - **(c) Use current workspace** — Neutral choice only; do **not** duplicate the direct-commit warning here because `MainBranchWarningComponent` is the single confirmation gate.
  Returns `WorkspaceChoice` (NOT `WorkspaceInfo` — the engine creates the worktree).
- [ ] **Step 8: Implement WaveProgressWidget** — `ctx.ui.setWidget()` component. Shows current wave N/M, task statuses (using `formatWaveProgress`), real-time updates via invalidate().
- [ ] **Step 9: Implement FailureHandlerComponent** — Retry/skip/stop SelectList after failure or test regression. Uses `formatFailureContext` for display.
- [ ] **Step 10: Implement CancellationSelectionComponent** — Shown when cancellation is triggered (via `ctx.ui.onTerminalInput()` intercepting Ctrl+C / `\x03` — see Task 21 Step 9 for the interception mechanism). Two options:
  - **(w) Stop after current wave** — "All tasks in the current wave will finish."
  - **(t) Stop after current task** — "Remaining tasks not dispatched."
  Returns granularity string.
- [ ] **Step 11: Implement MainBranchWarningComponent** — Confirm dialog shown only after the user chose `{ type: "current" }` on main/master/develop. This is the single direct-commit warning/confirmation gate. Returns boolean.
- [ ] **Step 12: Implement ReviewSummaryComponent** — Displayed after final code review completes. Accepts a typed `CodeReviewSummary`, passes it through `formatCodeReviewSummary` to produce Markdown, and renders the result. Shown via `ctx.ui.custom()` with overlay. User dismisses with Enter/Esc.
- [ ] **Step 13: Implement TestCommandInputComponent** — Shown when integration tests enabled but no command detected. Simple Input with prompt "Enter test command:" and placeholder "e.g., npm test". Returns string or null on cancel.

**Acceptance criteria:**
- Pure formatting helpers in `tui-formatters.ts` are unit tested — all data transformation logic is testable without TUI rendering
- `formatCodeReviewSummary` groups findings by severity and produces valid Markdown
- Settings confirmation handles custom test command input during customize flow
- **TestCommandInputComponent provides explicit UI for entering a custom test command** (reviewer issue: "no task explicitly implements custom test-command entry")
- **ReviewSummaryComponent consumes a typed `CodeReviewSummary` and displays formatted code review findings** (reviewer issue: "no task explicitly implements a review-summary display")
- The UI contract is explicit: final review data arrives from the engine via `code_review_completed`, not by re-parsing logs inside the TUI
- WorktreeSetupComponent returns `WorkspaceChoice` (not `WorkspaceInfo`)
- WorktreeSetupComponent allows editing the suggested branch name
- CancellationSelectionComponent presents both granularities
- All components use pi-tui primitives (DynamicBorder, Text, SelectList, Input, Markdown) and delegate formatting to `tui-formatters.ts`

**Model recommendation:** capable

---

### Task 21: Extension entry point (thin wrapper with globally registered judgment tool)

**Files:**
- Create: `agent/extensions/execute-plan/index.ts`

**Steps:**
- [ ] **Step 1: Write the extension factory** — `export default function(pi: ExtensionAPI)`. Import core lib, IO adapter, dispatch, judgment, TUI.
- [ ] **Step 2: Register judgment tool globally** — Call `registerJudgmentTool(pi, getResolver)` in the factory function — runs once when the extension loads. The `getResolver` function returns the current judgment bridge's resolver (or null if no execution is active).
- [ ] **Step 3: Register /execute-plan command** — Via `pi.registerCommand()`. Accepts optional plan path argument.
- [ ] **Step 4: Register execute_plan tool** — Via `pi.registerTool()` with TypeBox schema `{ path?: string }`. Same handler as command.
- [ ] **Step 5: Implement shared execution handler** — `handleExecutePlan(planPath: string | undefined, ctx: ExtensionContext)`:
  1. **Precondition: git repo** — `gitOps.isGitRepo()`. Error: "execute-plan requires a git repository."
  2. **Precondition: dirty tree** — `gitOps.isDirty()`. Warn via `ctx.ui.notify()`.
  3. **Plan location** — If path given, use it. Otherwise, list `.pi/plans/` (exclude `done/`), let user pick via `ctx.ui.select()`.
  4. **Create IO** — `PiExecutionIO` with `createDispatchFunction(agentDir)`.
  5. **Create engine** — `PlanExecutionEngine(io, cwd, agentDir)`.
  6. **Create judgment bridge** — `createJudgmentBridge(pi)`. Wire its `setResolver` to the global tool's `getResolver`.
  7. **Wire EngineCallbacks** — Each method maps to a TUI component. Maintain `let latestCodeReview: CodeReviewSummary | null = null` inside the handler and update it from `onProgress`:
     - `requestSettings` → `SettingsConfirmationComponent` via `ctx.ui.custom()` → returns `ExecutionSettings`
     - `requestResumeAction` → `ResumePromptComponent` → returns choice
     - `confirmMainBranch` → `MainBranchWarningComponent` → returns boolean
     - `requestWorktreeSetup` → `WorktreeSetupComponent` → returns `WorkspaceChoice` (NOT `WorkspaceInfo`). This callback is only invoked when the engine determines `isMainBranch && !isInWorktree`.
     - `requestFailureAction` → `FailureHandlerComponent` → returns choice
     - `requestTestRegressionAction` → `FailureHandlerComponent` (with test context) → returns choice
     - `requestTestCommand` → `TestCommandInputComponent` → returns `string | null`
     - `requestJudgment` → judgment bridge's `requestJudgment()` → returns `JudgmentResponse`
     - `onProgress` → updates `WaveProgressWidget` via `ctx.ui.setWidget()`; when `event.type === "code_review_completed"`, assign `latestCodeReview = event.review`. **Wrap in try/catch** — log rendering errors via `console.error` rather than propagating them, so TUI bugs don't crash the engine but remain visible for debugging.
  8. **Run engine** — `engine.execute(planPath, callbacks)` in try/catch.
  9. **Cancellation** — Register a terminal input handler via `ctx.ui.onTerminalInput()` that intercepts Ctrl+C (`\x03`). When detected: consume the input (`return { consume: true }`), show `CancellationSelectionComponent` via `ctx.ui.custom()`, and call `engine.requestCancellation(granularity)` with the user's choice. Store the unsubscribe function returned by `onTerminalInput()` and call it during cleanup (step 11). The handler must be a no-op if no execution is active (guard with a boolean flag).
  10. **On code review completion** — If `latestCodeReview` is non-null after the engine's final review phase, show `ReviewSummaryComponent` with that structured summary.
  11. **Completion** — Clean up widgets, report summary via `ctx.ui.notify()`. If on feature branch, suggest `finishing-a-development-branch` skill.

**Acceptance criteria:**
- Judgment tool registered ONCE in factory — NOT per execution
- Both command and tool share same handler
- Precondition checks block outside git repo
- `requestWorktreeSetup` callback returns `WorkspaceChoice` to engine and is only invoked when `isMainBranch && !isInWorktree`
- `requestTestCommand` callback returns user-entered test command
- Final code review findings flow explicitly from engine → `onProgress(code_review_completed)` → cached `CodeReviewSummary` → `ReviewSummaryComponent`
- Review summary shown via `ReviewSummaryComponent` after code review
- Cancellation selection presented to user
- Extension is a thin wrapper — orchestration lives in engine

**Model recommendation:** capable

---

### Task 22: Thin SKILL.md replacement

**Files:**
- Modify: `agent/skills/execute-plan/SKILL.md`

**Steps:**
- [ ] **Step 1: Read the current SKILL.md** — Verify its current state.
- [ ] **Step 2: Write the thin replacement** — Replace entire content. File MUST begin with YAML frontmatter between `---` delimiters — no blank lines or content before the opening `---`. Keep `name: execute-plan`. Body tells the agent:
  - When the user wants to execute a plan, use `/execute-plan` or the `execute_plan` tool
  - When the extension asks for judgment, respond via `execute_plan_judgment` tool
  - Documents judgment call types with examples and expected actions:
    - BLOCKED: evaluate whether to retry, provide_context, skip, or escalate
    - DONE_WITH_CONCERNS: evaluate severity — accept if minor, retry if serious
    - NEEDS_CONTEXT: provide_context with the missing info, or escalate if unknowable
    - Spec review failed: retry with findings, or accept if false positive
    - Code review findings: accept if minor, retry for critical fixes
    - Retry exhausted: escalate to user, or skip if non-critical
  - Maximum ~40 lines total

  **Footgun:** Do NOT place comments, blank lines, or any content before the opening `---`.
- [ ] **Step 3: Verify** — Read back. Check YAML frontmatter valid, body <50 lines, all judgment types documented.

**Acceptance criteria:**
- SKILL.md <50 lines
- YAML frontmatter valid (name: execute-plan)
- All 6 judgment call types documented with expected action guidance
- Prompt templates NOT modified

**Model recommendation:** cheap

---

## Dependencies

```
- Task 2 depends on: Task 1
- Task 3 depends on: Task 1
- Task 4 depends on: Task 1
- Task 5 depends on: Task 1
- Task 6 depends on: Task 1
- Task 7 depends on: Task 1
- Task 8 depends on: Task 1
- Task 9 depends on: Task 1
- Task 10 depends on: Task 1
- Task 11 depends on: Task 1
- Task 12 depends on: Task 1
- Task 13 depends on: Task 1
- Task 14 depends on: Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7, Task 8, Task 9, Task 10, Task 11, Task 12, Task 13
- Task 15 depends on: Task 14
- Task 16 depends on: Task 15
- Task 17 depends on: Task 1, Task 18
- Task 18 depends on: Task 1
- Task 19 depends on: Task 1
- Task 20 depends on: Task 1
- Task 21 depends on: Task 16, Task 17, Task 18, Task 19, Task 20
- Task 22 depends on: Task 21
```

## Risk Assessment

### 1. Engine complexity and infrastructure error handling
**Risk:** The `PlanExecutionEngine` is the largest module with a complex state machine covering all JudgmentResponse actions. Infrastructure failures (disk errors, git crashes, spawn failures) could leave orphaned locks or corrupt state.
**Mitigation:** Split across two tasks (Task 15: startup/lifecycle, Task 16: wave execution/dispatch) to reduce blast radius on retry. Each task has focused tests. The engine's deterministic nature (all decisions through typed callbacks) makes it highly testable. **Error handling contract:** On any unhandled error, the engine releases the lock, persists current state (status: "stopped"), emits `execution_stopped`, and re-throws. The `execute()` method wraps the full lifecycle in a try/finally that guarantees lock release. This is implemented in Task 15's startup/completion shell.

### 2. TaskQueue concurrency edge cases
**Risk:** The concurrency-limited task queue with abort support has subtle edge cases (race conditions, partial results).
**Mitigation:** Dedicated test suite (Task 12) covering normal operation, abort mid-wave, abort between tasks, signal propagation. The queue is a small, focused module that can be tested in isolation.

### 3. Worktree callback/creation boundary
**Risk:** The split between `WorkspaceChoice` (callback) and `WorkspaceInfo` (engine creates) could confuse implementers.
**Mitigation:** Types enforce the boundary — `requestWorktreeSetup` returns `WorkspaceChoice`, `createWorktree` returns `WorkspaceInfo`. The engine startup test (Task 15 steps e-f) explicitly tests both paths. This design was chosen specifically to fix the reviewer finding about the previous plan.

### 4. State manager general update correctness
**Risk:** The general `updateState` function could corrupt state if the updater function is buggy.
**Mitigation:** State manager tests (Task 10 steps d-f) explicitly test writing `preExecutionSha`, `baselineTest`, and cancellation fields via `updateState`. The updater pattern is well-established (React setState, Redux reducers).

### 5. Judgment tool lifecycle
**Risk:** Tool registered globally but resolver managed per-execution could lead to stale resolvers.
**Mitigation:** The bridge's `setResolver(null)` is called on execution end. The tool checks `getResolver()` before resolving — if null, returns error to agent. No cleanup race condition because registration is permanent.

### 6. Subagent dispatch agent resolution
**Risk:** Failing to load agent config would launch workers without proper context.
**Mitigation:** `loadAgentConfig` follows the proven pattern from the existing subagent extension. Dispatch validates config before spawning.

### 7. Mandatory checkpoint commit with --allow-empty
**Risk:** Empty commits for verification-only waves clutter git history.
**Mitigation:** Acceptable per spec. Can be squashed during branch completion.

### 8. State file corruption
**Risk:** Crash during write leaves corrupt JSON.
**Mitigation:** All state writes go through `writeStateAtomic` (Task 10) which writes to `.tmp` then renames (atomic on most filesystems). Handle parse errors on resume.

### 9. Deterministic todo closing format compatibility
**Risk:** Todo file format could drift from todos extension. `closeTodo` reimplements frontmatter parsing that is private to `todos.ts`.
**Mitigation:** Uses same brace-matching JSON-frontmatter approach as `todos.ts`. Source comment in `closeTodo` points to `todos.ts` as canonical format reference. Round-trip compatibility test (Task 11 Step 5) verifies all fields are preserved and the result is re-parseable.

### 10. TUI component complexity
**Risk:** Nine TUI components (including the new TestCommandInput and ReviewSummary) are complex.
**Mitigation:** Data-transformation logic is extracted into pure `tui-formatters.ts` functions with unit tests (Task 20). Components delegate formatting to these helpers, keeping rendering code thin. Follow patterns from `todos.ts` and `answer.ts`. Use same primitives.

### 11. onProgress callback errors silently dropped
**Risk:** `EngineCallbacks.onProgress` is fire-and-forget. If a TUI component throws during rendering (e.g., invalid data in a ProgressEvent), the error vanishes, making rendering bugs impossible to diagnose while the engine keeps running.
**Mitigation:** The extension's `onProgress` implementation in Task 21 wraps each callback invocation in a try/catch that logs the error via `console.error` (or `ctx.ui.notify` if safe) rather than propagating it. Rendering bugs don't crash the engine but don't disappear silently either.

## Test Command

```bash
npm test
```
