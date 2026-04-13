# Generate-Plan Extension: Move Orchestration from Prose to Code

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Goal

Replace the 157-line prose `agent/skills/generate-plan/SKILL.md` with a pi extension backed by a pure TypeScript core library. The extension handles all deterministic orchestration (input resolution, prompt assembly, plan-generator dispatch, validation via shared plan-contract, review dispatch, targeted edit/repair loop, review-note appending). The plan-generator agent continues to synthesize plans — the wrapper calls it, does not replace it. The core library exports a `PlanGenerationEngine` driven by an injected `GenerationIO` interface, keeping the extension as a thin pi adapter.

**Source:** TODO-d68082f8

## Architecture Summary

Three layers with clear boundaries, following the execute-plan pattern:

1. **Core library** (`agent/lib/generate-plan/`) — Pure TypeScript, no pi imports. All deterministic logic: input resolution, prompt assembly, plan-generator dispatch coordination, validation via shared plan-contract, review template filling, review result parsing, repair loop management, review-note appending, path derivation. Exports helper modules **and** a `PlanGenerationEngine` that owns the full deterministic generation/validation/review loop, driven by an injected `GenerationIO` interface. Testable in isolation with mock I/O.

2. **Pi extension** (`agent/extensions/generate-plan/`) — Thin wrapper implementing `GenerationIO` using pi APIs. Registers `/generate-plan` command **and** `generate_plan` tool. Owns subagent dispatch implementation (reusing dispatch patterns from execute-plan), user interaction (async notification, error presentation), and result reporting.

3. **Thin skill** (`agent/skills/generate-plan/SKILL.md`) — Drastically reduced from 157 lines. Tells the agent to use `/generate-plan` or the `generate_plan` tool and documents the async workflow.

**Key design principle:** Code orchestrates; LLMs synthesize plans and review them.

**Key architectural decisions:**

1. **GenerationIO is simpler than ExecutionIO.** No task queue, no judgment bridge, no TUI widgets. The I/O interface needs: file read/write, subagent dispatch (plan-generator, plan-executor for review, plan-generator for edits), todo reading, and settings loading.

2. **Repair loop uses targeted in-place editing.** When validation or review finds issues, the wrapper builds an edit prompt containing the current plan plus specific findings and dispatches the plan-generator to edit in place. This preserves correct sections and converges faster than full regeneration.

3. **Repair loop limits are enforced in the engine.** Max 10 edit/review cycles. The default strategy is always `targeted_edit`. The engine tracks which specific issues (by identity — validation error string or review issue key) persist across consecutive edit cycles. If the **same issues** survive 2 consecutive edit attempts, those issues escalate to `partial_regen`. Once partial regen resolves them, the strategy reverts to `targeted_edit` for any remaining or newly introduced issues (which get their own 2-edit-attempt budget). If max cycles exhausted, surface remaining findings to the user — never silently accept.

4. **Review model selection follows the existing SKILL.md pattern.** Use `modelTiers.crossProvider.capable` for cross-provider review, with fallback to `modelTiers.capable` if the cross-provider dispatch fails. The fallback is triggered by dispatch failure, not preemptively checked.

5. **The plan-reviewer.md template stays where it is.** The template at `agent/skills/generate-plan/plan-reviewer.md` is read by code instead of by the agent. Its placeholders (`{PLAN_CONTENTS}`, `{ORIGINAL_SPEC}`) are filled deterministically.

6. **Validation uses the shared plan-contract library.** Both `parsePlan` and `validatePlan` from `agent/lib/plan-contract/` are called after generation and after each edit cycle. This ensures generate-plan and execute-plan enforce the same contract.

7. **Review notes are appended in a canonical format.** The engine appends non-blocking findings (warnings/suggestions) as a `## Review Notes` section, matching the existing format from the SKILL.md.

## Tech Stack

- **Language:** TypeScript (ESNext, NodeNext modules)
- **Runtime:** Node.js with `--experimental-strip-types`
- **Testing:** `node:test` + `node:assert/strict` (project convention)
- **Extension API:** `@mariozechner/pi-coding-agent` (ExtensionAPI, ExtensionContext, etc.)
- **Type validation:** `@sinclair/typebox`
- **Shared dependency:** `agent/lib/plan-contract/` (parsePlan, validatePlan, Plan types)
- **Existing agents:** `plan-generator` (plan synthesis)
- **New agent:** `plan-reviewer` (dedicated review agent whose system prompt matches the `plan-reviewer.md` output format)

## File Structure

### Core Library (no pi dependencies)
- `agent/lib/generate-plan/types.ts` (Create) — Shared types: GenerationIO interface, GenerationCallbacks interface, GenerationInput, GenerationResult, ReviewResult, ReviewIssue, RepairStrategy, RepairCycleState
- `agent/lib/generate-plan/input-resolver.ts` (Create) — Resolve input source (todo ID, file path, freeform text) into canonical source text and metadata
- `agent/lib/generate-plan/prompt-builder.ts` (Create) — Assemble canonical planner prompt from resolved input, cwd, output path, source todo ID
- `agent/lib/generate-plan/review-template.ts` (Create) ��� Read plan-reviewer.md template and fill placeholders ({PLAN_CONTENTS}, {ORIGINAL_SPEC})
- `agent/lib/generate-plan/review-parser.ts` (Create) — Parse review output for [Approved]/[Issues Found] status, extract errors/warnings/suggestions with severity and task numbers
- `agent/lib/generate-plan/review-notes.ts` (Create) — Append non-blocking review findings as canonical ## Review Notes section to plan content
- `agent/lib/generate-plan/repair-loop.ts` (Create) — Manage edit/review cycles: decide repair strategy (targeted edit vs partial section regeneration), build edit prompts with specific findings, enforce cycle limits, track convergence
- `agent/lib/generate-plan/path-utils.ts` (Create) — Derive plan output path (date-prefixed filename), review output path, plan directory creation
- `agent/lib/generate-plan/engine.ts` (Create) — PlanGenerationEngine class: owns the full deterministic generation/validation/review/repair loop
- `agent/lib/generate-plan/index.ts` (Create) — Barrel re-exports for all public APIs

