# Simplify execute-plan While Preserving Strong Verification

**Source:** TODO-8b3e7e00
**Spec:** .pi/specs/2026-04-19-execute-plan-simplification.md

## Goal

Simplify the `execute-plan` skill so the workflow is easier to read and operate while preserving its strong verification guarantees (fresh-context per-task verifier, mandatory `Verify:` recipes, no-skip completion, and the three-set integration-regression model with its final-completion gate). Specifically: remove the `Type: correctness|scope|observation` concern protocol end-to-end, replace the per-concern Step 9.7 routing menu with a single compact combined wave-level concerns checkpoint, consolidate the integration-regression prose so it is defined once and reused by Steps 7/11/15, and compact Step 10's verification ceremony without weakening fail-closed behavior. Update `agent/agents/coder.md`, `agent/skills/execute-plan/execute-task-prompt.md`, and `README.md` so the worker contract, task prompt, and top-level narrative match the simplified model.

## Architecture summary

Nothing in the runtime architecture changes. Artifacts still flow: plan markdown → orchestrator reads SKILL.md → per-task coder dispatches (worker prompt filled from `execute-task-prompt.md`, worker contract in `agent/agents/coder.md`) → fresh-context verifier dispatches (prompt filled from `verify-task-prompt.md`, contract in `agent/agents/verifier.md`) → wave commit → integration tests → optional refine-code → final regression gate. The edits are localized to the SKILL.md orchestration prose (Steps 9, 9.7, 10, 11, 15, plus small cross-ref cleanups in 12 and 13), the coder worker contract, the worker prompt template, and the README description paragraph. No agent frontmatter or tool lists change. No new files are created or deleted.

## Tech stack

- Markdown — all edited files (SKILL.md, prompt templates, agent contracts, README)
- Bash (embedded in SKILL.md snippets) — git, test commands, baseline/regression extraction; these remain unchanged in semantics
- No application code is touched; this is a documentation/contract refactor inside `agent/` and the top-level `README.md`

## File Structure

- `agent/agents/coder.md` (Modify) — Replace the typed-concern contract (`Type: correctness`, `Type: scope`, `Type: observation`) in the `STATUS: DONE_WITH_CONCERNS` and Output Format sections with a freeform bullet list. Keep the four status codes, keep the self-review and escalation guidance, keep everything outside the concerns description.
- `agent/skills/execute-plan/execute-task-prompt.md` (Modify) — Update the Report Format block and the `DONE_WITH_CONCERNS` status-code guidance to match the new freeform concerns contract. Remove all `Type:` examples and the "typed concerns will block verification" sentence. Keep the rest of the template intact.
- `agent/skills/execute-plan/verify-task-prompt.md` (Modify) — Relax the `## Diff Context` paragraph so it describes the truncation marker semantically (a marker line indicating omitted diff content, typically with pre-truncation line/byte counts) rather than hard-coding the literal marker shape. This keeps the verifier's fallback behavior intact while matching the simplified Step 10.2 contract in SKILL.md.
- `agent/skills/execute-plan/SKILL.md` (Modify) — Rewrite Step 9's `DONE_WITH_CONCERNS` bullet (drop Type: parsing and the protocol-violation re-dispatch). Replace the whole Step 9.7 block with a compact combined checkpoint that offers exactly three actions (`continue`, `remediate selected tasks`, `stop`) and has no per-concern menus. Update every cross-reference in Steps 10, 11, and 12 that currently says "correctness / scope / observation" or "unresolved correctness/scope concerns" to the simplified contract. Introduce a single "Integration regression model" subsection (placed once, inside Step 7) that defines `baseline_failures`, `deferred_integration_regressions`, `new_regressions_after_deferment`, the disjointness/transition rules, and the reconciliation algorithm. Replace the duplicated bodies of Steps 11 and 15 with references to that subsection plus the wave-specific or final-gate-specific behavior only. Compact Step 10's truncation and protocol-error prose without removing: fresh-context dispatch, `Verify:`-recipe enforcement, the orchestrator-assembled verifier-visible file set, per-criterion coverage/uniqueness/range checks, treating malformed verifier output as `FAIL`, and the never-silently-drop-evidence rule.
- `README.md` (Modify) — Rewrite the "Execute in waves" bullet (currently in the "How it works in practice" list) to drop the sentence about the three typed concern labels and describe the simplified combined concerns checkpoint (continue / remediate selected / stop). Leave the "Verify and commit each wave" bullet substantively alone — its description of the verifier, baseline/deferred/new-regression tracking, and final-completion gate is already accurate and the simplification preserves it.

## Tasks

### Task 1: Make worker concerns freeform in coder.md and execute-task-prompt.md

**Files:**
- Modify: `agent/agents/coder.md`
- Modify: `agent/skills/execute-plan/execute-task-prompt.md`

**Steps:**
- [ ] **Step 1: Read both files in full** — Open `agent/agents/coder.md` and `agent/skills/execute-plan/execute-task-prompt.md` so the downstream edits are made against the live contents, not remembered contents.
- [ ] **Step 2: Rewrite the `STATUS: DONE_WITH_CONCERNS` section in `agent/agents/coder.md`** — Replace the current block (which enumerates `Type: correctness`, `Type: scope`, `Type: observation` and forbids untyped concerns) with this exact text:

  ```markdown
  ### `STATUS: DONE_WITH_CONCERNS`
  Task completed, but you have doubts worth surfacing to the orchestrator before verification runs. After the status line, list your concerns as a freeform bullet list — one concern per line, written as a plain sentence. Do not prefix concerns with type labels; the orchestrator no longer routes on concern type.

  Use this status only when you genuinely cannot report `DONE` with confidence. If you have no concerns, use `DONE`. If you cannot complete the task at all, use `BLOCKED` or `NEEDS_CONTEXT` instead.
  ```

- [ ] **Step 3: Update the Output Format block in `agent/agents/coder.md`** — In the fenced example under `## Output Format`, replace the current `## Concerns / Needs / Blocker` comment block (which tells the worker each concern line MUST start with `Type: ...`) with:

  ```markdown
  ## Concerns / Needs / Blocker
  (only for DONE_WITH_CONCERNS, NEEDS_CONTEXT, or BLOCKED)
  For `DONE_WITH_CONCERNS`, list concerns as freeform bullets — one concern per line. Do not prefix lines with `Type:` labels.
  ```

  Do not change anything else inside the fenced block. Leave the surrounding `Conventions` and `Rules` sections untouched.

