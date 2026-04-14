---
name: requesting-code-review
description: "Use after completing major features, after all plan execution waves complete, or before merging to main. Dispatches a code-reviewer subagent with git diff context and requirements for production readiness review."
---

# Requesting Code Review

Dispatch a code-reviewer subagent to catch issues before they compound. The reviewer
gets precisely crafted context — never your session's history.

## When to Request Review

**Mandatory:**
- After all waves complete in `execute-plan` (full diff review)
- After completing a major feature
- Before merge to main

**Optional but valuable:**
- When stuck (fresh perspective)
- Before refactoring (baseline check)
- After fixing complex bug

## How to Request

### 1. Determine the git range

```bash
BASE_SHA=$(git merge-base HEAD main)  # or the SHA before execution started
HEAD_SHA=$(git rev-parse HEAD)
```

### 2. Read the prompt template and fill placeholders

Read [review-code-prompt.md](review-code-prompt.md) in this directory.

Fill these placeholders:
- `{WHAT_WAS_IMPLEMENTED}` — what was built
- `{PLAN_OR_REQUIREMENTS}` — what it should do (plan file contents, todo body, or spec)
- `{BASE_SHA}` — starting commit
- `{HEAD_SHA}` — ending commit
- `{DESCRIPTION}` — brief summary of changes
- `{RE_REVIEW_BLOCK}` — empty string (standalone reviews are always full reviews, not re-reviews)

### 2b. Resolve model and dispatch

Read the model matrix from `~/.pi/agent/model-tiers.json`. If the file doesn't exist or is unreadable, stop with: "requesting-code-review requires `~/.pi/agent/model-tiers.json` — see model matrix configuration."

Use the `capable` tier for the reviewer model. Resolve the dispatch target using the `dispatch` map — see execute-plan Step 6 for the full algorithm. Default to `"pi"` if absent.

### 3. Dispatch the subagent

Use pi's `subagent` tool to dispatch a `code-reviewer` agent:

```
subagent {
  agent: "code-reviewer",
  task: "<filled review-code-prompt.md template>",
  model: "<capable from model-tiers.json>",
  dispatch: "<dispatch for capable>"
}
```

Use the `capable` model from `model-tiers.json` in a fresh context — the reviewer must see
the code without bias from the generation process.

### 4. Act on feedback

| Severity | Action |
|----------|--------|
| **Critical** | Fix immediately — bugs, security issues, data loss |
| **Important** | Fix before proceeding — architecture, missing features, test gaps |
| **Minor** | Note for later — style, optimization, docs |

**If reviewer is wrong:** Push back with technical reasoning. Reference working
tests or code. Don't implement suggestions that break things.

## Example

```
[Just completed plan execution — all waves passed]

BASE_SHA=$(git rev-parse HEAD~15)  # SHA before execution started
HEAD_SHA=$(git rev-parse HEAD)

[Read review-code-prompt.md, fill placeholders]
[Dispatch subagent with filled template]

[Reviewer returns]:
  Strengths: Clean architecture, comprehensive tests
  Issues:
    Important: Cross-file links in wiki point to non-existent filenames
    Minor: Inconsistent heading levels across pages
  Assessment: Ready with fixes

[Fix Important issues]
[Continue to completion]
```

## Red Flags

**Never:**
- Skip review because "it's simple"
- Ignore Critical issues
- Proceed with unfixed Important issues

**If reviewer wrong:**
- Push back with technical reasoning
- Show code/tests that prove correctness

<!-- Adapted from superpowers (https://github.com/obra/superpowers) -->
