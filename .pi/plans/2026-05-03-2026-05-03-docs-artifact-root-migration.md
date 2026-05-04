# Move repo workflow artifacts to docs

**Source:** TODO-eafa4d57
**Spec:** `.pi/specs/2026-05-03-docs-artifact-root-migration.md`

## Goal

Replace every repository-local workflow-artifact path reference in `agent/skills/`, `agent/agents/`, and `README.md` from the `.pi/` root to a `docs/` root. The new artifact roots are `docs/todos/`, `docs/briefs/`, `docs/specs/`, `docs/plans/`, `docs/plans/reviews/`, `docs/plans/done/`, `docs/test-runs/`, and `docs/reviews/`. Pi runtime references such as `~/.pi/agent/model-tiers.json`, `PI_SUBAGENT_MODE`, `PI_SUBAGENT_MUX`, and `~/.pi/agent/sessions` stay as they are. No backward-compatibility shims, no dual-path support, no migration of existing files under `.pi/`.

## Architecture summary

The repo's workflow behavior is encoded almost entirely in markdown skill contracts, agent definitions, and the top-level README. Each contract that mentions a workflow artifact path needs surgical text replacement: the path root changes from `.pi/<name>/` to `docs/<name>/` while the suffix (filename pattern, sub-directory, etc.) is preserved verbatim. Because every replacement is `.pi/<name>/` → `docs/<name>/` (a clean prefix substitution that leaves the rest of each path untouched), nested paths like `.pi/plans/reviews/` and `.pi/plans/done/` resolve correctly under the same substitution as `.pi/plans/`. Pi runtime references use `~/.pi/agent/...` (a different prefix) and are not matched by the replacement set, so they are preserved automatically.

The migration is partitioned by skill/agent area so each task touches a coherent group of files (one skill or one agent set). A final sweep task verifies the master invariant: a repo-wide grep over the in-scope directories returns no remaining `.pi/(todos|briefs|specs|plans|reviews|test-runs)` matches, and the implementation notes state explicitly whether any TypeScript files were touched.

## Tech stack

- Markdown skill / agent / README files (no compiled code touched).
- `grep`, `cat`, and the `Edit` tool for applying replacements.
- `cd agent && npm test` for the colocated TypeScript test suite (only relevant if a TS file ends up touched, which is not expected in this plan).

## File Structure

- `agent/skills/define-spec/SKILL.md` (Modify) — Replace `.pi/specs/` references in the YAML frontmatter description, dispatch task example, transcript-backed recovery rules, refine-flow notes, and edge cases with `docs/specs/`.
- `agent/skills/define-spec/procedure.md` (Modify) — Replace todo-read paths under `.pi/todos/`, scout-brief paths under `.pi/briefs/`, existing-spec patterns under `.pi/specs/`, the spec write target under `.pi/specs/`, and the spec template's `Scout brief:` provenance line.
- `agent/skills/define-spec/README.md` (Modify) — Replace narrative references to `.pi/specs/` with `docs/specs/`.
- `agent/skills/generate-plan/SKILL.md` (Modify) — Replace plan output paths under `.pi/plans/`, source-spec resolution under `.pi/specs/`, scout-brief provenance under `.pi/briefs/`, and edge-case prose.
- `agent/skills/generate-plan/README.md` (Modify) — Replace narrative references to `.pi/plans/` and `.pi/briefs/` with their `docs/` equivalents.
- `agent/skills/generate-plan/edit-plan-prompt.md` (Modify) — Replace the scout-brief provenance description from `Scout brief: .pi/briefs/<filename>` to `Scout brief: docs/briefs/<filename>`.
- `agent/skills/generate-plan/review-plan-prompt.md` (Modify) — Replace the scout-brief provenance description from `Scout brief: .pi/briefs/<filename>` to `Scout brief: docs/briefs/<filename>`.
- `agent/skills/refine-plan/SKILL.md` (Modify) — Replace plan-preamble auto-discovery patterns for `.pi/specs/` and `.pi/briefs/`, the `REVIEW_OUTPUT_PATH` allocation under `.pi/plans/reviews/`, the `ls` scan command, archived-plan edge case under `.pi/plans/done/`, and the coordinator path-validation prose.
- `agent/skills/refine-plan/README.md` (Modify) — Replace narrative references to `.pi/plans/reviews/` with `docs/plans/reviews/`.
- `agent/skills/execute-plan/SKILL.md` (Modify) — Replace `.pi/plans/` plan-listing paths, all `.pi/test-runs/<plan-name>/` artifact-path strings (baseline, wave-attempt, final-gate variants, and the cleanup `rm -rf` line), `.pi/plans/done/` move targets, the linked-todo completion pointer, and the `.pi/reviews/` review-output base path.
- `agent/skills/execute-plan/README.md` (Modify) — Replace narrative references to `.pi/plans/` and `.pi/plans/done/` with their `docs/` equivalents.
- `agent/skills/refine-code/SKILL.md` (Modify) — Replace the default review-output path under `.pi/reviews/` in the input table with `docs/reviews/`.
- `agent/skills/refine-code/README.md` (Modify) — Replace narrative reference to `.pi/reviews/` with `docs/reviews/`.
- `agent/agents/spec-designer.md` (Modify) — Replace the description-line `.pi/specs/` with `docs/specs/`.
- `agent/agents/planner.md` (Modify) — Replace the description-line `.pi/plans/`, the `.pi/briefs/<filename>` artifact-reading rule, the `.pi/specs/<filename>` and `.pi/briefs/<filename>` provenance lines in the `Required Sections` header rules, and the `.pi/plans/<filename>` template in the `Output` block.
- `agent/agents/plan-reviewer.md` (Modify) — Replace the `.pi/briefs/<filename>` artifact-reading rule with `docs/briefs/<filename>`.
- `README.md` (Modify) — Update the high-level description (workflow state in `.pi/`), the directory tree (`.pi/` heading), the typical-workflow numbered steps (lines referencing `.pi/todos/`, `.pi/specs/`, `.pi/plans/`, `.pi/plans/reviews/`, `.pi/plans/done/`, `.pi/reviews/`), the subagent-architecture bullet list, the skills table descriptions, the `todos.ts` extension description (which mentions `.pi/todos/`), and the agent descriptions for `planner.md` and `spec-designer.md`. Preserve `~/.pi/agent/sessions` (it is a Pi runtime reference, not a workflow artifact).

