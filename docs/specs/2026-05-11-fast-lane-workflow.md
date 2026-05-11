# Fast Lane: Lightweight Implementation Workflow After `define-spec`

Source: TODO-0aac17a1

## Goal

Add a `fast-lane` skill that provides a scaled-down implementation workflow for small features and non-trivial bug fixes. After `define-spec` shapes and commits a spec, the user picks between **fast lane** (lightweight checklist + one `coder` + the existing `refine-code` review loop with a reduced iteration budget + commit + `finishing-a-development-branch`) and **deep workflow** (the existing `generate-plan` → `refine-plan` → `execute-plan` chain). Fast lane preserves the deep Q&A discipline of `define-spec` and the fresh-context review pass of `refine-code`, but drops dependency-wave decomposition, per-task `verifier` dispatch, baseline/post-wave/final-gate integration-test reconciliation, and the iterative `refine-code` loop run at full budget. The result is a first-class, repeatable replacement for the ad-hoc lightweight workflow users currently assemble by hand.

## Context

The repository has an established heavy workflow:

- `define-spec` (`agent/skills/define-spec/`) shapes a spec via the `spec-designer` subagent and gates the commit on user review. Its Step 8 currently offers a binary `Run generate-plan next? (y/n)` follow-up.
- `generate-plan` (`agent/skills/generate-plan/`) dispatches `planner` to write a structured plan under `docs/plans/`, then chains into `refine-plan`'s adversarial review-edit loop.
- `execute-plan` (`agent/skills/execute-plan/`) validates the structured plan, optionally creates a worktree via `using-git-worktrees`, decomposes tasks into dependency waves, dispatches `coder` subagents in parallel, dispatches fresh-context `verifier` subagents per task, runs `test-runner` baseline/post-wave/final-gate integration tests with frozen-baseline reconciliation, invokes `refine-code` for an iterative review-remediate loop, closes the linked todo, and offers branch completion via `finishing-a-development-branch`.

This stack is correct for medium-to-heavy work but excessive for one-subsystem fixes. Users already run a lightweight version of this manually: "give me a checklist, dispatch one coder, run a code review, commit." This spec encodes that as a first-class workflow.

Existing skills the fast-lane skill will **reuse without modification**:

- `commit` (`agent/skills/commit/`) — Conventional Commits-style commit; never pushes.
- `test-driven-development` (`agent/skills/test-driven-development/`) — RED/GREEN/REFACTOR discipline; called by the coder for behavioral changes.
- `verification-before-completion` (`agent/skills/verification-before-completion/`) — read full command output before claiming success.
- `refine-code` (`agent/skills/refine-code/`) — already supports `--max-iterations <N>` and the `STATUS: approved / approved_with_concerns / not_approved_within_budget / failed` contract, with persistent review artifacts under `docs/reviews/<name>-code-review-v<ERA>.md` and provenance validation via `validate-review-provenance.py`.
- `finishing-a-development-branch` (`agent/skills/finishing-a-development-branch/`) — post-completion menu (merge / push+PR / keep / discard); gated to feature branches.

Existing helpers fast lane reuses:

- `agent/skills/_shared/scripts/detect-test-command.py` — auto-detect project test command.
- `agent/skills/_shared/test-runner-dispatch.md` — canonical protocol for dispatching `test-runner`.
- `agent/skills/_shared/scripts/parse-test-runner-artifact.py` — parse test-runner artifacts.
- `agent/skills/_shared/scripts/reconcile-test-run.py` — `--mode capture` and `--mode reconcile` for the on-demand baseline comparison.
- `agent/skills/_shared/scripts/resolve-model-dispatch.py` — model tier resolution.

The fast-lane skill itself lives at `agent/skills/fast-lane/` (kebab-case directory; slash command `/fast-lane`).

## Requirements

### Entry surface

