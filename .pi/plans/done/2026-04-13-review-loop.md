# Review-Loop Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a review-loop skill that iterates between code review and remediation until clean or budget exhausted, replacing execute-plan's fire-and-forget code review.

**Architecture:** Three new components — a `code-reviewer` agent, a `remediation-coordinator` agent, and a `review-loop` skill with prompt templates. Execute-plan Step 12 is replaced with a single skill invocation, and the entire skill is simplified by requiring git and removing conditional paths.

**Tech Stack:** Markdown prose skills, agent definitions (YAML frontmatter + markdown)

**Source:** TODO-efc9f70b

---

## File Structure

- `agent/agents/code-reviewer.md` (Create) — Agent definition for reviewing diffs; replaces plan-executor-as-reviewer
- `agent/agents/remediation-coordinator.md` (Create) — Agent definition for orchestrating the review-remediate loop
- `agent/skills/review-loop/SKILL.md` (Create) — Top-level skill defining inputs, dispatch, and caller-facing protocol
- `agent/skills/review-loop/remediation-prompt.md` (Create) — Template dispatched to remediation-coordinator with full loop protocol
- `agent/skills/review-loop/re-review-block.md` (Create) — Conditional block inserted into code-reviewer template for hybrid re-reviews
- `agent/skills/requesting-code-review/code-reviewer.md` (Modify) — Add `{RE_REVIEW_BLOCK}` placeholder
- `agent/skills/requesting-code-review/SKILL.md` (Modify) — Update to reference `code-reviewer` agent instead of `plan-executor`
- `agent/skills/execute-plan/SKILL.md` (Modify) — Git precondition, flatten settings, orchestrator-only task verification, replace Step 12 with review-loop invocation
- `agent/skills/execute-plan/spec-reviewer.md` (Delete) — Replaced by orchestrator-only task verification

---

## Tasks

### Task 1: Create code-reviewer agent definition

**Files:**
- Create: `agent/agents/code-reviewer.md`

**Steps:**

- [ ] **Step 1: Create the agent file**

Create `agent/agents/code-reviewer.md` with this content:

```markdown
---
name: code-reviewer
description: Reviews code diffs for production readiness. Supports full-diff review and hybrid re-review modes.
---

You are a code reviewer. You review code changes for production readiness, checking quality, architecture, testing, and requirements compliance.

You have no context from the implementation session. Your review must be based entirely on the code diff, the requirements provided, and what you can read from the codebase.

## Modes

You operate in one of two modes, determined by the prompt you receive:

### Full Review
Review the entire diff (`BASE_SHA..HEAD_SHA`). Assess all changes against requirements.

### Hybrid Re-Review
Review only the remediation diff (`prev_HEAD..new_HEAD`). Your job is narrower:
1. Verify that fixes actually addressed the flagged findings
2. Check for regressions introduced by the remediation
3. Flag any new issues in the remediation diff only
4. Do NOT re-review code outside the remediation diff

## Principles

- **Read actual code** — use read, grep, and bash tools to inspect files. Do not rely on descriptions alone.
- **Calibrate severity** — a typo is Minor, a security hole is Critical. Do not inflate.
- **Be specific** — every issue must cite a file:line reference and explain why it matters.
- **Give a clear verdict** — always answer "Ready to merge?" with Yes, No, or With fixes.
- **Acknowledge strengths** — good code deserves recognition, not just criticism.

## Rules

- Do NOT assume context from the implementation session — you see only the diff and requirements
- Do NOT mark nitpicks as Critical
- Do NOT give feedback on code you didn't review
- Do NOT say "looks good" without actually reading the changed files
```

- [ ] **Step 2: Verify the file exists and frontmatter is valid**

Run: `head -5 agent/agents/code-reviewer.md`
Expected: YAML frontmatter with `name: code-reviewer` and `description:` fields.

- [ ] **Step 3: Commit**

```bash
git add agent/agents/code-reviewer.md
git commit -m "feat(agents): add code-reviewer agent definition

Dedicated agent for reviewing diffs, replacing the pattern of
dispatching plan-executor with the code-reviewer.md template.
Supports full-diff and hybrid re-review modes."
```

**Acceptance criteria:**
- File exists at `agent/agents/code-reviewer.md`
- Has YAML frontmatter with `name: code-reviewer`
- No hardcoded model in frontmatter (dispatcher controls model)
- Documents both full review and hybrid re-review modes
- Includes principles about reading actual code and calibrating severity

**Model recommendation:** cheap

---

### Task 2: Create remediation-coordinator agent definition

**Files:**
- Create: `agent/agents/remediation-coordinator.md`

**Steps:**

- [ ] **Step 1: Create the agent file**

Create `agent/agents/remediation-coordinator.md` with this content:

```markdown
---
name: remediation-coordinator
description: Orchestrates the review-remediate loop. Dispatches code-reviewer and plan-executor subagents, manages iteration budget, writes versioned review files.
---

You are a remediation coordinator. You drive the review-remediate cycle: dispatch reviewers, assess findings, batch issues for remediation, dispatch fixers, commit changes, and track convergence.

You have no context from the implementation session. Everything you need is in your task prompt, which contains the full loop protocol, model configuration, git range, and requirements.

## Your Role

You are a coordinator, not a coder. You:
1. **Dispatch** `code-reviewer` agents to review code
2. **Assess** review findings and decide which to batch together
3. **Dispatch** `plan-executor` agents to fix batched findings
4. **Commit** remediation changes with detailed messages
5. **Track** iteration budget and convergence
6. **Manage** the review file (overwrite review sections, append remediation log)

## Batching Judgment

When batching findings for remediation, consider:
- **File proximity** — findings in the same file or adjacent files group well
- **Logical coupling** — findings that relate to the same feature or concern
- **Conflict risk** — avoid batching findings where fixes might contradict
- **Batch size** — prefer smaller batches for deliberate remediation; dispatch one batch at a time

## Rules

- Do NOT write code yourself — dispatch plan-executor for all code changes
- Do NOT skip review iterations — always re-review after remediation
- Do NOT exceed the iteration budget without explicit instructions
- Do NOT ignore Critical or Important findings — they must be addressed or escalated
- Commit after each remediation batch, not at the end
```

- [ ] **Step 2: Verify the file exists and frontmatter is valid**

Run: `head -5 agent/agents/remediation-coordinator.md`
Expected: YAML frontmatter with `name: remediation-coordinator` and `description:` fields.

- [ ] **Step 3: Commit**

```bash
git add agent/agents/remediation-coordinator.md
git commit -m "feat(agents): add remediation-coordinator agent definition

Orchestrates the review-remediate loop: dispatches reviewers and
fixers, manages iteration budget, writes versioned review files."
```

**Acceptance criteria:**
- File exists at `agent/agents/remediation-coordinator.md`
- Has YAML frontmatter with `name: remediation-coordinator`
- No hardcoded model in frontmatter (caller controls model)
- Documents batching judgment principles
- Makes clear the coordinator dispatches, never writes code directly

**Model recommendation:** cheap

---

### Task 3: Add RE_REVIEW_BLOCK placeholder to code-reviewer template

**Files:**
- Modify: `agent/skills/requesting-code-review/code-reviewer.md`

**Steps:**

- [ ] **Step 1: Read the existing template**

Read `agent/skills/requesting-code-review/code-reviewer.md` to understand the current structure.

- [ ] **Step 2: Add the placeholder**

