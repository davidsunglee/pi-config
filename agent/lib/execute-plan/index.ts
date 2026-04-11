// Barrel index for execute-plan module
// Re-exports all public APIs from all modules

// Types and interfaces
export type {
  ExecResult,
  ExecutionIO,
  WorkspaceChoice,
  WorkspaceInfo,
  PlanHeader,
  FileStructureEntry,
  PlanTask,
  PlanDependencies,
  Plan,
  Wave,
  ExecutionSettings,
  WaveState,
  LockInfo,
  BaselineTest,
  RetryRecord,
  RetryState,
  CancellationState,
  RunState,
  SubagentConfig,
  WorkerStatus,
  SubagentResult,
  ModelTiers,
  FailureContext,
  TestRegressionContext,
  CodeReviewFinding,
  CodeReviewSummary,
  JudgmentAction,
  JudgmentRequest,
  JudgmentResponse,
  ProgressEvent,
  EngineCallbacks,
} from "./types.ts";

// Plan parser
export { parsePlan, validatePlan } from "./plan-parser.ts";

// Wave computation
export { computeWaves } from "./wave-computation.ts";

// Model resolver
export { resolveModelForTask, resolveReviewModel } from "./model-resolver.ts";

// Settings loader
export { loadModelTiers } from "./settings-loader.ts";

// Template filler
export type {
  ImplementerPromptParams,
  SpecReviewerPromptParams,
  CodeReviewerPromptParams,
} from "./template-filler.ts";
export {
  TEMPLATE_PATHS,
  getTemplatePath,
  fillImplementerPrompt,
  fillSpecReviewerPrompt,
  fillCodeReviewerPrompt,
  buildTaskContext,
  validateNoUnfilledPlaceholders,
} from "./template-filler.ts";
export type { TemplateType } from "./template-filler.ts";

// Git operations
export {
  isGitRepo,
  isDirty,
  getCurrentBranch,
  isMainBranch,
  commitWave,
  resetWaveCommit,
  verifyCommitExists,
  getHeadSha,
  isInWorktree,
} from "./git-ops.ts";

// Worktree operations
export {
  suggestBranchName,
  findWorktreeDir,
  createWorktree,
  verifyWorktreeExists,
  removeWorktree,
  isWorktreeDirectoryIgnored,
} from "./worktree-ops.ts";

// Test operations
export {
  captureBaseline,
  runTests,
  compareResults,
  detectTestCommand,
} from "./test-ops.ts";

// State manager
export {
  getStateDir,
  getStateFilePath,
  writeStateAtomic,
  createState,
  readState,
  updateState,
  updateWaveStatus,
  isLockStale,
  acquireLock,
  releaseLock,
  deleteState,
  validateResume,
  findActiveRunInRepo,
} from "./state-manager.ts";

// Plan lifecycle
export {
  movePlanToDone,
  extractSourceTodoId,
  closeTodo,
  buildCompletionSummary,
} from "./plan-lifecycle.ts";

// Task queue
export { TaskQueue } from "./task-queue.ts";

// Engine
export { PlanExecutionEngine } from "./engine.ts";
