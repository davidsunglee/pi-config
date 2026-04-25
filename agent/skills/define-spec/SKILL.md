---
name: define-spec
description: "Interactive spec writing from a todo, an existing spec under .pi/specs/, or freeform text. Dispatches a spec-designer subagent in a multiplexer pane when one is available, falling back to running the procedure on the main agent. Writes a structured spec to .pi/specs/ and gates the commit on user review."
---

# Define Spec

This skill is a thin orchestrator. The full spec-design procedure lives in `agent/skills/define-spec/procedure.md` and is the single source of truth for both branches. This skill probes the environment, picks a branch, dispatches (or runs the procedure on the main agent), validates completion, and gates the commit on user review.

## Step 1: Detect branch (mux vs inline)

Decide which branch to run **without** prompting the user.

### 1a. Mux probe

Mirror `pi-interactive-subagent`'s actual mux detection (`pi-extension/subagents/cmux.ts` + `backends/select.ts`) — pairing each multiplexer's signature env var with a command-availability check, and honoring the runtime's `PI_SUBAGENT_MUX` backend preference — so the orchestrator's branch decision and the runtime's `selectBackend()` / `getMuxBackend()` decisions agree. Apply rules in this order; the first match wins.

1. `$PI_SUBAGENT_MODE == "headless"` (case-insensitive) → `inline` branch (runtime would force the headless backend regardless of mux).
2. `$PI_SUBAGENT_MODE == "pane"` (case-insensitive) → `mux` branch (runtime would force the pane backend regardless).
3. `$PI_SUBAGENT_MUX` is set (case-insensitive) to one of `cmux` / `tmux` / `zellij` / `wezterm` → evaluate **only** that backend's runtime check (the matching env-var + `command -v` pair from rules 4–7 below). If the check passes → `mux` branch with that backend. If it fails → `inline` branch (do **not** fall through to other backends — `getMuxBackend()` does not fall back when a preference is set, so the orchestrator must not either). If `$PI_SUBAGENT_MUX` is set to anything else (empty, unrecognized) → ignore the preference and fall through to rule 4.
4. `$CMUX_SOCKET_PATH` is set and `command -v cmux` succeeds → `mux` branch (cmux).
5. `$TMUX` is set and non-empty and `command -v tmux` succeeds → `mux` branch (tmux).
6. (`$ZELLIJ` is set and non-empty **or** `$ZELLIJ_SESSION_NAME` is set and non-empty) and `command -v zellij` succeeds → `mux` branch (zellij).
7. `$WEZTERM_UNIX_SOCKET` is set and non-empty and `command -v wezterm` succeeds → `mux` branch (wezterm).
8. Otherwise → `inline` branch (no mux).

The exact env-var names, the `command -v` gate, and rule 3's no-fallback-on-pinned-preference behavior all mirror the runtime's `pi-extension/subagents/cmux.ts` + `backends/select.ts`. Divergence would let the orchestrator pick `mux` while the runtime falls through to `headless`, silently misrouting `spec-designer` into a non-interactive session. Do **not** prompt the user during probing.

### 1b. User-input override scan

Scan the user's slash-command input for an explicit "no subagent" override. Recognize any of these substrings (case-insensitive):

- `--no-subagent`
- `without a subagent`
- `without subagent`
- `no subagent`
- `skip subagent`
- `inline`

If any match, force the `inline` branch regardless of the mux probe outcome.

### 1c. Status announcement

Emit one status line to the user. This is informational — no input expected:

- `mux` branch chosen: `Running spec design in subagent pane (mux detected, no override).`
- `inline` branch via no-mux probe: `Running spec design in this session (no multiplexer detected).`
- `inline` branch via override: `Running spec design in this session (per --no-subagent / inline override).`

## Step 2: Read `procedure.md` fresh from disk

Read `agent/skills/define-spec/procedure.md` in full. This is the procedure body that drives the chosen branch.

If the file is missing or unreadable, fail with:

> `agent/skills/define-spec/procedure.md` missing or unreadable — cannot run define-spec. Restore the file before retrying.

Stop. Do not dispatch with an empty or truncated procedure.

## Step 3: Run the procedure

### 3a. Mux branch — dispatch `spec-designer`

Resolve both `model` and `cli` from `~/.pi/agent/model-tiers.json` (per the standard model-tier resolution rule used by `generate-plan` Step 2):

