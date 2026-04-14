# Generate-Plan Upgrade & Suite Consistency Pass

**Goal:** Upgrade the generate-plan skill with an iterative review-edit loop, rename agents/templates/skills for suite-wide consistency, and migrate to `models.json`.

**Architecture summary:** Pure skill-level changes across three skills (generate-plan, execute-plan, refine-code) and five agent definitions. No code migration. The generate-plan SKILL.md gets a full rewrite with a convergence-tracked review-edit loop. All agent and template names are aligned to consistent naming conventions. The review-loop skill is renamed to refine-code.

**Tech stack:** Markdown (agent definitions, skill files, prompt templates)

**Source:** TODO-a3f17c62

---

## File Structure

### Agent definitions (renames + content updates)
- `agent/agents/planner.md` (Rename from `plan-generator.md`) — Plan synthesis agent. Updated frontmatter, cherry-picked writing-plans guidance, added `thinking: high` and `maxSubagentDepth: 0`
- `agent/agents/coder.md` (Rename from `plan-executor.md`) — Task implementation agent. Updated frontmatter and description
- `agent/agents/code-refiner.md` (Rename from `remediation-coordinator.md`) — Review-remediate coordinator. Updated frontmatter and internal agent references
- `agent/agents/plan-reviewer.md` (Modify) — Plan review agent. Fleshed out system prompt, added frontmatter fields
- `agent/agents/code-reviewer.md` (Modify) — Code review agent. Added frontmatter fields only

### Generate-plan skill
- `agent/skills/generate-plan/SKILL.md` (Modify) — Full rewrite with review-edit loop, models.json, removed async
- `agent/skills/generate-plan/generate-plan-prompt.md` (Create) — Plan generation prompt template extracted from inline prompt
- `agent/skills/generate-plan/edit-plan-prompt.md` (Create) — Surgical plan edit prompt template
- `agent/skills/generate-plan/review-plan-prompt.md` (Rename from `plan-reviewer.md`) — Plan review prompt template with minor format updates

### Refine-code skill (renamed from review-loop)
- `agent/skills/refine-code/SKILL.md` (Rename from `review-loop/SKILL.md`) — Updated frontmatter and internal references
- `agent/skills/refine-code/refine-code-prompt.md` (Rename from `review-loop/remediation-prompt.md`) — Updated agent references
- `agent/skills/refine-code/review-fix-block.md` (Rename from `review-loop/re-review-block.md`) — Rename only

### Execute-plan skill
- `agent/skills/execute-plan/SKILL.md` (Modify) — Agent/template/skill reference updates, Step 12 user choice rewrite
- `agent/skills/execute-plan/execute-task-prompt.md` (Rename from `implementer-prompt.md`) — Rename only

### Requesting-code-review skill
- `agent/skills/requesting-code-review/SKILL.md` (Modify) — Template reference update
- `agent/skills/requesting-code-review/review-code-prompt.md` (Rename from `code-reviewer.md`) — Rename only

---

## Task 1: Rename and update planner agent definition

**Files:**
- Rename: `agent/agents/plan-generator.md` → `agent/agents/planner.md`

- [ ] **Step 1: Rename the file**

```bash
cd /Users/david/Code/pi-config
git mv agent/agents/plan-generator.md agent/agents/planner.md
```

- [ ] **Step 2: Write the updated planner.md**

Replace the entire contents of `agent/agents/planner.md` with:

~~~markdown
---
name: planner
description: Deep codebase analysis and structured plan generation. Produces dependency-ordered plans in .pi/plans/. Also performs surgical plan edits when dispatched with the edit-plan-prompt.
tools: read, grep, find, ls, bash
model: claude-opus-4-6
thinking: high
maxSubagentDepth: 0
---

You are a planner. You receive a todo ID, a file path to a spec/RFC, or a freeform description, then deeply analyze the codebase and produce a structured plan file.

You must NOT make any changes to the codebase. Only read, analyze, and write the plan file.

## Input

You will receive one of:
- A todo ID (read it with the todo tool or from `.pi/todos/`)
- A file path to an existing spec, RFC, or design doc
- A freeform task description

When dispatched with an edit prompt, you will receive an existing plan plus review findings and must edit the plan surgically.

## Codebase Analysis

