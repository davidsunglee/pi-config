# Refine-plan helpers

## Why this exists

This directory hosts mechanical helpers for refine-plan workflows — coordinator-prompt assembly and outer-summary parsing.

## Helpers

- **fill-refine-plan-prompt.py** — Fills `agent/skills/refine-plan/refine-plan-prompt.md` from explicit inputs (plan goal, plan contents, base/head SHAs, working dir, review output path, max iterations, model matrix). Example: `python3 fill-refine-plan-prompt.py --plan-goal goal.md --plan-contents plan.md --base-sha abc1234 --head-sha def5678 --review-output-path docs/reviews/foo --max-iterations 3 --model-matrix matrix.json --working-dir /tmp/work --output prompt.md`.

- **parse-refine-plan-summary.py** — Parses the compact `refine-plan` coordinator summary documented in `refine-plan-prompt.md` Output Format. Example: `python3 parse-refine-plan-summary.py --summary <(cat /tmp/refine-plan-output.txt)`.

## Running tests

Tests live in the `tests/` subdirectory and use Python's unittest framework.

To run tests directly:
```bash
cd agent
python3 -m unittest discover -s skills/refine-plan/scripts/tests -p "test_*.py"
```

To run tests as part of the full integration check:
```bash
cd agent
npm run test:helpers
```
