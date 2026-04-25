# Plan Review — `2026-04-24-spec-designer-split.md` v3

## Strengths

- The two findings from the previous review have been addressed: Task 5 no longer has the contradictory line-count acceptance check, and Task 8 Step 3 now correctly reaches the recovery menu by rejecting at the review pause before choosing Redo.
- The plan continues to cover the core runtime constraints well: `spec-designer.md` is frontmatter-only, `system-prompt: append` is present, `wait: true` is top-level on `subagent_run_serial`, and the mux dispatch passes explicit `model` / `cli` values rather than relying on `spec-designer` frontmatter.
- The procedure body in Task 4 maps closely to the spec's required sequence, including input-shape detection, codebase-grounded Q&A, architecture-need assessment, conditional `## Approach`, self-review, and the terminal `SPEC_WRITTEN:` line.
- Downstream coverage is broad: planner and plan-reviewer contract changes are separate tasks, and Task 8 now exercises define-spec, generate-plan, cross-CLI behavior, and execute-plan regression.

## Findings

### Error — Task 1's global `maxSubagentDepth` verification conflicts with Task 2

**Where:** Task 1 Step 7 and Task 1 Acceptance Criteria; Task 2 Step 1.

**What:** Task 1 explicitly leaves `agent/agents/planner.md` body unchanged, but its verification requires:

```bash
rg -n "maxSubagentDepth" agent/agents/
```

with zero matches. Task 2 immediately says the only surviving match after Task 1 may be the planner body's verification-recipe example and then replaces it.

**Why it matters:** If the planner body contains the example the spec calls out, Task 1 cannot pass as written. This blocks execution before the task that is supposed to remove the remaining body reference runs.

**Recommended plan edit:** In Task 1, verify only the frontmatter field removal, for example `rg -n "^maxSubagentDepth:" agent/agents/` with zero matches, or otherwise scope the check to the top frontmatter blocks. Move the global `rg -n "maxSubagentDepth" agent/agents/` zero-match gate to Task 2 after the planner-body example has been rewritten.

### Error — Task 2 and Task 6 can run concurrently while both modify `agent/agents/planner.md`

**Where:** Dependencies section.

**What:** The dependency list says Task 2 depends on Task 1 and Task 6 depends on Task 1. That permits Task 2 and Task 6 to be in the same post-Task-1 execution wave, but both edit the planner body:

- Task 2 rewrites the verification-recipe example in `agent/agents/planner.md`.
- Task 6 inserts the new `## Approach handling` subsection in `agent/agents/planner.md`.

**Why it matters:** `execute-plan` dispatches independent tasks in parallel. Two coders editing and committing the same file concurrently can produce merge friction, lost changes, or a failed commit/rebase even if the logical edits are in different sections.

**Recommended plan edit:** Serialize the shared-file edits by adding `Task 6 depends on: Task 2` (or the reverse) and update the visual dependency graph accordingly. Task 6 is the more natural dependent because Task 2 completes the `maxSubagentDepth` cleanup before the later planner-body feature addition.

### Error — Task 5 omits the spec-required clean failure path for `model-tiers.json`

**Where:** Spec R2; Task 5 Step 3a and Task 5 Edge cases / Acceptance criteria.

**What:** The spec requires the mux branch to fail cleanly if `~/.pi/agent/model-tiers.json` cannot be read or does not provide a usable `capable` model plus matching `dispatch.<provider>` mapping. Task 5 says to resolve `model` and `cli` from `model-tiers.json`, but it does not specify the failure behavior or add an acceptance check for this case.

**Why it matters:** This is a required failure-handling branch, not just an implementation detail. Without an explicit stop condition, an implementer may fall back to the CLI default or dispatch without `model` / `cli`, losing the Opus-tier / Claude-CLI route that motivates the split.

**Recommended plan edit:** Add a Task 5 substep before dispatch: read `model-tiers.json`, validate `capable`, derive the provider prefix from `<provider>/<model>`, validate `dispatch.<provider>`, and on any failure report a clear message and stop without dispatching or committing. Add an acceptance check that this failure path is documented in the orchestrator's edge cases.

### Warning — Task 5's mux probe does not match the runtime's mux detection

**Where:** Task 5 Step 1a, Task 5 mux-probe verification, Risk Assessment.

**What:** The plan's probe checks `$WEZTERM_PANE`, `$ZELLIJ`, and any `CMUX_*` variable. The related `pi-interactive-subagent` runtime detects pane availability through stricter checks in `../pi-interactive-subagent/pi-extension/subagents/cmux.ts`: `CMUX_SOCKET_PATH` plus `cmux`, `TMUX` plus `tmux`, `ZELLIJ` or `ZELLIJ_SESSION_NAME` plus `zellij`, and `WEZTERM_UNIX_SOCKET` plus `wezterm`. Backend selection is then made by `selectBackend()` in `../pi-interactive-subagent/pi-extension/subagents/backends/select.ts`.

**Why it matters:** The plan's Risk Assessment says false-positive mux probes will hard-fail at dispatch. In the actual runtime, if the orchestrator chooses the mux branch but `selectBackend()` does not see a real mux, `subagent_run_serial` may select the headless backend rather than hard-failing. That would launch an interactive `spec-designer` in a non-interactive backend, violating the core branch contract.

**Recommended plan edit:** Align the orchestrator probe with the runtime detection contract, including command availability and the actual env vars (`CMUX_SOCKET_PATH`, `ZELLIJ_SESSION_NAME`, `WEZTERM_UNIX_SOCKET`). Also update the risk text so false positives are described as either dispatch failures or possible headless-backend misroutes unless the probe is made runtime-equivalent.

### Warning — Task 8 Step 8 does not give an executable way to re-review the deliberately edited plan

**Where:** Task 8 Step 8.

**What:** After generating a plan from the `## Approach` spec, Step 8 says to deliberately edit the plan to introduce a deviation, then “Re-run `/generate-plan` (or its review step)” and confirm plan-reviewer flags a Warning.

**Why it matters:** Re-running `/generate-plan` against the spec can generate/review a fresh plan rather than the manually edited deviating plan, so it may not exercise the intended `plan-reviewer` path. “Or its review step” is not an actionable command for a tester following the plan literally.

**Recommended plan edit:** Spell out the exact verification path for the edited plan: either invoke the plan-reviewer subagent directly with the same spec and edited plan artifacts, or use a documented `generate-plan` review-only/edit-review entry point if one exists. The check should name the edited plan path and the expected review output path/version.

## Verdict

The plan is close and substantially improved over the previous review, but it still has two execution-blocking structural issues (Task 1's impossible grep gate and Task 2/Task 6 parallel edits to the same file) plus one missing required failure branch for `model-tiers.json`. Address those before execution.

**[Issues Found]**