### Core Library Tests
- `agent/lib/generate-plan/input-resolver.test.ts` (Create) �� Tests for input resolution from todo, file, freeform
- `agent/lib/generate-plan/prompt-builder.test.ts` (Create) — Tests for prompt assembly with all input variants
- `agent/lib/generate-plan/review-template.test.ts` (Create) — Tests for template loading and placeholder filling
- `agent/lib/generate-plan/review-parser.test.ts` (Create) — Tests for review output parsing (approved, issues found, severity extraction)
- `agent/lib/generate-plan/review-notes.test.ts` (Create) — Tests for review note appending (warnings only, suggestions only, mixed, idempotent)
- `agent/lib/generate-plan/repair-loop.test.ts` (Create) — Tests for repair strategy selection, edit prompt construction, cycle limit enforcement, partial regen escape hatch
- `agent/lib/generate-plan/path-utils.test.ts` (Create) — Tests for path derivation (plan path, review path, directory creation)
- `agent/lib/generate-plan/engine.test.ts` (Create) — Tests for PlanGenerationEngine: full lifecycle, validation gate, review dispatch via plan-reviewer agent, repair loop integration, fallback model

### Extension
- `agent/extensions/generate-plan/index.ts` (Create) — Extension entry point: command + tool registration, instantiates engine, wires GenerationIO to pi APIs
- `agent/extensions/generate-plan/io-adapter.ts` (Create) — Implements GenerationIO using pi extension APIs and Node.js fs
- `agent/extensions/generate-plan/io-adapter.test.ts` (Create) — Tests for I/O adapter: file operations, dispatch delegation, todo reading

### Agent Definition
- `agent/agents/plan-reviewer.md` (Create) — Dedicated plan-reviewer agent with system prompt matching `plan-reviewer.md` output format ([Approved]/[Issues Found] with Error/Warning/Suggestion issues)

### Skill (Thin Replacement)
- `agent/skills/generate-plan/SKILL.md` (Modify) — Replace 157-line prose with thin stub pointing to extension

### Config Updates
- `agent/settings.json` (Modify) — Add generate-plan extension to configured extensions if needed

---

## Tasks

### Task 1: Core types and GenerationIO interface

**Files:**
- Create: `agent/lib/generate-plan/types.ts`

**Steps:**
- [ ] **Step 1: Create the lib directory structure** — Run `mkdir -p agent/lib/generate-plan`.
- [ ] **Step 2: Define GenerationIO interface** — Write `types.ts` with the `GenerationIO` interface. This is simpler than `ExecutionIO` — no task queue, no concurrency control. The engine dispatches sequentially (generate, then validate, then review, then edit).
  ```typescript
  export interface GenerationIO {
    readFile(path: string): Promise<string>;
    writeFile(path: string, content: string): Promise<void>;
    fileExists(path: string): Promise<boolean>;
    mkdir(path: string): Promise<void>;
    readdir(path: string): Promise<string[]>;

    /**
     * Read a todo by ID. Returns the full todo body text.
     * Throws if the todo does not exist.
     */
    readTodo(todoId: string): Promise<{ title: string; body: string }>;

    /**
     * Dispatch a subagent synchronously. Used for plan-generator and plan-executor (reviewer).
     * Returns the subagent's text output and the path to any files it wrote.
     */
    dispatchSubagent(config: SubagentDispatchConfig): Promise<SubagentOutput>;
  }
  ```
- [ ] **Step 3: Define GenerationCallbacks interface** — Callbacks for the extension layer to handle user-facing concerns:
  ```typescript
  export interface GenerationCallbacks {
    /** Report progress to the user (e.g., "Generating plan...", "Running review..."). */
    onProgress(message: string): void;

    /** Report a warning (e.g., cross-provider model fallback). */
    onWarning(message: string): void;

    /** Report final result with plan path and review status. */
    onComplete(result: GenerationResult): void;
  }
  ```
- [ ] **Step 4: Define input, result, and review types** — Define:
  - `GenerationInput` — discriminated union: `{ type: "todo"; todoId: string }`, `{ type: "file"; filePath: string }`, `{ type: "freeform"; text: string }`
  - `ResolvedInput` — `{ sourceText: string; sourceTodoId: string | null; shortDescription: string }`
  - `SubagentDispatchConfig` — `{ agent: string; task: string; model?: string }`
  - `SubagentOutput` — `{ text: string; exitCode: number }`
  - `ReviewIssue` — `{ severity: "error" | "warning" | "suggestion"; taskNumber: number | null; shortDescription: string; fullText: string }`
  - `ReviewResult` — `{ status: "approved" | "issues_found"; issues: ReviewIssue[]; rawOutput: string }`
  - `RepairStrategy` — `"targeted_edit" | "partial_regen"`
  - `IssueTracker` — `Record<string, { firstSeenCycle: number; consecutiveEditFailures: number }>` — tracks per-issue persistence across cycles by issue identity key
  - `RepairCycleState` — `{ cycle: number; maxCycles: number; strategy: RepairStrategy; findings: ReviewIssue[]; validationErrors: string[]; issueTracker: IssueTracker }`
  - `GenerationResult` — `{ planPath: string; reviewPath: string | null; reviewStatus: "approved" | "approved_with_notes" | "errors_found"; noteCount: number; remainingFindings: ReviewIssue[] }`
  - Note: no `GenerationOptions` type needed — the engine always runs the full pipeline. Async is an extension-layer concern (the `/generate-plan` command can run the engine in the background), not an engine parameter.
- [ ] **Step 5: Verify the new file compiles** — Run:
  ```bash
  node --experimental-strip-types -e "import {} from './agent/lib/generate-plan/types.ts'; console.log('types OK')"
  ```

**Acceptance criteria:**
- All types compile with `--experimental-strip-types`
- `GenerationIO` has `dispatchSubagent` for sequential dispatch — no concurrency control needed
- `GenerationIO` has `readTodo` for todo input resolution
- `ReviewIssue` carries severity, optional task number, and full text for edit prompts
- `RepairCycleState` tracks cycle count, strategy, and accumulated findings
- `GenerationResult` carries remaining findings for non-converged loops

**Model recommendation:** cheap

---

### Task 2: Input resolver

**Files:**
- Create: `agent/lib/generate-plan/input-resolver.ts`
- Test: `agent/lib/generate-plan/input-resolver.test.ts`

**Steps:**
- [ ] **Step 1: Write failing tests for input resolution** — Create `input-resolver.test.ts` with tests using mock `GenerationIO`:
  (a) todo input calls `io.readTodo(todoId)` and returns `ResolvedInput` with sourceText containing the todo body, `sourceTodoId` set to the ID, and `shortDescription` derived from the todo title,
  (b) file input calls `io.readFile(filePath)` and returns `ResolvedInput` with sourceText containing file contents, `sourceTodoId` is null, and `shortDescription` derived from the filename,
  (c) freeform input returns `ResolvedInput` with sourceText as the raw text, `sourceTodoId` is null, and `shortDescription` derived from first line of text (truncated to ~40 chars, slugified),
  (d) todo input with non-existent todo throws a descriptive error,
  (e) file input with non-existent file throws a descriptive error,
  (f) shortDescription is slugified (lowercase, hyphens, no special chars, max 40 chars).