- The skill accepts a **spec path** (absolute, or relative under `docs/specs/`) **or** a **todo ID** (`TODO-<id>`). Freeform text is rejected with a guidance message recommending `/define-spec`.
- The skill is invoked as `/fast-lane <spec-path-or-todo-id>`.
- `define-spec`'s Step 8 is replaced with a 3-option menu plus a heuristic recommendation:

  ```
  Spec committed at <path>. Recommended next step: <fast lane | deep workflow> because <short rationale>.

  Options:
  (f) fast lane    — checklist, serial execution, light gates
  (d) deep workflow — full plan, parallel execution, all gates
  (x) stop         — spec remains committed for later
  ```

- The recommendation heuristic uses the just-committed spec's content:
  - **Recommend fast lane** when the spec has no `## Approach` section (architecture round did not run), the `## Requirements` bullet count is small, and the `## Non-Goals` section does not flag multi-subsystem, migration, security, or compatibility concerns.
  - **Recommend deep workflow** otherwise.
- Selecting `(f)` invokes `/fast-lane <spec-path>`. Selecting `(d)` invokes `/generate-plan <spec-path>`. Selecting `(x)` exits silently leaving the spec committed.

### Checklist phase

- The orchestrator reads the spec (or todo body) and generates a 3–7-step implementation checklist inline. The checklist is **ephemeral**: shown to the user for confirmation, embedded in the `coder` prompt, never written to disk.
- The top-level checklist confirmation displays the spec metadata, the checklist, and a Settings block:

  ```
  Spec:  <spec path>                   (or: Todo: TODO-<id>)
  Goal:  <one-line summary>

  Checklist:
    1. <step 1>
    2. <step 2>
    ...

  Settings:
    Coder tier:        capable (high thinking)
    TDD:               enabled
    Test suite check:  enabled (test command: <cmd>)        [or "disabled (no test command detected)"]
    Refine-code:       max-iterations 3

  Ready to start: (s)tart / (c)ustomize / (e)dit checklist / (p)romote to deep workflow / (x) stop
  ```

- The `(c)` customize submenu exposes only two settings — TDD and "Test suite check" are transparency-only and not user-configurable:

  ```
  Choose a setting to change:
    (t) Coder tier               — current: capable (high thinking)
    (r) Refine-code iterations   — current: 3
    (m) Back to main menu
  ```

  - `(t) Coder tier`: prompt for `cheap` / `standard` / `capable`.
  - `(r) Refine-code iterations`: prompt for an integer (1–5).

- `(e) Edit checklist` lets the user revise the orchestrator's draft and re-show the top-level confirmation.
- `(p) Promote to deep workflow` stops fast lane (no state change yet — the coder has not run) and surfaces guidance: "Run /generate-plan <spec-path>".
- `(x) Stop` exits silently; the spec remains committed.

### Git preflight (after `(s) Start`)

1. Capture `BASE_SHA = git rev-parse HEAD`.
2. Run `git status --porcelain`. If non-empty:

   ```
   ⚠️ Working tree is dirty:
   <git status --porcelain output>

   Options:
   (c) Continue — commit existing changes now, then proceed with fast lane
   (x) Stop — handle existing changes manually, then run /fast-lane <spec-path>
   ```

   - `(c) Continue` invokes the `commit` skill so the user can commit the pre-existing changes via the skill's standard flow (user-supplied message), then re-captures `BASE_SHA = git rev-parse HEAD` post-commit before continuing.
   - `(x) Stop` exits.

3. Check the current branch against `{main, master, develop}`. If matched:

   ```
   ⚠️ You're on `<branch>`. The fast lane commit will land directly on `<branch>`.

   Options:
   (c) Continue on `<branch>`
   (x) Stop — switch to feature branch manually, then run /fast-lane <spec-path>
   ```

4. **No worktree creation.** Fast lane operates in the current workspace.

### Coder phase

