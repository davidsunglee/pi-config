# Plan: Add Plan Review Step to generate-plan Skill

## Header

**Goal:** Improve plan quality by (1) updating the plan-generator prompt to require explicit constraint/footgun documentation for format-sensitive tasks, and (2) adding a review step between plan generation and user reporting that dispatches a cross-provider reviewer to catch structural issues (missing dependencies, vague criteria, spec gaps) before execution begins.

**Architecture summary:** The pi agent configuration at `~/.pi/agent/` uses a skill + subagent pattern. Skills (`skills/*/SKILL.md`) are orchestration instructions read by the main agent. Subagents (`agents/*.md`) are dispatched via the `subagent` tool with self-contained task prompts. The `generate-plan` skill dispatches `plan-generator` to produce plans, and `execute-plan` dispatches `plan-executor` for each task. For review, the existing pattern (used by `requesting-code-review`) dispatches `plan-executor` with a prompt template file — no new subagent definition needed. This plan follows that same pattern: a new `plan-reviewer.md` prompt template is dispatched via `plan-executor`.

**Tech stack:** Markdown (YAML frontmatter for agent/skill metadata), pi subagent dispatch protocol, pi model tier resolution system.

## File Structure

- `~/.pi/agent/skills/generate-plan/plan-reviewer.md` (Create) — Prompt template for the plan reviewer. Accepts `{PLAN_CONTENTS}` and `{ORIGINAL_SPEC}` placeholders. Produces structured findings with severity levels (Error/Warning/Suggestion).
- `~/.pi/agent/skills/generate-plan/SKILL.md` (Modify) — Add Step 3.5 (plan review dispatch) between existing Steps 3 and 4. Update Step 4 to include review status in the report. Add handling logic for errors vs warnings/suggestions.
- `~/.pi/agent/agents/plan-generator.md` (Modify) — Add constraint/footgun guidance to the "Plan Output" section, instructing the generator to state both required structure AND common mistakes for format-sensitive tasks.

## Tasks

### Task 1: Create plan-reviewer.md prompt template

**Files:**
- Create: `~/.pi/agent/skills/generate-plan/plan-reviewer.md`

**Steps:**
- [ ] **Step 1: Create the prompt template file** — Create `~/.pi/agent/skills/generate-plan/plan-reviewer.md` with the following content:

```markdown
# Plan Review Agent

You are reviewing a generated implementation plan for structural correctness before execution begins.

**Your task:**
1. Compare the plan against the original spec/todo to verify full coverage
2. Check dependency declarations for accuracy
3. Assess task sizing and cross-task consistency
4. Evaluate acceptance criteria quality
5. Confirm the plan is buildable — an agent can follow it without getting stuck

## Original Spec / Task Description

{ORIGINAL_SPEC}

## Generated Plan

{PLAN_CONTENTS}

## Review Checklist

**Spec/Todo Coverage:**
- Does every requirement in the original spec have a corresponding task?
- Are there tasks that don't map to any requirement (scope creep)?
- List any gaps: requirement → missing task.

**Dependency Accuracy:**
- For each task, check: does it reference outputs (filenames, paths, interfaces, data) from another task?
- If yes, is that other task listed as a dependency?
- Flag implicit dependencies that are not declared.

**Task Sizing:**
- Any task that needs to read 4000+ lines of source material may need splitting.
- Any task that produces very large output (multiple files, extensive content) may need splitting.
- Flag tasks that are too large for a single worker.

**Cross-Task Consistency:**
- Do tasks that reference each other's outputs use consistent names, paths, and interfaces?
- If Task A says it creates `config.json` and Task B says it reads `settings.json`, that's an error.

**Acceptance Criteria Quality:**
- Are criteria specific enough to verify objectively?
- Flag vague criteria like "contains a diagram" — should specify what the diagram shows.
- Good criteria describe observable properties: "includes a mermaid sequence diagram showing the request lifecycle from client to database and back."

**Buildability:**
- Could an agent follow each task without getting stuck?
- Are there tasks so vague they can't be acted on?
- Does every "Create" task specify what to write? Does every "Modify" task specify what to change?

**Constraint Documentation:**
- For tasks with format-sensitive outputs (YAML frontmatter, specific file structures, templated content): does the plan state both the required format AND constraints/footguns that would break it?
- Example: if a file requires YAML frontmatter, the plan should state "frontmatter must be the very first content in the file — nothing before the opening `---`."

**Placeholder Content:**
- Search for: "TBD", "TODO", "implement later", "similar to Task N", or steps that describe what to do without showing how.
- Every step must contain actual actionable content.

## Calibration

**Only flag issues that would cause real problems during execution.** An agent building the wrong thing, referencing a non-existent file, or getting stuck is an issue. Minor wording preferences, stylistic choices, or "nice to have" improvements are not errors.

Approve the plan unless there are serious structural gaps.

## Output Format

### Status

**[Approved]** or **[Issues Found]**

### Issues

For each issue found:

**[Error | Warning | Suggestion] — Task N: Short description**
- **What:** Describe the issue
- **Why it matters:** What goes wrong during execution if this isn't fixed
- **Recommendation:** How to fix it

**Severity guide:**
- **Error** — Missing tasks, wrong dependencies, tasks that reference non-existent outputs, tasks that can't be executed as written. Blocks execution.
- **Warning** — Vague acceptance criteria, sizing concerns, consistency risks that might cause problems. Informational.
- **Suggestion** — Improvements that would make the plan better but aren't problems. Won't cause execution failures.

### Summary

One paragraph: overall assessment, number of errors/warnings/suggestions, and whether the plan is ready for execution.

## Critical Rules

**DO:**
- Check every task against the original spec
- Trace cross-task references to verify consistency
- Be specific: cite task numbers and exact text
- Distinguish real problems from preferences
- Give a clear verdict (Approved or Issues Found)

**DON'T:**
- Flag stylistic preferences as errors
- Rewrite the plan — flag issues, don't fix them
- Mark everything as an error — use severity levels accurately
- Review without reading the full plan and spec
- Be vague ("improve the acceptance criteria" — say which ones and how)
```

