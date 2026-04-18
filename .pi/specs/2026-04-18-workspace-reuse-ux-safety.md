# Execute-Plan Workspace Reuse UX Safety

Source: TODO-8ddd2e17

## Goal

Make `execute-plan` safer and more explicit when it decides to reuse an existing workspace instead of creating a new worktree. Users should always be able to see which workspace path is being used and why, and they should get an intervention point when reuse would mix the current run with existing uncommitted work.

## Context

`agent/skills/execute-plan/SKILL.md` currently auto-detects whether execution should stay in the current workspace by checking whether the user is already on a feature branch or in a worktree. In that case, the settings summary shows `current workspace (on <branch-name>)` and execution proceeds without prompting. If the user is on `main`/`master`/`develop` and not in a worktree, the skill instead defaults to a new worktree and defers creation to the `using-git-worktrees` flow. The current workflow surfaces the workspace mode, but it does not require an explicit log of the concrete workspace path being reused, and it does not define a warning/decision point when the reused workspace already contains local changes.

## Requirements

- When `execute-plan` reuses an existing workspace instead of creating a new worktree, it must log the exact workspace path being used.
- The reuse log must also state why that workspace was selected, distinguishing at minimum between reuse caused by feature-branch detection and reuse caused by worktree detection.
- The reuse logging and safety behavior must apply to any reused existing workspace, including both plain feature-branch reuse and worktree reuse.
- Before proceeding in a reused workspace, `execute-plan` must check whether the workspace is dirty.
- A workspace must be treated as dirty if git reports any modified tracked files, staged changes, or untracked files.
- If the reused workspace is clean, `execute-plan` must auto-proceed after logging the path and reuse reason, without requiring an extra confirmation.
- If the reused workspace is dirty, `execute-plan` must warn the user before continuing.
- For a dirty reused workspace, `execute-plan` must offer three choices: continue in the current workspace, quit, or create a new worktree instead.
- If the user chooses to create a new worktree instead of reusing the dirty workspace, `execute-plan` must use the existing normal new-worktree flow, including suggesting a fresh branch name derived from the plan filename.

## Constraints

- This spec covers only workspace reuse UX and safety in `execute-plan`.
- Do not include changes for `BLOCKED` escalation behavior from the source todo in this spec.
- Do not include project-local `model-tiers.json` override behavior from the source todo in this spec.
- Do not require confirmation for clean reused workspaces.
- Do not attempt heuristic detection of whether existing commits are “stale,” “abandoned,” or unrelated to the current plan in this first pass.
- Reuse safety should extend the existing workspace-selection behavior rather than replacing the current new-worktree flow.

## Acceptance Criteria

- When `execute-plan` auto-reuses an existing clean workspace, the user sees an explicit message identifying the workspace path and the reason it was reused, and execution continues without an extra prompt.
- When `execute-plan` auto-reuses an existing dirty workspace, the user sees a warning before execution proceeds.
- The dirty-workspace warning is triggered by any modified tracked file, staged change, or untracked file.
- For a dirty reused workspace, the user can choose to continue, quit, or create a new worktree instead.
- Choosing “create a new worktree instead” transitions into the same new-worktree path the workflow would use for fresh worktree creation, including the normal suggested branch naming behavior.
- The behavior is the same whether reuse was triggered by already being on a feature branch or by already being inside a worktree.
- No new prompt is added for clean reused workspaces beyond the explicit reuse log.

## Non-Goals

- Redesigning the overall workspace-selection UX in `execute-plan`.
- Changing the default behavior when starting from `main`/`master`/`develop`.
- Adding stale-commit or plan-history heuristics.
- Addressing `BLOCKED` escalation timing.
- Adding project-local model-tier override resolution.
