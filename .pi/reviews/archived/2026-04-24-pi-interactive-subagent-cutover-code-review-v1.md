# Code Review: pi-interactive-subagent Cutover

**Date:** 2026-04-24
**Git Range:** 958cf90e05cfd759d3cb0dc733d9f8a0693ffe24..f38fc90ff00a51650fe783f6143ac3a771000240
**Reviewer model:** openai-codex/gpt-5.4

---

## Iteration 1 — Full Review

### Strengths

The implementation is a textbook atomic cutover. The two-commit structure (wave 1: settings + README, wave 2: all skill dispatch sites) lands cleanly and is trivially revertable as a unit. Every checklist item from the plan was addressed:

- `agent/settings.json` package path is correct.
- All old `subagent { agent, task }` single-tool shapes are gone from skill files.
- All single-mode calls correctly use `subagent_run_serial { tasks: [...] }` with one-element arrays.
- All parallel waves use `subagent_run_parallel { tasks: [...] }`.
- The `cli:` per-call argument is used consistently everywhere dispatch resolution produces a value.
- `results[0].finalMessage` is the documented result-consumption pattern at every relevant call site.
- `agent/model-tiers.json` is unchanged (confirmed by empty diff).
- `agent/agents/*.md` are unchanged (confirmed by empty diff).
- The `using-git-worktrees/SKILL.md` stale `worktree:true` mentions are removed from both the frontmatter description and the Integration section.
- No references to `pi-subagent` remain in `agent/` or `README.md`.
- README prose gains an accurate architecture paragraph describing the three-tool surface.

### Issues

#### Critical (Must Fix)

None found.

#### Important (Should Fix)

**I-1. Two `dispatch` prose fragments survive in `refine-code-prompt.md`**

- File: `agent/skills/refine-code/refine-code-prompt.md`
- Line 117: `5. **Dispatch \`code-reviewer\`** with model \`standard\` and corresponding \`dispatch\` from the model matrix`
- Line 127: `1. **Dispatch \`code-reviewer\`** with model \`crossProvider.capable\` and corresponding \`dispatch\` for a **full-diff** verification:`
- What's wrong: Both lines say "corresponding `dispatch`" instead of "corresponding `cli`". The code-refiner reads this prompt at runtime and drives its own inner dispatches; following these prose lines literally will produce `dispatch:` instead of `cli:` in its `subagent_run_serial` calls for hybrid re-reviews and final verification.
- Why it matters: This is the hot path of the code-refiner inner loop — wrong API contract causes runtime failures.
- Fix: Replace "corresponding `dispatch` from the model matrix" → "corresponding `cli` from the model matrix" and "corresponding `dispatch` for" → "corresponding `cli` for".

**I-2. Sequential-mode `name` field uses static string in `execute-plan/SKILL.md`**

- File: `agent/skills/execute-plan/SKILL.md`, line 334
- What's wrong: The parallel dispatch template uses `name: "<task-N>: <task-title>"` but the sequential dispatch template uses the static string `name: "coder"`. The `name` field exists to correlate results back to plan tasks in logs and error messages.
- Why it matters: Inconsistent templates — the normative reference should be consistent.
- Fix: Change the sequential example to `name: "<task-N>: <task-title>"` to match the parallel template.

#### Minor (Nice to Have)

**M-1. `refine-code-prompt.md` — no explicit `subagent_run_serial` code blocks for Iteration 2..N and Final Verification dispatches**

- File: `agent/skills/refine-code/refine-code-prompt.md`, lines 117 and 127
- Steps 5 (Iteration 2..N re-review) and Final Verification step 1 describe what to dispatch but unlike steps 3 and 7 provide no code block with the `subagent_run_serial { tasks: [...] }` shape. The code-refiner must infer the correct call shape from earlier examples.

**M-2. `requesting-code-review/SKILL.md` — cross-references `execute-plan Step 6` for dispatch resolution**

- File: `agent/skills/requesting-code-review/SKILL.md`, line 48
- Step 2b cross-references execute-plan Step 6 for dispatch resolution algorithm. Not a regression, but creates a cross-file dependency.

### Recommendations

1. Fix the two stale `dispatch` prose lines in `refine-code-prompt.md` (Important I-1) before merging.
2. Fix the sequential-mode `name` field example in `execute-plan/SKILL.md` (Important I-2).
3. Consider a follow-on PR to add explicit `subagent_run_serial` code blocks to the re-review sections in `refine-code-prompt.md`.

### Assessment

**Ready to merge: With fixes**

**Reasoning:** The structural migration is correct and complete. Two prose lines in `refine-code-prompt.md` still say "corresponding `dispatch`" rather than "corresponding `cli`", causing the code-refiner subagent to use the wrong parameter name in hybrid re-review and final verification dispatches.

---

## Remediation Log

### Iteration 1 — Batch 1

**Issues addressed:** I-1 (refine-code-prompt.md dispatch→cli prose), I-2 (execute-plan sequential name field)

**Commit:** fa4c15c4793c943740724d7c9d565587d1b2e5cf
**Status:** Fixed — committed
