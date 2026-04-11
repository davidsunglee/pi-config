import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ExecutionIO, ExecResult } from "./types.ts";
import {
  isGitRepo,
  isDirty,
  getCurrentBranch,
  isMainBranch,
  commitWave,
  resetWaveCommit,
  verifyCommitExists,
  getHeadSha,
  isInWorktree,
} from "./git-ops.ts";

function createMockIO(responses: Map<string, ExecResult>) {
  return {
    exec: async (cmd: string, args: string[], _cwd: string) => {
      const key = `${cmd} ${args.join(" ")}`;
      return responses.get(key) ?? { stdout: "", stderr: "", exitCode: 1 };
    },
  } as unknown as ExecutionIO;
}

const TEST_CWD = "/fake/cwd";

describe("isGitRepo", () => {
  // (a) returns true when git rev-parse succeeds
  it("returns true when inside a git repo", async () => {
    const io = createMockIO(
      new Map([
        [
          "git rev-parse --git-dir",
          { stdout: ".git\n", stderr: "", exitCode: 0 },
        ],
      ]),
    );
    const result = await isGitRepo(io, TEST_CWD);
    assert.equal(result, true);
  });

  // (a) returns false when git rev-parse fails
  it("returns false when not inside a git repo", async () => {
    const io = createMockIO(
      new Map([
        [
          "git rev-parse --git-dir",
          {
            stdout: "",
            stderr: "not a git repository",
            exitCode: 128,
          },
        ],
      ]),
    );
    const result = await isGitRepo(io, TEST_CWD);
    assert.equal(result, false);
  });
});

describe("isDirty", () => {
  // (b) returns true when there are uncommitted changes
  it("returns true when working tree has changes", async () => {
    const io = createMockIO(
      new Map([
        [
          "git status --porcelain",
          { stdout: "M  src/foo.ts\n", stderr: "", exitCode: 0 },
        ],
      ]),
    );
    const result = await isDirty(io, TEST_CWD);
    assert.equal(result, true);
  });

  // (b) returns false when working tree is clean
  it("returns false when working tree is clean", async () => {
    const io = createMockIO(
      new Map([
        [
          "git status --porcelain",
          { stdout: "", stderr: "", exitCode: 0 },
        ],
      ]),
    );
    const result = await isDirty(io, TEST_CWD);
    assert.equal(result, false);
  });
});

describe("getCurrentBranch", () => {
  // (c) returns branch name
  it("returns the current branch name", async () => {
    const io = createMockIO(
      new Map([
        [
          "git rev-parse --abbrev-ref HEAD",
          { stdout: "feature/my-branch\n", stderr: "", exitCode: 0 },
        ],
      ]),
    );
    const result = await getCurrentBranch(io, TEST_CWD);
    assert.equal(result, "feature/my-branch");
  });
});

describe("isMainBranch", () => {
  // (d) returns true for main
  it("returns true for main branch", async () => {
    const io = createMockIO(
      new Map([
        [
          "git rev-parse --abbrev-ref HEAD",
          { stdout: "main\n", stderr: "", exitCode: 0 },
        ],
      ]),
    );
    assert.equal(await isMainBranch(io, TEST_CWD), true);
  });

  // (d) returns true for master
  it("returns true for master branch", async () => {
    const io = createMockIO(
      new Map([
        [
          "git rev-parse --abbrev-ref HEAD",
          { stdout: "master\n", stderr: "", exitCode: 0 },
        ],
      ]),
    );
    assert.equal(await isMainBranch(io, TEST_CWD), true);
  });

  // (d) returns true for develop
  it("returns true for develop branch", async () => {
    const io = createMockIO(
      new Map([
        [
          "git rev-parse --abbrev-ref HEAD",
          { stdout: "develop\n", stderr: "", exitCode: 0 },
        ],
      ]),
    );
    assert.equal(await isMainBranch(io, TEST_CWD), true);
  });

  // (d) returns false for feature branch
  it("returns false for feature branch", async () => {
    const io = createMockIO(
      new Map([
        [
          "git rev-parse --abbrev-ref HEAD",
          { stdout: "feature/new-thing\n", stderr: "", exitCode: 0 },
        ],
      ]),
    );
    assert.equal(await isMainBranch(io, TEST_CWD), false);
  });
});

