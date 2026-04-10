/**
 * Pure formatting helpers for the execute-plan TUI layer.
 * No side effects — all functions are synchronous and testable.
 */

import type {
  ExecutionSettings,
  RunState,
  CodeReviewFinding,
  CodeReviewSummary,
  FailureContext,
} from "../../lib/execute-plan/types.ts";

// ── formatSettingsGrid ────────────────────────────────────────────────

export interface SettingsRow {
  label: string;
  value: string;
}

/**
 * Maps ExecutionSettings to a list of label/value display rows.
 */
export function formatSettingsGrid(settings: ExecutionSettings): SettingsRow[] {
  const rows: SettingsRow[] = [];

  rows.push({
    label: "Execution",
    value: settings.execution === "parallel" ? "parallel" : "sequential",
  });

  rows.push({
    label: "TDD",
    value: settings.tdd ? "on" : "off",
  });

  rows.push({
    label: "Final Review",
    value: settings.finalReview ? "on" : "off",
  });

  rows.push({
    label: "Spec Check",
    value: settings.specCheck ? "on" : "off",
  });

  rows.push({
    label: "Integration Test",
    value: settings.integrationTest ? "on" : "off",
  });

  if (settings.testCommand !== null) {
    rows.push({
      label: "Test Command",
      value: settings.testCommand,
    });
  }

  return rows;
}

// ── formatResumeStatus ────────────────────────────────────────────────

export interface ResumeStatusDisplay {
  statusLine: string;
  progressLine: string;
  settingsLines: string[];
}

/**
 * Extracts display-ready status information from a RunState.
 */
export function formatResumeStatus(state: RunState): ResumeStatusDisplay {
  // Status line
  let statusLine: string;
  if (state.status === "running") {
    const pid = state.lock?.pid ?? "unknown";
    statusLine = `Running (pid ${pid})`;
  } else if (state.status === "stopped") {
    const stoppedAt = state.stoppedAt ? new Date(state.stoppedAt).toLocaleString() : "unknown time";
    statusLine = `Stopped at ${stoppedAt}`;
  } else {
    statusLine = `Completed`;
  }

  // Progress line: count done vs total waves
  const totalWaves = state.waves.length;
  const doneWaves = state.waves.filter((w) => w.status === "done").length;
  const inProgressWave = state.waves.find((w) => w.status === "in-progress");
  let progressLine: string;
  if (inProgressWave) {
    progressLine = `Wave ${inProgressWave.wave} in progress (${doneWaves}/${totalWaves} waves done)`;
  } else {
    progressLine = `${doneWaves}/${totalWaves} waves completed`;
  }

  // Settings lines: key: value pairs
  const settingsRows = formatSettingsGrid(state.settings);
  const settingsLines = settingsRows.map((r) => `${r.label}: ${r.value}`);

  return { statusLine, progressLine, settingsLines };
}

// ── formatCodeReviewSummary ───────────────────────────────────────────

const SEVERITY_ORDER: CodeReviewFinding["severity"][] = ["critical", "important", "minor"];

/**
 * Produces a Markdown string from a CodeReviewSummary.
 * Findings are grouped by severity in critical → important → minor order.
 */
export function formatCodeReviewSummary(review: CodeReviewSummary): string {
  const lines: string[] = [];

  lines.push("## Code Review Summary");
  lines.push("");

  // Overall assessment
  lines.push("### Overall Assessment");
  lines.push("");
  lines.push(review.overallAssessment);
  lines.push("");

  // Findings grouped by severity
  const grouped = new Map<CodeReviewFinding["severity"], CodeReviewFinding[]>();
  for (const severity of SEVERITY_ORDER) {
    grouped.set(severity, []);
  }
  for (const finding of review.findings) {
    const list = grouped.get(finding.severity);
    if (list) {
      list.push(finding);
    }
  }

  let hasFindingsSection = false;
  for (const severity of SEVERITY_ORDER) {
    const findings = grouped.get(severity) ?? [];
    if (findings.length === 0) continue;

    if (!hasFindingsSection) {
      lines.push("### Findings");
      lines.push("");
      hasFindingsSection = true;
    }

    const sectionTitle =
      severity === "critical"
        ? "Critical"
        : severity === "important"
          ? "Important"
          : "Minor";

    lines.push(`#### ${sectionTitle}`);
    lines.push("");

    for (const finding of findings) {
      lines.push(`**${finding.title}**`);
      if (finding.file) {
        lines.push(`_File: ${finding.file}_`);
      }
      lines.push(finding.details);
      lines.push("");
    }
  }

  if (review.findings.length === 0) {
    lines.push("### Findings");
    lines.push("");
    lines.push("_No findings._");
    lines.push("");
  }

  // Strengths
  if (review.strengths.length > 0) {
    lines.push("### Strengths");
    lines.push("");
    for (const strength of review.strengths) {
      lines.push(`- ${strength}`);
    }
    lines.push("");
  }

  // Recommendations
  if (review.recommendations.length > 0) {
    lines.push("### Recommendations");
    lines.push("");
    for (const rec of review.recommendations) {
      lines.push(`- ${rec}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ── formatWaveProgress ────────────────────────────────────────────────

/**
 * Produces a progress display string for a wave execution.
 */
export function formatWaveProgress(
  waveNumber: number,
  totalWaves: number,
  taskStatuses: Map<number, string>,
): string {
  const lines: string[] = [];

  lines.push(`Wave ${waveNumber}/${totalWaves}`);
  lines.push("");

  if (taskStatuses.size === 0) {
    lines.push("  No tasks");
  } else {
    for (const [taskNumber, status] of taskStatuses) {
      lines.push(`  Task ${taskNumber}: ${status}`);
    }
  }

  return lines.join("\n");
}

// ── formatFailureContext ──────────────────────────────────────────────

/**
 * Produces a readable failure summary from a FailureContext.
 */
export function formatFailureContext(context: FailureContext): string {
  const lines: string[] = [];

  lines.push(`Task ${context.taskNumber} failed (wave ${context.wave})`);
  lines.push(`Attempt ${context.attempts}/${context.maxAttempts}`);
  lines.push("");
  lines.push("Error:");
  lines.push(context.error);

  return lines.join("\n");
}
