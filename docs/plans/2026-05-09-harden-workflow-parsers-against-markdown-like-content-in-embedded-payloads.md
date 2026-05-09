# Harden workflow parsers against markdown-like content in embedded payloads

**Source:** TODO-bcf2526d

## Goal

Harden five workflow helpers (`parse-verifier-report.py`, `parse-coder-report.py`, `parse-refine-code-summary.py`, `parse-artifact-handoff.py`, `extract-provenance-preamble.py`) plus `extract-plan-tasks.py`'s `## Test Command` block against confusion between embedded payload text (captured `stdout`/`stderr`, pasted markdown, quoted marker-looking lines) and real protocol structure. Introduce one small shared fence-aware Python module that the section-splitting consumers reuse, while keeping `parse-artifact-handoff.py` narrowly rule-based.

## Architecture summary

Add `agent/skills/_shared/scripts/fence_aware.py` as a pure, importable Python module exposing two primitives: `compute_in_fence_lines(lines)` (set of 0-indexed line indices that sit inside a code fence) and `split_h2_sections(text)` (an `## <name>`-keyed dict that ignores fenced lines). Both follow one exact fence contract: backtick or tilde markers, length 3+, leading indentation allowed, closer must use the same marker type with at least as many markers and only whitespace after, and an unclosed opener keeps the rest of the scanned region inside the fence. The four section-splitting consumers (`parse-verifier-report.py`, `parse-coder-report.py`, `parse-refine-code-summary.py`, `extract-provenance-preamble.py`) and `extract-plan-tasks.py` import this module via a `sys.path` bootstrap that points at `agent/skills/_shared/scripts/`. `parse-verifier-report.py` additionally uses `compute_in_fence_lines` inside `parse_evidence_blocks`, `parse_evidence_fields`, `parse_per_criterion_verdicts`, and `parse_overall_verdict` so that captured `stdout`/`stderr` payloads (which the verifier protocol wraps in fences) cannot mimic evidence-block boundaries, field labels, criterion headers, or the `VERDICT:` line. `parse-artifact-handoff.py` does **not** use the shared module; it tightens marker extraction to require that the marker be the exact last non-empty line of the final message, in column 1, with no surrounding indentation, backticks, or quote characters.

## Tech stack

Python 3 (`re`, `argparse`, `json`, `os`, `sys`, `unittest`, `tempfile`), Bash (test runner shim invoked via `cd agent && npm run test:helpers`).

## File Structure

