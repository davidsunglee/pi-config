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
} from "./types.js";

// Plan parser
export { parsePlan, validatePlan } from "./plan-parser.js";

// Wave computation
export { computeWaves } from "./wave-computation.js";

// Model resolver
export { resolveModelForTask, resolveReviewModel } from "./model-resolver.js";

// Settings loader
export { loadModelTiers } from "./settings-loader.js";

// Template filler
export type {
  ImplementerPromptParams,
  SpecReviewerPromptParams,
  CodeReviewerPromptParams,
} from "./template-filler.js";
export {
  TEMPLATE_PATHS,
  getTemplatePath,
  fillImplementerPrompt,
  fillSpecReviewerPrompt,
  fillCodeReviewerPrompt,
  buildTaskContext,
  validateNoUnfilledPlaceholders,
} from "./template-filler.js";
export type { TemplateType } from "./template-filler.js";

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
} from "./git-ops.js";

// Worktree operations
export {
  suggestBranchName,
  findWorktreeDir,
  createWorktree,
  verifyWorktreeExists,
  removeWorktree,
  isWorktreeDirectoryIgnored,
} from "./worktree-ops.js";

// Test operations
export {
  captureBaseline,
  runTests,
  compareResults,
  detectTestCommand,
} from "./test-ops.js";

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
} from "./state-manager.js";

// Plan lifecycle
export {
  movePlanToDone,
  extractSourceTodoId,
  closeTodo,
  buildCompletionSummary,
} from "./plan-lifecycle.js";

// Task queue
export { TaskQueue } from "./task-queue.js";

// Engine
export { PlanExecutionEngine } from "./engine.js";
