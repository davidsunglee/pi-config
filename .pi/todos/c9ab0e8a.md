{
  "id": "c9ab0e8a",
  "title": "Capture cross-provider plan review details in plan file",
  "tags": [
    "generate-plan",
    "plan-review"
  ],
  "status": "done",
  "created_at": "2026-04-06T20:30:45.623Z"
}

## Problem

When the cross-provider plan reviewer (dispatched via `plan-executor` subagent) returns its verdict, the full review details (warnings, suggestions, specific task citations) are lost. The subagent's inline response gets truncated to a summary line like "Approved with 0 errors, 2 warnings, 1 suggestion" but the actual warning/suggestion text isn't available to the orchestrator.

This means the `## Review Notes` section appended to the plan file only contains the verdict, not the actionable details. We observed this during the GPT-5.4 review of `2026-04-06-fix-model-resolution.md` — the plan got "Approved with 2 warnings, 1 suggestion" but we couldn't append the actual findings.

The same problem applies to the final code review in execute-plan Step 12 — the review output may be truncated.

## Root cause

The `plan-executor` subagent writes its output to a temp file, but the orchestrating agent receives only the truncated response text. The artifact path in the subagent result pointed to a file that didn't exist when we tried to read it.

## Solution: Use the `output` parameter

Pass an `output` path to the subagent dispatch so the full review is written to a known location, then read that file back. This was tested during the execution-checkpoints plan review and worked correctly.

### 1. Plan review (generate-plan Step 3.5)

Update the dispatch in Step 3.5 subsection 4 to include an `output` parameter:

```
subagent {
  agent: "plan-executor",
  task: "<filled plan-reviewer.md template>",
  model: "<modelTiers.crossProvider.capable>",
  output: ".pi/plans/reviews/<plan-name>-review.md"
}
```

After the reviewer completes:
1. Read the review file from `.pi/plans/reviews/<plan-name>-review.md`
2. Parse the full findings (errors, warnings, suggestions with task numbers and descriptions)
3. Use the full findings when appending `## Review Notes` to the plan — include the actual details, not just counts
4. Archive: keep the review file in `.pi/plans/reviews/` for reference

### 2. Final code review (execute-plan Step 12)

Update the dispatch in Step 12 item 4 to include an `output` parameter:

```
subagent {
  agent: "plan-executor",
  task: "<filled template>",
  model: "<modelTiers.crossProvider.capable>",
  output: ".pi/reviews/<plan-name>-code-review.md"
}
```

After the reviewer completes:
1. Read the review file from `.pi/reviews/<plan-name>-code-review.md`
2. Use the full findings when reporting results to the user
3. Archive: keep the review file in `.pi/reviews/` for reference

### Archive directories
- `.pi/plans/reviews/` — plan reviews (artifacts of the planning process, alongside `.pi/plans/done/`)
- `.pi/reviews/` — code reviews (about the implementation, independent of plans)

## Changes

### generate-plan/SKILL.md
- **Step 3.5 subsection 4:** Add `output` parameter to subagent dispatch pointing to `.pi/plans/reviews/<plan-name>-review.md`
- **Step 3.5 subsection 5:** After dispatch, read the review file instead of relying on inline response. Use full findings when appending `## Review Notes`.

### execute-plan/SKILL.md
- **Step 12 item 4:** Add `output` parameter to subagent dispatch pointing to `.pi/reviews/<plan-name>-code-review.md`
- **Step 12 item 5:** After dispatch, read the review file instead of relying on inline response. Use full findings when reporting to user.

## Files
- Modify: `~/.pi/agent/skills/generate-plan/SKILL.md` — Step 3.5 subsections 4-5
- Modify: `~/.pi/agent/skills/execute-plan/SKILL.md` — Step 12 items 4-5

## Acceptance criteria
- Plan review dispatch uses `output` parameter writing to `.pi/plans/reviews/`
- Code review dispatch uses `output` parameter writing to `.pi/reviews/`
- After plan review, the full list of warnings/suggestions (with task numbers and descriptions) is available to the orchestrator
- The `## Review Notes` section in the plan file contains the actual findings, not just a count
- After code review, the full findings are available for reporting to the user
- Review files are archived (not deleted) in their respective directories
