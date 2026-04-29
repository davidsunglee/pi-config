# Refiner Coordinator Hardening

Source: TODO-40eb6ea4

## Goal

Make it structurally impossible for `refine-code` and `refine-plan` to silently degrade to an "inline" review when their coordinator dispatch path is broken. The original failure mode — `code-refiner` improvising an inline `claude-sonnet-4-6` review when its coordinator session lacked `subagent_run_serial` — exposed three drift surfaces between the two refiner skills: divergent CLI guards, divergent dispatch fallback chains, and no positive provenance signal on persisted review files. This spec consolidates the coordinator-CLI resolution procedure into a single shared markdown reference, hard-stops both skills if no model tier resolves to a `pi` CLI, forbids inline-review fallback at both the prompt and agent-body layers, and requires every coordinator-persisted review file to carry a `**Reviewer:**` provenance line that the calling skill validates after the coordinator returns. Items 1 and 5 from the original todo (use `crossProvider.standard` for the coordinator dispatch; declare `subagent_run_serial` in `code-refiner` / `plan-refiner` `tools:`) are already landed and out of scope here.

## Context

Refiner skills today (post-`5d0825f`):

- `agent/skills/refine-code/SKILL.md` Step 4 dispatches `code-refiner` with `crossProvider.standard` and resolves `cli` from `model-tiers.json`'s `dispatch` map. Step 2 prose says "the coordinator must run through a CLI that exposes pi orchestration tools (currently `openai-codex` → `pi`)". There is no runtime guard that fails fast when the resolved `cli` is not `pi`. Edge Cases declares a two-tier fallback (`crossProvider.standard` → `crossProvider.capable`) and explicitly refuses top-level `capable` because it may route to a non-`pi` CLI.
- `agent/skills/refine-plan/SKILL.md` Step 8 dispatches `plan-refiner` with the same primary tier but declares a three-tier fallback (`crossProvider.standard` → `crossProvider.capable` → `capable`, re-resolving `cli` each time) and adds an Edge Case "Coordinator dispatch CLI is not `pi`: warn the user with the same wording used in `refine-code`" — but `refine-code` has no such wording, so the cross-reference is broken.
- `agent/skills/refine-code/refine-code-prompt.md` and `agent/skills/refine-plan/refine-plan-prompt.md` give the coordinator a dispatch-resolution algorithm for its own subagent calls (worker reviewer, worker remediator/edit-pass) but say nothing about what to do if the orchestration tool itself is unavailable. The original bug's coordinator improvised an inline review and stamped `**Reviewer:** inline (claude-sonnet-4-6)` into the file by hand; only an ad-hoc corrective prompt in a follow-up run blocked that path.
- `agent/agents/code-refiner.md` and `agent/agents/plan-refiner.md` declare `subagent_run_serial` in their `tools:` line (per `5d0825f`) but their `## Rules` sections do not forbid inline-review fallback as a standing identity rule.
- `agent/skills/requesting-code-review/review-code-prompt.md`'s Output Format does not request a `Reviewer:` field; review files have no positive provenance signal today. `code-refiner` writes the reviewer's `finalMessage` to disk verbatim; `plan-refiner` writes `plan-reviewer`'s output the same way.
- `~/.pi/agent/model-tiers.json` currently resolves `crossProvider.standard` and `crossProvider.capable` both to `openai-codex/gpt-5.5` (`cli=pi`); top-level `standard` and `capable` resolve to Anthropic models (`cli=claude`). The shape may change over time — the goal is a procedure that does not need to be revisited every time a tier moves between providers.
- The existing precedent for cross-skill markdown sharing is direct path-read: `refine-code/refine-code-prompt.md` instructs the coordinator to read `~/.pi/agent/skills/requesting-code-review/review-code-prompt.md`. There is no `agent/skills/_shared/` directory yet; this spec creates that convention.
- The constraint that workers (`code-reviewer`, `coder`, `plan-reviewer`, `planner` edit-pass) may run on any CLI — they do not dispatch their own subagents — is preserved. The `pi`-CLI requirement applies only to the coordinator hop.

## Requirements

### Shared coordinator-dispatch helper

