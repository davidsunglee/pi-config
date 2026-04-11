import path from "node:path";
import type { ExecutionIO, Plan, RunState } from "./types.ts";

// ── movePlanToDone ───────────────────────────────────────────────────

/**
 * Moves the plan file into the `.pi/plans/done/` directory.
 * Creates the done directory if it does not already exist.
 * Returns the new absolute path of the plan file.
 */
export async function movePlanToDone(
  io: ExecutionIO,
  cwd: string,
  planPath: string,
): Promise<string> {
  const doneDir = path.join(cwd, ".pi", "plans", "done");
  await io.mkdir(doneDir);

  const fileName = path.basename(planPath);
  const newPath = path.join(doneDir, fileName);
  await io.rename(planPath, newPath);
  return newPath;
}

// ── extractSourceTodoId ──────────────────────────────────────────────

/**
 * Returns the source todo ID from the plan, or null if there is none.
 */
export function extractSourceTodoId(plan: Plan): string | null {
  return plan.sourceTodoId;
}

// ── closeTodo internals ──────────────────────────────────────────────

// Canonical format: see agent/extensions/todos.ts parseFrontMatter/splitFrontMatter

function findJsonObjectEnd(content: string): number {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth++;
      continue;
    }

    if (char === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function splitFrontMatter(content: string): { frontMatter: string; body: string } {
  if (!content.startsWith("{")) {
    return { frontMatter: "", body: content };
  }

  const endIndex = findJsonObjectEnd(content);
  if (endIndex === -1) {
    return { frontMatter: "", body: content };
  }

  const frontMatter = content.slice(0, endIndex + 1);
  const body = content.slice(endIndex + 1).replace(/^\r?\n+/, "");
  return { frontMatter, body };
}

function isTodoClosed(status: string): boolean {
  return ["closed", "done"].includes(status.toLowerCase());
}

// ── closeTodo ────────────────────────────────────────────────────────

/**
 * Deterministically closes a todo by reading its file and updating the
 * status field to "done". The body is preserved byte-for-byte.
 *
 * Silently skips if:
 * - The todo file does not exist.
 * - The todo is already in a closed state (status "done" or "closed").
 *
 * No agent is involved — this directly manipulates the todo file.
 */
export async function closeTodo(
  io: ExecutionIO,
  cwd: string,
  todoId: string,
  planFileName: string,
): Promise<void> {
  const todoPath = path.join(cwd, ".pi", "todos", `${todoId}.md`);

  const exists = await io.fileExists(todoPath);
  if (!exists) {
    return;
  }

  const content = await io.readFile(todoPath);

  // Canonical format: see agent/extensions/todos.ts parseFrontMatter/splitFrontMatter
  const { frontMatter, body } = splitFrontMatter(content);

  if (!frontMatter) {
    // Cannot parse — skip silently
    return;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(frontMatter) as Record<string, unknown>;
  } catch {
    // Malformed JSON — skip silently
    return;
  }

  const currentStatus = typeof parsed["status"] === "string" ? parsed["status"] : "";
  if (isTodoClosed(currentStatus)) {
    return;
  }

  // Update status to "done"
  parsed["status"] = "done";

  const updatedFrontMatter = JSON.stringify(parsed, null, 2);
  const updatedContent = body
    ? `${updatedFrontMatter}\n\n${body}`
    : updatedFrontMatter;
  await io.writeFile(todoPath, updatedContent);
}

// ── buildCompletionSummary ───────────────────────────────────────────

/**
 * Builds a human-readable completion summary string that includes:
 * - The number of tasks executed
 * - The number of waves completed
 * - A reference to the closed todo, if any
 */
export function buildCompletionSummary(
  state: RunState,
  plan: Plan,
  closedTodoId: string | null,
): string {
  const taskCount = plan.tasks.length;
  const waveCount = state.waves.length;

  const lines: string[] = [
    `Plan execution completed.`,
    `Tasks: ${taskCount}, Waves: ${waveCount}`,
  ];

  if (closedTodoId !== null) {
    lines.push(`Closed todo: ${closedTodoId}`);
  }

  return lines.join("\n");
}
