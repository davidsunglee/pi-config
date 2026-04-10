// ── Primitive result types ───────────────────────────────────────────

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// ── ExecutionIO — the I/O boundary between core engine and host ─────

/**
 * Single-dispatch I/O interface. The engine owns concurrency via TaskQueue;
 * callers never batch-dispatch through this interface.
 */
export interface ExecutionIO {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exec(command: string, args: string[], cwd: string): Promise<ExecResult>;
  fileExists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  unlink(path: string): Promise<void>;
  rename(src: string, dest: string): Promise<void>;
  readdir(path: string): Promise<string[]>;

  /**
   * Dispatch a single sub-agent. The engine manages concurrency externally
   * via TaskQueue — this method handles exactly one agent invocation.
   *
   * @param config  - Agent configuration (model, task prompt, cwd, etc.)
   * @param options - Optional abort signal and progress callback. The
   *   `onProgress` callback provides an end-to-end path for live worker
   *   status updates to reach the engine and TUI layer.
   */
  dispatchSubagent(
    config: SubagentConfig,
    options?: {
      signal?: AbortSignal;
      onProgress?: (taskNumber: number, status: string) => void;
    },
  ): Promise<SubagentResult>;

  getPid(): number;
  getSessionId(): string;
}

// ── Workspace types ─────────────────────────────────────────────────

/**
 * What the callback returns — a user choice, not final workspace data.
 */
export type WorkspaceChoice =
  | { type: "worktree"; branch: string }
  | { type: "current" };

/**
 * Resolved workspace information produced by the engine after
 * creating the worktree (or selecting the current directory).
 */
export interface WorkspaceInfo {
  type: "worktree" | "current";
  path: string;
  branch: string;
}

// ── Plan data types ─────────────────────────────────────────────────

export interface PlanHeader {
  goal: string;
  architectureSummary: string;
  techStack: string;
}

export interface FileStructureEntry {
  path: string;
  action: "Create" | "Modify";
  description: string;
}

export interface PlanTask {
  number: number;
  title: string;
  files: {
    create: string[];
    modify: string[];
    test: string[];
  };
  steps: string[];
  acceptanceCriteria: string[];
  modelRecommendation: "cheap" | "standard" | "capable" | null;
}

/** Task number -> dependency task numbers. */
export type PlanDependencies = Map<number, number[]>;

export interface Plan {
  header: PlanHeader;
  fileStructure: FileStructureEntry[];
  tasks: PlanTask[];
  dependencies: PlanDependencies;
  risks: string;
  testCommand: string | null;
  rawContent: string;
  sourceTodoId: string | null;
  fileName: string;
}

// ── Execution & state types ─────────────────────────────────────────

export interface Wave {
  number: number;
  taskNumbers: number[];
}

export interface ExecutionSettings {
  execution: "parallel" | "sequential";
  tdd: boolean;
  finalReview: boolean;
  specCheck: boolean;
  integrationTest: boolean;
  testCommand: string | null;
}

export interface WaveState {
  wave: number;
  tasks: number[];
  status: "pending" | "in-progress" | "done";
  /** SHA of the checkpoint commit. Mandatory for done waves; null otherwise. */
  commitSha: string | null;
}

export interface LockInfo {
  pid: number;
  session: string;
  acquiredAt: string;
}

export interface BaselineTest {
  exitCode: number;
  output: string;
  failingTests: string[];
}

export interface RetryRecord {
  attempts: number;
  maxAttempts: number;
  lastFailure: string;
  lastFailureAt: string;
  lastContext: string | null;
  lastModel: string | null;
}

export interface RetryState {
  tasks: Record<string, RetryRecord>;
  waves: Record<string, RetryRecord>;
  finalReview: RetryRecord | null;
}

export interface CancellationState {
  requested: boolean;
  granularity: "wave" | "task" | null;
}

export interface RunState {
  plan: string;
  status: "running" | "stopped" | "completed";
  lock: LockInfo | null;
  startedAt: string;
  stoppedAt: string | null;
  stopGranularity: "wave" | "task" | null;
  settings: ExecutionSettings;
  workspace: WorkspaceInfo;
  preExecutionSha: string;
  baselineTest: BaselineTest | null;
  retryState: RetryState;
  waves: WaveState[];
}

// ── Subagent types ──────────────────────────────────────────────────

export interface SubagentConfig {
  agent: string;
  taskNumber: number;
  task: string;
  model: string;
  tools?: string[];
  systemPromptPath?: string;
  cwd: string;
}

export type WorkerStatus =
  | "DONE"
  | "DONE_WITH_CONCERNS"
  | "NEEDS_CONTEXT"
  | "BLOCKED";

export interface SubagentResult {
  taskNumber: number;
  status: WorkerStatus;
  output: string;
  concerns: string | null;
  needs: string | null;
  blocker: string | null;
  filesChanged: string[];
}

