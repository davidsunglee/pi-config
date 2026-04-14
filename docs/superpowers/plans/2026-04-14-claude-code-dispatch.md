# Claude Code Dispatch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable the pi subagent extension to dispatch tasks via the Claude Code CLI instead of pi, and configure the planning/execution skills to use it for Anthropic model tasks.

**Architecture:** Two layers — (1) the subagent extension gains a `dispatch` property that controls which CLI is spawned (`pi` or `claude`), with Claude-specific arg building and output parsing; (2) `models.json` gains a `dispatch` map that skills read to determine which backend to use per provider.

**Tech Stack:** TypeScript, pi extension API (`@mariozechner/pi-coding-agent`), Claude Code CLI, node:child_process

**Source:** TODO-97a8b7b4

---

## File Structure

- Modify: `agent/extensions/subagent/agents.ts` — add `dispatch` and `permissionMode` to `AgentConfig`, parse from frontmatter
- Create: `agent/extensions/subagent/claude-dispatch.ts` — model translation, arg building, output parsing for Claude Code CLI
- Create: `agent/extensions/subagent/claude-dispatch.test.ts` — unit tests for the above
- Modify: `agent/extensions/subagent/index.ts` — branch on `dispatch` in `runSingleAgent`, add `dispatch`/`permissionMode` to `SubagentParams` schema
- Modify: `agent/models.json` — add `dispatch` section mapping providers to CLI backends
- Modify: `agent/skills/generate-plan/SKILL.md` — add dispatch resolution after model tier resolution, pass `dispatch` override in subagent calls
- Modify: `agent/skills/execute-plan/SKILL.md` — same as generate-plan

**Note:** The subagent extension files assume the built-in pi subagent framework is already set up locally. That setup is a separate TODO. This plan adds dispatch support on top of it.

## Dependencies

- Task 3 depends on: Task 1, Task 2
- Task 5 depends on: Task 4
- Task 6 depends on: Task 4

---

### Task 1: Add dispatch and permissionMode to agent discovery

**Files:**
- Modify: `agent/extensions/subagent/agents.ts`

**Model recommendation:** cheap

- [ ] **Step 1: Add fields to AgentConfig interface**

In `agents.ts`, add `dispatch` and `permissionMode` to the `AgentConfig` interface:

```typescript
export interface AgentConfig {
    name: string;
    description: string;
    tools?: string[];
    model?: string;
    dispatch?: string;         // "pi" | "claude" — default: "pi"
    permissionMode?: string;   // "auto" | "bypassPermissions" | "plan" — default: "auto"
    systemPrompt: string;
    source: "user" | "project";
    filePath: string;
}
```

- [ ] **Step 2: Parse new fields from frontmatter**

In the `loadAgentsFromDir()` function, where agent configs are built from parsed frontmatter, add:

```typescript
agents.push({
    name: frontmatter.name,
    description: frontmatter.description,
    tools: tools && tools.length > 0 ? tools : undefined,
    model: frontmatter.model,
    dispatch: frontmatter.dispatch,           // add this
    permissionMode: frontmatter.permissionMode, // add this
    systemPrompt: body,
    source,
    filePath,
});
```

No validation is needed here — the subagent extension validates the values when it uses them.

- [ ] **Step 3: Verify with an agent definition**

Create or update a test agent definition to include the new fields. For example, verify that reading this frontmatter:

```yaml
---
name: test-agent
description: Test agent with claude dispatch
model: claude-sonnet-4-6
dispatch: claude
permissionMode: auto
---
System prompt here.
```

produces an `AgentConfig` with `dispatch: "claude"` and `permissionMode: "auto"`.

- [ ] **Step 4: Commit**

```bash
git add agent/extensions/subagent/agents.ts
git commit -m "feat(subagent): add dispatch and permissionMode to AgentConfig"
```

---

### Task 2: Create Claude Code dispatch utilities

**Files:**
- Create: `agent/extensions/subagent/claude-dispatch.ts`
- Create: `agent/extensions/subagent/claude-dispatch.test.ts`

**Model recommendation:** standard

- [ ] **Step 1: Write failing tests for model translation**

Create `agent/extensions/subagent/claude-dispatch.test.ts`:

