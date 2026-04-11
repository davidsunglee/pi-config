import { basename } from "node:path";
import type {
  ExecutionIO,
  EngineCallbacks,
  Plan,
  PlanTask,
  Wave,
  ExecutionSettings,
  ModelTiers,
  CancellationState,
  RunState,
  RetryState,
  RetryRecord,
  WaveState,
  WorkspaceInfo,
  WorkspaceChoice,
  SubagentConfig,
  SubagentResult,
  CodeReviewFinding,
  CodeReviewSummary,
  JudgmentResponse,
} from "./types.ts";
import { parsePlan, validatePlan } from "./plan-parser.ts";
import { computeWaves } from "./wave-computation.ts";
import { loadModelTiers } from "./settings-loader.ts";
import { resolveModelForTask, resolveReviewModel } from "./model-resolver.ts";
import { detectTestCommand, captureBaseline, runTests, compareResults } from "./test-ops.ts";
import { isMainBranch, isInWorktree, getHeadSha, getCurrentBranch, commitWave, resetWaveCommit } from "./git-ops.ts";
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
  updateWaveStatus,
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
import {
  getTemplatePath,
  fillImplementerPrompt,
  fillSpecReviewerPrompt,
  fillCodeReviewerPrompt,
  buildTaskContext,
} from "./template-filler.ts";
import { TaskQueue } from "./task-queue.ts";

// ── Code review output parser ──────────────────────────────────────────

/**
 * Parses raw code reviewer output into a CodeReviewSummary.
 * Looks for severity sections (## Critical, ## Important, ## Minor),
 * ### finding titles, strengths, recommendations, and overall assessment.
 */
