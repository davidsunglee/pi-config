import type { ReviewIssue, ReviewResult } from "./types.ts";

/**
 * Parse the raw text output from the plan-reviewer subagent into a structured ReviewResult.
 *
 * Expected format (from plan-reviewer.md):
 *
 * ```
 * ### Status
 * **[Approved]** or **[Issues Found]**
 *
 * ### Issues
 * **[Error | Warning | Suggestion] — Task N: Short description**
 * - **What:** ...
 * - **Why it matters:** ...
 * - **Recommendation:** ...
 *
 * ### Summary
 * One paragraph...
 * ```
 */
export function parseReviewOutput(reviewText: string): ReviewResult {
  const status = parseStatus(reviewText);
  if (status === null) {
    return {
      status: "issues_found",
      issues: [
        {
          severity: "error",
          taskNumber: null,
          shortDescription: "Failed to parse review output",
          fullText: reviewText,
        },
      ],
      rawOutput: reviewText,
    };
  }

  const issues = parseIssues(reviewText);

  // If the status says issues were found but we couldn't parse any, the issue
  // blocks are malformed.  Synthesize a single error-severity parse-error issue
  // so the result is never silently treated as non-blocking.
  if (status === "issues_found" && issues.length === 0) {
    const issuesSectionMatch = reviewText.match(/###\s*Issues\s*\n([\s\S]*?)(?=\n###\s|\n?$)/);
    const rawIssuesContent = issuesSectionMatch ? issuesSectionMatch[1].trim() : "";
    if (rawIssuesContent.length > 0) {
      issues.push({
        severity: "error",
        taskNumber: null,
        shortDescription: "Failed to parse review issues",
        fullText: rawIssuesContent,
      });
    }
  }

  return {
    status,
    issues,
    rawOutput: reviewText,
  };
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function parseStatus(text: string): "approved" | "issues_found" | null {
  // Look for **[Approved]** or **[Issues Found]** after a ### Status heading
  const statusSectionMatch = text.match(/###\s*Status\s*\n([\s\S]*?)(?=\n###\s|\n?$)/);
  if (!statusSectionMatch) return null;

  const statusSection = statusSectionMatch[1];

  if (/\*\*\[Approved\]\*\*/.test(statusSection)) return "approved";
  if (/\*\*\[Issues Found\]\*\*/.test(statusSection)) return "issues_found";

  return null;
}

/** Header pattern: **[Error | Warning | Suggestion] — Task N: Short description** or **[Severity] — Short description** */
const ISSUE_HEADER_RE = /^\*\*\[(Error|Warning|Suggestion)\]\s*—\s*(?:Task\s+(\d+):\s*)?(.+?)\*\*$/;

function parseIssues(text: string): ReviewIssue[] {
  // Extract the Issues section
  const issuesSectionMatch = text.match(/###\s*Issues\s*\n([\s\S]*?)(?=\n###\s|\n?$)/);
  if (!issuesSectionMatch) return [];

  const issuesSection = issuesSectionMatch[1];
  const lines = issuesSection.split("\n");

  const issues: ReviewIssue[] = [];
  let currentIssue: Partial<ReviewIssue> | null = null;
  let currentBodyLines: string[] = [];

  for (const line of lines) {
    const headerMatch = line.match(ISSUE_HEADER_RE);
    if (headerMatch) {
      // Flush previous issue
      if (currentIssue) {
        issues.push(finalizeIssue(currentIssue, currentBodyLines));
      }

      const [, severityRaw, taskNumRaw, shortDesc] = headerMatch;
      currentIssue = {
        severity: severityRaw.toLowerCase() as ReviewIssue["severity"],
        taskNumber: taskNumRaw ? parseInt(taskNumRaw, 10) : null,
        shortDescription: shortDesc.trim(),
      };
      currentBodyLines = [];
    } else if (currentIssue) {
      currentBodyLines.push(line);
    }
  }

  // Flush last issue
  if (currentIssue) {
    issues.push(finalizeIssue(currentIssue, currentBodyLines));
  }

  return issues;
}

function finalizeIssue(partial: Partial<ReviewIssue>, bodyLines: string[]): ReviewIssue {
  // Join body lines, trim leading/trailing blank lines
  const fullText = bodyLines
    .join("\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "");

  return {
    severity: partial.severity!,
    taskNumber: partial.taskNumber ?? null,
    shortDescription: partial.shortDescription ?? "",
    fullText,
  };
}