- [ ] **Step 4: Rewrite the `DONE_WITH_CONCERNS` guidance in `execute-task-prompt.md`** — In the `## Report Format` fenced block, replace the current `## Concerns / Needs / Blocker` instructions (which say "For DONE_WITH_CONCERNS, emit one typed concern per line. Each line MUST start with exactly one of: Type: correctness ...") with:

  ```markdown
  ## Concerns / Needs / Blocker
  (only for DONE_WITH_CONCERNS, NEEDS_CONTEXT, or BLOCKED)

  For DONE_WITH_CONCERNS, list concerns as a freeform bullet list — one concern per line, written as a plain sentence. Do not prefix concerns with type labels.
  ```

  Do not change the surrounding `STATUS:`, `## Completed`, `## Tests`, `## Files Changed`, or `## Self-Review Findings` sections.

- [ ] **Step 5: Update the "Status code guidance" list in `execute-task-prompt.md`** — Replace the `DONE_WITH_CONCERNS` bullet (currently mentions "typed doubts", "correctness and scope concerns will block verification at the wave-level checkpoint", and "observation concerns will require explicit acknowledgment") with:

  ```markdown
  - `DONE_WITH_CONCERNS` — work complete but you have doubts worth surfacing. List concerns as freeform bullets — do not use `Type:` labels. The orchestrator will surface your concerns at a combined wave-level checkpoint before verification; the user decides whether to remediate or continue.
  ```

  Leave the `DONE`, `NEEDS_CONTEXT`, and `BLOCKED` bullets unchanged.

- [ ] **Step 6: Grep both files to confirm no `Type:` residue remains** — After the edits, run `grep -n "Type: correctness\|Type: scope\|Type: observation\|typed concern\|Type: " agent/agents/coder.md agent/skills/execute-plan/execute-task-prompt.md`. Expected: no output (exit code 1). If any match remains, remove the offending line and re-run.

**Acceptance criteria:**
- `agent/agents/coder.md` no longer instructs workers to emit `Type: correctness`, `Type: scope`, or `Type: observation` concerns and describes the `DONE_WITH_CONCERNS` output as a freeform bullet list.
  Verify: `grep -n "Type: correctness\|Type: scope\|Type: observation" agent/agents/coder.md` returns no matches, AND `grep -n "freeform bullet" agent/agents/coder.md` returns at least one match inside the `STATUS: DONE_WITH_CONCERNS` block.
- The `## Output Format` block in `agent/agents/coder.md` describes `DONE_WITH_CONCERNS` concerns as freeform lines without `Type:` prefixes.
  Verify: read the `## Output Format` fenced block in `agent/agents/coder.md` and confirm the `## Concerns / Needs / Blocker` comment says concerns are freeform bullets and does not mention `Type:` prefixes.
- `agent/skills/execute-plan/execute-task-prompt.md` no longer requires typed concerns and the `DONE_WITH_CONCERNS` status-code bullet describes a simplified combined checkpoint rather than per-type routing.
  Verify: `grep -n "Type: correctness\|Type: scope\|Type: observation\|typed" agent/skills/execute-plan/execute-task-prompt.md` returns no matches, AND `grep -n "freeform" agent/skills/execute-plan/execute-task-prompt.md` returns at least one match inside the `## Report Format` or `Status code guidance` section.

**Model recommendation:** cheap

### Task 2: Simplify Step 9 worker handling and replace Step 9.7 with a compact combined concerns checkpoint in SKILL.md

**Files:**
- Modify: `agent/skills/execute-plan/SKILL.md`

**Steps:**
- [ ] **Step 1: Read the file** — Open `agent/skills/execute-plan/SKILL.md` in full so the edits are made against the live contents. Note the current line ranges for Step 9 (starts at `## Step 9: Handle worker status codes`), Step 9.5, Step 9.7 (starts at `## Step 9.7: Wave-level concerns checkpoint`), the first line of Step 10, and every occurrence of `Type: correctness`, `Type: scope`, `Type: observation`, `typed concerns`, `correctness/scope`, or `unresolved correctness/scope concerns` elsewhere in the file.
- [ ] **Step 2: Rewrite the `DONE_WITH_CONCERNS` bullet in Step 9** — In the "## Step 9: Handle worker status codes" section, replace the entire `- **DONE_WITH_CONCERNS** →` bullet (the current paragraph starting `→ record the task's typed concerns as reported by the worker (Type: correctness, Type: scope, Type: observation). ... (This protocol-violation re-dispatch does NOT count against the Step 12 shared retry counter — it is a spec-compliance correction, not a task retry.)`) with:

  ```markdown
  - **DONE_WITH_CONCERNS** → record the worker's freeform concerns with the task. Do NOT resolve the checkpoint inline. Let the wave drain, then Step 9.7 presents a single combined wave-level concerns checkpoint for every `DONE_WITH_CONCERNS` task in the wave before Step 10 runs. Concerns do not need type labels and are not preclassified by severity.
  ```

  Leave the `DONE`, `NEEDS_CONTEXT`, and `BLOCKED` bullets and the surrounding framing sentences ("After the wave drains...", "Never ignore an escalation...") unchanged, except remove any remaining mention of "typed concerns" in those framing sentences (the sentence currently reads `After the wave drains (i.e., every dispatched worker in the wave has returned and been classified), Step 9.5 runs first to handle any BLOCKED tasks. Step 9.7 then runs to handle any DONE_WITH_CONCERNS tasks. Only after both gates exit does Step 10 (verification) run.` — this sentence is already correct and needs no edit).