```typescript
import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { stripProviderPrefix, buildClaudeArgs, parseClaudeResult } from "./claude-dispatch.ts";

describe("stripProviderPrefix", () => {
    it("strips anthropic/ prefix", () => {
        assert.equal(stripProviderPrefix("anthropic/claude-opus-4-6"), "claude-opus-4-6");
    });

    it("strips any provider prefix", () => {
        assert.equal(stripProviderPrefix("openai-codex/gpt-5.4"), "gpt-5.4");
    });

    it("returns model as-is when no prefix", () => {
        assert.equal(stripProviderPrefix("claude-opus-4-6"), "claude-opus-4-6");
    });

    it("handles undefined model", () => {
        assert.equal(stripProviderPrefix(undefined), undefined);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --experimental-strip-types --test agent/extensions/subagent/claude-dispatch.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement stripProviderPrefix**

Create `agent/extensions/subagent/claude-dispatch.ts`:

```typescript
/**
 * Claude Code CLI dispatch utilities.
 *
 * Handles model translation, CLI argument building, and output parsing
 * for dispatching subagent tasks via the `claude` CLI instead of `pi`.
 */

/**
 * Strip the provider prefix from a pi-normalized model string.
 * "anthropic/claude-opus-4-6" → "claude-opus-4-6"
 */
export function stripProviderPrefix(model: string | undefined): string | undefined {
    if (!model) return undefined;
    const slashIndex = model.indexOf("/");
    return slashIndex !== -1 ? model.substring(slashIndex + 1) : model;
}
```

- [ ] **Step 4: Run tests to verify stripProviderPrefix passes**

```bash
node --experimental-strip-types --test agent/extensions/subagent/claude-dispatch.test.ts
```

Expected: PASS for all stripProviderPrefix tests.

- [ ] **Step 5: Write failing tests for buildClaudeArgs**

Add to `claude-dispatch.test.ts`:

```typescript
describe("buildClaudeArgs", () => {
    it("builds basic args with model and permission mode", () => {
        const result = buildClaudeArgs({
            task: "Do something",
            model: "anthropic/claude-sonnet-4-6",
            permissionMode: "auto",
        });
        assert.deepEqual(result.args, [
            "-p",
            "--output-format", "json",
            "--no-session-persistence",
            "--model", "claude-sonnet-4-6",
            "--permission-mode", "auto",
            "Do something",
        ]);
        assert.equal(result.tempDir, undefined);
    });

    it("defaults permissionMode to auto", () => {
        const result = buildClaudeArgs({
            task: "Do something",
            model: "anthropic/claude-opus-4-6",
        });
        assert.ok(result.args.includes("auto"));
    });

    it("writes system prompt to temp file", () => {
        const result = buildClaudeArgs({
            task: "Do something",
            model: "anthropic/claude-opus-4-6",
            systemPrompt: "You are a coder.",
        });
        assert.ok(result.args.some(a => a === "--system-prompt"));
        assert.ok(result.tempDir !== undefined);
    });

    it("omits --model when model is undefined", () => {
        const result = buildClaudeArgs({ task: "Do something" });
        assert.ok(!result.args.includes("--model"));
    });
});
```

- [ ] **Step 6: Run tests to verify they fail**

```bash
node --experimental-strip-types --test agent/extensions/subagent/claude-dispatch.test.ts
```

Expected: FAIL — buildClaudeArgs not exported.

- [ ] **Step 7: Implement buildClaudeArgs**

Add to `claude-dispatch.ts`:

```typescript
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface BuildClaudeArgsInput {
    task: string;
    model?: string;
    permissionMode?: string;
    systemPrompt?: string;
}

export interface BuildClaudeArgsResult {
    args: string[];
    tempDir?: string;
}

/**
 * Build CLI arguments for spawning the `claude` command.
 */
