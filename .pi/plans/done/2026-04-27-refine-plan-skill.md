# Refine Plan Skill

**Source:** TODO-7463a4e4
**Spec:** `.pi/specs/2026-04-27-refine-plan-skill.md`

## Goal

Introduce a reusable `refine-plan` skill backed by a short-lived `plan-refiner` coordinator subagent, mirroring the existing `refine-code` / `code-refiner` split. The skill is the single owner of the plan-artifact commit gate (auto-commits when invoked by `generate-plan`, prompts Y/n in standalone use). The coordinator owns review/edit iteration, era-versioned review file persistence, and the per-era iteration budget. `generate-plan` is rewritten to delegate review/edit/commit to `refine-plan` after initial plan generation, so its main session no longer ingests full review text or tracks loop state. The motivation is to keep plan-review text and loop-control state out of the long-lived `generate-plan` orchestrator's context window.

## Architecture summary

A new caller-facing skill `agent/skills/refine-plan/SKILL.md` becomes the single user/caller entry point. It accepts a plan path (positional), provenance overrides, a `--structural-only` opt-in, a max-iterations setting (default 3), and an `--auto-commit-on-approval` boolean (off by default; `generate-plan` sets it on). The skill resolves the model matrix, scans `.pi/plans/reviews/` for existing era-versioned review files to allocate a starting era as `max(N) + 1`, and dispatches a single short-lived `plan-refiner` coordinator agent with all required context inlined into a filled `refine-plan-prompt.md` template. The coordinator (`agent/agents/plan-refiner.md`) runs through the pi CLI (resolved from `crossProvider.standard` via the `dispatch` map) and internally drives one era at a time: per iteration, it builds a filled `~/.pi/agent/skills/generate-plan/review-plan-prompt.md` and dispatches `plan-reviewer` (read-only judge), persists the review to `.pi/plans/reviews/<basename>-plan-review-v<ERA>.md` (overwriting within the era), parses Status/findings, and either dispatches `planner` in edit mode against the same plan path or terminates with `STATUS: approved | issues_remaining | failed`. On the approved path, the coordinator appends warnings/suggestions to the plan as a `## Review Notes` section before exiting. The coordinator never invokes `commit`. The skill validates returned paths, runs the budget-exhaustion two-option menu when needed (option (a) commits + re-dispatches the coordinator with `starting_era + 1`; option (b) stops and runs the commit gate), runs the commit gate (auto on `--auto-commit-on-approval`, prompt Y/n in standalone), and returns a compact `STATUS / COMMIT / paths / structural-only` summary to its caller. `generate-plan/SKILL.md` is rewritten so Step 4 is replaced by a single `refine-plan` invocation with `--auto-commit-on-approval` set; Step 5 (commit) is removed; Step 6 reports the summary returned by `refine-plan` and offers `execute-plan`. `agent/skills/generate-plan/review-plan-prompt.md` gains a `{STRUCTURAL_ONLY_NOTE}` placeholder that, when populated by the coordinator, instructs the reviewer to skip Spec/Todo Coverage and label the verdict structural-only.

## Tech stack

- Markdown skill files (`agent/skills/**/*.md`)
- Markdown agent definitions (`agent/agents/*.md`)
- Skill orchestration via `subagent_run_serial` from `pi-interactive-subagent`
- Model-tier resolution via `~/.pi/agent/model-tiers.json`
- Existing `commit` skill for git commits
- No code (TypeScript) changes; no test framework involved

## File Structure

- `agent/agents/plan-refiner.md` (Create) — Coordinator agent definition. Frontmatter sets `name: plan-refiner`, brief description, `thinking: medium`, `session-mode: lineage-only`. Body describes the role (coordinator, not author), the dispatch surface (plan-reviewer, planner edit pass), the rules (no commits, no internal review-text recall after writing, never expand plan-reviewer responsibilities), and the pointer to refine-plan-prompt.md as the operational protocol.
- `agent/skills/refine-plan/SKILL.md` (Create) — User/caller-facing skill. Owns input gathering, provenance auto-discovery + override merging, `--structural-only` gating, model-matrix resolution, era allocation by directory scan, single coordinator dispatch per era, returned-path validation, budget-exhaustion two-option menu, commit gate (auto vs prompt), and compact final report.
- `agent/skills/refine-plan/refine-plan-prompt.md` (Create) — Coordinator prompt template. Filled by SKILL.md and passed as the `task` parameter on the `plan-refiner` dispatch. Contains plan path, provenance fields, configuration (max iterations, starting era, working dir, review output base), full model matrix JSON, dispatch resolution rules, the per-iteration full-review protocol, the planner edit-pass dispatch shape, the `## Review Notes` append step on the approved path, the `STATUS: approved | issues_remaining | failed` output format, and the failure-mode list.
- `agent/skills/generate-plan/review-plan-prompt.md` (Modify) — Add a `{STRUCTURAL_ONLY_NOTE}` placeholder section between `## Original Spec (inline)` and `## Artifact Reading Contract`. When populated, it tells the reviewer to skip Spec/Todo Coverage and label the verdict as structural-only. Update the Artifact Reading Contract to add a third bullet acknowledging the structural-only case (no Task artifact and empty Original Spec inline is allowed iff `## Structural-Only Review` is present).
- `agent/skills/generate-plan/SKILL.md` (Modify) — Replace Step 4 (review-edit loop) and Step 5 (commit) with a single new Step 4 that dispatches `refine-plan` with `--auto-commit-on-approval` and the plan path. Renumber Step 6 → Step 5 and adjust the report content to consume the compact STATUS / COMMIT / paths / structural-only-label summary returned by `refine-plan` rather than parsing review text. Update the "Scope note on path-based handoff" and "Edge cases" sections for consistency.

## Tasks

### Task 1: Create plan-refiner agent definition

**Files:**
- Create: `agent/agents/plan-refiner.md`

**Steps:**

- [ ] **Step 1: Author frontmatter** — Open a new file `agent/agents/plan-refiner.md`. Write the YAML frontmatter as the very first content in the file with fields: `name: plan-refiner`, `description: Orchestrates the plan review-edit loop. Dispatches plan-reviewer and planner edit-pass subagents within one era, manages the iteration budget, writes versioned review files, and never commits.`, `thinking: medium`, `session-mode: lineage-only`. Use exactly two `---` delimiters surrounding only those four fields.
- [ ] **Step 2: Author the role section** — Below the closing `---`, add a heading-free intro sentence: `You are a plan refiner. You drive one era of the plan review-edit cycle: dispatch plan-reviewer, persist review artifacts, parse findings, dispatch planner (edit mode) when errors remain, and return a compact status with concrete artifact paths.` Add a paragraph stating the agent receives all configuration in its task prompt, has no context from the calling session, and must read its operational protocol from the filled `refine-plan-prompt.md` content provided in the task.
- [ ] **Step 3: Author the role boundaries section** — Add a `## Your Role` section enumerating exactly: (1) Dispatch `plan-reviewer` per iteration; (2) Persist the reviewer's full output to the era-versioned review file; (3) Parse the Status line and findings; (4) Dispatch `planner` in edit mode when errors remain and the budget is not exhausted; (5) Append warnings/suggestions to the plan as `## Review Notes` only on the approved path; (6) Track iteration count within the single era passed in the task prompt; (7) Return a compact STATUS / paths summary.
- [ ] **Step 4: Author the rules section** — Add a `## Rules` section with these bullets: do NOT invoke the `commit` skill or any git commit command; do NOT batch findings — every error finding feeds the single planner edit pass for that iteration; do NOT loop multiple eras internally — return `issues_remaining` when the budget for this era is exhausted; do NOT expand the plan-reviewer's responsibilities (it remains read-only/judge-only); do NOT inline full review text into the response back to the caller — only the path and a compact summary.
- [ ] **Step 5: Author the boundaries with refine-plan section** — Add a `## Boundary with refine-plan` section explaining: the caller (`refine-plan` skill) handles the budget-exhaustion menu, era reset (which is implemented as a fresh `plan-refiner` dispatch with `starting_era + 1`), the commit gate, and final reporting. The agent must not attempt those.

