# Plan Review — `2026-04-24-spec-designer-split.md` v4

## Strengths

- The v3 blocking findings are materially addressed: Task 1 now scopes the early `maxSubagentDepth` check to the frontmatter field, Task 6 is serialized after Task 2, Task 5 includes strict `model-tiers.json` failure handling, the mux probe now uses the runtime env vars from `cmux.ts`, and Task 8 gives an actionable direct `plan-reviewer` path for the deliberate deviation case.
- The plan has strong spec coverage for the new artifacts: `spec-designer.md` is frontmatter-only, `procedure.md` is the canonical non-skill procedure body, and `define-spec/SKILL.md` is reduced to branch selection, dispatch, validation, commit gating, recovery, and continuation.
- The procedure task is detailed enough for implementation: it covers all three input shapes, codebase-grounded Q&A, scope decomposition, architecture-need assessment, conditional `## Approach`, self-review, write path rules, and the `SPEC_WRITTEN:` terminal contract.
- Downstream verification is broad and now includes the positive and negative `## Approach` planning path, cross-CLI behavior, recovery-menu redo, and execute-plan regression coverage.

## Findings

### Error — Task 7 weakens the spec-required `## Approach` deviation severity

**Where:** Task 7 Step 1 (`## Approach honoring` subsection); Spec R11.

**What:** Spec R11 requires `plan-reviewer` to flag deviations from the spec's `## Approach` as **Warnings**. Task 7's inserted text says a justified deviation recorded in `## Risk Assessment` may be downgraded to a Suggestion or omitted entirely:

> if one is present and the deviation is well-justified, you may downgrade the Warning to a Suggestion or omit it entirely

**Why it matters:** The point of the downstream contract is that a user-selected approach remains visible end-to-end. The planner may have a valid reason to deviate, but the spec still requires the reviewer to surface that deviation as a Warning. Allowing omission means a plan can depart from the user's chosen architecture without the required reviewer signal.

**Recommendation:** Change Task 7's subsection so all deviations from the chosen `## Approach` are reported as Warnings. The reviewer can cite the planner's `## Risk Assessment` justification inside the Warning, but should not downgrade or omit the finding.

### Warning — Task 5's mux probe still omits `PI_SUBAGENT_MUX`, so it is not fully runtime-equivalent

**Where:** Task 5 Step 1a; Risk Assessment; `../pi-interactive-subagent/pi-extension/subagents/cmux.ts`.

**What:** The plan now matches the backend-specific env vars (`CMUX_SOCKET_PATH`, `TMUX`, `ZELLIJ` / `ZELLIJ_SESSION_NAME`, `WEZTERM_UNIX_SOCKET`) and command checks, but `cmux.ts` also honors `PI_SUBAGENT_MUX` as a backend preference before falling back to the default detection order. If `PI_SUBAGENT_MUX` is set to a supported backend, `getMuxBackend()` returns that backend only if its runtime check passes; it does not fall back to another available backend.

**Why it matters:** With `PI_SUBAGENT_MUX=wezterm` and `WEZTERM_UNIX_SOCKET` missing, but `TMUX` present, the plan's probe would choose `mux` while the runtime's `selectBackend()` would choose `headless`. That is the exact false-positive case the plan is trying to avoid for an interactive `spec-designer` session.

**Recommendation:** Add `PI_SUBAGENT_MUX` handling to Task 5's probe before the default backend checks: if it is one of `cmux`, `tmux`, `zellij`, or `wezterm`, evaluate only that backend's env-var + `command -v` check and choose `inline` if it fails. If it is unset or invalid, fall through to the existing default order. Update the mux-probe verification and risk text accordingly.

### Warning — Recovery Redo uses an absolute spec path, but the existing-spec detector is only described as `.pi/specs/`-relative

**Where:** Task 4 Step 1 / procedure Step 1 (`Existing-spec path` row); Task 5 Step 7 Redo.

**What:** The procedure emits `SPEC_WRITTEN: <absolute path>`, and the orchestrator carries that captured `<path>` into the recovery menu. On Redo, Task 5 says to invoke `/define-spec <path>` recursively. However, Task 4's existing-spec detector is described only as a path under `.pi/specs/` ending in `.md`, which is ambiguous for an absolute path like `/Users/.../.pi/specs/example.md`.

**Why it matters:** If the recursive Redo input is not recognized as an existing-spec path, the procedure can fall through to the freeform branch, treating the filename as seed text and writing a new spec instead of overwriting the rejected draft with preamble preservation.

**Recommendation:** Make the detector explicit: accept both relative `.pi/specs/<name>.md` paths and absolute paths whose resolved location is under `<cwd>/.pi/specs/`. Alternatively, have Task 5 convert the captured absolute path to a relative `.pi/specs/...` path before redispatching Redo.

## Verdict

The plan is substantially improved and close to executable, but it still has one blocking issue: Task 7 does not preserve the spec-required Warning severity for `## Approach` deviations. The mux-probe preference omission and Redo path ambiguity should also be tightened before implementation.

**[Issues Found]**
