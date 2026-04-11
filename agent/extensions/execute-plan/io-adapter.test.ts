import test, { after } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

import { PiExecutionIO } from "./io-adapter.ts";
import type { SubagentConfig, SubagentResult } from "../../lib/execute-plan/types.ts";

// ── Helpers ────────────────────────────────────────────────────────────

let tmpDir: string | null = null;

async function getTempDir(): Promise<string> {
  if (!tmpDir) {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "io-adapter-test-"));
  }
  return tmpDir;
}

after(async () => {
  if (tmpDir) {
    await fs.rm(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
});

function makeIO(sessionId = "test-session"): PiExecutionIO {
  const dispatchFn = async (
    config: SubagentConfig,
    _options?: { signal?: AbortSignal; onProgress?: (taskNumber: number, status: string) => void },
  ): Promise<SubagentResult> => {
    return {
      taskNumber: config.taskNumber,
      status: "DONE",
      output: "done",
      concerns: null,
      needs: null,
      blocker: null,
      filesChanged: [],
    };
  };
  return new PiExecutionIO(dispatchFn, sessionId);
}

// ── exec tests ─────────────────────────────────────────────────────────

test("exec captures stdout from echo command", async () => {
  const io = makeIO();
  const dir = await getTempDir();
  const result = await io.exec("echo", ["hello"], dir);

  assert.equal(result.stdout, "hello\n");
  assert.equal(result.stderr, "");
  assert.equal(result.exitCode, 0);
});

test("exec returns non-zero exit code without throwing", async () => {
  const io = makeIO();
  const dir = await getTempDir();
  const result = await io.exec("node", ["-e", "process.exit(1)"], dir);

  assert.equal(result.exitCode, 1);
});

test("exec captures stderr", async () => {
  const io = makeIO();
  const dir = await getTempDir();
  const result = await io.exec("node", ["-e", "console.error('err')"], dir);

  assert.ok(result.stderr.includes("err"), `Expected stderr to contain 'err', got: ${result.stderr}`);
});

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

  assert.ok(entries.includes("file.txt"), `Expected 'file.txt' in entries: ${entries.join(", ")}`);
});

// ── rename / unlink ────────────────────────────────────────────────────

test("rename moves file to new location", async () => {
  const io = makeIO();
  const dir = await getTempDir();
  const src = path.join(dir, "rename-src.txt");
  const dest = path.join(dir, "rename-dest.txt");

  await io.writeFile(src, "to be moved");
  await io.rename(src, dest);

  assert.equal(await io.fileExists(src), false);
  assert.equal(await io.fileExists(dest), true);
  assert.equal(await io.readFile(dest), "to be moved");
});

test("unlink removes a file", async () => {
  const io = makeIO();
  const dir = await getTempDir();
  const filePath = path.join(dir, "to-delete.txt");

  await io.writeFile(filePath, "delete me");
  assert.equal(await io.fileExists(filePath), true);

  await io.unlink(filePath);
  assert.equal(await io.fileExists(filePath), false);
});

// ── dispatchSubagent ───────────────────────────────────────────────────

test("dispatchSubagent delegates to provided dispatchFn", async () => {
  let capturedConfig: SubagentConfig | null = null;
  let capturedOptions: { signal?: AbortSignal; onProgress?: (taskNumber: number, status: string) => void } | undefined;

  const dispatchFn = async (
    config: SubagentConfig,
    options?: { signal?: AbortSignal; onProgress?: (taskNumber: number, status: string) => void },
  ): Promise<SubagentResult> => {
    capturedConfig = config;
    capturedOptions = options;
    return {
      taskNumber: config.taskNumber,
      status: "DONE",
      output: "dispatched",
      concerns: null,
      needs: null,
      blocker: null,
      filesChanged: ["a.ts"],
    };
  };

  const io = new PiExecutionIO(dispatchFn, "my-session");

  const config: SubagentConfig = {
    agent: "worker",
    taskNumber: 5,
    task: "do something",
    model: "claude-opus-4-5",
    cwd: "/tmp",
  };
  const controller = new AbortController();
  const onProgress = (n: number, s: string) => {};

  const result = await io.dispatchSubagent(config, {
    signal: controller.signal,
    onProgress,
  });

  assert.equal(result.status, "DONE");
  assert.equal(result.taskNumber, 5);
  assert.deepEqual(result.filesChanged, ["a.ts"]);

  assert.ok(capturedConfig !== null);
  assert.equal((capturedConfig as SubagentConfig).taskNumber, 5);
  assert.equal(capturedOptions?.signal, controller.signal);
  assert.equal(capturedOptions?.onProgress, onProgress);
});

// ── getPid / getSessionId ──────────────────────────────────────────────

test("getPid returns process.pid", () => {
  const io = makeIO();
  assert.equal(io.getPid(), process.pid);
});

test("getSessionId returns the provided sessionId", () => {
  const io = makeIO("session-abc-123");
  assert.equal(io.getSessionId(), "session-abc-123");
});
