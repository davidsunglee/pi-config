import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import {
  getTemplatePath,
  fillImplementerPrompt,
  fillSpecReviewerPrompt,
  fillCodeReviewerPrompt,
  buildTaskContext,
  validateNoUnfilledPlaceholders,
} from "./template-filler.ts";
import type { Plan, PlanTask, Wave, WaveState } from "./types.ts";

// ── helpers ──────────────────────────────────────────────────────────

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    header: {
      goal: "Build a todo app",
      architectureSummary: "Simple layered architecture",
      techStack: "TypeScript, Node.js",
    },
    fileStructure: [],
    tasks: [],
    dependencies: new Map(),
    risks: "None",
    testCommand: null,
    rawContent: "",
    sourceTodoId: null,
    fileName: "plan.md",
    ...overrides,
  };
}

function makeTask(overrides: Partial<PlanTask> = {}): PlanTask {
  return {
    number: 1,
    title: "Implement foo",
    files: { create: ["foo.ts"], modify: [], test: ["foo.test.ts"] },
    steps: ["Write foo", "Write tests"],
    acceptanceCriteria: ["foo works", "tests pass"],
    modelRecommendation: null,
    ...overrides,
  };
}

function makeWave(overrides: Partial<Wave> = {}): Wave {
  return {
    number: 1,
    taskNumbers: [1],
    ...overrides,
  };
}

// ── getTemplatePath ───────────────────────────────────────────────────

describe("getTemplatePath", () => {
  it("returns correct path for implementer template", () => {
    const agentDir = "/path/to/agent";
    const result = getTemplatePath(agentDir, "implementer");
    assert.equal(
      result,
      path.join(agentDir, "skills/execute-plan/implementer-prompt.md"),
    );
  });

  it("returns correct path for spec-reviewer template", () => {
    const agentDir = "/path/to/agent";
    const result = getTemplatePath(agentDir, "spec-reviewer");
    assert.equal(
      result,
      path.join(agentDir, "skills/execute-plan/spec-reviewer.md"),
    );
  });

  it("returns correct path for code-reviewer template (under requesting-code-review)", () => {
    const agentDir = "/path/to/agent";
    const result = getTemplatePath(agentDir, "code-reviewer");
    assert.equal(
      result,
      path.join(agentDir, "skills/requesting-code-review/code-reviewer.md"),
    );
  });
});

// ── fillImplementerPrompt ─────────────────────────────────────────────

describe("fillImplementerPrompt", () => {
  const baseTemplate =
    "Task: {TASK_SPEC}\nContext: {CONTEXT}\nDir: {WORKING_DIR}\n{TDD_BLOCK}";

  it("(a) fills {TASK_SPEC}", () => {
    const result = fillImplementerPrompt(baseTemplate, {
      taskSpec: "Build the widget",
      context: "ctx",
      workingDir: "/work",
      tddEnabled: false,
    });
    assert.ok(result.includes("Build the widget"));
    assert.ok(!result.includes("{TASK_SPEC}"));
  });

  it("(b) fills {CONTEXT}", () => {
    const result = fillImplementerPrompt(baseTemplate, {
      taskSpec: "spec",
      context: "Prior waves: wave 1 done",
      workingDir: "/work",
      tddEnabled: false,
    });
    assert.ok(result.includes("Prior waves: wave 1 done"));
    assert.ok(!result.includes("{CONTEXT}"));
  });

  it("(c) fills {WORKING_DIR}", () => {
    const result = fillImplementerPrompt(baseTemplate, {
      taskSpec: "spec",
      context: "ctx",
      workingDir: "/some/project/path",
      tddEnabled: false,
    });
    assert.ok(result.includes("/some/project/path"));
    assert.ok(!result.includes("{WORKING_DIR}"));
  });

  it("(d) fills {TDD_BLOCK} with TDD instructions when enabled", () => {
    const result = fillImplementerPrompt(baseTemplate, {
      taskSpec: "spec",
      context: "ctx",
      workingDir: "/work",
      tddEnabled: true,
    });
    assert.ok(!result.includes("{TDD_BLOCK}"));
    // should contain meaningful TDD instructions
    assert.ok(result.toLowerCase().includes("tdd") || result.toLowerCase().includes("test-driven") || result.includes("failing test"));
  });

  it("(e) fills {TDD_BLOCK} with empty string when disabled", () => {
    const result = fillImplementerPrompt(baseTemplate, {
      taskSpec: "spec",
      context: "ctx",
      workingDir: "/work",
      tddEnabled: false,
    });
    assert.ok(!result.includes("{TDD_BLOCK}"));
    // should not contain TDD block content
    assert.ok(!result.toLowerCase().includes("test-driven"));
  });
});

