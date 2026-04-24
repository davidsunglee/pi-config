# Migrate Skills to pi-interactive-subagent Extension

**Source:** TODO-b81313c6
**Spec:** `.pi/specs/2026-04-24-pi-interactive-subagent-cutover.md`

## Goal

Atomically cut pi-config's orchestration surface from the `pi-subagent` extension over to `pi-interactive-subagent`, preserving today's blocking semantics exactly. Every skill dispatch site, the `agent/settings.json` packages entry, and `README.md` prose move together, so that after the cutover no file under `agent/` or `README.md` references the old extension or its single-tool parameter shapes.

## Architecture summary

The old `pi-subagent` extension registered a single `subagent` tool with overloaded shapes: single-mode `{ agent, task }`, parallel `{ tasks: [...] }`, and chain `{ chain: [...] }`. `pi-interactive-subagent` replaces that with three distinct tools:

- `subagent_run_serial { tasks: [{ name, agent, task, model, cli }, ...] }` — blocks by default, sequential with `{previous}` substitution, returns one result per step.
- `subagent_run_parallel { tasks: [{ name, agent, task, model, cli }, ...] }` — blocks by default, concurrent, default `maxConcurrency=4`, hard cap `MAX_PARALLEL_HARD_CAP=8`.
- `subagent` — async/non-blocking (NOT used at any migrated call site in this landing).

Every blocking single-mode call in pi-config becomes `subagent_run_serial` with a one-element `tasks` array; every blocking parallel wave becomes `subagent_run_parallel`. The per-call routing argument is renamed `dispatch:` → `cli:`. The `dispatch` MAP in `agent/model-tiers.json` keeps its key name and value semantics — only the per-call argument name changes. Callers now read `results[0].finalMessage` where they previously consumed a top-level result.

Both extensions register a tool literally named `subagent` and therefore cannot be dual-loaded; the `packages` swap in `agent/settings.json` lands in the same branch as the call-site edits. The whole migration must land as a revertable unit.

## Tech stack

- Markdown skill files (`agent/skills/**/*.md`)
- JSON config (`agent/settings.json`, `agent/model-tiers.json`)
- Markdown prose (`README.md`)
- No code (TypeScript) changes
- Verification via `ripgrep`

## File Structure

- `agent/skills/execute-plan/SKILL.md` (Modify) — Rewrite Step 6 dispatch-resolution wording, Step 8 parallel + sequential dispatch code blocks, and prose references in Step 5 / Step 10 §2 / Step 11.2 so the file uses the new tool names, `cli:` per-call argument, and `MAX_PARALLEL_HARD_CAP`.
- `agent/skills/generate-plan/SKILL.md` (Modify) — Rewrite the three single-mode `subagent { agent, task, ... }` dispatches (Step 3 planner, Step 4.1 plan-reviewer, Step 4.3 planner edit-mode) as `subagent_run_serial { tasks: [...] }` with `cli:`.
- `agent/skills/refine-code/SKILL.md` (Modify) — Rewrite the single-mode `code-refiner` dispatch as `subagent_run_serial`.
- `agent/skills/refine-code/refine-code-prompt.md` (Modify) — Rewrite the two single-mode dispatches inside the refiner prompt template (reviewer, coder) as `subagent_run_serial`.
- `agent/skills/requesting-code-review/SKILL.md` (Modify) — Rewrite the single-mode `code-reviewer` dispatch as `subagent_run_serial`.
- `agent/skills/using-git-worktrees/SKILL.md` (Modify) — Delete the stale `worktree:true` mentions in the frontmatter `description` and the Integration section.
- `agent/settings.json` (Modify) — Swap the `packages` entry `~/Code/pi-subagent` → `~/Code/pi-interactive-subagent`.
- `README.md` (Modify) — Update "Installed packages" and "Subagent architecture" prose so package name and tool-surface descriptions match the new extension. The six-agent inventory, workflow diagram, and file-artifact discussion stay as-is.
- `agent/model-tiers.json` (No change) — The `dispatch` map key and its string values (`"pi"`, `"claude"`) are preserved.
- `agent/agents/*.md` (No change) — No agent frontmatter gains a `cli:` or `dispatch:` field; per-call routing stays the single source of truth.

## Tasks

### Task 1: Migrate `agent/skills/execute-plan/SKILL.md`

**Files:**
- Modify: `agent/skills/execute-plan/SKILL.md`

