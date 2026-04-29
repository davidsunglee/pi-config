# Tighten Subagent Tool Surfaces

**Source todo:** TODO-945326a7
**Spec:** `.pi/specs/2026-04-26-subagent-tool-surfaces.md`

## Goal

Make every subagent definition in `agent/agents/` declare an explicit `tools:` frontmatter line that matches its role intent — read-only judgment agents cannot write or run shell, coder/coordinator agents have only the tools they actually need. Five of the seven agent files require changes; two are already correct. All five edits land in one atomic commit. Three end-to-end smoke tests then confirm the corrected tool surfaces don't break `generate-plan`, `execute-plan`, or `refine-code`.

## Architecture summary

This is a `pi-config`-only, frontmatter-only exercise. No TypeScript changes. No changes to `pi-interactive-subagent`. No changes to agent body content. No changes to `spawning:`, `session-mode:`, `thinking:`, `cli:`, or any other frontmatter field. The sole mechanical change is adding or correcting one `tools:` line per affected agent file.

Current state:

| Agent | Current `tools:` | Action |
|---|---|---|
| `spec-designer` | `read, write, grep, find, ls` | ✅ already correct — no change |
| `planner` | `read, grep, find, ls, bash` | ❌ wrong — fix to `read, write, edit, grep, find, ls` |
| `plan-reviewer` | `read, grep, find, ls, bash` | ❌ wrong — fix to `read, grep, find, ls` |
| `coder` | _(absent)_ | ❌ missing — add `read, write, edit, grep, find, ls, bash` |
| `verifier` | `read, grep, find, ls` | ✅ already correct — no change |
| `code-reviewer` | _(absent)_ | ❌ missing — add `read, grep, find, ls, bash` |
| `code-refiner` | _(absent)_ | ❌ missing — add `read, write, edit, grep, find, ls, bash` |

> **Note on `plan-refiner.md`:** An eighth file (`agent/agents/plan-refiner.md`) exists in the directory but is not covered by the spec's Requirements matrix. It is explicitly out of scope for this plan — no change is made to it. If it needs a `tools:` declaration, that is a separate decision.

The smoke tests (Tasks 2–4) verify that the revised tool surfaces allow the downstream orchestrators to drive their subagents to completion without `BLOCKED` or `NEEDS_CONTEXT` results.

## Tech stack

- Markdown agent definitions (`agent/agents/*.md`) — YAML frontmatter only
- `ripgrep` / `grep` for post-edit verification
- `pi` CLI for end-to-end smoke tests (interactive skill invocations)

## File Structure

- Modify: `agent/agents/planner.md` — replace `tools:` line
- Modify: `agent/agents/plan-reviewer.md` — replace `tools:` line
- Modify: `agent/agents/coder.md` — add `tools:` line after `description:`
- Modify: `agent/agents/code-reviewer.md` — add `tools:` line after `description:`
- Modify: `agent/agents/code-refiner.md` — add `tools:` line after `description:`

## Tasks

### Task 1: Edit the five agent `tools:` declarations and commit

**Files:**
- Modify: `agent/agents/planner.md`
- Modify: `agent/agents/plan-reviewer.md`
- Modify: `agent/agents/coder.md`
- Modify: `agent/agents/code-reviewer.md`
- Modify: `agent/agents/code-refiner.md`

**Steps:**

- [ ] **Step 1: Fix `agent/agents/planner.md` — replace `tools:` line.**

  Current frontmatter contains:
  ```
  tools: read, grep, find, ls, bash
  ```
  Replace that line with:
  ```
  tools: read, write, edit, grep, find, ls
  ```
  Leave every other frontmatter field (`name:`, `description:`, `thinking:`, `session-mode:`, `spawning:`) and the entire body unchanged. This is a one-line substitution.

  Rationale (spec §Requirements row "planner"): planner writes the plan file directly to disk (`write`), performs surgical edits on re-runs (`edit`), and reads the codebase (`read, grep, find, ls`). It does not need `bash` — no shell commands appear in either generation or edit-pass prompt contracts.

