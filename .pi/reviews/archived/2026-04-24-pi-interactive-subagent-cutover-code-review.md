# Code Review: pi-interactive-subagent Cutover — Era 2

**Date:** 2026-04-24
**Git Range (Final Verification):** 958cf90e05cfd759d3cb0dc733d9f8a0693ffe24..fa4c15c4793c943740724d7c9d565587d1b2e5cf
**Reviewer model:** openai-codex/gpt-5.4 (Final Verification)

*Era 1 (v1) found 2 Important issues — both fixed and confirmed clean in hybrid re-review. Final Verification (full-diff) found 2 new Important issues and 2 Minor issues, triggering era reset.*

---

## Iteration 1 — Final Verification Findings (Full Diff)

### Strengths

The migration is thorough and disciplined. Every code-block dispatch site in all six modified files has been updated to the new tool shapes. The `packages` swap in `agent/settings.json`, README prose updates, and `using-git-worktrees/SKILL.md` cleanup all land atomically in the same branch. The `agent/model-tiers.json` and `agent/agents/*.md` are correctly untouched. The `results[i].finalMessage` guidance is well-placed at the most-trafficked dispatch sites. The `name:` field is consistently present in every code-block dispatch shape using the dynamic `<task-N>: <task-title>` template. No old `subagent { agent, task }` single-tool shapes, `chain:` shapes, or stale `worktree: true` references survive.

### Issues

#### Critical (Must Fix)

None.

#### Important (Should Fix)

**II-1. Missing `results[0].finalMessage` consumption note for `plan-reviewer` dispatch in `generate-plan/SKILL.md`**

- File: `agent/skills/generate-plan/SKILL.md`, line 143–145
- What's wrong: The `plan-reviewer` dispatch (Step 4.1, line 134) is immediately followed by step 5 "Write review output to the versioned path" with no explicit guidance that the content comes from `results[0].finalMessage`. The `planner` dispatch at Step 3 (line 99) correctly has this note at line 103.
- Why it matters: Without explicit guidance, the orchestrator could attempt to read a file, synthesize content itself, or stall — functional breakage on first exercise of this flow.
- Fix: After line 143 (closing ``` of dispatch block), add: `Read the reviewer's output from results[0].finalMessage and write it to the versioned path in step 5.`

**II-2. Missing `results[0].finalMessage` consumption note for `code-reviewer` dispatch in `refine-code/refine-code-prompt.md`**

- File: `agent/skills/refine-code/refine-code-prompt.md`, line 65
- What's wrong: Iteration 1 step 3 dispatches `code-reviewer` via `subagent_run_serial`, then step 4 says "Write review to versioned path" with no bridge explaining content is from `results[0].finalMessage`.
- Why it matters: `refine-code-prompt.md` is executed inside a `code-refiner` subagent with a fresh context. Without an explicit note, the refiner agent must infer the retrieval path — error-prone.
- Fix: After line 65 (closing ``` of dispatch block), add: `Read the reviewer's output from results[0].finalMessage and write it to the versioned path (step 4).`

#### Minor (Nice to Have)

**M-3. `refine-code-prompt.md` hybrid re-review and final verification dispatches lack code blocks**

- File: `agent/skills/refine-code/refine-code-prompt.md`, lines 117 and 127
- Prose-only descriptions rather than explicit `subagent_run_serial` code blocks (inconsistent with step 3 format). Low risk but asymmetric.

**M-4. `generate-plan/SKILL.md` Step 4.3 planner edit dispatch lacks `results[0].finalMessage` note**

- File: `agent/skills/generate-plan/SKILL.md`, line 201–202
- Lower risk than II-1 because the planner's primary output is a file overwrite (orchestrator reads from disk), but inconsistent with Step 3 pattern.

### Assessment

**Ready to merge: With fixes**

**Reasoning:** Two Important result-consumption guidance gaps in generate-plan and refine-code-prompt could cause fresh-context subagents to fail to retrieve reviewer output; these must be addressed before merge.

---

## Remediation Log

### Era 2, Iteration 1 — Batch 1

**Issues addressed:** II-1 (generate-plan plan-reviewer results note), II-2 (refine-code-prompt code-reviewer results note)

**Commit:** aec0fdc421a45a6ae0f2fb5b7ec940a065b91109
**Status:** Fixed — committed

---

## Era 2, Hybrid Re-Review

**Reviewer model:** anthropic/claude-sonnet-4-6
**Range:** fa4c15c4793c943740724d7c9d565587d1b2e5cf..aec0fdc421a45a6ae0f2fb5b7ec940a065b91109

Both II-1 and II-2 confirmed resolved. No regressions. No new issues.

**Assessment: Ready to merge: Yes**

---

## Final Verification (Era 2)

**Reviewer model:** openai-codex/gpt-5.4
**Range:** 958cf90e05cfd759d3cb0dc733d9f8a0693ffe24..aec0fdc421a45a6ae0f2fb5b7ec940a065b91109

All ten key verification criteria pass cleanly. Three Minor consistency notes (no code blocks for hybrid re-review / final verification dispatch steps; edit-mode planner note) — none are correctness problems or regressions.

**Assessment: Ready to merge: Yes**

**Result:** Clean after 2 eras (Era 1: 1 iteration + remediation; Era 2: 1 iteration + remediation + final verification).
