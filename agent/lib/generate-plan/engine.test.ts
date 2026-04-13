import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PlanGenerationEngine } from "./engine.ts";
import type {
  GenerationIO,
  GenerationCallbacks,
  GenerationInput,
  GenerationResult,
  SubagentDispatchConfig,
  SubagentOutput,
  ReviewResult,
} from "./types.ts";
import { basename } from "node:path";

// ── Valid plan content that passes parsePlan + validatePlan ────────────────

const VALID_PLAN = `# Test Plan

## Goal
Test goal

## Architecture Summary
Test architecture

## Tech Stack
TypeScript

## File Structure
- \`test.ts\` (Create) — Test file

## Tasks

### Task 1: Test task

**Files:**
- Create: \`test.ts\`

**Steps:**
- [ ] **Step 1** — Do the thing

**Acceptance criteria:**
- [ ] Works

**Model recommendation:** cheap

## Dependencies
- Task 1 has no dependencies

## Risk Assessment
No risks
`;

// A second valid plan with slightly different content (used to simulate
// the subagent writing fresh output during repair cycles).
const VALID_PLAN_V2 = `# Test Plan

## Goal
Test goal (revised)

## Architecture Summary
Test architecture

## Tech Stack
TypeScript

## File Structure
- \`test.ts\` (Create) — Test file

## Tasks

### Task 1: Test task

**Files:**
- Create: \`test.ts\`

**Steps:**
- [ ] **Step 1** — Do the thing

**Acceptance criteria:**
- [ ] Works

**Model recommendation:** cheap

## Dependencies
- Task 1 has no dependencies

## Risk Assessment
No risks
`;

const INVALID_PLAN = `# Bad Plan

Some text without required sections.
`;

const INVALID_PLAN_V2 = `# Bad Plan

Some text without required sections. (revised)
`;

// Plan with errors that reviewer will flag
const PLAN_WITH_REVIEW_ERRORS = VALID_PLAN; // structurally valid but review finds errors

// ── Approved review output ────────────────────────────────────────────────

const APPROVED_REVIEW_OUTPUT = `### Status
**[Approved]**

### Issues
No issues found.

### Summary
The plan looks great.
`;

const REVIEW_WITH_ERRORS_OUTPUT = `### Status
**[Issues Found]**

### Issues
**[Error] — Task 1: Missing test coverage**
- **What:** Task 1 lacks a test file.
- **Why it matters:** Tests are required.
- **Recommendation:** Add a test file.

### Summary
The plan has issues.
`;

const REVIEW_WITH_WARNINGS_OUTPUT = `### Status
**[Approved]**

### Issues
**[Warning] — Task 1: Consider edge cases**
- **What:** Edge cases not covered.
- **Why it matters:** May cause issues.
- **Recommendation:** Add edge case handling.

**[Suggestion] — General: Add documentation**
- **What:** No docs.
- **Why it matters:** Helps users.
- **Recommendation:** Add README.

### Summary
The plan is approved with some notes.
`;

// ── Settings JSON ─────────────────────────────────────────────────────────

const SETTINGS_JSON = JSON.stringify({
  modelTiers: {
    capable: "claude-opus",
    standard: "claude-sonnet",
    cheap: "claude-haiku",
    crossProvider: {
      capable: "gpt-4",
      standard: "gpt-3.5",
    },
  },
});

const SETTINGS_JSON_NO_CROSS = JSON.stringify({
  modelTiers: {
    capable: "claude-opus",
    standard: "claude-sonnet",
    cheap: "claude-haiku",
  },
});

// ── Review template ───────────────────────────────────────────────────────

const REVIEW_TEMPLATE =
  "Review the plan:\n{PLAN_CONTENTS}\n\nOriginal spec:\n{ORIGINAL_SPEC}";

// ── Mock factories ────────────────────────────────────────────────────────

interface MockIOOptions {
  planContent?: string;
  reviewOutput?: string;
  settingsJson?: string;
  reviewTemplate?: string;
  dispatchShouldThrow?: boolean;
  dispatchThrowOnModel?: string;
  secondDispatchOutput?: string;
  planContentSequence?: string[];
  dispatchOutputSequence?: SubagentOutput[];
  planFileExists?: boolean;
  /** Whether the plan file exists before the first dispatch (for snapshot).
   *  Defaults to false (file is new). */
  planFileExistsBefore?: boolean;
}

interface CallRecord {
  dispatchCalls: SubagentDispatchConfig[];
  readFileCalls: string[];
  writeFileCalls: Array<{ path: string; content: string }>;
  mkdirCalls: string[];
  readdirCalls: string[];
}

