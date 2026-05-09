# Refine-plan helpers

## Why this exists

This directory hosts mechanical helpers for refine-plan workflows — review-prompt assembly, review artifact validation and parsing, planner edit-prompt assembly, coordinator-prompt assembly, and outer-summary parsing.

## Helpers

### Wave 1 — plan-refiner inner-loop helpers

These three scripts replace the manual glue that the `plan-refiner` coordinator previously did inline (temp-file creation, placeholder substitution, handoff validation, verdict parsing, severity counting, blocking-findings extraction).

- **prepare-plan-review-prompt.py** — Fills `review-plan-prompt.md` from explicit inputs, constructs the era-versioned review output path, builds the exact `**Reviewer:** <provider>/<model> via <cli>` provenance line, and writes the filled prompt to a temp file. Emits JSON `{ prompt_path, review_path, reviewer_provenance }` on stdout. Example:
  ```
  python3 prepare-plan-review-prompt.py \
    --plan-path docs/plans/my-plan.md \
    --task-artifact "Task artifact: docs/tasks/t1.md" \
    --source-todo "" --source-spec "" --scout-brief "" \
    --original-spec-inline /tmp/spec.md \
    --structural-only-note /tmp/structural-note.md \
    --review-output-path docs/reviews/my-review \
    --working-dir /repo \
    --current-era 1 \
    --reviewer-model openai-codex/gpt-5.5 \
    --reviewer-cli pi
  ```

- **validate-and-parse-plan-review.py** — Validates a reviewer artifact handoff (marker presence, path match, existence, provenance byte-equality, format regex, no-inline guard, Verdict label) and parses verdict, severity counts, and `blocking_findings_markdown` (Critical + Important only). Emits JSON `{ review_path, verdict, critical_count, important_count, minor_count, blocking_findings_markdown }` on stdout; emits JSON `{ failure, ... }` on stderr and exits non-zero on any validation failure. Example:
  ```
  python3 validate-and-parse-plan-review.py \
    --final-message /tmp/reviewer-output.txt \
    --expected-path /repo/docs/reviews/my-review-v1.md \
    --reviewer-provenance "**Reviewer:** openai-codex/gpt-5.5 via pi" \
    --allowed-tiers crossProvider.capable,capable
  ```

- **prepare-plan-edit-prompt.py** — Fills `edit-plan-prompt.md` with blocking findings (Critical + Important; Minor excluded) and provenance inputs, writes the filled prompt to a temp file. Emits JSON `{ prompt_path, output_path }` on stdout. Example:
  ```
  python3 prepare-plan-edit-prompt.py \
    --review-findings /tmp/blocking-findings.md \
    --plan-path docs/plans/my-plan.md \
    --task-artifact "Task artifact: docs/tasks/t1.md" \
    --source-todo "" --source-spec "" --scout-brief "" \
    --original-spec-inline /tmp/spec.md \
    --output-path docs/plans/my-plan.md
  ```

### Legacy helpers

- **fill-refine-plan-prompt.py** — Fills `agent/skills/refine-plan/refine-plan-prompt.md` from explicit inputs (plan goal, plan contents, base/head SHAs, working dir, review output path, max iterations, model matrix). Example: `python3 fill-refine-plan-prompt.py --plan-goal goal.md --plan-contents plan.md --base-sha abc1234 --head-sha def5678 --review-output-path docs/reviews/foo --max-iterations 3 --model-matrix matrix.json --working-dir /tmp/work --output prompt.md`.

- **parse-refine-plan-summary.py** — Parses the compact `refine-plan` coordinator summary documented in `refine-plan-prompt.md` Output Format. Example: `python3 parse-refine-plan-summary.py --summary <(cat /tmp/refine-plan-output.txt)`.

## Running tests

Tests live in the `tests/` subdirectory and use Python's unittest framework. The targeted helper unit-test suite is the primary validation path for these helpers — it is fast, deterministic, and requires no live model dispatches.

To run the refine-plan helper unit tests:
```bash
cd agent
python3 -m unittest discover -s skills/refine-plan/scripts/tests -p "test_*.py" -v
```

To run tests as part of the full integration check:
```bash
cd agent
npm run test:helpers
```

> **Out of scope:** Full `generate-plan` / `execute-plan` lifecycle runs are NOT required to validate the wave-1 helper scripts. The targeted unit tests above cover all helper behaviors; end-to-end lifecycle validation is a separate concern outside this work.
