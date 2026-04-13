import type { ReviewIssue, RepairStrategy } from "./types.ts";

export function buildGenerationPrompt(params: {
  sourceText: string;
  sourceTodoId: string | null;
  cwd: string;
  outputPath: string;
}): string {
  const { sourceText, sourceTodoId, cwd, outputPath } = params;

  const lines: string[] = [];

  lines.push(
    `Analyze the codebase at ${cwd} and produce a structured implementation plan.`,
  );
  lines.push("");

  if (sourceTodoId != null) {
    lines.push(`Task (from TODO-${sourceTodoId}):`);
  } else {
    lines.push("Task:");
  }
  lines.push(sourceText);
  lines.push("");

  if (sourceTodoId != null) {
    lines.push(`Source todo: TODO-${sourceTodoId}`);
    lines.push("");
  }

  lines.push(`Write the plan to ${outputPath}.`);

  return lines.join("\n");
}

export function buildEditPrompt(params: {
  currentPlanContent: string;
  outputPath: string;
  findings: ReviewIssue[];
  validationErrors: string[];
  strategy: RepairStrategy;
}): string {
  const { currentPlanContent, outputPath, findings, validationErrors, strategy } =
    params;

  const lines: string[] = [];

  if (strategy === "targeted_edit") {
    lines.push("The following plan needs targeted edits to address review findings.");
    lines.push("");
    lines.push("## Current plan");
    lines.push("");
    lines.push(currentPlanContent);
    lines.push("");

    if (validationErrors.length > 0) {
      lines.push("## Validation errors");
      lines.push("");
      for (const error of validationErrors) {
        lines.push(`- ${error}`);
      }
      lines.push("");
    }

    lines.push("## Review findings");
    lines.push("");
    for (const finding of findings) {
      const taskLabel =
        finding.taskNumber != null ? `Task ${finding.taskNumber}` : "General";
      lines.push(
        `- **[${finding.severity}]** ${taskLabel}: ${finding.shortDescription}`,
      );
      lines.push(`  ${finding.fullText}`);
    }
    lines.push("");

    lines.push(
      `Please edit the plan in place at \`${outputPath}\` to address these findings — do not regenerate sections that are already correct.`,
    );
  } else {
    // partial_regen strategy
    const affectedSections = getAffectedSections(findings);

    lines.push(
      "The following plan needs partial regeneration. Specific sections must be regenerated to address review findings, while preserving all unaffected content.",
    );
    lines.push("");
    lines.push("## Current plan");
    lines.push("");
    lines.push(currentPlanContent);
    lines.push("");

    if (validationErrors.length > 0) {
      lines.push("## Validation errors");
      lines.push("");
      for (const error of validationErrors) {
        lines.push(`- ${error}`);
      }
      lines.push("");
    }

    lines.push("## Review findings");
    lines.push("");
    for (const finding of findings) {
      const taskLabel =
        finding.taskNumber != null ? `Task ${finding.taskNumber}` : "General";
      lines.push(
        `- **[${finding.severity}]** ${taskLabel}: ${finding.shortDescription}`,
      );
      lines.push(`  ${finding.fullText}`);
    }
    lines.push("");

    lines.push("## Sections to regenerate");
    lines.push("");
    for (const section of affectedSections) {
      lines.push(`- ${section}`);
    }
    lines.push("");

    lines.push(
      `Regenerate only the sections listed above and write the complete updated plan to \`${outputPath}\`. Preserve all other sections exactly as they are.`,
    );
  }

  return lines.join("\n");
}

function getAffectedSections(findings: ReviewIssue[]): string[] {
  const sections: string[] = [];
  const seen = new Set<string>();

  for (const finding of findings) {
    const label =
      finding.taskNumber != null ? `Task ${finding.taskNumber}` : "General";
    if (!seen.has(label)) {
      seen.add(label);
      sections.push(label);
    }
  }

  return sections;
}
