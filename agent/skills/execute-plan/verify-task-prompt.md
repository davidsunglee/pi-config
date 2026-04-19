# Verify Task Prompt

Prompt template dispatched to `verifier` subagents for a single plan task. Fill placeholders before sending. Do not add sections beyond what this template defines.

## Task Spec

{TASK_SPEC}

## Acceptance Criteria

{ACCEPTANCE_CRITERIA_WITH_VERIFY}

## Orchestrator Command Evidence

The orchestrator has already executed every command-style `Verify:` recipe for this task and captured the exact command, exit status, stdout, and stderr. You MUST rely on this evidence for command-style recipes — do NOT re-run commands.

Each block has the header `[Evidence for Criterion N]` (where `N` is the 1-based criterion number in plan order), followed by these fields in this order: `command: <exact command>`, `exit_code: <status>`, `stdout:` (fenced), `stderr:` (fenced). If a criterion has no command-style recipe, it has no evidence block — gaps in numbering are expected. Cite a block as `evidence: Evidence for Criterion N` in your per-criterion verdicts.

{ORCHESTRATOR_COMMAND_EVIDENCE}

If this section is empty, the task has no command-style recipes and all verification is via file inspection or prose inspection.

## Verifier-Visible Files

The orchestrator has assembled the list below as the authoritative file set for this verification. It is the deduplicated union of:

1. The task's declared `**Files:**` scope from the plan (authoritative — the task is on the hook for every file it claimed),
2. The worker's self-reported `## Files Changed` (informative but NOT authoritative on its own), and
3. Orchestrator-observed changes in the working tree for this task (via `git status --porcelain` and `git diff HEAD`).

Do NOT treat this list as a worker self-report. A worker that omits a file from its own `## Files Changed` cannot narrow this set, and a file declared in the task's `**Files:**` scope always appears here even if the worker claims it was untouched.

For file-inspection recipes, read only these files plus any files explicitly named by a specific `Verify:` recipe. Do not browse the codebase.

{MODIFIED_FILES}

## Diff Context

The orchestrator may have truncated this diff if it exceeded a size threshold. If you see a truncation marker line in the diff — any single line indicating that diff content was omitted — note this in your per-criterion `reason:` where it affects judgment, and fall back to reading the file(s) in `## Verifier-Visible Files` directly for any file-inspection criterion whose relevant code may lie in the truncated window.

{DIFF_CONTEXT}

## Working Directory

Operate from: `{WORKING_DIR}`

All paths in this prompt are relative to that directory unless otherwise stated.

## Rules

- You are judge-only. Do NOT run shell commands.
- Do NOT read files outside `## Verifier-Visible Files` unless a `Verify:` recipe explicitly names them by path.
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
