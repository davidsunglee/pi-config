# Stable Integration-Test Identifiers in execute-plan

**Source:** TODO-88ba80a5
**Spec:** .pi/specs/2026-05-01-stable-integration-test-identifiers.md

## Goal

Make `execute-plan`'s integration-test reconciliation simple and reliable by tightening the failing-test identifier contract end-to-end and replacing the current three-set (`baseline_failures`, `deferred_integration_regressions`, `new_regressions_after_deferment`) deferred-regression model with a baseline-only model. The new model freezes a stable-identifier baseline once before the first wave, separates non-reconcilable failures (no stable suite-native identifier available) from comparable failures in every test-runner artifact, lets intermediate waves continue past current failures by explicit user choice without persisting any deferred state, and blocks final completion until current non-baseline stable failures and non-reconcilable failures are both empty.

## Architecture summary

The change touches only Markdown skill/agent definitions and prompt templates. Five files coordinate as a single contract:

- `agent/agents/test-runner.md` owns the runner-side identifier-extraction rules and the on-disk artifact format. It gains a second bucket (`NON_RECONCILABLE_FAILURES:` block) alongside `FAILING_IDENTIFIERS:` so unnamed failures never pollute the comparable set, and it forbids the raw-line fallback as a comparable identifier.
- `agent/skills/execute-plan/test-runner-prompt.md` is the task prompt the orchestrator sends to `test-runner`. It must instruct the runner to follow the new contract verbatim and stop using "raw-line fallback for un-named failures".
- `agent/skills/execute-plan/integration-regression-model.md` is the canonical reconciliation document. It is rewritten to define a baseline-only model: a frozen `baseline_failures` set and per-run-recomputed `current_failing_stable`, `current_non_reconcilable`, and `current_non_baseline_stable := current_failing_stable \ baseline_failures`. No deferred set is persisted across waves. It also adds worked examples for Go / pytest / cargo / Jest+Vitest plus crash/collection-failure cases.
- `agent/skills/execute-plan/SKILL.md` (Step 7, Step 12 with Debugger-first flow, Step 14, Step 16) consumes the new artifact fields and the new model. Step 7 freezes baseline from the stable bucket only and presents an explicit stop/continue decision when the baseline has non-reconcilable failures. Step 12 replaces the post-wave intermediate menu with `(d)/(c)/(x)` and the final-wave menu with `(d)/(x)` — `(c) Continue despite failures` does not mutate `baseline_failures` or persist any deferred state. Step 16's final gate gates on `current_non_baseline_stable ∪ current_non_reconcilable` and offers only `(d)/(x)`. The Debugger-first flow drops every reference to deferred sets and uses `current_non_baseline_stable ∪ current_non_reconcilable` as both the scope and the success criterion.
- `agent/skills/execute-plan/README.md` summarizes the new model in 2–3 sentences, replacing the three-set summary.

The artifact format change is the only data-shape change. The existing `FAILING_IDENTIFIERS:` block keeps its name and shape (it is the comparable stable-identifier set by definition). A new sibling block — `NON_RECONCILABLE_COUNT:` / `NON_RECONCILABLE_FAILURES:` / `END_NON_RECONCILABLE_FAILURES` — is appended after `END_FAILING_IDENTIFIERS` and before `--- RAW RUN OUTPUT BELOW ---`. The orchestrator's header-parse check (Step 7's "Header-parse check") is updated to require the new fields in order. No backward-compat aliasing is needed; this is internal tooling and the contract changes atomically.

## Tech stack

- Markdown skill, agent, and prompt-template files under `agent/skills/execute-plan/` and `agent/agents/`.
- The `test-runner` subagent (`agent/agents/test-runner.md`) is the only producer of the artifact; the `execute-plan` skill is the only consumer.
- TypeScript test suite at `agent/extensions/` runs via `npm test --prefix agent`. Markdown-only changes will not affect it; running it confirms no TypeScript sources were touched accidentally.
- `grep -nF` and shell text inspection are the audit tools — no new linters or CI checks are introduced.

## File Structure

- `agent/skills/execute-plan/integration-regression-model.md` (Modify) — Replace the three-set model with the baseline-only model. Define `baseline_failures` (frozen), per-run `current_failing_stable`, `current_non_reconcilable`, and `current_non_baseline_stable`. State the byte-for-byte set comparison rules, the disjointness rule (non-reconcilable never participates in set arithmetic), the pass/fail classification for post-wave and final gate, the new user-facing summary format with three sections (Baseline failures, Current non-baseline failures, Current non-reconcilable failures), and add a worked-examples appendix for Go / pytest / cargo test / Jest / Vitest, plus crash / collection-failure cases.
- `agent/agents/test-runner.md` (Modify) — Update the identifier-extraction contract: forbid the raw-line fallback as a comparable identifier, define non-reconcilable failures as a separate bucket, and tighten the per-runner identifier rules so identifiers are always suite-native and verbatim. Update the artifact format to add the `NON_RECONCILABLE_COUNT:` / `NON_RECONCILABLE_FAILURES:` / `END_NON_RECONCILABLE_FAILURES` block immediately after `END_FAILING_IDENTIFIERS`. Update the frontmatter `description` so it does not promise a "raw-line fallback".
- `agent/skills/execute-plan/test-runner-prompt.md` (Modify) — Replace the sentence that tells the runner to use "raw-line fallback for un-named failures" with the new rule pointing the runner at the agent-defined contract; mention the non-reconcilable bucket explicitly so the prompt cannot drift.
- `agent/skills/execute-plan/SKILL.md` (Modify) — Five coordinated section edits in one task:
  1. Step 7 "Baseline test capture" — update the artifact-readback Header-parse check to require the new non-reconcilable headers; freeze `baseline_failures` from `FAILING_IDENTIFIERS:` only; add a stop/continue decision when `NON_RECONCILABLE_COUNT > 0` at baseline; replace the cross-reference to the three-set model with a cross-reference to the baseline-only model.
  2. Step 12 "Post-wave commit and integration tests" — replace the three-set reconciliation prose with the baseline-only computation; replace the intermediate-wave menu with `(d) Debug failures now / (c) Continue despite failures / (x) Stop plan execution`; replace the final-wave menu with `(d) Debug failures now / (x) Stop plan execution`; spell out that `(c) Continue despite failures` does not mutate `baseline_failures` and persists no state.
  3. Step 12 Debugger-first flow — drop the deferred-set reference in the `Scope`, `Success condition`, and `Suspect task universe` parameter rows; replace with `current_non_baseline_stable ∪ current_non_reconcilable`; remove the "Cleared deferred regressions" reporting line.
  4. Step 14 "Report partial progress" — remove the "Deferred integration regressions (unresolved)" heading and its body; replace with reporting of the most recent run's non-baseline stable failures and non-reconcilable failures (when present).
  5. Step 16 "Final integration regression gate (precondition)" — drop `still_failing_deferred`; gate on `current_non_baseline_stable ∪ current_non_reconcilable`; replace the final-gate menu with `(d) Debug failures now / (x) Stop execution`; update the trailing note to refer to "non-baseline or non-reconcilable failures".
- `agent/skills/execute-plan/README.md` (Modify) — Replace the "## Integration regression model" three-bullet summary with a 2–3 sentence baseline-only summary that names the same artifact and skill files.

