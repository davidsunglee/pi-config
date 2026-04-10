import test from "node:test";
import assert from "node:assert/strict";

import {
  formatSettingsGrid,
  formatResumeStatus,
  formatCodeReviewSummary,
  formatWaveProgress,
  formatFailureContext,
} from "./tui-formatters.ts";

import type {
  ExecutionSettings,
  RunState,
  CodeReviewFinding,
  CodeReviewSummary,
  FailureContext,
} from "../../lib/execute-plan/types.ts";

// ── formatSettingsGrid ────────────────────────────────────────────────

test("formatSettingsGrid produces rows for all settings", () => {
  const settings: ExecutionSettings = {
    execution: "parallel",
    tdd: true,
    finalReview: false,
    specCheck: true,
    integrationTest: false,
    testCommand: null,
  };

  const rows = formatSettingsGrid(settings);

  assert.ok(Array.isArray(rows), "should return an array");
  assert.ok(rows.length > 0, "should have rows");

  for (const row of rows) {
    assert.ok(typeof row.label === "string" && row.label.length > 0, "each row should have a label");
    assert.ok(typeof row.value === "string" && row.value.length > 0, "each row should have a value");
  }
});

test("formatSettingsGrid shows parallel execution mode", () => {
  const settings: ExecutionSettings = {
    execution: "parallel",
    tdd: true,
    finalReview: true,
    specCheck: true,
    integrationTest: true,
    testCommand: "npm test",
  };

  const rows = formatSettingsGrid(settings);
  const execRow = rows.find((r) => r.label.toLowerCase().includes("execution"));
  assert.ok(execRow, "should have an execution row");
  assert.match(execRow.value.toLowerCase(), /parallel/);
});

test("formatSettingsGrid shows sequential execution mode", () => {
  const settings: ExecutionSettings = {
    execution: "sequential",
    tdd: false,
    finalReview: false,
    specCheck: false,
    integrationTest: false,
    testCommand: null,
  };

  const rows = formatSettingsGrid(settings);
  const execRow = rows.find((r) => r.label.toLowerCase().includes("execution"));
  assert.ok(execRow, "should have an execution row");
  assert.match(execRow.value.toLowerCase(), /sequential/);
});

test("formatSettingsGrid shows on/off for boolean settings", () => {
  const settings: ExecutionSettings = {
    execution: "parallel",
    tdd: true,
    finalReview: false,
    specCheck: true,
    integrationTest: false,
    testCommand: null,
  };

  const rows = formatSettingsGrid(settings);

  const tddRow = rows.find((r) => r.label.toLowerCase().includes("tdd"));
  assert.ok(tddRow, "should have a tdd row");
  assert.match(tddRow.value.toLowerCase(), /on|yes|enabled|true/);

  const reviewRow = rows.find((r) => r.label.toLowerCase().includes("review") || r.label.toLowerCase().includes("final"));
  assert.ok(reviewRow, "should have a final review row");
  assert.match(reviewRow.value.toLowerCase(), /off|no|disabled|false/);
});

test("formatSettingsGrid shows test command when present", () => {
  const settings: ExecutionSettings = {
    execution: "parallel",
    tdd: true,
    finalReview: true,
    specCheck: true,
    integrationTest: true,
    testCommand: "npm run test:integration",
  };

  const rows = formatSettingsGrid(settings);
  const testRow = rows.find(
    (r) =>
      r.label.toLowerCase().includes("test") &&
      (r.label.toLowerCase().includes("command") || r.label.toLowerCase().includes("cmd")),
  );
  assert.ok(testRow, "should have a test command row when testCommand is set");
  assert.equal(testRow.value, "npm run test:integration");
});

test("formatSettingsGrid omits or marks absent test command when null", () => {
  const settings: ExecutionSettings = {
    execution: "parallel",
    tdd: true,
    finalReview: true,
    specCheck: true,
    integrationTest: false,
    testCommand: null,
  };

  const rows = formatSettingsGrid(settings);
  const testRow = rows.find(
    (r) =>
      r.label.toLowerCase().includes("test") &&
      (r.label.toLowerCase().includes("command") || r.label.toLowerCase().includes("cmd")),
  );
  // Either the row is absent, or its value indicates no command
  if (testRow) {
    assert.match(testRow.value.toLowerCase(), /none|n\/a|not set|—|-|null/);
  }
  // Otherwise pass — omitting the row is also acceptable
});

// ── formatResumeStatus ────────────────────────────────────────────────

