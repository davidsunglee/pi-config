# Rename fast-lane skill references to fastlane

**Source:** TODO-60cc4dd1

## Goal

Rename the `fast-lane` skill — its folder, the prompt template filename, frontmatter name, helper/template paths, subagent/task names, review-artifact suffixes, stash/test-run artifact naming, and user-facing error prefixes — to the single-word form `fastlane`. Update every live reference in the rest of the repo (root README, define-spec orchestrator, define-spec README, npm script in `agent/package.json`, helper tests, helper README) so the renamed paths and identifiers continue to work. Historical, append-only artifacts under `docs/reviews/`, `docs/todos/`, and `docs/analysis/` that record what existed at the time of past runs are left as-is and called out as compatibility notes.

## Architecture summary

The fast-lane skill is a self-contained skill folder at `agent/skills/fast-lane/` containing:

- `SKILL.md` — orchestrator specification (12 steps, ~422 lines).
- `README.md` — human-facing summary of the skill.
- `fast-lane-coder-prompt.md` — placeholder-filled prompt template the orchestrator sends to the `coder` subagent.
- `scripts/recommend-workflow.py` — legacy / non-authoritative spec-shape heuristic.
- `scripts/README.md` — helper docs.
- `scripts/tests/test_recommend_workflow.py` plus fixtures under `scripts/tests/fixtures/`.

The skill is dispatched from `agent/skills/define-spec/SKILL.md` Step 8 via the slash command `/fast-lane <spec-path>`. The slash command and the skill's frontmatter `name:` field both derive from the skill folder name. The root `README.md`, `agent/package.json` (`test:helpers` npm script), `agent/skills/define-spec/SKILL.md`, and `agent/skills/define-spec/README.md` reference either the folder path `agent/skills/fast-lane/` or the slash command `/fast-lane`.

Internally, `SKILL.md` produces several string identifiers that must stay aligned with the skill name:

- subagent task `name: "fast-lane-coder"` for the `subagent_run_serial` dispatch
- stash message `"fast-lane-baseline-comparison-<spec-name>"`
- refine-code review-output-path suffix `<spec-name>-fast-lane-review` (artifacts land at `docs/reviews/<spec-name>-fast-lane-review-v<ERA>.md`)
- helper / template paths under `agent/skills/fast-lane/` (specifically `agent/skills/fast-lane/fast-lane-coder-prompt.md` for `fill-template.py` and `agent/skills/fast-lane/scripts` for `cleanup-pycache.py`)
- user-facing error prefixes (`fast-lane: todo TODO-<id>...`, `fast-lane: input must be...`)

Every one of those must be renamed in lockstep with the folder rename so subsequent live references resolve. The natural-language prose "Fast Lane" / "fast lane" (with a space, capitalized as a heading or used as English noun phrase) is NOT the literal `fast-lane` identifier and is left alone — only the hyphenated `fast-lane` identifier form must change per the acceptance criteria ("no literal `fast-lane` occurrences").

The rename is purely local — no external package, no extension code under `agent/extensions/`, no agent definition under `agent/agents/`, and no setting under `agent/settings.json` references `fast-lane`. There is no v0 compatibility shim required because nothing outside this repo consumes the skill.

## Tech stack

- Skill prompts and READMEs: Markdown.
- Helper script and tests: Python 3 (`unittest`).
- Node tooling: `agent/package.json` `test:helpers` npm script runs the Python unittests across all skills' `scripts/tests/` directories sequentially.
- Source control: git (use `git mv` to preserve rename history).

## File Structure

- `agent/skills/fast-lane/` (Rename to `agent/skills/fastlane/`) — Whole-directory rename via `git mv`. Carries over all tracked files (`SKILL.md`, `README.md`, `fast-lane-coder-prompt.md`, `scripts/recommend-workflow.py`, `scripts/README.md`, `scripts/tests/__init__.py`, `scripts/tests/test_recommend_workflow.py`, `scripts/tests/fixtures/spec-fast-lane-fit.md`, `scripts/tests/fixtures/spec-deep-fit-approach.md`, `scripts/tests/fixtures/spec-deep-fit-many-requirements.md`, `scripts/tests/fixtures/spec-deep-fit-flagged-non-goals.md`). Ignored files (`.DS_Store`, `__pycache__/`) are carried along by the filesystem rename but are not tracked.
- `agent/skills/fastlane/fast-lane-coder-prompt.md` (Rename to `agent/skills/fastlane/fastlane-coder-prompt.md`) — Inner-file rename via `git mv` after the directory rename.
- `agent/skills/fastlane/SKILL.md` (Modify) — Replace every literal `fast-lane` with `fastlane`. This covers frontmatter `name:`, the two user-facing error prefixes inside `~~~` fenced blocks, the template path under `--template`, the subagent task `name:`, the stash message, the `--review-output-path` suffix (and its description), the post-completion pycache cleanup path argument, and the artifact-retention bullet that references `<spec-name>-fast-lane-review-v<ERA>.md`.
- `agent/skills/fastlane/README.md` (Modify) — Replace literal `fast-lane` with `fastlane` in the `agent/skills/fast-lane/` self-reference (none currently — but the `fast-lane-coder-prompt.md` bullet and the `-fast-lane-review` suffix mentions, plus the `name: "fast-lane-coder"` example, must change).
- `agent/skills/fastlane/fastlane-coder-prompt.md` (Modify, after rename) — Replace the one literal `fast-lane` occurrence in the body sentence "Prompt template dispatched to the single fast-lane `coder` subagent."
- `agent/skills/fastlane/scripts/recommend-workflow.py` (Modify) — Update the module docstring, the argparse description, and the recommendation literal value `'fast-lane'` to `'fastlane'`. The script's stdout JSON `recommendation` field becomes `"fastlane"` instead of `"fast-lane"`. The script is described in-repo as legacy / non-authoritative; the only documented consumer (`define-spec/SKILL.md` Step 8) treats it as an optional signal and routes via LLM judgment, so no external caller is broken by changing the literal value.
- `agent/skills/fastlane/scripts/README.md` (Modify) — Replace literal `fast-lane` with `fastlane` in the prose and in the example `unittest discover` path `skills/fast-lane/scripts/tests`.
- `agent/skills/fastlane/scripts/tests/test_recommend_workflow.py` (Modify) — Update the docstring that says "fast-lane" and the two `assertEqual(result["recommendation"], "fast-lane")`-style assertions to `"fastlane"`. The fixture filename `spec-fast-lane-fit.md` and the `/tmp/does-not-exist-fast-lane-spec.md` arg-to-missing-spec test are NOT renamed — they are internal-only test identifiers with no public surface and the acceptance criteria does not list them; renaming them is gratuitous churn. (See `## Risk Assessment` for the rationale.)
- `README.md` at the repo root (Modify) — Replace literal `fast-lane` with `fastlane` in seven occurrences: the `docs/test-runs/` description, the mermaid `fastStart["fast-lane\n..."]` node label, the routing-rule bullet, the skill-table row `[`fast-lane`](agent/skills/fast-lane/README.md)` link text and path, and the two subagent-table rows that list `fast-lane` among consumers.
- `agent/package.json` (Modify) — Update the `test:helpers` npm script's final unittest path from `skills/fast-lane/scripts/tests` to `skills/fastlane/scripts/tests`.
- `agent/skills/define-spec/SKILL.md` (Modify) — Update the slash-command invocation on the `(f) / fast / fast lane` routing line from `/fast-lane <spec-path>` to `/fastlane <spec-path>`.
- `agent/skills/define-spec/README.md` (Modify) — Replace the three literal `fast-lane` occurrences: the `agent/skills/fast-lane/` parenthetical path on the continuation-menu paragraph, the `agent/skills/fast-lane/scripts/recommend-workflow.py` legacy-helper path on the same paragraph, and the `[fast-lane](../fast-lane/README.md)` link on the "Continuation menu" section.

