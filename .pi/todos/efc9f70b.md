{
  "id": "efc9f70b",
  "title": "Add review-remediate loop to final code review in execute-plan",
  "tags": ["execute-plan", "code-review", "workflow"],
  "status": "open",
  "created_at": "2026-04-13T20:00:00.000Z"
}

## Problem

The final code review (execute-plan Step 12) is fire-and-forget. A cross-provider reviewer is dispatched once, findings are presented to the user, and remediation requires manual intervention. There is no automated cycle where issues get fixed and re-reviewed.

The per-wave spec review (Step 9) already has a retry loop (re-dispatch implementer with findings, up to 3 retries), but the final code review lacks this pattern entirely.

## Goal

Implement an alternating review-remediate loop for the final code review:

1. Dispatch code-reviewer → findings
2. If no Critical/Important issues → done
3. Dispatch remediator subagent with findings → fixes
4. Commit fixes
5. Re-dispatch code-reviewer on the new diff
6. Repeat until clean or max iterations reached (suggest 3)
7. If issues remain after max iterations, surface to user with full context

## Constraints

- Must preserve human-in-the-loop: user should be notified of convergence failure
- Remediator should be a plan-executor with the code-reviewer findings as task spec
- Each remediation pass should produce its own checkpoint commit
- The reviewer on subsequent passes should review only the remediation diff (new BASE_SHA), not the entire plan diff — otherwise it may re-raise issues it already approved
- Keep the existing "user chose to disable review" opt-out in Step 3
