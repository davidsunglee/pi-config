/**
 * Extension entry point for generate-plan.
 *
 * Thin wrapper that wires the PlanGenerationEngine to pi's extension API.
 * All orchestration logic lives in the engine — this file only bridges
 * between pi APIs and engine callbacks.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { Type } from "@sinclair/typebox";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";

import { PlanGenerationEngine } from "../../lib/generate-plan/engine.ts";
import { PiGenerationIO } from "./io-adapter.ts";
import { loadAgentConfig } from "../execute-plan/subagent-dispatch.ts";
import type { AgentConfig } from "../execute-plan/subagent-dispatch.ts";
import type {
  GenerationInput,
  GenerationCallbacks,
  GenerationResult,
  SubagentDispatchConfig,
  SubagentOutput,
} from "../../lib/generate-plan/types.ts";

// ── Input parsing ─────────────────────────────────────────────────────

const TODO_PATTERN = /^TODO-([0-9a-f]+)$/i;
const FILE_EXTENSION_PATTERN = /\.\w{1,10}$/;

/**
 * Classify raw input string as a todo reference, file path, or freeform text.
 */
export async function parseInput(
  input: string,
  cwd: string,
): Promise<GenerationInput> {
  const trimmed = input.trim();

  // Check for TODO-<hex> pattern
  const todoMatch = trimmed.match(TODO_PATTERN);
  if (todoMatch) {
    return { type: "todo", todoId: todoMatch[1] };
  }

  // Check if it looks like a file path (contains /, starts with ., or has a file extension)
  if (trimmed.includes("/") || trimmed.startsWith(".") || FILE_EXTENSION_PATTERN.test(trimmed)) {
    const resolved = path.isAbsolute(trimmed)
      ? trimmed
      : path.resolve(cwd, trimmed);
    if (fs.existsSync(resolved)) {
      return { type: "file", filePath: resolved };
    }
    throw new Error(`File not found: ${resolved}`);
  }

  // Default to freeform text
  return { type: "freeform", text: trimmed };
}

// ── Pi binary invocation ──────────────────────────────────────────────

function getPiInvocation(args: string[]): { command: string; args: string[] } {
  const currentScript = process.argv[1];
  if (currentScript && fs.existsSync(currentScript)) {
    return { command: process.execPath, args: [currentScript, ...args] };
  }

  const execName = path.basename(process.execPath).toLowerCase();
  const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
  if (!isGenericRuntime) {
    return { command: process.execPath, args };
  }

  return { command: "pi", args };
}

// ── Dispatch helpers (exported for testing) ──────────────────────────

/**
 * Build the CLI argument array for a subagent invocation.
 *
 * Pure function — easy to test without spawning a process.
 */
export function buildDispatchArgs(
  agentConfig: AgentConfig | null,
  config: SubagentDispatchConfig,
  systemPromptPath: string | null,
): string[] {
  const args: string[] = ["--mode", "json", "-p", "--no-session"];

  // Model: prefer config.model, fall back to agent file model
  const model = config.model || agentConfig?.model;
  if (model) args.push("--model", model);

  // Tool allowlist from agent config
  const tools = agentConfig?.tools;
  if (tools && tools.length > 0) args.push("--tools", tools.join(","));

  // System prompt path (caller writes the temp file)
  if (systemPromptPath) args.push("--append-system-prompt", systemPromptPath);

  // Task prompt as final positional argument
  args.push(config.task);

  return args;
}

/**
 * Build the spawn options for a subagent invocation.
 *
 * Separated so tests can verify cwd propagation without spawning.
 */
export function buildSpawnOptions(
  cwd: string,
): { cwd: string; shell: boolean; stdio: Array<string> } {
  return { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] };
}

// ── Dispatch function ─────────────────────────────────────────────────

/**
 * Create a dispatch function for generate-plan's subagent needs.
 *
 * Simpler than execute-plan's dispatch: no AbortSignal, no onProgress
 * streaming, no worker status parsing. Spawns pi, collects final text
 * output, and returns { text, exitCode }.
 */