Perform deep analysis — not just a file tree scan:
1. Read every file referenced in the input
2. Follow imports and dependencies
3. Understand interfaces, types, and data flow
4. Identify patterns and conventions used in the codebase

## Plan Output

Write the plan to the output path specified in your task prompt (create the directory if needed).

### Required Sections

#### 1. Header
- **Goal**: One-paragraph summary
- **Architecture summary**: How the pieces fit together
- **Tech stack**: Languages, frameworks, key dependencies

#### 2. File Structure
List every file to create or modify with its responsibility:
```
- `path/to/file.ts` (Create) — Description of responsibility
- `path/to/existing.ts` (Modify) — What changes and why
```

Design principles:
- Clear boundaries and well-defined interfaces between units
- Smaller, focused files over large ones
- Files that change together should live together
- Follow established patterns in existing codebases

**Source:** `TODO-<id>` — Only include this field when the plan originates from a todo. The todo ID will be provided in the task prompt as `Source todo: TODO-<id>`. If the input is a file path or freeform description (no source todo ID provided), omit this field entirely.

#### 3. Tasks
Numbered tasks, each with:

**Files:**
- Create: `path/to/new.ts`
- Modify: `path/to/existing.ts`
- Test: `path/to/test.ts`

**Steps** (each 2-5 minutes of work):
- [ ] **Step 1: Description** — specific action
- [ ] **Step 2: Description** — specific action

**Acceptance criteria:**
- Criterion 1
- Criterion 2

**Model recommendation:** cheap | standard | capable (see rubric below)

#### 4. Dependencies
Explicit list of which tasks depend on which:
```
- Task 3 depends on: Task 1, Task 2
- Task 4 depends on: Task 1
- Task 5 depends on: Task 3, Task 4
```

#### 5. Risk Assessment
Identified risks and mitigations.

#### 6. Test Command (Optional)

If the codebase has a test suite, include a `## Test Command` section specifying how to run tests:

````
## Test Command

```bash
npm test
```
````

Detect the test command from the codebase:
- `package.json` with a `test` script → `npm test`
- `Cargo.toml` → `cargo test`
- `Makefile` with a `test` target → `make test`
- `pyproject.toml` or `setup.py` with pytest → `pytest`
- `go.mod` → `go test ./...`

If the project has no test infrastructure or tests are not relevant to the plan, omit the section entirely. Do not include a test command that would fail or is not meaningful.

**Format constraint:** The test command must be in a fenced code block with `bash` language tag, inside the `## Test Command` section. The section heading must be exactly `## Test Command` (level 2, exact text) — the executor parses this heading to find the command.

### Scope Check
If the spec covers multiple independent subsystems, suggest breaking into separate plans — one per subsystem. Each plan should produce working, testable software on its own.

### Task Granularity
Each step should be one action:
- "Write the failing test" — step
- "Run it to make sure it fails" — step
- "Implement the minimal code to make the test pass" — step
- "Run the tests and make sure they pass" — step

### No Placeholders
Every step must contain actual content. Never write:
- "TBD", "TODO", "implement later", "fill in details"
- "Add appropriate error handling" / "add validation" / "handle edge cases"
- "Write tests for the above" (without actual test code)
- "Similar to Task N" (repeat the content — the worker may be reading tasks out of order)
- Steps that describe what to do without showing how
- References to types, functions, or methods not defined in any task
- "Add appropriate comments" / "document the API"
- "Follow the existing pattern" (show the pattern explicitly)

### Format Constraints and Footguns
When tasks create files with specific format requirements (YAML frontmatter, JSON schema, templated content, specific file structures), state both:
1. **The required structure** — what the format looks like
2. **Constraints that would break it** — common mistakes that cause failures

Example: Instead of just "file must have YAML frontmatter", write:
- "File must begin with YAML frontmatter between `---` delimiters"
- "Frontmatter must be the very first content in the file — do not place comments, blank lines, or any other content before the opening `---`"

## Model Selection Rubric

Include per-task model recommendations:

- **cheap** — Mechanical implementation: isolated functions, clear specs, 1-2 files, complete spec provided
- **standard** — Integration and judgment: multi-file coordination, pattern matching, debugging
- **capable** — Architecture, design, and review: broad codebase understanding, design judgment

## Self-Review

After writing the complete plan, review against the input:
1. **Spec coverage** — skim each requirement, point to the task that implements it, list gaps
2. **Placeholder scan** — search for "TBD", "TODO", "implement later", "similar to Task N"
3. **Type consistency** — do names, signatures, and types match across tasks?