- A new file `agent/skills/_shared/coordinator-dispatch.md` describes the coordinator-CLI resolution procedure as authoritative prose for any caller that dispatches a coordinator agent.
- The procedure iterates exactly these four tiers in order: `crossProvider.standard` → `standard` → `crossProvider.capable` → `capable`. Top-level `standard` and `capable` are included so the procedure does not need re-revisiting if those tiers change provider in the future.
- For each tier, the caller resolves the model string from `~/.pi/agent/model-tiers.json`, extracts the provider prefix, and looks up `dispatch[provider]`. If the resolved `cli` is not `pi`, the tier is skipped silently — no warning, no dispatch attempt. The "skip silently" semantics are required: warning on every non-pi tier would be noisy and would obscure the real failure case (no tier resolves to pi).
- For each tier whose resolved `cli` is `pi`, the caller attempts the coordinator dispatch with that model and `cli`. On dispatch failure (model unavailable, transport error, etc.), the caller advances to the next tier in the chain.
- If the chain is exhausted with **zero** tiers resolving to `pi`, the caller hard-stops with a clear error: `coordinator-dispatch: no model tier in [crossProvider.standard, standard, crossProvider.capable, capable] resolves to a pi CLI — coordinator cannot dispatch subagents.`
- If at least one tier resolved to `pi` but every dispatch attempt failed, the caller hard-stops with a clear error of the form `coordinator-dispatch: all pi-eligible tiers failed; last attempt: <model> via pi — <error>`.
- The shared file must be readable as a self-contained reference: it states the ordered tier list, the skip-silently rule for non-pi tiers, the two hard-stop conditions and their error messages, and a one-line note that callers must re-resolve `cli` for any subsequent worker subagent dispatches inside the coordinator (workers do not need `pi`).
- The shared file does not enumerate the worker dispatch logic — that stays in the coordinator prompts where it already lives.

### `refine-code` skill alignment

- `agent/skills/refine-code/SKILL.md` Step 2 (or its successor structure) replaces its inline dispatch-resolution prose with a reference to `agent/skills/_shared/coordinator-dispatch.md`. The reference is a one-line read-and-follow instruction; the four-tier chain and hard-stop semantics are not duplicated inline.
- `refine-code/SKILL.md` Step 4's `subagent_run_serial` invocation is rewritten so the model and `cli` come from the shared procedure's outcome, not from a single-tier resolution.
- The Edge Cases entry "Code-refiner fails to dispatch (model unavailable)" is rewritten to defer to the shared procedure's fallback semantics rather than declaring its own two-tier chain.

### `refine-plan` skill alignment

- `agent/skills/refine-plan/SKILL.md` Step 5 (or its successor structure) replaces its inline dispatch-resolution prose with the same reference to `agent/skills/_shared/coordinator-dispatch.md`.
- Step 8's `subagent_run_serial` invocation is rewritten in the same shape as `refine-code/SKILL.md` Step 4.
- The Edge Cases entry "Coordinator dispatch CLI is not `pi`" is rewritten to point at the shared procedure's hard-stop semantics. The broken cross-reference to `refine-code` ("with the same wording used in `refine-code`") is replaced with the shared file as the single authority.

### Inline-review hardening — coordinator prompts

- `agent/skills/refine-code/refine-code-prompt.md` adds an explicit clause stating: if `subagent_run_serial` is unavailable in the coordinator session, or if every dispatch attempt for a worker reviewer fails, the coordinator MUST emit `STATUS: failed` with a reason such as `coordinator dispatch unavailable` or `worker dispatch failed`, MUST NOT write any review file, and MUST NOT perform an inline review as a substitute. The clause is positioned where it is unmissable — at the top of the protocol, not buried in an edge-cases footnote.
- `agent/skills/refine-plan/refine-plan-prompt.md` adds the equivalent clause for `plan-reviewer` / `planner` edit-pass dispatch failures, mapped onto `plan-refiner`'s existing `STATUS: failed` reasons.

### Inline-review hardening — agent bodies

- `agent/agents/code-refiner.md`'s `## Rules` section adds a standing rule: "Do NOT perform an inline review if `subagent_run_serial` is unavailable or every reviewer dispatch attempt fails. Emit `STATUS: failed` and exit without writing a review file." This is duplicated in the agent body so it is part of the agent's standing identity rather than only its per-invocation prompt.
- `agent/agents/plan-refiner.md`'s `## Rules` section adds the equivalent rule for `plan-reviewer` / `planner` edit-pass failures.

### Reviewer provenance — coordinator stamping

