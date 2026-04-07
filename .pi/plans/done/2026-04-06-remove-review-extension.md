# Remove Review Extension

**Goal:** Delete the unused `~/.pi/agent/extensions/review.ts` extension (67KB, ~2100 lines) which implements a standalone code review system that duplicates functionality already provided by the `requesting-code-review` skill + `code-reviewer.md` subagent workflow. The extension registers `/review` and `/end-review` commands, manages review sessions with context forking, loop fixing, custom instructions, and `REVIEW_GUIDELINES.md` loading — none of which are used.

**Architecture summary:** Pi auto-discovers extensions by loading all `.ts` files in `~/.pi/agent/extensions/`. The review extension is a single self-contained file with no imports from or exports to other extensions. It persists state via custom session entry types (`review-session`, `review-anchor`, `review-settings`) that no other code reads. Removing the file is the only change needed.

**Tech stack:** TypeScript (pi extension API), pi TUI components

**Source todo:** TODO-51cb7cf7

## Dependency Verification (pre-analysis results)

The following was verified during plan generation — the worker should re-verify as Step 1:

| Check | Result |
|---|---|
| Other extensions import from `review.ts` | ❌ None — grep of all other `~/.pi/agent/extensions/*.ts` files for "review" returned zero matches |
| State keys used outside `review.ts` | ❌ `REVIEW_STATE_TYPE`, `REVIEW_ANCHOR_TYPE`, `REVIEW_SETTINGS_TYPE` only appear in `review.ts` |
| Skill files reference `/review` command | ❌ No matches for literal `/review` in `~/.pi/agent/skills/` |
| `REVIEW_GUIDELINES.md` files exist | ❌ None found under `~/Code/` |
| Agent definitions reference review extension | ❌ `plan-executor.md` and `plan-generator.md` have no review extension references |
| Settings.json references review extension | ❌ No extension config — auto-discovery only |

## File Structure

```
- `~/.pi/agent/extensions/review.ts` (Delete) — The entire review extension; self-contained, no dependents
```

## Tasks

### Task 1: Verify isolation and delete review extension

**Files:**
- Delete: `~/.pi/agent/extensions/review.ts`

**Steps:**

- [ ] **Step 1: Re-verify no cross-references exist** — Run the following checks and confirm zero relevant matches (excluding session logs and this plan):
  - `grep -r "review" ~/.pi/agent/extensions/*.ts` — confirm only hits are in `review.ts` itself
  - `grep -r "REVIEW_STATE_TYPE\|REVIEW_ANCHOR_TYPE\|REVIEW_SETTINGS_TYPE" ~/.pi/agent/extensions/` — confirm only hits are in `review.ts`
  - `grep -rl "/review" ~/.pi/agent/skills/` — confirm no skill references the `/review` command
  - If any unexpected dependency is found, STOP and report it. Do not proceed with deletion.

- [ ] **Step 2: Delete the extension file** — Remove `~/.pi/agent/extensions/review.ts`.

- [ ] **Step 3: Verify the file is gone and other extensions remain** — Run `ls ~/.pi/agent/extensions/` and confirm:
  - `review.ts` is absent
  - These files still exist: `answer.ts`, `context.ts`, `files.ts`, `footer.ts`, `session-breakdown.ts`, `todos.ts`, `whimsical.ts`

**Acceptance criteria:**
- `~/.pi/agent/extensions/review.ts` no longer exists
- All other extension files (`answer.ts`, `context.ts`, `files.ts`, `footer.ts`, `session-breakdown.ts`, `todos.ts`, `whimsical.ts`) are untouched
- No other file was modified

**Model recommendation:** cheap

## Dependencies

No inter-task dependencies (single task).

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Another extension secretly depends on review.ts | Very low (verified by grep) | Startup errors | Step 1 re-verifies before deletion; git makes reverting trivial |
| Persisted review session state in existing sessions causes errors | Very low — pi ignores unknown custom entry types | None expected | If somehow triggered, the entries are inert data with no reader |
| User has `REVIEW_GUIDELINES.md` in a project not checked | Very low (none found under ~/Code/) | Review guidelines silently stop loading | Acceptable — the feature is being removed intentionally |

## Self-Review

### Spec coverage
| Requirement (from TODO-51cb7cf7) | Covered by |
|---|---|
| Verify extension is self-contained | Task 1, Step 1 |
| Delete the file | Task 1, Step 2 |
| Verify clean startup | Task 1, Step 3 (file-level); runtime verification is manual |

**Note:** The todo mentions "Start a fresh pi session and confirm no errors / `/review` is unregistered / other extensions load normally." Runtime startup verification cannot be automated by the worker (it requires launching a new pi process interactively). Step 3 covers the file-system preconditions. The user should manually start a fresh pi session after execution to confirm runtime behavior.

### Placeholder scan
No instances of "TBD", "TODO", "implement later", or "similar to Task N" in this plan.

### Type consistency
N/A — no new types, interfaces, or signatures introduced.

## Review Notes

_Added by plan reviewer (Gemini) — informational, not blocking._

### Warnings
- **Task 1**: Runtime startup verification (confirm no errors, `/review` unregistered, other extensions load) cannot be automated by the worker and is delegated to the user as a manual post-execution step. The plan's file-system checks (Step 3) are necessary but not sufficient to guarantee clean startup.
