# Execute-plan workflow helpers

## Why this exists

The `execute-plan/scripts/` directory contains Python helpers that support the plan execution workflow. These tools handle task extraction, diff analysis, verifier prompt assembly, and verifier report parsing.

## Helpers

- **assemble-coder-prompt.py** — Fills `agent/skills/execute-plan/execute-task-prompt.md` with task spec, context, working directory, and an optional TDD block. Example: `python3 assemble-coder-prompt.py --task-spec spec.md --context ctx.md --working-dir /tmp/work --tdd-block enabled --output prompt.md`.

- **assemble-verifier-prompt.py** — Constructs a verifier prompt from task specification, diffs, and previous execution state, ready for model consumption. Example: `python3 assemble-verifier-prompt.py --task task-1 --diffs diff-context.json --state state.json --output verifier-prompt.md`.

- **collect-diff-context.py** — Gathers git diffs and file snapshots for the current branch to provide execution context to verifiers. Example: `python3 collect-diff-context.py --branch feature-x --output diff-context.json`.

- **compute-verifier-file-set.py** — Computes the verifier-visible file set per the Step 11.2 union rule, from task-declared, worker-reported, and orchestrator-observed inputs. Wave-shape-specific scoping (single-task or parallel-multi-task). Example: `python3 compute-verifier-file-set.py --task-files task.json --worker-files worker.json --observed-status status.txt --observed-diff-paths diff.json --wave-shape single-task`.

- **extract-plan-tasks.py** — Parses a structured plan document and extracts tasks, dependencies, and acceptance criteria. Validates required top-level sections, dependency reference targets, and dependency cycles, and emits a waves array (with sub-wave splitting at MAX_PARALLEL_HARD_CAP) for use by Step 5 of execute-plan. Example: `python3 extract-plan-tasks.py --plan plan.md --max-parallel-hard-cap 8`.

- **parse-coder-report.py** — Parses a coder worker's STATUS / files-changed / concerns blocks per execute-task-prompt.md's Report Format. Used by Steps 9, 10, and 11 of execute-plan for status routing, BLOCKED/CONCERNED task building, and files-changed extraction. Example: `python3 parse-coder-report.py --report final-message.txt`.

- **parse-verifier-report.py** — Extracts structured results (pass/fail, findings, recommendations) from verifier output and validates against acceptance criteria. Example: `python3 parse-verifier-report.py --report verifier-output.md --criteria criteria.json --output results.json`.

## Running tests

Tests live in the `tests/` subdirectory and use Python's unittest framework.

To run tests directly:
```bash
cd agent
python3 -m unittest discover -s skills/execute-plan/scripts/tests -p "test_*.py"
```

To run tests as part of the full integration check:
```bash
cd agent
npm run test:helpers
```

This will run both shared and execute-plan helper tests in sequence.
