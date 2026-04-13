/**
 * PiGenerationIO — Node.js implementation of GenerationIO.
 *
 * Bridges the generate-plan engine to Node.js file system APIs.
 * File operations delegate to `node:fs/promises`; todo reading and subagent
 * dispatch delegate to injected functions supplied by the extension host.
 */

import * as fs from "node:fs/promises";

import type {
  GenerationIO,
  SubagentDispatchConfig,
  SubagentOutput,
} from "../../lib/generate-plan/types.ts";

export class PiGenerationIO implements GenerationIO {
  private dispatchFn: (config: SubagentDispatchConfig) => Promise<SubagentOutput>;
  private todoReadFn: (todoId: string) => Promise<{ title: string; body: string }>;

  constructor(
    dispatchFn: (config: SubagentDispatchConfig) => Promise<SubagentOutput>,
    todoReadFn: (todoId: string) => Promise<{ title: string; body: string }>,
  ) {
    this.dispatchFn = dispatchFn;
    this.todoReadFn = todoReadFn;
  }

  // ── File operations ──────────────────────────────────────────────────

  readFile(path: string): Promise<string> {
    return fs.readFile(path, "utf-8");
  }

  writeFile(path: string, content: string): Promise<void> {
    return fs.writeFile(path, content, "utf-8");
  }

  async fileExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  mkdir(path: string): Promise<void> {
    return fs.mkdir(path, { recursive: true }).then(() => undefined);
  }

  readdir(path: string): Promise<string[]> {
    return fs.readdir(path);
  }

  // ── Todo reading ─────────────────────────────────────────────────────

  readTodo(todoId: string): Promise<{ title: string; body: string }> {
    return this.todoReadFn(todoId);
  }

  // ── Subagent dispatch ────────────────────────────────────────────────

  dispatchSubagent(config: SubagentDispatchConfig): Promise<SubagentOutput> {
    return this.dispatchFn(config);
  }
}