// ── fillSpecReviewerPrompt ────────────────────────────────────────────

describe("fillSpecReviewerPrompt", () => {
  it("(f) fills spec-reviewer placeholders", () => {
    const template = "Spec: {TASK_SPEC}\nReport: {IMPLEMENTER_REPORT}";
    const result = fillSpecReviewerPrompt(template, {
      taskSpec: "Do the thing",
      implementerReport: "I did the thing",
    });
    assert.ok(result.includes("Do the thing"));
    assert.ok(result.includes("I did the thing"));
    assert.ok(!result.includes("{TASK_SPEC}"));
    assert.ok(!result.includes("{IMPLEMENTER_REPORT}"));
  });
});

// ── fillCodeReviewerPrompt ────────────────────────────────────────────

describe("fillCodeReviewerPrompt", () => {
  it("(g) fills code-reviewer placeholders", () => {
    const template =
      "{WHAT_WAS_IMPLEMENTED}\n{PLAN_OR_REQUIREMENTS}\n{BASE_SHA}\n{HEAD_SHA}\n{DESCRIPTION}";
    const result = fillCodeReviewerPrompt(template, {
      whatWasImplemented: "Widget feature",
      planOrRequirements: "Build a widget",
      baseSha: "abc123",
      headSha: "def456",
      description: "Added widget module",
    });
    assert.ok(result.includes("Widget feature"));
    assert.ok(result.includes("Build a widget"));
    assert.ok(result.includes("abc123"));
    assert.ok(result.includes("def456"));
    assert.ok(result.includes("Added widget module"));
    assert.ok(!result.includes("{WHAT_WAS_IMPLEMENTED}"));
    assert.ok(!result.includes("{PLAN_OR_REQUIREMENTS}"));
    assert.ok(!result.includes("{BASE_SHA}"));
    assert.ok(!result.includes("{HEAD_SHA}"));
    assert.ok(!result.includes("{DESCRIPTION}"));
  });
});

// ── validateNoUnfilledPlaceholders ────────────────────────────────────

describe("validateNoUnfilledPlaceholders", () => {
  it("(i) does not throw when no unfilled placeholders remain", () => {
    assert.doesNotThrow(() =>
      validateNoUnfilledPlaceholders("This is clean content"),
    );
  });

  it("(i) throws when unfilled placeholder is present", () => {
    assert.throws(
      () => validateNoUnfilledPlaceholders("Some {UNFILLED} content"),
      /unfilled placeholder/i,
    );
  });

  it("(i) throws and names the placeholder", () => {
    assert.throws(
      () => validateNoUnfilledPlaceholders("Text {FOO_BAR} more"),
      /FOO_BAR/,
    );
  });

  it("(i) throws for first of multiple unfilled placeholders", () => {
    assert.throws(
      () => validateNoUnfilledPlaceholders("{FIRST} and {SECOND}"),
      /FIRST|SECOND/,
    );
  });
});

// ── buildTaskContext ──────────────────────────────────────────────────

describe("buildTaskContext", () => {
  it("includes plan goal in context", () => {
    const plan = makePlan({ header: { goal: "My goal", architectureSummary: "arch", techStack: "ts" } });
    const task = makeTask({ number: 2, title: "Task 2" });
    const wave = makeWave({ number: 2, taskNumbers: [2] });
    const result = buildTaskContext(plan, task, wave, [], [task]);
    assert.ok(result.includes("My goal"));
  });

  it("includes task title in context", () => {
    const plan = makePlan();
    const task = makeTask({ number: 1, title: "Implement the widget" });
    const wave = makeWave();
    const result = buildTaskContext(plan, task, wave, [], [task]);
    assert.ok(result.includes("Implement the widget"));
  });

  it("includes prior wave summaries when completed waves exist", () => {
    const plan = makePlan();
    const task1 = makeTask({ number: 1 });
    const task2 = makeTask({ number: 2, title: "Task 2" });
    const wave = makeWave({ number: 2, taskNumbers: [2] });
    const completedWaves: WaveState[] = [
      { wave: 1, tasks: [1], status: "done", commitSha: "abc123" },
    ];
    const result = buildTaskContext(plan, task2, wave, completedWaves, [task1, task2]);
    // Should mention completed wave info
    assert.ok(result.includes("1") && (result.includes("wave") || result.includes("Wave") || result.includes("abc123")));
  });

  it("works with no completed waves", () => {
    const plan = makePlan();
    const task = makeTask();
    const wave = makeWave();
    const result = buildTaskContext(plan, task, wave, [], [task]);
    assert.ok(typeof result === "string" && result.length > 0);
  });
});
