import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { appendReviewNotes } from "./review-notes.ts";
import type { ReviewIssue } from "./types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeIssue(
  severity: ReviewIssue["severity"],
  taskNumber: number | null,
  fullText: string
): ReviewIssue {
  return {
    severity,
    taskNumber,
    shortDescription: fullText.slice(0, 20),
    fullText,
  };
}

const basePlan = `# Implementation Plan

## Task 1: Set up project
- Initialize repository

## Task 2: Build feature
- Write code
`;

// ---------------------------------------------------------------------------
// (a) appends warnings subsection when only warnings present
// ---------------------------------------------------------------------------
describe("appendReviewNotes", () => {
  test("appends ## Review Notes with warnings subsection when only warnings present", () => {
    const issues: ReviewIssue[] = [
      makeIssue("warning", 1, "Consider edge cases in Task 1"),
    ];

    const result = appendReviewNotes(basePlan, issues);

    assert.ok(result.includes("## Review Notes"), "Should contain ## Review Notes header");
    assert.ok(
      result.includes("_Added by plan reviewer — informational, not blocking._"),
      "Should contain informational preamble"
    );
    assert.ok(result.includes("### Warnings"), "Should contain ### Warnings subsection");
    assert.ok(
      result.includes("- **Task 1**: Consider edge cases in Task 1"),
      "Should contain the warning line"
    );
    assert.ok(!result.includes("### Suggestions"), "Should NOT contain ### Suggestions subsection");
  });

  // ---------------------------------------------------------------------------
  // (b) appends suggestions subsection when only suggestions present
  // ---------------------------------------------------------------------------
  test("appends suggestions subsection when only suggestions present", () => {
    const issues: ReviewIssue[] = [
      makeIssue("suggestion", 2, "Add logging to Task 2"),
    ];

    const result = appendReviewNotes(basePlan, issues);

    assert.ok(result.includes("## Review Notes"), "Should contain ## Review Notes header");
    assert.ok(result.includes("### Suggestions"), "Should contain ### Suggestions subsection");
    assert.ok(
      result.includes("- **Task 2**: Add logging to Task 2"),
      "Should contain the suggestion line"
    );
    assert.ok(!result.includes("### Warnings"), "Should NOT contain ### Warnings subsection");
  });

  // ---------------------------------------------------------------------------
  // (c) appends both warnings and suggestions when mixed
  // ---------------------------------------------------------------------------
  test("appends both warnings and suggestions subsections when mixed", () => {
    const issues: ReviewIssue[] = [
      makeIssue("warning", 1, "Consider edge cases in Task 1"),
      makeIssue("suggestion", 2, "Add logging to Task 2"),
      makeIssue("warning", 3, "Performance concern in Task 3"),
    ];

    const result = appendReviewNotes(basePlan, issues);

    assert.ok(result.includes("### Warnings"), "Should contain ### Warnings");
    assert.ok(result.includes("### Suggestions"), "Should contain ### Suggestions");
    assert.ok(
      result.includes("- **Task 1**: Consider edge cases in Task 1"),
      "Should contain first warning"
    );
    assert.ok(
      result.includes("- **Task 3**: Performance concern in Task 3"),
      "Should contain second warning"
    );
    assert.ok(
      result.includes("- **Task 2**: Add logging to Task 2"),
      "Should contain suggestion"
    );

    // Warnings section should come before Suggestions section
    const warningsIdx = result.indexOf("### Warnings");
    const suggestionsIdx = result.indexOf("### Suggestions");
    assert.ok(warningsIdx < suggestionsIdx, "Warnings should appear before Suggestions");
  });

  // ---------------------------------------------------------------------------
  // (d) does not append anything when no warnings or suggestions
  // ---------------------------------------------------------------------------
  test("does not append anything when only errors present", () => {
    const issues: ReviewIssue[] = [
      makeIssue("error", 1, "Missing required field in Task 1"),
    ];

    const result = appendReviewNotes(basePlan, issues);
    assert.equal(result, basePlan, "Should return plan unchanged when only errors");
  });

  test("does not append anything when issues array is empty", () => {
    const result = appendReviewNotes(basePlan, []);
    assert.equal(result, basePlan, "Should return plan unchanged when no issues");
  });

  // ---------------------------------------------------------------------------
  // (e) does not duplicate ## Review Notes — replaces existing section
  // ---------------------------------------------------------------------------
  test("replaces existing ## Review Notes section instead of duplicating", () => {
    const planWithExistingNotes = `${basePlan}
## Review Notes

_Added by plan reviewer — informational, not blocking._

### Warnings
- **Task 1**: Old warning text
`;

    const issues: ReviewIssue[] = [
      makeIssue("suggestion", 2, "New suggestion text"),
    ];

    const result = appendReviewNotes(planWithExistingNotes, issues);

    // Count occurrences of ## Review Notes
    const matches = result.match(/## Review Notes/g);
    assert.equal(matches?.length, 1, "Should have exactly one ## Review Notes section");

    // Old content should be gone
    assert.ok(!result.includes("Old warning text"), "Old warning should be removed");

    // New content should be present
    assert.ok(result.includes("New suggestion text"), "New suggestion should be present");
  });

  // ---------------------------------------------------------------------------
  // (f) output matches canonical format exactly
  // ---------------------------------------------------------------------------
  test("output matches canonical format", () => {
    const issues: ReviewIssue[] = [
      makeIssue("warning", 1, "Consider edge cases"),
      makeIssue("suggestion", 2, "Add logging"),
    ];

    const result = appendReviewNotes(basePlan, issues);

    const expectedSection = [
      "## Review Notes",
      "",
      "_Added by plan reviewer — informational, not blocking._",
      "",
      "### Warnings",
      "- **Task 1**: Consider edge cases",
      "",
      "### Suggestions",
      "- **Task 2**: Add logging",
    ].join("\n");

    assert.ok(
      result.includes(expectedSection),
      `Expected canonical format in output.\n\nExpected section:\n${expectedSection}\n\nActual result:\n${result}`
    );
  });

  // ---------------------------------------------------------------------------
  // (g) issues without task numbers use "General" instead of "Task N"
  // ---------------------------------------------------------------------------
  test('uses "General" for issues without task numbers', () => {
    const issues: ReviewIssue[] = [
      makeIssue("warning", null, "Overall structure could be improved"),
      makeIssue("suggestion", null, "Consider adding a summary"),
    ];

    const result = appendReviewNotes(basePlan, issues);

    assert.ok(
      result.includes("- **General**: Overall structure could be improved"),
      "Warning without task number should use General"
    );
    assert.ok(
      result.includes("- **General**: Consider adding a summary"),
      "Suggestion without task number should use General"
    );
  });

  // ---------------------------------------------------------------------------
  // (h) multiline fullText is rendered with proper indentation
  // ---------------------------------------------------------------------------
  test("renders multiline fullText with proper indentation under the task label", () => {
    const multilineText = [
      "- **What:** Task 2 says it creates `output.json` but Task 4 reads `result.json`.",
      "- **Why it matters:** Task 4 will fail because the expected file does not exist.",
      "- **Recommendation:** Rename the output in Task 2 to `result.json`.",
    ].join("\n");

    const issues: ReviewIssue[] = [
      makeIssue("warning", 2, multilineText),
    ];

    const result = appendReviewNotes(basePlan, issues);

    // The first line should follow the task label
    assert.ok(
      result.includes("- **Task 2**: - **What:** Task 2 says it creates `output.json`"),
      "First line of fullText should follow the task label"
    );
    // Continuation lines should be indented with 2 spaces
    assert.ok(
      result.includes("\n  - **Why it matters:** Task 4 will fail"),
      "Second line should be indented with 2 spaces"
    );
    assert.ok(
      result.includes("\n  - **Recommendation:** Rename the output"),
      "Third line should be indented with 2 spaces"
    );

    // Verify the complete formatted block
    const expectedBlock = [
      "- **Task 2**: - **What:** Task 2 says it creates `output.json` but Task 4 reads `result.json`.",
      "  - **Why it matters:** Task 4 will fail because the expected file does not exist.",
      "  - **Recommendation:** Rename the output in Task 2 to `result.json`.",
    ].join("\n");
    assert.ok(
      result.includes(expectedBlock),
      `Expected formatted block:\n${expectedBlock}\n\nActual result:\n${result}`
    );
  });

  // ---------------------------------------------------------------------------
  // Additional: errors mixed with warnings/suggestions are excluded
  // ---------------------------------------------------------------------------
  test("errors are never included in review notes even when mixed with other severities", () => {
    const issues: ReviewIssue[] = [
      makeIssue("error", 1, "Critical failure"),
      makeIssue("warning", 2, "Minor concern"),
      makeIssue("suggestion", 3, "Nice to have"),
    ];

    const result = appendReviewNotes(basePlan, issues);

    assert.ok(!result.includes("Critical failure"), "Error text should not appear in review notes");
    assert.ok(result.includes("Minor concern"), "Warning text should appear");
    assert.ok(result.includes("Nice to have"), "Suggestion text should appear");
  });
});
