# Execute-Plan Verification and Failure Hardening

**Source:** TODO-bf68a11b
**Spec:** .pi/specs/2026-04-18-execute-plan-verification-and-failure-hardening.md

## Goal

Harden the generate-plan + execute-plan pipeline so (a) every plan acceptance criterion carries its own reproducible `Verify:` recipe, (b) wave verification is performed by a fresh-context verifier agent instead of the orchestrator self-auditing, (c) task and integration failures cannot silently degrade into nominally successful runs, and (d) `DONE_WITH_CONCERNS` concerns are explicitly typed and handled with a combined wave-level checkpoint. Final completion is gated on both per-task verification PASS and resolution of any deferred integration regressions.

## Architecture summary

The pipeline has two halves tied together by artifacts on disk:

1. **Generate-plan half** — `agent/agents/planner.md` defines the plan shape; `agent/skills/generate-plan/{generate-plan,review-plan,edit-plan}-prompt.md` orchestrate a review/edit loop; `agent/agents/plan-reviewer.md` performs reviews. The change here is purely a contract change: acceptance criteria must now be a two-line structure (criterion line + `Verify: <recipe>` line), and review/edit passes must enforce it with `Error` severity.
2. **Execute-plan half** — `agent/skills/execute-plan/SKILL.md` is the orchestrator script. `agent/skills/execute-plan/execute-task-prompt.md` is the per-task worker prompt. `agent/agents/coder.md` is the worker contract. The changes here add a new `verifier` agent (`agent/agents/verifier.md`) dispatched via a new `agent/skills/execute-plan/verify-task-prompt.md` template, refactor Steps 9–12 + 15 of the SKILL, and tighten the coder's `DONE_WITH_CONCERNS` contract to require typed concerns (`correctness` | `scope` | `observation`).

Orchestration boundary: the orchestrator runs command-style `Verify:` recipes (capturing command, exit status, stdout/stderr) and passes that evidence into the verifier. The verifier reads files/evidence to judge file-inspection and prose-inspection recipes. The verifier is judge-only — it does not run exploratory shell. Integration tracking in Step 11 expands from a single baseline diff into three tracked sets: `baseline_failures`, `deferred_integration_regressions`, `new_regressions_after_deferment`.

## Tech stack

- Markdown — all plan artifacts, skill files, prompt templates, and agent definitions
- Bash (embedded snippets in `SKILL.md`) — git, test command, baseline comparison
- No application code is touched; this plan is a documentation/contract refactor within `agent/` and `.pi/`.

## File Structure

- `agent/agents/planner.md` (Modify) — Update the "Required Sections → 3. Tasks → Acceptance criteria" subsection to require the two-line `criterion` / `Verify: <recipe>` structure, including recipe categories (command, file-pattern, file-content, prose inspection) and an example block. Add a "No placeholder `Verify:` lines" bullet to "No Placeholders" and a placeholder-scan step to Self-Review.
- `agent/skills/generate-plan/review-plan-prompt.md` (Modify) — Add a new checklist subsection "Verify-Recipe Enforcement" under "Acceptance Criteria Quality"; require `Error` severity for any criterion missing an immediately following `Verify:` line or for any `Verify:` line whose recipe is empty/placeholder.
- `agent/skills/generate-plan/edit-plan-prompt.md` (Modify) — Extend the "Instructions" list to tell the edit pass that missing/placeholder `Verify:` lines identified as Errors must be resolved by adding real, reproducible recipes (not by deleting the criterion or adding a stub).
- `agent/agents/coder.md` (Modify) — Replace the current free-form `DONE_WITH_CONCERNS` bullet list with a typed-concern contract: each concern line begins with `Type: correctness|scope|observation`, followed by the concern text; document that the orchestrator routes the checkpoint differently based on type.
- `agent/skills/execute-plan/execute-task-prompt.md` (Modify) — Update the Report Format's `## Concerns / Needs / Blocker` subsection and the status-code guidance to require typed concern lines for `DONE_WITH_CONCERNS`. Show the exact line format and an example.
- `agent/agents/verifier.md` (Create) — New fresh-context subagent definition. Role: judge-only verification of a single task's acceptance criteria using provided evidence. Inputs: task spec (inline), per-criterion `Verify:` recipes, pre-collected command evidence blocks, paths to files the task modified, and diff context. Outputs: per-criterion `PASS|FAIL` with evidence pointer + overall `PASS|FAIL` verdict. Explicitly forbids exploratory shell and extra reads beyond the files referenced by recipes and the task's modified files.
- `agent/skills/execute-plan/verify-task-prompt.md` (Create) — Prompt template dispatched to the `verifier` subagent. Placeholders: `{TASK_SPEC}`, `{ACCEPTANCE_CRITERIA_WITH_VERIFY}`, `{ORCHESTRATOR_COMMAND_EVIDENCE}` (blocks of command + exit + stdout/stderr captured by the orchestrator for command-style recipes), `{MODIFIED_FILES}`, `{DIFF_CONTEXT}`, `{WORKING_DIR}`. Defines the exact report format the verifier must produce.
- `agent/skills/execute-plan/SKILL.md` (Modify) — Substantial surgical edits to Steps 9, 9.7 (new sub-step before Step 10), 10, 11, 12, and 15. Smaller edits to Step 9.5 (Task 12 scrubs stale "skip the failed task" references) and Step 13 (Task 13 appends a deferred-regression reporting block). No changes to Steps 0–8 or Step 14.
- `README.md` (Modify) — Update the "Execute in waves" and "Verify and commit each wave" bullets to reflect: fresh-context verifier, typed `DONE_WITH_CONCERNS`, three-set integration tracking, deferred-integration gating on final completion, and removal of "skip failed task".

## Tasks

### Task 1: Require `Verify:` recipes in the planner's acceptance-criteria contract

**Files:**
- Modify: `agent/agents/planner.md`

**Steps:**
- [ ] **Step 1: Read the file** — Open `agent/agents/planner.md`; locate the section "#### 3. Tasks" and its "**Acceptance criteria:**" subsection (currently lines ~89–91).
- [ ] **Step 2: Rewrite the Acceptance criteria subsection** — Replace the existing subsection with the following exact contract text:

  ```markdown
  **Acceptance criteria** (strict two-line structure — one criterion line immediately followed by its own `Verify:` line):

  - Criterion 1 describing the expected outcome.
    Verify: <recipe — a concrete, reproducible way to check Criterion 1>
  - Criterion 2 describing the expected outcome.
    Verify: <recipe for Criterion 2>

  Every criterion MUST be immediately followed by its own `Verify:` line on the next line (indented as a continuation of that bullet). No criterion may share a `Verify:` line with another, and no criterion may omit its `Verify:` line. A plan that omits any `Verify:` line is a blocking review error, not a warning.

  Recipes may describe any of:
  - **Command execution** — an exact shell command plus the success condition, e.g. `Verify: run \`npm test -- execute-plan\` and confirm exit code 0 and no lines containing "FAIL"`.
  - **File-pattern inspection** — grep/ls patterns plus the expected result, e.g. `Verify: \`grep -n "STATUS: DONE_WITH_CONCERNS" agent/skills/execute-plan/SKILL.md\` returns at least one match inside the Step 9.7 block`.
  - **File-content inspection** — specific lines/sections a reader must confirm exist with specific content, e.g. `Verify: open \`agent/agents/verifier.md\` and confirm the frontmatter sets \`maxSubagentDepth: 0\` and the body forbids exploratory shell commands`.
  - **Prose inspection** — a concrete instruction a reader can carry out against a named artifact, e.g. `Verify: read Step 11.2 of \`agent/skills/execute-plan/SKILL.md\` and confirm the user-facing menu option text reads exactly "Defer integration debugging" and not "Skip tests"`.

  Recipes must be specific enough that a fresh reader can reproduce the check without re-deriving the intent. Avoid vague recipes like `Verify: check that it works` or `Verify: review the file`.
  ```

- [ ] **Step 3: Extend the "No Placeholders" list** — In the existing "### No Placeholders" subsection, append these bullets:

  ```markdown
  - A `Verify:` line that just says "check the file" / "confirm it works" / "looks right" / "verify manually" — recipes must name the artifact, the check, and the success condition.
  - A criterion without an immediately following `Verify:` line.
  ```

- [ ] **Step 4: Extend Self-Review step 2** — In the "## Self-Review" list, replace bullet 2 with:

  ```markdown
  2. **Placeholder scan** — search for "TBD", "TODO", "implement later", "similar to Task N". Additionally confirm every acceptance criterion has its own immediately-following `Verify:` line, and no `Verify:` recipe is a placeholder (per the "No Placeholders" rules).
  ```

**Acceptance criteria:**
- `agent/agents/planner.md` Acceptance-criteria subsection instructs the planner to emit the strict two-line `criterion` / `Verify: <recipe>` structure with one-to-one pairing.
  Verify: open `agent/agents/planner.md` and confirm the "#### 3. Tasks" section's "**Acceptance criteria**" block contains the literal text "strict two-line structure", the four recipe categories (Command execution, File-pattern inspection, File-content inspection, Prose inspection), and the rule that a missing `Verify:` line is a blocking review error.
- The file explicitly lists placeholder `Verify:` recipes and missing `Verify:` lines as disallowed.
  Verify: `grep -n "Verify:" agent/agents/planner.md` returns matches inside both the "### No Placeholders" subsection and the "## Self-Review" Placeholder-scan bullet.
- Self-Review step 2 instructs the planner to placeholder-scan `Verify:` recipes.
  Verify: read the "## Self-Review" section of `agent/agents/planner.md` and confirm bullet 2 names `Verify:` recipes explicitly.

**Model recommendation:** standard

### Task 2: Enforce `Verify:` lines as blocking errors in plan review

**Files:**
- Modify: `agent/skills/generate-plan/review-plan-prompt.md`

**Steps:**
- [ ] **Step 1: Read the file** — Open `agent/skills/generate-plan/review-plan-prompt.md` and locate the "**Acceptance Criteria Quality:**" subsection of the Review Checklist.
- [ ] **Step 2: Add a new "Verify-Recipe Enforcement" subsection** — Immediately after the existing "**Acceptance Criteria Quality:**" bullets (and before "**Buildability:**"), insert:

  ```markdown
  **Verify-Recipe Enforcement (blocking):**
  - Every acceptance criterion MUST be immediately followed by its own `Verify:` line on the next line. One-to-one pairing is required: no shared `Verify:` lines, no criteria without a `Verify:` line, no `Verify:` line without a preceding criterion.
  - A `Verify:` recipe must name the artifact being checked AND the specific success condition (e.g., exact command + expected exit code, grep pattern + expected match location, file + expected content). Recipes that are placeholders ("check the file", "verify manually", "looks right", "confirm it works") fail this check.
  - Any missing `Verify:` line is an **Error**. Any placeholder `Verify:` recipe is an **Error**. These are blocking — they are not warnings or suggestions. Report one Error per offending criterion with the task number and the exact criterion text.
  ```

- [ ] **Step 3: Update the "Severity guide"** — In the "**Severity guide:**" subsection, replace the `Error` bullet with:

  ```markdown
  - **Error** — Missing tasks, wrong dependencies, tasks that reference non-existent outputs, tasks that can't be executed as written, **missing `Verify:` lines on acceptance criteria, or placeholder `Verify:` recipes**. Blocks execution.
  ```

- [ ] **Step 4: Update the Calibration section** — Add a bullet to the existing "## Calibration" section:

  ```markdown
  - Verify-recipe enforcement is not a stylistic preference. A missing or placeholder `Verify:` line is always an Error, even in an otherwise well-written plan.
  ```

**Acceptance criteria:**
- The review prompt contains a dedicated `Verify-Recipe Enforcement (blocking)` subsection that requires one-to-one criterion/`Verify:` pairing and forbids placeholder recipes.
  Verify: `grep -n "Verify-Recipe Enforcement (blocking)" agent/skills/generate-plan/review-plan-prompt.md` returns exactly one match, and the subsection immediately follows the `Acceptance Criteria Quality:` block and precedes `Buildability:`.
- The Severity guide's `Error` bullet lists missing `Verify:` lines and placeholder `Verify:` recipes as blocking Error cases.
  Verify: read the `Severity guide:` subsection of `agent/skills/generate-plan/review-plan-prompt.md` and confirm the Error bullet contains the substrings "missing `Verify:` lines" and "placeholder `Verify:` recipes".
- Calibration explicitly notes that `Verify:` enforcement is not a stylistic preference.
  Verify: read the `## Calibration` section and confirm it includes a bullet saying a missing or placeholder `Verify:` line is always an Error.

