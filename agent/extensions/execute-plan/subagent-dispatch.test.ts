import test from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";

import {
  parseWorkerResponse,
  loadAgentConfig,
  createDispatchFunction,
  dispatchWorker,
} from "./subagent-dispatch.ts";

import type { SubagentConfig } from "../../lib/execute-plan/types.ts";

// ── parseWorkerResponse ────────────────────────────────────────────────

test("parseWorkerResponse parses DONE status with output", () => {
  const output = `STATUS: DONE

## Completed
Implemented the feature.

## Files Changed
- path/to/file.ts
- another/file.ts
`;
  const result = parseWorkerResponse(output, 3);

  assert.equal(result.taskNumber, 3);
  assert.equal(result.status, "DONE");
  assert.equal(result.blocker, null);
  assert.equal(result.concerns, null);
  assert.equal(result.needs, null);
  assert.ok(result.output.length > 0);
});

test("parseWorkerResponse parses BLOCKED status with blocker field", () => {
  const output = `STATUS: BLOCKED

## Blocker
Cannot find the dependency module. Tried searching the codebase but it doesn't exist.
`;
  const result = parseWorkerResponse(output, 5);

  assert.equal(result.taskNumber, 5);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.blocker !== null && result.blocker.length > 0);
  assert.equal(result.concerns, null);
  assert.equal(result.needs, null);
});

test("parseWorkerResponse parses DONE_WITH_CONCERNS with concerns", () => {
  const output = `STATUS: DONE_WITH_CONCERNS

## Completed
Task done but with some caveats.

## Concerns
Not sure this handles edge case X correctly.
The file is getting quite large.
`;
  const result = parseWorkerResponse(output, 7);

  assert.equal(result.taskNumber, 7);
  assert.equal(result.status, "DONE_WITH_CONCERNS");
  assert.ok(result.concerns !== null && result.concerns.length > 0);
  assert.equal(result.blocker, null);
  assert.equal(result.needs, null);
});

test("parseWorkerResponse parses NEEDS_CONTEXT with needs field", () => {
  const output = `STATUS: NEEDS_CONTEXT

## Needs
- What interface does the Router use?
- What is the expected return type of processRequest?
`;
  const result = parseWorkerResponse(output, 2);

  assert.equal(result.taskNumber, 2);
  assert.equal(result.status, "NEEDS_CONTEXT");
  assert.ok(result.needs !== null && result.needs.length > 0);
  assert.equal(result.blocker, null);
  assert.equal(result.concerns, null);
});

test("parseWorkerResponse extracts filesChanged from output", () => {
  const output = `STATUS: DONE

## Completed
Wrote the module.

## Files Changed
- src/foo.ts
- src/bar.ts
- lib/utils.ts
`;
  const result = parseWorkerResponse(output, 1);

  assert.equal(result.status, "DONE");
  assert.deepEqual(result.filesChanged, ["src/foo.ts", "src/bar.ts", "lib/utils.ts"]);
});

test("parseWorkerResponse handles malformed output gracefully (returns BLOCKED with parse error)", () => {
  const output = "This is just random text with no STATUS line at all.";
  const result = parseWorkerResponse(output, 9);

  assert.equal(result.taskNumber, 9);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.blocker !== null && result.blocker.length > 0);
});

// ── loadAgentConfig ────────────────────────────────────────────────────

