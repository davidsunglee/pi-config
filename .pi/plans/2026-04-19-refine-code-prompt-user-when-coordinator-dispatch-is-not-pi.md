# Plan: Prompt user when refine-code coordinator dispatch is not `pi`

**Source:** TODO-6073d7c1

## Goal

Harden `refine-code`'s coordinator launch so it never runs under a non-`pi` host. The host runtime `<dispatch>` mechanism only passes through nested `model:` / `dispatch:` pairs when the host itself is `pi`; under `claude` (or any other non-`pi` host) the nested model ids are silently coerced to the host's own tier labels, which has already caused a cross-provider `code-reviewer` (meant to run under `openai-codex/gpt-5.4`) to be downgraded to `opus`. The fix inserts an interactive confirmation step between the matrix read and the coordinator dispatch: if the resolved dispatch is anything other than `pi`, stop and offer three choices (override dispatch to `pi` for this run, pick a different coordinator model, or cancel). The nested dispatch algorithm inside `refine-code-prompt.md` is untouched — once the coordinator is guaranteed to run under `pi`, its nested dispatches work as designed.

## Architecture summary

- `~/.pi/agent/skills/refine-code/SKILL.md` is the entry-point skill. Its Step 2 reads `~/.pi/agent/model-tiers.json` and resolves the coordinator dispatch; Step 4 launches the `code-refiner` coordinator with `model` and `dispatch` from that resolution; Step 5 parses the coordinator's result.
- `~/.pi/agent/skills/refine-code/refine-code-prompt.md` is the template sent to the coordinator. It includes its own "Dispatch resolution" section describing how the coordinator resolves dispatch for nested subagent calls (reviewer, remediator). That algorithm stays as-is.
- The dispatch resolution algorithm (extract provider prefix, look up in `dispatch` map, default to `"pi"`) is already specified in SKILL.md Step 2 by reference to execute-plan Step 6, and restated verbatim in `refine-code-prompt.md`. The new confirmation step reuses that same algorithm when the user picks choice (2) and supplies a replacement model.
- `model-tiers.json` shape is unchanged. No persistent state is written. The override in choice (1) is scoped to the current run (one launch of the coordinator).

## Tech stack

- Markdown skill files loaded by the pi agent harness. No code executes directly from these files; they are LLM instructions.
- Dispatch is a runtime property on subagent launches interpreted by the host harness.
- JSON config at `~/.pi/agent/model-tiers.json`.

## File Structure

- `~/.pi/agent/skills/refine-code/SKILL.md` (Modify) — Insert a new Step 3 "Confirm coordinator dispatch" between the current Step 2 (model matrix read) and the current Step 3 (prompt assembly). Renumber existing Steps 3→4, 4→5, 5→6. Update the Edge Cases fallback so it also routes through the new confirmation step when the fallback model's dispatch resolves to non-`pi`. Update the cross-reference in Step 4 (formerly Step 3) from "Step 2" to "Step 2" (unchanged — Step 2 still does resolution) where needed.
- `~/.pi/agent/skills/refine-code/refine-code-prompt.md` (Modify) — Add a short, non-behavioral note under "Dispatch resolution" clarifying that the coordinator is guaranteed to run on a `pi` host (SKILL.md enforces this before dispatch), so the nested resolution algorithm below is honored verbatim. No algorithmic change.

## Tasks

### Task 1: Add "Confirm coordinator dispatch" step to SKILL.md

**Files:**
- Modify: `~/.pi/agent/skills/refine-code/SKILL.md`

**Steps:**