export function buildClaudeArgs(input: BuildClaudeArgsInput): BuildClaudeArgsResult {
    const args: string[] = ["-p", "--output-format", "json", "--no-session-persistence"];
    let tempDir: string | undefined;

    const nativeModel = stripProviderPrefix(input.model);
    if (nativeModel) {
        args.push("--model", nativeModel);
    }

    args.push("--permission-mode", input.permissionMode || "auto");

    if (input.systemPrompt) {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-claude-dispatch-"));
        const promptPath = path.join(tempDir, "system-prompt.md");
        fs.writeFileSync(promptPath, input.systemPrompt, { mode: 0o600 });
        args.push("--system-prompt", promptPath);
    }

    args.push(input.task);

    return { args, tempDir };
}
```

- [ ] **Step 8: Run tests to verify buildClaudeArgs passes**

```bash
node --experimental-strip-types --test agent/extensions/subagent/claude-dispatch.test.ts
```

Expected: PASS for all tests.

- [ ] **Step 9: Write failing tests for parseClaudeResult**

Add to `claude-dispatch.test.ts`:

```typescript
describe("parseClaudeResult", () => {
    it("parses successful result", () => {
        const json = {
            type: "result",
            subtype: "success",
            is_error: false,
            result: "STATUS: DONE\n\n## Completed\nDid the thing.",
            stop_reason: "end_turn",
            total_cost_usd: 0.05,
            duration_ms: 12000,
            num_turns: 3,
            usage: {
                input_tokens: 1000,
                output_tokens: 500,
                cache_read_input_tokens: 200,
                cache_creation_input_tokens: 800,
            },
        };
        const result = parseClaudeResult(json);
        assert.equal(result.exitCode, 0);
        assert.equal(result.finalOutput, json.result);
        assert.equal(result.usage.input, 1000);
        assert.equal(result.usage.output, 500);
        assert.equal(result.usage.cacheRead, 200);
        assert.equal(result.usage.cacheWrite, 800);
        assert.equal(result.usage.cost, 0.05);
        assert.equal(result.usage.turns, 3);
        assert.equal(result.messages.length, 1);
        assert.equal(result.messages[0].role, "assistant");
    });

    it("parses error result", () => {
        const json = {
            type: "result",
            subtype: "error",
            is_error: true,
            result: "Something went wrong",
            stop_reason: "error",
            total_cost_usd: 0.01,
            duration_ms: 2000,
            num_turns: 1,
            usage: {
                input_tokens: 100,
                output_tokens: 50,
                cache_read_input_tokens: 0,
                cache_creation_input_tokens: 0,
            },
        };
        const result = parseClaudeResult(json);
        assert.equal(result.exitCode, 1);
        assert.equal(result.error, "Something went wrong");
    });

    it("handles missing usage gracefully", () => {
        const json = {
            type: "result",
            subtype: "success",
            is_error: false,
            result: "hello",
            stop_reason: "end_turn",
            total_cost_usd: 0,
            duration_ms: 1000,
            num_turns: 1,
            usage: {},
        };
        const result = parseClaudeResult(json);
        assert.equal(result.exitCode, 0);
        assert.equal(result.usage.input, 0);
        assert.equal(result.usage.output, 0);
    });
});
```

- [ ] **Step 10: Run tests to verify they fail**

```bash
node --experimental-strip-types --test agent/extensions/subagent/claude-dispatch.test.ts
```

Expected: FAIL — parseClaudeResult not exported.

- [ ] **Step 11: Implement parseClaudeResult**

Add to `claude-dispatch.ts`:

```typescript
import type { Message } from "@mariozechner/pi-ai";

export interface ClaudeUsage {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    cost: number;
    contextTokens: number;
    turns: number;
}

export interface ClaudeResult {
    exitCode: number;
    finalOutput: string;
    messages: Message[];
    usage: ClaudeUsage;
    error?: string;
    model?: string;
}

/**
 * Parse Claude Code's JSON output into a structured result.
 */
