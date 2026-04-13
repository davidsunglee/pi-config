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
 * Unfilled placeholders are detected as `{UPPER_CASE_NAME}` patterns
 * (all-uppercase letters and underscores), which avoids false positives
 * from user content that happens to contain braces.
 */
export function fillReviewTemplate(
  template: string,
  params: { planContents: string; originalSpec: string }
): string {
  // Use a sentinel to track substitution positions so user content
  // containing brace patterns doesn't interfere with placeholder detection.
  // We replace known placeholders first, then scan for remaining ones.

  // Step 1: Replace known placeholders
  let filled = template
    .replace(/\{PLAN_CONTENTS\}/g, params.planContents)
    .replace(/\{ORIGINAL_SPEC\}/g, params.originalSpec);

  // Step 2: Check for any remaining unfilled placeholders.
  // Match {ALL_CAPS_WITH_UNDERSCORES} patterns — at least 2 uppercase chars.
  const unfilledPattern = /\{[A-Z][A-Z_]{1,}\}/g;

  // We need to scan only the "template skeleton" portions, not user-provided values.
  // Since user values may contain lowercase brace patterns but not UPPER_CASE ones
  // (by convention), we can scan the full result for UPPER_CASE placeholders.
  const remaining = filled.match(unfilledPattern);
  if (remaining) {
    const unique = [...new Set(remaining)];
    throw new Error(
      `Unfilled placeholder(s) in review template: ${unique.join(", ")}`
    );
  }

  return filled;
}
