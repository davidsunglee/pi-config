# Port Superpowers Skills to Pi

## Goal

Port 7 skills from [superpowers](https://github.com/obra/superpowers) to pi's user-level skill directory (`~/.pi/agent/skills/`), adapting content for pi's skill format, trimming human-motivation content (~30-40%), swapping `superpowers:*` references to pi equivalents, and integrating `requesting-code-review` as a mandatory trigger in the existing `execute-plan` skill. Close TODO-97c6bf3a upon completion.

## Architecture summary

Each skill is a standalone directory under `~/.pi/agent/skills/` containing a `SKILL.md` with YAML frontmatter (`name`, `description`) and optional companion files. Skills reference each other by name (e.g., "the `verification-before-completion` skill") and reference pi tools (`todo`, `subagent`, `read`). The `requesting-code-review` skill bundles a `code-reviewer.md` prompt template. The `systematic-debugging` skill bundles three companion technique files. After all skills are created, `execute-plan/SKILL.md` is updated to add a mandatory post-completion code review step.

## Tech stack

- Markdown with YAML frontmatter (Agent Skills specification)
- Pi skill format: directory name = skill name, `SKILL.md` required
- Git (worktree commands in skill content)
- Pi tools: `subagent`, `todo`, `read`, `Bash`

## File Structure

```
- ~/.pi/agent/skills/verification-before-completion/SKILL.md (Create) — Gate function skill: evidence before completion claims
- ~/.pi/agent/skills/test-driven-development/SKILL.md (Create) — Red-green-refactor TDD cycle skill
- ~/.pi/agent/skills/systematic-debugging/SKILL.md (Create) — Four-phase debugging process skill
- ~/.pi/agent/skills/systematic-debugging/root-cause-tracing.md (Create) — Backward tracing technique (companion)
- ~/.pi/agent/skills/systematic-debugging/defense-in-depth.md (Create) — Multi-layer validation technique (companion)
- ~/.pi/agent/skills/systematic-debugging/condition-based-waiting.md (Create) — Replace timeouts with condition polling (companion)
- ~/.pi/agent/skills/using-git-worktrees/SKILL.md (Create) — Manual worktree setup workflow skill
- ~/.pi/agent/skills/finishing-a-development-branch/SKILL.md (Create) — Branch completion options and cleanup skill
- ~/.pi/agent/skills/requesting-code-review/SKILL.md (Create) — Dispatch code-reviewer subagent skill
- ~/.pi/agent/skills/requesting-code-review/code-reviewer.md (Create) — Code reviewer prompt template
- ~/.pi/agent/skills/receiving-code-review/SKILL.md (Create) — Handle review feedback with technical rigor
- ~/.pi/agent/skills/execute-plan/SKILL.md (Modify) — Add mandatory code review trigger after all waves complete
```

## Tasks

### Task 1: Create `verification-before-completion` skill

**Files:**
- Create: `~/.pi/agent/skills/verification-before-completion/SKILL.md`

**Steps:**

- [ ] **Step 1: Create directory** — Run `mkdir -p ~/.pi/agent/skills/verification-before-completion`

- [ ] **Step 2: Write SKILL.md** — Create the file with the following adaptations from the superpowers source at `/tmp/superpowers/skills/verification-before-completion/SKILL.md`:

  **Frontmatter:**
  ```yaml
  ---
  name: verification-before-completion
  description: "Use when about to claim work is complete, fixed, or passing. Requires running verification commands and reading full output before making any success claims. Evidence before assertions, always."
  ---
  ```

  **Content to keep (with assertive tone preserved):**
  - The Iron Law block (`NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE`)
  - The Gate Function (5-step: IDENTIFY → RUN → READ → VERIFY → CLAIM)
  - Common Failures table (Tests pass, Linter clean, Build succeeds, Bug fixed, Regression test, Agent completed, Requirements met)
  - Red Flags list (stop conditions)
  - Rationalization Prevention table
  - Key Patterns section (Tests, Regression tests, Build, Requirements, Agent delegation) — keep all ✅/❌ examples
  - When To Apply section

  **Content to trim:**
  - "Why This Matters" section — remove the human-motivation content ("your human partner said 'I don't believe you'", "trust broken", "you'll be replaced"). Replace with a single line: "Unverified claims waste time on rework and erode reliability."
  - Remove "The Bottom Line" section (duplicates the Iron Law)
  - Overview paragraph: keep "Evidence before claims, always." Remove "Claiming work is complete without verification is dishonesty, not efficiency."

  **Reference swaps:** None needed (this skill has no superpowers references).

  **Attribution:** Add at the bottom: `<!-- Adapted from superpowers (https://github.com/obra/superpowers) -->`

**Acceptance criteria:**
- File exists at `~/.pi/agent/skills/verification-before-completion/SKILL.md`
- Valid YAML frontmatter with `name: verification-before-completion` and `description` ≤ 1024 chars
- Contains Iron Law, Gate Function, Common Failures table, Red Flags, Rationalization Prevention table, Key Patterns, When To Apply
- No human-motivation content ("trust broken", "you'll be replaced", "I don't believe you")
- No "Bottom Line" section (redundant with Iron Law)
- Has attribution comment

**Model recommendation:** cheap

---

### Task 2: Create `test-driven-development` skill

**Files:**
- Create: `~/.pi/agent/skills/test-driven-development/SKILL.md`

**Steps:**

- [ ] **Step 1: Create directory** — Run `mkdir -p ~/.pi/agent/skills/test-driven-development`

- [ ] **Step 2: Write SKILL.md** — Create the file with the following adaptations from the superpowers source at `/tmp/superpowers/skills/test-driven-development/SKILL.md`:

  **Frontmatter:**
  ```yaml
  ---
  name: test-driven-development
  description: "Use when implementing any feature or bugfix. Enforces red-green-refactor cycle: write a failing test first, implement minimal code to pass, then refactor. No production code without a failing test."
  ---
  ```

  **Content to keep:**
  - Overview with "Write the test first. Watch it fail. Write minimal code to pass."
  - When to Use section (Always list + Exceptions)
  - The Iron Law (`NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST`) with the "Delete it. Start over." enforcement
  - Red-Green-Refactor cycle — convert the Graphviz `dot` diagram to a mermaid flowchart:
    ```mermaid
    flowchart LR
      RED["RED\nWrite failing test"] --> VR{"Verify fails\ncorrectly"}
      VR -->|yes| GREEN["GREEN\nMinimal code"]
      VR -->|wrong failure| RED
      GREEN --> VG{"Verify passes\nAll green"}
      VG -->|yes| REFACTOR["REFACTOR\nClean up"]
      VG -->|no| GREEN
      REFACTOR --> VG2{"Still green?"}
      VG2 -->|yes| NEXT["Next cycle"]
      NEXT --> RED
    ```
  - Each phase (RED, Verify RED, GREEN, Verify GREEN, REFACTOR, Repeat) — keep the Good/Bad examples (TypeScript is fine as concrete illustration per guidelines)
  - Good Tests table
  - Common Rationalizations table — keep full table, these are strong compliance anchors
  - Red Flags list
  - Example: Bug Fix (one concrete example)
  - Verification Checklist
  - When Stuck table
  - Debugging Integration paragraph
  - Final Rule block

  **Content to trim:**
  - "Why Order Matters" section — this contains 5 subsections ("I'll write tests after...", "I already manually tested...", "Deleting X hours is wasteful", "TDD is dogmatic...", "Tests after achieve same goals..."). These are human-convincing arguments. The Rationalization table already covers all of these more concisely. **Remove the entire "Why Order Matters" section.**
  - "Testing Anti-Patterns" section referencing `@testing-anti-patterns.md` — drop this reference (we're not porting that companion file; the key anti-patterns are already covered in the rationalizations table and the Good/Bad examples)
  - Remove "Violating the letter of the rules is violating the spirit of the rules." from overview (redundant with Iron Law)

  **Reference swaps:**
  - `superpowers:verification-before-completion` → "the `verification-before-completion` skill"

  **Attribution:** Add at the bottom: `<!-- Adapted from superpowers (https://github.com/obra/superpowers) -->`

**Acceptance criteria:**
- File exists at `~/.pi/agent/skills/test-driven-development/SKILL.md`
- Valid YAML frontmatter with `name: test-driven-development` and `description` ≤ 1024 chars
- Contains Iron Law, Red-Green-Refactor cycle with mermaid diagram, all phase descriptions with examples
- Contains Rationalizations table, Red Flags, Verification Checklist, When Stuck, Bug Fix example
- No "Why Order Matters" section
- No `@testing-anti-patterns.md` reference
- No `superpowers:*` references
- Has attribution comment

**Model recommendation:** cheap

---

### Task 3: Create `systematic-debugging` skill (SKILL.md + 3 companions)

**Files:**
- Create: `~/.pi/agent/skills/systematic-debugging/SKILL.md`
- Create: `~/.pi/agent/skills/systematic-debugging/root-cause-tracing.md`
- Create: `~/.pi/agent/skills/systematic-debugging/defense-in-depth.md`
- Create: `~/.pi/agent/skills/systematic-debugging/condition-based-waiting.md`

**Steps:**

- [ ] **Step 1: Create directory** — Run `mkdir -p ~/.pi/agent/skills/systematic-debugging`

- [ ] **Step 2: Write SKILL.md** — Create the file with the following adaptations from the superpowers source at `/tmp/superpowers/skills/systematic-debugging/SKILL.md`:

  **Frontmatter:**
  ```yaml
  ---
  name: systematic-debugging
  description: "Use when encountering any bug, test failure, or unexpected behavior. Four-phase process: root cause investigation, pattern analysis, hypothesis testing, implementation. 3-fix architectural escalation rule. No fixes without root cause first."
  ---
  ```

  **Content to keep:**
  - Overview with core principle
  - The Iron Law (`NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST`)
  - When to Use section (full lists)
  - The Four Phases — all four phases with all sub-steps:
    - Phase 1: Root Cause Investigation (all 5 steps including multi-component diagnostics and data flow tracing)
    - Phase 2: Pattern Analysis (all 4 steps)
    - Phase 3: Hypothesis and Testing (all 4 steps)
    - Phase 4: Implementation (all 5 steps including the 3-fix architectural escalation rule)
  - Red Flags list
  - Common Rationalizations table
  - Quick Reference table
  - When Process Reveals "No Root Cause" section
  - Supporting Techniques section (references to companion files)

  **Content to trim:**
  - "your human partner's Signals You're Doing It Wrong" section — remove entirely (human-specific coaching signals like "Is that not happening?", "Ultrathink this")
  - "Real-World Impact" section at end — remove (human-motivation: "15-30 minutes vs 2-3 hours")
  - Remove "Violating the letter of this process is violating the spirit of debugging." (redundant with Iron Law)
  - In Phase 1 step 5 (Trace Data Flow): keep the "Quick version" inline, change "See `root-cause-tracing.md` in this directory" to a relative link
  - In Phase 4 step 1: change reference from `superpowers:test-driven-development` to "the `test-driven-development` skill"
  - Convert Graphviz dot diagrams to either mermaid or structured prose (there are none in SKILL.md itself, only in companions)

  **Reference swaps:**
  - `superpowers:test-driven-development` (Phase 4, Step 1) → "the `test-driven-development` skill"
  - `superpowers:verification-before-completion` (Supporting Techniques) → "the `verification-before-completion` skill"

  **Attribution:** Add at the bottom: `<!-- Adapted from superpowers (https://github.com/obra/superpowers) -->`

- [ ] **Step 3: Write root-cause-tracing.md** — Port from `/tmp/superpowers/skills/systematic-debugging/root-cause-tracing.md`:

  **Content to keep:**
  - Overview with core principle
  - When to Use section (convert dot diagram to mermaid or bulleted list)
  - The Tracing Process (all 5 steps with the empty `projectDir` example)
  - Adding Stack Traces section
  - Key Principle section (convert dot diagram to mermaid or structured prose)
  - Stack Trace Tips

  **Content to trim:**
  - "Finding Which Test Causes Pollution" section — references `find-polluter.sh` which we're not porting. Remove this section.
  - "Real Example" section — partially duplicates the Tracing Process example. Keep the Tracing Process example (Step 1-5), remove the "Real Example" section.
  - "Real-World Impact" section at end — remove (human-motivation)
  - Convert all Graphviz dot diagrams to mermaid flowcharts

  **Attribution:** `<!-- Adapted from superpowers (https://github.com/obra/superpowers) -->`

- [ ] **Step 4: Write defense-in-depth.md** — Port from `/tmp/superpowers/skills/systematic-debugging/defense-in-depth.md`:

  **Content to keep (this file is already concise — minimal trimming needed):**
  - Overview with core principle
  - Why Multiple Layers section
  - The Four Layers (Entry Point, Business Logic, Environment Guards, Debug Instrumentation) with code examples
  - Applying the Pattern (4-step process)
  - Key Insight paragraph

  **Content to trim:**
  - "Example from Session" section — remove (duplicates the Four Layers examples which already illustrate the same `projectDir` bug)

  **Attribution:** `<!-- Adapted from superpowers (https://github.com/obra/superpowers) -->`

- [ ] **Step 5: Write condition-based-waiting.md** — Port from `/tmp/superpowers/skills/systematic-debugging/condition-based-waiting.md`:

  **Content to keep:**
  - Overview with core principle
  - When to Use section (convert dot diagram to mermaid or bullet list)
  - Core Pattern (before/after example)
  - Quick Patterns table
  - Implementation section (generic polling function)
  - Common Mistakes section
  - When Arbitrary Timeout IS Correct section

  **Content to trim:**
  - Reference to `condition-based-waiting-example.ts` in Implementation section — file not being ported. Remove the "See `condition-based-waiting-example.ts`..." sentence.
  - "Real-World Impact" section at end — remove (human-motivation: "Fixed 15 flaky tests")
  - Convert dot diagram in "When to Use" to mermaid or bullet list

  **Attribution:** `<!-- Adapted from superpowers (https://github.com/obra/superpowers) -->`

**Acceptance criteria:**
- All 4 files exist in `~/.pi/agent/skills/systematic-debugging/`
- SKILL.md has valid frontmatter with `name: systematic-debugging`
- SKILL.md contains all four phases, Iron Law, 3-fix escalation rule, rationalizations table
- No `superpowers:*` references in any file
- No Graphviz `dot` diagrams — all converted to mermaid or structured prose
- No references to files we didn't port (`find-polluter.sh`, `condition-based-waiting-example.ts`, `CREATION-LOG.md`, `test-*.md`)
- No "your human partner's Signals" section
- No "Real-World Impact" sections
- Companion files use relative links from SKILL.md
- All files have attribution comments

**Model recommendation:** standard

---

### Task 4: Create `using-git-worktrees` skill

**Files:**
- Create: `~/.pi/agent/skills/using-git-worktrees/SKILL.md`

**Steps:**

- [ ] **Step 1: Create directory** — Run `mkdir -p ~/.pi/agent/skills/using-git-worktrees`

- [ ] **Step 2: Write SKILL.md** — Create the file with the following adaptations from the superpowers source at `/tmp/superpowers/skills/using-git-worktrees/SKILL.md`:

  **Frontmatter:**
  ```yaml
  ---
  name: using-git-worktrees
  description: "Use when starting feature work that needs isolation from the current workspace. Guides manual worktree setup: directory selection, safety verification (gitignore check), project setup auto-detection, and baseline test verification. For automated parallel execution, use pi's built-in worktree:true subagent dispatch instead."
  ---
  ```

  **Content to keep:**
  - Overview (reword: drop "Announce at start" directive — pi doesn't use that convention)
  - Directory Selection Process (all 3 priority steps: existing dirs → config → ask)
    - Change "Check CLAUDE.md" to "Check project configuration" — search for worktree preferences in `.pi/settings.json`, `AGENTS.md`, `CLAUDE.md`, or similar project config files
  - Safety Verification section (gitignore check, the "fix broken things immediately" pattern)
  - Creation Steps (all 5: detect project name, create worktree, run project setup, verify clean baseline, report location)
  - Quick Reference table
  - Common Mistakes section
  - Red Flags section

  **Content to trim:**
  - "Announce at start" directive in overview — remove (pi doesn't use this pattern)
  - "Example Workflow" section — remove (the Creation Steps already walk through the same flow step by step)
  - Integration section at bottom — rewrite entirely (see below)

  **Integration section replacement:**
  ```markdown
  ## Integration

  This skill handles **manual worktree setup** for ad-hoc feature branch work.
  For automated parallel task execution, use pi's built-in `worktree: true`
  option in subagent dispatch — that handles worktree creation, execution,
  and diff collection automatically.

  **Pairs with:**
  - `finishing-a-development-branch` — for cleanup after work is complete
  ```

  **Reference swaps:**
  - `CLAUDE.md` → "project configuration (`.pi/settings.json`, `AGENTS.md`, or similar)"
  - All `superpowers:*` integration references → pi equivalents (see Integration replacement above)
  - `~/.config/superpowers/worktrees/` → `~/.config/pi/worktrees/` (global worktree location)

  **Attribution:** `<!-- Adapted from superpowers (https://github.com/obra/superpowers) -->`

**Acceptance criteria:**
- File exists at `~/.pi/agent/skills/using-git-worktrees/SKILL.md`
- Valid YAML frontmatter with `name: using-git-worktrees` and `description` ≤ 1024 chars
- Contains directory selection priority, safety verification, creation steps, quick reference, common mistakes, red flags
- No "Announce at start" directive
- No `superpowers:*` references
- No `CLAUDE.md` references (replaced with pi-appropriate config references)
- Global worktree path uses `~/.config/pi/worktrees/` not `~/.config/superpowers/worktrees/`
- Description clarifies relationship to pi's built-in `worktree: true`
- Has attribution comment

**Model recommendation:** cheap

---

### Task 5: Create `finishing-a-development-branch` skill

**Files:**
- Create: `~/.pi/agent/skills/finishing-a-development-branch/SKILL.md`

**Steps:**

- [ ] **Step 1: Create directory** — Run `mkdir -p ~/.pi/agent/skills/finishing-a-development-branch`

- [ ] **Step 2: Write SKILL.md** — Create the file with the following adaptations from the superpowers source at `/tmp/superpowers/skills/finishing-a-development-branch/SKILL.md`:

  **Frontmatter:**
  ```yaml
  ---
  name: finishing-a-development-branch
  description: "Use when implementation is complete and all tests pass. Presents 4 structured options: merge locally, create PR, keep as-is, or discard. Handles merge, PR creation, confirmation for destructive actions, and worktree cleanup."
  ---
  ```

  **Content to keep:**
  - Overview (remove "Announce at start" directive)
  - The Process — all 5 steps:
    - Step 1: Verify Tests
    - Step 2: Determine Base Branch
    - Step 3: Present Options (exactly 4 options)
    - Step 4: Execute Choice (all 4 option implementations with commands)
    - Step 5: Cleanup Worktree
  - Quick Reference table
  - Common Mistakes section
  - Red Flags section

  **Content to trim:**
  - "Announce at start" directive in overview — remove
  - Integration section — rewrite:
    ```markdown
    ## Integration

    **Pairs with:**
    - `using-git-worktrees` — cleans up worktrees created by that skill
    - `requesting-code-review` — request review before choosing merge/PR option
    ```

  **Reference swaps:**
  - All `superpowers:*` integration references → pi equivalents (see Integration replacement)

  **Attribution:** `<!-- Adapted from superpowers (https://github.com/obra/superpowers) -->`

**Acceptance criteria:**
- File exists at `~/.pi/agent/skills/finishing-a-development-branch/SKILL.md`
- Valid YAML frontmatter with `name: finishing-a-development-branch` and `description` ≤ 1024 chars
- Contains all 5 process steps, 4 options with implementation commands, quick reference table
- No "Announce at start" directive
- No `superpowers:*` references
- Has attribution comment

**Model recommendation:** cheap

---

### Task 6: Create `requesting-code-review` skill with `code-reviewer.md` template

**Files:**
- Create: `~/.pi/agent/skills/requesting-code-review/SKILL.md`
- Create: `~/.pi/agent/skills/requesting-code-review/code-reviewer.md`

**Steps:**

- [ ] **Step 1: Create directory** — Run `mkdir -p ~/.pi/agent/skills/requesting-code-review`

- [ ] **Step 2: Write SKILL.md** — Create the file adapted from `/tmp/superpowers/skills/requesting-code-review/SKILL.md`:

  **Frontmatter:**
  ```yaml
  ---
  name: requesting-code-review
  description: "Use after completing major features, after all plan execution waves complete, or before merging to main. Dispatches a code-reviewer subagent with git diff context and requirements for production readiness review."
  ---
  ```

  **Content — substantially rewritten for pi's subagent dispatch model:**

  ```markdown
  # Requesting Code Review

  Dispatch a code-reviewer subagent to catch issues before they compound. The reviewer
  gets precisely crafted context — never your session's history.

  ## When to Request Review

  **Mandatory:**
  - After all waves complete in `execute-plan` (full diff review)
  - After completing a major feature
  - Before merge to main

  **Optional but valuable:**
  - When stuck (fresh perspective)
  - Before refactoring (baseline check)
  - After fixing complex bug

  ## How to Request

  ### 1. Determine the git range

  ```bash
  # For plan execution: diff from before first wave to current HEAD
  BASE_SHA=$(git merge-base HEAD main)  # or the SHA before execution started
  HEAD_SHA=$(git rev-parse HEAD)
  ```

  ### 2. Read the prompt template and fill placeholders

  Read [code-reviewer.md](code-reviewer.md) in this directory.

  Fill these placeholders:
  - `{WHAT_WAS_IMPLEMENTED}` — what was built
  - `{PLAN_OR_REQUIREMENTS}` — what it should do (plan file contents, todo body, or spec)
  - `{BASE_SHA}` — starting commit
  - `{HEAD_SHA}` — ending commit
  - `{DESCRIPTION}` — brief summary of changes

  ### 3. Dispatch the subagent

  ```
  subagent {
    agent: "plan-executor",
    task: "<filled code-reviewer.md template>",
    model: "<capable-tier model>"
  }
  ```

  Use a capable-tier model in a fresh context — the reviewer must see
  the code without bias from the generation process.

  ### 4. Act on feedback

  | Severity | Action |
  |----------|--------|
  | **Critical** | Fix immediately — bugs, security issues, data loss |
  | **Important** | Fix before proceeding — architecture, missing features, test gaps |
  | **Minor** | Note for later — style, optimization, docs |

  **If reviewer is wrong:** Push back with technical reasoning. Reference working
  tests or code. Don't implement suggestions that break things.

  ## Red Flags

  **Never:**
  - Skip review because "it's simple"
  - Ignore Critical issues
  - Proceed with unfixed Important issues

  **If reviewer wrong:**
  - Push back with technical reasoning
  - Show code/tests that prove correctness
  ```

  **Attribution:** `<!-- Adapted from superpowers (https://github.com/obra/superpowers) -->`

- [ ] **Step 3: Write code-reviewer.md** — Port from `/tmp/superpowers/skills/requesting-code-review/code-reviewer.md`:

  **Content to keep (this file is already well-structured — keep almost all of it):**
  - The preamble ("You are reviewing code changes for production readiness")
  - The 5-step task description
  - Placeholder sections (`{WHAT_WAS_IMPLEMENTED}`, `{PLAN_OR_REQUIREMENTS}`, etc.)
  - Git range section with `git diff` commands
  - Review Checklist — all 5 categories:
    - Code Quality (separation, error handling, type safety, DRY, edge cases)
    - Architecture (design, scalability, performance, security)
    - Testing (real tests, edge cases, integration, all passing)
    - Requirements (all met, matches spec, no scope creep, breaking changes)
    - Production Readiness (migration, backward compat, docs, no bugs)
  - Output Format (Strengths, Issues by severity, Recommendations, Assessment)
  - Critical Rules (DO/DON'T lists)
  - Example Output

  **Content to trim:**
  - The `{PLAN_REFERENCE}` placeholder — rename to `{PLAN_OR_REQUIREMENTS}` for consistency with SKILL.md
  - No other trimming needed — this is a prompt template, not a human-facing document

  **Reference swaps:**
  - Replace "Use Task tool with superpowers:code-reviewer type" instruction — this is a standalone prompt template file, not a superpowers tool reference. No action needed in the template itself (it's already tool-agnostic).

  **Attribution:** `<!-- Adapted from superpowers (https://github.com/obra/superpowers) -->`

**Acceptance criteria:**
- Both files exist in `~/.pi/agent/skills/requesting-code-review/`
- SKILL.md has valid frontmatter with `name: requesting-code-review`
- SKILL.md describes pi subagent dispatch (not superpowers Task tool)
- SKILL.md lists mandatory triggers (execute-plan, major feature, before merge)
- `code-reviewer.md` contains all 5 review checklist categories, output format, severity levels, example output
- `code-reviewer.md` uses `{PLAN_OR_REQUIREMENTS}` (not `{PLAN_REFERENCE}`)
- No `superpowers:*` references in either file
- No `TodoWrite` references
- Both files have attribution comments

**Model recommendation:** standard

---

### Task 7: Create `receiving-code-review` skill

**Files:**
- Create: `~/.pi/agent/skills/receiving-code-review/SKILL.md`

**Steps:**

- [ ] **Step 1: Create directory** — Run `mkdir -p ~/.pi/agent/skills/receiving-code-review`

- [ ] **Step 2: Write SKILL.md** — Create the file with the following adaptations from the superpowers source at `/tmp/superpowers/skills/receiving-code-review/SKILL.md`:

  **Frontmatter:**
  ```yaml
  ---
  name: receiving-code-review
  description: "Use when receiving code review feedback. Requires verifying suggestions against codebase reality before implementing, pushing back with technical reasoning when wrong, and clarifying unclear items before acting. Technical rigor over reflexive agreement."
  ---
  ```

  **Content to keep:**
  - Overview — reword: keep "Verify before implementing. Ask before assuming. Technical correctness over social comfort." Remove "not emotional performance."
  - The Response Pattern (6-step: READ → UNDERSTAND → VERIFY → EVALUATE → RESPOND → IMPLEMENT)
  - Handling Unclear Feedback section with example
  - Source-Specific Handling — keep structure but adapt:
    - "From your human partner" → "From the user" (pi terminology)
    - "From External Reviewers" — keep the 5-point verification checklist and the "IF suggestion seems wrong: Push back with technical reasoning" flow
  - YAGNI Check section
  - Implementation Order section
  - When To Push Back section (all bullet points)
  - Gracefully Correcting Your Pushback section
  - Common Mistakes table
  - Real Examples section (Performative Agreement bad, Technical Verification good, YAGNI good, Unclear Item good)
  - GitHub Thread Replies section

  **Social behavior rules — keep the core, trim the over-fitted:**

  Keep:
  - The core rule: "Verify and evaluate before agreeing; act instead of performing agreement" — this prevents a real model failure mode
  - Forbidden Responses section — keep the NEVER list ("You're absolutely right!", "Great point!", "Let me implement that now" before verification) and the INSTEAD list
  - "Acknowledging Correct Feedback" — keep the ✅ examples ("Fixed. [description]", "Good catch - [issue]. Fixed in [location].", or just fix it silently)

  Trim:
  - Remove the exhaustive ❌ examples in "Acknowledging Correct Feedback" that police social niceties ("ANY gratitude expression", "DELETE IT", "Thanks for [anything]") — over-fitted to one user's preferences. Keep just: `❌ Performative agreement before verification` and `❌ "Let me implement that now" (before checking against codebase)`
  - Remove "If you catch yourself about to write 'Thanks': DELETE IT." — over-fitted
  - Remove `"Signal if uncomfortable pushing back out loud: 'Strange things are afoot at the Circle K'"` — user-specific signal

  **Reference swaps:**
  - "your human partner" → "the user" throughout
  - "your human partner's rule:" → remove the attribution prefix, keep the rule content
  - "explicit CLAUDE.md violation" → remove this parenthetical
  - No `superpowers:*` references in this file (confirmed)

  **Attribution:** `<!-- Adapted from superpowers (https://github.com/obra/superpowers) -->`

**Acceptance criteria:**
- File exists at `~/.pi/agent/skills/receiving-code-review/SKILL.md`
- Valid YAML frontmatter with `name: receiving-code-review` and `description` ≤ 1024 chars
- Contains Response Pattern, Forbidden Responses, Handling Unclear Feedback, Source-Specific Handling, YAGNI Check, When To Push Back, Common Mistakes, Real Examples
- Core social rule preserved: "verify and evaluate before agreeing; act instead of performing agreement"
- No over-fitted social policing ("DELETE IT", "never express gratitude", "Strange things are afoot")
- No "your human partner" references — uses "the user"
- No `CLAUDE.md` references
- Has attribution comment

**Model recommendation:** standard

---

### Task 8: Update `execute-plan` skill with mandatory code review trigger

**Files:**
- Modify: `~/.pi/agent/skills/execute-plan/SKILL.md`

**Steps:**

- [ ] **Step 1: Read current execute-plan skill** — Read `~/.pi/agent/skills/execute-plan/SKILL.md` to confirm current structure (11 steps).

- [ ] **Step 2: Add Step 11.5 (review) before completion** — Insert a new step between the current Step 11 ("Complete or report partial progress") and the move-to-done action. Renumber as needed. The new step:

  ```markdown
  ## Step 12: Request code review

  After all waves complete successfully and before moving the plan to `done/`:

  1. **Determine git range** — find the SHA from before execution started (logged at Step 7 start) and current HEAD.
  2. **Load the review template** — read `~/.pi/agent/skills/requesting-code-review/code-reviewer.md`.
  3. **Fill placeholders:**
     - `{WHAT_WAS_IMPLEMENTED}` — the plan's Goal section
     - `{PLAN_OR_REQUIREMENTS}` — the full plan file contents
     - `{BASE_SHA}` — SHA before execution
     - `{HEAD_SHA}` — current HEAD
     - `{DESCRIPTION}` — "Plan execution: <plan filename>"
  4. **Dispatch review subagent:**
     ```
     subagent {
       agent: "plan-executor",
       task: "<filled template>",
       model: "<capable-tier>"
     }
     ```
  5. **Handle review results:**
     - **Critical/Important issues found:** Report to user. Offer to dispatch fix-up tasks or proceed to done.
     - **Minor issues only or clean:** Note in completion summary. Proceed to move plan to `done/`.
     - **Review skipped** (user opted out): Proceed to done with a note that review was skipped.

  The user may skip review by answering "skip" when asked about execution preferences (add as Question 3 in Step 3).
  ```

- [ ] **Step 3: Update Step 3 (execution preferences)** — Add a third question:

  ```markdown
  **Question 3 — Code review after completion:**
  - (a) Review all changes after final wave *(recommended)*
  - (b) Skip review

  Default to **(a) review** unless the user specifies otherwise.
  ```

- [ ] **Step 4: Update Step 7 (execute waves)** — Add a note at the start of Step 7 to record the pre-execution SHA:

  ```markdown
  Before dispatching the first wave, record the current HEAD SHA for the post-completion review:
  ```bash
  PRE_EXECUTION_SHA=$(git rev-parse HEAD)
  ```
  ```

- [ ] **Step 5: Renumber steps** — The current steps are 1-11. After inserting the review step, renumber:
  - Steps 1-11 remain as-is (though Step 3 and Step 7 have additions)
  - New Step 12: Request code review
  - Renumber old Step 11's content about moving to `done/` to Step 13, OR keep Step 11 but split it:
    - Step 11 becomes "Complete or report partial progress" (the failure/partial case)
    - Step 12 becomes "Request code review" (runs only on full success)
    - Step 13 becomes "Move plan to done" (the final action after review)

    Simplest approach: keep steps 1-10 unchanged, split step 11 into 11 (partial/stopped reporting) + 12 (review on success) + 13 (move to done on success).

**Acceptance criteria:**
- `execute-plan/SKILL.md` contains a code review step that runs after all waves complete
- Step 3 includes a review opt-out question
- Step 7 records pre-execution SHA
- Review step references `~/.pi/agent/skills/requesting-code-review/code-reviewer.md`
- Review step uses capable-tier model
- Review results are reported to user with option to fix or proceed
- Existing steps 1-10 are functionally unchanged (content preserved, only additions)

**Model recommendation:** standard

---

### Task 9: Close TODO-97c6bf3a

**Files:**
- None (todo tool operation only)

**Steps:**

- [ ] **Step 1: Close the TODO** — Use the `todo` tool to update TODO-97c6bf3a:
  - Set status to `done`
  - Append to body: "Subsumed by `requesting-code-review` skill (mandatory trigger in `execute-plan` after all waves complete)."

**Acceptance criteria:**
- TODO-97c6bf3a status is `done`
- Body includes note about being subsumed by the ported skill

**Model recommendation:** cheap

## Dependencies

```
- Task 1 depends on: (none)
- Task 2 depends on: (none)
- Task 3 depends on: (none)
- Task 4 depends on: (none)
- Task 5 depends on: (none)
- Task 6 depends on: (none)
- Task 7 depends on: (none)
- Task 8 depends on: Task 6
- Task 9 depends on: Task 8
```

Tasks 1-7 are independent skill creations with no cross-dependencies (they reference each other by name, but the files don't need to exist at creation time). Task 8 modifies `execute-plan` and must reference the `requesting-code-review` skill created in Task 6. Task 9 closes the TODO after Task 8 confirms the integration.

## Risk Assessment

### Risk 1: Description length exceeds 1024 chars
**Likelihood:** Low
**Impact:** Skill won't load (pi validates description length)
**Mitigation:** All descriptions in this plan are drafted under 300 chars. Workers should verify `description` field length before writing.

### Risk 2: Skill name doesn't match directory name
**Likelihood:** Low
**Impact:** Pi warns and may not discover the skill correctly
**Mitigation:** Plan explicitly specifies matching names. Workers should verify `name` field matches the directory they create.

### Risk 3: Leftover `superpowers:*` references
**Likelihood:** Medium — easy to miss during porting
**Impact:** Broken cross-references confuse the agent
**Mitigation:** Each task's acceptance criteria explicitly requires no `superpowers:*` references. Workers should grep the output file for `superpowers` before completing.

### Risk 4: Over-trimming removes compliance-critical content
**Likelihood:** Low-Medium — trimming guidelines are specific but judgment is involved
**Impact:** Skills lose effectiveness (rationalizations table, iron laws, gate functions are the most effective compliance anchors)
**Mitigation:** Plan explicitly lists what to keep (iron laws, rationalizations, red flags, gate functions) and what to trim (human-motivation, duplicate explanations). Workers should err on the side of keeping compliance anchors.

### Risk 5: `execute-plan` modification breaks existing functionality
**Likelihood:** Low — Task 8 only adds new steps and a question, doesn't change existing step logic
**Impact:** Plan execution breaks
**Mitigation:** Task 8 acceptance criteria explicitly requires "Existing steps 1-10 are functionally unchanged." Worker should diff before and after to verify no content was lost from steps 1-10.

### Risk 6: Stale dot diagram references
**Likelihood:** Medium — easy to copy a Graphviz block without converting
**Impact:** Raw dot syntax renders as code block, not as diagram
**Mitigation:** Task 3 acceptance criteria requires "No Graphviz dot diagrams." Worker should grep for `digraph` and `dot` code blocks.
