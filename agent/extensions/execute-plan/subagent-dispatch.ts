/**
 * Subagent dispatch for the execute-plan extension.
 *
 * Spawns pi worker processes, parses their JSON event streams, and returns
 * structured SubagentResult values. Follows the same process-spawning pattern
 * as the pi-coding-agent subagent example.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { parseFrontmatter } from "@mariozechner/pi-coding-agent";

import type { SubagentConfig, SubagentResult, WorkerStatus } from "../../lib/execute-plan/types.ts";

// ── Agent config ─────────────────────────────────────────────────────

export interface AgentConfig {
  name: string;
  description: string;
  model: string;
  tools: string[];
  systemPrompt: string;
}

// ── parseWorkerResponse ───────────────────────────────────────────────

/**
 * Parse a worker's final text output into a structured SubagentResult.
 *
 * Workers are expected to start their response with a STATUS line:
 *   STATUS: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED
 *
 * Followed by sections like:
 *   ## Files Changed
 *   - path/to/file.ts
 *
 *   ## Concerns / ## Needs / ## Blocker
 *   Details...
 *
 * If no valid STATUS line is found, returns BLOCKED with a parse error.
 */
export function parseWorkerResponse(output: string, taskNumber: number): SubagentResult {
  const lines = output.split("\n");

  // Find STATUS line — look for "STATUS: <code>" anywhere in first ~5 lines
  let status: WorkerStatus | null = null;
  for (const line of lines.slice(0, 10)) {
    const match = line.match(/^\s*STATUS:\s*(DONE_WITH_CONCERNS|DONE|NEEDS_CONTEXT|BLOCKED)\s*$/i);
    if (match) {
      status = match[1].toUpperCase() as WorkerStatus;
      break;
    }
  }

  if (!status) {
    return {
      taskNumber,
      status: "BLOCKED",
      output,
      concerns: null,
      needs: null,
      blocker: `Worker output did not contain a valid STATUS line. Output preview: ${output.slice(0, 200)}`,
      filesChanged: [],
    };
  }

  // Extract section content — looks for markdown headings like "## Section Name"
  const sectionContent = extractSection(output);

  const filesChanged = parseFilesChanged(output);

  const blocker = status === "BLOCKED" ? (sectionContent["blocker"] ?? sectionContent["blocked"] ?? null) : null;
  const concerns = status === "DONE_WITH_CONCERNS" ? (sectionContent["concerns"] ?? sectionContent["concern"] ?? null) : null;
  const needs = status === "NEEDS_CONTEXT" ? (sectionContent["needs"] ?? sectionContent["need"] ?? null) : null;

  return {
    taskNumber,
    status,
    output,
    concerns,
    needs,
    blocker,
    filesChanged,
  };
}

/**
 * Extract section bodies from markdown-style `## Heading` sections.
 * Returns a map from lowercased heading name to section body text.
 */
function extractSection(output: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = output.split("\n");

  let currentSection: string | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    if (currentSection !== null) {
      result[currentSection] = currentLines.join("\n").trim();
    }
  };

  for (const line of lines) {
    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      flush();
      currentSection = heading[1].toLowerCase().trim();
      currentLines = [];
    } else if (currentSection !== null) {
      currentLines.push(line);
    }
  }
  flush();

  return result;
}

/**
 * Parse file paths from a "## Files Changed" section.
 * Expects lines like:  - path/to/file.ts  or  - `path/to/file.ts` — description
 */