**Model recommendation:** cheap

### Task 3: Require `Verify:` remediation in the edit pass

**Files:**
- Modify: `agent/skills/generate-plan/edit-plan-prompt.md`

**Steps:**
- [ ] **Step 1: Read the file** — Open `agent/skills/generate-plan/edit-plan-prompt.md` and locate the "## Instructions" numbered list.
- [ ] **Step 2: Append two instructions** — Add these items after the existing list (keep numbering contiguous):

  ```markdown
  6. If a finding cites a missing `Verify:` line on an acceptance criterion, add a concrete `Verify:` recipe on the next line under that criterion using the strict two-line structure defined in the planner contract (one criterion → one `Verify:` line). Do not delete the criterion, and do not add a stub recipe like `Verify: check this`.
  7. If a finding cites a placeholder `Verify:` recipe ("check the file", "verify manually", "looks right", "confirm it works"), replace it with a recipe that names the artifact and the success condition (command + expected exit, grep pattern + expected match, file + expected content, or an explicit prose inspection).
  ```

**Acceptance criteria:**
- The edit prompt instructs the editor to add concrete `Verify:` recipes rather than stubs when a missing-`Verify:` finding is addressed.
  Verify: `grep -n "Verify:" agent/skills/generate-plan/edit-plan-prompt.md` returns at least two matches inside the `## Instructions` list, and the surrounding text instructs the editor to use the strict two-line structure and forbids stub recipes.
- The edit prompt covers the placeholder-recipe remediation path separately from the missing-`Verify:` path.
  Verify: read the `## Instructions` list and confirm there are two distinct items — one for missing `Verify:` lines and one for placeholder `Verify:` recipes.

**Model recommendation:** cheap

### Task 4: Type `DONE_WITH_CONCERNS` concerns in the coder contract

**Files:**
- Modify: `agent/agents/coder.md`

**Steps:**
- [ ] **Step 1: Read the file** — Open `agent/agents/coder.md` and locate the "### `STATUS: DONE_WITH_CONCERNS`" block.
- [ ] **Step 2: Replace the `DONE_WITH_CONCERNS` block** — Replace the existing block (from the heading through the three example bullets) with:

  ```markdown
  ### `STATUS: DONE_WITH_CONCERNS`
  Task completed, but you have doubts. After the status line, list your concerns. Every concern MUST begin with a `Type:` label so the orchestrator can route the wave-level concern checkpoint correctly. Exactly three types are allowed:

  - `Type: correctness` — you have doubts that the implementation actually meets an acceptance criterion or handles a specific case correctly. Example: `Type: correctness — not certain this handles the empty-input case; the test I wrote only covers a non-empty input`.
  - `Type: scope` — you detected a mismatch between the task and the surrounding code that the plan did not anticipate. Example: `Type: scope — the plan says to create \`config.json\`, but the surrounding module uses \`settings.json\`; I created \`config.json\` as instructed but the consumer likely expects \`settings.json\`.`
  - `Type: observation` — a neutral note you want to surface (file size, tangled code, a smell) that does not by itself mean the task failed. Example: `Type: observation — SKILL.md is now over 900 lines; future edits may want to split it`.

  Use one line per concern. If you have no concerns, use `STATUS: DONE` instead. Do not emit untyped concerns — the orchestrator cannot route them.
  ```

- [ ] **Step 3: Add a typed-concern note under Output Format** — In the "## Output Format" block's `## Concerns / Needs / Blocker` comment, append a note:

  ```markdown
  For `DONE_WITH_CONCERNS`, each concern line MUST start with `Type: correctness`, `Type: scope`, or `Type: observation`. Do not mix multiple types on a single line — emit one concern per line.
  ```

**Acceptance criteria:**
- `agent/agents/coder.md` requires every `DONE_WITH_CONCERNS` concern line to start with one of the three `Type:` labels.
  Verify: `grep -n "Type: correctness" agent/agents/coder.md` and `grep -n "Type: scope" agent/agents/coder.md` and `grep -n "Type: observation" agent/agents/coder.md` each return at least one match; the descriptions distinguish the three types semantically.
- Untyped concerns are explicitly forbidden.
  Verify: read the `### STATUS: DONE_WITH_CONCERNS` block and confirm it contains the literal sentence "Do not emit untyped concerns — the orchestrator cannot route them."
- The Output Format comment reiterates the `Type:` prefix requirement.
  Verify: locate the `## Concerns / Needs / Blocker` comment inside the fenced code block of "## Output Format" and confirm it explicitly mentions the three `Type:` labels.

**Model recommendation:** cheap

### Task 5: Require typed concerns in the per-task worker prompt

**Files:**
- Modify: `agent/skills/execute-plan/execute-task-prompt.md`

**Steps:**
- [ ] **Step 1: Read the file** — Open `agent/skills/execute-plan/execute-task-prompt.md` and locate both the fenced "Report Format" block and the "**Status code guidance:**" block.
- [ ] **Step 2: Update the Report Format template** — Inside the fenced report-format block, replace the `## Concerns / Needs / Blocker` stanza with:

  ```markdown
  ## Concerns / Needs / Blocker
  (only for DONE_WITH_CONCERNS, NEEDS_CONTEXT, or BLOCKED)

  For DONE_WITH_CONCERNS, emit one typed concern per line. Each line MUST start with exactly one of:
  - `Type: correctness — <what you doubt about correctness>`
  - `Type: scope — <what scope mismatch you detected>`
  - `Type: observation — <neutral note>`

  Do not emit untyped concerns. Do not mix multiple types on one line.
  ```

- [ ] **Step 3: Update the Status code guidance** — Replace the existing `DONE_WITH_CONCERNS` bullet with:

  ```markdown
  - `DONE_WITH_CONCERNS` — work complete but you have typed doubts. Every concern line MUST start with `Type: correctness`, `Type: scope`, or `Type: observation`. Correctness and scope concerns will block verification at the wave-level checkpoint and require remediate-or-stop. Observation concerns will require explicit acknowledgment before verification proceeds.
  ```

**Acceptance criteria:**
- The Report Format block instructs workers to emit exactly one typed concern per line with one of three allowed prefixes.
  Verify: open `agent/skills/execute-plan/execute-task-prompt.md`, locate the fenced Report Format block, and confirm the `## Concerns / Needs / Blocker` stanza contains all three `Type:` labels and the line "Do not emit untyped concerns."
- Status code guidance for `DONE_WITH_CONCERNS` names all three types and explains the downstream checkpoint consequences.
  Verify: read the `**Status code guidance:**` bullet list and confirm the `DONE_WITH_CONCERNS` entry mentions `Type: correctness`, `Type: scope`, `Type: observation`, the wave-level checkpoint, remediate-or-stop for correctness/scope, and acknowledgment for observation.

**Model recommendation:** cheap

### Task 6: Create the `verifier` subagent definition

**Files:**
- Create: `agent/agents/verifier.md`