- [ ] **Step 2: Fix `agent/agents/plan-reviewer.md` — replace `tools:` line.**

  Current frontmatter contains:
  ```
  tools: read, grep, find, ls, bash
  ```
  Replace that line with:
  ```
  tools: read, grep, find, ls
  ```
  Leave every other frontmatter field and the body unchanged.

  Rationale (spec §Requirements row "plan-reviewer"): plan-reviewer is judge-only. It returns its review text via `finalMessage`; the `generate-plan` orchestrator (Step 4.1.4–5) persists the review file. No `write`, no shell.

- [ ] **Step 3: Add `tools:` to `agent/agents/coder.md` — insert after `description:`.**

  Current frontmatter is:
  ```yaml
  ---
  name: coder
  description: Executes a single task from a structured plan or fixes code based on review findings. Reports structured status for orchestration.
  thinking: medium
  session-mode: lineage-only
  spawning: false
  ---
  ```
  Insert `tools: read, write, edit, grep, find, ls, bash` as the line immediately after the `description:` line:
  ```yaml
  ---
  name: coder
  description: Executes a single task from a structured plan or fixes code based on review findings. Reports structured status for orchestration.
  tools: read, write, edit, grep, find, ls, bash
  thinking: medium
  session-mode: lineage-only
  spawning: false
  ---
  ```
  Leave the body unchanged.

  Rationale (spec §Requirements row "coder"): implements task steps (needs `write` and `edit`), runs tests and tooling (`bash`), reads codebase (`read, grep, find, ls`).

- [ ] **Step 4: Add `tools:` to `agent/agents/code-reviewer.md` — insert after `description:`.**

  Current frontmatter is:
  ```yaml
  ---
  name: code-reviewer
  description: Reviews code diffs for production readiness. Supports full-diff review and hybrid re-review modes.
  thinking: high
  session-mode: lineage-only
  spawning: false
  ---
  ```
  Insert `tools: read, grep, find, ls, bash` as the line immediately after the `description:` line:
  ```yaml
  ---
  name: code-reviewer
  description: Reviews code diffs for production readiness. Supports full-diff review and hybrid re-review modes.
  tools: read, grep, find, ls, bash
  thinking: high
  session-mode: lineage-only
  spawning: false
  ---
  ```
  Leave the body unchanged.

  Rationale (spec §Requirements row "code-reviewer"): needs `bash` for the `git diff` invocations baked into `review-code-prompt.md` and for ad-hoc test runs. Returns review via `finalMessage`; the `code-refiner` coordinator persists the file — so no `write`.

- [ ] **Step 5: Add `tools:` to `agent/agents/code-refiner.md` — insert after `description:`.**

  Current frontmatter is:
  ```yaml
  ---
  name: code-refiner
  description: Orchestrates the review-remediate loop. Dispatches code-reviewer and coder subagents, manages iteration budget, writes versioned review files.
  thinking: medium
  session-mode: lineage-only
  ---
  ```
  Insert `tools: read, write, edit, grep, find, ls, bash` as the line immediately after the `description:` line:
  ```yaml
  ---
  name: code-refiner
  description: Orchestrates the review-remediate loop. Dispatches code-reviewer and coder subagents, manages iteration budget, writes versioned review files.
  tools: read, write, edit, grep, find, ls, bash
  thinking: medium
  session-mode: lineage-only
  ---
  ```
  Leave the body unchanged. Note: `code-refiner` intentionally has no `spawning: false` — it dispatches `code-reviewer` and `coder` subagents.

  Rationale (spec §Requirements row "code-refiner"): coordinator that reads prompt templates, writes versioned review files, runs `git add` / `git commit` between remediation batches, and dispatches nested workers.

