# Shared Plan-Contract Library — Implementation Plan (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract plan types, parsing, and validation from execute-plan into a shared plan-contract library, then refactor execute-plan to consume it.

**Architecture:** The plan-contract types (`Plan`, `PlanHeader`, `FileStructureEntry`, `PlanTask`, `PlanDependencies`) and the functions `parsePlan` and `validatePlan` currently live in `agent/lib/execute-plan/types.ts` and `agent/lib/execute-plan/plan-parser.ts`. These are pure data definitions and pure functions with no dependencies on the execution engine. They will be moved to a new `agent/lib/plan-contract/` directory with three files: `types.ts` (plan data types only), `parser.ts` (the `parsePlan` function), and `validator.ts` (the `validatePlan` function). The original files in `execute-plan/` will be updated to re-export from the shared library so that all existing consumers (engine, wave-computation, template-filler, index barrel, extension layer) continue to work without import changes. A new `agent/lib/plan-contract/index.ts` barrel will export the full public API of the shared library.

**Tech Stack:** TypeScript (ESM, .ts extension imports), Node.js built-in test runner (node:test, node:assert/strict), --experimental-strip-types

**Source:** `TODO-d68082f8`

---

## File Structure

### Shared Library (New)
- `agent/lib/plan-contract/types.ts` (Create) — Plan data types extracted from execute-plan/types.ts
- `agent/lib/plan-contract/parser.ts` (Create) — Plan markdown parser (parsePlan function)
- `agent/lib/plan-contract/validator.ts` (Create) — Plan structural validator (validatePlan function)
- `agent/lib/plan-contract/index.ts` (Create) — Barrel re-exports for the shared library
- `agent/lib/plan-contract/parser.test.ts` (Create) — Parser tests (migrated from execute-plan)
- `agent/lib/plan-contract/validator.test.ts` (Create) — Validator tests (migrated from execute-plan)

### Execute-Plan (Modified)
- `agent/lib/execute-plan/types.ts` (Modify) — Remove plan data types, import from plan-contract
- `agent/lib/execute-plan/plan-parser.ts` (Modify) — Replace implementation with re-exports from plan-contract
- `agent/lib/execute-plan/plan-parser.test.ts` (Modify) — Replace with thin re-export verification tests

---

## Tasks

### Task 1: Create plan-contract types

Extract the plan data types from `agent/lib/execute-plan/types.ts` into the new shared library location.

**Files:**
- Create: `agent/lib/plan-contract/types.ts`

**Steps:**

- [ ] **Step 1: Create the plan-contract directory** — Run `mkdir -p agent/lib/plan-contract`.

- [ ] **Step 2: Create `agent/lib/plan-contract/types.ts`** — Copy exactly the plan data types from `agent/lib/execute-plan/types.ts`. These are the types that define the plan format, not execution-specific types. The file must contain:

```typescript
// ── Plan data types ─────────────────────────────────────────────────

export interface PlanHeader {
  goal: string;
  architectureSummary: string;
  techStack: string;
}

export interface FileStructureEntry {
  path: string;
  action: "Create" | "Modify";
  description: string;
}

export interface PlanTask {
  number: number;
  title: string;
  files: {
    create: string[];
    modify: string[];
    test: string[];
  };
  steps: string[];
  acceptanceCriteria: string[];
  modelRecommendation: "cheap" | "standard" | "capable" | null;
}

/** Task number -> dependency task numbers. */
export type PlanDependencies = Map<number, number[]>;

export interface Plan {
  header: PlanHeader;
  fileStructure: FileStructureEntry[];
  tasks: PlanTask[];
  dependencies: PlanDependencies;
  risks: string;
  testCommand: string | null;
  rawContent: string;
  sourceTodoId: string | null;
  fileName: string;
}
```

- [ ] **Step 3: Verify the new file compiles** — Run:
```bash
node --experimental-strip-types -e "import { } from './agent/lib/plan-contract/types.ts'; console.log('types OK')"
```
Expected: `types OK`

- [ ] **Step 4: Commit** — `git add agent/lib/plan-contract/types.ts && git commit -m "feat(plan-contract): create shared plan data types"`

**Acceptance criteria:**
- `agent/lib/plan-contract/types.ts` exports `Plan`, `PlanHeader`, `FileStructureEntry`, `PlanTask`, `PlanDependencies`
- The types are byte-identical to the originals in execute-plan/types.ts (same field names, same shapes)
- The file compiles with `--experimental-strip-types`

**Model recommendation:** cheap

---

### Task 2: Create plan-contract parser

Move the `parsePlan` function and all its private helpers from `agent/lib/execute-plan/plan-parser.ts` into the shared library.

**Files:**
- Create: `agent/lib/plan-contract/parser.ts`
- Create: `agent/lib/plan-contract/parser.test.ts`

**Steps:**

- [ ] **Step 1: Create `agent/lib/plan-contract/parser.ts`** — Copy the entire contents of `agent/lib/execute-plan/plan-parser.ts` into this file, but with two changes: (a) update the type import to point at the local `./types.ts`, and (b) remove the `validatePlan` function (that goes in its own file in Task 3). The file must contain:

```typescript
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
```

- [ ] **Step 2: Create `agent/lib/plan-contract/parser.test.ts`** — Copy the `parsePlan` describe block and all supporting fixtures from `agent/lib/execute-plan/plan-parser.test.ts`. Update imports to point at the local `./parser.ts` and `./types.ts`. Do NOT include the `validatePlan` tests — those go in Task 3. The file must contain:

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parsePlan } from "./parser.ts";
import type { Plan } from "./types.ts";

// ── Test fixture ─────────────────────────────────────────────────────────────

