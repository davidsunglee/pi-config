# Plan Generation Task

Analyze the codebase at `{WORKING_DIR}` and produce a structured implementation plan.

## Task

{TASK_DESCRIPTION}

## Provenance

{TASK_ARTIFACT}

{SOURCE_TODO}

{SOURCE_SPEC}

{SCOUT_BRIEF}

## Artifact Reading Contract

- If a `Task artifact:` line appears in `## Provenance`, that file on disk is the authoritative task specification. Read it in full from disk before planning. The orchestrator has NOT inlined its contents into this prompt — do not assume the task body is quoted in `## Task` above.
- If a `Scout brief:` line appears in `## Provenance`, read that brief file from disk as well and treat it as primary context alongside the task artifact. Its contents are also NOT inlined here.
- If a referenced scout brief file is missing on disk, note it in your analysis and continue planning without it.
- If neither `Task artifact:` nor `Scout brief:` is present, the task body is fully contained in the `## Task` section above.

## Output

Write the plan to `{OUTPUT_PATH}`.

Create the directory if it doesn't exist.
