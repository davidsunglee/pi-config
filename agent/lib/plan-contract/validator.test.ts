import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parsePlan } from "./parser.ts";
import { validatePlan } from "./validator.ts";

// ── Test fixtures ────────────────────────────────────────────────────────────

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
