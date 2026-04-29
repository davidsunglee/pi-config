# Refiner Coordinator Hardening

**Source:** TODO-40eb6ea4
**Spec:** `.pi/specs/2026-04-29-refiner-coordinator-hardening.md`

## Goal

Make it structurally impossible for `refine-code` and `refine-plan` to silently degrade to an "inline" review when their coordinator dispatch path is broken. Three drift surfaces are closed at once: (1) a single shared markdown helper at `agent/skills/_shared/coordinator-dispatch.md` becomes the authoritative coordinator-CLI resolution procedure that both skills read and follow; (2) coordinator prompts (`refine-code-prompt.md`, `refine-plan-prompt.md`) and agent identities (`code-refiner.md`, `plan-refiner.md`) gain explicit, hard rules forbidding any inline-review fallback when `subagent_run_serial` is unavailable or every worker dispatch fails; (3) every coordinator-persisted review file gets a `**Reviewer:** <provider>/<model> via <cli>` first line stamped by the coordinator at write time, and the calling skill validates that line on every returned review path before reporting success. Items already landed in `5d0825f` (use of `crossProvider.standard` for the coordinator dispatch and declaration of `subagent_run_serial` in `code-refiner` / `plan-refiner` `tools:` lines) are out of scope.

## Architecture summary

This change is markdown-only. Two skills, two coordinator prompts, two agent definitions, and one new shared procedure file are touched. No code (TypeScript) changes; no changes to `pi-interactive-subagent`; no changes to `model-tiers.json` shape; no changes to worker agents (`code-reviewer`, `coder`, `plan-reviewer`, `planner`).

The new shared file `agent/skills/_shared/coordinator-dispatch.md` describes the four-tier chain (`crossProvider.standard` → `standard` → `crossProvider.capable` → `capable`), the skip-silently rule for tiers whose resolved `cli` is not `pi`, the two hard-stop conditions and their exact error messages, and a one-line note that worker subagents inside the coordinator must re-resolve `cli` independently. The two skills replace their inline dispatch-resolution prose with a one-line reference to this file and rewrite their coordinator-dispatch invocation so the model and `cli` come from the shared procedure's outcome.

The two coordinator prompts gain a top-of-protocol clause forbidding any inline-review fallback if `subagent_run_serial` is unavailable or worker dispatch is exhausted; they also document the `**Reviewer:**` provenance stamping contract so the coordinator knows it must prepend that exact-format line as the first non-empty line of every persisted review file. The two agent bodies (`code-refiner.md`, `plan-refiner.md`) get a parallel `## Rules` entry making the no-inline-review rule part of standing identity.

The two skills then validate every coordinator-returned review path's `**Reviewer:**` line before reporting success: the line must exist, match the exact format, must not contain the substring `inline`, and the resolved `<provider>/<model>` must match the documented reviewer tier(s) for the relevant skill (per refine-code-prompt.md and refine-plan-prompt.md). Validation failures surface a clear error to the caller naming the failing path and the specific check that failed; the skill does not silently report success.

## Tech stack

- Markdown skill files (`agent/skills/**/*.md`) — LLM instructions
- Markdown agent definitions (`agent/agents/*.md`) — LLM identity files
- JSON config at `~/.pi/agent/model-tiers.json` — read at runtime
- Subagent orchestration via `subagent_run_serial` from `pi-interactive-subagent` (out-of-scope dependency)
- `ripgrep` / `grep` and `sh` for post-edit verification

## File Structure