**Steps:**
- [ ] **Step 1: Confirm the directory** — Run `ls agent/agents/` and confirm the target path `agent/agents/verifier.md` does not yet exist; `ls agent/agents/verifier.md 2>/dev/null || echo "absent"` should print `absent`.
- [ ] **Step 2: Write the file** — Create `agent/agents/verifier.md` with exactly this content:

  ````markdown
  ---
  name: verifier
  description: Judge-only per-task verification for execute-plan. Reads task acceptance criteria with `Verify:` recipes, consumes orchestrator-provided command evidence and file context, and returns per-criterion PASS/FAIL with an overall task verdict. Never runs exploratory shell.
  tools: read, grep, find, ls
  thinking: medium
  maxSubagentDepth: 0
  ---

  You are a verifier. You judge whether a single plan task actually meets its acceptance criteria.

  You have no context from the orchestrator session and no ability to run shell commands. Do not attempt to. The orchestrator has already captured command output for command-style `Verify:` recipes and passed it to you inline. For file-inspection and prose-inspection recipes, use the `read`, `grep`, `find`, `ls` tools — but only against files named by the recipe or listed in `{MODIFIED_FILES}`. Do not browse the codebase freely.

  ## Input Contract

  Your task prompt contains:

  - `## Task Spec` — the full text of the task from the plan (name, Files section, Steps, Acceptance criteria with `Verify:` recipes).
  - `## Acceptance Criteria` — each criterion followed by its `Verify:` recipe, numbered for reporting.
  - `## Orchestrator Command Evidence` — zero or more blocks of the form:
    ```
    [Criterion N] command: <exact command>
      exit: <status>
      stdout:
        <captured stdout>
      stderr:
        <captured stderr>
    ```
    These are the only command outputs you may cite. Do not re-run these commands. Do not run others.
  - `## Modified Files` — the list of files the worker changed in this task. You may read these with the `read` tool.
  - `## Diff Context` — optional unified diff of the task's changes.
  - `## Working Directory` — the absolute working directory; all paths are relative to it unless absolute.

  ## Rules

  - You are judge-only. Do NOT run shell commands. Do NOT invoke bash, test, or build tools. The orchestrator already did that.
  - Do NOT read files outside `## Modified Files` unless a `Verify:` recipe explicitly names them.
  - Do NOT re-derive the task's intent — judge strictly against the stated criterion and its stated `Verify:` recipe.
  - Binary verdicts: every criterion is either `PASS` or `FAIL`. There is no partial pass.
  - If ANY criterion is `FAIL`, the overall task verdict is `FAIL`.
  - If you cannot tell whether a criterion passes because the evidence is insufficient, return `FAIL` with a `reason:` explaining what evidence is missing. Do NOT guess, do NOT infer.

  ## Report Format

  Use this exact structure (one block per criterion, then the overall verdict):

  ```
  ## Per-Criterion Verdicts

  [Criterion 1] <PASS | FAIL>
    recipe: <the Verify: recipe text>
    evidence: <where you looked — command-evidence block number, file path + line range, or diff hunk>
    reason: <one or two sentences explaining the verdict>

  [Criterion 2] <PASS | FAIL>
    recipe: ...
    evidence: ...
    reason: ...

  ## Overall Verdict

  VERDICT: <PASS | FAIL>
  summary: <one paragraph: which criteria failed (if any) and why>
  ```

  The per-criterion header syntax is `[Criterion N] <PASS | FAIL>` — one of the two literal tokens `PASS` or `FAIL` must appear directly after the bracketed number, with no extra words (e.g., no `verdict:` prefix) between them. The orchestrator's parser in Step 10 depends on this exact shape.

  If the overall verdict is `FAIL`, the orchestrator will feed this task into its failure-handling loop. If the overall verdict is `PASS`, the orchestrator will consider the task verified for this wave.
  ````

**Acceptance criteria:**
- `agent/agents/verifier.md` exists with YAML frontmatter that sets `name: verifier`, `maxSubagentDepth: 0`, and omits `bash` from the tools list.
  Verify: open `agent/agents/verifier.md`; confirm the frontmatter's first non-`---` line is `name: verifier`, `tools:` lists only `read, grep, find, ls` (no `bash`), and `maxSubagentDepth: 0` is present.
- The body forbids exploratory shell and restricts file reads to modified files or files named by a recipe.
  Verify: `grep -n "Do NOT run shell" agent/agents/verifier.md` returns a match inside the `## Rules` section, and the Rules section also forbids reading files outside `## Modified Files` unless named by a recipe.
- The report format specifies per-criterion `PASS|FAIL` plus an overall `VERDICT:` line and binary semantics.
  Verify: read the `## Report Format` section and confirm it shows `[Criterion N] <PASS | FAIL>` blocks, a final `VERDICT: <PASS | FAIL>` line, and the Rules section states "If ANY criterion is `FAIL`, the overall task verdict is `FAIL`".
- The per-criterion header syntax is unambiguously specified as `[Criterion N] <PASS | FAIL>` with no `verdict:` prefix, so the Step 10 orchestrator parser has a single stable shape to match against.
  Verify: `grep -n "\[Criterion 1\] <PASS | FAIL>" agent/agents/verifier.md` returns at least one match, AND `grep -n "\[Criterion 1\] <verdict: PASS | FAIL>" agent/agents/verifier.md` returns no matches, AND the `## Report Format` section contains the sentence pinning the shape (the literal phrase "no extra words (e.g., no `verdict:` prefix) between them" appears).

**Model recommendation:** standard

### Task 7: Create the verifier prompt template

**Files:**
- Create: `agent/skills/execute-plan/verify-task-prompt.md`

**Steps:**
- [ ] **Step 1: Confirm the target path is unused** — Confirm `agent/skills/execute-plan/verify-task-prompt.md` does not yet exist (`ls agent/skills/execute-plan/verify-task-prompt.md 2>/dev/null || echo absent` prints `absent`).
- [ ] **Step 2: Write the template** — Create the file with exactly this content:

  ````markdown
  # Verify Task Prompt

  Prompt template dispatched to `verifier` subagents for a single plan task. Fill placeholders before sending. Do not add sections beyond what this template defines.

  ## Task Spec

  {TASK_SPEC}

  ## Acceptance Criteria

  {ACCEPTANCE_CRITERIA_WITH_VERIFY}

  ## Orchestrator Command Evidence

  The orchestrator has already executed every command-style `Verify:` recipe for this task and captured the exact command, exit status, stdout, and stderr. You MUST rely on this evidence for command-style recipes — do NOT re-run commands.

  {ORCHESTRATOR_COMMAND_EVIDENCE}

  If this section is empty, the task has no command-style recipes and all verification is via file inspection or prose inspection.

  ## Modified Files

  The task modified the following files. For file-inspection recipes, read only these files plus any files explicitly named by a recipe. Do not browse the codebase.

  {MODIFIED_FILES}

  ## Diff Context

  {DIFF_CONTEXT}

  ## Working Directory

  Operate from: `{WORKING_DIR}`

  All paths in this prompt are relative to that directory unless otherwise stated.

  ## Rules

  - You are judge-only. Do NOT run shell commands.
  - Do NOT read files outside `## Modified Files` unless a `Verify:` recipe explicitly names them by path.
  - Every criterion gets a binary verdict: `PASS` or `FAIL`. Any `FAIL` means the overall verdict is `FAIL`.
  - If evidence is missing, return `FAIL` with `reason:` explaining what is missing. Do not guess.

  ## Report Format

  Use this exact structure:

  ```
  ## Per-Criterion Verdicts

  [Criterion 1] <PASS | FAIL>
    recipe: <the Verify: recipe text>
    evidence: <command-evidence block number, file path + line range, or diff hunk>
    reason: <one or two sentences>

  [Criterion 2] <PASS | FAIL>
    recipe: ...
    evidence: ...
    reason: ...

  ## Overall Verdict

  VERDICT: <PASS | FAIL>
  summary: <one paragraph>
  ```
  ````

**Acceptance criteria:**
- The template defines the six required placeholders in fillable form.
  Verify: `grep -c "{TASK_SPEC}" agent/skills/execute-plan/verify-task-prompt.md`, `{ACCEPTANCE_CRITERIA_WITH_VERIFY}`, `{ORCHESTRATOR_COMMAND_EVIDENCE}`, `{MODIFIED_FILES}`, `{DIFF_CONTEXT}`, and `{WORKING_DIR}` each return at least 1.
- The template's Rules section states the four judge-only constraints (no shell, no extra reads, binary verdicts, `FAIL` on missing evidence) so the dispatched verifier sees them inline in the prompt.
  Verify: read the `## Rules` section of `agent/skills/execute-plan/verify-task-prompt.md` and confirm it contains all four rules — (1) "judge-only" / no shell commands, (2) no reads outside `## Modified Files` unless a recipe names the path, (3) binary `PASS`/`FAIL` with any `FAIL` forcing overall `FAIL`, and (4) return `FAIL` with `reason:` when evidence is missing (do not guess).
- The Report Format block shows per-criterion verdict blocks and a final `VERDICT:` line.
  Verify: read the `## Report Format` section and confirm it contains `[Criterion 1] <PASS | FAIL>` and `VERDICT: <PASS | FAIL>`.

**Model recommendation:** standard

### Task 8: Update Step 9 worker-status handling for typed concerns and wave-level pause

**Files:**
- Modify: `agent/skills/execute-plan/SKILL.md`

