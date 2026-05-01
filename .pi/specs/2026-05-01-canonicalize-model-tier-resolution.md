# Canonicalize Model-Tier and Dispatch Resolution Across Skills

Source: TODO-d4f1c8a2

## Goal

Replace the duplicated, drifted model-tier and dispatch-CLI resolution prose scattered across `agent/skills/` with a single canonical reference document, and apply a uniform strict-everywhere policy for general worker and reviewer dispatch — no silent fallback to `pi` when the dispatch map or provider entry is absent. Consumer skills point at the canonical doc for the resolution algorithm and emit a fixed set of parameterized failure messages, while retaining only their own role-to-tier mappings and explicit skill-specific fallback semantics. Coordinator dispatch keeps its existing pi-only chain semantics, owned by the existing shared file, but updated to use the strict canonical policy for inner worker re-resolution.

## Context

The model matrix lives at `~/.pi/agent/model-tiers.json` and currently contains:

- Top-level tiers: `capable`, `standard`, `cheap`.
- A `crossProvider` object with the same three tier names.
- A `dispatch` object mapping provider prefixes (currently `anthropic`, `openai-codex`) to CLI names (`claude`, `pi`).

Resolution prose appears in many places across `agent/skills/` and has drifted in strictness:

- **Strict callers** (no fallback to `pi`):
  - `agent/skills/define-spec/SKILL.md` Step 3a — three exact failure messages, parameterized on the agent name (`spec-designer`); explicitly forbids CLI-default fallback.
  - `agent/skills/execute-plan/SKILL.md` test-runner subsection — strict for `crossProvider.cheap`; surfaces the resolution failure rather than silently falling back.
- **Lenient callers** (silently default to `"pi"` when `dispatch.<provider>` is missing):
  - `agent/skills/execute-plan/SKILL.md` Step 6 — the longest inlined algorithm; the "default to `pi`" rule lives here.
  - `agent/skills/generate-plan/SKILL.md` Step 2 — references `execute-plan` Step 6 for the algorithm.
  - `agent/skills/requesting-code-review/SKILL.md` Step 2b — references `execute-plan` Step 6.
  - `agent/skills/refine-code/refine-code-prompt.md` `### Dispatch resolution` — duplicates the 4-step algorithm with default-to-pi.
  - `agent/skills/refine-plan/refine-plan-prompt.md` `### Dispatch resolution` — duplicates the same algorithm with default-to-pi.
- **Coordinator dispatch** lives in `agent/skills/_shared/coordinator-dispatch.md`, which:
  - Owns the pi-only four-tier chain (`crossProvider.standard`, `standard`, `crossProvider.capable`, `capable`), the skip-silently-on-non-pi rule, and the two hard-stop messages.
  - Carries a `## Note on worker subagents` section that tells coordinators to default to `pi` for inner-worker dispatch when a provider has no entry — i.e. the lenient policy.
- **Provenance-validation sites** (`agent/skills/refine-code/SKILL.md` Step 6, `agent/skills/refine-plan/SKILL.md` Step 9.5) re-resolve tier paths and dispatch lookups when checking that a written review file's `**Reviewer:**` first-line provenance matches the model the coordinator was asked to use.

The drift is real: a missing `dispatch.<provider>` stops `define-spec` cleanly with a precise message but silently routes an `execute-plan` worker (and several others) to `pi`, which can be the wrong CLI for the selected provider. The strict callers' messages also do not agree in shape with each other today.

## Requirements

1. Create `agent/skills/_shared/model-tier-resolution.md` as the single canonical reference for general worker/reviewer dispatch resolution.
2. The canonical doc covers:
   - The input file location: `~/.pi/agent/model-tiers.json`.
   - The expected JSON shape: top-level tier keys (`capable`, `standard`, `cheap`), optional `crossProvider` tiers, required `dispatch` object mapping provider prefixes to CLI names.
   - The primitive operations: tier-path resolution to a non-empty model string (supporting nested paths like `crossProvider.cheap`), provider-prefix extraction (substring before the first `/`), and `dispatch.<provider>` lookup.
   - The strict-by-default policy for general worker/reviewer dispatch: no silent fallback to `"pi"` (or any other CLI default) on any failure condition.
   - The four exact failure-message templates, parameterized only on `<agent>`, `<tier>`, `<provider>`, and `<model>`. Consumers emit them byte-equal after parameter substitution:
     - **Missing/unreadable file:** `~/.pi/agent/model-tiers.json missing or unreadable — cannot dispatch <agent>.`
     - **Missing/empty selected tier:** `model-tiers.json has no usable "<tier>" model — cannot dispatch <agent>.`
     - **Missing `dispatch` map:** `model-tiers.json has no dispatch map — cannot dispatch <agent>.`
     - **Missing/empty `dispatch.<provider>`:** `model-tiers.json has no dispatch.<provider> mapping for <tier> model <model> — cannot dispatch <agent>.`
   - The high-level coordinator-dispatch rule: coordinator agents (`code-refiner`, `plan-refiner`) MUST run on `pi` because they need subagent-orchestration tools (`subagent_run_serial` / `subagent_run_parallel`); the coordinator chain procedure and its hard-stop messages live in `agent/skills/_shared/coordinator-dispatch.md`. The canonical doc points at that file rather than duplicating its chain logic.
   - A list of the explicit skill-specific fallback chains that legitimately remain skill-local (not coordinator-dispatch) — for example, `refine-plan`'s `crossProvider.capable` → `capable` plan-reviewer primary/fallback pair. The canonical doc names these so that audits can distinguish them from stale duplicated general-resolution algorithms.