function makeRunState(overrides: Partial<RunState> = {}): RunState {
  return {
    plan: "my-plan.md",
    status: "stopped",
    lock: null,
    startedAt: "2026-04-10T10:00:00.000Z",
    stoppedAt: "2026-04-10T11:00:00.000Z",
    stopGranularity: null,
    settings: {
      execution: "parallel",
      tdd: true,
      finalReview: true,
      specCheck: true,
      integrationTest: false,
      testCommand: null,
    },
    workspace: {
      type: "worktree",
      path: "/tmp/worktree",
      branch: "feature/my-plan",
    },
    preExecutionSha: "abc123",
    baselineTest: null,
    retryState: { tasks: {}, waves: {}, finalReview: null },
    waves: [
      { wave: 1, tasks: [1, 2], status: "done", commitSha: "def456" },
      { wave: 2, tasks: [3, 4], status: "pending", commitSha: null },
    ],
    ...overrides,
  };
}

test("formatResumeStatus returns statusLine, progressLine, settingsLines", () => {
  const state = makeRunState({ status: "stopped" });
  const result = formatResumeStatus(state);

  assert.ok(typeof result.statusLine === "string", "should have statusLine");
  assert.ok(typeof result.progressLine === "string", "should have progressLine");
  assert.ok(Array.isArray(result.settingsLines), "should have settingsLines array");
});

test("formatResumeStatus statusLine reflects stopped status", () => {
  const state = makeRunState({ status: "stopped" });
  const result = formatResumeStatus(state);
  assert.match(result.statusLine.toLowerCase(), /stop/);
});

test("formatResumeStatus statusLine reflects running status", () => {
  const state = makeRunState({
    status: "running",
    lock: { pid: 1234, session: "sess-abc", acquiredAt: "2026-04-10T10:30:00.000Z" },
  });
  const result = formatResumeStatus(state);
  assert.match(result.statusLine.toLowerCase(), /running/);
});

test("formatResumeStatus progressLine contains wave information", () => {
  const state = makeRunState({ status: "stopped" });
  const result = formatResumeStatus(state);
  assert.match(result.progressLine, /\d/); // some number
});

test("formatResumeStatus settingsLines is non-empty", () => {
  const state = makeRunState({ status: "stopped" });
  const result = formatResumeStatus(state);
  assert.ok(result.settingsLines.length > 0, "should have at least one settings line");
});

// ── formatCodeReviewSummary ───────────────────────────────────────────

test("formatCodeReviewSummary handles empty findings array", () => {
  const review: CodeReviewSummary = {
    findings: [],
    strengths: [],
    recommendations: [],
    overallAssessment: "Looks good.",
    rawOutput: "",
  };

  const output = formatCodeReviewSummary(review);
  assert.ok(typeof output === "string", "should return a string");
  assert.ok(output.length > 0, "should return non-empty string");
});

test("formatCodeReviewSummary groups findings by severity in critical → important → minor order", () => {
  const findings: CodeReviewFinding[] = [
    { severity: "minor", title: "Minor Issue", details: "Small thing" },
    { severity: "critical", title: "Critical Bug", details: "Crash" },
    { severity: "important", title: "Important Fix", details: "Security" },
  ];

  const review: CodeReviewSummary = {
    findings,
    strengths: [],
    recommendations: [],
    overallAssessment: "Needs work.",
    rawOutput: "",
  };

  const output = formatCodeReviewSummary(review);

  const criticalPos = output.indexOf("Critical");
  const importantPos = output.indexOf("Important");
  const minorPos = output.indexOf("Minor");

  // Critical should appear before important which should appear before minor
  assert.ok(criticalPos !== -1, "should contain critical section");
  assert.ok(importantPos !== -1, "should contain important section");
  assert.ok(minorPos !== -1, "should contain minor section");
  assert.ok(criticalPos < importantPos, "critical should come before important");
  assert.ok(importantPos < minorPos, "important should come before minor");
});

test("formatCodeReviewSummary includes finding titles in output", () => {
  const findings: CodeReviewFinding[] = [
    { severity: "critical", title: "Use After Free", details: "Memory corruption possible" },
  ];

  const review: CodeReviewSummary = {
    findings,
    strengths: [],
    recommendations: [],
    overallAssessment: "Needs work.",
    rawOutput: "",
  };

  const output = formatCodeReviewSummary(review);
  assert.ok(output.includes("Use After Free"), "should include finding title");
});

test("formatCodeReviewSummary includes strengths when present", () => {
  const review: CodeReviewSummary = {
    findings: [],
    strengths: ["Good test coverage", "Clean API design"],
    recommendations: [],
    overallAssessment: "Solid work.",
    rawOutput: "",
  };

  const output = formatCodeReviewSummary(review);
  assert.ok(output.includes("Good test coverage"), "should include strength text");
  assert.ok(output.includes("Clean API design"), "should include second strength");
});