- When `code-refiner` persists a review file (versioned `<REVIEW_OUTPUT_PATH>-v<ERA>.md` or the unversioned final copy), it MUST prepend a `**Reviewer:** <provider>/<model> via <cli>` line as the first line of the file body, where `<provider>/<model>` and `<cli>` are exactly the values it passed to `subagent_run_serial` for that review pass. The line is mechanical to produce — the coordinator already has both values in scope at dispatch time.
- The coordinator MUST NOT emit `inline` (or any synonym) as the value of the `**Reviewer:**` line. The corollary — never write a review file when dispatch failed — is already enforced by the inline-review-hardening rules above.
- The format is exact: `**Reviewer:** <provider>/<model> via <cli>` on its own line, followed by a blank line, followed by the reviewer's persisted output. Both for first-pass / final-verification reviews and for hybrid re-reviews.
- `plan-refiner` performs the equivalent stamp on every review file it persists at `.pi/plans/reviews/<plan-basename>-plan-review-v<ERA>.md`, using the model and `cli` it passed to `subagent_run_serial` for that iteration's `plan-reviewer` dispatch.
- `refine-code-prompt.md` and `refine-plan-prompt.md` document the stamping requirement so the coordinator knows the contract during its run.

### Skill-side validation

- After `code-refiner` returns and before `refine-code/SKILL.md` reports `STATUS: clean` or `STATUS: max_iterations_reached` to the caller, the skill reads each review file path the coordinator references and validates the `**Reviewer:**` line:
  - The line MUST exist as the first non-empty line of the file.
  - The line MUST match the format `**Reviewer:** <provider>/<model> via <cli>` (concrete `<provider>/<model>` resolvable to a tier the dispatch helper would consider; concrete `<cli>` matching the dispatch map for that provider).
  - The value MUST NOT contain the substring `inline`.
  - For first-pass and final-verification review files: the resolved `<provider>/<model>` MUST equal the model that `crossProvider.capable` resolves to in the active `model-tiers.json`. (No fallback for the worker reviewer is currently documented in `refine-code-prompt.md`; if that changes, the validation contract changes with it.)
- On any validation failure, `refine-code/SKILL.md` surfaces a clear error to the caller naming the failing review path and the specific check that failed; it does not silently accept the run.
- `refine-plan/SKILL.md` performs the equivalent validation on each review file path returned in `## Review Files` from `plan-refiner`. For per-iteration `plan-reviewer` dispatches, the resolved `<provider>/<model>` must equal `crossProvider.capable` or its documented fallback `capable` (per the existing `refine-plan-prompt.md` reviewer fallback chain).

## Constraints

- No changes to `pi-interactive-subagent`, model-tier dispatch wiring, or any tool-flag plumbing. The vocabulary in agent `tools:` lines is unchanged. `subagent_run_serial` stays in `code-refiner` and `plan-refiner` `tools:` lines per `5d0825f`; this spec does not revisit the `subagent-tool-surfaces` decision.
- No changes to worker-agent identities (`code-reviewer`, `coder`, `plan-reviewer`, `planner` edit-pass): no new tools, no rule-body additions. Workers do not need `pi`-CLI; the hardening lives at the coordinator layer.
- The shared dispatch helper governs the coordinator hop only. Worker dispatch logic stays in the coordinator prompts (`refine-code-prompt.md`, `refine-plan-prompt.md`).
- The four-tier chain is fixed: `crossProvider.standard` → `standard` → `crossProvider.capable` → `capable`. Other tiers (`cheap`, future additions) are not included.
- Non-`pi` tiers are skipped silently — no per-tier warning. The single user-visible failure mode is the hard-stop when no tier resolves to `pi`.
- The `**Reviewer:**` line format is exact and required on every persisted review file, including hybrid re-reviews and the unversioned final copy that `code-refiner` produces on `STATUS: clean`.
- `plan-reviewer` and `code-reviewer` `tools:` and Output Formats remain unchanged; the provenance line is the coordinator's responsibility, not the reviewer's.
- `refine-code-prompt.md`'s existing tier assignments for worker dispatches (`crossProvider.capable` for first-pass/final, `standard` for hybrid re-reviews, `capable` for remediator) are not revisited.
- Existing review files on disk written before this spec lands are not retroactively validated. The validation contract applies only to files written by coordinator runs after this spec ships.
- The `## Approach` section is omitted because the architecture round was skipped; structural choices were resolved during intent Q&A and recorded in Requirements.

## Acceptance Criteria

