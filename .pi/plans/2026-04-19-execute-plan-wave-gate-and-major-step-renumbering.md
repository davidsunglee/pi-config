# Execute-plan Wave Gate Merge and Major-Step Renumbering

**Source:** TODO-86666846
**Spec:** `.pi/specs/2026-04-19-execute-plan-wave-gate-and-major-step-renumbering.md`

## Goal

Consolidate the two wave-level post-dispatch gates in `agent/skills/execute-plan/SKILL.md` (the blocked-task escalation gate and the concerns checkpoint, currently split across top-level `## Step 9.5` and `## Step 9.7` headings) into a single combined wave-gate major step; centralize the per-task retry-budget rule in Step 12 so the merged gate only points at it; reduce Step 3's duplicated worktree-reuse prose to a short pointer at the canonical Step 0 logic; and renumber all top-level `## Step ...` headings so they use integer-only numbering (`## Step 10`, `## Step 11`, …) with all internal cross-references updated. No behavior change — this is a pure docs-structural refactor.

## Architecture summary

`agent/skills/execute-plan/SKILL.md` is a single long skill document that is read verbatim by the `execute-plan` skill loader. It declares a linear numbered protocol (`## Step 0` … `## Step 15` today, with decimal-numbered inserts `## Step 9.5` and `## Step 9.7`). Step 9 dispatches workers and classifies their responses. When a wave drains, `## Step 9.5` handles `BLOCKED` tasks, then `## Step 9.7` handles `DONE_WITH_CONCERNS` tasks, then `## Step 10` verifies, `## Step 11` commits + runs integration tests, `## Step 12` is the retry-budget canonical site, `## Step 13`/`14`/`15` are report / review / complete. A sibling file `integration-regression-model.md` cross-references `Step 11` and `Step 15` by number. After this refactor:

- The `## Step 9.5` and `## Step 9.7` major sections are replaced by one combined `## Step 10` ("Wave gate: blocked and concerns handling") that runs blocked handling first, then concerns handling, then exits to verification.
- The old `## Step 10` through `## Step 15` become `## Step 11` through `## Step 16`.
- Lower-level subsections under the old `## Step 10` (`### Step 10.1`, `### Step 10.2`, `### Step 10.3`) are renumbered to `### Step 11.1`, `### Step 11.2`, `### Step 11.3`.
- The per-task retry-budget rule (shared counter across re-dispatch paths + sub-task inheritance) appears exactly once in the renumbered `## Step 13` (the old `## Step 12`); every other mention in the merged wave-gate section becomes a one-line pointer.
- `integration-regression-model.md` cross-refs are updated from `Step 11` → `Step 12` and `Step 15` → `Step 16` so the references remain accurate (this is strictly required for correctness after the renumbering and nothing else in that sibling doc is touched).

## Tech stack

- Markdown content files under `agent/skills/execute-plan/`.
- No build system / compiler for this skill; verification is structural (grep, file inspection, cross-reference checks).
- Git-tracked repository at `/Users/david/Code/pi-config`.

## File Structure

- `agent/skills/execute-plan/SKILL.md` (Modify) — Merge `## Step 9.5` + `## Step 9.7` into a single combined wave-gate major step, trim Step 3's duplicated reuse prose, centralize the per-task retry-budget rule in the (renumbered) Step 13, and renumber every top-level `## Step ...` heading to integer-only numbering with all internal cross-references updated in place.
- `agent/skills/execute-plan/integration-regression-model.md` (Modify) — Update the four cross-references to the renumbered major steps so the sibling doc stays accurate (`Step 11` → `Step 12`, `Step 15` → `Step 16`). No other edits.

## Tasks

### Task 1: Merge `## Step 9.5` and `## Step 9.7` into one combined wave-gate major step

**Files:**
- Modify: `agent/skills/execute-plan/SKILL.md`

