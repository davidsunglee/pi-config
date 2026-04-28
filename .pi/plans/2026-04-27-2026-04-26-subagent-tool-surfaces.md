# Tighten Subagent Tool Surfaces

**Source:** TODO-945326a7
**Spec:** `.pi/specs/2026-04-26-subagent-tool-surfaces.md`

## Goal

Make every subagent definition under `agent/agents/` declare an explicit `tools:` frontmatter that matches its role-intent matrix from the spec. Six of the eight agent files require edits — `planner`, `plan-reviewer`, `plan-refiner`, `coder`, `code-reviewer`, `code-refiner`. Two are already correct (`spec-designer`, `verifier`) and remain byte-identical. All six edits ship as a single atomic commit. Three end-to-end smoke runs (`generate-plan`, `execute-plan`, `refine-code`) then confirm the corrected tool surfaces do not break the orchestrator pipelines that drive these agents.

## Architecture summary

This is a `pi-config`-only, frontmatter-only exercise. No TypeScript changes. No changes to the sibling `pi-interactive-subagent` repo. No changes to agent body content. No changes to `spawning:`, `session-mode:`, `auto-exit:`, `system-prompt:`, `thinking:`, `cli:`, or any other frontmatter field besides `tools:`.

The seven canonical pi builtin tool tokens are: `read, write, edit, bash, grep, find, ls`. They are mapped to Claude tools via `PI_TO_CLAUDE_TOOLS` in `pi-interactive-subagent/pi-extension/subagents/backends/tool-map.ts` (`read→Read`, `write→Write`, `edit→Edit`, `bash→Bash`, `grep→Grep`, `find→Glob`, `ls→Glob`). On the pi path, `resolvePiToolsArg` (`pi-extension/subagents/launch-spec.ts`) auto-merges the lifecycle tools `caller_ping` and `subagent_done` into the allowlist. On the Claude path, `buildClaudeCmdParts`/`buildClaudeHeadlessArgs` auto-merge the MCP lifecycle tool `mcp__pi-subagent__subagent_done` (and its plugin-prefixed equivalent). The plan does not introduce any new tokens; only the seven pi builtins appear in `tools:` lines.

Required end-state matrix (from spec):

| Agent | `tools:` line | Current state | Action |
|---|---|---|---|
| `spec-designer` | `read, write, grep, find, ls` | already correct | no change |
| `planner` | `read, write, edit, grep, find, ls` | `read, grep, find, ls, bash` | replace |
| `plan-reviewer` | `read, grep, find, ls` | `read, grep, find, ls, bash` | replace |
| `plan-refiner` | `read, write, edit, grep, find, ls` | absent | insert |
| `coder` | `read, write, edit, grep, find, ls, bash` | absent | insert |
| `verifier` | `read, grep, find, ls` | already correct | no change |
| `code-reviewer` | `read, grep, find, ls, bash` | absent | insert |
| `code-refiner` | `read, write, edit, grep, find, ls, bash` | absent | insert |

Only `tools:` is touched. Frontmatter fields besides `tools:` and the body of each file remain byte-identical to before. `plan-refiner` and `code-refiner` keep `spawning:` absent (they are coordinators that dispatch child subagents). The six worker agents keep their existing `spawning: false`.

The smoke runs (Tasks 2, 3, 4) follow an evidence-snapshot pattern: each smoke task captures its outcomes into a persistent evidence file at `/tmp/pi-smoke-<skill>-evidence.txt` BEFORE cleanup runs, then runs cleanup (`git reset --hard`, `rm -f` ephemeral files). The cleanup deliberately preserves the evidence file so post-task acceptance verification can read smoke results that would otherwise have been destroyed. This ordering is intentional: the verifier inspects the evidence file (which contains key=value lines such as `PLAN_FILE_EXISTS=yes`, `ORCH_HAS_BLOCKED=no`), not the original ephemeral artifacts.

## Tech stack

- Markdown agent definitions (`agent/agents/*.md`) — YAML frontmatter only
- `ripgrep` / `grep` for post-edit verification
- `git` for the single atomic commit
- `pi` CLI for end-to-end smoke runs (interactive skill invocations of `/generate-plan`, `/execute-plan`, `/refine-code`)
- `/tmp/pi-smoke-<skill>-evidence.txt` plain-text evidence files for post-cleanup verification

## File Structure

- `agent/agents/planner.md` (Modify) — replace existing `tools:` line `read, grep, find, ls, bash` with `read, write, edit, grep, find, ls`. Planner writes plan files directly (`write`) and patches plans in edit mode (`edit`); codebase analysis is read-based; no shell needed.
- `agent/agents/plan-reviewer.md` (Modify) — replace existing `tools:` line `read, grep, find, ls, bash` with `read, grep, find, ls`. Judge-only: returns review via `finalMessage`; `plan-refiner` persists the review file. No `write`, no shell.
- `agent/agents/plan-refiner.md` (Modify) — insert new `tools: read, write, edit, grep, find, ls` line. Coordinator: writes versioned plan-review files, may append `## Review Notes` to the plan, dispatches `plan-reviewer`/`planner` (edit-mode); never commits, never runs shell.
- `agent/agents/coder.md` (Modify) — insert new `tools: read, write, edit, grep, find, ls, bash` line. Worker: implements task steps (`write`, `edit`), runs tests/tooling (`bash`).
- `agent/agents/code-reviewer.md` (Modify) — insert new `tools: read, grep, find, ls, bash` line. Returns review via `finalMessage`; `code-refiner` persists the file. Needs `bash` for the `git diff` invocations baked into `review-code-prompt.md` and ad-hoc test runs. No `write`.
- `agent/agents/code-refiner.md` (Modify) — insert new `tools: read, write, edit, grep, find, ls, bash` line. Coordinator: writes versioned review files, runs `git add` / `git commit` between remediation batches, dispatches `code-reviewer`/`coder`.

`agent/agents/spec-designer.md` and `agent/agents/verifier.md` are NOT modified — they already match the matrix and must remain byte-identical.

## Tasks

### Task 1: Apply six `tools:` line changes and commit atomically

**Files:**
- Modify: `agent/agents/planner.md`
- Modify: `agent/agents/plan-reviewer.md`
- Modify: `agent/agents/plan-refiner.md`
- Modify: `agent/agents/coder.md`
- Modify: `agent/agents/code-reviewer.md`
- Modify: `agent/agents/code-refiner.md`

**Steps:**

- [ ] **Step 1: Replace `tools:` line in `agent/agents/planner.md`.**

  Read the file to confirm the existing `tools:` line content. The current frontmatter contains:

  ```
  tools: read, grep, find, ls, bash
  ```

  Replace that single line with:

  ```
  tools: read, write, edit, grep, find, ls
  ```

  Leave every other frontmatter field (`name:`, `description:`, `thinking: xhigh`, `session-mode: lineage-only`, `spawning: false`) and the entire body (everything after the closing `---`) byte-identical. This is a one-line in-place substitution. Do not reorder fields. Do not add trailing/leading whitespace.

- [ ] **Step 2: Replace `tools:` line in `agent/agents/plan-reviewer.md`.**

  The current frontmatter contains (located near the bottom of the frontmatter block, just before the closing `---`):

  ```
  tools: read, grep, find, ls, bash
  ```

  Replace that single line with:

  ```
  tools: read, grep, find, ls
  ```

  Leave every other frontmatter field (`name:`, `description:`, `thinking: high`, `session-mode: lineage-only`, `spawning: false`) and the entire body byte-identical. Keep the `tools:` line in its existing position within the frontmatter block.