export function parseClaudeResult(json: Record<string, any>): ClaudeResult {
    const isError = json.is_error === true || json.subtype === "error";
    const resultText = (json.result as string) || "";
    const usage = json.usage || {};

    const claudeUsage: ClaudeUsage = {
        input: usage.input_tokens || 0,
        output: usage.output_tokens || 0,
        cacheRead: usage.cache_read_input_tokens || 0,
        cacheWrite: usage.cache_creation_input_tokens || 0,
        cost: json.total_cost_usd || 0,
        contextTokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
        turns: json.num_turns || 0,
    };

    // Construct a synthetic assistant message so getFinalOutput() works
    const messages: Message[] = [{
        role: "assistant" as const,
        content: [{ type: "text" as const, text: resultText }],
        api: "anthropic-messages" as any,
        provider: "anthropic",
        model: json.model || "unknown",
        usage: {
            input: claudeUsage.input,
            output: claudeUsage.output,
            cacheRead: claudeUsage.cacheRead,
            cacheWrite: claudeUsage.cacheWrite,
            totalTokens: claudeUsage.contextTokens,
            cost: {
                input: 0,
                output: 0,
                cacheRead: 0,
                cacheWrite: 0,
                total: claudeUsage.cost,
            },
        },
        stopReason: isError ? "error" : "stop",
        timestamp: Date.now(),
    }];

    return {
        exitCode: isError ? 1 : 0,
        finalOutput: resultText,
        messages,
        usage: claudeUsage,
        error: isError ? resultText : undefined,
        model: json.model,
    };
}
```

- [ ] **Step 12: Run all tests to verify they pass**

```bash
node --experimental-strip-types --test agent/extensions/subagent/claude-dispatch.test.ts
```

Expected: PASS for all tests.

- [ ] **Step 13: Add cleanupTempDir utility**

Add to `claude-dispatch.ts`:

```typescript
export function cleanupTempDir(tempDir: string | undefined): void {
    if (!tempDir) return;
    try {
        fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
        // Temp cleanup is best effort.
    }
}
```

- [ ] **Step 14: Commit**

```bash
git add agent/extensions/subagent/claude-dispatch.ts agent/extensions/subagent/claude-dispatch.test.ts
git commit -m "feat(subagent): add Claude Code dispatch utilities

