# Shared workflow helpers

## Why this exists

The `_shared/scripts/` directory contains deterministic, testable Python helpers used across multiple coordinator and skill workflows. These helpers handle common tasks like template filling, artifact parsing, and provenance validation.

## Helpers

- **resolve-model-dispatch.py** — Parses the coordinator's model dispatch signal and resolves which Claude model to use for the current task step. Example: `python3 resolve-model-dispatch.py --dispatch-output dispatch.json --task-id step-1`.

- **parse-artifact-handoff.py** — Extracts artifact metadata from a handoff payload, resolving references and validating that all required files exist. Example: `python3 parse-artifact-handoff.py --handoff handoff.json --validate`.

- **parse-test-runner-artifact.py** — Parses a `test-runner` artifact's structured header per `agent/agents/test-runner.md` `## Artifact Format`; returns `EXIT_CODE`, `FAILING_IDENTIFIERS`, `NON_RECONCILABLE_FAILURES`, and other header fields as JSON. Tolerates an absent `PHASE:` header line. Example: `python3 parse-test-runner-artifact.py --artifact docs/test-runs/sample.log`.

- **validate-review-provenance.py** — Validates that code review metadata (timestamps, reviewer info, decision rationale) meets compliance requirements. Example: `python3 validate-review-provenance.py --provenance review.json --strict`.

- **fill-template.py** — Renders a Jinja2 template with provided context, handling conditional blocks and escaping. Example: `python3 fill-template.py --template prompt.jinja --context context.json --output prompt.md`.

- **extract-provenance-preamble.py** — Extracts `Source: TODO-...`, `Scout brief: docs/briefs/...`, and `Git SHA: <40-hex>` lines from a bounded preamble region of a markdown file. Example: `python3 extract-provenance-preamble.py --file docs/specs/foo.md --mode spec`.

- **cleanup-pycache.py** — Validated removal of every `__pycache__` directory under a target tree. Refuses `..` traversal, paths outside cwd, and paths matching protected segments (`.git`, `.ssh`, `node_modules`, `.venv`, `venv`). Example: `python3 cleanup-pycache.py agent`.

- **classify-workflow-drift.py** — Classifies repository drift since a scout brief's `Git SHA:` against the workflow-artifact allowlist; returns one of six outcome tags plus a verbatim message body. Example: `python3 classify-workflow-drift.py --brief-path docs/briefs/foo.md --working-dir .`.

- **cleanup-test-runs.py** — Validated cleanup of a per-plan `docs/test-runs/<plan-name>/` directory. Refuses `..` traversal, paths outside cwd, paths matching protected segments (`.git`, `.ssh`, `node_modules`, `.venv`, `venv`), and paths outside `<cwd>/docs/test-runs/`. Example: `python3 cleanup-test-runs.py docs/test-runs/my-plan`.

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
