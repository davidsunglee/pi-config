# Move Heavy Caller-Side Work in execute-plan to Subagents

**Source:** TODO-b943cf24
**Spec:** .pi/specs/2026-04-30-execute-plan-caller-side-subagents.md

## Goal

Reduce the work the `execute-plan` caller performs personally so it primarily orchestrates, dispatches, and aggregates. Two specific classes of caller-side work move off the caller: (1) integration test execution at baseline capture (Step 7), post-wave runs (Step 12.2), the Step 12 Debugger-first flow's success re-test, and the Step 16 final integration regression gate — moved to a new thin `test-runner` subagent that runs the suite and returns the raw set of failing-test identifiers via an artifact-based handoff; and (2) per-task verifier command-evidence collection (Step 11.1) — folded into the existing `verifier` agent as an explicit phase-1 evidence-collection step so each task is verified in a single dispatch instead of an evidencer-then-verifier pair. The caller continues to own all cross-wave state, the integration regression model's reconciliation arithmetic, the user-facing menus and summaries, and the existing dispatch / commit / wave-gate orchestration.

## Architecture summary

Two artifact-based subagent handoffs replace four classes of in-caller heavyweight work:

1. **`test-runner` subagent (new).** A thin agent with `bash, write, read` that receives a test command + working directory + an absolute write path, executes the command, captures full stdout/stderr/exit code, applies the Step 7 identifier-extraction contract, and writes a structured artifact (header + raw run output) to the supplied path. Its `finalMessage` ends with `TEST_RESULT_ARTIFACT: <absolute path>` per the same anchored-marker discipline used by the reviewer-artifact contract. The caller validates marker + path-equality + non-empty + parseable header, then reads the failing-identifier set out of the header and feeds it into the integration regression model (caller-owned). The agent is stateless across calls — it never sees `baseline_failures` or `deferred_integration_regressions` and never classifies pass/fail. Artifacts live under `.pi/test-runs/<plan-name>/` with phase-distinct, run-distinct filenames (`baseline.log`, `wave-<N>-attempt-<K>.log`, `final-gate-<seq>.log`).

2. **`verifier` agent extension (modify).** The existing judge-only verifier becomes two-phase. Phase 1 (evidence collection) runs every command-style `Verify:` recipe byte-equal verbatim from the working directory using the newly-added `bash` tool, applies the per-stream 200-line / 20 KB truncation rule, and emits `[Evidence for Criterion N]` blocks with the exact byte-for-byte format Step 11.1 produces today. Phase 2 (judgment) returns per-criterion `[Criterion N] PASS/FAIL` + `VERDICT: PASS/FAIL` using only the Phase 1 evidence (for command-style criteria) or files in `## Verifier-Visible Files` plus recipe-named files (for file/prose-inspection criteria). A hard recipe-verbatim discipline rule encodes "may run only command-style `Verify:` recipe text byte-equal verbatim, never anything else, never re-run after capture" — replacing the prior tool-surface no-bash guarantee with prompt-encoded discipline. The output report shape (`## Per-Criterion Verdicts` + `## Overall Verdict`) is unchanged byte-for-byte so SKILL.md Step 11.3's parser is unaffected.

3. **SKILL.md changes.** Step 11.1 ("Orchestrator collects command evidence") is removed in full; the truncation rule and `[Evidence for Criterion N]` block format relocate into the verifier agent definition / prompt template. Step 11.2 verifier dispatch model tier becomes `crossProvider.standard` (replacing the prior `standard` default + `capable` upgrade rule). Step 7, Step 12.2, the Step 12 Debugger-first re-test, and Step 16 each replace caller-side test-command shell with `test-runner` dispatch + artifact readback + reconciliation against caller-owned state. The reconciliation algorithm, three-section user-facing summary, and Step 12 / Step 16 menus are unchanged. Step 16's `### 1. Move plan to done` adds a per-plan `.pi/test-runs/<plan-name>/` cleanup; every `(c) Stop execution` exit path leaves the directory in place. Net SKILL.md size is constrained to `<=` current line count.