## Tasks

### Task 1: Rewrite `integration-regression-model.md` for the baseline-only model

**Files:**

- Modify: `agent/skills/execute-plan/integration-regression-model.md`

**Steps:**

- [ ] **Step 1: Read the current file end-to-end** so the rewrite preserves no stale prose. Note in particular: the three-set definition block (the `## The three tracked sets` section), the disjointness rules, the reconciliation algorithm, the pass/fail classification, and the user-facing summary format. The rewrite replaces all of these — do not leave any sentence that mentions `deferred_integration_regressions`, `new_regressions_after_deferment`, `still_failing_deferred`, or `cleared_deferred`.

- [ ] **Step 2: Replace the file body with a fresh structure under the existing top-level `# Integration regression model` heading.** Keep the file's role identical (single canonical definition referenced by Step 7, Step 12, Step 16) but rewrite the body in this exact section order: `## Identifier contract`, `## Tracked state`, `## Per-run inputs and reconciliation`, `## Pass/fail classification`, `## User-facing summary format`, `## Worked examples`. Do not introduce any other top-level or `##` sections. Keep the document under ~250 lines so SKILL.md's soft length constraint is not undermined.

- [ ] **Step 3: Write the `## Identifier contract` section.** State that a stable identifier is the suite-native unique name for a single failing test, taken verbatim from the runner output (no normalization, no lowercasing, no reordering, no synthesis). State that any failure for which no stable suite-native identifier is available is a non-reconcilable failure and is recorded separately under the `NON_RECONCILABLE_FAILURES:` block of the test-runner artifact. Cross-reference `agent/agents/test-runner.md` for the per-runner extraction rules. Explicitly forbid raw-line fallback as a comparable identifier. State that all consumers (Step 7, Step 12, the Debugger-first re-test, Step 16) compare stable identifiers byte-for-byte and never apply a normalization step.

- [ ] **Step 4: Write the `## Tracked state` section.** Define exactly one tracked set: `baseline_failures` — the set of stable identifiers captured by the baseline run, frozen at the end of Step 7 and never mutated thereafter. Explicitly state: this is the ONLY persistent set across waves; there is no persistent set of "regressions to defer" and no persistent set of "regressions discovered after deferment", and no persistent non-reconcilable state. Each later integration run is judged solely by comparing that run's artifact against `baseline_failures`. Choosing `(c) Continue despite failures` on an intermediate wave does NOT mutate `baseline_failures` and does NOT persist any other identifier set across waves. Constraint: do NOT use the identifier names `deferred_integration_regressions`, `new_regressions_after_deferment`, `still_failing_deferred`, or `cleared_deferred` anywhere in the rewritten document — describe the absence in plain English (e.g. "no persistent set of deferred regressions") so the document's grep-based audit (acceptance criterion below) passes.

- [ ] **Step 5: Write the `## Per-run inputs and reconciliation` section.** Define three values that are recomputed from each run's artifact and discarded after the run is classified: `current_failing_stable` := the contents of `FAILING_IDENTIFIERS:`; `current_non_reconcilable` := the contents of `NON_RECONCILABLE_FAILURES:` (treated as an opaque list of evidence entries, never used as set members for comparison); `current_non_baseline_stable` := `current_failing_stable \ baseline_failures` (set difference, byte-for-byte). State that `current_non_reconcilable` is never compared, intersected, or subtracted against any other set — its only role is to gate the menu. Provide a one-paragraph rationale that comparing non-reconcilable evidence by raw-line equality is unreliable and would re-introduce the failure mode this work fixes.

- [ ] **Step 6: Write the `## Pass/fail classification` section.** State exactly two outcomes:
  - **Post-wave (Step 12)**: pass when `current_non_baseline_stable` is empty AND `current_non_reconcilable` is empty; fail otherwise. On fail, present the intermediate-wave menu `(d) Debug failures now / (c) Continue despite failures / (x) Stop plan execution` for waves before the final wave, or the final-wave menu `(d) Debug failures now / (x) Stop plan execution` for the final wave.
  - **Final gate (Step 16)**: pass when `current_non_baseline_stable` is empty AND `current_non_reconcilable` is empty; fail otherwise. On fail, present the menu `(d) Debug failures now / (x) Stop execution`. There is no "still failing deferred" component.
  Spell out that `current_non_reconcilable` non-emptiness alone is sufficient to fail (i.e., a run with zero stable failures but a non-reconcilable failure still fails), and that this matches the spec's gate-blocking rule.

- [ ] **Step 7: Write the `## User-facing summary format` section.** Define exactly two user-facing shapes:
  - **Fully clean** — when `current_failing_stable`, `current_non_reconcilable`, and `baseline_failures ∩ current_failing_stable` are all empty. Render: `✅ Integration tests pass after wave <N> (no failures).` Do not render the three-section block.
  - **Not fully clean** — render the three-section block, in this order, with these exact section headings:
    ~~~
    ### Baseline failures
    <list of stable identifiers in baseline_failures ∩ current_failing_stable, or `(none)` if empty>

    ### Current non-baseline failures
    <list of stable identifiers in current_non_baseline_stable, or `(none)` if empty>

    ### Current non-reconcilable failures
    <list of evidence entries from current_non_reconcilable, or `(none)` if empty>
    ~~~
    The header line above the block is `✅ Integration tests pass after wave <N> (no new failures; baseline failures remain — see below).` on the pass path (i.e., both non-baseline and non-reconcilable are empty but baseline is non-empty), `❌ Integration tests failed after wave <N>.` on the fail path, and the same wording adapted for `final-gate` on Step 16. State that empty sections render as `(none)` (one line, literal `(none)`), and that the section headings MUST be the exact strings `Baseline failures`, `Current non-baseline failures`, and `Current non-reconcilable failures`.

- [ ] **Step 8: Write the `## Worked examples` section.** Provide one short subsection for each of the five expected runner shapes, with a 2–4 line failure-output excerpt and the resulting `FAILING_IDENTIFIERS:` and `NON_RECONCILABLE_FAILURES:` content:
  - `### Go (`go test ./...`)` — Show a `--- FAIL: TestFoo (0.01s)` line plus the trailing `FAIL\t<package>\t0.012s` summary; the identifier is `<package>.TestFoo` taken verbatim, with the package portion exactly as the runner prints it. `NON_RECONCILABLE_FAILURES:` is empty.
  - `### pytest` — Show a `FAILED tests/test_foo.py::TestX::test_bar - AssertionError` line; the identifier is `tests/test_foo.py::TestX::test_bar` (the pytest nodeid).
  - `### cargo test` — Show a `failures:` block listing `tests::name_of_test`; the identifier is `tests::name_of_test` taken verbatim.
  - `### Jest / Vitest` — Show a `FAIL src/foo.test.ts` summary plus a nested `> describe block > it should X` test name; the identifier is `src/foo.test.ts > describe block > it should X` joined exactly as the runner prints it.
  - `### Crash / collection-failure (no stable identifier)` — Show two example failure shapes: (a) a `panic: runtime error: ...` block emitted before any test-name line in `go test`, and (b) a pytest collection error of the form `ERROR tests/test_x.py - <stack>`. State that both are recorded as one entry each in `NON_RECONCILABLE_FAILURES:` (verbatim multi-line evidence permitted) and that `FAILING_IDENTIFIERS:` does NOT include any synthesized or raw-line fallback identifier for them. State that the orchestrator therefore presents the user with the menu defined in `## Pass/fail classification` for the appropriate phase rather than treating the failures as comparable to baseline.

