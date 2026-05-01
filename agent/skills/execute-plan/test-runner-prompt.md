# Test Runner Prompt

Prompt template dispatched to `test-runner` subagents for executing a test suite and capturing failing-test identifiers. Fill placeholders before sending. Do not add sections beyond what this template defines.

## Test Command

{TEST_COMMAND}

## Working Directory

{WORKING_DIR}

## Artifact Output Path

{ARTIFACT_PATH}

## Phase Label

{PHASE_LABEL}

## Task

Run the test command from `## Test Command` exactly as supplied, from the directory in `## Working Directory`, via `bash`. Capture combined stdout+stderr and the exit code.

Apply the Step 7 identifier-extraction contract (per the verbatim documentation in your agent definition) to derive the set of failing-test identifiers. Use the suite-native unique per-test identifier verbatim — no normalization, no synthesis. For any failure with no stable suite-native identifier (e.g. a crash before test names, a build / collection error), record the failure under `NON_RECONCILABLE_FAILURES:` per the contract in your agent definition rather than inventing an identifier.

Write the artifact exactly once to the path in `## Artifact Output Path` using the format documented in your agent definition (`## Artifact Format`) — including BOTH the `FAILING_IDENTIFIERS:` block (stable identifiers) and the `NON_RECONCILABLE_FAILURES:` block (non-reconcilable evidence) in the documented order, with the value from `## Phase Label` filled into the `PHASE:` header line. Do NOT modify any other file. Do NOT run `git`, `mkdir`, or any other command beyond the supplied test command. The orchestrator has already created the parent directory for the artifact path.

## Output

End your final assistant message with exactly one anchored line on its own line, as the very last line of your output: `TEST_RESULT_ARTIFACT: <absolute path>` where `<absolute path>` is character-for-character identical to the path in `## Artifact Output Path`. Do not emit any other structured markers in your response.

## Rules

- Run the test command from `## Test Command` exactly as supplied — do NOT add flags, expand variables, paraphrase, or split commands.
- Run from `## Working Directory` only.
- Perform exactly ONE write to `## Artifact Output Path` per dispatch.
- Do NOT consult or mention `baseline_failures`, prior runs, or any cross-wave state.
- Record any failure that has no stable suite-native identifier under NON_RECONCILABLE_FAILURES per the contract — never as a raw line in FAILING_IDENTIFIERS.
- Do NOT classify the run as pass/fail. Reconciliation is the caller's responsibility.
- Do NOT modify any source file; do NOT run `git` commands; do NOT run any command other than the supplied test command from `## Test Command`.
- Final assistant message ends with `TEST_RESULT_ARTIFACT: <absolute path>` and contains no other structured markers.