Model translation, arg building, and output parsing for spawning
the claude CLI instead of pi."
```

---

### Task 3: Wire dispatch into subagent execution

**Files:**
- Modify: `agent/extensions/subagent/index.ts`

**Model recommendation:** capable

This task modifies `runSingleAgent` to branch on the `dispatch` value and spawn either `pi` or `claude`. It also adds `dispatch` and `permissionMode` to the subagent tool's parameter schema.

- [ ] **Step 1: Add getClaudeInvocation function**

In `index.ts`, alongside the existing `getPiInvocation`, add:

```typescript
function getClaudeInvocation(args: string[]): { command: string; args: string[] } {
    return { command: "claude", args };
}
```

- [ ] **Step 2: Import Claude dispatch utilities**

At the top of `index.ts`:

```typescript
import { buildClaudeArgs, parseClaudeResult, cleanupTempDir as cleanupClaudeTempDir } from "./claude-dispatch.ts";
```

- [ ] **Step 3: Resolve dispatch value in runSingleAgent**

At the beginning of `runSingleAgent`, after the agent is found, resolve the effective dispatch and permission mode. Add a `dispatch` and `permissionMode` parameter to the function signature (passed from the caller). The resolution follows the precedence: invocation override > agent frontmatter > default "pi".

Add parameters to the function signature:

```typescript
async function runSingleAgent(
    defaultCwd: string,
    agents: AgentConfig[],
    agentName: string,
    task: string,
    cwd: string | undefined,
    step: number | undefined,
    signal: AbortSignal | undefined,
    onUpdate: OnUpdateCallback | undefined,
    makeDetails: (results: SingleResult[]) => SubagentDetails,
    dispatch?: string,        // add this
    permissionMode?: string,  // add this
): Promise<SingleResult> {
```

After the agent is found, resolve:

```typescript
const effectiveDispatch = dispatch || agent.dispatch || "pi";
const effectivePermissionMode = permissionMode || agent.permissionMode || "auto";
```

- [ ] **Step 4: Branch on dispatch for arg building and process spawning**

Replace the current arg building and spawn logic with a dispatch branch. The existing pi logic stays as-is inside the `pi` branch. The `claude` branch uses the new utilities.

After resolving dispatch, branch:

```typescript
if (effectiveDispatch === "claude") {
    // Claude Code dispatch
    const claudeArgs = buildClaudeArgs({
        task,
        model: agent.model,
        permissionMode: effectivePermissionMode,
        systemPrompt: agent.systemPrompt.trim() || undefined,
    });

    const invocation = getClaudeInvocation(claudeArgs.args);
    const exitCode = await new Promise<number>((resolve) => {
        const proc = spawn(invocation.command, invocation.args, {
            cwd: cwd ?? defaultCwd,
            shell: false,
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";

        proc.stdout.on("data", (d) => { stdout += d.toString(); });
        proc.stderr.on("data", (d) => { stderr += d.toString(); });
        proc.on("close", (code) => {
            cleanupClaudeTempDir(claudeArgs.tempDir);
            resolve(code ?? 0);
        });
        proc.on("error", (error) => {
            cleanupClaudeTempDir(claudeArgs.tempDir);
            if (error && (error as NodeJS.ErrnoException).code === "ENOENT") {
                currentResult.stderr = "Claude Code CLI not found. Install it or set dispatch to 'pi'.";
            } else {
                currentResult.stderr = error instanceof Error ? error.message : String(error);
            }
            resolve(1);
        });

        if (signal) {
            const kill = () => {
                proc.kill("SIGTERM");
                setTimeout(() => !proc.killed && proc.kill("SIGKILL"), 5000);
            };
            if (signal.aborted) kill();
            else signal.addEventListener("abort", kill, { once: true });
        }
    });

    if (exitCode !== 0 && !currentResult.stderr) {
        currentResult.stderr = stderr || "(claude exited with non-zero code)";
    }
    currentResult.exitCode = exitCode;

    // Parse the JSON result from stdout
    if (stdout.trim()) {
        try {
            const json = JSON.parse(stdout.trim());
            const parsed = parseClaudeResult(json);
            currentResult.exitCode = parsed.exitCode;
            currentResult.messages = parsed.messages;
            currentResult.usage = parsed.usage;
            currentResult.model = parsed.model;
            if (parsed.error) currentResult.stderr = parsed.error;
        } catch {
            // stdout wasn't valid JSON — treat as raw text output
            currentResult.messages = [{
                role: "assistant",
                content: [{ type: "text", text: stdout.trim() }],
                api: "anthropic-messages" as any,
                provider: "anthropic",
                model: "unknown",
                usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
                stopReason: "stop",
                timestamp: Date.now(),
            }];
        }
    }
    emitUpdate();
    return currentResult;
}

// Existing pi dispatch logic follows (unchanged)...
```

- [ ] **Step 5: Add dispatch and permissionMode to SubagentParams**

In the `SubagentParams` schema definition, add:

```typescript
const SubagentParams = Type.Object({
    agent: Type.Optional(Type.String({ description: "Name of the agent to invoke (for single mode)" })),
    task: Type.Optional(Type.String({ description: "Task to delegate (for single mode)" })),
    tasks: Type.Optional(Type.Array(TaskItem, { description: "Array of {agent, task} for parallel execution" })),
    chain: Type.Optional(Type.Array(ChainItem, { description: "Array of {agent, task} for sequential execution" })),
    agentScope: Type.Optional(AgentScopeSchema),
    confirmProjectAgents: Type.Optional(
        Type.Boolean({ description: "Prompt before running project-local agents. Default: true.", default: true }),
    ),
    cwd: Type.Optional(Type.String({ description: "Working directory for the agent process (single mode)" })),
    dispatch: Type.Optional(Type.String({ description: 'CLI to spawn: "pi" (default) or "claude"' })),
    permissionMode: Type.Optional(Type.String({ description: 'Claude Code permission mode: "auto" (default), "bypassPermissions", or "plan"' })),
});
```

Also add `dispatch` and `permissionMode` to `TaskItem` so parallel dispatch supports per-task overrides:

```typescript
const TaskItem = Type.Object({
    agent: Type.String({ description: "Name of the agent to invoke" }),
    task: Type.String({ description: "Task to delegate to the agent" }),
    cwd: Type.Optional(Type.String({ description: "Working directory for the agent process" })),
    dispatch: Type.Optional(Type.String({ description: 'CLI to spawn: "pi" (default) or "claude"' })),
    permissionMode: Type.Optional(Type.String({ description: 'Claude Code permission mode' })),
});
```

And `ChainItem`:

```typescript
const ChainItem = Type.Object({
    agent: Type.String({ description: "Name of the agent to invoke" }),
    task: Type.String({ description: "Task with optional {previous} placeholder for prior output" }),
    cwd: Type.Optional(Type.String({ description: "Working directory for the agent process" })),
    dispatch: Type.Optional(Type.String({ description: 'CLI to spawn: "pi" (default) or "claude"' })),
    permissionMode: Type.Optional(Type.String({ description: 'Claude Code permission mode' })),
});
```

- [ ] **Step 6: Pass dispatch and permissionMode through to runSingleAgent**

Update all call sites of `runSingleAgent` to pass the new parameters. In the single mode:

```typescript
const result = await runSingleAgent(
    ctx.cwd, agents, params.agent, params.task, params.cwd, undefined, signal, onUpdate, makeDetails("single"),
    params.dispatch, params.permissionMode,
);
```

In parallel mode (inside the `mapWithConcurrencyLimit` callback):

```typescript
const result = await runSingleAgent(
    ctx.cwd, agents, t.agent, t.task, t.cwd, undefined, signal,
    /* per-task update callback */,
    makeDetails("parallel"),
    t.dispatch || params.dispatch,
    t.permissionMode || params.permissionMode,
);
```

In chain mode:

```typescript
const result = await runSingleAgent(
    ctx.cwd, agents, step.agent, taskWithContext, step.cwd, i + 1, signal, chainUpdate, makeDetails("chain"),
    step.dispatch || params.dispatch,
    step.permissionMode || params.permissionMode,
);
```

- [ ] **Step 7: Update tool description to mention dispatch**

In the tool's `description` array, add a line:

```typescript
description: [
    "Delegate tasks to specialized subagents with isolated context.",
    "Modes: single (agent + task), parallel (tasks array), chain (sequential with {previous} placeholder).",
    'Default agent scope is "user" (from ~/.pi/agent/agents).',
    'To enable project-local agents in .pi/agents, set agentScope: "both" (or "project").',
    'Set dispatch: "claude" to run via Claude Code CLI instead of pi.',
].join(" "),
```

- [ ] **Step 8: Commit**

```bash
git add agent/extensions/subagent/index.ts
git commit -m "feat(subagent): wire dispatch branching into execution

runSingleAgent branches on dispatch value to spawn either pi or
claude CLI. SubagentParams schema accepts dispatch and permissionMode
for single, parallel, and chain modes."
```

---

### Task 4: Add dispatch map to models.json

**Files:**
- Modify: `agent/models.json`

**Model recommendation:** cheap

- [ ] **Step 1: Add the dispatch section**

Edit `agent/models.json` to add the `dispatch` map:

```json
{
    "capable": "anthropic/claude-opus-4-6",
    "standard": "anthropic/claude-sonnet-4-6",
    "cheap": "anthropic/claude-haiku-4-5",
    "crossProvider": {
        "capable": "openai-codex/gpt-5.4",
        "standard": "openai-codex/gpt-5.4"
    },
    "dispatch": {
        "anthropic": "claude"
    }
}
```

- [ ] **Step 2: Verify JSON is valid**

```bash
python3 -c "import json; json.load(open('agent/models.json')); print('valid')"
```

Expected: `valid`

- [ ] **Step 3: Commit**

```bash
git add agent/models.json
git commit -m "feat(models): add dispatch map for provider-level CLI routing

Maps anthropic provider to claude CLI dispatch. Skills read this
to determine which backend to use for subagent tasks."
```

---

### Task 5: Update generate-plan to use dispatch map

**Files:**
- Modify: `agent/skills/generate-plan/SKILL.md`

**Model recommendation:** standard

- [ ] **Step 1: Add dispatch resolution to Step 2**

In `SKILL.md`, after the existing Step 2 content (model tier resolution), add a new subsection. Insert the following after the line `If \`models.json\` doesn't exist or is unreadable, stop with:...`:

```markdown
### Dispatch resolution

Also read the `dispatch` section of `models.json` (if present). This maps provider names to CLI dispatch targets. For each resolved model, extract the provider (the part before `/` in the model string) and look it up in the dispatch map.

For example, if `capable` resolves to `anthropic/claude-opus-4-6` and `dispatch` contains `{"anthropic": "claude"}`, the dispatch target for that role is `claude`.

If the provider is not in the dispatch map, or if `dispatch` is absent from `models.json`, no dispatch override is passed (the agent's default applies).

Store the resolved dispatch values for use in subsequent subagent calls.
```

- [ ] **Step 2: Update Step 3 subagent call to include dispatch**

Change the dispatch block in Step 3 from:

```
subagent { agent: "planner", task: "<filled template>", model: "<capable from models.json>" }
```

To:

```
subagent { agent: "planner", task: "<filled template>", model: "<capable from models.json>", dispatch: "<dispatch for capable's provider, if any>" }
```

- [ ] **Step 3: Update Step 4.1 subagent call to include dispatch**

Change the plan-reviewer dispatch in Step 4.1 from:

```
subagent {
  agent: "plan-reviewer",
  task: "<filled review-plan-prompt.md>",
  model: "<crossProvider.capable from models.json>"
}
```

To:

```
subagent {
  agent: "plan-reviewer",
  task: "<filled review-plan-prompt.md>",
  model: "<crossProvider.capable from models.json>",
  dispatch: "<dispatch for crossProvider.capable's provider, if any>"
}
```

- [ ] **Step 4: Update Step 4.3 subagent call to include dispatch**

Same pattern — add `dispatch` to the planner dispatch in the edit step:

```
subagent { agent: "planner", task: "<filled edit-plan-prompt.md>", model: "<capable from models.json>", dispatch: "<dispatch for capable's provider, if any>" }
```

- [ ] **Step 5: Commit**

```bash
git add agent/skills/generate-plan/SKILL.md
git commit -m "feat(generate-plan): read dispatch map and pass CLI override

After model tier resolution, reads the dispatch section of models.json
and passes the provider's dispatch target to each subagent call."
```

---

### Task 6: Update execute-plan to use dispatch map

**Files:**
- Modify: `agent/skills/execute-plan/SKILL.md`

**Model recommendation:** standard

- [ ] **Step 1: Add dispatch resolution to Step 6**

In `SKILL.md`, after the existing Step 6 content (model tier resolution), add a new subsection. Insert after the line `Always pass an explicit \`model\` override per task...`:

```markdown
### Dispatch resolution

Also read the `dispatch` section of `models.json` (if present). This maps provider names to CLI dispatch targets. For each resolved model, extract the provider (the part before `/`) and look it up in the dispatch map.

For example, if `capable` resolves to `anthropic/claude-opus-4-6` and `dispatch` contains `{"anthropic": "claude"}`, pass `dispatch: "claude"` in the subagent call for that task.

If the provider is not in the dispatch map, or if `dispatch` is absent from `models.json`, omit the `dispatch` parameter (the agent's default applies).
```

- [ ] **Step 2: Update Step 7 parallel dispatch to include dispatch**

Change the wave dispatch block from:

```
subagent { tasks: [
  { agent: "coder", task: "<self-contained prompt>", model: "<resolved>" },
  { agent: "coder", task: "<self-contained prompt>", model: "<resolved>" },
  ...
]}
```

To:

```
subagent { tasks: [
  { agent: "coder", task: "<self-contained prompt>", model: "<resolved>", dispatch: "<dispatch for model's provider, if any>" },
  { agent: "coder", task: "<self-contained prompt>", model: "<resolved>", dispatch: "<dispatch for model's provider, if any>" },
  ...
]}
```

- [ ] **Step 3: Update Step 7 sequential dispatch to include dispatch**

Change:

```
subagent { agent: "coder", task: "<self-contained prompt>", model: "<resolved>" }
```

To:

```
subagent { agent: "coder", task: "<self-contained prompt>", model: "<resolved>", dispatch: "<dispatch for model's provider, if any>" }
```

- [ ] **Step 4: Commit**

```bash
git add agent/skills/execute-plan/SKILL.md
git commit -m "feat(execute-plan): read dispatch map and pass CLI override

After model tier resolution, reads the dispatch section of models.json
and passes the provider's dispatch target to each subagent call."
```

---

## Test Command

```bash
node --experimental-strip-types --test agent/extensions/subagent/claude-dispatch.test.ts
```