- [ ] **Step 2: Run the tests to verify they fail** — Execute `node --experimental-strip-types --test agent/lib/generate-plan/input-resolver.test.ts` and confirm all tests fail.
- [ ] **Step 3: Implement resolveInput** — Write `input-resolver.ts` exporting `resolveInput(io: GenerationIO, input: GenerationInput): Promise<ResolvedInput>`.
  - For `todo`: call `io.readTodo(input.todoId)`, return `{ sourceText: body, sourceTodoId: input.todoId, shortDescription: slugify(title) }`.
  - For `file`: call `io.readFile(input.filePath)`, extract filename without extension for shortDescription.
  - For `freeform`: use `input.text` as sourceText, derive shortDescription from first line.
  - `slugify` helper: lowercase, replace non-alphanumeric with hyphens, collapse consecutive hyphens, trim hyphens, truncate to 40 chars.
- [ ] **Step 4: Run the tests and verify they pass** — All tests pass.

**Acceptance criteria:**
- All three input types resolve correctly
- Todo body is read via `io.readTodo`, not by file path manipulation
- File contents are read via `io.readFile`
- Short descriptions are slugified and length-limited
- Clear error messages for missing todos/files

**Model recommendation:** cheap

---

### Task 3: Prompt builder

**Files:**
- Create: `agent/lib/generate-plan/prompt-builder.ts`
- Test: `agent/lib/generate-plan/prompt-builder.test.ts`

**Steps:**
- [ ] **Step 1: Write failing tests for prompt assembly** — Create `prompt-builder.test.ts` with tests:
  (a) prompt includes the full source text,
  (b) prompt includes the cwd for context,
  (c) prompt includes the output path instruction with correct date-prefixed filename,
  (d) prompt includes `Source todo: TODO-<id>` when sourceTodoId is present,
  (e) prompt does NOT include `Source todo:` line when sourceTodoId is null,
  (f) prompt structure matches the existing SKILL.md Step 2 format (task description, source todo line, output instruction),
  (g) edit prompt includes the current plan content plus specific findings and instructs targeted editing rather than full regeneration,
  (h) edit prompt includes the output path so the plan-generator knows which file to overwrite,
  (i) edit prompt includes validation errors when present,
  (j) partial regen prompt identifies the specific section(s) to regenerate based on findings.
- [ ] **Step 2: Run the tests to verify they fail** — Execute test command and confirm failures.
- [ ] **Step 3: Implement prompt builders** — Write `prompt-builder.ts` exporting:
  - `buildGenerationPrompt(params: { sourceText: string; sourceTodoId: string | null; cwd: string; outputPath: string }): string` — Assembles the canonical planner prompt matching SKILL.md Step 2 format.
  - `buildEditPrompt(params: { currentPlanContent: string; outputPath: string; findings: ReviewIssue[]; validationErrors: string[]; strategy: RepairStrategy }): string` — Builds a prompt instructing the plan-generator to edit the existing plan. Always includes the `outputPath` so the plan-generator knows which file to overwrite. For `targeted_edit` strategy: includes the full current plan, lists each finding with severity and location, instructs "edit the plan in place at `<outputPath>` to address these findings — do not regenerate sections that are already correct." For `partial_regen` strategy: identifies the affected section(s) from the findings and instructs regeneration of only those sections while preserving the rest, writing to `<outputPath>`.
- [ ] **Step 4: Run the tests and verify they pass** — All tests pass.

**Acceptance criteria:**
- Generation prompt matches the format the plan-generator agent expects
- Source todo propagation is conditional on sourceTodoId being non-null
- Edit prompt includes the full current plan plus structured findings
- Edit prompt includes the output path so the plan-generator writes to the correct file
- Edit prompt explicitly instructs targeted editing, not full regeneration
- Partial regen prompt identifies affected sections by name

**Model recommendation:** cheap

---

### Task 4: Path utilities

**Files:**
- Create: `agent/lib/generate-plan/path-utils.ts`
- Test: `agent/lib/generate-plan/path-utils.test.ts`

**Steps:**
- [ ] **Step 1: Write failing tests for path derivation** — Create `path-utils.test.ts` with tests:
  (a) `derivePlanPath` returns `.pi/plans/yyyy-MM-dd-<shortDescription>.md` with today's date,
  (b) `deriveReviewPath` returns `.pi/plans/reviews/yyyy-MM-dd-<shortDescription>-review.md` from a plan path,
  (c) `deriveReviewPath` handles plans that already have `-review` suffix (does not double it),
  (d) `ensurePlanDirs` creates `.pi/plans/` and `.pi/plans/reviews/` directories via `io.mkdir`,
  (e) path derivation uses the provided cwd as base.
- [ ] **Step 2: Run the tests to verify they fail** — Execute test command and confirm failures.
- [ ] **Step 3: Implement path utilities** — Write `path-utils.ts` exporting:
  - `derivePlanPath(cwd: string, shortDescription: string, date?: Date): string` — Returns absolute path: `<cwd>/.pi/plans/<yyyy-MM-dd>-<shortDescription>.md`. Uses provided date or today.
  - `deriveReviewPath(planPath: string): string` — Derives review output path: replaces `.md` with `-review.md` and moves into `reviews/` subdirectory. For plan at `.pi/plans/2026-04-12-my-feature.md`, returns `.pi/plans/reviews/2026-04-12-my-feature-review.md`.
  - `ensurePlanDirs(io: GenerationIO, cwd: string): Promise<void>` — Creates `.pi/plans/` and `.pi/plans/reviews/` if they don't exist.
  - `formatDate(date: Date): string` — Returns `yyyy-MM-dd` string.
- [ ] **Step 4: Run the tests and verify they pass** — All tests pass.

**Acceptance criteria:**
- Plan paths follow the `yyyy-MM-dd-<description>.md` convention
- Review paths are derived from plan paths with `-review` suffix in `reviews/` subdirectory
- Directory creation is idempotent (no error if already exists)
- Date formatting is zero-padded

**Model recommendation:** cheap

---

### Task 5: Review template filler and plan-reviewer agent

