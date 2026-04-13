import type { ReviewIssue } from "./types.ts";

const REVIEW_NOTES_HEADING = "## Review Notes";
const PREAMBLE = "_Added by plan reviewer — informational, not blocking._";

/**
 * Append a "## Review Notes" section to a plan, listing non-blocking issues
 * (warnings and suggestions). Errors are never included.
 *
 * If the plan already contains a "## Review Notes" section it is replaced
 * (idempotent — no duplication).
 *
 * Returns the plan content unchanged when there are no warnings or suggestions.
 */
export function appendReviewNotes(
  planContent: string,
  issues: ReviewIssue[]
): string {
  const warnings = issues.filter((i) => i.severity === "warning");
  const suggestions = issues.filter((i) => i.severity === "suggestion");

  if (warnings.length === 0 && suggestions.length === 0) {
    return planContent;
  }

  // Strip existing Review Notes section if present
  const stripped = removeExistingReviewNotes(planContent);

  // Build the new section
  const section = buildReviewNotesSection(warnings, suggestions);

  // Append with a blank line separator
  const trimmed = stripped.trimEnd();
  return `${trimmed}\n\n${section}\n`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function removeExistingReviewNotes(content: string): string {
  const headingIndex = content.indexOf(REVIEW_NOTES_HEADING);
  if (headingIndex === -1) return content;

  // Find the next h2 heading after the Review Notes heading (if any)
  const afterHeading = content.indexOf(
    "\n## ",
    headingIndex + REVIEW_NOTES_HEADING.length
  );

  if (afterHeading === -1) {
    // No subsequent h2 — remove everything from the heading onward
    return content.slice(0, headingIndex);
  }

  // There is a subsequent h2 — remove only the Review Notes section
  return content.slice(0, headingIndex) + content.slice(afterHeading + 1);
}

function formatLabel(taskNumber: number | null): string {
  return taskNumber === null ? "General" : `Task ${taskNumber}`;
}

function formatItem(issue: ReviewIssue): string {
  const label = `- **${formatLabel(issue.taskNumber)}**: `;
  const lines = issue.fullText.split("\n");
  const firstLine = lines[0];
  const rest = lines.slice(1);

  if (rest.length === 0) {
    return `${label}${firstLine}`;
  }

  // Indent continuation lines with 2 spaces (standard markdown list continuation)
  const continued = rest.map((line) => `  ${line}`).join("\n");
  return `${label}${firstLine}\n${continued}`;
}

function buildReviewNotesSection(
  warnings: ReviewIssue[],
  suggestions: ReviewIssue[]
): string {
  const lines: string[] = [
    REVIEW_NOTES_HEADING,
    "",
    PREAMBLE,
  ];

  if (warnings.length > 0) {
    lines.push("", "### Warnings");
    for (const w of warnings) {
      lines.push(formatItem(w));
    }
  }

  if (suggestions.length > 0) {
    lines.push("", "### Suggestions");
    for (const s of suggestions) {
      lines.push(formatItem(s));
    }
  }

  return lines.join("\n");
}
