# Generate-Plan Skill Upgrade & Suite Consistency Pass

**Source:** TODO-a3f17c62

## Goals

1. Replace the one-shot plan review in generate-plan with an iterative review-edit convergence loop (inline, not a separate skill)
2. Use the dedicated `plan-reviewer` agent instead of misusing the task execution agent for reviews
3. Replace full plan regeneration with surgical editing via a dedicated `edit-plan-prompt.md` template
4. Migrate generate-plan from `settings.json` modelTiers to `~/.pi/agent/models.json`
5. Rename and align agents, templates, and the review-loop skill for consistency across the suite
6. Cherry-pick useful guidance from the Superpowers writing-plans skill into the planner agent
7. Add versioned plan reviews matching refine-code conventions
8. Remove the async dispatch option from generate-plan

## Non-Goals

- Moving orchestration into TypeScript code
- Creating a shared plan-contract library
- Making plan refinement a standalone skill
- Conforming wholesale to the Superpowers writing-plans format
- Changes to execute-plan Step 9b (tracked separately in TODO-845e6978)

---

## Agent Naming Convention

Two-tier hierarchy: primary actors get short names; review/refinement roles get `<domain>-<role>` names.

### Agent Inventory

| Agent | Role | `thinking` | `maxSubagentDepth` |
|-------|------|-----------|-------------------|
| `planner` | Synthesizes plans from specs/todos; performs surgical edits | `high` | `0` |
| `plan-reviewer` | Reviews plans for structural correctness and spec coverage | `high` | `0` |
| `coder` | Implements plan tasks; fixes code review findings | `medium` | `0` |
| `code-reviewer` | Reviews code diffs for production readiness | `high` | `0` |
| `code-refiner` | Orchestrates the review-remediate convergence loop | `medium` | `1` |

### Agent-to-Template Mapping

Each agent's primary template follows `<verb>-<domain>-prompt.md`. Sub-templates use `-block.md`.

| Agent | Template(s) | Location |
|-------|-------------|----------|
| `planner` | `generate-plan-prompt.md`, `edit-plan-prompt.md` | `agent/skills/generate-plan/` |
| `plan-reviewer` | `review-plan-prompt.md` | `agent/skills/generate-plan/` |
| `coder` | `execute-task-prompt.md` | `agent/skills/execute-plan/` |
| `code-reviewer` | `review-code-prompt.md` | `agent/skills/requesting-code-review/` |
| `code-refiner` | `refine-code-prompt.md`, `review-fix-block.md` | `agent/skills/refine-code/` |

---

## Generate-Plan SKILL.md — Step Design

### Step 1: Determine input source

Three input types:
1. **Todo ID** — read full body via `todo` tool, include in prompt
2. **File path** — read file contents, include in prompt
3. **Freeform description** — use as-is

The resolved text becomes `{TASK_DESCRIPTION}` for the generation prompt. If the input is a todo, also capture the todo ID for `{SOURCE_TODO}`.

### Step 2: Resolve model tiers

Read `~/.pi/agent/models.json`:
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
Cross-provider plan review failed (<crossProvider.capable model>).
Falling back to same-provider review (<capable model>).
```

If `models.json` doesn't exist or is unreadable, stop with: "generate-plan requires `~/.pi/agent/models.json` — see model matrix configuration."

### Step 3: Generate the plan

1. Read `generate-plan-prompt.md` in this directory
2. Fill placeholders:
   - `{TASK_DESCRIPTION}` — resolved text from Step 1
   - `{WORKING_DIR}` — absolute path to cwd
   - `{OUTPUT_PATH}` — `.pi/plans/yyyy-MM-dd-<short-description>.md`
   - `{SOURCE_TODO}` — `Source todo: TODO-<id>` if input was a todo, empty string otherwise
3. Dispatch `planner` agent with filled template and model `modelTiers.capable`

### Step 4: Review-edit loop

#### 4.1: Review the plan

1. Read the generated plan file
2. Read `review-plan-prompt.md`, fill placeholders:
   - `{PLAN_CONTENTS}` — full plan file contents
   - `{ORIGINAL_SPEC}` — original task description from Step 1
3. Determine review output path from plan filename:
   - Plan: `.pi/plans/2026-04-13-my-feature.md`
   - Review: `.pi/plans/reviews/2026-04-13-my-feature-plan-review-v1.md`
4. Dispatch `plan-reviewer` with model from Step 2 (cross-provider, with fallback)
5. Write review output to versioned path

#### 4.2: Assess review

Parse review for status (`[Approved]` or `[Issues Found]`) and issues (Error/Warning/Suggestion).

**If Approved (no errors):**
- If warnings/suggestions exist, append as `## Review Notes` section to plan file:
  ```markdown
  ## Review Notes

  _Added by plan reviewer — informational, not blocking._

  ### Warnings
  - **Task N**: <full warning text>

  ### Suggestions
  - **Task N**: <full suggestion text>
  ```
- Proceed to Step 5

**If Issues Found (errors):**
- Continue to Step 4.3