- [ ] **Step 3: Insert new `tools:` line in `agent/agents/plan-refiner.md`.**

  The current frontmatter has no `tools:` line:

  ```yaml
  ---
  name: plan-refiner
  description: Orchestrates the plan review-edit loop. Dispatches plan-reviewer and planner edit-pass subagents within one era, manages the iteration budget, writes versioned review files, and never commits.
  thinking: medium
  session-mode: lineage-only
  ---
  ```

  Insert `tools: read, write, edit, grep, find, ls` as a new line immediately after the `description:` line and before `thinking:`. The result must be:

  ```yaml
  ---
  name: plan-refiner
  description: Orchestrates the plan review-edit loop. Dispatches plan-reviewer and planner edit-pass subagents within one era, manages the iteration budget, writes versioned review files, and never commits.
  tools: read, write, edit, grep, find, ls
  thinking: medium
  session-mode: lineage-only
  ---
  ```

  Leave the body byte-identical. Do not add `spawning: false` — this is a coordinator and must keep `spawning:` absent so it can dispatch child subagents. Do not add a blank line between `description:` and `tools:`.

- [ ] **Step 4: Insert new `tools:` line in `agent/agents/coder.md`.**

  The current frontmatter has no `tools:` line:

  ```yaml
  ---
  name: coder
  description: Executes a single task from a structured plan or fixes code based on review findings. Reports structured status for orchestration.
  thinking: medium
  session-mode: lineage-only
  spawning: false
  ---
  ```

  Insert `tools: read, write, edit, grep, find, ls, bash` as a new line immediately after the `description:` line and before `thinking:`. The result must be:

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

  Leave the body byte-identical.

- [ ] **Step 5: Insert new `tools:` line in `agent/agents/code-reviewer.md`.**

  The current frontmatter has no `tools:` line:

  ```yaml
  ---
  name: code-reviewer
  description: Reviews code diffs for production readiness. Supports full-diff review and hybrid re-review modes.
  thinking: high
  session-mode: lineage-only
  spawning: false
  ---
  ```

  Insert `tools: read, grep, find, ls, bash` as a new line immediately after the `description:` line and before `thinking:`. The result must be:

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

  Leave the body byte-identical.

- [ ] **Step 6: Insert new `tools:` line in `agent/agents/code-refiner.md`.**

  The current frontmatter has no `tools:` line:

  ```yaml
  ---
  name: code-refiner
  description: Orchestrates the review-remediate loop. Dispatches code-reviewer and coder subagents, manages iteration budget, writes versioned review files.
  thinking: medium
  session-mode: lineage-only
  ---
  ```

  Insert `tools: read, write, edit, grep, find, ls, bash` as a new line immediately after the `description:` line and before `thinking:`. The result must be:

  ```yaml
  ---
  name: code-refiner
  description: Orchestrates the review-remediate loop. Dispatches code-reviewer and coder subagents, manages iteration budget, writes versioned review files.
  tools: read, write, edit, grep, find, ls, bash
  thinking: medium
  session-mode: lineage-only
  ---
  ```

  Leave the body byte-identical. Do not add `spawning: false` — this is a coordinator and must keep `spawning:` absent so it can dispatch child subagents.

- [ ] **Step 7: Run six per-file `tools:` line verifications.**

  From the project root, run each of these `rg` commands and confirm the output matches exactly. Use ripgrep with `-n` to print the line number; the file should contain exactly one `tools:` line.

  ```bash
  rg -n "^tools:" agent/agents/planner.md
  # Expected output: <line>:tools: read, write, edit, grep, find, ls

  rg -n "^tools:" agent/agents/plan-reviewer.md
  # Expected output: <line>:tools: read, grep, find, ls

  rg -n "^tools:" agent/agents/plan-refiner.md
  # Expected output: <line>:tools: read, write, edit, grep, find, ls

  rg -n "^tools:" agent/agents/coder.md
  # Expected output: <line>:tools: read, write, edit, grep, find, ls, bash

  rg -n "^tools:" agent/agents/code-reviewer.md
  # Expected output: <line>:tools: read, grep, find, ls, bash

  rg -n "^tools:" agent/agents/code-refiner.md
  # Expected output: <line>:tools: read, write, edit, grep, find, ls, bash
  ```

  If any output does not match, return to the corresponding step (1–6) and fix the file. Do not proceed until all six match.

- [ ] **Step 8: Confirm `spec-designer` and `verifier` are unchanged.**

  ```bash
  rg -n "^tools:" agent/agents/spec-designer.md agent/agents/verifier.md
  # Expected:
  #   agent/agents/spec-designer.md:<line>:tools: read, write, grep, find, ls
  #   agent/agents/verifier.md:<line>:tools: read, grep, find, ls

  git diff -- agent/agents/spec-designer.md agent/agents/verifier.md
  # Expected: empty output (no diff)
  ```

  If `git diff` is non-empty for either file, the file was inadvertently modified. Restore it via `git checkout -- agent/agents/<name>.md` and re-run the check.

- [ ] **Step 9: Confirm `bash` is absent from `planner` and `plan-reviewer` `tools:` lines.**

  ```bash
  rg -n "^tools:.*\bbash\b" agent/agents/planner.md agent/agents/plan-reviewer.md
  # Expected: zero matches (no output, exit code 1)
  ```

  Zero matches confirms neither `tools:` line includes the `bash` token.

- [ ] **Step 10: Confirm body bytes are unchanged for all six modified files.**

  For each of the six modified files, run `git diff -U0 -- <file>` and inspect the unified diff. The diff must contain ONLY `tools:` line changes — either a single replaced line (planner, plan-reviewer) or a single added line (plan-refiner, coder, code-reviewer, code-refiner). No body lines may appear in the diff.

  ```bash
  for f in agent/agents/planner.md agent/agents/plan-reviewer.md agent/agents/plan-refiner.md agent/agents/coder.md agent/agents/code-reviewer.md agent/agents/code-refiner.md; do
    echo "=== $f ==="
    git diff -U0 -- "$f"
  done
  ```

  Inspect the output. For `planner.md` and `plan-reviewer.md`, expect exactly one `-tools: ...` line and one `+tools: ...` line per file (a replace). For the other four, expect exactly one `+tools: ...` line per file (an insert) and no `-` lines. If any file shows additional changed lines (body changes, unrelated frontmatter changes), revert those changes before proceeding.

- [ ] **Step 11: Stage and commit all six edits as a single atomic commit.**

  ```bash
  git add agent/agents/planner.md \
          agent/agents/plan-reviewer.md \
          agent/agents/plan-refiner.md \
          agent/agents/coder.md \
          agent/agents/code-reviewer.md \
          agent/agents/code-refiner.md

  git commit -m "refactor(agents): tighten tool surfaces to match role-intent matrix

  - planner: read,write,edit,grep,find,ls (was: read,grep,find,ls,bash)
  - plan-reviewer: read,grep,find,ls (was: read,grep,find,ls,bash)
  - plan-refiner: add read,write,edit,grep,find,ls (was: absent)
  - coder: add read,write,edit,grep,find,ls,bash (was: absent)
  - code-reviewer: add read,grep,find,ls,bash (was: absent)
  - code-refiner: add read,write,edit,grep,find,ls,bash (was: absent)

  Read-only judgment agents (plan-reviewer, verifier) keep no write+bash;
  judge-only plan-reviewer drops bash. Planner gains write+edit and drops
  bash. Coordinator agents (plan-refiner, code-refiner) gain write+edit
  for owned artifacts; code-refiner keeps bash for git commits while
  plan-refiner has no shell (it never commits). spec-designer and verifier
  are already correct and remain byte-identical."
  ```

