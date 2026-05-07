# Scout Brief: Adapt rpiv-pi research into a non-interactive scout brief for planning

Source: TODO-bbe89373
Generated at: 2026-05-07T11:55:03Z
Git SHA: abee863169b5b148e4f33abc598911e955057c48
Model: anthropic/claude-sonnet-4-6

## Relevant Files

- `agent/skills/scout/SKILL.md` — Orchestrator: input-shape detection (todo vs freeform), `--tier` parsing, model-tier resolution, pre-existing-brief check, `subagent_run_serial` dispatch, `BRIEF_WRITTEN:` completion-marker validation, commit gate, continuation offer. **Complete implementation.**
- `agent/skills/scout/scout-prompt.md` — Per-dispatch prompt template. Contains `{WORKING_DIR}`, `{TODO_BODY_OR_FREEFORM_TEXT}`, `{OUTPUT_PATH}`, `{GENERATED_AT_ISO}`, `{GIT_HEAD_SHA}`, `{MODEL_PROVIDER_AND_NAME}`, `{SOURCE_PROVENANCE}`, `{TASK_TITLE}` placeholders; encodes three-pass reconnaissance (broad orientation, task-focused deep dive, disconfirmation) as process steps; defines the 8-section consumer-shaped output contract. **The template I was dispatched with.**
- `agent/skills/scout/README.md` — Role in workflow, input shapes, dispatch behavior, brief format, pre-existing-brief handling, commit gate, continuation offer. References `docs/todos/bbe89373.md` for the token-cost comparison.
- `agent/agents/scout.md` — Agent definition: `tools: read, write, grep, find, ls`, `thinking: high`, `session-mode: lineage-only`, `system-prompt: append`, `spawning: false`, `auto-exit: true`. Body: hard rules (single-file-write, no bash, no questions, `BRIEF_WRITTEN:` terminal marker).
- `agent/skills/define-spec/procedure.md` — Step 1: auto-discovers `docs/briefs/TODO-<raw-id>-brief.md` on the todo branch, reads it, sets `Scout brief:` provenance. Step 2: uses brief as survey foundation; treats `## Open Questions / Ambiguities` as candidate Step 4 Q&A inputs.
- `agent/skills/generate-plan/SKILL.md` — Step 1b: extracts `Scout brief: docs/briefs/<filename>` from spec preamble via bounded preamble read; verifies file exists (warn+continue if not); SHA staleness check (informational warning, never blocks); passes path through `{SCOUT_BRIEF}` placeholder without inlining body.
- `agent/skills/generate-plan/generate-plan-prompt.md` — Template with `{SCOUT_BRIEF}` placeholder in `## Provenance` block and `## Artifact Reading Contract` instructing the planner to read the brief from disk.
- `agent/skills/generate-plan/review-plan-prompt.md` — Same `{SCOUT_BRIEF}` placeholder and artifact-reading contract for the plan-reviewer dispatch.
- `agent/agents/planner.md` — `## Brief handling` section: must read brief when `Scout brief:` in provenance; use as orientation; record deviations as `Brief said X; plan does Y because <reason>` under `## Risk Assessment`. Rule applies on both generation and surgical-edit passes.
- `agent/agents/plan-reviewer.md` — `## Brief coverage` section: fires when `Scout brief:` in plan provenance and file exists; checks `## Risk Areas`, `## Existing Tests and Test Patterns`, `## Patterns and Conventions`; Critical/Important/Minor severity vocabulary; uses same `### Issues` shape as existing review output.
- `agent/skills/refine-plan/SKILL.md` — Steps 3 and 7: auto-discovers `**Scout brief:** docs/briefs/<filename>` from plan preamble; forwards as `{SCOUT_BRIEF}` into the coordinator prompt for reviewer dispatch.
- `agent/skills/_shared/model-tier-resolution.md` — Canonical three-primitive resolution procedure (tier-path, provider-prefix, dispatch lookup) and four strict-by-default failure templates that the scout skill applies with `<agent>=scout`.
- `docs/specs/2026-05-06-scout-reconnaissance-brief.md` — The full spec for this TODO. Source of `Scout brief:` provenance contract, brief format, anti-bias prompt requirements, downstream consumer update specifications, and constraints.
- `README.md` — Scout in skills table, workflow diagram (between "Refine todo" and "Define spec"), and "Run scout (optional)" in "How it works in practice."