function parseFilesChanged(output: string): string[] {
  const files: string[] = [];

  // Find "## Files Changed" section
  const sectionMatch = output.match(/^#{1,3}\s+files?\s+changed\s*$/im);
  if (!sectionMatch) return files;

  const afterSection = output.slice(output.indexOf(sectionMatch[0]) + sectionMatch[0].length);
  const lines = afterSection.split("\n");

  for (const line of lines) {
    // Stop at next heading
    if (/^#{1,3}\s/.test(line)) break;

    // Match list item with optional backtick-wrapped path and optional description
    const match = line.match(/^\s*[-*]\s+`?([^\s`—–]+)`?/);
    if (match) {
      const filePath = match[1].trim();
      if (filePath) {
        files.push(filePath);
      }
    }
  }

  return files;
}

// ── loadAgentConfig ───────────────────────────────────────────────────

/**
 * Load an agent configuration from `<agentDir>/agents/<agentName>.md`.
 *
 * Returns null if the file does not exist or cannot be parsed.
 */
export async function loadAgentConfig(
  agentDir: string,
  agentName: string,
): Promise<AgentConfig | null> {
  const filePath = path.join(agentDir, "agents", `${agentName}.md`);

  let content: string;
  try {
    content = await fs.promises.readFile(filePath, "utf-8");
  } catch {
    return null;
  }

  let frontmatter: Record<string, string>;
  let body: string;
  try {
    const parsed = parseFrontmatter<Record<string, string>>(content);
    frontmatter = parsed.frontmatter;
    body = parsed.body;
  } catch {
    // Malformed YAML frontmatter — treat as missing config.
    return null;
  }

  if (!frontmatter.name || !frontmatter.description) {
    return null;
  }

  const tools = frontmatter.tools
    ? frontmatter.tools
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  return {
    name: frontmatter.name,
    description: frontmatter.description,
    model: frontmatter.model ?? "",
    tools,
    systemPrompt: body.trim(),
  };
}

// ── getPiInvocation ───────────────────────────────────────────────────

/**
 * Return the command + args to invoke pi.
 * Mirrors the same helper from the pi-coding-agent subagent example.
 */
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

// ── dispatchWorker ────────────────────────────────────────────────────

/**
 * Spawn a pi worker for a single task and collect its result.
 *
 * 1. Loads agent config via loadAgentConfig.
 * 2. Builds CLI args: --mode json -p --no-session [--model] [--tools] [--append-system-prompt].
 * 3. Spawns the process and parses its JSON event stream.
 * 4. Respects AbortSignal — kills the process on abort.
 * 5. Calls onProgress from streamed worker events.
 * 6. Returns SubagentResult via parseWorkerResponse.
 */
export async function dispatchWorker(
  config: SubagentConfig,
  agentDir: string,
  options?: {
    signal?: AbortSignal;
    onProgress?: (taskNumber: number, status: string) => void;
  },
): Promise<SubagentResult> {
  const agentConfig = await loadAgentConfig(agentDir, config.agent);

  const args: string[] = ["--mode", "json", "-p", "--no-session"];

  // Prefer config.model from SubagentConfig, fall back to agent file model.
  const model = config.model || agentConfig?.model;
  if (model) args.push("--model", model);

  // Tools: prefer SubagentConfig.tools, fall back to agent file tools.
  const tools = config.tools ?? agentConfig?.tools;
  if (tools && tools.length > 0) args.push("--tools", tools.join(","));

  let tmpPromptDir: string | null = null;
  let tmpPromptPath: string | null = null;

  try {
    // Write system prompt to temp file if available.
    const systemPrompt = agentConfig?.systemPrompt;
    if (systemPrompt && systemPrompt.trim()) {
      tmpPromptDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-worker-"));
      tmpPromptPath = path.join(tmpPromptDir, `prompt-${config.agent.replace(/[^\w.-]+/g, "_")}.md`);
      await fs.promises.writeFile(tmpPromptPath, systemPrompt, { encoding: "utf-8", mode: 0o600 });
      args.push("--append-system-prompt", tmpPromptPath);
    }

    // The task prompt is the final positional argument.
    args.push(config.task);

    let finalOutput = "";
    let wasAborted = false;

    const exitCode = await new Promise<number>((resolve) => {
      const invocation = getPiInvocation(args);
      const proc = spawn(invocation.command, invocation.args, {
        cwd: config.cwd,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });

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

        // Emit progress from intermediate streamed events for real-time status.
        if (event.type === "content_block_start") {
          const block = event.content_block as { type?: string; name?: string } | undefined;
          if (block?.type === "tool_use" && typeof block.name === "string") {
            options?.onProgress?.(config.taskNumber, `Using tool: ${block.name}`);
          } else if (block?.type === "thinking") {
            options?.onProgress?.(config.taskNumber, "Thinking...");
          } else if (block?.type === "text") {
            options?.onProgress?.(config.taskNumber, "Writing response...");
          }
        } else if (event.type === "message_start") {
          const msg = event.message as { role?: string } | undefined;
          if (msg?.role === "assistant") {
            options?.onProgress?.(config.taskNumber, "Worker started");
          }
        }

        // Extract the final assistant text output.
        if (event.type === "message_end" && event.message) {
          const msg = event.message as { role?: string; content?: Array<{ type: string; text?: string }> };
          if (msg.role === "assistant" && Array.isArray(msg.content)) {
            for (const part of msg.content) {
              if (part.type === "text" && typeof part.text === "string") {
                finalOutput += part.text;
                options?.onProgress?.(config.taskNumber, part.text.slice(0, 100));
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

      if (options?.signal) {
        const signal = options.signal;
        const killProc = () => {
          wasAborted = true;
          proc.kill("SIGTERM");
          setTimeout(() => {
            try {
              proc.kill("SIGKILL");
            } catch {
              // Process already exited
            }
          }, 5000);
        };
        if (signal.aborted) {
          killProc();
        } else {
          signal.addEventListener("abort", killProc, { once: true });
        }
      }
    });

    if (wasAborted) {
      return {
        taskNumber: config.taskNumber,
        status: "BLOCKED",
        output: "",
        concerns: null,
        needs: null,
        blocker: "Worker was aborted",
        filesChanged: [],
      };
    }

    // If process exited non-zero with no output, treat as BLOCKED.
    if (exitCode !== 0 && !finalOutput.trim()) {
      return {
        taskNumber: config.taskNumber,
        status: "BLOCKED",
        output: "",
        concerns: null,
        needs: null,
        blocker: `Worker process exited with code ${exitCode}`,
        filesChanged: [],
      };
    }

    return parseWorkerResponse(finalOutput, config.taskNumber);
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
}

// ── createDispatchFunction ────────────────────────────────────────────

/**
 * Create a dispatch function bound to a specific agentDir.
 *
 * Returns a function matching the ExecutionIO.dispatchSubagent signature,
 * ready to be passed as the dispatchFn parameter to PiExecutionIO.
 */
export function createDispatchFunction(
  agentDir: string,
): (
  config: SubagentConfig,
  options?: {
    signal?: AbortSignal;
    onProgress?: (taskNumber: number, status: string) => void;
  },
) => Promise<SubagentResult> {
  return (config, options) => dispatchWorker(config, agentDir, options);
}