## Tasks

### Task 1: Rename the skill folder and prompt-template file

**Files:**
- Modify: `agent/skills/fast-lane/` → `agent/skills/fastlane/` (whole-directory rename)
- Modify: `agent/skills/fastlane/fast-lane-coder-prompt.md` → `agent/skills/fastlane/fastlane-coder-prompt.md` (inner-file rename, after the directory rename)

**Steps:**
- [ ] **Step 1: Confirm working tree is clean** — Run `git status --porcelain` from `/Users/david/Code/pi-config`. Confirm the output is empty (the orchestrator must not be carrying unrelated working-tree changes into this rename). If non-empty, surface the dirty-state output to the user and stop — do not proceed.
- [ ] **Step 2: Rename the skill directory** — Run `git mv agent/skills/fast-lane agent/skills/fastlane` from `/Users/david/Code/pi-config`. `git mv` operates on the directory's tracked files and moves the on-disk directory in one step. Ignored files (`.DS_Store`, `__pycache__/`) carry along with the filesystem rename and are not added to the git index.
- [ ] **Step 3: Rename the coder prompt template inside the new directory** — Run `git mv agent/skills/fastlane/fast-lane-coder-prompt.md agent/skills/fastlane/fastlane-coder-prompt.md` from `/Users/david/Code/pi-config`. After this, the new path `agent/skills/fastlane/fastlane-coder-prompt.md` exists in the git index.
- [ ] **Step 4: Sanity-check the rename** — Run `ls agent/skills/fastlane/fastlane-coder-prompt.md agent/skills/fastlane/SKILL.md agent/skills/fastlane/README.md agent/skills/fastlane/scripts/recommend-workflow.py agent/skills/fastlane/scripts/tests/test_recommend_workflow.py` from `/Users/david/Code/pi-config`. Confirm all five paths exist and that `ls agent/skills/fast-lane 2>/dev/null` returns nothing.

**Acceptance criteria:**

- The directory `agent/skills/fastlane/` exists on disk and contains the same tracked files (just renamed where the filename itself contained `fast-lane`).
  Verify: run `ls -la agent/skills/fastlane/` from `/Users/david/Code/pi-config` and confirm the listing includes `SKILL.md`, `README.md`, `fastlane-coder-prompt.md`, `scripts/`, and that `ls agent/skills/fast-lane 2>&1` prints `ls: agent/skills/fast-lane: No such file or directory`.
- The git index reflects renames (not deletions plus adds) so git history is preserved.
  Verify: run `git status --short` from `/Users/david/Code/pi-config` and confirm the lines for the moved files start with `R ` (rename status), and that there are no `??` (untracked) entries for any tracked file path that was previously at `agent/skills/fast-lane/`.
- The fast-lane folder no longer exists on disk.
  Verify: run `test -d agent/skills/fast-lane && echo PRESENT || echo ABSENT` from `/Users/david/Code/pi-config` and confirm the output is exactly `ABSENT`.

**Model recommendation:** cheap

### Task 2: Update content of `agent/skills/fastlane/SKILL.md`

**Files:**
- Modify: `agent/skills/fastlane/SKILL.md`