describe("commitWave", () => {
  function makeCommitIO(sha: string = "abc1234def5678") {
    // Tracks calls to verify order and args
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const io = {
      exec: async (cmd: string, args: string[], _cwd: string) => {
        calls.push({ cmd, args });
        const key = `${cmd} ${args.join(" ")}`;
        if (key === "git add -A") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (cmd === "git" && args[0] === "commit") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (key === "git rev-parse HEAD") {
          return { stdout: `${sha}\n`, stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 1 };
      },
    } as unknown as ExecutionIO;
    return { io, calls };
  }

  // (e) stages all and commits with correct message format
  it("stages all files before committing", async () => {
    const { io, calls } = makeCommitIO();
    await commitWave(io, TEST_CWD, 1, "Implement user authentication", [
      { number: 1, title: "Add login endpoint" },
      { number: 2, title: "Add JWT middleware" },
    ]);
    const addCall = calls.find(
      (c) => c.cmd === "git" && c.args[0] === "add" && c.args[1] === "-A",
    );
    assert.ok(addCall, "Should have called git add -A");
  });

  it("uses --allow-empty flag in commit", async () => {
    const { io, calls } = makeCommitIO();
    await commitWave(io, TEST_CWD, 1, "Implement user authentication", [
      { number: 1, title: "Add login endpoint" },
    ]);
    const commitCall = calls.find(
      (c) => c.cmd === "git" && c.args[0] === "commit",
    );
    assert.ok(commitCall, "Should have called git commit");
    assert.ok(
      commitCall!.args.includes("--allow-empty"),
      "Should use --allow-empty flag",
    );
  });

  it("includes wave number and goal summary in commit message", async () => {
    const { io, calls } = makeCommitIO();
    await commitWave(io, TEST_CWD, 3, "Implement user authentication", [
      { number: 5, title: "Add login endpoint" },
    ]);
    const commitCall = calls.find(
      (c) => c.cmd === "git" && c.args[0] === "commit",
    );
    assert.ok(commitCall);
    const msgIdx = commitCall!.args.indexOf("-m");
    assert.ok(msgIdx >= 0, "Should have -m flag");
    const msg = commitCall!.args[msgIdx + 1];
    assert.match(msg, /feat\(plan\): wave 3 - Implement user authentication/);
  });

  it("includes task list in commit message body", async () => {
    const { io, calls } = makeCommitIO();
    await commitWave(io, TEST_CWD, 1, "Build feature", [
      { number: 1, title: "Add login endpoint" },
      { number: 2, title: "Add JWT middleware" },
    ]);
    const commitCall = calls.find(
      (c) => c.cmd === "git" && c.args[0] === "commit",
    );
    assert.ok(commitCall);
    const msgIdx = commitCall!.args.indexOf("-m");
    const msg = commitCall!.args[msgIdx + 1];
    assert.match(msg, /- Task 1: Add login endpoint/);
    assert.match(msg, /- Task 2: Add JWT middleware/);
  });

  it("truncates goal summary to ~72 chars", async () => {
    const { io, calls } = makeCommitIO();
    const longGoal =
      "This is a very long goal summary that exceeds the seventy two character limit by quite a bit";
    await commitWave(io, TEST_CWD, 1, longGoal, [
      { number: 1, title: "Some task" },
    ]);
    const commitCall = calls.find(
      (c) => c.cmd === "git" && c.args[0] === "commit",
    );
    assert.ok(commitCall);
    const msgIdx = commitCall!.args.indexOf("-m");
    const msg = commitCall!.args[msgIdx + 1];
    const firstLine = msg.split("\n")[0];
    // "feat(plan): wave 1 - " is 21 chars, so total first line should be <= ~93
    // The summary part should be truncated
    assert.ok(
      firstLine.length <= 93,
      `First line too long: ${firstLine.length} chars`,
    );
  });

  // (f) always returns a SHA string (never null)
  it("always returns a SHA string", async () => {
    const { io } = makeCommitIO("deadbeef1234567890ab");
    const sha = await commitWave(io, TEST_CWD, 1, "Build feature", [
      { number: 1, title: "Some task" },
    ]);
    assert.equal(typeof sha, "string");
    assert.ok(sha.length > 0, "SHA should not be empty");
    assert.equal(sha, "deadbeef1234567890ab");
  });

  it("returns trimmed SHA string without trailing newline", async () => {
    const { io } = makeCommitIO("abc123\n");
    const sha = await commitWave(io, TEST_CWD, 1, "Build feature", [
      { number: 1, title: "Some task" },
    ]);
    assert.equal(sha, "abc123");
  });
});

describe("resetWaveCommit", () => {
  // (g) does hard reset to discard the last commit
  it("performs git reset --hard HEAD~1", async () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const io = {
      exec: async (cmd: string, args: string[], _cwd: string) => {
        calls.push({ cmd, args });
        return { stdout: "", stderr: "", exitCode: 0 };
      },
    } as unknown as ExecutionIO;

    await resetWaveCommit(io, TEST_CWD);

    assert.equal(calls.length, 1, "Should make exactly 1 git call");

    const [first] = calls;
    assert.equal(first.cmd, "git");
    assert.deepEqual(first.args, ["reset", "--hard", "HEAD~1"]);
  });
});