**Steps:**
- [ ] **Step 1: Read Step 9** — Open `agent/skills/execute-plan/SKILL.md` and locate the "## Step 9: Handle worker status codes" section (currently ~lines 408–418).
- [ ] **Step 2: Replace the `DONE_WITH_CONCERNS` bullet** — Replace the existing bullet:

  Old:
  ```
  - **DONE_WITH_CONCERNS** → read the concerns. Correctness/scope concerns must be addressed before verification; observations can be noted and execution continues.
  ```

  New:
  ```
  - **DONE_WITH_CONCERNS** → record the task's typed concerns as reported by the worker (`Type: correctness`, `Type: scope`, `Type: observation`). Do NOT resolve the checkpoint inline. Let the wave drain, then Step 9.7 presents a single combined wave-level concerns checkpoint for all `DONE_WITH_CONCERNS` tasks in the wave before Step 10 runs. A task whose concerns lack the `Type:` prefix is treated as a protocol violation: re-dispatch that task once to the same model with an additional prompt line reminding the worker to emit typed concerns; if the re-dispatch still returns untyped concerns, treat every untyped concern as `Type: correctness` for routing purposes.
  ```

- [ ] **Step 3: Add a pointer after the bullet list** — After the `BLOCKED` bullet and before "Never ignore an escalation…", insert a new paragraph:

  ```
  After the wave drains (i.e., every dispatched worker in the wave has returned and been classified), Step 9.5 runs first to handle any `BLOCKED` tasks. Step 9.7 then runs to handle any `DONE_WITH_CONCERNS` tasks. Only after both gates exit does Step 10 (verification) run.
  ```

**Acceptance criteria:**
- Step 9's `DONE_WITH_CONCERNS` bullet no longer resolves concerns inline and explicitly defers to Step 9.7.
  Verify: read the `## Step 9: Handle worker status codes` section of `agent/skills/execute-plan/SKILL.md` and confirm the `DONE_WITH_CONCERNS` bullet contains the substring "Step 9.7 presents a single combined wave-level concerns checkpoint".
- The handling for untyped concerns is defined as a one-shot re-dispatch + fallback to `Type: correctness`.
  Verify: read the same bullet and confirm it describes the re-dispatch reminder and the fallback treatment as `Type: correctness`.
- A post-list paragraph documents the gate order: drain → Step 9.5 (BLOCKED) → Step 9.7 (DONE_WITH_CONCERNS) → Step 10.
  Verify: `grep -n "Step 9.5 runs first" agent/skills/execute-plan/SKILL.md` returns a match inside or immediately after Step 9.

**Model recommendation:** standard

### Task 9: Add Step 9.7 — combined `DONE_WITH_CONCERNS` checkpoint

**Files:**
- Modify: `agent/skills/execute-plan/SKILL.md`

**Steps:**
- [ ] **Step 1: Locate the insertion point** — Open `agent/skills/execute-plan/SKILL.md` and find the line `## Step 10: Verify wave output`. The new Step 9.7 section is inserted immediately before this heading, immediately after the existing Step 9.5 block ends.
- [ ] **Step 2: Insert the Step 9.7 block** — Insert this content as a new section above Step 10:

  ````markdown
  ## Step 9.7: Wave-level concerns checkpoint

  Run this gate once per wave after Step 9.5 has exited (i.e., every wave task has a non-`BLOCKED` status). It sits between the blocked-task gate and Step 10 verification.

  **Purpose:** Surface every `DONE_WITH_CONCERNS` task in the wave as a single combined checkpoint, route each concern by its typed label, and either remediate/stop or explicitly acknowledge before verification runs. A wave that contains any `correctness` or `scope` concern cannot proceed directly into Step 10 verification.

  ### 1. Collect concerned tasks

  Collect the set `CONCERNED_TASKS` = every wave task whose most recent worker response is `DONE_WITH_CONCERNS`. If `CONCERNED_TASKS` is empty, skip this entire step and proceed to Step 10.

  For each task in `CONCERNED_TASKS`, parse the worker's `## Concerns / Needs / Blocker` section into typed concerns. Each line begins with `Type: correctness`, `Type: scope`, or `Type: observation`. Untyped concerns are treated as `Type: correctness` (per Step 9's fallback).

  ### 2. Present a single combined view

  Present one combined checkpoint covering every task in `CONCERNED_TASKS`. Do NOT interrupt as each worker returns — this gate only runs after the wave drains and Step 9.5 exits. The view MUST include:

  1. A header: `⚠️ Wave <N>: <count> task(s) reported DONE_WITH_CONCERNS. Verification paused.`
  2. Per task, a block with:
     - Task number and task title
     - Each concern, one line per concern, with its `Type:` label preserved verbatim
     - The files the task modified

  Example layout:

  ~~~
  ⚠️ Wave 3: 2 task(s) reported DONE_WITH_CONCERNS. Verification paused.

  [Task 5] Add baseline test capture
    Concerns:
      Type: correctness — not certain the baseline comparison handles flaky tests
      Type: observation — Step 7 is now 45 lines long
    Files: agent/skills/execute-plan/SKILL.md

  [Task 8] Wire verifier dispatch
    Concerns:
      Type: scope — the plan asked for a single verifier call per task but the current step runs one per criterion
    Files: agent/skills/execute-plan/SKILL.md
  ~~~

  ### 3. Per-task typed routing

  For each task in `CONCERNED_TASKS`, evaluate the task's concern types:

  - If the task has at least one `Type: correctness` OR `Type: scope` concern: present ONLY these choices for this task:
    ~~~
    Task <N>: <task_title> — correctness/scope concerns reported. Verification cannot proceed for this task until the concerns are resolved.
      (r) Remediate now   — re-dispatch this task to a `coder` with the concerns as additional context
      (x) Stop execution  — halt the plan; prior wave commits are preserved
    ~~~
  - If the task has ONLY `Type: observation` concerns: present these choices for this task:
    ~~~
    Task <N>: <task_title> — observation-only concerns reported. Verification may proceed after explicit acknowledgment.
      (a) Acknowledge and continue — record the observations and let verification run for this task
      (r) Remediate now             — re-dispatch this task to a `coder` with the observations as additional context
      (x) Stop execution            — halt the plan; prior wave commits are preserved
    ~~~

  Do NOT offer a silent "skip" or "ignore" option. Observations MUST be explicitly acknowledged — the checkpoint cannot flash by without a choice.

  ### 4. Act on the choices

  - **(r) Remediate now:** re-dispatch the task to a `coder` using the same dispatch shape as Step 8. Append a `## Concerns To Address` block to the worker prompt listing every concern (with `Type:` label preserved). On return, re-enter this gate with the new response (treat it as a fresh wave-member classification). Each re-dispatch counts toward the task's retry budget (see Step 12's 3-retry cap, shared with Step 9.5 and Step 10's verification retries).
  - **(a) Acknowledge and continue:** record the acknowledged observations in the run log and allow this task to proceed to Step 10. The acknowledgment is per-task — do not apply an acknowledgment for one task to any other task.
  - **(x) Stop execution:** halt the plan immediately; Step 10 and Step 11 do NOT run for this wave. Report partial progress via Step 13.

  If the user picks `(x) Stop execution` for ANY task, stop the whole plan regardless of outstanding choices for other tasks.

  ### 5. Gate exit

  Exit this gate only when every task in `CONCERNED_TASKS` has either:
  - received an `(a) Acknowledge and continue` choice (observation-only tasks), OR
  - been remediated to a subsequent `DONE` response (no more concerns), OR
  - been remediated to a subsequent `DONE_WITH_CONCERNS` response that the user handles on the next gate pass.

  A `correctness` or `scope` concern may never be "acknowledged and continued" — the only exits for such a task are remediation-to-DONE or stop. The gate does not exit successfully to Step 10 until every wave task is either `DONE` or `DONE_WITH_CONCERNS` with all concerns routed.
  ````

**Acceptance criteria:**
- `agent/skills/execute-plan/SKILL.md` contains a new `## Step 9.7: Wave-level concerns checkpoint` section placed between Step 9.5 and Step 10.
  Verify: `grep -n "^## Step " agent/skills/execute-plan/SKILL.md` shows `## Step 9.5`, `## Step 9.7`, `## Step 10` appearing in that order.
- The combined checkpoint presents all concerned tasks together in one view, not one-at-a-time interruptions.
  Verify: read the `### 2. Present a single combined view` subsection and confirm it states "Do NOT interrupt as each worker returns" and includes the multi-task example layout.
- Per-task menus differ by concern type: correctness/scope tasks get only `(r)` and `(x)`; observation-only tasks get `(a)`, `(r)`, `(x)`.
  Verify: read `### 3. Per-task typed routing` and confirm the correctness/scope menu has exactly `(r)` and `(x)` (no `(a)`) and the observation-only menu has exactly `(a)`, `(r)`, `(x)`.
- Correctness/scope concerns can never be silently acknowledged.
  Verify: read `### 5. Gate exit` and confirm it contains the sentence "A `correctness` or `scope` concern may never be \"acknowledged and continued\"".

**Model recommendation:** capable

### Task 10: Rewrite Step 10 to dispatch the fresh-context verifier

**Files:**
- Modify: `agent/skills/execute-plan/SKILL.md`

