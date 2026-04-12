import type {
  Plan,
  PlanHeader,
  FileStructureEntry,
  PlanTask,
  PlanDependencies,
} from "./types.ts";

// ── Section extraction helpers ────────────────────────────────────────────────

/**
 * Extract text content between two `## Heading` markers.
 * Returns the trimmed content, or null if the heading is not found.
 */
function extractSection(content: string, heading: string): string | null {
  // Escape special regex chars in heading
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Match from ## Heading to the next ## heading (or end of string).
  // Use two separate patterns: find start, then find end manually.
  const startRe = new RegExp(`^##\\s+${escaped}\\s*$`, "m");
  const startMatch = startRe.exec(content);
  if (!startMatch) return null;

  const afterHeading = content.slice(startMatch.index + startMatch[0].length);
  // Find the next ## section (but not ###)
  const nextSectionRe = /^##\s/m;
  const nextMatch = nextSectionRe.exec(afterHeading);
  const sectionContent = nextMatch
    ? afterHeading.slice(0, nextMatch.index)
    : afterHeading;

  return sectionContent.trim();
}

/**
 * Extract the first section matching any of several heading aliases.
 */
function extractSectionAny(
  content: string,
  ...headings: string[]
): string | null {
  for (const h of headings) {
    const result = extractSection(content, h);
    if (result !== null) return result;
  }
  return null;
}

// ── Header parsing ────────────────────────────────────────────────────────────

function parseHeader(content: string): PlanHeader {
  const goal = extractSectionAny(content, "Goal") ?? "";
  const architectureSummary =
    extractSectionAny(content, "Architecture Summary", "Architecture") ?? "";
  const techStack = extractSectionAny(content, "Tech Stack") ?? "";
  return { goal, architectureSummary, techStack };
}

// ── File structure parsing ────────────────────────────────────────────────────

/**
 * Parse `## File Structure` section into FileStructureEntry[].
 *
 * Matches lines like:
 *   - `path/to/file` (Create|Modify) — description
 */
function parseFileStructure(content: string): FileStructureEntry[] {
  const section = extractSectionAny(content, "File Structure");
  if (!section) return [];

  const entries: FileStructureEntry[] = [];
  // Match: - `path` (Create|Modify) — description
  const lineRe =
    /^-\s+`([^`]+)`\s+\((Create|Modify)\)\s+[—–-]+\s+(.+)$/gm;

  let match: RegExpExecArray | null;
  while ((match = lineRe.exec(section)) !== null) {
    entries.push({
      path: match[1]!.trim(),
      action: match[2] as "Create" | "Modify",
      description: match[3]!.trim(),
    });
  }
  return entries;
}

// ── Task parsing ──────────────────────────────────────────────────────────────

/**
 * Extract all `### Task N: Title` blocks from the `## Tasks` section.
 */
function parseTasks(content: string): PlanTask[] {
  const tasksSection = extractSectionAny(content, "Tasks");
  if (!tasksSection) return [];

  const tasks: PlanTask[] = [];

  // Split on `### Task N:` — keep the delimiter so we can number them
  const taskBlockRe = /^###\s+Task\s+(\d+):\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  const positions: Array<{ number: number; title: string; start: number }> = [];

  while ((match = taskBlockRe.exec(tasksSection)) !== null) {
    positions.push({
      number: parseInt(match[1]!, 10),
      title: match[2]!.trim(),
      start: match.index,
    });
  }

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i]!;
    const end =
      i + 1 < positions.length ? positions[i + 1]!.start : tasksSection.length;
    const block = tasksSection.slice(pos.start, end);

    tasks.push(parseTaskBlock(pos.number, pos.title, block));
  }

  return tasks;
}

