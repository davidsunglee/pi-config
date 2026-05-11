# Fast-lane workflow helpers

## Why this exists

The `fast-lane/scripts/` directory contains deterministic, testable Python helpers that support the fast-lane workflow coordinator. These helpers analyze specification characteristics and recommend workflow routing based on complexity and structure.

## Helpers

- **recommend-workflow.py** — Analyzes a specification markdown file to recommend either `fast-lane` or `deep-workflow` routing based on presence of an Approach section, requirements count, and flagged keywords in Non-Goals. Example: `python3 recommend-workflow.py --spec-path docs/specs/foo.md --requirements-threshold 6`.

## Running tests

Tests live in the `tests/` subdirectory and use Python's unittest framework.

To run tests directly:
```bash
cd agent
python3 -m unittest discover -s skills/fast-lane/scripts/tests -p "test_*.py"
```

To run tests as part of the full integration check:
```bash
cd agent
npm run test:helpers
```

This will run both shared and fast-lane helper tests in sequence.
