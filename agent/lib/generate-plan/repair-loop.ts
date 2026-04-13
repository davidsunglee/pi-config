import type {
  ReviewIssue,
  ReviewResult,
  RepairStrategy,
  RepairCycleState,
  IssueTracker,
} from "./types.ts";

/**
 * Produces a stable identity key for a review issue.
 * Format: `"${severity}:${taskNumber ?? 'general'}:${shortDescription}"`
 */
export function issueKey(issue: ReviewIssue): string {
  const task = issue.taskNumber ?? "general";
  return `${issue.severity}:${task}:${issue.shortDescription}`;
}

/**
 * Produces a stable identity key for a validation error.
 * Prefixed with `"validation:"` to avoid collisions with review issue keys.
 */
export function validationErrorKey(error: string): string {
  return `validation:${error}`;
}

/**
 * Initialize a fresh repair cycle state.
 */
export function createRepairState(): RepairCycleState {
  return {
    cycle: 0,
    maxCycles: 10,
    strategy: "targeted_edit",
    findings: [],
    validationErrors: [],
    issueTracker: {},
  };
}

/**
 * Returns true if there are actionable problems (validation errors or
 * error-severity review issues) AND the cycle budget has not been exhausted.
 */
export function shouldRepair(
  state: RepairCycleState,
  validationErrors: string[],
  reviewResult: ReviewResult | null,
): boolean {
  if (state.cycle >= state.maxCycles) return false;

  if (validationErrors.length > 0) return true;

  if (reviewResult !== null) {
    const hasErrors = reviewResult.issues.some((i) => i.severity === "error");
    if (hasErrors) return true;
  }

  return false;
}

/**
 * Selects a repair strategy based on per-issue tracking.
 *
 * If any current issue has `consecutiveEditFailures >= 2` in the tracker,
 * returns `"partial_regen"`. Otherwise returns `"targeted_edit"`.
 *
 * New issues (not yet in the tracker) are always treated as targeted_edit
 * candidates regardless of the global cycle count.
 */
export function selectStrategy(
  state: RepairCycleState,
  validationErrors: string[],
  reviewIssues: ReviewIssue[],
): RepairStrategy {
  // Check review issues
  for (const issue of reviewIssues) {
    const key = issueKey(issue);
    const entry = state.issueTracker[key];
    if (entry && entry.consecutiveEditFailures >= 2) {
      return "partial_regen";
    }
  }

  // Check validation errors
  for (const error of validationErrors) {
    const key = validationErrorKey(error);
    const entry = state.issueTracker[key];
    if (entry && entry.consecutiveEditFailures >= 2) {
      return "partial_regen";
    }
  }

  return "targeted_edit";
}

/**
 * Advance the repair cycle, returning a new state with:
 * - Incremented cycle count
 * - Updated issueTracker: persisting issues get `consecutiveEditFailures`
 *   bumped, resolved issues are removed, new issues are added fresh.
 * - Updated findings and validationErrors snapshots.
 * - Updated strategy based on the new tracker state.
 */
export function advanceCycle(
  state: RepairCycleState,
  validationErrors: string[],
  reviewIssues: ReviewIssue[],
): RepairCycleState {
  const nextCycle = state.cycle + 1;
  const newTracker: IssueTracker = {};

  // Build set of current issue keys
  const currentKeys = new Set<string>();
  for (const issue of reviewIssues) {
    currentKeys.add(issueKey(issue));
  }
  for (const error of validationErrors) {
    currentKeys.add(validationErrorKey(error));
  }

  // Build set of previous cycle's issue keys (from state.findings and state.validationErrors)
  const previousCycleKeys = new Set<string>();
  for (const issue of state.findings) {
    previousCycleKeys.add(issueKey(issue));
  }
  for (const error of state.validationErrors) {
    previousCycleKeys.add(validationErrorKey(error));
  }

  // For each current issue, check if it existed in the previous tracker
  for (const key of currentKeys) {
    const prev = state.issueTracker[key];
    if (prev) {
      // Persisting issue — increment failure count
      newTracker[key] = {
        firstSeenCycle: prev.firstSeenCycle,
        consecutiveEditFailures: prev.consecutiveEditFailures + 1,
      };
    } else if (previousCycleKeys.has(key)) {
      // Issue existed in the previous cycle's findings but not in the tracker
      // (e.g., first cycle). It survived an edit → one failed edit.
      newTracker[key] = {
        firstSeenCycle: nextCycle,
        consecutiveEditFailures: 1,
      };
    } else {
      // Genuinely new issue — did not exist in the previous cycle at all.
      // Introduced by the edit, never been edited yet → start at 0.
      newTracker[key] = {
        firstSeenCycle: nextCycle,
        consecutiveEditFailures: 0,
      };
    }
  }
  // Issues not in currentKeys are implicitly removed (resolved)

  const nextState: RepairCycleState = {
    cycle: nextCycle,
    maxCycles: state.maxCycles,
    strategy: selectStrategy({ ...state, issueTracker: newTracker }, validationErrors, reviewIssues),
    findings: reviewIssues,
    validationErrors,
    issueTracker: newTracker,
  };

  return nextState;
}

/**
 * True if there are no validation errors and no error-severity review issues.
 */
export function isConverged(
  validationErrors: string[],
  reviewResult: ReviewResult | null,
): boolean {
  if (validationErrors.length > 0) return false;

  if (reviewResult !== null) {
    const hasErrors = reviewResult.issues.some((i) => i.severity === "error");
    if (hasErrors) return false;
  }

  return true;
}

/**
 * Returns the current unresolved findings from state, for surfacing to the
 * user when the repair loop is exhausted.
 */
export function getRemainingFindings(
  state: RepairCycleState,
): { validationErrors: string[]; reviewIssues: ReviewIssue[] } {
  return {
    validationErrors: state.validationErrors,
    reviewIssues: state.findings,
  };
}