The reconciliation arithmetic, three tracked sets (`baseline_failures`, `deferred_integration_regressions`, `new_regressions_after_deferment`), wave gate (Step 10), retry budget (Step 13), partial-progress reporting (Step 14), refine-code interaction (Step 15), and branch-completion handoff (Step 16's final sub-step) all stay caller-side and unchanged. The verifier-visible-files three-source union construction (Step 11.2) and the `{MODIFIED_FILES}` / `{DIFF_CONTEXT}` assembly (including the 500-line / 40 KB diff-truncation rule) remain caller-side and unchanged. The reviewer-artifact contract in `refine-code` and `refine-plan` is unchanged.

## Tech stack

- Markdown agent definitions with YAML frontmatter under `agent/agents/`
- Markdown skill definitions and prompt templates under `agent/skills/execute-plan/`
- JSON model matrix at `agent/model-tiers.json` (synced to `~/.pi/agent/model-tiers.json` at runtime)
- pi-interactive-subagent extension's `subagent_run_serial` / `subagent_run_parallel` orchestration calls with explicit `model` and `cli` per dispatch
- `MAX_PARALLEL_HARD_CAP = 8` parallel-dispatch ceiling (referenced; not modified)
- TypeScript test suite at `agent/extensions/` runs via `npm test --prefix agent` — markdown-only changes will not affect it; running it confirms no extension sources were touched accidentally

## File Structure

- `agent/agents/test-runner.md` (Create) — New thin-runner agent definition. Tools `bash, write, read`. Charter: receive test command + working dir + artifact write path, execute command, capture stdout/stderr/exit code, extract failing-test identifiers per Step 7 contract, write structured-header + raw-output artifact, emit final anchored line `TEST_RESULT_ARTIFACT: <absolute path>`. Explicitly NOT responsible for: reconciliation, pass/fail classification, consulting `baseline_failures` / `deferred_integration_regressions`.
- `agent/skills/execute-plan/test-runner-prompt.md` (Create) — Task-prompt template the orchestrator fills with `{TEST_COMMAND}`, `{WORKING_DIR}`, `{ARTIFACT_PATH}`, `{PHASE_LABEL}` placeholders before dispatching `test-runner`. Documents the structured artifact-header format the agent must produce and the final-line marker discipline.
- `agent/agents/verifier.md` (Modify) — Tool surface gains `bash` (final list: `read, grep, find, ls, bash`). Body restructured into explicit Phase 1 (evidence collection per command-style recipe) and Phase 2 (judgment) sections. Adds the recipe-verbatim discipline hard rule, the per-stream 200-line / 20 KB truncation rule, and the `[Evidence for Criterion N]` block format. Output report format (`## Per-Criterion Verdicts` with `[Criterion N] PASS/FAIL` headers; `## Overall Verdict` with `VERDICT: PASS/FAIL`) is preserved byte-for-byte.
- `agent/skills/execute-plan/verify-task-prompt.md` (Modify) — Replaces the `## Orchestrator Command Evidence` section (with `{ORCHESTRATOR_COMMAND_EVIDENCE}` placeholder) with a `## Phase 1 Verification Recipes` section listing the command-style `Verify:` recipes the verifier must execute in phase 1, numbered to match the criterion index in `{ACCEPTANCE_CRITERIA_WITH_VERIFY}`. `{TASK_SPEC}`, `{ACCEPTANCE_CRITERIA_WITH_VERIFY}`, `{MODIFIED_FILES}`, `{DIFF_CONTEXT}`, `{WORKING_DIR}` placeholders unchanged. Output `## Report Format` section unchanged byte-for-byte.
- `agent/skills/execute-plan/SKILL.md` (Modify) — Step 11.1 removed in full. Step 11.2 verifier dispatch tier becomes `crossProvider.standard` (replacing `standard`+capable-upgrade); template-fill block updated to use the new `{PHASE_1_RECIPES}` placeholder rather than `{ORCHESTRATOR_COMMAND_EVIDENCE}`; Step 11.3 protocol-error routing gains entries for verifier-with-bash phase-1 failure modes (malformed evidence block, missing evidence for command-style criterion, discipline violation). Step 7 baseline capture, Step 12.2 post-wave run, Step 12 Debugger-first re-test, and Step 16 final-gate runs each replace in-caller test-command shell with `test-runner` dispatch + artifact readback. Step 16 `### 1. Move plan to done` adds `.pi/test-runs/<plan-name>/` cleanup. Stop-execution exit paths in Step 10, Step 12, Step 13, Step 15, Step 16 explicitly preserve the directory.

`agent/model-tiers.json` already contains `crossProvider.cheap` (`"openai-codex/gpt-5.4-mini"`); no edit required for this work. Confirmed at plan-write time; if it goes missing before execution, Task 1 below will add it.

## Tasks

### Task 1: Confirm `crossProvider.cheap` in model matrix

**Files:**
- Modify (conditional): `agent/model-tiers.json`

**Steps:**

- [ ] **Step 1: Read `agent/model-tiers.json`.** Open the file and confirm the JSON is valid and parseable.
- [ ] **Step 2: Confirm `crossProvider.cheap` is present.** Locate the `crossProvider` object. Confirm it has a `cheap` key with a non-empty string value (currently `"openai-codex/gpt-5.4-mini"`). If present, no edit is needed — proceed to Step 4.
- [ ] **Step 3: Add `crossProvider.cheap` only if missing.** If and only if `crossProvider.cheap` is absent, add the entry `"cheap": "openai-codex/gpt-5.4-mini"` to the `crossProvider` object, preserving JSON formatting (4-space indentation, trailing commas only where existing entries have them). Re-read the file to confirm the JSON still parses.
- [ ] **Step 4: Confirm `dispatch["openai-codex"]` is present.** The `crossProvider.cheap` value uses the `openai-codex` provider prefix. Verify the top-level `dispatch` object maps `openai-codex` to a non-empty CLI string (currently `"pi"`). Do NOT modify `dispatch` — if missing, escalate via the report.
- [ ] **Step 5: Self-verify the file.** `python3 -c "import json; json.load(open('agent/model-tiers.json'))"` exits 0. The keys `crossProvider.cheap`, `crossProvider.standard`, and `dispatch.openai-codex` are all present and non-empty.

**Acceptance criteria:**

- `agent/model-tiers.json` contains a non-empty `crossProvider.cheap` string value, and the JSON parses cleanly.
  Verify: run `python3 -c "import json,sys; m=json.load(open('agent/model-tiers.json')); v=m['crossProvider']['cheap']; sys.exit(0 if isinstance(v,str) and v else 1)"` from the working directory and confirm exit code 0.
- The `dispatch` object maps `openai-codex` to a non-empty string, so `crossProvider.cheap` resolves to a real CLI.
  Verify: run `python3 -c "import json,sys; m=json.load(open('agent/model-tiers.json')); v=m['dispatch']['openai-codex']; sys.exit(0 if isinstance(v,str) and v else 1)"` and confirm exit code 0.

**Model recommendation:** cheap

---

### Task 2: Create `agent/agents/test-runner.md`

**Files:**
- Create: `agent/agents/test-runner.md`

**Steps:**

- [ ] **Step 1: Begin the file with YAML frontmatter as the very first content.** No leading comments, blank lines, or other content before the opening `---`. Use these exact frontmatter fields:

  ```
  ---
  name: test-runner
  description: Thin runner subagent that executes a test command from a supplied working directory, captures stdout/stderr/exit code, extracts failing-test identifiers per the Step 7 identifier-extraction contract, writes a structured artifact, and emits a TEST_RESULT_ARTIFACT marker. Stateless across calls; performs no reconciliation and no pass/fail classification.
  tools: bash, write, read
  thinking: low
  session-mode: lineage-only
  spawning: false
  ---
  ```

- [ ] **Step 2: Add the agent charter.** Open with the same kind of opening paragraph used by `agent/agents/verifier.md`: a single sentence stating the role, then a paragraph confirming no parent-session context and listing what the agent is and is NOT responsible for. Specifically include the explicit non-goals: (a) no reconciliation, (b) no pass/fail classification, (c) no consultation of `baseline_failures` / `deferred_integration_regressions` / any other cross-wave state, (d) no debugging or source-file edits.

- [ ] **Step 3: Add an `## Input Contract` section** describing the four placeholders the orchestrator supplies in the task prompt (matching the template in Task 3): `## Test Command`, `## Working Directory`, `## Artifact Output Path`, `## Phase Label`. Document that all four are mandatory.

- [ ] **Step 4: Add an `## Execution` section** stating the steps the agent performs in order:
  1. `cd` to `## Working Directory`.
  2. Execute `## Test Command` exactly as supplied via `bash`, capturing stdout, stderr, and exit code into one combined run-output stream (`bash -c '<command> 2>&1'`).
  3. Apply the Step 7 identifier-extraction contract to the run-output stream to derive the set of failing-test identifiers (the same byte-equal contract used in `agent/skills/execute-plan/SKILL.md` Step 7's `#### Identifier-extraction contract`). Inline the rule text verbatim in this agent definition so the agent does not need to read the SKILL file at runtime: suite-native unique per-test identifier verbatim, no normalization, raw-line fallback when no per-test identifier is available, deduplicated set, never silently drop a failure.
  4. Write the artifact to `## Artifact Output Path` using a single `write` call (no append, no later overwrite). Format the file as documented in Step 5 below.
  5. Emit `TEST_RESULT_ARTIFACT: <absolute path>` as the LAST line of the final assistant message (a single anchored line on its own line, character-for-character identical to `## Artifact Output Path`). No other structured markers anywhere in the response.

- [ ] **Step 5: Add an `## Artifact Format` section** with the exact on-disk format for the artifact file, matching this structure byte-for-byte:

  ```
  PHASE: <phase label, e.g. baseline | wave-2-attempt-1 | final-gate-3>
  COMMAND: <exact test command string supplied in ## Test Command>
  WORKING_DIRECTORY: <absolute working directory supplied in ## Working Directory>
  EXIT_CODE: <integer exit code>
  TIMESTAMP: <ISO-8601 UTC timestamp captured at run start, e.g. 2026-04-30T18:42:11Z>
  FAILING_IDENTIFIERS_COUNT: <integer N>
  FAILING_IDENTIFIERS:
  <identifier 1>
  <identifier 2>
  ...
  <identifier N>
  END_FAILING_IDENTIFIERS

  --- RAW RUN OUTPUT BELOW ---
  <full combined stdout+stderr captured from the run, byte-for-byte, no truncation>
  ```

  Constraints to call out in the agent definition:
  - The first non-empty line MUST be `PHASE: ...`.
  - Lines `PHASE`, `COMMAND`, `WORKING_DIRECTORY`, `EXIT_CODE`, `TIMESTAMP`, `FAILING_IDENTIFIERS_COUNT`, `FAILING_IDENTIFIERS:`, and `END_FAILING_IDENTIFIERS` MUST appear in this exact order, each on its own line.
  - Each identifier MUST appear on its own line between `FAILING_IDENTIFIERS:` and `END_FAILING_IDENTIFIERS`. If `FAILING_IDENTIFIERS_COUNT` is `0`, the section is empty (no lines between the markers).
  - The marker line `--- RAW RUN OUTPUT BELOW ---` separates the structured header from the full raw run output, which is appended verbatim with no truncation.
  - The agent does NOT truncate the raw output at the artifact level; the truncation rules described in SKILL.md apply to caller-side reading, not artifact writing.

- [ ] **Step 6: Add a `## Rules` section** that mandates:
  - Run `## Test Command` exactly as supplied — do NOT add flags, expand variables, paraphrase, or split commands.
  - Run from `## Working Directory` only.
  - Perform exactly ONE write to `## Artifact Output Path` per dispatch.
  - Do NOT consult or mention `baseline_failures`, `deferred_integration_regressions`, prior runs, or any cross-wave state.
  - Do NOT classify the run as pass/fail. Reconciliation is the caller's responsibility.
  - Do NOT modify any source file; do NOT run `git` commands; do NOT run any command other than the supplied `## Test Command`.
  - Final assistant message ends with `TEST_RESULT_ARTIFACT: <absolute path>` and contains no other structured markers (no `STATUS:`, no other anchored lines).

- [ ] **Step 7: Add an `## Output Contract` section** restating the final-line marker discipline: the agent's `finalMessage` ends with exactly one anchored line `TEST_RESULT_ARTIFACT: <absolute path>` where `<absolute path>` is character-for-character identical to `## Artifact Output Path`. Conversational text before the marker is permitted; the orchestrator anchors on the LAST `^TEST_RESULT_ARTIFACT: (.+)$` line of `finalMessage`.

- [ ] **Step 8: Self-review.** Re-read the file end-to-end and confirm: (a) frontmatter is the very first content, (b) `tools:` is exactly `bash, write, read`, (c) the artifact format header order is documented, (d) the `Rules` section forbids reconciliation / pass-fail classification / consulting cross-wave state, (e) the marker line discipline is stated.

**Acceptance criteria:**

- `agent/agents/test-runner.md` exists, begins with YAML frontmatter as the very first content, and the frontmatter declares `name: test-runner` and `tools: bash, write, read` exactly.
  Verify: run `head -n 8 agent/agents/test-runner.md` and confirm the first line is `---`, that `name: test-runner` and `tools: bash, write, read` appear before the closing `---`, and no content precedes the opening `---`.
- The agent body documents the artifact format header in the order PHASE, COMMAND, WORKING_DIRECTORY, EXIT_CODE, TIMESTAMP, FAILING_IDENTIFIERS_COUNT, FAILING_IDENTIFIERS:, END_FAILING_IDENTIFIERS, then the `--- RAW RUN OUTPUT BELOW ---` separator.
  Verify: run `grep -n -E '^(PHASE|COMMAND|WORKING_DIRECTORY|EXIT_CODE|TIMESTAMP|FAILING_IDENTIFIERS_COUNT|FAILING_IDENTIFIERS:|END_FAILING_IDENTIFIERS|--- RAW RUN OUTPUT BELOW ---)' agent/agents/test-runner.md` and confirm all nine tokens appear in the listed order.
- The agent body forbids reconciliation, pass/fail classification, and consulting `baseline_failures` / `deferred_integration_regressions`.
  Verify: open `agent/agents/test-runner.md` and confirm the `## Rules` section contains a sentence forbidding reconciliation, a sentence forbidding pass/fail classification, and a sentence naming `baseline_failures` and `deferred_integration_regressions` as state the agent must not consult.
- The agent body specifies the final-line marker `TEST_RESULT_ARTIFACT: <absolute path>` and instructs the agent to emit no other structured markers.
  Verify: run `grep -n 'TEST_RESULT_ARTIFACT' agent/agents/test-runner.md` and confirm at least one match documenting the marker as the LAST line of the final assistant message; open the file and confirm the `## Output Contract` (or equivalently-named section) states "no other structured markers" or equivalent prohibition.
- The agent body inlines the Step 7 identifier-extraction contract verbatim (suite-native unique per-test identifier verbatim, no normalization, raw-line fallback for un-named failures), so the agent does not need to read SKILL.md at runtime.
  Verify: run `grep -nE 'suite-native|verbatim|no normalization|raw[- ]line fallback' agent/agents/test-runner.md` and confirm at least three of these phrasings appear in or near a documented identifier-extraction section.

**Model recommendation:** standard

---

### Task 3: Create `agent/skills/execute-plan/test-runner-prompt.md`

**Files:**
- Create: `agent/skills/execute-plan/test-runner-prompt.md`

**Steps:**

- [ ] **Step 1: Open the file with a brief intro paragraph.** Mirror the shape of `verify-task-prompt.md`'s intro: one sentence saying this is the prompt template dispatched to `test-runner` subagents; one sentence stating that callers fill placeholders before sending and add no sections beyond what the template defines.

- [ ] **Step 2: Add the input sections.** Use these exact level-2 headings in this exact order:

  ```
  ## Test Command

  {TEST_COMMAND}

  ## Working Directory

  {WORKING_DIR}

  ## Artifact Output Path

  {ARTIFACT_PATH}

  ## Phase Label

  {PHASE_LABEL}
  ```

  Each section contains exactly one placeholder. Do NOT add prose between the heading and the placeholder.

- [ ] **Step 3: Add a `## Task` section that summarizes what the agent must do.** Three short paragraphs that refer to the input sections by their heading name (NOT by literal placeholder token, so the `{TEST_COMMAND}`, `{WORKING_DIR}`, `{ARTIFACT_PATH}`, and `{PHASE_LABEL}` placeholder tokens stay confined to their own input sections and appear exactly once each in the file):
  1. Run the test command from `## Test Command` exactly as supplied, from the directory in `## Working Directory`, via `bash`. Capture combined stdout+stderr and the exit code.
  2. Apply the Step 7 identifier-extraction contract (per the verbatim documentation in your agent definition) to derive the set of failing-test identifiers. Use the suite-native unique per-test identifier verbatim, no normalization, raw-line fallback for un-named failures, deduplicated set.
  3. Write the artifact exactly once to the path in `## Artifact Output Path` using the format documented in your agent definition (`## Artifact Format`), with the value from `## Phase Label` filled into the `PHASE:` header line. Do NOT modify any other file. Do NOT run `git`, `mkdir`, or any other command beyond the supplied test command. The orchestrator has already created the parent directory for the artifact path.

- [ ] **Step 4: Add a `## Output` section** stating: "End your final assistant message with exactly one anchored line on its own line, as the very last line of your output: `TEST_RESULT_ARTIFACT: <absolute path>` where `<absolute path>` is character-for-character identical to the path in `## Artifact Output Path`. Do not emit any other structured markers in your response." Refer to the input section by its heading name; do NOT include the literal `{ARTIFACT_PATH}` placeholder token anywhere in this `## Output` section.

- [ ] **Step 5: Add a `## Rules` section** restating, as bullets, the forbidden behaviors mirrored from the agent definition: no reconciliation, no pass/fail classification, no consultation of cross-wave state, no source-file edits, no `git` commands, no commands other than the test command from `## Test Command`, exactly one write to the path in `## Artifact Output Path`. Refer to the input sections by their heading names; do NOT include the literal `{TEST_COMMAND}` or `{ARTIFACT_PATH}` placeholder tokens anywhere in this `## Rules` section.

- [ ] **Step 6: Self-review.** Confirm the placeholders `{TEST_COMMAND}`, `{WORKING_DIR}`, `{ARTIFACT_PATH}`, `{PHASE_LABEL}` each appear exactly once in the file.

**Acceptance criteria:**

- `agent/skills/execute-plan/test-runner-prompt.md` exists and contains exactly one occurrence each of the placeholders `{TEST_COMMAND}`, `{WORKING_DIR}`, `{ARTIFACT_PATH}`, `{PHASE_LABEL}`.
  Verify: run `grep -c -F '{TEST_COMMAND}' agent/skills/execute-plan/test-runner-prompt.md`, `grep -c -F '{WORKING_DIR}' agent/skills/execute-plan/test-runner-prompt.md`, `grep -c -F '{ARTIFACT_PATH}' agent/skills/execute-plan/test-runner-prompt.md`, `grep -c -F '{PHASE_LABEL}' agent/skills/execute-plan/test-runner-prompt.md` and confirm each prints exactly `1`.
- The level-2 section order is `## Test Command` → `## Working Directory` → `## Artifact Output Path` → `## Phase Label` → `## Task` → `## Output` → `## Rules`.
  Verify: run `grep -n -E '^## ' agent/skills/execute-plan/test-runner-prompt.md` and confirm the headings appear in this exact order with no extra level-2 headings inserted between them.
- The `## Output` section requires the agent to end its final message with `TEST_RESULT_ARTIFACT: <absolute path>` matching the path supplied in `## Artifact Output Path` byte-for-byte.
  Verify: open `agent/skills/execute-plan/test-runner-prompt.md` and confirm the `## Output` section contains the literal string `TEST_RESULT_ARTIFACT: <absolute path>` and instructs character-for-character identity between `<absolute path>` and the path supplied in the `## Artifact Output Path` section.

**Model recommendation:** cheap

---

### Task 4: Update `agent/agents/verifier.md` to support two-phase execution

**Files:**
- Modify: `agent/agents/verifier.md`

**Steps:**

- [ ] **Step 1: Update the frontmatter.** Open `agent/agents/verifier.md`. Change the `tools:` line from `tools: read, grep, find, ls` to exactly `tools: read, grep, find, ls, bash`. Update the `description:` field to reflect the two-phase model — replace the existing description text with: `Two-phase per-task verification for execute-plan. Phase 1: executes command-style Verify: recipes byte-equal verbatim and emits [Evidence for Criterion N] blocks. Phase 2: judges PASS/FAIL per criterion using only Phase 1 evidence (for command recipes) or Verifier-Visible Files (for file/prose recipes). Recipe-verbatim discipline is prompt-encoded.` Leave `thinking`, `session-mode`, and `spawning` unchanged.

- [ ] **Step 2: Replace the opening paragraphs.** The current body opens with "You are a verifier. ..." followed by a "You have no context ..." paragraph that asserts the agent cannot run shell commands. Replace these two paragraphs with this exact text:

  ```
  You are a verifier. You judge whether a single plan task actually meets its acceptance criteria. You operate in two phases per dispatch.

  You have no context from the orchestrator session. The orchestrator has assembled the criterion list, the file context, and the list of command-style `Verify:` recipes you must execute in Phase 1. Phase 2 then judges each criterion using only the evidence Phase 1 captured (for command-style criteria) or the files in `## Verifier-Visible Files` plus any files explicitly named by a recipe (for file-inspection / prose-inspection criteria). Use the `read`, `grep`, `find`, `ls` tools for file inspection; use `bash` only to execute command-style `Verify:` recipes during Phase 1, byte-equal verbatim, and never for any other purpose.
  ```

- [ ] **Step 3: Replace the `## Input Contract` section.** Remove the existing `## Orchestrator Command Evidence` bullet inside `## Input Contract`. Replace it with a `## Phase 1 Verification Recipes` bullet that documents:
  - This section lists the command-style `Verify:` recipes from the criterion list, numbered to match the criterion index in `## Acceptance Criteria`.
  - Each entry has the form `[Recipe for Criterion N] <recipe text>`.
  - If the section is empty, the task has no command-style recipes and Phase 1 produces no evidence blocks (proceed directly to Phase 2).
  Leave the `## Task Spec`, `## Acceptance Criteria`, `## Verifier-Visible Files`, `## Diff Context`, and `## Working Directory` bullets unchanged.

- [ ] **Step 4: Insert a new `## Phase 1 — Evidence Collection` section** immediately after `## Input Contract` and before the existing `## Rules` section. Use this exact body:

  ```
  ## Phase 1 — Evidence Collection

  For each entry in `## Phase 1 Verification Recipes`:

  1. Execute the recipe text BYTE-EQUAL VERBATIM via `bash` from `## Working Directory`. Do NOT add flags, expand variables, paraphrase, split, or transform the recipe text in any way.
  2. Capture exit code, stdout, and stderr separately.
  3. Apply the per-stream truncation rule (below) to stdout and stderr independently.
  4. Emit one evidence block in this exact format:

     ```
     [Evidence for Criterion N]
       command: <exact recipe text>
       exit_code: <integer>
       stdout:
         ```
         <captured stdout, possibly truncated per the rule below>
         ```
       stderr:
         ```
         <captured stderr, possibly truncated per the rule below>
         ```
     ```

     where `N` matches the criterion number from `## Acceptance Criteria`. Render the evidence blocks under a top-level `## Phase 1 Evidence` heading in your final response, before `## Per-Criterion Verdicts`. If no recipes are executed, omit the `## Phase 1 Evidence` heading entirely.

  5. Do NOT re-run a recipe after capturing its output. Each recipe runs exactly once per dispatch.

  ### Per-stream truncation rule

  Apply independently to stdout and stderr. If a single stream exceeds 200 lines OR 20 KB, truncate by keeping the FIRST 100 lines and the LAST 50 lines, separated by a single marker line that records the pre-truncation line count and byte count, e.g. `[<N> lines, <B> bytes; truncated to first 100 + last 50]`. Never combine streams for the threshold calculation. Never silently drop output. If the relevant evidence for a criterion falls inside the truncated window, mark the criterion FAIL with `reason: insufficient evidence (truncated stream)` in Phase 2 — do not guess.
  ```

- [ ] **Step 5: Insert a `## Phase 2 — Judgment` section** immediately after `## Phase 1 — Evidence Collection`. Use this exact body:

  ```
  ## Phase 2 — Judgment

  After Phase 1 has captured all evidence:

  - For each criterion whose `Verify:` recipe is command-style, judge PASS/FAIL using ONLY the evidence block captured for that criterion in Phase 1. Cite the block as `evidence: Evidence for Criterion N`. Do not re-run any command.
  - For each criterion whose `Verify:` recipe is file-inspection or prose-inspection, judge PASS/FAIL using files in `## Verifier-Visible Files` plus any files explicitly named by the recipe text. Cite the file path and line range as `evidence: <path>:<line range>` or the diff hunk as `evidence: diff hunk for <path>`. Do not run any command for these criteria.
  - If a recipe implies checking a file not in `## Verifier-Visible Files` and does not name it explicitly, return `FAIL` with `reason: recipe does not name the auxiliary file; plan author must add it to the Verify: recipe explicitly`.
  - If you cannot tell whether a criterion passes because the evidence is insufficient (including truncation per the Phase 1 rule), return `FAIL` with a `reason:` explaining what evidence is missing. Do NOT guess, do NOT infer.
  ```

- [ ] **Step 6: Replace the existing `## Rules` section** with a new version that adds the recipe-verbatim discipline as a hard rule. Use this exact body:

  ```
  ## Rules

  - Two-phase: collect command evidence in Phase 1, then judge in Phase 2. Do NOT interleave the phases (no judging mid-collection, no command runs after Phase 1 ends).
  - **Recipe-verbatim discipline (HARD RULE).** You MAY run commands ONLY when they exactly match a `Verify:` recipe text byte-equal from `## Phase 1 Verification Recipes`. You MUST NOT run any other commands (no probes, no exploratory runs, no cleanup, no environment inspection). You MUST NOT re-run a command after capturing its output in Phase 1. You MUST NOT add flags, expand variables, paraphrase, split commands, or otherwise transform the recipe text. This rule replaces the prior tool-surface no-bash guarantee with prompt-encoded discipline; any deviation is a protocol violation that the orchestrator will surface as `VERDICT: FAIL`.
  - Do NOT read files outside `## Verifier-Visible Files` unless a `Verify:` recipe explicitly names them. If a recipe implies checking a file not in `## Verifier-Visible Files` and doesn't name it, return `FAIL` with `reason: recipe does not name the auxiliary file; plan author must add it to the Verify: recipe explicitly`.
  - Do NOT re-derive the task's intent — judge strictly against the stated criterion and its stated `Verify:` recipe.
  - Binary verdicts: every criterion is either `PASS` or `FAIL`. There is no partial pass.
  - If ANY criterion is `FAIL`, the overall task verdict is `FAIL`.
  - If you cannot tell whether a criterion passes because the evidence is insufficient, return `FAIL` with a `reason:` explaining what evidence is missing. Do NOT guess, do NOT infer.
  ```

- [ ] **Step 7: Replace the `## Report Format` section** with one that renders Phase 1 evidence (when present) before per-criterion verdicts but preserves the existing per-criterion / overall-verdict format byte-for-byte. Use this exact body:

  ```
  ## Report Format

  Render your final response in this exact structure. The `## Phase 1 Evidence` block is omitted entirely when no command-style recipes ran. The `## Per-Criterion Verdicts` and `## Overall Verdict` sections always appear and their format is unchanged byte-for-byte from the legacy verifier output the orchestrator's parser depends on.

  ```
  ## Phase 1 Evidence

  [Evidence for Criterion N]
    command: <exact recipe text>
    exit_code: <integer>
    stdout:
      ```
      <captured>
      ```
    stderr:
      ```
      <captured>
      ```

  [Evidence for Criterion M]
    ...

  ## Per-Criterion Verdicts

  [Criterion 1] <PASS | FAIL>
    recipe: <the Verify: recipe text>
    evidence: <where you looked — Evidence for Criterion N, file path + line range, or diff hunk>
    reason: <one or two sentences explaining the verdict>

  [Criterion 2] <PASS | FAIL>
    recipe: ...
    evidence: ...
    reason: ...

  ## Overall Verdict

  VERDICT: <PASS | FAIL>
  summary: <one paragraph: which criteria failed (if any) and why>
  ```

  The per-criterion header syntax is `[Criterion N] <PASS | FAIL>` — one of the two literal tokens `PASS` or `FAIL` must appear directly after the bracketed number, with no extra words (no `verdict:` prefix) between them. The orchestrator's parser in SKILL.md Step 11.3 depends on this exact shape.

  If the overall verdict is `FAIL`, the orchestrator routes the task into its failure-handling loop. If `PASS`, the task is verified for this wave.
  ```

- [ ] **Step 8: Self-review the file end-to-end.** Confirm: (a) `tools:` line is `tools: read, grep, find, ls, bash` exactly; (b) `## Phase 1 — Evidence Collection`, `## Phase 2 — Judgment`, recipe-verbatim hard rule, per-stream truncation rule, and `[Evidence for Criterion N]` block format are all present; (c) `## Per-Criterion Verdicts` `[Criterion N] <PASS | FAIL>` and `## Overall Verdict` `VERDICT: <PASS | FAIL>` lines remain byte-equal to the legacy format. Confirm the strings `Do NOT run shell commands` and `Do NOT invoke bash, test, or build tools` no longer appear in the file (they are replaced by the recipe-verbatim hard rule).

**Acceptance criteria:**

- The frontmatter `tools:` line is exactly `tools: read, grep, find, ls, bash`.
  Verify: run `grep -n '^tools:' agent/agents/verifier.md` and confirm the single matching line reads exactly `tools: read, grep, find, ls, bash`.
- Two new sections `## Phase 1 — Evidence Collection` and `## Phase 2 — Judgment` exist, in that order, between `## Input Contract` and `## Rules`.
  Verify: run `grep -n -E '^(## Input Contract|## Phase 1 — Evidence Collection|## Phase 2 — Judgment|## Rules)' agent/agents/verifier.md` and confirm the headings appear in that exact relative order.
- The recipe-verbatim discipline appears as a hard rule in `## Rules`.
  Verify: run `grep -n -E 'Recipe-verbatim discipline|byte-equal verbatim' agent/agents/verifier.md` and confirm at least one match appears under the `## Rules` heading; open the file and confirm the matched bullet forbids running non-recipe commands AND forbids re-running a command after capturing its output.
- The `[Evidence for Criterion N]` block format and the per-stream 200-line / 20 KB truncation rule are documented in the agent body.
  Verify: open `agent/agents/verifier.md` and confirm the `## Phase 1 — Evidence Collection` section contains the literal `[Evidence for Criterion N]` token, the literal `command:`, `exit_code:`, `stdout:`, and `stderr:` field labels in that order, AND a paragraph stating "200 lines" and "20 KB" thresholds with "first 100" and "last 50" line preservation.
- The legacy no-bash assertions are removed.
  Verify: run `grep -n -E 'Do NOT run shell commands|Do NOT invoke bash, test, or build tools' agent/agents/verifier.md` and confirm zero matches.
- The output report format preserves `## Per-Criterion Verdicts` with `[Criterion N] <PASS | FAIL>` headers and `## Overall Verdict` with `VERDICT: <PASS | FAIL>` byte-for-byte.
  Verify: run `grep -n -F '[Criterion 1] <PASS | FAIL>' agent/agents/verifier.md` and `grep -n -F 'VERDICT: <PASS | FAIL>' agent/agents/verifier.md` and confirm both find at least one match inside the `## Report Format` block.

**Model recommendation:** capable

---

### Task 5: Update `agent/skills/execute-plan/verify-task-prompt.md` for two-phase verifier

**Files:**
- Modify: `agent/skills/execute-plan/verify-task-prompt.md`

**Steps:**

- [ ] **Step 1: Open the file.** Note: the placeholders `{TASK_SPEC}`, `{ACCEPTANCE_CRITERIA_WITH_VERIFY}`, `{MODIFIED_FILES}`, `{DIFF_CONTEXT}`, `{WORKING_DIR}` MUST remain unchanged in shape and section identity. Only the `## Orchestrator Command Evidence` section is replaced.

- [ ] **Step 2: Replace the entire `## Orchestrator Command Evidence` section** (heading + intro paragraph + `{ORCHESTRATOR_COMMAND_EVIDENCE}` placeholder + closing sentence) with a new `## Phase 1 Verification Recipes` section using exactly this body:

  ```
  ## Phase 1 Verification Recipes

  The orchestrator has extracted every command-style `Verify:` recipe from the `## Acceptance Criteria` section above and listed them below, numbered to match the criterion index in that section. In Phase 1 of your dispatch you MUST execute each recipe BYTE-EQUAL VERBATIM from `## Working Directory` via `bash`, capture stdout + stderr + exit code (per the per-stream 200-line / 20 KB truncation rule documented in your agent definition), and emit one `[Evidence for Criterion N]` block per recipe under a top-level `## Phase 1 Evidence` heading in your response.

  Recipe-verbatim discipline (per your agent definition): you MAY run commands ONLY when they exactly match a recipe text byte-equal from this section. You MUST NOT run any other commands. You MUST NOT re-run a command after capturing its output. You MUST NOT add flags, expand variables, or otherwise transform the recipe text.

  {PHASE_1_RECIPES}

  If this section is empty, the task has no command-style recipes — skip Phase 1 entirely and proceed to Phase 2 judgment using `## Verifier-Visible Files` and any files explicitly named by file-inspection / prose-inspection recipes.
  ```

  Important: the new prose above must NOT include the literal token `{ACCEPTANCE_CRITERIA_WITH_VERIFY}` anywhere. Refer to the section by its heading (`## Acceptance Criteria`) so the placeholder remains an exact-once occurrence in the file (preserved unchanged inside the existing `## Acceptance Criteria` section).

- [ ] **Step 3: Update the `## Rules` section** (later in the file). Replace the bullet `- You are judge-only. Do NOT run shell commands.` with this bullet:

  ```
  - Two-phase: in Phase 1 you MAY run bash, but ONLY to execute command-style `Verify:` recipes from `## Phase 1 Verification Recipes` byte-equal verbatim. In Phase 2 (judgment) you do NOT run any commands; you cite the Phase 1 evidence blocks for command-style criteria and read files in `## Verifier-Visible Files` (plus recipe-named files) for file-inspection / prose-inspection criteria.
  ```

  Leave the other `## Rules` bullets (`Do NOT read files outside …`, `Every criterion gets a binary verdict …`, `If evidence is missing, return FAIL …`) unchanged.

- [ ] **Step 4: Update the `## Report Format` section** to render `## Phase 1 Evidence` before `## Per-Criterion Verdicts`. Replace the existing fenced report-format example with this exact one:

  ```
  ## Phase 1 Evidence

  [Evidence for Criterion N]
    command: <exact recipe text>
    exit_code: <integer>
    stdout:
      ```
      <captured>
      ```
    stderr:
      ```
      <captured>
      ```

  ## Per-Criterion Verdicts

  [Criterion 1] <PASS | FAIL>
    recipe: <the Verify: recipe text>
    evidence: <Evidence for Criterion N, file path + line range, or diff hunk>
    reason: <one or two sentences>

  [Criterion 2] <PASS | FAIL>
    recipe: ...
    evidence: ...
    reason: ...

  ## Overall Verdict

  VERDICT: <PASS | FAIL>
  summary: <one paragraph>
  ```

  Add one sentence above the fenced block: "Omit the `## Phase 1 Evidence` heading entirely when no command-style recipes ran. The `## Per-Criterion Verdicts` and `## Overall Verdict` sections always appear and their format is unchanged byte-for-byte."

- [ ] **Step 5: Self-verify.** Confirm: (a) `{ORCHESTRATOR_COMMAND_EVIDENCE}` no longer appears anywhere in the file; (b) `{PHASE_1_RECIPES}` appears exactly once; (c) `{TASK_SPEC}`, `{ACCEPTANCE_CRITERIA_WITH_VERIFY}`, `{MODIFIED_FILES}`, `{DIFF_CONTEXT}`, `{WORKING_DIR}` each appear exactly once; (d) `[Criterion 1] <PASS | FAIL>` and `VERDICT: <PASS | FAIL>` lines exist in the report-format block.

**Acceptance criteria:**

- `{ORCHESTRATOR_COMMAND_EVIDENCE}` is removed from the file and `{PHASE_1_RECIPES}` is present exactly once.
  Verify: run `grep -c -F '{ORCHESTRATOR_COMMAND_EVIDENCE}' agent/skills/execute-plan/verify-task-prompt.md` and confirm it prints `0`; run `grep -c -F '{PHASE_1_RECIPES}' agent/skills/execute-plan/verify-task-prompt.md` and confirm it prints `1`.
- The five preserved placeholders `{TASK_SPEC}`, `{ACCEPTANCE_CRITERIA_WITH_VERIFY}`, `{MODIFIED_FILES}`, `{DIFF_CONTEXT}`, `{WORKING_DIR}` each appear exactly once and their section headings are unchanged.
  Verify: for each placeholder, run `grep -c -F '{TASK_SPEC}' agent/skills/execute-plan/verify-task-prompt.md`, `grep -c -F '{ACCEPTANCE_CRITERIA_WITH_VERIFY}' agent/skills/execute-plan/verify-task-prompt.md`, `grep -c -F '{MODIFIED_FILES}' agent/skills/execute-plan/verify-task-prompt.md`, `grep -c -F '{DIFF_CONTEXT}' agent/skills/execute-plan/verify-task-prompt.md`, `grep -c -F '{WORKING_DIR}' agent/skills/execute-plan/verify-task-prompt.md` and confirm each prints exactly `1`.
- The `## Phase 1 Verification Recipes` section instructs the verifier to execute recipes byte-equal verbatim and to emit `[Evidence for Criterion N]` blocks numbered to match the criterion numbering in the `## Acceptance Criteria` section.
  Verify: open `agent/skills/execute-plan/verify-task-prompt.md` and confirm the `## Phase 1 Verification Recipes` section contains the literal phrase `byte-equal verbatim` (or equivalently `BYTE-EQUAL VERBATIM`) AND the literal token `[Evidence for Criterion N]` AND a sentence cross-referencing the criterion numbering in the `## Acceptance Criteria` section (the section heading, NOT the placeholder token `{ACCEPTANCE_CRITERIA_WITH_VERIFY}`).
- The `## Per-Criterion Verdicts` and `## Overall Verdict` sections in the `## Report Format` block remain unchanged byte-for-byte from the legacy template.
  Verify: run `grep -n -F '[Criterion 1] <PASS | FAIL>' agent/skills/execute-plan/verify-task-prompt.md` and `grep -n -F 'VERDICT: <PASS | FAIL>' agent/skills/execute-plan/verify-task-prompt.md` and confirm each finds at least one match inside the `## Report Format` block.

**Model recommendation:** standard

---

### Task 6: Rewrite `agent/skills/execute-plan/SKILL.md` Step 11 for the two-phase verifier

**Files:**
- Modify: `agent/skills/execute-plan/SKILL.md`

**Steps:**

- [ ] **Step 1: Open `agent/skills/execute-plan/SKILL.md` and locate Step 11.** It currently spans approximately lines 462–526 and is structured as: `## Step 11: Verify wave output` (intro + protocol-error stop), `### Step 11.1: Orchestrator collects command evidence`, `### Step 11.2: Dispatch the verifier`, `### Step 11.3: Parse verifier output and gate the wave`. The goal of this task is to remove `### Step 11.1` in full, restructure `### Step 11.2`'s template-fill block and verifier-model-tier rule, and extend `### Step 11.3`'s protocol-error routing to cover Phase 1 evidence-block failures.

- [ ] **Step 2: Delete `### Step 11.1` in full.** Remove the heading `### Step 11.1: Orchestrator collects command evidence` and every line in that subsection up to (but not including) the heading `### Step 11.2: Dispatch the verifier`. The deleted region includes the four-bullet description of the orchestrator's command evidence collection, the "Truncation rule (command evidence)" paragraph, the `[Evidence for Criterion N]` block-format paragraph, and the file-inspection/prose-inspection caveat paragraph.

- [ ] **Step 3: Update the `## Step 11: Verify wave output` intro** so the precondition sentence no longer mentions evidence collection. Change the precondition sentence from `Step 10 (wave gate) must have exited. Verification for each task runs in a fresh-context verifier subagent via agent/skills/execute-plan/verify-task-prompt.md; the orchestrator only collects command evidence and routes the verifier's verdict.` to: `Step 10 (wave gate) must have exited. Verification for each task runs in a fresh-context verifier subagent via agent/skills/execute-plan/verify-task-prompt.md. The verifier collects command evidence in Phase 1 (executing each command-style Verify: recipe byte-equal verbatim) and judges each criterion in Phase 2; the orchestrator dispatches and routes the verdict.` Leave the protocol-error stop paragraph (about missing `Verify:` recipes) immediately following the intro unchanged.

- [ ] **Step 4: Rewrite `### Step 11.2: Dispatch the verifier`.** Replace the entire body of this subsection (from the heading down to the heading `### Step 11.3: Parse verifier output and gate the wave`) with this exact content:

  ```
  ### Step 11.2: Dispatch the verifier

  For each task in the wave (regardless of its Step 9 status, except `BLOCKED` which is already handled in Step 10), dispatch a fresh `verifier` subagent using the template at `agent/skills/execute-plan/verify-task-prompt.md`. The verifier executes command-style `Verify:` recipes in Phase 1 and judges every criterion in Phase 2, then returns per-criterion verdicts under `## Per-Criterion Verdicts` and an overall `VERDICT:` line under `## Overall Verdict`. The orchestrator does not pre-collect command evidence — that work moved into the verifier itself per `agent/agents/verifier.md`.

  Verifier dispatches for the wave run in parallel, bounded by the pi-interactive-subagent `MAX_PARALLEL_HARD_CAP` cap (see Step 5). Issue all verifier subagents concurrently up to the cap and wait for all of them to return before parsing in Step 11.3.

  Fill the template's placeholders as follows:

  - `{TASK_SPEC}` — the task block from the plan, verbatim.
  - `{ACCEPTANCE_CRITERIA_WITH_VERIFY}` — the acceptance criteria list for the task, each paired with its `Verify:` recipe, numbered starting at 1.
  - `{PHASE_1_RECIPES}` — the orchestrator-extracted, command-style `Verify:` recipes for this task, numbered to match the criterion index in `{ACCEPTANCE_CRITERIA_WITH_VERIFY}`. Format each entry as `[Recipe for Criterion N] <recipe text>` on its own line. A criterion whose `Verify:` recipe is file-inspection or prose-inspection produces no entry — gaps in numbering are expected and correct. If the task has no command-style recipes, leave this section empty.
  - `{MODIFIED_FILES}` — the orchestrator-assembled verifier-visible file set, as a newline-separated, deduplicated list of paths. The orchestrator MUST compute this set as the union of three inputs so that the worker being judged cannot narrow its own verification surface:
    1. **Task-declared scope.** Every path listed in the plan task's `**Files:**` section, verbatim. A task that declares a file is on the hook for that file regardless of whether the worker reported touching it.
    2. **Worker-reported changes.** The paths listed in the worker's `## Files Changed` section. These are informative but NOT authoritative on their own — a worker that omits a file it actually modified cannot hide that file from the verifier.
    3. **Orchestrator-observed diff state.** The paths surfaced by `git status --porcelain` (working tree and index, relative to the last commit) for the wave, plus any files present in the wave's `git diff HEAD` output. In parallel-wave dispatch where multiple tasks share the working tree, scope this to files that plausibly belong to this task — at minimum include every path from inputs 1 and 2 that also appears in the orchestrator-observed set, and include any additional orchestrator-observed paths that fall under the task's declared `**Files:**` directories. Include all orchestrator-observed paths when the wave contains only this task.
    Deduplicate the union and present it as the verifier-visible file set. Explicitly record in the prompt that this set is orchestrator-assembled so the verifier knows it is not simply the worker's self-report.
  - `{DIFF_CONTEXT}` — the uncommitted wave diff against `HEAD`, produced as follows. For tracked files modified in this wave, use `git diff HEAD -- <modified files>`. For newly created (untracked) files, `git diff HEAD` does not produce output; instead, generate a diff for each new file via `git diff --no-index /dev/null -- <file>` (which produces a unified diff showing the entire file as added). Concatenate both outputs into a single diff block. To identify which files are new vs. modified, check `git status --porcelain -- <modified files>`: entries prefixed with `??` are untracked/new; all others are tracked modifications. This reflects the working tree vs. the last commit, which is where wave changes live before Step 12's commit. Do NOT substitute a committed-range diff (e.g. a diff between `HEAD` and a prior commit) or a `--staged` diff; wave changes have not been committed yet. **Diff truncation rule.** If the combined diff output exceeds 500 lines or 40 KB, truncate it by keeping the first 300 lines and the last 100 lines, separated by a single marker line that records the pre-truncation line count and byte count (e.g., `[diff truncated — <N> lines, <B> bytes total; verifier should note this and fall back to reading the named files for file-inspection criteria whose relevant code may lie in the truncated window]`). Never silently drop diff output. If a file-inspection criterion cannot be judged because the relevant hunk is inside the truncated window, the verifier should read the named file(s) directly from `## Verifier-Visible Files` rather than guessing. **Sub-task dispatch carve-out:** Sub-task dispatches from the Blocked handling phase of Step 10 (split-into-sub-tasks) MUST occur pre-commit — their changes must remain in the working tree at Step 11 time so `git diff HEAD` captures them alongside the rest of the wave. Step 12's commit is the only sanctioned transition from working tree to committed state for wave changes, and it runs after Step 11. If for any reason a sub-task's changes were committed before Step 11 runs for this wave (a protocol violation that should not normally occur), substitute `git diff <pre-subtask-commit>..HEAD -- <modified files>` for those criteria so the verifier still sees the sub-task's changes; otherwise file-inspection criteria will fail for insufficient evidence even though the work was done.
  - `{WORKING_DIR}` — the plan's working directory.

  **Verifier model tier:** Every verifier dispatch in execute-plan uses the model resolved from `crossProvider.standard` in `~/.pi/agent/model-tiers.json`, with `cli` resolved through `dispatch[<provider>]` for that model's provider prefix. Verifier model selection is no longer based on the model tier used by the task under review (the prior `standard` default plus `capable` upgrade rule is removed). Do not silently fall back to a non-cross-provider tier; if `crossProvider.standard` cannot be resolved, surface the resolution failure to the user.

  Dispatch the verifier wave as `subagent_run_parallel { tasks: [{ name: "<task-N>: <task-title>", agent: "verifier", task: "<filled verify-task-prompt.md>", model: "<resolved crossProvider.standard model>", cli: "<dispatch[<provider>] for that model>" }, ...] }`.
  ```

- [ ] **Step 5: Update `### Step 11.3: Parse verifier output and gate the wave`.** Inside this subsection:
  - Leave the existing first paragraph (about parsing `## Per-Criterion Verdicts` and `## Overall Verdict`) unchanged.
  - Leave the binary-criteria paragraph and the full-coverage paragraph unchanged.
  - Replace the existing `**Protocol-error routing.**` paragraph with this expanded version:

    ```
    **Protocol-error routing.** Any malformed verifier output — missing or extra criterion blocks, duplicate criterion numbers, out-of-range numbers, a `verdict:` prefix, lowercase verdict tokens, or an unparseable overall verdict line — is treated exactly as `VERDICT: FAIL` for the task. Three additional protocol errors apply specifically to the two-phase verifier introduced for the Phase 1 evidence-collection path:

    - **`verifier phase-1 evidence block malformed at criterion N: <specific check>`** — a `[Evidence for Criterion N]` block is present in the verifier's `## Phase 1 Evidence` section but does not contain all four labelled fields (`command:`, `exit_code:`, `stdout:`, `stderr:`) in that order, or a labelled field is unparseable. `<specific check>` names the missing or malformed field.
    - **`verifier missing evidence block for command-style criterion N`** — the orchestrator supplied a recipe for criterion N in `{PHASE_1_RECIPES}` but the verifier's `## Phase 1 Evidence` section contains no `[Evidence for Criterion N]` block.
    - **`verifier ran command not matching any phase-1 recipe: <command>`** — a `[Evidence for Criterion N]` block's `command:` line is not BYTE-EQUAL to any recipe text supplied in `{PHASE_1_RECIPES}` (recipe-verbatim discipline violation).

    All protocol errors — including these three — route into Step 13's retry loop with a concrete description so the re-dispatched verifier has a concrete target to fix. Protocol errors never pass the wave gate and are never silently interpreted as `PASS`.
    ```

  - Leave the `**Wave gate exit:**` paragraph unchanged.

- [ ] **Step 6: Self-review the Step 11 region.** Confirm: (a) `### Step 11.1: Orchestrator collects command evidence` heading is gone; (b) the body has only `### Step 11.2` and `### Step 11.3`; (c) `{ORCHESTRATOR_COMMAND_EVIDENCE}` no longer appears anywhere in `SKILL.md` (the placeholder reference moved to `{PHASE_1_RECIPES}`); (d) the verifier dispatch tier line names `crossProvider.standard` (not `standard` with `capable` upgrade); (e) the three new protocol-error reason strings appear in Step 11.3.

**Acceptance criteria:**

- `### Step 11.1` is removed in full from `agent/skills/execute-plan/SKILL.md`.
  Verify: run `grep -n -E '^### Step 11\.1' agent/skills/execute-plan/SKILL.md` and confirm zero matches.
- `{ORCHESTRATOR_COMMAND_EVIDENCE}` is removed from `agent/skills/execute-plan/SKILL.md` and `{PHASE_1_RECIPES}` appears at least once inside `### Step 11.2`.
  Verify: run `grep -c -F '{ORCHESTRATOR_COMMAND_EVIDENCE}' agent/skills/execute-plan/SKILL.md` and confirm it prints `0`; run `grep -n -F '{PHASE_1_RECIPES}' agent/skills/execute-plan/SKILL.md` and confirm at least one match falls inside the `### Step 11.2` block.
- The verifier model tier is `crossProvider.standard` and the prior `standard` default plus `capable` upgrade rule is removed.
  Verify: run `grep -n -F 'crossProvider.standard' agent/skills/execute-plan/SKILL.md` and confirm at least one match falls inside the `### Step 11.2` block referring to verifier dispatch; run `grep -n -F 'upgrade the verifier to' agent/skills/execute-plan/SKILL.md` and confirm zero matches.
- The Step 11.3 protocol-error routing names the three new verifier-with-bash failure modes byte-equal.
  Verify: run `grep -n -F 'verifier phase-1 evidence block malformed at criterion N' agent/skills/execute-plan/SKILL.md`, `grep -n -F 'verifier missing evidence block for command-style criterion N' agent/skills/execute-plan/SKILL.md`, and `grep -n -F 'verifier ran command not matching any phase-1 recipe' agent/skills/execute-plan/SKILL.md` and confirm each finds at least one match.
- The `## Per-Criterion Verdicts` parser shape (per-criterion `[Criterion N] <PASS | FAIL>` headers and `VERDICT: <PASS | FAIL>` overall verdict) remains documented and unchanged in Step 11.3.
  Verify: open `agent/skills/execute-plan/SKILL.md` to the Step 11.3 section and confirm the existing paragraphs about per-criterion header shape (`[Criterion N] <PASS | FAIL>`) and the overall verdict line `VERDICT: <PASS | FAIL>` are still present, byte-for-byte, and the full-coverage requirement (`S == {1..K}`) is unchanged.

**Model recommendation:** capable

---

### Task 7: Rewire SKILL.md Step 7, Step 12, and Step 16 to use `test-runner`

**Files:**
- Modify: `agent/skills/execute-plan/SKILL.md`

**Steps:**

- [ ] **Step 1: Open `agent/skills/execute-plan/SKILL.md` and locate the four caller-side test-command call sites:** Step 7 baseline capture (around lines 258–296 today, before this task — note Step 11.1 was removed in Task 6, so subsequent line numbers will have shifted), Step 12.2 post-wave run, the Step 12 Debugger-first flow's success re-test (referenced inside the `### Debugger-first flow` parameter table and the flow body, in the "On success, re-running the test command and applying the Step 7 reconciliation algorithm" sub-step), and Step 16's final-gate gate protocol step 1 ("Re-run the full integration suite").

- [ ] **Step 2: Define the shared `test-runner` dispatch helper.** Insert a new subsection at the END of `## Step 7: Baseline test capture` (after the current `#### Integration regression model` paragraph that links to `integration-regression-model.md`), with this exact body:

  ```
  #### Test-runner dispatch (shared)

  Step 7, Step 12.2, the Step 12 Debugger-first flow's success re-test, and Step 16's final-gate gate use the same `test-runner` subagent to execute the integration suite. The orchestrator never runs the test command itself.

  **Per-plan runs directory.** Compute `<plan-name>` as the plan filename without the `.md` extension (e.g., `2026-04-30-execute-plan-caller-side-subagents` for plan `2026-04-30-execute-plan-caller-side-subagents.md`). Before the first `test-runner` dispatch in the plan, create the directory:

  ```bash
  mkdir -p .pi/test-runs/<plan-name>
  ```

  **Filename scheme (relative to the plan's working directory).** Each call site uses a phase-distinct, run-distinct filename so re-entries do not overwrite each other. The relative paths below are joined with `<working-dir>` (the absolute working directory used as `{WORKING_DIR}`) to produce the absolute `{ARTIFACT_PATH}` actually supplied to `test-runner`:
  - Step 7 baseline capture (relative): `.pi/test-runs/<plan-name>/baseline.log` → absolute `{ARTIFACT_PATH} = <working-dir>/.pi/test-runs/<plan-name>/baseline.log` (single file; written exactly once).
  - Step 12.2 post-wave + Step 12 Debugger-first re-test (relative): `.pi/test-runs/<plan-name>/wave-<N>-attempt-<K>.log` → absolute `{ARTIFACT_PATH} = <working-dir>/.pi/test-runs/<plan-name>/wave-<N>-attempt-<K>.log`, where `<N>` is the wave number and `<K>` is a 1-based counter incremented for every re-entry within that wave (including each Debugger-first re-test).
  - Step 16 final-gate runs (relative): `.pi/test-runs/<plan-name>/final-gate-<seq>.log` → absolute `{ARTIFACT_PATH} = <working-dir>/.pi/test-runs/<plan-name>/final-gate-<seq>.log`, where `<seq>` is a 1-based counter incremented for every gate entry (initial + each `(a) Debug failures now` re-entry).

  **Dispatch.** Read `agent/skills/execute-plan/test-runner-prompt.md` once and fill its placeholders for each dispatch:
  - `{TEST_COMMAND}` — the test command from Step 3 settings.
  - `{WORKING_DIR}` — the plan's absolute working directory (worktree path or project root).
  - `{ARTIFACT_PATH}` — the ABSOLUTE artifact path for this call site, constructed by joining `<working-dir>` with the relative filename from the scheme above. The agent's output contract requires `TEST_RESULT_ARTIFACT: <absolute path>`, so the orchestrator must pass `{ARTIFACT_PATH}` as an absolute path here for the path-equality check to be meaningful.
  - `{PHASE_LABEL}` — a short label naming the phase (`baseline`, `wave-<N>-attempt-<K>`, or `final-gate-<seq>`).

  Resolve the model from `crossProvider.cheap` in `~/.pi/agent/model-tiers.json`, and resolve `cli` through `dispatch[<provider>]` for that model's provider prefix. If `crossProvider.cheap` cannot be resolved or its provider has no `dispatch` entry, surface the resolution failure to the user — do NOT silently fall back to `cheap`, `standard`, or a CLI default.

  Dispatch via `subagent_run_serial`:

  ```
  subagent_run_serial { tasks: [
    { name: "test-runner: <phase label>", agent: "test-runner", task: "<filled test-runner-prompt.md>", model: "<resolved crossProvider.cheap model>", cli: "<dispatch[<provider>] for that model>" }
  ]}
  ```

  **Artifact readback.** After the dispatch returns, read `results[0].finalMessage` and perform these checks in order, each producing its own specific failure reason. The reason templates below use the exact placeholder names `<path>`, `<X>`, and `<Y>` byte-equal with the spec and the acceptance criteria below; at runtime, substitute the concrete values shown in parentheses. On any failure, stop the call site that triggered the dispatch (do NOT fall back to running the test command in-orchestrator):

  1. **Marker extraction.** Find the LAST line in `finalMessage` matching the anchored regex `^TEST_RESULT_ARTIFACT: (.+)$`. If no such line exists, stop with reason `test-runner response missing TEST_RESULT_ARTIFACT marker`. Capture the captured group as `<runner_path>`.
  2. **Path-equality check.** Compare `<runner_path>` (string-equal) to the absolute path supplied as `{ARTIFACT_PATH}`. If they differ, stop with reason `test-runner artifact path mismatch: expected <X>, got <Y>` (where `<X>` is the supplied `{ARTIFACT_PATH}` and `<Y>` is `<runner_path>`).
  3. **Existence-and-non-empty check.** Read `<runner_path>` from disk. If the file does not exist OR is empty (zero bytes, or only whitespace), stop with reason `test-runner artifact missing or empty at <path>` (where `<path>` is `<runner_path>`).
  4. **Header-parse check.** Confirm the file's structured header has the lines `PHASE`, `COMMAND`, `WORKING_DIRECTORY`, `EXIT_CODE`, `TIMESTAMP`, `FAILING_IDENTIFIERS_COUNT`, `FAILING_IDENTIFIERS:`, and `END_FAILING_IDENTIFIERS` in that order, followed by the `--- RAW RUN OUTPUT BELOW ---` separator. If any expected line is missing or out of order, stop with reason `test-runner artifact header malformed at <path>: <specific check>` (where `<path>` is `<runner_path>` and `<specific check>` names the missing or out-of-order field).

  **Dispatch-failure reasons.** If `subagent_run_serial` is unavailable in the orchestrator session, stop with reason `test-runner dispatch unavailable`. If the dispatch returns an error result (model unavailable, transport error, repeated empty result), stop with reason `test-runner dispatch failed`.

  **Reading the failing-identifier set.** On all checks passing, parse the lines between `FAILING_IDENTIFIERS:` and `END_FAILING_IDENTIFIERS` as the failing-test identifier set. Read `EXIT_CODE` for the run's exit code. These are the inputs the integration regression model (see `integration-regression-model.md`) consumes — they are byte-equal to what the legacy in-orchestrator extraction produced under the Step 7 identifier-extraction contract.
  ```

- [ ] **Step 3: Replace the Step 7 baseline-capture body.** Locate the existing Step 7 sub-blocks: the bash-fenced `Run the test command from Step 3 settings` block, the `#### Identifier-extraction contract` subsection, and the `#### Baseline recording` subsection. Replace these three blocks (and only these three blocks — leave the section's intro paragraph "Before executing the first wave …" and the closing `#### Integration regression model` link paragraph untouched, EXCEPT that you should append the new `#### Test-runner dispatch (shared)` subsection added in Step 2 immediately after the `#### Integration regression model` link paragraph) with this exact content:

  ```
  Run the integration suite via the `test-runner` subagent (see `#### Test-runner dispatch (shared)` below) with `{ARTIFACT_PATH} = <working-dir>/.pi/test-runs/<plan-name>/baseline.log` (an absolute path under the plan's working directory) and `{PHASE_LABEL} = baseline`. The agent applies the same Step 7 identifier-extraction contract documented in `agent/agents/test-runner.md` so the failing-identifier set the orchestrator reads back is byte-equal to the legacy in-orchestrator extraction.

  #### Baseline recording

  After artifact readback succeeds, classify the baseline by `EXIT_CODE`:

  **If `EXIT_CODE == 0` (all tests pass):**
  Record `baseline_failures := ∅` (the empty set). Any post-wave failing-test identifier that is not later classified as a deferred integration regression is a regression introduced by the plan execution.

  **If `EXIT_CODE != 0` (some tests fail):**
  Read the failing-identifier set from the artifact's `FAILING_IDENTIFIERS:` block and record `baseline_failures` as that set. Warn the user:
  ```
  ⚠️ Baseline: N tests already failing before execution.
  New failures only will be flagged after each wave.
  ```
  `baseline_failures` is frozen at this point and never mutated for the rest of the plan run — subsequent waves only compare against it, never modify it. Proceed with execution; pre-existing failures are excluded from the pass/fail decision after each wave via the Step 12 three-set classification.
  ```

  Then ensure the section ends in the original order: the (unchanged) `#### Integration regression model` link paragraph, then the newly-added `#### Test-runner dispatch (shared)` block. The `#### Identifier-extraction contract` subsection is intentionally removed from SKILL.md — its content has moved into `agent/agents/test-runner.md`.

- [ ] **Step 4: Replace the Step 12.2 test-execution body.** Locate `### 2. Run integration tests` inside `## Step 12: Post-wave commit and integration tests`. Its body currently contains a fenced bash block running `TEST_OUTPUT=$(<test_command> 2>&1)` followed by a paragraph that says "Apply the integration regression model from integration-regression-model.md. Pass if `new_regressions_after_deferment` is empty; fail if non-empty." Replace the bash block plus the immediately-following sentence with this exact body:

  ```
  Run the integration suite via the `test-runner` subagent (see Step 7's `#### Test-runner dispatch (shared)`) with `{ARTIFACT_PATH} = <working-dir>/.pi/test-runs/<plan-name>/wave-<N>-attempt-<K>.log` (an absolute path under the plan's working directory, where `<N>` is the current wave number and `<K>` is a 1-based attempt counter for this wave, starting at 1 and incremented on each Step 12 Debugger-first re-test) and `{PHASE_LABEL} = wave-<N>-attempt-<K>`. After artifact readback, read the failing-identifier set and `EXIT_CODE` from the artifact and pass them as `current_failing` into the integration regression model from `integration-regression-model.md`. Apply the reconciliation algorithm; pass if `new_regressions_after_deferment` is empty, fail if non-empty.
  ```

  Leave the rest of `### 2. Run integration tests` (the `#### Menu` block, the intermediate-wave-menu vs final-wave-menu fork, and the menu-action explanations) unchanged. The `(a) Debug failures` action still hands off to the Debugger-first flow; the `(b) Defer integration debugging` action still mutates `deferred_integration_regressions`; the `(c) Stop execution` action still halts.

- [ ] **Step 5: Update the Step 12 Debugger-first flow's success re-test.** Inside `### Debugger-first flow`, the parameter table's "Success condition" cell for the `Step 12 (post-wave)` column says "On re-running the test command and applying the Step 7 reconciliation algorithm, `new_regressions_after_deferment` is empty…". The flow body's step 3 says "for Step 12, re-run the test command and apply the Step 7 reconciliation algorithm". Update both phrases as follows:
  - In the parameter table cell, change "On re-running the test command and applying the Step 7 reconciliation algorithm" to "On re-dispatching `test-runner` per Step 7's `#### Test-runner dispatch (shared)` (with a fresh `wave-<N>-attempt-<K>` filename — increment `<K>`) and applying the Step 7 reconciliation algorithm".
  - In the flow body's step 3 "Diagnosed and fixed" branch, change "for Step 12, re-run the test command and apply the Step 7 reconciliation algorithm" to "for Step 12, re-dispatch `test-runner` per Step 7's `#### Test-runner dispatch (shared)` (incrementing the wave attempt counter) and apply the Step 7 reconciliation algorithm".
  - In the same step's "Diagnosis only" branch, the phrase "re-run the test command" should similarly become "re-dispatch `test-runner` per Step 7's `#### Test-runner dispatch (shared)` (incrementing the wave attempt counter)".

  Leave every other clause in `### Debugger-first flow` unchanged — including the parameter table's other cells, the Step 16 success-condition cell, the commit-template / commit-undo behavior, and the failed-debugging-pass menu re-presentation.

- [ ] **Step 6: Update Step 16's `### Final integration regression gate (precondition)` step 1.** The current body of `**Gate protocol:**` step 1 reads "Re-run the full integration suite using the same test command from Step 3. Apply the Step 7 identifier-extraction contract to the runner's failure output so identifiers are directly comparable with `baseline_failures` and `deferred_integration_regressions`." Replace this paragraph with this exact body:

  ```
  1. **Re-dispatch the integration suite via `test-runner`** per Step 7's `#### Test-runner dispatch (shared)` with `{ARTIFACT_PATH} = <working-dir>/.pi/test-runs/<plan-name>/final-gate-<seq>.log` (an absolute path under the plan's working directory, where `<seq>` is a 1-based counter incremented for every gate entry — initial entry is `1`, each subsequent re-entry from `(a) Debug failures now` is `2`, `3`, …) and `{PHASE_LABEL} = final-gate-<seq>`. Read back the failing-identifier set and `EXIT_CODE` from the artifact; the agent has already applied the Step 7 identifier-extraction contract so identifiers are directly comparable with `baseline_failures` and `deferred_integration_regressions`.
  ```

  Leave step 2 (reconciliation), step 3 (gate-on-union), and step 4 (menu actions) of `**Gate protocol:**` unchanged.

- [ ] **Step 7: Add the cleanup line to `### 1. Move plan to done`.** Inside `### 1. Move plan to done`, append a third bullet after the existing `Move the plan file to .pi/plans/done/` bullet:

  ```
  - Delete the per-plan `.pi/test-runs/<plan-name>/` directory now that the final integration regression gate has passed: `rm -rf .pi/test-runs/<plan-name>`. This cleanup runs ONLY on successful gate exit (i.e. when this `### 1. Move plan to done` sub-step executes). Every `(c) Stop execution` exit path — Step 10's wave gate, Step 12's intermediate-wave or final-wave menu, Step 13's failure-handling prompt, Step 15's review max-iterations menu, and Step 16's final-gate menu — leaves `.pi/test-runs/<plan-name>/` in place so the user can inspect run artifacts after stop.
  ```

- [ ] **Step 8: Update the `(c) Stop execution` exit paths to explicitly preserve the runs directory.** Find every `(c) Stop execution` bullet body in:
  - Step 10 §2 Blocked handling (`(x) Stop execution` — note this uses `(x)` not `(c)`; it is the equivalent stop-action and is part of the same set of stop-exits)
  - Step 10 §3 Concerns handling (`(x) Stop execution`)
  - Step 12 §2's intermediate-wave menu (`(c) Stop execution`)
  - Step 12 §2's final-wave menu (`(c) Stop execution`)
  - Step 13's user-prompt step 2 ("Stop the entire plan")
  - Step 15's `max_iterations_reached` menu (`(c) Stop execution`)
  - Step 16's gate menu (`(c) Stop execution`)

  In each of these stop-action bullets, append a single sentence: `The per-plan .pi/test-runs/<plan-name>/ directory is preserved on this exit path so the user can inspect run artifacts after stop.` Insert this sentence as the LAST sentence of the bullet body, after any existing partial-progress reporting prose. Leave the other prose in each bullet untouched.

- [ ] **Step 9: Self-review SKILL.md end-to-end.**
  - Confirm there is no caller-side test-execution shell anywhere in SKILL.md anymore. Search for `TEST_OUTPUT=$(<test_command>` and `<test_command> 2>&1` — both should produce zero matches.
  - Confirm `test-runner` is referenced at all four call sites (Step 7 baseline, Step 12.2 post-wave, Step 12 Debugger-first re-test, Step 16 gate).
  - Confirm `.pi/test-runs/<plan-name>` appears in: Step 7's `#### Test-runner dispatch (shared)` block, Step 16's `### 1. Move plan to done` cleanup bullet, and every `(c)`/`(x) Stop execution` exit path's preservation sentence.
  - Confirm the six `test-runner` failure-mode reason strings appear verbatim in Step 7's `#### Test-runner dispatch (shared)` block: `test-runner dispatch unavailable`, `test-runner dispatch failed`, `test-runner response missing TEST_RESULT_ARTIFACT marker`, `test-runner artifact missing or empty at <path>`, `test-runner artifact path mismatch: expected <X>, got <Y>`, `test-runner artifact header malformed at <path>: <specific check>`.
  - Confirm the file's total line count is `<=` the line count it had immediately after Task 6 committed (which is the count at the start of this task) — track this with `wc -l agent/skills/execute-plan/SKILL.md` before starting Step 1 and again after Step 8.

**Acceptance criteria:**

- All four caller-side test-command shells are removed; SKILL.md no longer runs the test command itself.
  Verify: run `grep -n -F 'TEST_OUTPUT=$(<test_command>' agent/skills/execute-plan/SKILL.md` and confirm zero matches; run `grep -n -F '<test_command> 2>&1' agent/skills/execute-plan/SKILL.md` and confirm zero matches.
- `test-runner` is dispatched at all four expected call sites — Step 7 baseline, Step 12.2 post-wave, Step 12 Debugger-first re-test, and Step 16 final-gate gate.
  Verify: run `grep -n -F 'test-runner' agent/skills/execute-plan/SKILL.md` and confirm at least one match falls inside each of the following contexts (open the file and check by line number): the `## Step 7: Baseline test capture` section, the `### 2. Run integration tests` subsection of Step 12, the `### Debugger-first flow` subsection of Step 12, and the `### Final integration regression gate (precondition)` subsection of Step 16.
- The shared `#### Test-runner dispatch (shared)` subsection exists, names the four phase-filename schemes (`baseline.log`, `wave-<N>-attempt-<K>.log`, `final-gate-<seq>.log`), names `crossProvider.cheap` as the model tier, and lists all six `test-runner` failure reasons byte-equal.
  Verify: run `grep -n -F '#### Test-runner dispatch (shared)' agent/skills/execute-plan/SKILL.md` and confirm exactly one match (defining heading); for the six failure-reason strings, run each of `grep -n -F 'test-runner dispatch unavailable' agent/skills/execute-plan/SKILL.md`, `grep -n -F 'test-runner dispatch failed' agent/skills/execute-plan/SKILL.md`, `grep -n -F 'test-runner response missing TEST_RESULT_ARTIFACT marker' agent/skills/execute-plan/SKILL.md`, `grep -n -F 'test-runner artifact missing or empty at <path>' agent/skills/execute-plan/SKILL.md`, `grep -n -F 'test-runner artifact path mismatch: expected <X>, got <Y>' agent/skills/execute-plan/SKILL.md`, and `grep -n -F 'test-runner artifact header malformed at <path>: <specific check>' agent/skills/execute-plan/SKILL.md` and confirm each finds at least one match; run `grep -n -F 'crossProvider.cheap' agent/skills/execute-plan/SKILL.md` and confirm at least one match falls inside the `#### Test-runner dispatch (shared)` block.
- Step 16's `### 1. Move plan to done` deletes the per-plan runs directory on successful gate exit, and every stop-execution exit path preserves it.
  Verify: run `grep -n -F 'rm -rf .pi/test-runs/<plan-name>' agent/skills/execute-plan/SKILL.md` and confirm at least one match falls inside `### 1. Move plan to done`; run `grep -n -F '.pi/test-runs/<plan-name>/ directory is preserved' agent/skills/execute-plan/SKILL.md` and confirm at least seven matches (one per `(c)`/`(x) Stop execution` exit in Step 10 §2, Step 10 §3, Step 12 intermediate-wave menu, Step 12 final-wave menu, Step 13, Step 15, Step 16 final-gate menu).
- Net `agent/skills/execute-plan/SKILL.md` line count is less than or equal to its line count at the start of this branch (i.e. before any change in this plan).
  Verify: run `git rev-parse HEAD` to confirm the current branch contains all of Tasks 1-7's commits, then run `git log --diff-filter=M --pretty=format:'%H' -- agent/skills/execute-plan/SKILL.md | tail -n 1` to find the SHA of the FIRST modification of `SKILL.md` on this branch (Task 6's commit); compute `BASE_LINE_COUNT = $(git show <pre-task6-parent-sha>:agent/skills/execute-plan/SKILL.md | wc -l)` where `<pre-task6-parent-sha>` is the parent of Task 6's commit; compute `CURRENT_LINE_COUNT = $(wc -l < agent/skills/execute-plan/SKILL.md)`; confirm `CURRENT_LINE_COUNT -le BASE_LINE_COUNT`. Concretely, run this verification:
  
  ```bash
  PRE_TASK6=$(git log --reverse --diff-filter=M --pretty=format:'%H' -- agent/skills/execute-plan/SKILL.md | head -n 1)
  BASE=$(git rev-parse "$PRE_TASK6^")
  BASE_COUNT=$(git show "$BASE":agent/skills/execute-plan/SKILL.md | wc -l)
  CURR_COUNT=$(wc -l < agent/skills/execute-plan/SKILL.md)
  test "$CURR_COUNT" -le "$BASE_COUNT" && echo OK || echo "FAIL: $CURR_COUNT > $BASE_COUNT"
  ```

  Confirm the script prints `OK`.
- The Step 7 identifier-extraction contract subsection has been removed from SKILL.md (it now lives in `agent/agents/test-runner.md`).
  Verify: run `grep -n -E '^#### Identifier-extraction contract' agent/skills/execute-plan/SKILL.md` and confirm zero matches.

**Model recommendation:** capable

---

### Task 8: Smoke-run static substitute + manual operator smoke-run gate

The spec's final acceptance criterion calls for a runtime smoke run of `execute-plan` against an existing plan to confirm four behaviors: (a) Step 7 baseline capture artifact + byte-equal identifier readback, (b) Step 11 verifier `[Evidence for Criterion N]` blocks parse cleanly, (c) Step 12.2 post-wave artifact + three-section summary, (d) Step 16 cleanup on success / preservation on `(c) Stop execution`. A runtime smoke run cannot run inside `execute-plan`'s own task-execution context (the plan would have to dispatch itself), so this task produces a single report file that contains both halves of the gate explicitly: an automated static cross-file consistency check (Steps 2–6) confirming the four behaviors are wired end-to-end across the modified files, AND a manual operator smoke-run gate template (Step 7) that an operator MUST complete and record before this plan is merged. The manual operator gate is a formal merge-blocking requirement, not a recommendation.

**Files:**
- Create: `.pi/test-runs/smoke-run-static-report.md`

**Steps:**

- [ ] **Step 1: Create the report file with a header and intro.** Write `.pi/test-runs/smoke-run-static-report.md` beginning with the level-1 heading `# Smoke-Run Static Substitute + Manual Operator Gate — 2026-04-30-execute-plan-caller-side-subagents` followed by a one-paragraph intro that says: "This report records two artefacts that together satisfy the spec's runtime smoke-run acceptance criterion: (1) static cross-file consistency checks performed automatically as part of plan execution (the runtime smoke run is infeasible inside `execute-plan`'s own task-execution context — the plan would have to dispatch itself), and (2) a manual operator smoke-run gate that an operator MUST complete before this plan is merged. Each of the four spec acceptance points (a), (b), (c), and (d) appears in BOTH the automated section AND the manual operator gate, so the static report establishes structural wiring while the operator gate confirms runtime behavior. The manual operator gate is a formal merge-blocking requirement, not a recommendation; static cross-file consistency checks alone are not sufficient to merge."

- [ ] **Step 2: Add `## (a) Step 7 baseline capture` section.** Run each of the following four checks from the working directory; for each, record in the report the command, the matched line number(s), and the matched line content. Then append a `Verdict: PASS` line if all four checks succeeded (each found at least one match), or `Verdict: FAIL` with a sub-list of failing checks otherwise.
  1. `grep -n -F 'baseline.log' agent/skills/execute-plan/SKILL.md` — at least one match (Step 7 baseline-capture filename wired in `#### Test-runner dispatch (shared)` and the Step 7 body).
  2. `grep -n -F 'TEST_RESULT_ARTIFACT' agent/agents/test-runner.md` — at least one match (the agent's final-line marker discipline is documented).
  3. `grep -n -F '--- RAW RUN OUTPUT BELOW ---' agent/agents/test-runner.md` — at least one match (the artifact-format separator the caller's header-parse check looks for).
  4. `grep -n -F 'identifier-extraction' agent/agents/test-runner.md` — at least one match (the Step 7 identifier-extraction contract is inlined in the agent so the caller's read-back is byte-equal to legacy extraction).

- [ ] **Step 3: Add `## (b) Step 11 verifier evidence blocks` section.** Run each of the following five checks; record each command, line number(s), and matched content. Append `Verdict: PASS` if all five succeed, or `Verdict: FAIL` with the failing sub-checks.
  1. `grep -n -F '[Evidence for Criterion N]' agent/agents/verifier.md` — at least one match (verifier emits the block format).
  2. `grep -n -F '[Evidence for Criterion N]' agent/skills/execute-plan/verify-task-prompt.md` — at least one match (template documents the same format).
  3. `grep -c -F '{PHASE_1_RECIPES}' agent/skills/execute-plan/verify-task-prompt.md` — exactly one match (single substitution placeholder).
  4. `grep -n -F '{PHASE_1_RECIPES}' agent/skills/execute-plan/SKILL.md` — at least one match inside `### Step 11.2` (orchestrator template-fill names the new placeholder, replacing the removed `{ORCHESTRATOR_COMMAND_EVIDENCE}`).
  5. `grep -n -F '[Criterion 1] <PASS | FAIL>' agent/skills/execute-plan/verify-task-prompt.md` — at least one match (output report shape preserved byte-for-byte for SKILL.md Step 11.3's parser).

- [ ] **Step 4: Add `## (c) Step 12.2 post-wave integration` section.** Run each of the following three checks; record each command, line number(s), and matched content. Append `Verdict: PASS` if all three succeed, or `Verdict: FAIL` with the failing sub-checks.
  1. `grep -n -F 'wave-<N>-attempt-<K>.log' agent/skills/execute-plan/SKILL.md` — at least one match (Step 12.2 post-wave filename scheme is wired).
  2. `grep -n -F 'integration-regression-model.md' agent/skills/execute-plan/SKILL.md` — at least one match inside Step 12 (reconciliation algorithm and three-section summary preserved via the linked model document).
  3. `grep -n -F 'TEST_OUTPUT=$(<test_command>' agent/skills/execute-plan/SKILL.md` — exactly zero matches (the in-caller test-command shell at Step 12.2 has been removed; this counts as PASS only when the match count is `0`).

- [ ] **Step 5: Add `## (d) Step 16 cleanup-vs-preservation` section.** Run each of the following two checks; record each command, line number(s), and matched content. Append `Verdict: PASS` if both succeed, or `Verdict: FAIL` with the failing sub-checks.
  1. `grep -n -F 'rm -rf .pi/test-runs/<plan-name>' agent/skills/execute-plan/SKILL.md` — at least one match inside `### 1. Move plan to done` (cleanup on successful gate exit).
  2. `grep -c -F '.pi/test-runs/<plan-name>/ directory is preserved' agent/skills/execute-plan/SKILL.md` — at least seven matches (preservation sentence appended to all seven `(c)`/`(x) Stop execution` exit paths in Step 10 §2, Step 10 §3, Step 12 intermediate-wave menu, Step 12 final-wave menu, Step 13, Step 15, Step 16 final-gate menu).

- [ ] **Step 6: Add `## Overall Verdict (Automated Static Section)` section.** Compute the static-section overall verdict by combining the four sub-section verdicts: write the line `OVERALL_STATIC: PASS` if all four sub-sections (a)–(d) returned `Verdict: PASS`; otherwise write `OVERALL_STATIC: FAIL` followed by a one-line list naming the failing sub-sections (e.g., `Failed sub-sections: (b), (d)`). The `OVERALL_STATIC:` line MUST appear at the start of its own line. Add a sentence immediately below it: "This static-section verdict is necessary but NOT sufficient — the manual operator smoke-run gate below must also report PASS before this plan is merged."

- [ ] **Step 7: Add `## Manual Operator Smoke-Run Gate` section** (the runtime gate the static section cannot replace). Write the section verbatim below into the report. The section starts as a template with operator-fill placeholder lines marked `<...>`; the operator who later runs the smoke run replaces each `<...>` with the actual observed value before merging.

  ```
  ## Manual Operator Smoke-Run Gate

  **Status: REQUIRED before merging this plan.** The automated static section above confirms structural wiring across files but cannot validate runtime subagent dispatch, artifact readback, reconciliation arithmetic, menu flow, or cleanup behavior during `execute-plan` execution. An operator MUST perform a runtime smoke run of `execute-plan` against an unrelated existing plan and record the four sub-criterion results plus the overall gate verdict in this section before the changes from this plan branch are merged.

  ### Operator instructions

  1. Pick an existing plan in `.pi/plans/` that is unrelated to this branch's changes — ideally one that has at least one wave, at least one command-style `Verify:` recipe, and an integration test command.
  2. From a clean checkout that has this branch applied (or merged), run `execute-plan` against the chosen plan and let it run end-to-end. Do NOT halt early on the first invocation.
  3. While it runs, observe and record evidence of behaviors (a)–(d) below.
  4. Run a SECOND invocation against the same plan (or a different one) and stop it via `(c) Stop execution` from any of the seven stop-exit paths so behavior (d)'s preservation half can be observed.
  5. Fill in each operator verdict and evidence line below, then fill in the gate metadata block at the end.

  ### Operator-recorded sub-criteria

  - **(a) Step 7 baseline capture artifact + byte-equal identifier readback.** Confirm the baseline artifact exists at `<absolute working-dir>/.pi/test-runs/<chosen-plan>/baseline.log`, the artifact has the structured header documented in `agent/agents/test-runner.md` (PHASE/COMMAND/WORKING_DIRECTORY/EXIT_CODE/TIMESTAMP/FAILING_IDENTIFIERS_COUNT/FAILING_IDENTIFIERS:/END_FAILING_IDENTIFIERS, then `--- RAW RUN OUTPUT BELOW ---`), and the failing-identifier set the orchestrator reads back from `FAILING_IDENTIFIERS:` is byte-equal to what the legacy in-caller extraction would have produced for the same run output (sample-spot-check at minimum 2 identifiers).
    Operator verdict: <PASS|FAIL>
    Evidence: <observed artifact path; identifier-set summary or sample; any deltas from legacy extraction>
  - **(b) Step 11 verifier `[Evidence for Criterion N]` blocks parse cleanly.** Confirm at least one wave's verifier dispatches return `## Phase 1 Evidence` blocks containing `[Evidence for Criterion N]` entries with `command:`, `exit_code:`, `stdout:`, `stderr:` fields in that order; the per-stream 200-line / 20 KB truncation rule is honored where streams are large; SKILL.md Step 11.3's parser accepts the verdict output without raising any of the three protocol-error reasons (`verifier phase-1 evidence block malformed at criterion N`, `verifier missing evidence block for command-style criterion N`, `verifier ran command not matching any phase-1 recipe`).
    Operator verdict: <PASS|FAIL>
    Evidence: <wave/task observed; evidence-block excerpt or summary; any parser errors or protocol-error reasons surfaced>
  - **(c) Step 12.2 post-wave artifact + three-section summary + menus.** Confirm each wave produces a `wave-<N>-attempt-<K>.log` artifact under `.pi/test-runs/<chosen-plan>/`; the orchestrator reads back the failing-identifier set; the integration regression model's three-section user-facing summary renders unchanged from the legacy format; the intermediate-wave menu and final-wave menu (Step 12.2) appear at the right times.
    Operator verdict: <PASS|FAIL>
    Evidence: <artifact paths observed; summary rendering excerpt; menu prompts shown; any deviations>
  - **(d) Step 16 cleanup on success / preservation on `(c) Stop execution`.** From the FIRST invocation that ran end-to-end, confirm `.pi/test-runs/<chosen-plan>/` was removed by the Step 16 `### 1. Move plan to done` cleanup. From the SECOND invocation that was halted via `(c)/(x) Stop execution`, confirm `.pi/test-runs/<chosen-plan>/` remains on disk after stop. Both halves MUST be confirmed.
    Operator verdict: <PASS|FAIL>
    Evidence: <directory state observed before/after each invocation; which stop-exit path was used>

  ### Operator gate metadata

  - Operator: <name>
  - Date: <YYYY-MM-DD>
  - Plan tested: <chosen plan filename>
  - Working directory: <absolute path>
  - Branch / commit: <branch name + short SHA>
  - Manual gate verdict: <PASS|FAIL>

  Write `OVERALL_MANUAL: PASS` on its own line if all four operator sub-criterion verdicts are PASS; otherwise write `OVERALL_MANUAL: FAIL` followed by a one-line list naming the failing operator sub-criteria (e.g., `Failed operator sub-criteria: (b), (d)`). The plan branch is merge-eligible only when both `OVERALL_STATIC: PASS` and `OVERALL_MANUAL: PASS` are present in this report.

  OVERALL_MANUAL: <PASS|FAIL>
  ```

- [ ] **Step 8: Self-review the report.** Confirm the file contains, in order: the level-1 header, the intro paragraph, the four `## (a)`–`## (d)` static sub-sections, the `## Overall Verdict (Automated Static Section)` section with `OVERALL_STATIC:` line, the `## Manual Operator Smoke-Run Gate` section with the four operator sub-criteria placeholder lines AND the `OVERALL_MANUAL:` placeholder line. Confirm the four operator sub-criteria each have a placeholder `Operator verdict: <PASS|FAIL>` line AND a placeholder `Evidence:` line.

**Acceptance criteria:**

- The report file `.pi/test-runs/smoke-run-static-report.md` exists and contains the six level-2 sub-section headings in order: `## (a) Step 7 baseline capture`, `## (b) Step 11 verifier evidence blocks`, `## (c) Step 12.2 post-wave integration`, `## (d) Step 16 cleanup-vs-preservation`, `## Overall Verdict (Automated Static Section)`, `## Manual Operator Smoke-Run Gate`.
  Verify: run `grep -n -E '^## (\(a\) Step 7 baseline capture|\(b\) Step 11 verifier evidence blocks|\(c\) Step 12\.2 post-wave integration|\(d\) Step 16 cleanup-vs-preservation|Overall Verdict \(Automated Static Section\)|Manual Operator Smoke-Run Gate)' .pi/test-runs/smoke-run-static-report.md` and confirm exactly six matches in the listed order with no other level-2 headings interleaved between them (other than possibly the `# ` level-1 header above).
- Each of the four `## (...)` static sub-sections records concrete check evidence (file path, line number where applicable, and matched content) and ends with a `Verdict: PASS` or `Verdict: FAIL` line.
  Verify: run `grep -c -E '^Verdict: (PASS|FAIL)' .pi/test-runs/smoke-run-static-report.md` and confirm the count is exactly `4` (one verdict line per static sub-section, no more and no fewer); then open the file and confirm each of the four static sub-sections contains at least one quoted shell command (e.g. starts with `grep -n -F` or `grep -c -F`) and at least one matched-content snippet showing the actual file content the grep returned.
- The `## Overall Verdict (Automated Static Section)` section contains an `OVERALL_STATIC: PASS` line (when all four sub-section verdicts are PASS) or an `OVERALL_STATIC: FAIL` line followed by a list of failing sub-sections, AND a sentence explicitly stating the static verdict is necessary but not sufficient for merge.
  Verify: run `grep -c -E '^OVERALL_STATIC: (PASS|FAIL)' .pi/test-runs/smoke-run-static-report.md` and confirm exactly one match; if the line says `OVERALL_STATIC: FAIL`, additionally confirm that the next non-empty line names which sub-sections failed (matches `(a)`, `(b)`, `(c)`, or `(d)`); run `grep -n -F 'necessary but NOT sufficient' .pi/test-runs/smoke-run-static-report.md` and confirm at least one match falling inside the `## Overall Verdict (Automated Static Section)` section.
- The `## Manual Operator Smoke-Run Gate` section is present, marks itself REQUIRED before merging, contains the four operator sub-criteria (a)–(d) each with placeholder `Operator verdict: <PASS|FAIL>` and `Evidence:` lines, an operator gate-metadata block, and an `OVERALL_MANUAL: <PASS|FAIL>` placeholder line.
  Verify: run `grep -n -F 'REQUIRED before merging' .pi/test-runs/smoke-run-static-report.md` and confirm at least one match inside the `## Manual Operator Smoke-Run Gate` section; run `grep -c -F 'Operator verdict: <PASS|FAIL>' .pi/test-runs/smoke-run-static-report.md` and confirm exactly `4` matches; run `grep -c -F 'OVERALL_MANUAL:' .pi/test-runs/smoke-run-static-report.md` and confirm at least `2` matches (one in instruction prose, one as the placeholder line); open the file and confirm the gate-metadata block contains the literal labels `Operator:`, `Date:`, `Plan tested:`, `Working directory:`, `Branch / commit:`, and `Manual gate verdict:`.
- The report's intro paragraph identifies the report as containing BOTH an automated static substitute AND a manual operator gate, names the four spec acceptance points, and states the manual operator gate is a formal merge-blocking requirement.
  Verify: open `.pi/test-runs/smoke-run-static-report.md` and confirm the intro paragraph contains the literal substring `static cross-file consistency checks`, the literal substring `manual operator smoke-run gate` (case-insensitive match acceptable), the literal substring `execute-plan`, the literal substring `merge-blocking`, and the four sub-section labels `(a)`, `(b)`, `(c)`, and `(d)` each appearing at least once in that paragraph.

**Model recommendation:** standard

## Dependencies

- Task 1 depends on: none
- Task 2 depends on: none
- Task 3 depends on: none
- Task 4 depends on: none
- Task 5 depends on: none
- Task 6 depends on: Task 4, Task 5 (Step 11.2's template-fill block now references `{PHASE_1_RECIPES}` from Task 5's template, and the verifier's two-phase contract from Task 4's agent definition is what the new Step 11.2 prose describes)
- Task 7 depends on: Task 1, Task 2, Task 3, Task 6 (Task 7 wires `crossProvider.cheap` confirmed in Task 1, dispatches the agent created in Task 2, fills the template created in Task 3, and edits the same SKILL.md file Task 6 just edited — so Task 7 must run after Task 6 to avoid same-file conflicts)
- Task 8 depends on: Task 2, Task 3, Task 4, Task 5, Task 7 (Task 8 reads all five files modified by the prior tasks — `agent/agents/test-runner.md`, `agent/agents/verifier.md`, `agent/skills/execute-plan/test-runner-prompt.md`, `agent/skills/execute-plan/verify-task-prompt.md`, and the post-Task 7 state of `agent/skills/execute-plan/SKILL.md` — and records the cross-file consistency observations as the smoke-run static substitute)

This produces four execution waves:

- **Wave 1:** Tasks 1, 2, 3, 4, 5 (all parallel — five independent files, no shared editing surface).
- **Wave 2:** Task 6 (sole task; edits SKILL.md Step 11).
- **Wave 3:** Task 7 (sole task; edits SKILL.md Step 7 / Step 12 / Step 16, reading the post-Task 6 state).
- **Wave 4:** Task 8 (sole task; reads all files modified by Tasks 2–7 and writes the smoke-run static substitute report).

Tasks 6 and 7 both modify `agent/skills/execute-plan/SKILL.md`. Splitting them into two waves serializes the SKILL.md edits and avoids same-file conflicts that would arise if they ran in parallel. Task 8 runs last so it can read the final post-Task 7 state of SKILL.md alongside the agent / template files modified in Wave 1.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| The two-phase verifier silently violates recipe-verbatim discipline (e.g., adds flags, paraphrases, or runs probe commands) and the orchestrator fails to detect it. | Medium | High | The Step 11.3 protocol-error routing in Task 6 explicitly checks every `[Evidence for Criterion N]` block's `command:` line for byte-equal match against `{PHASE_1_RECIPES}` and emits `verifier ran command not matching any phase-1 recipe: <command>` on mismatch. This routes through the existing protocol-error path as `VERDICT: FAIL`. The hard rule in Task 4's agent definition is duplicated in Task 5's template `## Phase 1 Verification Recipes` section so the discipline is reinforced both in the agent's identity and in every dispatched prompt. |
| `test-runner` writes a malformed artifact (missing or out-of-order header lines, missing `END_FAILING_IDENTIFIERS`, missing `--- RAW RUN OUTPUT BELOW ---` separator), and the caller's header-parse check fails mid-plan. | Medium | Medium | Task 7's Step 2 documents the four artifact-readback checks (marker, path-equality, file-non-empty, header-parse) and assigns each a distinct one-line failure reason matching the spec's failure-mode list. The header-parse check names which expected line is missing or out of order, so the user can re-dispatch with concrete feedback. The caller does NOT fall back to running the test command itself — the plan stops the call site cleanly. |
| Multiple Step 12 Debugger-first re-tests on the same wave overwrite the prior wave's artifact. | Low | Medium | Task 7 Step 2's filename scheme uses `wave-<N>-attempt-<K>.log` with `<K>` as a 1-based attempt counter incremented on every Step 12 re-entry within the same wave. Step 5 of Task 7 explicitly re-emphasizes "incrementing the wave attempt counter" at every re-test in the Debugger-first flow body and parameter table cell. |
| `crossProvider.cheap` is removed from `~/.pi/agent/model-tiers.json` after this plan ships, breaking `test-runner` dispatch silently. | Low | Medium | The plan does not silently fall back to a non-cross-provider tier — Task 7 Step 2's prose explicitly says "do NOT silently fall back to `cheap`, `standard`, or a CLI default; surface the resolution failure to the user." Task 1's confirmation step is a per-plan-run guard that re-asserts the tier exists. |
| Net SKILL.md line count exceeds the pre-branch baseline because Task 6 and Task 7 add more prose than they remove. | Low | Medium | Task 7 Step 9 explicitly tracks SKILL.md line count before and after with `wc -l`, and Task 7's last acceptance criterion verifies the constraint with a concrete shell recipe. The plan removes Step 11.1 in Task 6 (≈14 lines), the Step 7 identifier-extraction subsection in Task 7 (≈25 lines), the Step 12.2 bash block (≈8 lines), and inline test-command shell at the Debugger-first / Step 16 sites (≈5 lines), totaling ≈52 lines removed. The shared `#### Test-runner dispatch (shared)` subsection adds ≈40 lines once and is referenced by all four call sites; per-site additions are small (≈5 lines each). Net change is expected to be slightly negative, comfortably within the `<=` constraint. |
| The verifier's recipe-verbatim discipline rejects legitimate recipes that contain shell metacharacters (e.g., subshells, pipes), causing false `verifier ran command not matching any phase-1 recipe` errors. | Medium | Medium | The discipline is byte-equal string matching — recipes are compared character-for-character with no normalization. As long as the orchestrator extracts the recipe text from the plan exactly as written (no quoting transforms, no shell-escape) and the verifier executes that string verbatim via `bash -c`, the comparison holds. Plan authors who use complex recipes are already constrained by `generate-plan`'s recipe-quality discipline (no placeholders, no vague "verify manually"); shell-metacharacter recipes are valid as long as both sides round-trip them identically. |
| Smoke run reveals a contract drift between the new `test-runner` artifact format and the orchestrator's header parser. | Medium | Medium | Task 8 records a single report at `.pi/test-runs/smoke-run-static-report.md` with two halves: an automated static cross-file consistency section covering all four spec acceptance points — (a) Step 7 baseline-capture artifact wiring + identifier-extraction inlined in `test-runner`; (b) Step 11 verifier `[Evidence for Criterion N]` block format + `{PHASE_1_RECIPES}` placeholder + preserved output report shape; (c) Step 12.2 post-wave filename scheme + reconciliation linkage + removed in-caller test shell; (d) Step 16 cleanup line + preservation sentences across all seven stop-execution paths — gated by `OVERALL_STATIC: PASS`; AND a manual operator smoke-run gate template requiring an operator to run `execute-plan` against an unrelated existing plan and record per-sub-criterion verdicts plus `OVERALL_MANUAL: PASS` before merge. Both gates are formal merge-blockers. The static section catches structural drift across files at plan-execution time; the manual operator gate catches runtime contract drift (artifact format vs. parser, dispatch failures, reconciliation drift, menu/cleanup behavior) that no static check can detect. |

## Test Command

```bash
npm test --prefix agent
```

The repository's automated test suite covers only the TypeScript extensions under `agent/extensions/`. This plan modifies only markdown files (agent definitions, prompt templates, and a skill body) plus `agent/model-tiers.json` (conditionally — Task 1 is a no-op confirmation under current state). The test suite must still pass unchanged after every wave; running it confirms no extension source was accidentally touched. Acceptance-criterion verification of the markdown changes themselves is by file inspection (the per-task `Verify:` recipes above).

## Self-Review

**Spec coverage:**

- "New `test-runner` agent" — Task 2.
- "`test-runner` artifact-handoff contract (mirrors reviewer-artifact contract)" — Task 2 Steps 4–7 (agent definition); Task 7 Step 2 (caller-side readback contract with the same four checks: marker, path-equality, non-empty, header-parse).
- "`test-runner` invocation points (Step 7, Step 12.2, Step 12 Debugger-first re-test, Step 16)" — Task 7 Steps 3 (Step 7), 4 (Step 12.2), 5 (Step 12 Debugger-first), 6 (Step 16).
- "`test-runner` model tier resolved from `crossProvider.cheap`" — Task 1 (confirmation); Task 7 Step 2 (dispatch site uses the tier explicitly with no silent fallback).
- "`test-runner` artifact storage under `.pi/test-runs/<plan-name>/` with phase-distinct, run-distinct filenames" — Task 7 Step 2 defines `baseline.log`, `wave-<N>-attempt-<K>.log`, `final-gate-<seq>.log`.
- "Cleanup policy on Step 16 success / preservation on `(c) Stop execution`" — Task 7 Steps 7 (cleanup) and 8 (preservation, applied to all seven stop-exit paths).
- "`verifier` extension for evidence collection (bash tool, two phases, recipe-verbatim discipline)" — Task 4 (frontmatter, body, rules, report format).
- "`verify-task-prompt.md` template update (replace `{ORCHESTRATOR_COMMAND_EVIDENCE}` with phase-1 recipe list, preserve other placeholders)" — Task 5.
- "Step 11.1 removal and verifier model tier" — Task 6 Steps 2 (removal) and 4 (`crossProvider.standard` tier replaces `standard`+capable-upgrade rule).
- "Step 7 / Step 12 / Step 16 updates (caller-side test-command shells removed)" — Task 7 Steps 3, 4, 5, 6.
- "No caller-side debugging or source edits" — preserved by design: the plan introduces no new caller-side `Write`/`Edit` site, and the only new shell commands at the caller are `mkdir -p .pi/test-runs/<plan-name>` (Task 7 Step 2) and `rm -rf .pi/test-runs/<plan-name>` (Task 7 Step 7), both orchestration plumbing.
- "Failure-mode lists" — Task 7 Step 2 (six `test-runner` reasons byte-equal to spec); Task 6 Step 5 (three new verifier-with-bash phase-1 reasons routed via Step 11.3 protocol-error path).
- "Net SKILL.md size `<=` current line count" — Task 7 Step 9 plus the corresponding acceptance criterion's concrete `wc -l` check.
- "Smoke run of `execute-plan` against an existing plan confirming the four behaviors (a)–(d)" — Task 8 produces a single report at `.pi/test-runs/smoke-run-static-report.md` containing two complementary halves: (1) an automated static cross-file consistency section covering all four spec acceptance points (gated by `OVERALL_STATIC: PASS`), and (2) an explicit manual operator smoke-run gate template — the same four sub-criteria (a)–(d), each with operator-verdict and evidence placeholder lines plus an `OVERALL_MANUAL:` line — that an operator MUST complete against an unrelated existing plan before this branch is merged. The plan branch is merge-eligible only when both `OVERALL_STATIC: PASS` and `OVERALL_MANUAL: PASS` are present in the report. The runtime smoke run cannot run inside `execute-plan`'s own task-execution context (the plan would have to dispatch itself), so the manual operator gate is the explicit runtime gate; the static section remains as a structural-wiring check that runs automatically alongside it.

**Placeholder scan:** no "TBD", "TODO", "implement later", "similar to Task N", "follow the existing pattern" phrases in any task body. Every step has a concrete action, a concrete artifact to write or edit, and a verifiable success condition.

**`Verify:` recipe coverage:** every acceptance criterion above has its own immediately-following `Verify:` line. Each recipe names the artifact, the check, and the success condition (concrete grep command + expected match count, or open-file-and-confirm + specific text). No recipe is "check that it works" or "verify manually."

**Type / placeholder consistency:**
- Verifier template placeholders: `{TASK_SPEC}`, `{ACCEPTANCE_CRITERIA_WITH_VERIFY}`, `{PHASE_1_RECIPES}`, `{MODIFIED_FILES}`, `{DIFF_CONTEXT}`, `{WORKING_DIR}` — match between Task 5 (template) and Task 6 (SKILL.md template-fill block).
- Test-runner template placeholders: `{TEST_COMMAND}`, `{WORKING_DIR}`, `{ARTIFACT_PATH}`, `{PHASE_LABEL}` — match between Task 3 (template) and Task 7 (SKILL.md dispatch site).
- Failure-mode reason strings: byte-equal between the test-runner six in spec ↔ Task 7 Step 2 (caller-side checks) ↔ Task 7 Step 9 self-review grep ↔ Task 7 acceptance criteria.
- Verifier output report (`[Criterion N] <PASS | FAIL>` and `VERDICT: <PASS | FAIL>`) — preserved byte-for-byte in Tasks 4 and 5; Task 6 confirms Step 11.3's parser-shape paragraph remains unchanged.
- `agent/model-tiers.json` keys (`crossProvider.cheap`, `crossProvider.standard`, `dispatch.openai-codex`) are referenced by name in Tasks 1, 6, and 7; current model-tiers.json (read at plan-write time) confirms all three are present.