- Dispatch one `coder` subagent with a self-contained prompt containing the spec/todo content, the confirmed checklist, the expected file/subsystem touch points, the existing TDD directive (the coder calls `test-driven-development` for behavioral changes and non-trivial bug fixes), and the existing `STATUS: DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED` reporting contract.
- Default tier: `capable` at `thinking: high`. Resolve the concrete `(model, cli)` via `resolve-model-dispatch.py --tier capable --agent coder`.
- The intended mechanism for `thinking: high` is a per-dispatch override at the `subagent_run_serial` call site. If the runtime does not support per-call thinking override, fall back to a planner-decided alternative (see Open Questions).

### Coder status handling

- **`DONE`** → proceed to the verification phase.
- **`DONE_WITH_CONCERNS`** → surface the concerns block to the user with a `(c) Continue / (x) Stop` checkpoint. `(c)` records concerns for the final summary and proceeds. `(x)` stops without committing.
- **`NEEDS_CONTEXT`** → surface the needs block; ask the user for the missing context; re-dispatch once with the context appended. A second `NEEDS_CONTEXT` or `BLOCKED` exits to the `BLOCKED` handler.
- **`BLOCKED`** → surface:

  ```
  🚫 Coder returned BLOCKED:
  <blocker block, verbatim>

  Fast lane cannot continue. Options:
  (p) Promote to deep workflow
  (x) Stop — leave partial changes uncommitted for manual triage
  ```

  - `(p)` surfaces guidance: "Discard or stash the working tree (`git checkout -- .` or `git stash push -u`), then run `/generate-plan <spec-path>`." Fast lane does **not** auto-discard or auto-stash — the coder's partial work may be valuable.
  - `(x)` surfaces investigation/triage guidance and exits.

### Verification phase (after coder `DONE` or `DONE_WITH_CONCERNS (c)`)

1. Resolve the project test command: checklist-named command → `detect-test-command.py` → "not detected." If "not detected," skip the verification phase silently and proceed to the commit phase.
2. Dispatch `test-runner` per `test-runner-dispatch.md` with the project test command and artifact path `docs/test-runs/<spec-name>/full-suite.log`. Parse the artifact via `parse-test-runner-artifact.py` to extract `FAILING_IDENTIFIERS:` and `NON_RECONCILABLE_FAILURES:`.
3. **No baseline reconciliation by default.** Fast lane runs in user time; if there is no surfaced failure, proceed silently to the commit phase.
4. If either `FAILING_IDENTIFIERS:` or `NON_RECONCILABLE_FAILURES:` is non-empty, surface the failure checkpoint:

   ```
   ⚠️ Project test suite reported failures after fast lane implementation:
   <failing identifiers, verbatim>
   <non-reconcilable evidence, verbatim>

   Options:
   (c) Continue to refine loop — record as concerns, commit, and move to review
   (b) Compare with baseline — stash changes, re-run suite, restore changes, show existing failures vs regressions
   (x) Stop — leave spec committed but changes uncommitted for manual triage
   ```

### `(b)` Baseline comparison (on-demand)

1. `git stash push -u -m "fast-lane-baseline-comparison-<spec-name>"`. Preserve the stash ref.
2. Dispatch `test-runner` over the now-clean working tree with artifact path `docs/test-runs/<spec-name>/baseline.log`.
3. Run `reconcile-test-run.py --artifact docs/test-runs/<spec-name>/baseline.log --mode capture` → `docs/test-runs/<spec-name>/baseline-failures.json`.
4. Run `reconcile-test-run.py --artifact docs/test-runs/<spec-name>/full-suite.log --mode reconcile --baseline-failures docs/test-runs/<spec-name>/baseline-failures.json` to compute `.current_non_baseline_stable` (new regressions) and `.current_non_reconcilable`. The pre-existing set is `baseline_failures ∩ current.failures`; the fixed-by-change set is `baseline_failures - current.failures`.
5. `git stash pop`. If pop reports conflicts, hard-stop with manual-resolution guidance; the stash ref is preserved:

   ```
   Stash restoration produced conflicts. Working tree is in a mixed state.
   Stash ref preserved: <ref>
   Resolve manually: `git stash show <ref>`, then `git stash apply <ref>` / `git checkout -- .` as appropriate.
   Fast lane stopped.
   ```