export function createDispatchFn(
  agentDir: string,
  cwd: string,
): (config: SubagentDispatchConfig) => Promise<SubagentOutput> {
  return async (config: SubagentDispatchConfig): Promise<SubagentOutput> => {
    const agentConfig = await loadAgentConfig(agentDir, config.agent);

    // System prompt from agent config
    let tmpPromptDir: string | null = null;
    let tmpPromptPath: string | null = null;

    try {
      const systemPrompt = agentConfig?.systemPrompt;
      if (systemPrompt && systemPrompt.trim()) {
        tmpPromptDir = await fs.promises.mkdtemp(
          path.join(os.tmpdir(), "pi-gen-plan-"),
        );
        tmpPromptPath = path.join(
          tmpPromptDir,
          `prompt-${config.agent.replace(/[^\w.-]+/g, "_")}.md`,
        );
        await fs.promises.writeFile(tmpPromptPath, systemPrompt, {
          encoding: "utf-8",
          mode: 0o600,
        });
      }

      const args = buildDispatchArgs(agentConfig, config, tmpPromptPath);

      let finalOutput = "";

      const exitCode = await new Promise<number>((resolve) => {
        const invocation = getPiInvocation(args);
        const spawnOpts = buildSpawnOptions(cwd);
        const proc = spawn(invocation.command, invocation.args, spawnOpts);

        let buffer = "";

        const processLine = (line: string) => {
          const trimmed = line.trim();
          if (!trimmed) return;

          let event: Record<string, unknown>;
          try {
            event = JSON.parse(trimmed) as Record<string, unknown>;
          } catch {
            return;
          }

          // Extract the final assistant text output from message_end events
          if (event.type === "message_end" && event.message) {
            const msg = event.message as {
              role?: string;
              content?: Array<{ type: string; text?: string }>;
            };
            if (msg.role === "assistant" && Array.isArray(msg.content)) {
              for (const part of msg.content) {
                if (part.type === "text" && typeof part.text === "string") {
                  finalOutput += part.text;
                }
              }
            }
          }
        };

        proc.stdout.on("data", (data: Buffer) => {
          buffer += data.toString();
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) processLine(line);
        });

        proc.on("close", (code: number | null) => {
          if (buffer.trim()) processLine(buffer);
          resolve(code ?? 0);
        });

        proc.on("error", () => {
          resolve(1);
        });
      });

      if (exitCode !== 0) {
        throw new Error(`Subagent '${config.agent}' exited with code ${exitCode}`);
      }

      return { text: finalOutput, exitCode };
    } finally {
      if (tmpPromptPath) {
        try {
          fs.unlinkSync(tmpPromptPath);
        } catch {
          /* ignore */
        }
      }
      if (tmpPromptDir) {
        try {
          fs.rmdirSync(tmpPromptDir);
        } catch {
          /* ignore */
        }
      }
    }
  };
}

// ── Todo reading ──────────────────────────────────────────────────────

/**
 * String-aware JSON object end finder.
 * Tracks quoted strings and escape sequences so braces inside string
 * values do not terminate the scan early.
 */
export function findJsonObjectEnd(content: string): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (char === "\\") { escaped = true; continue; }
      if (char === "\"") { inString = false; }
      continue;
    }
    if (char === "\"") { inString = true; continue; }
    if (char === "{") { depth += 1; continue; }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Create a function that reads a todo file and parses its JSON frontmatter.
 *
 * Todo file format: JSON object starting on line 1 (starts with `{`),
 * ends at matching `}`. Everything after is markdown body.
 */
export function createTodoReadFn(
  cwd: string,
): (todoId: string) => Promise<{ title: string; body: string }> {
  return async (todoId: string): Promise<{ title: string; body: string }> => {
    const todoPath = path.join(cwd, ".pi", "todos", `${todoId}.md`);

    let content: string;
    try {
      content = await fs.promises.readFile(todoPath, "utf-8");
    } catch {
      throw new Error(`Todo file not found: ${todoPath}`);
    }

    // Parse JSON frontmatter: find the closing `}` that matches the opening `{`
    const jsonEnd = findJsonObjectEnd(content);

    if (jsonEnd === -1) {
      throw new Error(`Invalid todo file format (no JSON frontmatter): ${todoPath}`);
    }

    const jsonStr = content.slice(0, jsonEnd + 1);
    let frontmatter: Record<string, unknown>;
    try {
      frontmatter = JSON.parse(jsonStr) as Record<string, unknown>;
    } catch {
      throw new Error(`Invalid JSON frontmatter in todo file: ${todoPath}`);
    }

    const title =
      typeof frontmatter.title === "string" ? frontmatter.title : "";
    const body = content.slice(jsonEnd + 1).replace(/^\r?\n+/, "");

    return { title, body };
  };
}

// ── Result formatting ─────────────────────────────────────────────────

