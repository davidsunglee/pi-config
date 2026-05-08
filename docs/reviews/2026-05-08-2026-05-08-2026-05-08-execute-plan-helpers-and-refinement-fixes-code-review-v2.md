**Reviewer:** openai-codex/gpt-5.5 via pi

### Outcome

**Verdict:** Approved

**Reasoning:** The implementation satisfies the helper extraction, menu normalization, carry-over threading, line-count, and testing requirements with no Critical or Important findings. I found only a minor documentation-format issue in an adjacent consumer skill.

### Strengths

- `agent/skills/execute-plan/SKILL.md:447-500` standardizes the requested retry, pacing, and review-budget menus with mnemonic options and the byte-equal stop line while keeping the file under the 600-line cap (555 lines).
- `agent/skills/execute-plan/scripts/extract-plan-tasks.py:166-196` adds deterministic dependency wave computation with sub-wave splitting, and the expanded tests cover section validation, unknown dependencies, cycles, and cap overrides.
- `agent/skills/refine-plan/refine-plan-prompt.md:84-94` and `agent/skills/refine-code/refine-code-prompt.md:84-93` clearly add the carry-over edit/remediation pass before the next era's first review without consuming the fresh iteration budget.
- Helper coverage is broad and passes via `cd agent && npm run test:helpers` (384 helper tests total across the invoked suites).

### Issues

#### Critical (Must Fix)

_None._

#### Important (Should Fix)

_None._

#### Minor (Nice to Have)

- **agent/skills/finishing-a-development-branch/SKILL.md:78-80: Prose appears inside a bash command block**
  - **What:** The updated merge workflow includes an English sentence (`Run the command returned by ...`) inside a fenced `bash` block.
  - **Why it matters:** An agent or user copying the block literally would get an invalid shell command, even though the intended workflow is clear.
  - **Recommendation:** Move the prose outside the code fence or replace it with a shell snippet that invokes `detect-test-command.py`, parses `.command`, and runs/asks accordingly.

### Recommendations

- Consider adding a focused test for `compute-verifier-file-set.py` with renamed files or paths containing spaces if those workflows are expected, because `git status --porcelain` path parsing is easy to regress.
