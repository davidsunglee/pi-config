import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ExecutionIO, ExecResult } from "./types.ts";
import {
  suggestBranchName,
  findWorktreeDir,
  createWorktree,
  verifyWorktreeExists,
  removeWorktree,
  isWorktreeDirectoryIgnored,
} from "./worktree-ops.ts";

function createMockIO(responses: Map<string, ExecResult>) {
  return {
    exec: async (cmd: string, args: string[], _cwd: string) => {
      const key = `${cmd} ${args.join(" ")}`;
      return responses.get(key) ?? { stdout: "", stderr: "", exitCode: 1 };
    },
    fileExists: async (_path: string) => false,
  } as unknown as ExecutionIO;
}

const TEST_CWD = "/fake/cwd";

// ── (a) suggestBranchName ────────────────────────────────────────────

describe("suggestBranchName", () => {
  it("strips date prefix and .md and prepends plan/", () => {
    const result = suggestBranchName("2026-04-10-execute-plan-extension.md");
    assert.equal(result, "plan/execute-plan-extension");
  });

  it("handles filename without date prefix", () => {
    const result = suggestBranchName("my-feature.md");
    assert.equal(result, "plan/my-feature");
  });

  it("strips .md extension when no date prefix present", () => {
    const result = suggestBranchName("some-plan.md");
    assert.equal(result, "plan/some-plan");
  });

  it("handles filename with date prefix and multiple hyphens in name", () => {
    const result = suggestBranchName(
      "2024-01-15-add-user-auth-and-oauth.md",
    );
    assert.equal(result, "plan/add-user-auth-and-oauth");
  });

  it("handles filename with no extension", () => {
    const result = suggestBranchName("2026-04-10-my-plan");
    assert.equal(result, "plan/my-plan");
  });
});

// ── (b) findWorktreeDir ──────────────────────────────────────────────

describe("findWorktreeDir", () => {
  it("returns .worktrees/ path when .worktrees directory exists", async () => {
    const io = {
      exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
      fileExists: async (path: string) => path === "/fake/cwd/.worktrees",
    } as unknown as ExecutionIO;

    const result = await findWorktreeDir(io, TEST_CWD);
    assert.equal(result, "/fake/cwd/.worktrees");
  });

  it("returns worktrees/ path when worktrees directory exists (no dot prefix)", async () => {
    const io = {
      exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
      fileExists: async (path: string) => path === "/fake/cwd/worktrees",
    } as unknown as ExecutionIO;

    const result = await findWorktreeDir(io, TEST_CWD);
    assert.equal(result, "/fake/cwd/worktrees");
  });

  it("prefers .worktrees/ over worktrees/ when both exist", async () => {
    const io = {
      exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
      fileExists: async (_path: string) => true,
    } as unknown as ExecutionIO;

    const result = await findWorktreeDir(io, TEST_CWD);
    assert.equal(result, "/fake/cwd/.worktrees");
  });

  it("returns null when neither directory exists", async () => {
    const io = {
      exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
      fileExists: async (_path: string) => false,
    } as unknown as ExecutionIO;

    const result = await findWorktreeDir(io, TEST_CWD);
    assert.equal(result, null);
  });
});

// ── (c) createWorktree ───────────────────────────────────────────────

describe("createWorktree", () => {
  it("runs git worktree add and returns WorkspaceInfo with type worktree", async () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const io = {
      exec: async (cmd: string, args: string[], _cwd: string) => {
        calls.push({ cmd, args });
        return { stdout: "", stderr: "", exitCode: 0 };
      },
    } as unknown as ExecutionIO;

    const result = await createWorktree(
      io,
      TEST_CWD,
      "/fake/cwd/.worktrees",
      "plan/my-feature",
    );

    assert.equal(result.type, "worktree");
    assert.equal(result.branch, "plan/my-feature");
    assert.ok(result.path.length > 0);
  });

  it("calls git worktree add with correct arguments", async () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const io = {
      exec: async (cmd: string, args: string[], _cwd: string) => {
        calls.push({ cmd, args });
        return { stdout: "", stderr: "", exitCode: 0 };
      },
    } as unknown as ExecutionIO;

    await createWorktree(
      io,
      TEST_CWD,
      "/fake/cwd/.worktrees",
      "plan/my-feature",
    );

    const worktreeCall = calls.find(
      (c) => c.cmd === "git" && c.args[0] === "worktree",
    );
    assert.ok(worktreeCall, "Should have called git worktree");
    assert.equal(worktreeCall!.args[1], "add");
    // Should include -b flag with the branch name
    assert.ok(
      worktreeCall!.args.includes("-b"),
      "Should use -b flag to create new branch",
    );
    assert.ok(
      worktreeCall!.args.includes("plan/my-feature"),
      "Should include branch name",
    );
  });

  it("returns path inside the worktrees directory", async () => {
    const io = {
      exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
    } as unknown as ExecutionIO;

    const result = await createWorktree(
      io,
      TEST_CWD,
      "/fake/cwd/.worktrees",
      "plan/my-feature",
    );

    assert.ok(
      result.path.startsWith("/fake/cwd/.worktrees"),
      `Expected path to start with worktreeDir, got: ${result.path}`,
    );
  });

  it("throws when git worktree add fails", async () => {
    const io = {
      exec: async () => ({ stdout: "", stderr: "error: branch already exists", exitCode: 128 }),
    } as unknown as ExecutionIO;

    await assert.rejects(
      () => createWorktree(io, TEST_CWD, "/fake/cwd/.worktrees", "plan/existing"),
      /Failed to create worktree/,
    );
  });
});