**Steps:**
- [ ] **Step 1: Read the existing Step 10** — Open `agent/skills/execute-plan/SKILL.md` and locate the section `## Step 10: Verify wave output` (currently ~lines 511–519). Note the existing `Precondition:` paragraph and the two subsections ("After each wave…" and "### Task verification").
- [ ] **Step 2: Replace the body of Step 10** — Replace everything between the `## Step 10: Verify wave output` heading and the next `## Step 11` heading (exclusive) with exactly:

  ````markdown
  ## Step 10: Verify wave output

  **Precondition:** Only run this step after both Step 9.5 (blocked-task escalation gate) and Step 9.7 (wave-level concerns checkpoint) have exited. If any wave task is still `BLOCKED`, return to Step 9.5. If any wave task has unresolved `correctness` or `scope` concerns, return to Step 9.7.

  Wave verification is performed by a fresh-context `verifier` subagent, one dispatch per task in the wave. The orchestrator does NOT self-grade acceptance criteria. Backward compatibility with plans that lack `Verify:` recipes is not supported — if a plan is missing `Verify:` lines, generate-plan review should have blocked it; at execute time, treat any criterion without a `Verify:` recipe as a protocol error and stop with: `Plan task <N> has an acceptance criterion without a Verify: recipe. Re-run generate-plan to regenerate the plan.`

  ### 1. Orchestrator collects command evidence

  For each wave task, parse its acceptance criteria. For every `Verify:` recipe that is a command-style recipe (any recipe whose `Verify:` line begins with an explicit command, e.g. `run \`...\``, `\`<cmd>\` returns ...`, etc.), the orchestrator MUST execute the command itself and capture:

  - the exact command string
  - the exit status
  - the relevant portion of stdout (see truncation rule below)
  - the relevant portion of stderr (see truncation rule below)

  **Truncation rule (applied independently to stdout and stderr):** If the stream is at most 200 lines AND at most 20 KB, capture it verbatim. Otherwise, capture deterministically: the first 100 lines, then a single marker line of the exact form `... [<total_lines> lines, <total_bytes> bytes; truncated to first 100 + last 50 lines] ...`, then the last 50 lines. Do not paraphrase, summarize with prose, or drop the marker line — the truncation must be mechanical and reproducible so the verifier can reason about what is and isn't present. A `Verify:` recipe whose success condition depends on content that would fall inside the omitted middle window must be rewritten (at plan time) to match on a deterministic anchor (exit code, a grep pattern that appears in the first 100 or last 50 lines, a count, etc.). The verifier is permitted — and required — to return `FAIL` with `reason: insufficient evidence` if a truncated capture omits the content needed to judge the criterion; it must never guess about the truncated window.

  Record each block as:

  ```
  [Criterion N] command: <exact command>
    exit: <status>
    stdout:
      <captured stdout, verbatim or deterministically truncated per rule above>
    stderr:
      <captured stderr, verbatim or deterministically truncated per rule above>
  ```

  The verifier does NOT run commands. This split is mandatory. File-inspection and prose-inspection recipes generate no evidence block — the verifier evaluates them directly by reading the task's modified files or the files named by the recipe.

  ### 2. Dispatch the verifier

  Read [verify-task-prompt.md](verify-task-prompt.md) once per wave (before dispatching). For each wave task, fill the placeholders:

  - `{TASK_SPEC}` — the full task text from the plan (name, Files, Steps, Acceptance criteria).
  - `{ACCEPTANCE_CRITERIA_WITH_VERIFY}` — the task's acceptance-criteria block verbatim (each criterion plus its `Verify:` line), with criteria numbered `[Criterion 1]`, `[Criterion 2]`, etc.
  - `{ORCHESTRATOR_COMMAND_EVIDENCE}` — the concatenation of every evidence block captured in §1 for this task. If the task has no command-style recipes, set this to `(none)`.
  - `{MODIFIED_FILES}` — the list of files the coder reported in its `## Files Changed` section.
  - `{DIFF_CONTEXT}` — uncommitted wave changes for the task's files, captured from the working tree against `HEAD`. Step 10 runs BEFORE Step 11's wave commit, so the wave's edits are still uncommitted; sourcing from `HEAD~1..HEAD` would describe a previous commit and `git diff --staged` would be empty (the orchestrator does not stage files before verification). Use `git diff HEAD -- <each modified file>` to capture the pending changes. If the file is newly created (untracked), include its full contents via `git diff --no-index /dev/null -- <file>` (or equivalent) so the verifier sees the new file's content. Concatenate all per-file diffs into a single block.
  - `{WORKING_DIR}` — the absolute path to the working directory (worktree path or project root).

  Dispatch:

  ```
  subagent { agent: "verifier", task: "<filled template>", model: "<resolved>", dispatch: "<resolved>" }
  ```

  **Verifier model tier:**
  - Default: `standard` from `~/.pi/agent/model-tiers.json`.
  - If the verified task was itself executed at the `capable` tier, dispatch the verifier at `capable` instead.

  Resolve the dispatch target the same way as in Step 6 (provider prefix → dispatch map, default `"pi"`).

  Run all wave verifications in parallel (subject to `MAX_PARALLEL_TASKS`).

  ### 3. Handle verifier verdicts

  For each verifier response:

  - Parse the `## Per-Criterion Verdicts` section and the final `VERDICT:` line. Each per-criterion header matches the exact shape `[Criterion N] <PASS | FAIL>` — i.e., the bracketed index followed by exactly one of the literal tokens `PASS` or `FAIL`, with no `verdict:` prefix or other words in between. If any per-criterion header or the final `VERDICT:` line does not match this shape, treat the response as malformed, record it as a protocol error, and route the task into Step 12's retry loop just like a `VERDICT: FAIL`.
  - If `VERDICT: PASS`, mark the task as verified for this wave.
  - If `VERDICT: FAIL`, the task is treated as failed for this wave. Feed it into Step 12's retry loop — this is identical to any other failed task output. Step 12's per-task 3-retry budget applies; a retry here dispatches the `coder` again with the verifier's failed-criterion reasons appended as a `## Verification Findings` block in the worker prompt.

  Acceptance criteria are binary: if ANY single criterion returned `FAIL`, the overall `VERDICT` is `FAIL` and the task is not verified. Do not try to partially accept a task.

  ### 4. Gate exit

  Exit this step only when every wave task has `VERDICT: PASS`. Step 11 does not run until every task is verified. If Step 12's retry budget is exhausted for a task, the user's only choices are retry-again or stop — there is no "skip" path (see Step 12).
  ````

**Acceptance criteria:**
- Step 10 no longer contains the old "orchestrator reads the code and checks criteria directly" sentence and instead dispatches the `verifier` agent.
  Verify: `grep -n "orchestrator reads the code and checks criteria directly" agent/skills/execute-plan/SKILL.md` returns no matches, AND `grep -n "agent: \"verifier\"" agent/skills/execute-plan/SKILL.md` returns at least one match inside Step 10.
- The orchestrator/verifier split is explicit: orchestrator runs command-style recipes and captures evidence; verifier evaluates file/prose recipes and reads evidence blocks without running commands.
  Verify: read Step 10.1 and 10.2 and confirm §1's header is "Orchestrator collects command evidence" and §2 states "The verifier does NOT run commands."
- Verifier model tier defaults to `standard` and upgrades to `capable` when the verified task itself ran at `capable`.
  Verify: read the `**Verifier model tier:**` block in Step 10.2 and confirm both rules are stated literally.
- Per-criterion verdicts are binary; any `FAIL` fails the task and routes it into Step 12 retry handling.
  Verify: read Step 10.3 and confirm it contains "Acceptance criteria are binary" and routes `VERDICT: FAIL` into Step 12's retry loop.
- Step 10.3 locks down the exact per-criterion header shape `[Criterion N] <PASS | FAIL>` and treats non-conforming verifier output as a protocol error routed through Step 12's retry loop.
  Verify: read Step 10.3 and confirm it states the per-criterion header must match `[Criterion N] <PASS | FAIL>` with no `verdict:` prefix and explicitly instructs the orchestrator to route malformed responses into Step 12 like a `VERDICT: FAIL`.
- Missing `Verify:` recipes at execute time cause a protocol-error stop, not a silent pass.
  Verify: read Step 10's precondition block and confirm it contains the exact literal `Plan task <N> has an acceptance criterion without a Verify: recipe. Re-run generate-plan to regenerate the plan.`
- `{DIFF_CONTEXT}` is sourced from the working tree against `HEAD` (uncommitted wave changes), not from `HEAD~1..HEAD` or `--staged`, because Step 10 runs before Step 11's wave commit and the orchestrator does not stage files before verification.
  Verify: `grep -n "git diff HEAD --" agent/skills/execute-plan/SKILL.md` returns at least one match inside Step 10.2's `{DIFF_CONTEXT}` bullet, AND `grep -n "git diff HEAD~1..HEAD" agent/skills/execute-plan/SKILL.md` returns no matches inside Step 10.
- Step 10 captures the relevant portion of stdout/stderr (not unconditionally "full"), with a deterministic truncation rule that preserves the first 100 and last 50 lines plus a marker line when a stream exceeds 200 lines or 20 KB, and instructs the verifier to return `FAIL` with `reason: insufficient evidence` when the needed content falls in the truncated window.
  Verify: `grep -n "full, not truncated" agent/skills/execute-plan/SKILL.md` returns no matches inside Step 10; read Step 10.1 and confirm it contains a `Truncation rule` block that states the 200-line / 20 KB threshold, prescribes "first 100 lines", a marker line of the form `... [<total_lines> lines, <total_bytes> bytes; truncated to first 100 + last 50 lines] ...`, and "last 50 lines", and explicitly says the verifier must return `FAIL` with `reason: insufficient evidence` when a truncated capture omits content needed to judge the criterion.

**Model recommendation:** capable

### Task 11: Rewrite Step 11 integration handling — three-set tracking and "Defer integration debugging"

**Files:**
- Modify: `agent/skills/execute-plan/SKILL.md`

