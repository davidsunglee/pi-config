# Fast-lane workflow helpers

## Why this exists

The `fast-lane/scripts/` directory contains deterministic, testable Python helpers that support the fast-lane workflow coordinator.

## Helpers

- **recommend-workflow.py** (legacy / non-authoritative) — A shallow heuristic that inspects a spec markdown file (presence of an `## Approach` section, Requirements bullet count vs. a threshold, flagged keywords in `## Non-Goals`) and emits a `fast-lane` vs. `deep-workflow` JSON recommendation. **No longer authoritative.** `define-spec` Step 8 used to invoke this helper and surface its output directly; that responsibility now lives with the orchestrating LLM, which reads the committed spec and judges scope/risk signals (cross-skill, parser/protocol, provenance/trust, orchestration semantics) that this helper cannot see. The helper is retained as an optional supporting signal extractor and for backwards compatibility — callers must not treat its output as the final recommendation. Example: `python3 recommend-workflow.py --spec-path docs/specs/foo.md --requirements-threshold 6`.

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
