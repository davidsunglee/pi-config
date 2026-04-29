# Code Review: spec-designer split v2

Review range: `5ca56f..ced828`

Allowed spec: `.pi/specs/2026-04-24-spec-designer-split.md`

## Strengths

- The new `agent/agents/spec-designer.md` matches the frontmatter-only shape required for dispatch-time `systemPrompt:` delivery: no `model:`, no `maxSubagentDepth`, `thinking: xhigh`, `session-mode: lineage-only`, `auto-exit: false`, `spawning: false`, `system-prompt: append`, and no body after the closing delimiter.
- Frontmatter normalization across existing agents is broadly complete: `maxSubagentDepth` is removed, `session-mode: lineage-only` is present on all seven agent files, `spawning: false` was added to the former depth-0 agents, and `code-refiner.md` correctly preserves spawning by omission.
- The planner and plan-reviewer prompts now explicitly handle the optional `## Approach` section, including planner deviation reporting in `Risk Assessment` and plan-reviewer Warning severity for deviations.
- `define-spec` now clearly separates orchestration from the spec-design procedure: the spec template, Q&A flow, scope-decomposition check, architecture round, self-review pass, and completion contract live in `agent/skills/define-spec/procedure.md`.
- The mux branch dispatch shape correctly avoids `skills:`, passes the procedure via `systemPrompt:`, resolves `model` and `cli` from `model-tiers.json`, and uses top-level `wait: true`.
- Failure handling is much more explicit than before, including transcript-path reporting and no retry/menu for subagent dispatch failures.

## Issues

### Critical (Must Fix)

None found.

### Important (Should Fix)

1. **Todo input can resolve to the wrong todo file path.**  
   **Where:** `agent/skills/define-spec/procedure.md:13`  
   **What:** The TODO branch matches input shaped like `TODO-[0-9a-f]{8}` but instructs the agent to read `.pi/todos/<id>.md`. In this repo, todo files are stored by raw hex filename, e.g. `.pi/todos/075cf515.md`, not `.pi/todos/TODO-075cf515.md`. As written, `<id>` is ambiguous and an agent can reasonably substitute the full matched input, causing smoke-test TODO inputs to fail before Q&A starts.  
   **Why it matters:** R4 and smoke test 1 depend on `/define-spec TODO-<id>` resolving the todo body and optional scout brief. If the procedure reads the prefixed filename, the main happy path is broken.  
   **How to fix:** Make the extraction explicit: match `^TODO-([0-9a-f]{8})$`, bind the capture as the raw todo id, read `.pi/todos/<raw-id>.md`, emit provenance `Source: TODO-<raw-id>`, and check `.pi/briefs/TODO-<raw-id>-brief.md`.

### Minor (Nice to Have)

1. **Failure handling references an `error` field that the skill never tells the orchestrator to read.**  
   **Where:** `agent/skills/define-spec/SKILL.md:95`, `agent/skills/define-spec/SKILL.md:113-116`  
   **What:** Step 3a says to read `finalMessage`, `exitCode`, `state`, and `transcriptPath`, but Step 4's nonzero-exit report includes `error: <error>`.  
   **Why it matters:** On an actual dispatch failure, the orchestrator may not know where to get `<error>` from and may produce a placeholder or omit useful details.  
   **How to fix:** Include `results[0].error` in the Step 3a fields if the orchestration result exposes it; otherwise change the report template to say `error: <error if available>` or use the available `state` plus transcript path.

## Spec / Code Conflicts

1. **R4 says the TODO branch resolves via the `todo` tool; the procedure resolves by direct file read.**  
   **Code:** `agent/skills/define-spec/procedure.md:13`  
   **Spec:** R4 table, Todo ID behavior says “Resolve via `todo` tool. Read body.”  
   **Recommendation:** The implementation direction is stronger because R1 intentionally gives `spec-designer` only `read, write, grep, find, ls` and no `todo` tool; using direct file reads keeps the narrow tool surface. Amend the spec to say the procedure reads `.pi/todos/<raw-id>.md` directly, and fix the ambiguity described in Important issue 1.

2. **R4 describes existing-spec paths as paths under `.pi/specs/`; the procedure also accepts absolute paths containing `/.pi/specs/`.**  
   **Code:** `agent/skills/define-spec/procedure.md:14`, `agent/skills/define-spec/SKILL.md:163`  
   **Spec:** R4 existing-spec path pattern is “path under `.pi/specs/` ending in `.md`.”  
   **Recommendation:** The implementation is stronger. The mux branch requires `SPEC_WRITTEN: <absolute path>`, and the recovery-menu Redo path replays that absolute path, so accepting absolute repo paths is necessary for R9 case 4 to work reliably. Amend the spec to explicitly allow absolute paths whose normalized location is under the repo's `.pi/specs/` directory.

3. **Failure-order behavior may differ from the smoke-test wording for pane closure.**  
   **Code:** `agent/skills/define-spec/SKILL.md:111-121`  
   **Spec:** Smoke test 5 expects pane closure to surface a `finalMessage`-lacks-`SPEC_WRITTEN` failure; R9 separately requires nonzero exits to report exit code + error + transcript. The implementation checks `exitCode != 0` before checking for a missing completion line.  
   **Recommendation:** The implementation is stronger for real runtime failures because it preserves nonzero-exit evidence. Amend smoke test 5 to accept either missing-completion reporting for zero-exit termination or nonzero-exit reporting when the runtime marks pane closure as a failed process; keep the no-commit/no-menu behavior as the invariant.

## Recommendations

- Fix the TODO filename ambiguity before relying on TODO-driven smoke tests.
- Tighten the nonzero-exit failure template so every referenced field is actually read from the orchestration result or marked optional.
- After the TODO path fix, run the spec's smoke tests that exercise TODO input, inline override, rejected-draft redo, and `## Approach` propagation through `generate-plan`.

## Assessment

Ready to merge: With fixes.

The core architecture is sound: the new body-less `spec-designer` agent, single canonical `procedure.md`, dispatch-time `systemPrompt:` delivery, frontmatter normalization, and downstream `## Approach` handling are all in place. The main blocker is the TODO input path ambiguity, which can break the primary happy path.
