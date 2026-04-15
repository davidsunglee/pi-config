# Skill Decomposition and Code Boundary Analysis

Analysis of two architectural questions about the pi-config workflow:

1. Should some workflow logic move from skills (English) into code (TypeScript extensions/tools)?
2. Can the skills be decomposed into reusable/modular parts for maintainability?

## Context

The `generate-plan` and `execute-plan` skills are large workflows defined entirely in English. Execute-plan is ~460 lines of structured instructions across 16 steps. An earlier attempt to move all "non-judgment" logic into a TypeScript extension produced a 20x larger codebase that was more brittle, impossible to evolve, and ultimately worse.

The core tension: code is rigid but correct; English is flexible but lossy.

## Part 1: Code vs. Skills

### Why the full-code approach failed

The boundary between "judgment" and "non-judgment" is blurrier than it looks. Almost every step in execute-plan has a judgment tail — "if the plan has no test command, auto-detect," "if a wave has more than 7 tasks, split it," "if still failing after 3 retries, notify the user and ask." These look mechanical but they're surrounded by ambiguity the LLM handles gracefully and code handles poorly.

An English skill accommodates unexpected states, recovers from partial failures, and makes reasonable judgment calls in edge cases — all for free. A TypeScript orchestrator needs explicit handling for every branch, every error path, every edge case. The 20x size increase wasn't accidental; it's the inherent cost of exhaustive codification.

### What IS purely mechanical

There are operations where the LLM adds no value and can introduce errors:

| Operation | Why it's error-prone in English | Where it appears |
|-----------|-------------------------------|-----------------|
| Model tier resolution | String parsing (extract provider prefix, look up dispatch map) | 4 skills |
| Dependency graph → waves | Topological sort, error-prone on complex graphs | execute-plan Step 5 |
| Template filling | LLM sometimes paraphrases instead of pasting literally | execute-plan Step 8 |
| Baseline test comparison | Diffing failing test names against a stored set | execute-plan Steps 7+11 |

### The recommended middle ground: small helper tools

Keep skills as the orchestration layer. Give them focused helper tools for mechanical operations. Not a monolithic TypeScript orchestrator — a handful of pure functions exposed as tools.

**Proposed tools:**

| Tool | What it does | Replaces in skills |
|------|-------------|-------------------|
| `resolve-tiers` | Reads model-tiers.json, resolves tier name → model string + dispatch target | ~30 lines repeated across execute-plan, generate-plan, refine-code, requesting-code-review |
| `fill-template` | Reads a prompt template file, substitutes named placeholders with provided values, returns the filled string | Template filling instructions in execute-plan Step 8 |
| `build-waves` | Parses a plan's dependency section, returns topologically sorted wave groups | Dependency graph logic in execute-plan Step 5 |
| `test-baseline` | Runs a test command, diffs output against a stored baseline, returns { pass, new_failures[] } | Baseline capture + comparison logic in execute-plan Steps 7+11 |

Estimated implementation: 200-300 lines of TypeScript total. Each tool is a pure function — input in, output out, no orchestration state.

**What stays in skills:** Everything involving judgment, sequencing decisions, user interaction, error interpretation, retry strategy, and the overall flow. The skill decides *when* to dispatch, *what* prompt to fill, *how* to handle failure. The tool handles the *mechanical lookup* or *string operation*.

**The principle:** Skills are the orchestrator. Tools are the calculator. The LLM should never be doing string parsing or topological sorts — but it should always be deciding what to do next.

### What this looks like in practice

Before (execute-plan Step 6, ~30 lines):
```
Read the model matrix from ~/.pi/agent/model-tiers.json...
Map each task's model recommendation to the tier map...
Extract the provider prefix — the substring before the first / ...
Look up the prefix in the dispatch object...
If model-tiers.json has no dispatch key, default to "pi"...
```

After (~3 lines):
```
For each task, resolve its model tier:
  resolve-tiers --tier <task's recommendation> → { model, dispatch }
Use the returned model and dispatch values in the subagent call.
```