## Key Interfaces and Types

**Brief preamble contract (exact key order):**
```
# Scout Brief: <task title>

Source: TODO-<id>          ← todo branch only; omit on freeform
Generated at: <ISO 8601 UTC>
Git SHA: <40-char sha>
Model: <provider/model>
```

**Brief body — eight required level-2 sections in this order:**
```
## Relevant Files
## Key Interfaces and Types
## Dependency / Call Graph
## Patterns and Conventions
## Existing Tests and Test Patterns
## Risk Areas
## Possible Misses
## Open Questions / Ambiguities
```
Empty sections render as `_None._` — never omitted.

**Provenance line injected into spec/plan:**
```
Scout brief: docs/briefs/TODO-<id>-brief.md
```
Parsed as exact-match by `define-spec/procedure.md`, `generate-plan/SKILL.md`, and `refine-plan/SKILL.md`.

**Completion marker (end of scout agent's final message, last line):**
```
BRIEF_WRITTEN: <absolute path>
```
No backticks, no trailing commentary. Parsed by SKILL.md Step 6 with character-for-character path match.

**Dispatch shape:**
```
subagent_run_serial {
  tasks: [{ name: "scout", agent: "scout", task: "<filled scout-prompt.md>",
             model: "<resolved>", cli: "<resolved>" }],
  wait: true
}
```

**Input shapes (SKILL.md Step 1):**
- Todo branch: `^TODO-([0-9a-f]{8})$` — output path `docs/briefs/TODO-<id>-brief.md`; preamble includes `Source: TODO-<id>`.
- Freeform branch: anything else — output path `docs/briefs/<YYYY-MM-DD>-<slug>-brief.md`; no `Source:` line.

**Model tier defaults:** `standard` = `anthropic/claude-sonnet-4-6` (CLI: `claude`). Optional `--tier cheap|standard|capable` override.

## Dependency / Call Graph

```
/scout TODO-<id>
  → SKILL.md Step 1: detect todo branch, read docs/todos/<id>.md
  → SKILL.md Step 2: model-tier-resolution.md → (model, cli)
  → SKILL.md Step 3: pre-existing-brief check (head -n 8 + git rev-parse HEAD)
  → SKILL.md Step 4: fill scout-prompt.md placeholders
  → SKILL.md Step 5: subagent_run_serial → agent/agents/scout.md
       → performs 3-pass reconnaissance
       → writes docs/briefs/TODO-<id>-brief.md
       → emits BRIEF_WRITTEN: <path> as last line
  → SKILL.md Step 6: validate exitCode, BRIEF_WRITTEN: line, file exists+nonempty
  → SKILL.md Step 7: commit gate (c/r/x)
  → SKILL.md Step 8: continuation offer → /define-spec TODO-<id>

/define-spec TODO-<id>
  → procedure.md Step 1: reads docs/briefs/TODO-<id>-brief.md (auto-discover)
  → procedure.md Step 2: uses brief as survey foundation
  → procedure.md Step 4: brief's Open Questions as candidate Q&A inputs
  → procedure.md Step 8: writes Scout brief: docs/briefs/TODO-<id>-brief.md into spec

/generate-plan docs/specs/<spec>.md
  → SKILL.md Step 1b: bounded read (head -n 40), extracts Scout brief: line
  → staleness check: head -n 8 brief + git rev-parse HEAD (warning only)
  → fills {SCOUT_BRIEF} in generate-plan-prompt.md → planner reads brief from disk
  → fills {SCOUT_BRIEF} in review-plan-prompt.md via refine-plan → plan-reviewer reads brief

refine-plan
  → Step 3: auto-discovers **Scout brief:** from plan preamble
  → Step 7: fills {SCOUT_BRIEF} in refine-plan-prompt.md → reviewer reads brief
```

## Patterns and Conventions

**Skill anatomy:** `agent/skills/<name>/SKILL.md` (orchestrator) + `agent/agents/<name>.md` (worker) + `agent/skills/<name>/<name>-prompt.md` (per-dispatch template). Scout follows this exactly.

**Path-based handoff:** durable artifacts (spec, brief, plan) are never inlined into orchestrator prompts. The orchestrator extracts the path (via bounded preamble read) and passes it as a provenance line. Workers read from disk. This is universal across planner, reviewer, refiner, and now scout.

**Completion markers:** every worker subagent ends its final message with a structured last line: `BRIEF_WRITTEN: <path>`, `SPEC_WRITTEN: <path>`, `REVIEW_ARTIFACT: <path>`. The orchestrator validates this line before the commit gate.

**Strict-by-default model resolution:** all dispatch sites use `agent/skills/_shared/model-tier-resolution.md`. No silent fallback to `"pi"` — missing file, missing tier key, missing dispatch map, or missing `dispatch.<provider>` stops with a byte-equal canonical template.

**Provenance preamble extraction:** orchestrators use bounded reads (`head -n 40` for specs/plans, `head -n 8` for briefs) and apply exact-match rules. Lines inside code blocks or after the first `## ` heading are ignored.

**Auto-exit + lineage-only:** all workers have `auto-exit: true` and `session-mode: lineage-only`. Workers never spawn sub-subagents (`spawning: false`).

**Empty sections:** sections that have no findings are written as `_None._` — never omitted — so downstream parsers can rely on uniform structure.

**Commit gate pattern:** after successful validation, surface `(c) Commit / (r) Re-run / (x) Stop` to the user. On `c`, invoke the `commit` skill with explicit file paths. On `r`, re-dispatch skipping the pre-existing check. On `x`, leave on disk. Post-commit continuation offer on todo branch only.

## Existing Tests and Test Patterns

No automated tests exist for the workflow markdown contracts (skills, agents, prompt templates). The workflow is tested manually through end-to-end smoke runs (`/scout TODO-<id>` → validate brief format → `/define-spec TODO-<id>` → verify brief Open Questions surface).

Automated tests in `agent/extensions/*.test.ts` cover only the TypeScript extensions (footer, guardrails, session-breakdown, todos, working indicator). These use Node's built-in test runner (`npm test` in `agent/`).

The acceptance criteria in `docs/specs/2026-05-06-scout-reconnaissance-brief.md` include a manual smoke run as the primary verification: running `/scout TODO-bbe89373` and then `/define-spec TODO-bbe89373` to verify the end-to-end brief→spec provenance chain.

## Risk Areas

**`docs/briefs/` directory creation:** the directory does not exist at HEAD `abee863`. The scout agent must create it on the first write. The agent has no `bash` tool — it relies on the `write` tool creating intermediate directories. Verify the first brief write succeeds before assuming the directory issue is resolved.

**`BRIEF_WRITTEN:` path-equality check is strict:** SKILL.md Step 6 requires character-for-character identity between the path in the marker line and `{OUTPUT_PATH}`. Any trailing newline, whitespace, normalization, or relative-vs-absolute divergence is a validation failure. The agent must emit the absolute path exactly as supplied.

**Pre-existing-brief check vs `r` re-run:** Step 3 is skipped only on explicit `r` (re-run from commit gate). The `o` (overwrite) response at the pre-existing-brief prompt dispatches the agent normally — the check was already performed, dispatch proceeds without repeating it. This is different from `r`.

**Staleness check is informational only:** `generate-plan/SKILL.md` emits one warning when brief SHA ≠ HEAD, then continues. Neither the planner nor the plan-reviewer blocks on staleness. A brief generated several commits ago may have missed code changes since it was written.

**Scout does not re-run between waves:** `execute-plan` waves may change code that the brief mapped. The brief is a one-shot pre-planning artifact; its `## Relevant Files` and `## Patterns and Conventions` may not reflect wave 1 edits when the plan-reviewer checks wave 2 plan coverage.

**No test for brief-coverage check firing:** there is no automated test that verifies `plan-reviewer.md`'s `## Brief coverage` section actually fires when a brief is present. The risk is that a future planner edit that removes the `**Scout brief:**` plan header line would silently disable the coverage check without any test catching it.

**`define-spec` auto-discovery path is case-sensitive and exact:** `procedure.md` Step 1 reads `docs/briefs/TODO-<raw-id>-brief.md` where `<raw-id>` is the 8-char lowercase hex without the `TODO-` prefix. A brief written with an uppercase hex or wrong prefix would not be auto-discovered.

## Possible Misses

**Brief format divergence between TODO and implementation:** the TODO proposed a 12-section format (including `## Summary`, `## Broad Orientation`, `## Precedents and Lessons`, `## Confidence Notes`). The implementation deliberately collapsed this to 8 consumer-shaped sections. The `scout-prompt.md` explicitly forbids these four sections. This divergence is documented in the spec constraints and is intentional — the TODO was the proposal; the spec is the authoritative contract. No gap here, but a reader comparing the TODO and the prompt template directly might find it surprising.

**`review-plan-prompt.md` vs `plan-reviewer.md` for brief-coverage check:** the TODO listed `generate-plan/review-plan-prompt.md` as a required update site. The prompt does have the `{SCOUT_BRIEF}` placeholder and artifact-reading contract, but the explicit brief-coverage check logic (Critical/Important/Minor severity, which sections to check) lives in `agent/agents/plan-reviewer.md`. Both files are needed; neither alone is sufficient. The plan-reviewer agent reads the prompt's `{SCOUT_BRIEF}` provenance line, then applies its own `## Brief coverage` rules.

**`docs/briefs/` absence from `.gitignore` check:** the directory doesn't exist yet; it should be tracked (brief files are committed via the commit gate). Confirmed that `docs/` is not in `.gitignore` — briefs will be committed normally.

**`docs/todos/bbe89373.md`'s `status` field remains `"open"`:** the implementation is complete (spec exists, plan executed in waves 1 and 2 per git history), but the todo's JSON status field still reads `"open"`. The acceptance criteria include a manual smoke run (`/scout TODO-bbe89373`). This brief write is the smoke run's first half.

**`agent/agents/scout.md` line 21 truncation:** the read of `agent/agents/scout.md` returned only 21 lines; the file may have more body content. The frontmatter and hard-rules header were confirmed; the full body instruction set was not verified past line 21. Unlikely to contain contract-breaking content given the SKILL.md is authoritative, but worth a direct read if modifying the agent.

## Open Questions / Ambiguities

- **Token cost estimates:** the TODO's comparison table (150–200K input tokens no-scout vs ~100K standard + ~80K capable with scout) are estimates. After this first real smoke run, actual planner-plus-brief token counts vs baseline would allow the README to be updated with evidence-based figures.

- **SHA staleness threshold:** the current check treats any non-equal HEAD SHA as stale, even if the differing commits touched only unrelated files. A more targeted freshness signal (e.g., checking whether any of the brief-cited files were modified since the brief's SHA) would reduce false warnings. The current decision is "warn and let the user judge" — revisit if the warning becomes noise.

- **8-section format completeness:** the 8-section format is a bet that consumer-shaped sections cover all useful reconnaissance output. If real briefs surface findings that genuinely don't fit (e.g., a load-bearing cross-cutting note that spans multiple risk areas), a narrow 9th section (`## Synthesis` or `## Cross-Cutting Notes`) could be added. Current bet: 8 is sufficient.

- **`define-spec` auto-suggest of scout:** the spec explicitly chose NOT to auto-suggest scout from `define-spec` (no new orchestrator gate). A future iteration could add a `define-spec` preflight heuristic that offers `/scout` when the input is broad, touches unknown codebase areas, or lacks file/module anchors. Not in scope now.