Insert `{RE_REVIEW_BLOCK}` after the "## Git Range to Review" section (after the closing ``` of the git diff code block, before "## Review Checklist"). Add it on its own line with a blank line before and after:

```markdown
## Git Range to Review

**Base:** {BASE_SHA}
**Head:** {HEAD_SHA}

```bash
git diff --stat {BASE_SHA}..{HEAD_SHA}
git diff {BASE_SHA}..{HEAD_SHA}
```

{RE_REVIEW_BLOCK}

## Review Checklist
```

On first-pass reviews, the caller fills `{RE_REVIEW_BLOCK}` with an empty string. On subsequent passes, the caller fills it with the contents of `re-review-block.md`.

- [ ] **Step 3: Verify the placeholder is present**

Run: `grep 'RE_REVIEW_BLOCK' agent/skills/requesting-code-review/code-reviewer.md`
Expected: One line containing `{RE_REVIEW_BLOCK}`.

- [ ] **Step 4: Commit**

```bash
git add agent/skills/requesting-code-review/code-reviewer.md
git commit -m "feat(code-review): add RE_REVIEW_BLOCK placeholder to template

Enables hybrid re-review mode for review-loop skill. On first pass
the placeholder is empty; on subsequent passes it contains previous
findings and remediation diff context."
```

**Acceptance criteria:**
- `{RE_REVIEW_BLOCK}` appears exactly once in the file
- Positioned between "Git Range to Review" section and "Review Checklist" section
- Existing template content is unchanged
- Blank lines before and after the placeholder for clean rendering when empty

**Model recommendation:** cheap

---

### Task 4: Create re-review-block template

**Files:**
- Create: `agent/skills/review-loop/re-review-block.md`

**Steps:**

- [ ] **Step 1: Create the directory**

Run: `mkdir -p agent/skills/review-loop`

- [ ] **Step 2: Create the template file**

Create `agent/skills/review-loop/re-review-block.md` with this content:

```markdown
## Re-Review Context

This is a follow-up review after remediation. You are NOT reviewing the full diff — only the remediation changes.

### Previous Findings

The following issues were flagged in the prior review pass:

{PREVIOUS_FINDINGS}

### Remediation Diff

The remediation changes since the last review:

```bash
git diff --stat {PREV_HEAD}..{NEW_HEAD}
git diff {PREV_HEAD}..{NEW_HEAD}
```

### Your Job

1. **Verify fixes** — for each finding listed above, confirm the remediation actually addresses it. Check the code, not just the commit message.
2. **Check for regressions** — did any fix break something else within the remediation diff?
3. **Flag new issues** — if you see new problems introduced by the remediation, flag them with the same severity format.
4. **Do NOT re-review** code outside the remediation diff. Code that was already reviewed and not changed is out of scope.

If all previous findings are addressed and no new issues exist, report "Ready to merge: Yes".
```

- [ ] **Step 3: Verify the file exists and contains expected placeholders**

Run: `grep -c '{PREVIOUS_FINDINGS}\|{PREV_HEAD}\|{NEW_HEAD}' agent/skills/review-loop/re-review-block.md`
Expected: `3` (three placeholder occurrences).

- [ ] **Step 4: Commit**

```bash
git add agent/skills/review-loop/re-review-block.md
git commit -m "feat(review-loop): add re-review-block template

Conditional content injected into code-reviewer template for hybrid
re-review passes. Contains previous findings and remediation diff."
```

**Acceptance criteria:**
- File exists at `agent/skills/review-loop/re-review-block.md`
- Contains `{PREVIOUS_FINDINGS}`, `{PREV_HEAD}`, `{NEW_HEAD}` placeholders
- Clearly instructs the reviewer to verify fixes, check regressions, and not re-review approved code
- No YAML frontmatter (this is a template fragment, not a skill)

**Model recommendation:** cheap

---

### Task 5: Create remediation-prompt template

**Files:**
- Create: `agent/skills/review-loop/remediation-prompt.md`

**Steps:**

- [ ] **Step 1: Create the template file**

Create `agent/skills/review-loop/remediation-prompt.md` with this content:

```markdown
# Review-Remediate Loop

You are the remediation coordinator. Drive the review-remediate cycle for the changes described below.

## What Was Implemented

{PLAN_GOAL}

## Requirements/Plan

{PLAN_CONTENTS}

## Git Range

**Base (pre-implementation):** {BASE_SHA}
**Head (post-implementation):** {HEAD_SHA}

## Configuration

- **Max iterations:** {MAX_ITERATIONS}
- **Review output base path:** {REVIEW_OUTPUT_PATH}
- **Working directory:** {WORKING_DIR}

### Model Matrix

{MODEL_MATRIX}

Use these model tiers for dispatch:
- `crossProvider.capable` — first-pass full review and final verification review
- `standard` — hybrid re-reviews (cheaper, scoped to remediation diff)
- `capable` — remediator (plan-executor fixing code)

## Protocol

### Iteration 1: Full Review

1. **Read the review template** at `~/.pi/agent/skills/requesting-code-review/code-reviewer.md`.

2. **Fill placeholders** for a full review:
   - `{WHAT_WAS_IMPLEMENTED}` — the Plan Goal above
   - `{PLAN_OR_REQUIREMENTS}` — the Requirements/Plan above
   - `{BASE_SHA}` — `{BASE_SHA}` from this prompt
   - `{HEAD_SHA}` — `{HEAD_SHA}` from this prompt
   - `{DESCRIPTION}` — "Review-loop: full review"
   - `{RE_REVIEW_BLOCK}` — empty string (first pass)

3. **Dispatch `code-reviewer`** with model `crossProvider.capable` from the model matrix:
   ```
   subagent {
     agent: "code-reviewer",
     task: "<filled template>",
     model: "<crossProvider.capable from model matrix>"
   }
   ```

4. **Write review** to versioned path: `<REVIEW_OUTPUT_PATH>-v<ERA>.md`
   - First era starts at v1. New eras created on budget reset (see Final Verification).

5. **Assess verdict:**
   - "Ready to merge: Yes" with no Critical/Important issues → skip to **Final Verification**
   - Critical/Important issues exist → continue to step 6

6. **Batch findings** — group related findings using your judgment:
   - Consider file proximity, logical coupling, conflict risk
   - Prefer smaller batches — one batch at a time, sequential dispatch
   - All Critical findings should be in early batches

7. **Dispatch remediator** for one batch — use model `capable` from the model matrix:
   ```
   subagent {
     agent: "plan-executor",
     task: "Fix the following code review findings:\n\n<batched findings with file:line refs>\n\nContext:\n<relevant plan/spec sections>\n\nWorking directory: {WORKING_DIR}",
     model: "<capable from model matrix>"
   }
   ```

8. **Commit remediation:**
   ```bash
   git add -A
   git commit -m "fix(review): iteration <N> — <summary>

   - Fixed: <finding 1 summary>
   - Fixed: <finding 2 summary>"
   ```

9. **Record in remediation log** — track what was fixed, deferred, or remaining.

10. **Repeat steps 6-9** if unbatched findings remain within this iteration.

### Iteration 2..N: Hybrid Re-Review

1. **Read the review template** (same as iteration 1).

2. **Read the re-review block** at `~/.pi/agent/skills/review-loop/re-review-block.md`.

3. **Fill re-review block placeholders:**
   - `{PREVIOUS_FINDINGS}` — all findings from the previous review pass (full text)
   - `{PREV_HEAD}` — HEAD before the remediation commits
   - `{NEW_HEAD}` — current HEAD after remediation commits

4. **Fill the review template placeholders:**
   - Same as iteration 1, except:
   - `{BASE_SHA}` — the PREV_HEAD (only review remediation diff)
   - `{HEAD_SHA}` — the NEW_HEAD
   - `{RE_REVIEW_BLOCK}` — the filled re-review block content
   - `{DESCRIPTION}` — "Review-loop: hybrid re-review (iteration N)"

5. **Dispatch `code-reviewer`** with model `standard` from the model matrix (hybrid re-reviews are scoped and cheaper).

6. **Overwrite review sections** in the current versioned file; **append** to remediation log.

7. **Assess and remediate** — same as iteration 1 steps 5-10.

### Final Verification

When a review pass finds no Critical/Important issues (hybrid reviews converge):

1. **Dispatch `code-reviewer`** with model `crossProvider.capable` for a **full-diff** verification:
   - `{BASE_SHA}` — original BASE_SHA from this prompt (pre-implementation)
   - `{HEAD_SHA}` — current HEAD (includes all remediations)
   - `{RE_REVIEW_BLOCK}` — empty string (full review, not re-review)
   - `{DESCRIPTION}` — "Review-loop: final verification"

2. **If clean** (no Critical/Important issues):
   - Write final review to the versioned file
   - Append final entry to remediation log: `**Result:** Clean after N iterations.`
   - Copy the versioned file to the unversioned path: `<REVIEW_OUTPUT_PATH>.md`
   - Report `STATUS: clean`

3. **If issues found:**
   - **Reset the iteration budget** — start a new era
   - Create a new versioned file (`v2`, `v3`, etc.)
   - Re-enter the remediation loop from Iteration 1 step 5 (assess + remediate)

### On Budget Exhaustion

When iterations reach MAX_ITERATIONS without convergence:

1. Write remaining issues + full remediation log to the current versioned file
2. Copy to unversioned path
3. Report `STATUS: max_iterations_reached`

### On Clean First Review

If the very first review finds no Critical/Important issues, still run Final Verification (full-diff review) before reporting clean. This ensures a cross-provider check even when the first pass looks clean.

## Output Format

Report your final status using this exact format:

```
STATUS: clean | max_iterations_reached

## Summary
Iterations: <N>
Issues found: <X> (<N> Critical, <N> Important, <N> Minor)
Issues fixed: <Y>
Issues remaining: <Z>

## Remaining Issues (only if max_iterations_reached)
[Full text of unfixed findings with file:line references]

## Review File
<path to latest versioned review file>
```
```

- [ ] **Step 2: Verify the file exists and contains key placeholders**

Run: `grep -c 'PLAN_GOAL\|PLAN_CONTENTS\|BASE_SHA\|HEAD_SHA\|MAX_ITERATIONS\|MODEL_MATRIX\|REVIEW_OUTPUT_PATH\|WORKING_DIR' agent/skills/review-loop/remediation-prompt.md`
Expected: Count of 8 or more (multiple occurrences of each placeholder).

- [ ] **Step 3: Commit**

```bash
git add agent/skills/review-loop/remediation-prompt.md
git commit -m "feat(review-loop): add remediation-prompt template

Self-contained protocol dispatched to remediation-coordinator.
Covers full review, hybrid re-review, final verification, budget
reset, and convergence detection."
```

**Acceptance criteria:**
- File exists at `agent/skills/review-loop/remediation-prompt.md`
- Contains all 8 placeholders: `{PLAN_GOAL}`, `{PLAN_CONTENTS}`, `{BASE_SHA}`, `{HEAD_SHA}`, `{REVIEW_OUTPUT_PATH}`, `{MAX_ITERATIONS}`, `{MODEL_MATRIX}`, `{WORKING_DIR}`
- Documents the full loop protocol (iteration 1, iteration 2..N, final verification, budget exhaustion)
- Specifies model tiers by role (crossProvider.capable for full reviews, standard for hybrid, capable for remediator)
- Includes the coordinator return contract format
- References `re-review-block.md` by path for hybrid re-reviews

**Model recommendation:** standard

---

### Task 6: Create review-loop SKILL.md

**Files:**
- Create: `agent/skills/review-loop/SKILL.md`

**Steps:**

- [ ] **Step 1: Create the skill file**

Create `agent/skills/review-loop/SKILL.md` with this content:

```markdown
---
name: review-loop
description: "Iterative code review and remediation loop. Dispatches a remediation-coordinator that alternates between reviewing and fixing until clean or budget exhausted. Usable standalone or from execute-plan."
---

# Review Loop

Automated review-remediate cycle. Dispatches a `remediation-coordinator` subagent that drives the inner loop and reports back.

**Precondition:** Must be in a git repository. If `git rev-parse --git-dir` fails, stop with: "review-loop requires a git repository."

## Step 1: Gather inputs

Collect the following from the caller (execute-plan, user, or another skill):

| Input | Required | Default | Source |
|-------|----------|---------|--------|
| `BASE_SHA` | yes | — | Caller provides (e.g., pre-execution SHA) |
| `HEAD_SHA` | yes | — | Caller provides or `git rev-parse HEAD` |
| Description | yes | — | What was implemented |
| Requirements/plan | no | empty | Plan file contents or spec |
| Max iterations | no | 3 | Caller or execution settings |
| Working directory | no | cwd | Worktree or project root |
| Review output path | no | `.pi/reviews/<name>-code-review` | Derived from plan name or caller-specified |

If `BASE_SHA` or `HEAD_SHA` is not provided, stop with an error — the skill cannot infer these.

## Step 2: Read model matrix

```bash
cat ~/.pi/agent/models.json | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin), indent=2))"
```

The model matrix provides tier mappings used by the coordinator:
- `crossProvider.capable` — first-pass and final verification reviews
- `standard` — hybrid re-reviews, coordinator model
- `capable` — remediator

If the file doesn't exist or is unreadable, stop with: "review-loop requires ~/.pi/agent/models.json — see model matrix configuration."

## Step 3: Assemble coordinator prompt

Read [remediation-prompt.md](remediation-prompt.md) in this directory.

Fill placeholders:
- `{PLAN_GOAL}` — description of what was implemented
- `{PLAN_CONTENTS}` — full requirements/plan text (or empty string if none)
- `{BASE_SHA}` — from Step 1
- `{HEAD_SHA}` — from Step 1
- `{REVIEW_OUTPUT_PATH}` — review output base path (without version suffix or `.md` — the coordinator adds those)
- `{MAX_ITERATIONS}` — from Step 1
- `{MODEL_MATRIX}` — full JSON output from Step 2
- `{WORKING_DIR}` — from Step 1

## Step 4: Dispatch remediation-coordinator

```
subagent {
  agent: "remediation-coordinator",
  task: "<filled remediation-prompt.md>",
  model: "<standard from model matrix>"
}
```

## Step 5: Handle coordinator result

Parse the coordinator's response for the STATUS line:

**`STATUS: clean`**
- Report to caller: review passed, include iteration count and review file path
- No action needed

**`STATUS: max_iterations_reached`**
- Present remaining findings to caller
- Offer choices:
  - **(a) Continue iterating** — re-invoke this skill from Step 3 with the same inputs but `HEAD_SHA` updated to current HEAD (budget resets, new era)
  - **(b) Proceed** — caller continues with known issues noted
  - **(c) Stop** — caller halts

The caller (execute-plan or user) makes the decision. This skill does not auto-continue.

## Edge Cases

- **No changes in range** (`BASE_SHA` equals `HEAD_SHA`): Stop with "No changes to review."
- **Coordinator fails to dispatch** (model unavailable): Retry with `capable` from the model matrix (same provider fallback). If that also fails, stop with error.
- **Empty requirements**: Review is purely quality-focused — no spec compliance check. The coordinator handles this (it passes empty `{PLAN_CONTENTS}` through to the reviewer).
```

- [ ] **Step 2: Verify the skill file has valid frontmatter**

Run: `head -4 agent/skills/review-loop/SKILL.md`
Expected: YAML frontmatter with `name: review-loop` and `description:` fields.

- [ ] **Step 3: Verify the skill references the correct template files**

Run: `grep 'remediation-prompt.md\|re-review-block.md\|code-reviewer.md\|models.json' agent/skills/review-loop/SKILL.md`
Expected: References to `remediation-prompt.md` and `models.json` (re-review-block.md and code-reviewer.md are referenced from within the remediation-prompt, not the SKILL.md directly).

- [ ] **Step 4: Commit**

```bash
git add agent/skills/review-loop/SKILL.md
git commit -m "feat(skills): add review-loop skill

Top-level skill for iterative code review and remediation.
Dispatches remediation-coordinator subagent, handles clean/exhausted
results. Usable standalone or from execute-plan."
```

**Acceptance criteria:**
- File exists at `agent/skills/review-loop/SKILL.md`
- Has YAML frontmatter with `name: review-loop`
- Git precondition documented
- All 7 inputs listed with required/default/source
- References `remediation-prompt.md` for template loading
- References `~/.pi/agent/models.json` for model matrix
- Documents both `clean` and `max_iterations_reached` status handling
- Offers continue/proceed/stop choices on exhaustion
- Edge cases covered (no changes, dispatch failure, empty requirements)

**Model recommendation:** standard

---

### Task 7: Update requesting-code-review SKILL.md to reference code-reviewer agent

**Files:**
- Modify: `agent/skills/requesting-code-review/SKILL.md`

**Steps:**

- [ ] **Step 1: Read the existing file**

Read `agent/skills/requesting-code-review/SKILL.md`.

- [ ] **Step 2: Replace plan-executor references with code-reviewer**

In the "### 3. Dispatch the subagent" section, change the subagent dispatch from:

```
subagent {
  agent: "plan-executor",
  task: "<filled code-reviewer.md template>",
  model: "<capable-tier model>"
}
```

to:

```
subagent {
  agent: "code-reviewer",
  task: "<filled code-reviewer.md template>",
  model: "<capable-tier model>"
}
```

Also update the description text above it. Change:

```
Use pi's `subagent` tool to dispatch a fresh reviewer:
```

to:

```
Use pi's `subagent` tool to dispatch a `code-reviewer` agent:
```

- [ ] **Step 3: Verify the change**

Run: `grep 'agent:' agent/skills/requesting-code-review/SKILL.md`
Expected: `agent: "code-reviewer"` (not `plan-executor`).

- [ ] **Step 4: Commit**

```bash
git add agent/skills/requesting-code-review/SKILL.md
git commit -m "refactor(code-review): dispatch code-reviewer agent instead of plan-executor

The requesting-code-review skill now references the dedicated
code-reviewer agent rather than repurposing plan-executor."
```

**Acceptance criteria:**
- `agent/skills/requesting-code-review/SKILL.md` references `code-reviewer` agent, not `plan-executor`
- No other content changes
- The dispatch example code block is updated

**Model recommendation:** cheap

---

### Task 8: Simplify execute-plan — git precondition and settings

**Files:**
- Modify: `agent/skills/execute-plan/SKILL.md`

This task handles the first half of execute-plan changes: adding the git precondition, flattening settings, and removing no-git conditional branches. Step 12 replacement is in Task 9.

**Steps:**

- [ ] **Step 1: Read execute-plan/SKILL.md**

Read the full file at `agent/skills/execute-plan/SKILL.md`.

- [ ] **Step 2: Add git precondition to Step 0**

At the very beginning of Step 0, before the "Auto-detect" section, add:

```markdown
**Precondition:** Verify this is a git repository:
```bash
git rev-parse --git-dir 2>/dev/null || { echo "execute-plan requires a git repository."; exit 1; }
```

If the check fails, stop with: "execute-plan requires a git repository."
```

- [ ] **Step 3: Remove no-git workspace variant from Step 0**

Remove the line under "Workspace values:" that says:
```
- On main but not in a git repo: `current workspace (<path>, no git repo)`
```

Only two workspace values should remain:
- Already on a feature branch or in a worktree: `current workspace (on <branch-name>)`
- On main in a git repo (default): `new worktree (branch: <suggested-branch>)`

- [ ] **Step 4: Flatten and reorder settings in Step 3**

Replace the entire settings display block (the ``` block showing Plan/Goal/Tasks and settings) with:

```
Plan:  <plan filename>
Goal:  <plan goal>
Tasks: <count> across <N> waves

    Workspace:          <see workspace values below>
    TDD:                enabled
    Execution:          parallel, pause on failure
    Integration test:   <see defaults below>
    Final review:       enabled (max 3 remediation iterations)

Ready to execute: (s)tart / (c)ustomize / (q)uit
```

- [ ] **Step 5: Update the defaults table**

Replace the current defaults table with:

```markdown
| Setting | Default | Notes |
|---------|---------|-------|
| Workspace | new worktree | Auto-detected if already on branch/worktree — shows current state, not a choice |
| TDD | enabled | Can disable for non-code plans (docs, config, content) |
| Execution | parallel, pause on failure | Can customize to sequential, or change pacing |
| Integration test | enabled | If a test command is available, show `enabled (<command>)`. If no test command, show `disabled (no test command)` |
| Final review | enabled (max 3 iterations) | Iterative review-remediate loop after all waves — can disable or adjust max iterations |
```

Remove the rows for "Spec check" and "Checkpoint commit" entirely.

- [ ] **Step 6: Update the customization sequence**

Replace the numbered customization list (under "If `c`:") with:

```markdown
1. Workspace — New worktree / Current workspace (only if not auto-detected)
2. TDD — Enabled / Disabled
3. Execution mode — Sequential / Parallel
4. Wave pacing (if parallel) — Pause between waves / Auto-continue / Auto-continue unless failures
5. Integration test — Enabled / Disabled. If enabling and no test command yet detected, ask: "Enter test command (e.g., `npm test`):"
6. Final review — Enabled / Disabled. If enabling, ask: "Max remediation iterations (default 3):"
```