**Acceptance criteria:**

- The file `agent/agents/plan-refiner.md` exists and begins with valid YAML frontmatter delimited by `---` lines containing exactly the fields `name`, `description`, `thinking`, `session-mode`.
  Verify: run `head -n 7 agent/agents/plan-refiner.md` and confirm the first line is `---`, lines 2-5 contain the four named fields each on their own line, and line 6 is `---`.
- The frontmatter does not include `tools:` or `spawning:` (defaults inherit from the CLI; the agent must be able to dispatch via `subagent_run_serial`).
  Verify: run `grep -nE "^(tools|spawning):" agent/agents/plan-refiner.md` and confirm zero matches.
- The body forbids invoking `commit` and forbids internal era-looping.
  Verify: open `agent/agents/plan-refiner.md` and confirm the `## Rules` section contains a bullet whose text begins `do NOT invoke the \`commit\` skill` and another bullet whose text begins `do NOT loop multiple eras internally`.
- The body explicitly cedes the budget-exhaustion menu, era reset, and commit gate to `refine-plan`.
  Verify: open `agent/agents/plan-refiner.md` and confirm a `## Boundary with refine-plan` heading exists whose body names "budget-exhaustion menu", "era reset", and "commit gate" as caller responsibilities.

**Model recommendation:** cheap

### Task 2: Create refine-plan-prompt.md (coordinator protocol)

**Files:**
- Create: `agent/skills/refine-plan/refine-plan-prompt.md`

**Steps:**

- [ ] **Step 1: Create the directory** — Run `mkdir -p agent/skills/refine-plan`.
- [ ] **Step 2: Author the header and inputs section** — In `agent/skills/refine-plan/refine-plan-prompt.md`, write a top heading `# Plan Refinement Loop`, a one-paragraph orientation matching `agent/skills/refine-code/refine-code-prompt.md` style (you are the plan refiner; drive one era of review-edit; configuration is in this prompt), and a `## Plan Under Review` block with `**Plan path:** {PLAN_PATH}`. Add a `## Provenance` block with the four lines `{TASK_ARTIFACT}`, `{SOURCE_TODO}`, `{SOURCE_SPEC}`, `{SCOUT_BRIEF}` separated by blank lines (each may be empty).
- [ ] **Step 3: Author the structural-only and original-spec blocks** — Add a `## Structural-Only Mode` block containing exactly the placeholder `{STRUCTURAL_ONLY_NOTE}` (the skill fills this with a non-empty paragraph in `--structural-only` mode, empty otherwise). Add a `## Original Spec (inline)` block containing the placeholder `{ORIGINAL_SPEC_INLINE}` (used only for todo/freeform inputs forwarded by the skill).
- [ ] **Step 4: Author the configuration section** — Add a `## Configuration` block listing: `**Max iterations:** {MAX_ITERATIONS}`, `**Starting era:** {STARTING_ERA}`, `**Review output base path:** {REVIEW_OUTPUT_PATH}` (this is the path *without* the version suffix or `.md` extension, e.g. `.pi/plans/reviews/2026-04-27-foo-plan-review`), `**Working directory:** {WORKING_DIR}`.
- [ ] **Step 5: Author the model matrix section** — Add a `### Model Matrix` subsection containing `{MODEL_MATRIX}` (the full JSON dump). Below it, add the dispatch-resolution algorithm copied verbatim from `agent/skills/refine-code/refine-code-prompt.md` lines 33-44 (the four-step provider-prefix → dispatch lookup, default to `"pi"` if absent, always pass `cli` explicitly).
- [ ] **Step 6: Document role-to-tier mapping** — Add a bulleted list under the model matrix: `crossProvider.capable` — primary plan reviewer; `capable` — fallback plan reviewer (used when primary dispatch fails) and the planner edit pass.
- [ ] **Step 7: Author the iteration protocol** — Add a `## Protocol` section with a `### Per-Iteration Full Review` subsection. Document the exact step sequence: (1) Verify the plan file at `{PLAN_PATH}` exists and is non-empty; if missing or empty, emit `STATUS: failed` with reason `plan file missing or empty at iteration start` and exit. (2) Read the file `~/.pi/agent/skills/generate-plan/review-plan-prompt.md`. (3) Fill placeholders: `{PLAN_ARTIFACT}` = `Plan artifact: {PLAN_PATH}`; `{TASK_ARTIFACT}` from the input above; `{SOURCE_TODO}` from input; `{SOURCE_SPEC}` from input; `{SCOUT_BRIEF}` from input; `{ORIGINAL_SPEC_INLINE}` from input; `{STRUCTURAL_ONLY_NOTE}` from input. (4) Dispatch `plan-reviewer` via `subagent_run_serial` with `model: <crossProvider.capable from model matrix>`, `cli: <dispatch lookup>`, and `task: <filled review prompt>`. On dispatch error, retry once with `model: <capable>` and the corresponding dispatch CLI. If both fail, emit `STATUS: failed` with reason `plan-reviewer dispatch failed on primary and fallback` and exit. (5) Read the reviewer's output from `results[0].finalMessage`. If the result is empty or missing, emit `STATUS: failed` with reason `plan-reviewer returned empty result`. (6) Write the full reviewer output to `{REVIEW_OUTPUT_PATH}-v<CURRENT_ERA>.md`, where `<CURRENT_ERA>` starts at `{STARTING_ERA}` and never changes within one `plan-refiner` invocation. Overwrite the file in place if it already exists from a prior iteration in this era. If the write fails, emit `STATUS: failed` with reason `review file write failed: <error>` and exit.
- [ ] **Step 8: Author the assess-and-route step** — Continue the protocol: (7) Parse the review file for the line containing `**[Approved]**` or `**[Issues Found]**`. (8) Count Error / Warning / Suggestion findings (severity tags appear in the review per the existing `review-plan-prompt.md` Output Format). (9) If `Errors == 0` (regardless of whether the verdict label is `[Approved]` or `[Issues Found]`): append warnings + suggestions to the plan as a `## Review Notes` section using the exact format documented below; emit `STATUS: approved` with the summary block and exit. Warnings and suggestions are informational only and never force a planner edit pass — a `[Issues Found]` review with zero Errors is treated as approved per the spec's definition of approval as "no errors remain." (10) If `Errors > 0` and the current iteration count is less than `{MAX_ITERATIONS}`: continue to the edit pass (next subsection). (11) Otherwise (`Errors > 0` and budget exhausted): emit `STATUS: issues_remaining` with the summary block and exit.
- [ ] **Step 9: Author the Review Notes append format** — Add a `### Review Notes Append Format` subsubsection showing the exact markdown that gets appended to the plan file on the approved path:
  ```markdown

  ## Review Notes

  _Added by plan reviewer — informational, not blocking._

  ### Warnings

  - **Task N**: <full warning text including What, Why it matters, Recommendation>

  ### Suggestions

  - **Task N**: <full suggestion text including What, Why it matters, Recommendation>
  ```
  State that the leading blank line is required to separate from any prior content, that the section must be appended at the end of the file (not inserted), and that if zero warnings and zero suggestions exist on the approved path, no `## Review Notes` section is appended.