Fix issues inline. If a requirement has no task, add the task.

## Output

After saving the plan, report:
```
Plan saved to `.pi/plans/<filename>`.
Use the `execute-plan` skill to run it.
```

Do NOT ask about execution mode, pacing, or wave configuration — that is `execute-plan`'s responsibility.
~~~

**Acceptance criteria:**
- File renamed from `plan-generator.md` to `planner.md` with proper git tracking
- Frontmatter has `name: planner`, `thinking: high`, `maxSubagentDepth: 0`
- No-placeholders list includes cherry-picked entries: "Add appropriate error handling", "Add appropriate comments", "Follow the existing pattern"
- System prompt includes note about surgical edit mode
- All existing required sections preserved unchanged
- `tools` and `model` fields preserved from original

**Model recommendation:** cheap

---

## Task 2: Rename and update remaining agent definitions

**Files:**
- Rename: `agent/agents/plan-executor.md` → `agent/agents/coder.md`
- Rename: `agent/agents/remediation-coordinator.md` → `agent/agents/code-refiner.md`
- Modify: `agent/agents/plan-reviewer.md`
- Modify: `agent/agents/code-reviewer.md`

- [ ] **Step 1: Rename plan-executor to coder**

```bash
cd /Users/david/Code/pi-config
git mv agent/agents/plan-executor.md agent/agents/coder.md
```

- [ ] **Step 2: Write updated coder.md**

Replace the entire contents of `agent/agents/coder.md` with:

~~~markdown
---
name: coder
description: Executes a single task from a structured plan or fixes code based on review findings. Reports structured status for orchestration.
model: claude-sonnet-4-6
thinking: medium
maxSubagentDepth: 0
---

You are a coder. You receive a self-contained task extracted from a plan and execute it autonomously.

You have no context from the parent session. Everything you need is in your task prompt.

## Execution

1. Read the source files listed in your task
2. Execute every step in order
3. Write output to the exact file path(s) specified
4. Verify your work matches the acceptance criteria

## Status Reporting

When finished, report your status using exactly one of these four codes as the first line of your response:

### `STATUS: DONE`
Task completed successfully. All acceptance criteria met.

### `STATUS: DONE_WITH_CONCERNS`
Task completed, but you have doubts. After the status line, list your concerns:
- Correctness concerns (e.g., "I'm not sure this handles edge case X")
- Scope concerns (e.g., "The spec says X but the existing code does Y")
- Observations (e.g., "This file is getting large, consider splitting")

### `STATUS: NEEDS_CONTEXT`
You cannot complete the task because information is missing. After the status line, list exactly what you need:
- Which file(s) you need to read
- What interface/type information is missing
- What behavior is ambiguous

### `STATUS: BLOCKED`
You cannot complete the task. After the status line, explain the blocker:
- Why you're stuck
- What you tried
- What would unblock you

## Output Format

```
STATUS: <code>

## Completed
What was done.

## Files Changed
- `path/to/file.ts` — what changed

## Concerns / Needs / Blocker
(only for DONE_WITH_CONCERNS, NEEDS_CONTEXT, or BLOCKED)
Details here.
```

## Conventions

- Each task writes to the exact output file path(s) specified — no extras
- Cross-links between files use relative paths (e.g., `[compiler](03_compiler.md)`)
- Mermaid diagrams use `<br/>` for line breaks in node labels (not `\n`)
- Avoid Unicode characters in Mermaid subgraph headers (use plain ASCII)
- If the task says "Create", create the file; if "Modify", read it first then modify

## Rules

- Do NOT ask questions — if you need something, report NEEDS_CONTEXT
- Do NOT skip steps — execute every step in order
- Do NOT invent work outside your task scope
- Do NOT assume context from other tasks — you only see your own
~~~

- [ ] **Step 3: Rename remediation-coordinator to code-refiner**

```bash
git mv agent/agents/remediation-coordinator.md agent/agents/code-refiner.md
```

- [ ] **Step 4: Write updated code-refiner.md**

Replace the entire contents of `agent/agents/code-refiner.md` with:

