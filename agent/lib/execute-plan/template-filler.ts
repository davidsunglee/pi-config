import * as path from "node:path";
import type { Plan, PlanTask, Wave, WaveState } from "./types.ts";

// ── Template types ────────────────────────────────────────────────────

export type TemplateType = "implementer" | "spec-reviewer" | "code-reviewer";

// ── Template path constants ───────────────────────────────────────────

export const TEMPLATE_PATHS: Record<TemplateType, string> = {
  implementer: "skills/execute-plan/implementer-prompt.md",
  "spec-reviewer": "skills/execute-plan/spec-reviewer.md",
  "code-reviewer": "skills/requesting-code-review/code-reviewer.md",
};

/**
 * Returns the absolute path to the template file for the given type.
 * @param agentDir - Absolute path to the agent directory.
 * @param type     - Template type.
 */
export function getTemplatePath(agentDir: string, type: TemplateType): string {
  return path.join(agentDir, TEMPLATE_PATHS[type]);
}

// ── TDD block ─────────────────────────────────────────────────────────

const TDD_INSTRUCTIONS = `## TDD Required
Follow Test-Driven Development:
1. Write failing tests first
2. Implement minimum code to pass
3. Refactor if needed
4. Repeat`;

// ── Implementer prompt filler ─────────────────────────────────────────

export interface ImplementerPromptParams {
  taskSpec: string;
  context: string;
  workingDir: string;
  tddEnabled: boolean;
}

/**
 * Fills the implementer prompt template with task-specific values.
 */
export function fillImplementerPrompt(
  template: string,
  params: ImplementerPromptParams,
): string {
  const tddBlock = params.tddEnabled ? TDD_INSTRUCTIONS : "";
  return template
    .replaceAll("{TASK_SPEC}", params.taskSpec)
    .replaceAll("{CONTEXT}", params.context)
    .replaceAll("{WORKING_DIR}", params.workingDir)
    .replaceAll("{TDD_BLOCK}", tddBlock);
}

// ── Spec reviewer prompt filler ───────────────────────────────────────

export interface SpecReviewerPromptParams {
  taskSpec: string;
  implementerReport: string;
}

/**
 * Fills the spec-reviewer prompt template.
 */
export function fillSpecReviewerPrompt(
  template: string,
  params: SpecReviewerPromptParams,
): string {
  return template
    .replaceAll("{TASK_SPEC}", params.taskSpec)
    .replaceAll("{IMPLEMENTER_REPORT}", params.implementerReport);
}

// ── Code reviewer prompt filler ───────────────────────────────────────

export interface CodeReviewerPromptParams {
  whatWasImplemented: string;
  planOrRequirements: string;
  baseSha: string;
  headSha: string;
  description: string;
}

/**
 * Fills the code-reviewer prompt template.
 */
export function fillCodeReviewerPrompt(
  template: string,
  params: CodeReviewerPromptParams,
): string {
  return template
    .replaceAll("{WHAT_WAS_IMPLEMENTED}", params.whatWasImplemented)
    .replaceAll("{PLAN_OR_REQUIREMENTS}", params.planOrRequirements)
    .replaceAll("{BASE_SHA}", params.baseSha)
    .replaceAll("{HEAD_SHA}", params.headSha)
    .replaceAll("{DESCRIPTION}", params.description);
}

// ── Context builder ───────────────────────────────────────────────────

/**
 * Builds a context string for the implementer prompt from plan, wave, and
 * prior-wave information.
 */
export function buildTaskContext(
  plan: Plan,
  task: PlanTask,
  wave: Wave,
  completedWaves: WaveState[],
  allTasks: PlanTask[],
): string {
  const lines: string[] = [];

  // Plan overview
  lines.push(`## Plan Overview`);
  lines.push(`**Goal:** ${plan.header.goal}`);
  lines.push(`**Architecture:** ${plan.header.architectureSummary}`);
  lines.push(`**Tech Stack:** ${plan.header.techStack}`);

  // Current task summary
  lines.push("");
  lines.push(`## Current Task`);
  lines.push(`**Task ${task.number}:** ${task.title}`);
  lines.push(`**Wave:** ${wave.number}`);

  // Prior wave summaries
  if (completedWaves.length > 0) {
    lines.push("");
    lines.push(`## Completed Waves`);
    for (const waveState of completedWaves) {
      const taskTitles = waveState.tasks
        .map((num) => {
          const t = allTasks.find((t) => t.number === num);
          return t ? `Task ${num}: ${t.title}` : `Task ${num}`;
        })
        .join(", ");
      const sha = waveState.commitSha ? ` (commit: ${waveState.commitSha})` : "";
      lines.push(`- **Wave ${waveState.wave}** — ${taskTitles}${sha}`);
    }
  }

  return lines.join("\n");
}

// ── Placeholder validation ────────────────────────────────────────────

/**
 * Detects any remaining `{PLACEHOLDER}` tokens in the filled template string.
 * Throws an error naming the first unfilled placeholder found.
 */
export function validateNoUnfilledPlaceholders(filled: string): void {
  const match = filled.match(/\{([A-Z][A-Z0-9_]*)\}/);
  if (match) {
    throw new Error(`Unfilled placeholder found in template: {${match[1]}}`);
  }
}