- [ ] **Step 6: Verify all five edits with grep.**

  Run the following verification sequence:

  ```bash
  # 1. Confirm planner tools: line is correct
  rg -n "^tools:" agent/agents/planner.md
  # Expected: tools: read, write, edit, grep, find, ls

  # 2. Confirm plan-reviewer tools: line is correct
  rg -n "^tools:" agent/agents/plan-reviewer.md
  # Expected: tools: read, grep, find, ls

  # 3. Confirm coder tools: line is correct
  rg -n "^tools:" agent/agents/coder.md
  # Expected: tools: read, write, edit, grep, find, ls, bash

  # 4. Confirm code-reviewer tools: line is correct
  rg -n "^tools:" agent/agents/code-reviewer.md
  # Expected: tools: read, grep, find, ls, bash

  # 5. Confirm code-refiner tools: line is correct
  rg -n "^tools:" agent/agents/code-refiner.md
  # Expected: tools: read, write, edit, grep, find, ls, bash

  # 6. Confirm unchanged agents are still correct
  rg -n "^tools:" agent/agents/spec-designer.md agent/agents/verifier.md
  # Expected spec-designer: tools: read, write, grep, find, ls
  # Expected verifier:      tools: read, grep, find, ls

  # 7. Confirm no bash on planner or plan-reviewer
  rg -n "bash" agent/agents/planner.md agent/agents/plan-reviewer.md
  # Expected: zero matches inside the tools: lines for these two files
  # (Any body matches are acceptable; this check is about the tools: line value)

  # 8. Confirm no write/edit on plan-reviewer
  rg -n "^tools:.*write\|^tools:.*edit" agent/agents/plan-reviewer.md
  # Expected: zero matches
  ```

- [ ] **Step 7: Commit all five edits atomically.**

  ```bash
  git add agent/agents/planner.md \
          agent/agents/plan-reviewer.md \
          agent/agents/coder.md \
          agent/agents/code-reviewer.md \
          agent/agents/code-refiner.md
  git commit -m "refactor(agents): tighten tool surfaces to match role-intent matrix

  - planner: read,write,edit,grep,find,ls (was: read,grep,find,ls,bash)
  - plan-reviewer: read,grep,find,ls (was: read,grep,find,ls,bash)
  - coder: add read,write,edit,grep,find,ls,bash (was: absent)
  - code-reviewer: add read,grep,find,ls,bash (was: absent)
  - code-refiner: add read,write,edit,grep,find,ls,bash (was: absent)

  Judge-only agents (plan-reviewer) lose write+bash; write-only agents
  (planner) lose bash and gain write+edit; missing declarations on three
  agents are filled in. spec-designer and verifier are already correct."
  ```

**Acceptance criteria:**

- `agent/agents/planner.md` frontmatter `tools:` is exactly `read, write, edit, grep, find, ls`.
  Verify: `rg -n "^tools:" agent/agents/planner.md` outputs exactly one line matching `tools: read, write, edit, grep, find, ls`.

- `agent/agents/plan-reviewer.md` frontmatter `tools:` is exactly `read, grep, find, ls`.
  Verify: `rg -n "^tools:" agent/agents/plan-reviewer.md` outputs exactly one line matching `tools: read, grep, find, ls`.

- `agent/agents/coder.md` frontmatter `tools:` is exactly `read, write, edit, grep, find, ls, bash`.
  Verify: `rg -n "^tools:" agent/agents/coder.md` outputs exactly one line matching `tools: read, write, edit, grep, find, ls, bash`.

- `agent/agents/code-reviewer.md` frontmatter `tools:` is exactly `read, grep, find, ls, bash`.
  Verify: `rg -n "^tools:" agent/agents/code-reviewer.md` outputs exactly one line matching `tools: read, grep, find, ls, bash`.

- `agent/agents/code-refiner.md` frontmatter `tools:` is exactly `read, write, edit, grep, find, ls, bash`.
  Verify: `rg -n "^tools:" agent/agents/code-refiner.md` outputs exactly one line matching `tools: read, write, edit, grep, find, ls, bash`.

