# Code Review: spec-designer split

Reviewed range: 5ca56f47400e66993b5219fb07aa509cbca1008c..ad5729495a56df0d5e74da5a3297f8098ccd347b
Spec: .pi/specs/2026-04-24-spec-designer-split.md

## Strengths

- `agent/agents/spec-designer.md` has the requested frontmatter-only shape: no `model:`, no `maxSubagentDepth`, `thinking: xhigh`, `session-mode: lineage-only`, `auto-exit: false`, `spawning: false`, `system-prompt: append`, and no body after the closing delimiter.
- The procedure is now in one canonical non-skill file, `agent/skills/define-spec/procedure.md`, with no discoverable skill frontmatter.
- Frontmatter normalization is broadly complete: `maxSubagentDepth` is absent from `agent/agents/`, all 7 agents have `session-mode: lineage-only`, and `planner.md` / `spec-designer.md` both use `thinking: xhigh`.
- Downstream `## Approach` handling was added to both planner and plan-reviewer prompts, including edit-pass coverage in the planner and Warning-level deviations in the reviewer.
- The revised define-spec orchestrator keeps todo/spec/freeform input resolution, codebase survey, Q&A, and spec template out of the orchestrator body and delegates them to `procedure.md`.
- Verification: after provisioning dependencies in the detached review worktree by symlinking `agent/node_modules` from the main checkout, `npm test` passed: 119 tests, 119 pass.

## Spec / Code Conflicts

1. **Inline branch completion semantics conflict with the spec's commit-gate policy.**  
   References: `agent/skills/define-spec/SKILL.md:101-107`, `agent/skills/define-spec/procedure.md:140-150`.  
   The orchestrator says the inline branch executes procedure Steps 1-9, then jumps to the user-review / commit gate. But procedure Step 9 tells the runner to emit `SPEC_WRITTEN: <absolute path>` as the last output and then exit. If followed literally on the inline branch, the orchestrator exits before the required review-and-commit pause. This also conflicts with R9's statement that the inline branch has no equivalent subagent `SPEC_WRITTEN` boundary.  
   **Recommendation:** Spec stronger. Change the prompts so the inline branch records the path and returns to orchestrator Step 5 without emitting/exiting, while the mux/subagent branch emits `SPEC_WRITTEN:`.

2. **Nonzero subagent exits can be reported as missing `SPEC_WRITTEN` instead of reporting exit code/error.**  
   Reference: `agent/skills/define-spec/SKILL.md:119-132`.  
   R9 requires `exitCode != 0` to report the exit code, error, and transcript path. The implemented validation order checks for a missing `SPEC_WRITTEN:` line first and stops, so a failed subagent that exits nonzero and emits no completion line will omit the exit code/error details.  
   **Recommendation:** Spec stronger. Check `exitCode != 0` first, or include exit code/error in the missing-completion report when the exit code is nonzero.

3. **`define-spec` is not substantially smaller than the previous skill body.**  
   Reference: `agent/skills/define-spec/SKILL.md:8` and file size: 187 lines at head vs 124 lines at base.  
   R1 / Acceptance Criterion 1 says `SKILL.md` should shrink substantially and contain only orchestration / dispatch / pause / commit-gate logic. The implementation does remove Q&A and the spec template, but the orchestrator prompt grows overall because it embeds a detailed mux-detection algorithm and failure policy.  
   **Recommendation:** Spec stronger, unless the team intentionally accepts the added prompt weight for precise runtime alignment. If keeping the detailed probe prose is desired, update the spec/acceptance criterion; otherwise move detailed reference material out of the active orchestrator prompt or compress it.

4. **Todo resolution uses direct `.pi/todos/` file reads as a fallback rather than strictly resolving via the `todo` tool.**  
   Reference: `agent/skills/define-spec/procedure.md:13`.  
   R4 says Todo ID input should resolve via the `todo` tool. The procedure says to use the `todo` tool only if available, otherwise read `.pi/todos/<id>.md` directly. Since `spec-designer.md` intentionally exposes only `read, write, grep, find, ls`, the subagent will normally take the direct-file path.  
   **Recommendation:** Code stronger / spec should be clarified. The implementation reconciles R4 with R1's narrow tool surface, but it should be explicitly documented in the spec or the tool surface should include `todo` if strict tool-based resolution is required.

