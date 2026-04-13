import test, { after } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

import {
  parseInput,
  formatResult,
  buildDispatchArgs,
  buildSpawnOptions,
  findJsonObjectEnd,
  createCallbacks,
} from "./index.ts";
import type { AgentConfig } from "../execute-plan/subagent-dispatch.ts";
import type { GenerationResult } from "../../lib/generate-plan/types.ts";

// ── Helpers ──────────────────────────────────────────────────────────

let tmpDir: string | null = null;

async function getTempDir(): Promise<string> {
  if (!tmpDir) {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gen-index-test-"));
  }
  return tmpDir;
}

after(async () => {
  if (tmpDir) {
    await fs.rm(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
});

function makeResult(overrides: Partial<GenerationResult> = {}): GenerationResult {
  return {
    planPath: "/tmp/plan.md",
    reviewPath: "/tmp/review.md",
    reviewStatus: "approved",
    noteCount: 0,
    remainingFindings: [],
    ...overrides,
  };
}

// ── parseInput ───────────────────────────────────────────────────────

test("parseInput: TODO pattern returns todo type with correct id", async () => {
  const result = await parseInput("TODO-abc123", "/tmp");
  assert.deepStrictEqual(result, { type: "todo", todoId: "abc123" });
});

test("parseInput: TODO pattern is case-insensitive and normalizes to lowercase", async () => {
  const result = await parseInput("todo-DEF456", "/tmp");
  assert.deepStrictEqual(result, { type: "todo", todoId: "def456" });
});

test("parseInput: existing file path returns file type", async () => {
  const dir = await getTempDir();
  const filePath = path.join(dir, "spec.md");
  await fs.writeFile(filePath, "# Spec content");

  const result = await parseInput(filePath, dir);
  assert.deepStrictEqual(result, { type: "file", filePath });
});

test("parseInput: relative file path resolved against cwd", async () => {
  const dir = await getTempDir();
  const subDir = path.join(dir, "docs");
  await fs.mkdir(subDir, { recursive: true });
  const filePath = path.join(subDir, "spec.md");
  await fs.writeFile(filePath, "# Spec");

  const result = await parseInput("docs/spec.md", dir);
  assert.deepStrictEqual(result, { type: "file", filePath });
});

test("parseInput: non-existent path-like input falls back to freeform", async () => {
  const dir = await getTempDir();
  const result = await parseInput("docs/missing-spec.md", dir);
  assert.deepStrictEqual(result, { type: "freeform", text: "docs/missing-spec.md" });
});

test("parseInput: input starting with . that does not exist falls back to freeform", async () => {
  const dir = await getTempDir();
  const result = await parseInput("./nonexistent.ts", dir);
  assert.deepStrictEqual(result, { type: "freeform", text: "./nonexistent.ts" });
});

test("parseInput: input with file extension that does not exist falls back to freeform", async () => {
  const dir = await getTempDir();
  const result = await parseInput("config.yaml", dir);
  assert.deepStrictEqual(result, { type: "freeform", text: "config.yaml" });
});

test("parseInput: freeform text returns freeform type", async () => {
  const result = await parseInput("add user authentication feature", "/tmp");
  assert.deepStrictEqual(result, {
    type: "freeform",
    text: "add user authentication feature",
  });
});

test("parseInput: freeform text is trimmed", async () => {
  const result = await parseInput("  some description  ", "/tmp");
  assert.deepStrictEqual(result, {
    type: "freeform",
    text: "some description",
  });
});

// ── formatResult ─────────────────────────────────────────────────────

test("formatResult: approved status includes execute-plan suggestion", () => {
  const result = makeResult({ reviewStatus: "approved" });
  const output = formatResult(result);

  assert.match(output, /Plan generated: \/tmp\/plan\.md/);
  assert.match(output, /Review: approved/);
  assert.match(output, /To execute this plan, run: \/execute-plan \/tmp\/plan\.md/);
  assert.ok(!output.includes("Remaining Issues"));
});

test("formatResult: approved_with_notes includes note count and execute-plan suggestion", () => {
  const result = makeResult({
    reviewStatus: "approved_with_notes",
    noteCount: 3,
  });
  const output = formatResult(result);

  assert.match(output, /approved with 3 notes appended to plan/);
  assert.match(output, /To execute this plan, run: \/execute-plan/);
  assert.ok(!output.includes("Remaining Issues"));
});

test("formatResult: approved_with_notes singular note", () => {
  const result = makeResult({
    reviewStatus: "approved_with_notes",
    noteCount: 1,
  });
  const output = formatResult(result);

  assert.match(output, /approved with 1 note appended to plan/);
});

test("formatResult: errors_found includes remaining findings and no execute-plan suggestion", () => {
  const result = makeResult({
    reviewStatus: "errors_found",
    remainingFindings: [
      {
        severity: "error",
        taskNumber: 2,
        shortDescription: "Missing dependency declaration",
        fullText: "Task 2 references lodash but it is not in package.json",
      },
      {
        severity: "warning",
        taskNumber: null,
        shortDescription: "No test coverage specified",
        fullText: "The plan does not include any test tasks",
      },
    ],
  });
  const output = formatResult(result);

  assert.match(output, /2 issues remaining after repair/);
  assert.match(output, /### Remaining Issues/);
  assert.match(output, /\[error\] Task 2: Missing dependency declaration/);
  assert.match(output, /\*\*What:\*\* Task 2 references lodash/);
  assert.match(output, /\[warning\] General: No test coverage specified/);
  assert.match(output, /Fix the issues above before executing, or manually edit the plan/);
  assert.ok(!output.includes("To execute this plan, run:"));
});

test("formatResult: errors_found with single issue uses singular", () => {
  const result = makeResult({
    reviewStatus: "errors_found",
    remainingFindings: [
      {
        severity: "error",
        taskNumber: 1,
        shortDescription: "Bad task",
        fullText: "Details here",
      },
    ],
  });
  const output = formatResult(result);

  assert.match(output, /1 issue remaining after repair/);
});

test("formatResult: includes review path when present", () => {
  const result = makeResult({ reviewPath: "/tmp/reviews/review-1.md" });
  const output = formatResult(result);

  assert.match(output, /Review details: \/tmp\/reviews\/review-1\.md/);
});

test("formatResult: omits review path line when null", () => {
  const result = makeResult({ reviewPath: null });
  const output = formatResult(result);

  assert.ok(!output.includes("Review details:"));
});

// ── buildDispatchArgs ───────────────────────────────────────────────

function makeAgentConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    name: "test-agent",
    description: "A test agent",
    model: "",
    tools: [],
    systemPrompt: "",
    ...overrides,
  };
}

test("buildDispatchArgs: baseline args without model, tools, or system prompt", () => {
  const args = buildDispatchArgs(null, { agent: "planner", task: "do stuff" }, null);
  assert.deepStrictEqual(args, ["--mode", "json", "-p", "--no-session", "do stuff"]);
});

test("buildDispatchArgs: includes model from config.model when set", () => {
  const args = buildDispatchArgs(null, { agent: "planner", task: "t", model: "gpt-4" }, null);
  assert.ok(args.includes("--model"));
  assert.equal(args[args.indexOf("--model") + 1], "gpt-4");
});

test("buildDispatchArgs: falls back to agentConfig.model when config.model is unset", () => {
  const ac = makeAgentConfig({ model: "claude-sonnet" });
  const args = buildDispatchArgs(ac, { agent: "planner", task: "t" }, null);
  assert.ok(args.includes("--model"));
  assert.equal(args[args.indexOf("--model") + 1], "claude-sonnet");
});

test("buildDispatchArgs: config.model takes precedence over agentConfig.model", () => {
  const ac = makeAgentConfig({ model: "claude-sonnet" });
  const args = buildDispatchArgs(ac, { agent: "planner", task: "t", model: "gpt-4" }, null);
  assert.equal(args[args.indexOf("--model") + 1], "gpt-4");
});

test("buildDispatchArgs: omits --model when neither source provides one", () => {
  const ac = makeAgentConfig({ model: "" });
  const args = buildDispatchArgs(ac, { agent: "planner", task: "t" }, null);
  assert.ok(!args.includes("--model"));
});

test("buildDispatchArgs: includes --tools from agentConfig", () => {
  const ac = makeAgentConfig({ tools: ["read", "write", "bash"] });
  const args = buildDispatchArgs(ac, { agent: "planner", task: "t" }, null);
  assert.ok(args.includes("--tools"));
  assert.equal(args[args.indexOf("--tools") + 1], "read,write,bash");
});

test("buildDispatchArgs: omits --tools when agent has empty tools array", () => {
  const ac = makeAgentConfig({ tools: [] });
  const args = buildDispatchArgs(ac, { agent: "planner", task: "t" }, null);
  assert.ok(!args.includes("--tools"));
});

test("buildDispatchArgs: includes --append-system-prompt when path is provided", () => {
  const args = buildDispatchArgs(null, { agent: "planner", task: "t" }, "/tmp/prompt.md");
  assert.ok(args.includes("--append-system-prompt"));
  assert.equal(args[args.indexOf("--append-system-prompt") + 1], "/tmp/prompt.md");
});

test("buildDispatchArgs: omits --append-system-prompt when path is null", () => {
  const args = buildDispatchArgs(null, { agent: "planner", task: "t" }, null);
  assert.ok(!args.includes("--append-system-prompt"));
});

test("buildDispatchArgs: task is always the last argument", () => {
  const ac = makeAgentConfig({ model: "m", tools: ["read"] });
  const args = buildDispatchArgs(ac, { agent: "planner", task: "my task text" }, "/tmp/p.md");
  assert.equal(args[args.length - 1], "my task text");
});

// ── buildSpawnOptions ───────────────────────────────────────────────

test("buildSpawnOptions: propagates cwd correctly", () => {
  const opts = buildSpawnOptions("/my/workspace");
  assert.equal(opts.cwd, "/my/workspace");
});

test("buildSpawnOptions: shell is false", () => {
  const opts = buildSpawnOptions("/tmp");
  assert.equal(opts.shell, false);
});

test("buildSpawnOptions: stdio configuration is correct", () => {
  const opts = buildSpawnOptions("/tmp");
  assert.deepStrictEqual(opts.stdio, ["ignore", "pipe", "pipe"]);
});

// ── findJsonObjectEnd ───────────────────────────────────────────────

test("findJsonObjectEnd: simple object", () => {
  const result = findJsonObjectEnd('{"title":"hello"}');
  assert.equal(result, 16);
});

test("findJsonObjectEnd: nested braces", () => {
  const content = '{"a":{"b":"c"}}rest';
  const result = findJsonObjectEnd(content);
  assert.equal(result, 14);
  assert.equal(content.slice(0, result + 1), '{"a":{"b":"c"}}');
});

test("findJsonObjectEnd: braces inside string values are ignored", () => {
  const content = '{"title":"has {braces} inside"}body';
  const result = findJsonObjectEnd(content);
  assert.equal(content.slice(0, result + 1), '{"title":"has {braces} inside"}');
});

test("findJsonObjectEnd: escaped quotes inside strings", () => {
  const content = '{"title":"say \\"hello\\""}rest';
  const result = findJsonObjectEnd(content);
  assert.equal(content.slice(0, result + 1), '{"title":"say \\"hello\\""}');
});

test("findJsonObjectEnd: returns -1 for empty string", () => {
  assert.equal(findJsonObjectEnd(""), -1);
});

test("findJsonObjectEnd: returns -1 for unclosed object", () => {
  assert.equal(findJsonObjectEnd('{"title":"hello"'), -1);
});

test("findJsonObjectEnd: returns -1 for no object at all", () => {
  assert.equal(findJsonObjectEnd("just plain text"), -1);
});

test("findJsonObjectEnd: handles escaped backslash before closing quote", () => {
  // The value ends with a literal backslash: "path\\"
  // The \\\\ in the source is two escaped backslashes = two literal \
  // Actually let's be precise: "path\\\\" is the source literal for path\\
  const content = '{"path":"c:\\\\dir\\\\file"}rest';
  const result = findJsonObjectEnd(content);
  assert.ok(result > 0);
  const parsed = JSON.parse(content.slice(0, result + 1));
  assert.equal(parsed.path, "c:\\dir\\file");
});

// ── createCallbacks ─────────────────────────────────────────────────

test("createCallbacks: onProgress calls notify with 'info' level", () => {
  const calls: Array<{ msg: string; level: string }> = [];
  const notify = (msg: string, level: string) => calls.push({ msg, level });

  const callbacks = createCallbacks(notify, false);
  callbacks.onProgress("Generating plan...");

  assert.equal(calls.length, 1);
  assert.deepStrictEqual(calls[0], { msg: "Generating plan...", level: "info" });
});

test("createCallbacks: onWarning calls notify with 'warning' level", () => {
  const calls: Array<{ msg: string; level: string }> = [];
  const notify = (msg: string, level: string) => calls.push({ msg, level });

  const callbacks = createCallbacks(notify, false);
  callbacks.onWarning("Model fallback occurred");

  assert.equal(calls.length, 1);
  assert.deepStrictEqual(calls[0], { msg: "Model fallback occurred", level: "warning" });
});

test("createCallbacks: sync mode onComplete does NOT call notify", () => {
  const calls: Array<{ msg: string; level: string }> = [];
  const notify = (msg: string, level: string) => calls.push({ msg, level });

  const callbacks = createCallbacks(notify, false);
  callbacks.onComplete(makeResult());

  assert.equal(calls.length, 0);
});

test("createCallbacks: async mode onComplete DOES call notify with formatted result", () => {
  const calls: Array<{ msg: string; level: string }> = [];
  const notify = (msg: string, level: string) => calls.push({ msg, level });

  const result = makeResult({ planPath: "/workspace/plan.md", reviewStatus: "approved" });
  const callbacks = createCallbacks(notify, true);
  callbacks.onComplete(result);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].level, "info");
  assert.match(calls[0].msg, /Plan generated: \/workspace\/plan\.md/);
  assert.match(calls[0].msg, /Review: approved/);
});

test("createCallbacks: async onComplete formats errors_found results correctly", () => {
  const calls: Array<{ msg: string; level: string }> = [];
  const notify = (msg: string, level: string) => calls.push({ msg, level });

  const result = makeResult({
    reviewStatus: "errors_found",
    remainingFindings: [
      { severity: "error", taskNumber: 1, shortDescription: "Bad", fullText: "Details" },
    ],
  });
  const callbacks = createCallbacks(notify, true);
  callbacks.onComplete(result);

  assert.equal(calls.length, 1);
  assert.match(calls[0].msg, /Remaining Issues/);
});

test("createCallbacks: onProgress and onWarning work in both sync and async modes", () => {
  for (const isAsync of [true, false]) {
    const calls: Array<{ msg: string; level: string }> = [];
    const notify = (msg: string, level: string) => calls.push({ msg, level });

    const callbacks = createCallbacks(notify, isAsync);
    callbacks.onProgress("progress");
    callbacks.onWarning("warning");

    assert.equal(calls.length, 2, `Expected 2 calls in isAsync=${isAsync} mode`);
    assert.deepStrictEqual(calls[0], { msg: "progress", level: "info" });
    assert.deepStrictEqual(calls[1], { msg: "warning", level: "warning" });
  }
});