- `spec-designer` and `verifier` are unchanged.
  Verify: `rg -n "^tools:" agent/agents/spec-designer.md` outputs `tools: read, write, grep, find, ls`; `rg -n "^tools:" agent/agents/verifier.md` outputs `tools: read, grep, find, ls`.

- No agent has `bash` on a tools line it shouldn't: `planner` and `plan-reviewer` must not have `bash`.
  Verify: `rg "^tools:.*bash" agent/agents/planner.md agent/agents/plan-reviewer.md` returns zero matches.

- All five edits landed in a single git commit (per spec §Acceptance Criteria final bullet).
  Verify: `git log --oneline -1` shows a single commit whose message references "tighten" or "tool surfaces" or equivalent; `git show --stat HEAD` lists exactly the five changed files (planner.md, plan-reviewer.md, coder.md, code-reviewer.md, code-refiner.md) and no others.

**Model recommendation:** cheap

**Dependencies:** none

---

### Task 2: `generate-plan` smoke test

Run a `generate-plan` smoke run on a trivial input to confirm the corrected `planner` and `plan-reviewer` tool surfaces allow end-to-end completion.

**Files:**
- Produces (ephemeral, delete after): `.pi/plans/<date>-smoke-test-<random>.md`
- Produces (ephemeral, delete after): `.pi/plans/reviews/<date>-smoke-test-<random>-plan-review-v1.md`

**Steps:**

- [ ] **Step 1: Run `generate-plan` on a trivial freeform task.**

  From within the project root, invoke the skill via the pi CLI:

  ```
  /generate-plan Add a one-line comment to agent/agents/verifier.md explaining the judge-only role
  ```

  (This is a trivially simple task — it exists purely to exercise the orchestrator/subagent pipeline, not to produce a real plan.)

  Observe the run to completion. Note the produced plan path from the final message.

- [ ] **Step 2: Confirm the plan file was written by `planner`.**

  Locate the plan file path reported by the orchestrator. Verify the file exists and is non-empty.

- [ ] **Step 3: Confirm the review file was written by the orchestrator (not by `plan-reviewer`).**

  Locate the review file under `.pi/plans/reviews/`. Verify the file exists and is non-empty.

- [ ] **Step 4: Confirm neither subagent reported `BLOCKED` or `NEEDS_CONTEXT`.**

  Read the pi session transcript or the orchestrator's reported output for any `BLOCKED` or `NEEDS_CONTEXT` markers from the `planner` or `plan-reviewer` agents.

- [ ] **Step 5: Clean up ephemeral artifacts.**

  Delete both the smoke-test plan file and its review file to avoid polluting `.pi/plans/`.

  ```bash
  rm -f .pi/plans/<smoke-plan-file>.md
  rm -f .pi/plans/reviews/<smoke-review-file>.md
  ```

**Acceptance criteria:**

- The `planner` subagent writes a plan file to `.pi/plans/` without reporting `BLOCKED` or `NEEDS_CONTEXT`.
  Verify: the plan file exists on disk immediately after Step 2; run `rg -l "BLOCKED|NEEDS_CONTEXT" <plan-file>` and expect zero matches.

- The `plan-reviewer` subagent returns its review via `finalMessage` and the orchestrator persists a review file to `.pi/plans/reviews/`.
  Verify: the review file exists on disk immediately after Step 3; run `rg -l "BLOCKED|NEEDS_CONTEXT" <review-file>` and expect zero matches.

- The overall `generate-plan` run exits without error and reports the plan path.
  Verify: the orchestrator's final output includes a line referencing `.pi/plans/<plan-filename>.md` and does not include `[Error]` or `dispatch failed` at the top level.

**Model recommendation:** standard

**Dependencies:** Task 1

---

### Task 3: `execute-plan` smoke test