- [ ] **Step 12: Persist Task 1 commit SHA for the smoke tasks.**

  Record the post-Task-1 HEAD SHA so subsequent smoke tasks can use it as the cleanup-reset target:

  ```bash
  git rev-parse HEAD > /tmp/pi-task1-head-sha.txt
  ```

  This file is read by Tasks 2, 3, and 4 as the `BASE_RESET_SHA` they reset to during cleanup. The file persists across tasks for the duration of the plan run.

- [ ] **Step 13: Confirm the commit landed cleanly with the expected file set.**

  ```bash
  git log --oneline -1
  # Expected: <sha> refactor(agents): tighten tool surfaces to match role-intent matrix

  git show --stat HEAD
  # Expected: 6 files changed; the file list contains exactly:
  #   agent/agents/code-refiner.md
  #   agent/agents/code-reviewer.md
  #   agent/agents/coder.md
  #   agent/agents/plan-refiner.md
  #   agent/agents/plan-reviewer.md
  #   agent/agents/planner.md
  # No other files appear in the changed-file list.

  git status --porcelain
  # Expected: empty output (working tree clean)
  ```

**Acceptance criteria:**

- `agent/agents/planner.md` `tools:` line is exactly `tools: read, write, edit, grep, find, ls`.
  Verify: `rg -n "^tools:" agent/agents/planner.md` outputs exactly one line whose content after the line-number prefix is `tools: read, write, edit, grep, find, ls`.
- `agent/agents/plan-reviewer.md` `tools:` line is exactly `tools: read, grep, find, ls`.
  Verify: `rg -n "^tools:" agent/agents/plan-reviewer.md` outputs exactly one line whose content after the line-number prefix is `tools: read, grep, find, ls`.
- `agent/agents/plan-refiner.md` `tools:` line is exactly `tools: read, write, edit, grep, find, ls`.
  Verify: `rg -n "^tools:" agent/agents/plan-refiner.md` outputs exactly one line whose content after the line-number prefix is `tools: read, write, edit, grep, find, ls`.
- `agent/agents/coder.md` `tools:` line is exactly `tools: read, write, edit, grep, find, ls, bash`.
  Verify: `rg -n "^tools:" agent/agents/coder.md` outputs exactly one line whose content after the line-number prefix is `tools: read, write, edit, grep, find, ls, bash`.
- `agent/agents/code-reviewer.md` `tools:` line is exactly `tools: read, grep, find, ls, bash`.
  Verify: `rg -n "^tools:" agent/agents/code-reviewer.md` outputs exactly one line whose content after the line-number prefix is `tools: read, grep, find, ls, bash`.
- `agent/agents/code-refiner.md` `tools:` line is exactly `tools: read, write, edit, grep, find, ls, bash`.
  Verify: `rg -n "^tools:" agent/agents/code-refiner.md` outputs exactly one line whose content after the line-number prefix is `tools: read, write, edit, grep, find, ls, bash`.
- `agent/agents/spec-designer.md` is byte-identical to its pre-task state and its `tools:` line still reads `tools: read, write, grep, find, ls`.
  Verify: `rg -n "^tools:" agent/agents/spec-designer.md` outputs exactly one line whose content after the line-number prefix is `tools: read, write, grep, find, ls`; AND `git diff HEAD~1 HEAD -- agent/agents/spec-designer.md` returns empty output.
- `agent/agents/verifier.md` is byte-identical to its pre-task state and its `tools:` line still reads `tools: read, grep, find, ls`.
  Verify: `rg -n "^tools:" agent/agents/verifier.md` outputs exactly one line whose content after the line-number prefix is `tools: read, grep, find, ls`; AND `git diff HEAD~1 HEAD -- agent/agents/verifier.md` returns empty output.
- Neither `agent/agents/planner.md` nor `agent/agents/plan-reviewer.md` has `bash` in its `tools:` line.
  Verify: `rg -n "^tools:.*\bbash\b" agent/agents/planner.md agent/agents/plan-reviewer.md` returns zero matches (exit code 1, no output).
- Neither `agent/agents/plan-reviewer.md` nor `agent/agents/verifier.md` has `write` or `edit` in its `tools:` line (judge-only constraint).
  Verify: `rg -n "^tools:.*\b(write|edit)\b" agent/agents/plan-reviewer.md agent/agents/verifier.md` returns zero matches (exit code 1, no output).
- All six edits land in a single atomic commit at HEAD with the expected commit message subject.
  Verify: `git log --format=%s -1 HEAD` outputs exactly `refactor(agents): tighten tool surfaces to match role-intent matrix`; AND `git show --name-only --format= HEAD | sort` outputs exactly the six lines `agent/agents/code-refiner.md`, `agent/agents/code-reviewer.md`, `agent/agents/coder.md`, `agent/agents/plan-refiner.md`, `agent/agents/plan-reviewer.md`, `agent/agents/planner.md` (alphabetical order, no other paths).
- The commit's diff for each modified file contains only `tools:` line changes; no body lines change.
  Verify: for each file in `agent/agents/{planner,plan-reviewer,plan-refiner,coder,code-reviewer,code-refiner}.md`, run `git show HEAD -- <file> | grep -E '^[+-][^+-]' | grep -vE '^[+-]tools:'` and confirm zero matches per file (the only `+`/`-` lines in the per-file diff are `tools:` line changes; the leading `+++`/`---` headers are excluded by the regex).
- The working tree is clean after the commit (no leftover staged or unstaged changes).
  Verify: `git status --porcelain` returns empty output.
- The Task-1 HEAD SHA is recorded at `/tmp/pi-task1-head-sha.txt` for the smoke tasks to consume.
  Verify: `test -s /tmp/pi-task1-head-sha.txt` exits 0; AND `cat /tmp/pi-task1-head-sha.txt` outputs a 40-character hex SHA that matches `git rev-parse HEAD` exactly (run both and confirm the strings are identical).

**Model recommendation:** cheap

---

### Task 2: `generate-plan` smoke run — exercises `planner`, `plan-reviewer`, `plan-refiner`

Drive a `/generate-plan` invocation on a trivial freeform task to confirm the corrected `planner` (`read, write, edit, grep, find, ls`), `plan-reviewer` (`read, grep, find, ls`), and `plan-refiner` (`read, write, edit, grep, find, ls`) tool surfaces allow the orchestrator to drive the plan to approval and commit. The smoke task description embeds a unique sentinel string `SMOKE_GENPLAN_OK_2026_04_27` so the produced plan and review files can be located deterministically.

The task uses an evidence-snapshot pattern: outcomes (paths, sentinel-presence, orchestrator status, BLOCKED/NEEDS_CONTEXT presence) are written to `/tmp/pi-smoke-genplan-evidence.txt` BEFORE cleanup runs, so post-cleanup acceptance verification can read the snapshot even after `git reset --hard` removes the original artifacts.

**Files:**
- Produces (ephemeral, removed in cleanup): one new plan file under `.pi/plans/` whose name is derived from the smoke task description; its contents include the sentinel `SMOKE_GENPLAN_OK_2026_04_27`.
- Produces (ephemeral, removed in cleanup): one new review file under `.pi/plans/reviews/` matching the plan's basename.
- Produces (ephemeral, reverted in cleanup): one git commit made by `refine-plan` (auto-commit-on-approval) committing the plan + review pair.
- Produces (persists past cleanup): `/tmp/pi-smoke-genplan-evidence.txt` — the evidence snapshot read by post-task verification.

**Steps:**

