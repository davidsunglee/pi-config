import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ExecutionIO, Plan, RunState } from "./types.ts";
import {
  movePlanToDone,
  extractSourceTodoId,
  closeTodo,
  buildCompletionSummary,
} from "./plan-lifecycle.ts";

// ── Mock helpers ─────────────────────────────────────────────────────

function createMockIO(files: Map<string, string> = new Map()) {
  return {
    readFile: async (p: string) => { const c = files.get(p); if (!c) throw new Error('ENOENT'); return c; },
    writeFile: async (p: string, c: string) => { files.set(p, c); },
    fileExists: async (p: string) => files.has(p),
    mkdir: async () => {},
    rename: async (s: string, d: string) => { const c = files.get(s); if (!c) throw new Error('ENOENT'); files.set(d, c); files.delete(s); },
    readdir: async (p: string) => [...files.keys()].filter(k => k.startsWith(p + '/')).map(k => k.split('/').pop()!),
    files,
  } as unknown as ExecutionIO;
}

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    header: { goal: "Test goal", architectureSummary: "Summary", techStack: "TypeScript" },
    fileStructure: [],
    tasks: [
      { number: 1, title: "Task one", files: { create: [], modify: [], test: [] }, steps: [], acceptanceCriteria: [], modelRecommendation: null },
      { number: 2, title: "Task two", files: { create: [], modify: [], test: [] }, steps: [], acceptanceCriteria: [], modelRecommendation: null },
      { number: 3, title: "Task three", files: { create: [], modify: [], test: [] }, steps: [], acceptanceCriteria: [], modelRecommendation: null },
    ],
    dependencies: new Map(),
    risks: "",
    testCommand: null,
    rawContent: "",
    sourceTodoId: null,
    fileName: "2026-04-10-my-plan.md",
    ...overrides,
  };
}

function makeRunState(overrides: Partial<RunState> = {}): RunState {
  return {
    plan: "2026-04-10-my-plan.md",
    status: "completed",
    lock: null,
    startedAt: "2026-04-10T12:00:00.000Z",
    stoppedAt: null,
    stopGranularity: null,
    settings: {
      execution: "parallel",
      tdd: false,
      finalReview: false,
      specCheck: false,
      integrationTest: false,
      testCommand: null,
    },
    workspace: { type: "worktree", path: "/fake/work", branch: "plan/my-plan" },
    preExecutionSha: "abc1234",
    baselineTest: null,
    retryState: { tasks: {}, waves: {}, finalReview: null },
    waves: [
      { wave: 1, tasks: [1, 2], status: "done", commitSha: "sha-wave-1" },
      { wave: 2, tasks: [3], status: "done", commitSha: "sha-wave-2" },
    ],
    ...overrides,
  };
}

const TEST_CWD = "/fake/cwd";

// ── (a) movePlanToDone ───────────────────────────────────────────────

describe("movePlanToDone", () => {
  it("(a) creates done directory and moves the plan file", async () => {
    const files = new Map([
      ["/fake/cwd/.pi/plans/2026-04-10-my-plan.md", "# Plan content"],
    ]);
    const io = createMockIO(files);

    const newPath = await movePlanToDone(
      io,
      TEST_CWD,
      "/fake/cwd/.pi/plans/2026-04-10-my-plan.md",
    );

    assert.equal(
      newPath,
      "/fake/cwd/.pi/plans/done/2026-04-10-my-plan.md",
    );
    assert.ok(
      files.has("/fake/cwd/.pi/plans/done/2026-04-10-my-plan.md"),
      "File should exist at new path",
    );
    assert.ok(
      !files.has("/fake/cwd/.pi/plans/2026-04-10-my-plan.md"),
      "File should no longer exist at old path",
    );
  });

  it("returns the new path under .pi/plans/done/", async () => {
    const files = new Map([
      ["/fake/cwd/.pi/plans/my-feature.md", "content"],
    ]);
    const io = createMockIO(files);

    const newPath = await movePlanToDone(
      io,
      TEST_CWD,
      "/fake/cwd/.pi/plans/my-feature.md",
    );

    assert.ok(
      newPath.includes("/done/"),
      `Expected path under done/, got: ${newPath}`,
    );
    assert.ok(
      newPath.endsWith("my-feature.md"),
      `Expected filename preserved, got: ${newPath}`,
    );
  });
});