Run an `execute-plan` smoke run on a minimal single-task throwaway plan to confirm the corrected `coder` and `verifier` tool surfaces allow end-to-end completion.

**Files:**
- Create (ephemeral, delete after): `.pi/plans/smoke-execute-test.md`
- Produces (ephemeral, delete after): `agent/agents/_smoke_test_output.txt`

**Steps:**

- [ ] **Step 1: Create a minimal single-task throwaway plan.**

  Write the file `.pi/plans/smoke-execute-test.md` with the following exact content:

  ```markdown
  # Smoke Test — execute-plan tool surface check

  ## Goal

  Create a trivial file to exercise the coder/verifier pipeline.

  ## Tasks

  ### Task 1: Create a one-line text file

  **Files:**
  - Create: `agent/agents/_smoke_test_output.txt`

  **Steps:**

  - [ ] **Step 1: Write the file.** Create `agent/agents/_smoke_test_output.txt` with the single line `smoke-test-ok`.

  **Acceptance criteria:**

  - The file `agent/agents/_smoke_test_output.txt` exists and contains exactly `smoke-test-ok`.
    Verify: `cat agent/agents/_smoke_test_output.txt` outputs `smoke-test-ok`.

  **Model recommendation:** cheap

  **Dependencies:** none
  ```

- [ ] **Step 2: Run `execute-plan` with the throwaway plan.**

  From within the project root, invoke:

  ```
  /execute-plan .pi/plans/smoke-execute-test.md
  ```

  Observe the run to completion. The `coder` agent should create `agent/agents/_smoke_test_output.txt`, and the `verifier` agent should return `VERDICT: PASS`.

- [ ] **Step 3: Confirm the verifier returned `VERDICT: PASS`.**

  Read the orchestrator's reported output for the `VERDICT: PASS` line for Task 1.

- [ ] **Step 4: Clean up ephemeral artifacts.**

  The `execute-plan` wave commit (which the spec expects) must be undone so the smoke-test file does not persist in git history:

  ```bash
  # Undo the execute-plan wave commit
  git reset HEAD~1 --soft
  git restore --staged agent/agents/_smoke_test_output.txt 2>/dev/null || true
  rm -f agent/agents/_smoke_test_output.txt
  rm -f .pi/plans/smoke-execute-test.md
  ```

**Acceptance criteria:**

- The `coder` subagent creates `agent/agents/_smoke_test_output.txt` containing `smoke-test-ok` without reporting `BLOCKED`.
  Verify: immediately after Step 2, run `cat agent/agents/_smoke_test_output.txt`; expect output `smoke-test-ok`. Also confirm the orchestrator's session output does not contain `BLOCKED` from the coder agent.

- The `verifier` subagent returns `VERDICT: PASS` for Task 1.
  Verify: the orchestrator's final output for Task 1 includes the line `VERDICT: PASS` and does not include `VERDICT: FAIL` or `BLOCKED`.

- The overall `execute-plan` run exits without error and the wave commit was made.
  Verify: the orchestrator's final output does not contain `[Error]` or `wave failed` at the top level; `git log --oneline -1` immediately after Step 2 (before cleanup) shows a commit whose message references the smoke-test task; `git show --stat HEAD` at that point lists `agent/agents/_smoke_test_output.txt`. The wave commit is subsequently undone by Step 4 cleanup.

**Model recommendation:** standard

**Dependencies:** Task 1

---

### Task 4: `refine-code` smoke test

Run a `refine-code` smoke run on a trivial diff to confirm the corrected `code-reviewer` and `code-refiner` tool surfaces allow end-to-end completion.

**Files:**
- Create (ephemeral, delete after): `agent/agents/_smoke_refine_target.txt`
- Produces (ephemeral, delete after): `.pi/reviews/<date>-smoke-refine-v1.md` (or equivalent path per `refine-code` conventions)

**Steps:**