- [ ] **Step 1: Validate prerequisites and capture pre-smoke HEAD.**

  ```bash
  test -s /tmp/pi-task1-head-sha.txt || { echo "ERROR: /tmp/pi-task1-head-sha.txt missing — Task 1 must complete first"; exit 1; }
  TASK1_HEAD=$(cat /tmp/pi-task1-head-sha.txt)
  CURRENT_HEAD=$(git rev-parse HEAD)
  test "$CURRENT_HEAD" = "$TASK1_HEAD" || { echo "ERROR: HEAD ($CURRENT_HEAD) != Task1 HEAD ($TASK1_HEAD); aborting"; exit 1; }
  echo "Pre-smoke HEAD = $CURRENT_HEAD"
  ```

  This guards against accidental mid-plan drift between Task 1 and Task 2.

- [ ] **Step 2: Capture orchestrator output to a transcript file.**

  In the pi/Claude session that will drive the smoke run, configure output capture so the orchestrator's stdout is teed to a transcript file. Examples:
  - Pi session: from a shell, run `script -q /tmp/pi-smoke-genplan-transcript.txt pi --new-session` (the operator then issues the slash command inside the new pi session). When the smoke run ends, exit the script wrapper.
  - Claude pane / headless: tee the session's terminal output to `/tmp/pi-smoke-genplan-transcript.txt` using the host terminal's logging facility.

  If the operator cannot capture the transcript automatically, manually paste the orchestrator's complete final message into `/tmp/pi-smoke-genplan-transcript.txt` after Step 3 finishes. The transcript must include the orchestrator's `STATUS:` / `PLAN_PATH:` / `REVIEW_PATHS:` block and any `BLOCKED` or `NEEDS_CONTEXT` reports from dispatched subagents.

- [ ] **Step 3: Invoke `/generate-plan` with the sentinel-bearing freeform task.**

  Issue this exact slash command inside the captured session:

  ```
  /generate-plan SMOKE_GENPLAN_OK_2026_04_27 — produce a no-op plan: do not modify any files; this is a tool-surface smoke test only.
  ```

  Wait for the orchestrator to complete. The orchestrator's final message should report `STATUS: approved`, `COMMIT: committed [<sha>]`, a `PLAN_PATH: .pi/plans/<filename>` line, and a `REVIEW_PATHS:` list with one entry under `.pi/plans/reviews/`.

- [ ] **Step 4: Locate the produced plan + review files and snapshot evidence.**

  Build the evidence file before any cleanup runs. This script tolerates either filename pattern (sentinel-derived slug, or default freshest-file-by-mtime).

  ```bash
  TRANSCRIPT=/tmp/pi-smoke-genplan-transcript.txt
  EVIDENCE=/tmp/pi-smoke-genplan-evidence.txt
  TASK1_HEAD=$(cat /tmp/pi-task1-head-sha.txt)

  # Locate plan file: prefer one whose name contains the sentinel, else freshest committed plan.
  PLAN_FILE=$(ls -t .pi/plans/*SMOKE*GENPLAN*OK*2026*.md 2>/dev/null | head -1)
  if [ -z "$PLAN_FILE" ]; then
    PLAN_FILE=$(ls -t .pi/plans/*.md 2>/dev/null | head -1)
  fi

  # Locate review file: derived from plan basename.
  PLAN_BASENAME=$(basename "$PLAN_FILE" .md)
  REVIEW_FILE=$(ls -t .pi/plans/reviews/${PLAN_BASENAME}-plan-review-v*.md 2>/dev/null | head -1)

  # Compute evidence values
  PLAN_EXISTS=$(test -s "$PLAN_FILE" && echo yes || echo no)
  REVIEW_EXISTS=$(test -s "$REVIEW_FILE" && echo yes || echo no)
  PLAN_HAS_SENTINEL=$(rg -q "SMOKE_GENPLAN_OK_2026_04_27" "$PLAN_FILE" 2>/dev/null && echo yes || echo no)
  ORCH_HAS_BLOCKED=$(rg -q "^STATUS:.*BLOCKED|\\bBLOCKED\\b" "$TRANSCRIPT" 2>/dev/null && echo yes || echo no)
  ORCH_HAS_NEEDS_CONTEXT=$(rg -q "\\bNEEDS_CONTEXT\\b" "$TRANSCRIPT" 2>/dev/null && echo yes || echo no)
  ORCH_STATUS=$(rg -oP "^STATUS:\\s*\\K(approved|issues_remaining|failed)" "$TRANSCRIPT" 2>/dev/null | head -1)
  POST_SHA=$(git rev-parse HEAD)

  cat > "$EVIDENCE" <<RECORD
  TASK=generate-plan-smoke
  PRE_SMOKE_SHA=$TASK1_HEAD
  POST_SMOKE_SHA=$POST_SHA
  PLAN_FILE_PATH=$PLAN_FILE
  PLAN_FILE_EXISTS=$PLAN_EXISTS
  PLAN_FILE_HAS_SENTINEL=$PLAN_HAS_SENTINEL
  REVIEW_FILE_PATH=$REVIEW_FILE
  REVIEW_FILE_EXISTS=$REVIEW_EXISTS
  ORCH_STATUS=$ORCH_STATUS
  ORCH_HAS_BLOCKED=$ORCH_HAS_BLOCKED
  ORCH_HAS_NEEDS_CONTEXT=$ORCH_HAS_NEEDS_CONTEXT
  RECORD

  cat "$EVIDENCE"
  ```

  Inspect the printed evidence and confirm `PLAN_FILE_EXISTS=yes`, `REVIEW_FILE_EXISTS=yes`, `PLAN_FILE_HAS_SENTINEL=yes`, `ORCH_HAS_BLOCKED=no`, `ORCH_HAS_NEEDS_CONTEXT=no`, and `ORCH_STATUS` is `approved` or `issues_remaining`. If any line is wrong, do NOT proceed to cleanup — fix the snapshot or re-run the smoke step before cleanup destroys the artifacts.

- [ ] **Step 5: Cleanup — revert the auto-commit and remove ephemeral artifacts (preserve the evidence file).**

  ```bash
  TASK1_HEAD=$(cat /tmp/pi-task1-head-sha.txt)
  EVIDENCE=/tmp/pi-smoke-genplan-evidence.txt
  PLAN_FILE=$(rg -oP "^PLAN_FILE_PATH=\K.*" "$EVIDENCE")
  REVIEW_FILE=$(rg -oP "^REVIEW_FILE_PATH=\K.*" "$EVIDENCE")

  # Reset to pre-smoke HEAD (drops refine-plan auto-commit)
  git reset --hard "$TASK1_HEAD"

  # Defensive: remove ephemeral plan + review even if reset removed them already
  rm -f "$PLAN_FILE" "$REVIEW_FILE"
  rm -f /tmp/pi-smoke-genplan-transcript.txt

  # Do NOT remove the evidence file — verify needs it.
  test -s "$EVIDENCE" || { echo "ERROR: evidence file missing"; exit 1; }

  git status --porcelain
  # Expected: empty output (clean working tree)
  git rev-parse HEAD
  # Expected: same SHA as $TASK1_HEAD
  ```

**Acceptance criteria:**

- The evidence file at `/tmp/pi-smoke-genplan-evidence.txt` exists, is non-empty, and records that the planner produced a non-empty plan file under `.pi/plans/`.
  Verify: run `grep -E '^PLAN_FILE_EXISTS=yes$' /tmp/pi-smoke-genplan-evidence.txt` and confirm exit code 0 and exactly one match.
- The evidence file records that the plan-refiner persisted a non-empty versioned review file under `.pi/plans/reviews/`.
  Verify: run `grep -E '^REVIEW_FILE_EXISTS=yes$' /tmp/pi-smoke-genplan-evidence.txt` and confirm exit code 0 and exactly one match.
