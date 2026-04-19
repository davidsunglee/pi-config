# pi-config

Personal configuration for [pi](https://github.com/badlogic/pi-mono)'s coding agent.

This repo is the checked-in part of my pi setup: local extensions, local subagents, themes, settings, installed packages, and workflow artifacts such as tracked todos and plans. The emphasis is on a more opinionated, workflow-oriented pi environment without forking pi itself.

## What this repo contains

At a high level, this config adds six things on top of stock pi:

1. **Skills** that encode the end-to-end development workflow
2. **Custom extensions** for TUI ergonomics, safety guardrails, and workflow support
3. **Local subagents** for planning, coding, reviewing, and refining
4. **Custom themes** including a theme-aware footer
5. **Installed packages** for subagent dispatch, web access, and token burden tracking
6. **Tracked workflow state** in `.pi/` (todos, plans, specs, reviews)

Repository layout:

```text
agent/
  agents/          Local subagent definitions (6 agents)
  extensions/      Custom pi extensions (11 files)
  skills/          Workflow and discipline skills (14 skills)
  themes/          Custom themes
  model-tiers.json Model tier definitions and dispatch map
  settings.json    Main pi settings for this setup
.pi/
  plans/           Generated plans (active, done, archived, reviews)
  reviews/         Code review artifacts
  specs/           Structured specs from define-spec
  todos/           File-based todos tracked in git
docs/
  superpowers/     Plans and specs for the superpowers skill system
README.md
```

### Model tiers

The config defines explicit model tiers in `agent/model-tiers.json`, used throughout the workflow so that skills refer to tiers rather than hard-coding models:

- **capable:** `anthropic/claude-opus-4-6`
- **standard:** `anthropic/claude-sonnet-4-6`
- **cheap:** `anthropic/claude-haiku-4-5`
- **cross-provider capable:** `openai-codex/gpt-5.4`
- **cross-provider standard:** `openai-codex/gpt-5.4`

A `dispatch` map routes providers to CLI targets (`anthropic` → `claude`, `openai-codex` → `pi`).

The default session model is `openai-codex/gpt-5.4`. Google Gemini models (`gemini-3.1-pro-preview`, `gemini-3-flash-preview`) are also enabled but not yet integrated into the tier system.

Cross-provider reviews (e.g., OpenAI reviewing Anthropic-generated code) are used throughout to reduce model bias.

### Installed packages

Three external packages are loaded via `settings.json`:

- **`pi-subagent`** — subagent dispatch infrastructure (local fork at `~/Code/pi-subagent`)
- **`pi-web-access`** — web access tools
- **`pi-token-burden`** — token burden tracking and visibility

## Typical workflow

The skills, extensions, subagents, and artifacts in this repo combine into a repeatable development cycle. A typical end-to-end flow looks like this:

```text
┌─────────────┐     ┌───────────────┐     ┌──────────────┐     ┌──────────────┐
│ Create todo  │────▶│  Refine todo  │────▶│ Define spec  │────▶│ Generate plan│
└─────────────┘     └───────────────┘     │  (optional)  │     └──────┬───────┘
                                          └──────────────┘
                                                 │
                                                 ▼
                                          ┌──────────────┐
                                          │ Review plan   │
                                          │ (cross-prov.) │
                                          └──────┬───────┘
                                                 │
                              ┌──────────────────┘
                              ▼
                     ┌─────────────────┐
                     │  Execute plan   │
                     │  wave by wave   │
                     └────────┬────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │ Task A   │   │ Task B   │   │ Task C   │   ← parallel coder subagents
        └────┬─────┘   └────┬─────┘   └────┬─────┘
             └───────────────┼───────────────┘
                             ▼
                     ┌───────────────┐
                     │ Verify wave   │   ← fresh-context verifier
                     └───────┬───────┘
                             │
                             ▼
                     ┌───────────────┐
                     │ Commit wave   │   ← checkpoint commit
                     │ + run tests   │   ← baseline / deferred / new-regression tracking
                     └───────┬───────┘
                             │
                      (next wave...)
                             │
                             ▼
                     ┌───────────────┐
                     │ Refine code   │   ← review-remediate loop
                     │ (iterative)   │
                     └───────┬───────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │ Review   │  │ Batch &  │  │ Fix      │   ← code-refiner orchestrates
        │ (cross-  │  │ triage   │  │ findings │     code-reviewer + coder
        │  prov.)  │  │ findings │  │          │
        └──────────┘  └──────────┘  └──────────┘
                             │
                      (iterate until
                       clean or budget
                       exhausted)
                             │
                             ▼
                     ┌───────────────┐
                     │  Close todo   │
                     │  Finish branch│
                     └───────────────┘
```

### How it works in practice

1. **Create & refine a todo.** Todos live as markdown files in `.pi/todos/` and are tracked in git. Refinement is collaborative — the agent asks clarifying questions before writing a structured description.

2. **Define a spec (optional).** The `define-spec` skill takes a todo (or freeform description) and interactively explores the codebase, asks clarifying questions, and writes a structured spec to `.pi/specs/`. The spec captures intent, scope, constraints, and acceptance criteria in a format optimized for plan generation. This step is optional — `generate-plan` can work directly from a todo — but produces better plans for complex or ambiguous work.

3. **Generate a plan.** The `generate-plan` skill dispatches the `planner` subagent with a fully assembled prompt (from `generate-plan-prompt.md`), which deeply reads the codebase and writes a structured plan to `.pi/plans/`. The plan contains numbered tasks, file lists, acceptance criteria, dependencies, and per-task model tier recommendations. When a spec exists, it is used as the primary input.

4. **Review the plan.** A `plan-reviewer` subagent checks the plan against the original spec (using `review-plan-prompt.md`) for coverage gaps, dependency errors, sizing issues, and vague acceptance criteria. Errors trigger a surgical plan edit via `edit-plan-prompt.md`; warnings/suggestions are appended as review notes.

5. **Execute in waves.** The `execute-plan` skill decomposes tasks into dependency-ordered waves and dispatches `coder` subagents **in parallel** — up to 8 tasks per wave. Each worker gets a self-contained prompt (filled from `execute-task-prompt.md`) with the task spec, plan context, and TDD instructions. Workers report typed status codes (`DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, `BLOCKED`). Each concern in a `DONE_WITH_CONCERNS` report is classified with one of three typed concern labels — `Type: correctness`, `Type: scope`, or `Type: observation` — so reviewers know immediately what kind of issue is being flagged. After all workers in a wave finish, the orchestrator collects every `DONE_WITH_CONCERNS` report and presents a **combined concerns checkpoint** — listing all concerns together so they can be reviewed, deferred, or resolved before the wave is committed.

6. **Verify and commit each wave.** After the concerns checkpoint, a fresh-context `verifier` subagent re-reads the task outputs and checks them against each task's acceptance criteria — independent of the worker's own self-assessment. Task failures and verifier failures **cannot be skipped**; only tasks that pass verification advance. A checkpoint commit is then made, and integration tests run against a pre-recorded baseline (captured before the first wave). Results are tracked in **three sets**: *baseline failures* (pre-existing, ignored), *deferred failures* (acknowledged, non-blocking), and *new regressions* (block the wave). When new integration failures appear, the orchestrator invokes `Defer integration debugging` — recording the failure with a timestamped note — rather than offering a skip-task option, which has been removed.

7. **Refine code.** After all waves pass, the `refine-code` skill dispatches a `code-refiner` subagent that orchestrates an iterative review-remediate loop. The refiner dispatches `code-reviewer` subagents for cross-provider review, triages and batches findings by severity, dispatches `coder` subagents to fix batched issues, and commits remediation changes. This loop iterates until the review comes back clean or the iteration budget (default 3) is exhausted. Versioned review files are written to `.pi/reviews/`.

8. **Close out.** The plan moves to `.pi/plans/done/`, the linked todo is closed, and the `finishing-a-development-branch` skill offers merge, PR, keep, or discard options.

### Subagent architecture

The workflow uses six specialized subagents, each starting with **fresh context** — no session forking, no shared conversational history. Information flows through **file artifacts**:

- **Todos** (`.pi/todos/`) track lifecycle state
- **Specs** (`.pi/specs/`) carry structured requirements from define-spec to generate-plan
- **Plans** (`.pi/plans/`) carry the task breakdown from generation through execution
- **Prompt templates** (`generate-plan-prompt.md`, `execute-task-prompt.md`, `review-code-prompt.md`, `refine-code-prompt.md`, etc.) are filled per-dispatch with exactly the context each worker needs
- **Reviews** (`.pi/reviews/`) carry versioned review findings and remediation logs
- **Git diffs** carry code changes between review iterations

This is deliberate. Fresh-context subagents are more focused, more independent (reviewers can't be biased by watching generation), more resumable (re-run with the same artifact), and more debuggable (every artifact is a readable file).

### Git isolation

When executing a plan on `main`, the workflow defaults to creating a **git worktree** on a feature branch (guided by the `using-git-worktrees` skill). This keeps the main workspace clean while waves commit incrementally. After execution, the `finishing-a-development-branch` skill handles merge, PR creation, or cleanup.

### Model tier routing

Not every task needs the most capable model. The plan generator assigns per-task model recommendations (`cheap`, `standard`, `capable`), and the executor resolves them against the tiers configured in `agent/model-tiers.json`. The `dispatch` map in the same file routes each provider to its CLI target (e.g., `anthropic` → `claude`, `openai-codex` → `pi`). Reviews use cross-provider models to reduce model bias. The `code-refiner` subagent (`maxSubagentDepth: 1`) itself dispatches reviewers and coders at appropriate tiers.

## Skills

Skills are the largest and most important part of this config. They live in `agent/skills/` and encode structured processes that the agent follows when the user invokes them. Each skill includes a `SKILL.md` and may include prompt templates for subagent dispatch.

### `agent/skills/define-spec/`

Interactive spec writing from a todo or freeform description.

- Resolves input from a todo ID or freeform text
- Checks for and consumes scout briefs when available
- Explores the codebase for informed questioning
- Asks clarifying questions to externalize user intent, scope, constraints, and acceptance criteria
- Writes a structured spec to `.pi/specs/` optimized for generate-plan consumption
- Offers to invoke generate-plan with the resulting spec

**Files:** `SKILL.md`

### `agent/skills/generate-plan/`

Orchestrates plan creation from a todo, spec file, or freeform description.

- Reads the input source (todo body, file contents, or freeform text)
- Dispatches the `planner` subagent with a fully assembled prompt from `generate-plan-prompt.md`
- Dispatches a `plan-reviewer` subagent using `review-plan-prompt.md`
- Handles review findings: errors trigger a surgical plan edit via `edit-plan-prompt.md` (once), warnings/suggestions are appended as review notes
- Reports the plan path and offers to invoke execute-plan with the generated plan

**Files:** `SKILL.md`, `generate-plan-prompt.md`, `review-plan-prompt.md`, `edit-plan-prompt.md`

### `agent/skills/execute-plan/`

Orchestrates multi-wave parallel plan execution with verification, integration testing, commits, and refinement.

- Validates the plan structure
- Presents configurable execution settings (worktree, parallelism, TDD, integration tests, review, commits)
- Builds a dependency graph and groups tasks into waves
- Resolves model tiers from `agent/model-tiers.json`
- Captures a baseline test snapshot before the first wave
- Dispatches `coder` subagents in parallel per wave using filled `execute-task-prompt.md` templates
- Handles worker status codes and retries (up to 3, then escalates)
- Verifies wave output against acceptance criteria
- Commits each wave as a checkpoint, then runs integration tests against baseline (new failures flagged as regressions)
- Invokes `refine-code` for the post-execution review-remediate loop
- Moves completed plans to `done/`, closes linked todos, invokes branch completion

**Files:** `SKILL.md`, `execute-task-prompt.md`

### `agent/skills/refine-code/`

Automated iterative review-remediate cycle. Dispatches a `code-refiner` subagent that drives the inner loop.

- Gathers git range (`BASE_SHA..HEAD_SHA`), description, and optional plan/requirements
- Reads model tiers and resolves dispatch targets
- Dispatches the `code-refiner` with a fully assembled prompt from `refine-code-prompt.md`
- The refiner alternates between cross-provider reviews and batched remediation
- Iterates until the review is clean or the iteration budget is exhausted
- Writes versioned review files to `.pi/reviews/`
- Used standalone or invoked automatically by `execute-plan`

**Files:** `SKILL.md`, `refine-code-prompt.md`, `review-fix-block.md`

### `agent/skills/requesting-code-review/`

Dispatches an independent code reviewer with precisely crafted context.

- Determines the git range to review
- Fills the `review-code-prompt.md` template with what was implemented, the plan/requirements, and the diff range
- Dispatches in fresh context with a capable-tier model
- Categorizes findings by severity (critical, important, minor)

**Files:** `SKILL.md`, `review-code-prompt.md`

### `agent/skills/receiving-code-review/`

Guides how the agent handles incoming review feedback.

- Requires verifying every suggestion against the actual codebase before implementing
- Forbids performative agreement (“Great point!”) — demands technical acknowledgment or reasoned pushback
- Requires clarifying all unclear items before implementing any
- Defines handling for user feedback vs. external reviewer feedback
- Includes a YAGNI check for suggested “professional” features

**Files:** `SKILL.md`

### `agent/skills/commit/`

Structured git commit creation using Conventional Commits format.

- Infers scope, type, and summary from the staged changes
- Respects caller-provided file paths or instructions
- Reviews `git status` and `git diff` before committing
- Asks for clarification on ambiguous files rather than guessing

**Files:** `SKILL.md`

### `agent/skills/test-driven-development/`

Enforces the red-green-refactor cycle for all implementation work.

- No production code without a failing test first
- Code written before a test must be deleted and restarted
- Each cycle: write failing test → verify it fails for the right reason → write minimal code → verify it passes → refactor
- Includes a comprehensive rationalization-prevention table
- Referenced by `execute-plan` which injects a TDD block into every worker prompt when enabled

**Files:** `SKILL.md`

### `agent/skills/systematic-debugging/`

Four-phase debugging process: root cause investigation → pattern analysis → hypothesis testing → implementation.

- Forbids fixes before root cause is identified
- Requires diagnostic instrumentation in multi-component systems before proposing fixes
- Enforces the 3-fix architectural escalation rule: if 3 fixes fail, stop and question the architecture
- Includes supporting technique docs for root-cause tracing, defense-in-depth validation, and condition-based waiting

**Files:** `SKILL.md`, `root-cause-tracing.md`, `defense-in-depth.md`, `condition-based-waiting.md`

### `agent/skills/verification-before-completion/`

Prevents premature success claims.

- No completion claims without fresh verification evidence
- Requires running the actual verification command, reading full output, and confirming it supports the claim
- Blocks optimistic language (“should work”, “looks correct”) without evidence
- Applies to tests, builds, linting, requirements checks, and agent delegation

**Files:** `SKILL.md`

### `agent/skills/using-git-worktrees/`

Guides manual worktree setup for isolated feature work.

- Follows a directory selection priority: existing `.worktrees/` → project config → ask user
- Verifies the worktree directory is git-ignored before creation
- Auto-detects and runs project setup (npm install, cargo build, etc.)
- Captures a baseline test snapshot
- Used by `execute-plan` when starting work on `main`

**Files:** `SKILL.md`

### `agent/skills/finishing-a-development-branch/`

Structured branch completion after implementation is done.

- Verifies tests pass before presenting options
- Offers exactly 4 choices: merge locally, create PR, keep as-is, or discard
- Handles worktree cleanup for merge and discard
- Requires typed confirmation for destructive actions
- Invoked automatically at the end of `execute-plan`

**Files:** `SKILL.md`

### `agent/skills/web-browser/`

CDP-based browser automation for interactive web exploration.

- Remote controls Google Chrome / Chromium via the Chrome DevTools Protocol on `:9222`
- Supports fresh or profile-based sessions (carries over cookies/logins)
- Provides scripts for navigation, clicking, form filling, screenshots, and DOM inspection
- Used when the agent needs to interact with web pages during development

**Files:** `SKILL.md`, `scripts/` (11 JavaScript files + `package.json`)

### `agent/skills/xcode-build/`

Build and run Xcode projects.

- Handles `xcodegen` project generation, `xcodebuild` compilation, and simulator management
- Supports running apps on iOS/macOS simulators or natively
- Provides scripts for generate, build, run, list-simulators, and boot-simulator

**Files:** `SKILL.md`, `scripts/` (5 shell scripts)

## Extensions

Local customizations around the TUI live in `agent/extensions/`.

### `agent/extensions/answer.ts`

Adds an **interactive Q&A flow** for assistant follow-up questions.

- Registers `/answer`
- Also available via `Ctrl+.`
- Extracts unanswered questions from the last assistant message
- Presents a custom TUI for answering them one-by-one
- Submits the compiled answers back into the session

This is useful when the assistant asks several clarifying questions at once and you want a structured way to respond.

### `agent/extensions/context.ts`

Adds a `/context` command that shows a **high-level context overview**.

It surfaces things like:

- approximate context window usage
- system prompt / AGENTS token footprint
- active tools
- loaded extensions
- available skills
- which skills have actually been loaded in the current session
- session token / cost totals

This is mainly a visibility and debugging tool for understanding what pi is carrying in context.

### `agent/extensions/files.ts`

Adds an interactive **file browser / file action picker**.

Main capabilities:

- `/files` command
- quick access to files in the current git tree
- prioritizes dirty files and recently referenced files from the session
- reveal in Finder
- open files normally
- Quick Look on macOS
- open git diff in VS Code
- add a file mention directly to the prompt editor

This extension is aimed at reducing friction when hopping between session-relevant files.

### `agent/extensions/footer.ts`

Replaces the default pi footer with a **more configurable, theme-aware custom footer**.

It shows:

- cwd and branch
- session name
- token and cost stats
- context usage
- current model / provider
- thinking level
- extension status line

It also supports per-theme footer color overrides, which is how the Everblush/Nord/Carbonfox footer styling is implemented.

### `agent/extensions/guardrails.ts`

Pragmatic **safety guardrails** for common unsafe or dubious tool calls.

- Intercepts `bash`, `write`, and `edit` tool calls
- Hard-blocks writes to sensitive paths (`.env`, `.git/config`, `.ssh/`, `node_modules/`, etc.)
- Confirmation-gates dangerous shell commands (`rm -rf`, `sudo`, `git push --force`, `git reset --hard`, etc.)
- Blocks `file://` URLs in browser navigation
- Soft-protects lockfiles and generated artifacts
- Not a security sandbox — meant to catch high-signal mistakes and add friction around risky actions

**Tests:** `guardrails.test.ts`

### `agent/extensions/usage-bar.ts`

Adds `/usage`, a **provider usage dashboard** showing rate limits and status across AI providers.

- Displays usage stats with progress bars for Claude, Copilot, Gemini, and Codex
- Shows provider operational status (outages/incidents)
- Shows reset countdowns for rate-limited windows

### `agent/extensions/session-breakdown.ts`

Adds `/session-breakdown`, an interactive analytics view over `~/.pi/agent/sessions`.

It visualizes the last 7 / 30 / 90 days of usage, including:

- sessions per day
- messages per day
- tokens per day
- cost per day
- model breakdown
- directory breakdown
- weekday breakdown
- time-of-day breakdown

This is more of an introspection / observability tool than a workflow tool.

**Tests:** `session-breakdown.test.ts`

### `agent/extensions/todos.ts`

Implements the local **file-based todo system** used by this setup.

Highlights:

- stores todos in `.pi/todos/`
- exposes a `todo` tool for agents
- supports `list`, `get`, `create`, `update`, `append`, `delete`, `claim`, and `release`
- includes assignment / lock semantics so sessions can claim work
- provides interactive todo management in the TUI
- tracks todo state in plain files that can be committed to git

This is a core piece of the workflow. The intent is to keep task state explicit, inspectable, and versioned.

### `agent/extensions/whimsical.ts`

Tiny quality-of-life extension that randomizes the working message while pi is thinking.

Examples include things like “Baking...”, “Cogitating...”, “Wrangling...”, etc.

Purely cosmetic, but fun.

## Local subagents

This repo includes six local agent definitions in `agent/agents/`. Each operates with fresh context and no shared conversational history.

### `agent/agents/planner.md`

A **read-only planning agent** that deeply analyzes the codebase and writes structured plans to `.pi/plans/`.

- Understands the task from a todo, spec, or freeform prompt
- Reads the relevant codebase deeply rather than doing a superficial tree scan
- Produces a plan with: goal, architecture summary, tech stack, file structure, numbered tasks, dependencies, risk assessment, and optional test command
- Also performs **surgical plan edits** when dispatched with the `edit-plan-prompt` after review findings
- Runs on `claude-opus-4-6` with high thinking

### `agent/agents/coder.md`

A **task execution agent** for carrying out a single task from a structured plan or fixing code based on review findings.

- Assumes **no parent-session context** — expects a fully self-contained task prompt
- Reads listed source files, executes the task, writes output to specified paths
- Reports a structured status: `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, `BLOCKED`
- Runs on `claude-sonnet-4-6` with medium thinking

### `agent/agents/verifier.md`

A **judge-only per-task verification agent** used by `execute-plan` Step 10.

- Reads a task's acceptance criteria (each paired with a `Verify:` recipe) and the orchestrator-provided command evidence, modified files, and diff context
- Has **no shell access** — cannot run commands, only inspects orchestrator-captured output and the files named by each recipe
- Returns per-criterion `PASS`/`FAIL` verdicts and an overall task `VERDICT: PASS` or `VERDICT: FAIL` in a strict report shape the orchestrator parses
- Independent of the worker's own self-assessment, so a `coder` reporting `DONE` still has to clear verification before the wave advances
- Runs with medium thinking

### `agent/agents/code-reviewer.md`

An **independent code reviewer** for production readiness.

- Supports two modes: **full review** (entire diff) and **hybrid re-review** (remediation diff only)
- Checks quality, architecture, testing, and requirements compliance
- Calibrates severity accurately (Critical through Minor)
- Gives a clear verdict: `[Approved]` or `[Issues Found]`
- Runs with high thinking

### `agent/agents/code-refiner.md`

An **orchestrator for the review-remediate loop** (`maxSubagentDepth: 1`).

- Dispatches `code-reviewer` subagents for review passes
- Assesses findings, batches them by file proximity and logical coupling
- Dispatches `coder` subagents to fix batched findings
- Commits remediation changes and tracks iteration budget and convergence
- Writes versioned review files with remediation logs
- Runs on `claude-sonnet-4-6` with medium thinking

### `agent/agents/plan-reviewer.md`

A **plan reviewer** that checks generated plans for structural correctness, spec coverage, and buildability.

- Reviews every task for dependency accuracy, acceptance criteria quality, and sizing
- Gives a clear verdict: `[Approved]` or `[Issues Found]`
- Uses severity levels: Error (blocks execution), Warning, Suggestion
- Runs on `claude-sonnet-4-6` with high thinking

## Themes

Custom themes live in `agent/themes/`.

### `agent/themes/everblush.json`

Everblush-inspired palette with theme-aware footer.

### `agent/themes/carbonfox.json`

Carbonfox variant with theme-aware footer.

### `agent/themes/nord.json`

Nord-inspired theme with theme-aware footer. Currently the active theme.

## What is *not* in this repo

This repo contains the **project-local config**, but not necessarily every part of the full personal pi environment.

In particular, some workflow logic may live outside this repo in:

- globally installed pi packages
- the `pi-subagent` local fork (at `~/Code/pi-subagent`)
- user-level keybindings or context files

## How I think about this config

The overall direction of this setup is:

- keep pi itself minimal
- make the TUI more informative and more interactive where it helps
- support a simple but opinionated workflow
- prefer explicit artifacts (todos, specs, plans, reviews) over hidden state
- use subagents with self-contained prompts rather than shared context
- iterate toward quality with automated review-remediate loops rather than single-pass generation
