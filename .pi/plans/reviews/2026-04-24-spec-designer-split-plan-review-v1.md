# Plan Review — `2026-04-24-spec-designer-split.md`

## Strengths

- The plan maps most spec requirements to concrete tasks cleanly: frontmatter normalization, new `spec-designer`/`procedure.md` artifacts, orchestrator rewrite, downstream `planner`/`plan-reviewer` changes, and manual smoke tests all have explicit homes.
- Task ordering is mostly sensible. The dependency graph keeps shared-file edits serialized and leaves end-to-end verification until after the structural work lands.
- The plan is unusually specific about artifact shapes and acceptance checks, which should reduce worker guesswork during execution.

## Findings

### Error — Task 3 / Task 5: the procedure will not actually reach `spec-designer`

**What:** The plan's core design is "dispatch `spec-designer` with `systemPrompt: <procedure body>` while also giving `spec-designer.md` a non-empty body." In `pi-interactive-subagent`, those two choices conflict.

**Why it matters:** The referenced runtime resolves child identity as `agentDefs?.body ?? params.systemPrompt ?? null` and only treats that identity as a real system prompt when the agent frontmatter sets a `system-prompt` mode (`../pi-interactive-subagent/pi-extension/subagents/launch-spec.ts:498,542-544`). As written, Task 3 creates a `spec-designer` agent with a body but no `system-prompt: append|replace`, and Task 5 relies on per-call `systemPrompt:` delivery. That means the child will get the short agent body, not `procedure.md`, so the main workflow cannot run.

**Where:** Task 3 exact file content; Task 5 Step 1 / Step 4 acceptance around `systemPrompt:` delivery.

### Error — Task 5: dispatch-time model resolution is underspecified and the documented call omits the model entirely

**What:** The plan says to resolve only the `cli` from `model-tiers.json` and explicitly says "Do NOT pass `model:`." The spec, however, requires `spec-designer` to run at dispatch-resolved capable tier, and the runtime only derives the effective model from `params.model ?? agentDefs?.model` (`../pi-interactive-subagent/pi-extension/subagents/launch-spec.ts:498`).

**Why it matters:** `spec-designer.md` intentionally has no `model:` field, so omitting per-call `model:` leaves the subagent with no resolved capable model at all. Best case it falls back to whatever ambient default the CLI chooses; worst case cross-CLI parity and the Opus-tier requirement in the spec are lost. Either way, the plan's primary dispatch path does not satisfy the intended contract.

**Where:** Task 3 exact frontmatter (no `model:`); Task 5 Step 3a notes; architecture summary / file-structure prose that claims dispatch-time resolution via `model-tiers.json`.

### Error — Task 5: the documented `subagent_run_serial` payload is not valid for the referenced orchestration API

**What:** The Task 5 code block places `wait: true` inside the individual task object.

**Why it matters:** In the referenced codebase, `wait` is a top-level orchestration option, not a per-task field (`../pi-interactive-subagent/README.md:245-257`). The task schema accepts `agent`, `task`, `name`, `cli`, `model`, `thinking`, `systemPrompt`, `skills`, `tools`, `cwd`, `fork`, `resumeSessionId`, and `focus` — not `wait` (`../pi-interactive-subagent/pi-extension/orchestration/types.ts:9-38`). A worker implementing the plan literally will document or attempt an invalid call shape.

**Where:** Task 5 Step 1 dispatch block; Task 5 acceptance criteria repeating that shape.

### Error — Task 5: two verification recipes are self-contradictory and will fail against the exact content the task asks to write

**What:** Task 5 requires the rewritten skill text to include negative explanatory prose about `skills:` and about not reading the spec body, but its verification commands then demand zero matches for those same strings.

**Why it matters:** Specifically:
- the inserted orchestrator text explicitly says "Do NOT pass a `skills:` parameter", while Step 4/acceptance later expect `rg -n "skills:" agent/skills/define-spec/SKILL.md` to return zero matches;
- the inserted text also says `The orchestrator does **not** read the spec file into its own context`, while Step 6 expects `rg -ni "read the spec file|read .* spec content|inline the spec" ...` to return zero matches.

Those checks will fail even if the file matches the plan exactly.

**Where:** Task 5 Step 1 body text, Step 4 verification, Step 6 verification, and the corresponding acceptance bullets.

### Error — Task 8 does not cover the spec's explicit execute-plan regression requirement

**What:** The spec's Acceptance Criterion 10 requires that existing `generate-plan`, `plan-review`, **and execute-plan** flows remain unaffected after the frontmatter migration. The plan's regression coverage stops at define-spec/generate-plan/plan-review.

**Why it matters:** Tasks 1 and 7 change the frontmatter of `coder`, `code-reviewer`, `code-refiner`, and `verifier`, which are directly used by execution/refinement workflows. Without any execute-plan or refine-code regression check, the plan leaves a stated acceptance criterion uncovered.

**Where:** Task 8 covers define-spec smoke tests and downstream planning behavior, but includes no execute-plan/refinement regression pass.

### Warning — Task 4's procedure requires "recent commits relevant to the input" even though `spec-designer` is intentionally denied `bash`

**What:** The exact `procedure.md` content tells the procedure runner to survey recent commits, while Task 3 constrains `spec-designer` to `read, write, grep, find, ls` only.

**Why it matters:** In the referenced repo, the practical way to inspect commit history is via shell/git, which this agent explicitly cannot use. That leaves the procedure with a stated mandatory step that the mux branch cannot actually perform with its allowed tools. This is fixable, but as written it weakens buildability and may force the implementer either to violate the documented tool surface or to ship a procedure the agent cannot follow literally.

**Where:** Task 3 tool surface; Task 4 Step 2 general-survey text.

## Verdict

The plan is thoughtfully structured, but the main `spec-designer` dispatch path is currently not executable in the referenced `pi-interactive-subagent` runtime, and Task 5 also contains validation commands that contradict the exact content it asks the worker to write. I would not start execution until those issues are corrected.

**[Issues Found]**
