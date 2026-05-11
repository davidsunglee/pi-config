## Goal

Harden the planning/refinement pipeline at its three observed failure boundaries while keeping machine-trust gates strict. Concretely: relax three parsers (plan tasks, provenance preamble, coder report) at human/LLM-authored boundaries with bounded punctuation/capitalization tolerance; add a deterministic on-disk freshness-baseline fallback to `parse-artifact-handoff.py` that all five enumerated artifact handoffs adopt; tighten the canonical-emission contracts in the coder report and all five marker-emitting subagents so canonical generation stays strict; rework `refine-plan`'s `not_approved_within_budget` menu into three explicit choices that no longer silently land in `execute-plan`, suppress `generate-plan`'s execute-plan offer on the unapproved-budget path, and rename `refine-code`'s exhausted-budget menu letters to align with `refine-plan` without changing semantics.

**Source:** TODO-40e342b9
**Spec:** `docs/specs/2026-05-11-harden-workflow-boundaries.md`

## Architecture summary

The work spans three orthogonal subsystems wired into the existing skill pipeline:

1. **Parser leniency** (Wave 1, parallel) — small, isolated updates inside three existing Python scripts (`extract-plan-tasks.py`, `extract-provenance-preamble.py`, `parse-coder-report.py`). Each accepts a bounded set of punctuation/case variants while keeping fence-awareness intact. Each gains targeted unit tests in its existing test file; no new fixtures are required (the new cases are constructed inline in the test bodies, matching the existing pattern in `TestBulletWithoutBackticks` and `TestFencedH2InCompleted`).