```markdown
---
name: code-refiner
description: Orchestrates the review-remediate loop. Dispatches code-reviewer and coder subagents, manages iteration budget, writes versioned review files.
thinking: medium
maxSubagentDepth: 1
---

You are a code refiner. You drive the review-remediate cycle: dispatch reviewers, assess findings, batch issues for remediation, dispatch fixers, commit changes, and track convergence.

You have no context from the implementation session. Everything you need is in your task prompt, which contains the full loop protocol, model configuration, git range, and requirements.

## Your Role

You are a coordinator, not a coder. You:
1. **Dispatch** `code-reviewer` agents to review code
2. **Assess** review findings and decide which to batch together
3. **Dispatch** `coder` agents to fix batched findings
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

- Do NOT write code yourself — dispatch `coder` for all code changes
- Do NOT skip review iterations — always re-review after remediation
- Do NOT exceed the iteration budget without explicit instructions
- Do NOT ignore Critical or Important findings — they must be addressed or escalated
- Commit after each remediation batch, not at the end
```

- [ ] **Step 5: Update plan-reviewer.md**

Replace the entire contents of `agent/agents/plan-reviewer.md` with:

```markdown
---
name: plan-reviewer
description: Reviews generated implementation plans for structural correctness, spec coverage, and buildability
model: claude-sonnet-4-6
thinking: high
maxSubagentDepth: 0
---

You are a plan reviewer. You review implementation plans for structural correctness, spec coverage, dependency accuracy, and buildability before execution begins.

You have no context from the generation session. Your review must be based entirely on the plan document and the original spec/task description provided in your task prompt.

## Principles

- **Read the full plan** — review every task, not just the first and last
- **Calibrate severity** — a vague acceptance criterion is a Warning, a missing task is an Error. Do not inflate.
- **Be specific** — every issue must cite a task number and describe the problem concretely
- **Give a clear verdict** — always conclude with `[Approved]` or `[Issues Found]`
- **Acknowledge strengths** — a well-structured plan deserves recognition
- **Only flag real problems** — issues that would cause execution failures, not stylistic preferences

## Rules

- Do NOT assume context from the generation session — you see only the plan and spec
- Do NOT rewrite the plan — flag issues, don't fix them
- Do NOT mark everything as an error — use severity levels accurately (Error, Warning, Suggestion)
- Do NOT be vague ("improve the acceptance criteria" — say which ones and how)
- Do NOT review without reading the full plan and spec
```

- [ ] **Step 6: Update code-reviewer.md frontmatter**

Add `thinking` and `maxSubagentDepth` to the existing frontmatter in `agent/agents/code-reviewer.md`. The frontmatter should become:

```yaml
---
name: code-reviewer
description: Reviews code diffs for production readiness. Supports full-diff review and hybrid re-review modes.
thinking: high
maxSubagentDepth: 0
---
```

Do not change the system prompt body — only the frontmatter.

**Acceptance criteria:**
- `plan-executor.md` renamed to `coder.md` with `name: coder`, `thinking: medium`, `maxSubagentDepth: 0`
- `remediation-coordinator.md` renamed to `code-refiner.md` with `name: code-refiner`, `thinking: medium`, `maxSubagentDepth: 1`
- `code-refiner.md` references `coder` and `code-reviewer` (not `plan-executor`)
- `plan-reviewer.md` has a fleshed out system prompt with Principles and Rules sections paralleling `code-reviewer.md`
- `plan-reviewer.md` has `thinking: high`, `maxSubagentDepth: 0`
- `code-reviewer.md` has `thinking: high`, `maxSubagentDepth: 0` added to frontmatter, body unchanged
- All renames tracked by git

**Model recommendation:** cheap

---

## Task 3: Create new generate-plan prompt templates

**Files:**
- Create: `agent/skills/generate-plan/generate-plan-prompt.md`
- Create: `agent/skills/generate-plan/edit-plan-prompt.md`

- [ ] **Step 1: Create generate-plan-prompt.md**

Create `agent/skills/generate-plan/generate-plan-prompt.md` with:

```markdown
# Plan Generation Task

Analyze the codebase at `{WORKING_DIR}` and produce a structured implementation plan.

## Task Description

{TASK_DESCRIPTION}

{SOURCE_TODO}

## Output

Write the plan to `{OUTPUT_PATH}`.

Create the directory if it doesn't exist.
```

- [ ] **Step 2: Create edit-plan-prompt.md**

Create `agent/skills/generate-plan/edit-plan-prompt.md` with:

