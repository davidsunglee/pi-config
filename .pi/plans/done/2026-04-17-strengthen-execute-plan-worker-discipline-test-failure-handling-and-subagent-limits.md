# Strengthen execute-plan worker discipline, test-failure handling, and subagent limits

**Source:** TODO-9ffd09cc

## Goal

Harden the `execute-plan` pipeline in three related ways: (1) give worker agents substantially stronger TDD guidance via a hybrid approach — a much richer embedded `{TDD_BLOCK}`, an explicit instruction to consult the full `test-driven-development` skill, and a required RED/GREEN evidence section in worker reports when TDD is enabled and production code changed; (2) replace the blunt "undo commit + re-dispatch entire wave" Step 11 retry with a systematic-debugging-first flow that can diagnose and (when localized) remediate in the same dispatch, and align the Step 11 user choices with the suite-wide `(a)/(b)/(c)` convention; (3) align the execute-plan wave size limit with the pi-subagent extension's `MAX_PARALLEL_TASKS = 8` constant so the two never drift out of sync.

## Architecture summary

The `execute-plan` skill lives at `agent/skills/execute-plan/SKILL.md` and drives plan execution by:
1. Loading a plan from `.pi/plans/`, validating sections, collecting execution settings.
2. Grouping tasks into dependency waves and capping wave size.
3. For each task, assembling a prompt from `agent/skills/execute-plan/execute-task-prompt.md` by filling `{TASK_SPEC}`, `{CONTEXT}`, `{WORKING_DIR}`, and `{TDD_BLOCK}`, then dispatching a `coder` subagent via the `subagent` tool.
4. Verifying wave output, committing per wave, running integration tests, and orchestrating retries.

The parallel-dispatch ceiling lives in a separate repo: `/Users/david/Code/pi-subagent/index.ts` exposes `MAX_PARALLEL_TASKS = 8`, which hard-caps how many tasks a single parallel dispatch may contain. The skill currently hardcodes `≤ 7` independently.

All three changes are edits to two markdown files — `SKILL.md` and `execute-task-prompt.md` — under `agent/skills/execute-plan/`. No TypeScript changes are required. The pi-subagent repo is referenced as the anchor for the wave-size limit but is not modified.

## Tech stack

- Markdown skill definitions with YAML frontmatter under `agent/skills/`
- Prompt template (`execute-task-prompt.md`) filled by string substitution of `{TASK_SPEC}`, `{CONTEXT}`, `{WORKING_DIR}`, `{TDD_BLOCK}`
- Node test runner (`node --experimental-strip-types --test extensions/**/*.test.ts`) for the extensions; no test coverage for markdown skills — validation is by inspection
- Git-based worktree workflow (`using-git-worktrees` skill)
- External reference: `MAX_PARALLEL_TASKS` constant in `@mariozechner/pi-subagent` (`/Users/david/Code/pi-subagent/index.ts:31`)

## File Structure

- `agent/skills/execute-plan/SKILL.md` (Modify) — Replace the TDD block template used to fill `{TDD_BLOCK}` in Step 8 with a substantially stronger excerpt; rewrite Step 11's integration-test failure branch to use a debugger-first flow and `(a)/(b)/(c)` choices; change the wave-size cap in Step 5 from ≤7 to ≤8 with a comment anchoring the value to `MAX_PARALLEL_TASKS`.
- `agent/skills/execute-plan/execute-task-prompt.md` (Modify) — Add explicit instruction that workers must consult the full `test-driven-development` skill when implementing or fixing code; update the Report Format so `## Tests` requires concise `RED:` / `GREEN:` evidence when TDD is enabled and production code changed.

No new files are created. No code files are modified.

## Tasks

### Task 1: Hybrid TDD enforcement — stronger embedded block, full-skill instruction, RED/GREEN evidence

**Files:**
- Modify: `agent/skills/execute-plan/SKILL.md`
- Modify: `agent/skills/execute-plan/execute-task-prompt.md`