export interface ModelTiers {
  capable: string;
  standard: string;
  cheap: string;
  crossProvider?: {
    capable: string;
    standard: string;
  };
}

// ── Failure / review context types ──────────────────────────────────

export interface FailureContext {
  taskNumber: number;
  wave: number;
  error: string;
  attempts: number;
  maxAttempts: number;
}

export interface TestRegressionContext {
  wave: number;
  newFailures: string[];
  testOutput: string;
}

export interface CodeReviewFinding {
  severity: "critical" | "important" | "minor";
  title: string;
  details: string;
  file?: string | null;
}

export interface CodeReviewSummary {
  findings: CodeReviewFinding[];
  strengths: string[];
  recommendations: string[];
  overallAssessment: string;
  rawOutput: string;
}

// ── Judgment types ──────────────────────────────────────────────────

/**
 * Every action has explicit engine semantics:
 *
 * - `"retry"`: Re-dispatch the task. If `model` is provided, use that model.
 *   If `context` is provided, append to task prompt.
 * - `"skip"`: Mark the task as done-with-skip, proceed to next task/wave.
 *   Wave still commits.
 * - `"stop"`: Halt execution immediately. Persist stopped state.
 *   Don't commit partial wave.
 * - `"provide_context"`: Re-dispatch the task with `context` appended to the
 *   prompt. Same model unless `model` is overridden.
 * - `"accept"`: Accept the current state. For DONE_WITH_CONCERNS: log
 *   concerns and proceed. For code review: proceed despite findings.
 * - `"escalate"`: Present to user via requestFailureAction(). The agent is
 *   saying "I can't decide this."
 */
export type JudgmentAction =
  | "retry"
  | "skip"
  | "stop"
  | "provide_context"
  | "accept"
  | "escalate";

/**
 * Discriminated union of judgment request types. Each variant carries
 * the context the judgment agent needs to decide.
 */
export type JudgmentRequest =
  | {
      type: "blocked";
      taskNumber: number;
      wave: number;
      blocker: string;
      details: string;
    }
  | {
      type: "done_with_concerns";
      taskNumber: number;
      wave: number;
      concerns: string;
      details: string;
    }
  | {
      type: "needs_context";
      taskNumber: number;
      wave: number;
      needs: string;
      details: string;
    }
  | {
      type: "spec_review_failed";
      taskNumber: number;
      wave: number;
      details: string;
    }
  | {
      type: "retry_exhausted";
      taskNumber: number;
      wave: number;
      attempts: number;
      lastFailure: string;
      details: string;
    }
  | {
      type: "code_review";
      wave: number;
      review: CodeReviewSummary;
      details: string;
    };

export interface JudgmentResponse {
  action: JudgmentAction;
  context?: string;
  model?: string;
}

// ── Progress events ─────────────────────────────────────────────────

/**
 * Discriminated union of progress events emitted by the engine.
 */
export type ProgressEvent =
  | { type: "wave_started"; wave: number; taskNumbers: number[] }
  | { type: "wave_completed"; wave: number; commitSha: string }
  | { type: "task_started"; taskNumber: number; wave: number }
  | { type: "task_progress"; taskNumber: number; wave: number; status: string }
  | {
      type: "task_completed";
      taskNumber: number;
      wave: number;
      result: SubagentResult;
    }
  | {
      type: "code_review_completed";
      wave: number;
      review: CodeReviewSummary;
    }
  | { type: "execution_completed"; totalWaves: number }
  | {
      type: "execution_stopped";
      wave: number;
      reason: string;
    }
  | {
      type: "cancellation_acknowledged";
      granularity: "wave" | "task";
    };

// ── Engine callbacks ────────────────────────────────────────────────

/**
 * Callbacks the engine invokes to interact with the host (TUI / extension).
 * All async methods should be awaited — the engine blocks on user decisions.
 */
export interface EngineCallbacks {
  requestSettings(
    plan: Plan,
    detected: Partial<ExecutionSettings>,
  ): Promise<ExecutionSettings>;

  requestResumeAction(
    state: RunState,
  ): Promise<"continue" | "restart" | "cancel">;

  confirmMainBranch(branch: string): Promise<boolean>;

  requestWorktreeSetup(
    suggestedBranch: string,
    cwd: string,
  ): Promise<WorkspaceChoice>;

  requestFailureAction(
    context: FailureContext,
  ): Promise<"retry" | "skip" | "stop">;

  requestTestRegressionAction(
    context: TestRegressionContext,
  ): Promise<"retry" | "skip" | "stop">;

  requestTestCommand(): Promise<string | null>;

  requestJudgment(request: JudgmentRequest): Promise<JudgmentResponse>;

  onProgress(event: ProgressEvent): void;
}