3. Update each consumer to reference the canonical doc instead of duplicating the algorithm. Skill-local prose is retained only for: role-to-tier mappings, explicit skill-specific fallback semantics named in the canonical doc, and provenance-validation rules. Specific consumer edits:
   - `agent/skills/define-spec/SKILL.md` Step 3a — references the canonical doc; keeps "spec-designer uses the `capable` tier; no fallback." Existing failure messages adapted to the canonical templates.
   - `agent/skills/generate-plan/SKILL.md` Step 2 — references the canonical doc; keeps the role-to-tier mapping (`capable` for plan generation) and the explicit `crossProvider.capable` → `capable` fallback note.
   - `agent/skills/execute-plan/SKILL.md` Step 6 — references the canonical doc; keeps the task-recommendation → tier mapping (`capable` / `standard` / `cheap`) and the retry/escalation tier behavior. Removes the inlined "default to `pi`" rule.
   - `agent/skills/execute-plan/SKILL.md` test-runner subsection — references the canonical doc; keeps the role-specific tier (`crossProvider.cheap`).
   - `agent/skills/requesting-code-review/SKILL.md` Step 2b — references the canonical doc; keeps the reviewer-tier rule (`capable`).
   - `agent/skills/refine-code/SKILL.md` Step 6 (provenance validation) — references the canonical doc for the primitive lookups (tier-path resolution, dispatch lookup); keeps the per-status validation rules describing which tier the first non-empty line is allowed to name.
   - `agent/skills/refine-code/refine-code-prompt.md` `### Dispatch resolution` — replaced with a reference to the canonical doc; keeps the model-tier role assignments (`crossProvider.capable` first-pass, `standard` hybrid re-review, `capable` remediator).
   - `agent/skills/refine-plan/SKILL.md` Step 9.5 — same treatment as `refine-code/SKILL.md` Step 6.
   - `agent/skills/refine-plan/refine-plan-prompt.md` `### Dispatch resolution` — same treatment as `refine-code-prompt.md`; keeps `crossProvider.capable` primary / `capable` fallback / `capable` planner-edit role assignments.
   - `agent/skills/_shared/coordinator-dispatch.md` — references the canonical doc for the primitive lookups (tier-path resolution, provider-prefix extraction, dispatch lookup); retains the four-tier chain procedure, the skip-silently-on-non-pi rule, and the two hard-stop messages. The `## Note on worker subagents` section is updated so that worker re-resolution inside coordinators uses the strict canonical policy (no default-to-pi).
4. The strict policy applies uniformly: missing `model-tiers.json`, missing selected tier, missing `dispatch` map, or missing `dispatch.<provider>` all stop with the canonical exact-template message. This applies to every general worker/reviewer dispatch site, including worker re-resolution inside coordinator prompts (`refine-code-prompt.md`, `refine-plan-prompt.md`, and the `## Note on worker subagents` section of `_shared/coordinator-dispatch.md`).
5. The coordinator-dispatch invariant is preserved verbatim: coordinators (`code-refiner`, `plan-refiner`) MUST run on `pi`, follow the four-tier chain in `_shared/coordinator-dispatch.md`, hard-stop with the documented messages on chain exhaustion, and never fall back to inline review/remediation.
6. Failure-message templates are emitted byte-equal across consumers — each consumer substitutes only the parameter values, never the surrounding prose. A consumer never extends or paraphrases a template.

## Constraints

