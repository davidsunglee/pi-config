# Reviewer-Authored Review Artifacts

Source: TODO-0d3fd11b

## Goal

Replace the reviewer→refiner handoff that currently transports full review text through `results[0].finalMessage` with an artifact-based contract: the reviewer writes the full review to a designated path supplied in its task prompt, and returns a single anchored marker line carrying that path. The refiner reads the artifact from disk and treats its contents as the authoritative review. This applies in parallel to the `plan-reviewer` → `plan-refiner` and `code-reviewer` → `code-refiner` paths. The change protects against truncation of large reviews mid-handoff, makes the on-disk file the sole source of truth, and makes the boundary explicit.

## Context

Today's contract has the refiner persist the review file:

- `plan-refiner` (refine-plan-prompt.md, Per-Iteration Full Review steps 5–6) reads `results[0].finalMessage` from the dispatched `plan-reviewer`, then writes that text to `{REVIEW_OUTPUT_PATH}-v<CURRENT_ERA>.md`, prepending a `**Reviewer:** <provider>/<model> via <cli>` line whose model and `cli` exactly match the values it passed to `subagent_run_serial`.
- `code-refiner` (refine-code-prompt.md, Iteration 1 step 4 plus the parallel hybrid re-review and Final Verification writes) does the same with `<REVIEW_OUTPUT_PATH>-v<ERA>.md`, plus a final unversioned copy at `<REVIEW_OUTPUT_PATH>.md` on `STATUS: clean`.
- Both refiners re-stamp the first line on every iteration that overwrites a versioned file, using the model and `cli` of THAT iteration's reviewer dispatch.

Both reviewer agent definitions (`agent/agents/plan-reviewer.md`, `agent/agents/code-reviewer.md`) already declare `write` in their `tools:` list, so the tool capability is already present — only the contract changes. The reviewer task templates (`agent/skills/generate-plan/review-plan-prompt.md`, `agent/skills/requesting-code-review/review-code-prompt.md`) currently produce free-form review output and have no notion of a designated output artifact path or a prompt-supplied provenance line.

The downstream SKILL-level validation that checks the `**Reviewer:**` first line on returned paths (refine-plan/SKILL.md Step 9.5, refine-code/SKILL.md Step 6) operates on whatever file the refiner reports. Its regex and reason labels are unchanged by this spec — the validation reads a file that now happened to be written by a different agent, but the format and contents on disk are byte-for-byte identical.

The refiner today inlines finding text from the review into downstream subagent prompts: `{REVIEW_FINDINGS}` for the planner edit pass, `{PREVIOUS_FINDINGS}` for hybrid re-reviews, and the remediator's per-batch prompt. This pass-through behavior is preserved — the only change is where the refiner sources that text (on-disk artifact instead of `finalMessage`).

`plan-refiner` does not produce an unversioned `latest`-style review copy; that decision was made deliberately in `.pi/specs/done/2026-04-27-refine-plan-skill.md` ("no unversioned `latest` plan-review copy unless a concrete consumer is identified"). `code-refiner`'s unversioned copy predates that judgment and has no identified active consumer in the repo today.

## Requirements

- The refiner pre-computes the era-versioned output path it currently writes to and includes it verbatim in the reviewer's task prompt as a designated output artifact path. The refiner additionally pre-computes the exact `**Reviewer:** <provider>/<model> via <cli>` line for that iteration's dispatch and includes it in the prompt as the literal first line the reviewer must write.
- Both review-template files (`agent/skills/generate-plan/review-plan-prompt.md`, `agent/skills/requesting-code-review/review-code-prompt.md`) gain new placeholders for the output path and the provenance line, plus an "Output Artifact Contract" section instructing the reviewer to write to the supplied path with the supplied first line and to emit the marker on completion.
- The reviewer writes the file with the prompt-supplied provenance line as its first non-empty line, a single blank line, then the review body. This is a single write per iteration.
- The reviewer's `finalMessage` ends with exactly one anchored line: `REVIEW_ARTIFACT: <absolute path>`. The reviewer emits no other structured markers; the file is the sole source of truth for verdict, counts, and findings. Conversational text from the reviewer before the marker line is allowed and ignored by the refiner.
- The refiner extracts the marker path with an anchored regex matched on the last `^REVIEW_ARTIFACT: (.+)$` line in `finalMessage`, then performs three validations in order, each with its own distinct failure reason:
  1. The marker path equals the path supplied to the reviewer in the task prompt.
  2. The file exists and is non-empty.
  3. The on-disk first non-empty line passes the existing `**Reviewer:** <provider>/<model> via <cli>` provenance check (with the `inline` substring still forbidden).
  These are refiner-level fail-fast checks, separate from and prior to the SKILL-level validation that runs again later on the returned path.