- [ ] **Step 2: Verify the file was created** — Read back `~/.pi/agent/skills/generate-plan/plan-reviewer.md` and confirm it contains both `{PLAN_CONTENTS}` and `{ORIGINAL_SPEC}` placeholders, the severity guide (Error/Warning/Suggestion), all seven review checklist sections, and the calibration section.

**Acceptance criteria:**
- File exists at `~/.pi/agent/skills/generate-plan/plan-reviewer.md`
- Contains `{PLAN_CONTENTS}` placeholder exactly once
- Contains `{ORIGINAL_SPEC}` placeholder exactly once
- Defines three severity levels: Error, Warning, Suggestion
- Review checklist covers: spec coverage, dependency accuracy, task sizing, cross-task consistency, acceptance criteria quality, buildability, constraint documentation, placeholder content
- Calibration section instructs reviewer to only flag real execution problems
- Output format includes Status line (`[Approved]` or `[Issues Found]`), Issues list, and Summary
- No YAML frontmatter (this is a prompt template, not a skill or agent definition)

**Model recommendation:** cheap

---

### Task 2: Update plan-generator.md with constraint/footgun guidance

**Files:**
- Modify: `~/.pi/agent/agents/plan-generator.md`

**Steps:**
- [ ] **Step 1: Read the current plan-generator.md** — Read `~/.pi/agent/agents/plan-generator.md` to confirm current structure. The file has these sections: Input, Codebase Analysis, Plan Output (with subsections: Required Sections, Scope Check, Task Granularity, No Placeholders), Model Selection Rubric, Self-Review, Output.

- [ ] **Step 2: Add constraint guidance to Plan Output section** — In `~/.pi/agent/agents/plan-generator.md`, add a new subsection after "### No Placeholders" and before "## Model Selection Rubric". The new subsection should be:

```markdown
### Format Constraints and Footguns
When tasks create files with specific format requirements (YAML frontmatter, JSON schema, templated content, specific file structures), state both:
1. **The required structure** — what the format looks like
2. **Constraints that would break it** — common mistakes that cause failures

Example: Instead of just "file must have YAML frontmatter", write:
- "File must begin with YAML frontmatter between `---` delimiters"
- "Frontmatter must be the very first content in the file — do not place comments, blank lines, or any other content before the opening `---`"

This prevents the class of bug where the plan specifies a format but doesn't state the footgun, leading workers to produce structurally broken output.
```

- [ ] **Step 3: Verify the modification** — Read back `~/.pi/agent/agents/plan-generator.md` and confirm the new "Format Constraints and Footguns" subsection appears after "No Placeholders" and before "Model Selection Rubric". Confirm the existing content (Input, Codebase Analysis, Required Sections, Scope Check, Task Granularity, No Placeholders, Model Selection Rubric, Self-Review, Output) is all still present and unchanged.

**Acceptance criteria:**
- `~/.pi/agent/agents/plan-generator.md` contains a new subsection titled "### Format Constraints and Footguns"
- The subsection is positioned after "### No Placeholders" and before "## Model Selection Rubric"
- It instructs the generator to state both required structure AND constraints/footguns
- It includes the YAML frontmatter example
- All existing content in the file is preserved unchanged (frontmatter, all other sections)

**Model recommendation:** cheap

---

### Task 3: Update generate-plan SKILL.md with review step

