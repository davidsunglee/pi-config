# Using Git Worktrees skill

Create an isolated git worktree for feature work while respecting project conventions and safety checks.

## When to use

Use when starting feature work that should not mix with the current checkout. `execute-plan` uses this when plan execution starts from a main-like branch and the default workspace is a new worktree.

## Directory selection priority

1. Existing `.worktrees/` directory.
2. Existing `worktrees/` directory.
3. Project configuration mentioning a worktree directory.
4. Ask the user between a project-local `.worktrees/` and a global `$HOME/.config/pi/worktrees/<project>/` location.

If both project-local directories exist, `.worktrees/` wins.

## Safety verification

For project-local worktree roots, verify the directory is ignored with `git check-ignore` before creating a worktree. If it is not ignored, add the correct `.gitignore` entry and commit that safety fix before proceeding.

Global worktree locations do not need project `.gitignore` verification because they are outside the repository.

## Creation flow

1. Detect the project name from `git rev-parse --show-toplevel`.
2. Build a flat path using a branch name without slashes where possible.
3. Run `git worktree add <path> -b <branch>`.
4. Change into the new worktree.
5. Auto-detect setup commands from project files (`package.json`, `Cargo.toml`, `requirements.txt`, `pyproject.toml`, `go.mod`).
6. Run a baseline test suite.
7. Report the worktree path and baseline status.

## Why slash-free branch names matter

A branch name containing `/` creates nested directories under the worktree root. The skill prefers flat branch names such as `execute-plan-enhancements` to simplify cleanup and path handling.

## Failure handling

If baseline tests fail, report the failures and ask whether to proceed or investigate. Do not silently treat a failing baseline as acceptable.

## Related skills

- `finishing-a-development-branch` — cleans up worktrees after merge or discard.
- `execute-plan` — invokes this skill for isolated plan execution.

## Files

- `SKILL.md` — worktree selection, creation, setup, and safety procedure.