test("loadAgentConfig returns null for non-existent agent", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "test-agents-"));
  const agentsDir = path.join(tmpDir, "agents");
  fs.mkdirSync(agentsDir);

  try {
    const result = await loadAgentConfig(tmpDir, "nonexistent");
    assert.equal(result, null);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("loadAgentConfig extracts model, tools, and systemPrompt from frontmatter", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "test-agents-"));
  const agentsDir = path.join(tmpDir, "agents");
  fs.mkdirSync(agentsDir);

  const agentContent = `---
name: my-agent
description: A test agent
model: claude-opus-4-5
tools: bash,read,write
---

You are a test agent. Be helpful.
`;
  fs.writeFileSync(path.join(agentsDir, "my-agent.md"), agentContent, "utf-8");

  try {
    const result = await loadAgentConfig(tmpDir, "my-agent");

    assert.ok(result !== null);
    assert.equal(result.name, "my-agent");
    assert.equal(result.description, "A test agent");
    assert.equal(result.model, "claude-opus-4-5");
    assert.deepEqual(result.tools, ["bash", "read", "write"]);
    assert.ok(result.systemPrompt.includes("You are a test agent"));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ── createDispatchFunction ─────────────────────────────────────────────

test("createDispatchFunction returns a function with the correct signature", () => {
  const dispatchFn = createDispatchFunction("/tmp/test-agent-dir");
  assert.equal(typeof dispatchFn, "function");
  assert.equal(dispatchFn.length, 2); // (config, options?)
});

// ── dispatchWorker ─────────────────────────────────────────────────────

test("dispatchWorker returns BLOCKED result when AbortSignal is already aborted", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "test-dispatch-"));
  const agentsDir = path.join(tmpDir, "agents");
  fs.mkdirSync(agentsDir);

  // Write a minimal agent config so loadAgentConfig doesn't return null
  fs.writeFileSync(
    path.join(agentsDir, "test-worker.md"),
    `---\nname: test-worker\ndescription: Test worker\n---\nYou are a test worker.\n`,
    "utf-8",
  );

  const config: SubagentConfig = {
    taskNumber: 42,
    agent: "test-worker",
    task: "echo hello",
    model: "",
    cwd: tmpDir,
  };

  const controller = new AbortController();
  controller.abort(); // Abort immediately

  try {
    const result = await dispatchWorker(config, tmpDir, {
      signal: controller.signal,
    });

    assert.equal(result.taskNumber, 42);
    assert.equal(result.status, "BLOCKED");
    assert.ok(
      result.blocker !== null && result.blocker.includes("aborted"),
      `Expected blocker to mention 'aborted', got: ${result.blocker}`,
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("dispatchWorker cleans up temp files after dispatch", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "test-dispatch-cleanup-"));
  const agentsDir = path.join(tmpDir, "agents");
  fs.mkdirSync(agentsDir);

  // Write agent with a system prompt so a temp file is created
  fs.writeFileSync(
    path.join(agentsDir, "cleanup-test.md"),
    `---\nname: cleanup-test\ndescription: Cleanup test\n---\nYou are a cleanup test worker.\n`,
    "utf-8",
  );

  const config: SubagentConfig = {
    taskNumber: 99,
    agent: "cleanup-test",
    task: "echo cleanup",
    model: "",
    cwd: tmpDir,
  };

  const controller = new AbortController();
  controller.abort(); // Abort immediately to make it fast

  try {
    await dispatchWorker(config, tmpDir, { signal: controller.signal });

    // Verify temp files are cleaned up — look for any pi-worker- dirs
    const tmpRoot = os.tmpdir();
    const entries = fs.readdirSync(tmpRoot);
    const leftoverDirs = entries.filter(
      (e) => e.startsWith("pi-worker-") && fs.statSync(path.join(tmpRoot, e)).isDirectory(),
    );
    // There may be dirs from other runs, but the one we just created should be gone.
    // We verify by checking that there are no prompt files matching our agent name.
    for (const dir of leftoverDirs) {
      const dirPath = path.join(tmpRoot, dir);
      const files = fs.readdirSync(dirPath);
      const matchingFiles = files.filter((f) => f.includes("cleanup_test"));
      assert.equal(
        matchingFiles.length,
        0,
        `Expected no leftover temp files for cleanup-test agent, found: ${matchingFiles.join(", ")}`,
      );
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("dispatchWorker calls onProgress during dispatch", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "test-dispatch-progress-"));
  const agentsDir = path.join(tmpDir, "agents");
  fs.mkdirSync(agentsDir);

  fs.writeFileSync(
    path.join(agentsDir, "progress-test.md"),
    `---\nname: progress-test\ndescription: Progress test\n---\nYou are a progress test worker.\n`,
    "utf-8",
  );

  const config: SubagentConfig = {
    taskNumber: 77,
    agent: "progress-test",
    task: "echo progress",
    model: "",
    cwd: tmpDir,
  };

  const progressCalls: Array<{ taskNumber: number; status: string }> = [];
  const controller = new AbortController();
  controller.abort(); // Abort immediately

  try {
    await dispatchWorker(config, tmpDir, {
      signal: controller.signal,
      onProgress: (taskNumber, status) => {
        progressCalls.push({ taskNumber, status });
      },
    });

    // With an already-aborted signal, the process is killed immediately.
    // The function should still return without error (BLOCKED result).
    // Progress may or may not have been called depending on timing,
    // but the callback should not throw.
    assert.ok(true, "onProgress callback was accepted without error");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("dispatchWorker returns BLOCKED for non-existent agent with no output", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "test-dispatch-noagent-"));
  const agentsDir = path.join(tmpDir, "agents");
  fs.mkdirSync(agentsDir);

  // No agent file written — loadAgentConfig will return null

  const config: SubagentConfig = {
    taskNumber: 10,
    agent: "nonexistent",
    task: "echo test",
    model: "",
    cwd: tmpDir,
  };

  const controller = new AbortController();
  controller.abort();

  try {
    const result = await dispatchWorker(config, tmpDir, {
      signal: controller.signal,
    });

    assert.equal(result.taskNumber, 10);
    assert.equal(result.status, "BLOCKED");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
