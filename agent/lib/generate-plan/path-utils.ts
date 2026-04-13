import * as path from "node:path";
import type { GenerationIO } from "./types.ts";

/**
 * Formats a Date as a zero-padded `yyyy-MM-dd` string.
 */
export function formatDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Derives the absolute path for a new plan file.
 * Format: `<cwd>/.pi/plans/<yyyy-MM-dd>-<shortDescription>.md`
 */
export function derivePlanPath(
  cwd: string,
  shortDescription: string,
  date: Date = new Date()
): string {
  const dateStr = formatDate(date);
  return path.join(cwd, ".pi", "plans", `${dateStr}-${shortDescription}.md`);
}

/**
 * Derives the review output path from a plan path.
 * The review file lives in `reviews/` subdirectory alongside the plan,
 * with a `-review` suffix appended before `.md`.
 *
 * If the plan filename already ends with `-review.md`, it is not doubled.
 *
 * Example:
 *   `.pi/plans/2026-04-12-my-feature.md`
 *   → `.pi/plans/reviews/2026-04-12-my-feature-review.md`
 */
export function deriveReviewPath(planPath: string): string {
  const dir = path.dirname(planPath);
  const base = path.basename(planPath, ".md");

  // Avoid doubling the -review suffix
  const reviewBase = base.endsWith("-review") ? base : `${base}-review`;

  return path.join(dir, "reviews", `${reviewBase}.md`);
}

/**
 * Creates `.pi/plans/` and `.pi/plans/reviews/` directories via `io.mkdir`.
 * Directory creation is idempotent — callers should ensure `io.mkdir` does
 * not throw when the directory already exists (equivalent to `mkdir -p`).
 */
export async function ensurePlanDirs(
  io: GenerationIO,
  cwd: string
): Promise<void> {
  await io.mkdir(path.join(cwd, ".pi", "plans"));
  await io.mkdir(path.join(cwd, ".pi", "plans", "reviews"));
}
