# Code Review: spec designer split v3

## Review Metadata
- Commit range: `5ca56f..c3ecde`
- Spec reviewed: `.pi/specs/2026-04-24-spec-designer-split.md`
- Prior review checked: `.pi/reviews/2026-04-24-spec-designer-split-v2.md`
- Reviewer model: `openai-codex/gpt-5.5` with xhigh thinking

## Summary

Reviewed the full `5ca56f..c3ecde` diff: 10 files changed, covering the new `spec-designer` agent, the extracted canonical `define-spec` procedure, orchestrator rewrite, frontmatter normalization, and downstream `## Approach` handling in planner/reviewer prompts.

No blocking production-readiness issues were found. The v2 findings have been addressed, static checks were clean (`git diff --check` and frontmatter/grep checks), and the implementation now aligns with the reviewed spec. Interactive smoke tests from the acceptance criteria were not run as part of this static review because they require live mux/user interaction.

## Prior Review Findings Verification

1. **Important: Todo input can resolve to the wrong todo file path — addressed.**
   - Evidence: `agent/skills/define-spec/procedure.md:13` now explicitly captures `^TODO-([0-9a-f]{8})$`, binds the raw 8-char id, reads `.pi/todos/<raw-id>.md`, and explicitly warns not to read `.pi/todos/TODO-<raw-id>.md`.
   - The spec was also amended at `.pi/specs/2026-04-24-spec-designer-split.md:73` to document the raw-id file path and direct file-read behavior.

2. **Minor: Failure handling references an `error` field that was never read — addressed.**
   - Evidence: `agent/skills/define-spec/SKILL.md:95` now instructs the orchestrator to read `results[0].error` along with `finalMessage`, `exitCode`, `state`, and `transcriptPath`.
   - Evidence: `agent/skills/define-spec/SKILL.md:113-116` reports `error` conditionally only when non-empty, avoiding placeholder output on clean exits.

3. **Spec/code conflict: R4 previously said TODO branch resolves via `todo` tool while implementation used direct reads — addressed.**
   - Evidence: `.pi/specs/2026-04-24-spec-designer-split.md:73` now explicitly specifies direct `.pi/todos/<raw-id>.md` reads because `spec-designer` intentionally lacks the `todo` tool.
   - Evidence: `agent/skills/define-spec/procedure.md:13` matches that contract.

4. **Spec/code conflict: existing-spec path handling needed absolute path support — addressed.**
   - Evidence: `.pi/specs/2026-04-24-spec-designer-split.md:74` now allows either relative `.pi/specs/...` paths or absolute paths containing `/.pi/specs/`.
   - Evidence: `agent/skills/define-spec/procedure.md:14` implements the same detector, and `agent/skills/define-spec/SKILL.md:163` depends on that behavior for redo/re-dispatch.

5. **Spec/code conflict: pane-closure failure ordering vs nonzero exits — addressed.**
   - Evidence: `.pi/specs/2026-04-24-spec-designer-split.md:215` now accepts either missing-completion reporting for zero-exit termination or nonzero-exit reporting when the runtime classifies pane closure as a failed process.
   - Evidence: `agent/skills/define-spec/SKILL.md:113-121` checks nonzero exit first, then missing `SPEC_WRITTEN:` on clean exits, while preserving the invariant of transcript reporting and no commit attempt.

All substantive v2 findings were addressed.

## Spec vs Code Conflicts

None found. The implementation matches the reviewed spec, including the v2-driven spec amendments for direct todo-file reads, absolute existing-spec paths, and pane-closure failure reporting.

## Strengths

- **`spec-designer` has the required body-less, dispatch-time-prompt shape.** `agent/agents/spec-designer.md:1-10` contains only frontmatter, with no `model:`, no `maxSubagentDepth`, `thinking: xhigh`, `session-mode: lineage-only`, `auto-exit: false`, `spawning: false`, `system-prompt: append`, and no body after the closing delimiter.
- **Procedure/orchestrator separation is clean.** `agent/skills/define-spec/SKILL.md:8` frames the skill as orchestration only, while `agent/skills/define-spec/procedure.md:1-160` holds input-shape detection, codebase survey, Q&A, architecture round, self-review, spec writing, and completion signaling.
- **Dispatch preserves the intended model/CLI routing.** `agent/skills/define-spec/SKILL.md:64-93` reads `model-tiers.json`, derives `model` from `capable`, derives `cli` from `dispatch.<provider>`, avoids `skills:`, and sends the canonical procedure through `systemPrompt:`.
- **Subagent failure handling is explicit and conservative.** `agent/skills/define-spec/SKILL.md:105-130` rejects nonzero exits, missing completion lines, and missing reported files before the commit gate; `agent/skills/define-spec/SKILL.md:132-173` keeps review, commit, rejection recovery, and `generate-plan` continuation in the orchestrator.
- **Frontmatter normalization is complete.** Static checks on the head revision show zero `maxSubagentDepth` matches under `agent/agents/`, `session-mode: lineage-only` on all seven agent files, and `thinking: xhigh` on both `agent/agents/planner.md:6` and `agent/agents/spec-designer.md:5`.
- **`## Approach` now flows downstream.** `agent/agents/planner.md:50-73` makes a present `## Approach` section constrain architecture and file structure, and `agent/agents/plan-reviewer.md:50-59` requires deviations to be reported as Warnings.

## Issues

### Critical (Must Fix)

None found.

### Important (Should Fix)

None found.

### Minor (Nice to Have)

None found.

## Recommendations

- Run the acceptance-criteria smoke tests in a real mux environment before relying on the workflow operationally, especially todo input with scout brief, inline override, rejected-draft redo, pane closure, and `## Approach` propagation through `generate-plan`.
- Keep the mux-probe instructions in `agent/skills/define-spec/SKILL.md:16-27` in sync with future `pi-interactive-subagent` backend-selection changes; the current implementation intentionally mirrors the documented runtime contract.

## Assessment

**Ready to merge: Yes**

**Reasoning:** The diff satisfies the reviewed spec and addresses all v2 findings without introducing new blocking issues. Remaining validation is interactive smoke-test coverage rather than a code/design defect found in this review.