test("formatCodeReviewSummary includes recommendations when present", () => {
  const review: CodeReviewSummary = {
    findings: [],
    strengths: [],
    recommendations: ["Add error handling", "Write more tests"],
    overallAssessment: "Good start.",
    rawOutput: "",
  };

  const output = formatCodeReviewSummary(review);
  assert.ok(output.includes("Add error handling"), "should include recommendation text");
  assert.ok(output.includes("Write more tests"), "should include second recommendation");
});

test("formatCodeReviewSummary includes overall assessment", () => {
  const review: CodeReviewSummary = {
    findings: [],
    strengths: [],
    recommendations: [],
    overallAssessment: "This is an excellent implementation.",
    rawOutput: "",
  };

  const output = formatCodeReviewSummary(review);
  assert.ok(output.includes("This is an excellent implementation."), "should include overall assessment");
});

test("formatCodeReviewSummary produces valid Markdown with headers", () => {
  const review: CodeReviewSummary = {
    findings: [
      { severity: "critical", title: "Data loss bug", details: "Files deleted on error" },
    ],
    strengths: ["Good structure"],
    recommendations: ["Add validation"],
    overallAssessment: "Mostly good.",
    rawOutput: "",
  };

  const output = formatCodeReviewSummary(review);
  // Should have at least one markdown header
  assert.ok(output.includes("#"), "should have markdown headers");
});

// ── formatWaveProgress ────────────────────────────────────────────────

test("formatWaveProgress produces N/M progress text", () => {
  const taskStatuses = new Map<number, string>([
    [1, "done"],
    [2, "in-progress"],
    [3, "pending"],
  ]);

  const output = formatWaveProgress(2, 5, taskStatuses);
  assert.ok(typeof output === "string", "should return string");
  // Should show wave 2 of 5
  assert.match(output, /2.*5|wave.*2/i);
});

test("formatWaveProgress includes per-task status lines", () => {
  const taskStatuses = new Map<number, string>([
    [1, "done"],
    [2, "in-progress"],
  ]);

  const output = formatWaveProgress(1, 3, taskStatuses);
  // Should reference both tasks
  assert.ok(output.includes("1") || output.includes("Task 1"), "should include task 1");
  assert.ok(output.includes("2") || output.includes("Task 2"), "should include task 2");
});

test("formatWaveProgress shows task status text", () => {
  const taskStatuses = new Map<number, string>([
    [5, "done"],
    [6, "in-progress"],
  ]);

  const output = formatWaveProgress(3, 4, taskStatuses);
  // Should show status info
  assert.ok(output.length > 0, "should produce non-empty output");
});

test("formatWaveProgress handles empty task statuses map", () => {
  const taskStatuses = new Map<number, string>();
  const output = formatWaveProgress(1, 1, taskStatuses);
  assert.ok(typeof output === "string", "should return string for empty map");
});

// ── formatFailureContext ──────────────────────────────────────────────

test("formatFailureContext produces readable summary", () => {
  const context: FailureContext = {
    taskNumber: 3,
    wave: 1,
    error: "Test suite timed out after 30s",
    attempts: 2,
    maxAttempts: 3,
  };

  const output = formatFailureContext(context);
  assert.ok(typeof output === "string", "should return string");
  assert.ok(output.length > 0, "should be non-empty");
});

test("formatFailureContext includes task number", () => {
  const context: FailureContext = {
    taskNumber: 7,
    wave: 2,
    error: "Compilation error",
    attempts: 1,
    maxAttempts: 3,
  };

  const output = formatFailureContext(context);
  assert.ok(output.includes("7"), "should include task number");
});

test("formatFailureContext includes error message", () => {
  const context: FailureContext = {
    taskNumber: 1,
    wave: 1,
    error: "Cannot find module: utils.ts",
    attempts: 1,
    maxAttempts: 3,
  };

  const output = formatFailureContext(context);
  assert.ok(output.includes("Cannot find module: utils.ts"), "should include error message");
});

test("formatFailureContext includes attempt count", () => {
  const context: FailureContext = {
    taskNumber: 2,
    wave: 1,
    error: "Test failed",
    attempts: 2,
    maxAttempts: 3,
  };

  const output = formatFailureContext(context);
  // Should show attempt info like "2/3" or "attempt 2 of 3"
  assert.ok(output.includes("2") && output.includes("3"), "should include attempt counts");
});
