# Move repo workflow artifacts to docs

Source: TODO-eafa4d57

## Goal

Update this repository's workflow skills, subagent contracts, prompt templates, and README documentation so future durable workflow artifacts live under `docs/` instead of the repository-local `.pi/` tree. The new artifact roots are `docs/todos/`, `docs/briefs/`, `docs/specs/`, `docs/plans/`, `docs/plans/reviews/`, `docs/plans/done/`, `docs/test-runs/`, and `docs/reviews/`. Keep the change simple and clean: replace the old artifact paths with the new ones directly, without dual-path compatibility or migration logic.

## Context

This repo is a personal Pi configuration with workflow behavior encoded mostly in markdown skill and agent contracts. Current artifact paths are spread across:

- `agent/skills/define-spec/SKILL.md`, `agent/skills/define-spec/procedure.md`, and `agent/skills/define-spec/README.md`, which currently read todos from `.pi/todos/`, optionally read briefs from `.pi/briefs/`, accept/refine specs under `.pi/specs/`, validate recovered writes under `.pi/specs/`, and describe `spec-designer` output there.
- `agent/skills/generate-plan/SKILL.md`, `agent/skills/generate-plan/README.md`, `agent/skills/generate-plan/generate-plan-prompt.md`, `agent/skills/generate-plan/review-plan-prompt.md`, and `agent/skills/generate-plan/edit-plan-prompt.md`, which currently write plans to `.pi/plans/` and use `.pi/specs/` / `.pi/briefs/` in provenance and path-based handoff examples.
- `agent/skills/refine-plan/SKILL.md`, `agent/skills/refine-plan/README.md`, and `agent/skills/refine-plan/refine-plan-prompt.md`, which currently auto-discover `.pi/specs/` and `.pi/briefs/` provenance and write plan-review artifacts under `.pi/plans/reviews/`.
- `agent/skills/execute-plan/SKILL.md` and `agent/skills/execute-plan/README.md`, which currently locate active plans in `.pi/plans/`, preserve and clean test-run artifacts under `.pi/test-runs/`, request final code reviews under `.pi/reviews/`, move completed plans to `.pi/plans/done/`, and append completion pointers to todos with `.pi/plans/done/...` paths.
- `agent/skills/refine-code/SKILL.md`, `agent/skills/refine-code/README.md`, and `agent/skills/refine-code/refine-code-prompt.md`, which currently default code-review artifacts to `.pi/reviews/`.
- Agent definitions such as `agent/agents/spec-designer.md`, `agent/agents/planner.md`, and `agent/agents/plan-reviewer.md`, which mention `.pi/specs/`, `.pi/plans/`, and `.pi/briefs/` in standing contracts and descriptions.
- The top-level `README.md`, which documents the repository layout and workflow state as living in `.pi/`.

The repo also contains Pi runtime/config references that are not workflow artifacts, such as `~/.pi/agent/model-tiers.json`, `PI_SUBAGENT_*` environment variables, and package/runtime documentation. Those should remain unchanged. The todo extension currently stores todos under `.pi/todos/`, but the user will update that extension separately and manually migrate existing todo files.

## Requirements

- Replace repo-local workflow artifact destinations and path contracts with the `docs/` equivalents:
  - `.pi/todos/` → `docs/todos/`
  - `.pi/briefs/` → `docs/briefs/`
  - `.pi/specs/` → `docs/specs/`
  - `.pi/plans/` → `docs/plans/`
  - `.pi/plans/reviews/` → `docs/plans/reviews/`
  - `.pi/plans/done/` → `docs/plans/done/`
  - `.pi/test-runs/` → `docs/test-runs/`
  - `.pi/reviews/` → `docs/reviews/`
