# Refine Plan Skill

Source: TODO-7463a4e4

## Goal

Introduce a reusable `refine-plan` skill, backed by a short-lived `plan-refiner` coordinator subagent, that owns the plan review/edit loop and the plan-artifact commit gate. The skill is invokable standalone against an existing plan file, or by `generate-plan` after initial plan generation. The motivation is to keep plan-review text and loop-control state out of the long-lived `generate-plan` orchestrator's context window — currently the orchestrator absorbs full review text and parses findings inline, which costs context that matters disproportionately because plan generation typically precedes substantial implementation work.

## Context

The current setup:

- `generate-plan` (`agent/skills/generate-plan/SKILL.md`) keeps the entire review/edit loop in the orchestrator session. After dispatching the planner, it dispatches `plan-reviewer`, receives the full review text in `results[0].finalMessage`, writes it to `.pi/plans/reviews/...`, parses findings, dispatches the planner edit pass, repeats per era budget, and finally commits the plan + review artifacts itself.
- `plan-reviewer` (`agent/agents/plan-reviewer.md`) is intentionally read-only/judge-only. Its review is returned via `finalMessage`; it writes nothing to disk.
- `planner` (`agent/agents/planner.md`) handles both initial plan generation and surgical edit passes (separate prompt templates).
- `refine-code` already implements the analogous pattern for code review: `agent/skills/refine-code/SKILL.md` dispatches a `code-refiner` coordinator (`agent/agents/code-refiner.md`), which owns review-fix iteration, writes versioned review files, batches findings, and returns compact STATUS to the caller. `code-refiner` does commit remediation batches internally — that is a code-specific pattern that does not transfer to plan refinement.
- Plan review files are versioned under `.pi/plans/reviews/<plan-basename>-plan-review-vN.md`, where `vN` is an *era* number (not an attempt number). Within one era, up to the iteration budget runs and overwrites the same versioned file in place. A budget reset (user opts to keep iterating) increments the era to v+1.
- The plan file itself is not filename-versioned — it is overwritten in place during edit passes. Git history provides version durability once committed.
- Approved warnings/suggestions are currently appended to the plan as a `## Review Notes` section in `generate-plan` Step 4.2; this behavior is main-orchestrator-driven today.
- The `commit` skill (`agent/skills/commit/SKILL.md`) accepts explicit file paths and commits without pushing.
- Model dispatch resolution comes from `~/.pi/agent/model-tiers.json`. The convention in `refine-code` and `generate-plan`: `crossProvider.standard` for the coordinator subagent; `crossProvider.capable` for the plan reviewer (with `capable` fallback); `capable` for the planner edit pass. CLI dispatch is resolved from the `dispatch` map keyed by provider prefix, defaulting to `pi`.

## Requirements

- A new `refine-plan` skill exists at `agent/skills/refine-plan/SKILL.md` and is invokable standalone against an existing `.pi/plans/<plan>.md` file.
- A new local coordinator agent exists at `agent/agents/plan-refiner.md` with the same general shape as `code-refiner`: short-lived, lineage-only, no spawning side effects. It runs through a CLI that exposes pi orchestration tools (`subagent_run_serial`), resolved from `crossProvider.standard`'s entry in the `dispatch` map.
- `plan-refiner` dispatches `plan-reviewer` and `planner` (edit-mode) subagents, writes review artifacts to `.pi/plans/reviews/<plan-basename>-plan-review-vN.md`, tracks the iteration budget within an era, manages era boundaries, and returns a compact STATUS / paths summary to `refine-plan`.
- `plan-refiner` performs a **full plan review every iteration** (no hybrid mode, no separate "Final Verification" phase). Every pass is already a full pass.
- `plan-reviewer` retains read-only/judge-only behavior. Its `tools:` set is unchanged; review file persistence is `plan-refiner`'s responsibility.
- `refine-plan` accepts the following inputs:
  - Plan path (required, positional).
  - Provenance, auto-discovered from the plan file's preamble lines (`**Spec:** .pi/specs/...`, `**Source:** TODO-...`, `**Scout brief:** .pi/briefs/...`). When the line is present and the referenced file exists on disk, use it.
  - Provenance override flags (optional): `--task-artifact <path>`, `--source-todo TODO-<id>`, `--scout-brief <path>`. Overrides take precedence over the plan preamble.
  - `--structural-only` opt-in flag: explicit consent to run the reviewer with no spec/todo coverage check. Required when no provenance is available and the user wants to proceed anyway.
  - Max iterations per era (default 3).
  - Auto-commit-on-approval mode (boolean flag, default off; `generate-plan` sets it on when invoking).