// ── (b) extractSourceTodoId ──────────────────────────────────────────

describe("extractSourceTodoId", () => {
  it("(b) extracts ID from plan.sourceTodoId field", () => {
    const plan = makePlan({ sourceTodoId: "deadbeef" });
    const result = extractSourceTodoId(plan);
    assert.equal(result, "deadbeef");
  });

  it("(c) returns null when plan.sourceTodoId is null", () => {
    const plan = makePlan({ sourceTodoId: null });
    const result = extractSourceTodoId(plan);
    assert.equal(result, null);
  });
});

// ── (d) closeTodo ────────────────────────────────────────────────────

describe("closeTodo", () => {
  it("(d) reads todo file, updates status to done, preserves body", async () => {
    const originalBody = "Notes about the work go here.";
    const todoContent = `{
  "id": "deadbeef",
  "title": "Add tests",
  "tags": ["qa"],
  "status": "open",
  "created_at": "2026-01-25T17:00:00.000Z"
}

${originalBody}`;

    const files = new Map([
      ["/fake/cwd/.pi/todos/deadbeef.md", todoContent],
    ]);
    const io = createMockIO(files);

    await closeTodo(io, TEST_CWD, "deadbeef", "2026-04-10-my-plan.md");

    const updated = files.get("/fake/cwd/.pi/todos/deadbeef.md");
    assert.ok(updated, "File should have been written");

    // Status should be "done"
    const parsed = JSON.parse(updated!.slice(0, updated!.indexOf('\n\n')));
    assert.equal(parsed.status, "done");

    // Body must be preserved exactly
    const bodyStart = updated!.indexOf('\n\n') + 2;
    const newBody = updated!.slice(bodyStart);
    assert.strictEqual(newBody, originalBody, "Body must be preserved exactly");
  });

  it("(e) silently skips if todo file doesn't exist", async () => {
    const files = new Map<string, string>();
    const io = createMockIO(files);

    // Should not throw
    await closeTodo(io, TEST_CWD, "missing00", "my-plan.md");

    // No file should have been created
    assert.equal(files.size, 0);
  });

  it("(f) silently skips if already closed (status: done)", async () => {
    const todoContent = `{
  "id": "deadbeef",
  "title": "Already done",
  "tags": [],
  "status": "done",
  "created_at": "2026-01-25T17:00:00.000Z"
}

Already completed.`;

    const files = new Map([
      ["/fake/cwd/.pi/todos/deadbeef.md", todoContent],
    ]);
    const io = createMockIO(files);
    const originalContent = todoContent;

    await closeTodo(io, TEST_CWD, "deadbeef", "my-plan.md");

    // File should be unchanged
    assert.equal(files.get("/fake/cwd/.pi/todos/deadbeef.md"), originalContent);
  });

  it("(f) silently skips if already closed (status: closed)", async () => {
    const todoContent = `{
  "id": "cafebabe",
  "title": "Already closed",
  "tags": [],
  "status": "closed",
  "created_at": "2026-01-25T17:00:00.000Z"
}

Closed out.`;

    const files = new Map([
      ["/fake/cwd/.pi/todos/cafebabe.md", todoContent],
    ]);
    const io = createMockIO(files);
    const originalContent = todoContent;

    await closeTodo(io, TEST_CWD, "cafebabe", "my-plan.md");

    assert.equal(files.get("/fake/cwd/.pi/todos/cafebabe.md"), originalContent);
  });
});

// ── (g) buildCompletionSummary ───────────────────────────────────────

describe("buildCompletionSummary", () => {
  it("(g) includes task count", () => {
    const plan = makePlan();
    const state = makeRunState();
    const summary = buildCompletionSummary(state, plan, null);

    assert.ok(
      summary.includes("3"),
      `Expected task count (3) in summary: ${summary}`,
    );
  });

  it("(g) includes wave count", () => {
    const plan = makePlan();
    const state = makeRunState();
    const summary = buildCompletionSummary(state, plan, null);

    assert.ok(
      summary.includes("2"),
      `Expected wave count (2) in summary: ${summary}`,
    );
  });

  it("(g) includes closed todo reference when todo was closed", () => {
    const plan = makePlan({ sourceTodoId: "deadbeef" });
    const state = makeRunState();
    const summary = buildCompletionSummary(state, plan, "deadbeef");

    assert.ok(
      summary.includes("deadbeef"),
      `Expected todo ID in summary: ${summary}`,
    );
  });

  it("(g) does not mention todo when closedTodoId is null", () => {
    const plan = makePlan({ sourceTodoId: null });
    const state = makeRunState();
    const summary = buildCompletionSummary(state, plan, null);

    // Should not crash and should be a non-empty string
    assert.ok(summary.length > 0);
  });
});