**Context:** The current `{TDD_BLOCK}` in `SKILL.md` (Step 8, lines 268–280) is an 8-bullet summary. The full TDD skill at `agent/skills/test-driven-development/SKILL.md` (306 lines) contains Iron Law, red-green-refactor cycle with verify-RED / verify-GREEN mandatory steps, rationalization-prevention table, red-flag stop list, verification checklist, and "when stuck" troubleshooting. The hybrid approach: inline a substantially richer excerpt so workers carry it in the highest-salience prompt surface, point them at the full skill for depth, and require them to prove behavior via RED/GREEN evidence in reports when applicable.

**Steps:**

- [ ] **Step 1: Replace the `{TDD_BLOCK}` content in `SKILL.md` Step 8.** Open `agent/skills/execute-plan/SKILL.md`. Locate the `{TDD_BLOCK}` definition spanning lines ~266–280 (the fenced block that currently starts with `## Test-Driven Development` and ends with `If the task includes test files in its file list, follow this cycle for each step.`). Replace the entire fenced block body with the expanded TDD block defined in Step 2 below. Keep the surrounding skill-assembly prose that explains the placeholder (`- {TDD_BLOCK} — if TDD is enabled (Step 3 settings), fill with:` and `If TDD is disabled, fill {TDD_BLOCK} with an empty string.`).

- [ ] **Step 2: Use this exact expanded `{TDD_BLOCK}` content** (paste verbatim inside the fenced block in SKILL.md; preserve the 2-space indentation inside the outer fence so the inner fence renders as a literal template):

  ````
  ## Test-Driven Development

  **Iron Law:** NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST. If you write production code before a test, delete it and start over. "Delete means delete" — do not keep it as reference, do not adapt it while writing tests.

  **Consult the full skill.** For any implementation or bug-fix work in this task, consult the `test-driven-development` skill before writing code. This block is a summary, not a substitute — the full skill has the rationalization-prevention table, red-flags list, verification checklist, and when-stuck troubleshooting you will need if you get tempted to skip a step.

  ### Red-Green-Refactor cycle

  For every new behavior, bug fix, or change in this task:

  1. **RED — Write one failing test** that describes the desired behavior. One behavior per test, clear name, real code (no mocks unless unavoidable).
  2. **Verify RED — run the test and watch it fail.** MANDATORY. Confirm: test fails (does not error on a typo), and the failure message matches the expected "feature missing" reason. If the test passes, you are testing existing behavior — fix the test. If it errors, fix the error and re-run until it fails correctly.
  3. **GREEN — write the minimal code to pass.** Just enough to make this test pass. No extra options, no speculative features, no "while I'm here" refactors.
  4. **Verify GREEN — run the test and watch it pass.** MANDATORY. Confirm: the new test passes, all other tests still pass, output is pristine (no errors or warnings).
  5. **Refactor — clean up while green.** Remove duplication, improve names, extract helpers. Keep tests green. Do not add behavior.

  Repeat for the next behavior. If the task lists test files, follow this cycle for each behavior those tests cover.

  ### Rationalizations to reject

  If you catch yourself thinking any of these, STOP and follow TDD — these are the excuses the full skill explicitly calls out:

  - "Too simple to test" / "I'll test after" / "Already manually tested"
  - "Keep the code as reference while I write tests" (you will adapt it — delete it)
  - "Deleting X hours of work is wasteful" (sunk cost — unverified code is technical debt)
  - "TDD will slow me down" / "Manual test is faster"
  - "Tests-after achieves the same goals" (no — tests-after asks "what does this do?"; tests-first asks "what should this do?")
  - "It's about spirit, not ritual" / "I'm being pragmatic" / "This is different because…"

  ### Red flags — if any of these are true, stop and start over

  - You wrote production code before the test
  - The test passed on the first run (you are testing existing behavior)
  - You cannot explain why the test failed in the RED step
  - You plan to add tests "later"
  - You kept pre-existing unverified code as "reference" and adapted it

  ### Verification checklist (before reporting DONE)

  - [ ] Every new function or method has a test
  - [ ] You watched each test fail before implementing
  - [ ] Each test failed for the expected reason (feature missing, not a typo)
  - [ ] You wrote minimal code to pass each test
  - [ ] All tests pass, not just the new ones
  - [ ] Output is pristine — no errors, no warnings
  - [ ] Tests exercise real code (mocks only when unavoidable)
  - [ ] Edge cases and error paths are covered

  If you cannot check every box, you skipped TDD — start over before reporting.

  ### When stuck

  - "I do not know how to test this" → write the wished-for API in the test first, then implement to match. If still stuck, report NEEDS_CONTEXT.
  - "The test is too complicated" → the design is too complicated. Simplify the interface.
  - "I have to mock everything" → the code is too coupled. Use dependency injection.
  - "The setup is huge" → extract helpers; if still complex, simplify the design.

  ### Bug fixes

  Reproduce the bug with a failing test first. Only then fix. The test proves the fix and prevents regression. Never fix a bug without a test.
  ````