const FIXTURE_PLAN = `# Execute Plan Extension

## Goal

Replace the monolithic execute-plan extension with a modular library architecture
that separates plan parsing, wave scheduling, and task dispatch into independent
units with clear interfaces and comprehensive test coverage.

## Architecture Summary

Three layers: (1) pure data layer with types and plan parser, (2) scheduling layer
with wave calculator and dependency resolver, (3) execution layer with task dispatcher
and engine. Each layer is independently testable with no side effects.

## Tech Stack

- **Language:** TypeScript
- **Runtime:** Node.js with --experimental-strip-types
- **Test runner:** node:test + node:assert/strict
- **Module system:** ESM with .ts imports

## File Structure

### Core Library
- \`agent/lib/execute-plan/types.ts\` (Create) — Shared type definitions
- \`agent/lib/execute-plan/plan-parser.ts\` (Create) — Plan parsing and validation

### Extension
- \`agent/extensions/execute-plan/index.ts\` (Modify) — Entry point wired to library

**Source:** \`TODO-0ecb4b31\`

---

## Tasks

### Task 1: Types

**Files:**
- Create: \`agent/lib/execute-plan/types.ts\`
- Test: \`agent/lib/execute-plan/types.test.ts\`

**Steps:**
- [ ] **Step 1: Define PlanHeader interface** — Add goal, architectureSummary, techStack fields
- [ ] **Step 2: Define PlanTask interface** — Add number, title, files, steps, acceptanceCriteria, modelRecommendation

**Acceptance criteria:**
- Types compile without errors
- All interfaces exported

**Model recommendation:** cheap

---

### Task 2: Parser

**Files:**
- Create: \`agent/lib/execute-plan/plan-parser.ts\`
- Test: \`agent/lib/execute-plan/plan-parser.test.ts\`

**Steps:**
- [ ] **Step 1: Write failing tests** — Create plan-parser.test.ts with tests for all parsing scenarios
- [ ] **Step 2: Implement parsePlan** — Parse markdown into Plan structure

**Acceptance criteria:**
- parsePlan correctly extracts all sections
- validatePlan returns errors for missing sections

**Model recommendation:** standard

---

## Dependencies

- Task 2 depends on: Task 1

## Risk Assessment

### 1. Regex fragility
**Risk:** Plan format changes break parser
**Mitigation:** Tests use realistic fixtures; format is stable

### 2. Large plans
**Risk:** Performance on very large plan files
**Mitigation:** Plans are small text files; not a concern

## Test Command

\`\`\`bash
node --experimental-strip-types --test agent/lib/execute-plan/plan-parser.test.ts
\`\`\`
`;

// ── Fixture without optional sections ────────────────────────────────────────

const FIXTURE_NO_OPTIONAL = `# Minimal Plan

## Goal

Do the minimal thing.

## Architecture Summary

Simple single-layer approach.

## Tech Stack

- **Language:** TypeScript

## File Structure

- \`agent/lib/foo/index.ts\` (Create) — Main module

---

## Tasks

### Task 1: Setup

**Files:**
- Create: \`agent/lib/foo/index.ts\`

**Steps:**
- [ ] **Step 1: Create file** — Write initial content

**Acceptance criteria:**
- File exists

**Model recommendation:** cheap

---

## Dependencies

\`\`\`
(none)
\`\`\`

## Risk Assessment

Low risk overall.
`;