export function parseCodeReviewOutput(output: string): CodeReviewSummary {
  const findings: CodeReviewFinding[] = [];
  const strengths: string[] = [];
  const recommendations: string[] = [];
  let overallAssessment = "";

  const lines = output.split("\n");
  let currentSeverity: CodeReviewFinding["severity"] | null = null;
  let currentTitle = "";
  let currentDetails: string[] = [];
  let currentFile: string | null = null;
  let inStrengths = false;
  let inRecommendations = false;
  let inOverall = false;

  const flushFinding = () => {
    if (currentTitle && currentSeverity) {
      findings.push({
        severity: currentSeverity,
        title: currentTitle,
        details: currentDetails.join("\n").trim(),
        file: currentFile,
      });
    }
    currentTitle = "";
    currentDetails = [];
    currentFile = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect severity sections
    const h2Match = trimmed.match(/^##\s+(.+)/);
    if (h2Match && !trimmed.startsWith("###")) {
      flushFinding();
      const section = h2Match[1].toLowerCase();
      inStrengths = false;
      inRecommendations = false;
      inOverall = false;

      if (section.includes("critical")) {
        currentSeverity = "critical";
      } else if (section.includes("important")) {
        currentSeverity = "important";
      } else if (section.includes("minor")) {
        currentSeverity = "minor";
      } else if (section.includes("strength")) {
        currentSeverity = null;
        inStrengths = true;
      } else if (section.includes("recommendation")) {
        currentSeverity = null;
        inRecommendations = true;
      } else if (section.includes("overall")) {
        currentSeverity = null;
        inOverall = true;
      } else {
        currentSeverity = null;
      }
      continue;
    }

    // Detect finding titles (### headers under severity sections)
    const h3Match = trimmed.match(/^###\s+(.+)/);
    if (h3Match && currentSeverity) {
      flushFinding();
      currentTitle = h3Match[1];
      continue;
    }

    // Collect details for current finding
    if (currentSeverity && currentTitle) {
      currentDetails.push(line);
      continue;
    }

    // Collect strengths
    if (inStrengths && trimmed.startsWith("-")) {
      strengths.push(trimmed.slice(1).trim());
      continue;
    }

    // Collect recommendations
    if (inRecommendations && trimmed.startsWith("-")) {
      recommendations.push(trimmed.slice(1).trim());
      continue;
    }

    // Collect overall assessment
    if (inOverall && trimmed) {
      overallAssessment += (overallAssessment ? " " : "") + trimmed;
    }
  }

  flushFinding();

  return {
    findings,
    strengths,
    recommendations,
    overallAssessment,
    rawOutput: output,
  };
}

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
    let errorOccurred = false;
    let errorValue: unknown;

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

      let resumeAction: "continue" | "restart" | null = null;

      if (existingState !== null) {
        const action = await callbacks.requestResumeAction(existingState);
        if (action === "cancel") {
          return;
        }
        if (action === "continue") {
          resumeAction = "continue";
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
        } else {
          // "restart" → delete old state, then proceed as fresh run
          resumeAction = "restart";
          await deleteState(io, cwd, planFileName);
        }
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
              return; // Clean early exit — no state file or lock created
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
      if (resumeAction === "continue") {
        // Reuse existing state — don't overwrite with createState
        // Just re-acquire the lock on the existing state
        await acquireLock(io, cwd, planFileName, io.getPid(), io.getSessionId());
        stateCreated = true;
        lockAcquired = true;
        // Settings and workspace come from the existing state
        // Skip workspace resolution, baseline capture, SHA capture — already done in original run
      } else {
        // Fresh run or restart — create new state
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
      }

      // ── Step 11: Execute waves (stub) ────────────────────────────
      const completed = await this.executeWaves(
        plan,
        waves,
        settings,
        modelTiers,
        planFileName,
        callbacks,
        startFromWave,
        persistedRetryState,
      );

      if (completed) {
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
      } else {
        // Stopped path: release lock, persist stopped state, emit execution_stopped
        await releaseLock(io, cwd, planFileName);
        lockAcquired = false;

        await updateState(io, cwd, planFileName, (s) => ({
          ...s,
          status: "stopped" as const,
          stoppedAt: new Date().toISOString(),
          stopGranularity: this.cancellation.granularity,
        }));

        callbacks.onProgress({
          type: "execution_stopped",
          wave: 0,
          reason: "Execution stopped by user or judgment",
        });
      }
    } catch (err) {
      errorOccurred = true;
      errorValue = err;
      throw err;
    } finally {
      if (errorOccurred && stateCreated) {
        // On error: release lock, persist stopped state, emit execution_stopped
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
          reason: errorValue instanceof Error ? errorValue.message : String(errorValue),
        });
      }
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
  ): Promise<boolean> {
    const io = this.io;
    const cwd = this.cwd;
    const agentDir = this.agentDir;

    // Read current state to get workspace and wave info
    const currentState = await readState(io, cwd, planFileName);
    if (!currentState) throw new Error("State file missing during executeWaves");
    const workspacePath = currentState.workspace.path;

    // Initialize completed waves from state
    const completedWaves: WaveState[] = currentState.waves.filter(
      (w) => w.status === "done",
    );

    for (const wave of waves) {
      if (startFromWave !== undefined && wave.number < startFromWave) continue;

      // Check wave-level cancellation before starting
      if (this.cancellation.requested) {
        callbacks.onProgress({
          type: "cancellation_acknowledged",
          granularity: this.cancellation.granularity!,
        });
        await this.persistStoppedState(planFileName, wave.number, "Cancellation requested before wave start");
        return false;
      }

      // (a) Emit wave_started, update wave state to "in-progress"
      callbacks.onProgress({
        type: "wave_started",
        wave: wave.number,
        taskNumbers: wave.taskNumbers,
      });

      // Add wave to state as in-progress
      await updateState(io, cwd, planFileName, (s) => ({
        ...s,
        waves: [
          ...s.waves.filter((w) => w.wave !== wave.number),
          {
            wave: wave.number,
            tasks: wave.taskNumbers,
            status: "in-progress" as const,
            commitSha: null,
          },
        ],
      }));

      // Execute wave with retry support
      const waveSuccess = await this.executeWaveWithRetry(
        plan, wave, waves, settings, modelTiers, planFileName, callbacks,
        workspacePath, completedWaves, persistedRetryState,
      );

      if (!waveSuccess) {
        // Wave was stopped or exhausted
        return false;
      }

      // Update completedWaves for context in subsequent waves
      const updatedState = await readState(io, cwd, planFileName);
      if (updatedState) {
        completedWaves.length = 0;
        completedWaves.push(
          ...updatedState.waves.filter((w) => w.status === "done"),
        );
      }

      // Check wave-level cancellation after wave completion
      if (this.cancellation.requested && this.cancellation.granularity === "wave") {
        callbacks.onProgress({
          type: "cancellation_acknowledged",
          granularity: "wave",
        });
        await this.persistStoppedState(planFileName, wave.number, "Cancelled after wave completion");
        return false;
      }
    }

    // ── Final code review ──────────────────────────────────────────────
    if (settings.finalReview) {
      const reviewSuccess = await this.executeFinalReview(
        plan, waves, settings, modelTiers, planFileName, callbacks,
        workspacePath, persistedRetryState,
      );
      if (!reviewSuccess) return false;
    }

    return true;
  }

  /**
   * Executes a single wave, handling task dispatch, judgment, spec review,
   * commit, and integration tests. Returns true if wave succeeded, false
   * if execution was halted.
   */
  private async executeWaveWithRetry(
    plan: Plan,
    wave: Wave,
    allWaves: Wave[],
    settings: ExecutionSettings,
    modelTiers: ModelTiers,
    planFileName: string,
    callbacks: EngineCallbacks,
    workspacePath: string,
    completedWaves: WaveState[],
    persistedRetryState?: RetryState,
  ): Promise<boolean> {
    const io = this.io;
    const cwd = this.cwd;
    const MAX_WAVE_RETRIES = 3;

    // Get wave retry count from persisted state
    const waveKey = String(wave.number);
    let waveAttempts = persistedRetryState?.waves[waveKey]?.attempts ?? 0;

    for (let attempt = waveAttempts; attempt < MAX_WAVE_RETRIES; attempt++) {
      // (b) Fill worker prompts and dispatch tasks
      const dispatchSuccess = await this.dispatchWaveTasks(
        plan, wave, settings, modelTiers, planFileName, callbacks,
        workspacePath, completedWaves,
      );

      if (!dispatchSuccess) {
        // Stopped during dispatch (task-level cancellation or judgment stop)
        return false;
      }

      // Check task-level cancellation after dispatch
      if (this.cancellation.requested && this.cancellation.granularity === "task") {
        callbacks.onProgress({
          type: "cancellation_acknowledged",
          granularity: "task",
        });
        await this.persistStoppedState(planFileName, wave.number, "Cancelled after task completion");
        return false;
      }

      // (f) Spec review if enabled
      if (settings.specCheck) {
        const specResult = await this.runSpecReviews(
          plan, wave, settings, modelTiers, planFileName, callbacks, workspacePath,
        );

        if (specResult === "stop") {
          return false;
        }
        if (specResult === "retry") {
          // Persist wave retry state
          waveAttempts = attempt + 1;
          await updateState(io, cwd, planFileName, (s) => ({
            ...s,
            retryState: {
              ...s.retryState,
              waves: {
                ...s.retryState.waves,
                [waveKey]: {
                  attempts: waveAttempts,
                  maxAttempts: MAX_WAVE_RETRIES,
                  lastFailure: "Spec review failed",
                  lastFailureAt: new Date().toISOString(),
                  lastContext: null,
                  lastModel: null,
                },
              },
            },
          }));
          continue; // Retry the wave
        }
        // "pass" — continue to commit
      }

      // (g) Commit wave
      const waveTasks = wave.taskNumbers.map((num) => {
        const task = plan.tasks.find((t) => t.number === num);
        return { number: num, title: task?.title ?? `Task ${num}` };
      });
      const commitSha = await commitWave(
        io, workspacePath, wave.number, plan.header.goal, waveTasks,
      );

      // (h) Integration tests if enabled
      if (settings.integrationTest && settings.testCommand) {
        const testResult = await this.runIntegrationTests(
          wave, settings, modelTiers, planFileName, callbacks, workspacePath,
        );

        if (testResult === "stop") {
          return false;
        }
        if (testResult === "retry") {
          // Reset commit and retry wave
          await resetWaveCommit(io, workspacePath);
          waveAttempts = attempt + 1;
          await updateState(io, cwd, planFileName, (s) => ({
            ...s,
            retryState: {
              ...s.retryState,
              waves: {
                ...s.retryState.waves,
                [waveKey]: {
                  attempts: waveAttempts,
                  maxAttempts: MAX_WAVE_RETRIES,
                  lastFailure: "Test regression",
                  lastFailureAt: new Date().toISOString(),
                  lastContext: null,
                  lastModel: null,
                },
              },
            },
          }));
          continue; // Retry the wave
        }
        // "pass" or "skip" — continue
      }

      // (i) Update state: wave done
      const state = await readState(io, cwd, planFileName);
      if (state) {
        await updateWaveStatus(io, cwd, planFileName, state, wave.number, "done", commitSha);
      }

      callbacks.onProgress({
        type: "wave_completed",
        wave: wave.number,
        commitSha,
      });

      return true;
    }

    // Exhausted wave retries — request judgment
    const exhaustedResponse = await callbacks.requestJudgment({
      type: "retry_exhausted",
      taskNumber: 0,
      wave: wave.number,
      attempts: MAX_WAVE_RETRIES,
      lastFailure: "Wave retries exhausted",
      details: `Wave ${wave.number} failed after ${MAX_WAVE_RETRIES} attempts.`,
    });

    if (exhaustedResponse.action === "skip") {
      // Commit what we have and move on
      const waveTasks = wave.taskNumbers.map((num) => {
        const task = plan.tasks.find((t) => t.number === num);
        return { number: num, title: task?.title ?? `Task ${num}` };
      });
      const commitSha = await commitWave(
        io, workspacePath, wave.number, plan.header.goal, waveTasks,
      );
      const state = await readState(io, cwd, planFileName);
      if (state) {
        await updateWaveStatus(io, cwd, planFileName, state, wave.number, "done", commitSha);
      }
      callbacks.onProgress({
        type: "wave_completed",
        wave: wave.number,
        commitSha,
      });
      return true;
    }

    // Stop
    await this.persistStoppedState(planFileName, wave.number, "Wave retries exhausted");
    return false;
  }

  /**
   * Dispatches all tasks in a wave, handles judgment for non-DONE results.
   * Returns true if all tasks were processed (possibly with skip/accept),
   * false if execution was halted.
   */
  private async dispatchWaveTasks(
    plan: Plan,
    wave: Wave,
    settings: ExecutionSettings,
    modelTiers: ModelTiers,
    planFileName: string,
    callbacks: EngineCallbacks,
    workspacePath: string,
    completedWaves: WaveState[],
  ): Promise<boolean> {
    const io = this.io;
    const cwd = this.cwd;
    const MAX_TASK_RETRIES = 3;

    // Read implementer template
    const templatePath = getTemplatePath(this.agentDir, "implementer");
    const template = await io.readFile(templatePath);

    // Build SubagentConfigs for each task
    const configs: SubagentConfig[] = [];
    for (const taskNum of wave.taskNumbers) {
      const task = plan.tasks.find((t) => t.number === taskNum);
      if (!task) continue;

      const model = resolveModelForTask(task, modelTiers);
      const taskSpec = this.buildTaskSpec(task);
      const context = buildTaskContext(plan, task, wave, completedWaves, plan.tasks);

      const prompt = fillImplementerPrompt(template, {
        taskSpec,
        context,
        workingDir: workspacePath,
        tddEnabled: settings.tdd,
      });

      configs.push({
        agent: "implementer",
        taskNumber: task.number,
        task: prompt,
        model,
        cwd: workspacePath,
      });
    }

    // Create TaskQueue and dispatch
    this.taskQueue = new TaskQueue(io, settings.execution === "parallel" ? configs.length : 1);

    const results = await this.taskQueue.run(configs, {
      onTaskComplete: (result) => {
        callbacks.onProgress({
          type: "task_completed",
          taskNumber: result.taskNumber,
          wave: wave.number,
          result,
        });
      },
      onTaskProgress: (taskNumber, status) => {
        callbacks.onProgress({
          type: "task_progress",
          taskNumber,
          wave: wave.number,
          status,
        });
      },
    });

    // Check task-level cancellation
    if (this.cancellation.requested && this.cancellation.granularity === "task") {
      return false;
    }

    // Process results and handle non-DONE statuses
    for (const taskNum of wave.taskNumbers) {
      const result = results.get(taskNum);
      if (!result) continue;

      callbacks.onProgress({
        type: "task_started",
        taskNumber: taskNum,
        wave: wave.number,
      });

      if (result.status === "DONE") {
        continue;
      }

      // Handle BLOCKED, NEEDS_CONTEXT, DONE_WITH_CONCERNS via judgment
      const handled = await this.handleTaskResult(
        result, plan, wave, settings, modelTiers, planFileName, callbacks,
        workspacePath, completedWaves, template,
      );

      if (!handled) {
        return false; // Execution halted
      }
    }

    return true;
  }

  /**
   * Handles a non-DONE task result by requesting judgment and acting on the response.
   * Returns true if task was handled and execution should continue, false if halted.
   */
  private async handleTaskResult(
    result: SubagentResult,
    plan: Plan,
    wave: Wave,
    settings: ExecutionSettings,
    modelTiers: ModelTiers,
    planFileName: string,
    callbacks: EngineCallbacks,
    workspacePath: string,
    completedWaves: WaveState[],
    template: string,
  ): Promise<boolean> {
    const io = this.io;
    const cwd = this.cwd;
    const MAX_TASK_RETRIES = 3;

    const task = plan.tasks.find((t) => t.number === result.taskNumber);
    if (!task) return true;

    let attempts = 0;

    while (attempts < MAX_TASK_RETRIES) {
      // Build judgment request based on status
      const judgmentRequest = this.buildJudgmentRequest(result, wave.number);
      const response = await callbacks.requestJudgment(judgmentRequest);

      // Handle each action
      switch (response.action) {
        case "skip":
          return true;

        case "stop":
          await this.persistStoppedState(planFileName, wave.number, `Task ${result.taskNumber} stopped by judgment`);
          return false;

        case "accept":
          // Log concerns and proceed
          if (result.concerns) {
            callbacks.onProgress({
              type: "task_progress",
              taskNumber: result.taskNumber,
              wave: wave.number,
              status: `Accepted with concerns: ${result.concerns}`,
            });
          }
          return true;

        case "escalate": {
          const failureAction = await callbacks.requestFailureAction({
            taskNumber: result.taskNumber,
            wave: wave.number,
            error: result.blocker ?? result.concerns ?? result.output,
            attempts: attempts + 1,
            maxAttempts: MAX_TASK_RETRIES,
          });
          if (failureAction === "skip") return true;
          if (failureAction === "stop") {
            await this.persistStoppedState(planFileName, wave.number, `Task ${result.taskNumber} escalated and stopped`);
            return false;
          }
          // retry — fall through to retry logic
          break;
        }

        case "provide_context": {
          // Re-dispatch with context appended
          attempts++;
          await this.persistTaskRetryState(planFileName, result.taskNumber, attempts, MAX_TASK_RETRIES, "Needs context", response.context, response.model);

          const taskSpec = this.buildTaskSpec(task);
          const context = buildTaskContext(plan, task, wave, completedWaves, plan.tasks);
          const extraContext = response.context ?? "";
          const prompt = fillImplementerPrompt(template, {
            taskSpec,
            context: context + "\n\n## Additional Context\n\n" + extraContext,
            workingDir: workspacePath,
            tddEnabled: settings.tdd,
          });

          const model = response.model ?? resolveModelForTask(task, modelTiers);
          const config: SubagentConfig = {
            agent: "implementer",
            taskNumber: task.number,
            task: prompt,
            model,
            cwd: workspacePath,
          };

          const newResult = await io.dispatchSubagent(config, {
            onProgress: (taskNumber, status) => {
              callbacks.onProgress({
                type: "task_progress",
                taskNumber,
                wave: wave.number,
                status,
              });
            },
          });
          if (newResult.status === "DONE") return true;
          // Loop back for another judgment
          Object.assign(result, newResult);
          continue;
        }

        case "retry": {
          attempts++;
          await this.persistTaskRetryState(planFileName, result.taskNumber, attempts, MAX_TASK_RETRIES, result.output, response.context, response.model);

          const taskSpec = this.buildTaskSpec(task);
          const context = buildTaskContext(plan, task, wave, completedWaves, plan.tasks);
          const extraContext = response.context ?? "";
          const fullContext = extraContext ? context + "\n\n## Retry Context\n\n" + extraContext : context;
          const prompt = fillImplementerPrompt(template, {
            taskSpec,
            context: fullContext,
            workingDir: workspacePath,
            tddEnabled: settings.tdd,
          });

          const model = response.model ?? resolveModelForTask(task, modelTiers);
          const config: SubagentConfig = {
            agent: "implementer",
            taskNumber: task.number,
            task: prompt,
            model,
            cwd: workspacePath,
          };

          const newResult = await io.dispatchSubagent(config, {
            onProgress: (taskNumber, status) => {
              callbacks.onProgress({
                type: "task_progress",
                taskNumber,
                wave: wave.number,
                status,
              });
            },
          });
          if (newResult.status === "DONE") return true;
          Object.assign(result, newResult);
          continue;
        }
      }

      // If we reach here from escalate→retry, continue loop
      attempts++;
      await this.persistTaskRetryState(planFileName, result.taskNumber, attempts, MAX_TASK_RETRIES, result.output);

      // Re-dispatch
      const taskSpec = this.buildTaskSpec(task);
      const context = buildTaskContext(plan, task, wave, completedWaves, plan.tasks);
      const prompt = fillImplementerPrompt(template, {
        taskSpec,
        context,
        workingDir: workspacePath,
        tddEnabled: settings.tdd,
      });
      const model = resolveModelForTask(task, modelTiers);
      const config: SubagentConfig = {
        agent: "implementer",
        taskNumber: task.number,
        task: prompt,
        model,
        cwd: workspacePath,
      };
      const newResult = await io.dispatchSubagent(config, {
        onProgress: (taskNumber, status) => {
          callbacks.onProgress({
            type: "task_progress",
            taskNumber,
            wave: wave.number,
            status,
          });
        },
      });
      if (newResult.status === "DONE") return true;
      Object.assign(result, newResult);
    }

    // Exhausted task retries
    const exhaustedResponse = await callbacks.requestJudgment({
      type: "retry_exhausted",
      taskNumber: result.taskNumber,
      wave: wave.number,
      attempts: MAX_TASK_RETRIES,
      lastFailure: result.output,
      details: `Task ${result.taskNumber} failed after ${MAX_TASK_RETRIES} retry attempts.`,
    });

    if (exhaustedResponse.action === "skip" || exhaustedResponse.action === "accept") {
      return true;
    }

    await this.persistStoppedState(planFileName, wave.number, `Task ${result.taskNumber} retries exhausted`);
    return false;
  }

  /**
   * Runs spec reviews for all tasks in a wave.
   * Returns "pass", "retry", or "stop".
   */
  private async runSpecReviews(
    plan: Plan,
    wave: Wave,
    settings: ExecutionSettings,
    modelTiers: ModelTiers,
    planFileName: string,
    callbacks: EngineCallbacks,
    workspacePath: string,
  ): Promise<"pass" | "retry" | "stop"> {
    const io = this.io;
    const templatePath = getTemplatePath(this.agentDir, "spec-reviewer");
    const template = await io.readFile(templatePath);
    const reviewModel = resolveReviewModel(modelTiers, "spec");

    for (const taskNum of wave.taskNumbers) {
      const task = plan.tasks.find((t) => t.number === taskNum);
      if (!task) continue;

      const taskSpec = this.buildTaskSpec(task);
      const prompt = fillSpecReviewerPrompt(template, {
        taskSpec,
        implementerReport: `Task ${taskNum} implementation completed.`,
      });

      const config: SubagentConfig = {
        agent: "spec-reviewer",
        taskNumber: taskNum,
        task: prompt,
        model: reviewModel,
        cwd: workspacePath,
      };

      const result = await io.dispatchSubagent(config);

      if (result.status !== "DONE") {
        // Spec review failed
        const response = await callbacks.requestJudgment({
          type: "spec_review_failed",
          taskNumber: taskNum,
          wave: wave.number,
          details: result.output,
        });

        if (response.action === "retry") return "retry";
        if (response.action === "stop") return "stop";
        // skip/accept — continue to next task's review
      }
    }

    return "pass";
  }

  /**
   * Runs integration tests and compares with baseline.
   * Returns "pass", "retry", "skip", or "stop".
   */
  private async runIntegrationTests(
    wave: Wave,
    settings: ExecutionSettings,
    modelTiers: ModelTiers,
    planFileName: string,
    callbacks: EngineCallbacks,
    workspacePath: string,
  ): Promise<"pass" | "retry" | "skip" | "stop"> {
    const io = this.io;
    const cwd = this.cwd;

    if (!settings.testCommand) return "pass";

    const testResult = await runTests(io, workspacePath, settings.testCommand);

    // Read baseline from state
    const state = await readState(io, cwd, planFileName);
    if (!state || !state.baselineTest) return "pass";

    const comparison = compareResults(state.baselineTest, testResult);
    if (comparison.passed) return "pass";

    // Regression detected
    const action = await callbacks.requestTestRegressionAction({
      wave: wave.number,
      newFailures: comparison.newFailures,
      testOutput: testResult.output,
    });

    if (action === "retry") return "retry";
    if (action === "stop") return "stop";
    return "skip"; // "skip" action
  }

  /**
   * Executes the final code review after all waves.
   * Returns true if review completed/accepted, false if halted.
   */
  private async executeFinalReview(
    plan: Plan,
    waves: Wave[],
    settings: ExecutionSettings,
    modelTiers: ModelTiers,
    planFileName: string,
    callbacks: EngineCallbacks,
    workspacePath: string,
    persistedRetryState?: RetryState,
  ): Promise<boolean> {
    const io = this.io;
    const cwd = this.cwd;
    const MAX_REVIEW_RETRIES = 3;

    const templatePath = getTemplatePath(this.agentDir, "code-reviewer");
    const template = await io.readFile(templatePath);
    const reviewModel = resolveReviewModel(modelTiers, "code");

    // Read state for pre-execution SHA
    const state = await readState(io, cwd, planFileName);
    const baseSha = state?.preExecutionSha ?? "";
    const headSha = await getHeadSha(io, workspacePath);

    let attempts = persistedRetryState?.finalReview?.attempts ?? 0;

    for (let attempt = attempts; attempt < MAX_REVIEW_RETRIES; attempt++) {
      // Build what was implemented
      const taskSummaries = plan.tasks
        .map((t) => `- Task ${t.number}: ${t.title}`)
        .join("\n");

      const prompt = fillCodeReviewerPrompt(template, {
        whatWasImplemented: taskSummaries,
        planOrRequirements: plan.header.goal,
        baseSha,
        headSha,
        description: plan.header.architectureSummary,
      });

      const config: SubagentConfig = {
        agent: "code-reviewer",
        taskNumber: 0,
        task: prompt,
        model: reviewModel,
        cwd: workspacePath,
      };

      const result = await io.dispatchSubagent(config);
      const summary = parseCodeReviewOutput(result.output);

      // Emit code_review_completed
      callbacks.onProgress({
        type: "code_review_completed",
        wave: waves.length,
        review: summary,
      });

      // Request judgment
      const response = await callbacks.requestJudgment({
        type: "code_review",
        wave: waves.length,
        review: summary,
        details: result.output,
      });

      if (response.action === "accept") return true;
      if (response.action === "skip") return true;

      if (response.action === "stop") {
        await this.persistStoppedState(planFileName, waves.length, "Final review stopped");
        return false;
      }

      if (response.action === "retry") {
        // Persist finalReview retry state
        await updateState(io, cwd, planFileName, (s) => ({
          ...s,
          retryState: {
            ...s.retryState,
            finalReview: {
              attempts: attempt + 1,
              maxAttempts: MAX_REVIEW_RETRIES,
              lastFailure: "Code review requires changes",
              lastFailureAt: new Date().toISOString(),
              lastContext: response.context ?? null,
              lastModel: response.model ?? null,
            },
          },
        }));

        // Dispatch fix-up work with findings before re-review
        const fixupPrompt = `Fix the following code review findings:\n\n${summary.rawOutput}\n\nAddress all critical and important issues.`;
        const fixupConfig: SubagentConfig = {
          agent: "implementer",
          taskNumber: 0,
          task: fixupPrompt,
          model: response.model ?? resolveReviewModel(modelTiers, "code"),
          cwd: workspacePath,
        };
        await io.dispatchSubagent(fixupConfig);

        // Commit fixes
        await commitWave(io, workspacePath, waves.length + attempt + 1, "Code review fixes", []);

        continue;
      }

      // escalate
      if (response.action === "escalate") {
        const failureAction = await callbacks.requestFailureAction({
          taskNumber: 0,
          wave: waves.length,
          error: "Code review escalated",
          attempts: attempt + 1,
          maxAttempts: MAX_REVIEW_RETRIES,
        });
        if (failureAction === "skip") return true;
        if (failureAction === "stop") {
          await this.persistStoppedState(planFileName, waves.length, "Final review escalated and stopped");
          return false;
        }
        // retry — continue loop
      }
    }

    // Exhausted
    return true;
  }

  /**
   * Persists stopped state to the state file.
   */
  private async persistStoppedState(
    planFileName: string,
    wave: number,
    reason: string,
  ): Promise<void> {
    const io = this.io;
    const cwd = this.cwd;

    try {
      await updateState(io, cwd, planFileName, (s) => ({
        ...s,
        status: "stopped" as const,
        stoppedAt: new Date().toISOString(),
        stopGranularity: this.cancellation.granularity,
      }));
    } catch {
      // Best-effort
    }
  }

  /**
   * Persists task retry metadata.
   */
  private async persistTaskRetryState(
    planFileName: string,
    taskNumber: number,
    attempts: number,
    maxAttempts: number,
    lastFailure: string,
    context?: string | null,
    model?: string | null,
  ): Promise<void> {
    const io = this.io;
    const cwd = this.cwd;
    const taskKey = String(taskNumber);

    await updateState(io, cwd, planFileName, (s) => ({
      ...s,
      retryState: {
        ...s.retryState,
        tasks: {
          ...s.retryState.tasks,
          [taskKey]: {
            attempts,
            maxAttempts,
            lastFailure,
            lastFailureAt: new Date().toISOString(),
            lastContext: context ?? null,
            lastModel: model ?? null,
          },
        },
      },
    }));
  }

  /**
   * Builds a task specification string from a PlanTask.
   */
  private buildTaskSpec(task: PlanTask): string {
    const lines: string[] = [];
    lines.push(`### Task ${task.number}: ${task.title}`);
    lines.push("");

    if (task.files.create.length > 0) {
      lines.push("**Create:**");
      for (const f of task.files.create) lines.push(`- \`${f}\``);
    }
    if (task.files.modify.length > 0) {
      lines.push("**Modify:**");
      for (const f of task.files.modify) lines.push(`- \`${f}\``);
    }
    if (task.files.test.length > 0) {
      lines.push("**Test:**");
      for (const f of task.files.test) lines.push(`- \`${f}\``);
    }
    lines.push("");

    lines.push("**Steps:**");
    for (const step of task.steps) {
      lines.push(`- ${step}`);
    }
    lines.push("");

    lines.push("**Acceptance Criteria:**");
    for (const ac of task.acceptanceCriteria) {
      lines.push(`- ${ac}`);
    }

    return lines.join("\n");
  }

  private buildJudgmentRequest(
    result: SubagentResult,
    waveNumber: number,
  ) {
    switch (result.status) {
      case "BLOCKED":
        return {
          type: "blocked" as const,
          taskNumber: result.taskNumber,
          wave: waveNumber,
          blocker: result.blocker ?? "Unknown blocker",
          details: result.output,
        };
      case "NEEDS_CONTEXT":
        return {
          type: "needs_context" as const,
          taskNumber: result.taskNumber,
          wave: waveNumber,
          needs: result.needs ?? "Unknown needs",
          details: result.output,
        };
      case "DONE_WITH_CONCERNS":
        return {
          type: "done_with_concerns" as const,
          taskNumber: result.taskNumber,
          wave: waveNumber,
          concerns: result.concerns ?? "Unknown concerns",
          details: result.output,
        };
      default:
        return {
          type: "blocked" as const,
          taskNumber: result.taskNumber,
          wave: waveNumber,
          blocker: "Unexpected status: " + result.status,
          details: result.output,
        };
    }
  }

  requestCancellation(granularity: "wave" | "task"): void {
    this.cancellation = { requested: true, granularity };
    if (granularity === "task" && this.taskQueue) {
      this.taskQueue.abortAfterCurrent();
    }
  }
}