**Steps:**
- [ ] **Step 1: Locate the two gate sections** — In `agent/skills/execute-plan/SKILL.md`, identify the block that runs from the line `## Step 9.5: Blocked-task escalation gate` (line 364 in current file) through the final line of `## Step 9.7: Wave-level concerns checkpoint` (line 491 in current file, ending with "The only other exit is `(x) Stop execution` via Step 13."). This whole span is what Task 1 replaces.
- [ ] **Step 2: Draft the combined header** — Replace both `## Step 9.5: ...` and `## Step 9.7: ...` with a single top-level heading: `## Step 9.5: Wave gate: blocked and concerns handling`. (The integer renumbering to `## Step 10` happens in Task 4; leave the decimal heading in place for Tasks 1–3 so intermediate reviews can diff cleanly against the original.)
- [ ] **Step 3: Write the combined preamble** — Under the new heading, write: "Run this gate once per wave after every dispatched worker has been classified by Step 9. It handles both `STATUS: BLOCKED` and `STATUS: DONE_WITH_CONCERNS` in a fixed order: blocked handling runs first, then concerns handling, then the wave exits to verification (Step 10). Any wave with at least one `BLOCKED` response pauses here before any later wave, before Step 10, and before Step 11. A wave with no `BLOCKED` and no `DONE_WITH_CONCERNS` passes through this gate without user interaction and proceeds directly to Step 10."
- [ ] **Step 4: Write the shared drain subsection** — Add `### 1. Drain the current wave` with the single paragraph: "Wait for every dispatched worker to return and Step 9 to classify each response before proceeding; the wave is then ‘drained.’ Do not start the next wave or run Step 10/Step 11 yet. Build `BLOCKED_TASKS` = every task whose most recent Step 9 status is `BLOCKED` and `CONCERNED_TASKS` = every task whose most recent Step 9 status is `DONE_WITH_CONCERNS`."
- [ ] **Step 5: Write the blocked-handling phase** — Add `### 2. Blocked handling (runs first)` with the following ordered content: (a) "If `BLOCKED_TASKS` is empty, skip this phase entirely and proceed to the Concerns handling phase below." (b) The combined escalation view rendering rules from the current Step 9.5 §3 (header line naming the wave, "Wave outcomes" block listing every task and its Step 9 status, "Blocked tasks" block containing task number, title, full blocker text, and `**Files:**`). Copy the "Example layout" fenced block verbatim from the current file (the `🚫 Wave 2: 2 task(s) BLOCKED…` example starting at line 393). (c) The per-task intervention prompt from current Step 9.5 §4, preserving all four options exactly: `(c) More context`, `(m) Better model` (with the "omit this line if current tier is already `capable`" note), `(s) Split into sub-tasks`, `(x) Stop execution`. (d) The four option semantics bullets from current Step 9.5 §4 verbatim, EXCEPT for the retry-budget sentences inside the `(s) Split into sub-tasks` bullet — replace them with the single sentence "Each split counts against the task's shared per-task retry budget and sub-tasks inherit the parent's remaining retries; see Step 12 for the canonical rule." (e) The `(x)`-short-circuit rule from current Step 9.5 §4: "If the user picks `(x) Stop execution` for any blocked task, stop the whole plan regardless of outstanding choices for other blocked tasks." (f) A re-dispatch subsection titled "Re-dispatch and re-enter" with the current Step 9.5 §5 text, with its two retry-budget sentences replaced by the single sentence "Each pass counts toward the shared per-task retry budget — see Step 12." (g) A gate-exit rule restating the current Step 9.5 §6 invariant: "This phase exits only when every task in `BLOCKED_TASKS` has yielded `DONE` or `DONE_WITH_CONCERNS` by actual worker completion, or the user picked `(x) Stop execution`. There is no skip path for `BLOCKED` tasks. On `(x)`, halt the plan immediately; do not run the Concerns handling phase, Step 10, or Step 11 for this wave."
- [ ] **Step 6: Write the concerns-handling phase** — Add `### 3. Concerns handling (runs second)` with: (a) "Precondition: the Blocked handling phase above has exited, so every task in the wave is now `DONE` or `DONE_WITH_CONCERNS`. Rebuild `CONCERNED_TASKS` from the current wave state in case blocked-phase re-dispatches added new concerned tasks." (b) "If `CONCERNED_TASKS` is empty, skip this phase and exit the gate to Step 10." (c) The combined concerned-task view fenced block from current Step 9.7 §2 verbatim (the `⚠️ Wave <N>: <M> task(s) returned DONE_WITH_CONCERNS…` block with `(c) Continue to verification`, `(r) Remediate selected task(s)`, `(x) Stop execution`). (d) The three option semantics bullets from current Step 9.7 §3 verbatim, EXCEPT for the retry-budget sentence inside the `(r)` bullet — replace "Each re-dispatch counts against that task's Step 12 retry budget (shared counter described in Step 12)." with "Each re-dispatch counts toward the shared per-task retry budget — see Step 12." (e) The loop/exit rule from current Step 9.7 §§3–4: "Repeat until `CONCERNED_TASKS` is empty (either the user picked `(c)` or every concerned task was remediated to `DONE`) or the user picked `(x)`. If any re-dispatched task comes back `BLOCKED`, re-enter the Blocked handling phase above with that task; otherwise rebuild `CONCERNED_TASKS` and re-present the combined view."
- [ ] **Step 7: Write the combined gate-exit subsection** — Add `### 4. Gate exit` with: "Exit the gate when (a) the Blocked handling phase exited with every task now `DONE` or `DONE_WITH_CONCERNS` AND (b) the Concerns handling phase exited via `(c) Continue to verification` or because every concerned task was remediated to `DONE`. The wave then proceeds to Step 10. The only alternative exit is `(x) Stop execution` from either phase, which halts the plan via Step 13 and does NOT run Step 10 or Step 11 for this wave."
- [ ] **Step 8: Remove the two old section bodies** — Delete the entire body of the former `## Step 9.7` section (everything that followed the old heading through the line "The only other exit is `(x) Stop execution` via Step 13.") now that it has been folded into the new combined section. Also delete any leftover content between the two old headings that hasn't already been replaced.
- [ ] **Step 9: Update Step 9's forward references** — In `## Step 9: Handle worker status codes` (current lines 352–362), update the three forward references to point at the merged gate: (a) the `DONE_WITH_CONCERNS` bullet currently says "Let the wave drain, then Step 9.7 presents a single combined wave-level concerns checkpoint…"; change "Step 9.7" to "the Step 9.5 wave gate (Concerns handling phase)". (b) The `BLOCKED` bullet currently says "The combined escalation is handled in Step 9.5, which surfaces every blocked task…" and "The four canonical interventions … live in Step 9.5."; change "Step 9.5" to "the Step 9.5 wave gate (Blocked handling phase)" in both places. (c) The paragraph after the bullets currently says "Step 9.5 runs first to handle any `BLOCKED` tasks. Step 9.7 then runs to handle any `DONE_WITH_CONCERNS` tasks. Only after both gates exit does Step 10 (verification) run."; change this to "The Step 9.5 wave gate runs first, handling blocked tasks and then concerned tasks in that fixed order. Only after that gate exits does Step 10 (verification) run."

**Acceptance criteria:**

- `agent/skills/execute-plan/SKILL.md` contains exactly one top-level heading whose text starts with `## Step 9.5` and its title is `## Step 9.5: Wave gate: blocked and concerns handling`.
  Verify: run `grep -nE "^## Step 9\\.[57]" agent/skills/execute-plan/SKILL.md` and confirm the output is exactly one line matching `## Step 9.5: Wave gate: blocked and concerns handling` (no `## Step 9.7` heading remains).
- The combined gate preserves all four blocked-task menu options.
  Verify: run `grep -nE "\\((c|m|s|x)\\) (More context|Better model|Split into sub-tasks|Stop execution)" agent/skills/execute-plan/SKILL.md` and confirm at least four distinct matches inside the `## Step 9.5: Wave gate` section corresponding to `(c) More context`, `(m) Better model`, `(s) Split into sub-tasks`, and `(x) Stop execution`.