const FIXTURE_NO_MODEL_REC = `# Plan With No Model Recommendation

## Goal

Do something.

## Architecture Summary

Some summary.

## Tech Stack

- TypeScript

## File Structure

- \`agent/lib/foo/index.ts\` (Create) — Module

---

## Tasks

### Task 1: Do Thing

**Files:**
- Create: \`agent/lib/foo/index.ts\`

**Steps:**
- [ ] **Step 1: Step** — Details

**Acceptance criteria:**
- Works

---

## Dependencies

(none)

## Risk Assessment

None.
`;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("parsePlan", () => {
  it("(a) extracts header with goal, architectureSummary, techStack", () => {
    const plan = parsePlan(FIXTURE_PLAN, "test-plan.md");
    assert.match(plan.header.goal, /Replace the monolithic execute-plan/);
    assert.match(plan.header.architectureSummary, /Three layers/);
    assert.match(plan.header.techStack, /TypeScript/);
    assert.match(plan.header.techStack, /Node\.js/);
  });

  it("(b) extracts file structure with Create/Modify entries and descriptions", () => {
    const plan = parsePlan(FIXTURE_PLAN, "test-plan.md");
    assert.ok(plan.fileStructure.length >= 3, "Should have at least 3 file structure entries");

    const typesEntry = plan.fileStructure.find(e => e.path === "agent/lib/execute-plan/types.ts");
    assert.ok(typesEntry, "Should find types.ts entry");
    assert.equal(typesEntry!.action, "Create");
    assert.match(typesEntry!.description, /Shared type definitions/);

    const indexEntry = plan.fileStructure.find(e => e.path === "agent/extensions/execute-plan/index.ts");
    assert.ok(indexEntry, "Should find index.ts entry");
    assert.equal(indexEntry!.action, "Modify");
    assert.match(indexEntry!.description, /Entry point/);
  });

  it("(c) extracts numbered tasks with files, steps, acceptance criteria, model recommendation", () => {
    const plan = parsePlan(FIXTURE_PLAN, "test-plan.md");
    assert.equal(plan.tasks.length, 2, "Should have 2 tasks");

    const task1 = plan.tasks[0]!;
    assert.equal(task1.number, 1);
    assert.match(task1.title, /Types/);
    assert.ok(task1.files.create.includes("agent/lib/execute-plan/types.ts"));
    assert.ok(task1.files.test.includes("agent/lib/execute-plan/types.test.ts"));
    assert.ok(task1.steps.length >= 2);
    assert.ok(task1.acceptanceCriteria.length >= 1);
    assert.equal(task1.modelRecommendation, "cheap");

    const task2 = plan.tasks[1]!;
    assert.equal(task2.number, 2);
    assert.match(task2.title, /Parser/);
    assert.ok(task2.files.create.includes("agent/lib/execute-plan/plan-parser.ts"));
    assert.equal(task2.modelRecommendation, "standard");
  });

  it("(d) extracts dependencies", () => {
    const plan = parsePlan(FIXTURE_PLAN, "test-plan.md");
    assert.ok(plan.dependencies instanceof Map);
    // Task 2 depends on Task 1
    const task2Deps = plan.dependencies.get(2);
    assert.ok(task2Deps, "Task 2 should have dependencies");
    assert.ok(task2Deps!.includes(1), "Task 2 should depend on Task 1");
  });

  it("(e) extracts risk assessment", () => {
    const plan = parsePlan(FIXTURE_PLAN, "test-plan.md");
    assert.ok(plan.risks.length > 0, "Should have non-empty risks");
    assert.match(plan.risks, /Regex fragility/);
  });

  it("(f) extracts optional test command from fenced bash code block", () => {
    const plan = parsePlan(FIXTURE_PLAN, "test-plan.md");
    assert.ok(plan.testCommand !== null, "Should have test command");
    assert.match(plan.testCommand!, /node --experimental-strip-types/);
    assert.match(plan.testCommand!, /plan-parser\.test\.ts/);
  });

  it("(g) extracts source todo id from **Source:** TODO-<id>", () => {
    const plan = parsePlan(FIXTURE_PLAN, "test-plan.md");
    assert.equal(plan.sourceTodoId, "0ecb4b31");
  });

  it("stores rawContent and fileName", () => {
    const plan = parsePlan(FIXTURE_PLAN, "test-plan.md");
    assert.equal(plan.fileName, "test-plan.md");
    assert.equal(plan.rawContent, FIXTURE_PLAN);
  });

  it("handles plan with no test command", () => {
    const plan = parsePlan(FIXTURE_NO_OPTIONAL, "minimal.md");
    assert.equal(plan.testCommand, null);
  });

  it("handles plan with no source todo", () => {
    const plan = parsePlan(FIXTURE_NO_OPTIONAL, "minimal.md");
    assert.equal(plan.sourceTodoId, null);
  });

  it("handles task with no model recommendation", () => {
    const plan = parsePlan(FIXTURE_NO_MODEL_REC, "no-model.md");
    assert.equal(plan.tasks.length, 1);
    assert.equal(plan.tasks[0]!.modelRecommendation, null);
  });

  it("handles empty dependencies section", () => {
    const plan = parsePlan(FIXTURE_NO_OPTIONAL, "minimal.md");
    assert.ok(plan.dependencies instanceof Map);
    assert.equal(plan.dependencies.size, 0);
  });

  it("supports ## Architecture (without 'Summary') as alias", () => {
    const content = FIXTURE_PLAN.replace("## Architecture Summary", "## Architecture");
    const plan = parsePlan(content, "test.md");
    assert.match(plan.header.architectureSummary, /Three layers/);
  });

  it("parses multi-dependency lines correctly", () => {
    const content = `# Multi-Dep Plan

## Goal

Test multi-dependency parsing.

## Architecture Summary

Simple.

## Tech Stack

- TypeScript

## File Structure

- \`a.ts\` (Create) — Module A
- \`b.ts\` (Create) — Module B
- \`c.ts\` (Create) — Module C

---

## Tasks

### Task 1: First

**Files:**
- Create: \`a.ts\`

**Steps:**
- [ ] **Step 1: Do A** — Details

**Acceptance criteria:**
- A works

**Model recommendation:** cheap

---

### Task 2: Second

**Files:**
- Create: \`b.ts\`

**Steps:**
- [ ] **Step 1: Do B** — Details

**Acceptance criteria:**
- B works

**Model recommendation:** cheap

---

### Task 3: Third

**Files:**
- Create: \`c.ts\`

**Steps:**
- [ ] **Step 1: Do C** — Details

**Acceptance criteria:**
- C works

**Model recommendation:** cheap

---

## Dependencies

- Task 3 depends on: Task 1, Task 2

## Risk Assessment

None.
`;
    const plan = parsePlan(content, "multi-dep.md");
    const deps = plan.dependencies.get(3);
    assert.ok(deps, "Task 3 should have dependencies");
    assert.deepEqual(deps!.sort((a, b) => a - b), [1, 2], "Task 3 should depend on Task 1 and Task 2");
  });

  it("parses sourceTodoId without backticks", () => {
    const content = FIXTURE_PLAN.replace(
      "**Source:** `TODO-0ecb4b31`",
      "**Source:** TODO-0ecb4b31",
    );
    const plan = parsePlan(content, "test.md");
    assert.equal(plan.sourceTodoId, "0ecb4b31");
  });
});