- The evidence file records that the produced plan body contained the sentinel `SMOKE_GENPLAN_OK_2026_04_27`, confirming end-to-end task input/output coupling.
  Verify: run `grep -E '^PLAN_FILE_HAS_SENTINEL=yes$' /tmp/pi-smoke-genplan-evidence.txt` and confirm exit code 0 and exactly one match.
- The evidence file records the orchestrator's `STATUS` was `approved` or `issues_remaining` (not `failed`), and that no dispatched subagent reported `BLOCKED` or `NEEDS_CONTEXT`.
  Verify: run `grep -E '^ORCH_STATUS=(approved|issues_remaining)$' /tmp/pi-smoke-genplan-evidence.txt` and confirm exit code 0; AND run `grep -E '^ORCH_HAS_BLOCKED=no$' /tmp/pi-smoke-genplan-evidence.txt` and confirm exit code 0; AND run `grep -E '^ORCH_HAS_NEEDS_CONTEXT=no$' /tmp/pi-smoke-genplan-evidence.txt` and confirm exit code 0.
- The cleanup step restored HEAD to the Task-1 commit and the working tree is clean.
  Verify: run `git status --porcelain` and confirm empty output; AND run a single comparison `[ "$(git rev-parse HEAD)" = "$(cat /tmp/pi-task1-head-sha.txt)" ] && echo MATCH || echo MISMATCH` and confirm the output is exactly `MATCH`.

**Model recommendation:** standard

---

### Task 3: `execute-plan` smoke run — exercises `coder`, `verifier`

Drive a `/execute-plan` invocation on a single-task throwaway plan to confirm the corrected `coder` (`read, write, edit, grep, find, ls, bash`) and `verifier` (`read, grep, find, ls`) tool surfaces allow the inner orchestrator to drive a wave to a verified commit. The throwaway plan creates the deterministic file `agent/agents/_smoke_execute_output.txt` containing the sentinel `SMOKE_EXECPLAN_OK_2026_04_27`.

This task also uses the evidence-snapshot pattern: outcomes (sentinel content, verifier verdict, wave-commit subject, BLOCKED presence) are written to `/tmp/pi-smoke-execplan-evidence.txt` BEFORE cleanup, so verification can inspect the snapshot post-cleanup.

**Files:**
- Create (ephemeral, removed in cleanup): `.pi/plans/2026-04-27-smoke-execute-plan-tool-surface.md` — the throwaway plan file.
- Produces (ephemeral, removed in cleanup): `agent/agents/_smoke_execute_output.txt` — the deterministic output file the throwaway plan creates.
- Produces (ephemeral, reverted in cleanup): one git commit made by execute-plan's wave-commit step.
- Produces (persists past cleanup): `/tmp/pi-smoke-execplan-evidence.txt` — the evidence snapshot read by post-task verification.

**Steps:**

- [ ] **Step 1: Validate prerequisites and capture pre-smoke HEAD.**

  ```bash
  test -s /tmp/pi-task1-head-sha.txt || { echo "ERROR: /tmp/pi-task1-head-sha.txt missing — Task 1 must complete first"; exit 1; }
  TASK1_HEAD=$(cat /tmp/pi-task1-head-sha.txt)
  CURRENT_HEAD=$(git rev-parse HEAD)
  test "$CURRENT_HEAD" = "$TASK1_HEAD" || { echo "ERROR: HEAD ($CURRENT_HEAD) != Task1 HEAD ($TASK1_HEAD); aborting (Task 2 may not have cleaned up)"; exit 1; }
  ```

- [ ] **Step 2: Write the throwaway single-task plan.**

  Create `.pi/plans/2026-04-27-smoke-execute-plan-tool-surface.md` with this exact content:

  ```markdown
  # Smoke — execute-plan tool surface check

  ## Goal

  Create a one-line text file to exercise the coder + verifier pipeline.

  ## Architecture summary

  Single-task plan that writes a deterministic sentinel file. No production impact; cleaned up immediately after the smoke run by the parent task.

  ## Tech stack

  - Bash (file write)

  ## File Structure

  - `agent/agents/_smoke_execute_output.txt` (Create) — single-line sentinel file used to verify coder + verifier round-trip.

  ## Tasks

  ### Task 1: Create sentinel file `agent/agents/_smoke_execute_output.txt`

  **Files:**
  - Create: `agent/agents/_smoke_execute_output.txt`

  **Steps:**

  - [ ] **Step 1: Write the sentinel file.** Run `printf 'SMOKE_EXECPLAN_OK_2026_04_27\n' > agent/agents/_smoke_execute_output.txt` from the project root.

  **Acceptance criteria:**

  - The file `agent/agents/_smoke_execute_output.txt` exists and contains exactly the single line `SMOKE_EXECPLAN_OK_2026_04_27`.
    Verify: run `cat agent/agents/_smoke_execute_output.txt` and confirm the output is exactly `SMOKE_EXECPLAN_OK_2026_04_27` followed by a single trailing newline.

  **Model recommendation:** cheap

  **Dependencies:** none

  ## Dependencies

  - Task 1 depends on: (none)

  ## Risk Assessment

  - Risk: ephemeral output file accidentally committed past cleanup. Mitigation: cleanup step in the parent smoke task uses `git reset --hard <Task1-head>` and `rm -f` to ensure both the commit and the file are removed.
  ```

- [ ] **Step 3: Capture orchestrator output to a transcript file.**

  Configure the pi/Claude session to tee its terminal output to `/tmp/pi-smoke-execplan-transcript.txt` for the duration of Step 4. Use the same approach as Task 2 Step 2 (`script` wrapper, terminal logging, or manual paste of the orchestrator final message).

- [ ] **Step 4: Invoke `/execute-plan` on the throwaway plan.**

  Issue this exact slash command:

  ```
  /execute-plan .pi/plans/2026-04-27-smoke-execute-plan-tool-surface.md
  ```

  When prompted by the inner execute-plan's settings (Step 3 of `execute-plan`), pick `(c) customize`, then choose "current workspace" for Workspace so the smoke commit is made in this working tree (not a sub-worktree the parent cleanup can't see). Accept the rest of the defaults. Wait for the inner wave to complete: the inner `coder` should write the sentinel file, the inner `verifier` should return `VERDICT: PASS`, and the inner orchestrator should make the wave commit.

- [ ] **Step 5: Snapshot evidence before cleanup.**

  ```bash
  TRANSCRIPT=/tmp/pi-smoke-execplan-transcript.txt
  EVIDENCE=/tmp/pi-smoke-execplan-evidence.txt
  TASK1_HEAD=$(cat /tmp/pi-task1-head-sha.txt)

  OUTPUT_FILE=agent/agents/_smoke_execute_output.txt
  OUTPUT_EXISTS=$(test -s "$OUTPUT_FILE" && echo yes || echo no)
  OUTPUT_EXACT=$(diff -q <(printf 'SMOKE_EXECPLAN_OK_2026_04_27\n') "$OUTPUT_FILE" >/dev/null 2>&1 && echo yes || echo no)
  HEAD_SUBJECT=$(git log --format=%s -1 HEAD)
  HEAD_LISTS_OUTPUT=$(git show --name-only --format= HEAD | grep -Fxq "$OUTPUT_FILE" && echo yes || echo no)
  VERIFIER_PASS=$(rg -q "VERDICT:\\s*PASS" "$TRANSCRIPT" 2>/dev/null && echo yes || echo no)
  ORCH_HAS_BLOCKED=$(rg -q "\\bBLOCKED\\b" "$TRANSCRIPT" 2>/dev/null && echo yes || echo no)
  POST_SHA=$(git rev-parse HEAD)

  cat > "$EVIDENCE" <<RECORD
  TASK=execute-plan-smoke
  PRE_SMOKE_SHA=$TASK1_HEAD
  POST_SMOKE_SHA=$POST_SHA
  OUTPUT_FILE_EXISTS=$OUTPUT_EXISTS
  OUTPUT_FILE_EXACT_CONTENT=$OUTPUT_EXACT
  WAVE_COMMIT_SUBJECT=$HEAD_SUBJECT
  WAVE_COMMIT_LISTS_OUTPUT=$HEAD_LISTS_OUTPUT
  VERIFIER_VERDICT_PASS=$VERIFIER_PASS
  ORCH_HAS_BLOCKED=$ORCH_HAS_BLOCKED
  RECORD

  cat "$EVIDENCE"
  ```

  Inspect the printed evidence and confirm `OUTPUT_FILE_EXISTS=yes`, `OUTPUT_FILE_EXACT_CONTENT=yes`, `WAVE_COMMIT_SUBJECT` begins with `feat(plan): wave 1`, `WAVE_COMMIT_LISTS_OUTPUT=yes`, `VERIFIER_VERDICT_PASS=yes`, `ORCH_HAS_BLOCKED=no`. If any line is wrong, do NOT cleanup — fix the snapshot first.

