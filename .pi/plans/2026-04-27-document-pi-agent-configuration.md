# Document pi Agent Configuration in README

## Goal

Add a tiny, explicit documentation note to `README.md` stating that this repository stores pi agent configuration, so a first-time visitor learns the repo's purpose from a one-liner before reading the existing tagline and table of contents.

## Architecture summary

This is a single-file, single-line documentation edit. No code changes, no new files, no behavior changes. The note is inserted into `README.md` immediately under the `# pi-config` H1 heading and **above** the existing tagline (`Personal configuration for [pi](https://github.com/badlogic/pi-mono)'s coding agent.`) so it is the first thing a reader sees.

> **Existing-content overlap:** Line 3 of `README.md` already reads `Personal configuration for [pi](https://github.com/badlogic/pi-mono)'s coding agent.`, which substantially conveys the same information. The requested note is intentionally narrower and more declarative ("This repository stores pi agent configuration.") and is meant to sit alongside — not replace — the existing tagline. The plan keeps both. If the implementer or reviewer concludes the note is redundant, the right call is to abandon the change rather than restructure the README; that decision belongs to the reviewer, not the implementer.

## Tech stack

- Markdown (`README.md`)
- `git` for the commit
- `wc -l` and `grep` for post-edit sanity checks

## File Structure

- Modify: `README.md` — insert a single italicized note line between the H1 and the existing tagline (current line 1 → line 2 split).

No other files are touched.

## Tasks

### Task 1: Insert the note line into `README.md` and commit

**Files:**
- Modify: `README.md` (insert one line + one blank line, between current line 1 and current line 3)

**Acceptance criteria:**
- [ ] `README.md` contains exactly one new italicized line stating that this repo stores pi agent configuration, located between the `# pi-config` heading and the existing `Personal configuration for ...` tagline.
  - **Verify:** `head -n 5 README.md` — output shows `# pi-config` on line 1, a blank line, the new italicized note on line 3, a blank line on line 4, and the existing `Personal configuration for [pi](https://github.com/badlogic/pi-mono)'s coding agent.` on line 5.
- [ ] No other lines in `README.md` are changed.
  - **Verify:** `git diff --stat README.md` shows `1 file changed, 2 insertions(+)` and `git diff README.md` shows only added lines (no `-` lines).
- [ ] The commit message follows the repo's Conventional Commits style and references the documentation scope.
  - **Verify:** `git log -1 --pretty=%s` returns a `docs(readme): ...` style subject.

**Steps:**

- [ ] **Step 1: Read the current top of `README.md` to confirm the insertion point.**

  Run:
  ```bash
  head -n 5 README.md
  ```
  Expected output (exact):
  ```
  # pi-config

  Personal configuration for [pi](https://github.com/badlogic/pi-mono)'s coding agent.

  This repo is the checked-in part of my pi setup: local extensions, local subagents, themes, settings, installed packages, and workflow artifacts such as tracked todos and plans. The emphasis is on a more opinionated, workflow-oriented pi environment without forking pi itself.
  ```
  If the first three lines do not match, **stop** — the file has been edited since this plan was written, and the insertion point needs to be re-checked before proceeding.

- [ ] **Step 2: Insert the note line.**

  Edit `README.md` so the top of the file reads exactly:
  ```markdown
  # pi-config

  _This repository stores pi agent configuration._

  Personal configuration for [pi](https://github.com/badlogic/pi-mono)'s coding agent.
  ```
  Concretely: after the existing blank line 2 and before the existing tagline on line 3 (`Personal configuration for [pi](https://github.com/badlogic/pi-mono)'s coding agent.`), insert two new lines — `_This repository stores pi agent configuration._` and a trailing blank line. The existing tagline shifts from line 3 to line 5, and the existing blank line 4 (between the tagline and `This repo is the checked-in part of my pi setup:`) shifts to line 6. The existing line 1 (`# pi-config`), the existing blank line 2, the tagline text itself, and any subsequent content must remain unchanged. Equivalently: the resulting top of the file must match exactly the five-line block shown above (heading, blank, italic note, blank, tagline). If it is easier to do this by replacing the existing top three lines (`# pi-config`, blank, `Personal configuration ...`) with the exact five-line block above, that is acceptable as long as the heading text and tagline text are preserved character-for-character.

- [ ] **Step 3: Verify the insertion is exactly two lines.**

  Run:
  ```bash
  git diff --stat README.md
  ```
  Expected: `1 file changed, 2 insertions(+)` (no deletions).

  Also run:
  ```bash
  git diff README.md
  ```
  Expected: only `+` lines for the new italicized note line and one blank line. No `-` lines anywhere in the diff.

  If either check shows unexpected changes (deletions, more than 2 insertions, or modifications outside lines 1–4), revert and redo the edit.

- [ ] **Step 4: Verify the rendered top of the file.**

  Run:
  ```bash
  head -n 5 README.md
  ```
  Expected output (exact):
  ```
  # pi-config

  _This repository stores pi agent configuration._

  Personal configuration for [pi](https://github.com/badlogic/pi-mono)'s coding agent.
  ```

- [ ] **Step 5: Commit the change.**

  Run:
  ```bash
  git add README.md
  git commit -m "docs(readme): note that this repo stores pi agent configuration"
  ```
  Expected: a single-file commit on the current branch with no other staged changes. If `git status` before the commit shows other modified files, stage `README.md` only.

  Verify the commit subject:
  ```bash
  git log -1 --pretty=%s
  ```
  Expected output (exact):
  ```
  docs(readme): note that this repo stores pi agent configuration
  ```

## Dependencies

None. This task is a single, atomic documentation edit and depends on no other tasks, generated artifacts, or environment setup.

## Risk assessment

- **Risk:** The new note duplicates the existing tagline on line 3.
  **Mitigation:** The note is intentionally short and declarative, sits above the tagline as an introductory framing line, and the plan preamble flags the overlap so the reviewer can choose to drop the change if they consider it redundant. No other content is touched, so reverting is a one-line `git revert`.

- **Risk:** Whitespace drift (missing blank line, wrong newline at EOF) breaks the Markdown rendering.
  **Mitigation:** Step 3's `git diff --stat` constraint (`2 insertions(+)`, zero deletions) and Step 4's exact `head -n 5` match catch any unintended whitespace changes before the commit.

- **Risk:** The README has been edited since this plan was generated, shifting the insertion point.
  **Mitigation:** Step 1 requires confirming the first five lines match the expected snapshot before editing. If they don't, the implementer stops and refreshes the plan rather than guessing.

## Test command

This is a documentation-only change with no automated test coverage. Manual verification is the `head -n 5 README.md` check in Step 4 and the `git diff` checks in Step 3. No test suite needs to be run.

## Model tier recommendation

- **Task 1:** `cheap` — single-file, mechanical Markdown insertion with exact target text specified in the plan; no judgment or codebase exploration required.
