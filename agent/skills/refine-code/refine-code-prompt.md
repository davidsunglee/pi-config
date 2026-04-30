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

### Hard rules (read first)

These rules govern the entire protocol below. They are NOT edge cases; they are unconditional.

1. **No inline review on coordinator-tool unavailability.** If `subagent_run_serial` is unavailable in your session — for any reason, at any iteration — you MUST emit `STATUS: failed` with reason `coordinator dispatch unavailable`, MUST NOT write any review file, and MUST NOT perform an inline review as a substitute. The calling skill (`refine-code`) is responsible for fallback decisions; you do not improvise.
2. **No inline review on worker-dispatch exhaustion.** If every dispatch attempt for a `code-reviewer` (first-pass, hybrid re-review, or final-verification) or for a `coder` (remediator) fails — model unavailable, transport error, repeated empty results — you MUST emit `STATUS: failed` with reason `worker dispatch failed: <which worker>` and MUST NOT write any review file written after the failure. Inline-review fallback is forbidden in all cases. There is no exception for "I could just write the review myself"; that path produces silently degraded artifacts and is the failure mode this protocol exists to prevent.
3. **No improvised review file or inline review on artifact-handoff failure.** If a `code-reviewer`'s response (full review, hybrid re-review, or final verification) is missing the `REVIEW_ARTIFACT:` marker, OR the artifact file is missing/empty/path-mismatched, OR the on-disk first-line provenance is malformed, you MUST emit `STATUS: failed` with the specific reason from the `## Failure Modes` list (`reviewer response missing REVIEW_ARTIFACT marker`, `reviewer artifact missing or empty at <path>`, `reviewer artifact path mismatch: expected <X>, got <Y>`, or `reviewer artifact provenance malformed at <path>: <specific check>`) and exit. You MUST NOT improvise the review file or fall back to inline review. This mirrors the existing "no inline review on dispatch failure" rules above.

All three rules are duplicated as standing identity rules in `agent/agents/code-refiner.md` `## Rules`. The duplication is intentional — these rules apply unconditionally regardless of the per-invocation prompt.

### Reviewer provenance stamping

Every persisted review file MUST begin with a `**Reviewer:**` provenance line as its first non-empty line. The format is exact:

```
**Reviewer:** <provider>/<model> via <cli>
```

- `<provider>/<model>` MUST be the EXACT model string you passed to `subagent_run_serial` for that pass's `code-reviewer` dispatch (e.g., `openai-codex/gpt-5.5`).
- `<cli>` MUST be the EXACT cli string you passed to `subagent_run_serial` for that same dispatch (e.g., `pi`).
- The line is followed by a single blank line, then the review body.
- The value MUST NOT contain `inline` or any synonym (`improvised`, `local`, `fallback`).

**You no longer write the review file.** The reviewer writes it, using the verbatim provenance line you supply in its task prompt as `{REVIEWER_PROVENANCE}` and the absolute output path you supply as `{REVIEW_OUTPUT_PATH}`. Your role is to:

1. **Construct** the verbatim `**Reviewer:** <provider>/<model> via <cli>` line at dispatch time, using the exact `model` and `cli` values you are passing to THIS pass's `subagent_run_serial` task. Re-construct per pass — first-pass uses `crossProvider.capable`, hybrid re-review uses `standard`, final-verification uses `crossProvider.capable`. Each constructed line uses that pass's specific pair.
2. **Embed** that line as `{REVIEWER_PROVENANCE}` in the filled review-code-prompt.md, and embed the absolute era-versioned path as `{REVIEW_OUTPUT_PATH}`. Use the SAME absolute path across first-pass, hybrid re-reviews, and final-verification within one era — the file is overwritten in place by each successive reviewer.
3. **Validate** the on-disk first non-empty line on read-back as a fail-fast check (see Iteration 1 Step 3 below). The check is: line matches the regex `^\*\*Reviewer:\*\* [^/]+/[^ ]+ via [a-zA-Z0-9_-]+$`, and the value does NOT contain the substring `inline` (case-insensitive). The downstream `refine-code/SKILL.md` Step 6 validation runs again on the returned path with the same regex and reason labels — your fail-fast check is additive, not a replacement.

Apply this contract to first-pass full reviews, hybrid re-reviews, and final-verification reviews — every reviewer dispatch in this protocol uses it.

### Iteration 1: Full Review

1. **Read the review template** at `~/.pi/agent/skills/requesting-code-review/review-code-prompt.md`.