function createMockIO(opts: MockIOOptions = {}): {
  io: GenerationIO;
  calls: CallRecord;
} {
  const planContent = opts.planContent ?? VALID_PLAN;
  const settingsJson = opts.settingsJson ?? SETTINGS_JSON;
  const reviewTemplate = opts.reviewTemplate ?? REVIEW_TEMPLATE;
  const reviewOutput = opts.reviewOutput ?? APPROVED_REVIEW_OUTPUT;
  const planFileExists = opts.planFileExists ?? true;
  const planFileExistsBefore = opts.planFileExistsBefore ?? false;

  let planReadCount = 0;
  let dispatchCount = 0;
  let hasDispatched = false;

  const calls: CallRecord = {
    dispatchCalls: [],
    readFileCalls: [],
    writeFileCalls: [],
    mkdirCalls: [],
    readdirCalls: [],
  };

  const io: GenerationIO = {
    readFile: async (path: string) => {
      calls.readFileCalls.push(path);
      if (path.endsWith("settings.json")) {
        return settingsJson;
      }
      if (path.endsWith("plan-reviewer.md")) {
        return reviewTemplate;
      }
      // Plan file reads: support sequences
      if (path.includes(".pi/plans/") && !path.includes("reviews/")) {
        if (opts.planContentSequence) {
          const content =
            opts.planContentSequence[planReadCount] ??
            opts.planContentSequence[opts.planContentSequence.length - 1]!;
          planReadCount++;
          return content;
        }
        planReadCount++;
        return planContent;
      }
      return "";
    },
    writeFile: async (path: string, content: string) => {
      calls.writeFileCalls.push({ path, content });
    },
    fileExists: async (path: string) => {
      if (path.includes(".pi/plans/") && !path.includes("reviews/")) {
        // Before first dispatch, use planFileExistsBefore; after, use planFileExists
        return hasDispatched ? planFileExists : planFileExistsBefore;
      }
      return false;
    },
    mkdir: async (path: string) => {
      calls.mkdirCalls.push(path);
    },
    readdir: async (path: string) => {
      calls.readdirCalls.push(path);
      return [];
    },
    readTodo: async (todoId: string) => ({
      title: "Test Todo",
      body: `Body of todo ${todoId}`,
    }),
    dispatchSubagent: async (
      config: SubagentDispatchConfig,
    ): Promise<SubagentOutput> => {
      calls.dispatchCalls.push(config);
      hasDispatched = true;

      if (
        opts.dispatchShouldThrow &&
        opts.dispatchThrowOnModel &&
        config.model === opts.dispatchThrowOnModel
      ) {
        throw new Error("Dispatch failed");
      }

      if (opts.dispatchShouldThrow && !opts.dispatchThrowOnModel) {
        throw new Error("Dispatch failed");
      }

      if (opts.dispatchOutputSequence) {
        const output =
          opts.dispatchOutputSequence[dispatchCount] ??
          opts.dispatchOutputSequence[
            opts.dispatchOutputSequence.length - 1
          ]!;
        dispatchCount++;
        return output;
      }

      // plan-generator returns empty (it writes to disk)
      if (config.agent === "plan-generator") {
        return { text: "", exitCode: 0 };
      }
      // plan-reviewer returns review text
      if (config.agent === "plan-reviewer") {
        return { text: reviewOutput, exitCode: 0 };
      }

      return { text: "", exitCode: 0 };
    },
  };

  return { io, calls };
}

interface CallbackRecord {
  progressMessages: string[];
  warnings: string[];
  completions: GenerationResult[];
}

function createMockCallbacks(): {
  callbacks: GenerationCallbacks;
  record: CallbackRecord;
} {
  const record: CallbackRecord = {
    progressMessages: [],
    warnings: [],
    completions: [],
  };

  const callbacks: GenerationCallbacks = {
    onProgress: (msg: string) => {
      record.progressMessages.push(msg);
    },
    onWarning: (msg: string) => {
      record.warnings.push(msg);
    },
    onComplete: (result: GenerationResult) => {
      record.completions.push(result);
    },
  };

  return { callbacks, record };
}

const CWD = "/test/project";
const AGENT_DIR = "/test/agent";

// ── Tests ─────────────────────────────────────────────────────────────────