- `agent/skills/_shared/coordinator-dispatch.md` exists, describes the four-tier chain, the skip-silently rule for non-`pi` tiers, and the two hard-stop conditions with their concrete error messages.
- Both `agent/skills/refine-code/SKILL.md` and `agent/skills/refine-plan/SKILL.md` resolve coordinator dispatch by reading and following `agent/skills/_shared/coordinator-dispatch.md`. Neither file inlines the four-tier chain or hard-stop semantics.
- A manual smoke run against a `model-tiers.json` where every one of the four tiers resolves to a non-`pi` CLI confirms that both skills hard-stop with the documented error message before any subagent dispatch.
- A manual smoke run against the current default `model-tiers.json` (where `crossProvider.standard` resolves to `pi`) confirms both skills dispatch their coordinators normally and complete a refine cycle.
- A manual smoke run that simulates `subagent_run_serial` being unavailable inside the coordinator (e.g., dispatch the coordinator on a CLI lacking the orchestration tool) confirms the coordinator emits `STATUS: failed`, writes no review file, and does not improvise an inline review.
- `agent/skills/refine-code/refine-code-prompt.md` contains a clearly positioned clause forbidding inline-review fallback on coordinator-tool unavailability or worker-dispatch exhaustion. `agent/skills/refine-plan/refine-plan-prompt.md` contains the equivalent clause.
- `agent/agents/code-refiner.md` and `agent/agents/plan-refiner.md` `## Rules` sections each contain a standing rule forbidding inline-review fallback.
- Every review file persisted by `code-refiner` (versioned and unversioned final copy) and by `plan-refiner` carries a `**Reviewer:** <provider>/<model> via <cli>` first line that exactly matches the model and `cli` passed to `subagent_run_serial` for that pass. The string `inline` does not appear in any `**Reviewer:**` value.
- `agent/skills/refine-code/SKILL.md` validates each coordinator-returned review path's `**Reviewer:**` line and surfaces a clear error on missing, malformed, or `inline` values. `agent/skills/refine-plan/SKILL.md` does the equivalent.
- A manual smoke run that mutates a coordinator-written review file to remove or corrupt the `**Reviewer:**` line confirms the calling skill surfaces a validation failure rather than silently reporting success.
- `agent/skills/refine-plan/SKILL.md`'s broken cross-reference to "the same wording used in `refine-code`" is removed; the shared file is the single authority cited by both skills.

## Non-Goals

- Adding any new entries to `model-tiers.json` or any new tier names.
- Changing the worker-dispatch tier assignments inside `refine-code-prompt.md` (`crossProvider.capable` / `standard` / `capable`) or inside `refine-plan-prompt.md` (`crossProvider.capable` / `capable`).
- Changing `code-reviewer`, `coder`, `plan-reviewer`, or `planner` agent definitions, prompt templates, or output formats.
- Adding a `Reviewer:` field to `review-code-prompt.md`'s Output Format. Provenance is stamped by the coordinator; the reviewer agent is unaware of `cli` and need not produce the line itself.
- Validating review files written before this spec lands. Backfilling provenance on historical artifacts is out of scope.
- Generalizing the coordinator-dispatch helper into a shared library or executable script. The helper is markdown prose read by the calling skill, consistent with the rest of the agent/skills ecosystem.
- Revisiting the `subagent-tool-surfaces` spec's vocabulary rule for `tools:` lines. `subagent_run_serial` already appears in `code-refiner` / `plan-refiner` `tools:` per `5d0825f`; that decision is treated as settled and is not reopened here.
- Adding warning prompts on each non-`pi` tier as the chain is iterated. The chain is silent until the hard-stop fires.
- Modifying `execute-plan`, `generate-plan`, `define-spec`, or any other skill that does not directly dispatch a refiner coordinator.
- Building automated end-to-end tests for the refine-code or refine-plan workflows; smoke tests are manual, consistent with the rest of the skill suite.

## Open Questions

- The validation contract for first-pass and final-verification review provenance assumes `refine-code-prompt.md`'s worker reviewer dispatch has no fallback (today it dispatches `crossProvider.capable` once with no documented retry). If a future change adds a worker-reviewer fallback chain, the validation contract must accept any tier in that chain. The planner can revisit this if a worker fallback lands as part of related work.
- The exact phrasing of the new `## Rules` entries in `code-refiner.md` and `plan-refiner.md` should align with the existing rule style ("Do NOT ..."). The planner can settle the exact wording.
- Whether the shared `agent/skills/_shared/coordinator-dispatch.md` should also include a brief rationale paragraph (why hard-stop, why silent-skip on non-`pi`) or remain procedure-only. Procedure-only is the lighter footprint; rationale aids future maintainers. Defer to planner judgment.