- [ ] **Step 10: Author the planner edit-pass step** — Add a `### Planner Edit Pass` subsection. Document: (1) Read `~/.pi/agent/skills/generate-plan/edit-plan-prompt.md`. (2) Fill placeholders: `{REVIEW_FINDINGS}` = the full text of all Error-severity findings concatenated; `{PLAN_ARTIFACT}` = `Plan artifact: {PLAN_PATH}`; `{TASK_ARTIFACT}`, `{SOURCE_TODO}`, `{SOURCE_SPEC}`, `{SCOUT_BRIEF}`, `{ORIGINAL_SPEC_INLINE}` from the same inputs as the review pass; `{OUTPUT_PATH}` = `{PLAN_PATH}`. (3) Dispatch `planner` via `subagent_run_serial` with `model: <capable from model matrix>`, `cli: <dispatch lookup>`, `task: <filled edit prompt>`. On dispatch failure, emit `STATUS: failed` with reason `planner edit-pass dispatch failed`. (4) After dispatch returns, verify the plan file at `{PLAN_PATH}` still exists and is non-empty; if not, emit `STATUS: failed` with reason `planner edit pass did not write the plan file`. (5) Increment the iteration counter and loop back to Per-Iteration Full Review step 1.
- [ ] **Step 11: Author the output format section** — Add a `## Output Format` section showing the exact final-message shape:
  ```
  STATUS: approved | issues_remaining | failed

  ## Summary
  Iterations: <N>
  Errors found: <total across all iterations>
  Errors fixed: <total across all iterations>
  Warnings/suggestions appended: <count appended to plan on approved path; 0 otherwise>

  ## Plan File
  <PLAN_PATH>

  ## Review Files
  - <REVIEW_OUTPUT_PATH>-v<STARTING_ERA>.md

  ## Failure Reason
  <one-line reason; only present when STATUS: failed>

  ## Structural-Only Label
  This run was structural-only — no original spec/todo coverage was checked.
  ```
  State that `## Failure Reason` appears only on `STATUS: failed`, and `## Structural-Only Label` appears only when `{STRUCTURAL_ONLY_NOTE}` was non-empty in the inputs. On `STATUS: approved` or `STATUS: issues_remaining`, the `## Review Files` list contains exactly one entry — the era review file successfully written during this invocation. On `STATUS: failed`, the `## Review Files` list contains only review files that were successfully written before the failure: include the era file path if step (6) of the per-iteration protocol completed before the failure occurred, and leave the `## Review Files` list empty when the failure occurred before any review file was written (e.g. plan file missing or empty at iteration start, plan-reviewer dispatch failed on both primary and fallback, plan-reviewer returned an empty `results[0].finalMessage`, or the review file write itself failed). A `plan-refiner` invocation runs one era and therefore writes at most one review file.
- [ ] **Step 12: Author the failure-mode summary** — Add a `## Failure Modes` section enumerating the conditions that produce `STATUS: failed`: plan file missing or empty at iteration start; plan-reviewer dispatch failed on both primary and fallback; plan-reviewer returned an empty `results[0].finalMessage`; review file write failed; planner edit-pass dispatch failed; plan file missing or empty after the planner edit pass returned. Each gets a one-line reason string used in the `## Failure Reason` block.

**Acceptance criteria:**

- The file `agent/skills/refine-plan/refine-plan-prompt.md` exists.
  Verify: run `test -f agent/skills/refine-plan/refine-plan-prompt.md && echo OK` and confirm output is `OK`.
- All required placeholders are present.
  Verify: run `grep -nE "\{PLAN_PATH\}|\{TASK_ARTIFACT\}|\{SOURCE_TODO\}|\{SOURCE_SPEC\}|\{SCOUT_BRIEF\}|\{ORIGINAL_SPEC_INLINE\}|\{STRUCTURAL_ONLY_NOTE\}|\{MAX_ITERATIONS\}|\{STARTING_ERA\}|\{REVIEW_OUTPUT_PATH\}|\{WORKING_DIR\}|\{MODEL_MATRIX\}" agent/skills/refine-plan/refine-plan-prompt.md` and confirm at least one match per placeholder name.
- The protocol explicitly forbids internal era loops.
  Verify: open `agent/skills/refine-plan/refine-plan-prompt.md`, find the `### Per-Iteration Full Review` step (10), and confirm its text says "current iteration count is less than `{MAX_ITERATIONS}`" and step (11) says "budget exhausted with Errors: emit `STATUS: issues_remaining`" — proving the agent does NOT increment the era within one run.
- The protocol references the existing review-plan-prompt.md and edit-plan-prompt.md by absolute path under `~/.pi/agent/skills/generate-plan/`.
  Verify: run `grep -nE "~/.pi/agent/skills/generate-plan/(review|edit)-plan-prompt\.md" agent/skills/refine-plan/refine-plan-prompt.md` and confirm at least two matches (one for review, one for edit).
- The Output Format section shows STATUS values and the `## Plan File`, `## Review Files`, `## Failure Reason`, `## Structural-Only Label` blocks.
  Verify: open `agent/skills/refine-plan/refine-plan-prompt.md` `## Output Format` section and confirm it contains the literal lines `STATUS: approved | issues_remaining | failed`, `## Plan File`, `## Review Files`, `## Failure Reason`, and `## Structural-Only Label`.
- Dispatch resolution is documented and matches the refine-code style.
  Verify: open `agent/skills/refine-plan/refine-plan-prompt.md` and confirm the `### Model Matrix` subsection contains the four-step provider-prefix → dispatch lookup, defaults to `"pi"` when absent, and instructs that `cli` is always passed explicitly.

**Model recommendation:** standard

### Task 3: Adjust review-plan-prompt.md to support structural-only mode

**Files:**
- Modify: `agent/skills/generate-plan/review-plan-prompt.md`

**Steps:**

