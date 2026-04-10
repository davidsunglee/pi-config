import type { ExecutionIO } from "./types.ts";

/** Returns true if the given directory is inside a git repository. */
export async function isGitRepo(io: ExecutionIO, cwd: string): Promise<boolean> {
  const result = await io.exec("git", ["rev-parse", "--git-dir"], cwd);
  return result.exitCode === 0;
}

/** Returns true if the working tree has uncommitted changes. */
export async function isDirty(io: ExecutionIO, cwd: string): Promise<boolean> {
  const result = await io.exec("git", ["status", "--porcelain"], cwd);
  return result.exitCode === 0 && result.stdout.trim().length > 0;
}

/** Returns the name of the current branch. */
export async function getCurrentBranch(
  io: ExecutionIO,
  cwd: string,
): Promise<string> {
  const result = await io.exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  return result.stdout.trim();
}

/**
 * Returns true if the current branch is a "main" branch:
 * main, master, or develop.
 */
export async function isMainBranch(io: ExecutionIO, cwd: string): Promise<boolean> {
  const branch = await getCurrentBranch(io, cwd);
  return branch === "main" || branch === "master" || branch === "develop";
}

/**
 * Stages all changes and creates a wave checkpoint commit.
 * Uses --allow-empty so it always succeeds even if nothing changed.
 * Always returns the SHA string of the new commit.
 */
export async function commitWave(
  io: ExecutionIO,
  cwd: string,
  waveNumber: number,
  goalSummary: string,
  tasks: Array<{ number: number; title: string }>,
): Promise<string> {
  // Stage all changes
  await io.exec("git", ["add", "-A"], cwd);

  // Build commit message
  const message = buildCommitMessage(waveNumber, goalSummary, tasks);

  // Commit with --allow-empty to guarantee success
  await io.exec("git", ["commit", "--allow-empty", "-m", message], cwd);

  // Return the SHA of the new commit
  const sha = await getHeadSha(io, cwd);
  return sha;
}

/**
 * Builds a wave commit message:
 *
 *   feat(plan): wave <N> - <goal summary, truncated to ~72 chars>
 *
 *   - Task <X>: <task title>
 *   - Task <Y>: <task title>
 */
function buildCommitMessage(
  waveNumber: number,
  goalSummary: string,
  tasks: Array<{ number: number; title: string }>,
): string {
  // "feat(plan): wave N - " is 21 chars; remaining budget for summary is ~72
  const MAX_SUMMARY_LENGTH = 72;
  const truncatedSummary =
    goalSummary.length > MAX_SUMMARY_LENGTH
      ? goalSummary.slice(0, MAX_SUMMARY_LENGTH).trimEnd() + "…"
      : goalSummary;

  const subject = `feat(plan): wave ${waveNumber} - ${truncatedSummary}`;

  const taskLines = tasks
    .map((t) => `- Task ${t.number}: ${t.title}`)
    .join("\n");

  return `${subject}\n\n${taskLines}`;
}

/**
 * Resets the last wave commit with a two-step process:
 * 1. git reset --soft HEAD~1  (undo commit, keep changes staged)
 * 2. git checkout -- .        (discard all working tree changes)
 */
export async function resetWaveCommit(io: ExecutionIO, cwd: string): Promise<void> {
  await io.exec("git", ["reset", "--soft", "HEAD~1"], cwd);
  await io.exec("git", ["checkout", "--", "."], cwd);
}

/** Returns true if the given SHA exists in the repository. */
export async function verifyCommitExists(
  io: ExecutionIO,
  cwd: string,
  sha: string,
): Promise<boolean> {
  const result = await io.exec("git", ["cat-file", "-e", sha], cwd);
  return result.exitCode === 0;
}

/** Returns the SHA of the current HEAD commit. */
export async function getHeadSha(io: ExecutionIO, cwd: string): Promise<string> {
  const result = await io.exec("git", ["rev-parse", "HEAD"], cwd);
  return result.stdout.trim();
}

/**
 * Returns true if the current directory is inside a git worktree
 * (as opposed to the main working tree).
 */
export async function isInWorktree(io: ExecutionIO, cwd: string): Promise<boolean> {
  const result = await io.exec("git", ["rev-parse", "--git-dir"], cwd);
  if (result.exitCode !== 0) {
    return false;
  }
  // In a worktree, --git-dir returns something like:
  //   /path/to/repo/.git/worktrees/<name>
  // In the main working tree, it returns:
  //   .git
  //   (or an absolute path ending in /.git)
  const gitDir = result.stdout.trim();
  return gitDir.includes("/worktrees/");
}
