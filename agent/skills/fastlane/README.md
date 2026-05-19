# Fast Lane skill

Lightweight implementation workflow after `define-spec` for small features and non-trivial bug fixes. Runs a checklist + one `coder` + the existing `refine-code` review loop at reduced budget, then `finishing-a-development-branch`.

## Role in the workflow

Fast lane branches off from `define-spec` at Step 8, offering users a choice between `(f) fast lane` / `(d) deep workflow` / `(x) stop`. It is the sibling of the `generate-plan` → `refine-plan` → `execute-plan` deep workflow sequence. Fast lane preserves the deep Q&A discipline of `define-spec` and the fresh-context review pass of `refine-code`, trading off worktree isolation and iterative refinement for reduced time-to-merge on well-scoped features.

## Inputs

Fast lane accepts two input shapes:

- **Spec path** — a relative path under `docs/specs/` or an absolute path containing `/docs/specs/`, ending in `.md`. The file must exist on disk.
- **TODO-<id>** — a todo identifier in the format `TODO-<8-character-hex>` (case-insensitive). The file `docs/todos/<bare-id>.md` must exist, where `<bare-id>` is the 8-character hex tail without the `TODO-` prefix.

Freeform input that matches neither pattern is rejected with the message: "fastlane: input must be a spec path under docs/specs/ or a TODO-<id>. Run /define-spec first to shape a spec."

## Phases

Fast lane runs the following phases in order, each with a menu when action or decision is required:

1. **Checklist** — Read the spec/todo body and emit a 3–7-step numbered implementation checklist scoped to the file and subsystem mentions. The checklist is ephemeral (lives in orchestrator state only).

2. **Settings & customize** — Initialize run state (`coder_tier = capable`, `refine_max_iterations = 3`), render the Settings block, and offer the top-level confirmation menu with options to start, customize, edit checklist, promote to deep workflow, or stop. Menu: `(s)/(c)/(e)/(p)/(x)`.

3. **Git preflight** — Capture the current HEAD and check for a dirty working tree. No worktree creation occurs. Protected branches surface a warning and continue automatically (no prompt). Menu: `(c)/(x)` for dirty state only.

4. **Coder dispatch** — Resolve the coder model tier via `resolve-model-dispatch.py --tier <coder_tier> --agent coder`, fill the coder prompt template, and dispatch the `coder` agent with `thinking: "high"` override. One dispatch per run; re-dispatch only if coder returns `NEEDS_CONTEXT` (once only).

5. **Verification phase** — Resolve the project test command, run the test suite, and parse the results. If tests pass, proceed silently. If tests fail, surface failures and offer menu: `(c)/(b)/(x)`. The `(c)` option records failures as concerns; `(b)` enters baseline comparison; `(x)` stops.

6. **Optional baseline comparison** — On `(b)`, stash changes, run the test suite on the clean tree, restore changes, and render a three-bucket summary (pre-existing failures, new regressions, fixed failures). Menu: `(c)/(x)` to continue or stop.

7. **Commit** — Invoke the commit skill (no path restriction) to commit the coder's changes with a Conventional Commits message derived from the spec goal. Capture the commit SHA.

8. **Refine-code** — Invoke `refine-code` with BASE_SHA, HEAD_SHA, the spec description, plan contents, max iterations (customizable via run state), and review-output path namespaced with `-fastlane-review`. Refine-code's existing menu stays as-is. Menu: refine-code's options; proceed on `approved`, `approved_with_concerns`, or `(p) Proceed with issues`.

9. **Todo closure** — If the input was a todo ID or the spec preamble contains `Source: TODO-<id>`, update the todo status to `done` and append a completion line.

10. **Post-completion** — On a feature branch, invoke `finishing-a-development-branch` (its existing 4-option menu applies). On protected branches (`main`, `master`, `develop`), skip and report the run summary; no automatic push occurs.

## Retained vs dropped

Fast lane retains the following guardrails from the deep workflow:

- **Deep Q&A discipline** — preserved via `define-spec` as the mandatory input shaper.
- **Test-Driven Development** — the dispatched `coder` is directed to consult `test-driven-development` for behavioral changes.
- **Full-command-output reading** — the `coder` consults `verification-before-completion` before reporting DONE.
- **Fresh-context review** — preserved via the `refine-code` skill at reduced iteration budget (default 3, customizable 1–5).
- **Commit discipline** — the commit skill enforces Conventional Commits style.