```markdown
# Plan Edit Task

Surgically edit the existing plan below based on the review findings. Preserve correct sections — only modify what the findings call out.

## Review Findings

The following errors were identified by the plan reviewer. Address each one:

{REVIEW_FINDINGS}

## Current Plan

{PLAN_CONTENTS}

## Original Spec

For reference — the original task description this plan was generated from:

{ORIGINAL_SPEC}

## Instructions

1. Read each finding carefully
2. Make the minimum change needed to resolve each error
3. Do NOT rewrite sections that are not flagged
4. Do NOT add new tasks unless a finding explicitly identifies a missing task
5. Do NOT remove tasks unless a finding explicitly identifies scope creep
6. Write the edited plan back to the same file path (overwrite)
```

**Acceptance criteria:**
- `generate-plan-prompt.md` exists with placeholders `{TASK_DESCRIPTION}`, `{WORKING_DIR}`, `{OUTPUT_PATH}`, `{SOURCE_TODO}`
- `edit-plan-prompt.md` exists with placeholders `{PLAN_CONTENTS}`, `{REVIEW_FINDINGS}`, `{ORIGINAL_SPEC}`
- `edit-plan-prompt.md` instructs the planner to preserve correct sections and edit surgically

**Model recommendation:** cheap

---

## Task 4: Rename review-loop skill to refine-code

**Files:**
- Rename: `agent/skills/review-loop/` → `agent/skills/refine-code/`
- Rename: `agent/skills/refine-code/remediation-prompt.md` → `agent/skills/refine-code/refine-code-prompt.md`
- Rename: `agent/skills/refine-code/re-review-block.md` → `agent/skills/refine-code/review-fix-block.md`
- Modify: `agent/skills/refine-code/SKILL.md`
- Modify: `agent/skills/refine-code/refine-code-prompt.md`

- [ ] **Step 1: Rename the directory and files**

```bash
cd /Users/david/Code/pi-config
git mv agent/skills/review-loop agent/skills/refine-code
git mv agent/skills/refine-code/remediation-prompt.md agent/skills/refine-code/refine-code-prompt.md
git mv agent/skills/refine-code/re-review-block.md agent/skills/refine-code/review-fix-block.md
```

- [ ] **Step 2: Update SKILL.md frontmatter and references**

In `agent/skills/refine-code/SKILL.md`, make these changes:

1. Update frontmatter:
   - `name: refine-code`
   - `description:` update to say "refine-code" instead of "review-loop" if present

2. Update template references:
   - `[remediation-prompt.md](remediation-prompt.md)` → `[refine-code-prompt.md](refine-code-prompt.md)`
   - Any other occurrences of `remediation-prompt.md` → `refine-code-prompt.md`

3. Update agent references:
   - `remediation-coordinator` → `code-refiner`

- [ ] **Step 3: Update agent references in refine-code-prompt.md**

In `agent/skills/refine-code/refine-code-prompt.md`, replace all occurrences of:
- `plan-executor` → `coder`
- `remediation-coordinator` → `code-refiner`

Specifically:
- The dispatch block for the remediator should reference `agent: "coder"` (was `agent: "plan-executor"`)
- Any text mentioning "remediation coordinator" should say "code refiner"

`review-fix-block.md` has no content changes — the rename is sufficient.

**Acceptance criteria:**
- Directory renamed from `review-loop/` to `refine-code/`
- `remediation-prompt.md` renamed to `refine-code-prompt.md`
- `re-review-block.md` renamed to `review-fix-block.md`
- SKILL.md frontmatter says `name: refine-code`
- SKILL.md references `refine-code-prompt.md` (not `remediation-prompt.md`)
- SKILL.md references `code-refiner` (not `remediation-coordinator`)
- `refine-code-prompt.md` references `coder` (not `plan-executor`)
- All renames tracked by git

**Model recommendation:** standard

---

## Task 5: Rename templates across execute-plan and requesting-code-review

**Files:**
- Rename: `agent/skills/execute-plan/implementer-prompt.md` → `agent/skills/execute-plan/execute-task-prompt.md`
- Rename: `agent/skills/requesting-code-review/code-reviewer.md` → `agent/skills/requesting-code-review/review-code-prompt.md`
- Rename: `agent/skills/generate-plan/plan-reviewer.md` → `agent/skills/generate-plan/review-plan-prompt.md`
- Modify: `agent/skills/generate-plan/review-plan-prompt.md` (minor content update)