- When provenance cannot be auto-discovered (no preamble lines, or all referenced files missing) and `--structural-only` is not set, `refine-plan` fails with a clear error directing the user to either provide overrides or opt in to structural-only.
- When `--structural-only` is in effect, the review must be clearly labeled as structural-only in the review artifact, and `refine-plan` must surface the same label in its summary back to the caller.
- Standalone `refine-plan` allocates the starting era number by scanning `.pi/plans/reviews/` for existing `<plan-basename>-plan-review-vN.md` files and starting at `max(existing N) + 1`. Within a single run, era resets continue from there. The same scan-and-pick rule applies when `generate-plan` invokes `refine-plan` against a freshly generated plan (typically resolves to `v1` because the basename is new, but the rule is unconditional).
- `refine-plan` validates that the plan path and each review-artifact path returned by `plan-refiner` exist and are non-empty before presenting the result, prompting the commit gate, or auto-committing.
- `refine-plan` owns the plan/refinement commit gate in both standalone and `generate-plan`-invoked use:
  - Standalone, approved within budget: prompt the user (commit gate Y/n) before invoking the `commit` skill.
  - `generate-plan`-invoked, approved within budget: auto-commit (no prompt) via the `commit` skill.
  - Budget exhausted (both modes): present exactly two options — **(a)** commit the current era's plan + review artifacts, then continue iterating into era v+1 with a fresh budget; **(b)** stop here and proceed with issues, then offer the commit gate (auto-commit in `generate-plan`-invoked mode; user prompt in standalone). The "keep iterating without committing" option is removed.
- `commit` is invoked with the concrete plan path and the concrete review-artifact paths written during the current run only. No globs, no wildcards, no older-version review files from prior standalone runs.
- If the `commit` skill fails (pre-commit hook, dirty index, etc.), `refine-plan` reports `COMMIT: not_attempted` with the underlying error and leaves artifacts on disk uncommitted.
- `plan-refiner` returns one of three statuses: `STATUS: approved | issues_remaining | failed`.
  - `approved` — review converged, no errors remain.
  - `issues_remaining` — budget exhausted with errors persisting; `refine-plan` shows the budget-exhaustion menu.
  - `failed` — inner loop cannot meaningfully continue. Conditions include: required model dispatch fails on both primary and fallback for plan-reviewer or planner edit pass; plan file missing or empty when an iteration starts; planner edit-pass subagent returns an uninterpretable result; review file write fails.
- On `STATUS: failed`, `refine-plan` skips the commit gate entirely (no commit attempt). It reports the failure with the error reason and any review files that were successfully written, so the user can inspect them.
- `refine-plan`'s final result back to its caller has compact shape: `STATUS`, `COMMIT` outcome, plan path, list of concrete review paths written during the current run, and any structural-only label. No full review text, no full plan text, no per-iteration findings.
- The existing behavior of appending approved warnings/suggestions to the plan as a `## Review Notes` section is preserved, but performed by `plan-refiner` (not by the `generate-plan` main session). Warnings/suggestions are only appended on the approved path; on `issues_remaining` they remain in the review file.
- `generate-plan` is updated to delegate plan review/edit and the plan-artifact commit gate to `refine-plan` after initial plan generation. It must not write review files, parse full review text, track review versions, or commit plan/review artifacts itself.
- After `refine-plan` returns, `generate-plan` reports `STATUS`, `COMMIT`, and any structural-only label, then offers `execute-plan`. If the plan was left uncommitted (only possible in standalone-style flows; auto-commit mode always commits on approval), the offer must clearly note the uncommitted state so the user can make an informed choice.

## Constraints