6. On clean `stash pop`, render the three buckets to the user:

   ```
   Pre-existing failures (also fail on clean tree):
   <list, or "(none)">

   New regressions (caused by fast lane changes):
   <list, or "(none)">

   Fixed by fast lane changes (failed on clean tree, pass now):
   <list, or "(none)">

   Options:
   (c) Continue to refine loop — record as concerns, commit, and move to review
   (x) Stop — leave spec committed but changes uncommitted for manual triage
   ```

### Commit phase

- After `(c) Continue` at the verification phase (whether the suite was clean or the user is recording failures as concerns), invoke the `commit` skill. The commit message is derived from the spec goal in Conventional Commits style.
- Test-runner failures (when surfaced as concerns) are tracked in the orchestrator's run state and surfaced in the final summary. They are **not** appended to the commit message — the test-runner artifact at `docs/test-runs/<spec-name>/full-suite.log` is the audit trail.

### Refine-code phase

- Capture `HEAD_SHA = git rev-parse HEAD` (post-commit).
- Invoke the `refine-code` skill with: `BASE_SHA`, `HEAD_SHA`, description derived from the spec goal, the spec content as `--plan-contents`, `--max-iterations 3` (or the user-customized value), and `--review-output-path docs/reviews/<spec-name>-fast-lane-review` (namespaced to distinguish from deep-workflow reviews of the same spec).
- Refine-code's existing menu on `STATUS: not_approved_within_budget` (`(a) keep iterating` / `(b) proceed` / `(c) stop`) stays as-is — fast lane introduces no override.
- Refine-code's existing provenance validation (`validate-review-provenance.py`) runs as normal.

### Todo closure

- After `refine-code` returns `approved` or `approved_with_concerns` (or the user picks `(b) Proceed with issues` at budget exhaustion):
  1. Determine the todo ID:
     - If input to fast lane was a todo ID, use it directly.
     - Else, extract `Source: TODO-<id>` from the spec preamble.
     - Else, skip silently.
  2. Read the todo. If missing or already "done", skip silently.
  3. Update todo status to "done" and append `Completed via fast lane: <commit SHA>, spec: <spec path>` (or `Completed via fast lane: <commit SHA>, spec: (input was todo)` when no spec was involved).

### Post-completion