- Update all repo-local skill instructions, prompt templates, agent descriptions, examples, and README sections that describe generated workflow artifacts so they consistently use the new `docs/` paths.
- Update input-shape and provenance rules to use the new roots directly. For example, existing-spec refinement should recognize `docs/specs/...`, generated plans should identify source specs as `docs/specs/...`, scout-brief provenance should point at `docs/briefs/...`, and plan-review auto-discovery should read the new provenance forms.
- Update write/readback validation rules so generated artifacts are validated under `docs/` rather than `.pi/`, including transcript-backed spec recovery, plan-review artifact path checks, test-run artifact readback, completed-plan moves, and review-file provenance validation.
- Preserve Pi runtime/config references that genuinely are not repo workflow artifacts, including `~/.pi/agent/model-tiers.json`, `PI_SUBAGENT_MODE`, `PI_SUBAGENT_MUX`, multiplexer environment variables, and references to Pi package/runtime internals.
- Keep the implementation simple: use direct `docs/...` paths in the markdown contracts instead of adding abstractions, compatibility shims, or fallback searches for old `.pi/...` artifact locations.
- Document the validation commands run and their results after the change.

## Constraints

- Do not implement backwards compatibility for old repo-local `.pi/...` artifact paths. Future skills should use `docs/...` as the single supported location.
- Do not migrate, delete, archive, or rewrite existing tracked files currently under `.pi/`; those historical artifacts can remain until the user handles migration separately.
- Do not update `agent/extensions/todos.ts` or the todo extension behavior as part of this work; the user will make that change separately. Skill contracts may assume todos will be available at `docs/todos/` after that separate update.
- Do not change workflow semantics beyond the artifact root migration. Dispatch model resolution, commit gates, review loops, verifier behavior, and integration-regression logic should remain functionally the same.
- If a contract requires exact path equality or an anchored marker line, preserve that behavior while changing only the expected root path.

## Acceptance Criteria

- `define-spec` documentation and procedure read todo files from `docs/todos/`, read scout briefs from `docs/briefs/`, accept/refine existing specs under `docs/specs/`, write new specs to `docs/specs/`, and validate mux/transcript recovery only for valid `docs/specs/*.md` writes.
- `generate-plan` documentation and prompts write plans to `docs/plans/`, derive file-input slugs from `docs/specs/...` examples, emit `Source spec: docs/specs/<filename>` when appropriate, and pass `Scout brief: docs/briefs/<filename>` provenance.
- The `planner` and `plan-reviewer` agent contracts use `docs/specs/`, `docs/plans/`, and `docs/briefs/` in their output and artifact-reading rules.
- `refine-plan` documentation and procedure auto-discover `**Spec:** docs/specs/<filename>` and `**Scout brief:** docs/briefs/<filename>` from plan preambles, allocate review artifacts under `docs/plans/reviews/`, validate returned review paths against that root, and commit only the concrete docs-based plan/review files.
- `execute-plan` documentation and procedure locate active plans under `docs/plans/`, preserve stopped-run test artifacts under `docs/test-runs/<plan-name>/`, delete that docs-based test-run directory only after a successful final gate, move completed plans to `docs/plans/done/`, append completed-plan pointers using `docs/plans/done/<plan-filename>.md`, and request final code-review artifacts under `docs/reviews/`.
- `refine-code` documentation and procedure default review output paths to `docs/reviews/<name>-code-review` and continue to validate reviewer-authored artifacts exactly as before.
- The top-level `README.md` repository layout, workflow description, and skill table describe workflow state under `docs/` rather than `.pi/`.
- A repository search over `agent/skills`, `agent/agents`, and `README.md` finds no remaining repo-local artifact references to `.pi/todos`, `.pi/briefs`, `.pi/specs`, `.pi/plans`, `.pi/reviews`, or `.pi/test-runs`. Remaining `.pi` references in those files are limited to genuine Pi runtime/config references such as `~/.pi/agent/model-tiers.json` or `PI_SUBAGENT_*`.
- Any tests or fixtures touched by the path migration are updated to the new docs paths. If no TypeScript files or executable fixtures are touched, the final implementation notes say so explicitly.
- The final implementation report lists the validation commands run, including at least the artifact-path search that proves old repo-local `.pi/...` artifact paths were removed from the in-scope markdown files.

## Non-Goals

- Migrating existing `.pi/` artifact files into `docs/`.
- Updating the todo extension implementation or changing where the `todo` tool stores files.
- Supporting both `.pi/...` and `docs/...` roots during a transition period.
- Changing model-tier configuration, subagent dispatch selection, mux detection, or Pi runtime/package configuration.
- Reworking the development workflow, review semantics, plan structure, verifier behavior, or integration-regression model beyond path updates.