## Tasks

### Task 1: Migrate `define-spec` skill files to `docs/`

**Files:**
- Modify: `agent/skills/define-spec/SKILL.md`
- Modify: `agent/skills/define-spec/procedure.md`
- Modify: `agent/skills/define-spec/README.md`

**Steps:**
- [ ] **Step 1: Open `agent/skills/define-spec/SKILL.md` and replace every `.pi/specs/` substring with `docs/specs/`.** This includes the YAML frontmatter `description:` value (two occurrences on the same line), the `task:` example string in Step 3a (`<raw user input — todo ID, .pi/specs/<path>.md, or freeform text>` → `<raw user input — todo ID, docs/specs/<path>.md, or freeform text>`), the Step 4 case (2) transcript-backed recovery prose (multiple sentences mentioning the candidate-path predicate, the `.pi/specs/` directory, the recovery success criterion, and the absolute-path requirement), the Step 7 refine-flow comment about `.pi/specs/<name>.md` and `/.pi/specs/`, and the Edge cases bullet about transcript recovery. Leave all `~/.pi/agent/...` lines untouched.
- [ ] **Step 2: Open `agent/skills/define-spec/procedure.md` and replace every workflow-artifact `.pi/...` substring with its `docs/...` equivalent.** Specifically: `.pi/todos/<raw-id>.md` → `docs/todos/<raw-id>.md` (twice in the Todo ID row, including the `.pi/todos/075cf515.md` example and the negative `.pi/todos/TODO-<raw-id>.md` example), `.pi/briefs/TODO-<raw-id>-brief.md` → `docs/briefs/TODO-<raw-id>-brief.md` in the Todo ID row, `.pi/specs/` and `/.pi/specs/` patterns in the Existing-spec path row → `docs/specs/` and `/docs/specs/`, the Step 8 write target `.pi/specs/<YYYY-MM-DD>-<short-topic>.md` → `docs/specs/<YYYY-MM-DD>-<short-topic>.md`, the Step 8 spec-template line `Scout brief: .pi/briefs/TODO-<id>-brief.md` → `Scout brief: docs/briefs/TODO-<id>-brief.md`, the section-ordering rule's literal copy of `.pi/briefs/TODO-<id>-brief.md` → `docs/briefs/TODO-<id>-brief.md`, and the directory-creation note `Create the .pi/specs/ directory if it does not exist.` → `Create the docs/specs/ directory if it does not exist.`.
- [ ] **Step 3: Open `agent/skills/define-spec/README.md` and replace every `.pi/specs/` substring with `docs/specs/`.** Three references: the opening sentence, the Inputs bullet for an existing spec path, and the Completion-and-validation paragraph mentioning `.pi/specs/*.md`.

**Acceptance criteria:**

- All workflow-artifact `.pi/(todos|briefs|specs)` references in the three define-spec files are replaced with their `docs/...` equivalents.
  Verify: `grep -rE '\.pi/(todos|briefs|specs|plans|reviews|test-runs)' agent/skills/define-spec/` returns no matches and exit code 1.
- `procedure.md` reads todos from `docs/todos/`, reads briefs from `docs/briefs/`, accepts/refines specs under `docs/specs/`, and writes new specs to `docs/specs/`.
  Verify: `grep -nE 'docs/todos/|docs/briefs/|docs/specs/' agent/skills/define-spec/procedure.md` returns at least one match for each of the three substrings (`docs/todos/`, `docs/briefs/`, `docs/specs/`).