- The refiner reads the whole on-disk file and parses verdict, severity counts, and findings as it does today. Pass-through to the planner edit pass (`{REVIEW_FINDINGS}`), to the next reviewer's `{PREVIOUS_FINDINGS}` block in hybrid re-review, to the remediator's batched prompt, and to the plan's `## Review Notes` append section is unchanged in shape — only the source of the text shifts from `finalMessage` to disk.
- Both refiner protocols' Hard rules gain a parallel rule: if the reviewer's response is missing the marker, or the artifact is missing/empty/path-mismatched/provenance-malformed, emit `STATUS: failed` with the specific reason and exit. Do not improvise the review file or fall back to inline review. This mirrors the existing "no inline review on dispatch failure" rule.
- Both refiner protocols' Failure Modes lists are updated:
  - `review file write failed: <error>` is removed (the refiner no longer writes the review file).
  - `plan-reviewer returned empty result` (and the code-side equivalent) is replaced by `reviewer response missing REVIEW_ARTIFACT marker`.
  - New entries: `reviewer artifact missing or empty at <path>`, `reviewer artifact path mismatch: expected <X>, got <Y>`, `reviewer artifact provenance malformed at <path>: <specific check>`.
- The `Reviewer provenance stamping` section in both refiner-prompt files is rewritten: the refiner no longer writes the provenance line itself; instead, it constructs the verbatim line for the reviewer to write and validates the on-disk first line on read-back. The forbidden-`inline`-substring rule remains.
- `agent/agents/plan-reviewer.md` and `agent/agents/code-reviewer.md` gain an "Output Artifact Contract" section describing the write requirement, the provenance-first-line discipline, and the `REVIEW_ARTIFACT:` marker as the last line of the reviewer's response. Their existing `tools:` lines (which already include `write`) are unchanged.
- The unversioned final copy at `<REVIEW_OUTPUT_PATH>.md` produced by code-refiner on `STATUS: clean` is dropped: remove the copy step in `refine-code-prompt.md` Final Verification, remove the unversioned-path validation in `refine-code/SKILL.md` Step 6, and remove the unversioned-copy mention in the `Reviewer provenance stamping` section.
- This contract applies consistently across first-pass review, hybrid re-review, and final verification — every reviewer dispatch in either refiner uses it.

## Constraints

- The on-disk file format (first line `**Reviewer:** <provider>/<model> via <cli>`, blank line, then review body) is unchanged byte-for-byte from today's format. Downstream SKILL-level validation (refine-plan/SKILL.md Step 9.5, refine-code/SKILL.md Step 6) keeps its current first-line regex and its current reason labels.
- The refiner's per-iteration context cost is unchanged: it reads the whole file (same volume as today's `finalMessage` consumption). No targeted-read optimization is introduced.
- The reviewer's tool surface is unchanged. Both reviewer agents already have `write` declared.
- The refiner→remediator and refiner→planner pass-through contracts (inlining finding text into downstream prompts) are unchanged. By-reference handoff to those downstream agents is explicitly out of scope.
- The path the reviewer writes to is the era-versioned path the refiner currently constructs (`{REVIEW_OUTPUT_PATH}-v<ERA>.md` for refine-code, `{REVIEW_OUTPUT_PATH}-v<CURRENT_ERA>.md` for refine-plan). No new directory or naming convention is introduced.
- The hybrid re-review iteration semantics (overwrite the same versioned file in place) are preserved — the reviewer performs the overwrite instead of the refiner, with a fresh prompt-supplied provenance line per iteration.
- The Hard rules retain their existing wording for dispatch-exhaustion. The new artifact-handoff rule is additive, not a replacement.
- Existing dispatch semantics, model-tier assignments, and the dispatch-exhaustion fallback chain are unchanged.

## Approach

**Chosen approach:** Reviewer-owned write with prompt-driven provenance and a single anchored marker response. The refiner pre-computes both the era-versioned output path and the verbatim `**Reviewer:** <provider>/<model> via <cli>` line for the iteration's dispatch, embeds both in the reviewer's task prompt, dispatches via `subagent_run_serial`, extracts the marker path from the reviewer's `finalMessage` with an anchored regex, validates path-equality + file-existence + on-disk first-line provenance, then reads the whole file from disk and proceeds with parsing as today. The file is the sole source of truth — the response carries only the path.

**Why this over alternatives:**