**Steps:**
- [ ] **Step 1: Re-read the current Step 6 "Dispatch resolution" block** — open the file around the "### Dispatch resolution" heading and confirm the three-item list plus the two trailing "Always pass `dispatch` explicitly…" paragraph. Rewrite item 3 so it reads: `Use the mapped value as the cli property in the subagent orchestration call (subagent_run_serial or subagent_run_parallel)`. Rewrite the trailing sentence to: `Always pass cli explicitly on every orchestration call, even when it resolves to "pi".` Keep the "`dispatch` map" / "`dispatch` object" references in items 1–2 unchanged — that is the model-tiers.json map name and stays.
- [ ] **Step 2: Rewrite Step 8 parallel-wave code block** (currently at line ~324, starting `subagent { tasks: [`) to:
  ```
  subagent_run_parallel { tasks: [
    { name: "<task-N>: <task-title>", agent: "coder", task: "<self-contained prompt>", model: "<resolved>", cli: "<resolved>" },
    { name: "<task-N>: <task-title>", agent: "coder", task: "<self-contained prompt>", model: "<resolved>", cli: "<resolved>" },
    ...
  ]}
  ```
  Do NOT add a `maxConcurrency` field (skills inherit the extension default).
- [ ] **Step 3: Rewrite Step 8 sequential-mode code block** (currently at line ~333, `subagent { agent: "coder", ... }`) to:
  ```
  subagent_run_serial { tasks: [
    { name: "coder", agent: "coder", task: "<self-contained prompt>", model: "<resolved>", cli: "<resolved>" }
  ]}
  ```
  Leave the prose sentence just above ("For sequential mode, dispatch one task at a time:") as-is — the loop is what makes it sequential, the single-element serial call is the unit inside the loop.
- [ ] **Step 4: Update the Step 8 prose that consumes worker output** — search for any sentence describing how the orchestrator reads the worker's result (look for phrases like "worker report", "returned result", "worker response"). Add/rewrite one sentence so it reads: "Read `results[0].finalMessage` from the orchestration result to get the worker's report; `subagent_run_parallel` returns results in input-task order so `results[i].finalMessage` corresponds to `tasks[i]`." Place this in Step 8 after the dispatch blocks. If a similar sentence already exists, just rename its fields to match.
- [ ] **Step 5: Update Step 5's MAX_PARALLEL cross-reference.** In the sentence starting "If a wave has more than 8 tasks, split it into sequential sub-waves…", replace `pi-subagent extension's MAX_PARALLEL_TASKS (see /Users/david/Code/pi-subagent/index.ts)` with `pi-interactive-subagent extension's MAX_PARALLEL_HARD_CAP = 8 (see ~/Code/pi-interactive-subagent/pi-extension/orchestration/types.ts)`. Reframe the whole paragraph so the ≤8-tasks-per-wave split rule is presented as a pi-config wave-planning convention that keeps one wave at or below the extension's in-flight hard cap even if `maxConcurrency` climbs to that ceiling later. Keep the "do not exceed it" warning.
- [ ] **Step 6: Update Step 10 §2 prose** — in the `(s) Split into sub-tasks` paragraph, rewrite `bounded by the pi-subagent MAX_PARALLEL_TASKS cap` to `bounded by the pi-interactive-subagent MAX_PARALLEL_HARD_CAP cap`. A few paragraphs below, in the "After collecting a non-stop intervention…" sentence, rewrite `in parallel, subject to MAX_PARALLEL_TASKS` to `in parallel, subject to MAX_PARALLEL_HARD_CAP`.
- [ ] **Step 7: Update Step 11.2 prose** — in the sentence beginning "Verifier dispatches for the wave run in parallel, bounded by …", rewrite `pi-subagent MAX_PARALLEL_TASKS` to `pi-interactive-subagent MAX_PARALLEL_HARD_CAP`. In the sentence beginning "Dispatch the subagent with `agent: "verifier"`…", rewrite it to: `Dispatch the verifier wave as subagent_run_parallel { tasks: [{ name: "<task-N>: <task-title>", agent: "verifier", task: "<filled verify-task-prompt.md>", model: "<resolved>", cli: "<resolved>" }, ...] } — using the Step 6 model-tier resolution to map standard/capable to the concrete model and cli strings.` Remove any trailing references to "dispatch strings" as output of Step 6; the Step 6 output is now "cli strings".
- [ ] **Step 8: Update Step 12 "Debugger-first flow" prose** — the "Dispatch a single debugging pass using the `coder` agent with a prompt that follows the `systematic-debugging` skill" paragraph. If it names a concrete dispatch shape, rewrite to `subagent_run_serial { tasks: [{ name: "debugger", agent: "coder", task: "<debugging-prompt>", model: "<resolved>", cli: "<resolved>" }] }`. If it stays abstract and just says "dispatch a coder", add a parenthetical reference: `(using subagent_run_serial per Step 8)`.
- [ ] **Step 9: Final scan for stragglers.** Run `rg -n "pi-subagent|MAX_PARALLEL_TASKS|\bdispatch:\s*\"" agent/skills/execute-plan/SKILL.md` and confirm every match has been rewritten per the new convention. Run `rg -n "subagent\s*\{[^_]" agent/skills/execute-plan/SKILL.md` (old single-tool call shape — word boundary + `{` without `_`) and confirm zero matches.

