import * as path from "node:path";
import type { GenerationIO } from "./types.ts";

/**
 * Returns the absolute path to the plan-reviewer template file.
 */
export function getReviewTemplatePath(agentDir: string): string {
  return path.join(agentDir, "skills", "generate-plan", "plan-reviewer.md");
}

/**
 * Loads the plan-reviewer template from disk via `io.readFile`.
 */
export async function loadReviewTemplate(
  io: GenerationIO,
  agentDir: string
): Promise<string> {
  const templatePath = getReviewTemplatePath(agentDir);
  return io.readFile(templatePath);
}

/**
 * Fills the review template by replacing `{PLAN_CONTENTS}` and `{ORIGINAL_SPEC}`
 * with the provided values.
 *
 * Throws if any unfilled placeholders remain after substitution.
 * Unfilled placeholders are detected as `{WORD_CHARS}` patterns — at least
 * 2 characters inside braces, letters and underscores only. This catches
 * `{UPPER_CASE}`, `{Mixed_Case}`, and `{lower_case}` while avoiding false
 * positives on things like `{x}` or JSON content like `{"key": "value"}`.
 */
export function fillReviewTemplate(
  template: string,
  params: { planContents: string; originalSpec: string }
): string {
  // Step 1: Replace known placeholders with sentinels so user content
  // containing brace patterns doesn't interfere with placeholder detection.
  const SENTINEL_PLAN = "\0PLAN_SENTINEL\0";
  const SENTINEL_SPEC = "\0SPEC_SENTINEL\0";

  const skeleton = template
    .replace(/\{PLAN_CONTENTS\}/g, SENTINEL_PLAN)
    .replace(/\{ORIGINAL_SPEC\}/g, SENTINEL_SPEC);

  // Step 2: Check the skeleton for any remaining unfilled placeholders.
  // Match {WORD_CHARS} patterns — at least 2 chars inside braces, letters and
  // underscores only. This catches {UPPER_CASE}, {Mixed_Case}, and
  // {lower_case} while avoiding false positives on things like {x} or JSON
  // content like {"key": "value"}.
  const unfilledPattern = /\{[A-Za-z][A-Za-z_]{1,}\}/g;
  const remaining = skeleton.match(unfilledPattern);
  if (remaining) {
    const unique = [...new Set(remaining)];
    throw new Error(
      `Unfilled placeholder(s) in review template: ${unique.join(", ")}`
    );
  }

  // Step 3: Substitute the real user values in place of sentinels
  const filled = skeleton
    .split(SENTINEL_PLAN).join(params.planContents)
    .split(SENTINEL_SPEC).join(params.originalSpec);

  return filled;
}
