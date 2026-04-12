import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parsePlan, validatePlan } from "./plan-parser.ts";

// ── Minimal fixture ─────────────────────────────────────────────────────────

const FIXTURE = `# Smoke Test Plan

## Goal

Verify re-exports work.

## Architecture Summary

Single module.

## Tech Stack

- TypeScript

## File Structure

- \`src/index.ts\` (Create) — Entry point

---

## Tasks

### Task 1: Setup

**Files:**
- Create: \`src/index.ts\`

**Steps:**
- [ ] **Step 1: Init** — Create file

**Acceptance criteria:**
- File exists

**Model recommendation:** cheap

---

## Dependencies

(none)

## Risk Assessment

Low risk.
`;

// ── Smoke tests — detailed coverage lives in plan-contract/ ─────────────────

describe("plan-parser re-exports", () => {
  it("parsePlan parses a plan via the shared library", () => {
    const plan = parsePlan(FIXTURE, "smoke.md");
    assert.equal(plan.fileName, "smoke.md");
    assert.equal(plan.tasks.length, 1);
    assert.match(plan.header.goal, /re-exports/);
  });

  it("validatePlan validates a plan via the shared library", () => {
    const plan = parsePlan(FIXTURE, "smoke.md");
    const result = validatePlan(plan);
    assert.equal(result.valid, true, `Unexpected errors: ${JSON.stringify(result.errors)}`);
    assert.deepEqual(result.errors, []);
  });
});
