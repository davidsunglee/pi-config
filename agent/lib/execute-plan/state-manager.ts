import { join } from "node:path";
import type {
  ExecutionIO,
  RunState,
  WaveState,
  ExecutionSettings,
  WorkspaceInfo,
  LockInfo,
} from "./types.ts";

// ── Path helpers ─────────────────────────────────────────────────────

/** Returns the directory where plan state files are stored (relative). */
export function getStateDir(): string {
  return ".pi/plan-runs";
}

/**
 * Returns the relative path to a plan's state file.
 * Full path is `<cwd>/<getStateFilePath(planFileName)>`.
 */
export function getStateFilePath(planFileName: string): string {
  return `${getStateDir()}/${planFileName}.state.json`;
}

// ── Atomic write ─────────────────────────────────────────────────────

/**
 * Writes content to `path` atomically: writes to `path + '.tmp'` first,
 * then renames to `path`. All state writes use this function.
 */
export async function writeStateAtomic(
  io: ExecutionIO,
  path: string,
  content: string,
): Promise<void> {
  const tmpPath = path + ".tmp";
  await io.writeFile(tmpPath, content);
  await io.rename(tmpPath, path);
}

// ── createState ──────────────────────────────────────────────────────

/**
 * Creates a new RunState for the given plan and writes it to disk.
 * Returns the created state.
 */
export async function createState(
  io: ExecutionIO,
  cwd: string,
  planFileName: string,
  settings: ExecutionSettings,
  workspace: WorkspaceInfo,
): Promise<RunState> {
  const stateDirPath = join(cwd, getStateDir());
  await io.mkdir(stateDirPath);

  const state: RunState = {
    plan: planFileName,
    status: "running",
    lock: null,
    startedAt: new Date().toISOString(),
    stoppedAt: null,
    stopGranularity: null,
    settings,
    workspace,
    preExecutionSha: "",
    baselineTest: null,
    retryState: {
      tasks: {},
      waves: {},
      finalReview: null,
    },
    waves: [],
  };

  const filePath = join(cwd, getStateFilePath(planFileName));
  await writeStateAtomic(io, filePath, JSON.stringify(state, null, 2));
  return state;
}

// ── readState ────────────────────────────────────────────────────────

/**
 * Reads and parses a RunState from disk.
 * Returns null if the file does not exist.
 */
export async function readState(
  io: ExecutionIO,
  cwd: string,
  planFileName: string,
): Promise<RunState | null> {
  const filePath = join(cwd, getStateFilePath(planFileName));
  const exists = await io.fileExists(filePath);
  if (!exists) return null;

  const content = await io.readFile(filePath);
  return JSON.parse(content) as RunState;
}

// ── updateState ──────────────────────────────────────────────────────

/**
 * General state updater. Reads current state, applies `updater`, writes
 * back atomically, and returns the updated state.
 *
 * This is the single entry point for modifying ANY RunState field
 * (preExecutionSha, baselineTest, cancellation fields, retryState, etc.).
 */
export async function updateState(
  io: ExecutionIO,
  cwd: string,
  planFileName: string,
  updater: (state: RunState) => RunState,
): Promise<RunState> {
  const current = await readState(io, cwd, planFileName);
  if (current === null) {
    throw new Error(`State file not found for plan: ${planFileName}`);
  }

  const updated = updater(current);
  const filePath = join(cwd, getStateFilePath(planFileName));
  await writeStateAtomic(io, filePath, JSON.stringify(updated, null, 2));
  return updated;
}

// ── updateWaveStatus ─────────────────────────────────────────────────

/**
 * Convenience method to update a wave's status and commitSha.
 * `commitSha` must be a non-empty string when `status` is "done".
 */
export async function updateWaveStatus(
  io: ExecutionIO,
  cwd: string,
  planFileName: string,
  state: RunState,
  waveNumber: number,
  status: WaveState["status"],
  commitSha: string | null,
): Promise<RunState> {
  if (status === "done") {
    if (commitSha === null || commitSha === "") {
      throw new Error(
        `commitSha must be a non-empty string when transitioning wave ${waveNumber} to "done"`,
      );
    }
  }

  return updateState(io, cwd, planFileName, (s) => ({
    ...s,
    waves: s.waves.map((w) =>
      w.wave === waveNumber ? { ...w, status, commitSha } : w,
    ),
  }));
}

// ── isLockStale ──────────────────────────────────────────────────────

/**
 * Returns true if the lock's PID is no longer alive.
 * Uses `kill -0 <pid>` which succeeds for live processes without signalling.
 */
export async function isLockStale(
  io: ExecutionIO,
  lock: LockInfo,
): Promise<boolean> {
  const result = await io.exec("kill", ["-0", String(lock.pid)], ".");
  return result.exitCode !== 0;
}