- The combined gate preserves all three concerned-task menu options.
  Verify: open `agent/skills/execute-plan/SKILL.md`, locate the `### 3. Concerns handling (runs second)` subsection inside `## Step 9.5: Wave gate`, and confirm its fenced options block contains the three literal lines `(c) Continue to verification`, `(r) Remediate selected task(s)`, and `(x) Stop execution`.
- The combined gate enforces the fixed blocked-then-concerns-then-Step-10 ordering.
  Verify: open `agent/skills/execute-plan/SKILL.md`, read the preamble under `## Step 9.5: Wave gate: blocked and concerns handling`, and confirm it states literally that "blocked handling runs first, then concerns handling, then the wave exits to verification (Step 10)".
- Step 9's forward references no longer cite `Step 9.7` as a separate gate.
  Verify: run `grep -nE "Step 9\\.7" agent/skills/execute-plan/SKILL.md` and confirm the output is empty (no occurrences anywhere in the file).
- The combined gate's `Gate exit` subsection explicitly forbids running Step 10/Step 11 when `(x) Stop execution` is selected in either phase.
  Verify: open `agent/skills/execute-plan/SKILL.md`, read the `### 4. Gate exit` subsection inside `## Step 9.5: Wave gate`, and confirm it contains a sentence stating that `(x) Stop execution` from either phase halts the plan via Step 13 and does not run Step 10 or Step 11 for this wave.

**Model recommendation:** standard

---

### Task 2: Reduce Step 3's duplicated worktree-reuse prose to a short pointer at Step 0

**Files:**
- Modify: `agent/skills/execute-plan/SKILL.md`

**Steps:**
- [ ] **Step 1: Locate the duplicated prose in Step 3** — In `agent/skills/execute-plan/SKILL.md`, find (a) the third bullet under **Workspace values:** (current line 155) that begins "Already on a feature branch or in a worktree, but the user declined reuse in Step 0 by choosing `(n) Create a new worktree instead`: …" and runs to the end of that sentence ("including customization rules (see below)."), and (b) the Workspace row of the **Defaults:** table (current line 163), whose Notes cell currently reads "Non-customizable only when Step 0 auto-detected reuse and the user accepted it; otherwise shows `new worktree (branch: <suggested-branch>)` and is customizable."
- [ ] **Step 2: Rewrite the Workspace-values "declined reuse" bullet** — Replace the full text of that bullet with: `Already on a feature branch or in a worktree, but the user declined reuse in Step 0: treated identically to the main-branch new-worktree default above. See Step 0 for the reuse-decision rules.` Do NOT repeat the phrase "Create a new worktree instead" or restate the customization semantics; the pointer to Step 0 covers both.
- [ ] **Step 3: Shorten the Workspace row of the Defaults table** — Replace the Notes cell text for the Workspace row with exactly: `See Step 0 for the reuse-vs-new-worktree decision rules.` Leave the Setting and Default columns ("Workspace" and "new worktree") unchanged.
- [ ] **Step 4: Do not touch the settings summary block or customize prompts** — Confirm by re-reading the file that the fenced `Plan: …` / `Ready to execute: (s)tart / (c)ustomize / (q)uit` summary block (current lines 138–150) and the numbered customize prompts in `**If `c`:**` (current lines 181–188) are unchanged in shape and wording. Do NOT edit them in this task.

**Acceptance criteria:**

- The phrase `Reusing current workspace` appears at most twice in `agent/skills/execute-plan/SKILL.md`.
  Verify: run `grep -c "Reusing current workspace" agent/skills/execute-plan/SKILL.md` and confirm the output is a number ≤ 2.
- The phrase `Create a new worktree instead` appears at most twice in `agent/skills/execute-plan/SKILL.md`.
  Verify: run `grep -c "Create a new worktree instead" agent/skills/execute-plan/SKILL.md` and confirm the output is a number ≤ 2.
- Step 3's Defaults table Workspace-row Notes cell is a short pointer to Step 0, not a multi-sentence explanation.
  Verify: open `agent/skills/execute-plan/SKILL.md`, locate the `| Workspace |` row of the Defaults table inside `## Step 3: Confirm execution settings`, and confirm its third column (Notes) reads exactly `See Step 0 for the reuse-vs-new-worktree decision rules.` and contains no second sentence.
- Step 3's `Workspace values:` third bullet is a short pointer to Step 0, not a multi-sentence restatement.
  Verify: open `agent/skills/execute-plan/SKILL.md`, find the bullet under `**Workspace values:**` that covers the "declined reuse" case, and confirm its text is exactly `Already on a feature branch or in a worktree, but the user declined reuse in Step 0: treated identically to the main-branch new-worktree default above. See Step 0 for the reuse-decision rules.` and does not contain the phrase `Create a new worktree instead`.
- The Step 3 settings summary block and customize-prompt list are unchanged in shape and content.
  Verify: open `agent/skills/execute-plan/SKILL.md`, read the fenced block that begins `Plan:  <plan filename>` and ends with `Ready to execute: (s)tart / (c)ustomize / (q)uit`, and confirm it is byte-for-byte identical to the pre-change content (no lines added, removed, or reworded); additionally confirm the numbered list under `**If `c`:**` still contains the six numbered prompts starting with `1. Workspace — New worktree / Current workspace.` and ending with `6. Final review — Enabled / Disabled.` in the same order.

**Model recommendation:** cheap

---

### Task 3: Centralize the per-task retry-budget rule in Step 12; make the merged gate only point at it

**Files:**
- Modify: `agent/skills/execute-plan/SKILL.md`

**Dependencies:** Task 1 (the merged `## Step 9.5` gate must already exist so this task can replace retry-budget restatements inside it with pointers).