#### 4.3: Edit the plan

1. Read `edit-plan-prompt.md`, fill placeholders:
   - `{PLAN_CONTENTS}` — current plan file contents
   - `{REVIEW_FINDINGS}` — full text of all error-severity findings from the review
   - `{ORIGINAL_SPEC}` — original task description from Step 1
2. Dispatch `planner` with filled template and model `modelTiers.capable`
3. The planner writes the edited plan back to the same path (overwriting)

#### 4.4: Iterate or escalate

Loop back to Step 4.1. Max 3 iterations per era.

**On convergence (Approved within budget):** proceed to Step 5.

**On budget exhaustion (3 iterations, errors persist):**

Present findings and offer:
- **(a) Keep iterating** — reset budget, update plan version
- **(b) Proceed with issues** — report plan with findings noted

If **(a):** increment era (v1 -> v2), create new versioned review file, loop back to Step 4.1 with fresh budget.

If **(b):** proceed to Step 5 with outstanding findings noted.

### Step 5: Report result

- Show plan file path
- Report review status:
  - **Clean:** "Plan reviewed — no issues found."
  - **Clean with notes:** "Plan reviewed — N warnings/suggestions appended as Review Notes."
  - **Proceeded with issues:** "Plan reviewed — N outstanding issues noted. Review: `<review-path>`"
- Suggest: "Run with the `execute-plan` skill."

---

## Template Specifications

### `generate-plan-prompt.md` (new)

Extracted from the current inline prompt in SKILL.md Step 2. Tells the planner to analyze the codebase and produce a structured plan.

**Placeholders:**
- `{TASK_DESCRIPTION}` — full task text (todo body, file contents, or freeform)
- `{WORKING_DIR}` — absolute path to cwd
- `{OUTPUT_PATH}` — target plan file path (`.pi/plans/yyyy-MM-dd-<name>.md`)
- `{SOURCE_TODO}` — `Source todo: TODO-<id>` or empty string

### `edit-plan-prompt.md` (new)

Tells the planner to surgically edit an existing plan based on specific review findings. Instructs it to preserve correct sections and only modify what the findings call out.

**Placeholders:**
- `{PLAN_CONTENTS}` — current plan file contents
- `{REVIEW_FINDINGS}` — full text of error-severity findings (with task numbers, descriptions, recommendations)
- `{ORIGINAL_SPEC}` — original task description for reference

### `review-plan-prompt.md` (renamed from `plan-reviewer.md`)

Existing template with minor updates:
- Ensure the Status line format (`**[Approved]**` or `**[Issues Found]**`) is unambiguous for parsing in Step 4.2
- Ensure severity labels (`Error`, `Warning`, `Suggestion`) match exactly what Step 4.2 expects
- No changes to the review checklist, calibration guidance, or issue format

**Placeholders:**
- `{PLAN_CONTENTS}` — full plan file contents
- `{ORIGINAL_SPEC}` — original task description

### `execute-task-prompt.md` (renamed from `implementer-prompt.md`)

Content unchanged. Rename only.

**Placeholders:**
- `{TASK_SPEC}`, `{CONTEXT}`, `{WORKING_DIR}`, `{TDD_BLOCK}`

### `refine-code-prompt.md` (renamed from `remediation-prompt.md`)

Internal agent references updated (`coder`, `code-refiner`). Otherwise unchanged.

**Placeholders:**
- `{PLAN_GOAL}`, `{PLAN_CONTENTS}`, `{BASE_SHA}`, `{HEAD_SHA}`, `{REVIEW_OUTPUT_PATH}`, `{MAX_ITERATIONS}`, `{MODEL_MATRIX}`, `{WORKING_DIR}`

### `review-code-prompt.md` (renamed from `code-reviewer.md`)

Content unchanged. Rename only.

**Placeholders:**
- `{WHAT_WAS_IMPLEMENTED}`, `{PLAN_OR_REQUIREMENTS}`, `{BASE_SHA}`, `{HEAD_SHA}`, `{DESCRIPTION}`, `{RE_REVIEW_BLOCK}`

### `review-fix-block.md` (renamed from `re-review-block.md`)

Content unchanged. Rename only.

**Placeholders:**
- `{PREVIOUS_FINDINGS}`, `{PREV_HEAD}`, `{NEW_HEAD}`

---

## Agent Definition Updates

### `planner.md` (renamed from `plan-generator.md`)

- Frontmatter: `name: planner`, add `thinking: high`, `maxSubagentDepth: 0`
- Cherry-pick from Superpowers writing-plans skill:
  - More thorough no-placeholders list (e.g., "Add appropriate error handling", "Write tests for the above", "Similar to Task N" without repeating the code)
  - No-placeholders examples are additive — they supplement the existing list
- Ensure required plan sections match what execute-plan Step 2 validates: header, file structure, numbered tasks (with Files/steps/acceptance criteria/model recommendation), dependencies, risk assessment, optional test command
- System prompt body otherwise unchanged

### `plan-reviewer.md` (update in place)

