# Code Review: 46f18c1^..46f18c1

## Summary

This commit adds a `dispatch` map to `agent/model-tiers.json` and threads dispatch resolution through the touched skill files. The routing logic itself is coherent and the explicit subagent call updates are thorough.

## Findings

### Important — top-level docs are still stale about routing configuration and final review flow

- **Files:** `README.md:137-139`, `README.md:180-184`
- **What:** `README.md` still says model tiers are resolved from `settings.json`, which conflicts with the new `agent/model-tiers.json` + `dispatch` map. It also still describes the old final-review flow, even though `execute-plan` now hands post-wave review to `refine-code`.
- **Why it matters:** The commit’s goal is to make dispatch routing consistently documented. Leaving the main repo docs stale will mislead readers about both the configuration source and the current review pipeline.
- **Recommendation:** Update the top-level docs to reference `agent/model-tiers.json` and the current post-wave review flow.

### Minor — `requesting-code-review` metadata is still out of sync with execution flow

- **Files:** `agent/skills/requesting-code-review/SKILL.md:3,13-16`
- **What:** This skill still says it is used after all plan execution waves complete, but `execute-plan` now invokes `refine-code` instead of this skill for the mandatory post-plan review path.
- **Why it matters:** The file was touched in this commit, so its description and “When to Request Review” section should reflect the current workflow.
- **Recommendation:** Clarify that this skill is the standalone/manual review path, not the post-`execute-plan` mandatory path.

### Minor — standalone review still lacks explicit dispatch-failure handling

- **Files:** `agent/skills/requesting-code-review/SKILL.md:44-60`
- **What:** The skill now resolves a `dispatch` target, but it does not say what to do if that dispatch fails. The other touched flows document fallback or retry behavior.
- **Why it matters:** This leaves the standalone review path as the only touched flow without a recovery rule if the chosen dispatch backend is unavailable.
- **Recommendation:** Add a short fallback policy for dispatch failure, or explicitly defer to the subagent layer’s default behavior.

## Strengths

1. Dispatch resolution is centralized cleanly in `execute-plan` and cross-referenced from the other skills.
2. All touched explicit subagent call sites now include `dispatch`.
3. Fallback re-resolution is documented correctly where provider changes alter the dispatch target.
4. The new `dispatch` map defaults safely to `pi` when absent.

## Assessment

**Ready to merge: With fixes**