// ── acquireLock ──────────────────────────────────────────────────────

/**
 * Acquires an exclusive lock on the plan state.
 * Fails if a live lock already exists.
 * Replaces stale locks (dead PID).
 */
export async function acquireLock(
  io: ExecutionIO,
  cwd: string,
  planFileName: string,
  pid: number,
  session: string,
): Promise<RunState> {
  const current = await readState(io, cwd, planFileName);
  if (current === null) {
    throw new Error(`State file not found for plan: ${planFileName}`);
  }

  if (current.lock !== null) {
    const stale = await isLockStale(io, current.lock);
    if (!stale) {
      throw new Error(
        `Cannot acquire lock: plan "${planFileName}" is already locked by PID ${current.lock.pid} (session: ${current.lock.session})`,
      );
    }
    // Stale lock — fall through to overwrite
  }

  const lock: LockInfo = {
    pid,
    session,
    acquiredAt: new Date().toISOString(),
  };

  return updateState(io, cwd, planFileName, (s) => ({ ...s, lock }));
}

// ── releaseLock ──────────────────────────────────────────────────────

/**
 * Releases the lock on the plan state by setting lock to null.
 */
export async function releaseLock(
  io: ExecutionIO,
  cwd: string,
  planFileName: string,
): Promise<RunState> {
  return updateState(io, cwd, planFileName, (s) => ({ ...s, lock: null }));
}

// ── deleteState ──────────────────────────────────────────────────────

/**
 * Deletes the state file for a plan.
 */
export async function deleteState(
  io: ExecutionIO,
  cwd: string,
  planFileName: string,
): Promise<void> {
  const filePath = join(cwd, getStateFilePath(planFileName));
  await io.unlink(filePath);
}

// ── validateResume ───────────────────────────────────────────────────

/**
 * Validates that the current environment matches the saved state for a
 * safe resume. Checks workspace path existence, branch name, and commit SHA.
 *
 * Returns `{ valid: true, issues: [] }` on success, or
 * `{ valid: false, issues: [...] }` with descriptive messages.
 */
export async function validateResume(
  io: ExecutionIO,
  state: RunState,
  cwd: string,
): Promise<{ valid: boolean; issues: string[] }> {
  const issues: string[] = [];

  // Check workspace path exists
  const workspaceExists = await io.fileExists(state.workspace.path);
  if (!workspaceExists) {
    issues.push(
      `Workspace path does not exist: ${state.workspace.path}`,
    );
  }

  // Check branch matches
  const branchResult = await io.exec(
    "git",
    ["rev-parse", "--abbrev-ref", "HEAD"],
    cwd,
  );
  const currentBranch = branchResult.stdout.trim();
  if (currentBranch !== state.workspace.branch) {
    issues.push(
      `Branch mismatch: expected "${state.workspace.branch}", got "${currentBranch}"`,
    );
  }

  // Check preExecutionSha matches HEAD (only if preExecutionSha is set)
  if (state.preExecutionSha !== "") {
    const shaResult = await io.exec("git", ["rev-parse", "HEAD"], cwd);
    const currentSha = shaResult.stdout.trim();
    if (currentSha !== state.preExecutionSha) {
      issues.push(
        `Commit SHA mismatch: expected "${state.preExecutionSha}", got "${currentSha}"`,
      );
    }
  }

  return { valid: issues.length === 0, issues };
}

// ── findActiveRunInRepo ──────────────────────────────────────────────

/**
 * Scans all state files under `<cwd>/.pi/plan-runs/` and returns the
 * first one with an active (non-stale) lock.
 *
 * Returns null if:
 * - The state directory does not exist
 * - No state files have active locks
 * - All locks are stale (dead PIDs)
 */
export async function findActiveRunInRepo(
  io: ExecutionIO,
  cwd: string,
): Promise<{ planName: string; state: RunState } | null> {
  const stateDirPath = join(cwd, getStateDir());

  // Check if the directory exists by trying to read it
  let entries: string[];
  try {
    entries = await io.readdir(stateDirPath);
  } catch {
    return null;
  }

  const stateFiles = entries.filter((e) => e.endsWith(".state.json"));

  for (const fileName of stateFiles) {
    // Derive plan name by stripping ".state.json"
    const planName = fileName.slice(0, -".state.json".length);

    const state = await readState(io, cwd, planName);
    if (state === null) continue;

    // Only consider states with a lock
    if (state.lock === null) continue;

    // Check if the lock is still alive
    const stale = await isLockStale(io, state.lock);
    if (stale) continue;

    return { planName, state };
  }

  return null;
}