- [ ] **Step 1: Create a trivial file to use as the review target.**

  ```bash
  echo "hello world" > agent/agents/_smoke_refine_target.txt
  git add agent/agents/_smoke_refine_target.txt
  git commit -m "chore: smoke-test file for refine-code run (delete after)"
  ```

  Then make a trivial change:

  ```bash
  echo "hello world -- updated" > agent/agents/_smoke_refine_target.txt
  git add agent/agents/_smoke_refine_target.txt
  ```

  The staged diff is now one line changed in a trivial file — ideal for a smoke test.

- [ ] **Step 2: Run `refine-code` on the staged diff.**

  From within the project root, invoke:

  ```
  /refine-code
  ```

  Observe the run. The `code-refiner` coordinator should dispatch `code-reviewer`, and if no issues are found, return `STATUS: clean`. If trivial issues are found and remediation triggers, `coder` is dispatched — that is also acceptable as long as no agent reports `BLOCKED`.

- [ ] **Step 3: Confirm the review file was persisted.**

  The `code-refiner` coordinator should write a versioned review file (typically under `.pi/reviews/` or per the `refine-code` skill conventions). Confirm the file exists and is non-empty.

- [ ] **Step 4: Clean up ephemeral artifacts.**

  Step 1 created exactly 1 commit. For the happy path (`STATUS: clean`, no remediation), `code-refiner` makes zero additional commits. Undo the setup commit and any code-refiner remediation commits:

  ```bash
  # Check how many smoke-related commits sit on HEAD
  # (look for the "chore: smoke-test file" commit in git log --oneline -5)
  # For STATUS: clean (no extra commits): reset 1
  # For STATUS: max_iterations_reached with N remediation commits: reset 1+N
  git reset HEAD~1 --soft  # adjust count if code-refiner made remediation commits
  git restore --staged agent/agents/_smoke_refine_target.txt 2>/dev/null || true
  rm -f agent/agents/_smoke_refine_target.txt
  # Remove the review file written by code-refiner (find the most recent .md in .pi/reviews/)
  ls -t .pi/reviews/*.md | head -1 | xargs rm -f
  ```

**Acceptance criteria:**

- The `code-refiner` coordinator dispatches `code-reviewer` and no dispatched subagent reports `BLOCKED`.
  Verify: the `code-refiner`'s session output shows a `code-reviewer` dispatch completing; search the orchestrator output for `BLOCKED` and expect zero matches across all subagent turns.

- The `code-refiner` persists a versioned review file.
  Verify: after Step 2, run `REVIEW=$(ls -t .pi/reviews/*.md | head -1); echo "$REVIEW"; wc -l "$REVIEW"` and confirm the output names a `.md` file and its line count is greater than 0.

- The `code-refiner` returns `STATUS: clean` or `STATUS: max_iterations_reached` with a clearly bounded finding set. Neither `STATUS: error` nor an uncaught dispatch failure is acceptable.
  Verify: the `code-refiner`'s final output message contains `STATUS: clean` or `STATUS: max_iterations_reached`. If `max_iterations_reached`, confirm the output also lists the specific remaining findings (not just a generic error).

**Model recommendation:** standard

**Dependencies:** Task 1

---

## Review Notes

_Added by plan reviewer — informational, not blocking._

### Warnings

- **Tasks 2 and 3**: Verify recipes use runtime path placeholders (`<plan-file>`, `<review-file>`) in grep commands. These are values the executor has from earlier steps (the plan file path from Task 2 Step 1, the review file path from Task 2 Step 3) and can substitute at runtime, but they reduce mechanical verifiability for a strict verifier agent. Annotate with "(path from Step 1)" and consider using a shell variable reference like `"$PLAN_FILE"` to make substitution explicit. Task 2's third acceptance criterion ("orchestrator's final output includes a line referencing `.pi/plans/...`") also describes what to observe without naming a persisted artifact; in practice, the operator reads the orchestrator's on-screen output to verify this.