- [ ] **Step 6: Cleanup — revert the wave commit and remove ephemeral artifacts (preserve evidence).**

  ```bash
  TASK1_HEAD=$(cat /tmp/pi-task1-head-sha.txt)
  EVIDENCE=/tmp/pi-smoke-execplan-evidence.txt

  # Reset to Task 1 HEAD; this drops the inner wave commit
  git reset --hard "$TASK1_HEAD"

  # Defensive removal in case files survived the reset (untracked variants)
  rm -f agent/agents/_smoke_execute_output.txt
  rm -f .pi/plans/2026-04-27-smoke-execute-plan-tool-surface.md
  rm -f .pi/plans/done/2026-04-27-smoke-execute-plan-tool-surface.md
  rm -f /tmp/pi-smoke-execplan-transcript.txt

  # Preserve the evidence file
  test -s "$EVIDENCE" || { echo "ERROR: evidence file missing"; exit 1; }

  git status --porcelain
  # Expected: empty output
  git rev-parse HEAD
  # Expected: same SHA as $TASK1_HEAD
  ```

  The `done/` `rm -f` covers the case where execute-plan's Step 16 moved the throwaway plan to `.pi/plans/done/`.

**Acceptance criteria:**

- The evidence file at `/tmp/pi-smoke-execplan-evidence.txt` exists and records that the inner coder created `agent/agents/_smoke_execute_output.txt` with exact sentinel content.
  Verify: run `grep -E '^OUTPUT_FILE_EXACT_CONTENT=yes$' /tmp/pi-smoke-execplan-evidence.txt` and confirm exit code 0 and exactly one match.
- The evidence file records that the inner `verifier` returned `VERDICT: PASS` for the throwaway task.
  Verify: run `grep -E '^VERIFIER_VERDICT_PASS=yes$' /tmp/pi-smoke-execplan-evidence.txt` and confirm exit code 0 and exactly one match.
- The evidence file records that the inner wave commit landed with the expected `feat(plan): wave 1` subject prefix and listed the smoke output file.
  Verify: run `grep -E '^WAVE_COMMIT_SUBJECT=feat\(plan\): wave 1' /tmp/pi-smoke-execplan-evidence.txt` and confirm exit code 0; AND run `grep -E '^WAVE_COMMIT_LISTS_OUTPUT=yes$' /tmp/pi-smoke-execplan-evidence.txt` and confirm exit code 0.
- The evidence file records that no dispatched subagent reported `BLOCKED`.
  Verify: run `grep -E '^ORCH_HAS_BLOCKED=no$' /tmp/pi-smoke-execplan-evidence.txt` and confirm exit code 0 and exactly one match.
- The cleanup step restored HEAD to the Task-1 commit and the working tree is clean.
  Verify: run `git status --porcelain` and confirm empty output; AND run `[ "$(git rev-parse HEAD)" = "$(cat /tmp/pi-task1-head-sha.txt)" ] && echo MATCH || echo MISMATCH` and confirm the output is exactly `MATCH`.

**Model recommendation:** standard

---

### Task 4: `refine-code` smoke run — exercises `code-reviewer`, `code-refiner`

Drive a `/refine-code` invocation on a trivial diff to confirm the corrected `code-reviewer` (`read, grep, find, ls, bash`) and `code-refiner` (`read, write, edit, grep, find, ls, bash`) tool surfaces allow the coordinator to drive the review-remediate loop. A trivial change (one-line addition to a fresh file) is unlikely to surface critical findings, so the expected outcome is `STATUS: clean`. `STATUS: max_iterations_reached` with a clearly bounded finding set is also acceptable.

Uses the same evidence-snapshot pattern: outcomes (review file path/existence, refine status, BLOCKED presence) are written to `/tmp/pi-smoke-refinecode-evidence.txt` before cleanup.

**Files:**
- Produces (ephemeral, removed in cleanup): `agent/agents/_smoke_refine_target.txt` — a one-line file used as the review target.
- Produces (ephemeral, removed in cleanup): one new review file under `.pi/reviews/` written by `code-refiner`.
- Produces (ephemeral, reverted in cleanup): the BASE setup commit, the HEAD edit commit, and any remediation commit `code-refiner` may have made.
- Produces (persists past cleanup): `/tmp/pi-smoke-refinecode-evidence.txt` — the evidence snapshot read by post-task verification.

**Steps:**

- [ ] **Step 1: Validate prerequisites and capture pre-smoke HEAD.**

  ```bash
  test -s /tmp/pi-task1-head-sha.txt || { echo "ERROR: /tmp/pi-task1-head-sha.txt missing — Task 1 must complete first"; exit 1; }
  TASK1_HEAD=$(cat /tmp/pi-task1-head-sha.txt)
  CURRENT_HEAD=$(git rev-parse HEAD)
  test "$CURRENT_HEAD" = "$TASK1_HEAD" || { echo "ERROR: HEAD ($CURRENT_HEAD) != Task1 HEAD ($TASK1_HEAD); aborting"; exit 1; }
  ```

- [ ] **Step 2: Create the review-target file and commit it as BASE.**

  ```bash
  printf 'SMOKE_REFINECODE_BASE_2026_04_27\n' > agent/agents/_smoke_refine_target.txt
  git add agent/agents/_smoke_refine_target.txt
  git commit -m "chore(smoke): refine-code base file (delete after smoke run)"

  BASE_SHA=$(git rev-parse HEAD)
  echo "$BASE_SHA" > /tmp/pi-smoke-refinecode-base-sha.txt
  ```

- [ ] **Step 3: Make a trivial edit and commit it as HEAD under review.**

  ```bash
  printf 'SMOKE_REFINECODE_BASE_2026_04_27\nSMOKE_REFINECODE_HEAD_2026_04_27\n' > agent/agents/_smoke_refine_target.txt
  git add agent/agents/_smoke_refine_target.txt
  git commit -m "chore(smoke): refine-code head edit (delete after smoke run)"

  HEAD_SHA=$(git rev-parse HEAD)
  echo "$HEAD_SHA" > /tmp/pi-smoke-refinecode-head-sha.txt
  ```

- [ ] **Step 4: Capture orchestrator output to a transcript file.**

  Tee the pi/Claude session output to `/tmp/pi-smoke-refinecode-transcript.txt` for the duration of Step 5 (same approach as Task 2 Step 2 and Task 3 Step 3).