- [ ] **Step 9: Re-read the final document end-to-end** and confirm it contains zero references to `deferred_integration_regressions`, `new_regressions_after_deferment`, `still_failing_deferred`, `cleared_deferred`, "raw-line fallback", "Defer integration debugging", or "Cleared deferred regressions". If any remain, remove them.

**Acceptance criteria:**

- The file is the single canonical baseline-only definition: `baseline_failures` is the only persistent tracked set, and no deferred-regression set is defined or referenced.
  Verify: run `grep -nE 'deferred_integration_regressions|new_regressions_after_deferment|still_failing_deferred|cleared_deferred' agent/skills/execute-plan/integration-regression-model.md` and confirm exit code 1 (no matches).
- The file forbids raw-line fallback for comparable identifiers and defines a separate non-reconcilable bucket.
  Verify: run `grep -nF 'raw-line fallback' agent/skills/execute-plan/integration-regression-model.md` and confirm exit code 1 (no matches), and run `grep -nF 'NON_RECONCILABLE_FAILURES' agent/skills/execute-plan/integration-regression-model.md` and confirm at least one match.
- The file has the six required `##` sections in order: `## Identifier contract`, `## Tracked state`, `## Per-run inputs and reconciliation`, `## Pass/fail classification`, `## User-facing summary format`, `## Worked examples`.
  Verify: run `grep -nE '^## ' agent/skills/execute-plan/integration-regression-model.md` and confirm the output lists exactly those six headings in the listed order, with no other `## ` headings.
- The `## Pass/fail classification` section names both the post-wave intermediate menu `(d) / (c) / (x)` and the final menu `(d) / (x)` and explicitly states that non-reconcilable non-emptiness alone fails the gate.
  Verify: open `agent/skills/execute-plan/integration-regression-model.md`, find the `## Pass/fail classification` section, and confirm the section body contains the literal substrings `(d) Debug failures now`, `(c) Continue despite failures`, `(x) Stop plan execution`, `(x) Stop execution`, and a sentence stating that a non-empty `current_non_reconcilable` alone is sufficient to fail the gate.
- The `## User-facing summary format` section uses the exact section headings `Baseline failures`, `Current non-baseline failures`, `Current non-reconcilable failures`.
  Verify: run `grep -nF '### Baseline failures' agent/skills/execute-plan/integration-regression-model.md`, `grep -nF '### Current non-baseline failures' agent/skills/execute-plan/integration-regression-model.md`, and `grep -nF '### Current non-reconcilable failures' agent/skills/execute-plan/integration-regression-model.md` and confirm each returns exactly one match.
- The `## Worked examples` section covers Go, pytest, cargo test, Jest / Vitest, and a crash/collection-failure case.
  Verify: open `agent/skills/execute-plan/integration-regression-model.md`, find the `## Worked examples` section, and confirm it contains five `### ` subsections naming Go, pytest, cargo test, Jest / Vitest, and crash / collection-failure (in any order); confirm the crash / collection-failure subsection states that the failure goes into `NON_RECONCILABLE_FAILURES:` and NOT into `FAILING_IDENTIFIERS:`.

**Model recommendation:** standard

---

### Task 2: Update `test-runner.md` to require stable identifiers and a non-reconcilable bucket

**Files:**

- Modify: `agent/agents/test-runner.md`

**Steps:**

- [ ] **Step 1: Update the frontmatter `description` field.** Replace the current description (which says the runner extracts failing-test identifiers per the Step 7 contract) with one that names the new dual-bucket contract: extracts stable suite-native identifiers AND records non-reconcilable failures separately. Keep the rest of the frontmatter (`tools`, `thinking`, `session-mode`, `system-prompt`, `spawning`, `auto-exit`) unchanged. Constraint: the YAML frontmatter must remain the very first content in the file, between `---` delimiters, with no blank lines or other content before the opening `---`.

- [ ] **Step 2: Update the opening paragraph (after the frontmatter and the `# ` heading-equivalent first paragraph) so it lists both buckets.** The runner is responsible for: (1) running the supplied command, (2) extracting **stable** failing-test identifiers per the contract, (3) recording **non-reconcilable** failures separately for any failures with no stable identifier, (4) writing the artifact, and (5) emitting the `TEST_RESULT_ARTIFACT` marker. Update the "NOT responsible for" list to additionally exclude classifying failures as "baseline" / "regression" / "deferred" — the runner does no set arithmetic at all. Remove the explicit `deferred_integration_regressions` reference from this paragraph; replace with `baseline_failures` and "any cross-wave state" as the things the runner does not consult.

- [ ] **Step 3: Update the `### Identifier-Extraction Contract` section.** Replace the existing extraction rules with this updated set:
  1. The contract defines two buckets: a **stable identifier** bucket (recorded under `FAILING_IDENTIFIERS:`) and a **non-reconcilable failure** bucket (recorded under `NON_RECONCILABLE_FAILURES:`).
  2. A stable identifier is the suite-native unique name for a single failing test, taken verbatim from the runner output. Strip surrounding whitespace; apply NO other transformation — no lowercasing, no reordering, no normalization, no synthesis. Per-runner expectations:
     - `go test ./...` — `<package>.<TestName>` or `<package>/<TestName>` exactly as printed on `--- FAIL:` lines.
     - `pytest` — the nodeid (e.g. `tests/test_foo.py::test_bar` or `tests/test_foo.py::TestX::test_bar`).
     - `cargo test` — the fully qualified test path printed on `test <path> ... FAILED` or in the trailing `failures:` block.
     - `npm test` / Jest / Vitest — the file path plus nested suite/test name as printed by the runner (e.g. `src/foo.test.ts > describe > it`).
     - Other runners — the runner's own unique per-test identifier, verbatim, with no synthesis or normalization.
     The resulting collection is a deduplicated set.
  3. **Route unnamed failures to the non-reconcilable bucket.** If a particular failure has no stable per-test identifier (e.g. a panic / segfault before a test name is printed, a build error, a pytest collection error, a Cargo compile failure), do NOT record it under `FAILING_IDENTIFIERS:` and do NOT record any raw output line as a stable identifier. Record it instead as one entry in the non-reconcilable bucket. Each entry SHOULD be a short verbatim excerpt from the run output that names the failure (e.g. the panic / error line plus a few following lines of stack), preserved byte-for-byte. The orchestrator never compares non-reconcilable entries by string equality; their only purpose is user-visible evidence and to gate the menu.
  4. **Counting.** `FAILING_IDENTIFIERS_COUNT` is the size of the stable-identifier set. The non-reconcilable count (whose header label is defined in `## Artifact Format`) is the count of distinct non-reconcilable failure events the runner could identify (one entry each); when the runner cannot enumerate distinct events but knows at least one such failure occurred (e.g. exit code != 0 with no stable identifier extractable), record exactly one composite entry naming the failure mode. Both counts may be 0; both may be non-zero in the same run. When `EXIT_CODE == 0`, both counts MUST be 0 (no failures of any kind).