- One write per iteration. The refiner has both values (model, cli) at dispatch time, so prompt-supplied provenance is strictly simpler than write-then-restamp.
- Matches existing pi-config patterns of passing exact strings into prompts (`STRUCTURAL_ONLY_NOTE`, the spec preamble's `Source:` and `Scout brief:` lines).
- Mirrors the `SPEC_WRITTEN: <path>` marker discipline used by the spec-design procedure — a known-good pattern in this codebase for compact subagent handoff that is robust to surrounding chatter.
- Keeps the file authoritative; no source-of-truth ambiguity between response markers and file contents.

**Considered and rejected:**

- **Refiner re-stamps after reviewer writes a body-only file** — adds a redundant write per iteration with no offsetting benefit; the refiner already knows the provenance string at dispatch time.
- **Refiner edit-in-place to insert provenance after reviewer writes** — fragile; depends on the reviewer producing a deterministic first line for the edit to anchor against.
- **Path + verdict + counts in the response (option 2 from Q&A)** — introduces source-of-truth duplication; if response and file disagree the protocol must define a winner. Carrying only the path keeps the file authoritative trivially.
- **Bare path in the response (no marker)** — fragile to conversational preamble from the reviewer ("I have written the review to:" would break the parser).
- **Targeted-section reads in the refiner to reduce context** — same context cost as today (refiner already loads `finalMessage`); adds finding-extraction brittleness; the actual win of this spec is robustness against `finalMessage` truncation, not context savings.
- **Preserve the code-refiner unversioned final copy** — `plan-refiner` already chose no-unversioned-copy with no identified consumer; aligning code-refiner removes a redundant write and validation surface, and a one-line add-back is trivial if a consumer surfaces.
- **Pass-by-reference all the way through (refiner instructs remediator/planner to read findings from the file at named anchors)** — out of scope: extends the contract beyond the reviewer↔refiner boundary the todo names, and requires significant rework of the planner edit prompt, the remediator prompt, and the re-review block. Captured as an Open Question.

## Acceptance Criteria

- `plan-reviewer` writes the full plan review to the path supplied in its task prompt, with the prompt-supplied `**Reviewer:**` line as the first non-empty line; its `finalMessage` ends with `REVIEW_ARTIFACT: <absolute path>` and contains no other structured markers.
- `plan-refiner` extracts the marker path, validates path-equality + non-empty file + on-disk provenance, reads the file from disk, and uses its contents as the authoritative review for verdict parsing, severity counting, planner-edit-pass `{REVIEW_FINDINGS}` construction, and `## Review Notes` append. `plan-refiner` does not write the review file.
- `code-reviewer` writes the full code review to the path supplied in its task prompt under the same provenance discipline; its `finalMessage` ends with `REVIEW_ARTIFACT: <absolute path>`.
- `code-refiner` extracts the marker path, validates path-equality + non-empty file + on-disk provenance, reads the file from disk, and uses its contents as the authoritative review for verdict assessment, batching, remediator dispatch (per-batch finding text), and hybrid re-review `{PREVIOUS_FINDINGS}` construction. `code-refiner` does not write the review file.
- The unversioned `<REVIEW_OUTPUT_PATH>.md` copy is no longer produced. `refine-code/SKILL.md` Step 6 validates only the versioned path returned in `## Review File`.
- Hybrid re-review iterations in code-refining produce a fresh reviewer-authored overwrite of the same versioned file with the iteration's specific provenance line as the first non-empty line.
- Both refiner protocols' Hard rules forbid inline-review fallback when the reviewer's artifact handoff fails (missing marker, missing file, empty file, path mismatch, malformed provenance).
- Failure-mode lists in both refiner protocols are updated as described in Requirements: the old `review file write failed` entry is gone; the old `returned empty result` entry is replaced; new entries cover marker absence, missing/empty artifact, path mismatch, and provenance malformation.
- Manual smoke runs of both refine-plan and refine-code show the refiner's response chain receives only the marker line from the reviewer (the full review text appears in the on-disk artifact, not in `finalMessage`); a deliberately oversized review (tens of KB or larger, sized to exceed any plausible `finalMessage` truncation threshold) still produces a complete on-disk artifact and a clean refiner read.
- The byte-for-byte format of the persisted review file is unchanged from today (regex-equivalent first line, blank line, body); `refine-plan/SKILL.md` Step 9.5 and `refine-code/SKILL.md` Step 6 require no changes to their first-line regex or their existing reason labels.

## Non-Goals

- Pass-by-reference handoff between the refiner and downstream remediator / planner edit / hybrid-re-review subagents. The refiner continues to inline finding text into those prompts.
- Targeted-section reads or any other context-reduction strategy in the refiner.
- Changes to the reviewer's review checklist, severity calibration, or output format inside the review body.
- Changes to the SKILL-level path validation (`refine-plan/SKILL.md` Step 9.5; `refine-code/SKILL.md` Step 6) — its regex and reason labels are unchanged.
- Renaming, relocating, or restructuring the review-output directory layout.
- Adding any new directory beyond what the refiner already creates (`.pi/plans/reviews/`, `.pi/reviews/`).
- Preserving the unversioned final-copy convention in `refine-code` — explicitly dropped in this spec.
- Any change to dispatch semantics, model-tier assignments, or the existing dispatch-exhaustion fallback chain.

## Open Questions

- **Coordinator context cost when iterations multiply.** The refiner still inlines finding text into downstream prompts (planner edit pass, remediator batches, hybrid re-review's `{PREVIOUS_FINDINGS}`). If real-world iteration counts make this a context-pollution problem, the fix is pass-by-reference: structure findings in addressable sections in the on-disk file and have the refiner instruct downstream agents to read named sections rather than receive inline text. This extends the contract beyond the reviewer↔refiner boundary that this todo names; it warrants its own todo and design pass covering the planner edit prompt, the remediator prompt, and the re-review block.