**Steps:**
- [ ] **Step 1: Read and preserve Step 12's canonical retry-budget text** — In `agent/skills/execute-plan/SKILL.md`, locate `## Step 12: Handle failures and retries`. Re-read the canonical retry-budget text inside step 1 of that section (the block that today begins "Retry automatically up to **3 times**…" and includes the **Shared counter** paragraph and the **Sub-task split budget rule** paragraph). Do NOT alter the "3 retries" value, the shared-counter semantics across Step 9.5 §5 / Step 9.7 `(r)` / Step 10 `VERDICT: FAIL`, or the sub-task inheritance rule — this task only ensures Step 12 remains the single authoritative site.
- [ ] **Step 2: Re-word Step 12's cross-references to match the merged gate** — Inside the canonical Step 12 text, the **Shared counter** paragraph currently lists "All re-dispatches from Step 9.5 §5 (blocked-task re-dispatch), Step 9.7 `(r)` remediation (concerned-task re-dispatch), and Step 10 failure routing (verifier `VERDICT: FAIL`) share a single per-task retry counter." Update the cross-reference text to: "All re-dispatches from the Step 9.5 wave gate's Blocked handling phase (including split-into-sub-tasks), the Step 9.5 wave gate's Concerns handling phase (`(r)` remediation), and Step 10 failure routing (verifier `VERDICT: FAIL`) share a single per-task retry counter." Update the **Sub-task split budget rule** paragraph's cross-reference "Choosing `(s) Split into sub-tasks` in Step 9.5 §5 consumes 1 retry…" to "Choosing `(s) Split into sub-tasks` in the Step 9.5 wave gate's Blocked handling phase consumes 1 retry…". Preserve the 3-retries-per-task budget and the inheritance-vs-fresh-budget semantics verbatim.
- [ ] **Step 3: Confirm the merged gate's Blocked handling phase retry pointers are one-line only** — In the `### 2. Blocked handling` subsection added by Task 1, confirm that (a) the `(s) Split into sub-tasks` bullet's retry-budget text is exactly one sentence pointing at Step 12 (added by Task 1 step 5(d)), and (b) the "Re-dispatch and re-enter" subsection's retry-budget text is exactly one sentence pointing at Step 12 (added by Task 1 step 5(f)). If either is longer than one sentence or still restates the 3-retry value, the shared-counter semantics, or the sub-task inheritance rule, shorten it to the canonical one-liner: `Each pass counts toward the shared per-task retry budget — see Step 12.` (or `Each split counts against the task's shared per-task retry budget and sub-tasks inherit the parent's remaining retries; see Step 12 for the canonical rule.` for the split-specific case).
- [ ] **Step 4: Confirm the merged gate's Concerns handling phase retry pointer is one-line only** — In the `### 3. Concerns handling` subsection added by Task 1, confirm the `(r) Remediate selected task(s)` bullet's retry-budget text is exactly one sentence pointing at Step 12 (added by Task 1 step 6(d)). If longer, shorten to: `Each re-dispatch counts toward the shared per-task retry budget — see Step 12.`
- [ ] **Step 5: Search the rest of the file for retry-budget restatements** — Search `agent/skills/execute-plan/SKILL.md` for the phrase `3 retries` and for `retry budget`. The only occurrences allowed are: (a) inside `## Step 12: Handle failures and retries` (the canonical text), (b) one-line pointers of the form `see Step 12` / `counts toward the shared per-task retry budget` inside the merged Step 9.5 wave gate, and (c) the existing Step 11 / Step 15 `Debugger-first flow` sentences that say "counts toward the Step 12 retry limit" / "costing a Step 12 retry" (these are already single-line pointers and must be kept as pointers, not deleted). Any remaining multi-sentence restatement of the 3-retry value, the shared-counter semantics, or the sub-task inheritance rule outside Step 12 must be shortened to a single pointer sentence matching the form used in the merged gate.

**Acceptance criteria:**

- The canonical 3-retry value appears exactly once in `agent/skills/execute-plan/SKILL.md` as an authoritative statement (inside Step 12).
  Verify: run `grep -n "3 retries" agent/skills/execute-plan/SKILL.md` and confirm every matching line is within the `## Step 12: Handle failures and retries` section; no line outside Step 12 asserts "3 retries" as a substantive rule.
- Step 12's canonical text still states both the 3-retries-per-task budget and that sub-tasks inherit the parent's remaining retries rather than receiving a fresh 3.
  Verify: open `agent/skills/execute-plan/SKILL.md`, read the canonical retry-budget paragraph inside `## Step 12: Handle failures and retries`, and confirm it contains both the literal phrase "3 times" (or "3 retries") for the per-task budget AND the literal phrase "inherits the parent's remaining retry count" (or equivalent wording explicitly saying sub-tasks do NOT receive a fresh budget).
- The merged Step 9.5 wave gate's Blocked handling retry pointer is a single sentence referencing Step 12.
  Verify: open `agent/skills/execute-plan/SKILL.md`, read the "Re-dispatch and re-enter" paragraph inside the `### 2. Blocked handling` subsection of `## Step 9.5: Wave gate`, and confirm its retry-budget mention is exactly one sentence ending in "see Step 12." and does NOT repeat the numeric "3 retries" value or the shared-counter-path enumeration.
- The merged Step 9.5 wave gate's Concerns handling retry pointer is a single sentence referencing Step 12.
  Verify: open `agent/skills/execute-plan/SKILL.md`, read the `(r) Remediate selected task(s)` bullet inside the `### 3. Concerns handling` subsection of `## Step 9.5: Wave gate`, and confirm its retry-budget mention is exactly one sentence ending in "see Step 12." and does NOT repeat the numeric "3 retries" value.
- Step 12's Shared-counter paragraph cites the merged gate by its Blocked / Concerns phase names rather than the obsolete `Step 9.5 §5` / `Step 9.7 (r)` anchors.
  Verify: run `grep -nE "Step 9\\.5 §5|Step 9\\.7" agent/skills/execute-plan/SKILL.md` and confirm the output is empty; additionally read the Shared-counter paragraph inside `## Step 12: Handle failures and retries` and confirm it names "Blocked handling phase" and "Concerns handling phase" explicitly.

**Model recommendation:** standard

---

### Task 4: Renumber all top-level `## Step ...` major sections to integer-only numbering and update every internal cross-reference

**Files:**
- Modify: `agent/skills/execute-plan/SKILL.md`

**Dependencies:** Task 1, Task 2, Task 3 (all content-shape changes must be complete first; this task is a pure renumbering pass over the finished content).