2. **Fill placeholders** for a full review:
   - `{WHAT_WAS_IMPLEMENTED}` — the Plan Goal above
   - `{PLAN_OR_REQUIREMENTS}` — the Requirements/Plan above
   - `{BASE_SHA}` — `{BASE_SHA}` from this prompt
   - `{HEAD_SHA}` — `{HEAD_SHA}` from this prompt
   - `{DESCRIPTION}` — the Plan Goal above (same as `{WHAT_WAS_IMPLEMENTED}`)
   - `{RE_REVIEW_BLOCK}` — empty string (first pass)
   - `{REVIEW_OUTPUT_PATH}` — the absolute path `{WORKING_DIR}/{REVIEW_OUTPUT_PATH}-v<ERA>.md` (concatenate `{WORKING_DIR}` and the relative review-output base path supplied above, then append `-v<ERA>.md`). Use the SAME path across iteration 1, hybrid re-reviews, and final-verification within one era — the file is overwritten in place.
   - `{REVIEWER_PROVENANCE}` — the verbatim line `**Reviewer:** <provider>/<model> via <cli>` constructed from the EXACT `model` and `cli` you will pass to THIS pass's `subagent_run_serial` task in Step 3. For first-pass full reviews, this is `crossProvider.capable` and its dispatch CLI.

3. **Dispatch `code-reviewer`** with model `crossProvider.capable` and corresponding `cli` from the model matrix:
   ```
   subagent_run_serial { tasks: [
     { name: "code-reviewer", agent: "code-reviewer", task: "<filled review-code-prompt.md>", model: "<crossProvider.capable from model-tiers.json>", cli: "<dispatch for crossProvider.capable>" }
   ]}
   ```
   Then extract and validate the reviewer's artifact handoff. Read `results[0].finalMessage` and perform these substeps in order, each producing its own `STATUS: failed` reason on failure:

   - **3a. Marker extraction.** Find the LAST line in `finalMessage` matching the anchored regex `^REVIEW_ARTIFACT: (.+)$`. If no such line exists, emit `STATUS: failed` with reason `reviewer response missing REVIEW_ARTIFACT marker` and exit. Capture the captured group as `<reviewer_path>`.
   - **3b. Path-equality check.** Compare `<reviewer_path>` (string-equal) to the absolute path you supplied as `{REVIEW_OUTPUT_PATH}` in Step 2. If they differ, emit `STATUS: failed` with reason `reviewer artifact path mismatch: expected <expected>, got <reviewer_path>` and exit.
   - **3c. File-existence check.** Read `<reviewer_path>` from disk. If the file does not exist, OR the file is empty (zero bytes, or only whitespace), emit `STATUS: failed` with reason `reviewer artifact missing or empty at <reviewer_path>` and exit.
   - **3d. On-disk first-line provenance check.** Find the first non-empty line of `<reviewer_path>`. Validate two things: (i) the line matches the regex `^\*\*Reviewer:\*\* [^/]+/[^ ]+ via [a-zA-Z0-9_-]+$`; (ii) the matched value does NOT contain the substring `inline` (case-insensitive). On either failure, emit `STATUS: failed` with reason `reviewer artifact provenance malformed at <reviewer_path>: <specific check>` and exit.
   - **3e. Read the file as the authoritative review.** On all checks passing, treat the on-disk file content as the authoritative review for verdict assessment, batching, remediator dispatch, and (downstream) hybrid re-review `{PREVIOUS_FINDINGS}` construction. Do NOT use `finalMessage` content beyond the marker line.

   Do NOT improvise the review file or perform an inline review on any failure above (Hard rule 3).

4. **Assess verdict** (from the on-disk review file):
   - "Ready to merge: Yes" with no Critical/Important issues → skip to **Final Verification**
   - Critical/Important issues exist → continue to step 5

5. **Batch findings** — group related findings using your judgment:
   - Consider file proximity, logical coupling, conflict risk
   - Prefer smaller batches — one batch at a time, sequential dispatch
   - All Critical findings should be in early batches

6. **Dispatch remediator** for one batch — use model `capable` and corresponding `cli` from the model matrix:
   ```
   subagent_run_serial { tasks: [
     { name: "coder", agent: "coder", task: "<filled remediation prompt>", model: "<capable from model-tiers.json>", cli: "<dispatch for capable>" }
   ]}
   ```

7. **Commit remediation:**
   ```bash
   git add -A
   git commit -m "fix(review): iteration <N> — <summary>

   - Fixed: <finding 1 summary>
   - Fixed: <finding 2 summary>"
   ```

8. **Record in remediation log** — track what was fixed, deferred, or remaining.

9. **Repeat steps 5-8** if unbatched findings remain within this iteration.

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
   - `{REVIEW_OUTPUT_PATH}` — the SAME absolute path used in Iteration 1 (no era change within the era — hybrid re-reviews overwrite the same file).
   - `{REVIEWER_PROVENANCE}` — the verbatim line `**Reviewer:** <provider>/<model> via <cli>` constructed from `standard` and its corresponding `cli`, freshly constructed for THIS hybrid re-review iteration.

5. **Dispatch `code-reviewer`** with model `standard` and corresponding `cli` from the model matrix (hybrid re-reviews are scoped and cheaper). Then extract and validate the reviewer's artifact handoff using the SAME substeps 3a–3e procedure as Iteration 1 Step 3 (anchored regex on the last `^REVIEW_ARTIFACT: (.+)$` line, path-equality, file-existence-and-non-empty, on-disk first-line provenance, then read the file from disk as authoritative). The reviewer overwrites the era-versioned file in place — the new first non-empty line reflects this iteration's `standard`-tier provenance. Use the same failure reasons (`reviewer response missing REVIEW_ARTIFACT marker`, `reviewer artifact path mismatch: expected <X>, got <Y>`, `reviewer artifact missing or empty at <path>`, `reviewer artifact provenance malformed at <path>: <specific check>`) on validation failure.