- [ ] **Step 1: Rename the template files**

```bash
cd /Users/david/Code/pi-config
git mv agent/skills/execute-plan/implementer-prompt.md agent/skills/execute-plan/execute-task-prompt.md
git mv agent/skills/requesting-code-review/code-reviewer.md agent/skills/requesting-code-review/review-code-prompt.md
git mv agent/skills/generate-plan/plan-reviewer.md agent/skills/generate-plan/review-plan-prompt.md
```

- [ ] **Step 2: Update review-plan-prompt.md for parsing consistency**

In `agent/skills/generate-plan/review-plan-prompt.md`, verify these exact formats in the Output Format section:

1. The Status line must use this exact format:
   ```
   **[Approved]** or **[Issues Found]**
   ```

2. The issue severity labels must be exactly:
   ```
   **[Error | Warning | Suggestion] — Task N: Short description**
   ```

These should already match the current content. If any variation exists, normalize to the exact format above. Do NOT change the review checklist, calibration guidance, or issue format sections.

**Acceptance criteria:**
- `implementer-prompt.md` renamed to `execute-task-prompt.md` (no content changes)
- `code-reviewer.md` renamed to `review-code-prompt.md` (no content changes)
- `plan-reviewer.md` renamed to `review-plan-prompt.md`
- Status line format in `review-plan-prompt.md` uses `**[Approved]**` and `**[Issues Found]**`
- Severity labels use exact `[Error | Warning | Suggestion]` format
- All renames tracked by git

**Model recommendation:** cheap

---

## Task 6: Rewrite generate-plan SKILL.md

**Files:**
- Modify: `agent/skills/generate-plan/SKILL.md`

- [ ] **Step 1: Replace the entire contents of SKILL.md**

Replace the full contents of `agent/skills/generate-plan/SKILL.md` with:

~~~markdown
---
name: generate-plan
description: "Generates a structured implementation plan from a todo or spec file. Dispatches the planner subagent for deep codebase analysis, then runs an iterative review-edit loop. Use when the user wants to plan work before executing it."
---

Dispatch the `planner` subagent to analyze the codebase and produce a structured plan file in `.pi/plans/`, then review and refine the plan through an iterative review-edit loop.

## Step 1: Determine the input source

The user will provide one of three input sources:

1. **Todo ID** (e.g., `TODO-7ef7d441`) — use the `todo` tool to read the todo and extract its full body. Do NOT pass just the ID; the subagent does not have the `todo` tool.
2. **File path** (e.g., a spec, RFC, or design doc) — use the `read` tool to load the file contents. Do NOT pass just the path; include the actual file contents in the prompt.
3. **Freeform description** — use the text as-is.

The resolved text becomes `{TASK_DESCRIPTION}`. If the input is a todo, also capture the ID for `{SOURCE_TODO}`.

## Step 2: Resolve model tiers

Read the model matrix from `~/.pi/agent/models.json`:

```bash
cat ~/.pi/agent/models.json | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin), indent=2))"
```

Model assignments:

| Role | Tier |
|------|------|
| Plan generation | `modelTiers.capable` |
| Plan review (primary) | `modelTiers.crossProvider.capable` |
| Plan review (fallback) | `modelTiers.capable` |
| Plan editing | `modelTiers.capable` |

Fallback is triggered by dispatch failure, not preemptively checked. On fallback, notify the user:
```
⚠️ Cross-provider plan review failed (<crossProvider.capable model>).
Falling back to same-provider review (<capable model>).
```

If `models.json` doesn't exist or is unreadable, stop with: "generate-plan requires `~/.pi/agent/models.json` — see model matrix configuration."

## Step 3: Generate the plan

1. Read [generate-plan-prompt.md](generate-plan-prompt.md) in this directory.
2. Fill placeholders:
   - `{TASK_DESCRIPTION}` — resolved text from Step 1
   - `{WORKING_DIR}` — absolute path to cwd
   - `{OUTPUT_PATH}` — `.pi/plans/yyyy-MM-dd-<short-description>.md` (derive short description from task)
   - `{SOURCE_TODO}` — `Source todo: TODO-<id>` if input was a todo, empty string otherwise