2. **Freshness-baseline fallback** (Wave 1 helper + Wave 2 callers) — `parse-artifact-handoff.py` gains a new `--freshness-baseline <unix-mtime>` argument. When the caller supplies both `--expected-path` AND `--freshness-baseline`, a missing marker is acceptable iff the on-disk file exists, is non-empty, and has `mtime > baseline`. The success output gains a `used_fallback: true` field on the fallback path. `parse-test-runner-artifact.py` threads the new flag through to its internal handoff invocation. Each of the five call sites — `scout/SKILL.md`, `define-spec/SKILL.md`, `generate-plan/SKILL.md`, `refine-code/refine-code-prompt.md`, `_shared/test-runner-dispatch.md` — captures the baseline (the file's mtime, or `0` if missing) immediately before dispatching its subagent and passes it to the parser invocation. `validate-and-parse-plan-review.py` is explicitly NOT updated — refine-plan's plan-reviewer marker check remains strict by design.

3. **Exhausted-budget UX and contracts** (Wave 1, parallel with the rest) — `refine-plan/SKILL.md` Step 10 is reworked so the `not_approved_within_budget` path always presents the three new options (c)/(r)/(x), overriding `AUTO_COMMIT_ON_APPROVAL` on that path only. `generate-plan/SKILL.md` Step 5 gains a STATUS-conditioned guard around the `execute-plan` offer. `refine-code/SKILL.md` Step 5's menu letters are aligned to (c)/(p)/(x) without changing the downstream branch semantics. `execute-plan/execute-task-prompt.md` replaces the permissive STATUS phrasing with an explicit terminal-line contract; the five marker-emit subagent definitions and their prompts are tightened to require the marker as the final non-empty assistant line.

Wave 2 (the five wire-up tasks) waits on Wave 1's `parse-artifact-handoff.py` extension (Task 1) and, for the test-runner caller, on Task 9 (`parse-test-runner-artifact.py`). All other Wave 1 tasks are file-isolated and run in parallel.

## Tech stack

Python 3 (regex, json, argparse, subprocess, os.path mtime), Markdown markdown (skill prompts and agent definitions under `agent/skills/*.md` and `agent/agents/*.md`), Bash one-liners (`stat`/`python3 -c os.path.getmtime`) inside the call-site documentation for capturing the freshness baseline. Tests use the existing `unittest`-based discovery harness rooted at `agent/package.json`'s `test:helpers` script.

## File Structure

- `agent/skills/_shared/scripts/parse-artifact-handoff.py` (Modify) — Add `--freshness-baseline` argument; on missing marker AND both `--expected-path` and `--freshness-baseline` provided, perform on-disk fallback acceptance (existence + non-empty + `mtime > baseline`); add `used_fallback: bool` field to stdout JSON.
- `agent/skills/_shared/scripts/tests/test_parse_artifact_handoff.py` (Modify) — Add a new `TestFreshnessBaselineFallback` test class covering: (1) marker missing + fresh file → success with `used_fallback: true`; (2) marker missing + stale file → fail with existing `missing <MARKER> marker` label; (3) marker missing + missing/empty file → fail with `missing or empty at <path>`; (4) marker missing + baseline omitted → strict fail unchanged; (5) marker present + path mismatch → still fails regardless of baseline; (6) marker present + valid → existing path unchanged (no `used_fallback` flag set true).
- `agent/skills/execute-plan/scripts/extract-plan-tasks.py` (Modify) — Update `TASK_HEADING_RE` to accept `:`, `—`, `–`, `-` as separators; add a malformed-heading detection pass that emits `malformed_task_heading` with `line` and `observed` fields for `^### Task \d+` lines failing the accepted shape; loosen `SECTION_RULES` patterns and the `**Acceptance criteria:**` / `**Model recommendation:**` / `**Files:**`-block `Create:`/`Modify:`/`Test:` / `Verify:` literals to case-insensitive matching for the variants enumerated in the spec; preserve fence-awareness.
- `agent/skills/execute-plan/scripts/tests/test_extract_plan_tasks.py` (Modify) — Add `TestSeparatorTolerance` covering em dash, en dash, hyphen, colon canonical forms parse identically; `TestMalformedTaskHeading` covering `### Task 1` (no separator) and `### Task 1Title` (no separator) producing `malformed_task_heading`; `TestSectionHeadingCaseTolerance` covering title-case heading variants; `TestLabelCaseTolerance` covering `**Acceptance Criteria:**` / `**Model Recommendation:**` / lowercase `verify:` variants; `TestVagueAliasRejected` confirming `## Implementation` still yields `missing_required_section: numbered_tasks`; `TestFencedVariantsIgnored` confirming a fenced `### Task 1 — Foo` is not parsed as a task.
- `agent/skills/_shared/scripts/extract-provenance-preamble.py` (Modify) — Extend the three regexes (`_RE_SOURCE`, `_RE_SCOUT`, `_RE_GIT_SHA_LINE`) to accept the bold-label form (`**Source:**`, `**Scout brief:**`, `**Git SHA:**`) alongside the existing plain-label form; preserve the value-shape constraints (TODO hex, docs/briefs path, 40-char hex SHA) and the `git_sha_malformed` failure on bad SHA values.
- `agent/skills/_shared/scripts/tests/test_extract_provenance_preamble.py` (Modify) — Add `TestBoldLabelForms` covering `**Source:**`/`**Scout brief:**`/`**Git SHA:**` extraction parity with plain-label; add `TestBoldLabelMalformedSha` confirming `**Git SHA:** not-a-sha` still fails with `git_sha_malformed`.
- `agent/skills/execute-plan/scripts/parse-coder-report.py` (Modify) — Update the STATUS-line regex to tolerate an optional leading `#`–`######` heading prefix (case-sensitive `STATUS:` token); preserve fence-awareness and the strict four-value token set.
- `agent/skills/execute-plan/scripts/tests/test_parse_coder_report.py` (Modify) — Add `TestStatusHeadingPrefixTolerance` covering `## STATUS: DONE` and `### STATUS: BLOCKED` parsing successfully; preserve existing tests for fenced fake-STATUS and `Status is done` prose still failing.
- `agent/skills/execute-plan/execute-task-prompt.md` (Modify) — Replace the `## Report Format` opener "Use this exact structure:" with an explicit terminal-line contract: the first non-fenced line of the report MUST be exactly `STATUS: <token>` with no Markdown heading marker, bullet, bolding, or preamble; no summary text precedes the STATUS line.
- `agent/skills/fast-lane/fast-lane-coder-prompt.md` (Modify) — Apply the same `## Report Format` rewording as `execute-task-prompt.md`: replace the permissive "Use this exact structure:" opener with the explicit terminal-line contract. The fast-lane coder report is parsed by the same `agent/skills/execute-plan/scripts/parse-coder-report.py` (per `agent/skills/fast-lane/SKILL.md` Step 5), so it shares the boundary and the contract must match.
- `agent/agents/scout.md` (Modify) — Tighten the marker line contract: marker line is the final non-empty assistant-message line, anchored at column 1, no prose/markdown/additional lines after; the same string is emitted via `subagent_done(message=…)`. Remove any permissive language.
- `agent/agents/spec-designer.md` (Modify) — Same tightening as `scout.md`.
- `agent/agents/planner.md` (Modify) — Same tightening as `scout.md`.
- `agent/agents/code-reviewer.md` (Modify) — Replace the existing "Conversational text before the marker line is permitted" sentence with the strict terminal-line contract from the spec.
- `agent/agents/plan-reviewer.md` (Modify) — Same change as `code-reviewer.md`.
- `agent/agents/test-runner.md` (Modify) — Replace "Conversational text before the marker is permitted" with the strict terminal-line contract.
- `agent/skills/refine-plan/SKILL.md` (Modify) — Rework Step 10 `STATUS: not_approved_within_budget` from the (a)/(b) menu to the three-option (c)/(r)/(x) menu; document that the menu overrides `AUTO_COMMIT_ON_APPROVAL` on the not-approved path; preserve the existing `STATUS` and `COMMIT` field values.
- `agent/skills/refine-code/SKILL.md` (Modify) — Rename Step 5's (a)/(b)/(c) menu letters to (c)/(p)/(x) and update the label wording per spec criterion 16; preserve every downstream branch's behavior.
- `agent/skills/fast-lane/SKILL.md` (Modify) — Update Step 9 and Step 12 references that name refine-code's old `(a) Keep iterating` / `(b) Proceed with issues` / `(c) Stop` menu letters to the renamed `(c) Continue refining code` / `(p) Proceed with issues` / `(x) Stop execution` letters. The fast-lane downstream branch semantics are unchanged — fast lane proceeds to todo closure on `(p) Proceed with issues` exactly as it currently proceeds on `(b) Proceed with issues`.
- `agent/skills/fast-lane/README.md` (Modify) — Update the two `(b) Proceed with issues` references (in the Step 8 numbered list and the cleanup-on-success bullet) to `(p) Proceed with issues` so the README stays consistent with the renamed refine-code menu.
- `agent/skills/_shared/scripts/parse-test-runner-artifact.py` (Modify) — Add a `--freshness-baseline` argument; thread it through to the internal `parse-artifact-handoff.py` invocation.
- `agent/skills/_shared/scripts/tests/test_parse_test_runner_artifact.py` (Modify) — Add `TestFinalMessageHandoffFallback` covering the marker-missing + fresh artifact + baseline path succeeding (`used_fallback: true`) and the marker-missing + stale path failing.
- `agent/skills/scout/SKILL.md` (Modify) — Add a baseline-capture step before Step 5 dispatch; pass `--freshness-baseline <baseline>` to the Step 6 `parse-artifact-handoff.py` invocation.
- `agent/skills/define-spec/SKILL.md` (Modify) — Add a pre-dispatch path-resolution sub-step in Step 3a that resolves a deterministic absolute `SPEC_OUTPUT_PATH` for ALL three input shapes (todo, existing-spec, freeform): existing-spec uses `os.path.abspath(<input-spec-path>)` against `<working-dir>`; todo reads `docs/todos/<raw-id>.md` and derives a kebab-case slug from its H1; freeform derives a slug from the first 60 chars of input. Capture `SPEC_BASELINE = os.path.getmtime(SPEC_OUTPUT_PATH) if exists else 0`. Pass both `--expected-path <SPEC_OUTPUT_PATH>` and `--freshness-baseline <SPEC_BASELINE>` to Step 4's `parse-artifact-handoff.py` invocation on all three branches uniformly. Substitute `{SPEC_OUTPUT_PATH}` into the `systemPrompt:` body (the loaded procedure text from Step 2) before dispatch so the spec-designer writes to that exact path. The existing case-(2) transcript-backed recovery contract is preserved as a secondary salvage path for the rare case where the spec-designer writes to a path other than `SPEC_OUTPUT_PATH`.
- `agent/skills/define-spec/spec-design-procedure.md` (Modify) — Replace Step 8's slug-derivation language with "write to the orchestrator-supplied absolute path `{SPEC_OUTPUT_PATH}`" on all three branches; replace Step 9's existing-spec subagent-branch conditional language with a single rule that the marker line equals `{SPEC_OUTPUT_PATH}` byte-equal on all three branches. The slug-derivation logic moves from the procedure to the orchestrator (`SKILL.md` Step 3a) so the orchestrator can pre-compute the path before dispatch as required by spec criterion 11. Step 1's existing-spec write-target directive "use the input path as-is — do not normalize between relative and absolute" is removed in favor of the uniform absolute-path rule.
- `agent/skills/generate-plan/SKILL.md` (Modify) — Add a baseline-capture step in Step 3 before planner dispatch; pass `--freshness-baseline <baseline>` to the Step 3.4 `parse-artifact-handoff.py` invocation. Update Step 5 to gate the execute-plan offer on `STATUS: approved` OR `STATUS: approved_with_concerns`; report the summary without offering execute-plan on `STATUS: not_approved_within_budget`.
- `agent/skills/refine-code/refine-code-prompt.md` (Modify) — In each of Iteration 1 Step 3, Iteration 2..N Step 5, and Final Verification Step 1, add a "Capture freshness baseline" sub-step immediately before the `subagent_run_serial` dispatch and pass `--freshness-baseline <baseline>` to the `parse-artifact-handoff.py` invocation in substep 3a–c. Keep the existing `validate-review-provenance.py` and `**Verdict:**` checks unchanged.
- `agent/skills/_shared/test-runner-dispatch.md` (Modify) — Update the Behavior section to capture the `artifact_path`'s mtime baseline before step 4 (dispatch) and pass `--freshness-baseline <baseline>` to step 5's `parse-test-runner-artifact.py` invocation.

## Tasks

### Task 1: Add `--freshness-baseline` to parse-artifact-handoff.py and unit tests

**Files:**
- Modify: `agent/skills/_shared/scripts/parse-artifact-handoff.py`
- Test: `agent/skills/_shared/scripts/tests/test_parse_artifact_handoff.py`

**Steps:**
- [ ] **Step 1: Add the new CLI argument** — In `agent/skills/_shared/scripts/parse-artifact-handoff.py`, add a `parser.add_argument("--freshness-baseline", metavar="UNIX_MTIME", help="Unix mtime captured before dispatch; pass 0 if the expected file did not exist. When supplied together with --expected-path, a missing marker is acceptable if the expected file exists, is non-empty, and has mtime strictly greater than this value.")` block alongside the existing arguments. Parse the value as a float; treat absent argument as `None`.
- [ ] **Step 2: Refactor the marker-extraction block** — Change the existing `terminal_line` / `match` logic so that on no match the script does NOT immediately call `fail(f"missing {args.marker} marker")`. Instead, set a local variable `marker_match = match` (or `None`) and proceed to a new fallback-decision block. When `marker_match is None`, the marker check has failed and we fall through to step 3.
- [ ] **Step 3: Implement the fallback-decision block** — When `marker_match is None`, first detect the "malformed marker attempt" case before considering the on-disk fallback. A malformed attempt is a marker-shaped line that appears in a context implying the subagent tried but failed to emit a canonical terminal marker. The accepted malformed contexts are: indented (any leading whitespace or tab), `>`-quoted, backtick-wrapped, or inside a fenced code block.

  Crucially, a column-1, OUTSIDE-of-fence marker-shaped line that is not identical to `terminal_line` is NOT treated as malformed — this is the in-production "marker emitted at column 1 but followed by a trailing summary paragraph" failure mode (subagent correctly anchored the marker but appended prose after it). It IS recoverable via the on-disk fallback when both `--expected-path` and `--freshness-baseline` are supplied and the expected file is fresh. (Path-mismatch for terminal-line markers stays preserved: when `terminal_line` IS a marker with a wrong path, the existing `match.group(1) != args.expected_path` check on line ~118 still fires and the script fails with `path mismatch: ...` before this fallback block is ever reached. The fallback only fires when `marker_match is None`, i.e., the terminal line was not a marker.)

  Build a permissive scan regex for indented/quoted/backticked contexts. Construct it as follows (note: the character class contains a literal backtick, and the quantifier is `+` — NOT `*` — so this requires AT LEAST ONE leading whitespace/tab/quote/backtick character):

  ~~~python
  malformed_marker_re_outside_fence = re.compile(
      r"^[ \t>`]+" + re.escape(args.marker) + r":\s*\S"
  )
  ~~~

  Also build a column-1 marker-shape regex used only for fence-context detection:

  ~~~python
  marker_shape_re = re.compile(r"^" + re.escape(args.marker) + r":\s*\S")
  ~~~

  The existing canonical `pattern` (line ~111: `re.compile(r"^" + re.escape(args.marker) + r": (.+)$")`) is reused below to extract the path from a non-terminal column-1 marker line and check it against `args.expected_path` BEFORE the fallback proceeds.

  Then, in a single pass, walk every line of `content.split("\n")` and track fenced-block state. A line whose stripped form starts with three or more backtick characters (e.g., ` ``` ` or ` ````json`) is a fence delimiter; the first such line opens a fence, the next closes it, and so on. For each line:

  - If `malformed_marker_re_outside_fence.match(line)` matches → set `malformed_marker_seen = True` (catches indented/quoted/backticked anywhere, fence-aware or not).
  - Else if the line is currently inside an open fence AND `marker_shape_re.match(line)` matches → set `malformed_marker_seen = True` (catches column-1 markers wrapped inside a fenced code block).
  - Else if the line is OUTSIDE any fence AND `marker_shape_re.match(line)` matches AND `line != terminal_line`: this is a non-terminal column-1 marker-shaped line. Attempt to extract the path with the canonical `pattern` (`re.compile(r"^" + re.escape(args.marker) + r": (.+)$")`). If the canonical pattern matches AND `args.expected_path is not None` AND the extracted path != `args.expected_path`, call `fail(f"path mismatch: expected {args.expected_path} got {extracted_path}")` IMMEDIATELY — do NOT proceed to the on-disk fallback. This preserves the spec's rejection case "marker present but path mismatches `--expected-path` → fail with the existing path-mismatch label (the fallback never bypasses path-mismatch errors)" for non-terminal markers as well as terminal markers. If the canonical pattern matches AND the extracted path == `args.expected_path` (matching non-terminal marker — the in-production "marker followed by summary paragraph" failure mode), take NO action and let the on-disk fallback decide downstream. If the canonical pattern does NOT match (the line has marker-shape but not the canonical `MARKER: <path>` form, e.g., `BRIEF_ARTIFACT:no-space` with no space after the colon), also take NO action; non-canonical marker-shapes outside a fence do not trigger path-mismatch detection because there is no extractable path. Use the existing error format from line ~119 byte-equal: `path mismatch: expected {expected} got {extracted}` (the word `got`, no comma after `{expected}`).

  If `malformed_marker_seen` is `True`, call `fail(f"missing {args.marker} marker")` immediately — do NOT proceed to the on-disk fallback. Otherwise (no malformed-marker attempt detected, no non-terminal path-mismatch detected), check: (a) `args.expected_path is not None`, (b) `args.freshness_baseline is not None`. If either is missing, call `fail(f"missing {args.marker} marker")` exactly as the old code did. Otherwise, check the on-disk fallback: open `args.expected_path`; if missing or has stat error, call `fail(f"missing or empty at {args.expected_path}")`; read its content; if `content.strip() == ""`, call `fail(f"missing or empty at {args.expected_path}")`. Get `current_mtime = os.path.getmtime(args.expected_path)`; if `current_mtime <= baseline`, call `fail(f"missing {args.marker} marker")` (stale ⇒ no fallback). Otherwise, set `path = args.expected_path` and `used_fallback = True`; skip the existing `expected_path` check (it would always pass because we set `path = args.expected_path`) and proceed to the optional `--check-existence`/`--check-non-empty`/`--require-path-suffix`/`--require-path-prefix` block, which still runs.
- [ ] **Step 4: Add the `used_fallback` field to stdout JSON** — Initialize `used_fallback = False` before the marker-extraction step. Set it to `True` on the fallback path. In the success `json.dump` near line 150, add `"used_fallback": used_fallback`.
- [ ] **Step 5: Update the script docstring** — Extend the top-of-file docstring `Canonical failure labels` block to document that with both `--expected-path` AND `--freshness-baseline` supplied, a missing marker may be acceptable; reference the new `used_fallback` field on the success JSON; add the new argument to the option list in the docstring.
- [ ] **Step 6: Write the new test class** — In `agent/skills/_shared/scripts/tests/test_parse_artifact_handoff.py`, append a `TestFreshnessBaselineFallback(unittest.TestCase)` class with these methods, each constructing artifacts and message files inline with `tempfile`:
    - `test_missing_marker_fresh_file_accepted` — final message has no marker, expected file exists with content "real review", baseline = mtime - 60. Assert exit 0, stdout `used_fallback` is `True`, `path` equals expected.
    - `test_missing_marker_stale_file_rejected` — final message has no marker, expected file exists with mtime equal to baseline. Assert exit 1 with `failure == "missing <MARKER> marker"`.
    - `test_missing_marker_missing_file_rejected` — final message has no marker, expected path points at a non-existent file. Assert exit 1 with `failure == "missing or empty at <path>"`.
    - `test_missing_marker_empty_file_rejected` — final message has no marker, expected file exists but contains only whitespace. Assert exit 1 with `failure == "missing or empty at <path>"`.
    - `test_missing_marker_no_baseline_strict` — final message has no marker, only `--expected-path` supplied (no `--freshness-baseline`). Assert exit 1 with `failure == "missing <MARKER> marker"`.
    - `test_missing_marker_no_expected_path_strict` — final message has no marker, only `--freshness-baseline` supplied (no `--expected-path`). Assert exit 1 with `failure == "missing <MARKER> marker"`.
    - `test_marker_present_path_mismatch_still_fails_with_baseline` — final message has a valid marker pointing at /other/path; `--expected-path` and `--freshness-baseline` both supplied. Assert exit 1 with `failure` starting `"path mismatch: expected"`.
    - `test_marker_present_used_fallback_false` — happy path; final message has valid marker; baseline supplied. Assert exit 0, stdout `used_fallback` is `False`.
    - `test_marker_in_fenced_block_rejects_fallback` — final message has the literal multi-line content (constructed with explicit `\n` separators) consisting of: an opening triple-backtick fence line, a `BRIEF_ARTIFACT: /x` line, a closing triple-backtick fence line, a blank line, and a final `Done.` line. So the message body looks like:

      ~~~
      ```
      BRIEF_ARTIFACT: /x
      ```

      Done.
      ~~~

      Baseline supplied AND expected file fresh. Assert exit 1 with `failure == "missing BRIEF_ARTIFACT marker"` — the column-1 `BRIEF_ARTIFACT: /x` line is inside an open fence, so Step 3's fence-context branch sets `malformed_marker_seen = True` and the fallback is REJECTED even with a fresh on-disk file. This matches the spec's rejection case "a marker-shaped line appears only inside a fenced or quoted block".
    - `test_marker_in_quoted_block_rejects_fallback` — final message contains `> BRIEF_ARTIFACT: /x` (a `>`-quoted marker-shaped line); baseline supplied AND expected file fresh. Assert exit 1 with `failure == "missing BRIEF_ARTIFACT marker"` (the quoted marker-shaped line is detected as a malformed attempt; fallback is rejected).
    - `test_marker_indented_rejects_fallback` — final message contains an indented marker-shaped line (e.g., `    BRIEF_ARTIFACT: /x`); baseline supplied AND expected file fresh. Assert exit 1 with `failure == "missing BRIEF_ARTIFACT marker"` (indented marker-shaped line counts as a malformed marker attempt; fallback rejected).
    - `test_marker_backticked_rejects_fallback` — final message contains a backtick-wrapped marker-shaped line (e.g., `` `BRIEF_ARTIFACT: /x` ``); baseline supplied AND expected file fresh. Assert exit 1 with `failure == "missing BRIEF_ARTIFACT marker"`.
    - `test_no_marker_shaped_lines_fallback_accepts` — final message contains only prose (e.g., `Some preamble.\nAll done.\n`) with NO `BRIEF_ARTIFACT:` substring anywhere; baseline supplied AND expected file fresh. Assert exit 0 with `used_fallback: True` (no malformed-marker scan hits, so the fallback proceeds normally to accept the fresh on-disk file).
    - `test_marker_followed_by_summary_accepted` — final message contains a column-1 marker line at the start followed by a trailing summary paragraph: the literal multi-line content `f"BRIEF_ARTIFACT: {expected_path}\n\nSummary: I wrote the brief and verified the headings.\n"`. Both `--expected-path` (equal to `expected_path`) and `--freshness-baseline` (set to `mtime - 60`) are supplied; the expected file exists and is fresh. Assert exit 0 with stdout JSON `used_fallback: True` and `path` equal to `expected_path`. This is the in-production marker-not-terminal failure mode (subagent correctly anchored the marker but appended a summary paragraph after it); the fallback recovers it via the fresh on-disk file. Path-mismatch IS checked on the non-terminal marker line (per spec criterion "marker present but path mismatches `--expected-path` → fail"); this test passes because the non-terminal marker's path is byte-equal to `--expected-path`. The companion `test_non_terminal_marker_path_mismatch_rejected` below exercises the opposite case (path mismatches).
    - `test_non_terminal_marker_path_mismatch_rejected` — final message contains a column-1 marker line at the start whose path does NOT match `--expected-path`, followed by a trailing summary paragraph. Construct it as: write the on-disk file to `expected_path` with fresh content, then build the final message as `f"BRIEF_ARTIFACT: /tmp/wrong-path.md\n\nSummary: marker emitted but path is wrong.\n"`. Pass `--expected-path {expected_path}` (the correct path) and `--freshness-baseline {mtime - 60}` so the on-disk file would otherwise be eligible for fallback. Assert exit 1 with stderr JSON `failure` byte-equal to `"path mismatch: expected {expected_path} got /tmp/wrong-path.md"` (the exact phrasing from the existing `pattern.match(terminal_line)` path-mismatch code path on line ~119 of `parse-artifact-handoff.py`). This regression test exercises the spec's rejection case that "the fallback never bypasses path-mismatch errors" for non-terminal markers as well as terminal ones.
- [ ] **Step 7: Run the test suite for this script** — Run `python3 -m unittest agent.skills._shared.scripts.tests.test_parse_artifact_handoff` from the repo root (or via `cd agent && npm run test:helpers`). Confirm every test passes.

**Acceptance criteria:**

- The new `--freshness-baseline` argument is documented in the script's top-of-file docstring and visible in `--help` output.
  Verify: run `python3 agent/skills/_shared/scripts/parse-artifact-handoff.py --help` from the repo root and confirm `--freshness-baseline` appears in the output and references `--expected-path` as a co-requirement.
- All test cases in the new `TestFreshnessBaselineFallback` class pass.
  Verify: run `python3 -m unittest agent.skills._shared.scripts.tests.test_parse_artifact_handoff.TestFreshnessBaselineFallback -v` from the repo root and confirm exit code 0 with each `test_*` method emitting `... ok`.
- All pre-existing tests in `test_parse_artifact_handoff.py` continue to pass without modification.
  Verify: run `python3 -m unittest agent.skills._shared.scripts.tests.test_parse_artifact_handoff -v` from the repo root and confirm exit code 0 and the count of executed tests is at least the pre-change baseline plus the new test methods.
- The success JSON output always includes the `used_fallback` field.
  Verify: open `agent/skills/_shared/scripts/parse-artifact-handoff.py` and confirm the final `json.dump({"path": path, "marker": args.marker, "checks": checks, "used_fallback": used_fallback}, sys.stdout)` call has the `used_fallback` key, and that `used_fallback` is initialized to `False` before any code path that might set it `True`.
- Marker-shaped lines that appear only inside fenced, quoted, indented, or backticked contexts cause the fallback to be REJECTED (even with a fresh on-disk file).
  Verify: run `python3 -m unittest agent.skills._shared.scripts.tests.test_parse_artifact_handoff.TestFreshnessBaselineFallback.test_marker_in_fenced_block_rejects_fallback agent.skills._shared.scripts.tests.test_parse_artifact_handoff.TestFreshnessBaselineFallback.test_marker_in_quoted_block_rejects_fallback agent.skills._shared.scripts.tests.test_parse_artifact_handoff.TestFreshnessBaselineFallback.test_marker_indented_rejects_fallback agent.skills._shared.scripts.tests.test_parse_artifact_handoff.TestFreshnessBaselineFallback.test_marker_backticked_rejects_fallback -v` from the repo root and confirm exit code 0 with all four methods passing.
- A column-1 marker line at the start of the final message followed by a trailing summary paragraph (the in-production marker-not-terminal failure mode) is RECOVERED via the on-disk fallback when `--expected-path` and `--freshness-baseline` are supplied, the expected file is fresh, AND the non-terminal marker's path matches `--expected-path`.
  Verify: run `python3 -m unittest agent.skills._shared.scripts.tests.test_parse_artifact_handoff.TestFreshnessBaselineFallback.test_marker_followed_by_summary_accepted -v` from the repo root and confirm exit code 0. Additionally, open `agent/skills/_shared/scripts/parse-artifact-handoff.py` and confirm Step 3's malformed-marker scan uses the `+` quantifier on the leading character class (`r"^[ \t>` + "`" + r"]+"`), NOT `*`, so column-1 outside-fence markers are not blanket-rejected.
- A column-1 non-terminal marker line whose path mismatches `--expected-path` is REJECTED with the existing `path mismatch: expected <X> got <Y>` label, even when `--freshness-baseline` is supplied and the expected on-disk file is fresh — the fallback NEVER bypasses path-mismatch errors.
  Verify: run `python3 -m unittest agent.skills._shared.scripts.tests.test_parse_artifact_handoff.TestFreshnessBaselineFallback.test_non_terminal_marker_path_mismatch_rejected -v` from the repo root and confirm exit code 0. Additionally, open `agent/skills/_shared/scripts/parse-artifact-handoff.py` and confirm Step 3's loop branch for OUTSIDE-fence column-1 marker-shaped lines that are not the terminal line attempts to extract the path via the canonical `pattern` (`r"^" + re.escape(args.marker) + r": (.+)$"`) and calls `fail(f"path mismatch: expected {args.expected_path} got {extracted_path}")` BEFORE the on-disk fallback decision when the extracted path differs from `args.expected_path`.

**Model recommendation:** standard

### Task 2: Add separator and case tolerance to extract-plan-tasks.py

**Files:**
- Modify: `agent/skills/execute-plan/scripts/extract-plan-tasks.py`
- Test: `agent/skills/execute-plan/scripts/tests/test_extract_plan_tasks.py`

**Steps:**
- [ ] **Step 1: Update `TASK_HEADING_RE`** — Replace `TASK_HEADING_RE = re.compile(r"^### Task (\d+):\s*(.*)")` with `TASK_HEADING_RE = re.compile(r"^### Task (\d+)\s*[:—–-]\s*(.*)$")`. This accepts the four canonical separators (`:`, `—` U+2014, `–` U+2013, `-`) with optional surrounding whitespace.
- [ ] **Step 2: Add `MALFORMED_TASK_HEADING_RE`** — Add a new module-level constant `MALFORMED_TASK_HEADING_RE = re.compile(r"^### Task \d")` (matches any "### Task" + digit line, regardless of what follows). This is the detection regex for malformed task headings.
- [ ] **Step 3: Emit `malformed_task_heading` diagnostics** — In `parse_plan`, inside the first-pass loop that walks `lines` to identify task heads (the `while i < n:` block that fills `task_starts`), add a branch: when `i not in in_fence` AND `TASK_HEADING_RE.match(line)` is `None` AND `MALFORMED_TASK_HEADING_RE.match(line)` matches, append `{"kind": "malformed_task_heading", "line": i + 1, "observed": line}` to `errors`. Continue iterating; do NOT add the malformed line to `task_starts`.
- [ ] **Step 4: Update the `numbered_tasks` section rule** — In `SECTION_RULES`, change the `numbered_tasks` pattern from `r"^### Task \d+:"` to `r"^### Task \d+\s*[:—–-]"` so the rule recognizes any accepted separator. The `requires_body: False` flag and the rest of the rule stay unchanged.
- [ ] **Step 5: Make ONLY the three named section patterns case-insensitive** — In `SECTION_RULES`, narrow the case-insensitive matching to the three sections enumerated in the spec: `architecture_summary`, `tech_stack`, and `risk_assessment`. The other patterns (`Goal`, `File Structure`, `Dependencies`, `numbered_tasks`) MUST remain case-sensitive — the spec's Non-Goals section explicitly forbids generalized parser relaxation beyond the listed variants, and applying `re.IGNORECASE` to every rule would widen this machine-trust parser beyond the bounded surface variants the spec authorized. Two acceptable implementations:

  - **Per-rule flag in `validate_required_sections`** (preferred): when iterating `SECTION_RULES`, compile each section's pattern with `re.IGNORECASE` only when the section name is one of `{"architecture_summary", "tech_stack", "risk_assessment"}`; compile every other section's pattern with no flags. Example:

    ~~~python
    IGNORECASE_SECTIONS = {"architecture_summary", "tech_stack", "risk_assessment"}
    flags = re.IGNORECASE if name in IGNORECASE_SECTIONS else 0
    compiled = re.compile(pattern, flags)
    ~~~

  - **Explicit case-permissive regex per rule**: rewrite ONLY the three targeted patterns as `r"^## [Aa]rchitecture [Ss]ummary"` / `r"^## [Tt]ech [Ss]tack"` / `r"^## [Rr]isk [Aa]ssessment"` and leave every other pattern unchanged.

  Do NOT compile every `SECTION_RULES` entry with `re.IGNORECASE`. A lowercase `## goal` or `## file structure` or `## dependencies` MUST still fail to satisfy its respective rule under this work.
- [ ] **Step 6: Update bold-label detection in `parse_task_block`** — In `parse_task_block`, replace:
    - `if stripped == "**Files:**":` → `if stripped.lower() == "**files:**":`
    - `if stripped == "**Steps:**":` → `if stripped.lower() == "**steps:**":`
    - `if stripped == "**Acceptance criteria:**":` → `if stripped.lower() == "**acceptance criteria:**":`
    - `if stripped.startswith("**Model recommendation:**"):` → `if stripped.lower().startswith("**model recommendation:**"):` (slicing length stays the original byte-length since "**Model recommendation:**" and "**Model Recommendation:**" are the same length — slice the original `stripped`, not the lowercased copy)
- [ ] **Step 7: Make the `Verify:` line check case-insensitive** — In `parse_task_block`'s criterion-parsing block (`if state == "criteria" and stripped.startswith("- "):`), change `if next_stripped.startswith("Verify:"):` to `if next_stripped.lower().startswith("verify:"):` and slice the original `next_stripped[len("Verify:"):]` — that slice length (7 chars) is the same for both cases, so the existing slice expression is correct without modification.
- [ ] **Step 7a: Confirm/preserve case-insensitive `Create:` / `Modify:` / `Test:` parsing in the `**Files:**` block** — In `parse_task_block`'s `state == "files"` branch, the existing code already uses `item.lower().startswith("create:")` / `"modify:"` / `"test:"` for matching, and `item[len("create:"):].strip()` for path extraction (the slice length is the same regardless of case). Confirm these three branches remain `.lower().startswith(...)`-based and the slice expressions use the lowercase literal token's length. Do NOT regress to case-sensitive matching when making other edits. If a code review of the current file shows the branches still use `.lower().startswith(...)`, no behavior change is required at this step — but the test coverage added in Step 9 below MUST include a case-variant test (Step 9 covers this) so the case-insensitivity is locked in.
- [ ] **Step 8: Document the new error kind** — Update the module docstring at the top of `extract-plan-tasks.py` so the `Protocol-error kinds` list includes a `malformed_task_heading` entry: `malformed_task_heading      — a "### Task N" heading does not use one of the accepted separators (:, —, –, -); fields: kind, line (1-based), observed (full heading text)`.
- [ ] **Step 9: Add new test classes** — In `agent/skills/execute-plan/scripts/tests/test_extract_plan_tasks.py`, append:
    - `TestSeparatorTolerance(unittest.TestCase)` — for each of the four separators (colon, em dash, en dash, hyphen), construct an inline plan with two tasks using that separator (mirroring `plan-clean.md`'s shape), run the parser, and assert `tasks[0]["number"] == 1`, `tasks[0]["title"] == "First task"`, `tasks[1]["number"] == 2`, `len(waves) >= 1`. Place all four sub-cases inside one test method using a `for sep in [":", "—", "–", "-"]:` loop.
    - `TestMalformedTaskHeading(unittest.TestCase)` — construct an inline plan that has `### Task 1` (no separator) inside the Tasks region; run the parser; assert exit non-zero and that `errors` contains a `{"kind": "malformed_task_heading", "line": <N>, "observed": "### Task 1"}` entry. Repeat for `### Task 1Title` (no separator, title runs into the digit).
    - `TestSectionHeadingCaseTolerance(unittest.TestCase)` — construct a plan identical to `plan-clean.md` but with `## Architecture Summary` / `## Tech Stack` / `## Risk Assessment` (title case); assert parsing succeeds and `tasks` length matches.
    - `TestUnrelaxedSectionHeadingsStayStrict(unittest.TestCase)` — construct three variants of `plan-clean.md`, each replacing exactly ONE of `## Goal` / `## File Structure` / `## Dependencies` with its lowercase form (`## goal` / `## file structure` / `## dependencies`); for each variant assert exit non-zero and `errors` contains a `{"kind": "missing_required_section", "section": <name>}` entry matching the relaxed section. This locks in the spec's Non-Goals boundary: case tolerance applies only to the three named sections, not all section headings.
    - `TestLabelCaseTolerance(unittest.TestCase)` — construct a plan with `**Acceptance Criteria:**` (title case) and `**Model Recommendation:**` (title case); assert parsing succeeds, criteria are populated, and `tasks[0]["model_recommendation"] == "cheap"`. Add a second method using lowercase `verify:` for the recipe line; assert each criterion's `verify` field is populated.
    - `TestFilePrefixCaseTolerance(unittest.TestCase)` — construct a plan whose `**Files:**` block uses mixed-case prefixes: `- create: path/to/a.ts`, `- MODIFY: path/to/b.ts`, `- Test: path/to/c.ts`, `- cReAtE: path/to/d.ts`. Assert parsing succeeds; assert `tasks[0]["files"]["create"]` contains both `path/to/a.ts` and `path/to/d.ts`; assert `tasks[0]["files"]["modify"]` contains `path/to/b.ts`; assert `tasks[0]["files"]["test"]` contains `path/to/c.ts`. Add a second method using the canonical title-case forms (`Create:`, `Modify:`, `Test:`) to confirm the canonical case still parses identically.
    - `TestVagueAliasRejected(unittest.TestCase)` — construct a plan replacing `### Task 1: ...` and surrounding task blocks with `## Implementation` (no `### Task` headings at all); assert exit non-zero and `errors` contains `{"kind": "missing_required_section", "section": "numbered_tasks"}` (the vague alias does NOT satisfy the rule).
    - `TestFencedVariantsIgnored(unittest.TestCase)` — construct a plan with one real `### Task 1: Real task` and an additional fenced block containing `### Task 99 — Fake fenced task`; assert exit 0 and only one task in the output (`task_numbers == [1]`).
- [ ] **Step 10: Run the test suite for this script** — Run `python3 -m unittest agent.skills.execute-plan.scripts.tests.test_extract_plan_tasks -v` from the repo root. Confirm every test passes.

**Acceptance criteria:**

- A plan with `### Task 1 — Title` (em dash) parses successfully and matches the same JSON shape as `### Task 1: Title`.
  Verify: run `python3 -m unittest agent.skills.execute-plan.scripts.tests.test_extract_plan_tasks.TestSeparatorTolerance -v` from the repo root and confirm exit code 0; additionally confirm the test method body iterates over `[":", "—", "–", "-"]` by reading the new test class.
- A plan with `### Task 1` (no separator) produces a targeted `malformed_task_heading` error citing the line number and observed heading text.
  Verify: run `python3 -m unittest agent.skills.execute-plan.scripts.tests.test_extract_plan_tasks.TestMalformedTaskHeading -v` and confirm exit code 0. Additionally, open `agent/skills/execute-plan/scripts/extract-plan-tasks.py` and confirm `MALFORMED_TASK_HEADING_RE` and the `malformed_task_heading` kind are present and emit `line` (1-based) and `observed` fields.
- Title-case section headings (`## Architecture Summary`, `## Tech Stack`, `## Risk Assessment`) parse alongside the existing sentence-case forms.
  Verify: run `python3 -m unittest agent.skills.execute-plan.scripts.tests.test_extract_plan_tasks.TestSectionHeadingCaseTolerance -v` and confirm exit code 0.
- Lowercase variants of section headings OTHER than the three spec-relaxed sections (`Goal`, `File Structure`, `Dependencies`) still fail with the existing `missing_required_section` error — case tolerance is bounded to the three named sections.
  Verify: run `python3 -m unittest agent.skills.execute-plan.scripts.tests.test_extract_plan_tasks.TestUnrelaxedSectionHeadingsStayStrict -v` and confirm exit code 0. Additionally, open `agent/skills/execute-plan/scripts/extract-plan-tasks.py` and confirm `re.IGNORECASE` is applied selectively (e.g., gated on a `{"architecture_summary", "tech_stack", "risk_assessment"}` set, or via per-rule case-permissive character classes) rather than blanket-compiled across all `SECTION_RULES` entries.
- Title-case `**Acceptance Criteria:**` and `**Model Recommendation:**`, and lowercase `verify:`, parse successfully.
  Verify: run `python3 -m unittest agent.skills.execute-plan.scripts.tests.test_extract_plan_tasks.TestLabelCaseTolerance -v` and confirm exit code 0.
- File-scope prefixes `Create:` / `Modify:` / `Test:` inside the `**Files:**` block parse case-insensitively (all of `create:`, `CREATE:`, `Create:`, `cReAtE:` produce the same `files.create` entries, and likewise for `modify:` and `test:`).
  Verify: run `python3 -m unittest agent.skills.execute-plan.scripts.tests.test_extract_plan_tasks.TestFilePrefixCaseTolerance -v` and confirm exit code 0. Additionally, open `agent/skills/execute-plan/scripts/extract-plan-tasks.py` and confirm the `state == "files"` branch matches with `item.lower().startswith("create:")` / `"modify:"` / `"test:"`.
- A vague alias `## Implementation` does not satisfy the `numbered_tasks` rule.
  Verify: run `python3 -m unittest agent.skills.execute-plan.scripts.tests.test_extract_plan_tasks.TestVagueAliasRejected -v` and confirm exit code 0.
- Fenced variants of task-like and section-like lines are ignored.
  Verify: run `python3 -m unittest agent.skills.execute-plan.scripts.tests.test_extract_plan_tasks.TestFencedVariantsIgnored -v` and confirm exit code 0.
- All pre-existing tests in `test_extract_plan_tasks.py` continue to pass without modification.
  Verify: run `python3 -m unittest agent.skills.execute-plan.scripts.tests.test_extract_plan_tasks -v` and confirm exit code 0 and no `FAIL`/`ERROR` lines in the output.

**Model recommendation:** standard

### Task 3: Accept bold-label provenance preamble forms in extract-provenance-preamble.py

**Files:**
- Modify: `agent/skills/_shared/scripts/extract-provenance-preamble.py`
- Test: `agent/skills/_shared/scripts/tests/test_extract_provenance_preamble.py`

**Steps:**
- [ ] **Step 1: Update the three regex constants** — In `extract-provenance-preamble.py`, change each regex to use explicit alternation accepting ONLY the plain label or the canonical bold-label form (matched asterisks on both sides), with malformed asterisk variants (single asterisk, mismatched, open-without-close) explicitly rejected:
    - `_RE_SOURCE = re.compile(r"^Source: (TODO-[0-9a-f]{8})$")` → `_RE_SOURCE = re.compile(r"^(?:Source:|\*\*Source:\*\*) (TODO-[0-9a-f]{8})$")`
    - `_RE_SCOUT = re.compile(r"^Scout brief: (docs/briefs/[^/]+)$")` → `_RE_SCOUT = re.compile(r"^(?:Scout brief:|\*\*Scout brief:\*\*) (docs/briefs/[^/]+)$")`
    - `_RE_GIT_SHA_LINE = re.compile(r"^Git SHA: (.+)$")` → `_RE_GIT_SHA_LINE = re.compile(r"^(?:Git SHA:|\*\*Git SHA:\*\*) (.+)$")`
    The non-capturing alternation `(?:X|Y)` accepts exactly two shapes per label: the plain form (`Source:`) OR the canonical bold form (`**Source:**` — both opening and closing asterisks required and matched). Malformed Markdown like `*Source:*` (single asterisks), `**Source:` (open without close), `Source:**` (close without open), or `*Source:**` (mismatched count) MUST NOT match. The colon, the space, and the value-shape constraint after the space stay unchanged across both branches.
- [ ] **Step 2: Update the module docstring** — In the top-of-file docstring, extend the "Supported line shapes" block so each of the three line shapes notes that the bold form is also accepted: `Source: TODO-<8 hex chars>` (also accepted as `**Source:** TODO-<8 hex chars>`); same for `Scout brief:` and `Git SHA:`.
- [ ] **Step 3: Add new test methods** — In `agent/skills/_shared/scripts/tests/test_extract_provenance_preamble.py`, inside the existing `TestExtractProvenancePreamble` class, add:
    - `test_spec_mode_extracts_bold_source_todo` — write a temp file with `# Title\n\n**Source:** TODO-abcdef01\n` and `## Real heading\n` body; run spec mode; assert `source_todo == "TODO-abcdef01"`.
    - `test_spec_mode_extracts_bold_scout_brief` — write a temp file with `**Scout brief:** docs/briefs/sample.md\n` in the preamble; assert `scout_brief == "docs/briefs/sample.md"`.
    - `test_brief_mode_extracts_bold_git_sha` — write a temp file with `# Brief\n**Git SHA:** 1234567890abcdef1234567890abcdef12345678\n`; assert `git_sha == "1234567890abcdef1234567890abcdef12345678"`.
    - `test_brief_mode_bold_git_sha_malformed_fails_closed` — write a temp file with `# Brief\n**Git SHA:** not-a-sha\n`; assert exit 1 and stderr JSON `failure == "git_sha_malformed"`.
    - `test_spec_mode_bold_provenance_inside_fence_ignored` — write a temp file with the bold variants inside a fenced code block before `## Real heading`; assert all three fields are `None` (fence-awareness preserved).
    - `test_spec_mode_malformed_asterisks_rejected` — write a temp file with `*Source:* TODO-abcdef01` (single asterisks) in the preamble; assert `source_todo` is `None` (malformed Markdown punctuation does NOT match). Repeat in additional sub-cases for `**Source: TODO-abcdef01` (open without close), `Source:** TODO-abcdef01` (close without open), and `*Source:** TODO-abcdef01` (mismatched count); each must leave `source_todo` as `None`.
    - `test_brief_mode_malformed_asterisks_git_sha_rejected` — write a temp file with `*Git SHA:* 1234567890abcdef1234567890abcdef12345678` (single asterisks); assert `git_sha` is `None` (the malformed label is not recognized, so the value is never parsed — therefore no `git_sha_malformed` error fires either, since no SHA-label line was matched at all).
- [ ] **Step 4: Run the test suite for this script** — Run `python3 -m unittest agent.skills._shared.scripts.tests.test_extract_provenance_preamble -v` from the repo root. Confirm every test passes.

**Acceptance criteria:**

- A preamble with `**Source:** TODO-<id>` populates `source_todo` identically to the plain-label form.
  Verify: run `python3 -m unittest agent.skills._shared.scripts.tests.test_extract_provenance_preamble.TestExtractProvenancePreamble.test_spec_mode_extracts_bold_source_todo -v` and confirm exit code 0.
- A preamble with `**Scout brief:** docs/briefs/<file>` populates `scout_brief` identically to the plain-label form.
  Verify: run `python3 -m unittest agent.skills._shared.scripts.tests.test_extract_provenance_preamble.TestExtractProvenancePreamble.test_spec_mode_extracts_bold_scout_brief -v` and confirm exit code 0.
- A preamble with `**Git SHA:** <40-char hex>` populates `git_sha` identically to the plain-label form.
  Verify: run `python3 -m unittest agent.skills._shared.scripts.tests.test_extract_provenance_preamble.TestExtractProvenancePreamble.test_brief_mode_extracts_bold_git_sha -v` and confirm exit code 0.
- A malformed bold-label SHA still fails with `git_sha_malformed`.
  Verify: run `python3 -m unittest agent.skills._shared.scripts.tests.test_extract_provenance_preamble.TestExtractProvenancePreamble.test_brief_mode_bold_git_sha_malformed_fails_closed -v` and confirm exit code 0.
- Bold-label lines inside fenced code blocks are still ignored.
  Verify: run `python3 -m unittest agent.skills._shared.scripts.tests.test_extract_provenance_preamble.TestExtractProvenancePreamble.test_spec_mode_bold_provenance_inside_fence_ignored -v` and confirm exit code 0.
- Malformed Markdown punctuation around the label (single asterisk, mismatched, open-without-close, close-without-open) is REJECTED — only the canonical plain form and the canonical bold form (`**Label:**` with matched asterisks on both sides) are accepted.
  Verify: run `python3 -m unittest agent.skills._shared.scripts.tests.test_extract_provenance_preamble.TestExtractProvenancePreamble.test_spec_mode_malformed_asterisks_rejected agent.skills._shared.scripts.tests.test_extract_provenance_preamble.TestExtractProvenancePreamble.test_brief_mode_malformed_asterisks_git_sha_rejected -v` and confirm exit code 0. Additionally, open `agent/skills/_shared/scripts/extract-provenance-preamble.py` and confirm each of `_RE_SOURCE`, `_RE_SCOUT`, `_RE_GIT_SHA_LINE` uses the non-capturing alternation `(?:<plain>|<bold>)` pattern, NOT `\*?\*?...\*?\*?`.
- All pre-existing tests in `test_extract_provenance_preamble.py` continue to pass without modification.
  Verify: run `python3 -m unittest agent.skills._shared.scripts.tests.test_extract_provenance_preamble -v` from the repo root and confirm exit code 0 with no `FAIL`/`ERROR` lines.

**Model recommendation:** cheap

### Task 4: Accept Markdown heading prefix on coder report STATUS line

**Files:**
- Modify: `agent/skills/execute-plan/scripts/parse-coder-report.py`
- Test: `agent/skills/execute-plan/scripts/tests/test_parse_coder_report.py`

**Steps:**
- [ ] **Step 1: Update the STATUS-line regex** — In `parse-coder-report.py`, find the `re.match(r"^STATUS:\s*(\S+)", line.rstrip("\n"))` call inside the `for idx, line in enumerate(raw_lines):` loop. Replace it with `re.match(r"^#{0,6}\s*STATUS:\s*(\S+)", line.rstrip("\n"))`. The `#{0,6}` quantifier accepts zero through six leading `#` characters; the `\s*` after permits an optional space between the heading marker and `STATUS:` (e.g., `## STATUS: DONE`, `###STATUS: DONE`, and the bare `STATUS: DONE` all parse).
- [ ] **Step 2: Update the module docstring** — In the docstring's "Find STATUS line" comment region and in the `epilog` of the argparse setup, note that the STATUS line may be optionally prefixed with one to six Markdown heading markers (`#` to `######`) and that fenced and prose-paraphrased variants still fail.
- [ ] **Step 3: Add new test method** — In `agent/skills/execute-plan/scripts/tests/test_parse_coder_report.py`, append a `TestStatusHeadingPrefixTolerance(unittest.TestCase)` class with these methods, each constructing inline reports:
    - `test_h2_status_done_parses` — first non-fenced line is `## STATUS: DONE`; assert `status == "DONE"`.
    - `test_h3_status_blocked_parses` — first non-fenced line is `### STATUS: BLOCKED`; assert `status == "BLOCKED"`.
    - `test_h6_status_done_with_concerns_parses` — first non-fenced line is `###### STATUS: DONE_WITH_CONCERNS`; assert `status == "DONE_WITH_CONCERNS"`.
    - `test_fenced_h2_status_still_fails` — STATUS line is inside ` ``` `; outside the fence there is no STATUS line. Assert exit 1 with `failure == "status_line_missing"`.
    - `test_h7_status_not_accepted` — first non-fenced line is `####### STATUS: DONE` (seven hashes); assert exit 1 (since the regex caps at six and the next line is not a valid STATUS).
    - `test_h2_status_unknown_token_still_fails` — first non-fenced line is `## STATUS: BOGUS`; assert exit 1 with `failure == "status_token_invalid"`.
- [ ] **Step 4: Run the test suite for this script** — Run `python3 -m unittest agent.skills.execute-plan.scripts.tests.test_parse_coder_report -v` from the repo root. Confirm every test passes.

**Acceptance criteria:**

- A coder report whose first non-fenced status-like line is `## STATUS: DONE` parses successfully with `status == "DONE"`.
  Verify: run `python3 -m unittest agent.skills.execute-plan.scripts.tests.test_parse_coder_report.TestStatusHeadingPrefixTolerance.test_h2_status_done_parses -v` and confirm exit code 0.
- A coder report whose first non-fenced status-like line is `### STATUS: BLOCKED` parses successfully with `status == "BLOCKED"`.
  Verify: run `python3 -m unittest agent.skills.execute-plan.scripts.tests.test_parse_coder_report.TestStatusHeadingPrefixTolerance.test_h3_status_blocked_parses -v` and confirm exit code 0.
- STATUS-shaped lines inside fenced blocks are still ignored.
  Verify: run `python3 -m unittest agent.skills.execute-plan.scripts.tests.test_parse_coder_report.TestStatusHeadingPrefixTolerance.test_fenced_h2_status_still_fails -v` and confirm exit code 0.
- Unknown STATUS tokens still fail with `status_token_invalid` regardless of heading prefix.
  Verify: run `python3 -m unittest agent.skills.execute-plan.scripts.tests.test_parse_coder_report.TestStatusHeadingPrefixTolerance.test_h2_status_unknown_token_still_fails -v` and confirm exit code 0.
- All pre-existing tests in `test_parse_coder_report.py` continue to pass without modification.
  Verify: run `python3 -m unittest agent.skills.execute-plan.scripts.tests.test_parse_coder_report -v` and confirm exit code 0 with no `FAIL`/`ERROR` lines.

**Model recommendation:** cheap

### Task 5: Strengthen coder STATUS terminal-line contract in execute-task-prompt.md AND fast-lane-coder-prompt.md

**Files:**
- Modify: `agent/skills/execute-plan/execute-task-prompt.md`
- Modify: `agent/skills/fast-lane/fast-lane-coder-prompt.md`

**Steps:**
- [ ] **Step 1: Locate the `## Report Format` section in execute-task-prompt.md** — Open `agent/skills/execute-plan/execute-task-prompt.md` and find the section beginning at the line `## Report Format`. The next line currently reads `Use this exact structure:`, followed by a ` ``` ` fenced example showing the report shape.
- [ ] **Step 2: Replace the permissive opener in execute-task-prompt.md with an explicit contract** — Replace the line `Use this exact structure:` with the following three-paragraph block (preserve the fenced example below it intact):

  ~~~
  Your report MUST begin with a `STATUS:` line. The first non-fenced line of your report MUST be exactly `STATUS: <token>` where `<token>` is one of `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, or `NEEDS_CONTEXT`. Do not prefix `STATUS:` with a Markdown heading marker (`#`–`######`), a bullet (`-`, `*`), bolding (`**`), or any other character. Do not place a summary paragraph, greeting, or any other text before the `STATUS:` line.

  The lines that follow `STATUS:` use this exact structure:
  ~~~

  Then leave the existing ` ``` `-fenced report-format example unchanged.
- [ ] **Step 3: Confirm the existing status-code-guidance block is still intact in execute-task-prompt.md** — Below the fenced example, the file has a `**Status code guidance:**` block listing the four status tokens and their semantics. This stays unchanged.
- [ ] **Step 4: Locate the `## Report Format` section in fast-lane-coder-prompt.md** — Open `agent/skills/fast-lane/fast-lane-coder-prompt.md` and find the section beginning at the line `## Report Format`. The next line currently reads `Use this exact structure:`, followed by a ` ``` ` fenced example showing the report shape (the fast-lane example has the same `STATUS: <DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT>` shape as the execute-task variant).
- [ ] **Step 5: Replace the permissive opener in fast-lane-coder-prompt.md with the identical explicit contract** — Replace the line `Use this exact structure:` in `agent/skills/fast-lane/fast-lane-coder-prompt.md` with the same three-paragraph block from Step 2 (verbatim, byte-equal text). Preserve the fenced example below it intact. Preserve the existing `**Status code guidance:**` block below the fenced example unchanged.
- [ ] **Step 6: Confirm both files share the strict contract** — Visually confirm both files now open the `## Report Format` section with the same first paragraph wording (the explicit terminal-line contract). The downstream parser `agent/skills/execute-plan/scripts/parse-coder-report.py` is the same boundary for both, so the prompt-side wording must be aligned.

**Acceptance criteria:**

- `execute-task-prompt.md`'s `## Report Format` section opens with the explicit terminal-line contract from the spec (no `Markdown heading marker`, no `bullet`, no `bolding`, no `preamble`).
  Verify: `grep -n "Do not prefix \`STATUS:\` with a Markdown heading marker" agent/skills/execute-plan/execute-task-prompt.md` returns at least one match within the `## Report Format` section, AND `grep -n "Use this exact structure" agent/skills/execute-plan/execute-task-prompt.md` returns zero matches for the original permissive opener (the phrase may still appear as part of "use this exact structure:" lower-case prose introducing the fenced block, but the precise old opener "Use this exact structure:" on its own line must be gone).
- `fast-lane-coder-prompt.md`'s `## Report Format` section opens with the same explicit terminal-line contract.
  Verify: `grep -n "Do not prefix \`STATUS:\` with a Markdown heading marker" agent/skills/fast-lane/fast-lane-coder-prompt.md` returns at least one match within the `## Report Format` section, AND `grep -cE "^Use this exact structure:$" agent/skills/fast-lane/fast-lane-coder-prompt.md` returns `0` (the original permissive opener on its own line is gone).
- The fenced report-format example below the contract is preserved in both files.
  Verify: open `agent/skills/execute-plan/execute-task-prompt.md`, find the `## Report Format` section, and confirm a ` ``` `-fenced block still contains the lines `STATUS: <DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT>`, `## Completed`, `## Tests`, `## Files Changed`, `## Self-Review Findings`, and `## Concerns / Needs / Blocker` in that order. Repeat the same check for `agent/skills/fast-lane/fast-lane-coder-prompt.md`.
- The `**Status code guidance:**` blocks at the bottom of both files remain intact.
  Verify: `grep -c "Status code guidance" agent/skills/execute-plan/execute-task-prompt.md` returns at least `1`, and `grep -c "Status code guidance" agent/skills/fast-lane/fast-lane-coder-prompt.md` returns at least `1`.

**Model recommendation:** cheap

### Task 6: Tighten marker-emit terminal-message contract in all five subagent definitions

**Files:**
- Modify: `agent/agents/scout.md`
- Modify: `agent/agents/spec-designer.md`
- Modify: `agent/agents/planner.md`
- Modify: `agent/agents/code-reviewer.md`
- Modify: `agent/agents/plan-reviewer.md`
- Modify: `agent/agents/test-runner.md`

**Steps:**
- [ ] **Step 1: Update `agent/agents/code-reviewer.md`** — Locate the `## Output Artifact Contract` section, the "When `{REVIEW_OUTPUT_PATH}` is non-empty" subsection. Remove the bullet "6. Conversational text before the marker line is permitted; the refiner anchors on the last `^REVIEW_ARTIFACT: (.+)$` line." Replace it with a stricter contract paragraph:

  ~~~
  6. The marker line MUST be the final non-empty line of your assistant message, anchored at column 1 (no leading whitespace, quote markers, or backticks). No prose, Markdown, or other content may follow the marker line on subsequent lines. The same exact string MUST be emitted as the `message` argument to `subagent_done`.
  ~~~

- [ ] **Step 2: Update `agent/agents/plan-reviewer.md`** — Apply the same change as Step 1 to `agent/agents/plan-reviewer.md`'s `## Output Artifact Contract` section, "When `{REVIEW_OUTPUT_PATH}` is non-empty" subsection. The current bullet 6 is identical to `code-reviewer.md`'s; replace it with the same stricter contract paragraph (use `^REVIEW_ARTIFACT: (.+)$` consistently).
- [ ] **Step 3: Update `agent/agents/test-runner.md`** — Locate the `## Output Contract` section. The current paragraph reads "where `<absolute path>` is character-for-character identical to `## Artifact Output Path`. The orchestrator anchors on the LAST `^TEST_RESULT_ARTIFACT: (.+)$` line of your final message. Conversational text before the marker is permitted." Replace the trailing sentence "Conversational text before the marker is permitted." with "The marker line MUST be the final non-empty line of your assistant message, anchored at column 1 (no leading whitespace, quote markers, or backticks). No prose, Markdown, or other content may follow the marker line on subsequent lines."
- [ ] **Step 4: Update `agent/agents/scout.md`** — The file currently includes the terminal-message contract under `## Hard rules`. Verify the rule line "End your final assistant message with a single anchored line `BRIEF_ARTIFACT: <absolute path>` matching the orchestrator-supplied output path exactly. No backticks, no trailing commentary on that line." is present and append (in the same rule, or as a follow-on sentence) the stricter wording: " The marker line MUST be the final non-empty line of your assistant message; no further prose, Markdown, or content may follow it on subsequent lines."
- [ ] **Step 5: Update `agent/agents/spec-designer.md`** — Apply the same tightening to `spec-designer.md`. The file is short; locate (or add) the rule documenting the `SPEC_ARTIFACT:` terminal line. If a contract section exists, append the stricter wording (no further prose, Markdown, or content may follow the marker line on subsequent lines). If no explicit terminal-message rule is present yet, add one under the existing "Hard rules" block: "End your final assistant message with a single anchored line `SPEC_ARTIFACT: <absolute path>` matching the orchestrator-supplied output path exactly. The marker line MUST be the final non-empty line of your assistant message; no further prose, Markdown, or content may follow it on subsequent lines. Also call `subagent_done(message=\"SPEC_ARTIFACT: <absolute path>\")` as your terminal tool action."
- [ ] **Step 6: Update `agent/agents/planner.md`** — Locate the `## Output` section. Step 1 currently states "End your final assistant message with a single anchored line on its own line, as the very last line of your output:" followed by the marker example. Append after that step's "No surrounding backticks, no trailing commentary on the same line." sentence the stricter wording: "The marker line MUST be the final non-empty line of your assistant message; no further prose, Markdown, or content may follow it on subsequent lines."

**Acceptance criteria:**

- `agent/agents/code-reviewer.md` no longer contains the permissive phrase "Conversational text before the marker line is permitted".
  Verify: `grep -c "Conversational text before the marker" agent/agents/code-reviewer.md` returns `0`.
- `agent/agents/plan-reviewer.md` no longer contains the permissive phrase "Conversational text before the marker line is permitted".
  Verify: `grep -c "Conversational text before the marker" agent/agents/plan-reviewer.md` returns `0`.
- `agent/agents/test-runner.md` no longer contains the permissive phrase "Conversational text before the marker is permitted".
  Verify: `grep -c "Conversational text before the marker" agent/agents/test-runner.md` returns `0`.
- Each of the six modified agent definition files mentions the "final non-empty line" terminal-message contract.
  Verify: for each path in `agent/agents/scout.md`, `agent/agents/spec-designer.md`, `agent/agents/planner.md`, `agent/agents/code-reviewer.md`, `agent/agents/plan-reviewer.md`, `agent/agents/test-runner.md`, run `grep -c "final non-empty line" <path>` and confirm each returns at least `1`.
- The `test_marker_emit_contract.py` test suite continues to pass (each agent file still references its marker name and the `subagent_done(message=...)` instruction).
  Verify: run `python3 -m unittest agent.skills._shared.scripts.tests.test_marker_emit_contract -v` from the repo root and confirm exit code 0.

**Model recommendation:** standard

### Task 7: Rework refine-plan Step 10 not_approved_within_budget menu to three options

**Files:**
- Modify: `agent/skills/refine-plan/SKILL.md`

**Steps:**
- [ ] **Step 1: Locate Step 10 § `STATUS: not_approved_within_budget`** — Open `agent/skills/refine-plan/SKILL.md` and find the `### STATUS: not_approved_within_budget` subheading within `## Step 10`. The current content presents an (a)/(b) menu and explains (a)/(b) handling.
- [ ] **Step 2: Replace the menu copy** — Replace the two existing menu bullets and the (a)/(b) handling paragraphs with the three-option menu from the spec. The replacement block reads exactly:

  ~~~
  Present the budget-exhaustion menu exactly as:

  - **(c) Continue refining plan** — Commit current era's plan + review artifacts (via Step 10a), then keep iterating into era v`<STARTING_ERA + 1>` with a fresh iteration budget. Internally re-set `CARRY_OVER_REVIEW = <era-N review file path that was just committed in Step 10a>` and re-enter Step 6 with `STARTING_ERA` recomputed by re-scanning `docs/plans/reviews/` (the rule remains `max(existing_N) + 1`).
  - **(r) Save plan for manual review** — Commit current era's plan + review artifacts (via Step 10a), then exit `refine-plan` with `STATUS: not_approved_within_budget` and `COMMIT: committed` (plus the existing `PLAN_PATH` / `REVIEW_PATHS` / `STRUCTURAL_ONLY` summary fields).
  - **(x) Stop execution** — Leave the plan and all current-era review artifacts uncommitted on disk; exit `refine-plan` with `STATUS: not_approved_within_budget` and `COMMIT: left_uncommitted`. No files are deleted from disk; the user inspects or removes them manually.

  **This menu is always presented on `not_approved_within_budget` regardless of `AUTO_COMMIT_ON_APPROVAL`.** The user's choice itself encodes the commit decision; `AUTO_COMMIT_ON_APPROVAL` does not bypass or pre-select any of the three options. (`AUTO_COMMIT_ON_APPROVAL` continues to govern the `approved` and `approved_with_concerns` paths unchanged.)

  **On `(c) Continue refining plan`:** Run Step 10a (commit current era). Step 10a MUST succeed (`COMMIT = committed`) before the next era is dispatched. If Step 10a sets `COMMIT = not_attempted` (commit failed for any reason — pre-commit hook failure, dirty index, underlying error), STOP refinement immediately: preserve `STATUS = not_approved_within_budget` and the `COMMIT = not_attempted [reason]` value from Step 10a, do **NOT** dispatch the next era, and skip directly to Step 11. Only when Step 10a sets `COMMIT = committed` may the skill re-run from Step 6 onward — with `STARTING_ERA` recomputed by re-scanning `docs/plans/reviews/` (it will now reflect the just-committed file plus any uncommitted files; the rule remains `max(existing_N) + 1`) and `CARRY_OVER_REVIEW = <era-N review file path that was just committed in Step 10a>` so the next plan-refiner dispatch performs a carry-over edit pass against era N's findings. Loop until either `STATUS: approved` / `STATUS: approved_with_concerns` (proceed normally) or the user picks `(r)` or `(x)`.

  **On `(r) Save plan for manual review`:** Run Step 10a (commit current era). On success, set `COMMIT = committed` (with the SHA reported by the commit skill when available). On Step 10a failure, set `COMMIT = not_attempted [reason]`. Either way, proceed to Step 11 — do NOT dispatch the next era. The summary surfaces `STATUS: not_approved_within_budget` plus the resolved `COMMIT` value.

  **On `(x) Stop execution`:** Set `COMMIT = left_uncommitted`. Do NOT invoke Step 10a. Do NOT delete any files from disk. Proceed to Step 11. The summary surfaces `STATUS: not_approved_within_budget` and `COMMIT: left_uncommitted`.
  ~~~

  Delete the old text covering `**On `(a)`:**` and `**On `(b)`:**` entirely — the three-option block replaces them.
- [ ] **Step 3: Update the orchestrator-verification-boundary block above Step 10** — The current `### Boundary: orchestrator MUST NOT re-judge the plan-refiner's verdict` block (above Step 10) contains a paragraph: "the only sanctioned re-entry from this skill is the (a) commit-and-continue choice on `not_approved_within_budget`, which re-runs from Step 6 onward with `STARTING_ERA` recomputed." Replace `(a) commit-and-continue choice` with `(c) Continue refining plan choice` so the boundary doc references the new letter.
- [ ] **Step 4: Update Step 10a's contract** — Step 10a `## Step 10a: Invoke commit skill` opens with "Invoke the `commit` skill with **concrete file paths only**". This subsection is invoked by both `(c)` and `(r)` in the new menu. Confirm no edits are needed here beyond the references above; the existing content already covers the success/failure outcomes.
- [ ] **Step 5: Update Step 11's output format references** — Step 11's output block lists `STATUS` and `COMMIT` values. The new `(x) Stop execution` option uses the existing `COMMIT: left_uncommitted` value, and the new `(r)` option uses the existing `COMMIT: committed [sha]` value. Confirm no edits to Step 11's output format are required — both values are already documented in the existing block.

**Acceptance criteria:**

- Step 10 § `STATUS: not_approved_within_budget` presents exactly the three options (c)/(r)/(x) with the agreed wording.
  Verify: open `agent/skills/refine-plan/SKILL.md`, locate the `### STATUS: not_approved_within_budget` subsection, and confirm three bullets begin with `**(c) Continue refining plan**`, `**(r) Save plan for manual review**`, and `**(x) Stop execution**` respectively, in that order. Additionally, `grep -c "Commit current era's plan + review artifacts (via Step 10a), then keep iterating" agent/skills/refine-plan/SKILL.md` returns at least `1`.
- The menu is documented to always be presented on `not_approved_within_budget` regardless of `AUTO_COMMIT_ON_APPROVAL`.
  Verify: `grep -n "regardless of \`AUTO_COMMIT_ON_APPROVAL\`" agent/skills/refine-plan/SKILL.md` returns at least one match inside the `### STATUS: not_approved_within_budget` subsection.
- The old (a)/(b) menu copy has been removed.
  Verify: `grep -c "^- \*\*(a)\*\* Commit current era's plan" agent/skills/refine-plan/SKILL.md` returns `0`, and `grep -c "^- \*\*(b)\*\* Stop here and proceed" agent/skills/refine-plan/SKILL.md` returns `0`.
- The (c) branch sets `CARRY_OVER_REVIEW` to the just-committed era's review file before re-entering Step 6.
  Verify: open `agent/skills/refine-plan/SKILL.md`, find the **On `(c) Continue refining plan`:** paragraph, and confirm it includes the literal text `CARRY_OVER_REVIEW = <era-N review file path that was just committed in Step 10a>` and the literal text `re-run from Step 6 onward`.
- The (x) branch documents that no files are deleted.
  Verify: open `agent/skills/refine-plan/SKILL.md`, find the **On `(x) Stop execution`:** paragraph, and confirm it includes the literal text `Do NOT delete any files from disk`.
- The orchestrator-verification-boundary block references `(c) Continue refining plan choice` rather than `(a) commit-and-continue choice`.
  Verify: `grep -c "(c) Continue refining plan choice" agent/skills/refine-plan/SKILL.md` returns at least `1`, and `grep -c "(a) commit-and-continue choice" agent/skills/refine-plan/SKILL.md` returns `0`.

**Model recommendation:** standard

### Task 8: Align refine-code Step 5 menu letters to (c)/(p)/(x) AND update fast-lane caller references

**Files:**
- Modify: `agent/skills/refine-code/SKILL.md`
- Modify: `agent/skills/fast-lane/SKILL.md`
- Modify: `agent/skills/fast-lane/README.md`

**Steps:**
- [ ] **Step 1: Locate Step 5 `STATUS: not_approved_within_budget` choices** — Open `agent/skills/refine-code/SKILL.md` and find the `**`STATUS: not_approved_within_budget`**` subsection inside Step 5. It currently lists three bullets:
    - `(a) Keep iterating` — re-invoke this skill from Step 3 …
    - `(b) Proceed with issues` — caller continues with known issues noted
    - `(c) Stop execution` — caller halts
- [ ] **Step 2: Replace the three bullets with the renamed letters** — Replace the three bullets verbatim with:

  ~~~
  - **(c) Continue refining code** — re-invoke this skill from Step 3 with the same inputs but `HEAD_SHA` updated to current HEAD AND --carry-over-review set to the prior era's review file path (so code-refiner runs a carry-over remediation pass against the prior era's findings before the next review). Budget resets, new cycle.
  - **(p) Proceed with issues** — caller continues with known issues noted
  - **(x) Stop execution** — caller halts
  ~~~

  Preserve the surrounding paragraphs (the "The caller … makes the decision" sentence and the boundary block) untouched. Only the three bullets and their introductory words change.
- [ ] **Step 3: Update the orchestrator-verification-boundary block** — Find the boundary block above Step 6 that states "the only sanctioned re-entry from this skill is the (a) keep-iterating choice on `not_approved_within_budget`." Change `(a) keep-iterating choice` to `(c) continue-refining choice` so the boundary doc references the new letter.
- [ ] **Step 4: Update the Step 6 forwarding paragraph** — Step 6's per-status additions paragraph currently reads "`not_approved_within_budget` — add the (a)/(b)/(c) menu after the forwarded blocks." Change to "`not_approved_within_budget` — add the (c)/(p)/(x) menu after the forwarded blocks."
- [ ] **Step 5: Update the Carry-over review row in the Step 1 inputs table** — Open `agent/skills/refine-code/SKILL.md` and find the `| Carry-over review |` row in the Step 1 inputs table. The current description reads `Internally re-set on (a) Keep iterating re-entry from Step 5.` Replace `(a) Keep iterating` with `(c) Continue refining code` so the table description references the new letter.
- [ ] **Step 6: Update fast-lane/SKILL.md Step 9 paragraph naming refine-code's menu** — Open `agent/skills/fast-lane/SKILL.md` and find the Step 9 paragraph: `Refine-code's existing menu on STATUS: not_approved_within_budget ((a) Keep iterating / (b) Proceed with issues / (c) Stop) stays as-is — fast lane introduces no override.` Replace the three menu-letter references in that paragraph with the renamed letters: `(c) Continue refining code / (p) Proceed with issues / (x) Stop execution`. The "stays as-is — fast lane introduces no override" wording is preserved (fast lane introduces no semantic override; it just inherits the renamed labels from refine-code).
- [ ] **Step 7: Update fast-lane/SKILL.md Step 9 bullet list naming the proceed letter** — In the same `agent/skills/fast-lane/SKILL.md` Step 9, find the bullet "`STATUS: not_approved_within_budget` with the user choosing `(b) Proceed with issues`". Replace `(b) Proceed with issues` with `(p) Proceed with issues`.
- [ ] **Step 8: Update fast-lane/SKILL.md Step 12 cleanup-on-success bullet** — In the same `agent/skills/fast-lane/SKILL.md`, find the Step 12 bullet "**On successful completion** (refine-code returns `approved` / `approved_with_concerns` / `(b) Proceed with issues`, …". Replace `(b) Proceed with issues` with `(p) Proceed with issues`.
- [ ] **Step 9: Update fast-lane/README.md Step 8 numbered list and cleanup-on-success bullet** — Open `agent/skills/fast-lane/README.md` and replace both occurrences of `(b) Proceed with issues` with `(p) Proceed with issues`. The first sits inside item 8 of the numbered "What it does" list; the second sits inside the cleanup-on-success bullet. The surrounding "refine-code's existing menu" wording is preserved.

**Acceptance criteria:**

- Step 5's `STATUS: not_approved_within_budget` block lists exactly three bullets in order: (c) Continue refining code, (p) Proceed with issues, (x) Stop execution.
  Verify: open `agent/skills/refine-code/SKILL.md`, locate the `**\`STATUS: not_approved_within_budget\`**` subsection inside Step 5, and confirm the three bullets begin (in order) with `**(c) Continue refining code**`, `**(p) Proceed with issues**`, `**(x) Stop execution**`.
- The old (a)/(b)/(c) bullet labels under Step 5's `not_approved_within_budget` block have been removed.
  Verify: open `agent/skills/refine-code/SKILL.md` and within Step 5, confirm there are no remaining bullets that begin with `**(a) Keep iterating**`, `**(b) Proceed with issues**`, or `**(c) Stop execution**`. `grep -c "(a) Keep iterating" agent/skills/refine-code/SKILL.md` returns `0`.
- The boundary block references the new letter.
  Verify: `grep -c "(c) continue-refining choice" agent/skills/refine-code/SKILL.md` returns at least `1`, and `grep -c "(a) keep-iterating choice" agent/skills/refine-code/SKILL.md` returns `0`.
- Step 6's per-status additions paragraph references the new menu letters.
  Verify: `grep -c "(c)/(p)/(x) menu after the forwarded blocks" agent/skills/refine-code/SKILL.md` returns at least `1`, and `grep -c "(a)/(b)/(c) menu after the forwarded blocks" agent/skills/refine-code/SKILL.md` returns `0`.
- Step 1's Carry-over review row references the new letter.
  Verify: `grep -c "(c) Continue refining code re-entry from Step 5" agent/skills/refine-code/SKILL.md` returns at least `1`, and `grep -c "(a) Keep iterating re-entry" agent/skills/refine-code/SKILL.md` returns `0`.
- The fast-lane SKILL Step 9 paragraph names refine-code's renamed menu letters.
  Verify: `grep -c "(c) Continue refining code / (p) Proceed with issues / (x) Stop execution" agent/skills/fast-lane/SKILL.md` returns at least `1`, and `grep -c "(a) Keep iterating / (b) Proceed with issues / (c) Stop" agent/skills/fast-lane/SKILL.md` returns `0`.
- The fast-lane SKILL Step 9 bullet naming the proceed letter and Step 12 cleanup bullet use `(p) Proceed with issues`.
  Verify: `grep -c "(p) Proceed with issues" agent/skills/fast-lane/SKILL.md` returns at least `2`, and `grep -c "(b) Proceed with issues" agent/skills/fast-lane/SKILL.md` returns `0`.
- The fast-lane README references use `(p) Proceed with issues`.
  Verify: `grep -c "(p) Proceed with issues" agent/skills/fast-lane/README.md` returns at least `2`, and `grep -c "(b) Proceed with issues" agent/skills/fast-lane/README.md` returns `0`.

**Model recommendation:** cheap

### Task 9: Thread `--freshness-baseline` through parse-test-runner-artifact.py

**Files:**
- Modify: `agent/skills/_shared/scripts/parse-test-runner-artifact.py`
- Test: `agent/skills/_shared/scripts/tests/test_parse_test_runner_artifact.py`

**Steps:**
- [ ] **Step 1: Add the new CLI argument** — In `agent/skills/_shared/scripts/parse-test-runner-artifact.py`, inside the `main()` function's argparse block, add `parser.add_argument("--freshness-baseline", metavar="UNIX_MTIME", help="Pre-dispatch mtime of the expected artifact. When supplied together with --final-message and --expected-path, a missing TEST_RESULT_ARTIFACT marker is acceptable if the on-disk artifact is fresh (mtime > baseline) and non-empty.")` alongside the existing arguments.
- [ ] **Step 2: Pass the flag through to the internal handoff invocation** — Currently the internal `subprocess.run` call (lines ~233–244) builds an argv list with `--marker TEST_RESULT_ARTIFACT --final-message ... --expected-path ... --check-existence --check-non-empty`. When `args.freshness_baseline` is not `None`, append `"--freshness-baseline", args.freshness_baseline` to that argv list before invoking. Keep the existing condition `if args.final_message and args.expected_path:` — the freshness baseline is only meaningful when those two are also supplied; if `args.freshness_baseline` is supplied without those two, ignore it silently (the existing condition gates the entire handoff invocation).
- [ ] **Step 2a: Propagate `used_fallback` from the internal handoff parser to this script's stdout JSON** — Initialize a local variable `used_fallback = False` before the `if args.final_message and args.expected_path:` block. Inside that block, after the `subprocess.run` returns with exit 0, parse its stdout as JSON via `handoff_data = json.loads(result.stdout)` and set `used_fallback = bool(handoff_data.get("used_fallback", False))`. (Default to `False` if the key is absent — defensive, though Task 1 guarantees the key is always present.) Then in the success-emission block at the bottom of `main()`, change `print(json.dumps(data, indent=2))` to attach the field: `data["used_fallback"] = used_fallback; print(json.dumps(data, indent=2))`. The result is that the script's stdout JSON always has a top-level `used_fallback` boolean alongside the existing structural fields (`exit_code`, `failing_identifiers`, etc.). When the handoff invocation is not run (caller did not supply `--final-message`), `used_fallback` remains `False` in the output.
- [ ] **Step 3: Update the module docstring** — Extend the top-of-file docstring's failure-label list with a brief note that with `--freshness-baseline` supplied along with `--final-message` and `--expected-path`, a missing-marker fallback is performed and the artifact's structural-format validation is then run as today. Document the new argument in the script's `argparse` epilog so it appears in `--help` output. Also document that the success-JSON output now includes a top-level `used_fallback` boolean indicating whether the missing-marker fallback was used for the marker portion of the parse (false when the marker was present and valid, or when the handoff invocation was skipped).
- [ ] **Step 4: Add a new test class for the fallback pass-through** — In `agent/skills/_shared/scripts/tests/test_parse_test_runner_artifact.py`, append `TestFinalMessageHandoffFallback(unittest.TestCase)` with these methods, each constructing inline artifacts and message files via the existing helpers:
    - `test_missing_marker_fresh_artifact_succeeds` — write a valid `CLEAN_ARTIFACT` file with current mtime, write a message file that contains no marker (e.g., the `Some preamble.\n` line only), and pass `--freshness-baseline = <mtime-of-artifact - 60>`. Assert exit 0, stdout includes the parsed artifact fields (`exit_code`, `failing_identifiers`, etc.), AND stdout JSON includes `"used_fallback": true`.
    - `test_missing_marker_stale_artifact_fails` — same as above but with `--freshness-baseline = <mtime-of-artifact + 60>` so the artifact appears stale. Assert exit non-zero and stderr contains `"missing TEST_RESULT_ARTIFACT marker"`.
    - `test_missing_marker_no_baseline_still_strict` — same as above but with no `--freshness-baseline` argument. Assert exit non-zero and stderr contains `"missing TEST_RESULT_ARTIFACT marker"`.
    - `test_marker_present_baseline_supplied_succeeds` — happy path; marker present and matches `--expected-path`; baseline supplied but unused. Assert exit 0 AND stdout JSON includes `"used_fallback": false`.
    - `test_marker_present_no_baseline_succeeds` — happy path; marker present; no `--freshness-baseline` supplied. Assert exit 0 AND stdout JSON includes `"used_fallback": false` (the fallback path was not entered, so the field is `false`).
- [ ] **Step 5: Run the test suite for this script** — Run `python3 -m unittest agent.skills._shared.scripts.tests.test_parse_test_runner_artifact -v` from the repo root. Confirm every test passes.

**Acceptance criteria:**

- `--freshness-baseline` is exposed in the script's `--help` output.
  Verify: run `python3 agent/skills/_shared/scripts/parse-test-runner-artifact.py --help` from the repo root and confirm `--freshness-baseline` appears in the help text.
- A missing-marker run with a fresh on-disk artifact and baseline parses successfully and emits the parsed structural fields.
  Verify: run `python3 -m unittest agent.skills._shared.scripts.tests.test_parse_test_runner_artifact.TestFinalMessageHandoffFallback.test_missing_marker_fresh_artifact_succeeds -v` and confirm exit code 0.
- A missing-marker run with a stale artifact still fails with `missing TEST_RESULT_ARTIFACT marker`.
  Verify: run `python3 -m unittest agent.skills._shared.scripts.tests.test_parse_test_runner_artifact.TestFinalMessageHandoffFallback.test_missing_marker_stale_artifact_fails -v` and confirm exit code 0.
- The script's stdout success JSON includes a top-level `used_fallback` boolean: `true` when the missing-marker fallback path was used; `false` when the marker was present and valid (or when the handoff invocation was skipped).
  Verify: run `python3 -m unittest agent.skills._shared.scripts.tests.test_parse_test_runner_artifact.TestFinalMessageHandoffFallback.test_missing_marker_fresh_artifact_succeeds agent.skills._shared.scripts.tests.test_parse_test_runner_artifact.TestFinalMessageHandoffFallback.test_marker_present_baseline_supplied_succeeds agent.skills._shared.scripts.tests.test_parse_test_runner_artifact.TestFinalMessageHandoffFallback.test_marker_present_no_baseline_succeeds -v` and confirm exit code 0 with all three methods passing. Additionally, open `agent/skills/_shared/scripts/parse-test-runner-artifact.py` and confirm the success-path `json.dump(...)` call to stdout includes a `"used_fallback"` key, and that the local variable is initialized to `False` before the handoff invocation and only set from the internal handoff parser's stdout JSON on success.
- All pre-existing tests in `test_parse_test_runner_artifact.py` continue to pass.
  Verify: run `python3 -m unittest agent.skills._shared.scripts.tests.test_parse_test_runner_artifact -v` and confirm exit code 0 with no `FAIL`/`ERROR` lines.

**Model recommendation:** cheap

### Task 10: Wire freshness-baseline capture into scout/SKILL.md

**Files:**
- Modify: `agent/skills/scout/SKILL.md`

**Steps:**
- [ ] **Step 1: Locate the dispatch step** — Open `agent/skills/scout/SKILL.md`. Step 5 (`## Step 5: Dispatch via subagent_run_serial`) holds the `subagent_run_serial` call. Step 6 (`## Step 6: Validate completion`) is where `parse-artifact-handoff.py` is invoked.
- [ ] **Step 2: Insert the baseline-capture sub-step into Step 5** — Insert a new paragraph at the top of Step 5, immediately before the dispatch code block. The paragraph reads exactly:

  ~~~
  **Baseline-capture for the missing-marker fallback.** Immediately before dispatching, capture the pre-dispatch mtime of `{OUTPUT_PATH}` so Step 6 can validate that any on-disk brief is fresh even if the marker line is missing. Run:

  ```bash
  BRIEF_BASELINE=$(python3 -c "import os, sys; p=sys.argv[1]; print(os.path.getmtime(p) if os.path.exists(p) else 0)" "{OUTPUT_PATH}")
  ```

  Hold `BRIEF_BASELINE` in skill state across the dispatch. A value of `0` indicates the file did not exist before dispatch; any positive value indicates the file's mtime at dispatch time.
  ~~~

- [ ] **Step 3: Update Step 6's parse-artifact-handoff.py invocation** — In Step 6 case (b)–(c), append `--freshness-baseline <BRIEF_BASELINE>` to the existing `parse-artifact-handoff.py` invocation. The updated line reads (one paragraph): "`agent/skills/_shared/scripts/parse-artifact-handoff.py --marker BRIEF_ARTIFACT --final-message <path-to-finalMessage> --expected-path <{OUTPUT_PATH}> --check-existence --check-non-empty --freshness-baseline <BRIEF_BASELINE>`. … When `used_fallback` is `true` in the script's stdout JSON, log a one-line warning to the user noting that the on-disk file at `{OUTPUT_PATH}` was used as the brief artifact even though the dispatched subagent did not emit a `BRIEF_ARTIFACT:` terminal marker."

**Acceptance criteria:**

- Step 5 of scout/SKILL.md documents the baseline-capture step using `python3 -c "import os, sys; p=sys.argv[1]; print(os.path.getmtime(p) if os.path.exists(p) else 0)"`.
  Verify: `grep -n "BRIEF_BASELINE=\$(python3" agent/skills/scout/SKILL.md` returns at least one match inside Step 5 (before Step 6).
- Step 6's `parse-artifact-handoff.py` invocation includes `--freshness-baseline <BRIEF_BASELINE>`.
  Verify: `grep -n "parse-artifact-handoff.py --marker BRIEF_ARTIFACT" agent/skills/scout/SKILL.md` returns at least one match whose surrounding command text includes `--freshness-baseline <BRIEF_BASELINE>`.
- The `used_fallback` field is documented as producing a user-visible warning when true.
  Verify: open `agent/skills/scout/SKILL.md`, find Step 6, and confirm a sentence mentions logging/warning the user when `used_fallback` is `true`. `grep -c "used_fallback" agent/skills/scout/SKILL.md` returns at least `1`.

**Model recommendation:** cheap

### Task 11: Wire freshness-baseline capture into define-spec uniformly across all three branches

**Files:**
- Modify: `agent/skills/define-spec/SKILL.md`
- Modify: `agent/skills/define-spec/spec-design-procedure.md`

**Steps:**
- [ ] **Step 1: Locate the dispatch step and Step 8 of the procedure** — Open `agent/skills/define-spec/SKILL.md`. Step 3a (`### 3a. Mux branch — dispatch \`spec-designer\``) holds the `subagent_run_serial` call. Step 4 (`## Step 4: Validate \`SPEC_ARTIFACT:\` (mux branch only)`) is where `parse-artifact-handoff.py` is invoked. Open `agent/skills/define-spec/spec-design-procedure.md`. Step 8 currently directs the spec-designer to write to `docs/specs/<YYYY-MM-DD>-<short-topic>.md` (with the slug derived from the Q&A conversation) on todo/freeform branches and to overwrite the input path verbatim on the existing-spec branch. Step 9's mux-branch paragraph documents the marker emission rules including the existing-spec write-target directive "the file write target stays at the supplied path per Step 1's directive ('use the input path as-is — do not normalize between relative and absolute')".

- [ ] **Step 2: Insert pre-dispatch absolute path resolution into Step 3a of SKILL.md** — Insert a new paragraph at the top of Step 3a, immediately before the `resolve-model-dispatch.py` invocation. The paragraph reads exactly:

  ~~~
  **Pre-dispatch absolute output-path resolution (for the missing-marker fallback).** Before dispatching, the orchestrator resolves an absolute `SPEC_OUTPUT_PATH` for ALL three input shapes so the parser invocation in Step 4 can pass `--expected-path` uniformly per spec criterion 11. Detect the input shape locally by running the same regex used in `spec-design-procedure.md` Step 1 against the orchestrator's raw user input:

  - **Todo ID:** input (after `strip().lower()`) matches `^TODO-[0-9a-f]{8}$`. Extract `<raw-id>` (the 8-char hex without the `TODO-` prefix). Read `docs/todos/<raw-id>.md` from disk. Derive a kebab-case `<slug>` from the file's first `# `-prefixed H1 line: lowercase the title, replace each run of non-alphanumeric characters with a single `-`, strip leading/trailing `-`, and truncate to the first 60 characters (then strip any trailing `-` left by truncation). If no `# `-prefixed H1 line is present in the todo file, fall back to `<slug> = <raw-id>` (the raw todo hex itself). Resolve `SPEC_OUTPUT_PATH = <working-dir>/docs/specs/<YYYY-MM-DD>-<slug>.md` using today's UTC date in `YYYY-MM-DD` form. `<working-dir>` is the orchestrator's current working directory (absolute).
  - **Existing-spec path:** input ends in `.md` AND is either a relative path beginning with `docs/specs/` or an absolute path containing the segment `/docs/specs/`, AND the file exists on disk. Resolve `SPEC_OUTPUT_PATH = os.path.abspath(<input-spec-path>)` against `<working-dir>` — this is the absolute resolution of the user-supplied path. The single canonical `SPEC_OUTPUT_PATH` is used for BOTH `--expected-path` AND baseline capture, so byte-equal matching against the spec-designer's `SPEC_ARTIFACT:` marker (which is always emitted as an absolute path per `spec-design-procedure.md` Step 9) is guaranteed regardless of whether the user supplied a relative or absolute input path.
  - **Freeform:** anything else. Derive a kebab-case `<slug>` from the input text: take the first 60 characters of the input, lowercase, replace each run of non-alphanumeric characters with a single `-`, strip leading/trailing `-`. If the result is empty (e.g., input is only whitespace), use `<slug> = "freeform"` as a deterministic fallback. Resolve `SPEC_OUTPUT_PATH = <working-dir>/docs/specs/<YYYY-MM-DD>-<slug>.md` using today's UTC date.

  Bind `SPEC_OUTPUT_PATH` (always absolute) in skill state. The slug-derivation rules are deterministic and pre-dispatch-knowable, so the orchestrator computes the path before dispatching the spec-designer.
  ~~~

- [ ] **Step 3: Insert the baseline-capture sub-step into Step 3a of SKILL.md** — Immediately after the pre-dispatch path-resolution paragraph from Step 2, insert this paragraph:

  ~~~
  **Baseline-capture for the missing-marker fallback (uniform across all three branches).** Capture the pre-dispatch mtime of `SPEC_OUTPUT_PATH`:

  ```bash
  SPEC_BASELINE=$(python3 -c "import os, sys; p=sys.argv[1]; print(os.path.getmtime(p) if os.path.exists(p) else 0)" "$SPEC_OUTPUT_PATH")
  ```

  A value of `0` indicates the file did not exist before dispatch (typical for todo/freeform; possible for existing-spec when the user passed a path that does not yet exist). Any positive value indicates the file's mtime at dispatch time. Hold both `SPEC_OUTPUT_PATH` and `SPEC_BASELINE` in skill state across the dispatch.
  ~~~

- [ ] **Step 4: Substitute `{SPEC_OUTPUT_PATH}` into the procedure body before dispatch** — In Step 3a, after the path-resolution and baseline-capture paragraphs and before the `subagent_run_serial` dispatch block, insert this paragraph:

  ~~~
  **Substitute `{SPEC_OUTPUT_PATH}` into the procedure body.** The `systemPrompt:` field carries the body of `spec-design-procedure.md` (loaded in Step 2). Before passing it to `subagent_run_serial`, perform a string replacement: every occurrence of the literal token `{SPEC_OUTPUT_PATH}` in the loaded body is replaced with the absolute path computed in the path-resolution paragraph above. The procedure's Step 8 and Step 9 reference this token to direct the spec-designer to write to the orchestrator-supplied absolute path on all three branches.
  ~~~

- [ ] **Step 5: Update Step 4's parse-artifact-handoff.py invocation uniformly** — In Step 4 of `agent/skills/define-spec/SKILL.md`, find the existing helper invocation: `agent/skills/_shared/scripts/parse-artifact-handoff.py --marker SPEC_ARTIFACT --final-message <temp-file> --check-existence --check-non-empty --require-path-suffix .md --require-path-prefix <working-dir>/docs/specs/`. Replace the surrounding paragraph so the invocation always passes both `--expected-path` and `--freshness-baseline` (no per-branch gating):

  ~~~
  Build the helper invocation. The argument set is identical across all three input shapes:

  `agent/skills/_shared/scripts/parse-artifact-handoff.py --marker SPEC_ARTIFACT --final-message <temp-file> --expected-path <SPEC_OUTPUT_PATH> --check-existence --check-non-empty --require-path-suffix .md --require-path-prefix <working-dir>/docs/specs/ --freshness-baseline <SPEC_BASELINE>`

  `SPEC_OUTPUT_PATH` and `SPEC_BASELINE` were bound in Step 3a per the absolute-path resolution and baseline-capture rules. The helper performs the missing-marker on-disk fallback when the marker is absent but the on-disk file at `SPEC_OUTPUT_PATH` exists, is non-empty, and has mtime strictly greater than `SPEC_BASELINE`. When `used_fallback` is `true` in the script's stdout JSON, log a one-line warning to the user noting that the on-disk file at `SPEC_OUTPUT_PATH` was used as the spec artifact even though the spec-designer did not emit a `SPEC_ARTIFACT:` terminal marker. The existing case-(2) transcript-backed recovery below remains as a secondary salvage path — it now only runs when the missing-marker fallback did NOT accept (for example, the spec-designer wrote to a path other than `SPEC_OUTPUT_PATH`, leaving `SPEC_OUTPUT_PATH` stale or missing at parse time).
  ~~~

- [ ] **Step 6: Update spec-design-procedure.md Step 8 to use `{SPEC_OUTPUT_PATH}` on all three branches** — Open `agent/skills/define-spec/spec-design-procedure.md` and locate Step 8 (`## Step 8: Write the spec`). Replace the opening sentence "Write to `docs/specs/<YYYY-MM-DD>-<short-topic>.md` using today's date and a kebab-case topic derived from the conversation. **On the existing-spec branch, overwrite the existing path verbatim instead** — do not generate a new filename." with the new uniform directive:

  ~~~
  Write to the orchestrator-supplied absolute path `{SPEC_OUTPUT_PATH}`. The orchestrator (`define-spec/SKILL.md` Step 3a) computes this path before dispatch from the input shape:

  - **Todo:** `<working-dir>/docs/specs/<YYYY-MM-DD>-<slug>.md` where `<slug>` is derived deterministically from the todo file's H1 title.
  - **Existing-spec:** the absolute resolution of the user-supplied path (e.g., `<working-dir>/docs/specs/foo.md`).
  - **Freeform:** `<working-dir>/docs/specs/<YYYY-MM-DD>-<slug>.md` where `<slug>` is derived from the first 60 characters of the input.

  Use `{SPEC_OUTPUT_PATH}` verbatim as the write target — do not generate your own filename, even when the Q&A surfaces a topic that suggests a different slug. The slug is a filesystem identifier; the spec's content reflects the Q&A. If the conversation reframes the topic, that is fine — the file remains at the orchestrator-supplied path, and the content captures the refined understanding. On the existing-spec branch, this means overwriting the absolute resolution of the user-supplied path; the previous "use the input path as-is" rule no longer applies (the orchestrator already absolutized the path before dispatch).
  ~~~

- [ ] **Step 7: Update spec-design-procedure.md Step 9's existing-spec marker paragraph** — In `agent/skills/define-spec/spec-design-procedure.md` Step 9, locate the paragraph beginning "When the existing-spec branch was fired with a relative input path (e.g. `docs/specs/foo.md`), the file write target stays at the supplied path…" and replace the entire paragraph with:

  ~~~
  The file write target is `{SPEC_OUTPUT_PATH}` (always absolute, supplied by the orchestrator). The marker line emitted in both channels of `SPEC_ARTIFACT:` MUST be byte-equal to `{SPEC_OUTPUT_PATH}`. There is no branch-specific handling — the orchestrator pre-computes `{SPEC_OUTPUT_PATH}` for all three input shapes, so the same emission rule applies uniformly.
  ~~~

- [ ] **Step 8: Update spec-design-procedure.md Step 1's existing-spec write-target directive** — In `agent/skills/define-spec/spec-design-procedure.md` Step 1's table, locate the existing-spec row's `Behavior` cell. Find the literal substring "**Overwrite the same path** at the end (use the input path as-is — do not normalize between relative and absolute)." Replace it with: "**Overwrite the absolute path** `{SPEC_OUTPUT_PATH}` at the end — the orchestrator pre-computes and passes this path; do not generate your own filename." The rest of that cell (the "Q&A focuses on filling gaps…" and "The spec self-review pass (Step 7) is mandatory" sentences) remains unchanged.

- [ ] **Step 9: Preserve existing case-(2) transcript-backed recovery as a secondary salvage path** — Confirm the existing case (2) transcript-backed recovery paragraphs in `agent/skills/define-spec/SKILL.md` Step 4 remain unchanged. The new freshness-baseline fallback is additive — it accepts the on-disk file at `SPEC_OUTPUT_PATH` as authoritative when missing-marker would otherwise have triggered case (2). When the new fallback accepts (`used_fallback: true`), case (2) does NOT run. Case (2) still runs when the on-disk file at `SPEC_OUTPUT_PATH` is missing, empty, or stale — for example, when the spec-designer wrote to a path other than `SPEC_OUTPUT_PATH` despite the procedure's directive (a procedure-compliance failure that the transcript can still validate).

**Acceptance criteria:**

- Step 3a of define-spec/SKILL.md documents pre-dispatch absolute path resolution for all three input shapes (todo, existing-spec, freeform).
  Verify: `grep -n "Pre-dispatch absolute output-path resolution" agent/skills/define-spec/SKILL.md` returns at least one match inside Step 3a (before the `subagent_run_serial` block), AND `grep -n "SPEC_OUTPUT_PATH" agent/skills/define-spec/SKILL.md` returns at least four matches across Step 3a (path-resolution paragraph for the three input shapes plus the baseline-capture paragraph and Step 4 invocation).
- Step 3a documents baseline capture uniformly (no per-branch conditional, no `INPUT_SHAPE` gating on the baseline).
  Verify: open `agent/skills/define-spec/SKILL.md` and locate Step 3a; confirm the `SPEC_BASELINE=$(python3 ...)` line appears in a paragraph titled "Baseline-capture for the missing-marker fallback (uniform across all three branches)" or equivalent text. `grep -n "SPEC_BASELINE=\$(python3" agent/skills/define-spec/SKILL.md` returns at least one match. Also confirm that `grep -c "Conditional baseline-capture (existing-spec branch only)" agent/skills/define-spec/SKILL.md` returns `0` (the bounded language has been removed).
- Step 3a documents that the orchestrator substitutes `{SPEC_OUTPUT_PATH}` into the procedure body before dispatch.
  Verify: open `agent/skills/define-spec/SKILL.md` Step 3a and confirm a paragraph mentions substituting the literal token `{SPEC_OUTPUT_PATH}` in the loaded `spec-design-procedure.md` body before passing it as `systemPrompt:`. `grep -c "Substitute \`{SPEC_OUTPUT_PATH}\` into the procedure body" agent/skills/define-spec/SKILL.md` returns at least `1`.
- Step 4's `parse-artifact-handoff.py` invocation passes `--expected-path <SPEC_OUTPUT_PATH>` and `--freshness-baseline <SPEC_BASELINE>` uniformly on all three branches.
  Verify: `grep -n "parse-artifact-handoff.py --marker SPEC_ARTIFACT" agent/skills/define-spec/SKILL.md` returns at least one match, AND the surrounding Step 4 prose contains both `--expected-path <SPEC_OUTPUT_PATH>` and `--freshness-baseline <SPEC_BASELINE>` as a single uniform invocation. Run `grep -c "When INPUT_SHAPE ==" agent/skills/define-spec/SKILL.md` and confirm it returns `0` (the per-branch gating language is fully removed from Step 4).
- The procedure's Step 8 directs the spec-designer to write to `{SPEC_OUTPUT_PATH}` on all three branches.
  Verify: open `agent/skills/define-spec/spec-design-procedure.md` Step 8 and confirm the opening sentence references writing to the literal token `{SPEC_OUTPUT_PATH}` as the absolute write target on all three branches. `grep -c "{SPEC_OUTPUT_PATH}" agent/skills/define-spec/spec-design-procedure.md` returns at least `3` (Step 1 write-target directive, Step 8 write directive, Step 9 marker directive).
- The procedure's Step 9 existing-spec marker paragraph uses a uniform rule referencing `{SPEC_OUTPUT_PATH}`.
  Verify: open `agent/skills/define-spec/spec-design-procedure.md` Step 9 and confirm the existing-spec subagent-branch paragraph reads "The file write target is `{SPEC_OUTPUT_PATH}` (always absolute, supplied by the orchestrator)" or equivalent. `grep -c "the 'use the input path as-is' rule applies to the file-write target only" agent/skills/define-spec/spec-design-procedure.md` returns `0` (the old conditional language is gone).
- The procedure's Step 1 existing-spec write-target directive is updated to reference `{SPEC_OUTPUT_PATH}`.
  Verify: open `agent/skills/define-spec/spec-design-procedure.md` Step 1 and locate the existing-spec row; confirm the `Behavior` cell contains the literal phrase "**Overwrite the absolute path** `{SPEC_OUTPUT_PATH}` at the end" and does NOT contain the phrase "use the input path as-is — do not normalize between relative and absolute". `grep -c "use the input path as-is — do not normalize" agent/skills/define-spec/spec-design-procedure.md` returns `0`.
- Step 4 of SKILL.md documents the `used_fallback` true case as a user-visible warning.
  Verify: open `agent/skills/define-spec/SKILL.md` Step 4 and confirm a sentence mentions logging/warning the user when `used_fallback` is `true`. `grep -c "used_fallback" agent/skills/define-spec/SKILL.md` returns at least `1`.
- Step 4 of SKILL.md preserves case-(2) transcript-backed recovery as a secondary salvage path (now only triggered when the missing-marker fallback rejects).
  Verify: open `agent/skills/define-spec/SKILL.md` Step 4 and confirm the case-(2) bullet `**(2) \`finalMessage\` lacks a \`SPEC_ARTIFACT:\` line (and \`exitCode == 0\`).**` and its sub-bullets remain present; confirm Step 5 of Task 11 in this plan notes case-(2) now only runs when the missing-marker fallback does NOT accept (for example, when the spec-designer wrote to a path other than `SPEC_OUTPUT_PATH`).
- The orchestrator's `--expected-path` value matches what the spec-designer emits in the `SPEC_ARTIFACT:` marker line (both are the absolute `SPEC_OUTPUT_PATH`), eliminating the previous ambiguity between relative-input and absolute-marker paths.
  Verify: read the path-resolution paragraph inserted in Step 2 of Task 11 (Step 3a of SKILL.md) and confirm the existing-spec bullet's text explicitly says "The single canonical `SPEC_OUTPUT_PATH` is used for BOTH `--expected-path` AND baseline capture". Additionally, read `agent/skills/define-spec/spec-design-procedure.md` Step 9's updated existing-spec paragraph (from Step 7 of Task 11) and confirm it says the marker line MUST be byte-equal to `{SPEC_OUTPUT_PATH}` with no relative/absolute conditional.

**Model recommendation:** standard

### Task 12: Wire freshness-baseline capture into generate-plan/SKILL.md AND suppress execute-plan offer on not_approved_within_budget

**Files:**
- Modify: `agent/skills/generate-plan/SKILL.md`

**Steps:**
- [ ] **Step 1: Locate Step 3 dispatch and Step 3.4 validation** — Open `agent/skills/generate-plan/SKILL.md`. Step 3 sub-step 3 (the `subagent_run_serial` block) holds the planner dispatch; Step 3 sub-step 4 holds the `parse-artifact-handoff.py` invocation that validates the `PLAN_ARTIFACT` marker.
- [ ] **Step 2: Insert the baseline-capture sub-step before the planner dispatch** — Insert a new numbered sub-step between Step 3.2 (placeholder fill) and Step 3.3 (subagent_run_serial dispatch), or as a sub-bullet inside Step 3.3 before the code block. The paragraph reads exactly:

  ~~~
  **Baseline-capture for the missing-marker fallback.** Immediately before dispatching the planner, capture the pre-dispatch mtime of `{OUTPUT_PATH}` so Step 3.4 can validate that any on-disk plan is fresh even if the marker line is missing. Run:

  ```bash
  PLAN_BASELINE=$(python3 -c "import os, sys; p=sys.argv[1]; print(os.path.getmtime(p) if os.path.exists(p) else 0)" "{OUTPUT_PATH}")
  ```

  Hold `PLAN_BASELINE` in skill state across the dispatch. A value of `0` indicates the file did not exist before dispatch; any positive value indicates the file's mtime at dispatch time.
  ~~~

- [ ] **Step 3: Update Step 3.4's parse-artifact-handoff.py invocation** — In Step 3.4, append `--freshness-baseline <PLAN_BASELINE>` to the existing `parse-artifact-handoff.py` invocation. The updated line reads (one paragraph): "`python3 agent/skills/_shared/scripts/parse-artifact-handoff.py --marker PLAN_ARTIFACT --final-message <temp-file> --expected-path <{OUTPUT_PATH} from Step 3 (absolute path)> --check-existence --check-non-empty --freshness-baseline <PLAN_BASELINE>`. … When `used_fallback` is `true` in the script's stdout JSON, log a one-line warning to the user noting that the on-disk file at `{OUTPUT_PATH}` was used as the plan even though the planner did not emit a `PLAN_ARTIFACT:` terminal marker."
- [ ] **Step 4: Suppress the execute-plan offer in Step 5 when STATUS is not_approved_within_budget** — Step 5 currently says: "Then offer execute-plan: …" Replace that opening sentence and the surrounding block with the following:

  ~~~
  Then, **only when the parsed `status` is `approved` or `approved_with_concerns`**, offer execute-plan:

  > Plan written to `<PLAN_PATH>`. Want me to run execute-plan with this plan?

  If `COMMIT: left_uncommitted` (which can happen on the approved paths only in standalone-style runs; auto-commit mode always commits on the approved path), prepend this note to the offer:

  > Note: plan was left uncommitted. Proceeding with an uncommitted plan means edits made by execute-plan will land on top of an unstaged plan file.

  Require explicit user confirmation before invoking execute-plan in that case. Do not auto-invoke execute-plan.

  **When the parsed `status` is `not_approved_within_budget`** (whether `COMMIT: committed` from `(r) Save plan for manual review` or `COMMIT: left_uncommitted` from `(x) Stop execution`), do NOT offer execute-plan. Report the parsed summary (status, commit, plan_path, review_paths, structural_only) and stop. The user inspects the saved plan and review files manually; if they want to execute the unapproved plan, they invoke `execute-plan` themselves.

  **When the parsed `status` is `failed`**, surface the `FAILURE_REASON` line to the user and skip the execute-plan offer until the underlying issue is resolved. Do not retry refine-plan automatically.
  ~~~

  The existing "Edge cases" subsection's `Refine-plan failures` bullet remains intact and is now consistent with the explicit `failed` branch above; remove the bullet from `## Edge cases` only if it becomes a duplicate (otherwise keep both).
- [ ] **Step 5: Confirm Step 5 still parses the refine-plan summary first** — The first sentence of Step 5 currently runs `parse-refine-plan-summary.py` to obtain `status`, `commit`, `plan_path`, `review_paths`, and `structural_only`. Confirm this line is preserved so the new STATUS-conditioned guard has the parsed `status` to branch on.

**Acceptance criteria:**

- Step 3 of generate-plan/SKILL.md documents the baseline-capture step.
  Verify: `grep -n "PLAN_BASELINE=\$(python3" agent/skills/generate-plan/SKILL.md` returns at least one match inside Step 3 (before Step 4).
- Step 3.4's `parse-artifact-handoff.py` invocation includes `--freshness-baseline <PLAN_BASELINE>`.
  Verify: `grep -n "parse-artifact-handoff.py --marker PLAN_ARTIFACT" agent/skills/generate-plan/SKILL.md` returns at least one match whose surrounding command text includes `--freshness-baseline <PLAN_BASELINE>`.
- Step 5 offers execute-plan only when `status` is `approved` or `approved_with_concerns`.
  Verify: open `agent/skills/generate-plan/SKILL.md` Step 5 and confirm the sentence "only when the parsed `status` is `approved` or `approved_with_concerns`" precedes the `Plan written to` offer; also confirm a `When the parsed \`status\` is \`not_approved_within_budget\`` block follows that says do NOT offer execute-plan.
- Step 5 explicitly documents that `not_approved_within_budget` suppresses the offer for both `COMMIT: committed` and `COMMIT: left_uncommitted` sub-cases.
  Verify: open `agent/skills/generate-plan/SKILL.md` Step 5 and confirm the `not_approved_within_budget` block references both `COMMIT: committed from (r) Save plan for manual review` and `COMMIT: left_uncommitted from (x) Stop execution`.
- Step 3.4 documents the `used_fallback` true case as a warning.
  Verify: open `agent/skills/generate-plan/SKILL.md` Step 3.4 and confirm a sentence mentions logging/warning the user when `used_fallback` is `true`.

**Model recommendation:** standard

### Task 13: Wire freshness-baseline capture into refine-code-prompt.md

**Files:**
- Modify: `agent/skills/refine-code/refine-code-prompt.md`

**Steps:**
- [ ] **Step 1: Locate Iteration 1 Step 3** — Open `agent/skills/refine-code/refine-code-prompt.md`. The `### Iteration 1: Full Review` section's Step 3 dispatches the `code-reviewer` and runs the artifact-handoff parse in sub-steps 3a–c.
- [ ] **Step 2: Insert a "Capture freshness baseline" sub-step into Iteration 1 Step 3** — Immediately before the `subagent_run_serial` code block in Step 3, insert a new sub-step. The block reads exactly:

  ~~~
  **Capture freshness baseline.** Immediately before dispatching the reviewer, capture the pre-dispatch mtime of `{REVIEW_OUTPUT_PATH}` (the absolute era-versioned path constructed in Step 2). Bash form:

  ```bash
  REVIEW_BASELINE=$(python3 -c "import os, sys; p=sys.argv[1]; print(os.path.getmtime(p) if os.path.exists(p) else 0)" "<REVIEW_OUTPUT_PATH>")
  ```

  Hold `REVIEW_BASELINE` in your coordinator state across the dispatch. The fallback in Step 3a will compare the reviewer's on-disk write against this baseline.
  ~~~

- [ ] **Step 3: Update Iteration 1 Step 3a's parse-artifact-handoff.py invocation** — Sub-step 3a currently reads "Run `parse-artifact-handoff.py --marker REVIEW_ARTIFACT --final-message <finalMessage-path> --expected-path {REVIEW_OUTPUT_PATH} --check-existence --check-non-empty`; on any failure it emits the appropriate `STATUS: failed` reason from `## Failure Modes`." Append `--freshness-baseline <REVIEW_BASELINE>` to that invocation. Add a sentence: "When the parser's stdout JSON `used_fallback` field is `true`, treat the on-disk review file as authoritative (per the existing 3e contract) and continue with the BYTE-EQUAL provenance check and the `validate-review-provenance.py` defense-in-depth check. Failure of either provenance check still triggers `STATUS: failed` with the existing provenance malformed reason."
- [ ] **Step 4: Repeat the baseline capture for Iteration 2..N Step 5** — Insert the same "Capture freshness baseline" paragraph immediately before the hybrid re-review `subagent_run_serial` dispatch in Iteration 2..N Step 5; thread `--freshness-baseline <REVIEW_BASELINE>` into the parse-artifact-handoff.py invocation in the hybrid re-review's 3a–e (or equivalent) sub-procedure. Add the same `used_fallback` sentence verbatim from Step 3 ("When the parser's stdout JSON `used_fallback` field is `true`, treat the on-disk review file as authoritative (per the existing 3e contract) and continue with the BYTE-EQUAL provenance check and the `validate-review-provenance.py` defense-in-depth check. Failure of either provenance check still triggers `STATUS: failed` with the existing provenance malformed reason.") so the hybrid re-review's documentation matches Iteration 1's.
- [ ] **Step 5: Repeat the baseline capture for Final Verification Step 1** — Insert the same "Capture freshness baseline" paragraph immediately before the Final Verification `subagent_run_serial` dispatch; thread `--freshness-baseline <REVIEW_BASELINE>` into the parse-artifact-handoff.py invocation in the Final Verification's 3a–e (or equivalent) sub-procedure. Add the same `used_fallback` sentence verbatim from Step 3 so the Final Verification's documentation matches the other two dispatch paths.

**Acceptance criteria:**

- All three review dispatch paths (Iteration 1, Iteration 2..N, Final Verification) capture the freshness baseline as `REVIEW_BASELINE` before dispatching the reviewer.
  Verify: `grep -c "REVIEW_BASELINE=\$(python3" agent/skills/refine-code/refine-code-prompt.md` returns at least `3` (one per pass). Additionally, open `agent/skills/refine-code/refine-code-prompt.md` and confirm a `REVIEW_BASELINE=$(python3 ...)` line appears inside each of the three sections: `### Iteration 1: Full Review` Step 3 (before the `subagent_run_serial` block), Iteration 2..N Step 5 (before the hybrid re-review dispatch), and Final Verification Step 1 (before the verification dispatch).
- All three review dispatch paths thread `--freshness-baseline <REVIEW_BASELINE>` into their `parse-artifact-handoff.py` invocations for the `REVIEW_ARTIFACT` marker.
  Verify: `grep -c "parse-artifact-handoff.py --marker REVIEW_ARTIFACT" agent/skills/refine-code/refine-code-prompt.md` returns at least `3` (one per pass), AND for EACH of those three invocations the same line or its immediately-following continuation includes the literal `--freshness-baseline <REVIEW_BASELINE>`. Run `grep -A2 "parse-artifact-handoff.py --marker REVIEW_ARTIFACT" agent/skills/refine-code/refine-code-prompt.md | grep -c "freshness-baseline <REVIEW_BASELINE>"` and confirm it returns at least `3`. Additionally, open `agent/skills/refine-code/refine-code-prompt.md` and confirm the flag is passed inside each of the three 3a–e (or equivalent) sub-procedures: Iteration 1 Step 3a, Iteration 2..N Step 5's hybrid re-review 3a–e sub-procedure, and Final Verification's 3a–e sub-procedure.
- The `used_fallback` true case still triggers the BYTE-EQUAL provenance check and `validate-review-provenance.py` in all three dispatch paths.
  Verify: open `agent/skills/refine-code/refine-code-prompt.md` and locate the Iteration 1 Step 3a, Iteration 2..N Step 5, and Final Verification Step 1 sections. Confirm each section contains a sentence stating that on `used_fallback` true the existing BYTE-EQUAL provenance check and `validate-review-provenance.py` still run. `grep -c "used_fallback" agent/skills/refine-code/refine-code-prompt.md` returns at least `3`.

**Model recommendation:** standard

### Task 14: Wire freshness-baseline capture into test-runner-dispatch.md

**Files:**
- Modify: `agent/skills/_shared/test-runner-dispatch.md`

**Steps:**
- [ ] **Step 1: Locate the Behavior section** — Open `agent/skills/_shared/test-runner-dispatch.md`. The `## Behavior` section lists five numbered steps; Step 1 is `mkdir -p` for the parent directory; Step 5 is `Validate handoff and parse the artifact`.
- [ ] **Step 2: Insert a new baseline-capture step between Steps 1 and 2** — Insert a new step `1.5` (or renumber existing 1–5 as 1–6) describing the baseline capture. Suggested text:

  ~~~
  1.5. **Capture freshness baseline.** Immediately after `mkdir -p`, capture the pre-dispatch mtime of `artifact_path` so step 5 can validate that any on-disk artifact is fresh even if the marker line is missing. Bash form:

  ```bash
  ARTIFACT_BASELINE=$(python3 -c "import os, sys; p=sys.argv[1]; print(os.path.getmtime(p) if os.path.exists(p) else 0)" "<artifact_path>")
  ```

  Hold `ARTIFACT_BASELINE` across the dispatch.
  ~~~

- [ ] **Step 3: Update Step 5's parse-test-runner-artifact.py invocation** — Step 5 currently reads "Validate the artifact handoff marker, then parse the artifact via `agent/skills/_shared/scripts/parse-test-runner-artifact.py --artifact <artifact_path> --final-message <path-to-finalMessage-or-stdin> --expected-path <artifact_path>`." Append `--freshness-baseline <ARTIFACT_BASELINE>` to that invocation. Add a sentence: "When the parser's stdout JSON includes `used_fallback: true` (i.e., the test-runner did not emit a `TEST_RESULT_ARTIFACT:` terminal marker but the on-disk artifact is fresh and well-formed), the caller logs a one-line warning to the user."
- [ ] **Step 4: Update the "Output on failure" labels** — The `handoff_missing` failure label currently reads "No anchored `TEST_RESULT_ARTIFACT:` line in the dispatched final message." Update to: "No anchored `TEST_RESULT_ARTIFACT:` line in the dispatched final message AND the on-disk artifact at `artifact_path` is missing/empty/stale (the freshness-baseline fallback did not accept)."

**Acceptance criteria:**

- The Behavior section captures `ARTIFACT_BASELINE` before dispatching test-runner.
  Verify: `grep -n "ARTIFACT_BASELINE=\$(python3" agent/skills/_shared/test-runner-dispatch.md` returns at least one match inside the `## Behavior` section.
- Step 5 of the Behavior section passes `--freshness-baseline <ARTIFACT_BASELINE>` to `parse-test-runner-artifact.py`.
  Verify: `grep -n "parse-test-runner-artifact.py" agent/skills/_shared/test-runner-dispatch.md` returns at least one match whose surrounding command text includes `--freshness-baseline <ARTIFACT_BASELINE>`.
- The `handoff_missing` failure label is updated to reference the freshness-baseline fallback.
  Verify: open `agent/skills/_shared/test-runner-dispatch.md`, find the `handoff_missing` bullet under `## Output on failure`, and confirm its description mentions that the on-disk artifact is also missing/empty/stale (the fallback did not accept).

**Model recommendation:** cheap

## Dependencies

- Task 9 depends on: Task 1
- Task 10 depends on: Task 1
- Task 11 depends on: Task 1
- Task 12 depends on: Task 1
- Task 13 depends on: Task 1
- Task 14 depends on: Task 9

## Risk Assessment

- **Risk: A leniency-relaxation accepts a malformed plan section that the previous strict parser would have rejected.** Mitigation: every leniency change is scoped to the exact variants enumerated in the spec (four task-heading separators; three named section title-case forms; two named bold-label title-case forms; case-insensitive `Verify:`/`Create:`/`Modify:`/`Test:`); fence-awareness is preserved; the `TestVagueAliasRejected` and `TestFencedVariantsIgnored` tests in Task 2 prove that the relaxed rules do not accept out-of-scope variants.

- **Risk: The freshness-baseline fallback masks a legitimate planner/reviewer failure where the subagent crashed but left an old artifact in place.** Mitigation: the baseline is captured per-dispatch immediately before each `subagent_run_serial` call, so any artifact older than the dispatch moment is treated as stale and rejected. The constraint "Freshness baseline is per-dispatch" in the spec is honored by the bash one-liner in each call site, which reads the live mtime each time. The `test_missing_marker_stale_artifact_fails` test in Task 9 demonstrates the stale-rejection path.

- **Risk: macOS vs. Linux `stat` differences break the bash one-liner.** Mitigation: the bash one-liner uses `python3 -c "import os, sys; print(os.path.getmtime(...) if os.path.exists(...) else 0)"` rather than `stat`, eliminating the BSD/GNU `stat` flag difference. Python's `os.path.getmtime` works identically on macOS and Linux. (The repo's current platform is `Darwin 25.4.0` per the session environment — the test suite must work on macOS.)

