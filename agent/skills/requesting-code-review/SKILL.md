---
name: requesting-code-review
description: "Use after completing major features outside of execute-plan, or before merging to main. Dispatches a code-reviewer subagent with git diff context and requirements for production readiness review."
---

# Requesting Code Review

Dispatch a code-reviewer subagent to catch issues before they compound. The reviewer
gets precisely crafted context — never your session's history.

## When to Request Review

**Mandatory:**
- After completing a major feature outside of `execute-plan` (standalone full diff review)
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
- `{REVIEW_OUTPUT_PATH}` — empty string (standalone reviews do not persist to a designated artifact path; the conditional Output Artifact Contract in the prompt template is dormant when this placeholder is empty)
- `{REVIEWER_PROVENANCE}` — empty string (no provenance first line is required when the contract is dormant)

### 2b. Resolve model and dispatch

Resolve `(model, cli)` for the `code-reviewer` dispatch per the canonical procedure in [`agent/skills/_shared/model-tier-resolution.md`](../_shared/model-tier-resolution.md): `<agent> = code-reviewer`, `<tier> = capable`. On any of the four documented failure conditions, emit the corresponding canonical template byte-equal and stop. Do not fall back to a CLI default.

### 3. Dispatch the subagent

Use pi's `subagent_run_serial` tool to dispatch a `code-reviewer` agent:

```
subagent_run_serial { tasks: [
  { name: "code-reviewer", agent: "code-reviewer", task: "<filled review-code-prompt.md>", model: "<capable from model-tiers.json>", cli: "<dispatch for capable>" }
]}
```

Use the `capable` model from `model-tiers.json` in a fresh context — the reviewer must see
the code without bias from the generation process.

The reviewer's output is in `results[0].finalMessage`. Parse it for the `**Verdict:**` line in the `### Outcome` block (one of `Approved`, `Approved with concerns`, or `Not approved`) to determine next steps.

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
  **Verdict:** Approved with concerns
  **Reasoning:** Solid implementation; cross-file link issue waived as a follow-up.
  Strengths: Clean architecture, comprehensive tests
  Issues:
    Critical: (none)
    Important: Cross-file links in wiki point to non-existent filenames
    Minor: Inconsistent heading levels across pages
  Recommendations: Address the link issue in a follow-up commit.

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
