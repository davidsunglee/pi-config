# pi-config workflow: pros, cons, and prioritized suggestions

Date: 2026-05-12
Scope: the artifact-driven development workflow in this repo, and the orchestration primitives it depends on in `../pi-interactive-subagent`.

## What this analysis is looking at

`pi-config` is an artifact-driven workflow layered on top of stock pi, with `pi-interactive-subagent` providing the orchestration primitives (`subagent_run_serial` / `_parallel`, mux-pane and headless backends, fresh-context children, marker-based completion).

Shape:

- 16 skills, ~3,272 lines total under `agent/skills/`.
- 10 fresh-context subagent definitions (~1,000 lines) under `agent/agents/`.
- ~16 Python helpers under `agent/skills/_shared/scripts/` (plus per-skill `scripts/`).
- `execute-plan/SKILL.md` (558 lines) and `fast-lane/SKILL.md` (427 lines) are the two heaviest skill prompts.
- Orchestration code (`pi-extension/orchestration/`) is ~1,650 lines of TS across registry, run-serial, run-parallel, types, and tool-handlers.

## Pros

1. **The scaling spectrum is real, not aspirational.** `define-spec` ends with an explicit `(f) fast / (d) deep / (x) stop` menu, and `fast-lane` *explicitly drops* worktree creation, verifier dispatch, baseline reconciliation, and auto-push while keeping spec discipline and `refine-code`. Most "scalable" AI workflows collapse to one heavy path; this one actually has a light tier.
2. **Artifact-driven handoffs hold up under fresh-context children.** Specs/plans/briefs/reviews/test-runs are durable, reviewable, and live in git. Combined with `session-mode: lineage-only` on the 10 subagents and marker-anchored handoffs (`SPEC_ARTIFACT:`, `PLAN_ARTIFACT:`, `VERDICT:`, `FAILING_IDENTIFIERS:`), workers run independently and resume-ably. This is the single biggest reason the deep workflow can fan out 8 coders in a wave without context contamination.
3. **The orchestrator/verifier boundary is doctrine, not vibes.** `orchestrator-verification-boundary.md` plus the prose in `execute-plan` Steps 9 and 11 explicitly forbid the orchestrating session from running tests, grepping for criteria, or making PASS/FAIL judgments — those go to `verifier` and `test-runner`. This blocks the common failure mode where an LLM grades its own work in-session.
4. **Protocol parsing is externalized.** `parse-artifact-handoff.py`, `parse-coder-report.py`, `parse-test-runner-artifact.py`, `reconcile-test-run.py`, `extract-plan-tasks.py` — skills run helpers and route on stdout/JSON rather than asking the LLM to parse its own freeform output. Hugely more reliable, and unit-testable (`npm run test:helpers`).
5. **Baseline-aware integration gate.** The frozen `baseline_failures` set plus stable-identifier reconciliation in `integration-regression-gate.md` correctly separates pre-existing failures from regressions introduced by the wave. Often missing in similar systems.
6. **Centralized model-tier resolution.** `model-tiers.json` plus `resolve-model-dispatch.py` keep skill prompts decoupled from concrete model IDs and routing CLIs; provider swaps are a single-file change.
7. **Tool restriction at the agent level.** `planner` has no `bash`, `verifier` has `spawning: false`, and so on. Children can't escape their role. Combined with `auto-exit: true` and `subagent_done()` discipline, terminal states are clean.
8. **`receiving-code-review` is a rare discipline skill.** Counteracts the "performatively agree with the reviewer" failure mode. Underappreciated.

## Cons

1. **Skill prompts are massive.** `execute-plan` is 558 lines, `fast-lane` 427, `planner.md` (an agent prompt!) 263. Per-dispatch token cost is high, the operating procedure is hard to skim, and a lot of body text is protocol *contracts* (baseline-failures.json schema, `Verify:` recipe rules) that belongs in helper docstrings, not the skill prose.
2. **Byte-equal coupling is fragile.** Skills say "match `cmux.ts` byte-equal", "static inspection of `../pi-interactive-subagent` confirms this is supported", "render byte-equal to spec". This is unenforced coupling across two repos. Upstream rebases of `pi-extension/subagents/` can silently break callers.
3. **In-memory orchestration registry is a single point of failure.** Per `pi-interactive-subagent` README: "Registry state is in-process only — a pi crash kills live async runs silently. No disk persistence of registry / ownership map." For a deep run with 5+ waves of parallel coders + verifiers + test-runner, this is a real loss risk.
4. **No end-to-end CI of the workflow.** Python helper unit tests and TS extension tests exist; nothing exercises the full `define-spec → generate-plan → refine-plan → execute-plan → refine-code` chain. Drift between a skill prompt and an updated tool schema (e.g., `subagent_run_serial` task fields) will be caught only by a user running the workflow.
5. **Workflow-recommendation logic is now LLM judgment.** `define-spec` Step 8 retired the heuristic helper in favor of "read the spec and decide", and the README explicitly calls out a "worked regression example" where the old heuristic mis-routed. The new model has no regression target — easy to get worse without noticing.
6. **The smallest path is still spec-first.** No "micro-lane" for one-line fixes; the floor is `define-spec → fast-lane`. The 16-skill / 10-agent taxonomy is heavy for trivial work.
7. **Dual interactivity model for `spec-designer` is inconsistent.** That subagent runs in a multiplexer pane and takes user Q&A directly, while every other subagent is a batch fresh-context worker. The contract differs (mux probe, inline fallback, missing-marker recovery), and the difference is buried in `detect-mux-backend.py` rules.
8. **Empty `docs/` skeleton.** `specs/`, `plans/`, `reviews/`, `test-runs/` exist but most are clean. A first-time reader can't tell whether the workflow is unused, broken, or just cleaned up after success exits.
9. **No retry-budget surfacing.** `execute-plan` Step 13 references per-task budgets, but the wave-gate menus don't show "you have N retries left". Easy to loop on BLOCKED indefinitely.
10. **Workflow state is not observable in one place.** With 16 skills, 10 agents, 6 artifact directories, and 4 active orchestration tools, a new contributor (or you, three weeks later) has no single command that prints "where am I in the workflow, which spec maps to which plan, which reviews exist, what's running".
11. **v1 capability gaps leak into prompts.** The fast-lane SKILL documents inline that the per-call `thinking:` override works because someone read the subagent source. `caller_ping` / `blocked` is pi-CLI-only. `skills:` aren't forwarded on Claude CLI. These are documented v1 limitations but skill prompts carry the workarounds inline.