**Acceptance criteria:**

- No old single-tool `subagent { ... }` call shape survives in the file.
  Verify: `rg -n "\bsubagent\s+\{" agent/skills/execute-plan/SKILL.md` returns zero matches.
- No `pi-subagent` substring survives in the file.
  Verify: `rg -n "pi-subagent" agent/skills/execute-plan/SKILL.md` returns zero matches.
- No `MAX_PARALLEL_TASKS` identifier survives; `MAX_PARALLEL_HARD_CAP` appears instead.
  Verify: `rg -n "MAX_PARALLEL_TASKS" agent/skills/execute-plan/SKILL.md` returns zero matches AND `rg -n "MAX_PARALLEL_HARD_CAP" agent/skills/execute-plan/SKILL.md` returns at least three matches (Step 5, Step 10 §2, Step 11.2).
- No per-call `dispatch:` argument survives in any code block.
  Verify: `rg -n "\bdispatch:\s*\"" agent/skills/execute-plan/SKILL.md` returns zero matches.
- New orchestration tool names appear in Step 8 code blocks.
  Verify: `rg -n "subagent_run_parallel \{ tasks:" agent/skills/execute-plan/SKILL.md` returns at least one match AND `rg -n "subagent_run_serial \{ tasks:" agent/skills/execute-plan/SKILL.md` returns at least one match, both inside the Step 8 section.
- No `maxConcurrency` field is introduced at any call site.
  Verify: `rg -n "maxConcurrency" agent/skills/execute-plan/SKILL.md` returns zero matches.

**Model recommendation:** standard

---

### Task 2: Migrate `agent/skills/generate-plan/SKILL.md`

**Files:**
- Modify: `agent/skills/generate-plan/SKILL.md`

**Steps:**
- [ ] **Step 1: Rewrite Step 3.3 planner dispatch** (currently at line ~99, `subagent { agent: "planner", task: "<filled template>", model: "<capable from model-tiers.json>", dispatch: "<dispatch for capable>" }`) to:
  ```
  subagent_run_serial { tasks: [
    { name: "planner", agent: "planner", task: "<filled template>", model: "<capable from model-tiers.json>", cli: "<dispatch for capable>" }
  ]}
  ```
  Add one sentence immediately after the code block: `Read the planner's output from results[0].finalMessage — the planner writes the plan to disk; this result is the return message.`
- [ ] **Step 2: Rewrite Step 4.1 plan-reviewer dispatch** (currently at line ~131, multi-line `subagent { agent: "plan-reviewer", ... dispatch: "<dispatch for crossProvider.capable>" }`) to:
  ```
  subagent_run_serial { tasks: [
    {
      name: "plan-reviewer",
      agent: "plan-reviewer",
      task: "<filled review-plan-prompt.md>",
      model: "<crossProvider.capable from model-tiers.json>",
      cli: "<dispatch for crossProvider.capable>"
    }
  ]}
  ```
  Preserve the surrounding prose about fallback to `capable` on cross-provider dispatch failure. When re-resolving on fallback, the replacement `cli:` value is derived from the same `dispatch` map in `model-tiers.json`.
- [ ] **Step 3: Rewrite Step 4.3 planner edit dispatch** (currently at line ~192, `subagent { agent: "planner", task: "<filled edit-plan-prompt.md>", model: "<capable from model-tiers.json>", dispatch: "<dispatch for capable>" }`) to:
  ```
  subagent_run_serial { tasks: [
    { name: "planner", agent: "planner", task: "<filled edit-plan-prompt.md>", model: "<capable from model-tiers.json>", cli: "<dispatch for capable>" }
  ]}
  ```