- [ ] **Step 1: Add the `{STRUCTURAL_ONLY_NOTE}` placeholder block** — In `agent/skills/generate-plan/review-plan-prompt.md`, between the `## Original Spec (inline)` section and the `## Artifact Reading Contract` section, insert a new section with heading `## Structural-Only Mode` and a single body line containing exactly `{STRUCTURAL_ONLY_NOTE}`. The placeholder is empty by default; callers (`plan-refiner`) fill it in `--structural-only` runs with a paragraph instructing the reviewer to skip the Spec/Todo Coverage check and label the verdict structural-only.
- [ ] **Step 2: Update the Artifact Reading Contract** — In the existing `## Artifact Reading Contract` bulleted list, append a new bullet at the end of the existing bullets: `If the \`## Structural-Only Mode\` section is non-empty (i.e. {STRUCTURAL_ONLY_NOTE} was filled), treat the absence of both \`Task artifact:\` and \`## Original Spec (inline)\` content as expected — this is a structural-only review. Do NOT report an inconsistency in this case. Follow the instructions in \`## Structural-Only Mode\`.`
- [ ] **Step 3: Update the Review Checklist coverage section** — In the existing `**Spec/Todo Coverage:**` block, prepend a sentence: `If the \`## Structural-Only Mode\` section is non-empty, skip this Spec/Todo Coverage block entirely and do not list any coverage findings — there is no original spec/todo to compare against.` Leave the rest of the checklist (Dependency Accuracy, Task Sizing, Cross-Task Consistency, Acceptance Criteria Quality, Verify-Recipe Enforcement, Buildability, Constraint Documentation, Placeholder Content) unchanged — those checks still apply in structural-only mode.
- [ ] **Step 4: Update the Output Format Summary section** — In the `### Summary` subsection of `## Output Format`, append a sentence: `If this is a structural-only review (per \`## Structural-Only Mode\`), prepend the literal phrase "Structural-only review — no spec/todo coverage check performed." to the Summary paragraph.`

**Acceptance criteria:**

- The new `## Structural-Only Mode` section exists with the exact placeholder.
  Verify: run `grep -nE "^## Structural-Only Mode$" agent/skills/generate-plan/review-plan-prompt.md` and confirm one match, then run `grep -nE "^\{STRUCTURAL_ONLY_NOTE\}$" agent/skills/generate-plan/review-plan-prompt.md` and confirm one match.
- The Artifact Reading Contract acknowledges the structural-only case.
  Verify: open `agent/skills/generate-plan/review-plan-prompt.md` `## Artifact Reading Contract` section and confirm a bullet exists whose text mentions `{STRUCTURAL_ONLY_NOTE}` and the words "structural-only review" — and tells the reviewer not to report an inconsistency when both Task artifact and Original Spec inline are empty in this case.
- The Spec/Todo Coverage block instructs the reviewer to skip when in structural-only mode.
  Verify: open `agent/skills/generate-plan/review-plan-prompt.md` `**Spec/Todo Coverage:**` block and confirm its first sentence directs the reviewer to skip this block when `## Structural-Only Mode` is non-empty.
- The Summary instructs the reviewer to prepend the structural-only phrase.
  Verify: open `agent/skills/generate-plan/review-plan-prompt.md` `### Summary` subsection and confirm it contains the literal text `Structural-only review — no spec/todo coverage check performed.`
- All other existing checklist items remain untouched.
  Verify: open `agent/skills/generate-plan/review-plan-prompt.md` `## Review Checklist` section and confirm bullets/blocks for `**Dependency Accuracy:**`, `**Task Sizing:**`, `**Cross-Task Consistency:**`, `**Acceptance Criteria Quality:**`, `**Verify-Recipe Enforcement (blocking):**`, `**Buildability:**`, `**Constraint Documentation:**`, `**Placeholder Content:**` all still exist with their original headings.

**Model recommendation:** standard

### Task 4: Create refine-plan SKILL.md (caller-facing skill)

**Files:**
- Create: `agent/skills/refine-plan/SKILL.md`

**Steps:**