**Steps:**
- [ ] **Step 1: Read the existing Step 11** — Open `agent/skills/execute-plan/SKILL.md` and locate `## Step 11: Post-wave commit and integration tests` (currently through the `Debugger-first flow` subsection). Note the `(a) Debug failures / (b) Skip tests / (c) Stop execution` menu.
- [ ] **Step 2: Update Step 11's precondition paragraph** — In the precondition block at the top of Step 11, add: `If any wave task has unresolved \`correctness\` or \`scope\` concerns from Step 9.7, or any wave task returned \`VERDICT: FAIL\` from Step 10, do not commit and do not run integration tests for the wave — return to the appropriate gate.`
- [ ] **Step 3: Replace the "Compare against baseline" + menu block** — Replace the existing `Compare against baseline` paragraph, the `On pass:` paragraph, and the `On fail:` fenced prompt block (through `(c) Stop execution ...`) with:

  ````markdown
  **Three-set integration tracking.** While a run is active, the orchestrator maintains three disjoint sets:

  - `baseline_failures` — tests that failed in the Step 7 baseline capture (pre-existing). Never modified after Step 7.
  - `deferred_integration_regressions` — tests that started failing during this execution and for which the user chose `Defer integration debugging` in an intermediate wave. Added to on deferment; removed either (i) by the post-wave reconciliation step below when a deferred test is no longer in the current failing set, or (ii) when the user runs the debugging flow and tests come back green.
  - `new_regressions_after_deferment` — the set of tests that are failing in the just-completed wave AND are neither in `baseline_failures` nor in the reconciled `deferred_integration_regressions`. This set is recomputed and stored fresh every wave (see the assignment step below). It is empty when the wave's failures are fully explained by baseline and deferred regressions; it is populated when the wave introduced new failing tests. On `(b) Defer integration debugging`, its contents are moved into `deferred_integration_regressions` and the set is cleared. On `(a) Debug failures`, tests that come back green are removed from it (and from `deferred_integration_regressions` if they were there too).

  **Reconciliation (runs after every post-wave integration test run, before pass/fail classification).** Given `current_failing` = the set of tests failing in the just-completed run:

  1. Remove from `deferred_integration_regressions` every test that is NOT in `current_failing`. Rationale: a deferred regression that is no longer failing has been incidentally resolved by later work and must not continue to block final completion. Log each removed test name so the user can see which deferrals auto-cleared this wave.
  2. Do NOT modify `baseline_failures` — it is frozen at Step 7 and never reconciled.
  3. **Assign `new_regressions_after_deferment`.** Compute and store, overwriting any prior value:

     ```
     new_regressions_after_deferment := current_failing \ (baseline_failures ∪ deferred_integration_regressions)
     ```

     (i.e., every test currently failing that is not in the Step 7 baseline and not in the reconciled deferred set). This assignment is the single authoritative source for "new regressions in this wave" — the user-facing report, the pass/fail classification below, and the `(a)` / `(b)` menu actions all consume this named set. `new_regressions_after_deferment` is empty when no new regressions were introduced this wave (including when there have been no deferments yet and the wave is clean) and non-empty when the wave introduced at least one new failing test (regardless of whether a prior deferment exists — the "after_deferment" naming reflects that the set excludes already-deferred regressions, not that a deferment must have occurred).

  Only after the reconciliation step (including the `new_regressions_after_deferment` assignment), classify the wave:

  - **Pass:** `new_regressions_after_deferment` is empty. Equivalently, `current_failing` ⊆ `baseline_failures` ∪ `deferred_integration_regressions` (after reconciliation). No new failing tests. Proceed to the next wave.
  - **Fail (new regressions):** `new_regressions_after_deferment` is non-empty. Its contents are the new regressions reported to the user and acted on by the menu.

  **User-facing report.** When integration tests are not clean, present three separate sections with explicit headings — never collapse them. The third section is rendered verbatim from `new_regressions_after_deferment`:

  ~~~
  ❌ Integration tests failed after wave <N>.

  ## Baseline failures
  <tests in baseline_failures, or "(none)">

  ## Deferred integration regressions
  <tests in deferred_integration_regressions, or "(none)">

  ## New regressions in this wave
  <tests in new_regressions_after_deferment, or "(none)">
  ~~~

  Always print all three headings, even when one set is empty — the user should see which set is which.

  **Menu (intermediate waves — not the final wave):**

  ~~~
  Options:
  (a) Debug failures                — dispatch a systematic-debugging pass, then remediate (counts as a retry toward Step 12's 3-retry cap)
  (b) Defer integration debugging   — proceed to wave <N+1>. The tests in `new_regressions_after_deferment` are added to `deferred_integration_regressions`.
                                       Remaining waves may continue, but final completion is BLOCKED until these regressions are resolved.
  (c) Stop execution                — halt plan execution; committed waves are preserved as checkpoints
  ~~~

  - **(a) Debug failures:** run the `Debugger-first flow` subsection below. On success, for each test that comes back green, remove it from `new_regressions_after_deferment` and from `deferred_integration_regressions` (if it was there too). On failure, re-present this menu. `new_regressions_after_deferment` must be recomputed per the reconciliation step (including its Step 3 assignment) on the next wave's test run.
  - **(b) Defer integration debugging:** union every test in `new_regressions_after_deferment` into `deferred_integration_regressions`, then clear `new_regressions_after_deferment` to the empty set. Proceed to the next wave. Warn:
    ```
    ⚠️ Deferred <count> integration regression(s). Final completion will be blocked until they are resolved.
    Deferred tests:
      <test names>
    ```
  - **(c) Stop execution:** halt. Step 13 reports partial progress and includes the current contents of all three sets.

  **Final-wave menu — different rules:** If this is the last wave (no further waves remain), REMOVE the `(b) Defer integration debugging` option from the menu. Present only:

  ~~~
  Options:
  (a) Debug failures   — dispatch a systematic-debugging pass, then remediate
  (c) Stop execution   — halt plan execution; committed waves are preserved as checkpoints
  ~~~

  Rationale: deferring integration debugging is only meaningful when another wave will run afterward. On the final wave, deferral is a no-op that would defeat the final-completion gate in Step 15.
  ````

- [ ] **Step 4: Keep the `Debugger-first flow` subsection intact** — Do not edit the `### Debugger-first flow` subsection beyond replacing the single bullet that referenced the old `(a)/(b)/(c)` menu. Specifically, in step 3 of the Debugger-first flow, change the phrase `re-present the (a)/(b)/(c) choices to the user` to `re-present the integration-failure menu (intermediate-wave or final-wave form) to the user`.

**Acceptance criteria:**
- Step 11 explicitly defines three tracked sets and states the disjointness / transition rules.
  Verify: `grep -n "baseline_failures" agent/skills/execute-plan/SKILL.md` AND `grep -n "deferred_integration_regressions" agent/skills/execute-plan/SKILL.md` AND `grep -n "new_regressions_after_deferment" agent/skills/execute-plan/SKILL.md` each return at least one match inside Step 11.
- Step 11 specifies a reconciliation rule that runs after every post-wave integration test run and removes any test from `deferred_integration_regressions` that is no longer in the current failing set, before pass/fail classification.
  Verify: read Step 11 and confirm the `Reconciliation` block (or equivalently-named block) is present, states it runs "after every post-wave integration test run, before pass/fail classification", says "Remove from `deferred_integration_regressions` every test that is NOT in `current_failing`", and explicitly notes that `baseline_failures` is NOT reconciled.
- Step 11's reconciliation includes an explicit step that assigns `new_regressions_after_deferment := current_failing \ (baseline_failures ∪ deferred_integration_regressions)`, defines when the set is empty vs populated, and names it as the authoritative source for the user-facing "New regressions in this wave" section, the pass/fail classification, and the `(a)`/`(b)` menu actions.
  Verify: read Step 11's Reconciliation block and confirm (a) it contains the literal assignment `new_regressions_after_deferment := current_failing \ (baseline_failures ∪ deferred_integration_regressions)` (or a visually-equivalent form using the same set-difference operator and the same set names); (b) the pass/fail classification directly references `new_regressions_after_deferment` (pass = empty, fail = non-empty); (c) the "New regressions in this wave" section in the user-facing report is described as rendered from `new_regressions_after_deferment`; (d) the `(b) Defer integration debugging` bullet references `new_regressions_after_deferment` as the source set and states that it is cleared to empty after the union into `deferred_integration_regressions`.
- The user-facing failure report shows three separately-headed sections with exact headings `Baseline failures`, `Deferred integration regressions`, `New regressions in this wave`.
  Verify: read Step 11's "User-facing report" block and confirm the three headings appear verbatim; also confirm the instruction "Always print all three headings, even when one set is empty" is present.
- The intermediate-wave menu uses "Defer integration debugging" (not "Skip tests") and spells out that final completion is blocked until resolved.
  Verify: `grep -n "Skip tests" agent/skills/execute-plan/SKILL.md` returns no matches; `grep -n "Defer integration debugging" agent/skills/execute-plan/SKILL.md` returns at least one match inside Step 11; the menu copy includes the phrase "final completion is BLOCKED".
- The final-wave menu removes the defer option and presents only `(a) Debug failures` and `(c) Stop execution`.
  Verify: read the `**Final-wave menu — different rules:**` block and confirm it explicitly instructs removing `(b) Defer integration debugging` on the final wave and shows a menu with only `(a)` and `(c)`.
- The Debugger-first flow's menu-reentry phrasing is updated to reference the new menu form.
  Verify: read `### Debugger-first flow` step 3 and confirm it contains the phrase "re-present the integration-failure menu (intermediate-wave or final-wave form)" and does not contain `(a)/(b)/(c)` with the old "Skip tests" semantics.

**Model recommendation:** capable

### Task 12: Remove "skip failed task" from Step 12

**Files:**
- Modify: `agent/skills/execute-plan/SKILL.md`

**Steps:**
- [ ] **Step 1: Read Step 12** — Open `agent/skills/execute-plan/SKILL.md` and locate `## Step 12: Handle failures and retries`.
- [ ] **Step 2: Replace the three-choice block** — Replace the current three user-facing bullets (`Retry again …`, `Skip the failed task …`, `Stop the entire plan`) with a two-choice block:

  ```markdown
  2. If still failing after 3 retries, **notify the user at the end of the wave** and ask:
     - Retry again (optionally with a different model or more context). This resets the per-task 3-retry budget for that task.
     - Stop the entire plan. Committed waves are preserved as checkpoints; Step 13 reports partial progress.

  There is no "skip the failed task" option. Step 10's verifier may have returned `VERDICT: FAIL`; that failure is handled identically to any other failed task output — it is not a candidate for skip. If the user chooses to stop, Step 13 runs.
  ```

- [ ] **Step 3: Update the pacing-note paragraph** — Replace the existing bullet that says `(not offered for tasks currently in \`BLOCKED\` state — see Step 9.5)` reference. Since we are removing the skip option entirely, remove the parenthetical and the whole skip bullet; leave only the retry and stop bullets (already handled in Step 2). Also update the final paragraph to read:

  ```markdown
  Apply wave pacing from Step 3. These options only govern the cadence of waves that contain no `BLOCKED` results. If the wave contains any `BLOCKED` results, Step 9.5 has already paused execution and presented the combined escalation; if the wave contains any unresolved `correctness`/`scope` concerns, Step 9.7 has already paused. Pacing does not apply to those pauses.

  - **(a)** Always pause and report before the next wave starts
  - **(b)** Never pause; collect all failures and report at the very end
  - **(c)** Pause only when a wave produced failures; otherwise auto-continue

  Under any of (a), (b), or (c), a wave that contains at least one `BLOCKED` task, at least one unresolved correctness/scope concern, or at least one `VERDICT: FAIL` from Step 10 is NOT eligible to be "collected and reported at the end" — the blocker is surfaced via the appropriate gate before the next wave starts.
  ```

- [ ] **Step 4: Scrub stale skip references from Step 9.5** — Locate the paragraph inside `## Step 9.5` (the one that begins "Each pass through the gate counts toward the per-task retry budget…") and replace the two sentences that reference Step 12's now-removed skip branch so Step 9.5 is consistent with the no-skip policy. Specifically:

  Old sentence 1 (to remove/rewrite):
  ```
  When a task exhausts its retry budget while still reporting `BLOCKED`, the gate does NOT defer to Step 12's generic "skip the failed task" branch — "skip" is not a valid exit from a `BLOCKED` state, because skipping would leave the wave with a permanently-unresolved blocker, and the spec forbids treating such a wave as successfully completed.
  ```
  Replacement:
  ```
  When a task exhausts its retry budget while still reporting `BLOCKED`, "skip" is not a valid exit — Step 12 no longer offers a skip branch for any task, and skipping would leave the wave with a permanently-unresolved blocker, which the spec forbids treating as successfully completed.
  ```

  Old sentence 2 (to remove/rewrite):
  ```
  If Step 12's automatic retry logic would otherwise offer "skip" for a task that is `BLOCKED` (as opposed to generically failing), present the user with only "retry with different model/context" (which re-enters this gate's §4 intervention menu) and "stop the entire plan" — never a silent skip.
  ```
  Replacement:
  ```
  When Step 12's post-retry prompt would otherwise surface for a task that is `BLOCKED`, route the prompt through this gate's §4 intervention menu instead: present only "retry with different model/context" (re-enters §4) and "stop the entire plan" — matching Step 12's two-choice menu and never offering a silent skip.
  ```

  The surrounding sentences in that paragraph (retry-budget accounting, "only ways out of this gate", gate exit semantics) are unchanged.

**Acceptance criteria:**
- Step 12 no longer offers a user-facing option to skip a failed task.
  Verify: `grep -ni "skip the failed task" agent/skills/execute-plan/SKILL.md` returns no matches anywhere in the file; `grep -ni "skip" agent/skills/execute-plan/SKILL.md` does not return any match within the `## Step 12` section that offers skipping a task as a user choice.
- The post-retry menu contains only retry-oriented and stop choices.
  Verify: read `## Step 12: Handle failures and retries` and confirm the numbered list item 2 lists exactly two choices: "Retry again" and "Stop the entire plan". No third "skip" bullet is present.
- Step 12 explicitly states that verifier `VERDICT: FAIL` is routed through the same failure handling (no skip path).
  Verify: read Step 12 and confirm the paragraph after the retry/stop block contains the sentence "There is no \"skip the failed task\" option." and explicitly mentions `VERDICT: FAIL`.
- The pacing paragraph references both Step 9.5 (blocked) and Step 9.7 (correctness/scope concerns) as gates that bypass pacing.
  Verify: read Step 12's pacing paragraph and confirm it mentions both Step 9.5 and Step 9.7.
- Step 9.5 no longer references Step 12's removed "skip the failed task" branch, and its retry-budget paragraph is consistent with the no-skip policy.
  Verify: `grep -n "Step 12's generic \"skip the failed task\" branch" agent/skills/execute-plan/SKILL.md` returns no matches, `grep -n "Step 12's automatic retry logic would otherwise offer \"skip\"" agent/skills/execute-plan/SKILL.md` returns no matches, AND reading the paragraph that begins "Each pass through the gate counts toward the per-task retry budget" in `## Step 9.5` shows it now states that Step 12 no longer offers a skip branch and routes a blocked task's post-retry prompt through §4's intervention menu with only retry and stop choices.

**Model recommendation:** standard

### Task 13: Gate final completion on deferred integration regressions (Step 15)

**Files:**
- Modify: `agent/skills/execute-plan/SKILL.md`

**Steps:**
- [ ] **Step 1: Read Step 15** — Open `agent/skills/execute-plan/SKILL.md` and locate `## Step 15: Complete`.
- [ ] **Step 2: Insert a new gating sub-step at the very top of Step 15** — Before `### 1. Move plan to done`, insert:

  ````markdown
  ### 0. Deferred integration regression gate

  Before any completion action (moving the plan to `done/`, closing the linked todo, or invoking branch completion):

  1. Re-run the full integration test suite one final time. Let `current_failing` be the resulting failing set.
  2. Apply the Step 11 reconciliation rule against `deferred_integration_regressions`: remove any test from `deferred_integration_regressions` that is NOT in `current_failing`. This ensures deferred regressions that were incidentally fixed by later waves no longer block completion.
  3. Let `still_failing_deferred` = `deferred_integration_regressions` ∩ `current_failing` (i.e. deferred regressions that are still failing after reconciliation). This is the set the gate operates on — the raw `deferred_integration_regressions` set after reconciliation is identical to `still_failing_deferred`, but the plan uses the explicit name to make the gating rule unambiguous.

  Then gate on `still_failing_deferred`:

  - If `still_failing_deferred` is empty: proceed to `### 1. Move plan to done`.
  - If `still_failing_deferred` is non-empty: STOP completion. Do NOT move the plan file, do NOT close the linked todo, and do NOT invoke `finishing-a-development-branch`.

  Present this user-facing block:

  ~~~
  ⚠️ Final completion blocked: <count> deferred integration regression(s) are still failing.

  Still-failing deferred integration regressions:
    <test names from still_failing_deferred>

  Options:
  (a) Debug failures now — run the Step 11 debugger-first flow against the deferred regressions; on success, re-enter this gate.
  (c) Stop execution     — halt without moving the plan or closing the todo. Prior wave commits remain as checkpoints.
  ~~~

  - **(a) Debug failures now:** dispatch the Debugger-first flow (see Step 11's `### Debugger-first flow` subsection) against `still_failing_deferred`. On success, remove the resolved tests from `deferred_integration_regressions` and re-enter this gate (which will re-run the suite, re-reconcile, and recompute `still_failing_deferred`). If `still_failing_deferred` becomes empty, proceed to `### 1. Move plan to done`. If debugging fails, re-present this menu.
  - **(c) Stop execution:** halt. Call Step 13 to report partial progress, and include `deferred_integration_regressions` verbatim in the stop summary under the heading `Deferred integration regressions (unresolved)`. Do not mark the plan done. Do not close the todo. Do not run branch completion. Persistence of `deferred_integration_regressions` across a later resume is out of scope — see Step 13 note.

  This gate is the only path into `### 1. Move plan to done` when deferred regressions existed at any point in the run.
  ````

- [ ] **Step 3: Update Step 13 for deferred-regression reporting** — In `## Step 13: Report partial progress`, append:

  ```markdown
  - If `deferred_integration_regressions` is non-empty at the moment execution stops, include a dedicated section in the stop summary:

    ~~~
    ## Deferred integration regressions (unresolved)
    - <test name>
    - <test name>
    ...
    ~~~

    Persistence/restoration of `deferred_integration_regressions` across a later resume is out of scope. The set is not written to disk; if the plan is resumed in a later session, the user must re-run the integration tests to determine the current failure set.
  ```

**Acceptance criteria:**
- Step 15 contains a new `### 0. Deferred integration regression gate` that runs before `### 1. Move plan to done`.
  Verify: read `## Step 15: Complete` and confirm the first `###` heading is `### 0. Deferred integration regression gate` and the second is `### 1. Move plan to done`.
- The gate re-runs the integration suite, applies the Step 11 reconciliation rule, computes `still_failing_deferred`, and gates on that subset (not the raw `deferred_integration_regressions` set as accumulated over the run).
  Verify: read the `### 0` block and confirm it includes (a) a step to re-run the integration test suite and capture `current_failing`, (b) a reconciliation step that removes tests not in `current_failing` from `deferred_integration_regressions`, and (c) an explicit definition of `still_failing_deferred = deferred_integration_regressions ∩ current_failing` used for the gate decision.
- The gate blocks plan-move, todo-close, and branch-completion only while `still_failing_deferred` is non-empty.
  Verify: read the `### 0` block and confirm the non-empty branch explicitly gates on `still_failing_deferred` (not the raw deferred set) and states "do NOT move the plan file, do NOT close the linked todo, and do NOT invoke `finishing-a-development-branch`".
- The gate offers only debug-now or stop-execution outcomes.
  Verify: read the user-facing block inside `### 0` and confirm the options are exactly `(a) Debug failures now` and `(c) Stop execution` (no `(b)`, no "proceed anyway").
- Step 13 reports deferred regressions under an explicit heading and states persistence is out of scope.
  Verify: read `## Step 13: Report partial progress` and confirm it contains the literal heading `## Deferred integration regressions (unresolved)` in its example block and the sentence "Persistence/restoration of `deferred_integration_regressions` across a later resume is out of scope."

**Model recommendation:** standard

### Task 14: Update README to describe the hardened flow

**Files:**
- Modify: `README.md`

**Steps:**
- [ ] **Step 1: Read the README's execute-plan sections** — Open `README.md` and locate two spots: (i) the narrative "5. Execute in waves." and "6. Verify and commit each wave." bullets in "### How it works in practice"; (ii) the ASCII flowchart's `Verify wave` + `Commit wave + run tests` nodes.
- [ ] **Step 2: Rewrite bullet 5 ("Execute in waves")** — Replace bullet 5 with:

  ```markdown
  5. **Execute in waves.** The `execute-plan` skill decomposes tasks into dependency-ordered waves and dispatches `coder` subagents **in parallel** — up to 8 tasks per wave (the `MAX_PARALLEL_TASKS` cap; larger waves are split into sequential sub-waves). Each worker gets a self-contained prompt (filled from `execute-task-prompt.md`) with the task spec, plan context, and TDD instructions. Workers report structured status codes (`DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, `BLOCKED`). `DONE_WITH_CONCERNS` concerns are explicitly typed (`Type: correctness`, `Type: scope`, `Type: observation`); after a wave drains, the orchestrator pauses at a single combined concerns checkpoint that routes correctness/scope concerns to remediate-or-stop and requires explicit acknowledgment of observation-only concerns before verification proceeds.
  ```

- [ ] **Step 3: Rewrite bullet 6 ("Verify and commit each wave")** — Replace bullet 6 with:

  ```markdown
  6. **Verify and commit each wave.** After a wave completes, a fresh-context `verifier` subagent judges each task against its acceptance criteria and `Verify:` recipes (per-criterion `PASS`/`FAIL` + overall task verdict — any single `FAIL` fails the task). The orchestrator runs command-style recipes itself and hands the verifier the captured evidence; the verifier reads files for inspection-style recipes and never runs shell. A checkpoint commit is made, then integration tests run against the pre-recorded baseline. Three sets are tracked: baseline failures, deferred integration regressions, and new regressions in the current wave — each presented under its own heading when tests are not clean. Users may `Defer integration debugging` on intermediate waves to keep running, but final completion is blocked until deferred regressions are resolved. Task failures and verifier `VERDICT: FAIL` cannot be skipped; the only post-retry choices are retry-again or stop.
  ```

- [ ] **Step 4: Update the flowchart nodes** — In the ASCII flowchart, change:

  - `│ Verify wave   │   ← acceptance criteria check` to `│ Verify wave   │   ← fresh-context verifier`
  - `│ Commit wave   │   ← checkpoint commit` and `│ + run tests   │   ← integration tests vs. baseline` — append a line after these two showing the three-set tracking:

  The final block should read:

  ```text
                       ┌───────────────┐
                       │ Verify wave   │   ← fresh-context verifier
                       └───────┬───────┘
                               │
                               ▼
                       ┌───────────────┐
                       │ Commit wave   │   ← checkpoint commit
                       │ + run tests   │   ← baseline / deferred /
                       │               │     new-regression tracking
                       └───────┬───────┘
  ```

**Acceptance criteria:**
- README bullet 5 documents typed `DONE_WITH_CONCERNS` and the combined concerns checkpoint.
  Verify: open `README.md` and confirm the "5. **Execute in waves.**" paragraph mentions `Type: correctness`, `Type: scope`, `Type: observation`, and a combined concerns checkpoint.
- README bullet 6 documents the fresh-context verifier, three-set integration tracking, "Defer integration debugging" semantics, and removal of the skip-task option.
  Verify: open `README.md` and confirm the "6. **Verify and commit each wave.**" paragraph mentions a fresh-context `verifier` subagent, "three sets", "Defer integration debugging", and the phrase "cannot be skipped".
- The flowchart reflects the verifier terminology and three-set tracking.
  Verify: locate the flowchart and confirm the `Verify wave` node annotation reads `← fresh-context verifier` and the `Commit wave + run tests` block's annotation references baseline / deferred / new-regression tracking.

**Model recommendation:** standard

## Dependencies

- Task 1 depends on: (none)
- Task 2 depends on: (none)
- Task 3 depends on: (none)
- Task 4 depends on: (none)
- Task 5 depends on: (none)
- Task 6 depends on: (none)
- Task 7 depends on: Task 6 (verifier agent must exist before the prompt template references its contract)
- Task 8 depends on: Task 4, Task 5 (Step 9 text refers to typed concerns defined in coder.md and execute-task-prompt.md)
- Task 9 depends on: Task 4, Task 5, Task 8 (Step 9.7 parses typed concerns and is ordered after Step 9's changes; same-file serialization with Task 8)
- Task 10 depends on: Task 6, Task 7, Task 9 (Step 10 dispatches the verifier via the prompt template; same-file serialization with Task 9)
- Task 11 depends on: Task 10 (Step 11 precondition references Step 10's verdict; same-file serialization with Task 10)
- Task 12 depends on: Task 11 (Step 12's pacing paragraph references Step 9.5 and Step 9.7 gates established upstream; same-file serialization with Task 11)
- Task 13 depends on: Task 11, Task 12 (Step 15 gate reads `deferred_integration_regressions` from Step 11; same-file serialization with Task 12 — Task 12 edits the same `agent/skills/execute-plan/SKILL.md` file, so Task 13 must not run in parallel with it)
- Task 14 depends on: Task 9, Task 10, Task 11, Task 12, Task 13 (README cross-references all the execute-plan changes)

Effective waves (respecting the single-file serialization on `agent/skills/execute-plan/SKILL.md` for Tasks 8–13):

- **Wave 1 (parallel, 6 tasks):** Task 1, Task 2, Task 3, Task 4, Task 5, Task 6
- **Wave 2 (1 task):** Task 7
- **Wave 3 (1 task):** Task 8
- **Wave 4 (1 task):** Task 9
- **Wave 5 (1 task):** Task 10
- **Wave 6 (1 task):** Task 11
- **Wave 7 (1 task):** Task 12
- **Wave 8 (1 task):** Task 13
- **Wave 9 (1 task):** Task 14

The serialization on `SKILL.md` is mandatory: parallel edits to the same file would race and leave the section order inconsistent.

## Risk Assessment

- **Risk: The new `verifier` agent drifts into general-purpose review and starts running commands or reading unrelated files.** Mitigation: Tasks 6 and 7 hard-code the rules ("Do NOT run shell commands", "Do NOT read files outside `## Modified Files`"), and the verifier frontmatter (Task 6) omits `bash` from the tool list, which is enforced by the harness. If a future change wants verifier freedom, it must touch both the agent frontmatter and the prompt template.
- **Risk: Workers continue to emit untyped `DONE_WITH_CONCERNS` and break Step 9.7 routing.** Mitigation: Task 8's Step 9 change defines an explicit fallback — re-dispatch once with a reminder, then treat remaining untyped concerns as `Type: correctness` (the strictest routing). This avoids a silent pass while absorbing occasional worker protocol drift.
- **Risk: Step 11's three-set tracking is only in-memory and lost on stop/resume.** Mitigation: explicitly called out as a non-goal in the spec and documented in Task 13 (Step 13 note). On resume, the user re-runs the test command to determine the current failing set.
- **Risk: Same-file serialization on `SKILL.md` stretches execution time.** Mitigation: Wave 1 parallelizes the six independent-file tasks; the serial chain (Tasks 7–13) is unavoidable because `SKILL.md` is a single narrative document and parallel edits would race.
- **Risk: Older plans in `.pi/plans/` lack `Verify:` recipes and will fail Step 10's precondition.** Mitigation: the spec explicitly rules out backward compatibility. Task 10's precondition prints a clear error message naming the offending task and instructing the user to re-generate the plan. Older plans currently in-flight should be completed under the old rules before these changes land, or regenerated.
- **Risk: `grep`-based acceptance checks in this plan match text inside the plan itself (since plan tasks include literal strings like "Verify:", "Type: correctness", etc.).** Mitigation: each `Verify:` recipe in this plan names the target artifact explicitly (e.g., `grep -n "Type: correctness" agent/agents/coder.md`) so the verifier will read and judge the correct file, not this plan file.

## Review Notes

_Added by plan reviewer — informational, not blocking._

### Warnings
- _(none currently open — previous warnings on Task 10's evidence-capture rule, Task 12's stale Step 9.5 references, and the Task 6 / Task 7 per-criterion header mismatch have been addressed in earlier edit passes.)_
- _Task 11's previous gap — `new_regressions_after_deferment` being defined but never operationalized — has been addressed: the reconciliation block now contains an explicit assignment step for that set, and the user-facing report, pass/fail classification, and `(a)`/`(b)` menu actions all reference it by name._
- _The most recent edit pass addressed three follow-up findings: (1) the File Structure summary for `agent/skills/execute-plan/SKILL.md` now lists Step 9.5 and Step 13 as modified (by Tasks 12 and 13 respectively); (2) Task 14's README rewrite now says "up to 8 tasks per wave" to match `MAX_PARALLEL_TASKS` in `SKILL.md` rather than conflicting with it; (3) Tasks 6 and 7's cross-file acceptance criteria were rewritten to be self-contained to the single file each task modifies, so the checks can't silently pass while the paired artifact drifts._
