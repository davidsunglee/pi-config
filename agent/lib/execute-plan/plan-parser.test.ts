import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parsePlan, validatePlan } from "./plan-parser.ts";
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

// ── Fixture for dependency validation testing ─────────────────────────────────

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

// ── Fixture missing required sections ────────────────────────────────────────

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
});

describe("validatePlan", () => {
  it("(h) validation fails if header is missing goal", () => {
    const plan = parsePlan(FIXTURE_MISSING_GOAL, "missing-goal.md");
    const result = validatePlan(plan);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => /goal/i.test(e)), `Expected goal error, got: ${JSON.stringify(result.errors)}`);
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

describe("parsePlan - real plan snapshot", () => {
  // Step 6: Test against an inline snapshot of a real plan (the git-guardrails plan)
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

    // Validation passes
    const result = validatePlan(plan);
    assert.equal(result.valid, true, `Errors: ${JSON.stringify(result.errors)}`);
  });
});
