import test, { after } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

import { PiGenerationIO } from "./io-adapter.ts";
import type {
  SubagentDispatchConfig,
  SubagentOutput,
} from "../../lib/generate-plan/types.ts";

// ── Helpers ────────────────────────────────────────────────────────────

let tmpDir: string | null = null;

async function getTempDir(): Promise<string> {
  if (!tmpDir) {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gen-io-adapter-test-"));
  }
  return tmpDir;
}

after(async () => {
  if (tmpDir) {
    await fs.rm(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
});

function makeIO(): PiGenerationIO {
  const dispatchFn = async (
    _config: SubagentDispatchConfig,
  ): Promise<SubagentOutput> => {
    return { text: "default output", exitCode: 0 };
  };
  const todoReadFn = async (
    _todoId: string,
  ): Promise<{ title: string; body: string }> => {
    return { title: "Default Todo", body: "Default body" };
  };
  return new PiGenerationIO(dispatchFn, todoReadFn);
}

// ── readFile / writeFile round-trip ────────────────────────────────────

test("readFile and writeFile round-trip through temp directory", async () => {
  const io = makeIO();
  const dir = await getTempDir();
  const filePath = path.join(dir, "round-trip.txt");
  const content = "hello world\nline 2\n";

  await io.writeFile(filePath, content);
  const read = await io.readFile(filePath);

  assert.equal(read, content);
});

// ── fileExists ─────────────────────────────────────────────────────────

test("fileExists returns true for existing file", async () => {
  const io = makeIO();
  const dir = await getTempDir();
  const filePath = path.join(dir, "exists.txt");
  await io.writeFile(filePath, "content");

  const result = await io.fileExists(filePath);
  assert.equal(result, true);
});

test("fileExists returns false for non-existent file", async () => {
  const io = makeIO();
  const dir = await getTempDir();
  const filePath = path.join(dir, "does-not-exist.txt");

  const result = await io.fileExists(filePath);
  assert.equal(result, false);
});

// ── mkdir / readdir ────────────────────────────────────────────────────

test("mkdir creates directory and readdir lists contents", async () => {
  const io = makeIO();
  const dir = await getTempDir();
  const newDir = path.join(dir, "subdir");

  await io.mkdir(newDir);

  // Verify directory exists by writing to it
  await io.writeFile(path.join(newDir, "file.txt"), "content");
  const entries = await io.readdir(newDir);

  assert.ok(
    entries.includes("file.txt"),
    `Expected 'file.txt' in entries: ${entries.join(", ")}`,
  );
});

test("mkdir is idempotent (recursive: true)", async () => {
  const io = makeIO();
  const dir = await getTempDir();
  const newDir = path.join(dir, "idempotent-subdir");

  // Should not throw on second call
  await io.mkdir(newDir);
  await assert.doesNotReject(() => io.mkdir(newDir));
});

// ── readTodo ───────────────────────────────────────────────────────────

test("readTodo delegates to todoReadFn and returns title and body", async () => {
  let capturedTodoId: string | null = null;

  const todoReadFn = async (
    todoId: string,
  ): Promise<{ title: string; body: string }> => {
    capturedTodoId = todoId;
    return { title: "Fix the bug", body: "## Steps\n1. Reproduce\n2. Fix\n" };
  };

  const io = new PiGenerationIO(
    async (_config) => ({ text: "", exitCode: 0 }),
    todoReadFn,
  );

  const result = await io.readTodo("abc-123");

  assert.equal(capturedTodoId, "abc-123");
  assert.equal(result.title, "Fix the bug");
  assert.equal(result.body, "## Steps\n1. Reproduce\n2. Fix\n");
});

test("readTodo propagates errors from todoReadFn", async () => {
  const todoReadFn = async (_todoId: string): Promise<{ title: string; body: string }> => {
    throw new Error("Todo not found");
  };

  const io = new PiGenerationIO(
    async (_config) => ({ text: "", exitCode: 0 }),
    todoReadFn,
  );

  await assert.rejects(() => io.readTodo("missing-id"), /Todo not found/);
});

// ── dispatchSubagent ───────────────────────────────────────────────────

test("dispatchSubagent delegates to provided dispatchFn and returns output", async () => {
  let capturedConfig: SubagentDispatchConfig | null = null;

  const dispatchFn = async (
    config: SubagentDispatchConfig,
  ): Promise<SubagentOutput> => {
    capturedConfig = config;
    return { text: "plan generated successfully", exitCode: 0 };
  };

  const io = new PiGenerationIO(dispatchFn, async (_id) => ({
    title: "",
    body: "",
  }));

  const config: SubagentDispatchConfig = {
    agent: "plan-generator",
    task: "Generate a plan for feature X",
    model: "claude-opus-4-5",
  };

  const result = await io.dispatchSubagent(config);

  assert.equal(result.text, "plan generated successfully");
  assert.equal(result.exitCode, 0);

  assert.ok(capturedConfig !== null);
  assert.equal((capturedConfig as SubagentDispatchConfig).agent, "plan-generator");
  assert.equal(
    (capturedConfig as SubagentDispatchConfig).task,
    "Generate a plan for feature X",
  );
  assert.equal(
    (capturedConfig as SubagentDispatchConfig).model,
    "claude-opus-4-5",
  );
});

test("dispatchSubagent works without optional model field", async () => {
  const dispatchFn = async (
    config: SubagentDispatchConfig,
  ): Promise<SubagentOutput> => {
    return { text: "ok", exitCode: 0 };
  };

  const io = new PiGenerationIO(dispatchFn, async (_id) => ({
    title: "",
    body: "",
  }));

  const config: SubagentDispatchConfig = {
    agent: "plan-reviewer",
    task: "Review the plan",
  };

  const result = await io.dispatchSubagent(config);
  assert.equal(result.text, "ok");
  assert.equal(result.exitCode, 0);
});