describe("parsePlan - real plan snapshot", () => {
  const REAL_PLAN = `# Git Guardrails

## Goal

Add high-signal git-related guardrails to the existing \`agent/extensions/guardrails.ts\` extension,
catching three classes of dangerous git operations: destructive local cleanup, history-rewriting
pushes, and direct pushes to protected branches. All three categories use soft-confirm so they
block in headless mode but are user-dismissable in UI mode.

## Architecture Summary

The guardrails extension registers a single \`tool_call\` handler via \`pi.on("tool_call", ...)\`.
For bash tool calls, the handler runs the command string through a sequence of checks. Each check
either returns a block/confirm result or \`undefined\` to continue. The new git guardrails slot into
this same pipeline as a new check function called \`checkGitGuardrails\`.

## Tech Stack

- **Language:** TypeScript (ESM, .ts extension imports)
- **Runtime:** Node.js built-in test runner (node:test, node:assert/strict)
- **Test runner:** npx tsx --test agent/extensions/guardrails.test.ts
- **Bundler:** None

## File Structure

### Core
- \`agent/extensions/guardrails.ts\` (Modify) — Add git guardrail patterns and checkGitGuardrails function
- \`agent/extensions/guardrails.test.ts\` (Modify) — Add comprehensive tests for git guardrail categories

---

## Tasks

### Task 1: Add git guardrail detection to guardrails.ts

**Files:**
- Modify: \`agent/extensions/guardrails.ts\`

**Steps:**
- [ ] **Step 1: Add pattern arrays** — Add three pattern arrays near existing dangerousCommands
- [ ] **Step 2: Create checkGitGuardrails function** — Add async function below checkBrowserGuardrails
- [ ] **Step 3: Wire into main handler** — Add git guardrail check between dangerousCommands loop and checkBrowserGuardrails

**Acceptance criteria:**
- Three categories of git commands are detected
- All use confirmDangerousCommand
- Ordinary git operations are not flagged

**Model recommendation:** cheap

---

### Task 2: Add comprehensive git guardrail tests

**Files:**
- Modify: \`agent/extensions/guardrails.test.ts\`

**Steps:**
- [ ] **Step 1: Add reset --hard tests** — Cover basic and variant cases
- [ ] **Step 2: Add git clean tests** — Cover various flag combinations
- [ ] **Step 3: Add force push tests** — Cover --force, --force-with-lease, -f
- [ ] **Step 4: Add protected branch tests** — Cover main, master, HEAD:main

**Acceptance criteria:**
- At least 3 positive tests per category
- At least 8 negative tests
- All original 52 tests still pass

**Model recommendation:** cheap

---

## Dependencies

- Task 2 depends on: Task 1

## Risk Assessment

### 1. Regex fragility
**Risk:** Pattern changes may cause false positives or miss edge cases.
**Mitigation:** Comprehensive negative tests included for common safe commands.

### 2. Flag parsing complexity
**Risk:** Combined short flags like -fdx may be hard to match correctly.
**Mitigation:** Pattern uses character class to match any order: -[a-zA-Z]*f[a-zA-Z]*d.

### 3. Piped constructs
**Risk:** Complex shell pipelines may evade detection.
**Mitigation:** Regex matches anywhere in command string, consistent with existing approach.

## Test Command

\`\`\`bash
npx tsx --test agent/extensions/guardrails.test.ts
\`\`\`
`;

  it("parses real plan with all sections", () => {
    const plan = parsePlan(REAL_PLAN, "2026-04-09-git-guardrails.md");
    assert.equal(plan.fileName, "2026-04-09-git-guardrails.md");

    // Header
    assert.match(plan.header.goal, /git-related guardrails/);
    assert.match(plan.header.architectureSummary, /tool_call/);
    assert.match(plan.header.techStack, /TypeScript/);

    // File structure
    assert.ok(plan.fileStructure.length >= 2);
    const guardrailsTs = plan.fileStructure.find(e => e.path === "agent/extensions/guardrails.ts");
    assert.ok(guardrailsTs, "Should have guardrails.ts entry");
    assert.equal(guardrailsTs!.action, "Modify");

    // Tasks
    assert.equal(plan.tasks.length, 2);
    assert.equal(plan.tasks[0]!.number, 1);
    assert.equal(plan.tasks[0]!.modelRecommendation, "cheap");
    assert.equal(plan.tasks[1]!.number, 2);
    assert.ok(plan.tasks[1]!.files.modify.includes("agent/extensions/guardrails.test.ts"));

    // Dependencies
    const deps2 = plan.dependencies.get(2);
    assert.ok(deps2?.includes(1));

    // Risks
    assert.match(plan.risks, /Regex fragility/);

    // Test command
    assert.ok(plan.testCommand !== null);
    assert.match(plan.testCommand!, /guardrails\.test\.ts/);
  });
});
```

- [ ] **Step 3: Run the parser tests** — Run:
```bash
node --experimental-strip-types --test agent/lib/plan-contract/parser.test.ts
```
Expected: all 16 tests pass (15 from `parsePlan` describe + 1 from `real plan snapshot` describe).

- [ ] **Step 4: Commit** — `git add agent/lib/plan-contract/parser.ts agent/lib/plan-contract/parser.test.ts && git commit -m "feat(plan-contract): add plan parser with full test coverage"`

**Acceptance criteria:**
- `parsePlan` is exported from `agent/lib/plan-contract/parser.ts`
- All 16 parser tests pass
- The parser produces identical output to the original `execute-plan/plan-parser.ts` for any input

**Model recommendation:** cheap

---

### Task 3: Create plan-contract validator

Move the `validatePlan` function from `agent/lib/execute-plan/plan-parser.ts` into its own file in the shared library.

**Files:**
- Create: `agent/lib/plan-contract/validator.ts`
- Create: `agent/lib/plan-contract/validator.test.ts`

**Steps:**

- [ ] **Step 1: Create `agent/lib/plan-contract/validator.ts`** — Extract the `validatePlan` function. It imports `Plan` from the local `./types.ts`. The file must contain:

```typescript
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
```

- [ ] **Step 2: Create `agent/lib/plan-contract/validator.test.ts`** — Copy the `validatePlan` describe block and all supporting fixtures from `agent/lib/execute-plan/plan-parser.test.ts`. Update imports to use `./parser.ts` for `parsePlan` and `./validator.ts` for `validatePlan`. The file must contain:

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parsePlan } from "./parser.ts";
import { validatePlan } from "./validator.ts";

// ── Test fixtures ─────────────────────────────────────────────────────────────

const FIXTURE_PLAN = `# Execute Plan Extension