- `SKILL.md` transcript-backed recovery validates against `docs/specs/` and the YAML frontmatter `description:` value mentions `docs/specs/` (twice).
  Verify: `grep -c 'docs/specs/' agent/skills/define-spec/SKILL.md` returns a count of at least 5 (the frontmatter line contributes 2, transcript-recovery prose contributes at least 2, refine-flow note contributes at least 1).
- `README.md` (define-spec README) describes `docs/specs/` instead of `.pi/specs/`.
  Verify: `grep -c 'docs/specs/' agent/skills/define-spec/README.md` returns 3 and `grep -c '\.pi/specs/' agent/skills/define-spec/README.md` returns 0.

**Model recommendation:** cheap

### Task 2: Migrate `generate-plan` skill files to `docs/`

**Files:**
- Modify: `agent/skills/generate-plan/SKILL.md`
- Modify: `agent/skills/generate-plan/README.md`
- Modify: `agent/skills/generate-plan/edit-plan-prompt.md`
- Modify: `agent/skills/generate-plan/review-plan-prompt.md`

**Steps:**
- [ ] **Step 1: Open `agent/skills/generate-plan/SKILL.md` and replace every `.pi/...` workflow-artifact substring with its `docs/...` equivalent.** Specifically: the opening sentence's `.pi/plans/` → `docs/plans/`, the Step 1b provenance rule lines mentioning `.pi/briefs/<filename>` and `Scout brief: .pi/briefs/<filename>` → `docs/briefs/<filename>` and `Scout brief: docs/briefs/<filename>`, the Step 1b `.pi/specs/` source-spec rule → `docs/specs/`, the Step 3 `{OUTPUT_PATH}` template `.pi/plans/yyyy-MM-dd-<short-description>.md` → `docs/plans/yyyy-MM-dd-<short-description>.md`, the file-input slug example `.pi/specs/reduce-context.md` → `docs/specs/reduce-context.md`, the `{SOURCE_SPEC}` and `{SCOUT_BRIEF}` Step 3 rule lines (multiple `.pi/specs/<filename>` and `.pi/briefs/<filename>` references), and the Edge-cases bullet `.pi/plans/` → `docs/plans/`. Leave `~/.pi/agent/model-tiers.json` lines untouched.
- [ ] **Step 2: Open `agent/skills/generate-plan/README.md` and replace narrative `.pi/...` workflow-artifact references with their `docs/...` equivalents.** Three references: the opening line `.pi/plans/`, the path-based handoff bullet `Scout brief: .pi/briefs/<filename>`, and the output-plan-expectations paragraph mentioning `.pi/plans/`.
- [ ] **Step 3: Open `agent/skills/generate-plan/edit-plan-prompt.md` and replace the artifact-reading rule's `.pi/briefs/<filename>` with `docs/briefs/<filename>`.** Single reference inside the `## Artifact Reading Contract` section.
- [ ] **Step 4: Open `agent/skills/generate-plan/review-plan-prompt.md` and replace the artifact-reading rule's `.pi/briefs/<filename>` with `docs/briefs/<filename>`.** Single reference inside the `## Artifact Reading Contract` section.

**Acceptance criteria:**

- No remaining workflow-artifact `.pi/...` references exist in the four generate-plan files.
  Verify: `grep -rE '\.pi/(todos|briefs|specs|plans|reviews|test-runs)' agent/skills/generate-plan/` returns no matches and exit code 1.
- `SKILL.md` writes plans to `docs/plans/`, recognizes `Source spec: docs/specs/<filename>` and `Scout brief: docs/briefs/<filename>` provenance, and uses the new `docs/specs/reduce-context.md` example.
  Verify: `grep -nE 'docs/plans/|Source spec: docs/specs/|Scout brief: docs/briefs/|docs/specs/reduce-context\.md' agent/skills/generate-plan/SKILL.md` returns matches for each of those four patterns.
- The `edit-plan-prompt.md` and `review-plan-prompt.md` artifact-reading contracts both reference `Scout brief: docs/briefs/<filename>`.
  Verify: `grep -n 'Scout brief: docs/briefs/<filename>' agent/skills/generate-plan/edit-plan-prompt.md agent/skills/generate-plan/review-plan-prompt.md` returns at least one match in each of the two files.
- The `README.md` (generate-plan README) describes plans under `docs/plans/` and scout briefs under `docs/briefs/`.
  Verify: `grep -nE 'docs/plans/|docs/briefs/' agent/skills/generate-plan/README.md` returns at least one match for each substring (`docs/plans/` and `docs/briefs/`).

**Model recommendation:** cheap

### Task 3: Migrate `refine-plan` skill files to `docs/`

**Files:**
- Modify: `agent/skills/refine-plan/SKILL.md`
- Modify: `agent/skills/refine-plan/README.md`