- No reusable generic artifact-refiner abstraction; `refine-plan` and `refine-code` remain separate code paths.
- `plan-refiner` must not commit; coordinator stays non-committing.
- `generate-plan` must not retain a separate caller-owned commit mode; `refine-plan` is the single owner of the plan-artifact commit gate.
- Per-iteration plan/review states must not be auto-committed by default — intermediate edits are draft states.
- `execute-plan` is unchanged except where documentation references the existing `generate-plan -> execute-plan` handoff.
- `plan-reviewer`'s responsibilities must not expand beyond judging/reviewing.
- No unversioned `latest` plan-review copy unless a concrete consumer is identified.
- `plan-refiner` must run through a CLI that exposes pi orchestration tools, dispatched from `crossProvider.standard` via the `dispatch` map. Same fallback shape as `refine-code`.
- Path-based handoff: large durable artifacts (plan file, task artifact, scout brief) are passed by filesystem path rather than inlined into prompts, consistent with the recently-landed generate-plan path-based handoff work.
- Era-versioned review filenames remain `.pi/plans/reviews/<plan-basename>-plan-review-vN.md`. Within one era, the file is overwritten in place. New eras (budget resets) increment N.
- Standalone `refine-plan` must not overwrite review artifacts from prior standalone runs against the same plan basename.

## Approach

**Chosen approach:** A reusable `refine-plan` skill (caller-facing) backed by a short-lived `plan-refiner` coordinator subagent (loop-owning), mirroring the existing `refine-code` / `code-refiner` split. The coordinator dispatches the existing `plan-reviewer` and `planner` (edit mode) subagents, writes versioned review artifacts to `.pi/plans/reviews/`, manages era boundaries and per-era budget, and returns a compact STATUS / paths summary. The skill validates returned artifact paths, presents results, owns the commit gate, and is the single source of plan-artifact commits in both standalone and `generate-plan`-invoked use. Commit policy diverges by caller: standalone gates with a user prompt before commit; `generate-plan`-invoked auto-commits on approval. Budget-exhaustion offers the same two-option menu in both modes — commit current era and keep iterating, or stop and proceed with issues. Each iteration is a full plan review (no hybrid mode).

**Why this over alternatives:** A single-skill (no coordinator) shape would defeat the entire context-relief motivation, since the long-lived `generate-plan` session would still absorb review text. Putting commit ownership in `plan-refiner` would break the read-only/coordinator boundary the TODO explicitly preserves and would couple plan-refinement commits to short-lived agent lifetimes. Splitting commit ownership between `generate-plan` and `refine-plan` would re-create exactly the "main session knows too much about review/commit logistics" problem this work is fixing — keeping the gate in one place, on the longer-lived skill, is the structural fix. Hybrid review with a final-verification phase (the `code-refiner` pattern) is rejected for now because plans are smaller global artifacts than typical code diffs and the cost of full-review-per-iteration is acceptable for plans up to ~1000–2000 lines; the implementation cost of hybrid (plan-version tracking, scoped review prompt, final-verification semantics) is not justified by the current pain. Mandatory user gate even from `generate-plan` is rejected because the user already opted into the workflow and an extra confirmation right after approval is friction without obvious safety value. A three-option budget-exhaustion menu retaining the "keep iterating without committing" path is rejected because it leaves prior-era edits uncommitted while the next era runs, creating a recovery hazard if the user abandons.

**Considered and rejected:**

- Monolithic skill (no coordinator subagent) — defeats the context-relief motivation.
- `plan-refiner` owns commit — breaks the coordinator/non-committing boundary the TODO preserves; couples commit lifetime to a short-lived agent.
- Caller-owned commit split between `generate-plan` and `refine-plan` — replicates the original problem.
- Hybrid review with final-verification phase (mirror of `code-refiner`) — over-engineered for current plan sizes; deferred as a possible future enhancement.
- Auto-commit on approval in standalone mode — too aggressive for manual/exploratory standalone use.
- Three-option budget-exhaustion menu retaining a non-commit iteration path — creates an abandoned-state recovery hazard.

## Acceptance Criteria

