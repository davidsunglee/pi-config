# GPT-5.4 Full Code Review

- **Reviewer model:** `openai-codex/gpt-5.4`
- **Dispatch:** `pi`
- **Worktree:** `/Users/david/Code/pi-config/.worktrees/execute-plan-verification-and-failure-hardening`
- **Git range:** `5f29dc9e7c51d48246752ac11ee00df0058b22f1..f46e4ee923e8e98cbbc61352496b27a0887cb0d7`
- **Plan artifact:** `.pi/plans/2026-04-18-execute-plan-verification-and-failure-hardening.md`

### Strengths
- The generate-plan side is much tighter: `agent/agents/planner.md`, `agent/skills/generate-plan/review-plan-prompt.md`, and `edit-plan-prompt.md` now consistently enforce per-criterion `Verify:` recipes instead of treating them as optional guidance.
- The execute-plan workflow is substantially clearer around failure handling. In `agent/skills/execute-plan/SKILL.md`, Step 10’s binary verifier contract, Step 11’s three-set regression tracking, and Step 12’s removal of the skip path all move the workflow toward fail-closed behavior instead of silent success.
- Typed `DONE_WITH_CONCERNS` handling is well-designed overall: `agent/agents/coder.md` and `agent/skills/execute-plan/execute-task-prompt.md` now give workers a concrete protocol, which is a real improvement over the old free-form concerns.
- The verifier/report format is explicit and parser-friendly. Locking Step 10 to `[Criterion N] <PASS | FAIL>` plus a final `VERDICT:` line is a good production-hardening move.

### Issues

#### Critical (Must Fix)

**1. `verifier` is configured with invalid tool names, so the new fresh-context verification path is likely non-functional for file/prose checks.**  
- **File:** `agent/agents/verifier.md:4-11`
- **What's wrong:** The frontmatter declares `tools: Read, Grep, Glob`, and the body instructs the agent to use `Read`, `Grep`, and `Glob`. Everywhere else in this repo and in the subagent examples, tool IDs are lowercase (`read, grep, find, ls`). `Glob` also does not match the required `find`/`ls` contract from the plan artifact.
- **Why it matters:** Step 10 now depends on this agent for all fresh-context verification. If the tool names do not resolve exactly, the verifier may launch without the file-inspection tools it needs, which breaks verification for any non-command `Verify:` recipe.
- **How to fix:** Change the verifier to use the supported lowercase tool IDs consistently, e.g. `tools: read, grep, find, ls`, and update the body text to refer to those same tools.

#### Important (Should Fix)

**2. The wave-level concerns checkpoint dropped the per-task modified-file list required by the plan.**  
- **File:** `agent/skills/execute-plan/SKILL.md:523-549`
- **What's wrong:** Step 9.7’s combined view shows typed concerns, but it never says to include the files each concerned task modified.
- **Why it matters:** The user is supposed to make acknowledge/remediate/stop decisions at this checkpoint. Without seeing the affected files, they lose important context about blast radius and can’t reliably judge whether an observation is harmless or whether a correctness/scope concern needs immediate remediation.
- **How to fix:** Carry the task’s modified files into `CONCERNED_TASKS` and render them in each per-task block of the combined view.

**3. Re-dispatching a concerned task does not require passing the original typed concerns back to the coder.**  
- **File:** `agent/skills/execute-plan/SKILL.md:555-575`
- **What's wrong:** The `(r)` path says to re-dispatch “with guidance,” but it never requires appending the actual `Type:` concern lines that triggered the checkpoint.
- **Why it matters:** A remediation attempt can be launched without the worker seeing the concrete correctness/scope/observation issues it is supposed to address. That makes rework under-specified and increases the chance of loops or false progress.
- **How to fix:** On every Step 9.7 re-dispatch, append a structured `## Concerns To Address` block containing every original typed concern verbatim.

**4. The stop/resume guidance contradicts the plan’s non-persistence model and can resurrect stale deferred regressions.**  
- **File:** `agent/skills/execute-plan/SKILL.md:822-832`
- **What's wrong:** Step 13 says a resumed session should manually reconstruct `deferred_integration_regressions` from the partial-progress report. The plan artifact explicitly said persistence/restoration is out of scope and that a resumed run must re-run integration tests to determine the current failure set.
- **Why it matters:** Reconstructing from an old report can keep already-cleared regressions in the deferred set and incorrectly block Step 15, or otherwise misclassify the current state after further code changes.
- **How to fix:** Replace this note with guidance to re-run the integration suite on resume and re-derive the current failing/deferred state fresh, rather than restoring it from the old stop summary.

#### Minor (Nice to Have)

**5. Step 10 no longer states that verifier dispatches run in parallel, so the execution semantics are underspecified.**  
- **File:** `agent/skills/execute-plan/SKILL.md:613-628`
- **What's wrong:** The section says to dispatch one verifier per task, but it omits the plan requirement that all wave verifications run in parallel subject to `MAX_PARALLEL_TASKS`.
- **Why it matters:** An implementation following the text literally could verify sequentially, which weakens the scalability/performance contract of the wave model.
- **How to fix:** Add an explicit instruction to dispatch verifier subagents in parallel, bounded by `MAX_PARALLEL_TASKS`.

### Recommendations
- Add a small smoke-test layer for these parser-sensitive artifacts:
  - validate agent frontmatter tool names,
  - validate Step 10/verifier prompt/report-shape consistency,
  - validate that Step 9.7 remediation prompts include typed concerns.
- Tighten the README wording around the new flow; the changed bullets describe the direction correctly, but they still blur some checkpoint semantics.

### Assessment

**Ready to merge: No**

**Reasoning:** The hardening direction is good and most of the workflow contract is stronger than before, but the new verifier agent is misconfigured at the tool level and two core execute-plan behaviors (concern remediation context and deferred-regression resume semantics) still diverge from the plan in ways that can break the workflow.
