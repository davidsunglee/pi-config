import type { Plan } from "./types.ts";

/**
 * Validate that a Plan has all required sections and valid dependency references.
 * Returns `{ valid: true, errors: [] }` if valid, or `{ valid: false, errors: [...] }`.
 */
export function validatePlan(plan: Plan): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Required section: goal
  if (!plan.header.goal.trim()) {
    errors.push("Missing required section: Goal");
  }

  // Required section: architecture summary
  if (!plan.header.architectureSummary.trim()) {
    errors.push("Missing required section: Architecture Summary");
  }

  // Required section: file structure
  if (plan.fileStructure.length === 0) {
    // Check if the section exists but has no entries, vs. section is absent
    const hasSection =
      /^##\s+File Structure\s*$/m.test(plan.rawContent);
    if (!hasSection) {
      errors.push("Missing required section: File Structure");
    } else {
      errors.push("Missing required section: File Structure (no entries found)");
    }
  }

  // Required section: tasks
  if (plan.tasks.length === 0) {
    const hasSection = /^##\s+Tasks\s*$/m.test(plan.rawContent);
    if (!hasSection) {
      errors.push("Missing required section: Tasks");
    } else {
      errors.push("Missing required section: Tasks (no tasks found)");
    }
  }

  // Required section: dependencies (section must exist in raw content)
  if (!/^##\s+Dependencies\s*$/m.test(plan.rawContent)) {
    errors.push("Missing required section: Dependencies");
  }

  // Required section: risk assessment
  if (!plan.risks.trim()) {
    errors.push("Missing required section: Risk Assessment");
  }

  // Validate dependency references point to existing task numbers
  if (errors.length === 0 || plan.tasks.length > 0) {
    const taskNumbers = new Set(plan.tasks.map(t => t.number));
    for (const [taskNum, depNums] of plan.dependencies) {
      for (const dep of depNums) {
        if (!taskNumbers.has(dep)) {
          errors.push(
            `Task ${taskNum} depends on Task ${dep}, but Task ${dep} does not exist`,
          );
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
