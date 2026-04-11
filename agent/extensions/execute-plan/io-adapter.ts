/**
 * PiExecutionIO — Node.js implementation of ExecutionIO.
 *
 * Bridges the execute-plan engine to Node.js file system and process APIs.
 * File operations delegate to `node:fs/promises`; process execution uses
 * `node:child_process.spawn`; subagent dispatch delegates to an injected
 * `dispatchFn`.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";

import type {
  ExecutionIO,
  ExecResult,
  SubagentConfig,
  SubagentResult,
} from "../../lib/execute-plan/types.ts";

export class PiExecutionIO implements ExecutionIO {
  private dispatchFn: (
    config: SubagentConfig,
    options?: {
      signal?: AbortSignal;
      onProgress?: (taskNumber: number, status: string) => void;
    },
  ) => Promise<SubagentResult>;
  private sessionId: string;

  constructor(
    dispatchFn: (
      config: SubagentConfig,
      options?: {
        signal?: AbortSignal;
        onProgress?: (taskNumber: number, status: string) => void;
      },
    ) => Promise<SubagentResult>,
    sessionId: string,
  ) {
    this.dispatchFn = dispatchFn;
    this.sessionId = sessionId;
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

  unlink(path: string): Promise<void> {
    return fs.unlink(path);
  }

  rename(src: string, dest: string): Promise<void> {
    return fs.rename(src, dest);
  }

  readdir(path: string): Promise<string[]> {
    return fs.readdir(path);
  }

  // ── Process execution ────────────────────────────────────────────────

  exec(command: string, args: string[], cwd: string): Promise<ExecResult> {
    return new Promise<ExecResult>((resolve) => {
      const proc = spawn(command, args, {
        cwd,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      proc.stdout.on("data", (chunk: Buffer) => {
        stdoutChunks.push(chunk);
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        stderrChunks.push(chunk);
      });

      proc.on("close", (code: number | null) => {
        const stdout = Buffer.concat(stdoutChunks).toString("utf-8");
        const stderr = Buffer.concat(stderrChunks).toString("utf-8");
        // code may be null if process was killed by signal — map to 1
        const exitCode = code ?? 1;
        resolve({ stdout, stderr, exitCode });
      });

      proc.on("error", () => {
        const stdout = Buffer.concat(stdoutChunks).toString("utf-8");
        const stderr = Buffer.concat(stderrChunks).toString("utf-8");
        resolve({ stdout, stderr, exitCode: 1 });
      });
    });
  }

  // ── Subagent dispatch ────────────────────────────────────────────────

  dispatchSubagent(
    config: SubagentConfig,
    options?: {
      signal?: AbortSignal;
      onProgress?: (taskNumber: number, status: string) => void;
    },
  ): Promise<SubagentResult> {
    return this.dispatchFn(config, options);
  }

  // ── Identity ─────────────────────────────────────────────────────────

  getPid(): number {
    return process.pid;
  }

  getSessionId(): string {
    return this.sessionId;
  }
}