- Read `~/.pi/agent/model-tiers.json`. If the file is missing, unreadable, or not valid JSON, fail with: `~/.pi/agent/model-tiers.json missing or unreadable — cannot resolve dispatch model/cli for spec-designer.` Stop. Do not dispatch. Do not fall back to a CLI default.
- `model` is the `capable` field (e.g. `anthropic/claude-opus-4-7`). If `capable` is missing or empty, fail with: `model-tiers.json has no usable "capable" model — cannot dispatch spec-designer.` Stop.
- `cli` is `dispatch.<provider>` for that model's provider prefix (e.g. `dispatch.anthropic` → `claude`). Derive `<provider>` as the prefix before the first `/` in the `capable` value. If the `dispatch` map is missing, or `dispatch.<provider>` is missing or empty, fail with: `model-tiers.json has no dispatch.<provider> mapping for capable model <capable> — cannot dispatch spec-designer.` Stop.

All three failure modes are strict: surface the message and stop. Do not retry, do not silently use a CLI default — losing the explicit `model` / `cli` values is what motivates the split, so failing loudly is the correct behavior.

Then dispatch (note: `wait` is a top-level orchestration option, not a per-task field):

```
subagent_run_serial {
  tasks: [
    {
      name: "spec-designer",
      agent: "spec-designer",
      task: "<raw user input — todo ID, .pi/specs/<path>.md, or freeform text>",
      systemPrompt: "<full body of procedure.md from Step 2>",
      model: "<capable tier from model-tiers.json>",
      cli: "<resolved dispatch cli>"
    }
  ],
  wait: true
}
```