**Steps:**
- [ ] **Step 1: Open `agent/skills/refine-plan/SKILL.md` and replace every `.pi/...` workflow-artifact substring with its `docs/...` equivalent.** Specifically in Step 3 auto-discovery: the `**Spec:**` rule line currently mentions `.pi/specs/<filename>` three times on a single line — replace all three with `docs/specs/<filename>` (preserving backtick formatting and the `Source spec: ` and `TASK_ARTIFACT = "..."` strings); and the `**Scout brief:**` rule line `.pi/briefs/<filename>` → `docs/briefs/<filename>` (also three occurrences on a single line, including the `Scout brief: docs/briefs/<filename>` value). In Step 6: `REVIEW_OUTPUT_PATH = .pi/plans/reviews/<PLAN_BASENAME>-plan-review` → `docs/plans/reviews/<PLAN_BASENAME>-plan-review`; `Create .pi/plans/reviews/ if it does not exist.` → `Create docs/plans/reviews/ if it does not exist.`; `ls .pi/plans/reviews/ 2>/dev/null` → `ls docs/plans/reviews/ 2>/dev/null`. In Step 7 placeholder list: the `{SOURCE_SPEC}` and `{SCOUT_BRIEF}` description lines (two `.pi/specs/<filename>` and `.pi/briefs/<filename>` references). In Step 10 `not_approved_within_budget` description and Edge Cases bullets: `.pi/plans/reviews/` and `.pi/plans/done/` references. Leave `~/.pi/agent/model-tiers.json` lines untouched.
- [ ] **Step 2: Open `agent/skills/refine-plan/README.md` and replace narrative `.pi/plans/reviews/` references with `docs/plans/reviews/`.** Four references: the workflow step 4 ("Allocate the next review era under `.pi/plans/reviews/`."), the era-versioned reviews paragraph ("Review artifacts are written under `.pi/plans/reviews/` using the plan basename..."), and the two filename example lines `.pi/plans/reviews/my-plan-plan-review-v1.md` and `.pi/plans/reviews/my-plan-plan-review-v2.md` inside the fenced text block.

**Acceptance criteria:**

- No remaining workflow-artifact `.pi/...` references exist in the two refine-plan files.
  Verify: `grep -rE '\.pi/(todos|briefs|specs|plans|reviews|test-runs)' agent/skills/refine-plan/` returns no matches and exit code 1.
- The `SKILL.md` Step 3 auto-discovery rules recognize `**Spec:** ` followed by `` `docs/specs/<filename>` `` and `**Scout brief:** ` followed by `` `docs/briefs/<filename>` ``, and Step 6 allocates review files under `docs/plans/reviews/`.
  Verify: `grep -nE 'docs/specs/<filename>|docs/briefs/<filename>|docs/plans/reviews/<PLAN_BASENAME>-plan-review' agent/skills/refine-plan/SKILL.md` returns at least one match for each of those three substrings.
- The `SKILL.md` filesystem command in Step 6 lists `docs/plans/reviews/`.
  Verify: `grep -n 'ls docs/plans/reviews/' agent/skills/refine-plan/SKILL.md` returns at least one match.
- The `README.md` (refine-plan README) describes era-versioned reviews under `docs/plans/reviews/` (including the two example filenames `docs/plans/reviews/my-plan-plan-review-v1.md` and `docs/plans/reviews/my-plan-plan-review-v2.md`).
  Verify: `grep -nE 'docs/plans/reviews/(my-plan-plan-review-v1|my-plan-plan-review-v2)\.md' agent/skills/refine-plan/README.md` returns at least one match for each of the two filename strings.

**Model recommendation:** cheap

### Task 4: Migrate `execute-plan` skill files to `docs/`

**Files:**
- Modify: `agent/skills/execute-plan/SKILL.md`
- Modify: `agent/skills/execute-plan/README.md`

**Steps:**
- [ ] **Step 1: Open `agent/skills/execute-plan/SKILL.md` and replace every `.pi/...` workflow-artifact substring with its `docs/...` equivalent.** Specifically: the YAML frontmatter `description:` line (`Executes a structured plan file from .pi/plans/.` → `Executes a structured plan file from docs/plans/.`); the Step 1 plan-locating prose (`list .pi/plans/ (excluding done/)` → `list docs/plans/ (excluding done/)`); every test-runner artifact path string under `.pi/test-runs/<plan-name>/` (baseline, wave-attempt, final-gate variants, the `mkdir -p .pi/test-runs/<plan-name>` command, the cleanup `rm -rf .pi/test-runs/<plan-name>` command, and every `(x) Stop` exit-path note that mentions the per-plan `.pi/test-runs/<plan-name>/` directory — there are ten or more such mentions across Steps 7, 12, 13, 14, 15, and 16); the Step 14 partial-progress sentence `Leave the plan file in .pi/plans/` → `Leave the plan file in docs/plans/`; the Step 15 review-output base path `.pi/reviews/<plan-name>-code-review` → `docs/reviews/<plan-name>-code-review` (including the worked example `.pi/reviews/2026-04-06-my-feature-code-review` → `docs/reviews/2026-04-06-my-feature-code-review`); the Step 16 `### 1. Move plan to done` block (`Create .pi/plans/done/ if it doesn't exist`, `Move the plan file to .pi/plans/done/`, the `rm -rf .pi/test-runs/<plan-name>` cleanup, and the per-plan-directory-preserved sentence); and the Step 16 `### 2. Close linked todo` line `Append to the todo body: \nCompleted via plan: .pi/plans/done/<plan-filename>.md` → `Append to the todo body: \nCompleted via plan: docs/plans/done/<plan-filename>.md`. Leave `~/.pi/agent/...` references untouched.
- [ ] **Step 2: After applying every replacement in Step 1, sanity-check the file with a single grep before moving on.** Run `grep -nE '\.pi/(todos|briefs|specs|plans|reviews|test-runs)' agent/skills/execute-plan/SKILL.md` and confirm zero matches. If any match remains, re-apply the missed replacements until the grep returns empty (exit code 1). This file has the most occurrences, so a final check before exiting the task catches partial edits.
- [ ] **Step 3: Open `agent/skills/execute-plan/README.md` and replace `.pi/plans/` and `.pi/plans/done/` references with their `docs/...` equivalents.** Two known references: the opening sentence (`Execute a structured plan file from .pi/plans/`) and the Commits-and-finalization paragraph (`move the plan to .pi/plans/done/`). Use grep at the end to confirm no other `.pi/(todos|briefs|specs|plans|reviews|test-runs)` substring slipped through.