- `agent/skills/_shared/coordinator-dispatch.md` (Create) — Shared coordinator-CLI resolution procedure. Self-contained markdown reference describing the four-tier chain, the silent-skip rule for non-`pi` tiers, the two hard-stop conditions and their concrete error messages, and a one-line note that workers inside the coordinator must re-resolve `cli` independently. Begins with a brief rationale paragraph (why hard-stop, why silent-skip).
- `agent/skills/refine-code/SKILL.md` (Modify) — In Step 2, replace the "Dispatch resolution" subsection with a one-line read-and-follow reference to `agent/skills/_shared/coordinator-dispatch.md`; in Step 4, rewrite the `subagent_run_serial` placeholders so model and `cli` come from the shared procedure's outcome; insert a new Step 6 "Validate review provenance" between the existing Step 5 and Edge Cases that reads every coordinator-returned review path's `**Reviewer:**` line and surfaces validation errors; rewrite the Edge Cases entry "Code-refiner fails to dispatch" so it defers to the shared procedure's fallback semantics rather than declaring its own two-tier chain.
- `agent/skills/refine-plan/SKILL.md` (Modify) — In Step 5, replace the "Dispatch resolution" subsection (and the broken cross-reference to `refine-code`'s "same pattern") with a one-line read-and-follow reference to `agent/skills/_shared/coordinator-dispatch.md`; in Step 8, rewrite the `subagent_run_serial` placeholders and remove the duplicated three-tier fallback chain (the shared procedure governs); insert a new Step 9.5 "Validate review provenance" between Step 9 and Step 10 that runs validation on every path in the `## Review Files` block; rewrite the Edge Cases entry "Coordinator dispatch CLI is not `pi`" to point at the shared procedure as the single authority.
- `agent/skills/refine-code/refine-code-prompt.md` (Modify) — Insert at the top of `## Protocol` (above "### Iteration 1: Full Review") a numbered "Hard rules" subsection forbidding inline review on `subagent_run_serial` unavailability or worker-dispatch exhaustion. Add a "Reviewer provenance stamping" subsection (under `## Protocol` or directly under each write step) documenting the exact `**Reviewer:** <provider>/<model> via <cli>` first-line contract and that `inline` (or any synonym) MUST NOT appear as the value. Update the iteration-1 step 4, iteration-2..N step 6, and final-verification step 2 write descriptions so each explicitly mentions prepending the `**Reviewer:**` line.
- `agent/skills/refine-plan/refine-plan-prompt.md` (Modify) — Insert at the top of `## Protocol` (above "### Per-Iteration Full Review") an equivalent "Hard rules" subsection forbidding inline review on coordinator-tool unavailability or `plan-reviewer` / `planner` edit-pass dispatch exhaustion. Add a "Reviewer provenance stamping" subsection documenting the same exact-format contract. Update step 6 of "Per-Iteration Full Review" so the file write explicitly prepends the `**Reviewer:**` first line. Add a corresponding `STATUS: failed` reason entry to the `## Failure Modes` list for "coordinator orchestration tool unavailable".
- `agent/agents/code-refiner.md` (Modify) — Append a new bullet to `## Rules`: "Do NOT perform an inline review if `subagent_run_serial` is unavailable or every reviewer dispatch attempt fails. Emit `STATUS: failed` and exit without writing a review file."
- `agent/agents/plan-refiner.md` (Modify) — Append a new bullet to `## Rules`: "do NOT perform an inline review if `subagent_run_serial` is unavailable or every `plan-reviewer` / `planner` edit-pass dispatch attempt fails — emit `STATUS: failed` and exit without writing a review file." (matching the existing lowercased "do NOT" rule style in this file).

## Tasks

### Task 1: Create the shared coordinator-dispatch helper

**Files:**
- Create: `agent/skills/_shared/coordinator-dispatch.md`

**Steps:**

- [ ] **Step 1: Create the directory** — Run `mkdir -p agent/skills/_shared`. The convention does not exist yet; this task creates it. Confirm `ls -d agent/skills/_shared` resolves to a directory after the command.

- [ ] **Step 2: Open a new file at `agent/skills/_shared/coordinator-dispatch.md`** — File begins with a level-1 heading on line 1: `# Coordinator dispatch resolution`. The file has no YAML frontmatter; it is plain markdown reference prose that callers read with the read tool, not skill-loader metadata. Do not include `---` delimiters anywhere in the file.

- [ ] **Step 3: Author the rationale paragraph** — Immediately after the heading, write one paragraph (3–5 sentences) explaining: the coordinator (`code-refiner` or `plan-refiner`) must run on a `pi` CLI because `subagent_run_serial` is exposed only on `pi`; if no tier resolves to `pi`, the coordinator cannot dispatch its workers and a hard-stop is the only correct outcome (silent inline review is forbidden); non-`pi` tiers are skipped silently rather than warned-on because warning on every non-`pi` tier in the chain would be noisy and would obscure the real failure case (no tier resolves to `pi`). Use exactly the heading `## Why this exists` for this paragraph's enclosing section.

- [ ] **Step 4: Author the procedure section** — Add a level-2 heading `## Procedure`. Under it, write a numbered list with exactly these four ordered steps (one numbered list item each):

  1. Iterate the four model tiers in this fixed order: `crossProvider.standard`, `standard`, `crossProvider.capable`, `capable`. No other tiers (no `cheap`, no future additions) participate in this chain.
  2. For each tier, resolve the concrete model string from `~/.pi/agent/model-tiers.json` (e.g., `crossProvider.standard` → `openai-codex/gpt-5.4`); extract the provider prefix as the substring before the first `/` (e.g., `openai-codex`); look up `dispatch[<prefix>]` in the same JSON (e.g., `dispatch["openai-codex"]` → `pi`). If the resolved `cli` is not `pi`, skip this tier silently — emit no warning, attempt no dispatch, advance to the next tier.
  3. For each tier whose resolved `cli` is `pi`, attempt the coordinator dispatch via `subagent_run_serial` with that `model` and `cli: "pi"`. On dispatch failure (model unavailable, transport error, etc.), record the failure and advance to the next tier in the chain.
  4. Stop iterating when a dispatch succeeds. The successful `(model, cli)` pair is the outcome of the procedure; the caller uses those exact values for its `subagent_run_serial` task.

- [ ] **Step 5: Author the hard-stop conditions section** — Add a level-2 heading `## Hard-stop conditions`. Under it, list exactly two conditions as bullet items, each with the EXACT verbatim error message string the caller must surface:

  - **No tier resolves to `pi`** — the chain is exhausted with zero tiers attempted (every tier's resolved `cli` was non-`pi` and got silently skipped). The caller MUST surface the error verbatim:
    > `coordinator-dispatch: no model tier in [crossProvider.standard, standard, crossProvider.capable, capable] resolves to a pi CLI — coordinator cannot dispatch subagents.`
  - **All `pi`-eligible tiers failed** — at least one tier had `cli == "pi"` and was attempted, but every attempted dispatch failed. The caller MUST surface the error verbatim, substituting `<model>` with the model string of the last attempted tier and `<error>` with the underlying dispatch error message:
    > `coordinator-dispatch: all pi-eligible tiers failed; last attempt: <model> via pi — <error>`

- [ ] **Step 6: Author the worker-dispatch note** — Add a level-2 heading `## Note on worker subagents`. Under it, write exactly one paragraph (1–2 sentences): "Workers dispatched inside the coordinator (e.g., `code-reviewer`, `coder`, `plan-reviewer`, `planner` edit-pass) do NOT need to run on `pi`. The coordinator MUST re-resolve `cli` for each worker dispatch using the standard provider-prefix-to-`dispatch[prefix]` lookup, defaulting to `pi` when the prefix has no entry — see the per-coordinator prompt for the worker-dispatch tier assignments. This shared procedure governs the coordinator hop only."

- [ ] **Step 7: Re-read the file end-to-end** — Confirm the structure top-to-bottom is: `# Coordinator dispatch resolution` → `## Why this exists` paragraph → `## Procedure` numbered list (4 items) → `## Hard-stop conditions` two bullets with verbatim error messages → `## Note on worker subagents` one-paragraph note. No other top-level sections.

**Acceptance criteria:**

- The file `agent/skills/_shared/coordinator-dispatch.md` exists and begins with the level-1 heading `# Coordinator dispatch resolution` on its first non-empty line, with no YAML frontmatter delimiters anywhere in the file.
  Verify: `head -n 1 agent/skills/_shared/coordinator-dispatch.md` outputs exactly `# Coordinator dispatch resolution`, AND `grep -nE '^---$' agent/skills/_shared/coordinator-dispatch.md` returns zero matches.
- The Procedure section enumerates the four-tier chain in the exact required order and includes the silent-skip rule for non-`pi` tiers.
  Verify: `grep -n 'crossProvider\.standard\|standard\|crossProvider\.capable\|capable' agent/skills/_shared/coordinator-dispatch.md` produces matches inside the `## Procedure` section, and reading the `## Procedure` section confirms the four tiers appear in the order `crossProvider.standard` → `standard` → `crossProvider.capable` → `capable` in the first numbered item, and the second numbered item contains the literal phrase `skip this tier silently` (or equivalent: a sentence stating the skip is silent without warning).
- The Hard-stop conditions section contains both verbatim error messages exactly as specified.
  Verify: `grep -F 'coordinator-dispatch: no model tier in [crossProvider.standard, standard, crossProvider.capable, capable] resolves to a pi CLI — coordinator cannot dispatch subagents.' agent/skills/_shared/coordinator-dispatch.md` returns at least one match, AND `grep -F 'coordinator-dispatch: all pi-eligible tiers failed; last attempt: <model> via pi — <error>' agent/skills/_shared/coordinator-dispatch.md` returns at least one match.
- The Note section explicitly states workers do NOT need to run on `pi` and that the caller must re-resolve `cli` for each worker dispatch.
  Verify: open `agent/skills/_shared/coordinator-dispatch.md` and confirm the `## Note on worker subagents` section contains both: (a) a sentence stating that workers do NOT need to run on `pi` (must include the literal substring `do NOT need` or `do not need`, AND the substring `pi`), and (b) a sentence instructing the coordinator to re-resolve `cli` for each worker dispatch (must include the substring `re-resolve` and `cli`).
- The rationale paragraph names both reasons (why hard-stop, why silent-skip).
  Verify: read the `## Why this exists` section of `agent/skills/_shared/coordinator-dispatch.md` and confirm a sentence explains why the coordinator hard-stops when no tier is `pi` (must reference `subagent_run_serial` or "orchestration tools" or "dispatch its workers"), AND a sentence explains why non-`pi` tiers are skipped silently rather than warned on (must include the substring `noisy` or `obscure` or "every non-`pi` tier").

**Model recommendation:** standard

### Task 2: Update refine-code/SKILL.md to use the shared procedure and validate provenance

**Files:**
- Modify: `agent/skills/refine-code/SKILL.md`

**Steps:**

- [ ] **Step 1: Replace Step 2's "Dispatch resolution" subsection with a one-line reference** — Open `agent/skills/refine-code/SKILL.md`. Locate the subsection starting at `### Dispatch resolution` (currently three paragraphs ending with `... see refine-code-prompt.md.`) inside `## Step 2: Read model matrix`. Replace the entire subsection (heading + body) with this single-line replacement:

  ```markdown
  ### Dispatch resolution

  Read [agent/skills/_shared/coordinator-dispatch.md](../_shared/coordinator-dispatch.md) and follow it to resolve the coordinator `(model, cli)` pair before Step 4. The shared file is the single authority for the four-tier chain, the skip-silently rule for non-`pi` tiers, and the two hard-stop conditions with their exact error messages. Do not duplicate that procedure here.
  ```

  Leave the rest of Step 2 (the bash code block, the bullet list of tier roles, the `crossProvider.standard` / `standard` / `crossProvider.capable` / `capable` mapping bullets, and the missing-file error sentence) byte-identical.

- [ ] **Step 2: Rewrite Step 4's `subagent_run_serial` invocation** — Locate `## Step 4: Dispatch code-refiner`. Replace its body block:

  ```
  subagent_run_serial { tasks: [
    { name: "code-refiner", agent: "code-refiner", task: "<filled refine-code-prompt.md>", model: "<crossProvider.standard from model-tiers.json>", cli: "<dispatch for crossProvider.standard>" }
  ]}
  ```

  with:

  ```
  subagent_run_serial { tasks: [
    { name: "code-refiner", agent: "code-refiner", task: "<filled refine-code-prompt.md>", model: "<resolved model from coordinator-dispatch.md>", cli: "<resolved cli from coordinator-dispatch.md — guaranteed pi>" }
  ]}
  ```

  Add a one-paragraph preamble immediately above the code block: "Use the `(model, cli)` pair returned by the shared `coordinator-dispatch.md` procedure (Step 2). If the procedure hard-stopped, do not dispatch — surface the error from the shared file's `## Hard-stop conditions` section to the caller and exit."

- [ ] **Step 3: Insert a new Step 6 "Validate review provenance"** — After the body of `## Step 5: Handle code-refiner result` (which ends just before `## Edge Cases`), insert a new `## Step 6: Validate review provenance` heading. Body:

  ~~~markdown
  ## Step 6: Validate review provenance

  Run this validation only on `STATUS: clean` or `STATUS: max_iterations_reached`; skip on any other outcome.

  Build the list of review file paths to validate:

  - The path the coordinator reported in its `## Review File` block (the latest versioned `<REVIEW_OUTPUT_PATH>-v<ERA>.md`).
  - On `STATUS: clean` only: also include the unversioned final copy at `<REVIEW_OUTPUT_PATH>.md` (Step 1's `REVIEW_OUTPUT_PATH` plus `.md`).

  For each path, read the file and validate the first non-empty line:

  1. The line MUST match the regex `^\*\*Reviewer:\*\* [^/]+/[^ ]+ via [a-zA-Z0-9_-]+$` — i.e. the literal markdown `**Reviewer:**`, a single space, a `<provider>/<model>` token (provider has no `/`, model has no whitespace), the literal ` via `, then a `<cli>` token (alphanumerics / `_` / `-`).
  2. Extract `<provider>/<model>` and `<cli>` from the matched line.
  3. The extracted value MUST NOT contain the substring `inline` (case-insensitive).
  4. Read `~/.pi/agent/model-tiers.json` (re-read; do not assume Step 2's snapshot is still current). Resolve `crossProvider.capable` and `standard` to their concrete model strings, and resolve `dispatch[<provider>]` for each.
  5. On `STATUS: clean`: `<provider>/<model>` MUST equal the model string `crossProvider.capable` resolves to, and `<cli>` MUST equal `dispatch[<provider>]` for that model's provider prefix. The final-verification pass always runs at `crossProvider.capable` and is the last write to the file.
  6. On `STATUS: max_iterations_reached`: `<provider>/<model>` MUST equal either the model string `crossProvider.capable` resolves to OR the model string `standard` resolves to (the two documented reviewer tiers in `refine-code-prompt.md`). `<cli>` MUST equal `dispatch[<provider>]` for that model's provider prefix.

  On any validation failure (missing first line, malformed format, `inline` value, or model/cli mismatch), surface to the caller a single error of the form:

  ```
  refine-code: review provenance validation failed at <path>: <specific check> — <observed value or "missing">.
  ```

  Do NOT silently report `STATUS: clean` or `STATUS: max_iterations_reached` after a validation failure; the caller sees the validation error in place of the success status. Use a precise `<specific check>` label such as `first non-empty line missing`, `format mismatch`, `inline-substring forbidden`, `model/cli mismatch (expected <X> got <Y>)`.

  When all paths pass validation, proceed to report the original `STATUS:` to the caller as Step 5 already specified.
  ~~~

- [ ] **Step 4: Rewrite the Edge Cases "Code-refiner fails to dispatch" entry** — Locate the bullet starting `- **Code-refiner fails to dispatch** (model unavailable):` inside `## Edge Cases`. Replace the entire bullet text (everything after the bullet marker through the end of that bullet) with:

  ```
  - **Code-refiner fails to dispatch** (model unavailable, transport error, no `pi` tier resolves): defer to the shared `coordinator-dispatch.md` procedure. The shared file's two hard-stop conditions ("no tier resolves to `pi`" and "all `pi`-eligible tiers failed") are the only sanctioned outcomes here; do NOT declare a separate two-tier or three-tier fallback chain in this skill. Surface the shared file's verbatim error message to the caller and exit without dispatch.
  ```

- [ ] **Step 5: Sanity-scan the file** — Re-read `agent/skills/refine-code/SKILL.md` end-to-end. Confirm the section sequence is: Step 1 → Step 2 (with the new one-line reference replacing the old Dispatch-resolution prose) → Step 3 → Step 4 (with the rewritten `subagent_run_serial` block and preamble paragraph) → Step 5 (unchanged) → Step 6 (new validation step) → Edge Cases (with the rewritten Code-refiner-fails-to-dispatch bullet). Confirm no leftover phrases referring to "two-tier fallback chain" or "Do not fall back to top-level `capable`" remain inside the file (those facts now live in the shared file).

**Acceptance criteria:**

- Step 2 no longer contains the inline four-step dispatch-resolution algorithm; it points at the shared file.
  Verify: `grep -nE '^### Dispatch resolution$' agent/skills/refine-code/SKILL.md` returns exactly one match inside `## Step 2: Read model matrix`. Read the body of that subsection and confirm it is a single short paragraph that contains both the substring `agent/skills/_shared/coordinator-dispatch.md` and a phrase indicating the shared file is authoritative (e.g., `single authority`). Confirm phrases that would indicate inline duplication — such as `extract the provider prefix` or `default to "pi"` — do NOT appear inside that subsection.
- Step 4's dispatch invocation references resolved values from the shared procedure rather than raw matrix tier names.
  Verify: inside `## Step 4: Dispatch code-refiner` in `agent/skills/refine-code/SKILL.md`, the `subagent_run_serial` block's `model:` line reads `"<resolved model from coordinator-dispatch.md>"` and the `cli:` line reads `"<resolved cli from coordinator-dispatch.md — guaranteed pi>"`. Confirm the older placeholders `"<crossProvider.standard from model-tiers.json>"` and `"<dispatch for crossProvider.standard>"` no longer appear anywhere in `agent/skills/refine-code/SKILL.md`.
- A new `## Step 6: Validate review provenance` section exists between Step 5 and Edge Cases.
  Verify: `grep -nE '^## Step ' agent/skills/refine-code/SKILL.md` lists Step 1, Step 2, Step 3, Step 4, Step 5, Step 6 in this order, and `## Step 6` heading text is `## Step 6: Validate review provenance`. The body of Step 6 contains the literal substrings `**Reviewer:**`, `inline`, `crossProvider.capable`, and `model-tiers.json`; AND it contains a description of validating both the versioned and (on `STATUS: clean`) the unversioned final copy.
- The Edge Cases entry "Code-refiner fails to dispatch" defers to the shared procedure.
  Verify: inside `## Edge Cases` in `agent/skills/refine-code/SKILL.md`, the bullet starting `- **Code-refiner fails to dispatch**` contains the substring `coordinator-dispatch.md` AND no longer contains the substring `Retry with \`crossProvider.capable\`` and no longer contains `Do not fall back to top-level \`capable\``.
- No inline duplication of the four-tier chain or hard-stop semantics remains in `agent/skills/refine-code/SKILL.md`.
  Verify: `grep -nE 'crossProvider\.standard.*standard.*crossProvider\.capable.*capable' agent/skills/refine-code/SKILL.md` returns zero matches (the four-tier chain is enumerated only in the shared file). AND `grep -F 'no model tier in' agent/skills/refine-code/SKILL.md` returns zero matches (the hard-stop error string is only in the shared file).

**Model recommendation:** standard

### Task 3: Update refine-plan/SKILL.md to use the shared procedure and validate provenance

**Files:**
- Modify: `agent/skills/refine-plan/SKILL.md`

**Steps:**

- [ ] **Step 1: Replace Step 5's "Dispatch resolution" subsection with a one-line reference** — Open `agent/skills/refine-plan/SKILL.md`. Locate the subsection starting at `### Dispatch resolution` inside `## Step 5: Read model matrix` (currently three paragraphs ending with `... same pattern as refine-code.`). Replace the entire subsection (heading + body) with:

  ```markdown
  ### Dispatch resolution

  Read [agent/skills/_shared/coordinator-dispatch.md](../_shared/coordinator-dispatch.md) and follow it to resolve the coordinator `(model, cli)` pair before Step 8. The shared file is the single authority for the four-tier chain, the skip-silently rule for non-`pi` tiers, and the two hard-stop conditions with their exact error messages. Do not duplicate that procedure here.
  ```

  Leave everything above and below this subsection inside Step 5 byte-identical (the `cat ~/.pi/agent/model-tiers.json | python3 ...` bash block and the missing-file error sentence stay; the prior three-paragraph dispatch-resolution body — including the broken cross-reference "warn the user — same pattern as refine-code" — is removed entirely).

- [ ] **Step 2: Rewrite Step 8's `subagent_run_serial` invocation and remove the duplicated fallback chain** — Locate `## Step 8: Dispatch plan-refiner`. Replace its full body (the `subagent_run_serial` code block plus the immediately following "Fallback chain on dispatch failure: ..." paragraph) with:

  ~~~markdown
  ## Step 8: Dispatch plan-refiner

  Use the `(model, cli)` pair returned by the shared `coordinator-dispatch.md` procedure (Step 5). If the procedure hard-stopped, do not dispatch — surface the error from the shared file's `## Hard-stop conditions` section to the caller, set `STATUS = failed` with reason `coordinator-dispatch: <verbatim error message>`, and skip to Step 11.

  ```
  subagent_run_serial { tasks: [
    { name: "plan-refiner", agent: "plan-refiner", task: "<filled refine-plan-prompt.md>", model: "<resolved model from coordinator-dispatch.md>", cli: "<resolved cli from coordinator-dispatch.md — guaranteed pi>" }
  ]}
  ```
  ~~~

- [ ] **Step 3: Insert a new Step 9.5 "Validate review provenance"** — After the body of `## Step 9: Parse and validate coordinator result` (which ends just before `## Step 10: Handle STATUS`), insert a new `## Step 9.5: Validate review provenance` heading. Body:

  ~~~markdown
  ## Step 9.5: Validate review provenance

  Run this validation only on `STATUS: approved` or `STATUS: issues_remaining`; skip on `STATUS: failed` (no review file is guaranteed to exist on failure).

  For each review file path in the `## Review Files` list parsed in Step 9, read the file and validate the first non-empty line:

  1. The line MUST match the regex `^\*\*Reviewer:\*\* [^/]+/[^ ]+ via [a-zA-Z0-9_-]+$` — i.e. the literal markdown `**Reviewer:**`, a single space, a `<provider>/<model>` token (provider has no `/`, model has no whitespace), the literal ` via `, then a `<cli>` token (alphanumerics / `_` / `-`).
  2. Extract `<provider>/<model>` and `<cli>` from the matched line.
  3. The extracted value MUST NOT contain the substring `inline` (case-insensitive).
  4. Read `~/.pi/agent/model-tiers.json` (re-read; do not assume Step 5's snapshot is still current). Resolve `crossProvider.capable` and `capable` to their concrete model strings, and resolve `dispatch[<provider>]` for each.
  5. `<provider>/<model>` MUST equal either the model string `crossProvider.capable` resolves to OR the model string `capable` resolves to (the two documented reviewer tiers in `refine-plan-prompt.md`'s `plan-reviewer` primary + fallback chain). `<cli>` MUST equal `dispatch[<provider>]` for that model's provider prefix.

  On any validation failure (missing first line, malformed format, `inline` value, or model/cli mismatch), set `STATUS = failed` with reason `review provenance validation failed at <path>: <specific check>` and skip to Step 11. Do NOT proceed to Step 10's commit gate after a validation failure.

  When all paths pass validation, proceed to Step 10.
  ~~~

- [ ] **Step 4: Rewrite the Edge Cases "Coordinator dispatch CLI is not `pi`" entry** — Locate the bullet starting `- **Coordinator dispatch CLI is not \`pi\`**:` inside `## Edge Cases`. Replace the entire bullet text with:

  ```
  - **Coordinator dispatch CLI is not `pi`**: defer to the shared `coordinator-dispatch.md` procedure. The shared file's two hard-stop conditions ("no tier resolves to `pi`" and "all `pi`-eligible tiers failed") are the only sanctioned outcomes here; the prior cross-reference to `refine-code` is removed because the shared file is the single authority for both skills. Surface the shared file's verbatim error message to the caller, set `STATUS = failed` with the verbatim error as the reason, and exit.
  ```

- [ ] **Step 5: Sanity-scan the file** — Re-read `agent/skills/refine-plan/SKILL.md` end-to-end. Confirm the section sequence is: Step 1 → Step 2 → Step 3 → Step 4 → Step 5 (with the new one-line reference replacing the prior dispatch-resolution prose) → Step 6 → Step 7 → Step 7.5 → Step 8 (with the rewritten body and no duplicated fallback chain) → Step 9 → Step 9.5 (new validation step) → Step 10 → Step 10a → Step 11 → Edge Cases (with the rewritten "Coordinator dispatch CLI is not `pi`" bullet). Confirm no leftover phrases like "Fallback chain on dispatch failure: retry with `crossProvider.capable`" or "warn the user — same pattern as refine-code" remain anywhere in the file.

**Acceptance criteria:**

- Step 5 no longer contains the inline three-step dispatch-resolution algorithm or the broken cross-reference; it points at the shared file.
  Verify: `grep -nE '^### Dispatch resolution$' agent/skills/refine-plan/SKILL.md` returns exactly one match inside `## Step 5: Read model matrix`. Read the body of that subsection and confirm it contains the substring `agent/skills/_shared/coordinator-dispatch.md` and does NOT contain the substrings `Take crossProvider.standard`, `extract the provider prefix`, `Fallback chain on dispatch failure`, or `same pattern as refine-code`.
- Step 8's body uses the shared procedure's outcome and no longer declares its own three-tier fallback chain.
  Verify: inside `## Step 8: Dispatch plan-refiner` in `agent/skills/refine-plan/SKILL.md`, the `subagent_run_serial` block's `model:` line reads `"<resolved model from coordinator-dispatch.md>"` and the `cli:` line reads `"<resolved cli from coordinator-dispatch.md — guaranteed pi>"`. Confirm the substrings `Fallback chain on dispatch failure: retry with \`crossProvider.capable\`, then \`capable\`` and `coordinator dispatch failed on all tiers` no longer appear anywhere in `agent/skills/refine-plan/SKILL.md`.
- A new `## Step 9.5: Validate review provenance` section exists between Step 9 and Step 10.
  Verify: `grep -nE '^## Step ' agent/skills/refine-plan/SKILL.md` includes a line `## Step 9.5: Validate review provenance` after the line for `## Step 9` and before the line for `## Step 10`. The body of Step 9.5 contains the literal substrings `**Reviewer:**`, `inline`, `crossProvider.capable`, `capable`, and `model-tiers.json`; AND it contains an instruction to set `STATUS = failed` and skip to Step 11 on validation failure.
- The Edge Cases entry "Coordinator dispatch CLI is not `pi`" defers to the shared procedure and removes the broken cross-reference.
  Verify: inside `## Edge Cases` in `agent/skills/refine-plan/SKILL.md`, the bullet starting `- **Coordinator dispatch CLI is not \`pi\`**` contains the substring `coordinator-dispatch.md` AND no longer contains the substring `same wording used in \`refine-code\`` and no longer contains `same pattern as refine-code`.
- No inline duplication of the four-tier chain or hard-stop error messages remains in `agent/skills/refine-plan/SKILL.md`.
  Verify: `grep -F 'no model tier in' agent/skills/refine-plan/SKILL.md` returns zero matches (hard-stop error strings live only in the shared file). AND `grep -nE 'crossProvider\.standard.*standard.*crossProvider\.capable.*capable' agent/skills/refine-plan/SKILL.md` returns zero matches (no inline four-tier chain enumeration).

**Model recommendation:** standard

### Task 4: Harden refine-code-prompt.md against inline-review fallback and stamp reviewer provenance

**Files:**
- Modify: `agent/skills/refine-code/refine-code-prompt.md`

**Steps:**

- [ ] **Step 1: Insert a "Hard rules" subsection at the top of `## Protocol`** — Open `agent/skills/refine-code/refine-code-prompt.md`. Locate the `## Protocol` heading (currently followed immediately by `### Iteration 1: Full Review`). Insert a new subsection between `## Protocol` and `### Iteration 1: Full Review`:

  ~~~markdown
  ### Hard rules (read first)

  These rules govern the entire protocol below. They are NOT edge cases; they are unconditional.

  1. **No inline review on coordinator-tool unavailability.** If `subagent_run_serial` is unavailable in your session — for any reason, at any iteration — you MUST emit `STATUS: failed` with reason `coordinator dispatch unavailable`, MUST NOT write any review file, and MUST NOT perform an inline review as a substitute. The calling skill (`refine-code`) is responsible for fallback decisions; you do not improvise.
  2. **No inline review on worker-dispatch exhaustion.** If every dispatch attempt for a `code-reviewer` (first-pass, hybrid re-review, or final-verification) or for a `coder` (remediator) fails — model unavailable, transport error, repeated empty results — you MUST emit `STATUS: failed` with reason `worker dispatch failed: <which worker>` and MUST NOT write any review file written after the failure. Inline-review fallback is forbidden in all cases. There is no exception for "I could just write the review myself"; that path produces silently degraded artifacts and is the failure mode this protocol exists to prevent.

  Both rules are duplicated as standing identity rules in `agent/agents/code-refiner.md` `## Rules`. The duplication is intentional — these rules apply unconditionally regardless of the per-invocation prompt.
  ~~~

  Make the new subsection's heading `### Hard rules (read first)` so it is unmissable and clearly precedes the iteration protocol.

- [ ] **Step 2: Insert a "Reviewer provenance stamping" subsection** — After the new `### Hard rules (read first)` subsection (i.e., still between `## Protocol` and `### Iteration 1: Full Review`), insert a second new subsection:

  ~~~markdown
  ### Reviewer provenance stamping

  Every review file you write MUST begin with a `**Reviewer:**` provenance line as its first non-empty line. The format is exact:

  ```
  **Reviewer:** <provider>/<model> via <cli>
  ```

  - `<provider>/<model>` MUST be the EXACT model string you passed to `subagent_run_serial` for that review-pass `code-reviewer` dispatch (e.g., `openai-codex/gpt-5.5`).
  - `<cli>` MUST be the EXACT cli string you passed to `subagent_run_serial` for that same dispatch (e.g., `pi`).
  - The line is followed by a single blank line, then the reviewer's persisted output.
  - You MUST NOT emit `inline` or any synonym (`improvised`, `local`, `fallback`) as the value. The corollary — never write a review file when dispatch failed — is enforced by the Hard rules above; together those two rules make inline-stamped review files structurally impossible.

  Apply this stamp to every persisted review file: the versioned `<REVIEW_OUTPUT_PATH>-v<ERA>.md` (first-pass, every hybrid re-review write, the final-verification write) AND the unversioned final copy `<REVIEW_OUTPUT_PATH>.md` written on `STATUS: clean`. When you overwrite a versioned file in a later iteration, re-stamp the new first line with the model and cli used for THAT iteration's reviewer dispatch. The calling skill (`refine-code`) validates this line on every returned path before reporting success; missing, malformed, or `inline`-valued stamps will surface as a validation error to the caller.
  ~~~

- [ ] **Step 3: Update Iteration 1 step 4 wording to mention the stamp** — Locate `### Iteration 1: Full Review` inside `## Protocol`. Find step 4 (the bullet beginning `4. **Write review** to versioned path: \`<REVIEW_OUTPUT_PATH>-v<ERA>.md\``). Replace the body of that step (the indented sub-bullets after the heading line) with:

  ```
  4. **Write review** to versioned path: `<REVIEW_OUTPUT_PATH>-v<ERA>.md`
     - Prepend the `**Reviewer:**` provenance line as the first non-empty line of the file (see [Reviewer provenance stamping](#reviewer-provenance-stamping)). Use the model and cli you passed to this iteration's `code-reviewer` dispatch.
     - First era starts at v1. New eras created on budget reset (see Final Verification).
  ```

- [ ] **Step 4: Update Iteration 2..N step 6 wording to mention the stamp** — Inside `### Iteration 2..N: Hybrid Re-Review`, find step 6 (currently `6. **Overwrite review sections** in the current versioned file; **append** to remediation log.`). Replace it with:

  ```
  6. **Overwrite review sections** in the current versioned file; **append** to remediation log. Re-stamp the first non-empty line of the file with the `**Reviewer:**` provenance line for THIS iteration's reviewer dispatch (the hybrid re-review uses `standard`, so the stamp will reflect that model and its cli — not the prior iteration's).
  ```

- [ ] **Step 5: Update Final Verification step 2 wording to mention the stamp** — Inside `### Final Verification`, find step 2 (the bullet beginning `2. **If clean** (no Critical/Important issues):`). Add a new sub-bullet at the top of that step's sub-list:

  ```
     - Re-stamp the first non-empty line of the versioned file with the `**Reviewer:**` provenance line for the final-verification reviewer dispatch (always `crossProvider.capable`).
  ```

  Do not remove the existing sub-bullets ("Write final review to the versioned file", "Append final entry to remediation log: ...", "Copy the versioned file to the unversioned path: ...", "Report `STATUS: clean`"). The new sub-bullet sits at the top of the existing sub-list, before "Write final review to the versioned file".

  Also update the existing "Copy the versioned file to the unversioned path" sub-bullet by appending: "(the copy preserves the just-stamped `**Reviewer:**` first line, so the unversioned final copy carries the same provenance as the versioned final-verification write)."

- [ ] **Step 6: Sanity-scan the file** — Re-read `agent/skills/refine-code/refine-code-prompt.md` end-to-end. Confirm the section sequence is: top sections → `## Protocol` → `### Hard rules (read first)` (new) → `### Reviewer provenance stamping` (new) → `### Iteration 1: Full Review` (modified step 4) → `### Iteration 2..N: Hybrid Re-Review` (modified step 6) → `### Final Verification` (modified step 2) → `### On Budget Exhaustion` → `### On Clean First Review` → `## Output Format`. Confirm no leftover `inline` references remain except the explicit prohibition in the new "Reviewer provenance stamping" subsection.

**Acceptance criteria:**

- The `## Protocol` section starts with the `### Hard rules (read first)` subsection naming both the coordinator-tool-unavailability rule and the worker-dispatch-exhaustion rule.
  Verify: `grep -nE '^### Hard rules \(read first\)$' agent/skills/refine-code/refine-code-prompt.md` returns exactly one match, and that match's line number is greater than the line number of `## Protocol` and less than the line number of `### Iteration 1: Full Review` (run `grep -nE '^## Protocol$|^### (Hard rules \(read first\)|Iteration 1: Full Review)$' agent/skills/refine-code/refine-code-prompt.md` and confirm the order is `## Protocol`, `### Hard rules (read first)`, `### Iteration 1: Full Review`). Read the `### Hard rules (read first)` subsection and confirm it contains both `subagent_run_serial` is unavailable AND `worker dispatch` (or "every dispatch attempt"), and an explicit prohibition such as `MUST NOT perform an inline review`.
- A `### Reviewer provenance stamping` subsection exists between `### Hard rules (read first)` and `### Iteration 1: Full Review`, documents the exact format, names the forbidden `inline` value, and applies to both versioned and unversioned final copy.
  Verify: `grep -nE '^### Reviewer provenance stamping$' agent/skills/refine-code/refine-code-prompt.md` returns exactly one match. Read the section and confirm it contains the literal string `**Reviewer:** <provider>/<model> via <cli>`, the literal substring `MUST NOT emit \`inline\``, and an instruction that applies the stamp to both `<REVIEW_OUTPUT_PATH>-v<ERA>.md` AND `<REVIEW_OUTPUT_PATH>.md`.
- Iteration 1 step 4, Iteration 2..N step 6, and Final Verification step 2 each explicitly reference the `**Reviewer:**` stamping requirement.
  Verify: open `agent/skills/refine-code/refine-code-prompt.md`. Inside `### Iteration 1: Full Review`, the body of step 4 contains the substring `**Reviewer:**` and points at the stamping subsection. Inside `### Iteration 2..N: Hybrid Re-Review`, the body of step 6 contains the substring `Re-stamp` AND `**Reviewer:**` AND `standard`. Inside `### Final Verification`, the body of step 2 contains the substring `Re-stamp` AND `**Reviewer:**` AND `crossProvider.capable`.
- The file does not introduce any silent-fallback path; the only `inline` mentions in the file are inside the explicit prohibition in the new subsection.
  Verify: `grep -niE '\binline\b' agent/skills/refine-code/refine-code-prompt.md` returns matches that all fall inside the `### Reviewer provenance stamping` subsection (or inside the `### Hard rules (read first)` subsection's prohibition language). No matches occur inside `### Iteration 1: Full Review`, `### Iteration 2..N: Hybrid Re-Review`, `### Final Verification`, `### On Budget Exhaustion`, `### On Clean First Review`, or `## Output Format`.

**Model recommendation:** standard

### Task 5: Harden refine-plan-prompt.md against inline-review fallback and stamp reviewer provenance

**Files:**
- Modify: `agent/skills/refine-plan/refine-plan-prompt.md`

**Steps:**

- [ ] **Step 1: Insert a "Hard rules" subsection at the top of `## Protocol`** — Open `agent/skills/refine-plan/refine-plan-prompt.md`. Locate the `## Protocol` heading (currently followed immediately by `### Per-Iteration Full Review`). Insert a new subsection between `## Protocol` and `### Per-Iteration Full Review`:

  ~~~markdown
  ### Hard rules (read first)

  These rules govern the entire protocol below. They are NOT edge cases; they are unconditional.

  1. **No inline review on coordinator-tool unavailability.** If `subagent_run_serial` is unavailable in your session — for any reason, at any iteration — you MUST emit `STATUS: failed` with reason `coordinator dispatch unavailable`, MUST NOT write any review file, and MUST NOT perform an inline review as a substitute. The calling skill (`refine-plan`) is responsible for fallback decisions; you do not improvise.
  2. **No inline review on worker-dispatch exhaustion.** If every dispatch attempt for `plan-reviewer` (primary `crossProvider.capable` AND fallback `capable`) fails, OR if the `planner` edit-pass dispatch fails on the documented retry path, you MUST emit `STATUS: failed` with the appropriate reason from the `## Failure Modes` list (e.g., `plan-reviewer dispatch failed on primary and fallback`, `planner edit-pass dispatch failed`, or `coordinator orchestration tool unavailable`) and MUST NOT write any review file written after the failure. Inline-review fallback is forbidden in all cases.

  Both rules are duplicated as standing identity rules in `agent/agents/plan-refiner.md` `## Rules`. The duplication is intentional — these rules apply unconditionally regardless of the per-invocation prompt.
  ~~~

- [ ] **Step 2: Insert a "Reviewer provenance stamping" subsection** — After the new `### Hard rules (read first)` subsection, insert a second new subsection:

  ~~~markdown
  ### Reviewer provenance stamping

  Every review file you write MUST begin with a `**Reviewer:**` provenance line as its first non-empty line. The format is exact:

  ```
  **Reviewer:** <provider>/<model> via <cli>
  ```

  - `<provider>/<model>` MUST be the EXACT model string you passed to `subagent_run_serial` for that iteration's `plan-reviewer` dispatch (e.g., `openai-codex/gpt-5.5`).
  - `<cli>` MUST be the EXACT cli string you passed to `subagent_run_serial` for that same dispatch (e.g., `pi`).
  - The line is followed by a single blank line, then the reviewer's persisted output.
  - You MUST NOT emit `inline` or any synonym (`improvised`, `local`, `fallback`) as the value. The corollary — never write a review file when dispatch failed — is enforced by the Hard rules above.

  Apply this stamp to the era-versioned file `{REVIEW_OUTPUT_PATH}-v<CURRENT_ERA>.md` on the write in step 6 of the Per-Iteration Full Review. When step 6 overwrites the file in place across iterations within one era, re-stamp the first line each time with the model and cli used for THAT iteration's `plan-reviewer` dispatch (e.g., if iteration 1 used `crossProvider.capable` and iteration 2 fell back to `capable`, the era file's first line reflects iteration 2's pair after iteration 2's write). The calling skill (`refine-plan`) validates this line on every returned path before reporting success; missing, malformed, or `inline`-valued stamps will surface as a validation error to the caller.
  ~~~

- [ ] **Step 3: Update Per-Iteration Full Review step 6 wording to mention the stamp** — Locate `### Per-Iteration Full Review`. Find step 6 (the bullet beginning `6. **Write the full reviewer output** to \`{REVIEW_OUTPUT_PATH}-v<CURRENT_ERA>.md\``). Replace it with:

  ```
  6. **Write the full reviewer output** to `{REVIEW_OUTPUT_PATH}-v<CURRENT_ERA>.md`, where `<CURRENT_ERA>` is `{STARTING_ERA}` and never changes within one `plan-refiner` invocation. Prepend the `**Reviewer:**` provenance line as the first non-empty line of the file (see [Reviewer provenance stamping](#reviewer-provenance-stamping)) — use the model and cli you passed to THIS iteration's `plan-reviewer` dispatch (primary or fallback, whichever succeeded). Overwrite the file in place if it already exists from a prior iteration in this era; the re-stamp on overwrite reflects the current iteration's reviewer dispatch. If the write fails, emit `STATUS: failed` with reason `review file write failed: <error>` and exit.
  ```

- [ ] **Step 4: Add the failed-reason entry for coordinator-tool unavailability** — Locate the `## Failure Modes` section. Append a new bullet to the existing list:

  ```
  - **Coordinator orchestration tool unavailable** — reason: `coordinator dispatch unavailable`
  ```

  This bullet sits between the existing bullets in the list — append it as the LAST bullet of the list, after the existing `Plan file missing or empty after the planner edit pass returned` entry. Do not modify the existing six bullets.

- [ ] **Step 5: Update the Output Format STATUS reasons enumeration if any are listed inline** — The existing `## Output Format` block enumerates `STATUS: approved | issues_remaining | failed`. No inline failure reason enumeration appears there, so no edits to the Output Format block are needed beyond what already exists. Re-read `## Output Format` and confirm it still references `## Failure Reason` for the failed case (no edits required).

- [ ] **Step 6: Sanity-scan the file** — Re-read `agent/skills/refine-plan/refine-plan-prompt.md` end-to-end. Confirm the section sequence is: top sections → `## Protocol` → `### Hard rules (read first)` (new) → `### Reviewer provenance stamping` (new) → `### Per-Iteration Full Review` (with modified step 6) → `### Review Notes Append Format` → `### Planner Edit Pass` → `## Output Format` → `## Failure Modes` (with one new bullet appended). Confirm no leftover `inline` references remain except the explicit prohibition in the new subsections.

**Acceptance criteria:**

- The `## Protocol` section starts with the `### Hard rules (read first)` subsection naming both the coordinator-tool-unavailability rule and the worker-dispatch-exhaustion rule (mapped onto `plan-reviewer` and `planner` edit-pass).
  Verify: `grep -nE '^### Hard rules \(read first\)$' agent/skills/refine-plan/refine-plan-prompt.md` returns exactly one match, and that match's line number is greater than the line number of `## Protocol` and less than the line number of `### Per-Iteration Full Review` (confirm via `grep -nE '^## Protocol$|^### (Hard rules \(read first\)|Per-Iteration Full Review)$' agent/skills/refine-plan/refine-plan-prompt.md`). Read the `### Hard rules (read first)` subsection and confirm it contains both `subagent_run_serial` is unavailable AND a reference to `plan-reviewer` AND `planner` edit-pass dispatch failures.
- A `### Reviewer provenance stamping` subsection exists between `### Hard rules (read first)` and `### Per-Iteration Full Review`, documents the exact format, and names the forbidden `inline` value.
  Verify: `grep -nE '^### Reviewer provenance stamping$' agent/skills/refine-plan/refine-plan-prompt.md` returns exactly one match. Read the section and confirm it contains the literal string `**Reviewer:** <provider>/<model> via <cli>`, the literal substring `MUST NOT emit \`inline\``, and an instruction that the stamp applies to `{REVIEW_OUTPUT_PATH}-v<CURRENT_ERA>.md`.
- Per-Iteration Full Review step 6 explicitly references the `**Reviewer:**` stamping requirement and the re-stamp-on-overwrite rule.
  Verify: open `agent/skills/refine-plan/refine-plan-prompt.md`. Inside `### Per-Iteration Full Review`, the body of step 6 contains the substring `**Reviewer:**` AND `Prepend` AND `re-stamp` (or `re-stamps`/`Re-stamp` depending on capitalization).
- The `## Failure Modes` list ends with a new bullet for coordinator-tool unavailability with the exact reason string.
  Verify: `grep -nE '^- \*\*Coordinator orchestration tool unavailable\*\*.*coordinator dispatch unavailable' agent/skills/refine-plan/refine-plan-prompt.md` returns exactly one match, AND the match's line number is greater than the line number of the bullet whose first marker is `- **Plan file missing or empty after the planner edit pass returned**` (confirm by `grep -nE '^- \*\*Plan file missing or empty after the planner edit pass returned\*\*' agent/skills/refine-plan/refine-plan-prompt.md` and comparing line numbers).
- The file does not introduce any silent-fallback path; the only `inline` mentions in the file are inside the explicit prohibition in the new subsections.
  Verify: `grep -niE '\binline\b' agent/skills/refine-plan/refine-plan-prompt.md` returns matches that all fall inside the `### Reviewer provenance stamping` subsection or the `### Hard rules (read first)` subsection prohibition language. No matches occur inside `### Per-Iteration Full Review`, `### Review Notes Append Format`, `### Planner Edit Pass`, `## Output Format`, or `## Failure Modes` (the new bullet's reason string is `coordinator dispatch unavailable` — does NOT contain `inline`).

**Model recommendation:** standard

### Task 6: Add inline-review-forbidden rule to code-refiner.md

**Files:**
- Modify: `agent/agents/code-refiner.md`

**Steps:**

- [ ] **Step 1: Open `agent/agents/code-refiner.md`** — Locate the `## Rules` section (currently five bullets ending with "Commit after each remediation batch, not at the end"). The frontmatter (lines 1–7) and body above `## Rules` are not modified.

- [ ] **Step 2: Append a new bullet to the `## Rules` list** — Add a new line at the end of the `## Rules` list, after the existing "Commit after each remediation batch, not at the end" bullet:

  ```
  - Do NOT perform an inline review if `subagent_run_serial` is unavailable or every reviewer dispatch attempt fails. Emit `STATUS: failed` and exit without writing a review file.
  ```

  The bullet matches the existing rule style ("Do NOT ..."). Place it as the SIXTH bullet (last item in the list). Do not modify the existing five bullets.

- [ ] **Step 3: Sanity-scan the file** — Re-read `agent/agents/code-refiner.md` end-to-end. Confirm the frontmatter is byte-identical to the pre-edit state (line 4's `tools: read, write, edit, grep, find, ls, bash, subagent_run_serial` is unchanged, no other frontmatter fields are added or removed). Confirm the only body change is the new bullet at the end of `## Rules`.

**Acceptance criteria:**

- The `## Rules` section ends with the new bullet forbidding inline review.
  Verify: `grep -nE '^- Do NOT perform an inline review if \`subagent_run_serial\` is unavailable' agent/agents/code-refiner.md` returns exactly one match, AND the match's line number is greater than the line number of the bullet beginning `- Commit after each remediation batch` (confirm via `grep -nE '^- Commit after each remediation batch' agent/agents/code-refiner.md` and comparing).
- The frontmatter is unchanged.
  Verify: `head -n 7 agent/agents/code-refiner.md` matches exactly the seven-line frontmatter block (lines 1 `---`, 2 `name: code-refiner`, 3 `description: ...`, 4 `tools: read, write, edit, grep, find, ls, bash, subagent_run_serial`, 5 `thinking: medium`, 6 `session-mode: lineage-only`, 7 `---`). No other tools or fields appear, and the `tools:` line on line 4 contains `subagent_run_serial`.
- No other body changes are introduced.
  Verify: open `agent/agents/code-refiner.md` and confirm the original five `## Rules` bullets ("Do NOT write code yourself", "Do NOT skip review iterations", "Do NOT exceed the iteration budget", "Do NOT ignore Critical or Important findings", "Commit after each remediation batch, not at the end") are present in their original order, the new sixth bullet sits below them, and the rest of the file (frontmatter, intro paragraph, `## Your Role` section, `## Batching Judgment` section) is byte-identical to the pre-edit state.

**Model recommendation:** cheap

### Task 7: Add inline-review-forbidden rule to plan-refiner.md

**Files:**
- Modify: `agent/agents/plan-refiner.md`

**Steps:**

- [ ] **Step 1: Open `agent/agents/plan-refiner.md`** — Locate the `## Rules` section (currently five bullets, all using lowercased "do NOT" style, ending with "do NOT inline full review text into the response back to the caller — only the path and a compact summary").

- [ ] **Step 2: Append a new bullet to the `## Rules` list** — Add a new line at the end of the `## Rules` list, after the existing "do NOT inline full review text..." bullet:

  ```
  - do NOT perform an inline review if `subagent_run_serial` is unavailable or every `plan-reviewer` / `planner` edit-pass dispatch attempt fails — emit `STATUS: failed` and exit without writing a review file.
  ```

  The bullet matches the existing rule style ("do NOT ..." — lowercase). Place it as the SIXTH bullet (last item in the list). Do not modify the existing five bullets.

- [ ] **Step 3: Sanity-scan the file** — Re-read `agent/agents/plan-refiner.md` end-to-end. Confirm the frontmatter is byte-identical to the pre-edit state (line 4's `tools: read, write, edit, grep, find, ls, subagent_run_serial` is unchanged, no other frontmatter fields are added or removed). Confirm the only body change is the new bullet at the end of `## Rules`.

**Acceptance criteria:**

- The `## Rules` section ends with the new bullet forbidding inline review for the plan-refiner case.
  Verify: `grep -nE '^- do NOT perform an inline review if \`subagent_run_serial\` is unavailable' agent/agents/plan-refiner.md` returns exactly one match, AND the match's line number is greater than the line number of the bullet beginning `- do NOT inline full review text into the response back to the caller` (confirm via `grep -nE '^- do NOT inline full review text' agent/agents/plan-refiner.md` and comparing).
- The frontmatter is unchanged and lists `subagent_run_serial`.
  Verify: `head -n 7 agent/agents/plan-refiner.md` matches exactly the seven-line frontmatter block (lines 1 `---`, 2 `name: plan-refiner`, 3 `description: ...`, 4 `tools: read, write, edit, grep, find, ls, subagent_run_serial`, 5 `thinking: medium`, 6 `session-mode: lineage-only`, 7 `---`). No other tools or fields appear, and the `tools:` line on line 4 contains `subagent_run_serial`.
- No other body changes are introduced.
  Verify: open `agent/agents/plan-refiner.md` and confirm the original five `## Rules` bullets ("do NOT invoke the `commit` skill...", "do NOT batch findings...", "do NOT loop multiple eras internally...", "do NOT expand the plan-reviewer's responsibilities...", "do NOT inline full review text...") are present in their original order, the new sixth bullet sits below them, and the rest of the file (frontmatter, intro paragraph, `## Your Role` section, `## Boundary with refine-plan` section) is byte-identical to the pre-edit state.

**Model recommendation:** cheap

### Task 8: End-to-end consistency review of the refiner hardening contract

**Files:**
- Modify: none (read-only verification pass)
- Test: none

**Steps:**

- [ ] **Step 1: Trace the refine-code happy path** — Read `agent/skills/refine-code/SKILL.md` end-to-end assuming `~/.pi/agent/model-tiers.json` resolves `crossProvider.standard` to `openai-codex/gpt-5.4` with `dispatch["openai-codex"] = "pi"`. Confirm Step 2 reads the matrix and points at the shared file; Step 4's `subagent_run_serial` block uses placeholders `<resolved model from coordinator-dispatch.md>` and `<resolved cli from coordinator-dispatch.md — guaranteed pi>`; Step 5 parses STATUS; Step 6 (new) validates the `**Reviewer:**` line on the versioned file (and the unversioned final copy on STATUS: clean).

- [ ] **Step 2: Trace the refine-code hard-stop path** — Re-read `agent/skills/refine-code/SKILL.md` assuming a hypothetical `model-tiers.json` where every one of the four tiers (`crossProvider.standard`, `standard`, `crossProvider.capable`, `capable`) resolves to a non-`pi` `cli`. Confirm Step 2 directs the reader to the shared file. Open `agent/skills/_shared/coordinator-dispatch.md` and confirm the procedure would skip every tier silently (no warnings) and hard-stop with the exact error: `coordinator-dispatch: no model tier in [crossProvider.standard, standard, crossProvider.capable, capable] resolves to a pi CLI — coordinator cannot dispatch subagents.` Confirm Step 4's preamble paragraph instructs the skill to surface that verbatim error and exit without dispatch.

- [ ] **Step 3: Trace the refine-plan happy path** — Read `agent/skills/refine-plan/SKILL.md` end-to-end with the same default `model-tiers.json` snapshot. Confirm Step 5 points at the shared file; Step 8 dispatches the coordinator using the shared procedure's outcome; Step 9 parses paths; Step 9.5 (new) validates the `**Reviewer:**` line on every path in `## Review Files`; Step 10 runs the commit gate only when validation passes.

- [ ] **Step 4: Trace the refine-plan hard-stop path** — Re-read `agent/skills/refine-plan/SKILL.md` assuming the same all-non-`pi` matrix as Step 2. Confirm Step 8 surfaces the shared file's verbatim error, sets `STATUS = failed` with that error as the reason, and skips to Step 11. Confirm the Edge Cases entry "Coordinator dispatch CLI is not `pi`" routes through the shared file.

- [ ] **Step 5: Trace the inline-review-forbidden path for both coordinator prompts** — Read `agent/skills/refine-code/refine-code-prompt.md` and `agent/skills/refine-plan/refine-plan-prompt.md`. For each, confirm the `### Hard rules (read first)` subsection appears immediately after `## Protocol` and before the first iteration subsection. Confirm both files explicitly state that on `subagent_run_serial` unavailability OR worker-dispatch exhaustion, the coordinator MUST emit `STATUS: failed` and MUST NOT write a review file or perform an inline review. Confirm the `### Reviewer provenance stamping` subsection in each file documents the `**Reviewer:** <provider>/<model> via <cli>` format and forbids `inline` as the value.

- [ ] **Step 6: Trace the agent-body identity rules** — Read `agent/agents/code-refiner.md` and `agent/agents/plan-refiner.md`. Confirm each file's `## Rules` section ends with a bullet forbidding inline review on dispatch unavailability or exhaustion. Confirm the bullets reference `subagent_run_serial` by name and instruct emitting `STATUS: failed` and exiting without writing a review file.

- [ ] **Step 7: Trace the validation contract end-to-end** — Read `agent/skills/refine-code/SKILL.md` Step 6 and `agent/skills/refine-plan/SKILL.md` Step 9.5 side by side. Confirm both check the first non-empty line, the exact `**Reviewer:** <provider>/<model> via <cli>` format, the `inline` substring prohibition, and the `<provider>/<model>` matching the documented reviewer tier(s) for that skill (`crossProvider.capable` for refine-code clean / `crossProvider.capable` or `standard` for refine-code max_iterations_reached / `crossProvider.capable` or `capable` for refine-plan). Confirm both skills surface a clear error to the caller on validation failure rather than silently reporting success.

- [ ] **Step 8: Spot-check the no-duplication rule** — Run `grep -nE 'no model tier in \[' agent/skills/refine-code/SKILL.md agent/skills/refine-plan/SKILL.md` and confirm zero matches in the two SKILL files (the hard-stop error message string lives only in the shared file). Run `grep -nE 'crossProvider\.standard.*standard.*crossProvider\.capable.*capable' agent/skills/refine-code/SKILL.md agent/skills/refine-plan/SKILL.md` and confirm zero matches in the two SKILL files (the four-tier chain is enumerated only in the shared file).

**Acceptance criteria:**

- All seven traces (refine-code happy path, refine-code hard-stop, refine-plan happy path, refine-plan hard-stop, inline-review-forbidden in both prompts, agent-body identity rules, end-to-end validation contract) resolve without contradiction or ambiguity.
  Verify: read all six modified files plus the new shared file end-to-end and walk through each of the seven traces in Steps 1–7 above. Each trace must resolve unambiguously through the file text — i.e., for each trace, name the section heading, line range, or bullet that implements the behavior. Any trace that cannot be resolved unambiguously fails this check.
- No inline duplication of the four-tier chain or hard-stop error messages remains in either SKILL file.
  Verify: `grep -F 'no model tier in [crossProvider.standard, standard, crossProvider.capable, capable]' agent/skills/refine-code/SKILL.md agent/skills/refine-plan/SKILL.md` returns zero matches across the two files combined; AND `grep -F 'all pi-eligible tiers failed' agent/skills/refine-code/SKILL.md agent/skills/refine-plan/SKILL.md` returns zero matches across the two files combined. Both error-message strings appear only in `agent/skills/_shared/coordinator-dispatch.md`.
- The shared file is referenced by both SKILL files via a relative path that resolves correctly from each skill's directory.
  Verify: `grep -F 'agent/skills/_shared/coordinator-dispatch.md' agent/skills/refine-code/SKILL.md` returns at least one match (with markdown link form `[...](../_shared/coordinator-dispatch.md)` or absolute path acceptable), AND `grep -F 'agent/skills/_shared/coordinator-dispatch.md' agent/skills/refine-plan/SKILL.md` returns at least one match. Read each match's surrounding context and confirm the reference is in Step 2 (refine-code) or Step 5 (refine-plan) under `### Dispatch resolution`. Confirm the relative-link form `../_shared/coordinator-dispatch.md` resolves from `agent/skills/refine-code/` and `agent/skills/refine-plan/` respectively to the actual file `agent/skills/_shared/coordinator-dispatch.md` (run `test -f agent/skills/_shared/coordinator-dispatch.md` and confirm exit code 0).
- No placeholder text (`TBD`, `TODO`, `…`, `to be filled`) is left in any modified file.
  Verify: `grep -nE 'TBD|TODO|to be filled|\.\.\.|…' agent/skills/_shared/coordinator-dispatch.md agent/skills/refine-code/SKILL.md agent/skills/refine-plan/SKILL.md agent/skills/refine-code/refine-code-prompt.md agent/skills/refine-plan/refine-plan-prompt.md agent/agents/code-refiner.md agent/agents/plan-refiner.md` returns zero matches that fall inside content authored by this plan. Pre-existing matches inside unchanged sections (if any) are out of scope; the verifier confirms by checking each match against the line number ranges modified by Tasks 1–7.

**Model recommendation:** standard

### Task 9: Manual smoke runs proving end-to-end hardening

The spec's Acceptance Criteria require four manual smoke runs that exercise the live skills. This task makes those runs an explicit gate: each smoke run is reproduced step-by-step with a concrete `Verify:` recipe describing the expected outcome, so a fresh executor cannot finish the plan without proving the hardening works in the failure modes that motivated the change. No source files are modified by this task — it executes against the artifacts produced by Tasks 1–7 and observes their behavior.

**Files:**
- Modify: none (manual smoke runs against the live skills; no source edits)
- Test: none (no automated tests; per spec Non-Goals, smoke tests are manual)

**Steps:**

- [ ] **Step 1: Set up the scratch targets** — Pick one small `refine-code` target: a feature branch in this repo with at least one staged single-line markdown change, and note the absolute paths for the resulting `<REVIEW_OUTPUT_PATH>-v1.md` and (on `STATUS: clean`) the unversioned `<REVIEW_OUTPUT_PATH>.md`. Pick one small `refine-plan` target: a draft plan file at `.pi/plans/<plan-basename>.md` with at most 1–2 trivial tasks, and note the resulting versioned-review path `.pi/plans/reviews/<plan-basename>-plan-review-v1.md`. Note also the absolute path to `~/.pi/agent/model-tiers.json` (used in Smoke 1). Throughout this task, substitute `<REVIEW_OUTPUT_PATH>` and `<plan-basename>` with the concrete values you chose here.

- [ ] **Step 2: Smoke 1 — all-non-`pi` hard-stop** — Back up the active matrix: `cp ~/.pi/agent/model-tiers.json ~/.pi/agent/model-tiers.json.bak`. Edit `~/.pi/agent/model-tiers.json` so that all four tiers (`crossProvider.standard`, `standard`, `crossProvider.capable`, `capable`) resolve to a non-`pi` provider — e.g., set every tier's model string to `anthropic/claude-sonnet-4-6` and confirm `dispatch["anthropic"]` is `claude` (NOT `pi`). Save the file. List the directory containing `<REVIEW_OUTPUT_PATH>` and the `.pi/plans/reviews/` directory before invoking the skills (record the file lists). Invoke the `refine-code` skill on the scratch target from Step 1. Capture its final user-facing output. Then invoke the `refine-plan` skill on the scratch plan file. Capture its final user-facing output. Restore the matrix immediately afterward: `cp ~/.pi/agent/model-tiers.json.bak ~/.pi/agent/model-tiers.json` and `rm ~/.pi/agent/model-tiers.json.bak`.

- [ ] **Step 3: Smoke 2 — default-matrix happy path** — With the original `~/.pi/agent/model-tiers.json` restored (where `crossProvider.standard` resolves to a `pi`-CLI provider), invoke `refine-code` on the scratch target from Step 1 and let it run to `STATUS: clean` or `STATUS: max_iterations_reached`. Then invoke `refine-plan` on the scratch plan file and let it run to `STATUS: approved` or `STATUS: issues_remaining`. Record the resulting review file paths.

- [ ] **Step 4: Smoke 3 — coordinator `subagent_run_serial` unavailable** — Bypass the skill's hard-stop and dispatch the coordinator directly into a session lacking `subagent_run_serial`. Concretely: from a `pi`-CLI parent session, invoke `subagent_run_serial { tasks: [{ name: "code-refiner-smoke", agent: "code-refiner", task: "<minimal valid filled refine-code-prompt.md targeting the scratch target>", model: "<a model whose dispatch is not pi, e.g., claude-sonnet-4-6>", cli: "claude" }] }`. Capture the `code-refiner`'s final response. Repeat with `agent: "plan-refiner"` and a minimal valid filled `refine-plan-prompt.md` targeting the scratch plan file. Capture the `plan-refiner`'s final response. List the relevant review-file directories before and after each invocation to confirm no review file was created.

- [ ] **Step 5: Smoke 4 — corrupted `**Reviewer:**` line validation failure** — Use the artifacts produced by Smoke 2 (Step 3). Make a working copy of the `refine-code` versioned file: `cp <REVIEW_OUTPUT_PATH>-v1.md /tmp/refine-code-corrupted.md`. Replace its first non-empty line so that it reads exactly `**Reviewer:** inline (claude-sonnet-4-6)` (preserving the rest of the file content below the blank line). Make a working copy of the `refine-plan` versioned file: `cp .pi/plans/reviews/<plan-basename>-plan-review-v1.md /tmp/refine-plan-corrupted.md` and apply the same first-line mutation. Manually apply `agent/skills/refine-code/SKILL.md` Step 6's validation procedure to `/tmp/refine-code-corrupted.md` (read the first non-empty line; check the regex; check the `inline` substring rule; record what error the procedure says the skill must surface). Manually apply `agent/skills/refine-plan/SKILL.md` Step 9.5's validation procedure to `/tmp/refine-plan-corrupted.md` and record the equivalent.

**Acceptance criteria:**

- Smoke 1 hard-stops both skills with the verbatim shared-file error message and zero subagent dispatches occur.
  Verify: confirm both skill invocations from Step 2 terminate with the exact substring `coordinator-dispatch: no model tier in [crossProvider.standard, standard, crossProvider.capable, capable] resolves to a pi CLI — coordinator cannot dispatch subagents.` in their final user-facing output (compare against the captured outputs from Step 2 using `grep -F`); AND confirm the directory listings recorded before/after each invocation in Step 2 are identical (no new `<REVIEW_OUTPUT_PATH>-v1.md` and no new `.pi/plans/reviews/<plan-basename>-plan-review-v1.md` were created during the smoke run); AND confirm that `~/.pi/agent/model-tiers.json` was restored to the pre-Step-2 contents (re-read the file and compare against the original).
- Smoke 2 completes a refine cycle for both skills and each persisted review file carries a valid `**Reviewer:**` provenance line whose `<cli>` field is `pi`.
  Verify: run `head -n 1 <REVIEW_OUTPUT_PATH>-v1.md` and confirm the output matches the regex `^\*\*Reviewer:\*\* [^/]+/[^ ]+ via pi$`; if `refine-code` reached `STATUS: clean`, run `head -n 1 <REVIEW_OUTPUT_PATH>.md` and confirm the same regex matches; run `head -n 1 .pi/plans/reviews/<plan-basename>-plan-review-v1.md` and confirm the same regex matches. For each of those `head -n 1` outputs, run `head -n 1 <path> | grep -i inline` and confirm zero matches (the `inline` substring is absent).
- Smoke 3 confirms each coordinator emits `STATUS: failed`, writes no review file, and does not improvise an inline review.
  Verify: read each captured coordinator response from Step 4 and confirm it contains the literal substring `STATUS: failed` and a reason referencing coordinator-tool unavailability such as `coordinator dispatch unavailable` (case-sensitive on `STATUS: failed`); confirm via the directory listings recorded before/after each Step 4 invocation that no new `<REVIEW_OUTPUT_PATH>-v<N>.md` and no new `.pi/plans/reviews/<plan-basename>-plan-review-v<N>.md` file appeared during the smoke run; AND save each coordinator response to a temp file (e.g., `/tmp/code-refiner-smoke3.txt`, `/tmp/plan-refiner-smoke3.txt`) and run `grep -niE '\binline\b' /tmp/code-refiner-smoke3.txt /tmp/plan-refiner-smoke3.txt`, confirming any matches occur only inside the rule's prohibition language (e.g., the response quoting "MUST NOT perform an inline review") and not as a fallback action the coordinator actually took.
- Smoke 4 surfaces a validation failure for both skills rather than silently reporting success.
  Verify: applying `agent/skills/refine-code/SKILL.md` Step 6 to `/tmp/refine-code-corrupted.md` MUST yield the validation error `refine-code: review provenance validation failed at /tmp/refine-code-corrupted.md: inline-substring forbidden — inline (claude-sonnet-4-6).` per the Step 6 error format and the `inline-substring forbidden` `<specific check>` label (record the surfaced error verbatim and confirm it matches that template); applying `agent/skills/refine-plan/SKILL.md` Step 9.5 to `/tmp/refine-plan-corrupted.md` MUST set `STATUS = failed` with reason `review provenance validation failed at /tmp/refine-plan-corrupted.md: inline-substring forbidden` per the Step 9.5 contract; in both cases confirm the procedure does NOT report `STATUS: clean`, `STATUS: max_iterations_reached`, `STATUS: approved`, or `STATUS: issues_remaining` for the corrupted file.

**Model recommendation:** capable

## Dependencies

- Task 2 depends on: Task 1 (Step 1's reference to `agent/skills/_shared/coordinator-dispatch.md` requires the shared file to exist for runtime correctness; static editing order does not strictly require it but Task 8 verifies that the relative link resolves to a real file).
- Task 3 depends on: Task 1 (same reason as Task 2).
- Task 4 depends on: none (modifies only `refine-code-prompt.md`).
- Task 5 depends on: none (modifies only `refine-plan-prompt.md`).
- Task 6 depends on: none (modifies only `code-refiner.md`).
- Task 7 depends on: none (modifies only `plan-refiner.md`).
- Task 8 depends on: Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7 (the read-only consistency review reads all modified files end-to-end and verifies the cross-references resolve).
- Task 9 depends on: Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7, Task 8 (the manual smoke runs exercise the live skills, prompts, and agent identities; Task 8's static consistency review must pass first so any failure in Task 9 is attributable to runtime behavior rather than to file-level inconsistency).

## Risk Assessment

- **Risk: Step renumbering in either SKILL file breaks downstream cross-references.** Mitigation: refine-code/SKILL.md inserts a new Step 6 *after* Step 5, leaving Steps 1–5 byte-identical in their headings; refine-plan/SKILL.md inserts a new Step 9.5 between Step 9 and Step 10, again leaving the existing numbered-step headings byte-identical. No downstream cross-reference inside the same file points to a step number that gets renumbered. Task 8 Step 1 and Step 3 trace each skill end-to-end to confirm.
- **Risk: The shared file's verbatim error messages drift from the spec's exact wording.** Mitigation: Task 1 Step 5 specifies both error messages as block-quoted exact strings, and Task 1 acceptance criteria use `grep -F` (fixed-string) on both messages to confirm verbatim match. Any drift surfaces as an acceptance failure during verification.
- **Risk: The validation regex over-restricts legal model strings.** The provider/model token regex `[^/]+/[^ ]+` allows model names with hyphens, dots, and digits but disallows whitespace and stray slashes; the cli regex `[a-zA-Z0-9_-]+` allows the existing dispatch values (`pi`, `claude`) and reasonable future additions. If a future provider introduces a slash-bearing model name (e.g., a path-style name), the validation would reject it — the spec explicitly contemplates this in its Open Questions and accepts that the validation contract changes when the dispatch contract changes.
- **Risk: Coordinator forgets to re-stamp on overwrite.** The protocol in `refine-code-prompt.md` Iteration 2..N step 6 and `refine-plan-prompt.md` Per-Iteration step 6 both explicitly say "Re-stamp" / "re-stamp" on overwrite. Skill-side validation in Task 2 / Task 3 catches missing or stale stamps because the validator re-resolves the documented reviewer tiers from the *current* `model-tiers.json` snapshot at validation time, so a stale stamp from a prior iteration would mismatch only if the matrix changed mid-run (a separate operational hazard that the spec explicitly excludes from validation scope: "Existing review files on disk written before this spec lands are not retroactively validated").
- **Risk: Worker-reviewer fallback chain changes after this plan lands and the validation contract drifts.** Spec Open Questions explicitly contemplate this: "If a future change adds a worker-reviewer fallback chain, the validation contract must accept any tier in that chain." The validation steps in Task 2 and Task 3 enumerate the documented tiers (`crossProvider.capable` / `standard` for refine-code; `crossProvider.capable` / `capable` for refine-plan) and explicitly call out which prompt file documents the worker-reviewer fallback chain — so a future change to the prompt file must update the validation contract too.
- **Risk: `_shared` directory convention conflicts with skill loader.** The skill loader treats directories under `agent/skills/` as skills only when they contain a `SKILL.md` file with valid frontmatter. The new `agent/skills/_shared/` directory contains only `coordinator-dispatch.md` (no `SKILL.md`, no frontmatter), so the loader will not treat it as a skill. The leading underscore in `_shared` further signals "non-skill helper" by convention. Task 1 Step 2 explicitly forbids YAML frontmatter in the shared file.
- **Risk: Manual smoke runs are required end-to-end checks and cannot be automated.** Spec's Non-Goals explicitly excludes "Building automated end-to-end tests for the refine-code or refine-plan workflows; smoke tests are manual, consistent with the rest of the skill suite." Task 8 covers the static consistency check; Task 9 gates execution on the four required manual smoke runs (no-`pi`-tier hard-stop, default-matrix happy path, `subagent_run_serial`-unavailable failure, mutated-stamp validation failure) with concrete `Verify:` recipes for each. The smoke runs cost real model calls and require temporary mutation of `~/.pi/agent/model-tiers.json` (with backup/restore) and direct `subagent_run_serial` invocation against `claude` cli; the executor must allocate time and budget for that work and must NOT skip Task 9 on the grounds that the static checks in Task 8 already passed.
