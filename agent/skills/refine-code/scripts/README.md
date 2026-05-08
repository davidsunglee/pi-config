# Refine-code helpers

## Why this exists

This directory hosts mechanical helpers for refine-code workflows — coordinator-prompt assembly and outer-summary parsing.

## Helpers

- **fill-refine-code-prompt.py** — Fills `agent/skills/refine-code/refine-code-prompt.md` from explicit inputs (plan goal, plan contents, base/head SHAs, working dir, review output path, max iterations, model matrix). Example: `python3 fill-refine-code-prompt.py --plan-goal goal.md --plan-contents plan.md --base-sha abc1234 --head-sha def5678 --review-output-path docs/reviews/foo --max-iterations 3 --model-matrix matrix.json --working-dir /tmp/work --output prompt.md`.

- **parse-refine-code-summary.py** — Parses the compact `refine-code` coordinator summary documented in `refine-code-prompt.md` Output Format. Example: `python3 parse-refine-code-summary.py --summary <(cat /tmp/refine-code-output.txt)`.

## Running tests

Tests live in the `tests/` subdirectory and use Python's unittest framework.

To run tests directly:
```bash
cd agent
python3 -m unittest discover -s skills/refine-code/scripts/tests -p "test_*.py"
```

To run tests as part of the full integration check:
```bash
cd agent
npm run test:helpers
```