## Prioritized suggestions

### P0 — biggest leverage

1. **Add `/status` (workflow-state dashboard).** One command that scans `docs/specs/`, `docs/plans/`, `docs/reviews/`, `docs/test-runs/`, todos, current branch, and any in-flight orchestrations and prints a one-page picture. Reduces the cognitive cost of tracking 26 named entities by hand. Cheap to build, paid back on every session.
2. **Compress skill bodies; push protocol details into helpers.** Every long contract section in `execute-plan` and `fast-lane` (baseline-failures.json shape, test-runner artifact format, recipe-classification rules) should live in helper module docstrings or `_shared/*-protocol.md`, leaving the skill text to describe *flow*, not *schemas*. Target: cut top-two skills by ~40%.
3. **Wire one end-to-end smoke test into CI.** Tiny scratch repo + a fixture todo + a mock test command. Drive `define-spec → fast-lane` and `define-spec → generate-plan → execute-plan → refine-code` headlessly. This catches drift between skill prompts, helper invocations, marker contracts, and `subagent_run_serial` / `_parallel` schemas — none of which today's unit tests touch.

### P1 — high impact, moderate effort

4. **Persist async orchestration state.** Have `pi-interactive-subagent` write registry state under `~/.pi/agent/orchestrations/<id>.json` on every transition; expose `/resume <id>`. Reduces deep-workflow risk and is a known follow-up upstream anyway.
5. **Replace inline tool-call JSON shapes in skills with a dispatch helper.** Instead of skill prose containing `subagent_run_serial { tasks: [...], wait: true }` (an unenforced contract with the runtime), have skills call `python3 _shared/scripts/dispatch-coder.py --task-file ... --model ... --cli ...` that prints the orchestration result. The helper owns the schema; skill prose can't drift.
6. **Re-introduce a deterministic baseline for the fast/deep recommendation.** Combine cheap structural signals (file count in `## File Structure`, surveyed-files breadth, requirement count, `## Approach` presence) into a default recommendation; let the LLM override with an explicit justification. Now you have a regression-testable target and the LLM still has the final word.
7. **Convert the orchestrator/verifier boundary from prose into a runtime check.** Add a guardrail (you already have `agent/extensions/guardrails.ts`) that warns or blocks if the orchestrator session runs the project test command or greps verifier-visible files between dispatch and `verifier` return. Today's enforcement is "the prompt says MUST NOT".

### P2 — refinement

8. **Add a "micro-lane" tier below `fast-lane`.** For typos, comment fixes, one-liners: skip the spec, run one coder + `verification-before-completion`, commit. Today's floor (`define-spec → fast-lane`) is overkill at the bottom.
9. **Surface retry budgets in wave-gate menus.** "Task 4 BLOCKED — interventions left: 2/3 retries, 1/2 splits." Prevents accidental infinite loops on the user side.
10. **Ship a skill linter.** Python script under `_shared/scripts/` that walks `agent/skills/*/SKILL.md`, checks helper paths exist, marker tokens are consistent, placeholder names match a registry, cross-references resolve. Run in CI.
11. **Reduce probe coupling.** Replace the byte-equal `detect-mux-backend.py` ↔ `cmux.ts` discipline by exporting a single probe from `pi-interactive-subagent` (for example, `pi subagent-probe --json`) that `pi-config` invokes. One source of truth.

### P3 — polish

12. **Call out the `spec-designer` interactivity exception explicitly** in `AGENTS.md` so first-time readers don't assume the same lineage-only contract as the other 9 subagents.
13. **Lazy-create `docs/` subdirectories on first use** (or add `.gitkeep`s with a one-line "what lives here" note) so the tree isn't confusingly empty.
14. **Add a data-dependency diagram to the README** complementing today's decision flowchart: every skill → every artifact type → every subagent that reads it. Helps onboarding.

## Bottom line

This is an unusually disciplined workflow with two things most AI-workflow setups lack: a real light-vs-heavy tiering decision *after* the spec, and a strict orchestrator/verifier boundary that prevents self-grading. The dominant cost is prompt bulk and cross-repo coupling: skill bodies are doing too much, and a lot of "MUST" prose is unenforced. The P0 trio (status, compress, end-to-end smoke test) would buy back most of the maintenance friction without changing the architecture.