**Acceptance criteria:**

- No remaining workflow-artifact `.pi/...` references exist in the two execute-plan files.
  Verify: `grep -rE '\.pi/(todos|briefs|specs|plans|reviews|test-runs)' agent/skills/execute-plan/` returns no matches and exit code 1.
- The `SKILL.md` test-runner contract uses `docs/test-runs/<plan-name>/` for baseline, wave-attempt, and final-gate artifact paths, and the cleanup command targets the same directory.
  Verify: `grep -cE 'docs/test-runs/<plan-name>/(baseline|wave-<N>-attempt-<K>|final-gate-<seq>)\.log' agent/skills/execute-plan/SKILL.md` returns a count of at least 6 (baseline appears at least once, wave-attempt at least twice, final-gate at least twice across Steps 7, 12, and 16) AND `grep -n 'rm -rf docs/test-runs/<plan-name>' agent/skills/execute-plan/SKILL.md` returns at least one match.
- The Step 15 review-output base path is `docs/reviews/<plan-name>-code-review`, including the worked example `docs/reviews/2026-04-06-my-feature-code-review`.
  Verify: `grep -n 'docs/reviews/<plan-name>-code-review' agent/skills/execute-plan/SKILL.md` AND `grep -n 'docs/reviews/2026-04-06-my-feature-code-review' agent/skills/execute-plan/SKILL.md` each return at least one match.
- The Step 16 `### 1. Move plan to done` block creates and moves into `docs/plans/done/`, and the linked-todo completion pointer uses `docs/plans/done/<plan-filename>.md`.
  Verify: `grep -nE "Create docs/plans/done/|Move the plan file to docs/plans/done/|Completed via plan: docs/plans/done/<plan-filename>\.md" agent/skills/execute-plan/SKILL.md` returns at least one match for each of the three substrings.
- The execute-plan `README.md` describes plans under `docs/plans/` and the move target as `docs/plans/done/`.
  Verify: `grep -nE 'docs/plans/(done/)?' agent/skills/execute-plan/README.md` returns at least two matches (one for `docs/plans/` in the opening sentence, one for `docs/plans/done/` in the Commits-and-finalization paragraph).

**Model recommendation:** standard

### Task 5: Migrate `refine-code` skill files to `docs/`

**Files:**
- Modify: `agent/skills/refine-code/SKILL.md`
- Modify: `agent/skills/refine-code/README.md`

**Steps:**
- [ ] **Step 1: Open `agent/skills/refine-code/SKILL.md` and replace the input-table default review-output path `.pi/reviews/<name>-code-review` with `docs/reviews/<name>-code-review`.** Single reference, inside the Step 1 inputs table on the `Review output path` row. Leave `~/.pi/agent/model-tiers.json` references untouched.
- [ ] **Step 2: Open `agent/skills/refine-code/README.md` and replace the coordinator-responsibilities bullet that mentions `.pi/reviews/` with `docs/reviews/`.** Single reference (`write versioned review artifacts under .pi/reviews/`).

**Acceptance criteria:**

- No remaining workflow-artifact `.pi/...` references exist in the two refine-code files.
  Verify: `grep -rE '\.pi/(todos|briefs|specs|plans|reviews|test-runs)' agent/skills/refine-code/` returns no matches and exit code 1.
- The `SKILL.md` Step 1 inputs table default review-output path is now `docs/reviews/<name>-code-review`.
  Verify: `grep -n 'docs/reviews/<name>-code-review' agent/skills/refine-code/SKILL.md` returns at least one match.
