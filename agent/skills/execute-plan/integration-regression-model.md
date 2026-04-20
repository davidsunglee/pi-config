# Integration regression model

This document is the single canonical definition of the three-set integration tracking model, the reconciliation algorithm, and the user-facing summary format used during plan execution. It is referenced by Step 7 (baseline capture), Step 12 (post-wave integration tests), and Step 16 (final integration regression gate) — those steps use this model verbatim rather than restating it.

## The three tracked sets

The post-wave integration run is classified against three explicitly tracked sets of test identifiers. A "test identifier" is the suite-native unique name for a failing test (e.g. file path plus test name, or fully qualified symbol), taken verbatim from the test runner's failure output per the Step 7 identifier-extraction contract.

1. **`baseline_failures`** — the set of tests that failed in the Step 7 baseline run. Captured once, before any wave executes, and never mutated after baseline capture. A test in this set represents a pre-existing failure the plan did not introduce.
2. **`deferred_integration_regressions`** — the set of tests the user has chosen to debug later via `(b) Defer integration debugging` in a prior wave's intermediate-wave menu. Starts empty at plan start. Grows only when the user selects `(b)` on an intermediate wave, and is reconciled on every subsequent integration run (see reconciliation algorithm below). These are regressions caused by this plan that the user has explicitly deferred — not pre-existing failures.
3. **`new_regressions_after_deferment`** — the set of tests that are failing in the just-completed integration run AND are not in `baseline_failures` AND are not in the post-reconciliation `deferred_integration_regressions`. Recomputed from scratch on every post-wave integration run (it does not persist across waves). This set names the plan-introduced regressions that first surface in the current run — i.e. the ones the user has not already chosen to defer and that were not pre-existing. It is the authoritative driver of the pass/fail classification below and the target scope of the `(a) Debug failures` and `(b) Defer integration debugging` menu actions.

`current_failing` is NOT one of the three tracked sets. It is a transient per-run value: the set of tests failing in the just-completed integration run, recomputed from scratch on every run, and used solely as input to the reconciliation step that derives the post-reconciliation `deferred_integration_regressions` and the fresh `new_regressions_after_deferment`. Once reconciliation computes those two tracked sets, `current_failing` is not referenced further and is not persisted across waves.

## Disjointness and transition rules

- `baseline_failures` and `deferred_integration_regressions` MUST remain disjoint. When adding a test to `deferred_integration_regressions`, first subtract `baseline_failures` from the candidate set; a test cannot simultaneously be a pre-existing baseline failure and a deferred regression.
- `new_regressions_after_deferment` is disjoint from both `baseline_failures` and `deferred_integration_regressions` by construction (see reconciliation step 4). A test can be in at most one of the three tracked sets at any moment.
- A test transitions out of `deferred_integration_regressions` only via the reconciliation rule below (when it is no longer failing). It never transitions into `baseline_failures` — the baseline is frozen at Step 7.
- Only `baseline_failures` and `deferred_integration_regressions` are carried across waves. `new_regressions_after_deferment` is recomputed fresh each run (via reconciliation), and `current_failing` is purely ephemeral input to that computation.

## Reconciliation algorithm

After every integration test run (post-wave in Step 12, and the final gate in Step 16), and before classifying pass/fail, compute the transient `current_failing` from the run output and reconcile `deferred_integration_regressions` against it, then derive `new_regressions_after_deferment`:

1. Compute `current_failing` := the set of failing-test identifiers reported by the just-completed integration run, extracted via the Step 7 identifier-extraction contract so the identifiers are directly comparable with `baseline_failures` and `deferred_integration_regressions`. This value is transient — used only as input to steps 2–4 below and discarded after this reconciliation.
2. Compute `still_failing_deferred := deferred_integration_regressions ∩ current_failing` — deferred regressions that are still failing.
3. Compute `cleared_deferred := deferred_integration_regressions \ current_failing` — deferred regressions that are no longer failing (either the wave's changes fixed them, or the suite's output no longer includes them). Report these briefly in the pass/fail output as "Cleared deferred regressions: <list>".
4. Set `deferred_integration_regressions := still_failing_deferred`. Any deferred regression not in the current failing set is removed from the tracked set — the orchestrator does NOT carry stale identifiers forward.
5. Assign `new_regressions_after_deferment := current_failing \ (baseline_failures ∪ deferred_integration_regressions)`. This set is empty when every currently failing test is either a pre-existing baseline failure or a previously deferred regression; it is populated when the just-completed run includes at least one failure that was neither in the baseline nor previously deferred. `new_regressions_after_deferment` is the authoritative source for:
   - the user-facing "New regressions in this wave" section,
   - the pass/fail classification below, and
   - the `(a) Debug failures` and `(b) Defer integration debugging` menu actions (which operate only on the tests in this set).

## Pass/fail classification

**Post-wave (Step 12):**

- **Pass:** `new_regressions_after_deferment` is empty. Proceed to the next wave. Format the user-facing summary per the [User-facing summary format](#user-facing-summary-format) section below.
- **Fail:** `new_regressions_after_deferment` is non-empty. Present the three-section report followed by the Step 12 failure menu.

Step 16's final gate uses a stricter condition — it gates on the union `still_failing_deferred ∪ new_regressions_after_deferment` — but uses the same reconciliation algorithm and the same three-section report format defined here.

## User-facing summary format

The user-facing summary uses one of two formats, depending on whether the suite is clean:

- **Fully-clean suite** — `baseline_failures ∩ current_failing`, post-reconciliation `deferred_integration_regressions`, and `new_regressions_after_deferment` are ALL empty. Report briefly, without the three-section block:

  ```
  ✅ Integration tests pass after wave <N> (no failures).
  ```

- **Not fully clean** — any of the three sets above is non-empty (including the pass path where `new_regressions_after_deferment` is empty but baseline failures or deferred regressions remain). Present exactly these three separately-headed sections, in this order, regardless of whether the overall classification is pass or fail:

  ```
  <header line — see below>

  ### Baseline failures
  <list of tests in baseline_failures ∩ current_failing — pre-existing, not plan-introduced>

  ### Deferred integration regressions
  <list of tests in deferred_integration_regressions (post-reconciliation) — plan-introduced regressions the user chose to defer>

  ### New regressions in this wave
  <list of tests in new_regressions_after_deferment — plan-introduced regressions first observed in this run>
  ```

  The header line is `✅ Integration tests pass after wave <N> (no new regressions; baseline and/or deferred failures remain — see below).` on the pass path, and `❌ Integration tests failed after wave <N>.` on the fail path.

  Each of the three sections MUST be present even if its list is empty (render an empty list as `(none)`), and the section headings MUST be the exact strings `Baseline failures`, `Deferred integration regressions`, and `New regressions in this wave`. On the pass path, the "New regressions in this wave" section is rendered as `(none)` by construction. The `(a)` and `(b)` menu actions — which only appear on the fail path — operate only on the "New regressions in this wave" list (i.e. on `new_regressions_after_deferment`).