- [ ] **Step 4: Update prose about `dispatch` resolution.** The Step 2 "Dispatch resolution" sub-section currently says `extract the provider prefix … look it up in dispatch, default to "pi" if absent` — this describes the map lookup and stays unchanged. Below that, any sentence phrased as "pass the result as `dispatch:` in the subagent call" must become "pass the result as `cli:` in the subagent orchestration call". Search the file for `as dispatch:` and `pass dispatch` and fix every match.
- [ ] **Step 5: Final scan.** Run `rg -n "\bsubagent\s+\{|\bdispatch:\s*\"|pi-subagent" agent/skills/generate-plan/SKILL.md` and confirm every remaining match is inside a prose reference to the `dispatch` MAP in `model-tiers.json`, NOT a per-call argument or an old-tool call shape.

**Acceptance criteria:**

- No old single-tool `subagent { ... }` call shape survives in the file.
  Verify: `rg -n "\bsubagent\s+\{" agent/skills/generate-plan/SKILL.md` returns zero matches.
- No per-call `dispatch:` argument survives in any code block.
  Verify: `rg -n "\bdispatch:\s*\"" agent/skills/generate-plan/SKILL.md` returns zero matches.
- The three single-mode dispatches are each rendered as `subagent_run_serial { tasks: [...] }` with a `name` and a `cli` field.
  Verify: `rg -n "subagent_run_serial \{ tasks:" agent/skills/generate-plan/SKILL.md` returns exactly three matches (Step 3, Step 4.1, Step 4.3).
- No `pi-subagent` substring survives in the file.
  Verify: `rg -n "pi-subagent" agent/skills/generate-plan/SKILL.md` returns zero matches.

**Model recommendation:** standard

---

### Task 3: Migrate `agent/skills/refine-code/SKILL.md` + `refine-code-prompt.md`

**Files:**
- Modify: `agent/skills/refine-code/SKILL.md`
- Modify: `agent/skills/refine-code/refine-code-prompt.md`

**Steps:**
- [ ] **Step 1: Rewrite `SKILL.md`'s code-refiner dispatch** (currently at line ~64, single-mode `subagent { ... dispatch: "<dispatch for standard>" }`) to:
  ```
  subagent_run_serial { tasks: [
    { name: "code-refiner", agent: "code-refiner", task: "<filled refine-code-prompt.md>", model: "<standard from model-tiers.json>", cli: "<dispatch for standard>" }
  ]}
  ```
  Preserve surrounding prose about the refiner's role.
- [ ] **Step 2: Rewrite `refine-code-prompt.md`'s reviewer dispatch** (currently at line ~62, `subagent { ... dispatch: "<dispatch for crossProvider.capable>" }`) to:
  ```
  subagent_run_serial { tasks: [
    { name: "code-reviewer", agent: "code-reviewer", task: "<filled review-code-prompt.md>", model: "<crossProvider.capable from model-tiers.json>", cli: "<dispatch for crossProvider.capable>" }
  ]}
  ```
  Preserve the exact placeholder names that the refiner prompt expects.
- [ ] **Step 3: Rewrite `refine-code-prompt.md`'s coder dispatch** (currently at line ~84, `subagent { ... dispatch: "<dispatch for capable>" }`) to:
  ```
  subagent_run_serial { tasks: [
    { name: "coder", agent: "coder", task: "<filled remediation prompt>", model: "<capable from model-tiers.json>", cli: "<dispatch for capable>" }
  ]}
  ```
- [ ] **Step 4: Update result-consumption wording.** Wherever either file instructs the caller to read the subagent's return message, change the reference from a top-level result to `results[0].finalMessage`. Search `refine-code/SKILL.md` and `refine-code/refine-code-prompt.md` for the string "result" or "return" and update only sentences that describe consuming the dispatched tool's output; do NOT touch prose about review findings, review files, or git diffs.
- [ ] **Step 5: Final scan.** Run `rg -n "\bsubagent\s+\{|\bdispatch:\s*\"|pi-subagent" agent/skills/refine-code/` and confirm zero matches.

**Acceptance criteria:**

- No old single-tool `subagent { ... }` call shape survives in either file.
  Verify: `rg -n "\bsubagent\s+\{" agent/skills/refine-code/` returns zero matches.