describe("verifyCommitExists", () => {
  // (h) checks SHA exists
  it("returns true when commit SHA exists", async () => {
    const sha = "abc1234def5678";
    const io = createMockIO(
      new Map([
        [
          `git cat-file -e ${sha}`,
          { stdout: "", stderr: "", exitCode: 0 },
        ],
      ]),
    );
    const result = await verifyCommitExists(io, TEST_CWD, sha);
    assert.equal(result, true);
  });

  it("returns false when commit SHA does not exist", async () => {
    const sha = "nonexistentsha123";
    const io = createMockIO(
      new Map([
        [
          `git cat-file -e ${sha}`,
          { stdout: "", stderr: "", exitCode: 1 },
        ],
      ]),
    );
    const result = await verifyCommitExists(io, TEST_CWD, sha);
    assert.equal(result, false);
  });
});

describe("getHeadSha", () => {
  // (i) returns HEAD SHA
  it("returns the current HEAD SHA", async () => {
    const io = createMockIO(
      new Map([
        [
          "git rev-parse HEAD",
          { stdout: "f0e1d2c3b4a5\n", stderr: "", exitCode: 0 },
        ],
      ]),
    );
    const result = await getHeadSha(io, TEST_CWD);
    assert.equal(result, "f0e1d2c3b4a5");
  });

  it("trims trailing whitespace from HEAD SHA", async () => {
    const io = createMockIO(
      new Map([
        [
          "git rev-parse HEAD",
          { stdout: "  deadbeef  \n", stderr: "", exitCode: 0 },
        ],
      ]),
    );
    const result = await getHeadSha(io, TEST_CWD);
    assert.equal(result, "deadbeef");
  });
});

describe("isInWorktree", () => {
  // (j) detects worktree
  it("returns true when in a git worktree", async () => {
    const io = createMockIO(
      new Map([
        [
          "git rev-parse --git-dir",
          {
            stdout: "/path/to/repo/.git/worktrees/my-branch\n",
            stderr: "",
            exitCode: 0,
          },
        ],
      ]),
    );
    const result = await isInWorktree(io, TEST_CWD);
    assert.equal(result, true);
  });

  it("returns false when in the main working tree", async () => {
    const io = createMockIO(
      new Map([
        [
          "git rev-parse --git-dir",
          { stdout: ".git\n", stderr: "", exitCode: 0 },
        ],
      ]),
    );
    const result = await isInWorktree(io, TEST_CWD);
    assert.equal(result, false);
  });

  it("returns false when not in a git repo", async () => {
    const io = createMockIO(
      new Map([
        [
          "git rev-parse --git-dir",
          {
            stdout: "",
            stderr: "not a git repository",
            exitCode: 128,
          },
        ],
      ]),
    );
    const result = await isInWorktree(io, TEST_CWD);
    assert.equal(result, false);
  });
});
