# Shared workflow helpers

## Why this exists

The `_shared/scripts/` directory contains deterministic, testable Python helpers used across multiple coordinator and skill workflows. These helpers handle common tasks like template filling, artifact parsing, and provenance validation.

## Helpers

- **resolve-model-dispatch.py** — Parses the coordinator's model dispatch signal and resolves which Claude model to use for the current task step. Example: `python3 resolve-model-dispatch.py --dispatch-output dispatch.json --task-id step-1`.

- **parse-artifact-handoff.py** — Extracts artifact metadata from a handoff payload, resolving references and validating that all required files exist. Example: `python3 parse-artifact-handoff.py --handoff handoff.json --validate`.

- **validate-review-provenance.py** — Validates that code review metadata (timestamps, reviewer info, decision rationale) meets compliance requirements. Example: `python3 validate-review-provenance.py --provenance review.json --strict`.

- **fill-template.py** — Renders a Jinja2 template with provided context, handling conditional blocks and escaping. Example: `python3 fill-template.py --template prompt.jinja --context context.json --output prompt.md`.

## Running tests

Tests live in the `tests/` subdirectory and use Python's unittest framework.

To run tests directly:
```bash
cd agent
python3 -m unittest discover -s skills/_shared/scripts/tests -p "test_*.py"
```

To run tests as part of the full integration check:
```bash
cd agent
npm run test:helpers
```

This will run both shared and execute-plan helper tests in sequence.