## Goal

Replace the monolithic execute-plan extension with a modular library architecture
that separates plan parsing, wave scheduling, and task dispatch into independent
units with clear interfaces and comprehensive test coverage.

## Architecture Summary

Three layers: (1) pure data layer with types and plan parser, (2) scheduling layer
with wave calculator and dependency resolver, (3) execution layer with task dispatcher
and engine. Each layer is independently testable with no side effects.

## Tech Stack

- **Language:** TypeScript
- **Runtime:** Node.js with --experimental-strip-types
- **Test runner:** node:test + node:assert/strict
- **Module system:** ESM with .ts imports

## File Structure

### Core Library
- \`agent/lib/execute-plan/types.ts\` (Create) — Shared type definitions
- \`agent/lib/execute-plan/plan-parser.ts\` (Create) — Plan parsing and validation

### Extension
- \`agent/extensions/execute-plan/index.ts\` (Modify) — Entry point wired to library

**Source:** \`TODO-0ecb4b31\`

---

## Tasks

### Task 1: Types

**Files:**
- Create: \`agent/lib/execute-plan/types.ts\`
- Test: \`agent/lib/execute-plan/types.test.ts\`

**Steps:**
- [ ] **Step 1: Define PlanHeader interface** — Add goal, architectureSummary, techStack fields
- [ ] **Step 2: Define PlanTask interface** — Add number, title, files, steps, acceptanceCriteria, modelRecommendation

**Acceptance criteria:**
- Types compile without errors
- All interfaces exported

**Model recommendation:** cheap

---

### Task 2: Parser

**Files:**
- Create: \`agent/lib/execute-plan/plan-parser.ts\`
- Test: \`agent/lib/execute-plan/plan-parser.test.ts\`

**Steps:**
- [ ] **Step 1: Write failing tests** — Create plan-parser.test.ts with tests for all parsing scenarios
- [ ] **Step 2: Implement parsePlan** — Parse markdown into Plan structure

**Acceptance criteria:**
- parsePlan correctly extracts all sections
- validatePlan returns errors for missing sections

**Model recommendation:** standard

---

## Dependencies

- Task 2 depends on: Task 1

## Risk Assessment

### 1. Regex fragility
**Risk:** Plan format changes break parser
**Mitigation:** Tests use realistic fixtures; format is stable

### 2. Large plans
**Risk:** Performance on very large plan files
**Mitigation:** Plans are small text files; not a concern

## Test Command

\`\`\`bash
node --experimental-strip-types --test agent/lib/execute-plan/plan-parser.test.ts
\`\`\`
`;

const FIXTURE_BAD_DEPS = `# Bad Deps Plan

## Goal

Plan with invalid dependency reference.

## Architecture Summary

Simple.

## Tech Stack

- TypeScript

## File Structure

- \`agent/lib/foo/index.ts\` (Create) — Main module

---

## Tasks

### Task 1: Setup

**Files:**
- Create: \`agent/lib/foo/index.ts\`

**Steps:**
- [ ] **Step 1: Do thing** — Do it

**Acceptance criteria:**
- It works

**Model recommendation:** cheap

---

## Dependencies

- Task 1 depends on: Task 99

## Risk Assessment

None.
`;

const FIXTURE_MISSING_GOAL = `# Plan Without Goal

## Architecture Summary

Some summary.

## Tech Stack

- TypeScript

## File Structure

- \`agent/lib/foo/index.ts\` (Create) — Module

---

## Tasks

### Task 1: Do Thing

**Files:**
- Create: \`agent/lib/foo/index.ts\`

**Steps:**
- [ ] **Step 1: Step** — Details

**Acceptance criteria:**
- Works

**Model recommendation:** cheap

---

## Dependencies

(none)

## Risk Assessment

None.
`;

const FIXTURE_MISSING_FILE_STRUCTURE = `# Plan Without File Structure

## Goal

Do something.

## Architecture Summary

Some summary.

## Tech Stack

- TypeScript

---

## Tasks

### Task 1: Do Thing

**Files:**
- Create: \`agent/lib/foo/index.ts\`

**Steps:**
- [ ] **Step 1: Step** — Details

**Acceptance criteria:**
- Works

**Model recommendation:** cheap

---

## Dependencies

(none)

## Risk Assessment

None.
`;

const FIXTURE_MISSING_TASKS = `# Plan Without Tasks

## Goal

Do something.

## Architecture Summary

Some summary.

## Tech Stack

- TypeScript

## File Structure

- \`agent/lib/foo/index.ts\` (Create) — Module

## Dependencies

(none)

## Risk Assessment

None.
`;

const FIXTURE_MISSING_DEPS = `# Plan Without Dependencies

## Goal

Do something.

## Architecture Summary

Some summary.

## Tech Stack

- TypeScript

## File Structure

- \`agent/lib/foo/index.ts\` (Create) — Module

---

## Tasks

### Task 1: Do Thing

**Files:**
- Create: \`agent/lib/foo/index.ts\`

**Steps:**
- [ ] **Step 1: Step** — Details

**Acceptance criteria:**
- Works

**Model recommendation:** cheap

---

## Risk Assessment

None.
`;