- [ ] **Step 4: Update the `## Artifact Format` section.** Replace the existing format block with the extended format that adds the non-reconcilable block immediately after `END_FAILING_IDENTIFIERS` and before `--- RAW RUN OUTPUT BELOW ---`:
  ~~~
  PHASE: <phase label, e.g. baseline | wave-2-attempt-1 | final-gate-3>
  COMMAND: <exact test command string supplied in ## Test Command>
  WORKING_DIRECTORY: <absolute working directory supplied in ## Working Directory>
  EXIT_CODE: <integer exit code>
  TIMESTAMP: <ISO-8601 UTC timestamp captured at run start, e.g. 2026-04-30T18:42:11Z>
  FAILING_IDENTIFIERS_COUNT: <integer N>
  FAILING_IDENTIFIERS:
  <stable identifier 1>
  <stable identifier 2>
  ...
  <stable identifier N>
  END_FAILING_IDENTIFIERS
  NON_RECONCILABLE_COUNT: <integer M>
  NON_RECONCILABLE_FAILURES:
  <evidence entry 1 — verbatim excerpt; may span multiple lines>
  <evidence entry 2 — verbatim excerpt; may span multiple lines>
  ...
  <evidence entry M>
  END_NON_RECONCILABLE_FAILURES

  --- RAW RUN OUTPUT BELOW ---
  <full combined stdout+stderr captured from the run, byte-for-byte, no truncation>
  ~~~
  Update the format constraints list:
  - The first non-empty line MUST be `PHASE: ...`.
  - The header fields `PHASE`, `COMMAND`, `WORKING_DIRECTORY`, `EXIT_CODE`, `TIMESTAMP`, `FAILING_IDENTIFIERS_COUNT`, `FAILING_IDENTIFIERS:`, `END_FAILING_IDENTIFIERS`, `NON_RECONCILABLE_COUNT`, `NON_RECONCILABLE_FAILURES:`, `END_NON_RECONCILABLE_FAILURES` MUST appear in this exact order, each header label on its own line.
  - Each stable identifier MUST appear on its own line between `FAILING_IDENTIFIERS:` and `END_FAILING_IDENTIFIERS`. If `FAILING_IDENTIFIERS_COUNT` is `0`, no lines appear between the markers.
  - Each non-reconcilable evidence entry MUST be separated from the next by a single blank line; the first entry begins on the line immediately after `NON_RECONCILABLE_FAILURES:`. Multi-line entries are permitted (e.g. a panic stack trace). If `NON_RECONCILABLE_COUNT` is `0`, no lines appear between `NON_RECONCILABLE_FAILURES:` and `END_NON_RECONCILABLE_FAILURES`.
  - The marker line `--- RAW RUN OUTPUT BELOW ---` separates the structured header (now including the non-reconcilable block) from the raw run output, which is appended verbatim with no truncation.
  - Do NOT truncate the raw output in the artifact; truncation rules for caller-side reading remain the caller's responsibility.

- [ ] **Step 5: Update the `## Rules` section** to mention both buckets where the rules currently mention `FAILING_IDENTIFIERS`. Specifically: keep the rules about running the command verbatim, the working directory, the single artifact write, the no-`git` / no-source-modification rule, and the `TEST_RESULT_ARTIFACT` marker rule. Add a rule line: "Record stable identifiers in `FAILING_IDENTIFIERS:` and non-reconcilable failures in `NON_RECONCILABLE_FAILURES:` per the contract above. Never record a raw line as a stable identifier." Update the existing rule about `deferred_integration_regressions` so it reads: "Do NOT consult or mention `baseline_failures`, prior runs, or any cross-wave state."

- [ ] **Step 6: Re-read the file end-to-end** and confirm there are no remaining references to "raw-line fallback" or to the runner inserting raw lines into the comparable identifier set. If any remain, remove them.

**Acceptance criteria:**

- The artifact format includes both the existing `FAILING_IDENTIFIERS:` block and a new `NON_RECONCILABLE_FAILURES:` block in the documented order.
  Verify: run `grep -nF 'NON_RECONCILABLE_COUNT' agent/agents/test-runner.md`, `grep -nF 'NON_RECONCILABLE_FAILURES:' agent/agents/test-runner.md`, and `grep -nF 'END_NON_RECONCILABLE_FAILURES' agent/agents/test-runner.md` and confirm each returns at least two matches (one in the format block, at least one in the constraints / rules prose). Also open `agent/agents/test-runner.md`, locate the fenced artifact-format block in the `## Artifact Format` section, and confirm that within that block the `END_FAILING_IDENTIFIERS` line appears on a lower line number than the `NON_RECONCILABLE_COUNT:` line (i.e., the new block appears immediately after the existing one in the format spec).
- The identifier-extraction contract forbids raw-line fallback as a comparable identifier.
  Verify: run `grep -nF 'raw-line fallback' agent/agents/test-runner.md` and confirm exit code 1 (no matches). Also open `agent/agents/test-runner.md`, find the `### Identifier-Extraction Contract` section, and confirm it contains a sentence forbidding raw-line fallback for stable identifiers and routing such failures to `NON_RECONCILABLE_FAILURES:` instead.
- The agent's per-runner identifier expectations cover Go, pytest, cargo test, and Jest / Vitest verbatim.
  Verify: open `agent/agents/test-runner.md`, find the `### Identifier-Extraction Contract` section, and confirm it lists per-runner rules for `go test`, `pytest`, `cargo test`, and `npm test` / Jest / Vitest, each stating "verbatim" / "no normalization".
- The frontmatter remains valid YAML and is the very first content of the file.
  Verify: open `agent/agents/test-runner.md` and confirm the very first line is `---`, the next several lines are YAML key/value pairs (`name`, `description`, `tools`, `thinking`, `session-mode`, `system-prompt`, `spawning`, `auto-exit`), the closing `---` follows them, and there is no blank line, comment, or text before the opening `---`.
- The agent's "NOT responsible for" list and `## Rules` section reference `baseline_failures` (the only persisted set) and explicitly do not reference `deferred_integration_regressions`.
  Verify: run `grep -nF 'deferred_integration_regressions' agent/agents/test-runner.md` and confirm exit code 1 (no matches).

**Model recommendation:** standard

---

### Task 3: Update `test-runner-prompt.md` to match the agent contract

**Files:**

- Modify: `agent/skills/execute-plan/test-runner-prompt.md`

**Steps:**

- [ ] **Step 1: Update the `## Task` section** so it no longer instructs the runner to use a raw-line fallback. Replace the sentence currently reading "Use the suite-native unique per-test identifier verbatim, no normalization, raw-line fallback for un-named failures, deduplicated set." with an instruction that points at the agent definition's two-bucket contract: "Use the suite-native unique per-test identifier verbatim — no normalization, no synthesis. For any failure with no stable suite-native identifier (e.g. a crash before test names, a build / collection error), record the failure under `NON_RECONCILABLE_FAILURES:` per the contract in your agent definition rather than inventing an identifier." Keep the rest of the section (the run-the-command-verbatim and write-the-artifact instructions) unchanged.

