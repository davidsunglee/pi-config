import { basename } from "node:path";
import type {
  ExecutionIO,
  EngineCallbacks,
  Plan,
  Wave,
  ExecutionSettings,
  ModelTiers,
  CancellationState,
  RunState,
  RetryState,
  WorkspaceInfo,
  WorkspaceChoice,
} from "./types.ts";
import { parsePlan, validatePlan } from "./plan-parser.ts";
import { computeWaves } from "./wave-computation.ts";
import { loadModelTiers } from "./settings-loader.ts";
import { resolveModelForTask } from "./model-resolver.ts";
import { detectTestCommand, captureBaseline } from "./test-ops.ts";
import { isMainBranch, isInWorktree, getHeadSha, getCurrentBranch } from "./git-ops.ts";
import {
  suggestBranchName,
  findWorktreeDir,
  createWorktree,
  isWorktreeDirectoryIgnored,
} from "./worktree-ops.ts";
import {
  createState,
  readState,
  updateState,
  acquireLock,
  releaseLock,
  deleteState,
  findActiveRunInRepo,
} from "./state-manager.ts";
import {
  movePlanToDone,
  extractSourceTodoId,
  closeTodo,
} from "./plan-lifecycle.ts";
import { TaskQueue } from "./task-queue.ts";

export class PlanExecutionEngine {
  private cancellation: CancellationState;
  private taskQueue: TaskQueue | null;
  private io: ExecutionIO;
  private cwd: string;
  private agentDir: string;

  constructor(io: ExecutionIO, cwd: string, agentDir: string) {
    this.io = io;
    this.cwd = cwd;
    this.agentDir = agentDir;
    this.cancellation = { requested: false, granularity: null };
    this.taskQueue = null;
  }