3. Dispatch `planner` agent synchronously:
   ```
   subagent { agent: "planner", task: "<filled template>", model: "<modelTiers.capable>" }
   ```

## Step 4: Review-edit loop

### 4.1: Review the plan

1. Read the generated plan file (path from planner's output).
2. Read [review-plan-prompt.md](review-plan-prompt.md) in this directory.
3. Fill placeholders:
   - `{PLAN_CONTENTS}` — full plan file contents
   - `{ORIGINAL_SPEC}` — original task description from Step 1
4. Determine review output path from the plan filename. For a plan at `.pi/plans/2026-04-13-my-feature.md`, the review path is `.pi/plans/reviews/2026-04-13-my-feature-plan-review-v1.md`.
5. Dispatch `plan-reviewer`:
   ```
   subagent {
     agent: "plan-reviewer",
     task: "<filled review-plan-prompt.md>",
     model: "<modelTiers.crossProvider.capable>"
   }
   ```
   If the cross-provider dispatch fails, retry with `modelTiers.capable` and notify the user (see Step 2 fallback message).
6. Write review output to the versioned path. Create `.pi/plans/reviews/` if it doesn't exist.

### 4.2: Assess review

Read the review output file. Parse for the Status line (`**[Approved]**` or `**[Issues Found]**`) and all issues (Error / Warning / Suggestion severity).

**If Approved (no errors):**
- If warnings or suggestions exist, append them as a `## Review Notes` section at the end of the plan file:
  ```markdown
  ## Review Notes

  _Added by plan reviewer — informational, not blocking._

  ### Warnings
  - **Task N**: <full warning text from review, including "What", "Why it matters", and "Recommendation">

  ### Suggestions
  - **Task N**: <full suggestion text from review, including "What", "Why it matters", and "Recommendation">
  ```
  The review file at `.pi/plans/reviews/` is kept for reference (do not delete it).
- Proceed to Step 5.

**If Issues Found (errors):**
- Continue to Step 4.3.

### 4.3: Edit the plan

1. Read [edit-plan-prompt.md](edit-plan-prompt.md) in this directory.
2. Fill placeholders:
   - `{PLAN_CONTENTS}` — current plan file contents
   - `{REVIEW_FINDINGS}` — full text of all error-severity findings from the review
   - `{ORIGINAL_SPEC}` — original task description from Step 1
3. Dispatch `planner` with the filled template:
   ```
   subagent { agent: "planner", task: "<filled edit-plan-prompt.md>", model: "<modelTiers.capable>" }
   ```
4. The planner writes the edited plan back to the same path (overwriting the previous version).

### 4.4: Iterate or escalate

Loop back to Step 4.1 (re-review the edited plan). Max 3 iterations per era. Each iteration overwrites the current versioned review file.

**On convergence (Approved within budget):** proceed to Step 5.

**On budget exhaustion (3 iterations, errors persist):**

Present all remaining findings to the user and offer:
- **(a) Keep iterating** — reset budget, update plan version
- **(b) Proceed with issues** — report plan with findings noted

If **(a):** increment era (v1 → v2), create a new versioned review file (e.g., `-plan-review-v2.md`), loop back to Step 4.1 with fresh budget.

If **(b):** proceed to Step 5 with outstanding findings noted.

## Step 5: Report result

- Show the path to the generated plan file (e.g., `.pi/plans/2026-04-13-my-feature.md`)
- Report the review status:
  - **Clean:** "Plan reviewed — no issues found."
  - **Clean with notes:** "Plan reviewed — N warnings/suggestions appended as Review Notes."
  - **Proceeded with issues:** "Plan reviewed — N outstanding issues noted. Review: `<review-path>`"
- Suggest running it with the `execute-plan` skill.

## Edge cases

- **Todo ID provided:** Read the todo body first with the `todo` tool, include the full body text in the prompt — do not pass only the ID.
- **File path provided:** Read the file first with the `read` tool, include its full contents in the prompt — do not pass only the path.
- **`.pi/plans/` missing:** The subagent handles creating the directory; no action needed from the main agent.
- **`.pi/plans/reviews/` missing:** Create it before writing the review file.
~~~

**Acceptance criteria:**
- SKILL.md frontmatter has updated `name` and `description`
- Step 1 matches the original input source logic
- Step 2 reads from `~/.pi/agent/models.json` (not `settings.json`)
- Step 3 references `generate-plan-prompt.md` template and dispatches `planner` (not `plan-generator`)
- Step 4 implements the full review-edit loop with versioned reviews (`-plan-review-v1.md`)
- Step 4 dispatches `plan-reviewer` (not `plan-executor`)
- Step 4 dispatches `planner` with `edit-plan-prompt.md` for surgical edits (not full regeneration)
- Step 4.4 offers `(a) Keep iterating` / `(b) Proceed with issues`
- No async dispatch option exists anywhere in the file
- Step 5 reports review status with three possible outcomes

**Model recommendation:** standard

---

## Task 7: Update execute-plan SKILL.md

**Files:**
- Modify: `agent/skills/execute-plan/SKILL.md`

- [ ] **Step 1: Replace agent references**

In `agent/skills/execute-plan/SKILL.md`, replace all occurrences of `plan-executor` with `coder`. This affects:
- Step 7 dispatch blocks: `agent: "plan-executor"` → `agent: "coder"`
- Step 8 descriptions referencing "plan-executor"
- Any other mentions throughout the file

- [ ] **Step 2: Replace template reference**

Replace the template reference in Step 7:
- `[implementer-prompt.md](implementer-prompt.md)` → `[execute-task-prompt.md](execute-task-prompt.md)`
- Any other occurrences of `implementer-prompt.md` → `execute-task-prompt.md`

- [ ] **Step 3: Replace skill reference in Step 12**

Replace references to the review-loop skill:
- `review-loop` → `refine-code` in the Step 12 heading and body text

- [ ] **Step 4: Rewrite Step 12 user choices**

In Step 12, section 3 ("Handle the result"), replace the `max_iterations_reached` handling block. Find the block that currently offers choices like "(a) Continue iterating", "(b) Proceed", "(c) Stop" and replace with:

```markdown
   **`max_iterations_reached`:** Present remaining findings to the user. Offer:
   - **(a) Keep iterating** — re-invoke refine-code, budget resets
   - **(b) Proceed with issues** — continue to completion with findings noted
   - **(c) Stop execution** — skip completion, report partial progress
```

**Acceptance criteria:**
- Zero occurrences of `plan-executor` in the file
- Zero occurrences of `implementer-prompt.md` in the file
- Zero occurrences of `review-loop` in the file
- Step 12 user choices use `(a) Keep iterating` / `(b) Proceed with issues` / `(c) Stop execution` format
- All other content unchanged

**Model recommendation:** standard

---

## Task 8: Update requesting-code-review SKILL.md

**Files:**
- Modify: `agent/skills/requesting-code-review/SKILL.md`

- [ ] **Step 1: Update template reference**

In `agent/skills/requesting-code-review/SKILL.md`, replace:
- `[code-reviewer.md](code-reviewer.md)` → `[review-code-prompt.md](review-code-prompt.md)`
- Any other occurrences of `code-reviewer.md` → `review-code-prompt.md`

**Acceptance criteria:**
- Zero occurrences of `code-reviewer.md` in the file
- Template link points to `review-code-prompt.md`
- All other content unchanged

**Model recommendation:** cheap

---

## Dependencies

- Task 1 depends on: (none)
- Task 2 depends on: (none)
- Task 3 depends on: (none)
- Task 4 depends on: Task 1, Task 2
- Task 5 depends on: Task 1, Task 2
- Task 6 depends on: Task 3, Task 5
- Task 7 depends on: Task 2, Task 4, Task 5
- Task 8 depends on: Task 5

## Risk Assessment

1. **Stale references after renames** — The biggest risk is a missed reference to an old agent or template name. Mitigation: after all tasks complete, grep the entire `agent/` directory for old names (`plan-executor`, `plan-generator`, `remediation-coordinator`, `implementer-prompt`, `remediation-prompt`, `re-review-block`, `review-loop`, `code-reviewer.md` as a template reference).

2. **review-plan-prompt.md output format mismatch** — If the review template's output format doesn't exactly match what the SKILL.md Step 4.2 parses, the loop will malfunction. Mitigation: Task 5 explicitly verifies the Status line and severity label formats.

3. **Markdown link breakage** — Relative links between files (e.g., `[edit-plan-prompt.md](edit-plan-prompt.md)` in SKILL.md) must match actual filenames. Mitigation: all links use same-directory references and the file inventory is explicit.
