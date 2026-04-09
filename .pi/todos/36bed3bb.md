{
  "id": "36bed3bb",
  "title": "Improve guardrails.ts by keeping HEAD structure and restoring key safety tripwires",
  "tags": [
    "guardrails",
    "extension",
    "safety"
  ],
  "status": "done",
  "created_at": "2026-04-09T00:55:15.751Z"
}

## Goal
Evolve `agent/extensions/guardrails.ts` from the current `HEAD` version rather than reverting to `fcb6923`.

## Outcome
Completed.

`agent/extensions/guardrails.ts` was evolved from the current `HEAD` architecture rather than reverting to `fcb6923`.
The implementation now better matches the intended role of the file: pragmatic guardrails for common unsafe or dubious operations, with clarity, maintainability, and simplicity prioritized over exhaustive shell parsing. The file remains explicitly positioned as a guardrail layer that works alongside sandboxing rather than replacing it.

## Summary of completed work

### Architecture kept and improved
Preserved the current HEAD foundation:
- `getPathCandidates()` with absolute + resolved path handling
- helper-based classification:
  - `bashWriteProtectedPath()`
  - `hardProtectedPath()`
  - `softProtectedPath()`
- explicit helpers such as:
  - `isEnvFile()`
  - `isDevVarsFile()`
  - `isSshKeyName()`
  - `isCredentialsPath()`

Improved maintainability by:
- grouping hard-protected segments into `HARD_PROTECTED_SEGMENTS`
- splitting Python-generated tool/cache directories into `PYTHON_TOOL_AND_CACHE_SEGMENTS`
- grouping soft-protected basenames into `SOFT_PROTECTED_BASENAMES`
- adding a descriptive file header documenting philosophy and concrete policy

### Dangerous command tripwires restored / refined
Implemented or restored:
- raw device overwrite detection via extracted write-target classification
- `kill -9 -1`
- fork bomb detection
- existing dangerous command confirmations retained for:
  - recursive delete
  - `find ... -delete` / `find ... -exec rm`
  - `sudo`
  - `mkfs`
  - dangerous `chmod 777`

Refined raw-device handling by:
- removing the large raw-device command regex
- adding `isRawDevicePath(...)`
- broadening coverage to common device families and macOS partition forms:
  - `/dev/sdX`
  - `/dev/vdX`
  - `/dev/xvdX`
  - `/dev/nvme...`
  - `/dev/diskN`
  - `/dev/diskNsM`
  - `/dev/rdiskN`
  - `/dev/rdiskNsM`
  - `/dev/mmcblk...`
- replacing the broad `dd ... of=/dev/...` regex with heuristic extraction of `dd` output targets so `dd` now reuses `isRawDevicePath(...)`
- allowing safe pseudo-devices like `/dev/null`

### Bash-write policy improved
Expanded bash-mediated protected-write detection to reuse hard-protected path policy, covering sensitive targets such as:
- `.env*` / `.dev.vars*`
- `.git`
- `.ssh`
- `node_modules`
- Python virtual environments
- Python-generated tool/cache directories
- secrets files
- structured credentials files
- `.pypirc`
- Cargo credentials

Supported heuristic bash write forms now include:
- redirection (`>`, `>>`)
- `tee`
- `cp`
- `mv`
- `dd` output targets

Decision made intentionally **not** to add `install` write-target detection because it would add parser complexity for a less common form and does not fit the desired philosophy of simple, maintainable heuristics.

### UI/headless behavior improved
Implemented:
- `notifyIfUI(...)` so warnings do not assume UI availability
- `confirmDangerousCommand(...)` to centralize dangerous-command confirmation/blocking behavior in UI and headless contexts

### Policy trims / simplifications
Adjusted policy to stay high-signal and maintainable:
- removed `gradle-wrapper.jar` from soft-protected basenames
- removed `.gradle` from hard-protected segments
- kept `gradle-wrapper.properties` soft-protected
- kept Python cache/tool directories hard-protected but grouped separately for clarity

## Verification and test coverage
Added a comprehensive automated test file:
- `agent/extensions/guardrails.test.ts`

Representative test coverage now includes:
- dangerous commands:
  - `kill -9 -1`
  - raw device writes / redirects
  - `rm -rf`
  - `find -delete`
  - `find -exec rm`
  - `mkfs`
  - fork bomb
  - ordinary `chmod 755` allowed
- protected write/edit paths:
  - `.env`
  - `.env.local`
  - `.dev.vars`
  - `.ssh/id_ed25519`
  - `config/secrets.yaml`
  - `.git/config`
  - `node_modules/...`
  - `.venv/...`
  - Python tool/cache dirs
  - structured credentials files
  - docs/credentials allow case
  - public SSH key allow case
  - `.env.example` allow case
- soft-protected paths:
  - no-UI blocking
  - UI cancel flow
  - UI allow flow
  - representative lockfiles including:
    - `package-lock.json`
    - `yarn.lock`
    - `pnpm-lock.yaml`
    - `poetry.lock`
    - `Cargo.lock`
    - `go.sum`
- bash-write allow/block cases:
  - `.env.example` allowed
  - secrets / credentials / `.pypirc` / Cargo credentials blocked
- UI confirmation flows for dangerous commands and raw-device writes
- unrelated tool calls returning `undefined`

### Final verification evidence
Commands run:
- `bun test agent/extensions/guardrails.test.ts`
- `bun test --coverage agent/extensions/guardrails.test.ts`

Final results:
- `41 pass`, `0 fail`
- Coverage for `agent/extensions/guardrails.ts`:
  - `100% funcs`
  - `99.09% lines`

The only remaining uncovered lines are the filesystem-root fallback in `resolveNearestExistingPath()` (`parent === current`), which is difficult to hit under normal filesystem behavior and does not represent an untested policy path.

## Final assessment
The todo is complete. Remaining potential work would be optional future policy changes rather than unfinished items from this plan.