6. **Track the iteration's remediation log entry in your coordinator state.** The reviewer is the sole writer of the review file under this contract; you do NOT write to the reviewer artifact. The remediation log is tracked in your coordinator state across iterations and surfaces in the final Output Format via `Issues fixed`/`Issues remaining` counts and (on `STATUS: max_iterations_reached`) the `## Remaining Issues` section.

7. **Assess and remediate** — same as iteration 1 steps 4-9.

### Final Verification

When a review pass finds no Critical/Important issues (hybrid reviews converge):

1. **Dispatch `code-reviewer`** with model `crossProvider.capable` and corresponding `cli` for a **full-diff** verification. Fill EVERY placeholder used by `review-code-prompt.md`:
   - `{WHAT_WAS_IMPLEMENTED}` — the same value used in Iteration 1 Step 2 (the implementation summary supplied to this protocol). Final Verification re-uses this content unchanged so the reviewer sees the original implementation context.
   - `{PLAN_OR_REQUIREMENTS}` — the same value used in Iteration 1 Step 2 (the plan or requirements text supplied to this protocol). Final Verification re-uses this content unchanged so the reviewer evaluates the post-remediation diff against the original plan/requirements.
   - `{BASE_SHA}` — original BASE_SHA from this prompt (pre-implementation)
   - `{HEAD_SHA}` — current HEAD (includes all remediations)
   - `{RE_REVIEW_BLOCK}` — empty string (full review, not re-review)
   - `{DESCRIPTION}` — the Plan Goal above
   - `{REVIEW_OUTPUT_PATH}` — the SAME absolute era-versioned path used by Iteration 1 and the hybrid re-reviews — the file is overwritten in place.
   - `{REVIEWER_PROVENANCE}` — the verbatim `**Reviewer:** <provider>/<model> via <cli>` constructed from `crossProvider.capable` and its corresponding `cli` for this final-verification dispatch.

   Every placeholder above MUST be filled before dispatch — leaving `{WHAT_WAS_IMPLEMENTED}` or `{PLAN_OR_REQUIREMENTS}` unfilled would dispatch the reviewer with literal `{WHAT_WAS_IMPLEMENTED}` / `{PLAN_OR_REQUIREMENTS}` strings in its task prompt and produce an unreliable final-verification verdict.

   Then extract and validate the reviewer's artifact handoff using the SAME substeps 3a–3e procedure as Iteration 1 Step 3. On validation success, treat the on-disk file content as the authoritative final-verification review.

2. **If clean** (no Critical/Important issues in the on-disk review):
   - Record `Result: Clean after N iterations.` in your coordinator state. Do NOT write to the reviewer artifact (the iteration count surfaces via the Output Format's `Iterations: <N>` line; the on-disk review file content remains exactly as the final-verification reviewer wrote it).
   - Report `STATUS: clean`. Return the era-versioned path as the `## Review File` in your output. Do NOT produce an unversioned copy at `<REVIEW_OUTPUT_PATH>.md` — that legacy copy is dropped under this contract.

3. **If issues found:**
   - **Reset the iteration budget** — start a new era
   - Create a new versioned file (`v2`, `v3`, etc.)
   - Re-enter the remediation loop from Iteration 1 step 5 (assess + remediate)

### On Budget Exhaustion

When iterations reach MAX_ITERATIONS without convergence:

1. Track the cumulative remediation log in your coordinator state. Do NOT write to the reviewer artifact (the remaining issues are already in the file from the most recent reviewer write; the coordinator surfaces unfixed findings via the Output Format's `## Remaining Issues` section and surfaces fix counts via `Issues fixed`/`Issues remaining`).
2. Report `STATUS: max_iterations_reached`.

### On Clean First Review

If the very first review finds no Critical/Important issues, still run Final Verification (full-diff review) before reporting clean. This ensures a cross-provider check even when the first pass looks clean.

## Failure Modes

The following conditions produce `STATUS: failed`. Each condition maps to a one-line reason string used in your final output:

- **Coordinator orchestration tool unavailable** — reason: `coordinator dispatch unavailable`
- **Worker dispatch failed (code-reviewer or coder)** — reason: `worker dispatch failed: <which worker>`
- **Reviewer response missing the REVIEW_ARTIFACT marker** — reason: `reviewer response missing REVIEW_ARTIFACT marker`
- **Reviewer artifact missing or empty on disk** — reason: `reviewer artifact missing or empty at <path>`
- **Reviewer artifact path mismatch** — reason: `reviewer artifact path mismatch: expected <X>, got <Y>`
- **Reviewer artifact provenance malformed** — reason: `reviewer artifact provenance malformed at <path>: <specific check>`

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