- [ ] **Step 2: Update the artifact-format reference sentence** so it names both buckets. Replace the existing "Write the artifact exactly once to the path in `## Artifact Output Path` using the format documented in your agent definition (`## Artifact Format`), with the value from `## Phase Label` filled into the `PHASE:` header line." with: "Write the artifact exactly once to the path in `## Artifact Output Path` using the format documented in your agent definition (`## Artifact Format`) — including BOTH the `FAILING_IDENTIFIERS:` block (stable identifiers) and the `NON_RECONCILABLE_FAILURES:` block (non-reconcilable evidence) in the documented order, with the value from `## Phase Label` filled into the `PHASE:` header line."

- [ ] **Step 3: Update the `## Rules` section** to keep all existing rules but tighten the "no cross-wave state" rule. Replace `Do NOT consult or mention baseline_failures, deferred_integration_regressions, prior runs, or any cross-wave state.` with `Do NOT consult or mention baseline_failures, prior runs, or any cross-wave state.` Add a rule line: `Record any failure that has no stable suite-native identifier under NON_RECONCILABLE_FAILURES per the contract — never as a raw line in FAILING_IDENTIFIERS.`

- [ ] **Step 4: Re-read the file end-to-end** and confirm it contains no remaining instructions to use raw-line fallback or to insert raw lines into the comparable identifier set.

**Acceptance criteria:**

- The prompt no longer instructs the runner to use raw-line fallback for unnamed failures.
  Verify: run `grep -nF 'raw-line fallback' agent/skills/execute-plan/test-runner-prompt.md` and confirm exit code 1 (no matches), and run `grep -nF 'raw-line' agent/skills/execute-plan/test-runner-prompt.md` and confirm exit code 1 (no matches).
- The prompt names the non-reconcilable bucket and the stable bucket explicitly.
  Verify: run `grep -nF 'NON_RECONCILABLE_FAILURES' agent/skills/execute-plan/test-runner-prompt.md` and confirm at least two matches (one in `## Task`, one in either `## Rules` or the artifact-format reference). Also run `grep -nF 'FAILING_IDENTIFIERS' agent/skills/execute-plan/test-runner-prompt.md` and confirm at least two matches.
- The prompt no longer mentions `deferred_integration_regressions`.
  Verify: run `grep -nF 'deferred_integration_regressions' agent/skills/execute-plan/test-runner-prompt.md` and confirm exit code 1 (no matches).

**Model recommendation:** cheap

---

### Task 4: Update `SKILL.md` Step 7, Step 12, Debugger-first flow, Step 14, and Step 16 for the baseline-only model

**Files:**

- Modify: `agent/skills/execute-plan/SKILL.md`

**Steps:**

- [ ] **Step 1: Update Step 7's Header-parse check (currently item 4 of Artifact readback at line ~298).** Replace the list of required header fields with the extended list including the new non-reconcilable block. The new header check requires: `PHASE`, `COMMAND`, `WORKING_DIRECTORY`, `EXIT_CODE`, `TIMESTAMP`, `FAILING_IDENTIFIERS_COUNT`, `FAILING_IDENTIFIERS:`, `END_FAILING_IDENTIFIERS`, `NON_RECONCILABLE_COUNT`, `NON_RECONCILABLE_FAILURES:`, and `END_NON_RECONCILABLE_FAILURES` in this exact order, followed by `--- RAW RUN OUTPUT BELOW ---`. Stop reason wording stays `test-runner artifact header malformed at <path>: <specific check>`.

- [ ] **Step 2: Update Step 7's "Reading the failing-identifier set" sentence (currently at line ~302).** Replace it with: "**Reading run results.** On all checks passing, parse the lines between `FAILING_IDENTIFIERS:` and `END_FAILING_IDENTIFIERS` as the run's stable failing-identifier set; parse the entries between `NON_RECONCILABLE_FAILURES:` and `END_NON_RECONCILABLE_FAILURES` (separated by single blank lines, multi-line entries permitted) as the run's non-reconcilable failure list; and read `EXIT_CODE`. These are the inputs Step 7 baseline classification, Step 12 post-wave reconciliation, the Debugger-first re-test, and Step 16 final-gate reconciliation consume. The integration regression model in `integration-regression-model.md` defines how each consumer applies them."

- [ ] **Step 3: Replace Step 7's "Baseline recording" subsection (currently lines ~258–271).** Write a new subsection that classifies the baseline by both `EXIT_CODE` and the two artifact buckets:
  - **If `EXIT_CODE == 0`** (and both counts are 0 by contract): record `baseline_failures := ∅` and proceed.
  - **If `EXIT_CODE != 0` AND `NON_RECONCILABLE_COUNT == 0`**: read the stable identifier set from `FAILING_IDENTIFIERS:` and record `baseline_failures` as that set (frozen). Warn: "⚠️ Baseline: N tests already failing before execution. Only failures with stable identifiers not in this baseline will be flagged after each wave." Proceed.
  - **If `EXIT_CODE != 0` AND `NON_RECONCILABLE_COUNT != 0`**: the baseline contains failures with no stable identifier. Record `baseline_failures` from `FAILING_IDENTIFIERS:` (which may be empty), and present an explicit decision before proceeding:
    ~~~
    ⚠️ Baseline contains <M> non-reconcilable failure(s) (failures with no stable suite-native identifier).
    These cannot be safely exempted by stable-identifier comparison: each later integration run will treat any non-reconcilable failure as a current gate-blocking failure, including ones that may already exist before this plan runs.

    <render the three-section user-facing summary from integration-regression-model.md, with current_failing_stable from FAILING_IDENTIFIERS and current_non_reconcilable from NON_RECONCILABLE_FAILURES>

    Options:
    (c) Continue anyway — proceed with the baseline as-is; later non-reconcilable failures will block their gates and require Debug or Stop.
    (x) Stop plan execution — fix the suite first.
    ~~~
    On `(c)`: record `baseline_failures` from `FAILING_IDENTIFIERS:` (frozen) and proceed to Step 8. Do NOT add the non-reconcilable evidence to `baseline_failures`. On `(x)`: stop with the message `Plan execution cancelled — fix baseline non-reconcilable failures first.` Preserve `.pi/test-runs/<plan-name>/` so the user can inspect the baseline artifact.
  Explicitly state that `baseline_failures` is frozen at this point and never mutated for the rest of the plan run.

- [ ] **Step 4: Replace Step 7's "Integration regression model" pointer (currently line ~273–275).** Replace its body with: "See [`integration-regression-model.md`](integration-regression-model.md) for the baseline-only reconciliation model: the frozen `baseline_failures` set, per-run inputs (`current_failing_stable`, `current_non_reconcilable`, `current_non_baseline_stable`), the byte-for-byte set-comparison rules, the pass/fail classification, and the user-facing summary format. Step 12, the Step 12 Debugger-first flow, and Step 16 all consume this same model." Remove every reference to `deferred_integration_regressions` and `new_regressions_after_deferment` from this subsection.