Notes:
- **Do NOT pass a `skills:` parameter.** The procedure is delivered exclusively via `systemPrompt:` so delivery is symmetric across pi and Claude CLIs (the agent's `system-prompt: append` frontmatter makes the runtime treat `systemPrompt:` as a real system prompt on both paths).
- **Both `model:` and `cli:` come from `model-tiers.json`, not from agent frontmatter.** `spec-designer.md` has no `model:` field by design (R1) — without an explicit per-call `model:` the CLI default would be used and the Opus tier would be lost.
- The pane spawns; the user types their answers directly into the pane. The dispatch blocks until the subagent completes (top-level `wait: true`).

Read `results[0].finalMessage`, `results[0].exitCode`, `results[0].state`, `results[0].error`, and `results[0].transcriptPath` from the orchestration result. `error` is populated when the runtime captured an error string for a non-clean exit (process crash, signal, runtime error); it may be empty or undefined on clean exits. Proceed to Step 4.

### 3b. Inline branch — follow the procedure in this session

Treat the body of `procedure.md` (read in Step 2) as if it were addressed to you, the orchestrator. Execute Steps 1 through 8 of the procedure in this session. The user's raw input is the seed for the procedure's Step 1 input-shape detection.

When you reach the procedure's Step 9, follow the **inline branch** subsection of that step: do **not** emit `SPEC_WRITTEN: <path>` and do **not** exit. Capture the absolute path of the spec file you just wrote and return here. The completion line and process exit at the end of Step 9 are for the subagent / mux branch only; on the inline branch you are the orchestrator, so emitting the line and exiting would skip the review-and-commit gate below.

Skip Step 4 of this orchestrator (it parses the subagent's `finalMessage`) and jump straight to Step 5 with the absolute path you just captured.

## Step 4: Validate `SPEC_WRITTEN:` (mux branch only)

Evaluate the subagent's `finalMessage`, `exitCode`, `state`, `error`, and `transcriptPath` from `results[0]` in the order below. The first matching case wins; surface its message and stop. Do not retry. Do not surface a recovery menu — the recovery menu is only for user-review rejection (Step 7).

A `SPEC_WRITTEN: <absolute path>` line in `finalMessage` is the completion signal. Parse it as a single line on its own, no surrounding backticks or commentary on the same line.

Cases (evaluated in this order):

- **(1) `exitCode != 0`.** Report:
  > Spec design failed (`exitCode: <N>`, `state: <state>`<if `error` is non-empty, append `, error: <error>`>). Transcript: `<transcriptPath>`. No commit attempted.

  If a `SPEC_WRITTEN: <path>` line is also present in `finalMessage`, append `Reported path: <path> (commit not attempted because the subagent exited with a nonzero status).` so the user can see the partial output. Then stop.

  Checking exit code first ensures dispatch failures (process crash, signal, runtime error) are surfaced with the exit code and error text the runtime captured, instead of being misreported as a missing completion line.

- **(2) `finalMessage` lacks a `SPEC_WRITTEN:` line (and `exitCode == 0`).** Report:
  > Spec design did not complete: `spec-designer` exited without emitting `SPEC_WRITTEN: <path>`. Transcript: `<transcriptPath>`. No spec written, no commit attempted.

  Stop.

- **(3) Path reported but file missing on disk.** Report:
  > Spec design reported `SPEC_WRITTEN: <path>` but `<path>` does not exist on disk. Transcript: `<transcriptPath>`. No commit attempted.

  Stop.

- **(success)** `exitCode == 0`, `SPEC_WRITTEN: <path>` is present, and `<path>` exists on disk. Proceed to Step 5 with `<path>` captured.

## Step 5: Pause for user review

Surface to the user:

> Spec written to `<path>`. Review it and let me know when you'd like me to commit it (or that you don't want to).

Wait for the user's reply. The orchestrator does **not** read the spec file into its own context — the user reads it directly.

Possible user responses:

- **OK / commit it / yes** → Step 6 (commit).
- **Reject** (any form: "redo", "leave it", "delete it") → Step 7 (recovery menu).

## Step 6: Commit (on user OK)

Invoke the `commit` skill with the exact spec path captured in Step 4 (or Step 3b on inline). Specify the path explicitly so only the spec file is committed.

If the `commit` skill fails, report the error verbatim and stop. Leave the file on disk uncommitted. Do **not** auto-retry. The user resolves the underlying issue (e.g. pre-commit hook failure) and re-runs `/define-spec` or commits manually.

## Step 7: Recovery menu (on user reject)

Present these three options:

> Got it. What would you like to do with `<path>`?
>
> **(i) Redo** — re-dispatch `define-spec` with the existing draft as input. The procedure overwrites the same path.
> **(ii) Leave it** — leave `<path>` uncommitted on disk for manual editing and committing later.
> **(iii) Delete it** — remove the file.

Behavior per choice:

- **(i) Redo:** invoke `/define-spec <path>` recursively, passing the captured spec path as-is (typically the absolute path from the original `SPEC_WRITTEN: <absolute path>` line). The procedure's input-shape detector accepts both relative `.pi/specs/<name>.md` and absolute paths containing `/.pi/specs/`, so the existing-spec branch fires on the recursive run and overwrites the rejected draft with preamble preservation. On the recursive run, the same orchestrator probe + dispatch + validate + commit-gate flow applies.
- **(ii) Leave it:** emit `Leaving <path> uncommitted. Edit and commit yourself.` and stop.
- **(iii) Delete it:** remove the file. Then stop.

## Step 8: Offer `generate-plan`

After a successful commit (Step 6), offer continuation:

> Spec committed. Want me to run `generate-plan` with `<path>`?

If yes, invoke `generate-plan` with `<path>`. If no, stop.

## Edge cases

- **`procedure.md` missing.** Fail at Step 2 with the message specified there.
- **`model-tiers.json` missing / no `capable` model / no `dispatch.<provider>` mapping.** Fail at Step 3a with the matching message. Stop. Do not fall back to a CLI default — the whole point of the explicit resolution is to keep dispatch on the Opus-tier / Claude-CLI route.
- **Mux probe wrong (false positive / false negative).** The probe is aligned with the runtime's `selectBackend()` / `cmux.ts` checks (env var + command available), so divergence requires either (a) the env var being set without the matching CLI on PATH, or (b) the runtime's check changing in a future `pi-interactive-subagent` release. A false-negative probe (probe says no mux, mux actually available) drops the user into the inline branch — functionally correct but uses orchestrator context unnecessarily. A false-positive probe (probe says mux, runtime then disagrees) routes `subagent_run_serial` to the headless backend, which can't host an interactive session — `spec-designer` would receive its task without a user-driven Q&A surface. Mitigation: keep the probe rules in lockstep with `cmux.ts`; if a future change drifts, users can force the inline branch with `PI_SUBAGENT_MODE=headless` or one of the override phrases.
- **User-input override false positive.** If the user's input contains "subagent" without meaning override (e.g. "build a subagent thing"), the substring match will trigger inline mode. Mitigation is the specific phrase set in Step 1b. Residual risk is documented; users wanting subagent dispatch can rephrase.
- **Inline-branch session terminated mid-procedure.** No spec written, no commit, nothing to recover. User re-runs `/define-spec`. If a partial spec was written before termination, it stays on disk; user can delete or edit manually.
- **`commit` skill failure.** Step 6 covers this. Report and stop; user resolves the underlying issue.
- **Multi-subsystem input, user insists on a single spec.** The procedure's Step 3 scope-decomposition check handles this — user override is honored, an Open Question is recorded, and the spec is written. Downstream `generate-plan` may produce a coarse plan.
