# Execute-Plan Blocked Task Escalation — Implementation Plan

**Goal:** Change `execute-plan` so that any `STATUS: BLOCKED` worker outcome in a wave is surfaced to the user before any subsequent wave starts, independent of the wave pacing setting. Already-running same-wave tasks are allowed to drain first; after the wave drains, the skill presents a combined escalation view listing every blocked task with its blocker details and a summary of the wave's other outcomes. The user makes a per-task intervention choice (more context / better model / break into sub-tasks / stop). While any wave task remains blocked, the skill withholds both the post-wave commit and the post-wave integration test, which resume their normal behavior only after the wave completes successfully.

**Architecture summary:** The change is localized to the `execute-plan` skill. `execute-plan` is a prose SKILL driven by an LLM orchestrator; its behavior is encoded as numbered steps in `agent/skills/execute-plan/SKILL.md`. Step 8 dispatches wave workers; Step 9 handles `STATUS:` codes; Step 10 verifies output; Step 11 commits and runs integration tests; Step 12 handles generic failures/retries and applies wave pacing. Today Step 9 treats `BLOCKED` as a per-task condition with four recovery paths inline, and Step 12 is the only place wave pacing is applied. This plan inserts a new post-wave drain-and-escalation gate between wave completion and Steps 10/11, and narrows the Step 9 `BLOCKED` bullet to defer to the new gate rather than recover inline. Step 12's pacing logic is adjusted so that pacing choices (a/b/c) only govern success paths; `BLOCKED` always pauses regardless.

**Tech stack:** Markdown skill prose (`agent/skills/execute-plan/SKILL.md`). No code changes, no new agents, no new tools. The existing `coder` agent protocol already distinguishes `STATUS: BLOCKED` from `STATUS: NEEDS_CONTEXT` (see `agent/agents/coder.md`); no change is needed there.

**Source:** `TODO-8ddd2e17`

**Spec:** `.pi/specs/2026-04-18-blocked-task-escalation.md`

---

## File Structure

- `agent/skills/execute-plan/SKILL.md` (Modify) — Add a new "Step 9.5: Blocked-task escalation gate" that runs once per wave after all workers return, covering drain behavior, combined escalation presentation, per-task intervention selection, and re-dispatch loop. Tighten Step 9 so the `BLOCKED` bullet defers to the new gate instead of recovering inline. Add a short note to Step 10 and Step 11 that they are skipped while any wave task remains blocked. Add a clarifying clause to Step 12 so that wave-pacing options (a)/(b)/(c) only apply to waves that contain no `BLOCKED` results.

No other files change. The plan file itself, written by the planner, lives at `.pi/plans/2026-04-18-blocked-task-escalation.md`.

---

## Tasks

### Task 1: Add Step 9.5 "Blocked-task escalation gate" to execute-plan SKILL.md

**Files:**
- Modify: `agent/skills/execute-plan/SKILL.md`

**Steps:**

- [ ] **Step 1: Read the current SKILL.md in full** — open `agent/skills/execute-plan/SKILL.md` and confirm the existing section boundaries. You must preserve these headings exactly: `## Step 9: Handle worker status codes`, `## Step 10: Verify wave output`, `## Step 11: Post-wave commit and integration tests`, `## Step 12: Handle failures and retries`. The new gate must sit between Step 9 and Step 10 and must be numbered `## Step 9.5: Blocked-task escalation gate` (not renumbered to "Step 10") so later-step references elsewhere in the file remain valid.

