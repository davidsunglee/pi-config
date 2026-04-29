### Status

**[Issues Found]**

### Issues

**[Error] — Task 9: Corrupted provenance smoke does not exercise the calling skills**
- **What:** Smoke 4 mutates copies of review files under `/tmp` and then says to “manually apply” `refine-code/SKILL.md` Step 6 and `refine-plan/SKILL.md` Step 9.5. It does not invoke the live `refine-code` or `refine-plan` skills in a way that confirms the calling skill surfaces the validation failure.
- **Why it matters:** The spec explicitly requires “a manual smoke run that mutates a coordinator-written review file … confirms the calling skill surfaces a validation failure rather than silently reporting success.” Manual application of the procedure verifies the written instructions, but not the live skill behavior or caller-facing reporting path.
- **Recommendation:** Revise Smoke 4 so it exercises the actual calling-skill validation path, or explicitly add a justified procedure for injecting a corrupted coordinator-returned review path into a live skill run and capturing the caller-facing validation error.

**[Warning] — Task 9: Coordinator-unavailable smoke uses an ambiguous model example**
- **What:** Smoke 3 suggests dispatching with `model: "<a model whose dispatch is not pi, e.g., claude-sonnet-4-6>"`, which is not fully-qualified.
- **Why it matters:** Subagent dispatch generally needs an unambiguous provider/model identifier. A bare model name may be unavailable or ambiguous, causing the smoke run to fail for the wrong reason.
- **Recommendation:** Use the fully-qualified non-`pi` model already referenced earlier, e.g. `anthropic/claude-sonnet-4-6`, or instruct the executor to resolve and use a concrete fully-qualified model from `model-tiers.json`.

### Summary

The plan is well-structured overall: it covers the shared dispatch helper, both skill alignments, prompt hardening, agent identity rules, static consistency review, and manual smoke coverage. Dependency ordering and task sizing are generally sound, and the acceptance criteria mostly include concrete one-to-one `Verify:` recipes. However, Task 9’s corrupted-provenance smoke does not actually prove the calling skills surface validation failures, leaving one spec acceptance criterion insufficiently covered. I found 1 error and 1 warning; the plan should be revised before execution.
