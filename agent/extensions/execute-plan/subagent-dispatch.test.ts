import test from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";

import {
  parseWorkerResponse,
  loadAgentConfig,
} from "./subagent-dispatch.ts";

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
