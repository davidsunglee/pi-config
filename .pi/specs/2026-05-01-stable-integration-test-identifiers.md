# Stable Integration-Test Identifiers in execute-plan

Source: TODO-88ba80a5

## Goal

Make `execute-plan` integration-test reconciliation simple and reliable by using stable, suite-native failure identifiers everywhere integration results are compared, and by replacing the current three-set deferred-regression model with a baseline-only model: pre-existing baseline failures are tolerated, intermediate non-baseline failures can be continued past by explicit user choice, and final completion is blocked until no non-baseline or non-reconcilable failures remain.

## Context

`execute-plan` currently delegates integration test execution to the `test-runner` subagent and reads back structured artifacts from `.pi/test-runs/<plan-name>/`. The `test-runner` extracts a `FAILING_IDENTIFIERS:` set and writes it into an artifact consumed by baseline capture, post-wave checks, debugger re-tests, and the final gate.

The existing documentation spreads the integration behavior across:

- `agent/skills/execute-plan/SKILL.md` Step 7 baseline capture, Step 12 post-wave integration checks, the Debugger-first re-test flow, and Step 16 final gate.
- `agent/skills/execute-plan/integration-regression-model.md`, which defines the current three-set model: `baseline_failures`, `deferred_integration_regressions`, and `new_regressions_after_deferment`.
- `agent/agents/test-runner.md`, which currently instructs the runner to use suite-native identifiers when possible and a raw-line fallback when no per-test name is available.
- `agent/skills/execute-plan/test-runner-prompt.md`, which repeats the test-runner artifact and identifier-extraction expectations.

The current three-set model lets users defer integration debugging across waves, but it also requires carrying failure identifiers forward and reconciling them repeatedly. That complexity becomes fragile when identifiers are unstable or when a runner fails before it can name a specific test. This work should make the identifier contract stricter and the reconciliation model easier to reason about.

## Requirements

- Define a single stable integration-test identifier contract used by `test-runner` artifacts and every `execute-plan` integration-test readback path.
- Stable identifiers must be suite-native and taken verbatim from runner output. Examples include:
  - Go: package plus `TestName` as printed by `go test` failure lines.
  - pytest: node IDs such as `tests/test_foo.py::TestClass::test_bar`.
  - cargo test: fully qualified test paths printed by the runner.
  - Jest/Vitest: file path plus nested suite/test name as printed by the runner.
- The contract must forbid synthesized, normalized, lowercased, reordered, or phase-specific identifiers for comparable failures.
- When a test run fails but no stable suite-native identifier is available for one or more failures, those failures must be recorded separately as non-reconcilable rather than inserted into the comparable identifier set.
- `execute-plan` must not classify non-reconcilable failures as baseline, accepted intermediate, or new regressions through set arithmetic. Their presence blocks the current integration gate until the user chooses to debug or stop, except that an intermediate wave may explicitly continue despite current failures under the same user-facing continuation option used for named non-baseline failures.
- Replace the current three-set integration model with a baseline-only reconciliation model:
  - Capture `baseline_failures` once before the first wave from the stable identifier set in the baseline artifact.
  - Do not persist `deferred_integration_regressions` or `new_regressions_after_deferment` across waves.
  - For each later integration run, compute current stable failures from that run's artifact and compare them byte-for-byte against the frozen baseline set.
  - Any current stable failure not present in `baseline_failures` is a current non-baseline failure.
- Intermediate-wave integration failures use this menu when current non-baseline failures or non-reconcilable failures are present:
  - `(d) Debug failures now`
  - `(c) Continue despite failures`
  - `(x) Stop plan execution`
- Choosing `(c) Continue despite failures` on an intermediate wave does not record deferred identifiers or mutate baseline state. The next integration run starts fresh from its own artifact and compares only against the frozen baseline.
- The final wave and final completion gate must not offer a continue/defer option. When current non-baseline failures or non-reconcilable failures are present, they use this menu:
  - `(d) Debug failures now`
  - `(x) Stop plan execution`
  Final completion is blocked while any current non-baseline stable failure or any non-reconcilable failure remains.
- Baseline capture must document behavior when the baseline run itself contains non-reconcilable failures. The spec should require an explicit stop-or-continue decision before plan execution proceeds, because such failures cannot be safely exempted by stable set comparison.
- Baseline, post-wave, Debugger-first re-test, and final-gate paths must all consume the same artifact fields and compare stable identifiers byte-for-byte.
- Documentation and regression coverage must prevent reintroducing raw-line fallbacks, synthesized identifiers, inconsistent extraction between phases, or persistent deferred-regression identifier sets.

## Constraints