- `agent/skills/_shared/scripts/fence_aware.py` (Create) — Pure Python module exporting `compute_in_fence_lines(lines) -> set[int]` and `split_h2_sections(text) -> dict[str, str]`. Module-level only; no `if __name__ == "__main__"` block, no CLI.
- `agent/skills/_shared/scripts/tests/test_fence_aware.py` (Create) — Direct unit tests for `compute_in_fence_lines` and `split_h2_sections` covering backticks, tildes, length 3+, leading indentation, same-marker closer, longer closer, mismatched closer, unclosed opener, no fences, and section-splitting interaction with all of those.
- `agent/skills/_shared/scripts/README.md` (Modify) — Add `fence_aware.py` entry under "Helpers" describing it as the shared fence-aware primitive used by section-splitting consumers; update `parse-artifact-handoff.py` entry to document the tightened "exact last non-empty column-1 line" rule.
- `agent/skills/execute-plan/scripts/parse-verifier-report.py` (Modify) — Bootstrap `sys.path` to `_shared/scripts/`, import `fence_aware`. Replace `parse_sections` with `split_h2_sections`. Make `parse_evidence_blocks`, `parse_evidence_fields`, `parse_per_criterion_verdicts`, and `parse_overall_verdict` skip lines whose index is in `compute_in_fence_lines(...)` of their input. Update module docstring.
- `agent/skills/execute-plan/scripts/tests/test_parse_verifier_report.py` (Modify) — Add regression coverage with captured `stdout`/`stderr` containing fenced markdown headings, fake `[Evidence for Criterion N]` lines, fake `[Criterion N] PASS/FAIL` lines, fake field labels (`command:`, `stdout:`), and fake `VERDICT:` lines; assert all are preserved verbatim in the parsed `phase1_evidence` value and none of them affect the parsed structure.
- `agent/skills/execute-plan/scripts/tests/fixtures/verifier-report-fenced-payload.md` (Create) — Realistic fixture where stdout/stderr captures contain heading-like lines, fake evidence-block delimiters, fake criterion headers, fake field labels, and a fake `VERDICT:` line, all wrapped in the fenced payload form documented by `verify-task-prompt.md`.
- `agent/skills/execute-plan/scripts/parse-coder-report.py` (Modify) — Bootstrap `sys.path`, import `fence_aware`. Replace `_section()` with a fence-aware lookup that uses `split_h2_sections` (or filters `## ` lines through `compute_in_fence_lines`). Update module docstring.
- `agent/skills/execute-plan/scripts/tests/test_parse_coder_report.py` (Modify) — Add regression tests for fenced markdown / pasted output containing `## ` headings inside `## Completed`, `## Tests`, `## Self-Review Findings`, and `## Concerns / Needs / Blocker`; assert each section's body is captured verbatim through the fence and not truncated by an embedded `## `.
- `agent/skills/refine-code/scripts/parse-refine-code-summary.py` (Modify) — Bootstrap `sys.path`, import `fence_aware`. Replace `parse_sections` with `split_h2_sections`. Update module docstring.
- `agent/skills/refine-code/scripts/tests/test_parse_refine_code_summary.py` (Modify) — Add regression tests for fenced reviewer text inside `## Remaining Issues` (and at minimum one other section) ensuring the parser does not mistake the embedded `## ` for a real section boundary.
- `agent/skills/_shared/scripts/parse-artifact-handoff.py` (Modify) — Replace `re.MULTILINE`-anchored `findall` with terminal-line extraction: split on `\n`, walk from the end to find the last non-empty line, accept only when that line matches `^<MARKER>: <path>$` exactly (no leading whitespace, no surrounding backticks, no surrounding quote characters). Update module docstring and `argparse` `description`/`epilog` with the new rule.
- `agent/skills/_shared/scripts/tests/test_parse_artifact_handoff.py` (Modify) — Add regression tests where marker-shaped lines appear earlier in the message but are not the terminal line (ignored), where the terminal line is `> PLAN_ARTIFACT: ...` (rejected), `    PLAN_ARTIFACT: ...` (rejected), `` `PLAN_ARTIFACT: ...` `` (rejected), and where trailing blank lines after a valid terminal marker line are tolerated (accepted).
- `agent/skills/_shared/scripts/tests/fixtures/final-message-marker-not-terminal.txt` (Create) — Final message where a marker-shaped line appears mid-message but the actual last non-empty line is prose; parse must fail with `missing <MARKER> marker`.
- `agent/skills/_shared/scripts/tests/fixtures/final-message-marker-quoted.txt` (Create) — Final message ending with `> PLAN_ARTIFACT: /tmp/x.md`; parse must fail with `missing <MARKER> marker`.
- `agent/skills/_shared/scripts/tests/fixtures/final-message-marker-indented.txt` (Create) — Final message ending with `    PLAN_ARTIFACT: /tmp/x.md`; parse must fail.
- `agent/skills/_shared/scripts/tests/fixtures/final-message-marker-backticked.txt` (Create) — Final message ending with `` `PLAN_ARTIFACT: /tmp/x.md` ``; parse must fail.
- `agent/skills/_shared/scripts/tests/fixtures/final-message-marker-trailing-blanks.txt` (Create) — Final message with a valid terminal `PLAN_ARTIFACT:` line followed by trailing blank lines; parse must succeed.
- `agent/skills/_shared/scripts/extract-provenance-preamble.py` (Modify) — In `--mode spec`, read the bounded preamble region into memory (still capped at 40 lines), compute `compute_in_fence_lines` over those lines, then locate the first `## ` line whose index is **not** in the fenced set as the scan terminator. Brief mode behavior unchanged. Update module docstring.
- `agent/skills/_shared/scripts/tests/test_extract_provenance_preamble.py` (Modify) — Add regression tests for spec mode where a fenced block before the real `## ` heading contains `## Fake Heading` and a fake `Source: TODO-...` line; assert the scan does not terminate at the fenced heading and (for the fake `Source:` inside the fence) the parser still ignores nothing it should not — i.e., extraction still picks up the real `Source:` line that sits before the fence.
- `agent/skills/_shared/scripts/tests/fixtures/preamble-spec-fenced-heading.md` (Create) — Spec-mode fixture where a fenced markdown block containing `## Fake Heading` and `Source: TODO-deadbeef` precedes the real `## Introduction` heading; the real `Source: TODO-12345678` line sits in the preamble before the fence.
- `agent/skills/execute-plan/scripts/extract-plan-tasks.py` (Modify) — Bootstrap `sys.path`, import `fence_aware`. Replace the in-file `get_fence_aware_lines` (and its `FENCE_MARKER_RE` / `FENCE_MARKERS` constants) with `fence_aware.compute_in_fence_lines`. Loosen the `## Test Command` info-string check from `stripped.startswith("```bash")` to "the first fenced opener line under that section, regardless of info string", reusing the same `FENCE_MARKER_RE`-style opener detection from the shared module. Update module docstring's `## Test Command` description.
- `agent/skills/execute-plan/scripts/tests/test_extract_plan_tasks.py` (Modify) — Add regression tests for `## Test Command` accepting unlabeled fences (` ``` `), tilde fences (`~~~`), 3+ fence length variants, leading-indented openers, longer closing fences, and an unclosed fence under `## Test Command` (which should treat the rest of the file as the command body).

## Tasks

### Task 1: Add the shared `fence_aware` module and direct test suite

**Files:**
- Create: `agent/skills/_shared/scripts/fence_aware.py`
- Create: `agent/skills/_shared/scripts/tests/test_fence_aware.py`

**Steps:**

- [ ] **Step 1: Draft `fence_aware.py` skeleton** — Create the file with a top-of-file docstring stating the exact fence contract (backticks and tildes, length 3+, indentation allowed, same-marker closer with length >= opener, unclosed opener stays open to EOF). Define `FENCE_RE = re.compile(r"^(\s*)(`{3,}|~{3,})(.*?)$")`. No `if __name__ == "__main__"` and no CLI.
- [ ] **Step 2: Implement `compute_in_fence_lines(lines)`** — Iterate over `lines` (each is a string with or without a trailing `\n`); when an opener line matches `FENCE_RE`, capture the marker character (`'`'` or `'~'`) and marker count, then walk forward looking for a closer that uses the same marker character, has count >= opener count, and has only whitespace after the markers. Mark every line strictly between opener and closer as fenced. If no closer is found before the end of `lines`, mark every line strictly after the opener through the last index as fenced. Opener and closer lines themselves are NOT marked fenced. Return a `set[int]`.
- [ ] **Step 3: Implement `split_h2_sections(text)`** — Split `text` into lines (`splitlines(keepends=True)`), compute the fenced-line set, then walk each line: a non-fenced line matching `^## (.+)$` (after `rstrip`) opens a new section keyed by the trimmed section name; all subsequent lines (fenced or not) are appended verbatim until the next non-fenced `## ` line or EOF. Lines before the first H2 are discarded. Return a `dict[str, str]` where each value preserves the original line endings of the body.
- [ ] **Step 4: Add docstrings on both functions** — Each docstring states: input shape, output shape, the exact fence contract reused, and one short note that opener and closer lines are NOT considered fenced.
- [ ] **Step 5: Create `tests/test_fence_aware.py`** — Add a `unittest.TestCase` subclass `TestComputeInFenceLines` covering: (a) no fences → empty set; (b) one backtick fence → only interior lines fenced; (c) one tilde fence → only interior lines fenced; (d) backtick fence with leading indentation → still fences interior; (e) opener length 4, closer length 4 → closes; (f) opener length 3, closer length 5 → closes; (g) opener length 5, closer length 3 → does NOT close; (h) opener `` ``` ``, closer `~~~` → does NOT close (mismatched marker type); (i) unclosed opener → fences through EOF; (j) two consecutive fences → both interiors fenced, the gap line between them not fenced; (k) closer line with trailing whitespace → still closes; (l) closer line with an info string after the markers → does NOT close. Add a second `TestSplitH2Sections` subclass covering: (a) two real H2s → two keys with verbatim bodies; (b) a fenced `## Fake` line inside a real section → not a new section, body verbatim; (c) preamble before first H2 is discarded; (d) duplicate H2 names → last value wins; (e) section names trimmed of trailing whitespace.
- [ ] **Step 6: Run the new test file** — `cd agent && python3 -m unittest skills/_shared/scripts/tests/test_fence_aware.py -v` and confirm all cases pass.

**Acceptance criteria:**

- The `fence_aware.py` module exposes both functions importably.
  Verify: run `cd agent && python3 -c "import sys; sys.path.insert(0, 'skills/_shared/scripts'); import fence_aware; print(fence_aware.compute_in_fence_lines.__doc__ is not None and fence_aware.split_h2_sections.__doc__ is not None)"` and confirm stdout is `True` and exit code 0.
- The fence contract is enforced exactly per spec.
  Verify: `cd agent && python3 -m unittest skills/_shared/scripts/tests/test_fence_aware.py -v` exits 0 and prints `OK` and the test summary lists at least 12 tests under `TestComputeInFenceLines` and at least 5 tests under `TestSplitH2Sections`.
- The module is pure (no side effects, no CLI).
  Verify: open `agent/skills/_shared/scripts/fence_aware.py` and confirm the file contains no `if __name__ == "__main__":` block, no `argparse` import, and no top-level `print` / `sys.exit` calls.

**Model recommendation:** standard

### Task 2: Harden `parse-verifier-report.py` against fenced payloads in evidence and verdict sections

**Files:**
- Modify: `agent/skills/execute-plan/scripts/parse-verifier-report.py`
- Modify: `agent/skills/execute-plan/scripts/tests/test_parse_verifier_report.py`
- Create: `agent/skills/execute-plan/scripts/tests/fixtures/verifier-report-fenced-payload.md`

**Steps:**

- [ ] **Step 1: Bootstrap `sys.path` and import `fence_aware`** — Near the top of `parse-verifier-report.py` (just under the existing imports) add: `import os, sys` (already there for `sys`) and `sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "_shared", "scripts"))` followed by `from fence_aware import compute_in_fence_lines, split_h2_sections`.
- [ ] **Step 2: Replace `parse_sections`** — Delete the existing `parse_sections(text)` function body and replace its call site (`sections = parse_sections(text)` in `main`) with `sections = split_h2_sections(text)`. Keep `parse_sections` only if it is still referenced from a test; otherwise remove it.
- [ ] **Step 3: Make `parse_evidence_blocks` fence-aware** — At the top of the function, compute `in_fence = compute_in_fence_lines(lines)` over `section_text.splitlines()`. In the outer `while i < len(lines)` loop, treat any line whose index is in `in_fence` as plain content: it must NEVER match the `[Evidence for Criterion N]` opener and must NEVER act as a `## ` boundary inside the inner block-collection loop. Concretely: wrap each `re.match(r"^\[Evidence for Criterion (\d+)\]$", ...)` and `re.match(r"^## ", ...)` test with `i not in in_fence` / `current_index not in in_fence`. The inner block-line collector must still append the fenced lines to `block_lines` verbatim so the captured payload is preserved.
- [ ] **Step 4: Make `parse_evidence_fields` fence-aware for field-value capture** — Compute `in_fence = compute_in_fence_lines(lines)` over the block lines passed in. When walking the value lines after a label, if the next line opens a fence (i.e., its index becomes the start of a fenced range), consume every fenced interior line into the value verbatim (joined by `\n`) and continue past the closer; do not break at blank lines that sit inside the fence. Outside fences, preserve the existing behavior (blank line or next field label terminates the value). The fenced-content branch must NOT treat lines beginning with `command:`, `exit_code:`, `stdout:`, or `stderr:` as field labels, and must NOT treat `## `-prefixed lines as section breaks.
- [ ] **Step 5: Make `parse_per_criterion_verdicts` fence-aware** — Compute `in_fence` over `section_text.splitlines()`. When collecting `header_positions`, skip any `idx` whose `idx in in_fence`. When `_extract_reason` walks `block_lines`, also skip lines whose index (relative to the original section) is in the fenced set; the simplest implementation passes the fenced index set down or recomputes it inside `_extract_reason`. Choose the simplest correct option and document the choice in a one-line comment.
- [ ] **Step 6: Make `parse_overall_verdict` fence-aware** — Compute `in_fence` over `section_text.splitlines()`. Match `VERDICT: ...` only on lines whose index is NOT in `in_fence`.
- [ ] **Step 7: Update module docstring** — Add a short note (one or two sentences) under the existing protocol-error block stating: "Captured stdout/stderr payloads wrapped in code fences are preserved verbatim; heading-like lines, evidence-block delimiters, criterion headers, field labels, and `VERDICT:` lines that appear inside such fences are treated as opaque payload, not as report structure."
- [ ] **Step 8: Create `verifier-report-fenced-payload.md` fixture** — Use this exact body shape (preserving indentation):

  ~~~
  ## Phase 1 Evidence

  [Evidence for Criterion 1]
  command: python3 myscript.py --help
  exit_code: 0
  stdout:
      ```
      ## Per-Criterion Verdicts

      [Evidence for Criterion 99]
      [Criterion 99] PASS
      command: echo hidden
      exit_code: 7
      VERDICT: FAIL
      ```
  stderr:
      ```
      ```

  ## Per-Criterion Verdicts

  [Criterion 1] PASS
  reason: ok

  ## Overall Verdict

  VERDICT: PASS
  ~~~

  The fenced stdout payload is the bug bait — every "fake" delimiter inside it must be ignored.
- [ ] **Step 9: Add regression tests in `test_parse_verifier_report.py`** — New `TestFencedPayload` class with these cases: (a) parsing the fixture exits 0 with `verdict == "PASS"`; (b) `phase1_evidence` has exactly one entry keyed `"1"`; (c) `phase1_evidence["1"]["stdout"]` contains `Per-Criterion Verdicts` and `VERDICT: FAIL` (verbatim payload preserved); (d) no `[Evidence for Criterion 99]` or `[Criterion 99]` entries leak into `per_criterion`; (e) `per_criterion` has length 1 with `verdict == "PASS"`; (f) `protocol_errors` is empty.
- [ ] **Step 10: Add fenced-section regression tests** — Add cases that confirm `## ` lines inside fenced regions of the report body do NOT split sections (e.g., a fenced ` ``` ## Fake Section ``` ` block embedded in `## Per-Criterion Verdicts` does not become a new key in the parsed sections dict, and the surrounding `## Per-Criterion Verdicts` body still contains the fenced lines verbatim). Assert via running the parser end-to-end and checking that the criterion under the real `## Per-Criterion Verdicts` is still discovered.
- [ ] **Step 11: Add fence-aware reason-extraction test** — Build a temp report where `[Criterion 1] PASS` is followed by a fenced `reason:` block containing fake `[Criterion 2] FAIL` lines; assert no second criterion is detected and `protocol_errors` reports the missing criterion 2 only when `--criteria-count 2` is passed.
- [ ] **Step 12: Run the full suite** — `cd agent && python3 -m unittest skills/execute-plan/scripts/tests/test_parse_verifier_report.py -v` and confirm all existing and new tests pass.

**Acceptance criteria:**

- Captured fenced stdout/stderr does not corrupt evidence parsing.
  Verify: `cd agent && python3 skills/execute-plan/scripts/parse-verifier-report.py --report skills/execute-plan/scripts/tests/fixtures/verifier-report-fenced-payload.md --criteria-count 1` exits 0, prints JSON with `"verdict": "PASS"`, exactly one entry under `phase1_evidence`, exactly one `per_criterion` element with `"verdict": "PASS"`, and an empty `protocol_errors` list.
- Captured fenced payload is preserved verbatim.
  Verify: from the same JSON output above, `phase1_evidence["1"]["stdout"]` contains the substrings `## Per-Criterion Verdicts`, `[Evidence for Criterion 99]`, `[Criterion 99] PASS`, and `VERDICT: FAIL` (i.e., the fake delimiters were captured, not stripped).
- Fenced `## ` lines inside any report section do not create or terminate sections.
  Verify: run `cd agent && python3 -m unittest skills/execute-plan/scripts/tests/test_parse_verifier_report.py -v` and confirm all `TestFencedPayload` cases pass with exit code 0.
- All existing parse-verifier-report tests still pass.
  Verify: `cd agent && python3 -m unittest skills/execute-plan/scripts/tests/test_parse_verifier_report.py -v` exits 0 and the run summary shows zero failures and zero errors.

**Model recommendation:** capable

### Task 3: Harden `parse-coder-report.py` section extraction against embedded `## ` lines

**Files:**
- Modify: `agent/skills/execute-plan/scripts/parse-coder-report.py`
- Modify: `agent/skills/execute-plan/scripts/tests/test_parse_coder_report.py`

**Steps:**

- [ ] **Step 1: Bootstrap `sys.path` and import `fence_aware`** — Add `import os` (already imported transitively via other modules; add explicit import if absent) and the same `sys.path.insert(...)` + `from fence_aware import split_h2_sections` block as in Task 2 Step 1.
- [ ] **Step 2: Replace `_section()`** — Rewrite `_section(name, text)` to call `split_h2_sections(text)` once and look up `sections.get(name, "").rstrip("\n")`. To avoid recomputing the section split four times in `main`, refactor `main` to call `split_h2_sections(text)` once and pass the resulting dict (or per-section strings) into the existing assignments for `tests_block`, `completed_block`, `self_review_block`, `concerns_block`, and `_extract_files_changed`. Preserve the `.rstrip("\n")` semantics of the original `_section`.
- [ ] **Step 3: Update `_extract_files_changed`** — Change its signature to take the precomputed sections dict (or the section body string) so it does not re-split. Continue to use the existing `re.match(r"^- `(?P<path>[^`]+)`", line)` for bullet extraction.
- [ ] **Step 4: Update module docstring** — Append: "Section bodies are extracted with the shared fence-aware H2 splitter; `## `-prefixed lines inside fenced code blocks are treated as opaque content and do not truncate the surrounding section."
- [ ] **Step 5: Add a regression test for fenced `## ` inside `## Completed`** — Build a temp report whose `## Completed` body contains a fenced markdown block:

  ~~~
  STATUS: DONE

  ## Completed
  Implemented foo.

  ```markdown
  ## Tests
  Fake nested heading inside a fence.
  ```

  More text after the fence.

  ## Tests
  Real tests block.

  ## Files Changed
  - `path/to/real.py`

  ## Self-Review Findings
  None.
  ~~~

  Assert that `data["completed_block"]` contains both `Implemented foo.` and `More text after the fence.` and the literal `## Tests` line from inside the fence; assert `data["tests_block"]` equals `Real tests block.` (i.e., the real `## Tests` was found, the fenced one was not).
- [ ] **Step 6: Add a regression test for fenced `## ` inside `## Self-Review Findings`** — Build a temp report whose `## Self-Review Findings` body contains a fenced block with `## Concerns / Needs / Blocker` inside it. Assert `data["self_review_block"]` contains the literal `## Concerns / Needs / Blocker` line from inside the fence and `data["concerns_block"]` is the body of the real concerns section that follows the fenced block.
- [ ] **Step 7: Add a regression test for fenced `## ` inside `## Concerns / Needs / Blocker`** — Status `DONE_WITH_CONCERNS`. The concerns body contains a fenced reviewer-quote block holding `## Files Changed`. Assert `data["concerns_block"]` contains the fenced `## Files Changed` line verbatim and `data["files_changed"]` reflects the real `## Files Changed` section that follows.
- [ ] **Step 8: Add a regression test for fenced `## ` inside `## Tests`** — Build a temp report whose `## Tests` body contains a fenced `pytest` output capture with fake `## Self-Review Findings` lines. Assert `data["tests_block"]` contains the fenced fake heading verbatim and `data["self_review_block"]` is the real one.
- [ ] **Step 9: Run the full suite** — `cd agent && python3 -m unittest skills/execute-plan/scripts/tests/test_parse_coder_report.py -v` and confirm all tests pass.

**Acceptance criteria:**

- Fenced `## ` lines inside `## Completed`, `## Tests`, `## Self-Review Findings`, and `## Concerns / Needs / Blocker` do not truncate those sections.
  Verify: run `cd agent && python3 -m unittest skills/execute-plan/scripts/tests/test_parse_coder_report.py -v` and confirm the four new regression tests (one per section) all pass and the run summary exits 0 with zero failures and zero errors.
- Section bodies preserve embedded fenced content verbatim.
  Verify: in each new regression test, assert via `assertIn` that the literal fenced heading text (e.g., `## Tests` inside the fence) appears in the captured section body string returned by the parser.
- All existing parse-coder-report tests still pass.
  Verify: run `cd agent && python3 -m unittest skills/execute-plan/scripts/tests/test_parse_coder_report.py -v` and confirm the original tests under `TestDoneReport`, `TestDoneWithConcerns`, `TestBlocked`, `TestNeedsContext`, `TestMissingStatus`, `TestInvalidStatusToken`, `TestConcernsMissing`, and `TestBulletWithoutBackticks` all show as passed in the verbose output.

**Model recommendation:** standard

### Task 4: Harden `parse-refine-code-summary.py` section extraction

**Files:**
- Modify: `agent/skills/refine-code/scripts/parse-refine-code-summary.py`
- Modify: `agent/skills/refine-code/scripts/tests/test_parse_refine_code_summary.py`

**Steps:**

- [ ] **Step 1: Bootstrap `sys.path` and import `fence_aware`** — Add `import os` if not present and `sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "_shared", "scripts"))` followed by `from fence_aware import split_h2_sections`. Note the relative depth: this script is at `agent/skills/refine-code/scripts/`, so `..` × 2 reaches `agent/skills/`, then append `_shared/scripts` (mirrors the execute-plan pattern).
- [ ] **Step 2: Replace `parse_sections`** — Delete the existing `parse_sections(text)` body and replace its call site `sections = parse_sections(body)` in `main` with `sections = split_h2_sections(body)`. The shared splitter discards content before the first H2, which matches the existing behavior since the STATUS line and any blank padding precede the first `## Summary`.
- [ ] **Step 3: Update module docstring** — Append: "Section bodies are extracted with the shared fence-aware H2 splitter; embedded fenced `## ` lines (e.g., copied reviewer markdown inside `## Remaining Issues`) are not mistaken for real section boundaries."
- [ ] **Step 4: Add a regression test for fenced `## ` inside `## Remaining Issues`** — Build a temp summary with `STATUS: not_approved_within_budget`, a `## Summary` block, a `## Remaining Issues` body whose verbatim text contains a fenced reviewer quote like:

  ~~~
  ## Remaining Issues
  [Critical] tests/foo.py:42 — flaky test

  ```markdown
  ## Review File
  docs/reviews/fake.md
  ```

  [Important] tests/bar.py:13 — missing assertion

  ## Review File
  docs/reviews/sample-code-review-v3.md
  ~~~

  Assert `data["remaining_issues"]` contains both `[Critical] tests/foo.py:42` and `[Important] tests/bar.py:13` AND the literal fenced `## Review File` line verbatim; assert `data["review_file"]` is `docs/reviews/sample-code-review-v3.md` (the real one).
- [ ] **Step 5: Add a regression test for fenced `## ` inside `## Summary`** — Build a temp summary with `STATUS: approved`, a `## Summary` block whose body has a fenced markdown block containing `## Review File` inside it, followed by the real `## Review File` section. Assert the parser returns successfully and `data["review_file"]` is the real path.
- [ ] **Step 6: Run the full suite** — `cd agent && python3 -m unittest skills/refine-code/scripts/tests/test_parse_refine_code_summary.py -v` and confirm all tests pass.

**Acceptance criteria:**

- Fenced `## ` lines inside `## Remaining Issues` are preserved verbatim and do not terminate the section.
  Verify: in the new regression test, assert via `assertIn` that the captured `data["remaining_issues"]` string contains the literal fenced `## Review File` line, and assert `data["review_file"]` equals the real review-file path that follows the fence.
- Fenced `## ` lines inside `## Summary` do not break field parsing.
  Verify: run `cd agent && python3 -m unittest skills/refine-code/scripts/tests/test_parse_refine_code_summary.py -v` and confirm the new fenced-summary regression test exits with the parser returning code 0 and producing valid `iterations`, `issues_found_*`, `issues_fixed`, and `issues_remaining` fields.
- All existing parse-refine-code-summary tests still pass.
  Verify: run `cd agent && python3 -m unittest skills/refine-code/scripts/tests/test_parse_refine_code_summary.py -v` and confirm the original `TestApproved`, `TestApprovedWithConcerns`, `TestNotApproved`, `TestFailed`, `TestFailClosed`, and `TestRemainingIssuesDocumentedHeading` classes all pass with zero failures and zero errors.

**Model recommendation:** standard

### Task 5: Tighten `parse-artifact-handoff.py` to require the marker on the exact terminal non-empty line

**Files:**
- Modify: `agent/skills/_shared/scripts/parse-artifact-handoff.py`
- Modify: `agent/skills/_shared/scripts/tests/test_parse_artifact_handoff.py`
- Create: `agent/skills/_shared/scripts/tests/fixtures/final-message-marker-not-terminal.txt`
- Create: `agent/skills/_shared/scripts/tests/fixtures/final-message-marker-quoted.txt`
- Create: `agent/skills/_shared/scripts/tests/fixtures/final-message-marker-indented.txt`
- Create: `agent/skills/_shared/scripts/tests/fixtures/final-message-marker-backticked.txt`
- Create: `agent/skills/_shared/scripts/tests/fixtures/final-message-marker-trailing-blanks.txt`

**Steps:**

- [ ] **Step 1: Replace marker extraction logic** — In `main`, delete the `pattern = re.compile(r"^" + re.escape(args.marker) + r": (.+)$", re.MULTILINE); matches = pattern.findall(content); ... path = matches[-1]` block. Replace with: split `content` on `"\n"` (no `splitlines` so we keep \r-bearing edge cases visible); walk from the end of the list, find the first line whose `.strip()` is non-empty (record this as `terminal_line`); if no such line exists, fail with `missing <MARKER> marker`. Match `terminal_line` (not stripped) against `re.compile(r"^" + re.escape(args.marker) + r": (.+)$")` — i.e., **without** `re.MULTILINE`, so the match is anchored to the start of the terminal line itself with no leading whitespace, no leading `>`, no leading backtick. Trailing whitespace inside the path-capture group is preserved (the existing `--expected-path` test that fails on trailing whitespace must continue to fail).
- [ ] **Step 2: Reject indented / quoted / backticked terminal lines** — The regex from Step 1 already rejects leading whitespace because `^` is matched against the raw terminal line (no `MULTILINE`, no `lstrip`). Confirm by code review that lines beginning with `> `, `    `, `\t`, or `` ` `` cause the regex to not match → `fail("missing <MARKER> marker")`.
- [ ] **Step 3: Update the module docstring** — Replace the second-paragraph description with: "Extracts the marker only when it appears as the **exact last non-empty line** of the final message, in column 1, with no leading whitespace, quote (`>`), or backtick characters. Earlier marker-shaped lines anywhere else in the message are ignored." Update the `argparse` `description` (uses `__doc__`) automatically by editing the docstring; also update the supported-markers paragraph if needed.
- [ ] **Step 4: Update the `--marker` help text or add a note in `epilog`** — Add a short `epilog` (or extend the help text) reading: "Marker recognition: only a line of the form `<MARKER>: <path>` that is the exact last non-empty line of the final message, anchored at column 1, is accepted. Indented, quoted (`> `), or backtick-wrapped marker-shaped lines are rejected with `missing <MARKER> marker`."
- [ ] **Step 5: Create the five fixture files**:
  - `final-message-marker-not-terminal.txt`: contains `BRIEF_ARTIFACT: /tmp/early.md` early in the body, then several lines of prose, with the actual last non-empty line being `Done with the work, see above.` (no marker on the terminal line).
  - `final-message-marker-quoted.txt`: ends with the line `> BRIEF_ARTIFACT: /tmp/quoted.md` followed by an EOF newline.
  - `final-message-marker-indented.txt`: ends with the line `    BRIEF_ARTIFACT: /tmp/indented.md` (four spaces) followed by an EOF newline.
  - `final-message-marker-backticked.txt`: ends with the line `` `BRIEF_ARTIFACT: /tmp/code.md` `` (single backticks) followed by an EOF newline.
  - `final-message-marker-trailing-blanks.txt`: ends with `BRIEF_ARTIFACT: /tmp/ok.md` followed by two trailing blank lines.
- [ ] **Step 6: Add regression tests in `test_parse_artifact_handoff.py`**:
  - `test_marker_not_on_terminal_line_rejected`: feed `final-message-marker-not-terminal.txt`; expect non-zero exit; expect `failure == "missing BRIEF_ARTIFACT marker"`.
  - `test_marker_quoted_terminal_line_rejected`: feed `final-message-marker-quoted.txt`; expect non-zero exit; expect `failure == "missing BRIEF_ARTIFACT marker"`.
  - `test_marker_indented_terminal_line_rejected`: feed `final-message-marker-indented.txt`; expect non-zero exit; expect `failure == "missing BRIEF_ARTIFACT marker"`.
  - `test_marker_backticked_terminal_line_rejected`: feed `final-message-marker-backticked.txt`; expect non-zero exit; expect `failure == "missing BRIEF_ARTIFACT marker"`.
  - `test_marker_with_trailing_blank_lines_accepted`: feed `final-message-marker-trailing-blanks.txt`; expect exit 0; assert `data["path"] == "/tmp/ok.md"`.
  - `test_existing_multiple_markers_last_wins_still_works`: keep the existing `test_multiple_markers_last_wins` test; confirm it still passes (the actual last non-empty line in that fixture is the second marker, so the tightened logic still accepts it).
- [ ] **Step 7: Update `_shared/scripts/README.md`** — In the `parse-artifact-handoff.py` entry, replace the opening sentence with: "Extracts a `<MARKER>: <path>` line from a subagent's final assistant message **only when the marker line is the exact last non-empty line, in column 1, with no leading whitespace / quote / backtick characters**, and validates the marker family, file existence, non-empty content, and (optionally) path shape."
- [ ] **Step 8: Run the full suite** — `cd agent && python3 -m unittest skills/_shared/scripts/tests/test_parse_artifact_handoff.py -v` and confirm all old + new tests pass.

**Acceptance criteria:**

- A marker-shaped line that is not the terminal non-empty line is rejected.
  Verify: `cd agent && python3 skills/_shared/scripts/parse-artifact-handoff.py --marker BRIEF_ARTIFACT --final-message skills/_shared/scripts/tests/fixtures/final-message-marker-not-terminal.txt` exits non-zero and prints `{"failure": "missing BRIEF_ARTIFACT marker"}` on stderr.
- An indented terminal marker line is rejected.
  Verify: `cd agent && python3 skills/_shared/scripts/parse-artifact-handoff.py --marker BRIEF_ARTIFACT --final-message skills/_shared/scripts/tests/fixtures/final-message-marker-indented.txt` exits non-zero with the `missing BRIEF_ARTIFACT marker` failure.
- A quoted (`> `) terminal marker line is rejected.
  Verify: `cd agent && python3 skills/_shared/scripts/parse-artifact-handoff.py --marker BRIEF_ARTIFACT --final-message skills/_shared/scripts/tests/fixtures/final-message-marker-quoted.txt` exits non-zero with the `missing BRIEF_ARTIFACT marker` failure.
- A backtick-wrapped terminal marker line is rejected.
  Verify: `cd agent && python3 skills/_shared/scripts/parse-artifact-handoff.py --marker BRIEF_ARTIFACT --final-message skills/_shared/scripts/tests/fixtures/final-message-marker-backticked.txt` exits non-zero with the `missing BRIEF_ARTIFACT marker` failure.
- A valid marker line followed by trailing blank lines is accepted.
  Verify: `cd agent && python3 skills/_shared/scripts/parse-artifact-handoff.py --marker BRIEF_ARTIFACT --final-message skills/_shared/scripts/tests/fixtures/final-message-marker-trailing-blanks.txt` exits 0 and prints JSON containing `"path": "/tmp/ok.md"`.
- The `--help` output documents the tightened terminal-line rule.
  Verify: `cd agent && python3 skills/_shared/scripts/parse-artifact-handoff.py --help` exits 0 and the stdout contains the substring `exact last non-empty line` (case-sensitive).
- The `_shared/scripts/README.md` `parse-artifact-handoff.py` entry documents the tightened rule.
  Verify: `grep -n "exact last non-empty line" agent/skills/_shared/scripts/README.md` returns at least one match inside the `parse-artifact-handoff.py` bullet.
- All existing parse-artifact-handoff tests still pass.
  Verify: `cd agent && python3 -m unittest skills/_shared/scripts/tests/test_parse_artifact_handoff.py -v` exits 0 with zero failures and zero errors; in particular `test_multiple_markers_last_wins`, `test_marker_brief_artifact`, and the suffix/prefix tests all show as passed.

**Model recommendation:** capable

### Task 6: Make `extract-provenance-preamble.py` spec-mode scan fence-aware

**Files:**
- Modify: `agent/skills/_shared/scripts/extract-provenance-preamble.py`
- Modify: `agent/skills/_shared/scripts/tests/test_extract_provenance_preamble.py`
- Create: `agent/skills/_shared/scripts/tests/fixtures/preamble-spec-fenced-heading.md`

**Steps:**

- [ ] **Step 1: Import `fence_aware`** — Since this script lives in `agent/skills/_shared/scripts/` alongside the new module, replace the missing import with `from fence_aware import compute_in_fence_lines` (no `sys.path` manipulation needed; the script's own directory is on `sys.path` when invoked as a script). Add a one-line comment noting the colocated import.
- [ ] **Step 2: Refactor spec-mode scan to be fence-aware** — In the `try:` block where lines are read, change the spec-mode branch to: read up to 40 lines into a list (as raw decoded lines) WITHOUT the early `line.startswith("## ")` exit. After the read loop, if `args.mode == "spec"`, compute `in_fence = compute_in_fence_lines(region)` and find the smallest index `i` such that `region[i].startswith("## ")` and `i not in in_fence`; truncate `region` to `region[:i]` (or keep all 40 lines if no such heading is found). Brief mode keeps its existing 8-line cap with no `## ` early-exit.
- [ ] **Step 2.5: Make provenance-line extraction fence-aware** — Currently the post-read loop walks `region` and applies `_RE_SOURCE`, `_RE_SCOUT`, and `_RE_GIT_SHA_LINE` to every line, with last-match-wins assignment. Change this loop in spec mode to skip any line whose index in the (truncated) `region` is in `compute_in_fence_lines(region)`. Compute the fenced set once over the truncated `region` and pass it into the extraction loop; for each `idx, raw` from `enumerate(region)`, if `idx in in_fence_for_extraction`, `continue` before any of the three regex matches. Brief mode is unchanged (it has its own 8-line region; `Git SHA:` lines inside fences should also be skipped, so apply the same fence-skip there for consistency). Rationale: the spec mode fixture (Step 4) places fenced fake `Source:` / `Scout brief:` lines AFTER the real provenance lines; without this skip, last-match-wins would let the fake values override the real ones.
- [ ] **Step 3: Update module docstring** — In the spec mode description, replace "stop at the first '## ' heading or line 40" with "stop at the first '## ' heading that is NOT inside a fenced code block, or line 40". Add one short sentence: "Fenced `## ` lines (backticks or tildes, length 3+, indented or not) inside the bounded preamble do not terminate the scan, and `Source:` / `Scout brief:` / `Git SHA:` lines that appear inside fenced blocks are ignored for extraction."
- [ ] **Step 4: Create `preamble-spec-fenced-heading.md`** — Body:

  ~~~
  # Sample Spec Title

  Some intro text.

  Source: TODO-12345678

  Scout brief: docs/briefs/sample.md

  Some preamble explaining the work.

  ```markdown
  ## Fake Heading Inside Fence
  Source: TODO-deadbeef
  Scout brief: docs/briefs/fake.md
  ```

  More preamble text after the fence.

  ## Introduction

  Real content.
  ~~~

- [ ] **Step 5: Add regression tests** — In `test_extract_provenance_preamble.py`, add a `TestSpecModeFencedHeading` class with: (a) `test_fenced_heading_does_not_terminate_scan_real_before_fence`: parse `preamble-spec-fenced-heading.md` with `--mode spec`; assert `data["source_todo"] == "TODO-12345678"` and `data["scout_brief"] == "docs/briefs/sample.md"`. The real provenance lines appear BEFORE the fenced fake heading, and the fenced block contains fake `Source: TODO-deadbeef` and `Scout brief: docs/briefs/fake.md` lines AFTER. This case fails without the Step 2.5 fence-skip (last-match-wins would let the fake values win) AND fails without the Step 2 scan-terminator fix (the fenced `## Fake Heading` would terminate the scan before the real `## Introduction`). Both fixes together must make this case pass. (b) `test_fenced_heading_does_not_terminate_scan_real_after_fence`: build a temp fixture inline via `write_tmp(...)` where the fenced fake heading appears first (with no fake provenance inside, or with fake provenance that the fence-skip ignores), then the real provenance lines appear AFTER the fence but before the real `## Introduction`; assert they are still captured (proving the scan didn't terminate at the fenced heading). (c) `test_fenced_fake_provenance_inside_fence_is_ignored`: build a temp fixture where a fenced block contains `Source: TODO-aaaaaaaa` and `Scout brief: docs/briefs/fake.md`, and NO real `Source:` / `Scout brief:` lines appear outside the fence; assert `data["source_todo"] is None` and `data["scout_brief"] is None` (proving fenced provenance lines are skipped, not captured). (d) `test_fenced_git_sha_inside_brief_mode_is_ignored`: build an 8-line brief-mode fixture where `Git SHA: <real 40-hex>` appears outside any fence and a fake `Git SHA: <fake 40-hex>` appears inside a fenced block after the real one; assert `data["git_sha"]` equals the real SHA, not the fake.
- [ ] **Step 6: Run the full suite** — `cd agent && python3 -m unittest skills/_shared/scripts/tests/test_extract_provenance_preamble.py -v` and confirm all tests pass.

**Acceptance criteria:**

- A fenced `## ` line inside the bounded spec-mode preamble does not terminate the scan, AND fenced `Source:` / `Scout brief:` lines inside the preamble are skipped (not captured).
  Verify: `cd agent && python3 skills/_shared/scripts/extract-provenance-preamble.py --file skills/_shared/scripts/tests/fixtures/preamble-spec-fenced-heading.md --mode spec` exits 0 and prints JSON with `"source_todo": "TODO-12345678"` and `"scout_brief": "docs/briefs/sample.md"` (the fenced fake `TODO-deadbeef` and `docs/briefs/fake.md` lines that appear AFTER the real provenance lines must NOT override them).
- Fenced provenance lines (`Source:`, `Scout brief:`, `Git SHA:`) are ignored for extraction.
  Verify: run `cd agent && python3 -m unittest skills/_shared/scripts/tests/test_extract_provenance_preamble.py -v` and confirm `test_fenced_fake_provenance_inside_fence_is_ignored` and `test_fenced_git_sha_inside_brief_mode_is_ignored` both pass with exit code 0.
- The 40-line bound is still honored.
  Verify: the existing `test_spec_mode_ignores_lines_after_40_lines` test in `test_extract_provenance_preamble.py` continues to pass (the new fence-aware logic does not relax the 40-line cap).
- Brief-mode behavior is unchanged.
  Verify: `cd agent && python3 -m unittest skills/_shared/scripts/tests/test_extract_provenance_preamble.py -v` shows the existing `test_brief_mode_extracts_git_sha`, `test_brief_mode_ignores_lines_after_8_lines`, and `test_brief_mode_does_not_decode_after_bound` tests pass with no modifications.
- All existing extract-provenance-preamble tests still pass.
  Verify: same `test_extract_provenance_preamble -v` run exits 0 with zero failures and zero errors.

**Model recommendation:** standard

### Task 7: Migrate `extract-plan-tasks.py` to the shared helper and accept any info string under `## Test Command`

**Files:**
- Modify: `agent/skills/execute-plan/scripts/extract-plan-tasks.py`
- Modify: `agent/skills/execute-plan/scripts/tests/test_extract_plan_tasks.py`

**Steps:**

- [ ] **Step 1: Bootstrap `sys.path` and import `fence_aware`** — Add `import os` and the same `sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "_shared", "scripts"))` block as in Task 2 Step 1, then `from fence_aware import compute_in_fence_lines, FENCE_RE` (re-export `FENCE_RE` from `fence_aware.py` if not already public; alternatively expose a `match_fence_opener(line)` helper and use it here).
- [ ] **Step 2: Delete the in-file fence helper** — Remove `get_fence_aware_lines`, `FENCE_MARKER_RE`, and `FENCE_MARKERS` from `extract-plan-tasks.py`. Replace every call to `get_fence_aware_lines(lines)` with `compute_in_fence_lines(lines)`. The call sites are: `validate_required_sections` (1), `parse_plan` for the top-level `in_fence` (1), and `parse_task_block` for `block_in_fence` (1). Keep all other parser logic unchanged.
- [ ] **Step 3: Loosen `## Test Command` info-string check** — In the test-command extraction loop, replace `if stripped.startswith("```bash"):` with a check that uses the shared opener-detection: import or recreate the opener-recognition logic from `fence_aware.py` (e.g., `m = FENCE_RE.match(lines[i].rstrip("\n"))` and accept the line as the opener if `m is not None`, regardless of the info string in `m.group(3)`). Track the opener marker character and count, then close on the first matching closer (same marker character, count >= opener count, only whitespace after) following the same rules `compute_in_fence_lines` enforces. Capture every line strictly between opener and closer as the test-command body and join with `\n`. If the fence is unclosed, capture every line strictly after the opener through EOF.
- [ ] **Step 4: Update module docstring** — In the `Output shape` block, change `"test_command": "<contents of ```bash block under ## Test Command>"` to `"test_command": "<contents of the first fenced block under ## Test Command, regardless of info string>"`.
- [ ] **Step 5: Add regression tests in `test_extract_plan_tasks.py`** — Inside `TestFenceBehavior` (or a new `TestTestCommandFence` class), add:
  - `test_test_command_unlabeled_fence`: plan ending with `## Test Command\n\n```\nnpm test\n```\n` → `data["test_command"] == "npm test"`.
  - `test_test_command_tilde_fence`: `~~~\nnpm test\n~~~` → `"npm test"`.
  - `test_test_command_long_fence`: ` ```` ` opener, ` ```` ` closer → `"npm test"`.
  - `test_test_command_indented_fence`: opener and closer indented two spaces → `"npm test"`.
  - `test_test_command_longer_closer`: opener `` ``` ``, closer ` ````` ` → `"npm test"`.
  - `test_test_command_closer_with_info_string_does_not_close`: opener `` ``` ``, candidate "closer" line `` ```bash `` (info string after markers) does NOT close → the rest of the file is captured as the command body.
  - `test_test_command_unclosed_fence`: opener with no closer → everything after the opener through EOF is captured as the command body.
- [ ] **Step 6: Run the full suite** — `cd agent && python3 -m unittest skills/execute-plan/scripts/tests/test_extract_plan_tasks.py -v` and confirm all existing fence-behavior tests still pass and the new test-command tests pass.

**Acceptance criteria:**

- The in-file fence helper is removed and the shared module is used.
  Verify: `! grep -n "def get_fence_aware_lines" agent/skills/execute-plan/scripts/extract-plan-tasks.py && grep -n "from fence_aware import" agent/skills/execute-plan/scripts/extract-plan-tasks.py` exits 0.
- `## Test Command` accepts an unlabeled backtick fence.
  Verify: run `cd agent && python3 -m unittest skills/execute-plan/scripts/tests/test_extract_plan_tasks.py -v` and confirm the `test_test_command_unlabeled_fence` case passes with exit code 0.
- `## Test Command` accepts a tilde fence and follows the shared closer rules.
  Verify: run `cd agent && python3 -m unittest skills/execute-plan/scripts/tests/test_extract_plan_tasks.py -v` and confirm all of `tilde_fence`, `long_fence`, `indented_fence`, `longer_closer`, `closer_with_info_string_does_not_close`, and `unclosed_fence` cases pass.
- All existing extract-plan-tasks tests still pass.
  Verify: `cd agent && python3 -m unittest skills/execute-plan/scripts/tests/test_extract_plan_tasks.py -v` exits 0 with zero failures and zero errors; the existing `TestFencedHeadingsMinimal`, `TestFencedHeadingsRealistic`, `TestFencedFakeRequiredSection`, and `TestFenceBehavior` (excluding the new test-command cases) all show as passed.

**Model recommendation:** standard

### Task 8: Update `_shared/scripts/README.md` and run the full helper test suite

**Files:**
- Modify: `agent/skills/_shared/scripts/README.md`

**Steps:**

- [ ] **Step 1: Add a `fence_aware.py` entry under "Helpers"** — Insert (alphabetical placement between `extract-provenance-preamble.py` and `fill-template.py`): "**fence_aware.py** — Pure Python module (importable, not a CLI) exporting `compute_in_fence_lines(lines) -> set[int]` and `split_h2_sections(text) -> dict[str, str]`. The shared fence contract is: backtick or tilde markers, length 3+, leading indentation allowed, closer must use the same marker character with at least as many markers and only whitespace after, and an unclosed opener keeps the rest of the scanned region inside the fence. Used by `parse-verifier-report.py`, `parse-coder-report.py`, `parse-refine-code-summary.py`, `extract-provenance-preamble.py`, and `extract-plan-tasks.py`."
- [ ] **Step 2: Update the `parse-artifact-handoff.py` entry** — Already covered in Task 5 Step 7; double-check the entry now reflects the tightened terminal-line rule.
- [ ] **Step 3: Run the full helper test suite** — `cd agent && npm run test:helpers` and confirm exit code 0 and the run summary reports zero failures and zero errors across all five test directories (`_shared`, `execute-plan`, `refine-code`, `refine-plan`, `define-spec`).

**Acceptance criteria:**

- `_shared/scripts/README.md` documents the new `fence_aware.py` module.
  Verify: `grep -n "fence_aware.py" agent/skills/_shared/scripts/README.md` returns at least one match inside the "Helpers" list and the matched bullet text contains the substrings `compute_in_fence_lines` and `split_h2_sections`.
- `_shared/scripts/README.md` documents the tightened `parse-artifact-handoff.py` rule.
  Verify: `grep -n "exact last non-empty line" agent/skills/_shared/scripts/README.md` returns at least one match inside the `parse-artifact-handoff.py` bullet.
- The full helper test suite passes.
  Verify: `cd agent && npm run test:helpers` exits 0 and the final line of stdout/stderr summary reports `OK` (Python `unittest` style) for each of the five test directories the script discovers.

**Model recommendation:** cheap

## Dependencies

- Task 2 depends on: Task 1
- Task 3 depends on: Task 1
- Task 4 depends on: Task 1
- Task 5 depends on: (none — `parse-artifact-handoff.py` does not use the shared module)
- Task 6 depends on: Task 1
- Task 7 depends on: Task 1
- Task 8 depends on: Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7

## Risk Assessment

- **Risk: the shared module duplicates logic that already lives in `extract-plan-tasks.py` and the two implementations could drift during the migration.** Mitigation: Task 1 lands the shared module first with its own exhaustive tests; Task 7 then deletes the in-file copy in `extract-plan-tasks.py` and re-runs the full `test_extract_plan_tasks.py` suite (which already covers the local fence helper) to confirm byte-identical behavior. If any test regresses, that is a real divergence and the shared module is the bug, not the local copy.
- **Risk: tightening `parse-artifact-handoff.py` could reject legitimate subagent outputs that today happen to pass.** Mitigation: the orchestrator workflow contract already documents "the marker is the terminal line" (see `agent/agents/planner.md` and the various `SKILL.md` files), so the tightened rule matches the documented contract. Task 5 keeps the existing `test_multiple_markers_last_wins` fixture intact (the actual last non-empty line in that fixture IS the second marker, so it still passes). If a subagent ever ended its message with prose instead of the marker, the failure mode under the tightened rule is `missing <MARKER> marker` — the same failure mode the workflow already documents and recovers from.
- **Risk: fence-aware `parse_evidence_fields` changes could break the existing inline-style fixtures that do NOT wrap stdout/stderr in fences.** Mitigation: the new fence-handling branch only activates when the next non-blank line after a field label opens a fence; outside fences, the existing blank-line / next-field-label termination is preserved exactly. The existing `verifier-report-pass.md` and `verifier-report-fail.md` fixtures use the inline form (`stdout: usage: ...` on one line) and will exercise the unchanged code path.
- **Risk: making `extract-provenance-preamble.py` read all 40 lines before scanning for the first `## ` increases memory pressure.** Mitigation: 40 lines is trivial. The 40-line cap stays in place; only the early-exit on `## ` is moved from inside the read loop to a post-read scan over the in-memory list. Brief mode is unchanged.
- **Risk: the `## Test Command` change accepts more fence info strings than before, including info strings the orchestrator did not anticipate.** Mitigation: the captured value is the body between opener and closer, which is what the executor already runs as a shell command. The set of acceptable fences widens in exactly the direction the spec calls for ("the first fenced block under that section, regardless of info string"). Existing ` ```bash ` fences continue to work unchanged.

## Test Command

```bash
cd agent && npm run test:helpers
```