export function formatResult(result: GenerationResult): string {
  const lines: string[] = [];

  lines.push(`Plan generated: ${result.planPath}`);

  if (result.reviewStatus === "approved") {
    lines.push("Review: approved");
  } else if (result.reviewStatus === "approved_with_notes") {
    lines.push(
      `Review: approved with ${result.noteCount} note${result.noteCount === 1 ? "" : "s"} appended to plan`,
    );
  } else {
    lines.push(
      `Review: ${result.remainingFindings.length} issue${result.remainingFindings.length === 1 ? "" : "s"} remaining after repair`,
    );
  }

  if (result.reviewPath) {
    lines.push(`Review details: ${result.reviewPath}`);
  }

  if (result.reviewStatus === "errors_found") {
    lines.push("");
    lines.push("### Remaining Issues");
    for (const finding of result.remainingFindings) {
      const taskLabel = finding.taskNumber != null ? `Task ${finding.taskNumber}` : "General";
      lines.push(`- [${finding.severity}] ${taskLabel}: ${finding.shortDescription}`);
      lines.push(`  - **What:** ${finding.fullText}`);
    }
    lines.push("");
    lines.push("Fix the issues above before executing, or manually edit the plan.");
  } else {
    lines.push("");
    lines.push(
      `To execute this plan, run: /execute-plan ${result.planPath}`,
    );
  }

  return lines.join("\n");
}

// ── Callback factory (exported for testing) ──────────────────────────

/**
 * Build the GenerationCallbacks for a plan generation run.
 *
 * @param notify - function that delivers a message at a given level
 * @param isAsync - when true, onComplete also calls notify with the
 *                  formatted result; when false it is a no-op because
 *                  the result is surfaced by the command/tool return.
 */
export function createCallbacks(
  notify: (msg: string, level: string) => void,
  isAsync: boolean,
): GenerationCallbacks {
  return {
    onProgress: (msg) => notify(msg, "info"),
    onWarning: (msg) => notify(msg, "warning"),
    onComplete: isAsync
      ? (result) => notify(formatResult(result), "info")
      : (_result) => {
          // Result is surfaced by the command handler or tool return value.
          // No additional notification needed for sync execution.
        },
  };
}

// ── Shared handler ────────────────────────────────────────────────────

interface GeneratePlanResult {
  success: boolean;
  message: string;
}

async function handleGeneratePlan(
  input: string,
  isAsync: boolean,
  ctx: ExtensionContext,
): Promise<GeneratePlanResult> {
  const cwd = ctx.cwd;
  const agentDir = path.dirname(
    path.dirname(
      path.dirname(import.meta.url.replace("file://", "")),
    ),
  );

  if (!input.trim()) {
    const msg =
      "Usage: /generate-plan <TODO-id | file-path | description> [--async]";
    return { success: false, message: msg };
  }

  const parsedInput = await parseInput(input, cwd);

  const io = new PiGenerationIO(
    createDispatchFn(agentDir, cwd),
    createTodoReadFn(cwd),
  );
  const engine = new PlanGenerationEngine(io, cwd, agentDir);

  const notify = (msg: string, level: string) =>
    ctx.ui?.notify?.(msg, level) ?? (level === "warning" ? console.warn(msg) : console.log(msg));
  const callbacks = createCallbacks(notify, isAsync);

  if (isAsync) {
    void engine.generate(parsedInput, callbacks).catch((err) => {
      const errMsg = err instanceof Error ? err.message : String(err);
      callbacks.onProgress(`Error: ${errMsg}`);
    });
    return {
      success: true,
      message: "Plan generation started in background...",
    };
  }

  // Synchronous execution
  try {
    const result = await engine.generate(parsedInput, callbacks);
    return { success: true, message: formatResult(result) };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Plan generation failed: ${errMsg}` };
  }
}

// ── Extension factory ─────────────────────────────────────────────────

export default function (pi: ExtensionAPI): void {
  // Register /generate-plan command
  pi.registerCommand("generate-plan", {
    description:
      "Generate a structured implementation plan from a todo, file, or description",
    handler: async (args, ctx) => {
      const isAsync = /\s*--async\b/.test(args);
      const input = args.replace(/\s*--async\b/, "").trim();
      const result = await handleGeneratePlan(input, isAsync, ctx);
      const level = result.success ? "info" : "error";
      ctx.ui?.notify?.(result.message, level) ?? (result.success ? console.log(result.message) : console.error(result.message));
    },
  });

  // Register generate_plan tool (always synchronous)
  pi.registerTool({
    name: "generate_plan",
    label: "Generate Plan",
    description:
      "Generate a structured implementation plan from a todo ID, file path, or freeform description.",
    parameters: Type.Object({
      input: Type.String({
        description:
          "A TODO-<hex> ID, a file path, or a freeform text description to generate a plan from.",
      }),
    }),
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const { input } = params as { input: string };
      const result = await handleGeneratePlan(input, false, ctx);
      return {
        content: [{ type: "text" as const, text: result.message }],
        details: { success: result.success },
      };
    },
  });
}