function parseTaskBlock(number: number, title: string, block: string): PlanTask {
  // ── Files ────────────────────────────────────────────────────────────────
  const create: string[] = [];
  const modify: string[] = [];
  const test: string[] = [];

  // Match "- Create: `path`", "- Modify: `path`", "- Test: `path`"
  const fileRe = /^-\s+(Create|Modify|Test):\s+`([^`]+)`/gm;
  let fm: RegExpExecArray | null;
  while ((fm = fileRe.exec(block)) !== null) {
    const action = fm[1]!;
    const path = fm[2]!.trim();
    if (action === "Create") create.push(path);
    else if (action === "Modify") modify.push(path);
    else if (action === "Test") test.push(path);
  }

  // ── Steps ────────────────────────────────────────────────────────────────
  const steps: string[] = [];
  // Match checkbox items: `- [ ] **Step N: Title** — details`
  const stepRe = /^-\s+\[ \]\s+\*\*([^*]+)\*\*(?:\s+[—–-]+\s+(.+))?$/gm;
  let sm: RegExpExecArray | null;
  while ((sm = stepRe.exec(block)) !== null) {
    const stepTitle = sm[1]!.trim();
    const details = sm[2]?.trim() ?? "";
    steps.push(details ? `${stepTitle} — ${details}` : stepTitle);
  }

  // ── Acceptance criteria ───────────────────────────────────────────────────
  const acceptanceCriteria: string[] = [];
  const acSection = extractSubsection(block, "Acceptance criteria");
  if (acSection) {
    const acRe = /^-\s+(.+)$/gm;
    let am: RegExpExecArray | null;
    while ((am = acRe.exec(acSection)) !== null) {
      acceptanceCriteria.push(am[1]!.trim());
    }
  }

  // ── Model recommendation ─────────────────────────────────────────────────
  let modelRecommendation: PlanTask["modelRecommendation"] = null;
  const modelRe =
    /^\*\*Model recommendation:\*\*\s*(cheap|standard|capable)\s*$/im;
  const mm = modelRe.exec(block);
  if (mm) {
    modelRecommendation = mm[1] as PlanTask["modelRecommendation"];
  }

  return {
    number,
    title,
    files: { create, modify, test },
    steps,
    acceptanceCriteria,
    modelRecommendation,
  };
}

/**
 * Extract text after a bold `**Heading:**` label within a block,
 * up to the next bold `**Capitalized` label or end of block.
 */
function extractSubsection(block: string, heading: string): string | null {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const startRe = new RegExp(`^\\*\\*${escaped}:\\*\\*\\s*$`, "im");
  const startMatch = startRe.exec(block);
  if (!startMatch) return null;

  const afterLabel = block.slice(startMatch.index + startMatch[0].length);
  // Stop at the next bold-heading line like `**Acceptance criteria:**`
  const nextLabelRe = /^\*\*[A-Z]/m;
  const nextMatch = nextLabelRe.exec(afterLabel);
  const subsectionContent = nextMatch
    ? afterLabel.slice(0, nextMatch.index)
    : afterLabel;

  return subsectionContent.trim();
}

// ── Dependencies parsing ──────────────────────────────────────────────────────

/**
 * Parse `## Dependencies` section into a Map<taskNumber, dependencyNumbers[]>.
 *
 * Handles lines like:
 *   - Task 2 depends on: Task 1
 *   - Task 3 depends on: Task 1, Task 2
 */
function parseDependencies(content: string): PlanDependencies {
  const deps: PlanDependencies = new Map();
  const section = extractSectionAny(content, "Dependencies");
  if (!section) return deps;

  const lineRe = /^-?\s*Task\s+(\d+)\s+depends\s+on:\s*(.+)$/gim;
  let match: RegExpExecArray | null;
  while ((match = lineRe.exec(section)) !== null) {
    const taskNum = parseInt(match[1]!, 10);
    const depsPart = match[2]!;
    const depNums: number[] = [];
    const taskRefRe = /Task\s+(\d+)/gi;
    let taskMatch: RegExpExecArray | null;
    while ((taskMatch = taskRefRe.exec(depsPart)) !== null) {
      depNums.push(parseInt(taskMatch[1]!, 10));
    }
    if (depNums.length > 0) {
      const existing = deps.get(taskNum) ?? [];
      deps.set(taskNum, [...existing, ...depNums]);
    }
  }
  return deps;
}

// ── Risks extraction ──────────────────────────────────────────────────────────

function parseRisks(content: string): string {
  return extractSectionAny(content, "Risk Assessment") ?? "";
}

// ── Test command extraction ───────────────────────────────────────────────────

/**
 * Extract the content of the bash fenced code block inside `## Test Command`.
 */
function parseTestCommand(content: string): string | null {
  const section = extractSectionAny(content, "Test Command");
  if (!section) return null;

  // Extract content of ```bash ... ``` block
  const codeRe = /```(?:bash)?\s*\n([\s\S]*?)```/;
  const match = codeRe.exec(section);
  if (!match) return null;
  return match[1]!.trim();
}

// ── Source todo extraction ────────────────────────────────────────────────────

/**
 * Extract TODO id from `**Source:** \`TODO-<id>\`` anywhere in the document.
 */
function parseSourceTodoId(content: string): string | null {
  // Try backticked form first, then plain form
  const backticked = /\*\*Source:\*\*\s+`TODO-([a-f0-9]+)`/i;
  const plain = /\*\*Source:\*\*\s+TODO-([a-f0-9]+)/i;
  const match = backticked.exec(content) ?? plain.exec(content);
  return match ? match[1]! : null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse a plan markdown file into a structured Plan object.
 */
export function parsePlan(content: string, fileName: string): Plan {
  return {
    header: parseHeader(content),
    fileStructure: parseFileStructure(content),
    tasks: parseTasks(content),
    dependencies: parseDependencies(content),
    risks: parseRisks(content),
    testCommand: parseTestCommand(content),
    rawContent: content,
    sourceTodoId: parseSourceTodoId(content),
    fileName,
  };
}
