# Subagent Extension Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `npm:pi-subagents` with a minimal fork of Mario's reference implementation at `~/Code/pi-subagent`, adding per-task model/thinking override, recursion depth guard, extended frontmatter, and model fallback.

**Architecture:** Fork Mario's ~1100-line extension into a standalone npm package. Extend `agents.ts` with builtin agent discovery and additional frontmatter fields (`thinking`, `maxSubagentDepth`, `fallbackModels`). Extend `index.ts` with per-task model/thinking overrides in the tool schema, a recursion depth guard via env var, and a model fallback retry wrapper. All changes are additive — no existing behavior is modified.

**Tech Stack:** TypeScript (ESM, Node experimental strip types), pi extension API (`@mariozechner/pi-coding-agent`, `@mariozechner/pi-ai`, `@mariozechner/pi-agent-core`, `@mariozechner/pi-tui`, `@sinclair/typebox`)

**Source:** TODO-3bb34f62

---

## File Structure

- `~/Code/pi-subagent/package.json` (Create) — npm package config with pi extension entry point
- `~/Code/pi-subagent/tsconfig.json` (Create) — TypeScript config for ESM + strip types
- `~/Code/pi-subagent/.gitignore` (Create) — Node ignores
- `~/Code/pi-subagent/index.ts` (Create) — Extension entry point forked from Mario's, with schema extensions, depth guard, and model fallback
- `~/Code/pi-subagent/agents.ts` (Create) — Agent discovery forked from Mario's, with builtin scope and extended frontmatter
- `~/Code/pi-subagent/agents/scout.md` (Create) — Builtin: fast recon agent
- `~/Code/pi-subagent/agents/planner.md` (Create) — Builtin: plan generation agent
- `~/Code/pi-subagent/agents/worker.md` (Create) — Builtin: general execution agent
- `~/Code/pi-subagent/agents/reviewer.md` (Create) — Builtin: code review agent
- `~/Code/pi-subagent/prompts/implement.md` (Create) — Chain prompt: scout -> planner -> worker
- `~/Code/pi-subagent/prompts/scout-and-plan.md` (Create) — Chain prompt: scout -> planner
- `~/Code/pi-subagent/prompts/implement-and-review.md` (Create) — Chain prompt: worker -> reviewer -> worker

---

## Dependencies

- Task 2 depends on: Task 1
- Task 3 depends on: Task 2
- Task 4 depends on: Task 3
- Task 5 depends on: Task 3
- Task 6 depends on: Task 3
- Task 7 depends on: Task 4, Task 5, Task 6

---

## Tasks

### Task 1: Scaffold the repository

**Files:**
- Create: `~/Code/pi-subagent/package.json`
- Create: `~/Code/pi-subagent/tsconfig.json`
- Create: `~/Code/pi-subagent/.gitignore`

**Model recommendation:** cheap

**Steps:**

- [ ] **Step 1: Create package.json**

Create `~/Code/pi-subagent/package.json`:

```json
{
  "name": "@davidsunglee/pi-subagent",
  "version": "0.1.0",
  "description": "Minimal subagent extension for pi coding agent — single, parallel, and chain dispatch",
  "author": "David Lee",
  "license": "MIT",
  "type": "module",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/davidsunglee/pi-subagent.git"
  },
  "keywords": [
    "pi-package",
    "pi",
    "pi-coding-agent",
    "subagent"
  ],
  "files": [
    "*.ts",
    "agents/",
    "prompts/",
    "README.md"
  ],
  "pi": {
    "extensions": [
      "./index.ts"
    ]
  },
  "peerDependencies": {
    "@mariozechner/pi-agent-core": "*",
    "@mariozechner/pi-ai": "*",
    "@mariozechner/pi-coding-agent": "*",
    "@mariozechner/pi-tui": "*",
    "@sinclair/typebox": "*"
  }
}
```

