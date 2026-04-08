# pi-config

Personal configuration for [pi](https://github.com/badlogic/pi-mono)'s coding agent.

This repo is the checked-in part of my pi setup: local extensions, local subagents, themes, settings, and workflow artifacts such as tracked todos. The emphasis is on a more opinionated, workflow-oriented pi environment without forking pi itself.

## What this repo contains

At a high level, this config adds five things on top of stock pi:

1. **Skills** that encode the end-to-end development workflow
2. **Custom extensions** for better TUI ergonomics and workflow support
3. **Local subagents** for plan generation and plan execution
4. **Custom themes** including a theme-aware footer
5. **Tracked workflow state** in `.pi/todos/`

Repository layout:

```text
agent/
  agents/        Local subagent definitions
  extensions/    Custom pi extensions
  skills/        Workflow and discipline skills (the bulk of the config)
  themes/        Custom themes
  settings.json  Main pi settings for this setup
.pi/
  todos/         File-based todos tracked in git
README.md
```

### Model tiers

This current config defines explicit model tiers used by the workflow:

- **capable:** `anthropic/claude-opus-4-6`
- **standard:** `anthropic/claude-sonnet-4-6`
- **cheap:** `anthropic/claude-haiku-4-5`
- **cross-provider capable:** `openai-codex/gpt-5.4`
- **cross-provider standard:** `openai-codex/gpt-5.4-mini`

These tier names are important because the plan-generation / execution workflow refers to tiers rather than hard-coding models in every step.

The workflow includes cross-provider reviews to discourage model bias.

## Typical workflow

The skills, extensions, subagents, and artifacts in this repo combine into a repeatable development cycle. A typical end-to-end flow looks like this:

```text
┌─────────────┐     ┌───────────────┐     ┌──────────────┐
│ Create todo  │────▶│  Refine todo  │────▶│ Generate plan│
└─────────────┘     └───────────────┘     └──────┬───────┘
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
        │ Task A   │   │ Task B   │   │ Task C   │   ← parallel subagents
        └────┬─────┘   └────┬─────┘   └────┬─────┘
             └───────────────┼───────────────┘
                             ▼
                     ┌───────────────┐
                     │ Spec check    │   ← per-wave verification
                     │ + integration │
                     │   tests       │
                     └───────┬───────┘
                             │
                             ▼
                     ┌───────────────┐
                     │ Commit wave   │   ← checkpoint commit
                     └───────┬───────┘
                             │
                      (next wave...)
                             │
                             ▼
                     ┌───────────────┐
                     │ Final review  │   ← cross-provider code review
                     │ (full diff)   │
                     └───────┬───────┘
                             │
                             ▼
                     ┌───────────────┐
                     │ Address any   │
                     │ findings      │
                     └───────┬───────┘
                             │
                             ▼
                     ┌───────────────┐
                     │  Close todo   │
                     │  Finish branch│
                     └───────────────┘
```

### How it works in practice

1. **Create & refine a todo.** Todos live as markdown files in `.pi/todos/` and are tracked in git. Refinement is collaborative — the agent asks clarifying questions before writing a structured description.

2. **Generate a plan.** The `generate-plan` skill dispatches the `plan-generator` subagent, which deeply reads the codebase and writes a structured plan to `.pi/plans/`. The plan contains numbered tasks, file lists, acceptance criteria, dependencies, and per-task model tier recommendations.

3. **Review the plan.** A cross-provider reviewer checks the plan against the original spec for coverage gaps, dependency errors, sizing issues, and vague acceptance criteria. Errors block execution; warnings are appended as review notes.

4. **Execute in waves.** The `execute-plan` skill decomposes tasks into dependency-ordered waves and dispatches `plan-executor` subagents **in parallel** — up to 7 tasks per wave. Each worker gets a self-contained prompt (filled from `implementer-prompt.md`) with the task spec, plan context, and TDD instructions. Workers report structured status codes (`DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, `BLOCKED`).

5. **Verify each wave.** After a wave completes, the orchestrator verifies outputs against acceptance criteria, then dispatches **parallel spec reviews** (from `spec-reviewer.md`) to independently confirm compliance. Integration tests run against a pre-recorded baseline. A checkpoint commit is made per wave.

6. **Final code review.** After all waves pass, a cross-provider review covers the full git diff (from `code-reviewer.md`). Critical/important issues are presented for resolution before completion.

7. **Close out.** The plan moves to `.pi/plans/done/`, the linked todo is closed, and the `finishing-a-development-branch` skill offers merge, PR, keep, or discard options.

### Subagent architecture

Every subagent in the workflow starts with **fresh context** — no session forking, no shared conversational history. Information flows through **file artifacts**:

- **Plans** (`.pi/plans/`) carry the spec from generation through execution
- **Prompt templates** (`implementer-prompt.md`, `spec-reviewer.md`, `code-reviewer.md`, `plan-reviewer.md`) are filled per-dispatch with exactly the context each worker needs
- **Git diffs** carry code changes to the final reviewer
- **Todos** (`.pi/todos/`) track lifecycle state

This is deliberate. Fresh-context subagents are more focused, more independent (reviewers can't be biased by watching generation), more resumable (re-run with the same artifact), and more debuggable (every artifact is a readable file).

### Git isolation

When executing a plan on `main`, the workflow defaults to creating a **git worktree** on a feature branch (guided by the `using-git-worktrees` skill). This keeps the main workspace clean while waves commit incrementally. After execution, the `finishing-a-development-branch` skill handles merge, PR creation, or cleanup.

### Model tier routing

Not every task needs the most capable model. The plan generator assigns per-task model recommendations (`cheap`, `standard`, `capable`), and the executor resolves them against the configured `modelTiers` in `settings.json`. Reviews use cross-provider models (e.g., OpenAI reviewing Anthropic-generated code) to reduce model bias.

## Skills

Skills are the largest and most important part of this config. They live in `agent/skills/` and encode structured processes that the agent follows when the user invokes them. Each skill includes a `SKILL.md` and may include prompt templates for subagent dispatch.

### `agent/skills/generate-plan/`

Orchestrates plan creation from a todo, spec file, or freeform description.

- Reads the input source (todo body, file contents, or freeform text)
- Dispatches the `plan-generator` subagent with a fully assembled prompt
- Dispatches a **cross-provider plan review** using `plan-reviewer.md`
- Handles review findings: errors trigger re-generation (once), warnings/suggestions are appended as review notes
- Reports the plan path and suggests execution

**Files:** `SKILL.md`, `plan-reviewer.md`

### `agent/skills/execute-plan/`

The most complex skill. Orchestrates multi-wave parallel plan execution with verification, testing, commits, and review.

- Validates the plan structure
- Presents configurable execution settings (worktree, parallelism, TDD, review, spec check, commits, integration tests)
- Builds a dependency graph and groups tasks into waves
- Resolves model tiers from `settings.json`
- Captures a baseline test snapshot
- Dispatches workers in parallel per wave using filled `implementer-prompt.md` templates
- Handles worker status codes and retries (up to 3, then escalates)
- Runs per-wave spec compliance reviews using `spec-reviewer.md`
- Commits each wave as a checkpoint
- Runs integration tests after each wave, comparing against baseline
- Dispatches a cross-provider final code review using `code-reviewer.md`
- Moves completed plans to `done/`, closes linked todos, invokes branch completion

**Files:** `SKILL.md`, `implementer-prompt.md`, `spec-reviewer.md`

### `agent/skills/requesting-code-review/`

Dispatches an independent code reviewer with precisely crafted context.

- Determines the git range to review
- Fills the `code-reviewer.md` template with what was implemented, the plan/requirements, and the diff range
- Dispatches in fresh context with a capable-tier model
- Categorizes findings by severity (critical, important, minor)
- Used both standalone and as the final review step in `execute-plan`

**Files:** `SKILL.md`, `code-reviewer.md`

### `agent/skills/receiving-code-review/`

Guides how the agent handles incoming review feedback.

- Requires verifying every suggestion against the actual codebase before implementing
- Forbids performative agreement ("Great point!") — demands technical acknowledgment or reasoned pushback
- Requires clarifying all unclear items before implementing any
- Defines handling for user feedback vs. external reviewer feedback
- Includes a YAGNI check for suggested "professional" features

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
- Blocks optimistic language ("should work", "looks correct") without evidence
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

This repo currently includes two local agent definitions in `agent/agents/`.

### `agent/agents/plan-generator.md`

A **read-only planning agent** that deeply analyzes the codebase and writes structured plans to `.pi/plans/`.

Its responsibilities include:

- understanding the task from a todo, spec, or freeform prompt
- reading the relevant codebase deeply rather than doing a superficial tree scan
- producing a plan with:
  - goal
  - architecture summary
  - tech stack
  - file structure
  - numbered tasks
  - dependencies
  - risk assessment
  - optional test command

This agent is designed to produce self-contained implementation plans for later execution.

### `agent/agents/plan-executor.md`

A **task execution agent** for carrying out one task from a structured plan.

Its key properties:

- assumes **no parent-session context**
- expects a fully self-contained task prompt
- reads listed source files
- executes only the requested task
- reports a structured status:
  - `STATUS: DONE`
  - `STATUS: DONE_WITH_CONCERNS`
  - `STATUS: NEEDS_CONTEXT`
  - `STATUS: BLOCKED`

This is the worker used by higher-level planning/execution workflows.

## Themes

Custom themes live in `agent/themes/`.

### `agent/themes/everblush.json`

Everblush-inspired palette with theme-aware footer.

### `agent/themes/carbonfox.json`

Carbonfox variant with theme-aware footer.

### `agent/themes/nord-dark.json`

Nord-inspired dark theme with theme-aware footer.

## What is *not* in this repo

This repo contains the **project-local config**, but not necessarily every part of the full personal pi environment.

In particular, some workflow logic may live outside this repo in user-level pi directories such as:

- globally installed pi packages
- user-level keybindings or context files

## How I think about this config

The overall direction of this setup is:

- keep pi itself minimal
- make the TUI more informative and more interactive where it helps
- support a simple but opinionated workflow
- prefer explicit artifacts (todos, plans, reviews) over hidden state
- use subagents with self-contained prompts rather than shared context