- [ ] **Step 1: Open SKILL.md** — open `~/.pi/agent/skills/refine-code/SKILL.md` and locate the boundary between the end of current Step 2 (the "Dispatch resolution" paragraph ending with `... see `refine-code-prompt.md`.") and the start of current Step 3 (`## Step 3: Assemble coordinator prompt`). The new section is inserted immediately before the `## Step 3: Assemble coordinator prompt` heading.

- [ ] **Step 2: Insert new Step 3 heading and rationale paragraph** — insert the following heading and opening paragraph:

  ```markdown
  ## Step 3: Confirm coordinator dispatch

  The `code-refiner` coordinator must run on a `pi` host. When the host is anything else (notably `claude`), the host runtime silently coerces nested `model:` and `dispatch:` pairs emitted by the coordinator to its own tier labels — so a nested `code-reviewer` meant to run as `openai-codex/gpt-5.4` would be coerced to `opus`, and the cross-provider review would not actually run.
  ```

- [ ] **Step 3: Insert the branch logic** — directly after the paragraph from Step 2, insert:

  ```markdown
  Let `M` be the resolved coordinator model (from `standard` in the model matrix) and `D` be its resolved dispatch (from Step 2's algorithm).

  - **If `D == "pi"`:** proceed to Step 4 unchanged. Use `(M, D)` when dispatching the coordinator.
  - **If `D != "pi"`:** stop and prompt the user. Do not assemble the coordinator prompt and do not dispatch.
  ```

- [ ] **Step 4: Insert the user-prompt specification** — directly after Step 3's insertion, insert the explicit prompt contract:

  ```markdown
  ### User prompt (shown only when `D != "pi"`)

  Present this exact information to the user:

  - The resolved coordinator model `M`.
  - The resolved dispatch `D`.
  - A short warning: "The host runtime only passes through nested `model:` and `dispatch:` pairs when the host is `pi`. Under `D=<D>`, nested subagents dispatched by the coordinator (e.g., `code-reviewer` on `openai-codex/gpt-5.4`) will be silently coerced to the host's own tier labels, so cross-provider review and remediation would not actually run."

  Offer three choices:

  - **(1) Keep the model, override dispatch to `pi` for this run only.** Use `(M, "pi")` when dispatching the coordinator. Do not write to `model-tiers.json`. Do not persist the choice. Continue to Step 4.
  - **(2) Pick a different coordinator model.** Accept a model id string from the user (e.g., `anthropic/claude-opus-4-7`). Re-resolve its dispatch using the same algorithm referenced in Step 2 (extract the provider prefix before the first `/`; look up the prefix in the `dispatch` object from `model-tiers.json`; default to `"pi"` if absent). Set `M` to the new model and `D` to the newly resolved dispatch, then re-enter this Step 3 from the branch check with the new `(M, D)` pair.
  - **(3) Cancel execution.** Stop the skill cleanly. Do not assemble the coordinator prompt. Do not dispatch any subagent. Do not commit. Report to the caller: "refine-code cancelled: coordinator dispatch required confirmation and user cancelled."
  ```

- [ ] **Step 5: Insert the re-selection cap** — directly after the three choices, insert the 5-attempt cap contract:

  ```markdown
  ### Re-selection cap

  Track the count of choice-(2) re-selections. Allow up to 5 re-selections. If the 6th resolved dispatch (the original plus 5 re-selections) is still not `pi`, stop with this error, naming every model the user tried in order:

  "refine-code cannot launch the coordinator: after 5 re-selection attempts, no chosen model resolved to `dispatch: pi`. Models tried: <M0>, <M1>, ..., <M5>."

  Do not dispatch. Do not commit.
  ```

- [ ] **Step 6: Renumber downstream headings** — change `## Step 3: Assemble coordinator prompt` to `## Step 4: Assemble coordinator prompt`, `## Step 4: Dispatch code-refiner` to `## Step 5: Dispatch code-refiner`, and `## Step 5: Handle code-refiner result` to `## Step 6: Handle code-refiner result`. Keep the body of each unchanged except for the explicit dispatch-value references in the next step.

- [ ] **Step 7: Update the renumbered Step 5 (Dispatch) to use the confirmed pair** — in the `subagent { ... }` block inside the renumbered Step 5, change the comment markers for model/dispatch from `"<standard from model matrix>"` / `"<dispatch for standard>"` to `"<confirmed coordinator model from Step 3>"` / `"<confirmed coordinator dispatch from Step 3 — guaranteed `pi`>"`. The block otherwise stays identical:

  ```
  subagent {
    agent: "code-refiner",
    task: "<filled refine-code-prompt.md>",
    model: "<confirmed coordinator model from Step 3>",
    dispatch: "<confirmed coordinator dispatch from Step 3 — guaranteed `pi`>"
  }
  ```

- [ ] **Step 8: Update Edge Cases fallback** — locate the bullet `- **Code-refiner fails to dispatch** (model unavailable): Retry with \`capable\` from the model matrix (re-resolving dispatch for the fallback model). If that also fails, stop with error.` and replace it with:

  `- **Code-refiner fails to dispatch** (model unavailable): Take the \`capable\` model from the model matrix and resolve its dispatch, then **re-enter Step 3 (Confirm coordinator dispatch)** with that fallback \`(M, D)\` pair. The same user prompt / pi-only rule applies. If the user cancels or the re-selection cap is reached, stop with the corresponding Step 3 error. If the second dispatch still fails at runtime, stop with error.`

- [ ] **Step 9: Update the stale Handle-result cross-reference** — in the renumbered `## Step 6: Handle code-refiner result` section, locate the bullet `**(a) Keep iterating** — re-invoke this skill from Step 3 with the same inputs but \`HEAD_SHA\` updated to current HEAD (budget resets, new cycle)`. Change `re-invoke this skill from Step 3` to `re-invoke this skill from Step 4` so the reference points at the renumbered Assemble-coordinator-prompt section (the original intent: re-assemble and re-dispatch with the already-confirmed `(M, D)` pair from the prior pass). Leave every other word in that bullet untouched.

- [ ] **Step 10: Verify headings and cross-references** — re-read the modified SKILL.md top to bottom. Confirm the heading sequence is: Step 1 → Step 2 → Step 3 (new, Confirm coordinator dispatch) → Step 4 (Assemble) → Step 5 (Dispatch) → Step 6 (Handle result) → Edge Cases. Confirm no leftover references to the old numbering (search for "Step 3", "Step 4", "Step 5" in body text and confirm each now points at the correct renumbered section; the only body-text change beyond the insertions/renumbers above is the Step 9 fix to the Handle-result bullet). The "See execute-plan Step 6 for the full resolution algorithm" reference inside Step 2 is unchanged.

**Acceptance criteria:**

- SKILL.md contains a new `## Step 3: Confirm coordinator dispatch` section sited between the existing Step 2 and the (renumbered) Assemble-coordinator-prompt step.
  Verify: `grep -n '^## Step' ~/.pi/agent/skills/refine-code/SKILL.md` emits, in order, `## Step 1`, `## Step 2`, `## Step 3: Confirm coordinator dispatch`, `## Step 4: Assemble coordinator prompt`, `## Step 5: Dispatch code-refiner`, `## Step 6: Handle code-refiner result` — the new `Step 3` heading appears immediately after `## Step 2` and before `## Step 4: Assemble coordinator prompt`.
- The new section explicitly enumerates the three choices described in the task, with exact wording for choice (1) being a dispatch-only override that does not mutate `model-tiers.json`, choice (2) requiring re-resolution of the new model's dispatch through the same algorithm, and choice (3) exiting cleanly.
  Verify: read `~/.pi/agent/skills/refine-code/SKILL.md` under `## Step 3: Confirm coordinator dispatch` and confirm all three bullets are present: `**(1) Keep the model, override dispatch to \`pi\` for this run only.**` with the literal sentences `Do not write to \`model-tiers.json\`.` and `Do not persist the choice.`; `**(2) Pick a different coordinator model.**` instructing to re-resolve dispatch using the Step 2 algorithm (prefix extraction, map lookup, default `"pi"`) and re-enter Step 3; and `**(3) Cancel execution.**` stating the skill stops cleanly with no dispatch and no commit.
- The re-selection cap is stated as 5 re-selections; the 6th non-`pi` resolution fails with an error naming every model tried in order.
  Verify: inside the `### Re-selection cap` subsection of `## Step 3` in `~/.pi/agent/skills/refine-code/SKILL.md`, confirm the text contains both the phrase `up to 5 re-selections` and the phrase `6th resolved dispatch`, and that the error template begins with `refine-code cannot launch the coordinator: after 5 re-selection attempts, no chosen model resolved to \`dispatch: pi\`. Models tried:` and ends with a comma-separated list template `<M0>, <M1>, ..., <M5>`.
- Downstream sections are renumbered: Assemble → Step 4, Dispatch → Step 5, Handle result → Step 6.
  Verify: `grep -nE '^## Step [0-9]+: (Assemble coordinator prompt|Dispatch code-refiner|Handle code-refiner result)$' ~/.pi/agent/skills/refine-code/SKILL.md` emits exactly three lines in this order: `## Step 4: Assemble coordinator prompt`, `## Step 5: Dispatch code-refiner`, `## Step 6: Handle code-refiner result`; no `## Step 3: Assemble …`, `## Step 4: Dispatch …`, or `## Step 5: Handle …` headings remain.
- The dispatch block in the renumbered Step 5 references values confirmed in Step 3, not raw matrix values.
  Verify: inside the `subagent { ... }` block under `## Step 5: Dispatch code-refiner` in `~/.pi/agent/skills/refine-code/SKILL.md`, the `model:` line reads `"<confirmed coordinator model from Step 3>"` and the `dispatch:` line reads ``"<confirmed coordinator dispatch from Step 3 — guaranteed `pi`>"``; neither `<standard from model matrix>` nor `<dispatch for standard>` appears anywhere in that block.
- The Edge Cases `capable`-fallback bullet routes through Step 3 rather than bypassing it.
  Verify: in the `## Edge Cases` section of `~/.pi/agent/skills/refine-code/SKILL.md`, the `Code-refiner fails to dispatch` bullet contains the substring `re-enter Step 3 (Confirm coordinator dispatch)` and no longer contains the earlier text `Retry with \`capable\` from the model matrix (re-resolving dispatch for the fallback model)` as a standalone terminal instruction.
- The Handle-result iterate bullet points at the renumbered Assemble step.
  Verify: inside the `## Step 6: Handle code-refiner result` section of `~/.pi/agent/skills/refine-code/SKILL.md`, the `**(a) Keep iterating**` bullet contains the substring `re-invoke this skill from Step 4` and no longer contains `re-invoke this skill from Step 3`.
- No other behavior (prompt assembly, coordinator contract, result parsing) changes. The only permitted edits are: the new `## Step 3: Confirm coordinator dispatch` block (heading + all inserted subsections), the renumbering of the three downstream `## Step` headings (Assemble → 4, Dispatch → 5, Handle result → 6), the two comment-marker lines inside the Step 5 `subagent { ... }` block, the `Code-refiner fails to dispatch` Edge Cases bullet, and the one-word change from `Step 3` to `Step 4` inside the `**(a) Keep iterating**` bullet of Step 6.
  Verify: before starting Task 1, copy the file to a temp baseline: `cp ~/.pi/agent/skills/refine-code/SKILL.md /tmp/SKILL.md.pre-task1`. After completing all Task 1 steps, run `diff /tmp/SKILL.md.pre-task1 ~/.pi/agent/skills/refine-code/SKILL.md` and confirm every hunk falls within exactly one of the permitted edits above; reject any hunk outside those regions. In addition, confirm `grep -c '^## Step 1: Gather inputs$' ~/.pi/agent/skills/refine-code/SKILL.md` and `grep -c '^## Step 2: Read model matrix$' ~/.pi/agent/skills/refine-code/SKILL.md` each return `1` (Steps 1 and 2 headings are byte-identical), and that the `## Edge Cases` section still contains the `No changes in range` and `Empty requirements` bullets unchanged (grep for each bullet's opening literal substring and confirm a match).

**Model recommendation:** standard

### Task 2: Add clarifying note to refine-code-prompt.md

**Files:**
- Modify: `~/.pi/agent/skills/refine-code/refine-code-prompt.md`

**Steps:**

- [ ] **Step 1: Open refine-code-prompt.md** — open `~/.pi/agent/skills/refine-code/refine-code-prompt.md` and locate the `### Dispatch resolution` heading (around line 34) and its final paragraph ("Always pass `dispatch` explicitly on every subagent call, even when it resolves to `"pi"`.").

- [ ] **Step 2: Append host-guarantee note** — immediately after the "Always pass `dispatch` explicitly..." paragraph and before the next heading (`## Protocol`), insert a single new paragraph:

  > Note: the `refine-code` skill guarantees this coordinator runs on a `pi` host (see `SKILL.md` Step 3). That guarantee is what makes the algorithm above actually effective — on a non-`pi` host, the runtime would silently coerce nested `model:` and `dispatch:` values to its own tier labels, and cross-provider review/remediation would not run as written. You do not need to re-verify the host; just follow the algorithm above for every nested subagent call.

- [ ] **Step 3: Re-read the file** — confirm the inserted paragraph is inside the `### Dispatch resolution` subsection (still under `### Model Matrix`) and ahead of `## Protocol`. Confirm no other text was changed.

**Acceptance criteria:**

- `refine-code-prompt.md` contains one new paragraph under `### Dispatch resolution` that names the `pi`-host guarantee and points to `SKILL.md` Step 3.
  Verify: open `~/.pi/agent/skills/refine-code/refine-code-prompt.md`, locate the `### Dispatch resolution` subsection, and confirm a single new paragraph appears after the `Always pass \`dispatch\` explicitly on every subagent call, even when it resolves to \`"pi"\`.` paragraph and before the next `## Protocol` heading; the new paragraph must contain both the substring `runs on a \`pi\` host` and the substring `SKILL.md` Step 3`.
- No algorithmic change — the four-step dispatch resolution procedure and the fallback-to-`pi` default remain as written.
  Verify: before starting Task 2, copy the file to a temp baseline: `cp ~/.pi/agent/skills/refine-code/refine-code-prompt.md /tmp/refine-code-prompt.md.pre-task2`. After completing Task 2, run `diff /tmp/refine-code-prompt.md.pre-task2 ~/.pi/agent/skills/refine-code/refine-code-prompt.md` and confirm it emits only `>`-prefixed addition lines (no `<` deletion lines, no change hunks), and that every added line falls inside the `### Dispatch resolution` subsection between the `Always pass \`dispatch\` explicitly ...` paragraph and the `## Protocol` heading. As a second independent check, grep the post-edit file for each of the four original dispatch-resolution anchors and confirm each returns at least one match: `extract` + `prefix` + `first /`; `look up` in `dispatch`; `default to` `"pi"`; `Always pass \`dispatch\` explicitly`.
- No other sections are modified.
  Verify: using the same `diff /tmp/refine-code-prompt.md.pre-task2 ~/.pi/agent/skills/refine-code/refine-code-prompt.md`, confirm every reported line number on the post-edit side lies inside the `### Dispatch resolution` subsection (between the line numbers of `### Dispatch resolution` and the next `##`-or-shallower heading, which is `## Protocol`). No hunks may reference line numbers above `### Dispatch resolution` or at/after `## Protocol`. If `diff` emits nothing outside those line-number bounds, this check passes.

**Model recommendation:** cheap

### Task 3: End-to-end review of the coordinator-launch contract

**Files:**
- Modify: none (read-only verification pass)

**Steps:**

- [ ] **Step 1: Simulate the `pi` path** — read the modified `SKILL.md` top to bottom assuming `model-tiers.json` has `standard: "anthropic/claude-sonnet-4-6"` and `dispatch: { "anthropic": "pi" }`. Confirm Step 3 takes the fast path (no prompt) and the renumbered Step 5 dispatches with `(M, "pi")`.

- [ ] **Step 2: Simulate the `claude` path, choice (1)** — re-read assuming `dispatch: { "anthropic": "claude" }`. Confirm Step 3 prompts, choice (1) yields `(M, "pi")` for Step 5 without touching `model-tiers.json`, and the warning text matches the contract (names `M`, names `D=claude`, explains nested coercion).

- [ ] **Step 3: Simulate the `claude` path, choice (2) that resolves to `pi`** — re-read assuming the user picks `openai-codex/gpt-5.4` with `dispatch: { "openai-codex": "pi" }`. Confirm the re-entry branch uses the same algorithm (prefix extraction, map lookup, default `pi`) and that Step 3 exits via the `D == "pi"` branch on the second pass.

- [ ] **Step 4: Simulate the cap** — re-read assuming the user keeps picking `claude`-dispatched models. Confirm the 6th non-`pi` resolution fails with the error message naming every model the user tried in order, and that no coordinator dispatch happens.

- [ ] **Step 5: Simulate choice (3)** — confirm the skill stops cleanly with the cancellation message, no prompt assembly, no dispatch, no commits.

- [ ] **Step 6: Simulate Edge Cases fallback** — confirm the `capable` fallback bullet re-enters Step 3 and is subject to the same prompt / cap.

- [ ] **Step 7: Simulate `refine-code-prompt.md` under the guarantee** — read the modified prompt file. Confirm the new paragraph is the only change and that the host-guarantee note appears before `## Protocol`.

**Acceptance criteria:**

- All six simulated scenarios behave as described without contradiction or ambiguity in the skill text.
  Verify: read `~/.pi/agent/skills/refine-code/SKILL.md` and `~/.pi/agent/skills/refine-code/refine-code-prompt.md` end-to-end and confirm each scenario resolves as specified — (a) `pi` path takes the fast branch in Step 3 and dispatches `(M, "pi")` at Step 5; (b) `claude` path choice (1) dispatches `(M, "pi")` at Step 5 without any instruction to write `model-tiers.json`; (c) `claude` path choice (2) resolving to `pi` re-enters Step 3 once and exits via the `D == "pi"` branch; (d) repeated `claude` choices terminate at the 6th resolution with the cap error listing every tried model; (e) choice (3) stops cleanly with the cancellation message and no Step 4/5/6 actions; (f) the Edge Cases `Code-refiner fails to dispatch` bullet routes back into Step 3. Any scenario that cannot be traced unambiguously through the skill text fails this check.
- No placeholder text (`TBD`, `TODO`, `…`) is left in either modified file.
  Verify: `grep -nE 'TBD|TODO|\.\.\.|…' ~/.pi/agent/skills/refine-code/SKILL.md ~/.pi/agent/skills/refine-code/refine-code-prompt.md` returns no matches outside the intentional `<M0>, <M1>, ..., <M5>` template inside the re-selection cap error string; every other hit fails this check.
- No references to the old step numbering linger in SKILL.md.
  Verify: `grep -nE '(Step 3: Assemble coordinator prompt|Step 4: Dispatch code-refiner|Step 5: Handle code-refiner result)' ~/.pi/agent/skills/refine-code/SKILL.md` returns zero matches, and every body-text mention of `Step 3`, `Step 4`, `Step 5`, and `Step 6` in the file refers to the new numbering (Step 3 = Confirm coordinator dispatch, Step 4 = Assemble coordinator prompt, Step 5 = Dispatch code-refiner, Step 6 = Handle code-refiner result).

**Model recommendation:** standard

## Dependencies

- Task 2 depends on: Task 1 (Task 2's note references `SKILL.md` Step 3, which Task 1 creates)
- Task 3 depends on: Task 1, Task 2

## Risk Assessment

- **Risk: Re-selection cap is ambiguous ("5 attempts" vs "6th resolution").** Mitigation: the inserted text in Task 1 Step 5 states the cap in both forms — "up to 5 re-selections" and "the 6th resolved dispatch". The plan explicitly ties them together to avoid an off-by-one in implementation.
- **Risk: Downstream steps reference the old numbering.** Mitigation: Task 1 Step 9 requires a full-file re-read and scan for stale step references. Task 3 Step 1 re-reads the file end-to-end.
- **Risk: The Edge Cases fallback silently bypasses the new step.** Mitigation: Task 1 Step 8 explicitly rewrites the fallback bullet to route through Step 3, and Task 3 Step 6 verifies it.
- **Risk: Coordinator prompt claims the host is `pi` when it isn't.** Mitigation: the note in Task 2 only asserts the guarantee; the actual enforcement is in SKILL.md Step 3. As long as Step 3 is correctly implemented, the guarantee holds. Task 3 verifies the two files are consistent.
- **Risk: User's replacement model in choice (2) has no `/` prefix.** Mitigation: the referenced Step 2 algorithm already handles this — "extract the substring before the first `/`" and default to `"pi"` if the map has no entry — so a bare model id resolves to `pi` and exits the prompt cleanly. Called out implicitly by "default to `"pi"` if absent".
- **Risk: Persistent state creep.** The task explicitly forbids writing `model-tiers.json` or any per-user state. Task 1 Steps 3–4 restate "Do not write to `model-tiers.json`. Do not persist the choice."

## Review Notes

_Added by plan reviewer — informational, not blocking._

### Warnings
- **Task 1**:
  - **What:** Task 1 Step 9 changes the Handle-result bullet to `re-invoke this skill from Step 4` and the plan rationale says this preserves the “already-confirmed `(M, D)` pair from the prior pass.” But the plan does not add `M`/`D` to Step 1 inputs, does not define any in-memory carry-forward mechanism, and the spec explicitly says choice (1) is for “this run only” with no persisted state.
  - **Why it matters:** If “Keep iterating” means a fresh invocation of `refine-code`, starting at Step 4 would bypass the new confirmation gate or require the executor to invent state that the skill never collected. That creates ambiguity in the resulting skill and risks violating the spec’s non-persistent, per-run confirmation behavior.
  - **Recommendation:** Clarify the intended control flow for this branch. Either state that “Keep iterating” is an in-run continuation where the confirmed `(M, D)` remain in scope, or route a fresh invocation back through the new confirmation step instead of Step 4.