**Steps:**
- [ ] **Step 1: Change the frontmatter `name:` field** — In `agent/skills/fastlane/SKILL.md` line 2, change `name: fast-lane` to `name: fastlane`. Leave the `description:` line on line 3 unchanged (it contains no `fast-lane` literal).
- [ ] **Step 2: Update the two user-facing error-prefix strings inside fenced blocks** — In `agent/skills/fastlane/SKILL.md`, change the line `fast-lane: todo TODO-<id> not found at docs/todos/<bare-id>.md.` inside the Step 0 todo-ID-not-found `~~~` fence to `fastlane: todo TODO-<id> not found at docs/todos/<bare-id>.md.` Then change the line `fast-lane: input must be a spec path under docs/specs/ or a TODO-<id>. Run /define-spec first to shape a spec.` inside the Step 0 freeform-rejection `~~~` fence to `fastlane: input must be a spec path under docs/specs/ or a TODO-<id>. Run /define-spec first to shape a spec.`
- [ ] **Step 3: Update the `--template` path in the Step 4 `fill-template.py` invocation** — Change the line `--template agent/skills/fast-lane/fast-lane-coder-prompt.md \` to `--template agent/skills/fastlane/fastlane-coder-prompt.md \`. Preserve the trailing backslash and the indentation.
- [ ] **Step 4: Update the Step 4 `subagent_run_serial` task name** — Change the literal `name: "fast-lane-coder",` to `name: "fastlane-coder",`. Preserve the quotes and the trailing comma.
- [ ] **Step 5: Update the Step 7 stash message** — Change the literal `git stash push -u -m "fast-lane-baseline-comparison-<spec-name>"` to `git stash push -u -m "fastlane-baseline-comparison-<spec-name>"`. Preserve the surrounding backticks and quoting.
- [ ] **Step 6: Update the Step 9 review-output-path bullet** — Change the bullet `- \`--review-output-path docs/reviews/<spec-name>-fast-lane-review\`. The \`-fast-lane-review\` namespacing distinguishes fast-lane review artifacts from deep-workflow review artifacts targeting the same spec.` to `- \`--review-output-path docs/reviews/<spec-name>-fastlane-review\`. The \`-fastlane-review\` namespacing distinguishes fastlane review artifacts from deep-workflow review artifacts targeting the same spec.` (both the path-suffix mentions and the prose "fast-lane review" tokens that name the suffix).
- [ ] **Step 7: Update the Step 12 retention-policy bullet for review artifacts** — Change `Refine-code review artifacts at \`docs/reviews/<spec-name>-fast-lane-review-v<ERA>.md\` follow refine-code's existing retention policy (kept).` to `Refine-code review artifacts at \`docs/reviews/<spec-name>-fastlane-review-v<ERA>.md\` follow refine-code's existing retention policy (kept).`
- [ ] **Step 8: Update the Step 12 post-helper bookkeeping bullet (text + command)** — Change `Post-helper bookkeeping: any Python bytecode caches (\`__pycache__\`) left behind by helper invocations under \`agent/skills/fast-lane/scripts/\` are removed on successful completion:` to `Post-helper bookkeeping: any Python bytecode caches (\`__pycache__\`) left behind by helper invocations under \`agent/skills/fastlane/scripts/\` are removed on successful completion:`. Then change the fenced command body `python3 agent/skills/_shared/scripts/cleanup-pycache.py agent/skills/fast-lane/scripts` to `python3 agent/skills/_shared/scripts/cleanup-pycache.py agent/skills/fastlane/scripts`.
- [ ] **Step 9: Final scan inside SKILL.md** — From `/Users/david/Code/pi-config`, run `grep -n 'fast-lane' agent/skills/fastlane/SKILL.md`. Confirm the grep prints no lines (exit status 1 from `grep`). If any line is printed, return to whichever step it corresponds to and fix it. Do NOT touch natural-language prose like the Step heading `# Fast Lane` (line 6) or the prose body string `Fast lane plan:` — those are descriptive English, not the literal hyphenated identifier.

**Acceptance criteria:**

- The frontmatter `name:` is `fastlane`.
  Verify: run `head -n 4 agent/skills/fastlane/SKILL.md` from `/Users/david/Code/pi-config` and confirm line 2 reads exactly `name: fastlane`.
- The file contains no literal `fast-lane` occurrences.
  Verify: run `grep -n 'fast-lane' agent/skills/fastlane/SKILL.md` from `/Users/david/Code/pi-config` and confirm the command produces no stdout output (exits non-zero).
- The Step 4 `fill-template.py` invocation references the renamed template path.
  Verify: run `grep -n 'fill-template.py' -A1 agent/skills/fastlane/SKILL.md` from `/Users/david/Code/pi-config` and confirm the next line printed contains `--template agent/skills/fastlane/fastlane-coder-prompt.md`.
- The Step 4 subagent task name is renamed.
  Verify: run `grep -n 'name: \"fastlane-coder\"' agent/skills/fastlane/SKILL.md` from `/Users/david/Code/pi-config` and confirm exactly one match line is printed (the line inside the Step 4 `subagent_run_serial` block).