- [ ] **Step 3: Add the non-TDD full-skill instruction to `execute-task-prompt.md`.** Open `agent/skills/execute-plan/execute-task-prompt.md`. Immediately before the `{TDD_BLOCK}` placeholder on line 77, insert a new subsection titled `## Required Skills` with this exact body (keep one blank line before and after the new section):

  ```
  ## Required Skills

  If this task involves diagnosing a failing test, regression, or unexpected behavior, you MUST consult the `systematic-debugging` skill at `agent/skills/systematic-debugging/SKILL.md` before proposing a fix. Find the root cause before changing code.
  ```

  This section intentionally does NOT repeat the TDD full-skill instruction. That instruction is carried by the TDD block itself (see Step 2, "Consult the full skill" paragraph), so it is automatically conditional on `{TDD_BLOCK}` being non-empty — i.e., on TDD being enabled. If TDD is disabled in the execution settings, `{TDD_BLOCK}` is filled with an empty string and the worker correctly does not receive a "TDD is required" instruction. The `systematic-debugging` instruction above is unconditional because debugging discipline applies regardless of the TDD setting.

  The `{TDD_BLOCK}` placeholder stays immediately after this new section.

- [ ] **Step 4: Update the Report Format in `execute-task-prompt.md` to require RED/GREEN evidence when applicable.** Replace the `## Tests` line inside the fenced report template (currently `## Tests\nWhat was tested and results.`) with:

  ```
  ## Tests
  What was tested and results.

  When TDD was enabled for this task AND you changed production code, include brief RED/GREEN evidence:
  - **RED:** the failing test you added or ran first, and the expected failure reason (what error or assertion).
  - **GREEN:** what passed after implementation (the specific test(s) now passing, and confirmation the rest of the suite still passes).

  Keep each line to one or two sentences. If TDD was disabled, or you only modified docs/config/comments, write "TDD not applicable — <one-line reason>" and skip RED/GREEN.
  ```

  Do not alter the other subsections (`## Completed`, `## Files Changed`, `## Self-Review Findings`, `## Concerns / Needs / Blocker`) or the status code guidance that follows the fenced block.

- [ ] **Step 5: Cross-check internal consistency.** Re-read `SKILL.md` Step 8's skill-assembly prose (around "Assembling worker prompts") and confirm the placeholder list still mentions `{TDD_BLOCK}` and nothing else is newly required. Re-read `execute-task-prompt.md` end-to-end and confirm: (a) `{TDD_BLOCK}` is still a placeholder on its own line; (b) the new `## Required Skills` section appears once, before `{TDD_BLOCK}`; (c) the updated `## Tests` guidance is inside the fenced report template. Fix any mismatch.

**Acceptance criteria:**
- `agent/skills/execute-plan/SKILL.md` Step 8's `{TDD_BLOCK}` contents match Step 2's expanded block verbatim, including Iron Law, mandatory Verify-RED and Verify-GREEN steps, rationalization list, red-flags list, verification checklist, and when-stuck guidance.
- `agent/skills/execute-plan/execute-task-prompt.md` contains a `## Required Skills` section immediately before `{TDD_BLOCK}` that tells the worker to consult `systematic-debugging/SKILL.md` for diagnosis work. The section does NOT tell the worker to consult `test-driven-development/SKILL.md` — that instruction lives inside `{TDD_BLOCK}` so it is automatically conditional on TDD being enabled (when TDD is disabled, `{TDD_BLOCK}` is empty and no TDD guidance reaches the worker).
- The Report Format's `## Tests` subsection specifies compact RED/GREEN evidence when TDD is enabled and production code changed, with an explicit out for non-code changes.
- The word "TBD", "TODO", or placeholder phrasing does not appear in the new blocks.
- Rendering the template (substituting `{TDD_BLOCK}` with the new content) produces a single well-formed markdown document with no duplicate headings.