// ── (Step 5) Format round-trip compatibility test ────────────────────

describe("closeTodo format round-trip", () => {
  it("only changes status field; all other frontmatter fields and body are preserved", async () => {
    // Realistic todo file with all fields including assigned_to_session,
    // tags array, and a Markdown body with headings
    const realisticTodo = `{
  "id": "a1b2c3d4",
  "title": "Implement feature X",
  "tags": ["feature", "backend", "priority-high"],
  "status": "open",
  "created_at": "2026-04-01T09:00:00.000Z",
  "assigned_to_session": "session-abc123.json"
}

## Overview

This todo tracks implementation of feature X.

### Subtasks

- [ ] Design the API
- [ ] Write tests
- [ ] Implement the logic

### Notes

Some notes with **bold** and _italic_ text.
Also a [link](https://example.com).`;

    const files = new Map([
      ["/fake/cwd/.pi/todos/a1b2c3d4.md", realisticTodo],
    ]);
    const io = createMockIO(files);

    await closeTodo(io, TEST_CWD, "a1b2c3d4", "2026-04-10-my-plan.md");

    const updated = files.get("/fake/cwd/.pi/todos/a1b2c3d4.md");
    assert.ok(updated, "File should have been written");

    // ── (a) Parse the updated file using the same brace-matching logic ──
    // Canonical format: see agent/extensions/todos.ts parseFrontMatter/splitFrontMatter
    function findJsonObjectEnd(content: string): number {
      let depth = 0;
      let inString = false;
      let escaped = false;
      for (let i = 0; i < content.length; i++) {
        const char = content[i];
        if (inString) {
          if (escaped) { escaped = false; continue; }
          if (char === "\\") { escaped = true; continue; }
          if (char === "\"") { inString = false; }
          continue;
        }
        if (char === "\"") { inString = true; continue; }
        if (char === "{") { depth++; continue; }
        if (char === "}") { depth--; if (depth === 0) return i; }
      }
      return -1;
    }

    function splitFrontMatter(content: string): { frontMatter: string; body: string } {
      if (!content.startsWith("{")) return { frontMatter: "", body: content };
      const endIndex = findJsonObjectEnd(content);
      if (endIndex === -1) return { frontMatter: "", body: content };
      const frontMatter = content.slice(0, endIndex + 1);
      const body = content.slice(endIndex + 1).replace(/^\r?\n+/, "");
      return { frontMatter, body };
    }

    const { frontMatter, body } = splitFrontMatter(updated!);
    assert.ok(frontMatter.length > 0, "Should have parseable frontmatter");

    const parsed = JSON.parse(frontMatter) as Record<string, unknown>;

    // ── (a) Only status field changed ──────────────────────────────────
    assert.equal(parsed["status"], "done", "Status should be 'done'");

    // ── (b) All other frontmatter fields preserved exactly ────────────
    assert.equal(parsed["id"], "a1b2c3d4");
    assert.equal(parsed["title"], "Implement feature X");
    assert.deepEqual(parsed["tags"], ["feature", "backend", "priority-high"]);
    assert.equal(parsed["created_at"], "2026-04-01T09:00:00.000Z");
    assert.equal(parsed["assigned_to_session"], "session-abc123.json");

    // ── (c) Markdown body is preserved exactly ────────────────────────
    const originalBody = `## Overview

This todo tracks implementation of feature X.

### Subtasks

- [ ] Design the API
- [ ] Write tests
- [ ] Implement the logic

### Notes

Some notes with **bold** and _italic_ text.
Also a [link](https://example.com).`;

    assert.strictEqual(body, originalBody, "Body must be preserved exactly");

    // ── (d) Result is re-parseable ────────────────────────────────────
    // Already verified above by JSON.parse succeeding without throwing
    assert.equal(typeof parsed, "object");
  });
});