- No per-call `dispatch:` argument survives in either file.
  Verify: `rg -n "\bdispatch:\s*\"" agent/skills/refine-code/` returns zero matches.
- All three single-mode dispatches are rendered as `subagent_run_serial { tasks: [...] }` with `name` and `cli` fields.
  Verify: `rg -n "subagent_run_serial \{ tasks:" agent/skills/refine-code/` returns exactly three matches across the two files combined.
- No `pi-subagent` substring survives in either file.
  Verify: `rg -n "pi-subagent" agent/skills/refine-code/` returns zero matches.

**Model recommendation:** standard

---

### Task 4: Migrate `agent/skills/requesting-code-review/SKILL.md`

**Files:**
- Modify: `agent/skills/requesting-code-review/SKILL.md`

**Steps:**
- [ ] **Step 1: Rewrite the single code-reviewer dispatch** (currently at line ~55, `subagent { agent: "code-reviewer", ... dispatch: "<dispatch for capable>" }`) to:
  ```
  subagent_run_serial { tasks: [
    { name: "code-reviewer", agent: "code-reviewer", task: "<filled review-code-prompt.md>", model: "<capable from model-tiers.json>", cli: "<dispatch for capable>" }
  ]}
  ```
- [ ] **Step 2: Update result-consumption prose.** If the skill instructs the caller to parse the reviewer's output for `[Approved]` / `[Issues Found]`, rewrite any sentence that refers to "the top-level result" or similar to refer to `results[0].finalMessage`.
- [ ] **Step 3: Final scan.** Run `rg -n "\bsubagent\s+\{|\bdispatch:\s*\"|pi-subagent" agent/skills/requesting-code-review/SKILL.md` and confirm zero matches.

**Acceptance criteria:**

- No old single-tool `subagent { ... }` call shape survives in the file.
  Verify: `rg -n "\bsubagent\s+\{" agent/skills/requesting-code-review/SKILL.md` returns zero matches.
- No per-call `dispatch:` argument survives in the file.
  Verify: `rg -n "\bdispatch:\s*\"" agent/skills/requesting-code-review/SKILL.md` returns zero matches.
- The one single-mode dispatch is rendered as `subagent_run_serial { tasks: [...] }` with `name` and `cli` fields.
  Verify: `rg -n "subagent_run_serial \{ tasks:" agent/skills/requesting-code-review/SKILL.md` returns exactly one match.
- No `pi-subagent` substring survives in the file.
  Verify: `rg -n "pi-subagent" agent/skills/requesting-code-review/SKILL.md` returns zero matches.

**Model recommendation:** standard

---

### Task 5: Remove stale `worktree:true` references from `using-git-worktrees`

**Files:**
- Modify: `agent/skills/using-git-worktrees/SKILL.md`

**Steps:**
- [ ] **Step 1: Edit the frontmatter `description`** (line 3). Replace the trailing sentence `For automated parallel execution, use pi's built-in worktree:true subagent dispatch instead.` with nothing — the `description` ends after the prior sentence. Preserve the leading descriptive clauses about manual worktree setup, directory selection, safety verification, project setup, and baseline test verification.
- [ ] **Step 2: Edit the Integration section** (the sentence at line ~203 beginning `For automated parallel task execution, use pi's built-in worktree: true`). Delete the entire sentence. If that leaves a dangling paragraph, merge the remaining text cleanly; if the sentence is a whole paragraph, delete the paragraph and collapse adjacent blank lines to a single blank line.
- [ ] **Step 3: Final scan.** Run `rg -n "worktree:\s*true|worktree: true" agent/skills/using-git-worktrees/SKILL.md` and confirm zero matches.

**Acceptance criteria:**

- Neither the frontmatter `description` nor the Integration section references `worktree:true` / `worktree: true`.
  Verify: `rg -n "worktree:\s*true|worktree: true" agent/skills/using-git-worktrees/SKILL.md` returns zero matches.
- The frontmatter `description` no longer contains `subagent dispatch`.
  Verify: `rg -n "subagent dispatch" agent/skills/using-git-worktrees/SKILL.md` returns zero matches.
- The frontmatter still begins with a valid YAML block and the non-deleted descriptive clauses remain intact.
  Verify: open `agent/skills/using-git-worktrees/SKILL.md` and confirm the first three lines form a YAML frontmatter delimited by `---`, with a `description:` key whose value still mentions "manual worktree setup" or equivalent.

