{
  "id": "e4fbf1e9",
  "title": "Design a feedback loop that consumes review findings to improve coder prompts and add pre-checks",
  "tags": [
    "workflow",
    "feedback-loop",
    "refine-code",
    "code-reviewer",
    "coder",
    "prompt-engineering"
  ],
  "status": "open",
  "created_at": "2026-04-14T00:00:00.000Z"
}

## Summary

The current workflow generates review findings in `.pi/reviews/` but never consumes them systematically. Each run starts from the same prompt templates regardless of what previous reviews have flagged. If coders consistently miss error handling at API boundaries, or repeatedly produce code that triggers the same reviewer finding, nothing in the system adapts.

Design a feedback loop that mines accumulated review artifacts, identifies recurring patterns, and feeds those patterns back into the workflow — either by updating coder prompt templates, adding pre-dispatch checks, or injecting learned guidance into worker prompts at dispatch time.

## Motivation

- The `.pi/reviews/` directory already contains 50+ structured review documents with severity-tagged findings. This is a rich, unused signal.
- Recurring findings are wasted tokens: the reviewer flags the same pattern, the refiner dispatches a coder to fix it, and the next run reproduces it from scratch.
- Prompt templates are static. The `execute-task-prompt.md` and `refine-code-prompt.md` templates are hand-written and updated manually. There's no mechanism to incorporate lessons from actual execution history.
- The review-remediate loop (refine-code) is the most expensive part of the pipeline. If coders produced fewer reviewable issues on the first pass, the refine loop would converge faster or run fewer iterations, saving real token cost.

## What the feedback loop could look like

At a high level, three stages:

```text
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Accumulate  │────▶│   Analyze    │────▶│    Apply     │
│  (reviews)   │     │  (patterns)  │     │  (prompts)   │
└──────────────┘     └──────────────┘     └──────────────┘
```

### Stage 1: Accumulate

Review artifacts already exist in `.pi/reviews/`. The question is whether the current format is structured enough to mine programmatically, or whether the review output needs a more machine-readable section (e.g., a JSON findings block alongside the human-readable markdown).

### Stage 2: Analyze

Extract recurring patterns from accumulated findings. This could be:

- **Manual/periodic:** A skill or command the user runs that reads all reviews, clusters findings by category, and produces a summary of recurring issues.
- **Automated per-run:** After each refine-code loop completes, a lightweight analysis step checks whether the findings match any known recurring patterns.
- **LLM-driven:** Dispatch a subagent to read N recent reviews and produce a structured list of recurring patterns with frequency and severity.

### Stage 3: Apply

Feed identified patterns back into the workflow. Options (not mutually exclusive):

- **Prompt injection:** Append a "known pitfalls" or "lessons learned" block to the coder's dispatch prompt at execution time. Dynamic, doesn't modify templates permanently.
- **Template update:** Periodically update `execute-task-prompt.md` with new guidance sections derived from recurring findings. Persistent, but risks prompt bloat.
- **Pre-check rules:** Add a lightweight pre-dispatch validation step that scans coder output for known anti-patterns before the full review cycle. Could catch cheap issues without a cross-provider review dispatch.
- **Reviewer guidance:** Feed recurring patterns to the reviewer too, so it knows to check for patterns that coders have historically missed. Sharpens review focus.

## Design questions to resolve

### 1. What's the right granularity for pattern extraction?

Review findings range from highly specific ("missing null check on line 42 of auth.ts") to structural ("no error handling at API boundaries throughout the codebase"). The feedback loop needs to extract patterns at a useful level of abstraction — specific enough to be actionable in a prompt, general enough to apply across tasks.

- Per-file patterns? Per-codebase patterns? Per-project-type patterns?
- How do you distinguish a one-off finding from a recurring pattern? Frequency threshold? Severity threshold?

### 2. Where does the learned knowledge live?

Options:

- **A dedicated file** (e.g., `agent/learned-patterns.json` or `.pi/learned-patterns.md`) that prompt templates reference at dispatch time.
- **Inline in prompt templates** — directly edit `execute-task-prompt.md` to include new guidance. Simpler but harder to trace which guidance came from the feedback loop vs. manual authoring.
- **In the skill itself** — `execute-plan/SKILL.md` reads the patterns file and injects relevant entries into the dispatch prompt. Keeps templates clean, adds orchestration complexity.

### 3. How to prevent prompt bloat?

If the feedback loop keeps adding learned patterns, the coder prompt grows indefinitely. Mitigations:

- **Fixed budget:** Cap the "lessons learned" section at N tokens or N items. Rotate out older or lower-frequency patterns.
- **Relevance filtering:** Only inject patterns relevant to the current task (e.g., if the task involves API endpoints, inject API-related patterns; skip UI patterns).
- **Decay:** Patterns that haven't been triggered in recent reviews get downweighted or removed. The codebase evolves; old patterns may no longer apply.

### 4. Human-in-the-loop or fully automated?

- **Fully automated:** The loop runs without user intervention. Risk: injecting bad patterns from a single noisy review, or accumulating stale guidance.
- **Human-reviewed:** The analysis step produces a proposed update and the user approves it. Safer but adds friction, likely means it never gets run.
- **Hybrid:** Automated injection at dispatch time (low-risk, ephemeral), with periodic human-reviewed template updates for persistent changes.

### 5. How does this interact with the refine-code loop?

The refine-code skill already iterates review → fix → re-review. The feedback loop sits at a different timescale:

- **Refine-code** fixes issues in the current run (minutes).
- **Feedback loop** prevents issues across future runs (days/weeks).

They should complement, not conflict. Specifically: the feedback loop should not duplicate what refine-code already catches. If refine-code reliably catches and fixes a pattern within its budget, there's less value in preventing it at the coder prompt level. The feedback loop is most valuable for patterns that are expensive to remediate or that waste refine iterations.

### 6. Review format — is it structured enough?

Current review files are markdown with severity tags (Critical, Important, Minor) and file:line references. For automated pattern extraction, it may be worth adding a structured block:

```json
{
  "findings": [
    {
      "severity": "Important",
      "category": "error-handling",
      "file": "src/api/auth.ts",
      "line": 42,
      "pattern": "Missing error handling at async API boundary",
      "description": "..."
    }
  ]
}
```

This would make Stage 2 (analysis) much more reliable than trying to parse free-form markdown.

## What this todo is NOT

This is a design task. The output should be a design document that answers the questions above and specifies the feedback loop clearly enough to generate an implementation plan from.

## Completion criteria

- Design questions 1-6 above are answered with clear decisions and rationale
- The feedback loop is specified step-by-step (accumulate → analyze → apply)
- The learned-knowledge storage format is defined
- Integration points with existing skills (execute-plan, refine-code, requesting-code-review) are specified
- Prompt bloat mitigation strategy is defined
- Token cost estimate for the analysis step is provided
- Edge cases addressed: empty review history, conflicting patterns, stale patterns, noisy reviews
