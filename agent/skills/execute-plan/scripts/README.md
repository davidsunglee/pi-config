# Execute-plan workflow helpers

## Why this exists

The `execute-plan/scripts/` directory contains Python helpers that support the plan execution workflow. These tools handle task extraction, diff analysis, verifier prompt assembly, and verifier report parsing.

## Helpers

- **extract-plan-tasks.py** — Parses a structured plan document and extracts discrete tasks, dependencies, and acceptance criteria. Example: `python3 extract-plan-tasks.py --plan plan.md --output tasks.json`.

- **collect-diff-context.py** — Gathers git diffs and file snapshots for the current branch to provide execution context to verifiers. Example: `python3 collect-diff-context.py --branch feature-x --output diff-context.json`.

- **assemble-verifier-prompt.py** — Constructs a verifier prompt from task specification, diffs, and previous execution state, ready for model consumption. Example: `python3 assemble-verifier-prompt.py --task task-1 --diffs diff-context.json --state state.json --output verifier-prompt.md`.

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