**Model recommendation:** cheap

---

### Task 6: Update `README.md` prose for the new extension

**Files:**
- Modify: `README.md`

**Steps:**
- [ ] **Step 1: Update "Installed packages" list** (the bulleted list around line 56). Replace the `pi-subagent` bullet at line 58 (`**pi-subagent** — subagent dispatch infrastructure (local fork at ~/Code/pi-subagent)`) with:
  ```
  - **`pi-interactive-subagent`** — multi-tool subagent dispatch infrastructure, providing `subagent_run_serial` (blocking sequential), `subagent_run_parallel` (blocking parallel, default `maxConcurrency=4`, hard cap 8), and `subagent` (async) (local fork at `~/Code/pi-interactive-subagent`)
  ```
  Leave the other two bullets (`pi-web-access`, `pi-token-burden`) unchanged.
- [ ] **Step 2: Update the "Subagent architecture" section** (the heading appears around line 148, with prose listing the six-agent fresh-context model). Keep the six-agent inventory, the workflow diagram, and the file-artifact discussion (`Todos`, `Specs`, `Plans`, etc.). Update only the tool-surface prose: if any sentence describes the subagent tool shape (e.g., "a single `subagent` tool", "`subagent { tasks: [...] }`"), rewrite it to reflect the new three-tool surface. If no such sentence exists today, add one short paragraph below the intro that reads: `Dispatch happens through the pi-interactive-subagent extension, which exposes subagent_run_serial (blocking sequential), subagent_run_parallel (blocking concurrent), and subagent (async). pi-config skills use only the two blocking tools; async is reserved for future work.`
- [ ] **Step 3: Update the "What is *not* in this repo" section** (around line 556). Replace `the pi-subagent local fork (at ~/Code/pi-subagent)` with `the pi-interactive-subagent local fork (at ~/Code/pi-interactive-subagent)`.
- [ ] **Step 4: Scan the rest of the file for stragglers.** Run `rg -n "pi-subagent" README.md` and confirm zero matches. If any remain (e.g., inside the "How I think about this config" section or elsewhere), rewrite them in place.
- [ ] **Step 5: Confirm no `subagent { tasks:` or `subagent { chain:` code-block examples remain.** Run `rg -n "subagent\s*\{" README.md` and confirm zero matches.

**Acceptance criteria:**

- The "Installed packages" bullet list names `pi-interactive-subagent` and no longer names `pi-subagent`.
  Verify: `rg -n "pi-interactive-subagent" README.md` returns at least one match inside the lines between `### Installed packages` and the next `###`/`##` heading, AND `rg -n "pi-subagent[^-]" README.md` returns zero matches (the `[^-]` guard avoids a false match on `pi-interactive-subagent`).
- No `pi-subagent` substring survives anywhere in `README.md`.
  Verify: open `README.md`, search for `pi-subagent` (exact substring), and confirm no occurrence that is not part of `pi-interactive-subagent`. Equivalent grep: `rg -n "pi-subagent" README.md | rg -v "pi-interactive-subagent"` returns zero matches.
- The Subagent architecture section describes the multi-tool surface (`subagent_run_serial`, `subagent_run_parallel`, `subagent`).
  Verify: `rg -n "subagent_run_serial|subagent_run_parallel" README.md` returns at least two matches (one per tool name, at minimum).
- No old single-tool `subagent { tasks|chain|agent: ... }` shape survives in README examples.
  Verify: `rg -n "\bsubagent\s+\{" README.md` returns zero matches.
- The six-agent inventory section (`### Local subagents` / `planner.md`, `coder.md`, etc.) is unchanged.
  Verify: read README.md's `## Local subagents` section and confirm it still contains six `### agent/agents/<name>.md` sub-headings: planner, coder, verifier, code-reviewer, code-refiner, plan-reviewer.

**Model recommendation:** standard

---

### Task 7: Swap `agent/settings.json` packages entry

**Files:**
- Modify: `agent/settings.json`

**Steps:**
- [ ] **Step 1: Edit `packages` array.** Replace the line `"~/Code/pi-subagent",` (line 12) with `"~/Code/pi-interactive-subagent",`. Preserve the other two entries (`npm:pi-web-access`, `npm:pi-token-burden`), the trailing comma on the new line (since more entries follow), and all surrounding keys (`lastChangelogVersion`, `defaultProvider`, etc.) unchanged.
- [ ] **Step 2: Validate JSON.** Run `python3 -c 'import json,sys; json.load(open("agent/settings.json"))'` and confirm it exits 0 (file is still valid JSON).
- [ ] **Step 3: Confirm the swap.** Run `rg -n "pi-(interactive-)?subagent" agent/settings.json` and confirm exactly one match, on the `"~/Code/pi-interactive-subagent"` line, and no `~/Code/pi-subagent` entry remains.