- The `README.md` (refine-code README) coordinator-responsibilities bullet writes versioned review artifacts under `docs/reviews/`.
  Verify: `grep -n 'write versioned review artifacts under .docs/reviews/.' agent/skills/refine-code/README.md` returns at least one match (the regex `.` matches the surrounding backtick).

**Model recommendation:** cheap

### Task 6: Migrate agent definitions to `docs/`

**Files:**
- Modify: `agent/agents/spec-designer.md`
- Modify: `agent/agents/planner.md`
- Modify: `agent/agents/plan-reviewer.md`

**Steps:**
- [ ] **Step 1: Open `agent/agents/spec-designer.md` and replace the YAML frontmatter `description:` line's `.pi/specs/` with `docs/specs/`.** Single reference inside the description string between the `---` frontmatter delimiters. Do NOT add any content above the opening `---` — frontmatter must remain the very first content in the file.
- [ ] **Step 2: Open `agent/agents/planner.md` and replace every workflow-artifact `.pi/...` reference with its `docs/...` equivalent.** Specifically: the YAML frontmatter `description:` line (`Produces dependency-ordered plans in .pi/plans/.` → `Produces dependency-ordered plans in docs/plans/.`); the body `## Input` → `### File-based input` rule mentioning `Scout brief: .pi/briefs/<filename>` → `Scout brief: docs/briefs/<filename>`; the `## Plan Output` → `### Required Sections` → `#### 1. Header` block lines `**Spec:** .pi/specs/<filename>` and `**Scout brief:** .pi/briefs/<filename>` (also referencing `Source spec: .pi/specs/<filename>` and `Scout brief: .pi/briefs/<filename>` in the conditional clauses) → `docs/specs/<filename>` and `docs/briefs/<filename>` (with the matching condition substrings); and the `## Output` block `Plan saved to .pi/plans/<filename>.` template → `Plan saved to docs/plans/<filename>.`. Preserve the YAML frontmatter delimiters, the `name:`, `description:`, `tools:`, `thinking:`, `session-mode:`, `system-prompt:`, `spawning:`, and `auto-exit:` keys, and the body's section headings exactly as they are.
- [ ] **Step 3: Open `agent/agents/plan-reviewer.md` and replace the `Scout brief: .pi/briefs/<filename>` artifact-reading rule with `Scout brief: docs/briefs/<filename>`.** Single reference inside the `### File-based input` block.

**Acceptance criteria:**

- No remaining workflow-artifact `.pi/...` references exist in the three agent definition files.
  Verify: `grep -rE '\.pi/(todos|briefs|specs|plans|reviews|test-runs)' agent/agents/` returns no matches and exit code 1.
- The `spec-designer.md` frontmatter description references `docs/specs/`, the file still begins with `---` on line 1 (frontmatter remains the very first content), and the YAML frontmatter is structurally intact (closing `---` and field set unchanged).
  Verify: `head -n 1 agent/agents/spec-designer.md` outputs exactly `---`, `grep -n 'docs/specs/' agent/agents/spec-designer.md` returns at least one match, and `grep -cE '^---$' agent/agents/spec-designer.md` returns 2 (one opening, one closing frontmatter delimiter).
- The `planner.md` frontmatter description references `docs/plans/`, and the body's `Required Sections → #### 1. Header` block uses `**Spec:** docs/specs/<filename>` and `**Scout brief:** docs/briefs/<filename>`, and the `## Output` template line reads `Plan saved to docs/plans/<filename>.`.
  Verify: `grep -nE 'docs/plans/|docs/specs/<filename>|docs/briefs/<filename>' agent/agents/planner.md` returns at least one match for each substring (`docs/plans/`, `docs/specs/<filename>`, and `docs/briefs/<filename>`), AND `grep -n 'Plan saved to .docs/plans/<filename>' agent/agents/planner.md` returns at least one match.
- The `plan-reviewer.md` `### File-based input` block recognizes `Scout brief: docs/briefs/<filename>`.
  Verify: `grep -n 'Scout brief: docs/briefs/<filename>' agent/agents/plan-reviewer.md` returns at least one match.

**Model recommendation:** cheap

### Task 7: Update top-level `README.md`

**Files:**
- Modify: `README.md`

