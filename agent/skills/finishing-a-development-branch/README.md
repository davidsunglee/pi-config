# Finishing a Development Branch skill

Guide the user through the end of implementation work: verify tests, choose a completion path, and clean up safely.

## When to use

Use when implementation is complete and the next step is merge, pull request creation, preserving the branch, or discarding the work. `execute-plan` invokes this near the end of its workflow.

## Core flow

1. Verify the project test suite passes.
2. Determine the likely base branch.
3. Present exactly four options.
4. Execute the selected option.
5. Clean up worktrees only when appropriate.

## The four options

1. **Merge back locally** — switch to the base branch, pull, merge the feature branch, verify tests on the merged result, delete the feature branch, and clean up the worktree.
2. **Push and create a Pull Request** — push the feature branch and use `gh pr create` with summary and test-plan sections. The worktree is preserved.
3. **Keep the branch as-is** — report the branch and path, with no cleanup.
4. **Discard this work** — require typed `discard` confirmation before deleting commits/branch/worktree.

## Safety rules

- Do not present merge/PR/discard options until tests pass.
- Do not merge without verifying tests on the merged result.
- Do not delete work without typed confirmation.
- Do not clean up worktrees for the keep-as-is path.
- Keep the option list concise and fixed; avoid open-ended “what next?” prompts.

## Related skills

- `using-git-worktrees` — creates the worktrees this skill may clean up.
- `requesting-code-review` — useful before merge or PR creation.
- `verification-before-completion` — reinforces the evidence-before-claims rule.

## Files

- `SKILL.md` — branch completion procedure and safety rules.
