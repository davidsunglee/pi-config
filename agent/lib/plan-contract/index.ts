/**
 * plan-contract — Shared plan format library
 *
 * Defines the canonical plan contract consumed by both `generate-plan` and
 * `execute-plan`. A plan is a structured Markdown document with required
 * sections (Goal, Architecture Summary, File Structure, Tasks, Dependencies,
 * Risk Assessment) and optional sections (Tech Stack, Test Command, Source).
 *
 * Use `parsePlan` to parse plan Markdown into a typed `Plan` object, and
 * `validatePlan` to verify that all required sections are present and that
 * dependency references are valid.
 *
 * @module plan-contract
 */

// Types
export type {
  Plan,
  PlanHeader,
  FileStructureEntry,
  PlanTask,
  PlanDependencies,
} from "./types.ts";

// Parser
export { parsePlan } from "./parser.ts";

// Validator
export { validatePlan } from "./validator.ts";