**Model recommendation:** standard

---

### Task 2: Replace Step 11 retry with debugger-first flow and align choice wording

**Files:**
- Modify: `agent/skills/execute-plan/SKILL.md`

**Context:** Step 11 of `SKILL.md` (the "Post-wave commit and integration tests" section, lines ~309–374) currently handles test regressions with a blunt `(r)etry / (s)kip / (x)stop` prompt. `Retry` undoes the wave commit and re-dispatches every wave task with raw test output appended. We want to (a) diagnose first using the `systematic-debugging` skill via a single coder dispatch; (b) allow that dispatch to both diagnose and remediate when the issue is clearly localized; (c) otherwise use the diagnosis to drive a targeted follow-up dispatch for only the implicated task(s); (d) use the suite-wide `(a)/(b)/(c)` wording that already appears in Step 12 (`Stop execution`) and generate-plan Step 4 (`Keep iterating` / `Proceed with issues`).

We are not adding a new `debugger` agent in this iteration — the existing `coder` worker receives a debugging-oriented prompt.

**Steps:**

- [ ] **Step 1: Locate and delete the current Step 11 failure branch.** In `agent/skills/execute-plan/SKILL.md`, find the section starting `**On fail:** Present the user with choices, following the same interaction pattern as Step 12's retry/skip/stop:` through the end of the `- **Stop:**` bullet (the paragraph starting `Halt execution. All prior wave commits are preserved...`). This spans the fenced `(r)/(s)/(x)` block and the three bulleted option explanations that follow it. Delete this entire region; leave the preceding `**On pass:**` bullet and the subsequent Step 12 heading untouched.

- [ ] **Step 2: Write the replacement failure branch.** Insert, in place of the deleted region, the following exact content:

  ````
  **On fail:** Present the user with the suite-standard choices:

  ```
  ❌ Integration tests failed after wave <N>.

  New failures:
  <list of new failing tests or diff from baseline>

  Options:
  (a) Debug failures — dispatch a systematic-debugging pass, then remediate
  (b) Skip tests     — proceed to wave <N+1> despite failures
  (c) Stop execution — halt plan execution; committed waves are preserved as checkpoints
  ```

  - **(a) Debug failures:** Run the debugger-first flow described in "Debugger-first flow" below. Do NOT undo the wave commit up front; the debugging dispatch inspects the committed state. This path counts as a retry toward the 3-retry limit in Step 12.
  - **(b) Skip tests:** Proceed to the next wave. The failing commit remains. Warn: "⚠️ Proceeding with known test regressions."
  - **(c) Stop execution:** Halt execution. All prior wave commits are preserved as checkpoints. Report partial progress (Step 13). The user can resume or fix manually.

  ### Debugger-first flow

  When the user chooses **(a) Debug failures**, do NOT re-dispatch every task in the wave. Instead:

  1. **Identify suspect tasks from the failure output.** Inspect the new failing test names, file paths in stack traces, and the diff introduced by the wave (`git show HEAD --stat` and `git show HEAD` for the wave commit). Build a short list of wave tasks whose modified files appear in the failing stack traces or whose behavior the failing tests cover. If the mapping is ambiguous, include every wave task in the suspect list.

  2. **Dispatch a single debugging pass** using the `coder` agent with a prompt that follows the `systematic-debugging` skill. The prompt MUST include:
     - The failing test output (full, not truncated).
     - The wave commit SHA and the list of files it changed.
     - The suspect task list from step 1, with each task's title.
     - An explicit instruction: "Follow the `systematic-debugging` skill. Complete Phase 1 (root cause investigation) before proposing any fix. If the root cause is a clear, localized defect in one or two files, you MAY apply the fix in this same dispatch — follow TDD (write a failing test reproducing the regression, then fix). If the root cause spans multiple tasks or requires design judgment, return a diagnosis only and do NOT modify code."
     - The required report shape: either `STATUS: DONE` with the fix applied and RED/GREEN evidence for the regression test, or `STATUS: DONE_WITH_CONCERNS` containing a `## Diagnosis` section naming the implicated task(s), the root cause, and the minimal change needed.

  3. **Handle the debugging pass result:**
     - **Diagnosed and fixed (`STATUS: DONE`):** Re-run the test command. If it now matches the baseline (pass), amend or add a follow-up commit (`git commit -m "fix(plan): wave <N> regression — <short summary>"`) and proceed to the next wave. If tests still fail, treat it as a failed debugging pass (below).
     - **Diagnosis only (`STATUS: DONE_WITH_CONCERNS` with `## Diagnosis`):** Use the diagnosis to dispatch a **targeted remediation** — a second `coder` dispatch scoped to only the implicated task(s)/files from the diagnosis. Include the diagnosis text, the failing test output, and the original task spec(s) for the implicated task(s). After that dispatch returns, re-run the test command and handle pass/fail the same way.
     - **Failed debugging pass** (blocker, or fix did not resolve failures): re-present the `(a)/(b)/(c)` choices to the user. Count this attempt toward the Step 12 retry limit.

  4. **Do NOT re-dispatch unaffected wave tasks** unless the diagnosis explicitly implicates them. Avoiding blanket re-runs is the point of this flow.

  5. **Commit undo is only used as a fallback.** If the targeted remediation also fails and the user chooses to retry again, at that point — and only then — offer to undo the wave commit with `git reset --soft HEAD~1 && git reset HEAD` before a broader retry. Do not undo proactively.
  ````

  Preserve the two blank lines before the next heading (`## Step 12: Handle failures and retries`).