- [ ] **Step 5: Replace Step 12 §2 "Run integration tests" body (currently the paragraph at line ~549 and the entire `#### Menu` subsection).** Write the new body in this shape:
  - Run the integration suite via the shared `test-runner` dispatch with the wave-attempt artifact path (preserve the existing filename scheme `wave-<N>-attempt-<K>.log` and the `<K>` increment-on-debugger-re-test rule).
  - After artifact readback, compute `current_failing_stable` from `FAILING_IDENTIFIERS:`, `current_non_reconcilable` from `NON_RECONCILABLE_FAILURES:`, and `current_non_baseline_stable := current_failing_stable \ baseline_failures` (byte-for-byte set difference). Cross-reference `integration-regression-model.md` for the formal definitions.
  - **Pass condition:** `current_non_baseline_stable` is empty AND `current_non_reconcilable` is empty. Render the user-facing summary in the appropriate "fully clean" or "not fully clean (pass path)" format from `integration-regression-model.md` and proceed to the next wave.
  - **Fail condition:** `current_non_baseline_stable` is non-empty OR `current_non_reconcilable` is non-empty. Render the three-section user-facing summary with the fail header, then present the wave-appropriate menu (below).

- [ ] **Step 6: Replace Step 12's `#### Menu` subsection.** Define exactly two menus:
  - **Intermediate-wave menu** (wave `<N>` where `<N> < total_waves`):
    ~~~
    Options:
    (d) Debug failures now           — dispatch a systematic-debugging pass against current_non_baseline_stable ∪ current_non_reconcilable, then remediate
    (c) Continue despite failures    — proceed to wave <N+1>; baseline_failures is NOT mutated and no deferred state is persisted
    (x) Stop plan execution          — halt; prior wave commits remain in git history
    ~~~
    For `(d)`: run the Debugger-first flow with the Step 12 (post-wave) parameter row, scoped to `current_non_baseline_stable ∪ current_non_reconcilable`. Counts toward the Step 13 retry limit.
    For `(c)`: do NOT mutate `baseline_failures`; do NOT persist any deferred state; do NOT record `current_failing_stable` or `current_non_reconcilable` anywhere outside the artifact already on disk. Warn: "⚠️ Continuing despite current integration failures. The next wave's gate will rerun the suite from scratch and compare only against the frozen baseline. Final completion is BLOCKED until the final wave's run shows no current non-baseline stable failures and no non-reconcilable failures." Then proceed to wave `<N+1>`.
    For `(x)`: halt; prior wave commits remain. Preserve `.pi/test-runs/<plan-name>/`.
  - **Final-wave menu** (wave `<N>` where `<N> == total_waves`):
    ~~~
    Options:
    (d) Debug failures now  — dispatch a systematic-debugging pass against current_non_baseline_stable ∪ current_non_reconcilable, then remediate
    (x) Stop plan execution — halt; prior wave commits remain in git history
    ~~~
    Spell out: there is no continue-despite-failures option here by design; the spec forbids silently shipping non-baseline or non-reconcilable failures past final completion. The user MUST either debug or stop.

- [ ] **Step 7: Replace the Debugger-first flow's "Parameter values by caller" table.** Update each parameter row so it no longer references the three-set model. Specifically:
  - **Scope** row: keep the framing distinction between Step 12 (current wave `<N>` exists) and Step 16 (no current wave; `HEAD` may be a Step 15 commit) but drop any deferred-set wording.
  - **Range / changed-file universe** row: keep verbatim — the wave-commit vs `BASE_SHA..HEAD_SHA` distinction is unchanged.
  - **Suspect task universe** row: keep the "wave's tasks" vs "every plan task whose `**Files:**` scope intersects" distinction; replace any "failing tests" wording with "failing tests in `current_non_baseline_stable ∪ current_non_reconcilable` (use the failure evidence in `current_non_reconcilable` to map non-reconcilable failures to suspect tasks; the evidence is the only signal available since they have no stable identifier)".
  - **Success condition** row, Step 12 column: "On re-dispatching `test-runner` with a fresh `wave-<N>-attempt-<K>` filename and recomputing `current_failing_stable`, `current_non_reconcilable`, and `current_non_baseline_stable`, BOTH `current_non_baseline_stable` and `current_non_reconcilable` are empty. Pre-existing baseline failures may remain. On success, proceed to the next wave."
  - **Success condition** row, Step 16 column: "On re-entering the Step 16 gate at its step 1 (re-run the suite, recompute `current_failing_stable`, `current_non_reconcilable`, and `current_non_baseline_stable`), BOTH `current_non_baseline_stable` and `current_non_reconcilable` are empty. Pre-existing baseline failures may remain. On success, the gate passes and normal completion proceeds."
  - **Commit template / undo behavior** row: keep verbatim — the commit message templates and the Step-12-only commit-undo rule are unchanged.
  Remove every remaining mention of `still_failing_deferred`, `new_regressions_after_deferment`, "deferred regressions", "Cleared deferred regressions", and `deferred_integration_regressions` from the table cells. Verify by re-reading each cell.

- [ ] **Step 8: Update the Debugger-first flow body (Steps 1–5 of the flow).** Specifically:
  - Step 1 ("Identify suspects"): replace "the new failing test names" with "the failing test names in `current_non_baseline_stable` and the evidence excerpts in `current_non_reconcilable`".
  - Step 2 (the dispatch prompt content list): replace "The failing test output (full, not truncated). For Step 16, provide this for the union `still_failing_deferred ∪ new_regressions_after_deferment`, with a labeled breakdown..." with "The failing test output for `current_non_baseline_stable ∪ current_non_reconcilable` (full, not truncated; for Step 16 provide a labeled breakdown of which entries are stable identifiers vs. non-reconcilable evidence so the diagnosis can reason about cause). For non-reconcilable failures, the evidence excerpt from the artifact's `NON_RECONCILABLE_FAILURES:` block is the only available context — name it explicitly so the debugger does not assume a stable identifier exists."
  - Step 3 ("Handle the debugging pass result"): keep the three-branch structure (DONE / DONE_WITH_CONCERNS / failed pass) but update the success-evaluation sentence in the DONE branch to read "evaluate the success condition: for Step 12, re-dispatch `test-runner` (incrementing the wave attempt counter) and apply the baseline-only reconciliation in `integration-regression-model.md`; for Step 16, re-enter the gate at step 1 (re-run the suite, recompute `current_failing_stable`, `current_non_reconcilable`, and `current_non_baseline_stable`)." Update the failed-pass branch so the menu it re-presents is the wave-appropriate menu from Step 12 (intermediate `(d)/(c)/(x)` or final-wave `(d)/(x)`) or Step 16's `(d)/(x)`, NOT the old `(a)/(b)/(c)` menu.
  - Step 4 (do not blanket re-dispatch): keep verbatim.
  - Step 5 (commit-undo fallback availability): keep verbatim.

- [ ] **Step 9: Replace Step 14's "Deferred integration regressions" subsection.** Replace it with a "Most recent integration run failures" subsection that reports, when execution stops mid-plan and the most recent integration run had any current failures, the contents of `current_non_baseline_stable` and `current_non_reconcilable` from that most recent artifact:
  ~~~
  ### Most recent integration run failures (unresolved)
  <list of stable identifiers in current_non_baseline_stable from the most recent artifact, or `(none)` if empty>

  ### Non-reconcilable failures from the most recent integration run
  <list of evidence entries from current_non_reconcilable from the most recent artifact, or `(none)` if empty>

  These failures were observed in the most recent integration run on this branch and remain unresolved.
  They must be debugged before this branch is considered shippable.
  ~~~
  Drop any wording about "deferred during intermediate waves" — there is no deferred state. State that the artifact path of the most recent run is `.pi/test-runs/<plan-name>/wave-<N>-attempt-<K>.log` (or `final-gate-<seq>.log`) and is preserved on every stop-exit path so the user can inspect it.