- **Risk: `parse-artifact-handoff.py` previously accepted only the marker; callers that DON'T pass `--freshness-baseline` could become silently stricter or looser.** Mitigation: the new fallback fires only when BOTH `--expected-path` AND `--freshness-baseline` are supplied. Callers that supply only `--expected-path` (the current shape) get strict marker behavior unchanged. The `test_missing_marker_no_baseline_strict` test in Task 1 documents this; the `validate-and-parse-plan-review.py` wrapper does NOT pass `--freshness-baseline` and therefore stays strict, satisfying the "Out-of-scope parsers stay strict" constraint.

- **Risk: The refine-plan three-option menu introduces a new STATUS or COMMIT value by accident.** Mitigation: Task 7's bullets explicitly map (r) to `COMMIT: committed`, (x) to `COMMIT: left_uncommitted`, and (c) to `COMMIT: committed` followed by re-entry — all existing values. The Task 7 acceptance criteria verify by grep that the menu uses only existing field values.

- **Risk: The refine-code menu letter rename breaks downstream callers that pattern-match on the old letters.** Mitigation: Task 8 audits and updates the orchestrator-verification-boundary reference, the Step 6 forwarding paragraph, and the Step 1 Carry-over review row inside `agent/skills/refine-code/SKILL.md`. The audit also extends to fast-lane references in `agent/skills/fast-lane/SKILL.md` (Step 9 paragraph naming refine-code's menu, Step 9 bullet on `(b) Proceed with issues`, Step 12 cleanup-on-success bullet) and `agent/skills/fast-lane/README.md` (Step 8 numbered list and cleanup-on-success bullet). Task 8's grep-based acceptance criteria assert zero residual `(a) Keep iterating` / `(b) Proceed with issues` / `(a) keep-iterating choice` / `(a)/(b)/(c) menu` strings in both refine-code and fast-lane files, locking in the audit.

- **Risk: The orchestrator-derived slug on todo/freeform branches differs from what the spec-designer would have chosen from Q&A.** Mitigation: Task 11's path-resolution rules derive the slug deterministically from input metadata (todo file's H1 title, or first 60 chars of freeform input) so the slug is stable and pre-dispatch-knowable. The slug is a filesystem identifier only; the spec's content reflects the Q&A. The procedure's updated Step 8 (per Task 11 Step 6) explicitly tells the spec-designer to use `{SPEC_OUTPUT_PATH}` verbatim even when Q&A surfaces a different-sounding topic. This preserves the spec's content fidelity while enabling uniform `--expected-path` wiring per spec criterion 11.