- [ ] **Step 3: Update Step 12 cross-reference wording.** In Step 12's intro, the text `Apply wave pacing from Step 3:` remains as-is, but confirm the three bullets immediately below still read `- **(a)** Always pause and report...`, `- **(b)** Never pause...`, `- **(c)** Pause only when...` — no changes needed. If any of those bullets use different letters, change them to `(a)/(b)/(c)` to keep the suite consistent.

- [ ] **Step 4: Verify wording parity across the suite.** Open `agent/skills/generate-plan/SKILL.md` and `agent/skills/refine-code/SKILL.md` and confirm the `(a)/(b)/(c)` labels used in Step 11's new branch match the labels already in those skills (`(a) Keep iterating`, `(b) Proceed with issues`, `(c) Stop execution`). The new Step 11 branch uses `(a) Debug failures` / `(b) Skip tests` / `(c) Stop execution`; the verbs differ because the actions differ, but the label letters and imperative-verb pattern match. Do not change the other skills. If Step 11's wording is inconsistent with imperative-verb phrasing, adjust only Step 11 to match.

- [ ] **Step 5: Re-read the updated Step 11 end-to-end.** Check that (a) the specific old Step 11 failure-branch phrases no longer appear in Step 11 — namely the strings `(r) Retry`, `(s) Skip`, `(x) Stop`, `(r)etry`, `(s)kip`, `(x)stop`, and `re-dispatch this wave's tasks`; (b) the new flow references the `systematic-debugging` skill by name; (c) the retry-counter tie-in to Step 12 is explicit; (d) the "undo commit" behavior is clearly a fallback, not the default. Do NOT grep for `(s)` or `(r)` or `(x)` globally across `SKILL.md`, because unrelated option lists elsewhere in the file — e.g. the Step 3 `(s)tart / (c)ustomize / (q)uit` prompt — legitimately contain `(s)`. The scope of this check is Step 11's failure branch only.