Key fields: `"pi": { "extensions": ["./index.ts"] }` tells pi where to find the extension entry point. `"keywords": ["pi-package"]` marks this as a pi package. Peer dependencies are wildcard because pi provides them at runtime.

- [ ] **Step 2: Create tsconfig.json**

Create `~/Code/pi-subagent/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "declaration": true,
    "sourceMap": true
  },
  "include": ["*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create .gitignore**

Create `~/Code/pi-subagent/.gitignore`:

```
node_modules/
dist/
*.js
*.js.map
*.d.ts
.DS_Store
```

- [ ] **Step 4: Commit scaffold**

```bash
cd ~/Code/pi-subagent
git add package.json tsconfig.json .gitignore
git commit -m "chore: scaffold package with pi extension config"
```

**Acceptance criteria:**
- package.json has `"pi": { "extensions": ["./index.ts"] }` entry point
- package.json has `"pi-package"` keyword
- package.json has peer dependencies on all four pi packages + typebox

---

### Task 2: Copy base source and assets

**Files:**
- Create: `~/Code/pi-subagent/agents.ts`
- Create: `~/Code/pi-subagent/index.ts`
- Create: `~/Code/pi-subagent/agents/scout.md`
- Create: `~/Code/pi-subagent/agents/planner.md`
- Create: `~/Code/pi-subagent/agents/worker.md`
- Create: `~/Code/pi-subagent/agents/reviewer.md`
- Create: `~/Code/pi-subagent/prompts/implement.md`
- Create: `~/Code/pi-subagent/prompts/scout-and-plan.md`
- Create: `~/Code/pi-subagent/prompts/implement-and-review.md`

**Model recommendation:** cheap

**Steps:**

- [ ] **Step 1: Copy agents.ts from Mario's reference**

Fetch the file from `https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/examples/extensions/subagent/agents.ts` and write it to `~/Code/pi-subagent/agents.ts` verbatim.

This file contains:
- `AgentScope` type (`"user" | "project" | "both"`)
- `AgentConfig` interface (name, description, tools, model, systemPrompt, source, filePath)
- `discoverAgents()` function (user + project scope discovery)
- `loadAgentsFromDir()` helper
- `findNearestProjectAgentsDir()` helper
- `formatAgentList()` helper

- [ ] **Step 2: Copy index.ts from Mario's reference**

Fetch the file from `https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/examples/extensions/subagent/index.ts` and write it to `~/Code/pi-subagent/index.ts` verbatim.

This file contains the full extension (~987 lines): tool registration, `runSingleAgent()`, parallel/chain/single execution modes, TUI rendering (`renderCall`, `renderResult`), and all supporting types and utilities.

- [ ] **Step 3: Copy builtin agent definitions**

Create directories and copy all four agent markdown files:

Fetch from `https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/examples/extensions/subagent/agents/` and write to `~/Code/pi-subagent/agents/`:
- `scout.md` — Fast recon agent (Haiku)
- `planner.md` — Plan generation (Sonnet)
- `worker.md` — General execution (Sonnet)
- `reviewer.md` — Code review (Sonnet)

- [ ] **Step 4: Copy prompt templates**

Fetch from `https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/examples/extensions/subagent/prompts/` and write to `~/Code/pi-subagent/prompts/`:
- `implement.md` — scout -> planner -> worker chain
- `scout-and-plan.md` — scout -> planner chain
- `implement-and-review.md` — worker -> reviewer -> worker chain

- [ ] **Step 5: Commit base source**

```bash
cd ~/Code/pi-subagent
git add agents.ts index.ts agents/ prompts/
git commit -m "feat: copy base source from badlogic/pi-mono reference implementation

