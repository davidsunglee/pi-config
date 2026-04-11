/**
 * Extension entry point for execute-plan.
 *
 * Thin wrapper that wires the PlanExecutionEngine to pi's extension API
 * and TUI components. All orchestration logic lives in the engine — this
 * file only bridges between pi APIs and engine callbacks.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

import { Type } from "@sinclair/typebox";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";

import {
  PlanExecutionEngine,
  isGitRepo,
  isDirty,
  type EngineCallbacks,
  type CodeReviewSummary,
  type ProgressEvent,
} from "../../lib/execute-plan/index.ts";

import { PiExecutionIO } from "./io-adapter.ts";
import { createDispatchFunction } from "./subagent-dispatch.ts";
import {
  registerJudgmentTool,
  createJudgmentBridge,
} from "./judgment.ts";

import {
  SettingsConfirmationComponent,
  ResumePromptComponent,
  WorktreeSetupComponent,
  WaveProgressWidget,
  FailureHandlerComponent,
  CancellationSelectionComponent,
  MainBranchWarningComponent,
  ReviewSummaryComponent,
  TestCommandInputComponent,
} from "./tui.ts";

import type {
  ExecutionSettings,
  FailureContext,
  WorkspaceChoice,
  JudgmentResponse,
} from "../../lib/execute-plan/types.ts";

// ── Module-level state ──────────────────────────────────────────────

let piRef: ExtensionAPI | null = null;
let currentBridge: ReturnType<typeof createJudgmentBridge> | null = null;
const getResolver = (): ((response: JudgmentResponse) => void) | null =>
  currentBridge?.getResolver() ?? null;

// ── Extension factory ───────────────────────────────────────────────

export default function (pi: ExtensionAPI): void {
  piRef = pi;

  // Step 2: Register judgment tool ONCE globally
  registerJudgmentTool(pi, getResolver);

  // Step 3: Register /execute-plan command
  pi.registerCommand("execute-plan", {
    description: "Execute an implementation plan with parallel subagents",
    handler: async (args, ctx) => {
      const planPath = args.trim() || undefined;
      await handleExecutePlan(planPath, ctx);
    },
  });

  // Step 4: Register execute_plan tool
  pi.registerTool({
    name: "execute_plan",
    label: "Execute Plan",
    description:
      "Execute an implementation plan with parallel subagents. Optionally provide a path to the plan file.",
    parameters: Type.Object({
      path: Type.Optional(
        Type.String({
          description: "Path to the plan markdown file. If omitted, lists available plans for selection.",
        }),
      ),
    }),
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const planPath = (params as { path?: string }).path;
      try {
        await handleExecutePlan(planPath, ctx);
        return {
          content: [{ type: "text" as const, text: "Plan execution completed." }],
          details: { success: true },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Plan execution failed: ${message}` }],
          details: { success: false, error: message },
        };
      }
    },
  });
}

// ── Shared execution handler ────────────────────────────────────────

async function handleExecutePlan(
  planPath: string | undefined,
  ctx: ExtensionContext,
): Promise<void> {
  const cwd = ctx.cwd;
  const agentDir = path.dirname(path.dirname(import.meta.url.replace("file://", "")));

  // Create a temporary IO for precondition checks
  const tempIO = new PiExecutionIO(
    createDispatchFunction(agentDir),
    ctx.sessionManager.getSessionId(),
  );

  // Precondition: git repo
  if (!(await isGitRepo(tempIO, cwd))) {
    ctx.ui.notify("Not a git repository. execute-plan requires git.", "error");
    return;
  }

  // Precondition: dirty tree warning
  if (await isDirty(tempIO, cwd)) {
    ctx.ui.notify(
      "Working tree has uncommitted changes. Consider committing or stashing before execution.",
      "warning",
    );
  }

  // Resolve plan path
  let resolvedPlanPath: string;
  if (planPath) {
    resolvedPlanPath = path.isAbsolute(planPath)
      ? planPath
      : path.resolve(cwd, planPath);
  } else {
    // List available plans from .pi/plans/ (exclude done/ subdirectory)
    const plansDir = path.join(cwd, ".pi", "plans");
    let planFiles: string[];
    try {
      const entries = await fs.readdir(plansDir);
      planFiles = entries.filter(
        (f) => f.endsWith(".md") && f !== "done",
      );
    } catch {
      ctx.ui.notify("No .pi/plans/ directory found.", "error");
      return;
    }

    if (planFiles.length === 0) {
      ctx.ui.notify("No plan files found in .pi/plans/.", "info");
      return;
    }

    if (planFiles.length === 1) {
      resolvedPlanPath = path.join(plansDir, planFiles[0]);
    } else {
      const selected = await ctx.ui.select(
        "Select a plan to execute:",
        planFiles,
      );
      if (!selected) return;
      resolvedPlanPath = path.join(plansDir, selected);
    }
  }

  // Create IO adapter
  const io = new PiExecutionIO(
    createDispatchFunction(agentDir),
    ctx.sessionManager.getSessionId(),
  );

  // Create engine
  const engine = new PlanExecutionEngine(io, cwd, agentDir);

  // Create judgment bridge for this execution
  currentBridge = createJudgmentBridge(piRef!);

  // Track latest code review for display after completion
  let latestCodeReview: CodeReviewSummary | null = null;

  // Track wave progress for widget updates
  let widget: WaveProgressWidget | null = null;
  let currentWave = 0;
  let totalWaves = 0;
  const taskStatuses = new Map<number, string>();

  // Wire EngineCallbacks
  const callbacks: EngineCallbacks = {
    async requestSettings(plan, detected) {
      if (!ctx.hasUI) {
        // Non-interactive: use detected settings with defaults
        return {
          execution: detected.execution ?? "parallel",
          tdd: detected.tdd ?? false,
          finalReview: detected.finalReview ?? true,
          specCheck: detected.specCheck ?? false,
          integrationTest: detected.integrationTest ?? false,
          testCommand: detected.testCommand ?? null,
        };
      }

      const initialSettings: ExecutionSettings = {
        execution: detected.execution ?? "parallel",
        tdd: detected.tdd ?? false,
        finalReview: detected.finalReview ?? true,
        specCheck: detected.specCheck ?? false,
        integrationTest: detected.integrationTest ?? false,
        testCommand: detected.testCommand ?? null,
      };

      const result = await ctx.ui.custom<ExecutionSettings | null>(
        (tui, theme, keybindings, done) => {
          return new SettingsConfirmationComponent(
            tui,
            theme,
            keybindings,
            plan,
            initialSettings,
            done,
          );
        },
      );

      if (result === null) {
        throw new Error("Execution cancelled by user.");
      }

      return result;
    },

    async requestResumeAction(state) {
      if (!ctx.hasUI) return "continue";

      return ctx.ui.custom<"continue" | "restart" | "cancel">(
        (tui, theme, keybindings, done) => {
          return new ResumePromptComponent(tui, theme, keybindings, state, done);
        },
      );
    },

    async confirmMainBranch(branch) {
      if (!ctx.hasUI) return false;

      return ctx.ui.custom<boolean>((tui, theme, keybindings, done) => {
        return new MainBranchWarningComponent(tui, theme, keybindings, branch, done);
      });
    },

    async requestWorktreeSetup(suggestedBranch, _cwd) {
      if (!ctx.hasUI) return { type: "current" } as WorkspaceChoice;

      return ctx.ui.custom<WorkspaceChoice>((tui, theme, keybindings, done) => {
        return new WorktreeSetupComponent(
          tui,
          theme,
          keybindings,
          suggestedBranch,
          done,
        );
      });
    },

    async requestFailureAction(context) {
      if (!ctx.hasUI) return "stop";

      return ctx.ui.custom<"retry" | "skip" | "stop">(
        (tui, theme, keybindings, done) => {
          return new FailureHandlerComponent(tui, theme, keybindings, context, done);
        },
      );
    },

    async requestTestRegressionAction(context) {
      if (!ctx.hasUI) return "stop";

      // Adapt TestRegressionContext to FailureContext for the component
      const adapted: FailureContext = {
        taskNumber: 0,
        wave: context.wave,
        error: `Test regression detected:\n${context.newFailures.join("\n")}`,
        attempts: 1,
        maxAttempts: 1,
      };

      return ctx.ui.custom<"retry" | "skip" | "stop">(
        (tui, theme, keybindings, done) => {
          return new FailureHandlerComponent(tui, theme, keybindings, adapted, done);
        },
      );
    },

    async requestTestCommand() {
      if (!ctx.hasUI) return null;

      return ctx.ui.custom<string | null>((tui, theme, keybindings, done) => {
        return new TestCommandInputComponent(tui, theme, keybindings, done);
      });
    },

    async requestJudgment(request) {
      if (!currentBridge) {
        throw new Error("No judgment bridge available.");
      }
      return currentBridge.requestJudgment(request);
    },

    onProgress(event: ProgressEvent) {
      try {
        switch (event.type) {
          case "wave_started": {
            currentWave = event.wave;
            taskStatuses.clear();
            for (const tn of event.taskNumbers) {
              taskStatuses.set(tn, "pending");
            }

            // We need tui/theme to construct the widget, which are only
            // available inside a setWidget factory. Use the factory form.
            ctx.ui.setWidget(
              "execute-plan-progress",
              (tui, theme) => {
                widget = new WaveProgressWidget(
                  tui,
                  theme,
                  currentWave,
                  totalWaves,
                  taskStatuses,
                );
                return widget;
              },
            );
            break;
          }

          case "wave_completed": {
            // Keep widget showing completed state briefly
            if (widget) {
              for (const key of taskStatuses.keys()) {
                taskStatuses.set(key, "done");
              }
              widget.updateProgress(event.wave, totalWaves, taskStatuses);
            }
            break;
          }

          case "task_started": {
            taskStatuses.set(event.taskNumber, "running");
            if (widget) {
              widget.updateProgress(currentWave, totalWaves, taskStatuses);
            }
            break;
          }

          case "task_progress": {
            taskStatuses.set(event.taskNumber, event.status);
            if (widget) {
              widget.updateProgress(currentWave, totalWaves, taskStatuses);
            }
            break;
          }

          case "task_completed": {
            taskStatuses.set(event.taskNumber, event.result.status);
            if (widget) {
              widget.updateProgress(currentWave, totalWaves, taskStatuses);
            }
            break;
          }

          case "code_review_completed": {
            latestCodeReview = event.review;
            break;
          }

          case "execution_completed": {
            totalWaves = event.totalWaves;
            break;
          }

          case "execution_stopped": {
            // Clear widget on stop
            ctx.ui.setWidget("execute-plan-progress", undefined);
            widget = null;
            break;
          }

          case "cancellation_acknowledged": {
            // Nothing to do — engine handles the rest
            break;
          }
        }
      } catch {
        // Swallow TUI errors so they don't crash the engine
      }
    },
  };

  // Set up cancellation handling via terminal input
  let unsubTerminal: (() => void) | null = null;
  if (ctx.hasUI) {
    unsubTerminal = ctx.ui.onTerminalInput((data) => {
      // Ctrl+C is \x03
      if (data === "\x03") {
        // Show cancellation selection
        ctx.ui
          .custom<"wave" | "task">((tui, theme, keybindings, done) => {
            return new CancellationSelectionComponent(tui, theme, keybindings, done);
          })
          .then((granularity) => {
            engine.requestCancellation(granularity);
          })
          .catch(() => {
            // If the UI fails, default to wave-level cancellation
            engine.requestCancellation("wave");
          });
        return { consume: true };
      }
      return undefined;
    });
  }

  try {
    // Run the engine
    await engine.execute(resolvedPlanPath, callbacks);

    // Show code review summary if available
    if (latestCodeReview && ctx.hasUI) {
      await ctx.ui.custom<void>((tui, theme, keybindings, done) => {
        return new ReviewSummaryComponent(
          tui,
          theme,
          keybindings,
          latestCodeReview!,
          done,
        );
      });
    }
  } finally {
    // Cleanup
    ctx.ui.setWidget("execute-plan-progress", undefined);
    widget = null;

    if (unsubTerminal) {
      unsubTerminal();
      unsubTerminal = null;
    }

    currentBridge = null;
  }
}