- Add `thinking: high`, `maxSubagentDepth: 0`
- Flesh out system prompt: the current 2-line body delegates entirely to the task prompt. Add review principles parallel to `code-reviewer.md`: read the full plan, calibrate severity, be specific with task/section references, give a clear verdict, acknowledge strengths
- Task prompt (from `review-plan-prompt.md`) still contains the full review protocol — the system prompt establishes identity and principles

### `coder.md` (renamed from `plan-executor.md`)

- Frontmatter: `name: coder`, add `thinking: medium`, `maxSubagentDepth: 0`
- Update description to reflect broader role: executes tasks from plans and fixes code based on review findings
- System prompt body otherwise unchanged

### `code-refiner.md` (renamed from `remediation-coordinator.md`)

- Frontmatter: `name: code-refiner`, add `thinking: medium`, `maxSubagentDepth: 1`
- Update internal references: dispatches `coder` and `code-reviewer`
- System prompt body otherwise unchanged

### `code-reviewer.md` (update in place)

- Add `thinking: high`, `maxSubagentDepth: 0`
- No content changes

---

## Cross-Suite Updates

### Skill rename: `review-loop` -> `refine-code`

- Rename directory: `agent/skills/review-loop/` -> `agent/skills/refine-code/`
- Update SKILL.md frontmatter: `name: refine-code`
- Rename templates within:
  - `remediation-prompt.md` -> `refine-code-prompt.md`
  - `re-review-block.md` -> `review-fix-block.md`
- Update internal references to agent names

### execute-plan SKILL.md updates

1. Agent references: `plan-executor` -> `coder` throughout
2. Template reference: `implementer-prompt.md` -> `execute-task-prompt.md`
3. Skill reference: `review-loop` -> `refine-code` in Step 12
4. Step 12 user choices — replace current wording with:
   - **(a) Keep iterating** — re-invoke refine-code, budget resets
   - **(b) Proceed with issues** — continue to completion with findings noted
   - **(c) Stop execution** — skip completion, report partial progress

### requesting-code-review skill

- Rename template reference: `code-reviewer.md` -> `review-code-prompt.md`
- Update SKILL.md references to the template filename

---

## Complete File Inventory

### Created

| File | Purpose |
|------|---------|
| `agent/skills/generate-plan/generate-plan-prompt.md` | Plan generation template (extracted from inline prompt) |
| `agent/skills/generate-plan/edit-plan-prompt.md` | Surgical plan edit template |

### Renamed

| From | To |
|------|-----|
| `agent/agents/plan-generator.md` | `agent/agents/planner.md` |
| `agent/agents/plan-executor.md` | `agent/agents/coder.md` |
| `agent/agents/remediation-coordinator.md` | `agent/agents/code-refiner.md` |
| `agent/skills/review-loop/` | `agent/skills/refine-code/` |
| `agent/skills/review-loop/remediation-prompt.md` | `agent/skills/refine-code/refine-code-prompt.md` |
| `agent/skills/review-loop/re-review-block.md` | `agent/skills/refine-code/review-fix-block.md` |
| `agent/skills/generate-plan/plan-reviewer.md` | `agent/skills/generate-plan/review-plan-prompt.md` |
| `agent/skills/execute-plan/implementer-prompt.md` | `agent/skills/execute-plan/execute-task-prompt.md` |
| `agent/skills/requesting-code-review/code-reviewer.md` | `agent/skills/requesting-code-review/review-code-prompt.md` |

### Updated (content changes)

| File | Changes |
|------|---------|
| `agent/agents/planner.md` | Rename frontmatter, add `thinking: high`, `maxSubagentDepth: 0`, cherry-pick writing-plans guidance |
| `agent/agents/plan-reviewer.md` | Flesh out system prompt, add `thinking: high`, `maxSubagentDepth: 0` |
| `agent/agents/coder.md` | Rename frontmatter, add `thinking: medium`, `maxSubagentDepth: 0` |
| `agent/agents/code-refiner.md` | Rename frontmatter, update internal refs, add `thinking: medium`, `maxSubagentDepth: 1` |
| `agent/agents/code-reviewer.md` | Add `thinking: high`, `maxSubagentDepth: 0` |
| `agent/skills/generate-plan/SKILL.md` | Full rewrite — new step structure, review-edit loop, models.json, remove async |
| `agent/skills/generate-plan/review-plan-prompt.md` | Minor updates for output format consistency |
| `agent/skills/execute-plan/SKILL.md` | Agent/template refs, Step 12 user choices |
| `agent/skills/refine-code/SKILL.md` | Rename frontmatter, agent/template refs |
| `agent/skills/refine-code/refine-code-prompt.md` | Agent refs (`coder`, `code-refiner`) |
| `agent/skills/requesting-code-review/SKILL.md` | Template ref update |

### No content changes (rename only)

| File |
|------|
| `agent/skills/execute-plan/execute-task-prompt.md` |
| `agent/skills/requesting-code-review/review-code-prompt.md` |
| `agent/skills/refine-code/review-fix-block.md` |