Remove items for Spec check, Checkpoint commit, and the standalone Test command override.

- [ ] **Step 7: Remove no-git conditional from Step 9b commit section**

In Step 9b, section "### 1. Commit wave changes", remove the skip condition:

```
**Skip if:** Checkpoint commit is disabled (Step 3 settings) or not in a git repo.
```

Replace with:

```
Stage and commit all changes from the completed wave:
```

(No skip condition — git is guaranteed and checkpoint commits are always on.)

Also remove the line:
```
**If not in a git repo:** Skip commits silently. Do not error or warn — working on files outside version control is anomalous but allowed.
```

- [ ] **Step 8: Remove no-git conditional from Step 7 main-branch confirmation**

In Step 7, remove:
```
**Skip if:** Checkpoint commit is disabled (Step 3 settings).
```

The main-branch confirmation always applies when on main/master/develop (git is guaranteed).

- [ ] **Step 9: Rename "Spec check" to "Task verification" in Step 9**

In Step 9, replace the entire "### Spec check (if enabled in Step 3 settings)" subsection with:

```markdown
### Task verification

After verifying outputs yourself (above), the orchestrator's own acceptance criteria check is the per-wave verification. No subagent is dispatched for this step — the orchestrator reads the code and checks criteria directly. If any acceptance criterion is not met, treat it as a failure and apply Step 10 retry logic.
```

