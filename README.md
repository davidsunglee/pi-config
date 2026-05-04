# pi-config

Personal configuration for [pi](https://github.com/badlogic/pi-mono)'s coding agent.

This repo is the checked-in part of my pi setup: local extensions, local subagents, themes, settings, installed packages, and workflow artifacts such as tracked todos, specs, plans, and reviews. The emphasis is on a more opinionated, workflow-oriented pi environment without forking pi itself.

## What this repo contains

At a high level, this config adds six things on top of stock pi:

1. **Skills** that encode the end-to-end development workflow
2. **Custom extensions** for TUI ergonomics, safety guardrails, and workflow support
3. **Local subagents** for spec design, planning, plan refinement, coding, verifying, reviewing, and refining
4. **Custom themes** including a theme-aware footer
5. **Installed packages** for subagent dispatch, web access, token burden tracking, and Ghostty integration
6. **Tracked workflow state** in `docs/` (todos, specs, plans, reviews)

Repository layout:

```text
agent/
  agents/           Local subagent definitions (8 agents)
  extensions/       Custom pi extensions (TypeScript, with tests)
  skills/           Workflow and discipline skills (15 skills)
  themes/           Custom themes
  AGENTS.md         Project-level agent guidance (operating mode, design, testing)
  model-tiers.json  Model tier definitions and dispatch map
  settings.json     Main pi settings for this setup
  working.json      Working-indicator color/animation config
  package.json      Dev tooling: eslint, typescript, tests
  eslint.config.js
  tsconfig.json
docs/
  designs/          Free-form design notes
  specs/            Structured specs from define-spec (with done/ archive)
  plans/            Generated plans (active, done, reviews)
  reviews/          Code review artifacts
  todos/            File-based todos tracked in git
README.md
```

`.worktrees/` and `agent/{auth.json,run-history.jsonl,sessions,node_modules}` are gitignored.

### Model tiers

Model tiers live in `agent/model-tiers.json` so skills refer to tiers rather than hard-coding model IDs. The current values are:

- **capable:** `anthropic/claude-opus-4-7`
- **standard:** `anthropic/claude-sonnet-4-6`
- **cheap:** `anthropic/claude-haiku-4-5`
- **cross-provider capable:** `openai-codex/gpt-5.5`
- **cross-provider standard:** `openai-codex/gpt-5.5`

A `dispatch` map routes providers to CLI targets (`anthropic` → `claude`, `openai-codex` → `pi`).

The default session model in `agent/settings.json` is `openai-codex/gpt-5.5` at high thinking. The full enabled-model set also includes `openai-codex/gpt-5.4-mini` and Google's `gemini-3.1-pro-preview` / `gemini-3-flash-preview` (the Gemini models are not yet wired into the tier system).

Cross-provider reviews (e.g., OpenAI reviewing Anthropic-generated code) are used throughout to reduce model bias.

### Installed packages

`agent/settings.json` loads four packages:

- **`pi-interactive-subagent`** (local fork at `~/Code/pi-interactive-subagent`) — multi-tool subagent dispatch infrastructure providing `subagent_run_serial` (blocking sequential), `subagent_run_parallel` (blocking parallel), and `subagent` (async).
- **`pi-ghostty`** — Ghostty terminal integration.
- **`pi-token-burden`** — token burden tracking and visibility.
- **`pi-web-access`** — web access tools.

## Typical workflow

Skills, extensions, subagents, and artifacts in this repo combine into a repeatable cycle:

```text
┌─────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ Create todo │──▶│ Refine todo  │──▶│ Define spec  │──▶│ Generate plan│──▶│ Refine plan  │
└─────────────┘   └──────────────┘   │  (optional)  │   └──────┬───────┘   │ (review-edit)│
                                     └──────────────┘          │           └──────┬───────┘
                                                               └──────────────────┘
                                                                        │
                                                                        ▼
                                                              ┌──────────────────┐
                                                              │  Execute plan    │
                                                              │  wave by wave    │
                                                              └─────────┬────────┘
                                                                        │
                                              ┌─────────────────────────┼─────────────────────────┐
                                              ▼                         ▼                         ▼
                                        ┌──────────┐               ┌──────────┐              ┌──────────┐
                                        │ Task A   │               │ Task B   │              │ Task C   │  ← parallel coders
                                        └────┬─────┘               └────┬─────┘              └────┬─────┘
                                             └─────────────────────────┼─────────────────────────┘
                                                                       ▼
                                                              ┌────────────────┐
                                                              │ Verify wave    │  ← fresh-context verifier
                                                              └────────┬───────┘
                                                                       ▼
                                                              ┌────────────────┐
                                                              │ Commit + tests │  ← three-set regression model
                                                              └────────┬───────┘
                                                                       ▼
                                                              ┌────────────────┐
                                                              │ Refine code    │  ← review-remediate loop
                                                              └────────┬───────┘
                                                                       ▼
                                                              ┌────────────────┐
                                                              │ Close todo /   │
                                                              │ Finish branch  │
                                                              └────────────────┘
```

### How it works in practice

1. **Create & refine a todo.** Todos live as markdown files in `docs/todos/` and are tracked in git. Refinement is collaborative — the agent asks clarifying questions before writing a structured description.

2. **Define a spec (optional).** The `define-spec` skill takes a todo, an existing spec under `docs/specs/`, or freeform text. It probes the environment for a multiplexer (cmux, tmux, zellij, wezterm) and either dispatches a `spec-designer` subagent into its own pane for direct user Q&A, or runs the procedure inline if no mux is available. The spec is written to `docs/specs/` and gated on user review before commit.

3. **Generate a plan.** The `generate-plan` skill dispatches the `planner` subagent with a fully assembled prompt (from `generate-plan-prompt.md`). The planner deeply reads the codebase and writes a structured plan to `docs/plans/` containing numbered tasks, file lists, acceptance criteria, dependencies, and per-task model tier recommendations. When a spec exists, it is used as the primary input via path-based handoff (the orchestrator does not embed the full spec into its own context).

4. **Refine the plan.** After generation, `generate-plan` invokes the `refine-plan` skill (also usable standalone), which dispatches a `plan-refiner` subagent. The refiner runs an iterative review-edit loop: dispatch `plan-reviewer`, persist the era-versioned review file under `docs/plans/reviews/`, and dispatch `planner` in surgical-edit mode while the reviewer outcome is `Not approved` due to blocking Critical or Important findings. The skill itself owns the commit gate and writes versioned review artifacts each era.

5. **Execute in waves.** The `execute-plan` skill decomposes tasks into dependency-ordered waves and dispatches `coder` subagents **in parallel**. Each worker receives a self-contained prompt (from `execute-task-prompt.md`) with task spec, plan context, and TDD instructions, and reports a typed status (`DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, `BLOCKED`). After each wave the orchestrator presents a combined wave-level concerns checkpoint so the user can continue, remediate selected tasks, or stop.

6. **Verify and commit each wave.** A fresh-context `verifier` subagent re-reads task outputs and judges them per-criterion against each task's acceptance criteria — independent of the worker's self-assessment, with no shell access of its own. The orchestrator assembles the verifier-visible file set from the union of the task's declared `**Files:**` scope, the worker's self-report, and the observed diff state so a worker cannot narrow its own verification surface. Tasks that fail verification cannot be skipped. A checkpoint commit is then made and integration tests are classified into three sets: *baseline failures* (pre-existing, ignored), *deferred regressions* (plan-introduced, user-deferred), and *new regressions in the current wave* (block the wave). On the final wave the defer option is removed and completion is blocked until every deferred regression is resolved.

7. **Refine code.** After all waves pass, the `refine-code` skill dispatches a `code-refiner` subagent that drives an iterative review-remediate loop: cross-provider `code-reviewer` passes, batched remediation by `coder` subagents, and remediation commits. The loop iterates until the reviewer outcome is `Approved`/`Approved with concerns`, or the iteration budget (default 3) is exhausted with `Not approved` still standing. Versioned review files are written to `docs/reviews/`.

8. **Close out.** The plan moves to `docs/plans/done/`, the linked todo is closed, and the `finishing-a-development-branch` skill offers merge, PR, keep, or discard options.

### Subagent architecture

The workflow uses eight specialized subagents, each starting with **fresh context** — no session forking, no shared conversational history. Information flows through **file artifacts**:

- **Todos** (`docs/todos/`) track lifecycle state.
- **Specs** (`docs/specs/`) carry structured requirements from define-spec to generate-plan.
- **Plans** (`docs/plans/`) carry the task breakdown from generation through execution; `docs/plans/reviews/` carries era-versioned plan-review artifacts.
- **Prompt templates** (`generate-plan-prompt.md`, `review-plan-prompt.md`, `edit-plan-prompt.md`, `refine-plan-prompt.md`, `execute-task-prompt.md`, `verify-task-prompt.md`, `review-code-prompt.md`, `refine-code-prompt.md`, etc.) are filled per-dispatch with exactly the context each worker needs.
- **Reviews** (`docs/reviews/`) carry versioned code-review findings and remediation logs.
- **Git diffs** carry code changes between review iterations.

Fresh-context subagents are deliberately more focused, more independent (reviewers can't be biased by watching generation), more resumable (re-run with the same artifact), and more debuggable (every artifact is a readable file).

Dispatch happens through `pi-interactive-subagent`, which exposes `subagent_run_serial` (blocking sequential), `subagent_run_parallel` (blocking concurrent), and `subagent` (async). pi-config skills currently use only the two blocking tools.

### Git isolation

When executing a plan on `main`, the workflow defaults to creating a **git worktree** on a feature branch (guided by the `using-git-worktrees` skill). This keeps the main workspace clean while waves commit incrementally. After execution, the `finishing-a-development-branch` skill handles merge, PR creation, or cleanup.

### Model tier routing

Not every task needs the most capable model. The plan generator assigns per-task model recommendations (`cheap`, `standard`, `capable`), and the executor resolves them against the tiers configured in `agent/model-tiers.json`. The `dispatch` map in the same file routes each provider to its CLI target (`anthropic` → `claude`, `openai-codex` → `pi`). Reviews use cross-provider tiers to reduce model bias.

## Skills

Skills live in `agent/skills/` and encode reusable operating procedures. Each skill directory now has its own README with details; the table here is intentionally short.

| Skill | Summary |
| --- | --- |
| [`define-spec`](agent/skills/define-spec/README.md) | Interactive spec writing from a todo, existing spec, or freeform request. Uses a mux-backed `spec-designer` pane when available, otherwise runs inline, then gates the resulting `docs/specs/` file on user review and commit. |
| [`generate-plan`](agent/skills/generate-plan/README.md) | Produces an implementation plan in `docs/plans/` from a todo, spec/design document, or freeform text. Dispatches `planner`, uses path-based handoff for large artifacts, then hands off to `refine-plan`. |
| [`refine-plan`](agent/skills/refine-plan/README.md) | Iterative plan review/edit loop. Dispatches `plan-refiner`, writes era-versioned reviews under `docs/plans/reviews/`, validates coverage sources, and owns the plan commit gate. |
| [`execute-plan`](agent/skills/execute-plan/README.md) | Executes structured plans wave by wave with parallel `coder` subagents, fresh-context verification, checkpoint commits, integration-regression tracking, and optional final code refinement. |
| [`refine-code`](agent/skills/refine-code/README.md) | Iterative code review/remediation loop over a git range. Dispatches `code-refiner`, which coordinates reviewers and coders until `approved`/`approved_with_concerns`, or `not_approved_within_budget` when the budget is exhausted. |
| [`requesting-code-review`](agent/skills/requesting-code-review/README.md) | Dispatches an independent `code-reviewer` against an explicit git diff and requirements context. Used before merging or after major work outside `execute-plan`. |
| [`receiving-code-review`](agent/skills/receiving-code-review/README.md) | Rules for handling review feedback: understand it, verify it against the codebase, clarify ambiguity, push back when technically wrong, then implement one item at a time. |
| [`commit`](agent/skills/commit/README.md) | Creates focused Conventional Commits-style git commits. Reviews status/diff, respects caller-provided paths, asks about ambiguity, commits only, and never pushes. |
| [`test-driven-development`](agent/skills/test-driven-development/README.md) | Enforces red-green-refactor for feature work and bug fixes: write a failing test first, implement minimal code, verify green, then refactor. |
| [`systematic-debugging`](agent/skills/systematic-debugging/README.md) | Four-phase debugging discipline: root-cause investigation, pattern analysis, hypothesis testing, then implementation. Includes a three-fix architectural escalation rule. |
| [`verification-before-completion`](agent/skills/verification-before-completion/README.md) | Evidence-before-claims gate. Requires fresh command output or equivalent verification before saying work is complete, passing, fixed, or ready. |
| [`using-git-worktrees`](agent/skills/using-git-worktrees/README.md) | Manual worktree setup with directory selection, gitignore safety checks, project setup autodetection, and baseline test verification. |
| [`finishing-a-development-branch`](agent/skills/finishing-a-development-branch/README.md) | End-of-branch workflow after implementation: verify tests, choose merge/PR/keep/discard, require confirmation for destructive cleanup, and handle worktrees. |
| [`web-browser`](agent/skills/web-browser/README.md) | Chrome/Chromium CDP helpers for navigation, screenshots, DOM evaluation, element picking, cookie dismissal, and console/network inspection. |
| [`xcode-build`](agent/skills/xcode-build/README.md) | XcodeGen, `xcodebuild`, and simulator workflow for generating, building, running, cleaning, and troubleshooting macOS/iOS projects. |

## Extensions

Local TUI customizations live in `agent/extensions/`. Tests are colocated as `*.test.ts` and run via `npm test` (Node's built-in test runner with `--experimental-strip-types`).

### `answer.ts`

Adds an interactive Q&A flow for assistant follow-up questions.

- Registers `/answer` (also bound to `Ctrl+.`).
- Extracts unanswered questions from the last assistant message.
- Presents a TUI for answering them one-by-one and submits the compiled answers back into the session.

### `context.ts`

Adds a `/context` command that surfaces a high-level context overview: approximate context window usage, system prompt / AGENTS token footprint, active tools, loaded extensions, available skills, which skills have actually been loaded in the current session, and session token / cost totals.

### `files.ts`

Adds an interactive file browser / file action picker.

- `/files` command.
- Quick access to files in the current git tree, prioritizing dirty files and recently referenced files from the session.
- Reveal in Finder, open normally, Quick Look (macOS), open git diff in VS Code, or add a file mention to the prompt editor.

### `footer.ts`

Replaces the default pi footer with a more configurable, theme-aware custom footer (cwd, branch, session name, token/cost stats, context usage, model/provider, thinking level, extension status line). Supports per-theme color overrides — that's how the Everblush / Nord / Carbonfox footer styling is implemented.

**Tests:** `footer.test.ts`

### `guardrails.ts`

Pragmatic safety guardrails for common unsafe or dubious tool calls.

- Intercepts `bash`, `write`, and `edit` tool calls.
- Hard-blocks writes to sensitive paths (`.env`, `.git/config`, `.ssh/`, `node_modules/`, etc.).
- Confirmation-gates dangerous shell commands (`rm -rf`, `sudo`, `git push --force`, `git reset --hard`, etc.).
- Blocks `file://` URLs in browser navigation.
- Soft-protects lockfiles and generated artifacts.
- Not a security sandbox — meant to catch high-signal mistakes.

**Tests:** `guardrails.test.ts`, `workflow-agent-scope.test.ts`

### `usage-bar.ts`

Adds `/usage`, a provider usage dashboard showing rate limits and operational status across Claude, Copilot, Gemini, and Codex with progress bars and reset countdowns.

### `session-breakdown.ts`

Adds `/session-breakdown`, an interactive analytics view over `~/.pi/agent/sessions`. Visualizes the last 7 / 30 / 90 days: sessions/messages/tokens/cost per day, model breakdown, directory breakdown, weekday breakdown, time-of-day breakdown.

**Tests:** `session-breakdown.test.ts`

### `todos.ts`

The local file-based todo system.

- Stores todos in `docs/todos/`.
- Exposes a `todo` tool with `list`, `get`, `create`, `update`, `append`, `delete`, `claim`, `release` (with assignment / lock semantics so sessions can claim work).
- Provides interactive todo management in the TUI.
- Tracks state in plain files that can be committed to git.

### `working/`

Working-message and indicator extension (split into `indicator.ts` + `message.ts` under `working/`).

- Randomizes the working message each turn and renders it with an optional shine ("gleam") and rainbow palette while the model is emitting thinking content; falls back to plain when the UI can't render escapes.
- Indicator shape and per-state (active / toolUse / thinking) colors / gleam / rainbow are configured in `agent/working.json`.

**Tests:** `working.test.ts`, `indicator.test.ts`, `message.test.ts`

## Local subagents

Eight local agent definitions live in `agent/agents/`. All run with fresh context, no shared conversational history, with `session-mode: lineage-only`.

### `planner.md`

Read-only planning and surgical-edit agent. Deeply analyzes the codebase and writes structured plans to `docs/plans/`. Also performs surgical plan edits when dispatched with the edit-plan prompt. Tools: `read, grep, find, ls, bash`. Thinking: `xhigh`.

### `plan-reviewer.md`

Reviews generated implementation plans for structural correctness, spec coverage, and buildability. Emits `Approved`, `Approved with concerns`, or `Not approved` in the `**Verdict:**` line and calibrates severities as Critical / Important / Minor. Tools: `read, grep, find, ls, bash`. Thinking: `high`.

### `plan-refiner.md`

Coordinator for one era of the plan review-edit loop. Dispatches `plan-reviewer`, persists the era-versioned review file, parses findings, dispatches `planner` (edit mode) when `Not approved` outcomes have blocking Critical or Important findings, returns a compact STATUS / paths summary. Never commits — `refine-plan` owns the commit gate. Thinking: `medium`.

### `spec-designer.md`

Interactive spec-design subagent. Receives the spec-design procedure as an appended system prompt at dispatch time and conducts the Q&A directly with the user in its own multiplexer pane. Writes the spec to `docs/specs/` and ends its turn with a `SPEC_WRITTEN: <absolute path>` line. Tools: `read, write, grep, find, ls`. Thinking: `xhigh`.

### `coder.md`

Task execution agent for a single task from a structured plan or a fix from review findings. Assumes no parent-session context; expects a fully self-contained task prompt. Reports `DONE` / `DONE_WITH_CONCERNS` / `NEEDS_CONTEXT` / `BLOCKED`. Thinking: `medium`.

### `verifier.md`

Judge-only per-task verifier used by `execute-plan` Step 10. Has no shell access — reads only orchestrator-captured command output and files named by each `Verify:` recipe or listed in the verifier-visible file set. Returns per-criterion `PASS`/`FAIL` and an overall task `VERDICT: PASS` / `VERDICT: FAIL`. Tools: `read, grep, find, ls`. Thinking: `medium`.

### `code-reviewer.md`

Independent code reviewer for production readiness. Two modes: full diff review or hybrid re-review of the remediation diff only. Calibrates severities (Critical / Important / Minor) and returns one of `Approved`, `Approved with concerns`, or `Not approved` in its `**Verdict:**` line inside the `### Outcome` block. Thinking: `high`.

### `code-refiner.md`

Coordinator for the review-remediate loop (`maxSubagentDepth: 1` analogue via lineage-only mode). Dispatches `code-reviewer` and `coder` subagents, batches findings by file proximity / logical coupling, commits remediation changes, tracks iteration budget and convergence, writes versioned review files. Thinking: `medium`.

## Themes

Custom themes in `agent/themes/`:

- `everblush.json` — Everblush-inspired palette with theme-aware footer.
- `carbonfox.json` — Carbonfox variant with theme-aware footer.
- `nord.json` — Nord-inspired theme with theme-aware footer. Currently the active theme (set in `agent/settings.json`).

## Development

Extensions are TypeScript modules consuming the `@mariozechner/pi-coding-agent` API. The `agent/` directory has its own dev tooling:

```bash
cd agent
npm run lint        # eslint over extensions/**
npm run typecheck   # tsc --noEmit
npm run build       # lint + typecheck
npm test            # run all *.test.ts via Node's test runner with --experimental-strip-types
npm run check       # build + test
```

Tests are colocated next to the source they cover.

## Project-level agent guidance

`agent/AGENTS.md` carries operating-mode, software-design, and testing-strategy defaults that yield to explicit user instructions and project-local guidance. Highlights:

- Match scope to the request; ask once before doing the work when scope is unclear.
- Don't split prematurely; avoid shallow wrappers; design interfaces around domain concepts; validate at boundaries.
- Verify observable behavior through public interfaces; avoid mocks for internal collaborators; write a failing regression test first for non-trivial bugs.
- For model/tool resolution, discover matches before dispatch with `pi --list-models` and pass fully-qualified `provider/model` identifiers to subagents.

## What is not in this repo

This repo is the project-local config but not the entire personal pi environment. Some workflow logic lives outside, including:

- globally installed pi packages,
- the `pi-interactive-subagent` local fork at `~/Code/pi-interactive-subagent`,
- user-level keybindings and global context files.

## How I think about this config

The overall direction:

- keep pi itself minimal;
- make the TUI more informative and interactive where it helps;
- support a simple but opinionated workflow;
- prefer explicit artifacts (todos, specs, plans, reviews) over hidden state;
- use subagents with self-contained prompts rather than shared context;
- iterate toward quality with automated review-remediate loops rather than single-pass generation.
