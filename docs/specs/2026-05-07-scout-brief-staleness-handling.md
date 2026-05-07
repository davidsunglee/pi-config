# Improve scout brief staleness handling in generate-plan

Source: TODO-47e448ec

## Goal

Replace `generate-plan`'s current single SHA-mismatch warning with a classifier that distinguishes expected workflow drift (intervening commits touch only briefs/specs/todos/plans) from real source/config drift. Workflow-only drift is auto-handled with an informational message; any non-workflow drift surfaces an explicit `(c) Continue / (x) Stop` checkpoint menu before plan generation proceeds. Uninspectable cases (missing/malformed brief SHA, brief SHA not reachable from current HEAD, git failure) unify into the same menu so behavior is uniform any time the classifier cannot prove the brief is fine. The workflow-artifact path allowlist is extracted into a small shared reference at `agent/skills/_shared/workflow-artifact-paths.md` so future consumers stay consistent with one source of truth.

## Context

`agent/skills/generate-plan/SKILL.md` Step 1b currently emits a fixed warning whenever the spec's `Scout brief: <path>` line references a brief whose `Git SHA:` differs from current `HEAD`:

> Scout brief at `<path>` was generated at SHA `<brief-sha>`; HEAD is now `<head-sha>`. Treating as potentially stale; planning will continue. Re-run `/scout TODO-<id>` if you want a fresh brief.

It also emits a softer warning when the brief preamble has no readable SHA:

> Scout brief at `<path>` has unreadable Git SHA preamble — continuing without staleness signal.

Both warnings always continue planning; they never gate it.

In the normal pipeline, a brief is committed immediately after `/scout` and before `/define-spec` writes the spec. By the time `/generate-plan` runs against the spec, HEAD is at least one commit past the brief SHA — that's the spec commit itself. Repeat passes through `/scout` → `/define-spec` → `/generate-plan` can also push HEAD forward through plan commits without invalidating the brief's reconnaissance value. The current warning fires on every one of these expected-drift cases, training the user to ignore the staleness signal entirely. The TODO refines the signal so that workflow commits that the user already knows about don't nag, while real source/config drift surfaces a real checkpoint.

The existing brief-not-found path (`Scout brief referenced in spec not found at <path> — proceeding without it.`) is independent of staleness and is unaffected by this work. The scout's own `(o)verwrite / (k)eep` prompt for an existing brief at scout time is also independent — different decision shape, different consumers — and is unaffected.

## Requirements

### New shared reference: workflow-artifact path allowlist

Create `agent/skills/_shared/workflow-artifact-paths.md`. The file is a short reference doc, not a procedure.

It contains:

- A one-paragraph description of the allowlist's purpose: skills that classify whether intervening commits represent expected workflow drift consult this list so the definition stays consistent across consumers.
- The allowlist contents, exactly:
  - `docs/briefs/`
  - `docs/specs/`
  - `docs/todos/`
  - `docs/plans/` (the prefix covers `docs/plans/reviews/` and `docs/plans/done/`)
- A matching rule: a path is "under" a prefix when it begins with that prefix as a directory boundary — `docs/specs/foo.md` matches `docs/specs/`; `docs/specs-archive/foo.md` does not.
- A consumers list naming the skills/agents that reference the allowlist. At write time the only entry is `agent/skills/generate-plan/SKILL.md` Step 1b. The doc instructs future consumers to add themselves to the list when they adopt the allowlist.

The doc does not define the staleness classifier itself — only the allowlist. The classifier stays inline in `generate-plan` until a second consumer arises.

### Updated Step 1b in `agent/skills/generate-plan/SKILL.md`

Replace the existing Step 1b "Staleness check (informational only)" sub-bullet block with a classifier-based flow.

When a `Scout brief: docs/briefs/<filename>` line is found in the spec preamble and the brief file exists on disk:

1. Bounded preamble read of the brief (`head -n 8 <path>` or equivalent). Extract the `Git SHA: <sha>` line.
2. Compute the current HEAD SHA via `git rev-parse HEAD`.
3. If brief SHA equals current HEAD SHA, continue silently and proceed to Step 2 of the skill. (Today's behavior, unchanged.)
4. Otherwise, attempt to enumerate the set of files changed in the range `<brief-sha>..HEAD`. The enumeration MUST handle paths with spaces, deletions, and renames — implementations should use NUL-separated git output (e.g., `git diff --name-only -z <brief-sha>..HEAD`) and parse path bytes directly, not whitespace-tokenized lines. Renamed files are matched against the allowlist by their post-rename path; deleted files are matched by their pre-deletion path (the default behavior of `git diff --name-only`).
5. Classify each enumerated path against the allowlist defined in `agent/skills/_shared/workflow-artifact-paths.md`:
   - **All paths under the allowlist** → emit the verbatim workflow-drift informational message (see below) and continue silently with the brief. Plan generation proceeds without user prompt.
   - **At least one path outside the allowlist** → present the verbatim mixed-changes menu (see below) listing only the non-workflow paths in the order returned by the enumeration. Wait for user input. Proceed only on `c`.
6. **Uninspectable cases** unify into the same `(c)/(x)` menu with an adapted explanatory body:
   - **Sub-case A:** the `Git SHA:` line is missing from the brief preamble or malformed (not a 40-char hex string).
   - **Sub-case B:** the brief SHA is well-formed but not reachable from current HEAD (`git diff` / `git rev-list` reports the SHA as unknown).
   - **Sub-case C:** any other git command failure prevents enumeration.
   In all three sub-cases the menu's `(c)` and `(x)` option lines are byte-equal with the mixed-changes menu; only the body differs.

Step 1b's existing `Scout brief: docs/briefs/<filename>` capture and the brief-not-found warning (`Scout brief referenced in spec not found at <path> — proceeding without it.`) are unchanged. The classifier flow runs only after the brief file has been confirmed to exist on disk.

### Verbatim message and menu text

When the SHA differs and every enumerated path is under the allowlist, emit (placeholders substituted):

> Scout brief at `<path>` was generated at SHA `<brief-sha>`; HEAD is now `<head-sha>`. Intervening commits modified only workflow artifacts (`docs/briefs/`, `docs/specs/`, `docs/todos/`, `docs/plans/`). Treating as expected workflow drift and continuing.

When the SHA differs and at least one enumerated path is outside the allowlist, surface the mixed-changes menu (placeholders substituted):

> Scout brief at `<path>` was generated at SHA `<brief-sha>`; HEAD is now `<head-sha>`. Non-workflow files changed since the brief SHA:
>
>   - `<path1>`
>   - `<path2>`
>   - …
>
> The brief may be stale relative to source/config/agent changes.
>
> **(c) Continue with plan generation** — proceed despite the scout brief / HEAD difference.
> **(x) Stop plan generation** — resolve manually before planning.

When the brief SHA is missing or malformed in the preamble (sub-case A), surface the menu with this body:

> Scout brief at `<path>` has no readable `Git SHA:` preamble line; cannot classify intervening changes against current HEAD `<head-sha>`. The brief may be stale.
>
> **(c) Continue with plan generation** — proceed despite the scout brief / HEAD difference.
> **(x) Stop plan generation** — resolve manually before planning.

When the brief SHA is well-formed but not reachable from HEAD (sub-case B), surface the menu with this body:

> Scout brief at `<path>` was generated at SHA `<brief-sha>`; HEAD is now `<head-sha>`. Brief SHA is not reachable from HEAD; cannot classify intervening changes. The brief may be stale.
>
> **(c) Continue with plan generation** — proceed despite the scout brief / HEAD difference.
> **(x) Stop plan generation** — resolve manually before planning.

When git command failure prevents enumeration for any other reason (sub-case C), surface the menu with this body:

> Scout brief at `<path>` was generated at SHA `<brief-sha>`; HEAD is now `<head-sha>`. Could not enumerate intervening changes: `<error>`. The brief may be stale.
>
> **(c) Continue with plan generation** — proceed despite the scout brief / HEAD difference.
> **(x) Stop plan generation** — resolve manually before planning.

The `<error>` token is the verbatim (or trimmed-but-not-paraphrased) stderr text from the failing git command, so the user can see what went wrong rather than a generic "git failed" message.

### Menu response handling

Recognize user responses on the menu by letter shortcut and word alias, mirroring `agent/skills/define-spec/SKILL.md` Step 5's convention:

- **(c) Continue / continue / yes** → continue Step 1b's remaining work (populate `{SCOUT_BRIEF}` if not already, then proceed to Step 2). The brief stays load-bearing for the planner dispatch.
- **(x) Stop / stop / no** → stop `generate-plan` immediately before Step 2. Do not dispatch the planner. Do not invoke `refine-plan`. Emit a terminal status message:

  > Plan generation stopped — scout brief / HEAD difference unresolved.

  Then halt the skill.

Unrecognized responses re-prompt with the same menu body. Do not auto-default to either `(c)` or `(x)`.

### Replacement scope of existing warnings

The replacement is total inside Step 1b:

- The existing verbatim warning (`Scout brief at <path> was generated at SHA <brief-sha>; HEAD is now <head-sha>. Treating as potentially stale; planning will continue. Re-run /scout TODO-<id> if you want a fresh brief.`) is removed and superseded by the workflow-drift informational message OR the mixed-changes menu, depending on classification.
- The existing soft warning (`Scout brief at <path> has unreadable Git SHA preamble — continuing without staleness signal.`) is removed and superseded by the missing-or-malformed-SHA menu (sub-case A). The "auto-continue without staleness signal" behavior is intentionally dropped — by user direction, all uninspectable cases are unified to the menu rather than split between menu-and-auto-continue.

The brief-not-found warning (`Scout brief referenced in spec not found at <path> — proceeding without it.`) is preserved verbatim. Brief-not-found and brief-stale are independent paths.

## Constraints

- Do NOT change any other Step in `generate-plan/SKILL.md`. The classifier and menu live entirely inside Step 1b's preamble extraction; Steps 2–5 are unchanged.
- Do NOT extend the same SHA classifier to `refine-plan`, `plan-reviewer`, `define-spec`, or `planner`. Their existing behavior — auto-discover or read the brief without SHA gating — stands. The TODO is scoped to `generate-plan` only.
- Do NOT change the `(o)/(k)` overwrite-or-keep prompt in `agent/skills/scout/SKILL.md`. That prompt is a different decision (regenerate the brief?) with a different shape and different consumers.
- Do NOT remove the existing "Scout brief referenced in spec not found at `<path>` — proceeding without it." brief-not-found warning. Brief-not-found and brief-stale are independent.
- Do NOT block on staleness when the brief SHA equals HEAD. The silent-continue path stays silent; the new logic activates only when SHAs differ or cannot be compared.
- Do NOT inline the workflow-artifact allowlist into `generate-plan/SKILL.md`. Reference `agent/skills/_shared/workflow-artifact-paths.md` by path so future consumers stay consistent with one source of truth.
- Do NOT widen the allowlist beyond `docs/briefs/`, `docs/specs/`, `docs/todos/`, `docs/plans/`. A `docs/architecture/foo.md` change really could mean the brief is stale; surfacing the menu in that case is the correct behavior.
- Do NOT auto-retry the `git diff` enumeration on failure. A single failure → uninspectable menu; the user decides.
- Do NOT silently swallow git stderr. The error message from the failing git command is included verbatim (or trimmed without paraphrasing) in the sub-case C menu body so the user sees what went wrong.
- Do NOT alter the `(c)` / `(x)` option lines across the four menu variants (mixed-changes + three uninspectable sub-cases). The body explanation differs but the option lines `(c) Continue with plan generation — proceed despite the scout brief / HEAD difference.` and `(x) Stop plan generation — resolve manually before planning.` are byte-equal across all variants.
- Do NOT extract the SHA classifier itself to `_shared/`. Only the path allowlist is extracted. The classifier stays inline in `generate-plan` until a second consumer arises.

## Approach

**Chosen approach:** Inline classifier in `generate-plan/SKILL.md` Step 1b, with the workflow-artifact allowlist extracted into a small shared reference at `agent/skills/_shared/workflow-artifact-paths.md`. Uninspectable cases (missing SHA, unreachable SHA, git failure) unify into the same `(c)/(x)` menu as the mixed-changes case; only the body explanation differs.

The classifier:

1. Reads the brief's `Git SHA:` from a bounded preamble.
2. Compares against current HEAD.
3. On mismatch, enumerates files changed in the range using NUL-separated git output, then matches each path's prefix against the shared allowlist.
4. Produces one of three outcomes: silent continue (SHA == HEAD), informational message + auto-continue (mismatch with workflow-only paths), or `(c)/(x)` menu (mismatch with at least one non-workflow path, OR any uninspectable case).

**Why this over alternatives:**

- A single always-warn behavior trains users to ignore the signal. Differentiating expected workflow drift from real source drift restores signal-to-noise.
- Unified menu handling for uninspectable cases keeps logic simple and the user experience consistent: any time the system can't *prove* the brief is fine, the user gets a checkpoint. Splitting "auto-continue when classifier never ran" from "menu when classifier failed mid-flight" added no real benefit and was rejected during Q&A.
- Extracting the allowlist into `_shared/` makes the workflow-artifact concept visible without forcing premature abstraction of the classifier itself. The classifier has one consumer today; the allowlist is the small piece worth lifting now so the next consumer doesn't redefine it.

**Considered and rejected:**

- **Inline allowlist in `generate-plan/SKILL.md`** (no shared doc) — simpler today but invites drift if a second consumer adopts the same concept and copy-pastes a different list. Visibility of the workflow-artifact concept was the user's reason for choosing extraction.
- **Auto-continue on uninspectable cases (mirror today's soft warning)** — splits user-facing behavior between "menu when classifier failed" and "auto-continue when classifier never ran." Adds complexity without payoff; uninspectable cases are uncommon enough that always surfacing the menu is acceptable. Explicitly chosen against during Q&A.
- **Block planning unconditionally on any SHA mismatch** — too aggressive; expected workflow drift is genuinely safe and currently warns harmlessly.
- **Apply the same classifier in `refine-plan`, `plan-reviewer`, and `define-spec`** — out of scope per the TODO. `plan-reviewer` is a subagent and can't show menus; `define-spec` is already an interactive Q&A surface where the brief is loose context; `refine-plan` operates on a downstream artifact where some staleness is expected. None asked for the gate.
- **Tighten the brief-not-found path to a checkpoint when the spec preamble references a brief** — would close the deletion escape hatch (see Open Questions) at the cost of widening this TODO into a different code path. Deferred; the soft warning is acceptable current behavior.
- **Use richer freshness signals (file-touched-since-brief narrowed to brief-cited paths)** — out of scope for this TODO. The Open Question about smarter freshness signals from the scout reconnaissance spec stands; that's a future iteration if the SHA-mismatch menu still fires too often after path classification lands.
- **Extract the SHA classifier itself to `_shared/`** — only one consumer today (`generate-plan`); premature abstraction. Allowlist extraction is the smallest move that addresses the visibility concern without committing to a multi-skill API.

## Acceptance Criteria

- A new file exists at `agent/skills/_shared/workflow-artifact-paths.md`. It defines the allowlist as exactly `docs/briefs/`, `docs/specs/`, `docs/todos/`, `docs/plans/`, documents the prefix-as-directory-boundary matching rule, and lists `agent/skills/generate-plan/SKILL.md` Step 1b as the initial consumer with an instruction for future consumers to add themselves.
- `agent/skills/generate-plan/SKILL.md` Step 1b references `agent/skills/_shared/workflow-artifact-paths.md` by path. The allowlist is NOT duplicated in the SKILL.md prose.
- When the brief's `Git SHA:` equals `git rev-parse HEAD`, Step 1b emits no staleness output and continues. (Behavior parity with today.)
- When the brief's `Git SHA:` differs from HEAD AND every changed file in `<brief-sha>..HEAD` falls under the allowlist, Step 1b emits the verbatim workflow-drift informational message naming brief path, brief SHA, HEAD, and the allowlist directories, then continues without prompting. Plan generation proceeds.
- When the brief's `Git SHA:` differs from HEAD AND at least one changed file is outside the allowlist, Step 1b presents the verbatim mixed-changes menu including a bulleted list of the non-workflow file paths, the brief path, the brief SHA, and HEAD. The skill waits for user input.
- When the brief's `Git SHA:` line is missing or malformed in the preamble (sub-case A), Step 1b presents the `(c)/(x)` menu with the missing-or-malformed-SHA body (no file list).
- When the brief SHA is well-formed but not reachable from HEAD (sub-case B), Step 1b presents the `(c)/(x)` menu with the not-reachable-from-HEAD body (no file list).
- When the file enumeration command fails for any other reason (sub-case C), Step 1b presents the `(c)/(x)` menu with the body containing the failing command's verbatim or trimmed stderr text (no file list).
- The `(c) Continue with plan generation — proceed despite the scout brief / HEAD difference.` and `(x) Stop plan generation — resolve manually before planning.` option lines are byte-equal across all four menu variants (mixed-changes, sub-case A, sub-case B, sub-case C).
- On any of the four menus, response `c`, `continue`, or `yes` continues Step 1b normally and the planner is dispatched in Step 3. Response `x`, `stop`, or `no` stops `generate-plan` before Step 2; the planner is NOT dispatched and `refine-plan` is NOT invoked. The skill emits the terminal status message `Plan generation stopped — scout brief / HEAD difference unresolved.` on the stop path.
- Unrecognized responses re-prompt with the same menu body without auto-defaulting.
- File enumeration handles paths with spaces, deletions, and renames correctly: NUL-separated parsing is used; renamed files are matched by post-rename path; deleted files are matched by pre-deletion path.
- The current Step 1b verbatim warning text (`Scout brief at <path> was generated at SHA <brief-sha>; HEAD is now <head-sha>. Treating as potentially stale; planning will continue. Re-run /scout TODO-<id> if you want a fresh brief.`) does not appear anywhere in the updated SKILL.md.
- The current Step 1b verbatim soft warning text (`Scout brief at <path> has unreadable Git SHA preamble — continuing without staleness signal.`) does not appear anywhere in the updated SKILL.md.
- The brief-not-found warning (`Scout brief referenced in spec not found at <path> — proceeding without it.`) is preserved verbatim in Step 1b. Brief-not-found and brief-stale remain independent paths.
- `agent/skills/refine-plan/SKILL.md`, `agent/agents/plan-reviewer.md`, `agent/skills/define-spec/procedure.md`, and `agent/agents/planner.md` are unchanged by this work.
- `agent/skills/scout/SKILL.md`'s `(o)/(k)` overwrite-or-keep prompt is unchanged.

## Non-Goals

- Adding the same classifier or menu to `refine-plan`, `plan-reviewer`, `define-spec`, or `planner`. The TODO is scoped to `generate-plan` only.
- Changing the `(o)/(k)` overwrite-or-keep prompt in `scout`. Different decision shape; out of scope.
- Changing the brief format, the brief preamble keys, or the `Scout brief: <path>` extraction in `generate-plan`'s preamble logic.
- Producing a shared classifier helper for SHA staleness. Only the path allowlist is extracted; the classifier itself stays inline in `generate-plan` until a second consumer arises.
- Auto-retrying git enumeration on failure.
- Adding more sophisticated freshness signals (file-touched-since-brief narrowed to brief-cited paths, content-hash comparisons, etc.). The Open Question from the scout reconnaissance spec about a smarter freshness signal stays open; this work refines only the SHA-equality signal that already exists.
- Changing the menu shortcuts beyond the documented `c` / `continue` / `yes` and `x` / `stop` / `no` aliases.
- Backwards-compatibility shims for the old warning text. The replacement is total — the old text is gone after this lands.
- Closing the deletion escape hatch documented in Open Questions. Treating a missing brief as a checkpoint when the spec preamble references one would widen this TODO into the brief-not-found code path; deferred.

## Open Questions

- Renames are matched against the allowlist by post-rename path (the default `git diff --name-only` behavior). If a future implementation wants to surface both pre- and post-rename paths to the user — for example, to flag renames *out of* `docs/specs/` as suspicious workflow drift — revisit the classification rule. For this spec, the default behavior is sufficient.
- If the mixed-changes menu fires often even after path classification (e.g., routine README edits keep tripping the non-workflow branch), the next refinement is the file-touched-since-brief signal flagged in the scout reconnaissance spec's Open Questions. This spec does not pre-empt that work; it just refines the existing SHA-equality signal.
- Deleting the referenced brief from disk between `generate-plan` runs is a deliberate (if implicit) escape hatch around the staleness gate: the classifier fires only when the brief file exists, so on a missing brief the existing `Scout brief referenced in spec not found at <path> — proceeding without it.` warning fires instead and planning proceeds without brief context. Recovery is `git checkout HEAD -- <brief-path>` (when the brief was committed) or re-running `/scout` to regenerate. If this escape hatch is exercised by mistake often enough to be a footgun, revisit by tightening the brief-not-found path to a checkpoint when the spec preamble references a brief.