- [ ] **Step 2: Insert the new section immediately after the end of Step 9 and before `## Step 10: Verify wave output`** — insert the block below verbatim. Keep a blank line before `##` and after the section body. Do not change any other content in the file in this step.

  ~~~markdown
  ## Step 9.5: Blocked-task escalation gate

  Run this gate once per wave after every dispatched worker in the wave has returned and Step 9 has classified each response. It sits between worker handling and wave verification.

  **Purpose:** Treat `STATUS: BLOCKED` as an immediate escalation — independent of the wave pacing choice from Step 3. Any wave that contains at least one `BLOCKED` worker response pauses here before any later wave is started, before wave verification (Step 10), and before the post-wave commit or integration-test (Step 11).

  ### 1. Drain the current wave

  Do not cancel or interrupt any worker that is still running in the current wave. `execute-plan` already waits for all dispatched workers in a wave to return before proceeding; rely on that. Once every worker response has been received and Step 9 has been applied, the wave is "drained."

  Do not start the next wave. Do not run Step 10 or Step 11 for this wave yet.

  ### 2. Collect blocked tasks

  After draining, collect the set `BLOCKED_TASKS` = every task in the wave whose most recent worker response is `STATUS: BLOCKED`.

  - If `BLOCKED_TASKS` is empty, skip this entire step and proceed to Step 10.
  - If `BLOCKED_TASKS` is non-empty, proceed to step 3 below.

  Tasks already re-dispatched and resolved in Step 9 via `NEEDS_CONTEXT` do not appear here — this gate only triggers on terminal `BLOCKED` outcomes for the wave.

  ### 3. Present the combined escalation view

  Present a single combined escalation view covering every task in `BLOCKED_TASKS`. Do NOT present blocked tasks one at a time. The user must see the full list before choosing which to address first.

  The view MUST include:

  1. A header line naming the wave, e.g., `🚫 Wave <N>: <count> task(s) BLOCKED. Execution paused before any later wave.`
  2. A "Wave outcomes" summary block listing every task in the wave and its Step 9 status: `DONE`, `DONE_WITH_CONCERNS`, or `BLOCKED`. Include task number and task title for each. Successful same-wave tasks MUST appear here so the user can see what completed alongside the blockers.
  3. A "Blocked tasks" block, one entry per task in `BLOCKED_TASKS`, each containing:
     - Task number and task title (the heading from the plan)
     - The blocker text from the worker's `## Concerns / Needs / Blocker` section (full text, not truncated)
     - Files the task was scoped to (the task's `**Files:**` section from the plan)

  Example layout:

  ~~~
  🚫 Wave 2: 2 task(s) BLOCKED. Execution paused before any later wave.

  Wave outcomes:
    - Task 3: Add baseline test capture           DONE
    - Task 4: Add main-branch confirmation guard  BLOCKED
    - Task 5: Wire final-review invocation        DONE_WITH_CONCERNS
    - Task 6: Add commit-after-wave step          BLOCKED

  Blocked tasks:

  [Task 4] Add main-branch confirmation guard
    Files: agent/skills/execute-plan/SKILL.md
    Blocker:
      <full blocker text from the worker report>

  [Task 6] Add commit-after-wave step
    Files: agent/skills/execute-plan/SKILL.md
    Blocker:
      <full blocker text from the worker report>
  ~~~

  ### 4. Per-task intervention choice

  For each task in `BLOCKED_TASKS`, ask the user for an intervention choice independently. Do not force a single action across all blocked tasks. Present choices one task at a time after the combined view has been shown, using this form per task:

  ~~~
  Task <N>: <task_title> (current tier: <tier>) — choose an intervention:
    (c) More context      — re-dispatch this task with additional context you supply
    (m) Better model      — re-dispatch this task with a more capable model tier
                              [omit this line if current tier is already `capable`]
    (s) Split into sub-tasks — break this task into smaller sub-tasks and dispatch them
    (x) Stop execution    — halt the plan; committed waves are preserved as checkpoints
  ~~~

  These options mirror the recovery paths previously inlined in Step 9's `BLOCKED` bullet and are the canonical intervention set for this gate. Do not invent new options. The `(m) Better model` option is suppressed (not offered, and not selectable) whenever the task's current model tier is already `capable`, because there is no higher tier to escalate to and re-dispatching to the same model would violate the Step 9 rule "Never ignore an escalation or re-dispatch the same task to the same model without changes." When `(m)` is suppressed, the user must pick `(c)`, `(s)`, or `(x)` for that task; a tier upgrade is not a valid same-tier "meaningful change" for `capable`-tier tasks.

  - **(c) More context:** prompt the user for the additional context (free-form text). Re-dispatch this single task to a `coder` worker with the original task spec plus the supplied context appended under a `## Additional Context` section in the worker prompt. Keep the task's existing model tier unless the user also picks (m) for the same task on a subsequent pass.
  - **(m) Better model:** only offered when the task's current tier is `cheap` or `standard`. Re-dispatch this single task to a `coder` worker using the next tier up from the task's current tier (`cheap` → `standard`, `standard` → `capable`). Resolve the concrete model string via `~/.pi/agent/model-tiers.json` as described in Step 6. If the task's current tier is `capable`, do NOT offer this option and do NOT re-dispatch to `capable` again under the guise of a "better model" — that would re-dispatch the same task to the same model with no change, which the Step 9 rule forbids. The user must instead pick `(c)` (which adds new context, satisfying the "with changes" requirement) or `(s)` (which restructures the task itself), or `(x)`.
  - **(s) Split into sub-tasks:** decompose the task into smaller sub-tasks in-session. Each sub-task must keep the same output file(s) and acceptance criteria coverage between them (no criterion may be dropped). Dispatch the sub-tasks as a mini-wave bounded by the pi-subagent `MAX_PARALLEL_TASKS` cap (see Step 5). If there is a natural ordering between sub-tasks, run them sequentially instead.
  - **(x) Stop execution:** halt execution immediately. Do NOT perform Step 10 or Step 11 for this wave. Report partial progress via Step 13. All prior wave commits are preserved as checkpoints.

  If the user picks `(x) Stop execution` for any blocked task, stop the whole plan regardless of outstanding choices for other blocked tasks. Do not continue asking about the remaining blocked tasks.

  ### 5. Re-dispatch and wait for resolution

  After collecting a non-stop intervention for every task in `BLOCKED_TASKS`, re-dispatch all of them together (in parallel, subject to `MAX_PARALLEL_TASKS`). Use the same dispatch shape as Step 8. Wait for all re-dispatched workers to return.

  Apply Step 9 to the new responses. Then re-enter this gate (Step 9.5) with the new set of responses. The gate repeats until `BLOCKED_TASKS` is empty or the user picks `(x) Stop execution`.

  Each pass through the gate counts toward the per-task retry budget defined in Step 12 (3 retries per task). When a task exhausts its retry budget while still reporting `BLOCKED`, the gate does NOT defer to Step 12's generic "skip the failed task" branch — "skip" is not a valid exit from a `BLOCKED` state, because skipping would leave the wave with a permanently-unresolved blocker, and the spec forbids treating such a wave as successfully completed. The only ways out of this gate for a `BLOCKED` task are: (a) the user selects a non-stop intervention and re-dispatch eventually yields `DONE` or `DONE_WITH_CONCERNS` for that task, or (b) the user selects `(x) Stop execution`, which halts the entire plan via Step 13. If Step 12's automatic retry logic would otherwise offer "skip" for a task that is `BLOCKED` (as opposed to generically failing), present the user with only "retry with different model/context" (which re-enters this gate's §4 intervention menu) and "stop the entire plan" — never a silent skip. The gate does not exit successfully to Step 10/11 until every `BLOCKED` task is actually resolved.

  ### 6. Gate exit

  Exit this gate only when every task in the wave has a non-`BLOCKED` Step 9 status achieved by actual worker completion — i.e., the worker returned `DONE` or `DONE_WITH_CONCERNS`. A task is never transitioned out of `BLOCKED` by being skipped. At that point the wave is eligible for Step 10. Do not run Step 10 or Step 11 before this gate exits. The only alternative exit from the gate is `(x) Stop execution`, which halts the plan entirely (Step 13) and does NOT run Step 10 or Step 11 for this wave.

  ~~~

- [ ] **Step 3: Preserve all other Step 9 content unchanged in this step** — Step 9's `BLOCKED` bullet will be narrowed in Task 2; do not edit it here. The only change in this step is the insertion of the new `## Step 9.5: Blocked-task escalation gate` section between Step 9 and Step 10.

- [ ] **Step 4: Verify the insertion** — re-read `agent/skills/execute-plan/SKILL.md` and confirm: (a) `## Step 9.5: Blocked-task escalation gate` appears once and sits between the current Step 9 body and `## Step 10: Verify wave output`; (b) Step 10, Step 11, and Step 12 headings still exist and are spelled exactly as before; (c) no other step numbers shifted.

**Acceptance criteria:**
- `agent/skills/execute-plan/SKILL.md` contains a new top-level section `## Step 9.5: Blocked-task escalation gate`, inserted after Step 9 and before Step 10.
- The new section specifies, in order: wave drain, blocked-task collection, combined escalation view (including the wave-outcomes summary showing successful same-wave tasks), per-task intervention choice with the four options (more context / better model / split / stop), re-dispatch loop, gate-exit condition.
- The `(m) Better model` option is explicitly suppressed when the task's current model tier is already `capable`, so the gate never re-dispatches a `capable`-tier task to `capable` again under `(m)`. In that case the menu shows only `(c)`, `(s)`, and `(x)`. This preserves the Step 9 rule "Never ignore an escalation or re-dispatch the same task to the same model without changes."
- The new section explicitly states that Step 10 and Step 11 do not run while any wave task is blocked.
- The new section explicitly states that a `BLOCKED` task can only exit the gate via actual resolution (`DONE` / `DONE_WITH_CONCERNS`) or via `(x) Stop execution`; "skip" from Step 12's generic retry flow is NOT a valid exit for a `BLOCKED` task, so the gate never lets a wave with an unresolved blocker proceed to Step 10/11.
- The combined view requirement includes both blocker details per task AND the same-wave successful-task summary.
- Section headings `## Step 9`, `## Step 10`, `## Step 11`, `## Step 12` remain spelled exactly as before and appear in the same order.

**Model recommendation:** standard

---

### Task 2: Narrow Step 9's `BLOCKED` bullet to defer to Step 9.5

**Files:**
- Modify: `agent/skills/execute-plan/SKILL.md`

**Steps:**

- [ ] **Step 1: Re-read Step 9** — confirm the current bullet reads:

  ~~~
  - **BLOCKED** → assess the blocker:
    - Context problem → provide more context and re-dispatch
    - Reasoning problem → re-dispatch with a more capable model
    - Task too large → break into smaller sub-tasks and dispatch them
    - Plan is fundamentally wrong → escalate to the user
  ~~~

  Also confirm the trailing sentence under Step 9: `**Never ignore an escalation or re-dispatch the same task to the same model without changes.**`

- [ ] **Step 2: Replace the `BLOCKED` bullet** — replace the bullet block above with the following text. Leave the `Never ignore an escalation ...` sentence untouched and in place after this new bullet.

  ~~~
  - **BLOCKED** → do NOT recover inline. Record the worker's blocker details with the task, leave the task marked `BLOCKED`, and let the wave drain. The combined escalation is handled in Step 9.5, which surfaces every blocked task in the wave to the user before Step 10 runs. The four canonical interventions (more context, better model, split into sub-tasks, stop execution) live in Step 9.5.
  ~~~

- [ ] **Step 3: Keep all other Step 9 bullets unchanged** — `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT` bullets and the `**Never ignore an escalation...**` sentence remain exactly as written today.

- [ ] **Step 4: Verify the edit** — re-read Step 9 and confirm: (a) the `BLOCKED` bullet now references Step 9.5; (b) the four intervention types are named in Step 9 by reference, not by inline recipe; (c) `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT` bullets are unchanged; (d) the `Never ignore an escalation` sentence still follows the bullets.

**Acceptance criteria:**
- Step 9's `BLOCKED` bullet no longer describes four inline recovery paths. It names them as canonical and defers execution to Step 9.5.
- `NEEDS_CONTEXT` handling in Step 9 is unchanged.
- `DONE` and `DONE_WITH_CONCERNS` handling in Step 9 is unchanged.
- The `Never ignore an escalation or re-dispatch the same task to the same model without changes.` sentence is preserved under Step 9.

**Model recommendation:** cheap

**Dependencies:** Task 1 must be complete so that references in Step 9 to "Step 9.5" point at real content.

---

### Task 3: Gate Step 10 and Step 11 on the wave being blocker-free

**Files:**
- Modify: `agent/skills/execute-plan/SKILL.md`

**Steps:**

- [ ] **Step 1: Add a preamble paragraph to Step 10** — immediately after the `## Step 10: Verify wave output` heading, before the existing first paragraph ("After each wave, read each output file..."), insert this paragraph:

  ~~~
  **Precondition:** Only run this step after the Step 9.5 blocked-task escalation gate has exited. If any task in the current wave still has a Step 9 status of `BLOCKED`, do not run wave verification — return to Step 9.5. A wave with any unresolved `BLOCKED` task is NOT considered successfully completed.
  ~~~

- [ ] **Step 2: Add a preamble paragraph to Step 11** — immediately after the `## Step 11: Post-wave commit and integration tests` heading, before the existing `After wave verification (Step 10) completes successfully for a wave...` sentence, insert this paragraph:

  ~~~
  **Precondition:** Only run this step after both Step 9.5 (blocked-task escalation gate) has exited and Step 10 (wave verification) has passed. If any task in the current wave still has a Step 9 status of `BLOCKED`, do not commit and do not run integration tests for the wave — return to Step 9.5. Both the post-wave commit (Step 11.1) and the post-wave integration-test run (Step 11.2) are withheld until the wave completes successfully, meaning every wave task has a non-`BLOCKED` status.
  ~~~

- [ ] **Step 3: Verify the edits** — re-read Step 10 and Step 11 and confirm both now open with the `Precondition:` paragraph referencing Step 9.5. Confirm no other Step 10 or Step 11 content changed.

**Acceptance criteria:**
- Step 10 opens with a `Precondition:` paragraph that names Step 9.5 and states wave verification does not run while any task is `BLOCKED`.
- Step 11 opens with a `Precondition:` paragraph that names Step 9.5 and Step 10 and explicitly states both the post-wave commit and the integration-test run are withheld while any task is `BLOCKED`.
- The existing Step 10 verification instructions and Step 11 commit/test subsections are otherwise unchanged.

**Model recommendation:** cheap

**Dependencies:** Task 1 must be complete so the "Step 9.5" references resolve.

---

### Task 4: Clarify Step 12 so wave pacing does not gate BLOCKED escalation

**Files:**
- Modify: `agent/skills/execute-plan/SKILL.md`

**Steps:**

- [ ] **Step 1: Re-read the current Step 12 pacing paragraph** — confirm it reads:

  ~~~
  Apply wave pacing from Step 3:
  - **(a)** Always pause and report before the next wave starts
  - **(b)** Never pause; collect all failures and report at the very end
  - **(c)** Pause only when a wave produced failures; otherwise auto-continue
  ~~~

- [ ] **Step 2: Replace that paragraph with the version below** — the pacing options are unchanged in meaning for successful waves, but the paragraph now explicitly states that `BLOCKED` escalation is not governed by pacing:

  ~~~
  Apply wave pacing from Step 3. These options only govern the cadence of waves that contain no `BLOCKED` results. If the wave contains any `BLOCKED` results, Step 9.5 has already paused execution and presented the combined escalation; pacing does not apply to that pause.

  - **(a)** Always pause and report before the next wave starts
  - **(b)** Never pause; collect all failures and report at the very end
  - **(c)** Pause only when a wave produced failures; otherwise auto-continue

  Under any of (a), (b), or (c), a wave that contains at least one `BLOCKED` task is not eligible to be "collected and reported at the end" — the blocker is surfaced via Step 9.5 before the next wave starts.
  ~~~

- [ ] **Step 3: Leave the 3-retry automatic-retry logic above that paragraph unchanged** — the numbered retry/skip/stop choices (`Retry again ...`, `Skip the failed task ...`, `Stop the entire plan`) are independent of this plan's scope and must not be altered.

- [ ] **Step 4: Verify the edit** — re-read Step 12 and confirm: (a) the three pacing options still exist with the same labels; (b) a new sentence now says pacing only applies to waves without `BLOCKED` results; (c) the closing sentence clarifies pacing option (b) cannot swallow a blocker.

**Acceptance criteria:**
- Step 12 still lists pacing options (a), (b), (c) with their original behaviors.
- Step 12 now states explicitly that pacing options govern only blocker-free waves, and that option (b) ("Never pause; collect all failures ...") cannot defer a `BLOCKED` escalation to end-of-run.
- The generic 3-retry-then-escalate flow above the pacing paragraph is unchanged.

**Model recommendation:** cheap

**Dependencies:** Task 1 must be complete so the "Step 9.5" reference resolves.

---

### Task 5: End-to-end walkthrough review of the blocked-task flow

**Files:**
- Modify: `agent/skills/execute-plan/SKILL.md` (only if walkthrough reveals inconsistencies)

**Steps:**

- [ ] **Step 1: Re-read the full `agent/skills/execute-plan/SKILL.md`** — pay attention to the transitions between Step 8 → Step 9 → Step 9.5 → Step 10 → Step 11 → Step 12.

- [ ] **Step 2: Walk three scenarios against the prose and confirm each matches the spec acceptance criteria.**

  - **Scenario A — single blocked task under pacing (b) "never pause":** Wave 2 has tasks 3, 4, 5. Task 4 returns `BLOCKED`. Tasks 3 and 5 return `DONE`. Expected: Step 9 records Task 4 as `BLOCKED` without inline recovery. Step 9.5 runs. User sees a combined view including Task 3 and Task 5 outcomes plus Task 4's blocker. User picks `(c) More context` for Task 4. Task 4 is re-dispatched. On success, Step 9.5 exits, Step 10 and Step 11 run, Wave 3 starts. Confirm the prose supports this path with no ambiguity.

  - **Scenario B — two blocked tasks, different interventions:** Wave 2 has tasks 3, 4, 5, 6. Tasks 4 and 6 return `BLOCKED`; Tasks 3 and 5 return `DONE`. Task 4's current tier is `standard` (so `(m)` is offered); Task 6's current tier is `capable` (so `(m)` is suppressed). Expected: a single combined view lists all four task outcomes. The Task 4 menu shows `(c)/(m)/(s)/(x)`; the Task 6 menu shows only `(c)/(s)/(x)`. User picks `(m) Better model` for Task 4 (escalating `standard` → `capable`) and `(s) Split into sub-tasks` for Task 6. Both recover independently. Step 10 and Step 11 do not run until both are resolved. Confirm the prose allows per-task choice, suppresses `(m)` at the `capable` tier, and re-dispatches them together.

  - **Scenario C — user stops on one of several blocked tasks:** Wave 2 has Tasks 4 and 6 `BLOCKED`. User picks `(x) Stop execution` for Task 4. Expected: the gate halts the whole plan; Step 10, Step 11, and subsequent waves do not run; Step 13 partial-progress report runs. Confirm the prose makes "stop on one means stop all" explicit.

  - **Scenario D — retry budget exhausts on a blocked task:** Wave 2 Task 4 is `BLOCKED`, user picks `(c) More context`, re-dispatch still returns `BLOCKED`, repeated until the task's 3-retry budget from Step 12 is exhausted. Expected: Step 12 does NOT offer a silent "skip" that proceeds to Step 10/11 — the gate only exposes the §4 intervention menu again (different model, different context, split) plus `(x) Stop execution`. The wave never advances to Step 10 or Step 11 while Task 4 is still `BLOCKED`. Confirm the prose in §5 and §6 rules out a skip-based gate exit.

- [ ] **Step 3: Fix any inconsistency** — if any scenario walk reveals a gap (e.g., ambiguous language, a missing cross-reference between steps, an unhandled edge case), edit the relevant section to close the gap. Keep fixes minimal and localized. Do not rewrite Step 9.5 beyond what is needed to remove the ambiguity.

- [ ] **Step 4: Record the scenario results** — in the task's worker report, list each scenario and note "matches prose" or "required fix: <summary>". Do not add any new section to SKILL.md for this.

**Acceptance criteria:**
- Each of Scenarios A, B, C, D can be traced step-by-step through the revised prose and produces the behavior described above.
- If any fix was applied, it is minimal (single-section edit) and does not reintroduce inline `BLOCKED` recovery in Step 9 or weaken the Step 10/11 preconditions added in Task 3.
- Spec acceptance criteria are all satisfied after this task:
  - Under any wave pacing option, no later wave starts before the user sees the blocker escalation. ✓ (Step 9.5 + Task 4 pacing clarification)
  - In-flight same-wave tasks finish before escalation is shown. ✓ (Step 9.5 "drain" section)
  - Combined escalation view for multiple blocked tasks. ✓ (Step 9.5 §3)
  - Escalation view includes blocker details + same-wave successful-task summary. ✓ (Step 9.5 §3)
  - Per-task intervention choice, not wave-wide. ✓ (Step 9.5 §4)
  - Interventions still include more context / better model / split / stop. ✓ (Step 9.5 §4)
  - No post-wave commit while blocked. ✓ (Task 3 Step 11 precondition)
  - No post-wave integration test while blocked. ✓ (Task 3 Step 11 precondition)
  - Normal commit + integration-test resume after the wave completes successfully. ✓ (Step 9.5 §6 gate exit + Step 11 unchanged afterward)

**Model recommendation:** standard

**Dependencies:** Tasks 1, 2, 3, 4 must be complete.

---

## Dependencies

- Task 2 depends on: Task 1
- Task 3 depends on: Task 1
- Task 4 depends on: Task 1
- Task 5 depends on: Task 1, Task 2, Task 3, Task 4

Wave assignment:
- Wave 1: [Task 1]
- Wave 2: [Task 2, Task 3, Task 4]
- Wave 3: [Task 5]

---

## Risk Assessment

- **Risk: Tasks 2, 3, 4 all modify the same file (`SKILL.md`) and run in the same wave.** In-flight parallel edits to one file can conflict at the diff/merge level. Mitigation: each of Tasks 2/3/4 edits a disjoint section (Task 2 → Step 9 bullet only; Task 3 → Step 10 opening + Step 11 opening only; Task 4 → Step 12 pacing paragraph only). The edits use surgical string replacements scoped to unique anchors (the bullet text, the section heading). If the execution harness cannot merge three parallel edits to one file cleanly, the fallback is to serialize Wave 2 (run Tasks 2, 3, 4 sequentially). The plan dependency graph permits either ordering.

- **Risk: Cross-references go stale if section numbers shift.** The new section is deliberately numbered `9.5` (not `10`) so no downstream step has to be renumbered. Task 1 Step 1 explicitly checks that existing step headings are preserved; Task 5 Step 1 re-verifies end-to-end.

- **Risk: `BLOCKED` is redefined in Step 9 but pre-existing plan executions in-flight might reference the old behavior.** This is a prose skill loaded at the start of each execution, so there is no persistent state; the next run uses the new prose. No migration needed.

- **Risk: Step 9.5 "gate" language is ambiguous about what "drain" means if `execute-plan` is in sequential mode.** In sequential mode, only one worker is running at a time, so "drain" is trivially satisfied by the current task finishing. Step 9.5 §1 ("rely on that") covers both parallel and sequential modes because `execute-plan` already waits for all dispatched workers before proceeding.

- **Risk: Retry-budget interaction with the gate loop.** Step 9.5 §5 references Step 12's 3-retry budget as a backstop against a user who keeps picking `(c) More context` on the same task forever. However, "skip" from Step 12's generic retry-exhaustion flow is explicitly disallowed as a gate exit for a `BLOCKED` task, because that would let a wave with an unresolved blocker be treated as successfully completed (which the spec forbids). If budget is exhausted, the user's only choices for that task are re-entering the §4 intervention menu (different model/context, split into sub-tasks) or `(x) Stop execution`, which halts the plan. This preserves the "no successful wave completion without actual resolution" invariant and still terminates — either by resolution or by plan halt.

- **Risk: `(m) Better model` would re-dispatch a `capable`-tier task to `capable` again, violating the preserved Step 9 rule "Never ignore an escalation or re-dispatch the same task to the same model without changes."** Resolved by suppressing `(m)` from the menu whenever the task's current tier is already `capable`. In that case the user must pick `(c)` (adds new context — qualifies as a meaningful change), `(s)` (restructures the task — qualifies as a meaningful change), or `(x)` (halts the plan). The gate never silently re-dispatches a `capable` task to `capable` under the `(m)` label. See Task 1 Step 2 §4 for the menu suppression rule and Task 1 acceptance criteria.

- **Risk: Scenario walk (Task 5) turns up a gap that requires a larger edit than "localized fix."** If Task 5 finds that the spec's acceptance criteria cannot be traced cleanly, the planner/author should return to this plan rather than expanding Task 5 beyond its intended minimal-fix scope. Keep Task 5 scope-guarded.

---

## Notes on Verification

This repository has no automated test suite — `execute-plan` is a prose skill. Verification for this plan is the Task 5 scenario walkthrough, not a test runner. No `## Test Command` section is emitted.

## Review Notes

_Added by plan reviewer — informational, not blocking._

### Warnings
- **Tasks 2–4**: Same-file edits are scheduled in one parallel wave
  - **What:** Wave 2 groups Tasks 2, 3, and 4 together even though all three modify `agent/skills/execute-plan/SKILL.md`. The risk section acknowledges this and suggests serializing Wave 2 if merge conflicts occur, but that fallback is not encoded in the actual task graph or wave plan.
  - **Why it matters:** An executor following the plan literally in default parallel mode could have three workers produce overlapping edits to the same file, creating merge/overwrite risk even though the intended anchors are disjoint. That is a buildability risk, especially for an automation-first execution flow.
  - **Recommendation:** Keep the plan approved, but encode the mitigation directly before execution: either split Tasks 2/3/4 into separate waves or add an explicit execution note that Wave 2 must be run sequentially despite the dependency graph allowing parallelism.
