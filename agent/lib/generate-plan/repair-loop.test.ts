import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  issueKey,
  createRepairState,
  shouldRepair,
  selectStrategy,
  advanceCycle,
  isConverged,
  getRemainingFindings,
} from "./repair-loop.ts";
import type { ReviewIssue, ReviewResult, RepairCycleState } from "./types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIssue(overrides: Partial<ReviewIssue> = {}): ReviewIssue {
  return {
    severity: "error",
    taskNumber: 1,
    shortDescription: "Missing dependency",
    fullText: "Task 1 is missing a dependency on task 3.",
    ...overrides,
  };
}

function makeReview(overrides: Partial<ReviewResult> = {}): ReviewResult {
  return {
    status: "issues_found",
    issues: [makeIssue()],
    rawOutput: "review output",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// issueKey
// ---------------------------------------------------------------------------
describe("issueKey", () => {
  test("produces stable identity key from severity, taskNumber, and shortDescription", () => {
    const issue = makeIssue({ severity: "error", taskNumber: 3, shortDescription: "Bad task" });
    assert.equal(issueKey(issue), "error:3:Bad task");
  });

  test("uses 'general' when taskNumber is null", () => {
    const issue = makeIssue({ severity: "warning", taskNumber: null, shortDescription: "Unclear scope" });
    assert.equal(issueKey(issue), "warning:general:Unclear scope");
  });
});

// ---------------------------------------------------------------------------
// shouldRepair
// ---------------------------------------------------------------------------
describe("shouldRepair", () => {
  test("returns true when validation errors exist", () => {
    const state = createRepairState();
    const result = shouldRepair(state, ["missing header"], null);
    assert.equal(result, true);
  });

  test("returns true when review has error-severity issues", () => {
    const state = createRepairState();
    const review = makeReview({
      status: "issues_found",
      issues: [makeIssue({ severity: "error" })],
    });
    const result = shouldRepair(state, [], review);
    assert.equal(result, true);
  });

  test("returns false when review is approved with only warnings/suggestions", () => {
    const state = createRepairState();
    const review = makeReview({
      status: "approved",
      issues: [
        makeIssue({ severity: "warning" }),
        makeIssue({ severity: "suggestion" }),
      ],
    });
    const result = shouldRepair(state, [], review);
    assert.equal(result, false);
  });

  test("returns false when max cycles (10) exhausted", () => {
    const state: RepairCycleState = {
      ...createRepairState(),
      cycle: 10,
      maxCycles: 10,
    };
    const review = makeReview({
      status: "issues_found",
      issues: [makeIssue({ severity: "error" })],
    });
    const result = shouldRepair(state, [], review);
    assert.equal(result, false);
  });
});

// ---------------------------------------------------------------------------
// selectStrategy
// ---------------------------------------------------------------------------
describe("selectStrategy", () => {
  test("returns 'targeted_edit' when an issue has fewer than 2 consecutive edit failures", () => {
    const state: RepairCycleState = {
      ...createRepairState(),
      cycle: 1,
      issueTracker: {
        "error:1:Missing dependency": { firstSeenCycle: 0, consecutiveEditFailures: 1 },
      },
    };
    const issues = [makeIssue({ severity: "error", taskNumber: 1, shortDescription: "Missing dependency" })];
    assert.equal(selectStrategy(state, [], issues), "targeted_edit");
  });

  test("returns 'partial_regen' when the same issue persists through 2 consecutive edit cycles", () => {
    const state: RepairCycleState = {
      ...createRepairState(),
      cycle: 2,
      issueTracker: {
        "error:1:Missing dependency": { firstSeenCycle: 0, consecutiveEditFailures: 2 },
      },
    };
    const issues = [makeIssue({ severity: "error", taskNumber: 1, shortDescription: "Missing dependency" })];
    assert.equal(selectStrategy(state, [], issues), "partial_regen");
  });

  test("returns 'targeted_edit' for a newly introduced issue even if global cycle count is high", () => {
    const state: RepairCycleState = {
      ...createRepairState(),
      cycle: 7,
      issueTracker: {},
    };
    const issues = [makeIssue({ severity: "error", taskNumber: 5, shortDescription: "New problem" })];
    assert.equal(selectStrategy(state, [], issues), "targeted_edit");
  });
});

// ---------------------------------------------------------------------------
// advanceCycle
// ---------------------------------------------------------------------------
describe("advanceCycle", () => {
  test("increments cycle count and updates issueTracker for persisting/resolved/new issues", () => {
    const state: RepairCycleState = {
      ...createRepairState(),
      cycle: 1,
      issueTracker: {
        "error:1:Missing dependency": { firstSeenCycle: 0, consecutiveEditFailures: 1 },
        "warning:2:Old warning": { firstSeenCycle: 0, consecutiveEditFailures: 0 },
      },
    };

    // "Missing dependency" persists, "Old warning" is resolved, "New issue" is new
    const issues = [
      makeIssue({ severity: "error", taskNumber: 1, shortDescription: "Missing dependency" }),
      makeIssue({ severity: "error", taskNumber: 3, shortDescription: "New issue" }),
    ];

    const next = advanceCycle(state, [], issues);

    assert.equal(next.cycle, 2);

    // Persisting issue has incremented consecutiveEditFailures
    assert.equal(next.issueTracker["error:1:Missing dependency"].consecutiveEditFailures, 2);
    assert.equal(next.issueTracker["error:1:Missing dependency"].firstSeenCycle, 0);

    // Resolved issue is removed
    assert.equal(next.issueTracker["warning:2:Old warning"], undefined);

    // New issue is added with 1 (the edit cycle it appeared in already failed)
    assert.equal(next.issueTracker["error:3:New issue"].consecutiveEditFailures, 1);
    assert.equal(next.issueTracker["error:3:New issue"].firstSeenCycle, 2);
  });

  test("resets consecutiveEditFailures after partial regen resolves escalated issues", () => {
    const state: RepairCycleState = {
      ...createRepairState(),
      cycle: 3,
      strategy: "partial_regen",
      issueTracker: {
        "error:1:Stubborn bug": { firstSeenCycle: 0, consecutiveEditFailures: 3 },
      },
    };

    // The stubborn bug is gone, a new issue appeared
    const issues = [
      makeIssue({ severity: "error", taskNumber: 2, shortDescription: "Fresh issue" }),
    ];

    const next = advanceCycle(state, [], issues);

    // Old escalated issue is removed (resolved)
    assert.equal(next.issueTracker["error:1:Stubborn bug"], undefined);

    // New issue starts at 1 (the edit cycle it appeared in already failed)
    assert.equal(next.issueTracker["error:2:Fresh issue"].consecutiveEditFailures, 1);
    assert.equal(next.issueTracker["error:2:Fresh issue"].firstSeenCycle, 4);
  });
});

// ---------------------------------------------------------------------------
// getRemainingFindings
// ---------------------------------------------------------------------------
describe("getRemainingFindings", () => {
  test("returns all unresolved issues when max cycles exhausted", () => {
    const issues = [
      makeIssue({ severity: "error", shortDescription: "A" }),
      makeIssue({ severity: "warning", shortDescription: "B" }),
    ];
    const state: RepairCycleState = {
      ...createRepairState(),
      cycle: 10,
      maxCycles: 10,
      findings: issues,
      validationErrors: ["header missing"],
    };

    const remaining = getRemainingFindings(state);
    assert.equal(remaining.validationErrors.length, 1);
    assert.equal(remaining.validationErrors[0], "header missing");
    assert.equal(remaining.reviewIssues.length, 2);
    assert.equal(remaining.reviewIssues[0].shortDescription, "A");
  });
});

// ---------------------------------------------------------------------------
// isConverged
// ---------------------------------------------------------------------------
describe("isConverged", () => {
  test("returns true when no error-severity issues remain", () => {
    const review = makeReview({
      status: "approved",
      issues: [
        makeIssue({ severity: "warning" }),
        makeIssue({ severity: "suggestion" }),
      ],
    });
    assert.equal(isConverged([], review), true);
  });

  test("returns false when error-severity issues remain", () => {
    const review = makeReview({
      status: "issues_found",
      issues: [makeIssue({ severity: "error" })],
    });
    assert.equal(isConverged([], review), false);
  });

  test("returns false when validation errors remain", () => {
    assert.equal(isConverged(["bad header"], null), false);
  });

  test("returns true when no validation errors and no review", () => {
    assert.equal(isConverged([], null), true);
  });
});

// ---------------------------------------------------------------------------
// End-to-end scenario
// ---------------------------------------------------------------------------
describe("end-to-end repair loop scenario", () => {
  test("issue A escalates after 2 edit cycles, resolves via partial_regen, new issue B gets own 2-edit budget", () => {
    // --- Cycle 0: initial state, issue A appears ---
    let state = createRepairState();
    const issueA = makeIssue({ severity: "error", taskNumber: 1, shortDescription: "Issue A" });

    assert.equal(shouldRepair(state, [], makeReview({ status: "issues_found", issues: [issueA] })), true);
    assert.equal(selectStrategy(state, [], [issueA]), "targeted_edit");
    state = advanceCycle(state, [], [issueA]);
    assert.equal(state.cycle, 1);
    // New issue starts at 1 (the first edit attempt already failed)
    assert.equal(state.issueTracker["error:1:Issue A"].consecutiveEditFailures, 1);
    assert.equal(state.issueTracker["error:1:Issue A"].firstSeenCycle, 1);

    // --- Cycle 1: issue A persists after first edit → still targeted_edit (1 < 2) ---
    assert.equal(selectStrategy(state, [], [issueA]), "targeted_edit");
    state = advanceCycle(state, [], [issueA]);
    assert.equal(state.cycle, 2);
    assert.equal(state.issueTracker["error:1:Issue A"].consecutiveEditFailures, 2);

    // --- Cycle 2: issue A has 2 consecutive failures → escalates to partial_regen ---
    assert.equal(selectStrategy(state, [], [issueA]), "partial_regen");

    // --- Execute partial regen: resolves issue A, new issue B appears ---
    const issueB = makeIssue({ severity: "error", taskNumber: 2, shortDescription: "Issue B" });
    state = advanceCycle(state, [], [issueB]);
    assert.equal(state.cycle, 3);
    assert.equal(state.issueTracker["error:1:Issue A"], undefined); // resolved
    // New issue B starts at 1
    assert.equal(state.issueTracker["error:2:Issue B"].consecutiveEditFailures, 1);
    assert.equal(selectStrategy(state, [], [issueB]), "targeted_edit");

    // --- Cycle 3: issue B persists after first edit ---
    state = advanceCycle(state, [], [issueB]);
    assert.equal(state.cycle, 4);
    assert.equal(state.issueTracker["error:2:Issue B"].consecutiveEditFailures, 2);

    // --- Cycle 4: issue B has 2 consecutive failures → escalates ---
    assert.equal(selectStrategy(state, [], [issueB]), "partial_regen");
  });
});