- [ ] **Step 5: Resolve SHAs in shell, then invoke `/refine-code` with the literal 40-character hex values.**

  A pi slash-command prompt is NOT a shell — `$(cat ...)` substitutions are passed through as literal strings, not expanded to file contents. First, in a regular shell (outside the pi/Claude session, but in the same project root), read the SHAs to obtain the resolved 40-character hex values:

  ```bash
  cat /tmp/pi-smoke-refinecode-base-sha.txt
  # Prints: <40-char-hex-base-sha>
  cat /tmp/pi-smoke-refinecode-head-sha.txt
  # Prints: <40-char-hex-head-sha>
  ```

  Copy the two printed 40-character SHA strings. Then, in the captured pi/Claude session, invoke `/refine-code` with those literal hex values substituted in directly (replace `<base-sha>` and `<head-sha>` with the values you just copied — the slash command must receive resolved 40-character hex SHAs, never `$(cat ...)` text):

  ```
  /refine-code BASE_SHA=<base-sha> HEAD_SHA=<head-sha> Description="Smoke test of refine-code tool surfaces"
  ```

  Concrete example shape (illustrative — use the actual SHAs you copied):

  ```
  /refine-code BASE_SHA=a1b2c3d4e5f6789012345678901234567890abcd HEAD_SHA=fedcba0987654321098765432109876543210fed Description="Smoke test of refine-code tool surfaces"
  ```

  Do NOT paste `BASE_SHA="$(cat ...)"` or `HEAD_SHA="$(cat ...)"` into the slash command — `agent/skills/refine-code/SKILL.md` requires concrete BASE_SHA/HEAD_SHA inputs and stops if they are missing or invalid, and a slash command will not expand the `$(cat ...)` substitution.

  If the skill takes positional arguments instead of `KEY=VALUE`, follow the standalone-usage signature documented in `agent/skills/refine-code/SKILL.md` Step 1 — pass the resolved 40-character BASE/HEAD SHAs and a one-line description (still as literal hex strings, not shell substitutions).

  Wait for `code-refiner` to complete. Acceptable outcomes:
  - `STATUS: clean` — no findings, no remediation.
  - `STATUS: max_iterations_reached` — remediation triggered but did not fully converge; the run still returned a clearly bounded finding set.

  Unacceptable outcomes: any subagent reports `BLOCKED`, the orchestrator returns an unhandled error, or `code-refiner` exits without writing a review file.

- [ ] **Step 6: Snapshot evidence before cleanup.**

  ```bash
  TRANSCRIPT=/tmp/pi-smoke-refinecode-transcript.txt
  EVIDENCE=/tmp/pi-smoke-refinecode-evidence.txt
  TASK1_HEAD=$(cat /tmp/pi-task1-head-sha.txt)

  REVIEW_FILE=$(ls -t .pi/reviews/*.md 2>/dev/null | head -1)
  REVIEW_EXISTS=$(test -s "$REVIEW_FILE" && echo yes || echo no)
  REVIEW_PATH_OK=$(case "$REVIEW_FILE" in .pi/reviews/*.md) echo yes ;; *) echo no ;; esac)
  ORCH_HAS_CLEAN=$(rg -q "STATUS:\\s*clean" "$TRANSCRIPT" 2>/dev/null && echo yes || echo no)
  ORCH_HAS_MAX_ITER=$(rg -q "STATUS:\\s*max_iterations_reached" "$TRANSCRIPT" 2>/dev/null && echo yes || echo no)
  ORCH_HAS_BLOCKED=$(rg -q "\\bBLOCKED\\b" "$TRANSCRIPT" 2>/dev/null && echo yes || echo no)
  CODE_REVIEWER_DISPATCHED=$(rg -q "code-reviewer" "$TRANSCRIPT" 2>/dev/null && echo yes || echo no)
  POST_SHA=$(git rev-parse HEAD)

  if [ "$ORCH_HAS_CLEAN" = "yes" ] || [ "$ORCH_HAS_MAX_ITER" = "yes" ]; then
    ORCH_STATUS_OK=yes
  else
    ORCH_STATUS_OK=no
  fi

  cat > "$EVIDENCE" <<RECORD
  TASK=refine-code-smoke
  PRE_SMOKE_SHA=$TASK1_HEAD
  POST_SMOKE_SHA=$POST_SHA
  REVIEW_FILE_PATH=$REVIEW_FILE
  REVIEW_FILE_EXISTS=$REVIEW_EXISTS
  REVIEW_FILE_PATH_OK=$REVIEW_PATH_OK
  ORCH_STATUS_OK=$ORCH_STATUS_OK
  ORCH_HAS_CLEAN=$ORCH_HAS_CLEAN
  ORCH_HAS_MAX_ITER=$ORCH_HAS_MAX_ITER
  ORCH_HAS_BLOCKED=$ORCH_HAS_BLOCKED
  CODE_REVIEWER_DISPATCHED=$CODE_REVIEWER_DISPATCHED
  RECORD

  cat "$EVIDENCE"
  ```

  Inspect the printed evidence and confirm `REVIEW_FILE_EXISTS=yes`, `REVIEW_FILE_PATH_OK=yes`, `ORCH_STATUS_OK=yes`, `ORCH_HAS_BLOCKED=no`, `CODE_REVIEWER_DISPATCHED=yes`. If any line is wrong, do NOT cleanup — fix the snapshot first.

- [ ] **Step 7: Cleanup — revert all setup and remediation commits and remove ephemeral artifacts (preserve evidence).**

  ```bash
  TASK1_HEAD=$(cat /tmp/pi-task1-head-sha.txt)
  EVIDENCE=/tmp/pi-smoke-refinecode-evidence.txt
  REVIEW_FILE=$(rg -oP "^REVIEW_FILE_PATH=\K.*" "$EVIDENCE")

  # Reset to pre-smoke HEAD; drops BASE setup commit, HEAD edit commit, and any code-refiner remediation commits
  git reset --hard "$TASK1_HEAD"

  # Defensive cleanup
  rm -f agent/agents/_smoke_refine_target.txt
  rm -f "$REVIEW_FILE"
  rm -f /tmp/pi-smoke-refinecode-base-sha.txt \
        /tmp/pi-smoke-refinecode-head-sha.txt \
        /tmp/pi-smoke-refinecode-transcript.txt

  # Preserve the evidence file
  test -s "$EVIDENCE" || { echo "ERROR: evidence file missing"; exit 1; }

  git status --porcelain
  # Expected: empty output
  git rev-parse HEAD
  # Expected: same SHA as $TASK1_HEAD
  ```

**Acceptance criteria:**

- The evidence file at `/tmp/pi-smoke-refinecode-evidence.txt` exists and records that `code-refiner` persisted a non-empty review file at a path under `.pi/reviews/`.
  Verify: run `grep -E '^REVIEW_FILE_EXISTS=yes$' /tmp/pi-smoke-refinecode-evidence.txt` and confirm exit code 0; AND run `grep -E '^REVIEW_FILE_PATH_OK=yes$' /tmp/pi-smoke-refinecode-evidence.txt` and confirm exit code 0.
- The evidence file records that `code-refiner` returned `STATUS: clean` or `STATUS: max_iterations_reached` (not an error or unrecognized status).
  Verify: run `grep -E '^ORCH_STATUS_OK=yes$' /tmp/pi-smoke-refinecode-evidence.txt` and confirm exit code 0 and exactly one match.
- The evidence file records that no dispatched subagent reported `BLOCKED`, and that `code-reviewer` was dispatched at least once.
  Verify: run `grep -E '^ORCH_HAS_BLOCKED=no$' /tmp/pi-smoke-refinecode-evidence.txt` and confirm exit code 0; AND run `grep -E '^CODE_REVIEWER_DISPATCHED=yes$' /tmp/pi-smoke-refinecode-evidence.txt` and confirm exit code 0.
