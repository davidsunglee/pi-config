# Prevent Workflow `agentScope` Mismatches

Source: TODO-bc0033cc

## Goal

Prevent workflow subagent dispatches from failing because an explicit `agentScope` changes which agent names are visible at runtime. The workflow should remain portable across agent frameworks by relying on default agent resolution rather than hard-coding scope selection in workflow files.

## Context

This repo’s workflow is defined primarily in markdown skill files under `agent/skills/`, with subagent dispatches for roles like `planner`, `coder`, `plan-reviewer`, `code-reviewer`, and `verifier`. The local workflow agent definitions used by this repo live in `agent/agents/`. In the installed `pi-subagent` package (`~/Code/pi-subagent`), omitted `agentScope` defaults to `"user"`, which merges builtin and user agents while excluding project agents. That same package only treats `.pi/agents/` as the project-agent directory; this repo does not currently have a `.pi/agents/` directory. As a result, forcing `agentScope: "project"` can expose builtin names like `planner`, `reviewer`, `scout`, and `worker` instead of the workflow-specific names expected by this repo, causing orchestration failures that would not occur if scope were left unspecified.

## Requirements

- Remove any existing `agentScope` usage from workflow files in scope for this work.
- Workflow files must not specify `agentScope` for subagent dispatches.
- Add an automated static guardrail that scans workflow files and fails when `agentScope` appears anywhere in those files.
- The automated guardrail must cover workflow files only, specifically the workflow skill files and their prompt/template files rather than the whole repo.
- The rule must treat any occurrence of `agentScope` in those workflow files as a violation, including examples or explanatory text.
- The resulting workflow rule must be portable across agent frameworks by encoding “do not specify scope here” rather than framework-specific scope-selection semantics.

## Constraints

- Do not depend on adding more explanatory prose to workflow skills as the primary protection mechanism.
- Do not require project-agent support or project-agent directory layout changes to make standard workflow dispatches succeed.
- Do not rely on framework-specific fallback behavior, preflight discovery, or runtime auto-recovery as the main solution.
- Do not widen the guardrail to unrelated docs, reviews, todos, or other non-workflow files.

## Acceptance Criteria

- No workflow file in scope contains the text `agentScope`.
- An automated check exists that fails if `agentScope` is introduced anywhere in the covered workflow files.
- Standard workflow dispatches no longer depend on explicit scope selection in workflow files.
- The exact failure mode described in TODO-bc0033cc cannot recur solely because a workflow file specified `agentScope: "project"` or any other explicit `agentScope` value.

## Non-Goals

- Investigating or changing why `pi-subagent` project scope resolves `.pi/agents/` instead of `agent/agents/`.
- Moving this repo’s local agents into `.pi/agents/`.
- Adding runtime fallback logic, agent-availability preflight checks, or broader dispatch-behavior changes unless separately requested.
- Banning `agentScope` across the entire repository outside the workflow files covered by this spec.