**Acceptance criteria:**

- `agent/settings.json` includes `~/Code/pi-interactive-subagent` in the `packages` array.
  Verify: `rg -n "~/Code/pi-interactive-subagent" agent/settings.json` returns exactly one match on a line inside the `"packages"` array.
- `agent/settings.json` no longer includes `~/Code/pi-subagent`.
  Verify: `rg -n "~/Code/pi-subagent\"" agent/settings.json` returns zero matches (the trailing `"` guard keeps the match disjoint from the new longer name).
- The JSON file remains well-formed.
  Verify: run `python3 -c 'import json; json.load(open("agent/settings.json"))'` and confirm exit code 0 with no output.
- The other two package entries are preserved.
  Verify: `rg -n "npm:pi-web-access|npm:pi-token-burden" agent/settings.json` returns exactly two matches.

**Model recommendation:** cheap

---

### Task 8: Repo-wide migration verification

**Files:**
- Modify: (none — verification only)

**Steps:**
- [ ] **Step 1: Run spec acceptance grep #1** — old single-tool call shape must be gone from `agent/` and `README.md`:
  `rg -n "\bsubagent\s+\{" agent/ README.md`
  Expected: zero matches.
- [ ] **Step 2: Run spec acceptance grep #2** — per-call `dispatch:` argument rename must be complete:
  `rg -n "\bdispatch:\s*\"(pi|claude)\"" agent/`
  Expected: zero matches. (The `dispatch` MAP key in `agent/model-tiers.json` has an object value, so it will not false-match this string pattern.)
- [ ] **Step 3: Run spec acceptance grep #3** — no `pi-subagent` substring may survive anywhere under `agent/` or `README.md`:
  `rg -n "pi-subagent" agent/ README.md`
  Expected: zero matches. (Historical references under `.pi/plans/archived|done/`, `.pi/reviews/`, and `.pi/specs/` are out of scope and must not be touched.)
- [ ] **Step 4: Run spec acceptance grep #4** — no reintroduction of the old chain shape:
  `rg -n "\bsubagent\s*\{\s*chain:" agent/ README.md`
  Expected: zero matches.
- [ ] **Step 5: Run spec acceptance grep #5** — no `maxConcurrency` field was added at any migrated call site:
  `rg -n "maxConcurrency" agent/`
  Expected: zero matches.
- [ ] **Step 6: Run spec acceptance grep #6** — no agent frontmatter adopted a `cli:` (or legacy `dispatch:`) field:
  `rg -n "^(dispatch|cli):" agent/agents/`
  Expected: zero matches.
- [ ] **Step 7: Confirm the positive sightings.** Run `rg -n "subagent_run_serial|subagent_run_parallel" agent/` and confirm at least nine matches across the five skill files (generate-plan: 3, execute-plan: 2, refine-code/SKILL: 1, refine-code/refine-code-prompt: 2, requesting-code-review: 1). Run `rg -n "MAX_PARALLEL_HARD_CAP" agent/skills/execute-plan/SKILL.md` and confirm at least three matches.
- [ ] **Step 8: Confirm settings.json swap landed.** Run `rg -n "~/Code/pi-interactive-subagent" agent/settings.json` and confirm exactly one match.

**Acceptance criteria:**

