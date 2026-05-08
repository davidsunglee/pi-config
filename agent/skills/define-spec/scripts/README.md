# Define-spec helpers

## Why this exists

This directory hosts the `detect-mux-backend.py` env-and-PATH probe used by `define-spec/SKILL.md` Step 1. Per the placement rationale in `docs/specs/2026-05-07-finish-mechanical-helpers.md`'s Open Questions, this single-consumer placement matches the predecessor convention. If a future consumer needs the helper, migrate it to `_shared/scripts/`.

## Helpers

- **detect-mux-backend.py** — Probes env vars (`PI_SUBAGENT_MODE`, `PI_SUBAGENT_MUX`, `CMUX_SOCKET_PATH`, `TMUX`, `ZELLIJ`, `ZELLIJ_SESSION_NAME`, `WEZTERM_UNIX_SOCKET`) and `PATH` for available mux backends; supports user-input override scan; returns `{branch, backend, reason, status_message}` JSON. Example: `python3 detect-mux-backend.py --user-input "/define-spec foo --no-subagent"`.

## Running tests

Tests live in the `tests/` subdirectory and use Python's unittest framework.

To run tests directly:
```bash
cd agent
python3 -m unittest discover -s skills/define-spec/scripts/tests -p "test_*.py"
```

To run tests as part of the full integration check:
```bash
cd agent
npm run test:helpers
```
