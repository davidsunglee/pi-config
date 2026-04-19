# Verify Task Prompt

Prompt template dispatched to `verifier` subagents for a single plan task. Fill placeholders before sending. Do not add sections beyond what this template defines.

## Task Spec

{TASK_SPEC}

## Acceptance Criteria

{ACCEPTANCE_CRITERIA_WITH_VERIFY}

## Orchestrator Command Evidence

The orchestrator has already executed every command-style `Verify:` recipe for this task and captured the exact command, exit status, stdout, and stderr. You MUST rely on this evidence for command-style recipes — do NOT re-run commands.

{ORCHESTRATOR_COMMAND_EVIDENCE}

If this section is empty, the task has no command-style recipes and all verification is via file inspection or prose inspection.

## Modified Files

The task modified the following files. For file-inspection recipes, read only these files plus any files explicitly named by a recipe. Do not browse the codebase.

{MODIFIED_FILES}

## Diff Context

{DIFF_CONTEXT}

## Working Directory

Operate from: `{WORKING_DIR}`

All paths in this prompt are relative to that directory unless otherwise stated.

## Rules

- You are judge-only. Do NOT run shell commands.
- Do NOT read files outside `## Modified Files` unless a `Verify:` recipe explicitly names them by path.
- Every criterion gets a binary verdict: `PASS` or `FAIL`. Any `FAIL` means the overall verdict is `FAIL`.
- If evidence is missing, return `FAIL` with `reason:` explaining what is missing. Do not guess.

## Report Format

Use this exact structure:

```
## Per-Criterion Verdicts

[Criterion 1] <PASS | FAIL>
  recipe: <the Verify: recipe text>
  evidence: <command-evidence block number, file path + line range, or diff hunk>
  reason: <one or two sentences>

[Criterion 2] <PASS | FAIL>
  recipe: ...
  evidence: ...
  reason: ...

## Overall Verdict

VERDICT: <PASS | FAIL>
summary: <one paragraph>
```