This removes all references to `spec-reviewer.md`, `modelTiers.standard` for spec review, and the subagent dispatch pattern for spec checks.

- [ ] **Step 10: Update Step 6 to reference models.json instead of settings.json**

In Step 6, change the heading context from reading `modelTiers` from `~/.pi/agent/settings.json` to reading from `~/.pi/agent/models.json`:

```bash
cat ~/.pi/agent/models.json | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin), indent=2))"
```

Update any references to `modelTiers` from `settings.json` to reference `models.json` instead.

- [ ] **Step 11: Verify no remaining references to removed settings**

Run: `grep -n 'Checkpoint commit\|Spec check\|spec-reviewer\|not in a git repo\|no git repo' agent/skills/execute-plan/SKILL.md`
Expected: No matches.

- [ ] **Step 12: Commit**

```bash
git add agent/skills/execute-plan/SKILL.md
git commit -m "refactor(execute-plan): require git, flatten settings, orchestrator-only verification

- Add git precondition to Step 0
- Remove all no-git conditional branches
- Remove checkpoint commit setting (always on)
- Remove spec check subagent (orchestrator-only task verification)
- Flatten settings: 6 options ordered by execution phase
- Reference models.json instead of settings.json for model tiers"
```

**Acceptance criteria:**
- Git precondition at top of Step 0
- No references to "not in a git repo" or "no git repo" anywhere in file
- No "Checkpoint commit" setting
- No "Spec check" setting or spec-reviewer subagent dispatch
- Settings display is flat (no Global/Per wave grouping)
- Settings ordered: Workspace, TDD, Execution, Integration test, Final review
- Customization has 6 items
- Step 6 reads from `~/.pi/agent/models.json`
- Step 9 uses "Task verification" heading with orchestrator-only verification

