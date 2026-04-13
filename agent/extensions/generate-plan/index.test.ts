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
  createTodoReadFn,
  createDispatchFn,
  registerGeneratePlanExtension,
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

test("parseInput: non-existent path with slash throws an error", async () => {
  const dir = await getTempDir();
  await assert.rejects(
    () => parseInput("docs/missing-spec.md", dir),
    /File not found: docs\/missing-spec\.md/,
  );
});

test("parseInput: input starting with . that does not exist throws an error", async () => {
  const dir = await getTempDir();
  await assert.rejects(
    () => parseInput("./nonexistent.ts", dir),
    /File not found: \.\/nonexistent\.ts/,
  );
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

// ── createTodoReadFn ────────────────────────────────────────────────

test("createTodoReadFn: reads and parses a valid todo file with JSON frontmatter and body", async () => {
  const dir = await getTempDir();
  const todosDir = path.join(dir, ".pi", "todos");
  await fs.mkdir(todosDir, { recursive: true });

  const content = '{"title":"Fix the auth bug","priority":"high"}\n\n## Steps\n1. Reproduce\n2. Fix\n';
  await fs.writeFile(path.join(todosDir, "abc123.md"), content);

  const readTodo = createTodoReadFn(dir);
  const result = await readTodo("abc123");

  assert.equal(result.title, "Fix the auth bug");
  assert.equal(result.body, "## Steps\n1. Reproduce\n2. Fix\n");
});

test("createTodoReadFn: throws when the todo file does not exist", async () => {
  const dir = await getTempDir();

  const readTodo = createTodoReadFn(dir);
  await assert.rejects(
    () => readTodo("nonexistent"),
    /Todo file not found/,
  );
});

test("createTodoReadFn: throws when the todo file has invalid JSON frontmatter", async () => {
  const dir = await getTempDir();
  const todosDir = path.join(dir, ".pi", "todos");
  await fs.mkdir(todosDir, { recursive: true });

  await fs.writeFile(path.join(todosDir, "badjson.md"), "not json at all\n\n## Body\n");

  const readTodo = createTodoReadFn(dir);
  await assert.rejects(
    () => readTodo("badjson"),
    /no JSON frontmatter/,
  );
});

test("createTodoReadFn: returns empty string for title when title field is missing", async () => {
  const dir = await getTempDir();
  const todosDir = path.join(dir, ".pi", "todos");
  await fs.mkdir(todosDir, { recursive: true });

  const content = '{"priority":"high","status":"open"}\n\nSome body text\n';
  await fs.writeFile(path.join(todosDir, "notitle.md"), content);

  const readTodo = createTodoReadFn(dir);
  const result = await readTodo("notitle");

  assert.equal(result.title, "");
  assert.equal(result.body, "Some body text\n");
});

test("createTodoReadFn: handles a todo with empty body (just JSON frontmatter)", async () => {
  const dir = await getTempDir();
  const todosDir = path.join(dir, ".pi", "todos");
  await fs.mkdir(todosDir, { recursive: true });

  const content = '{"title":"Empty body todo"}';
  await fs.writeFile(path.join(todosDir, "emptybody.md"), content);

  const readTodo = createTodoReadFn(dir);
  const result = await readTodo("emptybody");

  assert.equal(result.title, "Empty body todo");
  assert.equal(result.body, "");
});

// ── createDispatchFn ─────────────────────────────────────────────────

test("createDispatchFn: returns assistant text from spawned subagent output", async () => {
  const dir = await getTempDir();
  const agentDir = path.join(dir, "agent-dir-success");
  const agentsDir = path.join(agentDir, "agents");
  await fs.mkdir(agentsDir, { recursive: true });

  await fs.writeFile(
    path.join(agentsDir, "test-agent.md"),
    `---\nname: test-agent\ndescription: Test agent\nmodel: fake-model\ntools: read, write\n---\nSystem prompt body\n`,
  );

  const scriptPath = path.join(dir, "dispatch-success.mjs");
  await fs.writeFile(
    scriptPath,
    `process.stdout.write(JSON.stringify({type:"message_end",message:{role:"assistant",content:[{type:"text",text:"hello from subagent"}]}})+"\\n");`,
  );

  const originalArgv1 = process.argv[1];
  process.argv[1] = scriptPath;
  try {
    const dispatch = createDispatchFn(agentDir, dir);
    const result = await dispatch({ agent: "test-agent", task: "Do the work" });
    assert.equal(result.text, "hello from subagent");
    assert.equal(result.exitCode, 0);
  } finally {
    process.argv[1] = originalArgv1;
  }
});

test("createDispatchFn: includes stderr output when spawned subagent exits non-zero", async () => {
  const dir = await getTempDir();
  const agentDir = path.join(dir, "agent-dir-failure");
  const agentsDir = path.join(agentDir, "agents");
  await fs.mkdir(agentsDir, { recursive: true });

  await fs.writeFile(
    path.join(agentsDir, "test-agent.md"),
    `---\nname: test-agent\ndescription: Test agent\n---\nSystem prompt body\n`,
  );

  const scriptPath = path.join(dir, "dispatch-failure.mjs");
  await fs.writeFile(
    scriptPath,
    `process.stderr.write("spawned subagent failed badly\\n");process.exit(2);`,
  );

  const originalArgv1 = process.argv[1];
  process.argv[1] = scriptPath;
  try {
    const dispatch = createDispatchFn(agentDir, dir);
    await assert.rejects(
      () => dispatch({ agent: "test-agent", task: "Do the work" }),
      /spawned subagent failed badly/,
    );
  } finally {
    process.argv[1] = originalArgv1;
  }
});

// ── extension registration + handler wiring ─────────────────────────

test("registerGeneratePlanExtension: registers command and tool", () => {
  const registrations: { command?: { name: string; handler: Function }; tool?: { name: string; execute: Function } } = {};

  const pi = {
    registerCommand(name: string, config: { handler: Function }) {
      registrations.command = { name, handler: config.handler };
    },
    registerTool(config: { name: string; execute: Function }) {
      registrations.tool = { name: config.name, execute: config.execute };
    },
  };

  registerGeneratePlanExtension(pi as any, {
    parseInput: async () => ({ type: "freeform", text: "ignored" }),
    createIO: () => ({}) as any,
    createEngine: () => ({ generate: async () => makeResult() }) as any,
  });

  assert.equal(registrations.command?.name, "generate-plan");
  assert.equal(registrations.tool?.name, "generate_plan");
});

test("registerGeneratePlanExtension: command handler notifies error on sync failure", async () => {
  const notifications: Array<{ msg: string; level: string }> = [];
  const registrations: { command?: { handler: Function } } = {};

  const pi = {
    registerCommand(_name: string, config: { handler: Function }) {
      registrations.command = { handler: config.handler };
    },
    registerTool(_config: { name: string; execute: Function }) {},
  };

  registerGeneratePlanExtension(pi as any, {
    parseInput: async () => ({ type: "freeform", text: "build thing" }),
    createIO: () => ({}) as any,
    createEngine: () => ({
      generate: async () => {
        throw new Error("boom");
      },
    }) as any,
  });

  await registrations.command!.handler("build thing", {
    cwd: "/workspace",
    ui: { notify: (msg: string, level: string) => notifications.push({ msg, level }) },
  });

  assert.deepStrictEqual(notifications.at(-1), {
    msg: "Plan generation failed: boom",
    level: "error",
  });
});

test("registerGeneratePlanExtension: async command handler notifies start and completion", async () => {
  const notifications: Array<{ msg: string; level: string }> = [];
  const registrations: { command?: { handler: Function } } = {};

  const pi = {
    registerCommand(_name: string, config: { handler: Function }) {
      registrations.command = { handler: config.handler };
    },
    registerTool(_config: { name: string; execute: Function }) {},
  };

  registerGeneratePlanExtension(pi as any, {
    parseInput: async () => ({ type: "freeform", text: "build thing" }),
    createIO: () => ({}) as any,
    createEngine: () => ({
      generate: async (_input: unknown, callbacks: { onComplete: (result: GenerationResult) => void }) => {
        callbacks.onComplete(makeResult({ planPath: "/workspace/.pi/plans/plan.md", reviewStatus: "approved" }));
        return makeResult({ planPath: "/workspace/.pi/plans/plan.md", reviewStatus: "approved" });
      },
    }) as any,
  });

  await registrations.command!.handler("build thing --async", {
    cwd: "/workspace",
    ui: { notify: (msg: string, level: string) => notifications.push({ msg, level }) },
  });

  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.ok(
    notifications.some((n) => n.msg === "Plan generation started in background..." && n.level === "info"),
    "Expected background start notification",
  );
  assert.ok(
    notifications.some((n) => n.msg.includes("Plan generated: /workspace/.pi/plans/plan.md") && n.level === "info"),
    "Expected async completion notification with formatted result",
  );
});