- [ ] **Step 1: Author frontmatter** — In `agent/skills/refine-plan/SKILL.md`, write the very first content as YAML frontmatter between `---` delimiters with two fields: `name: refine-plan` and `description: "Iterative plan review and edit loop. Dispatches a plan-refiner that alternates between reviewing and editing until approved or budget exhausted. Owns the plan-artifact commit gate. Usable standalone or from generate-plan."` Frontmatter must be the very first content — no comments, blank lines, or other content before the opening `---`.
- [ ] **Step 2: Author the header and precondition** — Below the frontmatter, write a `# Refine Plan` heading and a one-sentence skill description matching `agent/skills/refine-code/SKILL.md` style. Add a `**Precondition:**` paragraph: must be in a git repository (run `git rev-parse --git-dir`; if it fails, stop with `refine-plan requires a git repository.`).
- [ ] **Step 3: Author Step 1 (gather inputs)** — Add `## Step 1: Gather inputs` with a markdown table specifying these inputs: `PLAN_PATH` (yes, no default, caller positional argument); `TASK_ARTIFACT` (no, derived from plan preamble or `--task-artifact` override, may be empty); `TASK_DESCRIPTION` (no, default empty, set via `--task-description <text>` flag — the inline body of the original spec/todo, used as the coverage source when no on-disk task artifact is available; callers like `generate-plan` pass this through for todo/freeform inputs); `SOURCE_TODO` (no, derived or `--source-todo TODO-<id>` override — supplementary metadata only, not a coverage source on its own); `SCOUT_BRIEF` (no, derived or `--scout-brief <path>` override — supplementary reference context, not a coverage source on its own); `STRUCTURAL_ONLY` (no, default `false`, set true via `--structural-only`); `MAX_ITERATIONS` (no, default 3); `AUTO_COMMIT_ON_APPROVAL` (no, default `false`, set true by callers like `generate-plan`); `WORKING_DIR` (no, default cwd). State that the skill stops with a clear error if `PLAN_PATH` is missing.
- [ ] **Step 4: Author Step 2 (validate plan path)** — Add `## Step 2: Validate plan path`. Run `test -s <PLAN_PATH>` (file exists and non-empty); on failure stop with `refine-plan: plan file <PLAN_PATH> missing or empty.`
- [ ] **Step 5: Author Step 3 (provenance auto-discovery)** — Add `## Step 3: Auto-discover provenance from plan preamble`. Document the bounded preamble read (`head -n 40 <PLAN_PATH>` or equivalent) and the strict exact-match rules. Lines that count: `**Spec:** \`.pi/specs/<filename>\`` (with surrounding backticks; match without backticks too) → set `SOURCE_SPEC = "Source spec: .pi/specs/<filename>"` and (if not already set) `TASK_ARTIFACT = ".pi/specs/<filename>"`; `**Source:** TODO-<id>` → set `SOURCE_TODO = "Source todo: TODO-<id>"`; `**Scout brief:** \`.pi/briefs/<filename>\`` → set `SCOUT_BRIEF = "Scout brief: .pi/briefs/<filename>"`. Apply CLI overrides (`--task-artifact`, `--source-todo`, `--scout-brief`) on top — overrides win. After resolution, verify each referenced path exists on disk (task artifact, scout brief). If a referenced file does not exist, drop that field with a warning (`Provenance file <path> referenced in plan preamble not found — proceeding without it.`) and continue.
- [ ] **Step 6: Author Step 4 (gate on coverage source vs structural-only)** — Add `## Step 4: Gate on coverage source availability`. After Step 3, the skill must have a usable coverage source for the plan reviewer unless `STRUCTURAL_ONLY` is `true`. A coverage source is either (a) a non-empty `TASK_ARTIFACT` resolved to an existing on-disk file, or (b) a non-empty `TASK_DESCRIPTION` (inline body of the original spec/todo). If `STRUCTURAL_ONLY` is `false` AND both `TASK_ARTIFACT` and `TASK_DESCRIPTION` are empty: stop with `refine-plan: no coverage source available and --structural-only not set. Provide --task-artifact <path>, --task-description <text>, or pass --structural-only to opt in to a coverage-blind review.` State explicitly that `SOURCE_TODO`, `SOURCE_SPEC`, and `SCOUT_BRIEF` are pointer/metadata fields and do NOT satisfy this gate on their own — the reviewer needs an actual body or on-disk artifact to perform Spec/Todo Coverage. Otherwise proceed.
- [ ] **Step 7: Author Step 5 (read model matrix and resolve dispatch)** — Add `## Step 5: Read model matrix`. Run `cat ~/.pi/agent/model-tiers.json | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin), indent=2))"`. If the file is missing or unreadable, stop with `refine-plan requires ~/.pi/agent/model-tiers.json — see model matrix configuration.` Document the dispatch resolution: take `crossProvider.standard` (e.g. `openai-codex/gpt-5.5`), extract the provider prefix (`openai-codex`), look up `dispatch["openai-codex"]` (`pi`); use that as the `cli` for the `plan-refiner` dispatch. State the fallback: if the primary dispatch fails, retry with `crossProvider.capable` then `capable`, re-resolving the `cli` each time. Note that the coordinator's CLI must expose pi orchestration tools (`subagent_run_serial`); if the resolved `cli` is not `pi`, warn the user — same pattern as `refine-code`.
- [ ] **Step 8: Author Step 6 (allocate starting era)** — Add `## Step 6: Allocate starting era`. Compute `PLAN_BASENAME = basename of PLAN_PATH without .md extension`. Compute `REVIEW_OUTPUT_PATH = .pi/plans/reviews/<PLAN_BASENAME>-plan-review`. Run `ls .pi/plans/reviews/ 2>/dev/null | grep -E "^${PLAN_BASENAME}-plan-review-v[0-9]+\.md$" | sed -E 's/.*-v([0-9]+)\.md$/\1/' | sort -n | tail -1` to find the highest existing era. Set `STARTING_ERA = <max_existing> + 1`. If no matches found, `STARTING_ERA = 1`. Create `.pi/plans/reviews/` if missing.
- [ ] **Step 9: Author Step 7 (assemble coordinator prompt)** — Add `## Step 7: Assemble coordinator prompt`. Read `agent/skills/refine-plan/refine-plan-prompt.md`. Fill placeholders: `{PLAN_PATH}`, `{TASK_ARTIFACT}` (= `Task artifact: <path>` or empty), `{SOURCE_TODO}` (= `Source todo: TODO-<id>` or empty), `{SOURCE_SPEC}` (= `Source spec: .pi/specs/<filename>` or empty), `{SCOUT_BRIEF}` (= `Scout brief: .pi/briefs/<filename>` or empty), `{ORIGINAL_SPEC_INLINE}` (= the `TASK_DESCRIPTION` input from Step 1; populated for todo/freeform inputs forwarded by `generate-plan` via `--task-description`, populated when a standalone caller passes `--task-description <text>`, and empty for file-based inputs that supply `TASK_ARTIFACT` instead), `{STRUCTURAL_ONLY_NOTE}` (a non-empty paragraph if `STRUCTURAL_ONLY` is true; empty otherwise — see Step 9.5), `{MAX_ITERATIONS}`, `{STARTING_ERA}`, `{REVIEW_OUTPUT_PATH}`, `{WORKING_DIR}`, `{MODEL_MATRIX}`.
- [ ] **Step 10: Author Step 7.5 (compose structural-only note)** — As a sub-step of Step 7, document the exact text the skill writes into `{STRUCTURAL_ONLY_NOTE}` when `STRUCTURAL_ONLY` is `true`: `This is a structural-only review run. No original spec or todo is available. The plan-reviewer must skip the Spec/Todo Coverage check and label its verdict as "Structural-only review — no spec/todo coverage check performed." in its Summary section.` When `STRUCTURAL_ONLY` is `false`, the placeholder is replaced with the empty string.
- [ ] **Step 11: Author Step 8 (dispatch the coordinator)** — Add `## Step 8: Dispatch plan-refiner`. Document the `subagent_run_serial` call with one task object: `{ name: "plan-refiner", agent: "plan-refiner", task: "<filled refine-plan-prompt.md>", model: "<crossProvider.standard from model-tiers.json>", cli: "<dispatch for crossProvider.standard>" }`. Document the fallback chain: on dispatch failure, retry with `crossProvider.capable` then `capable`, each time re-resolving `cli`. If all three fail, set `STATUS = failed` with reason `coordinator dispatch failed on all tiers` and skip to Step 11.
- [ ] **Step 12: Author Step 9 (parse and validate result)** — Add `## Step 9: Parse and validate coordinator result`. Read `results[0].finalMessage`. Parse the `STATUS:` line. Parse the `## Plan File` block (one path) and the `## Review Files` block (list of one path per `plan-refiner` invocation, since one invocation = one era). Parse the optional `## Structural-Only Label` block to detect whether the run was structural-only. Validate: each parsed path must exist via `test -s <path>` (non-empty regular file). On any path validation failure, set `STATUS = failed` with reason `coordinator returned <path> but file is missing or empty` and skip to Step 11.
- [ ] **Step 13: Author Step 10 (handle STATUS branches)** — Add `## Step 10: Handle STATUS`.
  - **`STATUS: approved`** — If `AUTO_COMMIT_ON_APPROVAL` is true, jump to the commit subsection in Step 10a directly. Otherwise, prompt the user: `refine-plan: plan approved. Commit plan + review artifacts? [Y/n]`. On `Y` or empty, run Step 10a. On `n`, set `COMMIT = left_uncommitted` and skip to Step 11.
  - **`STATUS: issues_remaining`** — Present the budget-exhaustion menu exactly as: `(a) Commit current era's plan + review artifacts, then keep iterating into era v<STARTING_ERA + 1> with a fresh budget. (b) Stop here and proceed with issues; commit gate runs based on AUTO_COMMIT_ON_APPROVAL.` On `(a)`: run Step 10a (commit current era). Step 10a MUST succeed (`COMMIT = committed`) before the next era is dispatched. If Step 10a sets `COMMIT = not_attempted` (commit failed for any reason — pre-commit hook failure, dirty index, underlying error), STOP refinement immediately: preserve `STATUS = issues_remaining` and the `COMMIT = not_attempted [reason]` value from Step 10a, do NOT dispatch the next era, and skip directly to Step 11. Continuing into a fresh era after a failed commit would leave the prior era's edits uncommitted while a new era runs — the abandoned-state recovery hazard the spec's two-option menu was designed to prevent. Only when Step 10a sets `COMMIT = committed` may the skill re-run from Step 6 onward with `STARTING_ERA` recomputed by re-scanning the reviews directory (it will now reflect the just-committed file plus any uncommitted files; the rule is still `max(existing_N) + 1`). Loop until either `STATUS: approved` (proceed normally) or the user picks `(b)`. On `(b)`: in `AUTO_COMMIT_ON_APPROVAL = true` mode, run Step 10a (auto-commit). In standalone mode, prompt `Commit current plan + review artifacts? [Y/n]` and run Step 10a on `Y`/empty, set `COMMIT = left_uncommitted` on `n`.
  - **`STATUS: failed`** — Skip the commit gate entirely. Set `COMMIT = not_attempted`. Proceed to Step 11.