**Acceptance criteria:**
- `agent/skills/execute-plan/SKILL.md` Step 11 contains the new `(a) Debug failures / (b) Skip tests / (c) Stop execution` prompt block verbatim as specified in Step 2.
- A new "Debugger-first flow" subsection exists within Step 11 describing: suspect-task identification, single debugging dispatch invoking `systematic-debugging`, conditional in-dispatch remediation, targeted follow-up remediation when diagnosis-only, and fallback-only commit undo.
- Inside Step 11's failure branch, the old phrases `(r) Retry`, `(s) Skip`, `(x) Stop`, `(r)etry`, `(s)kip`, `(x)stop`, `Retry —` (as a bullet label), and `re-dispatch this wave's tasks` no longer appear. This check is scoped to Step 11 only — unrelated option lists elsewhere in `SKILL.md` (e.g. Step 3's `(s)tart / (c)ustomize / (q)uit` prompt) may legitimately contain `(s)` and are out of scope.
- Step 12's pacing bullets still use `(a)/(b)/(c)`.
- No new agent type (`debugger` or otherwise) is introduced; the debugging pass uses the existing `coder` agent.
- The updated flow still feeds the Step 12 3-retry limit (explicitly stated).

**Model recommendation:** capable

---

### Task 3: Align wave size cap with `MAX_PARALLEL_TASKS = 8`

**Files:**
- Modify: `agent/skills/execute-plan/SKILL.md`

**Context:** `SKILL.md` Step 5 currently reads: `If a wave has more than 7 tasks, split it into sequential sub-waves of ≤7 tasks each.` The external constant it should follow is `MAX_PARALLEL_TASKS = 8` at `/Users/david/Code/pi-subagent/index.ts:31`. Using 7 wastes one slot; using a hardcoded number invites silent drift if the external constant ever changes.

**Steps:**

- [ ] **Step 1: Update the wave-split sentence in Step 5.** In `agent/skills/execute-plan/SKILL.md` line 154, replace the sentence `If a wave has more than 7 tasks, split it into sequential sub-waves of ≤7 tasks each.` with:

  ```
  If a wave has more than 8 tasks, split it into sequential sub-waves of ≤8 tasks each. The cap of 8 is the pi-subagent extension's `MAX_PARALLEL_TASKS` (see `/Users/david/Code/pi-subagent/index.ts`) — do not exceed it, because the extension rejects dispatches above this limit. If that constant changes, update this cap to match.
  ```

- [ ] **Step 2: Scan for any other hardcoded parallel-task or wave-size limits in the execute-plan skill.** Search `agent/skills/execute-plan/SKILL.md` and `agent/skills/execute-plan/execute-task-prompt.md` for the tokens `7`, `8`, `parallel`, `wave`, and `MAX_PARALLEL` to confirm no other location repeats the old 7 value or adds a conflicting ceiling. Verify by inspection — do not auto-replace. If a duplicate limit exists, update it to reference the same anchor phrase ("the pi-subagent extension's `MAX_PARALLEL_TASKS`").

- [ ] **Step 3: Scan the rest of the skills tree for drift.** In `agent/skills/`, grep for `MAX_PARALLEL_TASKS`, `parallel tasks`, `sub-waves`, and `≤7` / `<=7` / `>7`. If any other skill hardcodes a parallel-task limit that conflicts with 8, note it; only fix it if it is clearly the execute-plan skill family (generate-plan, refine-code, execute-plan). Skills outside that family are out of scope for this task — do not edit them; report any drift as a concern in the worker report.

**Acceptance criteria:**
- `agent/skills/execute-plan/SKILL.md` Step 5 states the wave cap as 8, not 7.
- The new sentence references `MAX_PARALLEL_TASKS` in the pi-subagent extension as the source of truth, including the path `/Users/david/Code/pi-subagent/index.ts`.
- Grepping `agent/skills/execute-plan/` for `≤7`, `<=7`, or `more than 7 tasks` returns no matches.
- No other execute-plan-family skill retains a conflicting hardcoded limit; any drift in unrelated skills is reported as a concern.

**Model recommendation:** cheap

## Dependencies

- Task 1 depends on: none
- Task 2 depends on: Task 1
- Task 3 depends on: Task 2

Although the three tasks target disjoint regions of `agent/skills/execute-plan/SKILL.md` (Task 1: Step 8; Task 2: Step 11; Task 3: Step 5), they all edit the same file. `execute-plan` runs same-wave tasks in parallel in one workspace, so scheduling these concurrently risks lost or clobbered edits when workers write the file back. The dependency chain forces them into three sequential waves (Task 1 → Task 2 → Task 3) so each `SKILL.md` edit starts from the prior task's committed state. There are no content-level dependencies between the tasks — the chain exists solely to serialize writes to the shared file.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Expanded `{TDD_BLOCK}` significantly increases worker prompt size and pushes models toward truncation or degraded instruction-following. | Medium | Medium | The expanded block is ~60 lines of markdown; this is small compared to `{TASK_SPEC}` + `{CONTEXT}`. The hybrid approach deliberately moves the highest-salience content inline and points at the full skill for depth rather than inlining all 306 lines. If size becomes an issue in practice, future work can collapse sections, but the spec prioritizes anti-rationalization content over brevity. |
| Workers produce RED/GREEN evidence as fiction rather than real test runs. | Medium | Medium | The verification checklist in the TDD block requires watched failures; the orchestrator's Step 10 output verification is unchanged and still reads actual code. RED/GREEN is an observability improvement, not the only check. |
| Debugger-first Step 11 flow introduces longer time-to-recover when a regression is genuinely wave-wide. | Low | Medium | The flow still escalates: if the targeted remediation fails, the user is re-prompted and can (at that point) opt into a broader retry with commit undo. The 3-retry limit in Step 12 still applies. |
| `systematic-debugging` skill is invoked via prompt text only, so a worker could skip the Phase-1 investigation. | Medium | Medium | The debugging-pass prompt explicitly names the skill, requires a `## Diagnosis` section when not fixing, and the orchestrator re-runs the test command to verify a claimed fix. The pattern mirrors how TDD is enforced for regular tasks. |
| Raising the wave cap from 7 to 8 causes some plans that used to fit in one wave to newly stress the extension if `MAX_PARALLEL_TASKS` decreases in future. | Low | Low | The new sentence anchors the cap to the external constant and instructs maintainers to update when it changes. A comment at the edit site makes drift visible. |
| `(a)/(b)/(c)` relabeling of Step 11 misses a downstream reference (docs, tests, other skill files). | Low | Low | Task 2 Step 4 explicitly checks sibling skills for wording parity; Task 2 Step 5 verifies the specific old Step-11 failure-branch phrases (`(r) Retry`, `(s) Skip`, `(x) Stop`, `re-dispatch this wave's tasks`) no longer appear inside Step 11, while intentionally leaving unrelated `(s)`/`(r)`/`(x)` occurrences elsewhere in `SKILL.md` untouched. |