- Invoke `finishing-a-development-branch` as-is (matches execute-plan's Step 16.4). On a feature branch, the 4-option menu (merge / push+PR / keep / discard) gives the user full control over what happens next.
- On `main`/`master`/`develop`, `finishing-a-development-branch` is skipped by its existing protected-branch gate — fast lane reports the run summary; the user runs `git push` manually if desired. Fast lane introduces no automatic push.

### Artifacts and cleanup

- Test-runner artifacts (`full-suite.log`, optional `baseline.log`, optional `baseline-failures.json`) live under `docs/test-runs/<spec-name>/`.
  - Preserved on any stop exit (verification checkpoint `(x)`, baseline-stash-conflict, coder `BLOCKED`, refine-code budget-exhaustion `(c) stop`).
  - Cleaned up on successful completion (refine-code approved or proceeded; commit and todo closure complete). Mirrors execute-plan's per-plan test-runs cleanup pattern, scaled down to one file (or three in the `(b)` baseline-comparison case).
- Refine-code review artifacts at `docs/reviews/<spec-name>-fast-lane-review-v<ERA>.md` follow refine-code's existing retention policy (kept).
- Checklist remains ephemeral; no on-disk artifact at any point.

### Documentation

- New `agent/skills/fast-lane/SKILL.md` and `agent/skills/fast-lane/README.md`.
- Existing skill READMEs and SKILL.mds that describe the workflow chain (notably `define-spec`'s SKILL.md Step 8 and any `agent/skills/*/README.md` that references the post-`define-spec` flow) reflect the new fast-lane branch alongside the deep workflow.

## Constraints

- Fast lane operates **inline in the orchestrator session**. It does not dispatch a coordinator subagent. The skill drives every step directly.
- Fast lane **does not create a worktree**. Users who want a worktree create one before invoking fast lane.
- Fast lane **does not invoke `using-git-worktrees`**.
- Fast lane **does not dispatch a `verifier` subagent** for per-criterion acceptance checking. Acceptance verification rests on the coder's TDD discipline and the `code-reviewer` reading the diff during `refine-code`.
- Fast lane **does not run baseline integration-test reconciliation as a default precondition**. Reconciliation is on-demand only, via `(b) Compare with baseline` at the verification-failure checkpoint.
- Fast lane **does not push automatically**. Push happens only when the user picks option 2 (push + PR) in `finishing-a-development-branch`, or manually post-exit.
- Fast lane **does not modify** the `refine-code`, `commit`, `test-driven-development`, `verification-before-completion`, `finishing-a-development-branch`, or `using-git-worktrees` skills. It composes them.
- Fast lane **does not modify** `execute-plan`, `generate-plan`, or `refine-plan`. It is a peer path branching from `define-spec`'s Step 8.
- Fast lane **does not introduce a new agent definition** unless per-call `thinking: high` override is unsupported and the planner determines a fast-lane-specific coder variant is necessary.

## Approach

**Chosen approach:** Inline orchestrator skill. `agent/skills/fast-lane/` is a single skill (SKILL.md + supporting files) that runs every step of the workflow directly in the orchestrator's session. The skill invokes existing subagents (`coder`, `test-runner`) and existing skills (`commit`, `refine-code`, `finishing-a-development-branch`) inline.

**Why this over alternatives:**

- The fast-lane flow is interactive-checkpoint-heavy: checklist confirmation, dirty-state check, branch check, coder result review, test-failure checkpoint, optional baseline-comparison results, optional refine-code budget-exhaustion menu, post-completion menu. Inline orchestration handles every checkpoint directly without subagent-to-orchestrator relay machinery.
- Fast lane invokes `refine-code`, which itself dispatches a `code-refiner` coordinator via `pi`. Running fast lane inline keeps that nested dispatch simple; running it inside its own coordinator subagent would compose nested coordinator dispatches with a more complex execution model.
- The pattern "many checkpoints + mid-stream delegation to other skills inline" is already established by `execute-plan`. Fast lane reuses that idiom; contributors don't have to learn a new shape.

**Considered and rejected:**

- **Dispatched coordinator (mux-backed, with inline fallback).** Mirrors `define-spec`'s probe + mux/inline dispatch. Workable but heavier: requires a probe helper, a dispatch flow, a completion marker contract, a transcript-backed recovery path, and a new coordinator agent definition. The mux pattern is well-suited to a single sustained Q&A (which is what `spec-designer` does); applying it to a multi-stage workflow that delegates to other skills mid-stream is a stretch, and the implementation cost is meaningfully larger than inline. Not worth it for this skill.
- **Headless dispatched coordinator with structured checkpoint requests.** Coordinator runs without an interactive pane and emits structured request markers back to the orchestrator at every checkpoint. Many round-trips, no context-isolation benefit, much more complex than inline. Not viable for an interactive flow.

## Acceptance Criteria

- `agent/skills/fast-lane/` exists with at minimum `SKILL.md` and `README.md`; the slash command `/fast-lane` resolves to this skill.
- `/fast-lane <spec-path>` and `/fast-lane TODO-<id>` both work as entry points. `/fast-lane <freeform-text>` is rejected with a guidance message.
- `define-spec`'s Step 8 is replaced with the 3-option menu (`(f)` / `(d)` / `(x)`) and a heuristic recommendation derived from the just-committed spec's content.
- A successful fast lane run on a clean working tree against a small spec performs: checklist generation → user confirmation at the top-level menu → git preflight → coder dispatch → test-runner over the full project suite (when a test command resolves) → commit → `refine-code` with `--max-iterations 3` → todo closure (when a `Source: TODO-<id>` or direct todo input applies) → `finishing-a-development-branch` (or skip on protected branch). All steps run inline in the orchestrator session.
- Coder `BLOCKED` surfaces the `(p) Promote to deep workflow` / `(x) Stop` menu with guidance that does **not** auto-discard or auto-stash the working tree.
- The verification-failure checkpoint surfaces `(c) Continue / (b) Compare with baseline / (x) Stop`. `(b)` stashes, runs the suite, reconciles via `reconcile-test-run.py`, restores via `git stash pop`, and presents the three buckets (pre-existing / new regressions / fixed-by-change) to the user.
- `git stash pop` conflicts during `(b)` surface as a hard-stop with manual-resolution guidance; the stash ref is preserved.
- Fast lane does not create a worktree under any condition.
- Fast lane does not push under any condition. Push happens only through `finishing-a-development-branch`'s option 2, which the user selects explicitly.
- Todo closure on success appends `Completed via fast lane: <commit SHA>, spec: <spec path>` (or `(input was todo)`) to the todo body. The pattern mirrors `execute-plan`'s Step 16.2.
- On `main`/`master`/`develop`, fast lane skips `finishing-a-development-branch` and does not auto-push.
- Test-runner artifacts under `docs/test-runs/<spec-name>/` are preserved on every stop exit and cleaned up on successful completion.
- The customize submenu exposes only `(t) Coder tier`, `(r) Refine-code iterations`, and `(m) Back to main menu`. TDD and "Test suite check" are visible in the Settings block but not reachable from customize.

## Non-Goals

- Modifying `refine-code`'s internal review-remediate loop, agent dispatches, or artifact format.
- Modifying `execute-plan`'s wave decomposition, `verifier` dispatch, or integration-test baseline/post-wave/final-gate protocol.
- Introducing a `verifier` subagent dispatch for per-criterion acceptance checking. Fast lane relies on the coder's TDD discipline and the reviewer's diff reading.
- Worktree creation or `using-git-worktrees` integration.
- A standalone fast-lane review path independent of `refine-code` (e.g., a one-pass `code-reviewer` dispatch).
- A persisted checklist artifact under `docs/checklists/` or similar.
- Automatic state transition from fast lane to deep workflow. Escalation is guidance-only; the user manually handles the working tree and invokes `/generate-plan`.
- Automatic push on any branch under any condition.
- A `--push` invocation flag.
- A protected-branch override flag. Protected-branch commits require interactive `(c) Continue` confirmation at the git preflight step.
- The following out-of-scope follow-up todos to be **created separately by the user** (not by this spec or its implementer):
  - Port fast lane's customize submenu pattern back to `execute-plan`'s Step 3 settings flow.
  - Port fast lane's dirty-state commit-then-clean handling to `execute-plan`'s Step 0 (today's execute-plan offers `(c) / (q) / (n)` on dirty state but does not auto-commit the pre-existing changes before proceeding).

## Open Questions

- **Per-call `thinking: high` runtime support.** The intended dispatch mechanism is per-call thinking override at the `subagent_run_serial` call site. No existing skill in the repo overrides `thinking` per-task, so runtime support is unverified. If unsupported, the planner decides the alternative: either bump `agent/agents/coder.md`'s frontmatter default from `thinking: medium` to `thinking: high` (broad impact on every coder caller — `execute-plan` waves and `refine-code` remediators included), or introduce a fast-lane-specific coder agent variant. The fast-lane spec is mechanism-agnostic on the override; only the dispatched coder's effective thinking level matters.