## Issues

### Critical (Must Fix)

None.

### Important (Should Fix)

1. **Inline runs may skip the review/commit gate because the shared procedure says to exit.**  
   References: `agent/skills/define-spec/SKILL.md:101-107`, `agent/skills/define-spec/procedure.md:140-150`.  
   This is the highest-risk issue because the inline branch is the fallback for no mux and for explicit `--no-subagent` / `inline` overrides. The procedure's final instruction is appropriate for a subagent boundary but unsafe when the orchestrator is the procedure runner. It can prevent R8's required pause (`Spec written to ... Review it...`) and the subsequent commit / generate-plan handoff from running.

2. **Failure reporting can hide nonzero subagent exits.**  
   Reference: `agent/skills/define-spec/SKILL.md:119-132`.  
   The strict failure policy is meant to give the user actionable diagnostics. Reporting only “missing `SPEC_WRITTEN`” for a nonzero process loses the exit code and error text that R9 requires and makes dispatch failures harder to diagnose.

### Minor (Nice to Have)

1. **The orchestrator prompt is heavier than the spec's “thin orchestrator” target.**  
   Reference: `agent/skills/define-spec/SKILL.md:8`.  
   The added mux-detection detail is useful, but the line count and prompt weight moved in the opposite direction from the acceptance criterion. Consider compressing it once the algorithm is stable.

2. **Todo-file fallback should be explicitly reconciled with the spec.**  
   Reference: `agent/skills/define-spec/procedure.md:13`.  
   Direct file reads are probably the practical choice for the narrow `spec-designer` tool surface, but the contract should not simultaneously say “resolve via `todo` tool” and omit that tool from the agent.

## Recommendations

- Fix the inline branch by separating “subagent completion line” from “inline procedure return.” A minimal prompt fix is: in `SKILL.md` Step 3b, explicitly override procedure Step 9 for inline mode (“do not emit `SPEC_WRITTEN:` or exit; record the absolute path and continue to Step 5”), and in `procedure.md` Step 9, state that the completion line is for subagent/mux runs only when the procedure is executed behind a dispatch boundary.
- Reorder mux-branch failure validation so nonzero exits are surfaced before missing-completion-line handling, or make the missing-completion case include exit metadata when present.
- Decide whether the larger orchestrator prompt is acceptable. If yes, update the spec/acceptance criteria; if no, trim the mux-detection prose or move detailed runtime-alignment notes to a separate reference file.
- Clarify the Todo ID contract: either add `todo` to `spec-designer`'s tool surface and require it, or update the requirement to allow direct `.pi/todos/<id>.md` reads because the agent intentionally has a narrow tool surface.

## Verification

Commands run in detached worktree `/tmp/pi-config-review-ad572` at `ad5729495a56df0d5e74da5a3297f8098ccd347b`:

- `grep -R "maxSubagentDepth" agent/agents/` → zero matches.
- `grep -l "session-mode: lineage-only" agent/agents/*.md` → all 7 agent files.
- `grep "thinking:" agent/agents/planner.md agent/agents/spec-designer.md` → both `xhigh`.
- Parsed `agent/agents/spec-designer.md` → exactly two frontmatter delimiters and zero body content after the closing delimiter.
- Parsed `agent/skills/define-spec/procedure.md` → does not start with frontmatter and has no `name:` / `description:` skill frontmatter.
- `npm test` initially failed in the detached worktree because `node_modules` was absent, causing `ERR_MODULE_NOT_FOUND` for `@mariozechner/pi-coding-agent` / `@mariozechner/pi-tui`.
- After symlinking `/Users/david/Code/pi-config/agent/node_modules` into the detached worktree's `agent/node_modules`, `npm test` passed: 119 tests, 119 pass, 0 fail.

## Assessment

Ready to merge: With fixes

Reasoning: The implementation covers most of the requested structural changes and passes the existing test suite once dependencies are available. However, the inline branch has a prompt-level control-flow conflict that can prevent the required review/commit gate from running, and mux-branch failure handling can omit required diagnostics for nonzero exits. Those should be corrected before merging.