  async execute(planPath: string, callbacks: EngineCallbacks): Promise<void> {
    const io = this.io;
    const cwd = this.cwd;
    const planFileName = basename(planPath);

    // Track whether state was created so finally knows what to clean up
    let stateCreated = false;
    let lockAcquired = false;

    try {
      // ── Step 1: Parse and validate plan ──────────────────────────
      const planContent = await io.readFile(planPath);
      const plan = parsePlan(planContent, planFileName);
      const validation = validatePlan(plan);
      if (!validation.valid) {
        throw new Error(
          `Plan validation failed:\n${validation.errors.join("\n")}`,
        );
      }

      // ── Step 2: Load model tiers ─────────────────────────────────
      const tiersResult = await loadModelTiers(io, this.agentDir);
      if (!tiersResult.ok) {
        throw new Error(`Failed to load model tiers: ${tiersResult.error}`);
      }
      const modelTiers = tiersResult.tiers;

      // ── Step 3: Check repo-wide lock ─────────────────────────────
      const activeRun = await findActiveRunInRepo(io, cwd);
      if (activeRun !== null) {
        throw new Error(
          `Another plan is already running: "${activeRun.planName}" (locked by PID ${activeRun.state.lock!.pid})`,
        );
      }

      // ── Step 4: Check for existing state → resume ────────────────
      const existingState = await readState(io, cwd, planFileName);
      let startFromWave: number | undefined;
      let persistedRetryState: RetryState | undefined;
      let resumeSettings: ExecutionSettings | undefined;
      let resumeWorkspace: WorkspaceInfo | undefined;

      if (existingState !== null) {
        const action = await callbacks.requestResumeAction(existingState);
        if (action === "cancel") {
          return;
        }
        if (action === "continue") {
          // Determine which wave to resume from
          const doneWaves = existingState.waves.filter(
            (w) => w.status === "done",
          );
          startFromWave =
            doneWaves.length > 0
              ? Math.max(...doneWaves.map((w) => w.wave)) + 1
              : 1;
          persistedRetryState = existingState.retryState;
          resumeSettings = existingState.settings;
          resumeWorkspace = existingState.workspace;
        }
        // "restart" → fall through to normal startup, existing state will be overwritten
      }

      // ── Step 5: Request settings ─────────────────────────────────
      const detected: Partial<ExecutionSettings> = {};
      if (plan.testCommand) {
        detected.testCommand = plan.testCommand;
      }
      const settings =
        resumeSettings ?? (await callbacks.requestSettings(plan, detected));

      // If integrationTest is enabled and no testCommand, try to detect or ask
      if (settings.integrationTest && !settings.testCommand) {
        const detectedCmd = await detectTestCommand(io, cwd);
        if (detectedCmd) {
          settings.testCommand = detectedCmd;
        } else {
          const userCmd = await callbacks.requestTestCommand();
          if (userCmd) {
            settings.testCommand = userCmd;
          }
        }
      }

      // ── Step 6: Compute waves, resolve models ────────────────────
      const waves = computeWaves(plan.tasks, plan.dependencies);
      // Pre-resolve models for all tasks (validates tiers early)
      for (const task of plan.tasks) {
        resolveModelForTask(task, modelTiers);
      }

      // ── Step 7: Determine workspace ──────────────────────────────
      let workspace: WorkspaceInfo;

      if (resumeWorkspace) {
        // Resuming — use persisted workspace
        workspace = resumeWorkspace;
      } else {
        const onMain = await isMainBranch(io, cwd);
        const inWorktree = await isInWorktree(io, cwd);

        if (onMain && !inWorktree) {
          // On main and not in a worktree → offer worktree setup
          const suggestedBranch = suggestBranchName(planFileName);
          const choice: WorkspaceChoice =
            await callbacks.requestWorktreeSetup(suggestedBranch, cwd);

          if (choice.type === "worktree") {
            // Verify worktree directory is gitignored
            const worktreeDir = await findWorktreeDir(io, cwd);
            const targetDir = worktreeDir ?? `${cwd}/.worktrees`;

            const ignored = await isWorktreeDirectoryIgnored(io, cwd, targetDir);
            if (!ignored) {
              throw new Error(
                `Worktree directory "${targetDir}" is not gitignored. ` +
                  `Add it to .gitignore before creating a worktree.`,
              );
            }

            const wsInfo = await createWorktree(
              io,
              cwd,
              targetDir,
              choice.branch,
            );
            workspace = wsInfo;
          } else {
            // Current workspace on main → confirm before proceeding
            const currentBranch = await getCurrentBranch(io, cwd);
            const confirmed = await callbacks.confirmMainBranch(currentBranch);
            if (!confirmed) {
              throw new Error(
                "Execution cancelled: user declined to run on main branch.",
              );
            }
            workspace = {
              type: "current",
              path: cwd,
              branch: currentBranch,
            };
          }
        } else {
          // Off main or already in a worktree → use current workspace
          const currentBranch = await getCurrentBranch(io, cwd);
          workspace = {
            type: "current",
            path: cwd,
            branch: currentBranch,
          };
        }
      }

      // ── Step 8: Create state file, acquire lock ──────────────────
      await createState(io, cwd, planFileName, settings, workspace);
      stateCreated = true;

      await acquireLock(
        io,
        cwd,
        planFileName,
        io.getPid(),
        io.getSessionId(),
      );
      lockAcquired = true;

      // ── Step 9: Capture baseline if integration tests ────────────
      if (settings.integrationTest && settings.testCommand) {
        const baseline = await captureBaseline(
          io,
          workspace.path,
          settings.testCommand,
        );
        await updateState(io, cwd, planFileName, (s) => ({
          ...s,
          baselineTest: baseline,
        }));
      }

      // ── Step 10: Record pre-execution SHA ────────────────────────
      const headSha = await getHeadSha(io, workspace.path);
      await updateState(io, cwd, planFileName, (s) => ({
        ...s,
        preExecutionSha: headSha,
      }));

      // ── Step 11: Execute waves (stub) ────────────────────────────
      await this.executeWaves(
        plan,
        waves,
        settings,
        modelTiers,
        planFileName,
        callbacks,
        startFromWave,
        persistedRetryState,
      );

      // ── Step 14: Release lock ────────────────────────────────────
      await releaseLock(io, cwd, planFileName);
      lockAcquired = false;

      // ── Step 15: Completion — move plan, close todo, delete state
      await movePlanToDone(io, cwd, planPath);

      const todoId = extractSourceTodoId(plan);
      if (todoId) {
        await closeTodo(io, cwd, todoId, planFileName);
      }

      await deleteState(io, cwd, planFileName);
      stateCreated = false;

      callbacks.onProgress({
        type: "execution_completed",
        totalWaves: waves.length,
      });
    } catch (err) {
      // On error: release lock, persist stopped state, emit execution_stopped
      if (stateCreated) {
        try {
          if (lockAcquired) {
            await releaseLock(io, cwd, planFileName);
            lockAcquired = false;
          }
        } catch {
          // Best-effort lock release
        }

        try {
          await updateState(io, cwd, planFileName, (s) => ({
            ...s,
            status: "stopped" as const,
            stoppedAt: new Date().toISOString(),
            stopGranularity: this.cancellation.granularity,
          }));
        } catch {
          // Best-effort state update
        }

        callbacks.onProgress({
          type: "execution_stopped",
          wave: 0,
          reason: err instanceof Error ? err.message : String(err),
        });
      }

      throw err;
    }
  }

  private async executeWaves(
    plan: Plan,
    waves: Wave[],
    settings: ExecutionSettings,
    modelTiers: ModelTiers,
    planFileName: string,
    callbacks: EngineCallbacks,
    startFromWave?: number,
    persistedRetryState?: RetryState,
  ): Promise<void> {
    // Stub — Task 16 fills this in
    for (const wave of waves) {
      if (startFromWave !== undefined && wave.number < startFromWave) continue;
      callbacks.onProgress({
        type: "wave_started",
        wave: wave.number,
        taskNumbers: wave.taskNumbers,
      });
      callbacks.onProgress({
        type: "wave_completed",
        wave: wave.number,
        commitSha: "stub",
      });
    }
  }

  requestCancellation(granularity: "wave" | "task"): void {
    this.cancellation = { requested: true, granularity };
    if (granularity === "task" && this.taskQueue) {
      this.taskQueue.abortAfterCurrent();
    }
  }
}