**Steps:**
- [ ] **Step 1: Open `README.md` and update the high-level workflow-state description.** Line ~16 currently reads `**Tracked workflow state** in .pi/ (todos, specs, plans, reviews)` — change it to `**Tracked workflow state** in docs/ (todos, specs, plans, reviews)`.
- [ ] **Step 2: Update the repository-layout fenced code block (around lines 20-40).** Change the `.pi/` heading line to `docs/`. Leave the listed sub-directories (`designs/`, `specs/`, `plans/`, `reviews/`, `todos/`) and their descriptions in place — they continue to describe the workflow state directories the skills produce; only the parent root changes.
- [ ] **Step 3: Update the typical-workflow numbered-step prose (around lines 113-127).** Replace each `.pi/(todos|briefs|specs|plans|reviews)` reference inside steps 1, 2, 3, 4, 7, and 8 with its `docs/` equivalent. Concrete substitutions: `.pi/todos/` → `docs/todos/`, `.pi/specs/` → `docs/specs/`, `.pi/plans/` → `docs/plans/`, `.pi/plans/reviews/` → `docs/plans/reviews/`, `.pi/plans/done/` → `docs/plans/done/`, `.pi/reviews/` → `docs/reviews/`. Do not touch any narrative phrases that don't mention paths.
- [ ] **Step 4: Update the subagent-architecture bullet list (around lines 133-137).** Replace `Todos (.pi/todos/)`, `Specs (.pi/specs/)`, `Plans (.pi/plans/)`, `.pi/plans/reviews/`, and `Reviews (.pi/reviews/)` with their `docs/` equivalents.
- [ ] **Step 5: Update the Skills table descriptions (around lines 158-160).** Replace each `.pi/(specs|plans|plans/reviews)/` substring inside the `define-spec`, `generate-plan`, and `refine-plan` row descriptions with its `docs/` equivalent.
- [ ] **Step 6: Update the `### todos.ts` extension description (around line 231).** Replace `Stores todos in .pi/todos/.` with `Stores todos in docs/todos/.`. (Note: the underlying `agent/extensions/todos.ts` source file is intentionally NOT modified — the user is migrating the extension separately. This README narrative line nonetheless describes where the future workflow stores todos and should match the new contract.)
- [ ] **Step 7: Update the `### planner.md` and `### spec-designer.md` agent descriptions (around lines 251 and 263).** Replace the `.pi/plans/` reference in the planner description and the `.pi/specs/` reference in the spec-designer description with `docs/plans/` and `docs/specs/` respectively. Leave the `~/.pi/agent/sessions` reference at line 223 untouched — that is a Pi runtime path, not a workflow artifact.
- [ ] **Step 8: After applying every replacement in steps 1-7, run a final grep over README.md.** Run `grep -nE '\.pi/(todos|briefs|specs|plans|reviews|test-runs)' README.md` and confirm zero matches. If any match remains, repeat the relevant step until grep returns empty (exit code 1).

**Acceptance criteria:**

- No remaining workflow-artifact `.pi/(todos|briefs|specs|plans|reviews|test-runs)` references exist in `README.md`.
  Verify: `grep -nE '\.pi/(todos|briefs|specs|plans|reviews|test-runs)' README.md` returns no matches and exit code 1.
- The repository-layout block heading is `docs/` (not `.pi/`).
  Verify: `grep -nE '^(\.pi|docs)/$' README.md` returns at least one line and that line reads exactly `docs/`.
- The typical-workflow numbered steps describe todos under `docs/todos/`, specs under `docs/specs/`, plans under `docs/plans/`, plan-reviews under `docs/plans/reviews/`, the move target as `docs/plans/done/`, and code reviews under `docs/reviews/`.
  Verify: `grep -nE 'docs/todos/|docs/specs/|docs/plans/|docs/plans/reviews/|docs/plans/done/|docs/reviews/' README.md` returns at least one match for each of those six substrings.
- The Pi runtime reference `~/.pi/agent/sessions` is preserved exactly.
  Verify: `grep -n '~/.pi/agent/sessions' README.md` returns at least one match.

**Model recommendation:** standard

### Task 8: Final repository-wide validation sweep

**Files:**
- (No files modified — this task is verification only.)