- A new `refine-plan` skill exists at `agent/skills/refine-plan/SKILL.md` and runs standalone against an existing plan path, producing a refined plan plus at least one versioned review artifact under `.pi/plans/reviews/`.
- A new `plan-refiner` coordinator agent exists at `agent/agents/plan-refiner.md`, dispatches `plan-reviewer` and `planner` (edit mode), writes review artifacts to `.pi/plans/reviews/`, and never invokes the `commit` skill.
- `plan-refiner` runs under a CLI resolved from `crossProvider.standard`'s entry in the `dispatch` map of `~/.pi/agent/model-tiers.json` (with the same fallback shape as `refine-code`).
- `plan-reviewer`'s tools set is unchanged; it remains read-only/judge-only.
- `refine-plan` validates returned plan/review paths exist and are non-empty before presenting the result, prompting the commit gate, or auto-committing. Missing paths surface a clear failure rather than calling `commit`.
- Standalone approval triggers a user-facing commit gate (Y/n); `generate-plan`-invoked approval auto-commits without a gate.
- Budget exhaustion presents exactly two options — commit current era + keep iterating, or stop + commit gate. The "keep iterating without commit" option is absent.
- `commit` is invoked only with explicit, fully-resolved plan and review paths from the current run. No globs, no wildcards, no older-version review files from prior standalone runs.
- Standalone `refine-plan` allocates the starting era as `max(existing N) + 1` from `.pi/plans/reviews/<plan-basename>-plan-review-vN.md`. Pre-existing `vN` artifacts are not overwritten.
- `generate-plan` delegates plan review/edit and the plan-artifact commit gate to `refine-plan`. The `generate-plan` skill body no longer writes review files, parses full review text, tracks review versions, or commits plan/review artifacts directly.
- The main `generate-plan` session receives only compact STATUS / path / commit output from `refine-plan`. Full review text never enters the orchestrator's transcript during normal operation.
- Approved warnings/suggestions are appended to the plan as a `## Review Notes` section by `plan-refiner` (not by the main `generate-plan` session). Warnings/suggestions are not appended on the `issues_remaining` path.
- On `STATUS: failed` from `plan-refiner`, `refine-plan` skips the commit gate entirely and reports the failure with the list of any successfully-written review artifacts.
- On `commit` failure, `refine-plan` reports `COMMIT: not_attempted` (or equivalent) with the underlying error, and artifacts remain uncommitted on disk.
- A manual smoke run on a small spec or todo confirms that `generate-plan` produces a plan, `refine-plan` refines it, review artifact(s) are written under `.pi/plans/reviews/`, `refine-plan` owns the commit gate, and the main `generate-plan` session shows only compact output.
- A manual standalone smoke run on an existing plan with prior `vN` reviews confirms the new review artifact is allocated at `v(N+1)` and prior versions are preserved.
- Provenance auto-discovery from the plan preamble works without explicit flags; CLI override flags (`--task-artifact`, `--source-todo`, `--scout-brief`) take precedence over the preamble when present.
- Missing/unrecoverable provenance fails by default; `--structural-only` is required to proceed. Structural-only runs are clearly labeled in the review artifact and surfaced in `refine-plan`'s summary back to the caller.

## Non-Goals

- Generalizing into a reusable generic artifact-refiner abstraction.
- Merging behavior with `code-refiner` or sharing implementation between the two refiners.
- Moving any portion of commit responsibility into `plan-refiner`.
- Auto-committing per-iteration plan/review states by default.
- Maintaining a separate caller-owned commit mode in `generate-plan`.
- Modifying `execute-plan` beyond documentation/example references to the `generate-plan -> execute-plan` handoff.
- Expanding `plan-reviewer`'s responsibilities beyond judging/reviewing.
- Adding an unversioned `latest` plan-review copy.
- Building hybrid re-review with a final-verification phase for `plan-refiner` (deferred).
- Building automated end-to-end tests for the refine-plan workflow (smoke tests are manual, consistent with the rest of the skill suite).

## Open Questions

- The existing `review-plan-prompt.md` assumes either `{TASK_ARTIFACT}` or `{ORIGINAL_SPEC_INLINE}` is non-empty. Implementing `--structural-only` may require a small prompt adjustment so the reviewer behaves correctly when both are empty (no spec coverage to check, structural review only). The planner can settle the exact prompt edit; flagging here so it is not missed.
- Whether `plan-refiner`'s STATUS values should distinguish between "user-aborted" failures and "loop-error" failures. The current spec collapses both into `STATUS: failed`; a future refinement could split them if the user-abort case becomes common in practice.
