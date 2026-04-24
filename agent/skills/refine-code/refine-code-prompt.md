# Review-Remediate Loop

You are the code refiner. Drive the review-remediate cycle for the changes described below.

## What Was Implemented

{PLAN_GOAL}

## Requirements/Plan

{PLAN_CONTENTS}

## Git Range

**Base (pre-implementation):** {BASE_SHA}
**Head (post-implementation):** {HEAD_SHA}

## Configuration

- **Max iterations:** {MAX_ITERATIONS}
- **Review output base path:** {REVIEW_OUTPUT_PATH}
- **Working directory:** {WORKING_DIR}

### Model Matrix

{MODEL_MATRIX}

Model tier assignments:
- `crossProvider.capable` — first-pass full review and final verification review
- `standard` — hybrid re-reviews (cheaper, scoped to remediation diff)
- `capable` — remediator (coder fixing code)

### Dispatch resolution

The model matrix above includes a `dispatch` map that maps provider prefixes to CLI dispatch targets. For each subagent call:

1. Take the resolved model string (e.g., `anthropic/claude-opus-4-6`)
2. Extract the provider prefix — the substring before the first `/` (e.g., `anthropic`)
3. Look up `dispatch["<prefix>"]` in the model matrix (e.g., `dispatch["anthropic"]` → `"claude"`)
4. Pass the result as `cli: "<value>"` in the subagent_run_serial task

If the `dispatch` map is absent from the model matrix, or the provider has no entry, default to `"pi"`.

Always pass `cli` explicitly on every subagent_run_serial task, even when it resolves to `"pi"`.

## Protocol

### Iteration 1: Full Review

1. **Read the review template** at `~/.pi/agent/skills/requesting-code-review/review-code-prompt.md`.

2. **Fill placeholders** for a full review:
   - `{WHAT_WAS_IMPLEMENTED}` — the Plan Goal above
   - `{PLAN_OR_REQUIREMENTS}` — the Requirements/Plan above
   - `{BASE_SHA}` — `{BASE_SHA}` from this prompt
   - `{HEAD_SHA}` — `{HEAD_SHA}` from this prompt
   - `{DESCRIPTION}` — the Plan Goal above (same as `{WHAT_WAS_IMPLEMENTED}`)
   - `{RE_REVIEW_BLOCK}` — empty string (first pass)

3. **Dispatch `code-reviewer`** with model `crossProvider.capable` and corresponding `cli` from the model matrix:
   ```
   subagent_run_serial { tasks: [
     { name: "code-reviewer", agent: "code-reviewer", task: "<filled review-code-prompt.md>", model: "<crossProvider.capable from model-tiers.json>", cli: "<dispatch for crossProvider.capable>" }
   ]}
   ```

4. **Write review** to versioned path: `<REVIEW_OUTPUT_PATH>-v<ERA>.md`
   - First era starts at v1. New eras created on budget reset (see Final Verification).

5. **Assess verdict:**
   - "Ready to merge: Yes" with no Critical/Important issues → skip to **Final Verification**
   - Critical/Important issues exist → continue to step 6

6. **Batch findings** — group related findings using your judgment:
   - Consider file proximity, logical coupling, conflict risk
   - Prefer smaller batches — one batch at a time, sequential dispatch
   - All Critical findings should be in early batches

7. **Dispatch remediator** for one batch — use model `capable` and corresponding `cli` from the model matrix:
   ```
   subagent_run_serial { tasks: [
     { name: "coder", agent: "coder", task: "<filled remediation prompt>", model: "<capable from model-tiers.json>", cli: "<dispatch for capable>" }
   ]}
   ```

8. **Commit remediation:**
   ```bash
   git add -A
   git commit -m "fix(review): iteration <N> — <summary>

   - Fixed: <finding 1 summary>
   - Fixed: <finding 2 summary>"
   ```

9. **Record in remediation log** — track what was fixed, deferred, or remaining.

10. **Repeat steps 6-9** if unbatched findings remain within this iteration.

### Iteration 2..N: Hybrid Re-Review

1. **Read the review template** (same as iteration 1).

2. **Read the re-review block** at `~/.pi/agent/skills/refine-code/review-fix-block.md`.

3. **Fill re-review block placeholders:**
   - `{PREVIOUS_FINDINGS}` — all findings from the previous review pass (full text)
   - `{PREV_HEAD}` — HEAD before the remediation commits
   - `{NEW_HEAD}` — current HEAD after remediation commits

4. **Fill the review template placeholders:**
   - Same as iteration 1, except:
   - `{BASE_SHA}` — the PREV_HEAD (only review remediation diff)
   - `{HEAD_SHA}` — the NEW_HEAD
   - `{RE_REVIEW_BLOCK}` — the filled re-review block content
   - `{DESCRIPTION}` — the Plan Goal above (same as iteration 1)

5. **Dispatch `code-reviewer`** with model `standard` and corresponding `dispatch` from the model matrix (hybrid re-reviews are scoped and cheaper).

6. **Overwrite review sections** in the current versioned file; **append** to remediation log.

7. **Assess and remediate** — same as iteration 1 steps 5-10.

### Final Verification

When a review pass finds no Critical/Important issues (hybrid reviews converge):

1. **Dispatch `code-reviewer`** with model `crossProvider.capable` and corresponding `dispatch` for a **full-diff** verification:
   - `{BASE_SHA}` — original BASE_SHA from this prompt (pre-implementation)
   - `{HEAD_SHA}` — current HEAD (includes all remediations)
   - `{RE_REVIEW_BLOCK}` — empty string (full review, not re-review)
   - `{DESCRIPTION}` — the Plan Goal above (same as iteration 1)

2. **If clean** (no Critical/Important issues):
   - Write final review to the versioned file
   - Append final entry to remediation log: `**Result:** Clean after N iterations.`
   - Copy the versioned file to the unversioned path: `<REVIEW_OUTPUT_PATH>.md`
   - Report `STATUS: clean`

3. **If issues found:**
   - **Reset the iteration budget** — start a new era
   - Create a new versioned file (`v2`, `v3`, etc.)
   - Re-enter the remediation loop from Iteration 1 step 5 (assess + remediate)

### On Budget Exhaustion

When iterations reach MAX_ITERATIONS without convergence:

1. Write remaining issues + full remediation log to the current versioned file
2. Copy to unversioned path
3. Report `STATUS: max_iterations_reached`

### On Clean First Review

If the very first review finds no Critical/Important issues, still run Final Verification (full-diff review) before reporting clean. This ensures a cross-provider check even when the first pass looks clean.

## Output Format

Report your final status using this exact format:

```
STATUS: clean | max_iterations_reached

## Summary
Iterations: <N>
Issues found: <X> (<N> Critical, <N> Important, <N> Minor)
Issues fixed: <Y>
Issues remaining: <Z>

## Remaining Issues (only if max_iterations_reached)
[Full text of unfixed findings with file:line references]

## Review File
<path to latest versioned review file>
```