The skill is shorter, the operation is correct by construction, and the judgment (which tier to assign, what to do if the tier is missing) stays in the skill.

## Part 2: Skill Decomposition

### What's actually duplicated today

Surveying all skills for repeated patterns:

**Pattern 1: Iterate until clean or budget exhausted**

| Skill | Evaluator | Fixer | Budget | Convergence = |
|-------|-----------|-------|--------|---------------|
| refine-code | code-reviewer | coder | 3 | Review comes back clean |
| generate-plan (review step) | plan-reviewer | planner (edit mode) | 1 | Review approved |
| execute-plan (retry logic) | Acceptance criteria check | Re-dispatch coder | 3 | DONE status |

Same shape: evaluate → decide if done → fix → re-evaluate. Different actors, same discipline.

**Pattern 2: Dispatch with tier resolution**

Used in execute-plan, generate-plan, refine-code, requesting-code-review. Four skills each describe the same algorithm for resolving a model tier string to a concrete model + dispatch target. (This is better handled as a tool — see Part 1.)

**Pattern 3: Structured status protocol**

The DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED protocol is defined in the coder agent and handled in execute-plan. It's referenced implicitly by refine-code (which dispatches coders via code-refiner). Currently defined in one place (coder.md) but the *handling* logic is in execute-plan's Step 9.

**Not duplicated yet (single consumer):**
- Wave construction and execution (only execute-plan)
- Baseline test capture and comparison (only execute-plan)
- Settings confirmation UI pattern (only execute-plan, lighter version in generate-plan)

### Proposed decomposition

#### Extract: `converge` primitive skill

The most impactful extraction. Encodes the evaluate-fix loop discipline as a reusable protocol.

```
skills/
  converge/SKILL.md    ← the loop discipline protocol (mixin, not agent)
```

Contents:
```
## Converge

Protocol for iterating an evaluate-fix cycle until clean or budget exhausted.
Follow this protocol inline — do NOT dispatch a separate agent to run the loop.

Inputs (provided by the calling skill):
- Evaluator: what to dispatch for evaluation (agent + filled prompt)
- Fixer: what to dispatch for remediation (agent + filled prompt template)
- Budget: max iterations (caller-specified)
- Convergence criteria: what "clean" means (caller-defined)
- Commit between iterations: yes/no (caller-specified)

Loop:
1. Dispatch evaluator
2. Parse result against convergence criteria
3. If clean → return { result: "clean", iterations: N }
4. If budget exhausted → return { result: "budget_exhausted", remaining: [...] }
5. Batch findings for the fixer (group by file proximity, logical coupling)
6. Dispatch fixer with findings
7. If commit=yes and changes were made → commit with iteration context
8. Increment iteration counter → go to 1

Rules:
- Never skip evaluation (no "it's probably fine")
- Never exceed budget without returning to the caller for a decision
- Each iteration must either make progress or escalate
- Log each iteration (evaluator result, fixer dispatch, outcome)
```

**Critical implementation detail: converge is a mixin, not an agent.**

The agent that is *already orchestrating* follows the converge protocol inline. It does NOT add a dispatch layer.

Comparison:

**Bad (converge as dispatched agent):**
```
host → converge-agent → code-reviewer + coder
```

This adds a fresh-context subagent tax to every loop. For generate-plan's review step (budget=1), you're paying an entire agent dispatch to run what is essentially an if-statement. For refine-code, you're adding a layer between the host and the code-refiner for no reason.

**Good (converge as inline protocol):**
```
# In refine-code:
host dispatches code-refiner
  code-refiner follows converge protocol:
    dispatch code-reviewer → check → dispatch coder → commit → repeat

# In generate-plan:
host follows converge protocol:
  dispatch plan-reviewer → check → dispatch planner with edit prompt → done

# In execute-plan retries:
host follows converge protocol:
  check acceptance criteria → re-dispatch coder → check → repeat
```