## Test Command

```bash
npm test --prefix agent
```

Note: the repo's test suite covers only the TypeScript extensions under `agent/extensions/`. It will pass unchanged regardless of the markdown edits in this plan; running it confirms the edits didn't accidentally touch extension sources. Manual verification of the skill changes is by inspection (read the updated files end-to-end and confirm the acceptance criteria).

## Self-Review

**Spec coverage:**
- "Strengthen embedded TDD block" → Task 1 Steps 1–2.
- "Instruct workers to consult full TDD skill" → Task 1 Step 3.
- "Require RED/GREEN evidence when TDD enabled and production code changed" → Task 1 Step 4.
- "Internally consistent across skill assembly, template, and report format" → Task 1 Step 5.
- "Replace blunt retry with debugger-first flow" → Task 2 Step 2's "Debugger-first flow" subsection.
- "Diagnose and remediate in same dispatch when localized; otherwise targeted follow-up" → Task 2 Step 2 item 3.
- "Avoid re-running unaffected wave tasks" → Task 2 Step 2 item 4.
- "Align user choices with (a)/(b)/(c) convention" → Task 2 Step 2 prompt block and Step 4 cross-check.
- "Do not add a new debugger agent" → Task 2 Step 2 explicitly uses the existing `coder` agent; acceptance criteria call this out.
- "Align wave size limit with MAX_PARALLEL_TASKS" → Task 3 Step 1.
- "Anchor value with a comment pointing to the extension" → Task 3 Step 1 replacement text.
- "Verify no other locations hardcode a different limit" → Task 3 Steps 2–3.

**Placeholder scan:** No "TBD", "TODO", "implement later", "similar to Task N", or "follow the existing pattern" phrases in task bodies. All exact-text replacements are inlined in the plan.

**Type consistency:** The three tasks reference the same two files with disjoint regions; placeholder names (`{TDD_BLOCK}`, `{TASK_SPEC}`, `{CONTEXT}`, `{WORKING_DIR}`) match the existing template. The `MAX_PARALLEL_TASKS` constant and its path are correct against the current pi-subagent source.