- Keep integration test execution delegated to `test-runner`; `execute-plan` remains the orchestrator that reads artifacts, computes set differences, presents menus, and dispatches debugging work.
- Keep the artifact-based handoff shape: `test-runner` writes a structured file and emits `TEST_RESULT_ARTIFACT: <absolute path>` as its final marker.
- Preserve baseline tolerance for pre-existing stable failures. A failure present in the frozen baseline stable set does not block later waves solely by continuing to fail.
- Do not add a synthetic suite-level sentinel for unnamed failures. Collapsing unrelated failures into a sentinel would make comparison less precise.
- Do not keep the raw-line fallback for unnamed failures as comparable identifiers. Raw crash/error lines are often unstable and would undermine the stable-identifier goal.
- Do not require integration tests to pass after every intermediate wave. Users may continue despite expected temporary integration breakage, but final completion remains strict.
- Do not change worker wave execution, verifier behavior, code-review flow, worktree behavior, or commit policy except where integration-test result handling directly references the current three-set model.
- Soft constraint: aim to keep `agent/skills/execute-plan/SKILL.md` from getting longer. Prefer replacing three-set prose with the simpler baseline-only model instead of adding parallel explanations, but do not sacrifice clarity or correctness solely to reduce line count.

## Approach

**Chosen approach:** Baseline-only reconciliation with explicit intermediate continuation. `execute-plan` keeps only the frozen `baseline_failures` set. Every post-baseline integration artifact provides a current stable failure set plus any non-reconcilable failures. Intermediate waves may continue despite current failures by user choice, but no deferred failure identifiers are persisted. Final completion blocks until current stable failures are all baseline failures and there are no non-reconcilable failures.

**Why this over alternatives:** This model preserves the useful behavior of allowing expected temporary integration breakage between waves while removing the most complex and fragile part of the current design: carrying deferred failure identifiers across runs. It also aligns with the stable-identifier requirement because only suite-native identifiers participate in byte-for-byte set comparison.

**Considered and rejected:**

- Keep the three-set model and only tighten identifier extraction — retains flexibility but preserves the complexity and stale-identifier risk that motivated the redesign.
- Persist a coarse "integration dirty" flag when the user continues despite failures — simpler than deferred sets, but adds little beyond the final gate because the final gate already reruns the suite and blocks on current non-baseline failures.
- Use raw-line fallback for unnamed failures — easy to implement, but raw lines are often unstable across runs and can create false new-regression or false-cleared signals.
- Use synthetic sentinels for unnamed failures — avoids raw-line churn but violates the suite-native identifier principle and can collapse distinct failures together.

## Acceptance Criteria

- `agent/agents/test-runner.md` documents the stable identifier contract: suite-native identifiers only, byte-for-byte preservation, no normalization or synthesis, and non-reconcilable recording when no stable identifier is available.
- The `test-runner` artifact format is extended or clarified so stable comparable identifiers remain separate from non-reconcilable failures.
- `agent/skills/execute-plan/test-runner-prompt.md` matches the agent contract and no longer instructs the runner to use raw-line fallback as a comparable identifier.
- `agent/skills/execute-plan/integration-regression-model.md` is rewritten or replaced to describe the baseline-only model and no longer defines persistent `deferred_integration_regressions` or `new_regressions_after_deferment` sets.
- `agent/skills/execute-plan/SKILL.md` Step 7 records a frozen baseline stable identifier set and explicitly handles baseline non-reconcilable failures with a user-visible decision instead of silently exempting them.
- `agent/skills/execute-plan/SKILL.md` Step 12 compares each post-wave stable identifier set byte-for-byte against the frozen baseline and presents the intermediate-wave menu `(d) Debug failures now`, `(c) Continue despite failures`, `(x) Stop plan execution` whenever current non-baseline or non-reconcilable failures are present.
- Continuing despite failures on an intermediate wave does not write any deferred identifier set, mutate `baseline_failures`, or affect the next run except through code changes already committed by normal wave flow.
- The final wave and Step 16 final integration gate block on any current non-baseline stable failure or non-reconcilable failure and offer only `(d) Debug failures now` and `(x) Stop plan execution`.
- Debugger-first re-tests consume the same artifact fields and use the same baseline-only comparison as ordinary post-wave and final-gate runs.
- Regression coverage or documentation demonstrates common runner identifier expectations for Go, pytest, cargo test, and Jest/Vitest, plus crash/collection-failure cases where no stable identifier is available.
- A grep or equivalent audit shows no remaining execute-plan guidance that treats raw unnamed failure lines as comparable stable identifiers, and no remaining integration model guidance that carries deferred regression identifier sets across waves.

## Non-Goals

- Making integration tests mandatory after every intermediate wave.
- Guaranteeing that every possible test runner can provide stable per-test identifiers.
- Designing a new test-output parser framework or provider-specific parser implementation beyond documenting the contract and expected behavior.
- Changing the test command detection rules or the `test-runner` dispatch model/CLI resolution rules.
- Changing verifier command-evidence collection, per-task acceptance verification, wave dependency planning, worker retry budgets, or final code-review behavior.
- Automatically debugging or fixing integration failures in the orchestrator itself; debugging remains delegated through the existing Debugger-first flow.