**Files:**
- Modify: `~/.pi/agent/skills/generate-plan/SKILL.md`

**Steps:**
- [ ] **Step 1: Read the current SKILL.md and supporting files** — Read `~/.pi/agent/skills/generate-plan/SKILL.md` to confirm the current step structure (Steps 1–4 plus Edge cases). Also read `~/.pi/agent/skills/requesting-code-review/SKILL.md` to confirm the dispatch pattern being followed (read template → fill placeholders → dispatch plan-executor with capable-tier model).

- [ ] **Step 2: Add Step 3.5 — Review the generated plan** — In `~/.pi/agent/skills/generate-plan/SKILL.md`, add a new section between Step 3 and Step 4. Insert the following after the Step 3 section and before the Step 4 section:

```markdown
## Step 3.5: Review the generated plan

After the plan-generator completes, dispatch a reviewer to check for structural issues before presenting the plan to the user.

### 1. Read the generated plan

Read the plan file that the plan-generator just wrote (the path from its output, e.g., `.pi/plans/2026-04-06-my-feature.md`).

### 2. Read the prompt template and fill placeholders

Read [plan-reviewer.md](plan-reviewer.md) in this directory.

Fill these placeholders:
- `{PLAN_CONTENTS}` — the full contents of the generated plan file
- `{ORIGINAL_SPEC}` — the original task description (todo body, file contents, or freeform text from Step 1)

### 3. Select a cross-provider capable-tier model

Use a capable-tier model from a **different provider** than the plan-generator to get an independent perspective:

1. Detect which provider the plan-generator used by parsing its model string:
   - `claude-*` → Anthropic
   - `gpt-*` → OpenAI
   - `gemini-*` → Google
2. Pick the capable tier from the next provider in rotation: Anthropic → OpenAI → Google → Anthropic
3. Resolve the capable tier using the same tier table as `execute-plan` Step 6 — do not hardcode model version strings.
4. **Fallback:** If the alternate provider's model is not available (dispatch fails), retry with the same provider's capable-tier model.

### 4. Dispatch the reviewer

```
subagent {
  agent: "plan-executor",
  task: "<filled plan-reviewer.md template>",
  model: "<resolved capable-tier model>"
}
```

### 5. Handle reviewer findings

Parse the reviewer's output for the Status line and any issues.

**If errors found (`[Issues Found]` with any Error-severity issues):**
- Present all findings (errors, warnings, suggestions) to the user.
- The user decides:
  - **Re-generate:** Re-run Step 3 with the reviewer findings appended to the plan-generator prompt (so the generator can address them). Then re-run Step 3.5.
  - **Manually fix:** The user edits the plan file themselves. Skip to Step 4.

**If only warnings/suggestions (no errors):**
- Append the findings as a `## Review Notes` section at the end of the plan file:

```markdown
## Review Notes

_Added by plan reviewer — informational, not blocking._

### Warnings
- **Task N**: Description of warning

### Suggestions
- **Task N**: Description of suggestion
```

- Continue to Step 4.

**If clean (`[Approved]` with no issues):**
- Continue to Step 4 with no changes to the plan file.
```

- [ ] **Step 3: Update Step 4 to include review status** — Modify the existing Step 4 in the SKILL.md. Replace the current Step 4 content:

```markdown
## Step 4: Report the result

After the subagent completes:
- Show the path to the generated plan file (e.g., `.pi/plans/2026-04-06-my-feature.md`)
- Suggest running it with the `execute-plan` skill: `/skill:execute-plan`
```

With:

```markdown
## Step 4: Report the result

After the review step completes:
- Show the path to the generated plan file (e.g., `.pi/plans/2026-04-06-my-feature.md`)
- Report the review status:
  - **Approved:** "Plan reviewed — no issues found."
  - **Approved with notes:** "Plan reviewed — N warnings/suggestions appended as Review Notes."
  - **Errors found:** Already handled in Step 3.5 (user chose to re-generate or manually fix).