- The five spec acceptance greps all return zero matches.
  Verify: run each of `rg -n "\bsubagent\s+\{" agent/ README.md`, `rg -n "\bdispatch:\s*\"(pi|claude)\"" agent/`, `rg -n "pi-subagent" agent/ README.md`, `rg -n "\bsubagent\s*\{\s*chain:" agent/ README.md`, and `rg -n "maxConcurrency" agent/` and confirm each returns exit code 1 (ripgrep's no-match code) with empty stdout.
- No agent frontmatter adopted `cli:` or `dispatch:`.
  Verify: `rg -n "^(dispatch|cli):" agent/agents/` returns zero matches (exit code 1, empty stdout).
- The new orchestration tool names are in place across skills.
  Verify: `rg -c "subagent_run_serial|subagent_run_parallel" agent/skills/execute-plan/SKILL.md agent/skills/generate-plan/SKILL.md agent/skills/refine-code/SKILL.md agent/skills/refine-code/refine-code-prompt.md agent/skills/requesting-code-review/SKILL.md` reports a non-zero count for every listed file.
- `MAX_PARALLEL_HARD_CAP` is referenced in `execute-plan/SKILL.md`.
  Verify: `rg -n "MAX_PARALLEL_HARD_CAP" agent/skills/execute-plan/SKILL.md` returns at least three matches (Step 5, Step 10 §2, Step 11.2).
- `agent/settings.json` lists `~/Code/pi-interactive-subagent` exactly once and does not list `~/Code/pi-subagent`.
  Verify: `rg -c "~/Code/pi-interactive-subagent" agent/settings.json` reports `1` AND `rg -n "~/Code/pi-subagent\"" agent/settings.json` returns zero matches.

**Model recommendation:** cheap

---

## Dependencies

- Task 1 depends on: (none)
- Task 2 depends on: (none)
- Task 3 depends on: (none)
- Task 4 depends on: (none)
- Task 5 depends on: (none)
- Task 6 depends on: (none)
- Task 7 depends on: Task 1, Task 2, Task 3, Task 4, Task 5, Task 6
- Task 8 depends on: Task 7

Rationale: Tasks 1–6 are independent file edits across disjoint paths and run as a single parallel wave. Task 7 (package swap) is ordered after the call-site edits so the branch never carries the new extension alongside unmigrated call sites; this matches the spec's atomic-cutover intent. Task 8 is a pure verification pass that depends on every prior task having landed.

## Risk Assessment

- **Both extensions register the tool name `subagent`.** Loading them concurrently in `agent/settings.json` fails. Task 7 is therefore a strict replacement, not an additive entry. Mitigation: Task 7's acceptance criteria explicitly assert only one of the two names appears.
- **Intermediate branch state is not workable.** Between Wave 1 (call-site edits) and Wave 2 (settings swap), the working tree references the new tool names while the loaded extension is still the old one (sessions started before the swap keep the old extension in memory). This is tolerated within the feature branch/worktree. Mitigation: The spec requires the migration land as a revertable unit — merge the whole branch as a single squash commit, or ensure the multi-commit branch reverts together. The partial-progress hazard only bites if the branch is merged half-done.
- **Stale historical references to `pi-subagent`.** Files under `.pi/plans/archived/`, `.pi/plans/done/`, and `.pi/reviews/` mention the old tool shape in historical artifacts. These are explicitly out of scope and must NOT be touched. Mitigation: Task 8's greps are scoped to `agent/` and `README.md`, not the `.pi/` tree.
- **`dispatch` map key and per-call `cli` argument are easily confused.** `agent/model-tiers.json` keeps its `dispatch` map unchanged; only the per-call tool argument renames to `cli:`. A worker may over-edit and rename the map key. Mitigation: Task 2/Task 1 steps explicitly call out that the `dispatch` map reference in model-tiers.json stays; Task 8 grep #2 scopes the rename to string values (`"pi"` / `"claude"`) that cannot match the map key's object value.
- **Manual smoke test cannot be automated.** The spec requires a manual smoke run of `/generate-plan`, `/execute-plan` (≥2 tasks in one wave), `/requesting-code-review`, and `/refine-code` on a scratch todo in a throwaway worktree, verifying: (a) `results[0].finalMessage` consumption, (b) `cli:` routing for both `"pi"` and `"claude"` tier values, (c) observed parallel-wave elapsed time close to the longest task rather than the sum. **This must be performed by the human operator after the plan's automated waves complete and before the branch is merged.** The plan does not mark itself complete on the smoke result — the smoke is a gate the operator applies during branch completion (`finishing-a-development-branch`).
- **`pi-interactive-subagent` must be cloned locally at `~/Code/pi-interactive-subagent` before Task 7's swap takes effect.** If the directory does not exist, the next pi session will fail to load the extension. Mitigation: Before running the plan, the operator confirms `ls ~/Code/pi-interactive-subagent/` returns a populated directory. This precondition is not a plan task because it's environmental setup outside the repo.
- **`~/Code/pi-subagent` checkout is NOT deleted.** Per the spec's non-goals, the package list only loses the entry; the directory on disk stays and its retirement is a separate follow-up todo. Mitigation: no task touches that directory.