**Steps:**
- [ ] **Step 1: Map the renumbering** — Establish the exact old→new mapping for top-level `## Step ...` headings and apply it throughout the file:
  - `## Step 9.5: Wave gate: blocked and concerns handling` → `## Step 10: Wave gate: blocked and concerns handling`
  - `## Step 10: Verify wave output` → `## Step 11: Verify wave output`
  - `## Step 11: Post-wave commit and integration tests` → `## Step 12: Post-wave commit and integration tests`
  - `## Step 12: Handle failures and retries` → `## Step 13: Handle failures and retries`
  - `## Step 13: Report partial progress` → `## Step 14: Report partial progress`
  - `## Step 14: Request code review` → `## Step 15: Request code review`
  - `## Step 15: Complete` → `## Step 16: Complete`
  - Steps 0–9 keep their current integer numbering.
- [ ] **Step 2: Rewrite the seven major headings in place** — Edit each of the seven `## Step X: …` lines listed above to its new number, preserving the title text exactly (e.g., `Verify wave output`, `Post-wave commit and integration tests`, etc.).
- [ ] **Step 3: Renumber the Step 10 subsections** — The three lower-level subsection headings currently under the old `## Step 10` (`### Step 10.1: Orchestrator collects command evidence`, `### Step 10.2: Dispatch the verifier`, `### Step 10.3: Parse verifier output and gate the wave`) must be renumbered to `### Step 11.1`, `### Step 11.2`, `### Step 11.3` respectively to match their new parent major step (`## Step 11`). Do not change their titles.
- [ ] **Step 4: Inventory every cross-reference before any edits** — Without modifying the file, scan the post-Task-3 text and record every non-heading occurrence of each old number: `Step 10`, `Step 10.1`, `Step 10.2`, `Step 10.3`, `Step 11`, `Step 12`, `Step 13`, `Step 14`, `Step 15`. For each occurrence capture (line number, surrounding snippet, old number). This inventory is the authoritative set of replacement sites for the single coordinated pass in step 5; all six old→new shifts in this task are computed from this pre-pass inventory, never from intermediate rewritten text. Do NOT run any search-and-replace in this step.
- [ ] **Step 5: Apply every renumbering shift in one coordinated pass** — Using the inventory from step 4, produce the new file text by replacing each inventoried occurrence exactly once according to the complete old→new map: `Step 10.3` → `Step 11.3`, `Step 10.2` → `Step 11.2`, `Step 10.1` → `Step 11.1`, `Step 10` → `Step 11`, `Step 11` → `Step 12`, `Step 12` → `Step 13`, `Step 13` → `Step 14`, `Step 14` → `Step 15`, `Step 15` → `Step 16`. Every replacement is derived from the ORIGINAL pre-pass number recorded in step 4 — never from an intermediate rewritten number. Critically: do NOT run the file through two separate search-and-replace passes such as `Step 10` → `Step 11` followed by `Step 11` → `Step 12`, because the second pass would catch references that were originally `Step 10` (now `Step 11`) and incorrectly re-advance them to `Step 12`. The same hazard applies to every other adjacent pair (`Step 11` → `Step 12` then `Step 12` → `Step 13`, etc.). The safest implementation: compute each replacement position's new text from its original old text in the step-4 inventory, then write the whole file once with all replacements applied atomically. Within a single occurrence, apply longest-match-first ordering (e.g. `Step 10.3` is matched and rewritten as one unit, not as `Step 10` followed by `.3`). Targets span the entire file, including but not limited to: every `Step 10 VERDICT: FAIL` / `Step 10 retries` / `Step 10 failure routing` / `Step 10 MUST NOT run` / `Step 10 time` / `Step 10 (verification)` prose mention; Step 7's baseline-capture mention of old `Step 11`; old Step 12's retry-budget discussion naming old `Step 10`; old Step 11's Debugger-first flow column labels `Step 11 (post-wave)` and `Step 15 (final-gate)`; old Step 15's mentions of "the Step 11 final-wave menu" and its `(a)`/`(c)` menu; the precondition "Step 11 MUST NOT run"; and every remaining prose mention of old Step 12/13/14/15 under their old meanings.
- [ ] **Step 6: Spot-check the coordinated pass caught each old number exactly once** — After step 5 writes the file, re-grep for each old number (`Step 10`, `Step 11`, `Step 12`, `Step 13`, `Step 14`, `Step 15`) and confirm that every remaining occurrence refers to the NEW meaning of that number (e.g. any surviving `Step 11` must refer to the new "Verify wave output" section, not the old post-wave-commit section). If any occurrence still refers to its old meaning, it was double-shifted or missed — cross-check against the step-4 inventory and fix before proceeding.
- [ ] **Step 7: Rewrite the "Debugger-first flow" caller-column labels** — In the `### Debugger-first flow` table and prose (currently under old Step 11, now under new Step 12), update the column headers and callout labels so the left column reads `Step 12 (post-wave)` and the right column reads `Step 16 (final-gate)`. Also update every in-body mention of those labels (e.g. the "Step 11 (post-wave) parameter row", "Step 15 (final-gate) parameter row", "the Step 11 final-wave menu", "Step 15's `(a)`/`(c)` menu") to use the new numbers.
- [ ] **Step 8: Rewrite Step 9's forward references** — After Task 1 changed Step 9's body to say "the Step 9.5 wave gate", this task must change every such mention to "the Step 10 wave gate" so the forward reference points at the renumbered heading. Apply the same change anywhere else the merged gate is referenced by its old decimal anchor.
- [ ] **Step 9: Rewrite Step 12's (now Step 13's) cross-references to the merged gate** — In the renumbered `## Step 13: Handle failures and retries` section, the Shared-counter paragraph updated in Task 3 currently names "Step 9.5 wave gate's Blocked handling phase" and "Step 9.5 wave gate's Concerns handling phase"; change both to "Step 10 wave gate's Blocked handling phase" and "Step 10 wave gate's Concerns handling phase" respectively. Similarly update the Sub-task split rule pointer from "the Step 9.5 wave gate's Blocked handling phase" to "the Step 10 wave gate's Blocked handling phase".
- [ ] **Step 10: Audit for stragglers** — After the renumbering pass, grep the file for the patterns `Step 9\.5`, `Step 9\.7`, `## Step [0-9]+\.[0-9]+`, and every old major-step number in a context that still refers to the old meaning. Any remaining match (other than legitimate lower-level decimal subsection headings such as `### Step 11.1`) is a straggler and must be fixed before completing this task.
- [ ] **Step 11: Verify final header sequence** — After edits, confirm the file's top-level `## Step ...` headings in document order are exactly: `## Step 0`, `## Step 1`, `## Step 2`, `## Step 3`, `## Step 4`, `## Step 5`, `## Step 6`, `## Step 7`, `## Step 8`, `## Step 9`, `## Step 10`, `## Step 11`, `## Step 12`, `## Step 13`, `## Step 14`, `## Step 15`, `## Step 16` — 17 integer-only top-level steps with no decimal-numbered `## Step X.Y` heading remaining.
- [ ] **Step 12: Check final line count** — Confirm the fully edited `agent/skills/execute-plan/SKILL.md` is no longer than 750 lines. If it exceeds 750, continue tightening redundant prose within the already-in-scope sections until the file is at or below the limit without changing behavior.