- [ ] **Step 10: Replace Step 16's "Final integration regression gate (precondition)" body (currently lines ~673–703).** Write the new body in this shape:
  - Skip rule: keep verbatim ("Skip if: Integration tests are disabled or no test command is available.").
  - Gate protocol step 1: re-dispatch the integration suite via the shared test-runner dispatch with `final-gate-<seq>.log` (preserve the `<seq>` increment rule). Read back the artifact, compute `current_failing_stable` from `FAILING_IDENTIFIERS:`, `current_non_reconcilable` from `NON_RECONCILABLE_FAILURES:`, and `current_non_baseline_stable := current_failing_stable \ baseline_failures` per `integration-regression-model.md`.
  - Gate protocol step 2: gate on `current_non_baseline_stable ∪ current_non_reconcilable`. If both are empty, the gate passes and proceeds to `### 1. Move plan to done`. If either is non-empty, the gate fails — render the three-section user-facing summary from `integration-regression-model.md` with the header `⚠️ Final completion blocked: current integration failures remain.` and the trailing note `These current failures must be resolved before the plan can be marked complete (current_non_baseline_stable and current_non_reconcilable must both be empty).` Then present the menu:
    ~~~
    Options:
    (d) Debug failures now  — run the Debugger-first flow (defined in Step 12) with the Step 16 (final-gate) parameter row, scoped to current_non_baseline_stable ∪ current_non_reconcilable; on success, re-enter this gate.
    (x) Stop execution      — halt plan execution; prior wave commits remain in git history.
    ~~~
  - Gate protocol step 3 (menu actions): `(d)` runs the Debugger-first flow with the Step 16 parameter row scoped to `current_non_baseline_stable ∪ current_non_reconcilable`. Each attempt counts toward the Step 13 retry budget for the implicated tasks. `(x)` halts; report partial progress via Step 14 listing both `current_non_baseline_stable` and `current_non_reconcilable` under the new "Most recent integration run failures" headings; do NOT move the plan, close the todo, or run branch completion. Preserve `.pi/test-runs/<plan-name>/`.
  - Blocking guarantee: `### 1. Move plan to done`, `### 2. Close linked todo`, and `### 4. Branch completion` MUST NOT execute while `current_non_baseline_stable ∪ current_non_reconcilable` is non-empty. Only exits: gate passes (both empty) or `(x) Stop execution`.
  Drop every reference to `still_failing_deferred`, `deferred_integration_regressions`, and `new_regressions_after_deferment`. Drop the "newly discovered final-gate regressions" wording — the new model has no separate category for that.

- [ ] **Step 11: Re-read the updated SKILL.md end-to-end** focused on integration-test-related content (Step 7, Step 12 including the Debugger-first flow, Step 14, Step 16). Confirm zero remaining references to `deferred_integration_regressions`, `new_regressions_after_deferment`, `still_failing_deferred`, `cleared_deferred`, `Defer integration debugging`, `(b) Defer`, "Cleared deferred regressions", or "raw-line fallback". If any remain, remove them.

**Acceptance criteria:**

- Step 7's Header-parse check requires the new non-reconcilable header fields in order.
  Verify: open `agent/skills/execute-plan/SKILL.md`, find the Step 7 "Header-parse check" item under the Artifact readback list, and confirm it lists `PHASE`, `COMMAND`, `WORKING_DIRECTORY`, `EXIT_CODE`, `TIMESTAMP`, `FAILING_IDENTIFIERS_COUNT`, `FAILING_IDENTIFIERS:`, `END_FAILING_IDENTIFIERS`, `NON_RECONCILABLE_COUNT`, `NON_RECONCILABLE_FAILURES:`, `END_NON_RECONCILABLE_FAILURES`, and `--- RAW RUN OUTPUT BELOW ---` in this order. Also run `grep -nF 'NON_RECONCILABLE_COUNT' agent/skills/execute-plan/SKILL.md` and confirm at least one match falls inside the Step 7 block.
- Step 7's baseline recording subsection handles the three EXIT_CODE × NON_RECONCILABLE_COUNT cases and presents a stop/continue decision when the baseline has non-reconcilable failures.
  Verify: open `agent/skills/execute-plan/SKILL.md`, find the Step 7 baseline recording subsection, and confirm it handles three cases (`EXIT_CODE == 0`; `EXIT_CODE != 0` with `NON_RECONCILABLE_COUNT == 0`; `EXIT_CODE != 0` with `NON_RECONCILABLE_COUNT != 0`). Confirm the third case presents an explicit `(c) Continue anyway` / `(x) Stop plan execution` decision and does NOT add non-reconcilable evidence to `baseline_failures`.
- Step 12's intermediate-wave menu is `(d) / (c) / (x)` and the final-wave menu is `(d) / (x)`, with no `(b) Defer` option anywhere.
  Verify: run `grep -nF '(d) Debug failures now' agent/skills/execute-plan/SKILL.md` and confirm at least two matches fall inside Step 12 (one per menu). Run `grep -nF '(c) Continue despite failures' agent/skills/execute-plan/SKILL.md` and confirm at least one match falls inside Step 12's intermediate-wave menu. Run `grep -nF '(b) Defer' agent/skills/execute-plan/SKILL.md` and confirm exit code 1 (no matches). Run `grep -nF 'Defer integration debugging' agent/skills/execute-plan/SKILL.md` and confirm exit code 1 (no matches).
- Step 12's `(c) Continue despite failures` does not mutate `baseline_failures` or persist any deferred state.
  Verify: open `agent/skills/execute-plan/SKILL.md`, find the Step 12 description of the `(c) Continue despite failures` action under the intermediate-wave menu, and confirm the body explicitly states (a) `baseline_failures` is NOT mutated, (b) no deferred state is persisted, and (c) the next wave's gate compares only against the frozen baseline.
- The Debugger-first flow's parameter table and body no longer reference the three-set model.
  Verify: run each of the following greps against `agent/skills/execute-plan/SKILL.md` and confirm exit code 1 (no matches) for all of them: `grep -nF 'still_failing_deferred'`, `grep -nF 'new_regressions_after_deferment'`, `grep -nF 'deferred_integration_regressions'`, `grep -nF 'Cleared deferred regressions'`.
- Step 16's gate gates on `current_non_baseline_stable ∪ current_non_reconcilable` and offers only `(d) / (x)`.
  Verify: open `agent/skills/execute-plan/SKILL.md`, find the Step 16 "Final integration regression gate (precondition)" subsection, and confirm (a) the gate condition is stated as both `current_non_baseline_stable` AND `current_non_reconcilable` being empty, (b) the menu lists exactly two options `(d) Debug failures now` and `(x) Stop execution`, and (c) the blocking guarantee names the union `current_non_baseline_stable ∪ current_non_reconcilable`. Run `grep -nF '(b)' agent/skills/execute-plan/SKILL.md` and confirm no match falls inside the Step 16 final-gate menu block.