**Model recommendation:** capable

---

### Task 9: Replace execute-plan Step 12 with review-loop invocation

**Files:**
- Modify: `agent/skills/execute-plan/SKILL.md`

**Steps:**

- [ ] **Step 1: Read the current Step 12**

Read `agent/skills/execute-plan/SKILL.md` and locate Step 12 (starts at "## Step 12: Request code review").

- [ ] **Step 2: Replace Step 12 content**

Replace the entire Step 12 section (from "## Step 12: Request code review" up to but not including "## Step 13: Complete") with:

```markdown
## Step 12: Request code review

After all waves complete successfully (and if the user chose review in Step 3):

1. **Gather inputs:**
   - `BASE_SHA` = `PRE_EXECUTION_SHA` (recorded in Step 7)
   - `HEAD_SHA` = `git rev-parse HEAD`
   - Description = the plan's Goal section
   - Requirements = full plan file contents
   - Max iterations = from Step 3 settings (default 3)
   - Working directory = current workspace path
   - Review output path = `.pi/reviews/<plan-name>-code-review` (derived from plan filename, e.g., plan `2026-04-06-my-feature.md` → `.pi/reviews/2026-04-06-my-feature-code-review`)

2. **Invoke the `review-loop` skill** with the gathered inputs.

3. **Handle the result:**

   **`clean`:** Include the review summary (iteration count, review file path) in the Step 13 completion report. Proceed to Step 13.

   **`max_iterations_reached`:** Present remaining findings to the user. Offer:
   - **(a) Continue iterating** — re-invoke `review-loop` (budget resets, new era)
   - **(b) Proceed** — move to Step 13 with known issues noted in the summary
   - **(c) Stop** — halt execution, report partial progress (Step 11)

   **Review disabled** (user chose to disable in Step 3): Skip directly to Step 13.
```

