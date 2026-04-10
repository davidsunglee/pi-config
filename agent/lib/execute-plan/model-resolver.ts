import type { PlanTask, ModelTiers } from "./types.ts";

/**
 * Validate that the required fields of ModelTiers are present.
 * Throws a descriptive error if any required field is missing.
 */
function validateTiers(tiers: ModelTiers): void {
  const required: Array<"capable" | "standard" | "cheap"> = ["capable", "standard", "cheap"];
  for (const field of required) {
    if (typeof tiers[field] !== "string" || tiers[field] === "") {
      throw new Error(
        `ModelTiers missing required field: "${field}". All of capable, standard, and cheap must be non-empty strings.`,
      );
    }
  }
}

/**
 * Apply heuristic to pick a model tier when modelRecommendation is null.
 *
 * Priority (highest first):
 * 1. Title contains "architecture" or "design" (case-insensitive) → capable
 * 2. Any modify files OR more than 2 create files → standard
 * 3. Otherwise → cheap
 */
function applyHeuristic(task: PlanTask, tiers: ModelTiers): string {
  const titleLower = task.title.toLowerCase();
  if (titleLower.includes("architecture") || titleLower.includes("design")) {
    return tiers.capable;
  }
  if (task.files.modify.length > 0 || task.files.create.length > 2) {
    return tiers.standard;
  }
  return tiers.cheap;
}

/**
 * Resolve the concrete model string for a plan task.
 *
 * Maps task.modelRecommendation to the corresponding tier string.
 * When modelRecommendation is null, a heuristic based on file count
 * and task title is used to pick a tier.
 *
 * @throws {Error} if tiers is missing required fields (capable, standard, cheap)
 */
export function resolveModelForTask(task: PlanTask, tiers: ModelTiers): string {
  validateTiers(tiers);

  if (task.modelRecommendation === null) {
    return applyHeuristic(task, tiers);
  }

  switch (task.modelRecommendation) {
    case "cheap":
      return tiers.cheap;
    case "standard":
      return tiers.standard;
    case "capable":
      return tiers.capable;
  }
}

/**
 * Resolve the model to use for a review pass.
 *
 * - "spec" review: uses tiers.standard
 * - "code" review: uses tiers.crossProvider.capable with fallback to tiers.capable
 *
 * @throws {Error} if tiers is missing required fields
 */
export function resolveReviewModel(
  tiers: ModelTiers,
  type: "spec" | "code",
): string {
  validateTiers(tiers);

  if (type === "spec") {
    return tiers.standard;
  }

  // type === "code"
  return tiers.crossProvider?.capable ?? tiers.capable;
}
