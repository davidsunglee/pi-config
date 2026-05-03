# Clean up user choice dialogues in define-spec skill

Source: TODO-03d83de7

## Goal

Make the user-facing choice dialogues in the `define-spec` skill clearer, more consistent, and easier to act on. Standardize prompt wording, option labels, and yes/no formatting; remove the hidden flow where users must know magic words to reach the recovery menu; rename a misleading option label so it matches the existing behavior; and add two universal interaction rules to the spec-design procedure (always recommend on spec-content questions, ask one question per turn). Apply the yes/no formatting standardization across the small set of peer skills that currently differ.

## Context

The `define-spec` skill lives at `agent/skills/define-spec/` and is split into two files that both surface user-facing dialogues:

- `SKILL.md` — the orchestrator. Hosts the Step 5 review pause, the Step 7 recovery menu, and the Step 8 generate-plan continuation offer.
- `procedure.md` — the shared spec-design procedure consumed by both the `spec-designer` subagent (mux branch) and the orchestrator's inline branch. Hosts the Step 3 scope-decomposition check, the Step 4 intent Q&A, the Step 5 architecture-need assessment, and the Step 6 architecture approaches selection.

Six user-facing choice dialogues exist across these two files. Today they are inconsistent in three ways:

1. **Option-label conventions diverge.** The Step 7 recovery menu uses Roman numerals `(i) / (ii) / (iii)`; peer skills (`agent/skills/execute-plan/SKILL.md`, `agent/skills/refine-plan/SKILL.md`) use single-letter mnemonics like `(c) / (r) / (x)` or `(a) / (b)`.
2. **Yes/no formatting diverges across skills.** `agent/skills/refine-plan/SKILL.md` uses `[Y/n]` (capital-default Unix convention) at lines 178 and 197; `agent/skills/execute-plan/SKILL.md` uses `(y/n)` (lowercase, no default) at line 333. `define-spec` has no standardized yes/no form today.
3. **Some prompts list options explicitly; others rely on prose or magic words.** The Step 5 review prompt in `SKILL.md` says "Review it and let me know when you'd like me to commit it (or that you don't want to)" with no labeled options; users must know to type "redo", "leave it", or "delete it" to reach Step 7's recovery menu, otherwise they have to reject vaguely and wait for the menu to appear. The Step 5 architecture-need prompt in `procedure.md` uses an awkward "confirm, force on, or force off" 3-option structure that reads like operator-config language. The Step 3 scope-decomposition and Step 6 architecture-approaches prompts in `procedure.md` are described in prose with no fixed format.

Behaviorally, today's `(i) Redo` option in the Step 7 recovery menu re-dispatches `define-spec` with the existing-spec path as input, which triggers `procedure.md`'s existing-spec branch (Step 1) where Q&A "focuses on filling gaps and refining unclear sections" with preamble preservation. That is a refinement operation, not a from-scratch redo — the option's label is misleading.

The orchestrator's review/recovery flow today also offers `(iii) Delete it`, which removes the spec file from disk. This is a destructive action that has no recovery if chosen accidentally; the user can already accomplish the same thing manually after picking "leave it".

The procedure-level Q&A in `procedure.md` Step 4 already says "Ask one question at a time. Multi-choice preferred where possible," but the rule lives only in Step 4 and is not promoted to a top-level convention that also governs Steps 3, 5, and 6. There is no current rule requiring the spec-designer to provide a recommendation alongside each spec-content question; recommendations exist only in Step 5 (architecture-need) and Step 6 (architecture approaches) by ad-hoc convention.

## Requirements