- The cleanup step restored HEAD to the Task-1 commit and the working tree is clean.
  Verify: run `git status --porcelain` and confirm empty output; AND run `[ "$(git rev-parse HEAD)" = "$(cat /tmp/pi-task1-head-sha.txt)" ] && echo MATCH || echo MISMATCH` and confirm the output is exactly `MATCH`.

**Model recommendation:** standard

---

## Dependencies

- Task 2 depends on: Task 1
- Task 3 depends on: Task 1, Task 2
- Task 4 depends on: Task 1, Task 2, Task 3

Task 1 must land first because the smoke runs exercise the corrected tool surfaces. Tasks 2/3/4 are serialized (chained dependencies) so each smoke run's git operations (commit, reset) and ephemeral on-disk artifacts cannot collide with another smoke run's operations on the same working tree. Each smoke task cleans up after itself before the next one begins, restoring HEAD to the Task-1 commit recorded at `/tmp/pi-task1-head-sha.txt`.

## Risk Assessment

- **Risk: a smoke run is interrupted mid-flight, leaving the working tree dirty and the evidence file absent or incomplete.** Mitigation: each smoke task records `PRE_SMOKE_SHA` (Task 1 HEAD) before any setup commits, and uses `git reset --hard "$TASK1_HEAD"` plus `rm -f` in cleanup. If a smoke run is interrupted, the operator can restore the working tree by running `git reset --hard "$(cat /tmp/pi-task1-head-sha.txt)"` and `rm -f agent/agents/_smoke_*` manually — the same commands the cleanup step runs. The evidence file is only needed if the smoke completed; an interrupted run leaves the cleanup safe to re-run.
- **Risk: pi or Claude headless launches reject one of the new `tools:` lines because the parser's regex differs from the agent-frontmatter spec.** Mitigation: the spec uses only the seven existing pi builtins (`read, write, edit, bash, grep, find, ls`), already exercised in `spec-designer` (`read, write, grep, find, ls`) and `verifier` (`read, grep, find, ls`). The `resolvePiToolsArg` filter in `pi-extension/subagents/launch-spec.ts` is permissive — it filters out any token not in `PI_BUILTIN_TOOLS`, so even an unexpected token is silently dropped, never failing the launch. The smoke runs surface any tool-surface failures end-to-end as `BLOCKED` reports.
- **Risk: `plan-refiner` running on Claude headless ever needs `bash` for an unrecognized internal step.** Mitigation: re-read `agent/skills/refine-plan/refine-plan-prompt.md` and `agent/agents/plan-refiner.md` before applying the change. The current contract is that `plan-refiner` (a) reads prompt templates from disk (`read`), (b) writes review files (`write`/`edit`), (c) dispatches subagents through pi orchestration tools (provided by the CLI, not enumerated in `tools:`), and (d) appends `## Review Notes` to the plan (`edit`). It explicitly does not commit, run shell, or invoke external tooling — confirmed by the body's "do NOT invoke the `commit` skill or any git commit command" rule. If the smoke run reveals an undocumented `bash` need, that is reported as a finding (per the spec's "report bug, do not silently patch" constraint) — not addressed by adding `bash` to `tools:` in this work.
- **Risk: a smoke run fails because the underlying skill (`generate-plan`/`execute-plan`/`refine-code`) regressed independently of this change.** Mitigation: distinguish a tool-surface failure from a skill-logic regression by inspecting the evidence file. A tool-surface failure surfaces as `ORCH_HAS_BLOCKED=yes` (a subagent could not call a needed tool); a skill-logic regression surfaces as parser/protocol failures with `ORCH_HAS_BLOCKED=no`. Only the former is in scope for this plan; the latter is reported and addressed separately.
- **Risk: orchestrator transcript capture fails on a particular pi/Claude session backend, leaving the evidence file with `ORCH_HAS_BLOCKED=no` (the default for an empty transcript) when in fact a `BLOCKED` was reported.** Mitigation: the evidence-snapshot Step explicitly inspects the printed evidence file and refuses to proceed to cleanup if the values are wrong. The operator should confirm `ORCH_STATUS=...` is non-empty (Task 2) or `ORCH_HAS_CLEAN=yes` / `ORCH_HAS_MAX_ITER=yes` is true (Task 4) before cleanup; an empty status field indicates the transcript was not captured and the run must be re-driven.
- **Risk: `git reset --hard` in a cleanup step destroys uncommitted work the operator did between Task 1's commit and the smoke run.** Mitigation: each smoke task records and confirms `PRE_SMOKE_SHA == TASK1_HEAD` in Step 1. If the operator did unrelated uncommitted work, Step 1 fails with `HEAD != Task1 HEAD`, refusing to proceed until the operator stashes or commits that work explicitly.
- **Risk: the `/tmp/pi-task1-head-sha.txt` pointer is removed by a tmpfs reboot or `/tmp` cleanup between Task 1 completion and Task 2 start.** Mitigation: Tasks 2/3/4 each guard with `test -s /tmp/pi-task1-head-sha.txt` in Step 1 and abort with a clear error message if missing. Recovery: re-run Task 1's Step 12 (`git rev-parse HEAD > /tmp/pi-task1-head-sha.txt`) after confirming HEAD is still the Task-1 commit, then resume the smoke task.

## Test Command

```bash
cd agent && npm test
```

Existing extension unit tests live in `agent/extensions/*.test.ts` and are unrelated to `agent/agents/*.md` frontmatter; they should continue passing unchanged. Running them after Task 1 is a fast sanity check that the commit did not accidentally touch a `.ts` file. The smoke runs (Tasks 2/3/4) are end-to-end integration checks driven via `pi`/`claude` interactively and are NOT covered by `npm test`.


## Review Notes

_Added by plan reviewer — informational, not blocking._

### Warnings

- **Task 2**: Task 2’s narrative says the smoke should “drive the plan to approval and commit,” and Step 3 says the final message should report `STATUS: approved` and `COMMIT: committed [<sha>]`. However, the acceptance criterion accepts `ORCH_STATUS=(approved|issues_remaining)` and does not verify any `COMMIT` field or that the smoke commit actually happened. Why it matters: A run that ends with `issues_remaining` or no committed plan/review pair could still pass the written acceptance checks, even though it would not prove the full `generate-plan` → `refine-plan` approval/commit path required by the task narrative and original spec intent. Recommendation: Tighten Task 2 evidence/acceptance to require the intended terminal condition, or explicitly justify why `issues_remaining` is acceptable for this smoke. If approval/commit is required, record and verify `ORCH_STATUS=approved` plus a committed SHA/commit subject or `COMMIT=committed`.
- **Task 4**: Task 4 Step 6 locates the review file using `REVIEW_FILE=$(ls -t .pi/reviews/*.md 2>/dev/null | head -1)`. The repository already may contain unrelated review files under `.pi/reviews/`, and the smoke review path has no unique sentinel or pre-run baseline check. If `code-refiner` fails to write a new review file, the evidence can still record `REVIEW_FILE_EXISTS=yes` and `REVIEW_FILE_PATH_OK=yes` for a stale review. Cleanup then runs `rm -f "$REVIEW_FILE"`, potentially deleting an unrelated pre-existing review artifact. Why it matters: This can create a false-positive smoke result and can destructively remove unrelated review files during cleanup if the produced review is not deterministically identified. Recommendation: Make Task 4 identify the produced review deterministically: capture the code-refiner-reported review path from the transcript, use a unique smoke-specific filename/sentinel if the skill supports it, or snapshot the pre-existing `.pi/reviews/*.md` set before the run and select only a newly created file. Cleanup should only remove a confirmed smoke-produced review file.