Fast lane drops the following guardrails relative to the deep workflow:

- **Worktree creation** — Fast lane does NOT create a worktree under any condition. It operates in the current workspace.
- **Wave decomposition** — the checklist is generated but not decomposed into waves; the `coder` implements all steps in one dispatch.
- **Per-task verifier dispatch** — no `verifier` agent is dispatched; test results are parsed locally.
- **Baseline-precondition reconciliation** — baseline comparison is on-demand (via `(b)` in Step 6) only, not automatic.
- **Iterative refine-code at full budget** — refine-code runs at reduced max iterations (default 3) instead of the full 5.

**Explicit safeguards:** Fast lane does NOT push automatically under any condition. User has explicit control via `finishing-a-development-branch` (feature branches) or manual `git push` (protected branches).

## Coder dispatch

The coder agent is resolved by tier. The tier is initialized to `capable` in the Settings block (Step 2) and may be customized via the `(c) Customize` submenu's `(t) Coder tier` option (allowed values: `cheap`, `standard`, `capable`).

Model resolution:
```
python3 agent/skills/_shared/scripts/resolve-model-dispatch.py --tier <coder_tier> --agent coder
```

Dispatch is a single task to `agent: "coder"` with `thinking: "high"` per-call override:
```
subagent_run_serial {
  tasks: [
    {
      name: "fastlane-coder",
      agent: "coder",
      task: "<filled prompt>",
      model: "<resolved model>",
      cli: "<resolved cli>",
      thinking: "high"
    }
  ],
  wait: true
}
```

The `thinking: "high"` field is a per-call override at the `subagent_run_serial` task site. The published `SKILL.md` Step 4 documents this mechanism in prose. The global `agent/agents/coder.md` default is never modified by this skill.

## Customize submenu boundary

The customize submenu is accessible via `(c)` from the top-level confirmation menu. It exposes three letter options only:

- `(t) Coder tier` — current: capable (or the user's chosen tier)
- `(r) Refine-code iterations` — current: 3 (or the user's chosen count)
- `(m) Back to main menu` — return to the top-level confirmation

**TDD** and **Test suite check** are visible in the Settings block above the customize submenu but are NOT reachable from the `(c) Customize` submenu. They are transparency-only in the Settings display; no toggle or input prompt is offered for either.

## Artifacts

Fast lane creates the following on-disk artifacts:

- **Test-run logs** — `docs/test-runs/<spec-name>/full-suite.log` (always, if test command is detected). For todo-only inputs (no spec involved), substitute `TODO-<id>` for `<spec-name>`.
- **Baseline logs** — `docs/test-runs/<spec-name>/baseline.log` (optional, created only if `(b) Compare with baseline` is chosen in Step 6). A companion `docs/test-runs/<spec-name>/baseline-failures.json` is created in the same condition.
- **Review artifacts** — `docs/reviews/<spec-name>-fastlane-review-v<ERA>.md` (always, after refine-code completes). The `-fastlane-review` namespacing distinguishes fastlane review artifacts from deep-workflow reviews targeting the same spec. Follow refine-code's retention policy (kept).
- **Cleanup on success** — On successful completion (refine-code returns `approved`, `approved_with_concerns`, or `(p) Proceed with issues`), the per-spec test-runs directory is cleaned up via `cleanup-test-runs.py`. Baseline artifacts, once written, are also removed.
- **Preservation on stop** — Test-runs artifacts are preserved on any stop exit (verification `(x)`, baseline-stash-conflict hard-stop, coder BLOCKED, refine-code budget-exhaustion).

## Files

The fastlane skill comprises:

- **SKILL.md** — Complete orchestrator specification for the fastlane workflow, including all steps, menus, edge cases, and artifact management.
- **fastlane-coder-prompt.md** — Template prompt dispatched to the `coder` agent, with placeholders for spec content, checklist, working directory, and TDD guidance.
- **scripts/recommend-workflow.py** (legacy / non-authoritative) — A shallow markdown-shape heuristic that emits a `fastlane` vs. `deep-workflow` JSON recommendation based on presence of an Approach section, Requirements bullet count, and flagged keywords in Non-Goals. `define-spec` Step 8 no longer treats this as authoritative; it is retained as an optional supporting signal extractor and for backwards compatibility.
- **scripts/README.md** — Documentation for the helper scripts, including test discovery and npm integration via `npm run test:helpers`.