- Suggest running it with the `execute-plan` skill: `/skill:execute-plan`
```

- [ ] **Step 4: Verify the complete modified SKILL.md** — Read back the full `~/.pi/agent/skills/generate-plan/SKILL.md` and verify:
  - YAML frontmatter is intact and unchanged
  - Steps flow: 1 → 2 → 3 → 3.5 → 4
  - Step 3.5 references `plan-reviewer.md` with a relative link `[plan-reviewer.md](plan-reviewer.md)`
  - Step 3.5 includes cross-provider model selection logic with fallback
  - Step 3.5 includes all three handling branches (errors, warnings/suggestions, clean)
  - Step 4 includes review status reporting
  - Edge cases section is still present at the end

**Acceptance criteria:**
- SKILL.md YAML frontmatter is unchanged (name: generate-plan, description matches original)
- Step 3.5 exists between Step 3 and Step 4
- Step 3.5 references `plan-reviewer.md` with relative link syntax
- Step 3.5 includes cross-provider model selection: detect generator's provider, rotate to next, resolve capable tier via execute-plan's tier table, fallback to same provider
- Step 3.5 includes three handling branches: errors → user decides, warnings/suggestions → append Review Notes section, clean → continue
- The `## Review Notes` format is specified with the exact markdown structure shown in the spec
- Step 4 reports review status (approved, approved with notes, or errors handled in 3.5)
- No model version strings are hardcoded (references tier table instead)
- Edge cases section is preserved
- All original Steps 1, 2, 3 content is preserved unchanged

**Model recommendation:** standard

## Dependencies

- Task 1: no dependencies (standalone new file)
- Task 2: no dependencies (standalone modification to a different file)
- Task 3 depends on: Task 1 (Step 3.5 references plan-reviewer.md which must exist for the relative link to be valid)

## Risk Assessment

**Risk 1: Cross-provider model may not be available**
- *Likelihood:* Medium — users may only have API keys for one provider.
- *Mitigation:* Explicit fallback in Step 3.5: if alternate provider fails, retry with same provider's capable-tier model. This is specified in the skill instructions.

**Risk 2: Reviewer may be overly strict, flagging too many false-positive errors**
- *Likelihood:* Low-medium — the calibration section in plan-reviewer.md explicitly says to only flag real execution problems.
- *Mitigation:* The prompt template includes a calibration section: "Only flag issues that would cause real problems during execution." Additionally, errors require user decision — no auto-reject loop.

**Risk 3: Review step adds latency to plan generation**
- *Likelihood:* Certain — adds one more subagent dispatch.
- *Mitigation:* This is an intentional tradeoff: catching structural issues before execution is cheaper than failing mid-execution. The review is a single dispatch (not a multi-wave process).

**Risk 4: Plan-generator prompt changes may not be sufficient to prevent all format footguns**
- *Likelihood:* Medium — the guidance is advisory, not enforced.
- *Mitigation:* The reviewer (change 2) acts as a safety net. The constraint documentation checklist item in plan-reviewer.md specifically checks for this: "does the plan state both the required format AND constraints/footguns that would break it?"

---

## Self-Review

### Spec coverage

| Requirement | Task |
|---|---|
| Create plan-reviewer.md prompt template with {PLAN_CONTENTS} and {ORIGINAL_SPEC} placeholders | Task 1 |
| Reviewer checks: spec coverage, dependency accuracy, task sizing, cross-task consistency, acceptance criteria quality, buildability, placeholder content | Task 1 (all seven checklist sections + constraint documentation = eight sections) |
| Severity levels: Error, Warning, Suggestion | Task 1 |
| Reviewer output format: Status, Issues, Summary | Task 1 |
| Calibration: only flag real execution problems | Task 1 |
| Update plan-generator.md with constraint/footgun guidance | Task 2 |
| Add Step 3.5 to SKILL.md between Steps 3 and 4 | Task 3, Step 2 |
| Cross-provider model selection with rotation and fallback | Task 3, Step 2 (section 3) |
| Use plan-executor agent with prompt template (no new subagent) | Task 3, Step 2 (section 4) |
| Error handling: present to user, user decides | Task 3, Step 2 (section 5) |
| Warnings/suggestions: append as Review Notes section | Task 3, Step 2 (section 5) |
| Clean approval: continue with no changes | Task 3, Step 2 (section 5) |
| Update Step 4 to include review status | Task 3, Step 3 |
| Review Notes markdown format specified | Task 3, Step 2 (section 5) |
| No changes to execute-plan | N/A — confirmed, no task touches execute-plan |
| Tier table reference (not hardcoded model strings) | Task 3, Step 2 (section 3) |

**Gaps:** None found.

### Placeholder scan

No instances of "TBD", "TODO", "implement later", or "similar to Task N" in any task.

### Type consistency

- Placeholder names: `{PLAN_CONTENTS}` and `{ORIGINAL_SPEC}` used consistently in Task 1 (template) and Task 3 (fill instructions)
- File paths: `~/.pi/agent/skills/generate-plan/plan-reviewer.md` used consistently across all tasks
- Severity levels: Error/Warning/Suggestion used consistently in template (Task 1) and handling logic (Task 3)
- Status values: `[Approved]` / `[Issues Found]` used consistently in template output format (Task 1) and handling branches (Task 3)
- Relative link: `[plan-reviewer.md](plan-reviewer.md)` used in Task 3 Step 2, valid because SKILL.md and plan-reviewer.md are in the same directory