- Step 14's partial-progress section reports the most recent run's non-baseline and non-reconcilable failures, not deferred regressions.
  Verify: open `agent/skills/execute-plan/SKILL.md`, find Step 14, and confirm it contains the heading `Most recent integration run failures (unresolved)` and a sibling block listing non-reconcilable evidence. Confirm the heading `Deferred integration regressions (unresolved)` is absent. Run `grep -nF 'Deferred integration regressions (unresolved)' agent/skills/execute-plan/SKILL.md` and confirm exit code 1 (no matches).
- The shared test-runner dispatch subsection's "Reading run results" sentence names both buckets (`FAILING_IDENTIFIERS:` and `NON_RECONCILABLE_FAILURES:`).
  Verify: open `agent/skills/execute-plan/SKILL.md`, find the "Reading run results" sentence inside the shared test-runner dispatch subsection (currently the last sentence of Step 7's dispatch subsection), and confirm it names both `FAILING_IDENTIFIERS:` / `END_FAILING_IDENTIFIERS` and `NON_RECONCILABLE_FAILURES:` / `END_NON_RECONCILABLE_FAILURES`.

**Model recommendation:** capable

---

### Task 5: Update `README.md` to summarize the baseline-only model

**Files:**

- Modify: `agent/skills/execute-plan/README.md`

**Steps:**

- [ ] **Step 1: Replace the `## Integration regression model` section body** (currently the three-bullet summary listing `baseline failures`, `deferred integration regressions`, and `new regressions in the current wave`). Replace its body with this paragraph block (keep the section heading exactly as `## Integration regression model`):
  ~~~
  When integration tests are enabled, the skill captures a stable-identifier baseline before the first wave and freezes it for the rest of the plan run. After every later integration run, the skill compares the run's stable failing identifiers byte-for-byte against the frozen baseline; any current stable failure not in the baseline is a current non-baseline failure. Failures with no stable suite-native identifier are recorded separately as non-reconcilable evidence and never participate in set arithmetic.

  Intermediate waves with current non-baseline or non-reconcilable failures present the user with `(d) Debug failures now / (c) Continue despite failures / (x) Stop plan execution`. Choosing `(c)` does not mutate the baseline or persist any cross-wave failure state — the next wave's gate runs fresh against the frozen baseline. The final wave and the final-completion gate drop the continue option: completion is blocked until current non-baseline stable failures and non-reconcilable failures are both empty, with only `(d) Debug failures now / (x) Stop plan execution` available. The formal classification, identifier contract, and worked runner examples are documented in `integration-regression-model.md`.
  ~~~

- [ ] **Step 2: Update the `## Files` section's `integration-regression-model.md` line.** Replace `formal classification rules for integration failures` with `baseline-only identifier contract, reconciliation, and runner examples`. Keep the bullet shape identical to the others in the list.

- [ ] **Step 3: Re-read the file end-to-end** and confirm no remaining references to `deferred integration regressions`, `new regressions in the current wave`, or "three sets". If any remain, remove them.

**Acceptance criteria:**

- The `## Integration regression model` section describes the baseline-only model and the new menu shapes.
  Verify: open `agent/skills/execute-plan/README.md`, find the `## Integration regression model` section, and confirm its body contains the literal substrings `baseline`, `frozen`, `current non-baseline`, `non-reconcilable`, `(d) Debug failures now`, `(c) Continue despite failures`, and `(x) Stop plan execution`. Confirm the body does NOT contain `deferred`, `three sets`, or `new regressions in the current wave`.
- The `## Files` section's `integration-regression-model.md` line summarizes the new content.
  Verify: open `agent/skills/execute-plan/README.md`, find the `## Files` bullet beginning with `integration-regression-model.md`, and confirm the description after the em-dash names the baseline-only model or the identifier contract (e.g. contains the substring `baseline-only` or `identifier contract`).
- No three-set vocabulary remains anywhere in the README.
  Verify: run `grep -nE 'deferred integration regressions|three sets|new regressions in the current wave|deferred_integration_regressions' agent/skills/execute-plan/README.md` and confirm exit code 1 (no matches).

**Model recommendation:** cheap

---

## Dependencies

- Task 4 depends on: Task 1, Task 2, Task 3
- Task 5 depends on: Task 1, Task 4

Tasks 1, 2, and 3 have no dependencies on each other and can run in parallel as Wave 1. Task 4 runs alone in Wave 2 because it consumes the contracts that Tasks 1–3 establish. Task 5 runs alone in Wave 3 because the README summary cross-references the final wording in both `integration-regression-model.md` and `SKILL.md`.

## Risk Assessment

- **Risk:** SKILL.md edits in Task 4 are large and span five separate sections; an inconsistent partial edit could leave the file referencing a mix of the old three-set model and the new baseline-only model. **Mitigation:** Task 4 ends with a "re-read end-to-end" step (Step 11) plus a battery of grep-based acceptance criteria that fail the verifier if any of `deferred_integration_regressions`, `new_regressions_after_deferment`, `still_failing_deferred`, `cleared_deferred`, `(b) Defer`, or "Cleared deferred regressions" survive anywhere in the file. The verifier's command-style `Verify:` recipes will catch any leftover by exit-code 1 on grep.
- **Risk:** The artifact format change is breaking — a `test-runner` built before this plan would emit the old format and fail Step 7's Header-parse check on the next run. **Mitigation:** All three contract-defining files (Tasks 1, 2, 3) ship together in Wave 1, and Task 4 (which updates the consumer) lands in Wave 2. The plan's commit cadence ensures the producer-side change (test-runner.md) and the consumer-side change (SKILL.md) cannot be merged separately. There is no in-flight `test-runner` instance during plan execution because the runner is dispatched on-demand per phase; each dispatch reads its agent definition fresh.
- **Risk:** Removing the `(b) Defer integration debugging` option could surprise users who rely on it; the spec explicitly trades that flexibility for simplicity. **Mitigation:** This is by design (spec Goal). The replacement `(c) Continue despite failures` keeps the same forward-progress affordance on intermediate waves; the only behavior change is that no deferred-set state is persisted, which the spec calls out as a deliberate simplification. The user-facing menu wording in Task 4 names the trade-off explicitly in the warning text.
- **Risk:** Non-reconcilable evidence entries are multi-line and use single-blank-line separators; a runner that emits no separator (or a different separator) could break the orchestrator's parser. **Mitigation:** Task 2 fixes the contract in `agent/agents/test-runner.md` (the only producer) at the same time Task 4 updates the consumer. The contract states "single blank line between entries" verbatim. Future deviations would be caught by the orchestrator-side parse and reported as a malformed-header stop.
- **Risk:** Worked examples in Task 1 may not match every real-world runner output verbatim; the spec acknowledges this is a non-goal ("Guaranteeing that every possible test runner can provide stable per-test identifiers"). **Mitigation:** The examples are documentation, not parser specifications. The runner is responsible for using whatever the runner actually prints, verbatim. Task 1's acceptance criteria require five subsections present, not byte-equal example output, so the doc can be tuned without invalidating the contract.
- **Risk:** TypeScript test suite at `agent/extensions/` could be inadvertently affected by this markdown-only change. **Mitigation:** The plan touches no `.ts` files; running `npm test --prefix agent` after Task 4 confirms the extensions remain green. This is captured in the test command below.

## Test Command

```bash
npm test --prefix agent
```