**Acceptance criteria:**

- No top-level `## Step ...` heading uses decimal numbering.
  Verify: run `grep -nE "^## Step [0-9]+\\.[0-9]+" agent/skills/execute-plan/SKILL.md` and confirm the output is empty.
- The file contains exactly seventeen top-level `## Step ...` headings in the integer sequence 0..16.
  Verify: run `grep -nE "^## Step [0-9]+:" agent/skills/execute-plan/SKILL.md` and confirm the output is exactly 17 lines whose leading step numbers, in document order, are `0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16`.
- `agent/skills/execute-plan/SKILL.md` is no longer than 750 lines after Task 4 completes.
  Verify: run `wc -l agent/skills/execute-plan/SKILL.md` and confirm the reported line count is less than or equal to 750.
- The combined wave-gate section is the new `## Step 10`.
  Verify: run `grep -nE "^## Step 10:" agent/skills/execute-plan/SKILL.md` and confirm the single match is `## Step 10: Wave gate: blocked and concerns handling`.
- The old `## Step 10` "Verify wave output" section is now `## Step 11`, with its three subsections renumbered to `11.1`/`11.2`/`11.3`.
  Verify: run `grep -nE "^## Step 11:|^### Step 11\\.[123]:" agent/skills/execute-plan/SKILL.md` and confirm the output contains `## Step 11: Verify wave output`, `### Step 11.1: Orchestrator collects command evidence`, `### Step 11.2: Dispatch the verifier`, and `### Step 11.3: Parse verifier output and gate the wave` (four matching lines in that order).
- No internal prose still refers to the obsolete old numbering (Step 9.5, Step 9.7, Step 10.1/10.2/10.3, Step 11/12/13/14/15 in their old meanings).
  Verify: run `grep -nE "Step 9\\.5|Step 9\\.7|Step 10\\.[123]" agent/skills/execute-plan/SKILL.md` and confirm the output is empty. Additionally, open `agent/skills/execute-plan/SKILL.md` and confirm the phrase "`VERDICT: FAIL` from Step 10" no longer appears (it should now read "`VERDICT: FAIL` from Step 11"); and confirm the Debugger-first flow table column headers read exactly `| Step 12 (post-wave) | Step 16 (final-gate) |`.
- Step 13 (the renumbered old Step 12) still names the merged gate phases by their new `Step 10` anchor.
  Verify: open `agent/skills/execute-plan/SKILL.md`, read the Shared-counter paragraph inside `## Step 13: Handle failures and retries`, and confirm it names "Step 10 wave gate's Blocked handling phase" and "Step 10 wave gate's Concerns handling phase" (and nowhere in that paragraph does "Step 9.5" or "Step 9.7" appear).
- Step 9's forward references point at the renumbered merged gate.
  Verify: open `agent/skills/execute-plan/SKILL.md`, read the three bullets under `## Step 9: Handle worker status codes` and the paragraph that follows them, and confirm every mention of the merged gate uses the phrasing "the Step 10 wave gate" (Blocked/Concerns phase where applicable) and never "Step 9.5" or "Step 9.7".

**Model recommendation:** standard

---

### Task 5: Update `integration-regression-model.md` cross-references to reflect the renumbering

**Files:**
- Modify: `agent/skills/execute-plan/integration-regression-model.md`

