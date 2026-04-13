import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseReviewOutput } from "./review-parser.ts";

// ── Tests ────────────────────────────────────────────────────────────────────

describe("parseReviewOutput", () => {
  // (a) parses [Approved] status with no issues
  it("parses Approved status with no issues", () => {
    const input = [
      "### Status",
      "",
      "**[Approved]**",
      "",
      "### Issues",
      "",
      "No issues found.",
      "",
      "### Summary",
      "",
      "The plan is well-structured and ready for execution.",
    ].join("\n");

    const result = parseReviewOutput(input);

    assert.equal(result.status, "approved");
    assert.deepEqual(result.issues, []);
    assert.equal(result.rawOutput, input);
  });

  // (b) parses [Issues Found] status with errors
  it("parses Issues Found status with errors", () => {
    const input = [
      "### Status",
      "",
      "**[Issues Found]**",
      "",
      "### Issues",
      "",
      "**[Error] — Task 3: Missing dependency on Task 1**",
      "- **What:** Task 3 references config.json but does not depend on Task 1 which creates it.",
      "- **Why it matters:** Task 3 may execute before config.json exists, causing a runtime failure.",
      "- **Recommendation:** Add Task 1 as an explicit dependency of Task 3.",
      "",
      "**[Error] — Task 5: Vague implementation steps**",
      "- **What:** Task 5 says \"implement the feature\" without specifying what code to write.",
      "- **Why it matters:** An agent cannot act on this task without guessing what to do.",
      "- **Recommendation:** Specify the exact files to create and the functions to implement.",
      "",
      "### Summary",
      "",
      "Found 2 errors that need fixing before execution.",
    ].join("\n");

    const result = parseReviewOutput(input);

    assert.equal(result.status, "issues_found");
    assert.equal(result.issues.length, 2);
    assert.equal(result.issues[0].severity, "error");
    assert.equal(result.issues[1].severity, "error");
  });

  // (c) extracts error-severity issues with task number, short description, and full text
  it("extracts error-severity issues with task number, short description, and full text", () => {
    const input = [
      "### Status",
      "",
      "**[Issues Found]**",
      "",
      "### Issues",
      "",
      "**[Error] — Task 2: Wrong output filename**",
      "- **What:** Task 2 says it creates `output.json` but Task 4 reads `result.json`.",
      "- **Why it matters:** Task 4 will fail because the expected file does not exist.",
      "- **Recommendation:** Rename the output in Task 2 to `result.json` or update Task 4's reference.",
      "",
      "### Summary",
      "",
      "One error found.",
    ].join("\n");

    const result = parseReviewOutput(input);

    assert.equal(result.issues.length, 1);
    const issue = result.issues[0];
    assert.equal(issue.severity, "error");
    assert.equal(issue.taskNumber, 2);
    assert.equal(issue.shortDescription, "Wrong output filename");
    assert.ok(issue.fullText.includes("Task 2 says it creates `output.json`"));
    assert.ok(issue.fullText.includes("Task 4 will fail"));
    assert.ok(issue.fullText.includes("Rename the output"));
  });

  // (d) extracts warning-severity issues
  it("extracts warning-severity issues", () => {
    const input = [
      "### Status",
      "",
      "**[Issues Found]**",
      "",
      "### Issues",
      "",
      "**[Warning] — Task 7: Large task scope**",
      "- **What:** Task 7 touches 5 files and produces over 500 lines of output.",
      "- **Why it matters:** The task may be too large for a single worker and could time out.",
      "- **Recommendation:** Consider splitting into two tasks: one for the model layer and one for the controller.",
      "",
      "### Summary",
      "",
      "One warning found.",
    ].join("\n");

    const result = parseReviewOutput(input);

    assert.equal(result.issues.length, 1);
    const issue = result.issues[0];
    assert.equal(issue.severity, "warning");
    assert.equal(issue.taskNumber, 7);
    assert.equal(issue.shortDescription, "Large task scope");
  });

  // (e) extracts suggestion-severity issues
  it("extracts suggestion-severity issues", () => {
    const input = [
      "### Status",
      "",
      "**[Approved]**",
      "",
      "### Issues",
      "",
      "**[Suggestion] — Task 1: Add error handling example**",
      "- **What:** Task 1 could include an example of how to handle validation errors.",
      "- **Why it matters:** It would make the acceptance criteria more concrete.",
      "- **Recommendation:** Add a sample error response in the task description.",
      "",
      "### Summary",
      "",
      "Approved with one suggestion.",
    ].join("\n");

    const result = parseReviewOutput(input);

    assert.equal(result.status, "approved");
    assert.equal(result.issues.length, 1);
    const issue = result.issues[0];
    assert.equal(issue.severity, "suggestion");
    assert.equal(issue.taskNumber, 1);
    assert.equal(issue.shortDescription, "Add error handling example");
  });

  // (f) handles mixed severities in single review
  it("handles mixed severities in single review", () => {
    const input = [
      "### Status",
      "",
      "**[Issues Found]**",
      "",
      "### Issues",
      "",
      "**[Error] — Task 3: Missing dependency**",
      "- **What:** Task 3 depends on Task 1 output but doesn't declare it.",
      "- **Why it matters:** Execution order may be wrong.",
      "- **Recommendation:** Add dependency.",
      "",
      "**[Warning] — Task 5: Vague criteria**",
      "- **What:** Acceptance criteria say \"works correctly\" without specifics.",
      "- **Why it matters:** Hard to verify.",
      "- **Recommendation:** Add measurable criteria.",
      "",
      "**[Suggestion] — Task 8: Consider caching**",
      "- **What:** Task 8 reads the same file multiple times.",
      "- **Why it matters:** Performance could be improved.",
      "- **Recommendation:** Cache the file contents.",
      "",
      "### Summary",
      "",
      "Found 1 error, 1 warning, and 1 suggestion.",
    ].join("\n");

    const result = parseReviewOutput(input);

    assert.equal(result.status, "issues_found");
    assert.equal(result.issues.length, 3);
    assert.equal(result.issues[0].severity, "error");
    assert.equal(result.issues[0].taskNumber, 3);
    assert.equal(result.issues[1].severity, "warning");
    assert.equal(result.issues[1].taskNumber, 5);
    assert.equal(result.issues[2].severity, "suggestion");
    assert.equal(result.issues[2].taskNumber, 8);
  });

  // (g) handles issues without task numbers (general issues)
  it("handles issues without task numbers (general issues)", () => {
    const input = [
      "### Status",
      "",
      "**[Issues Found]**",
      "",
      "### Issues",
      "",
      "**[Error] — Missing overall architecture diagram**",
      "- **What:** The plan lacks a high-level architecture overview.",
      "- **Why it matters:** Workers won't understand how pieces fit together.",
      "- **Recommendation:** Add an architecture section at the top of the plan.",
      "",
      "### Summary",
      "",
      "One general error found.",
    ].join("\n");

    const result = parseReviewOutput(input);

    assert.equal(result.issues.length, 1);
    const issue = result.issues[0];
    assert.equal(issue.severity, "error");
    assert.equal(issue.taskNumber, null);
    assert.equal(issue.shortDescription, "Missing overall architecture diagram");
  });

  // (h) handles malformed review output gracefully
  it("handles malformed review output gracefully", () => {
    const input = "This is not a valid review output at all. Just some random text.";

    const result = parseReviewOutput(input);

    assert.equal(result.status, "issues_found");
    assert.equal(result.issues.length, 1);
    assert.equal(result.issues[0].severity, "error");
    assert.equal(result.issues[0].taskNumber, null);
    assert.equal(result.issues[0].shortDescription, "Failed to parse review output");
    assert.ok(result.issues[0].fullText.length > 0);
    assert.equal(result.rawOutput, input);
  });

  // (i) returns synthetic parse-error issue when status is Issues Found but issue blocks are malformed
  it("returns synthetic parse-error issue when status is Issues Found but issue blocks are malformed", () => {
    const input = [
      "### Status",
      "",
      "**[Issues Found]**",
      "",
      "### Issues",
      "",
      "There are some problems with the plan but I forgot to use the proper format.",
      "Task 3 has a missing dependency and Task 5 is vague.",
      "",
      "### Summary",
      "",
      "Fix the issues above.",
    ].join("\n");

    const result = parseReviewOutput(input);

    assert.equal(result.status, "issues_found");
    assert.equal(result.issues.length, 1);
    assert.equal(result.issues[0].severity, "error");
    assert.equal(result.issues[0].taskNumber, null);
    assert.equal(result.issues[0].shortDescription, "Failed to parse review issues");
    assert.ok(result.issues[0].fullText.includes("some problems with the plan"));
    assert.ok(result.issues[0].fullText.includes("Task 3 has a missing dependency"));
  });

  // (j) parses a realistic review output matching plan-reviewer.md format
  it("parses a realistic review output matching the plan-reviewer.md format", () => {
    const input = [
      "### Status",
      "",
      "**[Issues Found]**",
      "",
      "### Issues",
      "",
      "**[Error] — Task 3: Undeclared dependency on Task 1 output**",
      "- **What:** Task 3 reads `agent/lib/config.ts` which is created by Task 1, but Task 3 does not list Task 1 as a dependency.",
      "- **Why it matters:** If tasks run in parallel or out of order, Task 3 will fail with ENOENT because `config.ts` does not yet exist.",
      "- **Recommendation:** Add `depends_on: [1]` to Task 3's frontmatter.",
      "",
      "**[Warning] — Task 6: Acceptance criteria are too vague**",
      "- **What:** Task 6's acceptance criteria state \"integration tests pass\" without specifying which tests or what they verify.",
      "- **Why it matters:** The executing agent may write superficial tests that technically pass but don't validate the intended behavior.",
      "- **Recommendation:** Specify: \"integration test covers the full request lifecycle: client sends POST /users, server validates input, persists to DB, and returns 201 with the created user object.\"",
      "",
      "**[Suggestion] — Task 2: Consider extracting shared types**",
      "- **What:** Task 2 defines `UserInput` and `UserOutput` inline. Task 4 also needs these types.",
      "- **Why it matters:** Duplicating type definitions creates a maintenance burden and risks drift.",
      "- **Recommendation:** Create a shared `types.ts` in Task 2 and have Task 4 import from it.",
      "",
      "**[Error] — Spec coverage gap: rate limiting not addressed**",
      "- **What:** The original spec requires rate limiting on the POST /users endpoint, but no task implements it.",
      "- **Why it matters:** The delivered feature will be missing a required capability.",
      "- **Recommendation:** Add a new task (e.g., Task 8) to implement rate limiting middleware and apply it to the relevant routes.",
      "",
      "### Summary",
      "",
      "The plan covers most of the spec but has 2 errors that must be fixed: an undeclared dependency (Task 3 → Task 1) and a missing rate-limiting task. There is also 1 warning about vague acceptance criteria in Task 6 and 1 suggestion to extract shared types. Fix the errors before proceeding with execution.",
    ].join("\n");

    const result = parseReviewOutput(input);

    assert.equal(result.status, "issues_found");
    assert.equal(result.issues.length, 4);
    assert.equal(result.rawOutput, input);

    // First issue: Error with task number
    assert.equal(result.issues[0].severity, "error");
    assert.equal(result.issues[0].taskNumber, 3);
    assert.equal(result.issues[0].shortDescription, "Undeclared dependency on Task 1 output");
    assert.ok(result.issues[0].fullText.includes("agent/lib/config.ts"));
    assert.ok(result.issues[0].fullText.includes("ENOENT"));
    assert.ok(result.issues[0].fullText.includes("depends_on: [1]"));

    // Second issue: Warning with task number
    assert.equal(result.issues[1].severity, "warning");
    assert.equal(result.issues[1].taskNumber, 6);
    assert.equal(result.issues[1].shortDescription, "Acceptance criteria are too vague");

    // Third issue: Suggestion with task number
    assert.equal(result.issues[2].severity, "suggestion");
    assert.equal(result.issues[2].taskNumber, 2);
    assert.equal(result.issues[2].shortDescription, "Consider extracting shared types");

    // Fourth issue: Error without task number (general)
    assert.equal(result.issues[3].severity, "error");
    assert.equal(result.issues[3].taskNumber, null);
    assert.equal(result.issues[3].shortDescription, "Spec coverage gap: rate limiting not addressed");
    assert.ok(result.issues[3].fullText.includes("rate limiting"));
  });
});