- **Risk: The procedure-change in Task 11 (removing "use the input path as-is" and routing all writes through `{SPEC_OUTPUT_PATH}`) affects the inline-branch flow as well as the mux branch.** Mitigation: the inline branch (orchestrator running the procedure in its own session) also reads the procedure body with `{SPEC_OUTPUT_PATH}` substituted via the same Step 4 mechanism — the orchestrator owns the substitution before consuming the body. On the inline branch the orchestrator IS the writer, so it already knows the path; the substitution is a no-op-equivalent (the path it inserts is the same path it would have written to). Task 11's verification of the procedure body (Steps 6–8) confirms the placeholder is referenced consistently in Steps 1, 8, and 9.

- **Risk: The new strict terminal-message contract for marker-emit subagents conflicts with existing prompt template text that contains other instructions following the marker.** Mitigation: the contract removes only the explicit "Conversational text before the marker line is permitted" sentence; the instructions instructing the subagent to call `subagent_done(...)` as a terminal tool action are preserved (and are not "after" the marker in the assistant message — `subagent_done` is a tool call, not a message-line). The `test_marker_emit_contract.py` test continues to pass because it only checks for marker name presence and `subagent_done(message=...)` instruction presence, both of which remain.

- **Brief said X; plan does Y because <reason>:** No scout brief is referenced in the spec. This risk-assessment entry is included only as a placeholder reminding future readers that no brief was consulted for this work; the spec is the single source of truth.

## Test Command

```bash
cd agent && npm run test:helpers
```
