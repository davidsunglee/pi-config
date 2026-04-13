import { basename } from "node:path";
import type {
  GenerationIO,
  GenerationCallbacks,
  GenerationInput,
  GenerationResult,
  ReviewResult,
  ReviewIssue,
} from "./types.ts";
import type { ExecutionIO } from "../execute-plan/types.ts";
import { resolveInput } from "./input-resolver.ts";
import { buildGenerationPrompt, buildEditPrompt } from "./prompt-builder.ts";
import { derivePlanPath, deriveReviewPath, ensurePlanDirs } from "./path-utils.ts";
import { loadReviewTemplate, fillReviewTemplate } from "./review-template.ts";
import { parseReviewOutput } from "./review-parser.ts";
import { appendReviewNotes } from "./review-notes.ts";
import {
  createRepairState,
  shouldRepair,
  selectStrategy,
  advanceCycle,
  isConverged,
  getRemainingFindings,
} from "./repair-loop.ts";
import { parsePlan } from "../plan-contract/parser.ts";
import { validatePlan } from "../plan-contract/validator.ts";
import { loadModelTiers } from "../execute-plan/settings-loader.ts";

export class PlanGenerationEngine {
  private io: GenerationIO;
  private cwd: string;
  private agentDir: string;

  constructor(io: GenerationIO, cwd: string, agentDir: string) {
    this.io = io;
    this.cwd = cwd;
    this.agentDir = agentDir;
  }

  async generate(
    input: GenerationInput,
    callbacks: GenerationCallbacks,
  ): Promise<GenerationResult> {
    try {
      return await this.runLifecycle(input, callbacks);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      callbacks.onProgress(`Error: ${message}`);
      throw err;
    }
  }

  private async runLifecycle(
    input: GenerationInput,
    callbacks: GenerationCallbacks,
  ): Promise<GenerationResult> {
    // ── Phase 1 — Input resolution ──────────────────────────────────────
    callbacks.onProgress("Resolving input...");
    const resolvedInput = await resolveInput(this.io, input);
    const planPath = derivePlanPath(this.cwd, resolvedInput.shortDescription);
    const reviewPath = deriveReviewPath(planPath);
    await ensurePlanDirs(this.io, this.cwd);

    // ── Phase 2 — Plan generation ───────────────────────────────────────
    callbacks.onProgress("Generating plan...");
    const generationPrompt = buildGenerationPrompt({
      sourceText: resolvedInput.sourceText,
      sourceTodoId: resolvedInput.sourceTodoId,
      cwd: this.cwd,
      outputPath: planPath,
    });
    let planContent = await this.dispatchPlanGeneratorAndReadPlan(
      generationPrompt,
      planPath,
      "initial generation",
    );

    // ── Phase 3 — Validation gate ───────────────────────────────────────
    callbacks.onProgress("Validating plan...");
    const fileName = basename(planPath);
    let plan = parsePlan(planContent, fileName);
    let validation = validatePlan(plan);
    let validationErrors = validation.errors;

    let reviewResult: ReviewResult | null = null;
    let reviewFileWritten = false;

    if (!validation.valid) {
      // Validation failed → skip review, go to repair
    } else {
      // ── Phase 4 — Review (only when structurally valid) ─────────────
      callbacks.onProgress("Reviewing plan...");
      reviewResult = await this.runReview(
        planContent,
        resolvedInput.sourceText,
        reviewPath,
        callbacks,
      );
      reviewFileWritten = true;
    }

    // ── Phase 5 — Repair loop (if needed) ─────────────────────────────
    let repairState = createRepairState(
      reviewResult?.issues ?? [],
      validationErrors,
    );

    while (shouldRepair(repairState, validationErrors, reviewResult)) {
      callbacks.onProgress(`Repair cycle ${repairState.cycle + 1}...`);

      const strategy = selectStrategy(
        repairState,
        validationErrors,
        reviewResult?.issues ?? [],
      );

      const editPrompt = buildEditPrompt({
        currentPlanContent: planContent,
        outputPath: planPath,
        findings: reviewResult?.issues ?? [],
        validationErrors,
        strategy,
      });

      planContent = await this.dispatchPlanGeneratorAndReadPlan(
        editPrompt,
        planPath,
        `repair cycle ${repairState.cycle + 1}`,
      );

      // Re-parse and re-validate
      plan = parsePlan(planContent, fileName);
      validation = validatePlan(plan);
      validationErrors = validation.errors;

      // If validation passes and review not yet done for this cycle,
      // re-run review
      if (validation.valid) {
        callbacks.onProgress("Reviewing plan...");
        reviewResult = await this.runReview(
          planContent,
          resolvedInput.sourceText,
          reviewPath,
          callbacks,
        );
        reviewFileWritten = true;
      } else {
        // Validation still fails — clear stale review findings so only
        // validation errors drive this repair cycle. Old review issues
        // should not misdirect repairs or inflate escalation counters.
        reviewResult = null;
      }

      repairState = advanceCycle(
        repairState,
        validationErrors,
        reviewResult?.issues ?? [],
      );
    }

    // ── Phase 6 — Finalization ──────────────────────────────────────────
    let reviewStatus: GenerationResult["reviewStatus"];
    let noteCount = 0;
    let remainingFindings: ReviewIssue[] = [];

    if (isConverged(validationErrors, reviewResult)) {
      if (reviewResult !== null) {
        const warnings = reviewResult.issues.filter(
          (i) => i.severity === "warning",
        );
        const suggestions = reviewResult.issues.filter(
          (i) => i.severity === "suggestion",
        );
        const nonBlocking = warnings.length + suggestions.length;

        if (nonBlocking > 0) {
          const updatedContent = appendReviewNotes(
            planContent,
            reviewResult.issues,
          );
          await this.io.writeFile(planPath, updatedContent);
          reviewStatus = "approved_with_notes";
          noteCount = nonBlocking;
        } else {
          reviewStatus = "approved";
        }
      } else {
        // Converged with no review (shouldn't normally happen since valid
        // plans get reviewed, but handle gracefully)
        reviewStatus = "approved";
      }
    } else {
      reviewStatus = "errors_found";
      const remaining = getRemainingFindings(repairState);
      // Combine validation errors as ReviewIssue[]
      remainingFindings = [
        ...remaining.validationErrors.map(
          (e): ReviewIssue => ({
            severity: "error",
            taskNumber: null,
            shortDescription: e,
            fullText: e,
          }),
        ),
        ...remaining.reviewIssues,
      ];
    }

    const result: GenerationResult = {
      planPath,
      reviewPath: reviewFileWritten ? reviewPath : null,
      reviewStatus,
      noteCount,
      remainingFindings,
    };

    callbacks.onComplete(result);
    return result;
  }