// ── (d) verifyWorktreeExists ─────────────────────────────────────────

describe("verifyWorktreeExists", () => {
  it("returns true when path exists and appears in git worktree list", async () => {
    const io = {
      exec: async (cmd: string, args: string[], _cwd: string) => {
        const key = `${cmd} ${args.join(" ")}`;
        if (key === "git worktree list --porcelain") {
          return {
            stdout:
              "worktree /fake/cwd/.worktrees/my-feature\nHEAD abc1234\nbranch refs/heads/plan/my-feature\n\n",
            stderr: "",
            exitCode: 0,
          };
        }
        return { stdout: "", stderr: "", exitCode: 1 };
      },
      fileExists: async (path: string) =>
        path === "/fake/cwd/.worktrees/my-feature",
    } as unknown as ExecutionIO;

    const result = await verifyWorktreeExists(
      io,
      "/fake/cwd/.worktrees/my-feature",
    );
    assert.equal(result, true);
  });

  it("returns false when path does not exist on disk", async () => {
    const io = {
      exec: async () => ({
        stdout: "worktree /fake/cwd/.worktrees/my-feature\n",
        stderr: "",
        exitCode: 0,
      }),
      fileExists: async (_path: string) => false,
    } as unknown as ExecutionIO;

    const result = await verifyWorktreeExists(
      io,
      "/fake/cwd/.worktrees/my-feature",
    );
    assert.equal(result, false);
  });

  it("returns false when path not in git worktree list", async () => {
    const io = {
      exec: async () => ({
        stdout: "worktree /fake/cwd/.worktrees/other-feature\n",
        stderr: "",
        exitCode: 0,
      }),
      fileExists: async (_path: string) => true,
    } as unknown as ExecutionIO;

    const result = await verifyWorktreeExists(
      io,
      "/fake/cwd/.worktrees/my-feature",
    );
    assert.equal(result, false);
  });

  it("returns false when git worktree list fails", async () => {
    const io = {
      exec: async () => ({ stdout: "", stderr: "fatal: error", exitCode: 128 }),
      fileExists: async (_path: string) => true,
    } as unknown as ExecutionIO;

    const result = await verifyWorktreeExists(
      io,
      "/fake/cwd/.worktrees/my-feature",
    );
    assert.equal(result, false);
  });
});

// ── (e) isWorktreeDirectoryIgnored ───────────────────────────────────

describe("isWorktreeDirectoryIgnored", () => {
  it("returns true when git check-ignore exits 0", async () => {
    const io = createMockIO(
      new Map([
        [
          "git check-ignore -q .worktrees",
          { stdout: ".worktrees\n", stderr: "", exitCode: 0 },
        ],
      ]),
    );

    const result = await isWorktreeDirectoryIgnored(io, TEST_CWD, ".worktrees");
    assert.equal(result, true);
  });

  it("returns false when git check-ignore exits 1 (not ignored)", async () => {
    const io = createMockIO(
      new Map([
        [
          "git check-ignore -q .worktrees",
          { stdout: "", stderr: "", exitCode: 1 },
        ],
      ]),
    );

    const result = await isWorktreeDirectoryIgnored(io, TEST_CWD, ".worktrees");
    assert.equal(result, false);
  });

  it("returns false when git check-ignore fails with non-zero code", async () => {
    const io = createMockIO(
      new Map([
        [
          "git check-ignore -q worktrees",
          { stdout: "", stderr: "fatal: not a git repo", exitCode: 128 },
        ],
      ]),
    );

    const result = await isWorktreeDirectoryIgnored(io, TEST_CWD, "worktrees");
    assert.equal(result, false);
  });

  it("passes the directory name to git check-ignore", async () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const io = {
      exec: async (cmd: string, args: string[], _cwd: string) => {
        calls.push({ cmd, args });
        return { stdout: "", stderr: "", exitCode: 0 };
      },
    } as unknown as ExecutionIO;

    await isWorktreeDirectoryIgnored(io, TEST_CWD, "my-worktrees");

    const call = calls.find(
      (c) => c.cmd === "git" && c.args[0] === "check-ignore",
    );
    assert.ok(call, "Should have called git check-ignore");
    assert.ok(
      call!.args.includes("my-worktrees"),
      "Should pass directory name to git check-ignore",
    );
  });
});

// ── removeWorktree ───────────────────────────────────────────────────

describe("removeWorktree", () => {
  it("calls git worktree remove with the path", async () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const io = {
      exec: async (cmd: string, args: string[], _cwd: string) => {
        calls.push({ cmd, args });
        return { stdout: "", stderr: "", exitCode: 0 };
      },
    } as unknown as ExecutionIO;

    await removeWorktree(io, TEST_CWD, "/fake/cwd/.worktrees/my-feature");

    const removeCall = calls.find(
      (c) =>
        c.cmd === "git" &&
        c.args[0] === "worktree" &&
        c.args[1] === "remove",
    );
    assert.ok(removeCall, "Should have called git worktree remove");
    assert.ok(
      removeCall!.args.includes("/fake/cwd/.worktrees/my-feature"),
      "Should pass the worktree path",
    );
  });

  it("throws when git worktree remove fails", async () => {
    const io = {
      exec: async () => ({
        stdout: "",
        stderr: "error: worktree is not prunable",
        exitCode: 1,
      }),
    } as unknown as ExecutionIO;

    await assert.rejects(
      () => removeWorktree(io, TEST_CWD, "/fake/cwd/.worktrees/my-feature"),
      /Failed to remove worktree/,
    );
  });
});