- The Step 9 review-output-path suffix is renamed in both the path token and the namespacing prose.
  Verify: run `grep -n 'fastlane-review' agent/skills/fastlane/SKILL.md` from `/Users/david/Code/pi-config` and confirm at least three match lines are printed (Step 9 path token, Step 9 namespacing-prose token, and Step 12 retention-policy bullet's path).
- The Step 12 post-helper pycache cleanup uses the renamed directory path.
  Verify: run `grep -n 'cleanup-pycache.py' agent/skills/fastlane/SKILL.md` from `/Users/david/Code/pi-config` and confirm the printed line's argument is `agent/skills/fastlane/scripts`, not `agent/skills/fast-lane/scripts`.

**Model recommendation:** cheap

### Task 3: Update content of `agent/skills/fastlane/README.md`

**Files:**
- Modify: `agent/skills/fastlane/README.md`

**Steps:**
- [ ] **Step 1: Update the "Coder dispatch" example block's task `name`** — In `agent/skills/fastlane/README.md`, change the literal `name: "fast-lane-coder",` (inside the indented ` ```` ` example block) to `name: "fastlane-coder",`. Preserve the quotes and the trailing comma.
- [ ] **Step 2: Update the "Refine-code" phase bullet's review-output-path suffix mention** — Change the prose `review-output path namespaced with \`-fast-lane-review\`.` (in the numbered phases list under "## Phases") to `review-output path namespaced with \`-fastlane-review\`.`
- [ ] **Step 3: Update the "Review artifacts" bullet under `## Artifacts`** — Change `Review artifacts** — \`docs/reviews/<spec-name>-fast-lane-review-v<ERA>.md\` (always, after refine-code completes). The \`-fast-lane-review\` namespacing distinguishes fast-lane review artifacts from deep-workflow reviews targeting the same spec.` to `Review artifacts** — \`docs/reviews/<spec-name>-fastlane-review-v<ERA>.md\` (always, after refine-code completes). The \`-fastlane-review\` namespacing distinguishes fastlane review artifacts from deep-workflow reviews targeting the same spec.`
- [ ] **Step 4: Update the "Files" bullet referring to the prompt template** — Change `\`fast-lane-coder-prompt.md\` — Template prompt dispatched to the \`coder\` agent, with placeholders for spec content, checklist, working directory, and TDD guidance.` to `\`fastlane-coder-prompt.md\` — Template prompt dispatched to the \`coder\` agent, with placeholders for spec content, checklist, working directory, and TDD guidance.`
- [ ] **Step 5: Update the "scripts/recommend-workflow.py" bullet** — Change the inline-code token `\`fast-lane\` vs. \`deep-workflow\`` (describing the helper's JSON recommendation output) to `\`fastlane\` vs. \`deep-workflow\`` so the README matches the updated script output value.
- [ ] **Step 6: Update the freeform-input rejection-message quote** — Change the sentence `Freeform input that matches neither pattern is rejected with the message: "fast-lane: input must be a spec path under docs/specs/ or a TODO-<id>. Run /define-spec first to shape a spec."` to `Freeform input that matches neither pattern is rejected with the message: "fastlane: input must be a spec path under docs/specs/ or a TODO-<id>. Run /define-spec first to shape a spec."` so the README continues to quote the actual user-facing error string emitted by `SKILL.md`.
- [ ] **Step 7: Update the "Files" section preamble and the "SKILL.md" bullet identifier-prose** — Change the section-preamble sentence `The fast-lane skill comprises:` to `The fastlane skill comprises:`. Then change the "SKILL.md" file-list bullet body `Complete orchestrator specification for the fast-lane workflow, including all steps, menus, edge cases, and artifact management.` to `Complete orchestrator specification for the fastlane workflow, including all steps, menus, edge cases, and artifact management.`
- [ ] **Step 8: Final scan inside README.md** — From `/Users/david/Code/pi-config`, run `grep -n 'fast-lane' agent/skills/fastlane/README.md`. Confirm the grep prints no lines. If any line is printed, return to the step it corresponds to and fix it. Do NOT touch the natural-language prose strings like the heading `# Fast Lane skill` or sentences such as "Fast lane retains..." that use "Fast lane" / "fast lane" with a space — those are descriptive English, not the literal `fast-lane` identifier.

**Acceptance criteria:**

- The file contains no literal `fast-lane` occurrences.
  Verify: run `grep -n 'fast-lane' agent/skills/fastlane/README.md` from `/Users/david/Code/pi-config` and confirm the command produces no stdout output (exits non-zero).
- The Coder dispatch example block names the subagent task `fastlane-coder`.
  Verify: run `grep -n '"fastlane-coder"' agent/skills/fastlane/README.md` from `/Users/david/Code/pi-config` and confirm exactly one match line is printed.
- The "Review artifacts" bullet under `## Artifacts` uses the `-fastlane-review` suffix.
  Verify: run `grep -n 'fastlane-review' agent/skills/fastlane/README.md` from `/Users/david/Code/pi-config` and confirm at least two match lines are printed (the path-suffix mention and the prose suffix mention).
- The "Files" bullet for the prompt template uses `fastlane-coder-prompt.md`.
  Verify: run `grep -n 'fastlane-coder-prompt.md' agent/skills/fastlane/README.md` from `/Users/david/Code/pi-config` and confirm exactly one match line is printed.
- The freeform-input rejection-message quote uses the `fastlane:` prefix.
  Verify: open `agent/skills/fastlane/README.md` and confirm the sentence that begins `Freeform input that matches neither pattern is rejected with the message:` quotes the prefix `fastlane:` (not `fast-lane:`).

**Model recommendation:** cheap

### Task 4: Update content of `agent/skills/fastlane/fastlane-coder-prompt.md`

**Files:**
- Modify: `agent/skills/fastlane/fastlane-coder-prompt.md`

**Steps:**
- [ ] **Step 1: Update the body sentence that names the dispatch target** — In `agent/skills/fastlane/fastlane-coder-prompt.md` line 3, change `Prompt template dispatched to the single fast-lane \`coder\` subagent. Fill placeholders before sending.` to `Prompt template dispatched to the single fastlane \`coder\` subagent. Fill placeholders before sending.`
- [ ] **Step 2: Final scan inside the prompt template** — From `/Users/david/Code/pi-config`, run `grep -n 'fast-lane' agent/skills/fastlane/fastlane-coder-prompt.md`. Confirm the grep prints no lines. Do NOT change the H1 heading `# Fast Lane Coder Prompt` on line 1 — that is natural-language prose ("Fast Lane Coder Prompt") and does not contain the literal hyphenated identifier `fast-lane`.

**Acceptance criteria:**

- The file contains no literal `fast-lane` occurrences.
  Verify: run `grep -n 'fast-lane' agent/skills/fastlane/fastlane-coder-prompt.md` from `/Users/david/Code/pi-config` and confirm the command produces no stdout output (exits non-zero).
- The body sentence references `fastlane`.
  Verify: run `grep -n 'single fastlane' agent/skills/fastlane/fastlane-coder-prompt.md` from `/Users/david/Code/pi-config` and confirm exactly one match line is printed.

**Model recommendation:** cheap

### Task 5: Update `agent/skills/fastlane/scripts/recommend-workflow.py`

**Files:**
- Modify: `agent/skills/fastlane/scripts/recommend-workflow.py`

**Steps:**
- [ ] **Step 1: Update the module docstring** — In `agent/skills/fastlane/scripts/recommend-workflow.py`, change the docstring line `Recommends fast-lane or deep-workflow based on specification characteristics.` to `Recommends fastlane or deep-workflow based on specification characteristics.`
- [ ] **Step 2: Update the argparse description** — Change the `description='Recommend fast-lane or deep-workflow based on specification characteristics.'` to `description='Recommend fastlane or deep-workflow based on specification characteristics.'`
- [ ] **Step 3: Update the recommendation literal returned in the JSON output** — Change `recommendation = 'fast-lane'` (inside the `if not has_approach and requirements_count <= args.requirements_threshold and not flagged_non_goals:` branch in `main()`) to `recommendation = 'fastlane'`. This changes the script's stdout JSON `recommendation` field value from `"fast-lane"` to `"fastlane"`. Do NOT change the `'deep-workflow'` literal on the `else` branch — it is not part of the rename.
- [ ] **Step 4: Final scan inside the script** — From `/Users/david/Code/pi-config`, run `grep -n 'fast-lane' agent/skills/fastlane/scripts/recommend-workflow.py`. Confirm the grep prints no lines.

**Acceptance criteria:**

- The script's recommendation literal is `'fastlane'`.
  Verify: run `python3 agent/skills/fastlane/scripts/recommend-workflow.py --spec-path agent/skills/fastlane/scripts/tests/fixtures/spec-fast-lane-fit.md` from `/Users/david/Code/pi-config` and confirm stdout JSON has `"recommendation": "fastlane"` (use `python3 -c "import json, sys; print(json.loads(sys.stdin.read())['recommendation'])"` piped from the previous command, expect `fastlane`).
- The script's docstring and argparse description use `fastlane`.
  Verify: run `grep -n 'fastlane' agent/skills/fastlane/scripts/recommend-workflow.py` from `/Users/david/Code/pi-config` and confirm at least three match lines are printed (module docstring line 3, argparse description line, and the `recommendation = 'fastlane'` assignment).
- The file contains no literal `fast-lane` occurrences.
  Verify: run `grep -n 'fast-lane' agent/skills/fastlane/scripts/recommend-workflow.py` from `/Users/david/Code/pi-config` and confirm the command produces no stdout output.

**Model recommendation:** cheap

### Task 6: Update `agent/skills/fastlane/scripts/README.md`

**Files:**
- Modify: `agent/skills/fastlane/scripts/README.md`

**Steps:**
- [ ] **Step 1: Update the "Why this exists" paragraph** — Change `The \`fast-lane/scripts/\` directory contains deterministic, testable Python helpers that support the fast-lane workflow coordinator.` to `The \`fastlane/scripts/\` directory contains deterministic, testable Python helpers that support the fastlane workflow coordinator.`
- [ ] **Step 2: Update the recommend-workflow.py bullet** — Change the inline-code token `\`fast-lane\` vs. \`deep-workflow\` JSON recommendation` to `\`fastlane\` vs. \`deep-workflow\` JSON recommendation`.
- [ ] **Step 3: Update the unittest-discover example command path** — Change the fenced command `python3 -m unittest discover -s skills/fast-lane/scripts/tests -p "test_*.py"` to `python3 -m unittest discover -s skills/fastlane/scripts/tests -p "test_*.py"`.
- [ ] **Step 4: Update the concluding `test:helpers` sentence** — Change `This will run both shared and fast-lane helper tests in sequence.` to `This will run both shared and fastlane helper tests in sequence.`
- [ ] **Step 5: Final scan inside scripts/README.md** — From `/Users/david/Code/pi-config`, run `grep -n 'fast-lane' agent/skills/fastlane/scripts/README.md`. Confirm the grep prints no lines.

**Acceptance criteria:**

- The file contains no literal `fast-lane` occurrences.
  Verify: run `grep -n 'fast-lane' agent/skills/fastlane/scripts/README.md` from `/Users/david/Code/pi-config` and confirm the command produces no stdout output.
- The unittest discover example uses the new path.
  Verify: run `grep -n 'skills/fastlane/scripts/tests' agent/skills/fastlane/scripts/README.md` from `/Users/david/Code/pi-config` and confirm exactly one match line is printed (inside the fenced "To run tests directly" block).

**Model recommendation:** cheap

### Task 7: Update `agent/skills/fastlane/scripts/tests/test_recommend_workflow.py`

**Files:**
- Modify: `agent/skills/fastlane/scripts/tests/test_recommend_workflow.py`

**Steps:**
- [ ] **Step 1: Update the class docstring** — In `agent/skills/fastlane/scripts/tests/test_recommend_workflow.py`, change the sentence `the authoritative fast-lane vs. deep-workflow recommendation — the` (inside the multi-line docstring under `class TestRecommendWorkflow`) to `the authoritative fastlane vs. deep-workflow recommendation — the`.
- [ ] **Step 2: Update the `test_fast_lane_fit_recommends_fast_lane` test docstring** — Change the line `"""Test: spec-fast-lane-fit.md recommends fast-lane."""` to `"""Test: spec-fast-lane-fit.md recommends fastlane."""`. The fixture filename `spec-fast-lane-fit.md` is kept as-is (it is an internal-only test-fixture name with no public surface; renaming it is out of scope — see `## Risk Assessment`); only the recommendation token in the docstring changes.
- [ ] **Step 3: Update the `test_fast_lane_fit_recommends_fast_lane` assertion** — Change `self.assertEqual(result["recommendation"], "fast-lane")` (inside `test_fast_lane_fit_recommends_fast_lane`) to `self.assertEqual(result["recommendation"], "fastlane")`. This matches the updated script output value from Task 5.
- [ ] **Step 4: Leave the `/tmp/does-not-exist-fast-lane-spec.md` arg alone** — In `test_missing_spec_fails_with_label`, the argument `/tmp/does-not-exist-fast-lane-spec.md` is a literal nonexistent path used to trigger the script's `spec_missing` failure branch. The path is a test-internal sentinel that is never read; the missing-spec exit is path-agnostic. Do NOT change it — the acceptance criteria does not list internal test sentinels, and changing it is gratuitous churn.
- [ ] **Step 5: Final scan** — From `/Users/david/Code/pi-config`, run `grep -n 'fast-lane' agent/skills/fastlane/scripts/tests/test_recommend_workflow.py`. The expected remaining matches are exactly three: (a) the `spec-fast-lane-fit.md` fixture filename mention in the `test_fast_lane_fit_recommends_fast_lane` docstring, (b) the same fixture filename literal used to construct `spec_path` on the following line, and (c) the `/tmp/does-not-exist-fast-lane-spec.md` sentinel argument in `test_missing_spec_fails_with_label`. All three are fixture/sentinel references kept by design.

**Acceptance criteria:**

- The recommendation assertion in `test_fast_lane_fit_recommends_fast_lane` uses `"fastlane"`.
  Verify: run `grep -n 'assertEqual(result\\[\"recommendation\"\\]' agent/skills/fastlane/scripts/tests/test_recommend_workflow.py` from `/Users/david/Code/pi-config` and confirm the match line includes `, "fastlane")` (not `, "fast-lane")`).
- The class docstring uses `fastlane`.
  Verify: run `grep -n 'fastlane vs. deep-workflow' agent/skills/fastlane/scripts/tests/test_recommend_workflow.py` from `/Users/david/Code/pi-config` and confirm exactly one match line is printed.
- The remaining `fast-lane` references are exactly the three fixture/sentinel mentions (kept by design).
  Verify: run `grep -c 'fast-lane' agent/skills/fastlane/scripts/tests/test_recommend_workflow.py` from `/Users/david/Code/pi-config` and confirm the output is exactly `3`.

**Model recommendation:** cheap

### Task 8: Update repo-level references outside the renamed skill

**Files:**
- Modify: `README.md`
- Modify: `agent/package.json`
- Modify: `agent/skills/define-spec/SKILL.md`
- Modify: `agent/skills/define-spec/README.md`

**Steps:**
- [ ] **Step 1: Update root `README.md` — "docs/test-runs" description** — In `README.md`, change the line `  test-runs/         Temporary test-runner / fast-lane evidence, created on demand` (inside the repository-layout fenced text block) to `  test-runs/         Temporary test-runner / fastlane evidence, created on demand`.
- [ ] **Step 2: Update root `README.md` — mermaid node label** — Change `    fastStart["fast-lane\nChecklist + settings"]` to `    fastStart["fastlane\nChecklist + settings"]`. Preserve indentation and the `\n` literal.
- [ ] **Step 3: Update root `README.md` — routing-rule bullet** — Change the bullet starting `- \`fast-lane\` is for well-scoped changes. It keeps spec discipline and a fresh-context \`refine-code\` pass, but intentionally drops worktree creation, wave decomposition, verifier dispatch, automatic baseline reconciliation, and automatic push.` to `- \`fastlane\` is for well-scoped changes. It keeps spec discipline and a fresh-context \`refine-code\` pass, but intentionally drops worktree creation, wave decomposition, verifier dispatch, automatic baseline reconciliation, and automatic push.`
- [ ] **Step 4: Update root `README.md` — define-spec table-row prose** — Change the cell `Interactive spec writing from a todo, existing spec, or freeform request. Uses a mux-backed \`spec-designer\` pane when available, falls back inline, writes \`docs/specs/*.md\`, gates commit on review, then offers fast-lane/deep/stop.` to `Interactive spec writing from a todo, existing spec, or freeform request. Uses a mux-backed \`spec-designer\` pane when available, falls back inline, writes \`docs/specs/*.md\`, gates commit on review, then offers fastlane/deep/stop.`
- [ ] **Step 5: Update root `README.md` — fast-lane skill-table row link and label** — Change the entire row `| [\`fast-lane\`](agent/skills/fast-lane/README.md) | Lightweight implementation path after spec shaping. Accepts a spec path or \`TODO-<id>\`, builds an ephemeral checklist, dispatches one \`coder\`, runs tests with optional baseline comparison, commits, invokes reduced-budget \`refine-code\`, closes linked todos, and never pushes automatically. |` to `| [\`fastlane\`](agent/skills/fastlane/README.md) | Lightweight implementation path after spec shaping. Accepts a spec path or \`TODO-<id>\`, builds an ephemeral checklist, dispatches one \`coder\`, runs tests with optional baseline comparison, commits, invokes reduced-budget \`refine-code\`, closes linked todos, and never pushes automatically. |`
- [ ] **Step 6: Update root `README.md` — `coder` subagent-table row** — Change the cell `\`execute-plan\`, \`fast-lane\`, \`refine-code\`` (in the `coder` subagent row's "Used by" column) to `\`execute-plan\`, \`fastlane\`, \`refine-code\``, and in the same row's summary cell change the phrase `one plan task, one fast-lane checklist, or a batch of review fixes` to `one plan task, one fastlane checklist, or a batch of review fixes`.
- [ ] **Step 7: Update root `README.md` — `code-refiner` subagent-table row** — Change the cell `\`refine-code\`, \`fast-lane\`, \`execute-plan\`` (in the `code-refiner` subagent row's "Used by" column) to `\`refine-code\`, \`fastlane\`, \`execute-plan\``.
- [ ] **Step 8: Update `agent/package.json` — `test:helpers` script** — In `agent/package.json` line 9, change the literal substring `python3 -m unittest discover -s skills/fast-lane/scripts/tests -p \"test_*.py\"` (at the end of the `test:helpers` value, after the chain of `&&`-separated unittest discover invocations for `_shared`, `execute-plan`, `refine-code`, `refine-plan`, `define-spec`) to `python3 -m unittest discover -s skills/fastlane/scripts/tests -p \"test_*.py\"`. Preserve every other character on the line — quoting, escaping, and the rest of the discover-chain are unchanged.
- [ ] **Step 9: Update `agent/skills/define-spec/SKILL.md` slash-command routing** — In `agent/skills/define-spec/SKILL.md` line 204, change `- \`(f) / fast / fast lane\` → invoke \`/fast-lane <spec-path>\`.` to `- \`(f) / fast / fast lane\` → invoke \`/fastlane <spec-path>\`.` Leave the menu-letter description `(f) / fast / fast lane` (with a space) alone — it is the user-facing menu-letter prose, not the slash command.
- [ ] **Step 10: Update `agent/skills/define-spec/README.md` — continuation-menu prose paragraph (line 50)** — Change `(the lightweight workflow at \`agent/skills/fast-lane/\`)` to `(the lightweight workflow at \`agent/skills/fastlane/\`)`, and in the same paragraph change `The legacy helper \`agent/skills/fast-lane/scripts/recommend-workflow.py\` is retained for compatibility but is no longer authoritative` to `The legacy helper \`agent/skills/fastlane/scripts/recommend-workflow.py\` is retained for compatibility but is no longer authoritative`.
- [ ] **Step 11: Update `agent/skills/define-spec/README.md` — "Continuation menu" link (line 54)** — Change `the \`fast lane\` branch dispatches the [fast-lane](../fast-lane/README.md) skill for a lightweight single-coder implementation workflow` to `the \`fast lane\` branch dispatches the [fastlane](../fastlane/README.md) skill for a lightweight single-coder implementation workflow`. Leave the surrounding natural-language prose `fast lane branch` alone — it is descriptive English referring to the workflow concept.
- [ ] **Step 12: Final scan** — From `/Users/david/Code/pi-config`, run `grep -n 'fast-lane' README.md agent/package.json agent/skills/define-spec/SKILL.md agent/skills/define-spec/README.md`. Confirm the grep prints no lines (each of these four live-reference files now contains zero `fast-lane` identifiers).

**Acceptance criteria:**

- The root `README.md` skill-table row points to the renamed path and label.
  Verify: run `grep -n 'agent/skills/fastlane/README.md' README.md` from `/Users/david/Code/pi-config` and confirm exactly one match line is printed (the fastlane row in the skills table).
- The root `README.md` contains no `fast-lane` literals.
  Verify: run `grep -n 'fast-lane' README.md` from `/Users/david/Code/pi-config` and confirm the command produces no stdout output.
- The `agent/package.json` `test:helpers` script discovers tests under the renamed path.
  Verify: run `grep -n 'skills/fastlane/scripts/tests' agent/package.json` from `/Users/david/Code/pi-config` and confirm exactly one match line is printed (inside the `test:helpers` script value).
- The `agent/package.json` contains no `fast-lane` literals.
  Verify: run `grep -n 'fast-lane' agent/package.json` from `/Users/david/Code/pi-config` and confirm the command produces no stdout output.
- The `agent/skills/define-spec/SKILL.md` routing line invokes `/fastlane`.
  Verify: run `grep -n '/fastlane <spec-path>' agent/skills/define-spec/SKILL.md` from `/Users/david/Code/pi-config` and confirm exactly one match line is printed.
- The `agent/skills/define-spec/SKILL.md` contains no `fast-lane` literals.
  Verify: run `grep -n 'fast-lane' agent/skills/define-spec/SKILL.md` from `/Users/david/Code/pi-config` and confirm the command produces no stdout output.
- The `agent/skills/define-spec/README.md` references point to the renamed paths.
  Verify: run `grep -n 'agent/skills/fastlane/' agent/skills/define-spec/README.md` from `/Users/david/Code/pi-config` and confirm at least two match lines are printed (the lightweight-workflow path and the legacy-helper path on the continuation-menu paragraph).
- The `agent/skills/define-spec/README.md` contains no `fast-lane` literals.
  Verify: run `grep -n 'fast-lane' agent/skills/define-spec/README.md` from `/Users/david/Code/pi-config` and confirm the command produces no stdout output.

**Model recommendation:** cheap

### Task 9: Verify the rename end-to-end

**Files:**
- Test: `agent/skills/fastlane/scripts/tests/test_recommend_workflow.py` (run via `unittest`)
- Test: full helper suite via `npm run test:helpers`

**Steps:**
- [ ] **Step 1: Run the fastlane helper tests directly** — From `/Users/david/Code/pi-config/agent`, run `python3 -m unittest discover -s skills/fastlane/scripts/tests -p "test_*.py"`. Confirm the run reports `OK` and the test count is 5 (matches the existing 5-test file). If any test fails, jump back to Tasks 5 or 7 and fix.
- [ ] **Step 2: Run the full helper test suite via npm** — From `/Users/david/Code/pi-config/agent`, run `npm run test:helpers`. Confirm the chained unittest invocations exit with code 0 (each `&&`-separated unittest discover run reports `OK`). This validates that the renamed path in `agent/package.json` resolves correctly and that no other skill's tests were inadvertently affected.
- [ ] **Step 3: Confirm no live-reference `fast-lane` literal remains in the repo** — From `/Users/david/Code/pi-config`, run `grep -rn 'fast-lane' --include='*.md' --include='*.py' --include='*.json' --include='*.ts' README.md agent/`. Confirm the only outputs (if any) are: (a) fixture filename `spec-fast-lane-fit.md` references in `agent/skills/fastlane/scripts/tests/test_recommend_workflow.py` (kept by design), and (b) the test-internal sentinel argument `/tmp/does-not-exist-fast-lane-spec.md` in `test_missing_spec_fails_with_label` (kept by design). Any other match is a regression and must be fixed.
- [ ] **Step 4: Confirm historical artifacts under `docs/` are NOT touched** — From `/Users/david/Code/pi-config`, run `git diff --name-only -- docs/`. Confirm zero files are listed (no `docs/reviews/`, `docs/todos/`, `docs/analysis/`, or `docs/specs/` files are in the diff for this rename). These are append-only historical records and must remain unchanged.
- [ ] **Step 5: Confirm the skill is discoverable by name** — From `/Users/david/Code/pi-config`, run `grep -n '^name: fastlane$' agent/skills/fastlane/SKILL.md`. Confirm exactly one match line is printed (the frontmatter `name:` line).

**Acceptance criteria:**

- The fastlane helper tests pass.
  Verify: run `cd agent && python3 -m unittest discover -s skills/fastlane/scripts/tests -p "test_*.py"` from `/Users/david/Code/pi-config` and confirm the output's last summary line begins with `OK` (and reports `Ran 5 tests`).
- The full helper test suite passes via npm.
  Verify: run `cd agent && npm run test:helpers` from `/Users/david/Code/pi-config` and confirm the command exits with status 0 (no `FAILED` or `ERROR` lines in the chained unittest output).
- The only remaining `fast-lane` literals outside historical `docs/` artifacts are the three test-fixture / test-sentinel references documented in `## Risk Assessment`.
  Verify: run `grep -rn 'fast-lane' --include='*.md' --include='*.py' --include='*.json' --include='*.ts' README.md agent/` from `/Users/david/Code/pi-config` and confirm the printed matches are exactly three lines, all inside `agent/skills/fastlane/scripts/tests/test_recommend_workflow.py` — two fixture filename references (`spec-fast-lane-fit.md` mentions on the test docstring and the `spec_path` assignment) plus one `/tmp/does-not-exist-fast-lane-spec.md` sentinel in `test_missing_spec_fails_with_label`. No `agent/skills/fast-lane/` paths and no live-prose `fast-lane` identifiers remain.
- Historical `docs/` artifacts are untouched.
  Verify: run `git diff --name-only -- docs/ | wc -l` from `/Users/david/Code/pi-config` and confirm the output is exactly `       0`.

**Model recommendation:** standard

## Dependencies

- Task 2 depends on: Task 1
- Task 3 depends on: Task 1
- Task 4 depends on: Task 1
- Task 5 depends on: Task 1
- Task 6 depends on: Task 1
- Task 7 depends on: Task 1, Task 5 (Task 7's assertion expects the script's updated output value from Task 5)
- Task 8 depends on: Task 1
- Task 9 depends on: Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7, Task 8

## Risk Assessment

- **`recommend-workflow.py` JSON contract change is theoretically breaking.** Changing the `recommendation` literal from `"fast-lane"` to `"fastlane"` is part of the rename but technically alters a script's public stdout contract. Mitigation: the script is documented in-repo as legacy / non-authoritative (`agent/skills/fastlane/README.md` "scripts/recommend-workflow.py (legacy / non-authoritative)" bullet and `agent/skills/define-spec/SKILL.md` Step 8's "You may glance at the helper's output as one optional signal"). A repo-wide grep shows no other in-repo consumer pattern-matches on the output value. The risk is bounded to any unknown external consumer.

- **Historical artifacts under `docs/` deliberately kept unchanged.** The following files contain literal `fast-lane` but are append-only historical records of past runs and analyses — they document what existed at the time and must not be rewritten:
  - `docs/reviews/TODO-6fd80df8-fast-lane-review-v1.md`, `docs/reviews/TODO-a2a09b4d-fast-lane-review-v1.md`, `docs/reviews/TODO-ba34265a-fast-lane-review-v1.md`, `docs/reviews/TODO-da6759aa-fast-lane-review-v1.md`, `docs/reviews/TODO-da6759aa-fast-lane-review-v2.md`, `docs/reviews/TODO-da6759aa-fast-lane-review-v3.md` — review artifacts the refine-code skill wrote at the `<spec-name>-fast-lane-review-v<ERA>.md` path used at the time of each run. Going forward, new review artifacts will be written at the `<spec-name>-fastlane-review-v<ERA>.md` path because of the suffix rename in `SKILL.md`. The two suffix styles will coexist — old runs at the old suffix, new runs at the new suffix.
  - `docs/todos/60cc4dd1.md` (this todo itself) — describes the rename and intentionally references the old path.
  - `docs/todos/6fd80df8.md` — completed todo whose Goal/Context/Acceptance reference fast-lane as it existed at completion time.
  - `docs/todos/da6759aa.md`, `docs/todos/ba34265a.md`, `docs/todos/a2a09b4d.md` — done todos with `Completed via fast lane:` provenance lines (note: these say `fast lane` with a space, not the `fast-lane` literal anyway).
  - `docs/analysis/2026-05-12-workflow-pros-cons-and-suggestions.md` — dated analysis document that describes the workflow as it existed on the dated snapshot.

  This decision is permitted by the acceptance criterion "Repository references to the old `agent/skills/fast-lane` path are updated or explicitly documented as compatibility notes." The historical artifacts are the documented compatibility notes.

- **Test-internal fixture filename `spec-fast-lane-fit.md` kept as-is.** The fixture file at `agent/skills/fastlane/scripts/tests/fixtures/spec-fast-lane-fit.md` is referenced only from `test_recommend_workflow.py` and has no external consumer. Renaming it would require updating two test-file references and the file on disk; the acceptance criteria does not list test-internal fixture names. Decision: keep the filename as-is to minimize churn. The test docstring and assertion are updated to reflect the new `fastlane` recommendation value, but the fixture path constant remains the same.

- **Test-internal sentinel `/tmp/does-not-exist-fast-lane-spec.md` kept as-is.** The `test_missing_spec_fails_with_label` test in `test_recommend_workflow.py` uses a deliberately-nonexistent `/tmp` path as a sentinel to exercise the script's `spec_missing` failure branch. The path is never read; it triggers a `FileNotFoundError` in `Path(args.spec_path).read_text()`. Renaming the sentinel would not change the test's behavior, and the path is not part of any public surface. Decision: keep it.

- **Renaming with `git mv` versus shell `mv`.** Use `git mv` because it records the rename in the git index (preserving `git log --follow` history), and it operates atomically on tracked files within a directory. A naive `mv` followed by `git add -A` would record the change as a delete-plus-add pair, losing rename detection in some history-traversal scenarios. The `git mv` command will not complain about untracked ignored files (`.DS_Store`, `__pycache__/`) inside the source directory — they carry along with the filesystem rename and remain ignored at the new location.

- **No backwards-compatibility shim provided.** The todo's acceptance criteria allow a shim if explicitly documented, but no in-repo consumer depends on the old path: the root README, `agent/package.json`, `agent/skills/define-spec/SKILL.md`, and `agent/skills/define-spec/README.md` are all updated in this plan. No skill outside `define-spec` invokes `/fast-lane`, and no helper script imports from `agent/skills/fast-lane/`. A shim would be added complexity for no benefit. If a future external consumer surfaces, a shim can be added then.

- **Slash-command resolution.** The pi-coding-agent framework derives the slash command (`/fastlane`) from the skill folder name (`fastlane`) and matches it against the frontmatter `name:` field. After the rename, both are `fastlane`, so `/fastlane <spec-path>` resolves correctly. No additional registration step is required.

- **Natural-language prose ("Fast Lane" headings, "fast lane" descriptive English) is left unchanged.** The acceptance criterion is "no literal `fast-lane` occurrences" — the hyphenated identifier form. Multi-word prose with a space is not the identifier and is not in scope. A future consistency pass could tighten this further, but it is explicitly out of scope for this todo.

## Test Command

```bash
cd agent && npm run test:helpers
```