- [ ] **Step 3: Replace the entire Step 9.7 section** — Delete every line from the `## Step 9.7: Wave-level concerns checkpoint` heading through (and including) the final line of that section (`## Step 9.7`'s `### 5. Gate exit` paragraph) up to but NOT including the next heading `## Step 10: Verify wave output`. Replace the deleted block with this exact content:

  ```markdown
  ## Step 9.7: Wave-level concerns checkpoint

  Run this gate once per wave after Step 9.5 has exited and before Step 10, whenever at least one task in the drained wave has Step 9 status `DONE_WITH_CONCERNS`. Its job is to surface every concerned task to the user in a single combined view and let the user decide how to proceed for the wave as a whole.

  **Precondition:** Step 9.5 has exited. Every task in the wave has a Step 9 status of `DONE` or `DONE_WITH_CONCERNS`.

  ### 1. Collect concerned tasks

  Build `CONCERNED_TASKS` = the ordered list of every task in the wave whose Step 9 status was `DONE_WITH_CONCERNS`. For each entry, carry along the task id, the task title, the worker's `## Concerns / Needs / Blocker` bullet lines verbatim (freeform — no `Type:` prefixes), and the list of files the task modified (`## Files Changed`). If `CONCERNED_TASKS` is empty, skip this gate entirely and proceed to Step 10.

  ### 2. Present one combined view

  Do not prompt one-task-at-a-time. Wait until the wave is fully drained and Step 9.5 has exited, then present every concerned task together in a single combined message:

  ```
  ⚠️ Wave <N>: <M> task(s) returned DONE_WITH_CONCERNS. Review before verification.

  ── Task 3: <short title> ──────────────────────────────────
    Files: <path/one>, <path/two>
    Concerns:
      - <worker concern, verbatim>
      - <worker concern, verbatim>

  ── Task 5: <short title> ──────────────────────────────────
    Files: <path/one>
    Concerns:
      - <worker concern, verbatim>
  ───────────────────────────────────────────────────────────

  Options:
    (c) Continue to verification            — proceed to Step 10 with all tasks as-is
    (r) Remediate selected task(s)          — specify task number(s) and guidance; re-dispatch those tasks
    (x) Stop execution                      — halt the plan; committed waves are preserved as checkpoints
  ```

  This is the whole user interaction for the gate. There is no per-concern menu, no severity routing, and no "acknowledge" step. The user decides for the wave as a whole, with per-task granularity available only inside the `(r)` path.

  ### 3. Apply the user's choice

  - **(c) Continue to verification.** Exit the gate. Leave every concerned task's Step 9 status as `DONE_WITH_CONCERNS` and proceed to Step 10; the verifier is the next gate and will judge the work on its own terms.
  - **(r) Remediate selected task(s).** Prompt the user for (a) the task numbers to remediate (one or more from `CONCERNED_TASKS`) and (b) a single freeform guidance block that applies to those tasks. Re-dispatch each selected task to a fresh `coder` worker using the same task spec, with the worker's original concerns block and the user's guidance appended under a `## Concerns To Address` section in the worker prompt. Each re-dispatch counts against that task's Step 12 retry budget (shared counter described in Step 12). When the re-dispatches return, apply Step 9 again. If any re-dispatched task comes back `BLOCKED`, return to Step 9.5 with that task. Otherwise rebuild `CONCERNED_TASKS` from the new wave state and re-enter this gate from §1; a task that returns `DONE` after remediation is removed from `CONCERNED_TASKS`, and a task that returns `DONE_WITH_CONCERNS` again re-appears in the next combined view. Tasks that were not selected for remediation keep their prior Step 9 status and re-appear unchanged in the next view.
  - **(x) Stop execution.** Halt immediately via Step 13. Do NOT run Step 10 or Step 11 for this wave. All prior wave commits remain as checkpoints.

  Repeat §2–§3 until `CONCERNED_TASKS` is empty (either because the user picked `(c)` or because every concerned task has been remediated to `DONE`) or the user picks `(x)`.

  ### 4. Gate exit

  Exit this gate when either (a) the user picked `(c) Continue to verification` on the most recent view, or (b) every task in the wave has Step 9 status `DONE` after remediation. The wave is then eligible for Step 10. The only other exit is `(x) Stop execution`, which halts the plan via Step 13.

  When `(c)` is the exit, tasks whose status is still `DONE_WITH_CONCERNS` flow into Step 10 unchanged — the verifier judges them against acceptance criteria the same way it judges `DONE` tasks. The orchestrator does not treat `DONE_WITH_CONCERNS` as an automatic fail into Step 10; the verifier's verdict is authoritative.
  ```

  (Keep the three-backtick fences inside the replacement block exactly as shown — the outer fence is the markdown code block the orchestrator reads, and the inner fenced block is the user-facing UI example.)

- [ ] **Step 4: Update Step 10's precondition to match the simplified gate** — Find the "**Precondition:**" paragraph at the top of `## Step 10: Verify wave output` (currently: `Only run this step after both the Step 9.5 blocked-task escalation gate and the Step 9.7 wave-level concerns checkpoint have exited. ...`). Rewrite it to:

  ```markdown
  **Precondition:** Only run this step after both the Step 9.5 blocked-task escalation gate and the Step 9.7 wave-level concerns checkpoint have exited. If any task in the current wave still has a Step 9 status of `BLOCKED`, do not run wave verification — return to Step 9.5. If the Step 9.7 checkpoint has not yet been presented and resolved for this wave, do not run wave verification — return to Step 9.7. A wave with any unresolved `BLOCKED` task or a Step 9.7 checkpoint that has not yet been resolved is NOT considered successfully completed. Tasks that exit Step 9.7 with status `DONE_WITH_CONCERNS` proceed to verification as-is; the verifier's per-criterion verdict is authoritative.
  ```

- [ ] **Step 5: Update Step 11's precondition paragraph** — Find the "**Precondition:**" paragraph at the top of `## Step 11: Post-wave commit and integration tests`. Replace any clause that mentions `Type: correctness`, `Type: scope`, `unresolved correctness/scope concerns`, or "such concerns can never be 'acknowledged and continued' past this gate" with simplified text that references only Step 9.5, Step 9.7 exit, and Step 10 verification pass. Suggested rewrite:

  ```markdown
  **Precondition:** Only run this step after Step 9.5 (blocked-task escalation gate) has exited, Step 9.7 (combined concerns checkpoint) has exited, and Step 10 (wave verification) has passed. If any task in the current wave still has a Step 9 status of `BLOCKED`, do not commit and do not run integration tests — return to Step 9.5. If Step 9.7 has not yet been resolved for this wave, return to Step 9.7. If any task in the wave still carries `VERDICT: FAIL` from Step 10 (including malformed verifier output treated as `FAIL`), do not commit and do not run integration tests — return to Step 12's retry loop until every task has `VERDICT: PASS`. Both the post-wave commit and the post-wave integration-test run are withheld until the wave completes successfully (every wave task non-`BLOCKED`, Step 9.7 exited via `(c)` or remediation, and `VERDICT: PASS` from Step 10).
  ```

  Only replace this precondition paragraph. Do NOT edit the rest of Step 11 in this task — the regression-model consolidation is Task 3's scope.

- [ ] **Step 6: Update Step 12 references to simplified concerns** — In `## Step 12: Handle failures and retries`, replace every occurrence of "unresolved Step 9.7 correctness/scope concerns" or "has unresolved `Type: correctness` or `Type: scope` concerns from Step 9.7" with "Step 9.7 has not yet exited via `(c) Continue` or remediation". Keep the retry-counter semantics (shared counter, sub-task budget rule, reset on explicit `Retry again`) unchanged — only the concern-type-specific wording is edited. The "Shared counter" sentence that currently lists "Step 9.7 §4 (concerned-task re-dispatch via `(r)`)" must also be updated, because under the simplified Step 9.7 the `(r)` remediation flow lives in `### 3. Apply the user's choice`, not in §4. Rewrite that parenthetical to drop the stale subsection number — use the generic reference "Step 9.7 `(r)` remediation (concerned-task re-dispatch)" instead of "Step 9.7 §4 (concerned-task re-dispatch via `(r)`)" so the cross-reference stays correct regardless of future subsection renumbering. Do not change any other clause of the "Shared counter" sentence.
- [ ] **Step 7: Scrub remaining `Type: correctness|scope|observation` occurrences in SKILL.md** — Run `grep -n "Type: correctness\|Type: scope\|Type: observation\|typed concern\|correctness/scope\|correctness or scope" agent/skills/execute-plan/SKILL.md`. For each remaining match outside the ranges already rewritten in this task, delete or rephrase the offending line so it matches the simplified model (e.g. "unresolved correctness/scope concerns" → "an unresolved Step 9.7 checkpoint"). Do NOT touch identifiers inside other steps' code blocks that are not about concerns (none are expected, but confirm). Re-run the grep afterwards; expected output is empty (exit code 1 under ripgrep conventions).

**Acceptance criteria:**
- SKILL.md Step 9's `DONE_WITH_CONCERNS` bullet records freeform concerns and no longer mentions `Type: correctness`, `Type: scope`, `Type: observation`, or protocol-violation re-dispatch for untyped concerns.
  Verify: read the `## Step 9: Handle worker status codes` section in `agent/skills/execute-plan/SKILL.md` and confirm the `DONE_WITH_CONCERNS` bullet uses the word "freeform" and does NOT contain the substrings "Type: correctness", "Type: scope", "Type: observation", or "protocol violation".
- SKILL.md Step 9.7 presents a single combined view for the whole wave, with exactly three options `(c)` Continue / `(r)` Remediate selected task(s) / `(x)` Stop, and no per-concern menu or severity routing.
  Verify: read the `## Step 9.7: Wave-level concerns checkpoint` section and confirm the user-facing UI block lists exactly the three options `(c) Continue to verification`, `(r) Remediate selected task(s)`, and `(x) Stop execution`, AND `grep -n "observation-only\|Type: correctness\|Type: scope\|Type: observation" agent/skills/execute-plan/SKILL.md` returns no matches inside the Step 9.7 block. (The word "severity" is allowed inside Step 9.7 because the mandated prose names severity routing as explicitly absent — the check excludes it.)
- SKILL.md cross-references to the simplified concerns model are consistent in Steps 10, 11, and 12 (no mention of typed severity buckets).
  Verify: `grep -n "Type: correctness\|Type: scope\|Type: observation\|correctness/scope\|correctness or scope" agent/skills/execute-plan/SKILL.md` returns no matches anywhere in the file.
- Step 9.7 still pauses before Step 10 whenever the drained wave has at least one `DONE_WITH_CONCERNS` task, and only exits on `(c)`, full remediation to `DONE`, or `(x)`.
  Verify: read Step 9.7 §4 and confirm it names exactly the three exit conditions "(c)", "every task resolved to `DONE` after remediation", and "(x) Stop execution", and explicitly says Step 10 runs after the gate exits on `(c)` or remediation.

**Model recommendation:** capable

### Task 3: Consolidate the integration-regression model into one referenced subsection in SKILL.md

**Files:**
- Modify: `agent/skills/execute-plan/SKILL.md`

**Steps:**
- [ ] **Step 1: Read the file fresh** — Open `agent/skills/execute-plan/SKILL.md` after Task 2's edits have landed. Locate `## Step 7: Baseline test capture`, `## Step 11: Post-wave commit and integration tests` → "Three-set integration tracking" / "Reconciliation" / "Pass/fail classification" / "User-facing summary" / "Menu" / "Debugger-first flow" subsections, and `## Step 15: Complete` → "Final integration regression gate (precondition)" / "Final-gate debugger-first flow".
- [ ] **Step 2: Create one canonical "Integration regression model" subsection inside Step 7** — Insert a new subsection immediately after the "#### Baseline recording" subsection of Step 7. Use this exact heading and content:

  ```markdown
  #### Integration regression model (referenced by Steps 11 and 15)

  The post-wave and final integration runs classify failures against three explicitly tracked sets of test identifiers. Identifiers are extracted from the test runner's output via the "Identifier-extraction contract" above so that all comparisons below are exact set operations on identifier strings.

  1. **`baseline_failures`** — failures from the Step 7 baseline run. Frozen at baseline capture. Never mutated afterwards. Represents pre-existing failures the plan did not introduce.
  2. **`deferred_integration_regressions`** — regressions the user has chosen to defer via `(b) Defer integration debugging` on an intermediate wave. Starts empty. Grows only on `(b)`. Reconciled on every subsequent integration run (see below).
  3. **`new_regressions_after_deferment`** — failures in the current integration run that are neither pre-existing (`baseline_failures`) nor previously deferred (`deferred_integration_regressions`). Recomputed from scratch on every run; never persisted. This set drives the pass/fail classification and is the target scope of the `(a) Debug failures` and `(b) Defer integration debugging` menu actions.

  `current_failing` is NOT one of the three tracked sets. It is transient input: the set of failing-test identifiers from the just-completed run, extracted via the contract above, used solely as input to the reconciliation step and discarded afterwards.

  **Disjointness and transition rules:**
  - `baseline_failures` and `deferred_integration_regressions` MUST remain disjoint: before adding identifiers to `deferred_integration_regressions`, subtract `baseline_failures`.
  - `new_regressions_after_deferment` is disjoint from the other two by construction (via reconciliation step 4).
  - A test exits `deferred_integration_regressions` only when it is no longer in `current_failing` (via reconciliation). It never transitions into `baseline_failures`; the baseline is frozen at Step 7.
  - Only `baseline_failures` and `deferred_integration_regressions` are carried across waves; `new_regressions_after_deferment` is always recomputed from scratch.

  **Reconciliation algorithm** (applied on every post-wave integration run and at the Step 15 final gate):
  1. `current_failing` := identifiers from the current run (Identifier-extraction contract).
  2. `still_failing_deferred := deferred_integration_regressions ∩ current_failing`.
  3. `cleared_deferred := deferred_integration_regressions \ current_failing` — report briefly as "Cleared deferred regressions: <list>" if non-empty.
  4. `deferred_integration_regressions := still_failing_deferred` (reconciliation; stale identifiers are dropped).
  5. `new_regressions_after_deferment := current_failing \ (baseline_failures ∪ deferred_integration_regressions)`.

  After step 5, the classification is driven by `new_regressions_after_deferment` at the wave level and by `still_failing_deferred ∪ new_regressions_after_deferment` at the final gate (Step 15).

  **User-facing summary format:**
  - **Fully-clean suite** — `baseline_failures ∩ current_failing`, post-reconciliation `deferred_integration_regressions`, and `new_regressions_after_deferment` are ALL empty. Render briefly: `✅ Integration tests pass after wave <N> (no failures).` (At the final gate, substitute `final integration gate` for `wave <N>`.)
  - **Not fully clean** — any of the three sets is non-empty. Render the three-section block below (every section is always present; empty lists render as `(none)`):

    ```
    <header line>

    ### Baseline failures
    <list of tests in baseline_failures ∩ current_failing>

    ### Deferred integration regressions
    <list of tests in deferred_integration_regressions (post-reconciliation)>

    ### New regressions in this wave
    <list of tests in new_regressions_after_deferment>
    ```

    The header line depends on the caller: Step 11 uses `✅ Integration tests pass after wave <N> (no new regressions; baseline and/or deferred failures remain — see below).` on the pass path and `❌ Integration tests failed after wave <N>.` on the fail path. Step 15 uses `⚠️ Final completion blocked: plan-introduced integration regressions remain.` whenever the final gate is blocked (even though the third section's heading is still literally `New regressions in this wave` — the heading is reused verbatim so the three-section contract is identical across callers).
  ```

  Do not change the preceding "#### Identifier-extraction contract" or "#### Baseline recording" subsections.

- [ ] **Step 3: Replace the duplicated bodies of Step 11's "Three-set integration tracking", "Reconciliation", "Pass/fail classification", and "User-facing summary" subsections** — In `## Step 11: Post-wave commit and integration tests`, `### 2. Run integration tests`, delete the four subsections currently titled `#### Three-set integration tracking`, `#### Reconciliation`, `#### Pass/fail classification`, and `#### User-facing summary`, and replace them with:

  ```markdown
  #### Classification

  Apply the "Integration regression model" defined in Step 7 to the post-wave test output. Use the "Reconciliation algorithm" to update `deferred_integration_regressions` and compute `new_regressions_after_deferment`, then classify:

  - **Pass** — `new_regressions_after_deferment` is empty. Render the user-facing summary per the Step 7 "User-facing summary format" (brief on a fully-clean suite; three-section block otherwise) and proceed to the next wave.
  - **Fail** — `new_regressions_after_deferment` is non-empty. Render the three-section block with the fail header (`❌ Integration tests failed after wave <N>.`) and present the failure menu below.
  ```

  Leave the existing "#### Menu" subsection (intermediate-wave menu, final-wave menu) and the "### Debugger-first flow" subsection in Step 11 unchanged — they describe wave-time behavior that Step 15's flow explicitly does not reuse. The "Debugger-first flow" internally already calls "the Step 11 'Reconciliation' sub-section" to judge success — update that phrase to read "the Step 7 reconciliation algorithm" so the reference points at the consolidated location.

- [ ] **Step 4: Replace the duplicated body of Step 15's "Final integration regression gate"** — In `## Step 15: Complete` → `### Final integration regression gate (precondition)`, replace the three sub-steps titled `1. Re-run the full integration suite`, `2. Apply the full Step 11 three-set classification`, and `3. Gate on the union ...` with a compacted version:

  ```markdown
  1. **Re-run the full integration suite** using the same test command from Step 3. Extract failing identifiers via the Step 7 "Identifier-extraction contract".
  2. **Apply the Step 7 reconciliation algorithm** to the run output — the same algorithm used after every wave. It reconciles `deferred_integration_regressions` against `current_failing` and computes `new_regressions_after_deferment`.
  3. **Gate on `still_failing_deferred ∪ new_regressions_after_deferment`:**
     - If **both** sets are empty, the gate passes. Proceed to `### 1. Move plan to done`.
     - If **either** set is non-empty, the plan cannot be marked complete. Render the Step 7 three-section block with the final-gate header (`⚠️ Final completion blocked: plan-introduced integration regressions remain.`) and present the menu below.

     Empty lists render as `(none)`. The menu mirrors the Step 11 **final-wave menu** — no `(b) Defer` option at this gate by design.

     ```
     Options:
     (a) Debug failures now — run the final-gate debugger-first flow (below) against the plan-introduced regressions (deferred ∪ new); on success, re-enter this gate.
     (c) Stop execution     — halt plan execution; all committed wave commits are preserved as checkpoints.
     ```
  ```

  Leave the existing `4. Menu actions` subsection unchanged (its semantics are already the canonical action definitions for `(a)` and `(c)`), and leave the `### Final-gate debugger-first flow` subsection unchanged in scope — it already correctly defines the plan-execution-range flow that is specific to Step 15. Only update its internal references "the Step 11 reconciliation logic" and "Step 11 'Reconciliation' sub-section" to "the Step 7 reconciliation algorithm" so the references point at the consolidated definition.

- [ ] **Step 5: Sanity-check cross-references and disjointness wording** — Run `grep -n "three-set\|three tracked sets\|baseline_failures\|deferred_integration_regressions\|new_regressions_after_deferment" agent/skills/execute-plan/SKILL.md` and confirm: (a) the canonical definitions of the three sets appear exactly once (inside Step 7's "Integration regression model" subsection); (b) Step 11 and Step 15 reference the Step 7 definition rather than restating the disjointness / transition rules; (c) the reconciliation algorithm is defined exactly once. Trim any residual restatements in Steps 11/15 that slipped past Steps 3–4.

**Acceptance criteria:**
- Step 7 of SKILL.md contains a single canonical "Integration regression model" subsection that defines the three sets, disjointness rules, reconciliation algorithm, and user-facing summary format.
  Verify: `grep -n "Integration regression model" agent/skills/execute-plan/SKILL.md` returns at least one match inside the `## Step 7: Baseline test capture` section, AND the subsection body contains the substrings "baseline_failures", "deferred_integration_regressions", "new_regressions_after_deferment", and "Reconciliation algorithm".
- Step 11's integration-test subsection references the Step 7 model rather than restating it.
  Verify: read `## Step 11: Post-wave commit and integration tests` → `### 2. Run integration tests` and confirm it contains the phrase "Integration regression model" (or "Step 7 reconciliation algorithm") as a reference and no longer contains a `#### Three-set integration tracking` subsection, a `#### Reconciliation` subsection, a `#### Pass/fail classification` subsection, or a `#### User-facing summary` subsection.
- Step 15's "Final integration regression gate (precondition)" references the Step 7 model and preserves the existing final-gate menu and final-gate debugger-first flow semantics.
  Verify: read `## Step 15: Complete` → `### Final integration regression gate (precondition)` and confirm it contains the phrase "Step 7 reconciliation algorithm" (as a reference) and no longer restates the three-set classification algorithm inline; AND confirm the `(a) Debug failures now` / `(c) Stop execution` menu is still present with no `(b)` option.
- The three-set classification algorithm and disjointness rules are defined exactly once in the file.
  Verify: `grep -cE "baseline_failures\` and \`deferred_integration_regressions\` MUST remain disjoint" agent/skills/execute-plan/SKILL.md` returns 1 (exactly one occurrence, inside Step 7's new subsection). The pattern includes the literal backticks around both identifiers, matching the inserted markdown exactly.
- Final completion is still blocked when `still_failing_deferred ∪ new_regressions_after_deferment` is non-empty.
  Verify: read the `### Final integration regression gate (precondition)` subsection and confirm the gate paragraph explicitly names both sets in the blocking union and says the plan cannot be marked complete while either is non-empty.

**Model recommendation:** capable

### Task 4: Compact Step 10 verification prose while preserving fail-closed behavior

**Files:**
- Modify: `agent/skills/execute-plan/SKILL.md`
- Modify: `agent/skills/execute-plan/verify-task-prompt.md`

**Steps:**
- [ ] **Step 1: Read both files fresh** — Open `agent/skills/execute-plan/SKILL.md` after Tasks 2 and 3 have landed. Locate `## Step 10: Verify wave output`, `### Step 10.1: Orchestrator collects command evidence`, `### Step 10.2: Dispatch the verifier`, and `### Step 10.3: Parse verifier output and gate the wave`. Also open `agent/skills/execute-plan/verify-task-prompt.md` and locate the `## Diff Context` section, which currently tells the verifier to look for a specific literal marker shape (`... [diff truncated — <N> lines, <B> bytes total; ...] ...`).
- [ ] **Step 2: Tighten the Step 10 protocol-error-stop paragraph** — Keep the behavior (if any acceptance criterion lacks a `Verify:` recipe, STOP and refuse to verify), but soften the "exact literal error message" wording. Replace the current paragraph (`Protocol-error stop — missing Verify: recipes: Before dispatching the verifier, check that every acceptance criterion for the task has an attached Verify: recipe in the plan. If any acceptance criterion is missing a Verify: recipe at execute time, STOP with the exact literal error message: ... Do not dispatch the verifier, do not treat the task as passing, and do not silently skip verification. A plan without complete Verify: recipes is a protocol error from generate-plan and must be regenerated.`) with:

  ```markdown
  **Protocol-error stop — missing `Verify:` recipes:** Before dispatching the verifier, check that every acceptance criterion for the task has an attached `Verify:` recipe in the plan. If any acceptance criterion is missing a `Verify:` recipe at execute time, STOP execution for this wave. Report the offending task number and criterion text to the user, recommend re-running `generate-plan` to regenerate the plan, and do not dispatch the verifier, do not treat the task as passing, and do not silently skip verification. A plan without complete `Verify:` recipes is a protocol error from generate-plan and must be regenerated before execution can continue.
  ```

  The fail-closed behavior (no dispatch, no silent pass, no skip) is preserved; only the exact-string requirement is dropped.

- [ ] **Step 3: Compact the Step 10.1 truncation prose** — Replace the current "Deterministic truncation rule" paragraph with a tighter version that preserves the first-100 / last-50 semantics, independent-stream application, and the "verifier FAIL for insufficient evidence" rule, but drops the literal marker-string requirement:

  ```markdown
  **Truncation rule (command evidence).** Apply this rule independently to each stream (stdout and stderr) of a recipe. If a single stream exceeds 200 lines or 20 KB, truncate it by keeping the first 100 lines and the last 50 lines, separated by a single marker line that records the pre-truncation line count and byte count (e.g., `[<N> lines, <B> bytes; truncated to first 100 + last 50]`). Apply the rule to each stream independently; never combine streams for the threshold calculation, and never silently drop output. If the relevant evidence for a criterion falls inside the truncated window, the verifier MUST return `FAIL` with `reason: insufficient evidence` for that criterion rather than guessing.
  ```

  Leave the rest of Step 10.1 (evidence-block shape, file-inspection vs prose-inspection recipes) unchanged except for any cross-references to the old literal marker string.

- [ ] **Step 4: Compact the Step 10.2 diff truncation prose** — Inside the `{DIFF_CONTEXT}` placeholder description, replace the current "Diff truncation rule" paragraph with:

  ```markdown
  **Diff truncation rule.** If the combined diff output exceeds 500 lines or 40 KB, truncate it by keeping the first 300 lines and the last 100 lines, separated by a single marker line that records the pre-truncation line count and byte count (e.g., `[diff truncated — <N> lines, <B> bytes total; verifier should note this and fall back to reading the named files for file-inspection criteria whose relevant code may lie in the truncated window]`). Never silently drop diff output. If a file-inspection criterion cannot be judged because the relevant hunk is inside the truncated window, the verifier should read the named file(s) directly from `## Verifier-Visible Files` rather than guessing.
  ```

  Leave the verifier-visible file set assembly rules (task-declared scope ∪ worker-reported changes ∪ orchestrator-observed diff state) exactly as they are — those rules are load-bearing for verification integrity. Leave the sub-task-dispatch carve-out paragraph unchanged.

- [ ] **Step 5: Compact Step 10.3's malformed-output prose while preserving the four coverage checks** — In `### Step 10.3: Parse verifier output and gate the wave`, keep the per-criterion header shape (`[Criterion N] <PASS | FAIL>`) and the `VERDICT: <PASS | FAIL>` overall line as the parse contract. Keep the four coverage/uniqueness/range checks (Count, Coverage, Uniqueness, Range) intact — these are load-bearing for fail-closed verification. Soften only the restated ceremonial prose about "malformed output is treated as FAIL" by consolidating it into one short paragraph at the end of the subsection:

  ```markdown
  **Protocol-error routing.** Any malformed verifier output — missing or extra criterion blocks, duplicate criterion numbers, out-of-range numbers, a `verdict:` prefix, lowercase verdict tokens, or an unparseable overall verdict line — is treated exactly as `VERDICT: FAIL` for the task. The orchestrator routes it into Step 12's retry loop with a concrete description of the protocol violation (e.g. "missing [Criterion 3]", "duplicate [Criterion 2]", "out-of-range [Criterion 5] when K=4") so the re-dispatched verifier has a concrete target to fix. Protocol errors never pass the wave gate and are never silently interpreted as `PASS`.
  ```

  Delete or rewrite any earlier duplicate paragraphs in Step 10.3 that restate the same rule, so the fail-closed behavior is described exactly once.

- [ ] **Step 6: Update the `## Diff Context` section in `verify-task-prompt.md` to match the relaxed marker contract** — In `agent/skills/execute-plan/verify-task-prompt.md`, find the `## Diff Context` section. Replace the current paragraph (which reads `The orchestrator may have truncated this diff if it exceeded a size threshold. If you see a \`... [diff truncated — <N> lines, <B> bytes total; ...] ...\` marker, note this in your per-criterion \`reason:\` where it affects judgment, and fall back to reading the file(s) in \`## Verifier-Visible Files\` directly for any file-inspection criterion whose relevant code may lie in the truncated window.`) with:

  ```markdown
  The orchestrator may have truncated this diff if it exceeded a size threshold. If you see a truncation marker line in the diff — any single line indicating that diff content was omitted, typically including the pre-truncation line count and byte count — note this in your per-criterion `reason:` where it affects judgment, and fall back to reading the file(s) in `## Verifier-Visible Files` directly for any file-inspection criterion whose relevant code may lie in the truncated window.
  ```

  Do not change any other section of `verify-task-prompt.md`. The relaxed wording describes truncation semantically rather than by literal marker text, matching the simplified Step 10.2 contract in SKILL.md.

- [ ] **Step 7: Verify fail-closed and evidence-integrity rules are still present** — After the edits, run `grep -n "fresh-context\|Verify-recipe\|orchestrator-assembled\|never silently\|VERDICT: FAIL\|\[Criterion N\]\|insufficient evidence\|protocol error" agent/skills/execute-plan/SKILL.md`. Confirm each of the following appears at least once inside the `## Step 10` block: "fresh-context" (verifier dispatch), "orchestrator-assembled" (verifier-visible file set), "never silently drop" (truncation integrity), "[Criterion N]" (per-criterion header contract), "VERDICT: FAIL" (malformed = fail), "insufficient evidence" (verifier behavior under truncation), and "protocol error" (Step 10.3 routing). If any is missing, restore the corresponding semantic rule.

**Acceptance criteria:**
- Step 10 still dispatches a fresh-context verifier with an orchestrator-assembled verifier-visible file set and does not read code and judge criteria in the orchestrator.
  Verify: read `## Step 10: Verify wave output` and confirm it contains the phrases "fresh-context" (verifier dispatch) and "orchestrator-assembled" (verifier-visible file set) and still explicitly says the orchestrator does NOT judge acceptance criteria directly.
- Step 10 still treats missing `Verify:` recipes as a stop condition and still treats malformed verifier output as `VERDICT: FAIL`.
  Verify: read `## Step 10: Verify wave output` and confirm (a) the protocol-error-stop paragraph still says the orchestrator does not dispatch the verifier and does not treat the task as passing when a criterion lacks a `Verify:` recipe, AND (b) the Step 10.3 protocol-error-routing paragraph still says malformed output is routed into Step 12's retry loop exactly as `VERDICT: FAIL`.
- Step 10.1 and Step 10.2 truncation rules preserve "never silently drop" evidence and still direct the verifier to return `FAIL` when truncation hides the evidence.
  Verify: `grep -n "never silently drop\|insufficient evidence" agent/skills/execute-plan/SKILL.md` returns at least one match inside each of Step 10.1 (command-evidence truncation) and Step 10.2 (diff truncation), confirming both truncation rules still refuse silent evidence loss.
- Step 10.3 preserves the four coverage/uniqueness/range checks against the verifier's per-criterion verdict blocks.
  Verify: read `### Step 10.3` and confirm the numbered list still contains all four checks — `Count`, `Coverage`, `Uniqueness`, `Range` — applied to the verifier output, and that failing any of the four routes the task into Step 12's retry loop.
- The Step 10 block is shorter than before (the compaction removes, not adds, prose).
  Verify: run `awk '/^## Step 10: Verify wave output/{f=1} /^## Step 11: /{f=0} f' agent/skills/execute-plan/SKILL.md | wc -l` and confirm the count is strictly less than 150 (the pre-simplification Step 10 block was roughly 170 lines).
- `verify-task-prompt.md`'s `## Diff Context` section describes the truncation marker semantically and no longer hard-codes the literal marker shape.
  Verify: `grep -nF "[diff truncated — <N> lines, <B> bytes total; ...]" agent/skills/execute-plan/verify-task-prompt.md` returns no matches (exit code 1), AND `grep -n "truncation marker" agent/skills/execute-plan/verify-task-prompt.md` returns at least one match inside the `## Diff Context` section, confirming the verifier instruction was rewritten to describe the marker by role rather than by literal text.

**Model recommendation:** capable

### Task 5: Update README.md to describe the simplified concerns checkpoint

**Files:**
- Modify: `README.md`

**Steps:**
- [ ] **Step 1: Read the file** — Open `README.md` and locate the "How it works in practice" numbered list. Specifically, find item 5 (the "Execute in waves" bullet) and item 6 (the "Verify and commit each wave" bullet).
- [ ] **Step 2: Rewrite the concerns sentence in item 5** — In the "Execute in waves" paragraph (currently a single long paragraph ending with "... listing all concerns together so they can be reviewed, acknowledged when observation-only, remediated, or execution stops before the wave advances."), replace the two sentences that start with "Each concern in a `DONE_WITH_CONCERNS` report is classified with one of three typed concern labels..." and end with "... listing all concerns together so they can be reviewed, acknowledged when observation-only, remediated, or execution stops before the wave advances." with:

  ```
  When one or more workers in a wave report `DONE_WITH_CONCERNS`, the orchestrator collects all concerns and presents a **combined wave-level concerns checkpoint** — a single view that lists every concerned task with its files and its freeform concern bullets. The user picks once for the wave: continue to verification, remediate selected task(s) with additional guidance, or stop execution. There is no per-concern menu and no severity classification; verification (by a fresh-context verifier in the next step) is the authoritative gate on correctness.
  ```

  Keep the preceding sentences (about dispatching coders in waves, up-to-8-task parallelism, TDD instructions, and the four status codes) untouched.

- [ ] **Step 3: Leave item 6 ("Verify and commit each wave") substantively unchanged** — Confirm that item 6's description of the fresh-context verifier, the three-set integration tracking, the baseline/deferred/new-regression semantics, the final-wave defer removal, and the Step 15 completion gate is still accurate under the simplification. No edits required. (If the simplification accidentally broke any specific phrase in item 6, fix it; otherwise move on.)
- [ ] **Step 4: Sanity-check the rest of README.md for stale typed-concern wording** — Run `grep -n "Type: correctness\|Type: scope\|Type: observation\|typed concern" README.md`. Expected: no output. If any match remains outside the edited paragraph, rewrite it to the simplified model.

**Acceptance criteria:**
- README.md's "Execute in waves" bullet describes the simplified combined concerns checkpoint and no longer mentions `Type: correctness`, `Type: scope`, or `Type: observation`.
  Verify: `grep -n "Type: correctness\|Type: scope\|Type: observation\|typed concern" README.md` returns no matches, AND `grep -n "combined wave-level concerns checkpoint" README.md` returns at least one match inside item 5 of the "How it works in practice" list.
- The simplified checkpoint description in README.md names exactly three user actions (continue / remediate selected / stop) and describes the absence of per-concern / severity-based routing.
  Verify: read the rewritten sentence in README.md item 5 and confirm it names "continue to verification", "remediate selected task(s)", and "stop execution" as the user's three options, AND contains the phrase "no per-concern menu" (or equivalent explicit-absence wording) and the phrase "no severity classification" (or equivalent). The mandated replacement text names both as absent; this criterion checks that the absence is stated, not that the substrings are missing.
- README.md item 6's description of the fresh-context verifier and three-set integration tracking remains accurate and unreduced.
  Verify: read item 6 of README.md's "How it works in practice" list and confirm it still contains the phrases "fresh-context `verifier` subagent", "three sets", and the "final wave the defer option is removed" language.

**Model recommendation:** standard

## Dependencies

- Task 1 has no dependencies. It edits `agent/agents/coder.md` and `agent/skills/execute-plan/execute-task-prompt.md`.
- Task 2 has no dependencies. It edits `agent/skills/execute-plan/SKILL.md` and touches disjoint files from Task 1, so Task 1 and Task 2 can run in parallel. The worker contract (Task 1) and the orchestrator prose (Task 2) describe the same simplified model by construction — they are specified together in this plan and land in the same wave.
- Task 3 depends on: Task 2 (Task 3 rewrites Steps 7/11/15 of the same `SKILL.md` that Task 2 rewrites Steps 9/9.7 of; serializing avoids same-file merge conflicts).
- Task 4 depends on: Task 3 (Task 4 rewrites Step 10 of the same file; serializing preserves a clean edit history).
- Task 5 depends on: Task 2 (README describes the concerns checkpoint model that Task 2 finalizes; once the model is stable the README can be updated).

Wave layout implied by these dependencies:

- Wave 1: [Task 1, Task 2]  — Task 1 (coder + worker prompt) and Task 2 (SKILL Steps 9/9.7) touch disjoint files; run in parallel.
- Wave 2: [Task 3, Task 5]  — Task 3 (SKILL Steps 7/11/15) and Task 5 (README) touch disjoint files; run in parallel.
- Wave 3: [Task 4]          — Task 4 (SKILL Step 10) touches the same file as Task 3; runs solo in its own wave.

## Risk Assessment

- **Cross-step cross-references in SKILL.md break.** Step 9 → Step 9.7 → Step 10 → Step 11 → Step 12 have a dense web of "see Step X" references. Risk: an edit in one step orphans a reference in another. Mitigation: each SKILL.md task ends with a grep-based scrub (Task 2 Step 7, Task 3 Step 5, Task 4 Step 6) that confirms residual stale wording is gone; verifier runs on each task's acceptance criteria.
- **Concern re-dispatch semantics quietly weaken.** The simplified Step 9.7 still needs to re-dispatch tasks chosen for `(r) Remediate`, feed them back through Step 9, and eventually converge. Risk: the new prose drops a loop-termination rule that the old typed-routing prose guaranteed. Mitigation: Task 2's §4 "Gate exit" block explicitly names the termination conditions; the task's third acceptance criterion verifies exactly those exits appear; verifier treats a missing gate-exit clause as `FAIL`.
- **Verifier preconditions drift.** Step 10's current precondition paragraph references Step 9.7's "correctness/scope" concern state. After the rewrite, Step 10 must still block on an unresolved Step 9.7 checkpoint. Mitigation: Task 2 Step 4 rewrites exactly this paragraph; Task 2's fourth acceptance criterion covers the Step 10 precondition; Task 4 Step 6 re-greps for "fresh-context" / "orchestrator-assembled" / "insufficient evidence" phrases.
- **Integration-regression consolidation loses a rule.** Merging three restatements into one canonical subsection risks dropping disjointness or reconciliation wording. Mitigation: Task 3's Step 2 specifies the exact content of the new subsection (including disjointness bullets and the 5-step reconciliation algorithm); Task 3's fourth acceptance criterion grep-counts the disjointness sentence to 1 occurrence, failing if it is zero (rule lost) or >1 (duplicate not deleted).
- **Truncation compaction accidentally permits silent evidence loss.** Task 4 trims the exact-marker-string ceremony in Steps 10.1 and 10.2. Risk: without the exact string, downstream consumers that parse the marker might break. Mitigation: the marker content (pre-truncation line count and byte count) is preserved as a machine-readable token; the "never silently drop" rule remains; Task 4's third acceptance criterion confirms both truncation rules still forbid silent loss and still direct the verifier to return `FAIL` under truncation.
- **README paragraph diverges from SKILL.md.** The README summary is easy to forget to update. Mitigation: Task 5 explicitly depends on Task 2 and has its own acceptance criterion grep for absence of typed-concern strings in `README.md`.
- **Same-file merge conflicts between SKILL.md tasks.** Tasks 2, 3, and 4 all edit `SKILL.md`. Mitigation: the dependency graph forces them into separate waves so there is never parallel writing to `SKILL.md`. (Task 5 writes to `README.md` only and is safe to pair with Task 3 in Wave 2.)
