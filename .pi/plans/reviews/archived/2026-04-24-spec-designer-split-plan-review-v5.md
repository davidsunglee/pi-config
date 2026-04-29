# Plan Review — `2026-04-24-spec-designer-split.md` v5

## Status

**[Approved]**

## Review basis

Read in full:

- Plan: `.pi/plans/2026-04-24-spec-designer-split.md`
- Spec: `.pi/specs/2026-04-24-spec-designer-split.md`
- Prior review: `.pi/plans/reviews/2026-04-24-spec-designer-split-plan-review-v4.md`

Codebase cross-checks were limited to the affected local agent/skill files and the relevant `pi-interactive-subagent` runtime paths for frontmatter, system-prompt, spawning, session-mode, orchestration task fields, and mux detection.

## Strengths

- The plan now fully addresses the v4 blocking and warning findings:
  - Task 7 requires every `## Approach` deviation to be reported as a **Warning**, never downgraded or omitted, matching spec R11.
  - Task 5's mux probe now handles `PI_SUBAGENT_MUX` as a single-backend preference with no fallback when the preferred backend check fails, matching `getMuxBackend()` behavior.
  - Task 4's existing-spec detector now accepts both relative `.pi/specs/*.md` paths and absolute paths containing `/.pi/specs/`, so recovery-menu Redo can replay the absolute `SPEC_WRITTEN:` path without falling into the freeform branch.
- The core artifact split is well covered: `spec-designer.md` is frontmatter-only, `procedure.md` is the single canonical non-skill procedure, and `define-spec/SKILL.md` is reduced to branch selection, dispatch, validation, commit gating, recovery, and continuation.
- Runtime-sensitive details are aligned with the inspected `pi-interactive-subagent` code:
  - Mux env vars and `PI_SUBAGENT_MUX` behavior match `cmux.ts` / `select.ts`.
  - `system-prompt: append`, `agentDefs.body ?? params.systemPrompt`, `session-mode`, and `spawning: false` match `launch-spec.ts` parsing and launch behavior.
  - `subagent_run_serial` task fields support `systemPrompt`, `model`, and `cli`, and `wait` is correctly treated as a top-level orchestration option.
- Task sequencing is safe: shared-file edits to `planner.md` and `plan-reviewer.md` are serialized where needed, and the end-to-end smoke tests depend on all implementation tasks.
- Verification coverage is broad and tied to the spec acceptance criteria, including happy paths, inline override, existing-spec redo, architecture-round presence/absence, failure handling, downstream `generate-plan` behavior, cross-CLI behavior, and `execute-plan` regression.

## Findings

No errors, warnings, or suggestions found. The plan is structurally complete, aligned with the spec and prior review, dependency-safe, and buildable as written.

## Summary

The v5 plan is ready for execution. It preserves the spec's intended architecture, fixes the prior review's severity and mux/recovery issues, and includes sufficient verification to catch regressions in both the new `define-spec` flow and downstream planning/execution workflows.