- [ ] **Step 14: Author Step 10a (commit invocation)** — Add `## Step 10a: Invoke commit skill`. Pass exactly the concrete plan path and the list of concrete review paths written during the current run only (collected across any iteration loops in Step 10). No globs, no wildcards, no older-version review files from prior standalone runs. State explicitly: `commit` is invoked with the file paths as arguments and a commit message `chore(plan): refine <PLAN_BASENAME>` (or `feat(plan): ...` if appropriate — defer to the `commit` skill's conventional-commits inference). On `commit` skill failure (non-zero exit, pre-commit hook failure, dirty index), capture the error message and set `COMMIT = not_attempted` with the underlying error stored for Step 11. On success, set `COMMIT = committed` (the actual SHA is reported by the `commit` skill itself; the refine-plan summary surfaces `committed` plus the SHA if available).
- [ ] **Step 15: Author Step 11 (final report)** — Add `## Step 11: Report result`. Output exactly:
  ```
  STATUS: <approved | issues_remaining | failed>
  COMMIT: <committed [sha] | left_uncommitted | not_attempted [reason]>
  PLAN_PATH: <path>
  REVIEW_PATHS:
  - <path1>
  - <path2>
  STRUCTURAL_ONLY: <yes | no>
  ```
  Do NOT include full review text. Do NOT include per-iteration findings. If `STATUS: failed`, include a `FAILURE_REASON: <one-line reason>` line. The `REVIEW_PATHS` list contains every review file written during the entire `refine-plan` run (one per era that ran, including any era-(b) decisions and option-(a) commit-and-continue eras).
- [ ] **Step 16: Author Edge Cases section** — Add `## Edge Cases` covering: `commit skill not present` (stop with clear error pointing at `agent/skills/commit/SKILL.md`); `coordinator dispatch CLI is not pi` (warn the user with the same wording as `refine-code` — coordinator needs pi orchestration tools); `plan path is in `.pi/plans/done/` or another archived location` (proceed normally; era allocation still scans `.pi/plans/reviews/`); `coordinator returns paths outside `.pi/plans/reviews/`` (treat as `STATUS: failed`).

**Acceptance criteria:**

- The skill file exists with valid frontmatter as the very first content.
  Verify: run `head -n 1 agent/skills/refine-plan/SKILL.md` and confirm output is exactly `---`. Then run `head -n 4 agent/skills/refine-plan/SKILL.md` and confirm lines 2-3 contain `name: refine-plan` and a `description:` field, and line 4 is `---`.
- The skill documents the coverage-source gate with the exact failure message and rejects bare metadata-only provenance.
  Verify: run `grep -nE "no coverage source available and --structural-only not set" agent/skills/refine-plan/SKILL.md` and confirm at least one match. Then open `agent/skills/refine-plan/SKILL.md` `## Step 4: Gate on coverage source availability` section and confirm it explicitly states that `SOURCE_TODO`, `SOURCE_SPEC`, and `SCOUT_BRIEF` do not satisfy the gate on their own (only `TASK_ARTIFACT` or populated `TASK_DESCRIPTION` do).
- The skill documents the era allocation rule by directory scan.
  Verify: open `agent/skills/refine-plan/SKILL.md` `## Step 6: Allocate starting era` section and confirm it states `STARTING_ERA = max_existing + 1` (or equivalent words) and references `.pi/plans/reviews/` as the scan directory.
- The skill documents both auto-commit and prompt-Y/n commit flows.
  Verify: open `agent/skills/refine-plan/SKILL.md` `## Step 10: Handle STATUS` section and confirm the `STATUS: approved` branch contains both an `AUTO_COMMIT_ON_APPROVAL` true path (no prompt) AND a Y/n prompt path.
- The skill documents the two-option budget-exhaustion menu and forbids any third "keep iterating without committing" option.
  Verify: open `agent/skills/refine-plan/SKILL.md` `## Step 10: Handle STATUS` section, find the `STATUS: issues_remaining` branch, and confirm it lists exactly two options labeled `(a)` and `(b)`. Run `grep -nE "keep iterating without committ" agent/skills/refine-plan/SKILL.md` and confirm zero matches.
- The skill documents that on `STATUS: failed`, the commit gate is skipped.
  Verify: open `agent/skills/refine-plan/SKILL.md` `## Step 10: Handle STATUS` section and confirm the `STATUS: failed` branch states `Skip the commit gate entirely` and `COMMIT = not_attempted`.
- The skill final-report format includes `STATUS`, `COMMIT`, `PLAN_PATH`, `REVIEW_PATHS`, `STRUCTURAL_ONLY` blocks and excludes full review text.
  Verify: open `agent/skills/refine-plan/SKILL.md` `## Step 11: Report result` section and confirm the example block contains lines starting with `STATUS:`, `COMMIT:`, `PLAN_PATH:`, `REVIEW_PATHS:`, `STRUCTURAL_ONLY:` and no instruction to include reviewer findings inline.
- The skill explicitly invokes `commit` with concrete paths only.
  Verify: open `agent/skills/refine-plan/SKILL.md` `## Step 10a: Invoke commit skill` section and confirm it states `No globs, no wildcards, no older-version review files from prior standalone runs.`

**Model recommendation:** capable

### Task 5: Update generate-plan/SKILL.md to delegate to refine-plan

**Files:**
- Modify: `agent/skills/generate-plan/SKILL.md`

**Steps:**

- [ ] **Step 1: Identify the sections to remove or rewrite** — The current `agent/skills/generate-plan/SKILL.md` has these sections that own review/edit/commit logic: `## Step 4: Review-edit loop` (with subsections 4.1, 4.2, 4.3, 4.4) and `## Step 5: Commit artifacts`. Both are removed and replaced.
- [ ] **Step 2: Replace Step 4 with a refine-plan delegation** — Replace the entire `## Step 4: Review-edit loop` section (everything from the `## Step 4:` heading down to but not including `## Step 5: Commit artifacts`) with a new `## Step 4: Refine the plan` section. Body: After Step 3 produces the initial plan, invoke the `refine-plan` skill with these arguments: `PLAN_PATH = <plan path from Step 3>`; for **file-based inputs (Step 1b)** pass `--task-artifact <input path>` (the on-disk artifact is the coverage source); for **todo inputs (Step 1a)** pass `--task-description "<todo body from {TASK_DESCRIPTION} in Step 3>"` AND `--source-todo TODO-<id>` (the inline body is the coverage source; the source-todo line is supplementary metadata); for **freeform inputs (Step 1c)** pass `--task-description "<freeform text from {TASK_DESCRIPTION} in Step 3>"` (the inline body is the coverage source); pass `--scout-brief <path>` if a valid scout brief was extracted in Step 1 and still exists at refinement time; pass `--max-iterations 3`; pass `--auto-commit-on-approval` (always set when invoked from `generate-plan`). State explicitly that `--structural-only` is NEVER passed by `generate-plan` — every generate-plan input source has a coverage source (file artifact for 1b, inline body for 1a/1c). State that `refine-plan` returns a compact summary; `generate-plan` does NOT read review files itself, does NOT parse review findings inline, and does NOT track review versions.
- [ ] **Step 3: Remove the entire Step 5 section** — Delete the entire `## Step 5: Commit artifacts` section. `refine-plan` owns the commit gate.
- [ ] **Step 4: Renumber Step 6 to Step 5 and update its body** — Rename the heading `## Step 6: Report result` to `## Step 5: Report result`. Replace the body with: read the compact summary returned by `refine-plan` (Step 4). Show `STATUS`, `COMMIT`, `PLAN_PATH`, `REVIEW_PATHS`, and (when present) `STRUCTURAL_ONLY: yes` to the user. Then offer execute-plan with: `Plan written to <PLAN_PATH>. Want me to run execute-plan with this plan?` If `COMMIT: left_uncommitted` (which can happen only in standalone-style runs; auto-commit mode always commits on the approved path), prepend a clear note: `Note: plan was left uncommitted. Proceeding with an uncommitted plan means edits made by execute-plan will land on top of an unstaged plan file.` Require explicit user confirmation before invoking execute-plan in that case. Do not auto-invoke execute-plan.
- [ ] **Step 5: Update the Edge cases section** — In the existing `## Edge cases` section, remove or rewrite bullets that describe per-step plan/review/edit failures handled by the now-removed Step 4 — specifically: `Plan file missing between generation and review/edit`, `Task artifact moved or deleted during the review/edit loop`, `Scout brief deleted between generation and review/edit`, `.pi/plans/reviews/ missing`. Replace those bullets with a single bullet: `Refine-plan failures: when refine-plan returns STATUS: failed (e.g. plan file missing, dispatch failure, review write failure), surface the FAILURE_REASON line to the user and skip the execute-plan offer until the underlying issue is resolved. Do not retry refine-plan automatically.` Keep the `Todo ID provided`, `File path provided`, `Scout brief referenced but missing on disk`, and `.pi/plans/ missing` bullets unchanged — those apply to Steps 1-3.
- [ ] **Step 6: Update the path-based handoff scope note** — In the existing `## Scope note on path-based handoff` section, update the dispatch list from "the initial generate-plan -> planner dispatch (Step 3), the generate-plan -> plan-reviewer dispatch (Step 4.1), and the planner edit-pass dispatch (Step 4.3)" to "the initial generate-plan -> planner dispatch (Step 3); review/edit dispatches are now owned by refine-plan and follow refine-plan's own handoff contract (which itself uses path-based handoff for the plan, task artifact, and scout brief)." Remove the references to Steps 4.1 and 4.3 since those steps no longer exist in this skill.
- [ ] **Step 7: Update Step 2's role table** — In the existing `## Step 2: Resolve model tiers` section, remove the table rows for `Plan review (primary)`, `Plan review (fallback)`, and `Plan editing` — those tier roles now live inside `refine-plan` and `plan-refiner`. Keep only the `Plan generation` row (uses `capable`). Also remove the dispatch-fallback notification message paragraph (`⚠️ Cross-provider plan review failed...`) since `generate-plan` no longer dispatches the reviewer.

**Acceptance criteria:**

- Step 4 in `generate-plan/SKILL.md` is now a refine-plan delegation, not a review-edit loop.
  Verify: open `agent/skills/generate-plan/SKILL.md` and confirm the heading `## Step 4:` is followed by the word `Refine` (not `Review-edit`), and the section body invokes `refine-plan` with `--auto-commit-on-approval`. Run `grep -nE "^## Step 4:" agent/skills/generate-plan/SKILL.md` and confirm exactly one match whose heading text is `## Step 4: Refine the plan`.
- Step 4 passes a coverage source for every input type — `--task-artifact` for file inputs and `--task-description` for todo/freeform inputs — and never relies on `--source-todo` or `--scout-brief` alone.
  Verify: open `agent/skills/generate-plan/SKILL.md` `## Step 4: Refine the plan` section and confirm its body explicitly instructs passing `--task-description` for todo (Step 1a) and freeform (Step 1c) inputs, and passing `--task-artifact` for file (Step 1b) inputs. Run `grep -nE "\-\-task-description" agent/skills/generate-plan/SKILL.md` and confirm at least one match inside the new Step 4 body.
- The Step 4.1 / 4.2 / 4.3 / 4.4 subsections are gone.
  Verify: run `grep -nE "^### 4\.[0-9]" agent/skills/generate-plan/SKILL.md` and confirm zero matches.
- The Step 5 commit section is gone.
  Verify: run `grep -nE "^## Step 5: Commit artifacts" agent/skills/generate-plan/SKILL.md` and confirm zero matches.
- A new Step 5 reports the refine-plan summary and offers execute-plan.
  Verify: open `agent/skills/generate-plan/SKILL.md` `## Step 5: Report result` section and confirm it (a) describes consuming `STATUS`/`COMMIT`/`PLAN_PATH`/`REVIEW_PATHS` from refine-plan, (b) contains the prompt offering execute-plan, (c) explicitly handles the `left_uncommitted` case with a confirmation requirement.
- generate-plan no longer references writing review files or parsing review text directly.
  Verify: run `grep -nE "Write review|parse.*review|review.*finalMessage|read the review output file|review file path" agent/skills/generate-plan/SKILL.md` and confirm zero matches.
- The path-based handoff scope note is updated.
  Verify: open `agent/skills/generate-plan/SKILL.md` `## Scope note on path-based handoff` section and confirm it does NOT reference Steps 4.1 or 4.3, and does mention `refine-plan` ownership of review/edit dispatches.
- The model-tier role table only lists Plan generation.
  Verify: open `agent/skills/generate-plan/SKILL.md` `## Step 2: Resolve model tiers` section and confirm the tier table contains exactly one data row whose first cell is `Plan generation`. Run `grep -cE "^\| Plan (review|editing)" agent/skills/generate-plan/SKILL.md` and confirm zero matches.

**Model recommendation:** capable

### Task 6: Manual smoke tests (generate-plan delegation + standalone era allocation)

**Files:**
- Test: `.pi/plans/reviews/` (verify-only — no new files created by this task itself)

**Steps:**

- [ ] **Step 1: Pick a small spec for the generate-plan smoke test** — Use a small spec under `.pi/specs/` that has not been planned yet (or pick a tiny ad-hoc todo). Note its path or todo ID. Capture the cwd state (`git status`, `git rev-parse HEAD`).
- [ ] **Step 2: Run generate-plan against the spec/todo** — Invoke generate-plan with the chosen input. Observe that Step 3 produces a plan in `.pi/plans/<date>-<slug>.md`. Observe that Step 4 invokes refine-plan with `--auto-commit-on-approval`. Observe that the main session output during refinement contains only compact STATUS/COMMIT/path lines — NOT full review text.
- [ ] **Step 3: Verify generate-plan smoke results** — Confirm the plan file exists at `.pi/plans/<date>-<slug>.md`. Confirm at least one review artifact exists at `.pi/plans/reviews/<basename>-plan-review-v1.md`. Confirm the plan and review files are committed in a single commit. Confirm the generate-plan main session transcript shows compact `STATUS / COMMIT / PLAN_PATH / REVIEW_PATHS / STRUCTURAL_ONLY` output (no inline review prose).
- [ ] **Step 4: Pick an existing committed plan with prior `vN` reviews for the standalone smoke test** — Identify a plan under `.pi/plans/` whose basename has at least one existing `<basename>-plan-review-vN.md` review file under `.pi/plans/reviews/`. Note the highest existing N (call it `K`).
- [ ] **Step 5: Run refine-plan standalone against that plan** — Invoke refine-plan with the chosen plan path positional argument. Pass a coverage source that satisfies the Task 4 Step 4 coverage-source gate: either `--task-artifact <spec path>` (when an on-disk artifact such as `.pi/specs/<file>.md` exists for this plan) or `--task-description "<original todo/spec body>"` (when only the inline body is recoverable). If neither is recoverable, pass `--structural-only` to opt in to a coverage-blind review. `--source-todo TODO-<id>` and `--scout-brief <path>` may additionally be passed if recoverable from the plan preamble, but they are supplementary metadata only and do NOT satisfy the coverage-source gate on their own — passing only `--source-todo` (or only `--scout-brief`) will hit the Step 4 failure. Decline (n) the commit gate at the end so the refined plan is not committed (this isolates the era-allocation check from commit side effects).
- [ ] **Step 6: Verify standalone era allocation** — Confirm the new review file written this run is named `<basename>-plan-review-v<K+1>.md`. Confirm prior versions `v1`...`vK` exist on disk untouched (compare `git ls-files` output for those paths before and after the run, or compare file mtime/checksum). Confirm refine-plan's final `REVIEW_PATHS` list contains exactly the new `v<K+1>` path and no globs.
- [ ] **Step 7: Verify failure-path smoke (optional but recommended)** — Run refine-plan against a non-existent plan path; confirm it stops with `refine-plan: plan file <path> missing or empty.` and exit non-zero. Run refine-plan against a plan with no provenance preamble and without `--structural-only`; confirm it stops with the structural-only gate failure message from Step 4 of the skill.

**Acceptance criteria:**

- The generate-plan smoke run produces the expected artifacts and only compact output in the orchestrator transcript.
  Verify: read the orchestrator transcript captured during the smoke run and confirm it contains the lines `STATUS:`, `COMMIT:`, `PLAN_PATH:`, `REVIEW_PATHS:` exactly as defined in `agent/skills/refine-plan/SKILL.md` Step 11 — and confirm it does NOT contain Error/Warning/Suggestion-severity prose blocks copied from the review file (i.e. `grep -cE "^\*\*\[(Error|Warning|Suggestion)\]" <transcript>` should return 0).
- The generate-plan smoke run leaves a single commit containing the plan + review files.
  Verify: run `git log -1 --name-only` after the smoke run and confirm the commit's file list includes the plan path under `.pi/plans/` and at least one review path under `.pi/plans/reviews/`.
- The standalone smoke run allocates the next era and preserves prior versions.
  Verify: run `ls -1 .pi/plans/reviews/ | grep "<basename>-plan-review-v" | sort -V` after the standalone run and confirm both the prior `v1`...`vK` files and the new `v<K+1>` file are present. Then run `git diff --stat .pi/plans/reviews/<basename>-plan-review-v1.md` (and any earlier versions); confirm zero changes (prior files were not modified).
- The standalone smoke `REVIEW_PATHS` block contains exactly the new `v<K+1>` path.
  Verify: open the standalone-run final report transcript and confirm the `REVIEW_PATHS:` block contains exactly one path ending in `-plan-review-v<K+1>.md` and no other paths.
- The failure-path smoke runs produce the documented error messages and non-zero exit.
  Verify: re-run `refine-plan /tmp/nonexistent-plan.md` and confirm stderr/stdout contains `refine-plan: plan file /tmp/nonexistent-plan.md missing or empty.` Re-run refine-plan against a plan with no provenance preamble and without `--task-artifact`, `--task-description`, or `--structural-only` flags, and confirm output contains the exact phrase `no coverage source available and --structural-only not set` (the stable substring of the Task 4 Step 4 coverage-source gate failure message).

**Model recommendation:** standard

## Dependencies

- Task 1 depends on: nothing
- Task 2 depends on: Task 1 (refine-plan-prompt.md references the plan-refiner agent name)
- Task 3 depends on: nothing (independent edit of review-plan-prompt.md)
- Task 4 depends on: Task 1, Task 2, Task 3 (SKILL.md references the agent, the prompt template, and the structural-only review prompt block)
- Task 5 depends on: Task 4 (generate-plan delegates to the new refine-plan skill)
- Task 6 depends on: Task 1, Task 2, Task 3, Task 4, Task 5 (smoke tests exercise the full integrated flow)

## Risk Assessment

- **Approach honored:** spec's `## Approach` section chose a coordinator-backed skill split mirroring `refine-code` / `code-refiner`. The plan implements exactly that — no deviation. No `## Approach` deviation entries needed.
- **Era allocation race:** if two refine-plan runs run concurrently against the same plan basename (rare, but possible in worktree scenarios), they could both observe the same `max(N)` and both write to `v<N+1>`. Mitigation: document in Task 4 Step 8 that era allocation is point-in-time and concurrent runs against the same plan are not supported. No locking introduced — the failure mode is the same as concurrent edits to the plan file itself.
- **Coordinator dispatch CLI not pi:** if the user's `model-tiers.json` resolves `crossProvider.standard` to a provider whose dispatch is not `pi`, the coordinator cannot use `subagent_run_serial`. Mitigated by replicating refine-code's warn-and-continue pattern in Task 4 Step 7. The user can override the dispatch map.
- **Review prompt template drift:** if `agent/skills/generate-plan/review-plan-prompt.md` or `edit-plan-prompt.md` are renamed or moved, the coordinator protocol breaks. Mitigated by Task 2 Step 7/Step 10 hard-referencing `~/.pi/agent/skills/generate-plan/...` paths and the smoke test (Task 6) catching breakage end-to-end.
- **Auto-commit on the approved path commits a not-yet-shown plan:** in `generate-plan`-invoked mode, the user does not see the plan before it is committed. This is intentional per the spec ("the user already opted into the workflow and an extra confirmation right after approval is friction"). Mitigation: the commit is a single atomic operation that can be reverted with `git revert`; the plan file path is reported clearly in the final summary so the user can inspect it post-commit.
- **Budget-exhaustion option (a) infinite loop:** if the user repeatedly picks (a), the loop runs indefinitely. Mitigated by the documented `max_iterations` per era — each (a) iteration runs at most `MAX_ITERATIONS` reviews, so progress (or non-progress) is visible to the user, who controls when to pick (b). No additional cap introduced.
- **Plan-refiner returns paths outside `.pi/plans/reviews/`:** treated as `STATUS: failed` per Task 4 Step 16 edge case. The skill's path validation catches this before the commit gate.
- **Standalone runs against `done/` plans:** the spec allows it and Task 4 Step 16 confirms behavior. The smoke tests in Task 6 do not specifically exercise `done/` plans; if a downstream user reports issues there, follow up separately.
- **Removed `Plan review (primary)` / `Plan editing` rows in generate-plan Step 2:** if a future skill resurrects direct review/edit dispatches in generate-plan, Task 5 Step 7's deletion would need partial restoration. Mitigation: keep refine-plan as the single review/edit owner (per the spec's Non-Goals).