**Files:**
- Create: `agent/lib/generate-plan/review-template.ts`
- Create: `agent/agents/plan-reviewer.md`
- Test: `agent/lib/generate-plan/review-template.test.ts`

**Steps:**
- [ ] **Step 1: Create the plan-reviewer agent definition** — Create `agent/agents/plan-reviewer.md` with YAML frontmatter (`name: plan-reviewer`, `description: Reviews generated implementation plans for structural correctness`, `model: claude-sonnet-4-6`). The system prompt should instruct the agent to follow the task prompt exactly and produce output in the format defined by the task (which will be the filled `plan-reviewer.md` template). Keep the system prompt minimal — the review instructions and output format come from the template, not the agent definition. This ensures the agent's output format matches what `parseReviewOutput` (Task 6) expects: `### Status` with `**[Approved]**` or `**[Issues Found]**`, followed by `### Issues` with `**[Error | Warning | Suggestion] — Task N: description**` blocks.
- [ ] **Step 2: Write failing tests for review template filling** — Create `review-template.test.ts` with tests using mock `GenerationIO`:
  (a) `loadReviewTemplate` reads `plan-reviewer.md` from the correct path (`<agentDir>/skills/generate-plan/plan-reviewer.md`),
  (b) `fillReviewTemplate` replaces `{PLAN_CONTENTS}` with plan content,
  (c) `fillReviewTemplate` replaces `{ORIGINAL_SPEC}` with original spec text,
  (d) `fillReviewTemplate` throws if any placeholder remains unfilled after substitution,
  (e) filled template does not contain literal `{PLAN_CONTENTS}` or `{ORIGINAL_SPEC}` strings.
- [ ] **Step 3: Run the tests to verify they fail** — Execute test command and confirm failures.
- [ ] **Step 4: Implement review template functions** — Write `review-template.ts` exporting:
  - `getReviewTemplatePath(agentDir: string): string` — Returns `<agentDir>/skills/generate-plan/plan-reviewer.md`.
  - `loadReviewTemplate(io: GenerationIO, agentDir: string): Promise<string>` — Reads the template file via `io.readFile`.
  - `fillReviewTemplate(template: string, params: { planContents: string; originalSpec: string }): string` — Replaces `{PLAN_CONTENTS}` and `{ORIGINAL_SPEC}`. Validates no unfilled placeholders remain (checks for `{...}` patterns).
- [ ] **Step 5: Run the tests and verify they pass** — All tests pass.

**Acceptance criteria:**
- `plan-reviewer.md` agent definition exists at `agent/agents/plan-reviewer.md` with valid YAML frontmatter
- Agent system prompt is minimal — review format comes from the template, not the agent definition
- Template path points to existing `agent/skills/generate-plan/plan-reviewer.md`
- Both placeholders are filled
- Unfilled placeholder detection prevents silent template errors
- Template file is read via GenerationIO, not direct fs access

**Model recommendation:** cheap

---

### Task 6: Review output parser

**Files:**
- Create: `agent/lib/generate-plan/review-parser.ts`
- Test: `agent/lib/generate-plan/review-parser.test.ts`

**Steps:**
- [ ] **Step 1: Write failing tests for review parsing** — Create `review-parser.test.ts` with tests:
  (a) parses `[Approved]` status with no issues → `{ status: "approved", issues: [] }`,
  (b) parses `[Issues Found]` status with errors → correct issue count and severities,
  (c) extracts error-severity issues with task number, short description, and full text (What/Why/Recommendation),
  (d) extracts warning-severity issues,
  (e) extracts suggestion-severity issues,
  (f) handles mixed severities in single review,
  (g) handles issues without task numbers (general issues),
  (h) handles malformed review output gracefully (returns issues_found with a parse error as an error-severity issue),
  (i) parses a realistic review output matching the format from `plan-reviewer.md`'s Output Format section.
- [ ] **Step 2: Run the tests to verify they fail** — Execute test command and confirm failures.
- [ ] **Step 3: Implement parseReviewOutput** — Write `review-parser.ts` exporting `parseReviewOutput(reviewText: string): ReviewResult`. Parse:
  - Status line: look for `**[Approved]**` or `**[Issues Found]**` in the `### Status` section.
  - Issues: parse `**[Error | Warning | Suggestion] — Task N: Short description**` blocks, extracting severity, task number (optional), short description, and the full text block (What/Why/Recommendation subsections).
  - Summary section: captured in rawOutput.
  - Fallback: if no valid status line found, return `{ status: "issues_found", issues: [{ severity: "error", ... parse error }] }`.
- [ ] **Step 4: Run the tests and verify they pass** — All tests pass.

**Acceptance criteria:**
- Both status values parsed correctly
- All three severity levels extracted
- Task numbers extracted from issue headers (nullable for general issues)
- Full text of each issue preserved (What/Why/Recommendation)
- Malformed output handled gracefully without throwing

**Model recommendation:** standard

---

### Task 7: Review notes appender

**Files:**
- Create: `agent/lib/generate-plan/review-notes.ts`
- Test: `agent/lib/generate-plan/review-notes.test.ts`

**Steps:**
- [ ] **Step 1: Write failing tests for review note appending** — Create `review-notes.test.ts` with tests:
  (a) appends `## Review Notes` section with warnings subsection when only warnings present,
  (b) appends suggestions subsection when only suggestions present,
  (c) appends both warnings and suggestions subsections when mixed,
  (d) does not append anything when no warnings or suggestions (errors only or empty),
  (e) does not duplicate `## Review Notes` if section already exists — replaces it,
  (f) output matches the canonical format from SKILL.md Step 3.5:
  ```markdown
  ## Review Notes

  _Added by plan reviewer — informational, not blocking._

  ### Warnings
  - **Task N**: <full warning text>

  ### Suggestions
  - **Task N**: <full suggestion text>
  ```
  (g) issues without task numbers use "General" instead of "Task N".