const FIXTURE_MISSING_RISKS = `# Plan Without Risk Assessment

## Goal

Do something.

## Architecture Summary

Some summary.

## Tech Stack

- TypeScript

## File Structure

- \`agent/lib/foo/index.ts\` (Create) — Module

---

## Tasks

### Task 1: Do Thing

**Files:**
- Create: \`agent/lib/foo/index.ts\`

**Steps:**
- [ ] **Step 1: Step** — Details

**Acceptance criteria:**
- Works

**Model recommendation:** cheap

---

## Dependencies

(none)
`;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("validatePlan", () => {
  it("(h) validation fails if header is missing goal", () => {
    const plan = parsePlan(FIXTURE_MISSING_GOAL, "missing-goal.md");
    const result = validatePlan(plan);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => /goal/i.test(e)), `Expected goal error, got: ${JSON.stringify(result.errors)}`);
  });

  it("validation fails if architecture summary is missing", () => {
    const content = FIXTURE_PLAN.replace(/## Architecture Summary\n[\s\S]*?(?=\n## )/, "");
    const plan = parsePlan(content, "missing-arch.md");
    const result = validatePlan(plan);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => /architecture/i.test(e)), `Expected architecture error, got: ${JSON.stringify(result.errors)}`);
  });

  it("(i) validation fails if file structure section is missing", () => {
    const plan = parsePlan(FIXTURE_MISSING_FILE_STRUCTURE, "missing-fs.md");
    const result = validatePlan(plan);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => /file structure/i.test(e)), `Expected file structure error, got: ${JSON.stringify(result.errors)}`);
  });

  it("(j) validation fails if tasks section is missing", () => {
    const plan = parsePlan(FIXTURE_MISSING_TASKS, "missing-tasks.md");
    const result = validatePlan(plan);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => /tasks/i.test(e)), `Expected tasks error, got: ${JSON.stringify(result.errors)}`);
  });

  it("(k) validation fails if dependencies section is missing", () => {
    const plan = parsePlan(FIXTURE_MISSING_DEPS, "missing-deps.md");
    const result = validatePlan(plan);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => /dependenc/i.test(e)), `Expected dependencies error, got: ${JSON.stringify(result.errors)}`);
  });

  it("(l) validation fails if risk assessment is missing", () => {
    const plan = parsePlan(FIXTURE_MISSING_RISKS, "missing-risks.md");
    const result = validatePlan(plan);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => /risk/i.test(e)), `Expected risk error, got: ${JSON.stringify(result.errors)}`);
  });

  it("(m) validation passes for a complete plan with all 5 required sections", () => {
    const plan = parsePlan(FIXTURE_PLAN, "test-plan.md");
    const result = validatePlan(plan);
    assert.equal(result.valid, true, `Unexpected errors: ${JSON.stringify(result.errors)}`);
    assert.deepEqual(result.errors, []);
  });

  it("(n) validation fails if a dependency references a non-existent task number", () => {
    const plan = parsePlan(FIXTURE_BAD_DEPS, "bad-deps.md");
    const result = validatePlan(plan);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => /task 99/i.test(e)), `Expected task 99 ref error, got: ${JSON.stringify(result.errors)}`);
  });
});
```

- [ ] **Step 3: Run the validator tests** — Run:
```bash
node --experimental-strip-types --test agent/lib/plan-contract/validator.test.ts
```
Expected: all 8 tests pass.

- [ ] **Step 4: Commit** — `git add agent/lib/plan-contract/validator.ts agent/lib/plan-contract/validator.test.ts && git commit -m "feat(plan-contract): add plan validator with full test coverage"`

**Acceptance criteria:**
- `validatePlan` is exported from `agent/lib/plan-contract/validator.ts`
- All 8 validator tests pass
- Validation logic is byte-identical to the original in execute-plan/plan-parser.ts

**Model recommendation:** cheap

---

### Task 4: Create plan-contract barrel index

Create the barrel `index.ts` that exports the full public API of the shared library.

**Files:**
- Create: `agent/lib/plan-contract/index.ts`

**Steps:**

- [ ] **Step 1: Create `agent/lib/plan-contract/index.ts`** — The barrel re-exports types, parser, and validator. The file must contain:

```typescript
/**
 * plan-contract — Shared plan format library
 *
 * Defines the canonical plan contract consumed by both `generate-plan` and
 * `execute-plan`. A plan is a structured Markdown document with required
 * sections (Goal, Architecture Summary, File Structure, Tasks, Dependencies,
 * Risk Assessment) and optional sections (Tech Stack, Test Command, Source).
 *
 * Use `parsePlan` to parse plan Markdown into a typed `Plan` object, and
 * `validatePlan` to verify that all required sections are present and that
 * dependency references are valid.
 *
 * @module plan-contract
 */

// Types
export type {
  Plan,
  PlanHeader,
  FileStructureEntry,
  PlanTask,
  PlanDependencies,
} from "./types.ts";

// Parser
export { parsePlan } from "./parser.ts";

