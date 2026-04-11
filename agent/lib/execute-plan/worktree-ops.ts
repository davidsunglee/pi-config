import { join, basename, resolve } from "node:path";
import type { ExecutionIO, WorkspaceInfo } from "./types.ts";

/**
 * Derives a branch name from a plan filename.
 * Strips an optional date prefix (YYYY-MM-DD-) and the .md extension,
 * then prepends "plan/".
 *
 * Examples:
 *   "2026-04-10-execute-plan-extension.md" → "plan/execute-plan-extension"
 *   "my-feature.md"                        → "plan/my-feature"
 */
export function suggestBranchName(planFileName: string): string {
  // Remove directory component if present
  const name = basename(planFileName);

  // Strip .md extension
  const withoutExt = name.endsWith(".md") ? name.slice(0, -3) : name;

  // Strip date prefix matching YYYY-MM-DD- at the start
  const withoutDate = withoutExt.replace(/^\d{4}-\d{2}-\d{2}-/, "");

  return `plan/${withoutDate}`;
}

/**
 * Checks for a worktrees directory adjacent to cwd.
 * Prefers ".worktrees/" over "worktrees/".
 * Returns the absolute path to the first found directory, or null.
 */
export async function findWorktreeDir(
  io: ExecutionIO,
  cwd: string,
): Promise<string | null> {
  const candidates = [
    join(cwd, ".worktrees"),
    join(cwd, "worktrees"),
  ];

  for (const candidate of candidates) {
    if (await io.fileExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Creates a new git worktree at `<worktreeDir>/<branchSlug>` on branch `branch`.
 * Returns a WorkspaceInfo with type "worktree".
 *
 * The engine calls this AFTER receiving a WorkspaceChoice from the callback —
 * this function performs the actual git operation.
 */
export async function createWorktree(
  io: ExecutionIO,
  cwd: string,
  worktreeDir: string,
  branch: string,
): Promise<WorkspaceInfo> {
  // Derive a directory name from the branch slug (strip "plan/" prefix if present)
  const dirName = branch.replace(/^plan\//, "");

  // Validate against path traversal (e.g. branch = "plan/../../etc")
  const worktreePath = join(worktreeDir, dirName);
  if (!resolve(worktreePath).startsWith(resolve(worktreeDir) + "/") &&
      resolve(worktreePath) !== resolve(worktreeDir)) {
    throw new Error(
      `Invalid branch name "${branch}": resolved worktree path escapes the worktree directory.`,
    );
  }

  const result = await io.exec(
    "git",
    ["worktree", "add", "-b", branch, worktreePath],
    cwd,
  );

  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to create worktree at ${worktreePath}: ${result.stderr.trim()}`,
    );
  }

  return {
    type: "worktree",
    path: worktreePath,
    branch,
  };
}

/**
 * Verifies that a worktree exists both on disk and in `git worktree list`.
 * Returns true only when both checks pass.
 */
export async function verifyWorktreeExists(
  io: ExecutionIO,
  worktreePath: string,
): Promise<boolean> {
  // Check that the path exists on disk
  const pathExists = await io.fileExists(worktreePath);
  if (!pathExists) {
    return false;
  }

  // Check that git knows about the worktree
  // We need a cwd for git — use the worktreePath itself or derive from it.
  // git worktree list works from any git dir; use worktreePath as cwd.
  const result = await io.exec("git", ["worktree", "list", "--porcelain"], worktreePath);
  if (result.exitCode !== 0) {
    return false;
  }

  return result.stdout.includes(`worktree ${worktreePath}`);
}

/**
 * Removes a git worktree. Throws if the operation fails.
 */
export async function removeWorktree(
  io: ExecutionIO,
  cwd: string,
  worktreePath: string,
): Promise<void> {
  const result = await io.exec(
    "git",
    ["worktree", "remove", worktreePath],
    cwd,
  );

  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to remove worktree at ${worktreePath}: ${result.stderr.trim()}`,
    );
  }
}

/**
 * Returns true if the given directory is listed in .gitignore (or any
 * gitignore rule) — determined by `git check-ignore -q <dir>`.
 *
 * The engine checks this before creating a worktree to warn when the
 * worktrees directory is not git-ignored (which would cause the nested
 * git repos to be tracked).
 */
export async function isWorktreeDirectoryIgnored(
  io: ExecutionIO,
  cwd: string,
  dir: string,
): Promise<boolean> {
  const result = await io.exec("git", ["check-ignore", "-q", dir], cwd);
  // exit code 0 = ignored, 1 = not ignored, 128 = error
  return result.exitCode === 0;
}