- [ ] **Step 2: Run the tests to verify they fail** — Execute test command and confirm failures.
- [ ] **Step 3: Implement appendReviewNotes** — Write `review-notes.ts` exporting `appendReviewNotes(planContent: string, issues: ReviewIssue[]): string`.
  - Filter to warnings and suggestions only (skip errors).
  - If no warnings or suggestions, return planContent unchanged.
  - If `## Review Notes` section already exists, remove it before appending (replace, don't duplicate).
  - Build the section in canonical format matching the SKILL.md specification.
  - Return the plan content with the section appended.
- [ ] **Step 4: Run the tests and verify they pass** — All tests pass.

**Acceptance criteria:**
- Only non-blocking issues (warnings, suggestions) are appended
- Format matches existing SKILL.md specification exactly
- Idempotent — re-appending replaces rather than duplicates
- Errors are never included in review notes

**Model recommendation:** cheap

---

### Task 8: Repair loop manager

**Files:**
- Create: `agent/lib/generate-plan/repair-loop.ts`
- Test: `agent/lib/generate-plan/repair-loop.test.ts`

**Steps:**
- [ ] **Step 1: Write failing tests for repair loop logic** — Create `repair-loop.test.ts` with tests:
  (a) `shouldRepair` returns true when validation errors exist,
  (b) `shouldRepair` returns true when review has error-severity issues,
  (c) `shouldRepair` returns false when review is approved with only warnings/suggestions,
  (d) `shouldRepair` returns false when max cycles (10) exhausted,
  (e) `selectStrategy` returns `"targeted_edit"` when an issue has fewer than 2 consecutive edit failures,
  (f) `selectStrategy` returns `"partial_regen"` when the same issue persists through 2 consecutive edit cycles (tracked by issue identity key),
  (g) `selectStrategy` returns `"targeted_edit"` for a newly introduced issue even if the global cycle count is high (new issues get their own 2-edit budget),
  (h) `advanceCycle` increments cycle count, updates `issueTracker` — bumps `consecutiveEditFailures` for persisting issues, resets tracker entries for resolved issues, adds new entries for newly introduced issues,
  (i) `advanceCycle` resets `consecutiveEditFailures` and reverts strategy to `targeted_edit` after partial regen resolves the escalated issues,
  (j) `getRemainingFindings` returns all unresolved issues when max cycles exhausted,
  (k) `isConverged` returns true when no error-severity issues remain,
  (l) `issueKey` produces stable identity keys: for validation errors, the error string itself; for review issues, severity + task number + short description,
  (m) end-to-end scenario: issue A persists for 2 edit cycles → escalates to partial_regen → resolves → new issue B appears → gets 2 edit cycles of its own before escalating.
- [ ] **Step 2: Run the tests to verify they fail** — Execute test command and confirm failures.
- [ ] **Step 3: Implement repair loop functions** — Write `repair-loop.ts` exporting:
  - `issueKey(issue: ReviewIssue): string` — Produces a stable identity key for a review issue: `"${severity}:${taskNumber ?? 'general'}:${shortDescription}"`. For validation errors, the error string itself is the key.
  - `createRepairState(): RepairCycleState` — Initialize with cycle 0, max 10, targeted_edit strategy, empty findings, empty issueTracker.
  - `shouldRepair(state: RepairCycleState, validationErrors: string[], reviewResult: ReviewResult | null): boolean` — Returns true if there are validation errors or error-severity review issues AND cycle count < maxCycles.
  - `selectStrategy(state: RepairCycleState, validationErrors: string[], reviewIssues: ReviewIssue[]): RepairStrategy` — Checks the `issueTracker` for any current issue whose `consecutiveEditFailures >= 2`. If any such issue exists, returns `"partial_regen"`. Otherwise returns `"targeted_edit"`. This means: new issues always start with edits regardless of global cycle count; only issues that have individually failed 2 consecutive edit attempts escalate.
  - `advanceCycle(state: RepairCycleState, validationErrors: string[], reviewIssues: ReviewIssue[]): RepairCycleState` — Returns new state with incremented cycle and updated issueTracker. For each current issue: if it existed in the previous cycle's tracker (same key), increment `consecutiveEditFailures`; if it's new, add with `consecutiveEditFailures: 0`. Remove tracker entries for issues that are no longer present (resolved). If the previous strategy was `partial_regen` and the escalated issues are now resolved, the next `selectStrategy` call will naturally return `targeted_edit` since no remaining issues have `consecutiveEditFailures >= 2`.
  - `isConverged(validationErrors: string[], reviewResult: ReviewResult | null): boolean` — True if no validation errors and no error-severity review issues.
  - `getRemainingFindings(state: RepairCycleState): { validationErrors: string[]; reviewIssues: ReviewIssue[] }` — Returns accumulated unresolved findings for surfacing to user.
- [ ] **Step 4: Run the tests and verify they pass** — All tests pass.

**Acceptance criteria:**
- Max 10 cycles enforced
- Targeted edit is always the default strategy for any issue
- Partial regen only used for specific issues that persist through 2 consecutive edit attempts (per-issue tracking, not global cycle count)
- New issues introduced at any cycle get their own 2-edit budget before escalation
- Strategy reverts to targeted_edit once escalated issues are resolved
- Issue identity is stable across cycles (keyed by error string or severity+task+description)
- Convergence checked by absence of error-severity issues
- Remaining findings tracked for user surfacing when loop exhausted

**Model recommendation:** standard

---

### Task 9: Barrel index

**Files:**
- Create: `agent/lib/generate-plan/index.ts`

**Steps:**
- [ ] **Step 1: Create barrel index** — Write `index.ts` re-exporting all public APIs from modules created in Tasks 1-8: types (GenerationIO, GenerationCallbacks, GenerationInput, GenerationResult, ReviewResult, ReviewIssue, RepairStrategy, RepairCycleState, IssueTracker, ResolvedInput, SubagentDispatchConfig, SubagentOutput), resolveInput, buildGenerationPrompt, buildEditPrompt, derivePlanPath, deriveReviewPath, ensurePlanDirs, getReviewTemplatePath, loadReviewTemplate, fillReviewTemplate, parseReviewOutput, appendReviewNotes, issueKey, createRepairState, shouldRepair, selectStrategy, advanceCycle, isConverged, getRemainingFindings. Do NOT export `PlanGenerationEngine` yet — it is created in Task 10, which will add the export.
- [ ] **Step 2: Verify barrel compiles** — Run `node --experimental-strip-types -e "import {} from './agent/lib/generate-plan/index.ts'; console.log('barrel OK')"`.

**Acceptance criteria:**
- Barrel exports all public APIs
- No circular dependencies
- TypeScript compiles with `--experimental-strip-types`

**Model recommendation:** cheap

---

### Task 10: PlanGenerationEngine — full lifecycle

**Files:**
- Create: `agent/lib/generate-plan/engine.ts`
- Test: `agent/lib/generate-plan/engine.test.ts`

**Steps:**
- [ ] **Step 1: Write failing tests for engine lifecycle** — Create `engine.test.ts` with tests using mock `GenerationIO` and mock `GenerationCallbacks`:
  (a) engine resolves input (todo → reads todo body),
  (b) engine builds generation prompt and dispatches plan-generator subagent,
  (c) engine reads generated plan file and validates via parsePlan + validatePlan,
  (d) engine dispatches review only when validation passes — invalid plans go directly to repair without review,
  (e) engine writes review output to `reviewPath` via `io.writeFile` after review dispatch returns,
  (f) engine appends review notes when review has only warnings/suggestions,
  (g) engine enters repair loop with validation errors only when validation fails (no review dispatched),
  (h) engine enters repair loop with review findings when review finds errors (plan was structurally valid but has review errors),
  (i) engine builds edit prompt with findings and dispatches plan-generator for targeted edit,
  (j) engine switches to partial_regen strategy when the same issues persist through 2 consecutive edit cycles (per-issue tracking),
  (k) engine converges after repair (re-validates and re-reviews edited plan),
  (l) engine surfaces remaining findings when max cycles (10) exhausted — does NOT silently accept,
  (m) engine selects crossProvider.capable model for review, falls back to capable on dispatch failure,
  (n) engine reports fallback warning via callbacks.onWarning when cross-provider fails,
  (o) engine loads model tiers from settings.json via settings-loader (reusing execute-plan's loadModelTiers),
  (p) engine calls callbacks.onProgress at each stage (resolving input, generating plan, validating, reviewing, repairing cycle N),
  (q) engine derives plan and review paths correctly,
  (r) engine creates plan directories via ensurePlanDirs before dispatch,
  (s) engine returns GenerationResult with all fields populated.
- [ ] **Step 2: Run the tests to verify they fail** — Execute test command and confirm failures.
- [ ] **Step 3: Implement PlanGenerationEngine** — Write `engine.ts`:
  ```typescript
  export class PlanGenerationEngine {
    constructor(
      private io: GenerationIO,
      private cwd: string,
      private agentDir: string,
    ) {}

    async generate(
      input: GenerationInput,
      callbacks: GenerationCallbacks,
    ): Promise<GenerationResult>;
  }
  ```

  Implement the `generate` method:

  **Phase 1 — Input resolution:**
  1. Resolve input via `resolveInput(io, input)` → `ResolvedInput`
  2. Derive plan output path via `derivePlanPath(cwd, resolvedInput.shortDescription)`
  3. Ensure plan directories exist via `ensurePlanDirs(io, cwd)`
  4. Report progress: "Resolving input..."

  **Phase 2 — Plan generation:**
  5. Build generation prompt via `buildGenerationPrompt({ sourceText, sourceTodoId, cwd, outputPath })`
  6. Dispatch plan-generator subagent: `io.dispatchSubagent({ agent: "plan-generator", task: prompt })`
  7. Report progress: "Generating plan..."
  8. Read generated plan file via `io.readFile(planPath)`

  **Phase 3 — Validation gate:**
  9. Parse plan via `parsePlan(planContent, fileName)` from plan-contract
  10. Validate via `validatePlan(plan)` from plan-contract
  11. Report progress: "Validating plan..."
  12. If validation fails → skip review, go directly to Phase 5 (repair loop) with validation errors only

  **Phase 4 — Review (only runs when plan is structurally valid):**
  13. Load model tiers via `loadModelTiers(io, agentDir)` — import from execute-plan's settings-loader. The function only calls `io.readFile()`, so pass a thin adapter: `loadModelTiers({ readFile: io.readFile.bind(io) } as ExecutionIO, agentDir)`
  14. Load and fill review template
  15. Dispatch `plan-reviewer` agent with `modelTiers.crossProvider.capable` model
  16. If dispatch fails → retry with `modelTiers.capable`, report fallback via `callbacks.onWarning`
  17. Parse review output via `parseReviewOutput`
  18. Write review output to disk: `io.writeFile(reviewPath, rawOutput)` — the engine owns review file persistence, not the dispatch layer
  19. Report progress: "Reviewing plan..."

  **Phase 5 — Repair loop (if needed):**
  20. Initialize repair state via `createRepairState()`
  21. While `shouldRepair(state, validationErrors, reviewResult)`:
      a. Select strategy via `selectStrategy(state, validationErrors, reviewIssues)`
      b. Build edit prompt via `buildEditPrompt({ currentPlanContent, outputPath: planPath, findings, validationErrors, strategy })`
      c. Dispatch plan-generator with edit prompt
      d. Read edited plan, re-parse, re-validate
      e. If validation passes: re-run review (same model selection logic), write updated review to `reviewPath`
      f. Advance cycle via `advanceCycle`
      g. Report progress: "Repair cycle N..."
  20. If not converged after max cycles: collect remaining findings

  **Phase 6 — Finalization:**
  21. If approved with warnings/suggestions: append review notes via `appendReviewNotes`, write updated plan
  22. Build and return `GenerationResult`
  23. Report complete via `callbacks.onComplete(result)`

  **Error handling:** Wrap the full lifecycle in try/catch. On error, report via `callbacks.onProgress` and re-throw.

  **Settings loader compatibility note:** The `loadModelTiers` function from `agent/lib/execute-plan/settings-loader.ts` takes an `ExecutionIO` that has `readFile`. Since the function only calls `io.readFile()`, use a thin adapter: `loadModelTiers({ readFile: io.readFile.bind(io) } as ExecutionIO, agentDir)`. This avoids duplicating the settings-loading logic while keeping the type system happy.
- [ ] **Step 4: Run the tests and verify they pass** — All tests pass.
- [ ] **Step 5: Update barrel index** — Add `PlanGenerationEngine` to exports in `index.ts`.

**Acceptance criteria:**
- Engine resolves all three input types correctly
- Engine dispatches plan-generator and reads result
- Validation gate catches malformed plans before review — invalid plans enter repair without dispatching review
- Review only runs when plan is structurally valid
- Engine writes review output to `reviewPath` via `io.writeFile` — dispatch layer returns text only
- Review uses crossProvider.capable with fallback to capable
- Repair loop runs targeted edits, escalates to partial regen for issues persisting through 2 consecutive edit attempts
- Repair loop enforces max 10 cycles
- Non-converged loop surfaces findings — never silently accepts
- Engine always runs the full pipeline (no skip-review path) — async is handled by the extension layer
- Review dispatches use `plan-reviewer` agent (not `plan-executor`)
- Review notes appended for non-blocking findings
- All callbacks invoked at appropriate stages
- Engine returns complete GenerationResult

**Model recommendation:** capable

---

### Task 11: Extension I/O adapter

**Files:**
- Create: `agent/extensions/generate-plan/io-adapter.ts`
- Test: `agent/extensions/generate-plan/io-adapter.test.ts`

**Steps:**
- [ ] **Step 1: Create extensions/generate-plan directory** — Run `mkdir -p agent/extensions/generate-plan`.
- [ ] **Step 2: Write failing tests for I/O adapter** — Create `io-adapter.test.ts` with tests using a temp directory (`fs.mkdtemp`):
  (a) `readFile` / `writeFile` round-trip through temp directory,
  (b) `fileExists` returns true for existing file and false for non-existent,
  (c) `mkdir` creates directory, `readdir` lists contents,
  (d) `readTodo` delegates to the provided todo read function and returns title + body,
  (e) `dispatchSubagent` delegates to provided dispatch function and returns output.
- [ ] **Step 3: Run tests to verify failures** — Confirm failures.
- [ ] **Step 4: Implement PiGenerationIO** — Write `io-adapter.ts` exporting `PiGenerationIO` implementing `GenerationIO`. Constructor takes:
  - `dispatchFn: (config: SubagentDispatchConfig) => Promise<SubagentOutput>` — Dispatch function that wraps the subagent spawning logic.
  - `todoReadFn: (todoId: string) => Promise<{ title: string; body: string }>` — Function to read a todo by ID (wired to pi's todo tool or direct file reading from `.pi/todos/`).

  Implementation:
  - File operations: Node.js `fs.promises`
  - `readTodo`: delegates to `todoReadFn`
  - `dispatchSubagent`: delegates to `dispatchFn`
- [ ] **Step 5: Run tests and verify pass** — All tests pass.

**Acceptance criteria:**
- Implements full `GenerationIO` interface
- File operations use Node.js fs
- Todo reading delegates to injected function
- Dispatch delegates to injected function
- All operations tested

**Model recommendation:** cheap

---

### Task 12: Extension entry point with subagent dispatch

**Files:**
- Create: `agent/extensions/generate-plan/index.ts`

**Steps:**
- [ ] **Step 1: Study execute-plan extension entry point** — Read `agent/extensions/execute-plan/index.ts` to understand the pattern: extension factory function, command registration, tool registration, dispatch wiring.
- [ ] **Step 2: Study execute-plan subagent dispatch** — Read `agent/extensions/execute-plan/subagent-dispatch.ts` to understand `loadAgentConfig`, `dispatchWorker`, and `createDispatchFunction`. The generate-plan extension needs a similar dispatch function but simpler — it dispatches `plan-generator` (for generation/editing) and `plan-reviewer` (for review), both synchronously.
- [ ] **Step 3: Implement extension entry point** — Write `index.ts` exporting default function `(pi: ExtensionAPI): void`:

  ```typescript
  export default function (pi: ExtensionAPI): void {
    // Register /generate-plan command
    pi.registerCommand("generate-plan", {
      description: "Generate a structured implementation plan from a todo, file, or description",
      handler: async (args, ctx) => { ... },
    });

    // Register generate_plan tool — always synchronous (agent needs the result)
    pi.registerTool({
      name: "generate_plan",
      label: "Generate Plan",
      description: "Generate a structured implementation plan. Provide a todo ID, file path, or freeform description. Always runs the full pipeline (validate + review + repair) synchronously.",
      parameters: Type.Object({
        input: Type.String({ description: "Todo ID (e.g., TODO-abc123), file path, or freeform description" }),
      }),
      execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => { ... },
    });
  }
  ```

  Shared handler logic:
  1. Parse input string to determine `GenerationInput` type:
     - Matches `TODO-<hex>` pattern → `{ type: "todo", todoId: "<hex>" }`
     - Matches a file path (contains `/` or `.` extension) and file exists → `{ type: "file", filePath: "<resolved>" }`
     - Otherwise → `{ type: "freeform", text: "<input>" }`
  2. Create `PiGenerationIO` with:
     - `dispatchFn`: adapts the execute-plan `dispatchWorker` pattern for generate-plan's simpler `SubagentDispatchConfig`. Loads agent config, spawns pi process, collects output. Uses `loadAgentConfig` and `dispatchWorker` from the execute-plan subagent-dispatch module (import and adapt) or re-implements the simpler subset needed.
     - `todoReadFn`: reads `.pi/todos/<id>.md`, parses JSON frontmatter to extract title, reads body after frontmatter.
  3. Create `PlanGenerationEngine(io, cwd, agentDir)`
  4. Wire `GenerationCallbacks`:
     - `onProgress`: `ctx.ui.notify(message, "info")`
     - `onWarning`: `ctx.ui.notify(message, "warning")`
     - `onComplete`: format result message (plan path, review status, suggest execute-plan)
  5. Call `engine.generate(input, callbacks)` — the engine always runs the full pipeline (validate + review + repair loop).
     - **From `/generate-plan` command:** If the user passes `--async` (or the command detects a long-running input), run the engine call in the background (`void engine.generate(...)` with callbacks wired to deferred notifications) and return immediately with a "generation started" message. On completion, notify the user with the plan path and review status. If the repair loop exhausts max cycles, notify with remaining findings.
     - **From `generate_plan` tool:** Always synchronous — the calling agent needs the `GenerationResult` to continue its work. No async option exposed on the tool.

  **Dispatch adaptation:** The generate-plan dispatch is simpler than execute-plan's:
  - No `onProgress` streaming needed (single sequential agents, not parallel workers)
  - No `AbortSignal` needed (no cancellation mid-generation)
  - Model override comes from SubagentDispatchConfig.model (for review model selection)
  - Dispatch returns text only — the engine writes review output to disk via `io.writeFile`

  Create a `createGeneratePlanDispatch(agentDir: string)` function that wraps the pi process spawning for generate-plan's needs, reusing `loadAgentConfig` and the `getPiInvocation` pattern from execute-plan's subagent-dispatch but with simplified event parsing (just collect final text output).

- [ ] **Step 4: Verify extension loads** — Ensure the extension compiles and can be loaded by pi. Run: `node --experimental-strip-types -e "import ext from './agent/extensions/generate-plan/index.ts'; console.log(typeof ext)"` → should print `function`.

**Acceptance criteria:**
- Extension registers `/generate-plan` command and `generate_plan` tool
- `/generate-plan` command supports `--async` flag for background execution
- `generate_plan` tool is always synchronous (no async option)
- Input parsing correctly classifies todo IDs, file paths, and freeform text
- Dispatch function spawns pi processes with correct args for plan-generator and plan-reviewer agents
- Dispatch returns text only — no file-writing responsibility
- Todo reading parses `.pi/todos/<id>.md` JSON frontmatter format
- Callbacks wire to pi's notification API
- Result message includes plan path, review status, and execute-plan suggestion
- Extension compiles and exports a default function

**Model recommendation:** capable

---

### Task 13: Thin SKILL.md replacement

**Files:**
- Modify: `agent/skills/generate-plan/SKILL.md`

**Steps:**
- [ ] **Step 1: Read the current SKILL.md** — Verify its current state (157 lines of prose orchestration).
- [ ] **Step 2: Write the thin replacement** — Replace entire content. File MUST begin with YAML frontmatter between `---` delimiters — no blank lines or content before the opening `---`. Keep `name: generate-plan` and `description` from existing frontmatter. Body tells the agent:
  - When the user wants to generate a plan, use `/generate-plan` or the `generate_plan` tool
  - The extension handles: input resolution, prompt assembly, plan generation, validation, review, repair loop, review note appending
  - Input formats: todo ID (`TODO-<hex>`), file path, or freeform description
  - Async option (command only): `/generate-plan --async` runs the full pipeline in the background and notifies on completion or escalates if repair doesn't converge. The `generate_plan` tool is always synchronous.
  - After generation: suggest running with `execute-plan` skill
  - Maximum ~30 lines total

  **Footgun:** Do NOT place comments, blank lines, or any content before the opening `---`.
- [ ] **Step 3: Verify** — Read back. Check YAML frontmatter valid, body <40 lines, all input types documented.

**Acceptance criteria:**
- SKILL.md <40 lines
- YAML frontmatter valid (name: generate-plan, description preserved)
- Documents all three input types
- Documents async option
- Mentions execute-plan as next step
- Does NOT contain orchestration logic (no prompt assembly, no review parsing, no model selection)

**Model recommendation:** cheap

---

### Task 14: Settings.json extension registration

**Files:**
- Modify: `agent/settings.json`

**Steps:**
- [ ] **Step 1: Read current settings.json** — Check if there is an extensions array or similar configuration for loading extensions.
- [ ] **Step 2: Check how execute-plan extension is registered** — Look for how `agent/extensions/execute-plan/index.ts` is loaded by the pi runtime. Check if extensions are auto-discovered from the `agent/extensions/` directory or need explicit registration in settings.json or another config file.
- [ ] **Step 3: Register generate-plan extension if needed** — If explicit registration is required, add `agent/extensions/generate-plan/index.ts` to the configuration. If extensions are auto-discovered, verify the directory structure is correct and no additional config is needed.
- [ ] **Step 4: Verify** — Confirm the generate-plan extension would be loaded alongside execute-plan.

**Acceptance criteria:**
- Generate-plan extension is discoverable/loadable by the pi runtime
- Execute-plan extension remains unchanged
- Settings.json changes are minimal

**Model recommendation:** cheap

---

## Dependencies

```
- Task 1 has no dependencies
- Task 2 depends on: Task 1
- Task 3 depends on: Task 1
- Task 4 depends on: Task 1
- Task 5 depends on: Task 1
- Task 6 depends on: Task 1
- Task 7 depends on: Task 1
- Task 8 depends on: Task 1
- Task 9 depends on: Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7, Task 8
- Task 10 depends on: Task 9
- Task 11 depends on: Task 1
- Task 12 depends on: Task 10, Task 11
- Task 13 depends on: Task 12
- Task 14 depends on: Task 12
```

## Risk Assessment

### 1. Settings loader type compatibility
**Risk:** `loadModelTiers` from execute-plan expects `ExecutionIO` which has more methods than `GenerationIO`. Structural typing may or may not work depending on how the function is called.
**Mitigation:** The function only calls `io.readFile`, so a thin adapter object `{ readFile: io.readFile.bind(io) } as ExecutionIO` is used. This is specified in Task 10's Phase 4 and compatibility note.

### 2. Subagent dispatch reuse vs duplication
**Risk:** The generate-plan dispatch needs are simpler than execute-plan's (no streaming progress, no abort). Importing from execute-plan's subagent-dispatch creates a cross-extension dependency. Duplicating creates drift.
**Mitigation:** Task 12 imports `loadAgentConfig` (a pure utility) from execute-plan's module and re-implements the simpler dispatch wrapper. The core process-spawning pattern is well-established and small. If the dependency feels wrong, the agent config loading could be extracted to a shared lib in a follow-up.

### 3. Repair loop convergence
**Risk:** The targeted edit approach relies on the plan-generator following edit instructions faithfully. If the model makes unrelated changes during editing, the loop may not converge.
**Mitigation:** The edit prompt explicitly instructs "do not modify sections that are already correct." Per-issue persistence tracking escalates to partial regen only for specific issues that survive 2 consecutive edit attempts, keeping the blast radius small. The hard cap at 10 cycles prevents infinite loops. Non-convergence surfaces findings to the user.

### 4. Plan-generator output path compliance
**Risk:** The plan-generator agent is instructed to write to a specific path but may write elsewhere or use a different naming convention.
**Mitigation:** The engine checks `io.fileExists(expectedPath)` after dispatch. If the file doesn't exist, it can search `.pi/plans/` for recently created files. This is a known behavior since the current SKILL.md relies on the same convention.

### 5. Review template placeholder format fragility
**Risk:** If `plan-reviewer.md` changes its placeholder names, the fill function breaks silently.
**Mitigation:** The `fillReviewTemplate` function validates that no `{...}` placeholders remain after substitution. Test coverage verifies exact placeholder names match the current template.

### 6. Cross-provider model failure detection
**Risk:** Dispatch failure for the cross-provider model (e.g., rate limit, model unavailable) must be distinguished from review content failure.
**Mitigation:** The engine checks `SubagentOutput.exitCode` — non-zero exit code triggers the fallback. Content-level issues (malformed review output) are handled by the review parser's graceful degradation.

### 7. Todo frontmatter parsing compatibility
**Risk:** Todo files use a JSON-in-braces frontmatter format that differs from YAML frontmatter. The extension must parse this correctly.
**Mitigation:** Task 12 specifies parsing `.pi/todos/<id>.md` with the JSON frontmatter format (read until closing `}`, parse as JSON, read remainder as body). This matches the format visible in `.pi/todos/0ecb4b31.md`.

## Test Command

```bash
node --experimental-strip-types --test agent/lib/generate-plan/*.test.ts agent/extensions/generate-plan/*.test.ts
```