// Validator
export { validatePlan } from "./validator.ts";
```

- [ ] **Step 2: Verify the barrel compiles and exports are accessible** — Run:
```bash
node --experimental-strip-types -e "import { parsePlan, validatePlan } from './agent/lib/plan-contract/index.ts'; console.log('barrel OK', typeof parsePlan, typeof validatePlan)"
```
Expected: `barrel OK function function`

- [ ] **Step 3: Commit** — `git add agent/lib/plan-contract/index.ts && git commit -m "feat(plan-contract): add barrel index"`

**Acceptance criteria:**
- `agent/lib/plan-contract/index.ts` re-exports `parsePlan`, `validatePlan`, and all 5 plan types
- Importing from the barrel compiles and provides access to all exports
- The barrel includes a JSDoc module comment documenting the plan contract (required/optional sections, public API surface)

**Model recommendation:** cheap

---

### Task 5: Refactor execute-plan to consume plan-contract

Replace the plan-specific types and parser/validator implementations in `execute-plan/` with re-exports from the shared `plan-contract/` library. After this task, `execute-plan` has no unique copy of plan parsing or validation logic.

**Files:**
- Modify: `agent/lib/execute-plan/types.ts`
- Modify: `agent/lib/execute-plan/plan-parser.ts`
- Modify: `agent/lib/execute-plan/plan-parser.test.ts`

**Steps:**

- [ ] **Step 1: Update `agent/lib/execute-plan/types.ts`** — Remove the plan data type definitions (`PlanHeader`, `FileStructureEntry`, `PlanTask`, `PlanDependencies`, `Plan`) and replace them with re-exports from `plan-contract`. Keep all execution-specific types in place. The plan data types section (lines 66-105 in the current file) should be replaced with:

```typescript
// ── Plan data types (re-exported from shared plan-contract library) ──

export type {
  PlanHeader,
  FileStructureEntry,
  PlanTask,
  PlanDependencies,
  Plan,
} from "../plan-contract/types.ts";
```

All other types in the file (`ExecResult`, `ExecutionIO`, `WorkspaceChoice`, `WorkspaceInfo`, `ExecutionOutcome`, `Wave`, `ExecutionSettings`, `WaveState`, `LockInfo`, `BaselineTest`, `RetryRecord`, `RetryState`, `CancellationState`, `RunState`, `SubagentConfig`, `WorkerStatus`, `SubagentResult`, `ModelTiers`, `FailureContext`, `TestRegressionContext`, `CodeReviewFinding`, `CodeReviewSummary`, `JudgmentAction`, `JudgmentRequest`, `JudgmentResponse`, `ProgressEvent`, `EngineCallbacks`) remain unchanged.

- [ ] **Step 2: Update `agent/lib/execute-plan/plan-parser.ts`** — Replace the entire file with thin re-exports from the shared library:

```typescript
// Re-export plan parser and validator from shared plan-contract library.
// This file exists for backwards compatibility — all consumers within
// execute-plan already import from "./plan-parser.ts".

export { parsePlan } from "../plan-contract/parser.ts";
export { validatePlan } from "../plan-contract/validator.ts";
```

- [ ] **Step 3: Update `agent/lib/execute-plan/plan-parser.test.ts`** — Replace the full test suite with a thin smoke test that verifies the re-exports work. The detailed tests now live in `plan-contract/parser.test.ts` and `plan-contract/validator.test.ts`. The file must contain:

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parsePlan, validatePlan } from "./plan-parser.ts";

// ── Re-export smoke tests ──────────────────────────────────────────────────
//
// Full test coverage lives in agent/lib/plan-contract/parser.test.ts and
// agent/lib/plan-contract/validator.test.ts. These smoke tests verify that
// the re-exports from execute-plan/plan-parser.ts work correctly.

const SMOKE_PLAN = `# Smoke Test Plan

## Goal

Verify re-exports work.

## Architecture Summary

Simple.

## Tech Stack

- TypeScript

## File Structure

- \`src/index.ts\` (Create) — Main module

---

## Tasks

### Task 1: Setup

**Files:**
- Create: \`src/index.ts\`

**Steps:**
- [ ] **Step 1: Create file** — Write initial content

**Acceptance criteria:**
- File exists

**Model recommendation:** cheap

---

## Dependencies

(none)

## Risk Assessment

Low risk.
`;