**Steps:**
- [ ] **Step 1: Run the master invariant grep over the in-scope directories.** Execute `grep -rnE '\.pi/(todos|briefs|specs|plans|reviews|test-runs)' agent/skills/ agent/agents/ README.md` and confirm zero matches (exit code 1). If any match is found, the responsible task (Task 1-7) was not completed correctly — surface the matching files/lines so they can be addressed before the plan exits.
- [ ] **Step 2: Confirm the legitimate Pi-runtime `~/.pi/agent/...` references are still intact.** Execute `grep -rnE '~/\.pi/agent/' agent/skills/ agent/agents/ README.md` and confirm matches still appear (e.g., references to `~/.pi/agent/model-tiers.json` and `~/.pi/agent/sessions`). Their continued presence proves the migration did not over-replace.
- [ ] **Step 3: Confirm `PI_SUBAGENT_*` environment variables are unchanged.** Execute `grep -rnE 'PI_SUBAGENT_(MODE|MUX)' agent/skills/define-spec/ agent/skills/refine-plan/` and confirm the existing matches are still present (the define-spec mux probe rules and any other consumer should still cite `PI_SUBAGENT_MODE` and `PI_SUBAGENT_MUX`).
- [ ] **Step 4: Confirm no TypeScript files were touched by this migration.** Execute `git status --porcelain | grep -E '\.(ts|js|json)$'` and inspect the output. If the output is empty, the migration was markdown-only and the implementation report can state that explicitly. If TypeScript or JSON files appear, they must be re-checked: only legitimately required updates (none expected per the spec's non-goals) are acceptable, and `cd agent && npm test` MUST pass.
- [ ] **Step 5: Capture the validation results in the implementation report.** Record the exact commands executed in steps 1-4 and their outputs (or "no output, exit code 1" for the negative grep). The report must explicitly state either "no TypeScript files or executable fixtures were touched" or list the touched files plus the test-pass evidence.

**Acceptance criteria:**

- The repo-wide grep over `agent/skills/`, `agent/agents/`, and `README.md` returns no `.pi/(todos|briefs|specs|plans|reviews|test-runs)` matches.
  Verify: `grep -rnE '\.pi/(todos|briefs|specs|plans|reviews|test-runs)' agent/skills/ agent/agents/ README.md` returns no matches and exit code 1.
- Pi-runtime references such as `~/.pi/agent/model-tiers.json` and `~/.pi/agent/sessions` remain in the in-scope files.
  Verify: `grep -rnE '~/\.pi/agent/(model-tiers\.json|sessions)' agent/skills/ agent/agents/ README.md` returns at least one match for each of the two patterns (`~/.pi/agent/model-tiers.json` and `~/.pi/agent/sessions`).
- `PI_SUBAGENT_MODE` and `PI_SUBAGENT_MUX` references are still present where they were before the migration.
  Verify: `grep -rnE 'PI_SUBAGENT_(MODE|MUX)' agent/skills/define-spec/` returns at least one match for each of the two environment variables (`PI_SUBAGENT_MODE` and `PI_SUBAGENT_MUX`).
- The implementation report explicitly records whether any TypeScript or JSON file was touched.
  Verify: read the executor's final implementation notes for this plan and confirm they include either the literal phrase "no TypeScript files or executable fixtures were touched" or an enumerated list of touched `.ts`/`.js`/`.json` files paired with `cd agent && npm test` evidence (exit code 0 and no failing test lines).

**Model recommendation:** standard

## Dependencies

- Task 8 depends on: Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7
- Tasks 1-7 are mutually independent — each touches a disjoint file set.

## Risk Assessment

- **Risk: Naive substring replacement double-replaces or misses overlapping prefixes.** `.pi/plans/reviews/`, `.pi/plans/done/`, and `.pi/plans/` share a common prefix. **Mitigation:** apply each replacement as a clean prefix substitution (`.pi/<name>/` → `docs/<name>/`); the suffix is preserved verbatim, so all three nested forms resolve correctly under any ordering of the replacements.
- **Risk: Over-replacing `.pi/` substrings inside YAML frontmatter `description:` strings could break frontmatter parsing.** Several files have `.pi/specs/` or `.pi/plans/` inside the quoted description value. **Mitigation:** every replacement preserves the surrounding quote characters, the `description:` key, and the YAML frontmatter delimiters. Task acceptance criteria for `spec-designer.md` and `planner.md` include explicit checks that frontmatter delimiters and the `head -n 1` first-line check still pass after edits.
- **Risk: Confusing workflow artifact `.pi/...` paths with Pi runtime `~/.pi/agent/...` paths and replacing the latter.** **Mitigation:** the master grep pattern is anchored to `\.pi/(todos|briefs|specs|plans|reviews|test-runs)` — none of those segments appear under `~/.pi/agent/...`, so well-targeted edits do not touch the runtime references. Task 8 explicitly verifies that `~/.pi/agent/model-tiers.json` and `~/.pi/agent/sessions` are still present after all edits.
- **Risk: Missing one of the many `(x) Stop ... .pi/test-runs/<plan-name>/` mentions inside `agent/skills/execute-plan/SKILL.md`.** That file has the highest concentration of references (10+ test-runs mentions across Steps 7, 12, 13, 14, 15, and 16, plus the `## Step 16` cleanup block). **Mitigation:** Task 4 Step 2 adds a per-file grep sanity check after editing the file, and Task 8 catches any residual reference at the repo level.
- **Risk: README.md `designs/` directory listed in the layout block is not in the spec's listed artifact roots.** The spec only enumerates `docs/{todos,briefs,specs,plans,plans/reviews,plans/done,test-runs,reviews}` — `designs/` is not in that set. **Mitigation:** the README narrative lists `designs/` as an aspirational sub-directory; Task 7 Step 2 only changes the parent `.pi/` to `docs/` and leaves the listed subdirectories (including `designs/`) in place, on the basis that the spec says "describe workflow state under `docs/` rather than `.pi/`" without enumerating which subdirectories must appear in the README — preserving the existing list keeps the README minimally changed and consistent with the spec's instruction to migrate the root only.
- **Risk: The user's note that the `todos` extension (`agent/extensions/todos.ts`) is being updated separately could create a transient mismatch where the workflow-artifact contracts say `docs/todos/` but the running extension still writes to `.pi/todos/`.** **Mitigation:** the spec explicitly accepts this, stating "Skill contracts may assume todos will be available at `docs/todos/` after that separate update." This plan honors that constraint and does not edit `agent/extensions/todos.ts`. Task 8 Step 4 verifies no TypeScript file was touched.

## Test Command

```bash
cd agent && npm test
```
