# Execute-plan workflow helpers

## Why this exists

The `execute-plan/scripts/` directory contains Python helpers that support the plan execution workflow. These tools handle task extraction, diff analysis, verifier prompt assembly, and verifier report parsing.

## Helpers

- **extract-plan-tasks.py** — Parses a structured plan document and extracts discrete tasks, dependencies, and acceptance criteria. Example: `python3 extract-plan-tasks.py --plan plan.md --output tasks.json`.

- **collect-diff-context.py** — Gathers git diffs and file snapshots for the current branch to provide execution context to verifiers. Example: `python3 collect-diff-context.py --branch feature-x --output diff-context.json`.

- **assemble-verifier-prompt.py** — Constructs a verifier prompt from task specification, diffs, and previous execution state, ready for model consumption. Example: `python3 assemble-verifier-prompt.py --task task-1 --diffs diff-context.json --state state.json --output verifier-prompt.md`.

- **parse-verifier-report.py** — Extracts structured results (pass/fail, findings, recommendations) from verifier output and validates against acceptance criteria. Example: `python3 parse-verifier-report.py --report verifier-output.md --criteria criteria.json --output results.json`.

- **parse-test-runner-artifact.py** — Parses a `test-runner` artifact's structured header per `agent/agents/test-runner.md` `## Artifact Format`; returns `EXIT_CODE`, `FAILING_IDENTIFIERS`, `NON_RECONCILABLE_FAILURES`, and other header fields as JSON. Example: `python3 parse-test-runner-artifact.py --artifact docs/test-runs/sample.log`.

- **assemble-coder-prompt.py** — Fills `agent/skills/execute-plan/execute-task-prompt.md` with task spec, context, working directory, and an optional TDD block. Example: `python3 assemble-coder-prompt.py --task-spec spec.md --context ctx.md --working-dir /tmp/work --tdd-block enabled --output prompt.md`.

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