**Dependencies:** Task 4 (the renumbering in SKILL.md defines what the sibling doc's new cross-reference numbers are).

**Steps:**
- [ ] **Step 1: Enumerate the cross-reference sites** — In `agent/skills/execute-plan/integration-regression-model.md`, there are exactly seven non-heading references to the renumbered major steps (four `Step 11` references and three `Step 15` references) spread across five distinct lines: (a) line 3 contains BOTH `Step 11` (in "Step 11 (post-wave integration tests)") AND `Step 15` (in "Step 15 (final integration regression gate)"); (b) line 24 contains BOTH `Step 11` (in "post-wave in Step 11") AND `Step 15` (in "the final gate in Step 15"); (c) line 37 contains `Step 11` once (in "**Post-wave (Step 11):**"); (d) line 40 contains `Step 11` once (in "the Step 11 failure menu."); (e) line 42 contains `Step 15` once (in "Step 15's final gate uses a stricter condition…"). Step 7 remains unchanged (Step 7 is unaffected by the renumbering).
- [ ] **Step 2: Apply the renumbering shifts to the sibling doc** — Rewrite every occurrence inventoried in step 1: the four `Step 11` occurrences become `Step 12`, and the three `Step 15` occurrences become `Step 16`. On lines 3 and 24, both references on the same line must be updated. Do NOT edit any other text, heading, table, or bullet in the file.
- [ ] **Step 3: Spot-check no stray old references remain in the sibling** — Re-grep the file for `Step 11`, `Step 15` after the edit to confirm zero remaining matches.

**Acceptance criteria:**

- `integration-regression-model.md` no longer references the obsolete major-step numbers `Step 11` or `Step 15`.
  Verify: run `grep -nE "Step 11|Step 15" agent/skills/execute-plan/integration-regression-model.md` and confirm the output is empty.
- `integration-regression-model.md` now names `Step 12` and `Step 16` at the seven cross-reference occurrences (four `Step 12`, three `Step 16`) and nowhere else.
  Verify: run `grep -nE "Step 12|Step 16" agent/skills/execute-plan/integration-regression-model.md` and confirm the output prints exactly five lines whose line numbers are 3, 24, 37, 40, 42; additionally run `grep -oE "Step 12|Step 16" agent/skills/execute-plan/integration-regression-model.md | sort | uniq -c` and confirm the counts are exactly `Step 12` ×4 and `Step 16` ×3 (seven occurrences total).
- No other content in `integration-regression-model.md` was altered by this task.
  Verify: run `git diff --stat agent/skills/execute-plan/integration-regression-model.md` and confirm the shown insertions and deletions both equal 5 (five touched lines, each rewritten in place, covering the seven reference replacements); additionally run `git diff agent/skills/execute-plan/integration-regression-model.md` and confirm every hunk is a pure line-level rewrite that only differs by `Step 11` → `Step 12` and/or `Step 15` → `Step 16` substitutions, with no heading, table, bullet, or algorithm-step edits.

**Model recommendation:** cheap

## Dependencies

- Task 1 depends on: (none)
- Task 2 depends on: Task 1 (sequential edits to the same file to avoid concurrent-worker merge conflicts; Task 1 carries the structural gate merge and must land first even though Task 2's edits are in a different region of the file)
- Task 3 depends on: Task 1, Task 2
- Task 4 depends on: Task 1, Task 2, Task 3
- Task 5 depends on: Task 4

Wave layout produced by the above dependencies:
- Wave 1: [Task 1]
- Wave 2: [Task 2]
- Wave 3: [Task 3]
- Wave 4: [Task 4]
- Wave 5: [Task 5]

(Tasks 1–4 all edit the same file — `agent/skills/execute-plan/SKILL.md` — so they are serialized into single-task waves to prevent concurrent-worker conflicts. Task 5 touches a different sibling file and runs on its own after the renumbering is complete.)

## Risk Assessment

1. **Cross-reference stragglers after renumbering.** The highest risk is leaving a stale reference such as "Step 10" meaning the old verifier step but now denoting the merged gate, or double-shifting a reference (e.g. old `Step 10` becoming `Step 12` because two sequential passes chained over the same text). Mitigation: Task 4 steps 4–5 mandate a single coordinated pass over a pre-computed old→new map built once from the pre-pass inventory (never chained substitutions over the whole file, never derived from intermediate rewritten text), Task 4 step 6 spot-checks that each surviving old number refers to its new meaning, Task 4 step 10 requires a final grep audit, and every acceptance criterion in Task 4 uses targeted greps (e.g. `grep -nE "Step 9\\.5|Step 9\\.7|Step 10\\.[123]"`) that catch stragglers.
2. **Accidental behavior drift from retry-budget consolidation.** If Task 3 shortens a retry-budget pointer in a way that drops a semantic nuance (e.g., the "sub-tasks inherit parent's remaining retries" rule), behavior would drift. Mitigation: Task 3 step 1 explicitly preserves Step 12's canonical text; the acceptance criterion in Task 3 checks Step 12 still states both "3" and "inherits the parent's remaining retry count".
3. **Menu-option loss during gate merge.** Collapsing two menus into one sub-structure risks losing a menu option. Mitigation: Task 1 acceptance criteria explicitly enumerate all four blocked options and all three concerned options; Task 1 step 5(d) and step 6(d) require "verbatim" copy of the four/three option semantics bullets (only retry-budget sentences inside them are replaced by pointers).
4. **Sibling doc scope creep.** The spec forbids broader sibling-doc edits. Mitigation: Task 5 is narrowly scoped to four known cross-reference sites, its last step greps for stragglers, and its third acceptance criterion uses `git diff --stat` to confirm only those four hunks changed.
5. **Step 3 UI shape regression.** The spec requires the Step 3 settings summary block and customize prompts to remain unchanged. Mitigation: Task 2 step 4 and its fifth acceptance criterion explicitly check the fenced `Plan: ...` summary block and the six numbered customize prompts are byte-identical / unchanged in order.
6. **Worktree-phrase count leakage.** Reducing duplicated prose could still leave a forbidden third mention if a later draft reintroduces it. Mitigation: Task 2 acceptance criteria use exact `grep -c` counts ≤ 2 for both `Reusing current workspace` and `Create a new worktree instead`; Task 4's renumbering does not touch those phrases because they live in the heading-independent Step 0 body.

## Test Command

No automated test suite applies to this docs-structural refactor. Verification is grep-based and file-inspection-based per each task's `Verify:` recipes. Omitting the `## Test Command` section intentionally per the `generate-plan` guidance ("If the project has no test infrastructure or tests are not relevant to the plan, omit the section entirely").

## Self-Review

**Spec coverage:**

- "Replace the separate top-level sections `## Step 9.5` and `## Step 9.7` with a single combined wave-gate major step" — Task 1 (steps 2–7) and verified by Task 1's first three acceptance criteria.
- "The combined wave-gate step must still cover both trigger conditions: `STATUS: BLOCKED` and `STATUS: DONE_WITH_CONCERNS`" — Task 1 step 3 preamble and step 5/6 sub-phases; Task 1 acceptance criteria 2 and 3.
- "The combined wave-gate step must preserve the current ordering: blocked handling runs before concerns handling, and both complete before wave verification" — Task 1 step 3 preamble, Task 1 step 7 gate exit subsection; Task 1 acceptance criterion 4.
- "The blocked-task case in the combined gate must preserve all four current interventions `(c)`, `(m)`, `(s)`, `(x)`" — Task 1 step 5(c)(d); Task 1 acceptance criterion 2.
- "The concerned-task case in the combined gate must preserve all three current interventions `(c)`, `(r)`, `(x)`" — Task 1 step 6(c)(d); Task 1 acceptance criterion 3.
- "The blocked-task case must preserve the current gate-exit rule that the wave cannot leave the blocked portion while any task still has `BLOCKED` status; there is no skip path" — Task 1 step 5(g); reflected in Task 1 acceptance criterion 6.
- "The concerned-task case must preserve the current gate-exit rule that the user may choose continue-to-verification and allow tasks to remain `DONE_WITH_CONCERNS` for Step 10" — Task 1 step 6(d) (preserving the `(c) Continue to verification` semantics verbatim) and step 7 (gate exit); verified by Task 1 acceptance criterion 3 (option text) and Task 1 acceptance criterion 4 (ordering).
- "Keep the full worktree-reuse decision logic in Step 0 as the canonical source of truth" — Task 2 explicitly does not edit Step 0; the phrase-count criteria in Task 2 allow up to two occurrences, which are the two canonical Step 0 mentions of each phrase.
- "Reduce Step 3 so it presents the execution settings UI and only briefly points back to Step 0" — Task 2 steps 2–3 and Task 2 acceptance criteria 3 and 4.
- "Keep the canonical retry-budget rule in Step 12" — Task 3 step 1 and Task 3 acceptance criteria 1 and 2 (note: Step 12 becomes Step 13 after Task 4; the spec's language is intentionally preserved by number at the planning stage and the criterion text in Task 3 uses the pre-renumbering number "Step 12" because Task 3 runs before Task 4).
- "Replace duplicate retry-budget restatements in the merged wave-gate section with a short pointer to Step 12" — Task 3 steps 3–4 and Task 3 acceptance criteria 3 and 4.
- "Renumber all top-level `## Step ...` major sections in `agent/skills/execute-plan/SKILL.md` so they use integers only" — Task 4 steps 1–3 and steps 10–11; Task 4 acceptance criteria 1 and 2.
- "`agent/skills/execute-plan/SKILL.md` must be no longer than 750 lines after implementation is complete" — Task 4 step 12 and the Task 4 acceptance criterion that verifies `wc -l agent/skills/execute-plan/SKILL.md <= 750`.
- "Update internal cross-references so they remain correct after the major-step renumbering" — Task 4 steps 4–9 and Task 4 acceptance criteria 4, 5, 6.
- "Lower-level subsections may keep decimal numbering where useful" — Task 4 step 3 explicitly renumbers only the `10.x` subsections to `11.x` to match their new parent and leaves all other decimal subsections untouched; this is also reflected in Task 4 acceptance criterion 4 which specifically mentions `### Step 11.1/11.2/11.3`.
- "The merged-gate and renumbering work must preserve the current user-facing settings prompt shape, worker/verifier flow, and control-flow semantics in effect" — Task 2 step 4 and acceptance criterion 5 (Step 3 UI shape); Task 1 step 3/5/6 copy menu blocks verbatim; Task 3 preserves retry semantics verbatim.
- "Planning and implementation order must reflect the dependency that gate-merging happens before retry-budget deduplication" — Dependencies section: Task 3 depends on Task 1.
- Constraint "No observable behavior change" — No task alters menu option text, gate ordering, retry values, verifier flow, or commit behavior; Task 5 touches only sibling-doc cross-reference numbers. Risk Assessment item 2 and item 3 specifically guard this.
- Constraint "The per-task retry budget remains 3 retries; this work may only centralize and de-duplicate" — Task 3 step 1 explicitly forbids altering the value; Task 3 acceptance criterion 2 validates Step 12's text still contains both the 3-retry rule and the sub-task-inheritance rule.
- Constraint "The user-visible Step 3 settings UI must remain unchanged in shape and content" — Task 2 step 4 and acceptance criterion 5 guard the summary block and six numbered customize prompts.
- Constraint "Major-step numbering must become simpler, not more elaborate: top-level inserted labels such as `9.5` and `9.7` should be eliminated" — Task 4 step 1's mapping explicitly lists `9.5` → `10` as the first rewrite and Task 4 acceptance criterion 1 forbids any `## Step X.Y` top-level heading.
- Constraint "This spec should not be treated as permission to revise sibling docs … unless such changes are strictly required" — Task 5 is scoped to exactly four cross-reference sites required by the renumbering for correctness; Task 5 acceptance criterion 3 audits the diff with `git diff --stat` to confirm no other edits leaked.
- Constraint "Verification may rely on structural assertions and dry-read control-flow checks" — All acceptance criteria are grep / file-inspection recipes; no task dispatches a live execute-plan run.
- Acceptance-criteria coverage: the spec's acceptance-criteria bullets are each mapped to at least one task's acceptance criterion (menu options, combined-section existence, dry-read ordering via Task 1 AC 4, phrase-count caps via Task 2 AC 1–2, Step 3 Notes-cell brevity via Task 2 AC 3, retry-budget single-site rule via Task 3 AC 1, retry-budget pointer brevity via Task 3 AC 3–4, Step 12 canonical content via Task 3 AC 2, final `SKILL.md` line count via the new Task 4 `wc -l` criterion, integer-only headings via Task 4 AC 1–2, subsection preservation via Task 4 AC 4).

**Placeholder scan:** No "TBD", "TODO", "implement later", or "similar to Task N" remain in this plan. Every `Verify:` line names a concrete command or a specific file section; none are of the form "check the file" or "confirm it works". Every acceptance criterion is immediately followed by its own `Verify:` line on the next line (indented as a continuation of that bullet).

**Type consistency:** The plan does not introduce new code types or function signatures — it is a docs-only refactor. Heading text, phrase spellings ("Reusing current workspace", "Create a new worktree instead", "Wave gate: blocked and concerns handling", "Blocked handling phase", "Concerns handling phase"), and section anchor names (`Step 10`, `Step 11.1`, etc.) are used consistently across tasks. Task 3's pre-renumbering uses "Step 12" (correct at that point in time) and Task 4 then renumbers it to "Step 13" — this hand-off is explicit in Task 4 step 9.