- [ ] **Step 3: Verify Step 12 no longer references plan-executor, code-reviewer.md template, or modelTiers directly**

Run: `sed -n '/## Step 12/,/## Step 13/p' agent/skills/execute-plan/SKILL.md | grep -c 'plan-executor\|code-reviewer.md\|modelTiers\|crossProvider'`
Expected: `0` (no direct references — all delegated to review-loop skill).

- [ ] **Step 4: Commit**

```bash
git add agent/skills/execute-plan/SKILL.md
git commit -m "feat(execute-plan): replace Step 12 with review-loop skill invocation

Step 12 now gathers inputs and invokes the review-loop skill instead
of manually loading templates, filling placeholders, and dispatching
subagents. All review-remediate logic lives in the review-loop skill."
```

**Acceptance criteria:**
- Step 12 is ~25 lines (down from ~65)
- References `review-loop` skill, not individual templates or agents
- Three result states handled: clean, max_iterations_reached, review disabled
- Continue/proceed/stop choices on exhaustion
- No references to `plan-executor`, `code-reviewer.md`, `modelTiers.crossProvider`, or fallback dispatch logic

**Model recommendation:** standard

---

### Task 10: Delete spec-reviewer.md

**Files:**
- Delete: `agent/skills/execute-plan/spec-reviewer.md`

**Steps:**

- [ ] **Step 1: Verify no remaining references to spec-reviewer.md**

Run: `grep -r 'spec-reviewer' agent/`
Expected: No matches (Task 8 already removed all references from execute-plan/SKILL.md).

- [ ] **Step 2: Delete the file**

Run: `rm agent/skills/execute-plan/spec-reviewer.md`

- [ ] **Step 3: Verify deletion**

Run: `ls agent/skills/execute-plan/spec-reviewer.md 2>&1`
Expected: "No such file or directory"

- [ ] **Step 4: Commit**

```bash
git add -u agent/skills/execute-plan/spec-reviewer.md
git commit -m "chore(execute-plan): remove spec-reviewer.md

Per-wave spec compliance checking is now orchestrator-only (task
verification). The spec-reviewer subagent template is no longer used."
```

**Acceptance criteria:**
- File `agent/skills/execute-plan/spec-reviewer.md` does not exist
- No references to `spec-reviewer` remain in `agent/` directory
- Git tracks the deletion

**Model recommendation:** cheap

---

## Dependencies

- Task 4 depends on: (none, but creates the directory that Task 5 and 6 also use)
- Task 5 depends on: Task 4 (same directory, and references re-review-block.md by path)
- Task 6 depends on: Task 5 (references remediation-prompt.md)
- Task 7 depends on: Task 1 (references code-reviewer agent)
- Task 8 depends on: (none — can start independently)
- Task 9 depends on: Task 6, Task 8 (references review-loop skill; Task 8 must have simplified settings first)
- Task 10 depends on: Task 8 (Task 8 removes references to spec-reviewer)

**Wave assignment:**

- **Wave 1:** Tasks 1, 2, 3, 4 (independent agent definitions and template changes)
- **Wave 2:** Tasks 5, 7, 8 (remediation-prompt needs Task 4's directory; requesting-code-review update needs Task 1; execute-plan simplification is independent)
- **Wave 3:** Task 6 (SKILL.md references remediation-prompt from Task 5)
- **Wave 4:** Tasks 9, 10 (execute-plan Step 12 replacement needs Task 6; spec-reviewer deletion needs Task 8)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Remediation-coordinator deviates from protocol | Medium | High | Self-contained prompt with explicit protocol. Test with a known-bad diff to verify loop behavior. |
| Model matrix file doesn't exist yet | High | Medium | This plan references `models.json` but the migration from `settings.json` is a separate todo (TODO-a3f17c62). For initial testing, the coordinator can fall back to reading `modelTiers` from `settings.json`. |
| Re-review block renders poorly when empty | Low | Low | Verify that `{RE_REVIEW_BLOCK}` with empty string doesn't leave orphan blank lines in the template. |
| execute-plan SKILL.md edits conflict with other in-flight changes | Medium | Medium | This plan should execute on a clean branch. Tasks 8-9 make substantial edits to a 526-line file. |

---

## Test Command

```bash
echo "No automated tests — this plan creates prose skill files and agent definitions. Verification is manual: invoke the review-loop skill on a test diff and observe the loop behavior."
```
