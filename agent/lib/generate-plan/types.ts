export interface GenerationIO {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  fileExists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  readdir(path: string): Promise<string[]>;
  /** Read a todo by ID. Returns the full todo body text. Throws if the todo does not exist. */
  readTodo(todoId: string): Promise<{ title: string; body: string }>;
  /** Dispatch a subagent synchronously. Used for plan-generator and plan-reviewer. Returns the subagent's text output. */
  dispatchSubagent(config: SubagentDispatchConfig): Promise<SubagentOutput>;
}

export interface GenerationCallbacks {
  /** Report progress to the user (e.g., "Generating plan...", "Running review..."). */
  onProgress(message: string): void;
  /** Report a warning (e.g., cross-provider model fallback). */
  onWarning(message: string): void;
  /** Report final result with plan path and review status. */
  onComplete(result: GenerationResult): void;
}

// Input types
export type GenerationInput =
  | { type: "todo"; todoId: string }
  | { type: "file"; filePath: string }
  | { type: "freeform"; text: string };

export interface ResolvedInput {
  sourceText: string;
  sourceTodoId: string | null;
  shortDescription: string;
}

// Subagent types
export interface SubagentDispatchConfig {
  agent: string;
  task: string;
  model?: string;
}

export interface SubagentOutput {
  text: string;
  exitCode: number;
}

// Review types
export interface ReviewIssue {
  severity: "error" | "warning" | "suggestion";
  taskNumber: number | null;
  shortDescription: string;
  fullText: string;
}

export interface ReviewResult {
  status: "approved" | "issues_found";
  issues: ReviewIssue[];
  rawOutput: string;
}

// Repair loop types
export type RepairStrategy = "targeted_edit" | "partial_regen";

export type IssueTracker = Record<string, {
  firstSeenCycle: number;
  consecutiveEditFailures: number;
}>;

export interface RepairCycleState {
  cycle: number;
  maxCycles: number;
  strategy: RepairStrategy;
  findings: ReviewIssue[];
  validationErrors: string[];
  issueTracker: IssueTracker;
}

// Result type
export interface GenerationResult {
  planPath: string;
  reviewPath: string | null;
  reviewStatus: "approved" | "approved_with_notes" | "errors_found";
  noteCount: number;
  remainingFindings: ReviewIssue[];
}