Source: packages/coding-agent/examples/extensions/subagent/"
```

**Acceptance criteria:**
- `index.ts` exists and exports default function that calls `pi.registerTool()`
- `agents.ts` exports `discoverAgents`, `AgentConfig`, `AgentScope`
- All 4 agent MDs have valid YAML frontmatter with `name` and `description`
- All 3 prompt MDs exist in `prompts/`

---

### Task 3: Extend agent discovery and frontmatter

**Files:**
- Modify: `~/Code/pi-subagent/agents.ts`

**Model recommendation:** standard

This task adds two things to `agents.ts`:
1. **Builtin agent discovery** — a third scope that loads agents from the package's own `agents/` directory as lowest-priority defaults
2. **Extended frontmatter fields** — `thinking`, `maxSubagentDepth`, `fallbackModels`

**Steps:**

- [ ] **Step 1: Add new fields to AgentConfig**

In `agents.ts`, extend the `AgentConfig` interface to include the three new optional fields:

```typescript
export interface AgentConfig {
	name: string;
	description: string;
	tools?: string[];
	model?: string;
	thinking?: string;
	maxSubagentDepth?: number;
	fallbackModels?: string[];
	systemPrompt: string;
	source: "user" | "project" | "builtin";
	filePath: string;
}
```

Note: `source` type union gains `"builtin"`.

- [ ] **Step 2: Parse new frontmatter fields in loadAgentsFromDir**

In the `loadAgentsFromDir` function, after the existing `tools` parsing, add parsing for the three new fields:

```typescript
		const tools = frontmatter.tools
			?.split(",")
			.map((t: string) => t.trim())
			.filter(Boolean);

		const thinking = frontmatter.thinking?.trim() || undefined;
		const maxSubagentDepth = frontmatter.maxSubagentDepth !== undefined
			? parseInt(frontmatter.maxSubagentDepth, 10)
			: undefined;
		const fallbackModels = frontmatter.fallbackModels
			?.split(",")
			.map((m: string) => m.trim())
			.filter(Boolean);

		agents.push({
			name: frontmatter.name,
			description: frontmatter.description,
			tools: tools && tools.length > 0 ? tools : undefined,
			model: frontmatter.model,
			thinking,
			maxSubagentDepth: Number.isNaN(maxSubagentDepth!) ? undefined : maxSubagentDepth,
			fallbackModels: fallbackModels && fallbackModels.length > 0 ? fallbackModels : undefined,
			systemPrompt: body,
			source,
			filePath,
		});
```

- [ ] **Step 3: Add builtin agent discovery**

Add a helper to resolve the package's own `agents/` directory, and integrate it into `discoverAgents`:

```typescript
import { fileURLToPath } from "node:url";