- **Standardize yes/no prompts to `(y/n)`** (lowercase, parens, no default-letter capitalization) across `agent/skills/define-spec/SKILL.md`, `agent/skills/define-spec/procedure.md`, and `agent/skills/refine-plan/SKILL.md`. The two `[Y/n]` occurrences in `refine-plan/SKILL.md` (currently at lines 178 and 197) become `(y/n)`.
- **Standardize choice-menu labels to single-letter mnemonics** in all `define-spec` prompts that present options. No Roman numerals; no numbered lists. Letter selection should follow established conventions where they exist (`(c)` = commit/continue, `(r)` = refine/remediate, `(x)` = stop) and use mnemonic-friendly letters otherwise.
- **Consolidate the Step 5 review prompt and Step 7 recovery menu in `SKILL.md` into a single 3-option prompt** presented upfront after the spec is written:
  - `(c) Commit` — commit the spec to git
  - `(r) Refine` — re-run define-spec to refine this draft
  - `(x) Stop` — leave the spec uncommitted

  The user no longer has to "reject" first to discover the non-commit options. The "Redo" label is replaced with "Refine" so the label matches the existing re-dispatch-with-existing-spec behavior. The "Delete" option is removed entirely.
- **Update the Step 8 generate-plan offer in `SKILL.md`** to read: `Spec committed at <path>. Run generate-plan next? (y/n)` (procedural choice — no recommendation prefix).
- **Update the Step 5 architecture-need assessment in `procedure.md`** to a recommendation block followed by a `(y/n)` question, replacing the "confirm, force on, or force off" 3-option phrasing. The recommendation states whether the work involves load-bearing architectural choices and gives one-or-two-sentence reasoning; the question is `Run architecture round? (y/n)`.
- **Update the Step 3 scope-decomposition check in `procedure.md`** to a recommendation block followed by a `(y/n)` question. The recommendation lists the detected subsystems and explains why a split is recommended; the question is `Split into separate specs? (y/n)`. The fallback behavior (single spec with an Open Question recording the breadth) remains when the user answers no.
- **Update the Step 6 architecture approaches selection in `procedure.md`** to a lettered-options menu with a recommendation. The format uses `(a)`, `(b)`, and optionally `(c)` for the proposed approaches with one-line trade-offs each, followed by `I recommend (<letter>) because <reason>.` and the prompt `Pick one (a/b/c), or describe your own.` (drop `c` from the prompt when only two approaches are presented). The "describe your own" escape hatch is preserved.
- **Add a top-level "Interaction conventions" section to `procedure.md`** above the existing Step 1, containing two universal rules that govern Steps 3, 4, 5, and 6:
  - **Recommend with every spec-content question.** Each spec-content question (scope-decomposition, intent Q&A, architecture-need, architecture approaches) must be preceded by a recommendation that names a specific answer or direction and gives a one-sentence rationale. Procedural choices (the orchestrator's commit gate, the generate-plan continuation offer) do not require a recommendation.
  - **One question per turn.** Never bundle multiple questions into a single turn. Multi-option prompts (e.g., `(a)/(b)/(c)` menus, `(y/n)` questions) count as one question.

  Steps 3, 4, 5, and 6 should defer to this section rather than restating the rules. The current Step 4 line "Ask one question at a time. Multi-choice preferred where possible." should be reduced or removed in favor of the top-level convention.
- **Preserve all existing behavior beyond the explicit changes above.** The orchestrator's mux/inline branch detection, dispatch path, transcript-backed recovery, validation logic, and `commit`-skill invocation are unchanged. The `(r) Refine` option re-uses the existing existing-spec re-dispatch path (preamble preservation, same-path overwrite). The `(x) Stop` option preserves the current "Leave it" output (`Leaving <path> uncommitted. Edit and commit yourself.`).

## Constraints

- Behavior changes are limited to two items: removing the Delete option from the orchestrator's review/recovery flow, and consolidating the Step 5 review prompt with the Step 7 recovery menu so options are shown upfront rather than after rejection. No other control-flow changes.
- The "Interaction conventions" section in `procedure.md` governs procedure-level interactive steps (3, 4, 5, 6) only. It does not govern `SKILL.md` prompts; the orchestrator's commit gate and continuation offer remain procedural and recommendation-free.
- Cross-skill yes/no formatting changes are scoped to `agent/skills/refine-plan/SKILL.md`'s two `[Y/n]` strings. Do not modify `execute-plan`, `commit`, `generate-plan`, or other peer skills.
- The yes/no convention is `(y/n)` exactly (lowercase letters, parens, slash separator, no default capitalization, no brackets). Do not introduce a third style.
- Do not modify `procedure.md` step numbering, the Step 8 spec template, mux-probe rules in `SKILL.md`, model-tier resolution, the transcript-backed recovery logic in `SKILL.md` Step 4, or the inline-branch hand-back in Step 3b.
- Do not introduce a new way to delete a draft spec via the orchestrator. Removing the Delete option is intentional; users who want the file gone can pick `(x) Stop` and delete it manually.

## Acceptance Criteria

- Every yes/no prompt in `agent/skills/define-spec/SKILL.md`, `agent/skills/define-spec/procedure.md`, and `agent/skills/refine-plan/SKILL.md` uses the form `(y/n)` exactly. No `[Y/n]`, `[y/N]`, `[y/n]`, `(Y/n)`, or other variant remains in those three files.
- The orchestrator presents the consolidated review prompt with `(c) Commit / (r) Refine / (x) Stop` as its three options, listed upfront in a single menu after the spec is written. There is no separate "recovery menu" step that is reached only via rejection.
- The orchestrator no longer offers a Delete option; the spec file is never removed by the orchestrator's review/recovery flow.
- Selecting `(r) Refine` triggers the same recursive `define-spec` invocation against the existing spec path that today's "Redo" triggers (existing-spec branch in `procedure.md` Step 1, preamble preservation, same-path overwrite).
- Selecting `(x) Stop` produces the same `Leaving <path> uncommitted. Edit and commit yourself.` output that today's "Leave it" produces.
- The Step 8 generate-plan offer reads exactly `Spec committed at <path>. Run generate-plan next? (y/n)`, with no "I recommend" prefix.
- The Step 5 architecture-need assessment in `procedure.md` is structured as a recommendation block followed by `Run architecture round? (y/n)`. The phrases "confirm, force on, or force off" no longer appear.
- The Step 3 scope-decomposition check in `procedure.md` is structured as a recommendation listing detected subsystems followed by `Split into separate specs? (y/n)`.
- The Step 6 architecture approaches selection in `procedure.md` presents lettered options `(a)`, `(b)`, optionally `(c)` with trade-offs, a `I recommend (<letter>) because <reason>.` line, and the prompt `Pick one (a/b/c), or describe your own.` (or `Pick one (a/b), or describe your own.` for two-option cases).
- `procedure.md` contains a top-level "Interaction conventions" section above Step 1 stating both rules (always recommend on spec-content questions; one question per turn) with enough specificity to govern future edits.
- The current Step 4 sentence "Ask one question at a time. Multi-choice preferred where possible." is either removed or replaced with a deferral to the Interaction conventions section.
- Manual exercise: running `/define-spec` against a todo, walking through to the review prompt, and choosing each of `(c)`, `(r)`, and `(x)` produces the expected outcome (commit; refine via existing-spec re-dispatch; leave-uncommitted message). Running `/refine-plan` produces a `(y/n)` prompt for the commit gate, not `[Y/n]`.

## Non-Goals

- Rewriting the orchestration logic in `define-spec/SKILL.md` (mux probe, dispatch, transcript-backed recovery, model-tier resolution, validation cases).
- Changing `execute-plan`, `commit`, `generate-plan`, or any peer skill's dialogue style beyond the two `[Y/n]` → `(y/n)` updates in `refine-plan/SKILL.md`.
- Introducing a new way for `define-spec` to delete a spec file. The Delete option is removed deliberately.
- Adding default-letter or default-keystroke conventions (no `[Y/n]`-style capital defaults). The chosen `(y/n)` form has no implicit default.
- Reorganizing the step structure of `procedure.md`. The new "Interaction conventions" section is additive at the top; existing Steps 1–9 keep their numbering and structure.
- Changing the spec template in `procedure.md` Step 8.
- Adding scout-brief or todo-input handling beyond what already exists.