No new agents, no new dispatch layers. The converge skill just provides the loop discipline — the rules about not skipping evaluation, not exceeding budget, requiring progress per iteration. The calling skill (or the agent it already dispatched) follows the protocol.

The risk is that a future maintainer (or model) reads "invoke the converge skill" and interprets it as "dispatch a converge subagent." The skill must be explicit that it's a protocol to follow inline. Using language like "follow the converge protocol" rather than "invoke converge" helps, as does an explicit "do NOT dispatch a separate agent" warning.

#### Standardize: status protocol reference

Extract the DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED protocol into a shared reference that both the coder agent and the handling skills point to.

Currently the protocol is defined in `coder.md` and the handling rules are in execute-plan Step 9. A shared reference (e.g., `agent/protocols/worker-status.md`) would keep these in sync and make it available to any future skill that dispatches coders.

This is lightweight — a reference document, not a skill or tool.

#### Move to tools: tier resolution

As described in Part 1, `resolve-tiers` becomes a tool. Skills replace their English description of the algorithm with a tool call.

### What NOT to extract

- **Wave construction.** Only execute-plan uses it. If a second consumer appears, extract then.
- **Settings confirmation.** Only execute-plan has the full pattern. Too thin to be a standalone skill.
- **Baseline test comparison.** Only execute-plan uses it. Better as a tool (Part 1) than a skill.
- **Git range management.** Used in multiple skills but the operations are too varied (capture SHA, compute range, pass to reviewer) to share meaningfully.

The principle: **extract when you have two real consumers AND the shared pattern is about discipline (doing things you might skip), not just deduplication (saying the same thing twice).** Converge qualifies on both counts. Tier resolution qualifies on correctness grounds (mechanical operation that should be code). Most other patterns don't yet justify extraction.

### Resulting skill architecture

```
skills/
  # Primitives (reusable protocols)
  converge/                        ← iterate evaluate-fix loop discipline (inline protocol, not agent)

  # Workflow skills (compose primitives + tools)
  generate-plan/                   ← gather input → dispatch planner → converge(review, edit, budget=1)
  execute-plan/                    ← validate → build-waves tool → dispatch coders → converge(verify, retry, budget=3) per wave → invoke refine-code
  refine-code/                     ← gather git range → dispatch code-refiner which follows converge(review, fix, budget=N)
  requesting-code-review/          ← one-shot review dispatch (no loop, no converge)

  # Discipline skills (behavioral, invoked by judgment)
  test-driven-development/
  systematic-debugging/
  verification-before-completion/
  receiving-code-review/
  commit/

  # Environment skills (platform/tooling specific)
  using-git-worktrees/
  finishing-a-development-branch/
  web-browser/
  xcode-build/

agent/protocols/
  worker-status.md                 ← DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED protocol

tools (in extensions or pi-subagent):
  resolve-tiers                    ← model-tiers.json lookup
  fill-template                    ← placeholder substitution
  build-waves                      ← dependency → topological sort
  test-baseline                    ← run + diff against baseline
```

### Impact estimate

| Change | Skills affected | Lines saved per skill | Correctness improvement |
|--------|----------------|----------------------|------------------------|
| `converge` extraction | refine-code, generate-plan, execute-plan | 10-20 each (loop rules) | Prevents LLM cutting corners on loop discipline |
| `resolve-tiers` tool | execute-plan, generate-plan, refine-code, requesting-code-review | ~25 each | Eliminates string-parsing errors |
| `worker-status` protocol | execute-plan, coder.md | ~10 (dedup) | Single source of truth |
| `build-waves` tool | execute-plan | ~20 | Correct topological sort |
| `fill-template` tool | execute-plan | ~15 | Literal substitution, no paraphrasing |
| `test-baseline` tool | execute-plan | ~25 | Correct set-diff comparison |

Total: execute-plan drops from ~460 to ~350 lines. Other skills shrink modestly. The mechanical error surface drops significantly. The judgment-heavy orchestration stays in English.