describe("execute-plan/plan-parser re-exports", () => {
  it("parsePlan is re-exported and works", () => {
    const plan = parsePlan(SMOKE_PLAN, "smoke.md");
    assert.equal(plan.fileName, "smoke.md");
    assert.match(plan.header.goal, /Verify re-exports/);
    assert.equal(plan.tasks.length, 1);
    assert.equal(plan.tasks[0]!.number, 1);
  });

  it("validatePlan is re-exported and works", () => {
    const plan = parsePlan(SMOKE_PLAN, "smoke.md");
    const result = validatePlan(plan);
    assert.equal(result.valid, true, `Errors: ${JSON.stringify(result.errors)}`);
  });
});
```

- [ ] **Step 4: Verify `agent/lib/execute-plan/index.ts` still works** — The barrel in `index.ts` already re-exports from `./plan-parser.ts` and `./types.ts`, so no changes are needed to `index.ts` itself. The re-export chain is: `index.ts` -> `plan-parser.ts` -> `plan-contract/parser.ts` and `index.ts` -> `types.ts` -> `plan-contract/types.ts`. Verify by running:
```bash
node --experimental-strip-types -e "import { parsePlan, validatePlan } from './agent/lib/execute-plan/index.ts'; console.log('barrel OK', typeof parsePlan, typeof validatePlan)"
```
Expected: `barrel OK function function`

- [ ] **Step 5: Run all plan-contract tests** — Run:
```bash
node --experimental-strip-types --test agent/lib/plan-contract/parser.test.ts agent/lib/plan-contract/validator.test.ts
```
Expected: all 24 tests pass (16 parser + 8 validator).

- [ ] **Step 6: Run the execute-plan re-export smoke tests** — Run:
```bash
node --experimental-strip-types --test agent/lib/execute-plan/plan-parser.test.ts
```
Expected: 2 tests pass.

- [ ] **Step 7: Run the full execute-plan test suite** — Run:
```bash
node --experimental-strip-types --test agent/lib/execute-plan/*.test.ts
```
Expected: all existing tests pass. This verifies that `engine.ts`, `wave-computation.ts`, `template-filler.ts`, and all other modules that import from `./types.ts` or `./plan-parser.ts` still work via the re-export chain.

- [ ] **Step 8: Commit** — `git add agent/lib/execute-plan/types.ts agent/lib/execute-plan/plan-parser.ts agent/lib/execute-plan/plan-parser.test.ts && git commit -m "refactor(execute-plan): consume plan-contract shared library via re-exports"`

**Acceptance criteria:**
- `execute-plan/plan-parser.ts` contains only re-exports, no implementation code
- `execute-plan/types.ts` no longer defines plan data types, only re-exports them
- All existing execute-plan tests pass without modification (engine, wave-computation, template-filler, state-manager, etc.)
- The import chain `engine.ts -> ./plan-parser.ts -> ../plan-contract/parser.ts` works
- The import chain `engine.ts -> ./types.ts -> ../plan-contract/types.ts` works for plan types
- The import chain `index.ts -> ./types.ts -> ../plan-contract/types.ts` works for external consumers

**Model recommendation:** standard

---

### Task 6: Full integration verification

Run the complete test suite to verify nothing is broken, then run the extension-layer tests to confirm external consumers still work.

**Files:**
- Modify: `agent/lib/execute-plan/plan-parser.test.ts` (only if fixes needed)

**Steps:**

- [ ] **Step 1: Run the full agent test suite** — Run:
```bash
cd agent && npm test
```
Expected: all tests pass. This covers both the lib-level tests and the extension-level tests that import from `execute-plan/types.ts`. Uses `npm test` rather than the raw `node` command to avoid shell `globstar` portability issues with `**` patterns.

- [ ] **Step 2: Verify type correctness with TypeScript compiler** — Run:
```bash
cd agent && npx tsc --noEmit
```
Expected: no type errors.

- [ ] **Step 3: Verify import chains are correct** — Run a quick sanity check that the full import chain works end-to-end by importing from the extension-level entry point:
```bash
node --experimental-strip-types -e "
import { parsePlan, validatePlan } from './agent/lib/plan-contract/index.ts';
import { parsePlan as ep_parsePlan } from './agent/lib/execute-plan/plan-parser.ts';
import type { Plan } from './agent/lib/execute-plan/types.ts';
const plan = parsePlan('## Goal\n\nTest\n\n## Architecture Summary\n\nTest\n\n## Tech Stack\n\nTS\n\n## File Structure\n\n- \`a.ts\` (Create) — A\n\n## Tasks\n\n### Task 1: T\n\n**Files:**\n- Create: \`a.ts\`\n\n**Steps:**\n- [ ] **Step 1: S** — D\n\n**Acceptance criteria:**\n- OK\n\n**Model recommendation:** cheap\n\n## Dependencies\n\n(none)\n\n## Risk Assessment\n\nNone.', 'test.md');
const result = validatePlan(plan);
console.log('plan-contract:', result.valid);
const plan2 = ep_parsePlan('## Goal\n\nTest', 'test2.md');
console.log('execute-plan re-export:', plan2.header.goal === 'Test');
console.log('ALL OK');
"
```
Expected output:
```
plan-contract: true
execute-plan re-export: true
ALL OK
```

- [ ] **Step 4: Commit (only if fixes were needed)** — If any fixes were required in steps 1-3, commit them: `git add -A && git commit -m "fix(plan-contract): integration verification fixes"`

**Acceptance criteria:**
- Full agent test suite passes (all lib and extension tests)
- TypeScript compiler reports no type errors
- Import chains work from plan-contract, execute-plan, and extension layers
- No behavior changes from the pre-refactor state

**Model recommendation:** cheap

---

## Dependencies

- Task 2 depends on: Task 1
- Task 3 depends on: Task 1
- Task 4 depends on: Task 2, Task 3
- Task 5 depends on: Task 4
- Task 6 depends on: Task 5

## Risk Assessment

### 1. Re-export chain breakage
**Risk:** The re-export chain (`execute-plan/types.ts` -> `plan-contract/types.ts`) could break if TypeScript re-export semantics differ from direct exports for type-only exports.
**Mitigation:** TypeScript's `export type { ... } from "..."` is well-supported and the test suite explicitly verifies the chain. The approach matches patterns already used in the codebase (e.g., `execute-plan/index.ts` barrel).

### 2. Circular dependency
**Risk:** If `plan-contract` ever imports from `execute-plan`, it creates a circular dependency.
**Mitigation:** The dependency is strictly one-directional: `execute-plan` -> `plan-contract`. The shared library has zero imports from execute-plan and zero execution-specific types.

### 3. Test fixture duplication
**Risk:** The plan-contract tests duplicate the fixture strings from the original execute-plan tests.
**Mitigation:** This is intentional for Phase 1 — the plan-contract tests must be self-contained. The original execute-plan test file is reduced to a thin smoke test, so the duplication is temporary and bounded. A future cleanup could extract fixtures into a shared test-helpers file if needed.

### 4. Missed consumer
**Risk:** An import path outside the scanned set still references the old location directly.
**Mitigation:** The grep confirms no external consumers import `parsePlan`/`validatePlan` directly from `execute-plan/plan-parser.ts` — they all go through `execute-plan/index.ts` or `execute-plan/types.ts`. The re-export strategy ensures both paths continue to work.

## Test Command

```bash
cd agent && node --experimental-strip-types --experimental-test-coverage --test lib/plan-contract/*.test.ts lib/execute-plan/*.test.ts
```