  private async dispatchPlanGeneratorAndReadPlan(
    task: string,
    planPath: string,
    phase: string,
  ): Promise<string> {
    // Clear any pre-existing file so stale content can't satisfy the check
    if (await this.io.fileExists(planPath)) {
      await this.io.writeFile(planPath, "");
    }

    const output = await this.io.dispatchSubagent({
      agent: "plan-generator",
      task,
    });

    if (!(await this.io.fileExists(planPath))) {
      const mentionedPaths = this.extractMentionedMarkdownPaths(output.text)
        .filter((candidate) => candidate !== planPath);
      const details = [
        `Plan generator did not write the expected plan file at ${planPath} during ${phase}.`,
      ];

      if (mentionedPaths.length > 0) {
        details.push(
          `The subagent output mentioned a different path instead: ${mentionedPaths.join(", ")}`,
        );
      }

      const trimmedOutput = output.text.trim();
      if (trimmedOutput) {
        details.push(`Subagent output:\n${trimmedOutput}`);
      }

      throw new Error(details.join("\n"));
    }

    let content: string;
    try {
      content = await this.io.readFile(planPath);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Plan generator reported success, but the expected plan file at ${planPath} could not be read during ${phase}: ${message}`,
      );
    }

    if (!content.trim()) {
      throw new Error(
        `Plan generator did not produce output at ${planPath} during ${phase}.`,
      );
    }

    return content;
  }

  private extractMentionedMarkdownPaths(text: string): string[] {
    const matches = text.match(/\S+\.md\b/g) ?? [];
    const cleaned = matches.map((match) =>
      match.replace(/^[("'`]+|[)"'`,.:;!?]+$/g, "")
    ).filter((match) => match.length > 0);

    return [...new Set(cleaned)];
  }

  /**
   * Run the review phase: load model tiers, fill template, dispatch reviewer.
   * Handles cross-provider fallback.
   */
  private async runReview(
    planContent: string,
    originalSpec: string,
    reviewPath: string,
    callbacks: GenerationCallbacks,
  ): Promise<ReviewResult> {
    // Load model tiers
    const tiersResult = await loadModelTiers(
      { readFile: this.io.readFile.bind(this.io) } as ExecutionIO,
      this.agentDir,
    );
    if (!tiersResult.ok) {
      throw new Error(`Failed to load model tiers: ${tiersResult.error}`);
    }
    const tiers = tiersResult.tiers;

    // Load and fill review template
    const template = await loadReviewTemplate(this.io, this.agentDir);
    const filledTemplate = fillReviewTemplate(template, {
      planContents: planContent,
      originalSpec,
    });

    // Determine review model: crossProvider.capable preferred, tiers.capable fallback
    const crossProviderModel = tiers.crossProvider?.capable;
    const fallbackModel = tiers.capable;
    const reviewModel = crossProviderModel ?? fallbackModel;

    let output;
    try {
      output = await this.io.dispatchSubagent({
        agent: "plan-reviewer",
        task: filledTemplate,
        model: reviewModel,
      });
    } catch {
      // If using crossProvider model and it failed, retry with fallback
      if (crossProviderModel && reviewModel === crossProviderModel) {
        callbacks.onWarning(
          `Cross-provider model "${crossProviderModel}" failed, falling back to "${fallbackModel}"`,
        );
        output = await this.io.dispatchSubagent({
          agent: "plan-reviewer",
          task: filledTemplate,
          model: fallbackModel,
        });
      } else {
        throw new Error("Review dispatch failed");
      }
    }

    // Parse review output
    const reviewResult = parseReviewOutput(output.text);

    // Write review output to disk
    await this.io.writeFile(reviewPath, output.text);

    return reviewResult;
  }
}