function getBuiltinAgentsDir(): string {
	const thisFile = fileURLToPath(import.meta.url);
	return path.join(path.dirname(thisFile), "agents");
}
```

Then modify `discoverAgents` to load builtins first (lowest priority), so user and project agents override them by name:

```typescript
export function discoverAgents(cwd: string, scope: AgentScope): AgentDiscoveryResult {
	const builtinDir = getBuiltinAgentsDir();
	const userDir = path.join(getAgentDir(), "agents");
	const projectAgentsDir = findNearestProjectAgentsDir(cwd);

	const builtinAgents = loadAgentsFromDir(builtinDir, "builtin");
	const userAgents = scope === "project" ? [] : loadAgentsFromDir(userDir, "user");
	const projectAgents = scope === "user" || !projectAgentsDir ? [] : loadAgentsFromDir(projectAgentsDir, "project");

	// Priority: builtin (lowest) -> user -> project (highest)
	const agentMap = new Map<string, AgentConfig>();

	for (const agent of builtinAgents) agentMap.set(agent.name, agent);

	if (scope === "both") {
		for (const agent of userAgents) agentMap.set(agent.name, agent);
		for (const agent of projectAgents) agentMap.set(agent.name, agent);
	} else if (scope === "user") {
		for (const agent of userAgents) agentMap.set(agent.name, agent);
	} else {
		for (const agent of projectAgents) agentMap.set(agent.name, agent);
	}

	return { agents: Array.from(agentMap.values()), projectAgentsDir };
}
```

- [ ] **Step 4: Update the source type in loadAgentsFromDir signature**

Change the `source` parameter type to accept `"builtin"`:

```typescript
function loadAgentsFromDir(dir: string, source: "user" | "project" | "builtin"): AgentConfig[] {
```

- [ ] **Step 5: Commit**

```bash
cd ~/Code/pi-subagent
git add agents.ts
git commit -m "feat: add builtin agent discovery and extended frontmatter

- Three-tier discovery: builtin (lowest) -> user -> project (highest)
- New frontmatter fields: thinking, maxSubagentDepth, fallbackModels"
```

**Acceptance criteria:**
- `AgentConfig` has `thinking?: string`, `maxSubagentDepth?: number`, `fallbackModels?: string[]`
- `source` type includes `"builtin"`
- `discoverAgents` loads from package `agents/` dir as lowest priority
- Builtin agents are overridden by user agents with the same name (e.g., `planner`)
- `maxSubagentDepth` parsed as integer, NaN values become undefined
- `fallbackModels` parsed as comma-separated list

---

### Task 4: Add per-task model and thinking override

**Files:**
- Modify: `~/Code/pi-subagent/index.ts`

**Model recommendation:** standard

This task extends the tool schema to accept `model` and `thinking` fields in single and parallel mode, and passes them through to the subprocess CLI args.

**Steps:**

- [ ] **Step 1: Add model and thinking to TaskItem schema**

In `index.ts`, find the `TaskItem` TypeBox schema and add optional `model` and `thinking` fields:

```typescript
const TaskItem = Type.Object({
	agent: Type.String({ description: "Name of the agent to invoke" }),
	task: Type.String({ description: "Task to delegate to the agent" }),
	model: Type.Optional(Type.String({ description: "Model override (takes precedence over agent frontmatter)" })),
	thinking: Type.Optional(Type.String({ description: "Thinking level override: off, minimal, low, medium, high, xhigh" })),
	cwd: Type.Optional(Type.String({ description: "Working directory for the agent process" })),
});
```

- [ ] **Step 2: Add model and thinking to SubagentParams top-level**

In the `SubagentParams` schema, add optional `model` and `thinking` for single mode:

```typescript
const SubagentParams = Type.Object({
	agent: Type.Optional(Type.String({ description: "Name of the agent to invoke (for single mode)" })),
	task: Type.Optional(Type.String({ description: "Task to delegate (for single mode)" })),
	model: Type.Optional(Type.String({ description: "Model override for single mode (takes precedence over agent frontmatter)" })),
	thinking: Type.Optional(Type.String({ description: "Thinking level for single mode: off, minimal, low, medium, high, xhigh" })),
	tasks: Type.Optional(Type.Array(TaskItem, { description: "Array of {agent, task} for parallel execution" })),
	chain: Type.Optional(Type.Array(ChainItem, { description: "Array of {agent, task} for sequential execution" })),
	agentScope: Type.Optional(AgentScopeSchema),
	confirmProjectAgents: Type.Optional(
		Type.Boolean({ description: "Prompt before running project-local agents. Default: true.", default: true }),
	),
	cwd: Type.Optional(Type.String({ description: "Working directory for the agent process (single mode)" })),
});
```

- [ ] **Step 3: Add model and thinking parameters to runSingleAgent**

Extend the `runSingleAgent` function signature to accept optional `model` and `thinking` overrides:

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
	modelOverride?: string,
	thinkingOverride?: string,
): Promise<SingleResult> {
```

- [ ] **Step 4: Use overrides in CLI arg construction**

In `runSingleAgent`, replace the existing model arg logic with override-aware logic. Find this block:

```typescript
	const args: string[] = ["--mode", "json", "-p", "--no-session"];
	if (agent.model) args.push("--model", agent.model);
	if (agent.tools && agent.tools.length > 0) args.push("--tools", agent.tools.join(","));
```

Replace with:

```typescript
	const args: string[] = ["--mode", "json", "-p", "--no-session"];

	// Resolution order: tool call override > agent frontmatter > pi default
	const effectiveModel = modelOverride ?? agent.model;
	const effectiveThinking = thinkingOverride ?? agent.thinking;

	if (effectiveModel) args.push("--model", effectiveModel);
	if (effectiveThinking) args.push("--thinking", effectiveThinking);
	if (agent.tools && agent.tools.length > 0) args.push("--tools", agent.tools.join(","));
```

Also update `currentResult.model` initialization:

```typescript
	const currentResult: SingleResult = {
		...
		model: effectiveModel,
		...
	};
```

- [ ] **Step 5: Pass overrides through all call sites**

Update every call to `runSingleAgent` to forward model/thinking overrides:

**Single mode** (in the `execute` function, `if (params.agent && params.task)` block):

```typescript
			const result = await runSingleAgent(
				ctx.cwd,
				agents,
				params.agent,
				params.task,
				params.cwd,
				undefined,
				signal,
				onUpdate,
				makeDetails("single"),
				params.model,
				params.thinking,
			);
```

**Parallel mode** (in the `mapWithConcurrencyLimit` callback):

```typescript
				const result = await runSingleAgent(
					ctx.cwd,
					agents,
					t.agent,
					t.task,
					t.cwd,
					undefined,
					signal,
					(partial) => {
						if (partial.details?.results[0]) {
							allResults[index] = partial.details.results[0];
							emitParallelUpdate();
						}
					},
					makeDetails("parallel"),
					t.model,
					t.thinking,
				);
```

**Chain mode** — no changes. Chain steps inherit from agent frontmatter (per spec, chain mode schema is unchanged).

- [ ] **Step 6: Commit**

```bash
cd ~/Code/pi-subagent
git add index.ts
git commit -m "feat: add per-task model and thinking override

- model/thinking fields in single mode top-level params
- model/thinking fields in parallel mode per-task params
- Resolution: tool call > agent frontmatter > pi default
- Chain mode unchanged (inherits from frontmatter)"
```

**Acceptance criteria:**
- Single mode accepts `model` and `thinking` params
- Parallel mode accepts `model` and `thinking` per task
- Overrides take precedence over agent frontmatter
- `--model` and `--thinking` CLI args are passed to spawned subprocess
- Chain mode schema is unchanged
- `currentResult.model` reflects the effective model (override or frontmatter)

---

### Task 5: Add recursion depth guard

**Files:**
- Modify: `~/Code/pi-subagent/index.ts`

**Model recommendation:** standard

This task prevents infinite subagent nesting by tracking depth via environment variable and enforcing per-agent limits.

**Steps:**

- [ ] **Step 1: Add depth checking at the top of the execute function**

In `index.ts`, at the beginning of the `execute` function (before agent discovery), add the depth check:

```typescript
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			// Recursion depth guard
			const currentDepth = parseInt(process.env.PI_SUBAGENT_DEPTH || "0", 10);
			const parentMaxDepth = parseInt(process.env.PI_SUBAGENT_MAX_DEPTH || "Infinity", 10);

			const agentScope: AgentScope = params.agentScope ?? "user";
			// ... rest of existing code
```

- [ ] **Step 2: Add depth enforcement in runSingleAgent**

In `runSingleAgent`, after resolving the agent config, check whether the agent is allowed to be spawned at the current depth. Find the block after `const agent = agents.find(...)` and the error return for unknown agents. After that error return, add:

```typescript
	// Recursion depth guard
	const currentDepth = parseInt(process.env.PI_SUBAGENT_DEPTH || "0", 10);
	const parentMaxDepth = parseInt(process.env.PI_SUBAGENT_MAX_DEPTH || "Infinity", 10);
	const agentMaxDepth = agent.maxSubagentDepth ?? Infinity;
	// Agent's limit cannot relax the parent's limit
	const effectiveMaxDepth = Math.min(agentMaxDepth, parentMaxDepth);

	if (currentDepth >= effectiveMaxDepth) {
		return {
			agent: agentName,
			agentSource: agent.source,
			task,
			exitCode: 1,
			messages: [],
			stderr: `Subagent depth limit reached (current depth: ${currentDepth}, max: ${effectiveMaxDepth}). Agent "${agentName}" cannot spawn subagents at this depth.`,
			usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
			step,
		};
	}
```

- [ ] **Step 3: Pass depth environment to child process**

In `runSingleAgent`, in the `spawn()` call, add environment variables to the child process. Find the spawn call:

```typescript
			const proc = spawn(invocation.command, invocation.args, {
				cwd: cwd ?? defaultCwd,
				shell: false,
				stdio: ["ignore", "pipe", "pipe"],
			});
```

Replace with:

```typescript
			const childDepth = currentDepth + 1;
			const proc = spawn(invocation.command, invocation.args, {
				cwd: cwd ?? defaultCwd,
				shell: false,
				stdio: ["ignore", "pipe", "pipe"],
				env: {
					...process.env,
					PI_SUBAGENT_DEPTH: String(childDepth),
					PI_SUBAGENT_MAX_DEPTH: String(effectiveMaxDepth),
				},
			});
```

- [ ] **Step 4: Update agentSource type to handle "builtin"**

The `SingleResult.agentSource` type is `"user" | "project" | "unknown"`. Since agents can now have source `"builtin"`, update the type in the `SingleResult` interface:

```typescript
interface SingleResult {
	agent: string;
	agentSource: "user" | "project" | "builtin" | "unknown";
	// ... rest unchanged
}
```

And update the assignment in `runSingleAgent`:

```typescript
	const currentResult: SingleResult = {
		agent: agentName,
		agentSource: agent.source,
		// ... rest unchanged
	};
```

(No cast needed now that the types align.)

- [ ] **Step 5: Commit**

```bash
cd ~/Code/pi-subagent
git add index.ts
git commit -m "feat: add recursion depth guard via PI_SUBAGENT_DEPTH

- Track depth via PI_SUBAGENT_DEPTH env var (incremented per spawn)
- Per-agent maxSubagentDepth from frontmatter (cannot relax parent limit)
- Clear error message when depth exceeded
- Allows code-refiner (depth 1) to dispatch code-reviewer/coder (depth 0)"
```

**Acceptance criteria:**
- `PI_SUBAGENT_DEPTH` is set to `currentDepth + 1` in child env
- `PI_SUBAGENT_MAX_DEPTH` is forwarded to child env
- Agent with `maxSubagentDepth: 0` cannot spawn subagents
- Agent with `maxSubagentDepth: 1` can spawn one level of subagents
- Agent's maxSubagentDepth cannot relax the parent's limit (uses `Math.min`)
- Blocked dispatch returns exit code 1 with clear error message

---

### Task 6: Add model fallback

**Files:**
- Modify: `~/Code/pi-subagent/index.ts`

**Model recommendation:** standard

This task adds an opt-in retry wrapper that tries fallback models when the primary model fails with a retryable error.

**Steps:**

- [ ] **Step 1: Add retryable error detection helper**

In `index.ts`, add a helper function before `runSingleAgent`:

```typescript
function isRetryableError(result: SingleResult): boolean {
	const retryablePatterns = [
		/rate.?limit/i,
		/too.?many.?requests/i,
		/overloaded/i,
		/capacity/i,
		/503/,
		/429/,
		/quota/i,
		/temporarily.?unavailable/i,
	];

	const errorText = [result.stderr, result.errorMessage, result.stopReason].filter(Boolean).join(" ");

	return retryablePatterns.some((pattern) => pattern.test(errorText));
}
```

- [ ] **Step 2: Add runSingleAgentWithFallback wrapper**

Add a wrapper function after `runSingleAgent` that handles the fallback retry logic:

```typescript
async function runSingleAgentWithFallback(
	defaultCwd: string,
	agents: AgentConfig[],
	agentName: string,
	task: string,
	cwd: string | undefined,
	step: number | undefined,
	signal: AbortSignal | undefined,
	onUpdate: OnUpdateCallback | undefined,
	makeDetails: (results: SingleResult[]) => SubagentDetails,
	modelOverride?: string,
	thinkingOverride?: string,
): Promise<SingleResult> {
	const result = await runSingleAgent(
		defaultCwd, agents, agentName, task, cwd, step, signal, onUpdate, makeDetails,
		modelOverride, thinkingOverride,
	);

	// Only attempt fallback if the primary model failed with a retryable error
	if (result.exitCode === 0 && result.stopReason !== "error") return result;
	if (!isRetryableError(result)) return result;

	const agent = agents.find((a) => a.name === agentName);
	if (!agent?.fallbackModels || agent.fallbackModels.length === 0) return result;

	// Try each fallback model in order
	for (const fallbackModel of agent.fallbackModels) {
		const fallbackResult = await runSingleAgent(
			defaultCwd, agents, agentName, task, cwd, step, signal, onUpdate, makeDetails,
			fallbackModel, thinkingOverride,
		);

		if (fallbackResult.exitCode === 0 && fallbackResult.stopReason !== "error") {
			return fallbackResult;
		}

		if (!isRetryableError(fallbackResult)) {
			return fallbackResult;
		}
	}

	// All fallbacks exhausted — return the original error
	return result;
}
```

- [ ] **Step 3: Replace runSingleAgent calls with runSingleAgentWithFallback**

In the `execute` function, update all three dispatch paths to use the fallback wrapper:

**Single mode** — replace `runSingleAgent(` with `runSingleAgentWithFallback(` in the `if (params.agent && params.task)` block.

**Parallel mode** — replace `runSingleAgent(` with `runSingleAgentWithFallback(` in the `mapWithConcurrencyLimit` callback.

**Chain mode** — replace `runSingleAgent(` with `runSingleAgentWithFallback(` in the chain loop.

The function signatures are identical, so this is a direct substitution (no argument changes needed).

- [ ] **Step 4: Commit**

```bash
cd ~/Code/pi-subagent
git add index.ts
git commit -m "feat: add model fallback for retryable errors

- Opt-in via fallbackModels frontmatter field (comma-separated)
- Retries on rate limit, overloaded, 429/503, quota exhaustion
- Tries fallback models in order, returns original error if all exhausted
- No behavior change for agents without fallbackModels defined"
```

**Acceptance criteria:**
- `isRetryableError` detects rate limit, overloaded, 429, 503, quota errors
- `runSingleAgentWithFallback` tries primary model first
- On retryable failure, tries each `fallbackModels` entry in order
- On non-retryable failure, returns immediately (no fallback attempt)
- Agents without `fallbackModels` behave identically to before
- All three dispatch modes (single, parallel, chain) use the fallback wrapper

---

### Task 7: Install locally and verify migration

**Files:**
- Modify: `~/.pi/agent/settings.json` (change package reference)

**Model recommendation:** standard

This task installs the fork locally, runs baseline characterization, swaps the extension, and verifies all skill flows work.

**Steps:**

- [ ] **Step 1: Characterize baseline behavior with Nico's extension**

Before swapping extensions, run all three skill flows with the current `npm:pi-subagents` to establish baseline. In separate pi sessions:

1. **generate-plan**: Run the generate-plan skill with a small test todo or description. Record: did it complete? Did the review loop work? Any TUI glitches?

2. **execute-plan**: Run execute-plan on an existing plan (or the plan from step 1). Record: did parallel dispatch work? Did per-task model override work? Did wave commits succeed?

3. **refine-code**: Run the refine-code skill after a wave. Record: did recursive dispatch work (code-refiner -> code-reviewer + coder)? Did the review-remediate loop complete?

Save results to `~/Code/pi-subagent/BASELINE.md` for comparison.

- [ ] **Step 2: Install the fork locally**

Update `~/.pi/agent/settings.json` to reference the local fork. Change the packages array:

```json
"packages": [
    "~/Code/pi-subagent",
    "npm:pi-web-access",
    "npm:pi-token-burden"
]
```

This replaces `"npm:pi-subagents"` with the local path. Pi resolves local paths as file-based extensions.

- [ ] **Step 3: Verify agent discovery**

Start a new pi session and test that agents are discovered correctly:

```
Use the subagent tool to list available agents by calling it with invalid params (it will return the available list in the error).
```

Verify the output includes all 8 expected agents:
- From user scope: planner, coder, plan-reviewer, code-reviewer, code-refiner
- From builtin scope: scout, worker, reviewer

Verify that `planner` shows as `(user)` source, not `(builtin)` — confirming user agents override builtins.

- [ ] **Step 4: Verify per-task model and thinking override**

Run a quick single-agent dispatch with explicit model and thinking overrides to verify they're passed through:

```
subagent { agent: "scout", task: "List the files in the current directory", model: "anthropic/claude-haiku-4-5", thinking: "low" }
```

Confirm the scout runs with the specified model (check the usage stats in the result).

- [ ] **Step 5: Re-run skill flows and compare**

Re-run the same three skill flows from Step 1 with the new extension:

1. **generate-plan**: Run with the same input. Compare: does single dispatch work? Does cross-provider review work? Any regressions?

2. **execute-plan**: Run with the same plan. Compare: does parallel dispatch with per-task model override work? Do wave commits succeed? Any regressions?

3. **refine-code**: Run after a wave. Compare: does recursive dispatch work? Does the depth guard allow code-refiner to dispatch sub-subagents?

Compare results against `BASELINE.md`. All flows should produce equivalent results.

- [ ] **Step 6: Clean up old extension**

Once verified, remove Nico's extension:

```bash
npm uninstall -g pi-subagents
```

Check if extension config exists and remove it:

```bash
rm -f ~/.pi/agent/extensions/subagent/config.json
rmdir ~/.pi/agent/extensions/subagent/ 2>/dev/null
rmdir ~/.pi/agent/extensions/ 2>/dev/null
```

- [ ] **Step 7: Commit settings change and baseline**

```bash
cd ~/Code/pi-subagent
git add BASELINE.md
git commit -m "docs: add baseline characterization from Nico's extension"
```

Note: `~/.pi/agent/settings.json` is not in a git repo — no commit needed for it.

**Acceptance criteria:**
- Baseline behavior recorded in `BASELINE.md`
- Local fork installed in settings.json
- All 8 agents discovered (5 user + 3 builtin)
- User `planner` overrides builtin `planner`
- Per-task model and thinking overrides work in single and parallel mode
- generate-plan completes: planner dispatch + plan-reviewer dispatch + edit loop
- execute-plan completes: wave parallel dispatch + verification + commits
- refine-code completes: code-refiner dispatches code-reviewer and coder (recursion works)
- Nico's extension removed

---

## Risk Assessment

| Risk | Mitigation |
|---|---|
| pi extension API incompatibility | Fork is copied from Mario's reference (the pi author), guaranteed API compliance |
| Agent frontmatter parsing breaks | Extended fields are optional with safe defaults; existing agents work unchanged |
| Recursive dispatch breaks | Depth guard uses same env var pattern as Nico's; code-refiner frontmatter unchanged |
| TUI rendering regressions | Mario's rendering is simpler (single file, no async polling); baseline comparison catches regressions |
| Local path reference not supported by pi | Check `pi install` docs; worst case use `--extension` flag or symlink |
| Model fallback masks real errors | Only retries on known retryable patterns; non-retryable errors return immediately |

## Rollback

If migration fails: change settings.json packages back to `"npm:pi-subagents"`. Zero risk — no agent or skill files are modified.