- The canonical doc lives at `agent/skills/_shared/model-tier-resolution.md`. No alternative location is acceptable for this work.
- The canonical doc and `agent/skills/_shared/coordinator-dispatch.md` together form the complete dispatch-resolution policy. Neither is folded into the other; the canonical doc references the coordinator-dispatch file for coordinator-specific chain logic, and the coordinator-dispatch file references the canonical doc for primitive lookups.
- Failure messages are exact templates — consumers emit them byte-equal after substituting only `<agent>`, `<tier>`, `<provider>`, and `<model>`. Consumers do not extend, paraphrase, or wrap the templates.
- `~/.pi/agent/model-tiers.json` values and shape are not changed by this work.
- The verifier two-phase design and its evidence-collection contract are not changed.
- The integration-regression model and the wave/retry behavior in `execute-plan` are not changed.
- The "no inline review / no inline remediation" rules in `refine-code` and `refine-plan` remain in force; the strictness change for general worker dispatch does not weaken them.
- No new tooling (linters, CI checks) is introduced to enforce template byte-equality. Enforcement is the manual grep audit defined in the acceptance criteria.

## Acceptance Criteria

- `agent/skills/_shared/model-tier-resolution.md` exists and is the single source of truth for general worker/reviewer dispatch resolution.
- The canonical doc defines the strict-by-default policy and supplies the four exact failure-message templates from Requirement 2, parameterized only on `<agent>`, `<tier>`, `<provider>`, and `<model>`.
- The canonical doc explicitly states that coordinator agents (`code-refiner`, `plan-refiner`) must run via `pi` because they need subagent-orchestration tools, and points at `agent/skills/_shared/coordinator-dispatch.md` for the four-tier chain procedure and its hard-stop messages.
- The canonical doc names the explicit skill-specific fallback chains that legitimately remain skill-local (e.g. `refine-plan`'s `crossProvider.capable` → `capable` plan-reviewer pair), so they are not flagged as stale duplication during audit.
- `agent/skills/_shared/coordinator-dispatch.md` references the canonical doc for primitive lookups, retains the four-tier chain procedure and its two hard-stop messages, and is updated so worker re-resolution inside coordinators uses the strict canonical policy (no default-to-pi).
- Each of the following consumer files references the canonical doc and contains no inlined general-resolution algorithm: `agent/skills/define-spec/SKILL.md`, `agent/skills/generate-plan/SKILL.md`, `agent/skills/execute-plan/SKILL.md`, `agent/skills/requesting-code-review/SKILL.md`, `agent/skills/refine-code/SKILL.md`, `agent/skills/refine-code/refine-code-prompt.md`, `agent/skills/refine-plan/SKILL.md`, `agent/skills/refine-plan/refine-plan-prompt.md`.
- Each consumer's failure messages for the four documented conditions are byte-equal to the canonical templates after parameter substitution. (For example, `define-spec`'s former three exact messages are replaced with the canonical templates with `<agent> = spec-designer`.)
- A manual grep audit across `agent/skills/` for the strings `dispatch[`, `dispatch.`, `provider prefix`, and `model-tiers.json` returns only matches that fall into one of these allowed categories: (a) references to the canonical doc, (b) the coordinator-specific chain rules in `_shared/coordinator-dispatch.md`, (c) the provenance-validation rules in `refine-code/SKILL.md` and `refine-plan/SKILL.md`, (d) role-to-tier mappings, or (e) explicit skill-specific fallback semantics named in the canonical doc.
- `refine-code` and `refine-plan` continue to use the shared coordinator-dispatch procedure for their coordinator dispatch and do not duplicate or weaken the pi-only invariant.
- The coordinator hard-stop behavior is unchanged: "no tier resolves to `pi`" and "all `pi`-eligible tiers failed" continue to produce the existing verbatim error messages from `_shared/coordinator-dispatch.md`. There is no inline review/remediation fallback path introduced or preserved.

## Non-Goals

- Changing `~/.pi/agent/model-tiers.json` values or shape (no new tiers, no new provider entries, no schema changes).
- Changing the verifier two-phase design, its evidence-collection contract, or any verifier prompt content.
- Changing the integration-regression model in `execute-plan` or any wave/retry behavior.
- Refactoring broader skill structure beyond model-tier and dispatch resolution prose.
- Pinning the exact section ordering or supporting prose of the canonical doc beyond the policy elements and four failure templates listed in Requirements 2 — section ordering is planner territory.
- Introducing automated enforcement (linters, CI checks) for template byte-equality.
- Touching coordinator-dispatch chain semantics (the four-tier order, the skip-silently rule, the two hard-stop messages) except to add a reference back to the canonical doc and to switch the inner worker re-resolution rule from lenient default-to-pi to strict.