describe("PlanGenerationEngine", () => {
  // ───────────────────────────────────────────────────────────────────────
  // (a-c) Basic flow: resolve input, dispatch, read + validate
  // ───────────────────────────────────────────────────────────────────────

  describe("basic flow — resolve input, dispatch, read + validate", () => {
    it("(a) resolves freeform input and dispatches plan-generator", async () => {
      const { io, calls } = createMockIO();
      const { callbacks } = createMockCallbacks();
      const engine = new PlanGenerationEngine(io, CWD, AGENT_DIR);

      await engine.generate(
        { type: "freeform", text: "Build a REST API" },
        callbacks,
      );

      // plan-generator should be dispatched
      const genCall = calls.dispatchCalls.find(
        (c) => c.agent === "plan-generator",
      );
      assert.ok(genCall, "Should dispatch plan-generator");
      assert.ok(
        genCall.task.includes("Build a REST API"),
        "Prompt should include source text",
      );
    });

    it("(b) resolves todo input correctly", async () => {
      const { io, calls } = createMockIO();
      const { callbacks } = createMockCallbacks();
      const engine = new PlanGenerationEngine(io, CWD, AGENT_DIR);

      await engine.generate({ type: "todo", todoId: "abc123" }, callbacks);

      const genCall = calls.dispatchCalls.find(
        (c) => c.agent === "plan-generator",
      );
      assert.ok(genCall, "Should dispatch plan-generator");
      assert.ok(
        genCall.task.includes("Body of todo abc123"),
        "Prompt should include todo body",
      );
      assert.ok(
        genCall.task.includes("TODO-abc123"),
        "Prompt should reference todo ID",
      );
    });

    it("(c) reads generated plan and validates it", async () => {
      const { io, calls } = createMockIO();
      const { callbacks } = createMockCallbacks();
      const engine = new PlanGenerationEngine(io, CWD, AGENT_DIR);

      const result = await engine.generate(
        { type: "freeform", text: "Build something" },
        callbacks,
      );

      // Should read the plan file after generation
      const planReads = calls.readFileCalls.filter(
        (p) => p.includes(".pi/plans/") && !p.includes("reviews/"),
      );
      assert.ok(planReads.length >= 1, "Should read the plan file");

      // Valid plan should lead to approved status
      assert.ok(
        result.reviewStatus === "approved" ||
          result.reviewStatus === "approved_with_notes",
        `Expected approved status, got ${result.reviewStatus}`,
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // (d) Validation failure → goes to repair without review dispatch
  // ───────────────────────────────────────────────────────────────────────

  describe("validation failure skips review", () => {
    it("(d) invalid plan goes to repair without dispatching plan-reviewer", async () => {
      // Sequence: [post-initial, snapshot-before-repair, post-repair]
      const { io, calls } = createMockIO({
        planContentSequence: [INVALID_PLAN, INVALID_PLAN, VALID_PLAN],
      });
      const { callbacks } = createMockCallbacks();
      const engine = new PlanGenerationEngine(io, CWD, AGENT_DIR);

      await engine.generate(
        { type: "freeform", text: "Build something" },
        callbacks,
      );

      // The first review dispatch should NOT be plan-reviewer when plan is invalid
      // plan-generator dispatched first, then after invalid plan, repair dispatches
      // plan-generator again (edit prompt), NOT plan-reviewer
      const dispatchAgents = calls.dispatchCalls.map((c) => c.agent);
      const firstReviewerIndex = dispatchAgents.indexOf("plan-reviewer");
      const secondGeneratorIndex = dispatchAgents.indexOf(
        "plan-generator",
        1,
      );

      // If the invalid plan triggers repair, the second plan-generator call
      // should come BEFORE any plan-reviewer call
      if (firstReviewerIndex !== -1 && secondGeneratorIndex !== -1) {
        assert.ok(
          secondGeneratorIndex < firstReviewerIndex,
          "Repair (plan-generator) should run before review (plan-reviewer) when plan is invalid",
        );
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // (e) Review output written to reviewPath
  // ───────────────────────────────────────────────────────────────────────

  describe("review output persistence", () => {
    it("(e) writes review output to reviewPath via io.writeFile", async () => {
      const { io, calls } = createMockIO({
        reviewOutput: APPROVED_REVIEW_OUTPUT,
      });
      const { callbacks } = createMockCallbacks();
      const engine = new PlanGenerationEngine(io, CWD, AGENT_DIR);

      const result = await engine.generate(
        { type: "freeform", text: "Build something" },
        callbacks,
      );

      // Should write review to reviewPath
      const reviewWrite = calls.writeFileCalls.find((w) =>
        w.path.includes("reviews/"),
      );
      assert.ok(reviewWrite, "Should write review output to reviewPath");
      assert.ok(
        reviewWrite.content.includes("Approved"),
        "Written content should contain review output",
      );
      assert.ok(
        result.reviewPath !== null,
        "Result should include reviewPath",
      );
    });

    it("fails with a descriptive error when the plan file is missing after generation", async () => {
      const { io } = createMockIO({
        planFileExists: false,
        dispatchOutputSequence: [{ text: "", exitCode: 0 }],
      });
      const { callbacks } = createMockCallbacks();
      const engine = new PlanGenerationEngine(io, CWD, AGENT_DIR);

      await assert.rejects(
        () =>
          engine.generate(
            { type: "freeform", text: "Build something" },
            callbacks,
          ),
        (err: Error) => {
          assert.match(err.message, /did not write the expected plan file/i);
          assert.match(err.message, /\/test\/project\/.pi\/plans\//);
          return true;
        },
      );
    });

    it("includes alternate output paths from subagent output when generation writes to the wrong path", async () => {
      const wrongPath = "/test/project/.pi/plans/wrong-output.md";
      const { io } = createMockIO({
        planFileExists: false,
        dispatchOutputSequence: [
          { text: `Wrote plan to ${wrongPath}`, exitCode: 0 },
        ],
      });
      const { callbacks } = createMockCallbacks();
      const engine = new PlanGenerationEngine(io, CWD, AGENT_DIR);

      await assert.rejects(
        () =>
          engine.generate(
            { type: "freeform", text: "Build something" },
            callbacks,
          ),
        (err: Error) => {
          assert.match(err.message, /different path|alternate path|mentioned/i);
          assert.match(err.message, /wrong-output\.md/);
          return true;
        },
      );
    });

    it("throws when a stale plan file exists but the generator produces no new output", async () => {
      // Simulate: plan file exists from a prior run, generator exits 0
      // but does not write fresh content (file content unchanged).
      const { io } = createMockIO({
        planFileExistsBefore: true,
        planFileExists: true,
        planContent: VALID_PLAN,  // readFile returns same content before and after dispatch
        dispatchOutputSequence: [
          { text: "", exitCode: 0 },
        ],
      });
      const { callbacks } = createMockCallbacks();
      const engine = new PlanGenerationEngine(io, CWD, AGENT_DIR);

      await assert.rejects(
        () =>
          engine.generate(
            { type: "freeform", text: "Build something" },
            callbacks,
          ),
        (err: Error) => {
          assert.match(err.message, /unchanged/i);
          return true;
        },
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // (f) Warnings/suggestions → appendReviewNotes called
  // ───────────────────────────────────────────────────────────────────────

  describe("review notes appended for non-blocking findings", () => {
    it("(f) approved plan with warnings/suggestions gets review notes appended", async () => {
      const { io, calls } = createMockIO({
        reviewOutput: REVIEW_WITH_WARNINGS_OUTPUT,
      });
      const { callbacks } = createMockCallbacks();
      const engine = new PlanGenerationEngine(io, CWD, AGENT_DIR);

      const result = await engine.generate(
        { type: "freeform", text: "Build something" },
        callbacks,
      );

      assert.equal(result.reviewStatus, "approved_with_notes");
      assert.ok(result.noteCount > 0, "Should have notes");

      // The plan should have been written back with review notes.
      const planWrite = calls.writeFileCalls.find(
        (w) => w.path.includes(".pi/plans/") && !w.path.includes("reviews/"),
      );
      assert.ok(planWrite, "Should write plan with appended review notes");
      assert.ok(
        planWrite.content.includes("## Review Notes"),
        "Plan should contain Review Notes section",
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // (g-h) Repair loop entry paths
  // ───────────────────────────────────────────────────────────────────────

  describe("repair loop entry", () => {
    it("(g) enters repair loop when validation fails", async () => {
      // Sequence: [post-initial, snapshot-before-repair, post-repair]
      const { io, calls } = createMockIO({
        planContentSequence: [INVALID_PLAN, INVALID_PLAN, VALID_PLAN],
      });
      const { callbacks, record } = createMockCallbacks();
      const engine = new PlanGenerationEngine(io, CWD, AGENT_DIR);

      await engine.generate(
        { type: "freeform", text: "Build something" },
        callbacks,
      );

      // Should have repair cycle progress message
      const hasRepairProgress = record.progressMessages.some((m) =>
        m.includes("Repair cycle"),
      );
      assert.ok(hasRepairProgress, "Should report repair cycle progress");

      // Should have dispatched plan-generator at least twice (initial + repair)
      const genCalls = calls.dispatchCalls.filter(
        (c) => c.agent === "plan-generator",
      );
      assert.ok(
        genCalls.length >= 2,
        `Should dispatch plan-generator at least twice, got ${genCalls.length}`,
      );
    });

    it("(h) enters repair loop when review finds errors", async () => {
      // Plan is valid but review finds errors, then second plan also valid and review approves
      // Sequence: [post-initial, snapshot-before-repair, post-repair]
      const { io, calls } = createMockIO({
        reviewOutput: REVIEW_WITH_ERRORS_OUTPUT,
        planContentSequence: [VALID_PLAN, VALID_PLAN, VALID_PLAN_V2],
        dispatchOutputSequence: [
          // First: plan-generator initial
          { text: "", exitCode: 0 },
          // Second: plan-reviewer with errors
          { text: REVIEW_WITH_ERRORS_OUTPUT, exitCode: 0 },
          // Third: plan-generator repair edit
          { text: "", exitCode: 0 },
          // Fourth: plan-reviewer approves after repair
          { text: APPROVED_REVIEW_OUTPUT, exitCode: 0 },
        ],
      });
      const { callbacks, record } = createMockCallbacks();
      const engine = new PlanGenerationEngine(io, CWD, AGENT_DIR);

      await engine.generate(
        { type: "freeform", text: "Build something" },
        callbacks,
      );

      const hasRepairProgress = record.progressMessages.some((m) =>
        m.includes("Repair cycle"),
      );
      assert.ok(
        hasRepairProgress,
        "Should report repair cycle progress for review errors",
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // (i) Edit prompt built with findings
  // ───────────────────────────────────────────────────────────────────────

  describe("edit prompt construction", () => {
    it("(i) edit prompt includes review findings", async () => {
      // Sequence: [post-initial, snapshot-before-repair, post-repair]
      const { io, calls } = createMockIO({
        planContentSequence: [VALID_PLAN, VALID_PLAN, VALID_PLAN_V2],
        dispatchOutputSequence: [
          { text: "", exitCode: 0 }, // plan-generator
          { text: REVIEW_WITH_ERRORS_OUTPUT, exitCode: 0 }, // plan-reviewer
          { text: "", exitCode: 0 }, // plan-generator repair
          { text: APPROVED_REVIEW_OUTPUT, exitCode: 0 }, // plan-reviewer ok
        ],
      });
      const { callbacks } = createMockCallbacks();
      const engine = new PlanGenerationEngine(io, CWD, AGENT_DIR);

      await engine.generate(
        { type: "freeform", text: "Build something" },
        callbacks,
      );

      // The repair plan-generator call should contain findings text
      const repairCall = calls.dispatchCalls.find(
        (c) =>
          c.agent === "plan-generator" &&
          c.task.includes("findings"),
      );
      assert.ok(
        repairCall,
        "Repair dispatch should contain findings in the prompt",
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // (j) Per-issue escalation to partial_regen
  // ───────────────────────────────────────────────────────────────────────

  describe("per-issue escalation", () => {
    it("(j) escalates to partial_regen after 2 consecutive edit failures on same issue", async () => {
      // Issue persists through 3 cycles: first 2 are targeted_edit, third is partial_regen.
      // Initial review findings seed the repair state, so the first repair cycle already
      // sees the issue as persisting (consecutiveEditFailures=1 after cycle 1).
      // Sequence alternates to satisfy content-comparison check:
      // [post-initial, snap-r1, post-r1, snap-r2, post-r2, snap-r3, post-r3]
      const { io, calls } = createMockIO({
        planContentSequence: [
          VALID_PLAN,       // post initial dispatch
          VALID_PLAN,       // snapshot before repair 1
          VALID_PLAN_V2,    // post repair 1 dispatch
          VALID_PLAN_V2,    // snapshot before repair 2
          VALID_PLAN,       // post repair 2 dispatch
          VALID_PLAN,       // snapshot before repair 3
          VALID_PLAN_V2,    // post repair 3 dispatch
        ],
        dispatchOutputSequence: [
          { text: "", exitCode: 0 }, // plan-generator initial
          { text: REVIEW_WITH_ERRORS_OUTPUT, exitCode: 0 }, // reviewer: errors
          { text: "", exitCode: 0 }, // plan-generator repair 1 (targeted_edit, issue at 1)
          { text: REVIEW_WITH_ERRORS_OUTPUT, exitCode: 0 }, // reviewer: same errors
          { text: "", exitCode: 0 }, // plan-generator repair 2 (targeted_edit, issue at 2)
          { text: REVIEW_WITH_ERRORS_OUTPUT, exitCode: 0 }, // reviewer: same errors again
          { text: "", exitCode: 0 }, // plan-generator repair 3 (should be partial_regen, issue at 3)
          { text: APPROVED_REVIEW_OUTPUT, exitCode: 0 }, // reviewer: approved
        ],
      });
      const { callbacks } = createMockCallbacks();
      const engine = new PlanGenerationEngine(io, CWD, AGENT_DIR);

      await engine.generate(
        { type: "freeform", text: "Build something" },
        callbacks,
      );

      // One of the repair dispatches should use partial_regen strategy
      // which means its prompt should contain "partial regeneration"
      const partialRegenCall = calls.dispatchCalls.find(
        (c) =>
          c.agent === "plan-generator" &&
          c.task.includes("partial regeneration"),
      );
      assert.ok(
        partialRegenCall,
        "Should escalate to partial_regen after 2 consecutive edit failures",
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // (k) Convergence after repair
  // ───────────────────────────────────────────────────────────────────────

  describe("convergence after repair", () => {
    it("(k) converges when repair fixes all issues", async () => {
      // Sequence: [post-initial, snapshot-before-repair, post-repair]
      const { io } = createMockIO({
        planContentSequence: [INVALID_PLAN, INVALID_PLAN, VALID_PLAN],
      });
      const { callbacks } = createMockCallbacks();
      const engine = new PlanGenerationEngine(io, CWD, AGENT_DIR);

      const result = await engine.generate(
        { type: "freeform", text: "Build something" },
        callbacks,
      );

      assert.ok(
        result.reviewStatus === "approved" ||
          result.reviewStatus === "approved_with_notes",
        `Expected approved after repair, got ${result.reviewStatus}`,
      );
      assert.equal(
        result.remainingFindings.length,
        0,
        "Should have no remaining findings after convergence",
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // (l) Max cycles → surfaces remaining findings
  // ───────────────────────────────────────────────────────────────────────

  describe("max cycles exceeded", () => {
    it("(l) surfaces remaining findings after max 10 repair cycles", async () => {
      // Always return invalid plan so repair never converges.
      // Alternate between two invalid plans so the content-comparison
      // check does not trigger a false "unchanged" error.
      const seq: string[] = [INVALID_PLAN]; // post-initial dispatch
      for (let i = 0; i < 10; i++) {
        // snapshot before repair, post-repair dispatch (alternate)
        seq.push(i % 2 === 0 ? INVALID_PLAN : INVALID_PLAN_V2);
        seq.push(i % 2 === 0 ? INVALID_PLAN_V2 : INVALID_PLAN);
      }
      const { io } = createMockIO({
        planContentSequence: seq,
      });
      const { callbacks } = createMockCallbacks();
      const engine = new PlanGenerationEngine(io, CWD, AGENT_DIR);

      const result = await engine.generate(
        { type: "freeform", text: "Build something" },
        callbacks,
      );

      assert.equal(
        result.reviewStatus,
        "errors_found",
        "Should report errors_found when max cycles exceeded",
      );
      assert.ok(
        result.remainingFindings.length > 0,
        "Should have remaining findings",
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // (m-n) Cross-provider model with fallback + warning
  // ───────────────────────────────────────────────────────────────────────

  describe("cross-provider model selection", () => {
    it("(m) uses crossProvider.capable model for review when available", async () => {
      const { io, calls } = createMockIO({
        settingsJson: SETTINGS_JSON,
      });
      const { callbacks } = createMockCallbacks();
      const engine = new PlanGenerationEngine(io, CWD, AGENT_DIR);

      await engine.generate(
        { type: "freeform", text: "Build something" },
        callbacks,
      );

      const reviewCall = calls.dispatchCalls.find(
        (c) => c.agent === "plan-reviewer",
      );
      assert.ok(reviewCall, "Should dispatch plan-reviewer");
      assert.equal(
        reviewCall.model,
        "gpt-4",
        "Should use crossProvider.capable model",
      );
    });

    it("(n) falls back to tiers.capable when crossProvider dispatch fails and reports warning", async () => {
      const { io, calls } = createMockIO({
        settingsJson: SETTINGS_JSON,
        dispatchShouldThrow: true,
        dispatchThrowOnModel: "gpt-4",
        dispatchOutputSequence: undefined,
      });
      const { callbacks, record } = createMockCallbacks();
      const engine = new PlanGenerationEngine(io, CWD, AGENT_DIR);

      await engine.generate(
        { type: "freeform", text: "Build something" },
        callbacks,
      );

      // Should have tried gpt-4 first then fallen back to claude-opus
      const reviewCalls = calls.dispatchCalls.filter(
        (c) => c.agent === "plan-reviewer",
      );
      assert.ok(reviewCalls.length >= 2, "Should attempt at least 2 review dispatches");
      assert.equal(reviewCalls[0]!.model, "gpt-4");
      assert.equal(reviewCalls[1]!.model, "claude-opus");

      // Should warn about fallback
      assert.ok(
        record.warnings.some((w) => w.includes("fallback") || w.includes("Fallback") || w.toLowerCase().includes("fall")),
        `Should report fallback warning, got: ${record.warnings}`,
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // (o) Model tiers loaded from settings
  // ───────────────────────────────────────────────────────────────────────

  describe("model tiers loading", () => {
    it("(o) loads model tiers from settings.json via agentDir", async () => {
      const { io, calls } = createMockIO();
      const { callbacks } = createMockCallbacks();
      const engine = new PlanGenerationEngine(io, CWD, AGENT_DIR);

      await engine.generate(
        { type: "freeform", text: "Build something" },
        callbacks,
      );

      const settingsRead = calls.readFileCalls.find((p) =>
        p.endsWith("settings.json"),
      );
      assert.ok(settingsRead, "Should read settings.json");
      assert.ok(
        settingsRead.startsWith(AGENT_DIR),
        "Should read settings from agentDir",
      );
    });

    it("throws when loadModelTiers fails", async () => {
      const { io } = createMockIO({
        settingsJson: "not valid json {{{",
      });
      const { callbacks } = createMockCallbacks();
      const engine = new PlanGenerationEngine(io, CWD, AGENT_DIR);

      await assert.rejects(
        () =>
          engine.generate(
            { type: "freeform", text: "Build something" },
            callbacks,
          ),
        (err: Error) => {
          assert.ok(
            err.message.includes("settings.json") ||
              err.message.includes("model tiers") ||
              err.message.includes("Model tiers"),
            `Expected settings/model tiers error, got: ${err.message}`,
          );
          return true;
        },
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // (p) Progress callbacks at each stage
  // ───────────────────────────────────────────────────────────────────────

  describe("progress callbacks", () => {
    it("(p) reports progress at each lifecycle stage", async () => {
      const { io } = createMockIO();
      const { callbacks, record } = createMockCallbacks();
      const engine = new PlanGenerationEngine(io, CWD, AGENT_DIR);

      await engine.generate(
        { type: "freeform", text: "Build something" },
        callbacks,
      );

      // Should have progress for each phase
      assert.ok(
        record.progressMessages.some((m) =>
          m.toLowerCase().includes("resolving"),
        ),
        `Should report resolving progress, got: ${record.progressMessages}`,
      );
      assert.ok(
        record.progressMessages.some((m) =>
          m.toLowerCase().includes("generating"),
        ),
        `Should report generating progress, got: ${record.progressMessages}`,
      );
      assert.ok(
        record.progressMessages.some((m) =>
          m.toLowerCase().includes("validating"),
        ),
        `Should report validating progress, got: ${record.progressMessages}`,
      );
      assert.ok(
        record.progressMessages.some((m) =>
          m.toLowerCase().includes("reviewing"),
        ),
        `Should report reviewing progress, got: ${record.progressMessages}`,
      );
    });

    it("reports error via onProgress and re-throws on failure", async () => {
      const { io } = createMockIO({
        settingsJson: "invalid json {{{",
      });
      const { callbacks, record } = createMockCallbacks();
      const engine = new PlanGenerationEngine(io, CWD, AGENT_DIR);

      await assert.rejects(() =>
        engine.generate(
          { type: "freeform", text: "Build something" },
          callbacks,
        ),
      );

      // Should have reported error progress
      const hasError = record.progressMessages.some(
        (m) =>
          m.toLowerCase().includes("error") ||
          m.toLowerCase().includes("failed"),
      );
      assert.ok(hasError, `Should report error progress, got: ${record.progressMessages}`);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // (q-r) Path derivation and directory creation
  // ───────────────────────────────────────────────────────────────────────

  describe("path derivation and directory creation", () => {
    it("(q) derives plan path from cwd and short description", async () => {
      const { io } = createMockIO();
      const { callbacks } = createMockCallbacks();
      const engine = new PlanGenerationEngine(io, CWD, AGENT_DIR);

      const result = await engine.generate(
        { type: "freeform", text: "Build a REST API" },
        callbacks,
      );

      assert.ok(
        result.planPath.startsWith(CWD),
        "Plan path should start with cwd",
      );
      assert.ok(
        result.planPath.includes(".pi/plans/"),
        "Plan path should be in .pi/plans/",
      );
      assert.ok(
        result.planPath.includes("build-a-rest-api"),
        "Plan path should include slugified description",
      );
      assert.ok(
        result.planPath.endsWith(".md"),
        "Plan path should end with .md",
      );
    });

    it("(r) ensures plan directories exist before writing", async () => {
      const { io, calls } = createMockIO();
      const { callbacks } = createMockCallbacks();
      const engine = new PlanGenerationEngine(io, CWD, AGENT_DIR);

      await engine.generate(
        { type: "freeform", text: "Build something" },
        callbacks,
      );

      // Should create plan dirs
      assert.ok(
        calls.mkdirCalls.some((p) => p.includes(".pi/plans")),
        `Should create .pi/plans directory, got: ${calls.mkdirCalls}`,
      );
      assert.ok(
        calls.mkdirCalls.some((p) => p.includes("reviews")),
        `Should create reviews directory, got: ${calls.mkdirCalls}`,
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // (s) Complete GenerationResult returned
  // ───────────────────────────────────────────────────────────────────────

  describe("complete GenerationResult", () => {
    it("(s) returns complete result with all fields for approved plan", async () => {
      const { io } = createMockIO({
        reviewOutput: APPROVED_REVIEW_OUTPUT,
      });
      const { callbacks, record } = createMockCallbacks();
      const engine = new PlanGenerationEngine(io, CWD, AGENT_DIR);

      const result = await engine.generate(
        { type: "freeform", text: "Build something" },
        callbacks,
      );

      // Check all fields
      assert.ok(typeof result.planPath === "string", "Should have planPath");
      assert.ok(
        result.reviewPath === null || typeof result.reviewPath === "string",
        "reviewPath should be string or null",
      );
      assert.equal(result.reviewStatus, "approved");
      assert.equal(result.noteCount, 0);
      assert.deepEqual(result.remainingFindings, []);

      // Should have called onComplete
      assert.equal(
        record.completions.length,
        1,
        "Should call onComplete exactly once",
      );
      assert.deepEqual(record.completions[0], result);
    });

    it("returns approved_with_notes for plan with warnings", async () => {
      const { io } = createMockIO({
        reviewOutput: REVIEW_WITH_WARNINGS_OUTPUT,
      });
      const { callbacks } = createMockCallbacks();
      const engine = new PlanGenerationEngine(io, CWD, AGENT_DIR);

      const result = await engine.generate(
        { type: "freeform", text: "Build something" },
        callbacks,
      );

      assert.equal(result.reviewStatus, "approved_with_notes");
      assert.ok(result.noteCount > 0);
      assert.deepEqual(result.remainingFindings, []);
    });

    it("returns errors_found when plan cannot be fixed", async () => {
      // Alternate between two invalid plans so content-comparison check
      // does not trigger "unchanged" errors during repair cycles.
      const seq: string[] = [INVALID_PLAN];
      for (let i = 0; i < 10; i++) {
        seq.push(i % 2 === 0 ? INVALID_PLAN : INVALID_PLAN_V2);
        seq.push(i % 2 === 0 ? INVALID_PLAN_V2 : INVALID_PLAN);
      }
      const { io } = createMockIO({
        planContentSequence: seq,
      });
      const { callbacks } = createMockCallbacks();
      const engine = new PlanGenerationEngine(io, CWD, AGENT_DIR);

      const result = await engine.generate(
        { type: "freeform", text: "Build something" },
        callbacks,
      );

      assert.equal(result.reviewStatus, "errors_found");
      assert.ok(result.remainingFindings.length > 0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Review dispatches use plan-reviewer agent (not plan-executor)
  // ───────────────────────────────────────────────────────────────────────

  describe("review agent name", () => {
    it("uses plan-reviewer agent for review dispatches", async () => {
      const { io, calls } = createMockIO();
      const { callbacks } = createMockCallbacks();
      const engine = new PlanGenerationEngine(io, CWD, AGENT_DIR);

      await engine.generate(
        { type: "freeform", text: "Build something" },
        callbacks,
      );

      const reviewCalls = calls.dispatchCalls.filter(
        (c) => c.agent === "plan-reviewer",
      );
      assert.ok(
        reviewCalls.length >= 1,
        "Should dispatch plan-reviewer at least once",
      );

      // Should never dispatch plan-executor for review
      const executorCalls = calls.dispatchCalls.filter(
        (c) => c.agent === "plan-executor",
      );
      assert.equal(
        executorCalls.length,
        0,
        "Should never dispatch plan-executor",
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Falls back to tiers.capable when no crossProvider
  // ───────────────────────────────────────────────────────────────────────

  describe("model fallback without crossProvider", () => {
    it("uses tiers.capable when crossProvider is not configured", async () => {
      const { io, calls } = createMockIO({
        settingsJson: SETTINGS_JSON_NO_CROSS,
      });
      const { callbacks } = createMockCallbacks();
      const engine = new PlanGenerationEngine(io, CWD, AGENT_DIR);

      await engine.generate(
        { type: "freeform", text: "Build something" },
        callbacks,
      );

      const reviewCall = calls.dispatchCalls.find(
        (c) => c.agent === "plan-reviewer",
      );
      assert.ok(reviewCall, "Should dispatch plan-reviewer");
      assert.equal(
        reviewCall.model,
        "claude-opus",
        "Should use tiers.capable when no crossProvider",
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // File input type
  // ───────────────────────────────────────────────────────────────────────

  describe("file input type", () => {
    it("resolves file input correctly", async () => {
      const { io, calls } = createMockIO();

      // Override readFile to return spec content for the file path
      const origReadFile = io.readFile;
      io.readFile = async (path: string) => {
        if (path === "/test/spec.md") {
          calls.readFileCalls.push(path);
          return "My spec content";
        }
        return origReadFile(path);
      };

      const { callbacks } = createMockCallbacks();
      const engine = new PlanGenerationEngine(io, CWD, AGENT_DIR);

      await engine.generate(
        { type: "file", filePath: "/test/spec.md" },
        callbacks,
      );

      const genCall = calls.dispatchCalls.find(
        (c) => c.agent === "plan-generator",
      );
      assert.ok(genCall, "Should dispatch plan-generator");
      assert.ok(
        genCall.task.includes("My spec content"),
        "Prompt should include file content",
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Stale review findings cleared when validation fails after edit
  // ───────────────────────────────────────────────────────────────────────

  describe("stale review findings cleared on post-edit validation failure", () => {
    it("clears reviewResult when edit makes plan invalid, so stale findings are not reused", async () => {
      // Cycle 1: valid plan → review finds errors → engine dispatches edit
      // Cycle 2: edit makes plan INVALID (validation fails) → reviewResult should be cleared
      // Cycle 3: plan is valid again → review runs fresh and approves
      // Read sequence accounts for snapshot reads before each repair dispatch:
      // [post-initial, snap-r1, post-r1, snap-r2, post-r2]
      const { io, calls } = createMockIO({
        planContentSequence: [
          VALID_PLAN,    // post-initial: valid → review finds errors
          VALID_PLAN,    // snapshot before repair 1
          INVALID_PLAN,  // post repair 1: now invalid
          INVALID_PLAN,  // snapshot before repair 2
          VALID_PLAN,    // post repair 2: valid again → review approves
        ],
        dispatchOutputSequence: [
          { text: "", exitCode: 0 },                       // plan-generator initial
          { text: REVIEW_WITH_ERRORS_OUTPUT, exitCode: 0 }, // plan-reviewer: errors
          { text: "", exitCode: 0 },                       // plan-generator repair 1
          // No reviewer here — plan is invalid after repair 1
          { text: "", exitCode: 0 },                       // plan-generator repair 2
          { text: APPROVED_REVIEW_OUTPUT, exitCode: 0 },    // plan-reviewer: approved
        ],
      });
      const { callbacks } = createMockCallbacks();
      const engine = new PlanGenerationEngine(io, CWD, AGENT_DIR);

      const result = await engine.generate(
        { type: "freeform", text: "Build something" },
        callbacks,
      );

      // The second repair edit prompt (cycle 2, dispatched after invalid plan)
      // should NOT contain the stale review finding "Missing test coverage"
      // because reviewResult was cleared when validation failed.
      const repairCalls = calls.dispatchCalls.filter(
        (c) => c.agent === "plan-generator" && c.task.includes("targeted edits"),
      );

      // The repair call after the invalid plan (cycle 2) should only have
      // validation errors, not stale review findings
      if (repairCalls.length >= 2) {
        const secondRepairPrompt = repairCalls[1]!.task;
        // It should NOT contain the stale review error from cycle 1
        assert.ok(
          !secondRepairPrompt.includes("Missing test coverage"),
          "Second repair prompt should NOT contain stale review findings after validation failure",
        );
      }

      // Final result should be approved since the last review passes
      assert.ok(
        result.reviewStatus === "approved" ||
          result.reviewStatus === "approved_with_notes",
        `Expected approved result, got ${result.reviewStatus}`,
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // reviewPath preserved even when later validation failure clears reviewResult
  // ───────────────────────────────────────────────────────────────────────

  describe("reviewPath preserved after later validation failure", () => {
    it("returns reviewPath when review ran earlier but final reviewResult is null due to validation failure", async () => {
      // Cycle 1: valid plan → review finds errors → engine dispatches edit
      // Cycle 2: edit makes plan INVALID (validation fails) → reviewResult cleared
      // Plan never recovers → max cycles exhausted
      // reviewPath should still be set because a review file was written
      // Read sequence: [post-initial, snap-r1, post-r1, snap-r2, post-r2, ...]
      const seq: string[] = [
        VALID_PLAN,   // post-initial: valid → review runs and finds errors
        VALID_PLAN,   // snapshot before repair 1
        INVALID_PLAN, // post repair 1: now invalid → reviewResult cleared
      ];
      // Remaining repair cycles: plan stays invalid, alternate to avoid "unchanged"
      for (let i = 1; i < 10; i++) {
        seq.push(i % 2 === 0 ? INVALID_PLAN : INVALID_PLAN_V2);   // snapshot
        seq.push(i % 2 === 0 ? INVALID_PLAN_V2 : INVALID_PLAN);   // post-dispatch
      }
      const { io } = createMockIO({
        planContentSequence: seq,
        dispatchOutputSequence: [
          { text: "", exitCode: 0 },                        // plan-generator initial
          { text: REVIEW_WITH_ERRORS_OUTPUT, exitCode: 0 }, // plan-reviewer: errors
          { text: "", exitCode: 0 },                        // plan-generator repair 1
          // Remaining cycles: plan stays invalid, no reviewer dispatched
          { text: "", exitCode: 0 },
          { text: "", exitCode: 0 },
          { text: "", exitCode: 0 },
          { text: "", exitCode: 0 },
          { text: "", exitCode: 0 },
          { text: "", exitCode: 0 },
          { text: "", exitCode: 0 },
          { text: "", exitCode: 0 },
          { text: "", exitCode: 0 },
          { text: "", exitCode: 0 },
        ],
      });
      const { callbacks } = createMockCallbacks();
      const engine = new PlanGenerationEngine(io, CWD, AGENT_DIR);

      const result = await engine.generate(
        { type: "freeform", text: "Build something" },
        callbacks,
      );

      // Should have errors_found since plan never recovered
      assert.equal(result.reviewStatus, "errors_found");

      // reviewPath should be set because a review file was written earlier
      assert.ok(
        result.reviewPath !== null,
        "reviewPath should be preserved even when final reviewResult is null",
      );
      assert.ok(
        result.reviewPath!.includes("reviews/"),
        "reviewPath should point to the reviews directory",
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Review re-runs after repair in repair loop
  // ───────────────────────────────────────────────────────────────────────

  describe("review re-run after repair", () => {
    it("re-runs review after repair fixes validation errors", async () => {
      // First plan invalid, second plan valid — review should run on second
      // Sequence: [post-initial, snapshot-before-repair, post-repair]
      const { io, calls } = createMockIO({
        planContentSequence: [INVALID_PLAN, INVALID_PLAN, VALID_PLAN],
      });
      const { callbacks } = createMockCallbacks();
      const engine = new PlanGenerationEngine(io, CWD, AGENT_DIR);

      await engine.generate(
        { type: "freeform", text: "Build something" },
        callbacks,
      );

      // After repair fixes the plan, review should run
      const reviewCalls = calls.dispatchCalls.filter(
        (c) => c.agent === "plan-reviewer",
      );
      assert.ok(
        reviewCalls.length >= 1,
        "Should run review after repair fixes validation",
      );
    });
  });
});
