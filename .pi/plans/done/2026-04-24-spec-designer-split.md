# Spec-Designer Split + Frontmatter Normalization + Architecture-Round Expansion

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** TODO-075cf515
**Spec:** `.pi/specs/2026-04-24-spec-designer-split.md`

## Goal

Refactor `define-spec` along three coupled axes: (1) move interactive Q&A out of the orchestrator into a dedicated `spec-designer` subagent, (2) normalize frontmatter on all 7 agents to match the `pi-interactive-subagent` contract (drop silently-ignored `maxSubagentDepth`, apply `session-mode: lineage-only` consistently, fix thinking levels), and (3) expand the procedure to optionally walk a brainstorming-style architecture round whose chosen approach is captured in a new optional `## Approach` spec section that downstream `planner` / `plan-reviewer` honor.

## Architecture summary

`define-spec/SKILL.md` becomes a thin orchestrator. The full spec-design procedure lives in one file: `agent/skills/define-spec/procedure.md` — a plain (non-skill) markdown file inside the existing skill directory. It has no `name:`/`description:` frontmatter and is **not** a discoverable skill. The orchestrator reads it fresh from disk at every dispatch and either (a) hands it to a `spec-designer` subagent via `systemPrompt:` on `subagent_run_serial { wait: true }` (`mux` branch), or (b) reads it and follows it in its own session (`inline` branch). Branch selection: env-var probe + user-input override scan; never an interactive prompt. Procedure delivery is symmetric across pi and Claude CLIs (no `skills:` mechanism used). The `spec-designer` agent has a narrow tool surface (`read, write, grep, find, ls` — no `bash`), no `model:` field (resolved at dispatch via `model-tiers.json`), and ends its turn by emitting `SPEC_WRITTEN: <absolute path>` on its own line. The orchestrator validates that line, pauses for user review, and gates the commit (via the `commit` skill) on user OK. Frontmatter normalization across all 7 agents (drop `maxSubagentDepth`, add `spawning: false` where intent was deny-spawn, add `session-mode: lineage-only` everywhere, set `thinking: xhigh` on planner + spec-designer) lands in the same change so the new agent doesn't ship against a still-broken baseline. The optional `## Approach` section in the spec template is consumed by `planner` (treats it as a constraint on architecture/file structure; deviations become `Risk Assessment` entries) and by `plan-reviewer` (deviations flagged as Warnings).

## Tech stack

- Markdown skill files (`agent/skills/**/*.md`)
- Markdown agent definitions (`agent/agents/*.md`)
- Skill orchestration via `subagent_run_serial` from `pi-interactive-subagent`
- Model-tier resolution via `~/.pi/agent/model-tiers.json`
- No code (TypeScript) changes
- Verification via `ripgrep` / `grep` and end-to-end smoke tests

## File Structure

- `agent/agents/spec-designer.md` (Create) — New interactive subagent definition. Frontmatter: `name`, `description`, `tools: read, write, grep, find, ls`, `thinking: xhigh`, `session-mode: lineage-only`, `auto-exit: false`, `spawning: false`, `system-prompt: append`. **No `model:`** (dispatch-time resolution). **No `maxSubagentDepth`**. **No body** — the agent's role and operational contract reach it via the `systemPrompt:` parameter (which carries the full `procedure.md`). A non-empty body would shadow `systemPrompt:` (the runtime resolves child identity as `agentDefs.body ?? params.systemPrompt`).
- `agent/agents/planner.md` (Modify) — Drop `maxSubagentDepth: 0`, add `spawning: false`, add `session-mode: lineage-only`, change `thinking: high` → `thinking: xhigh`. Body: rephrase the verification-recipe example that currently references `maxSubagentDepth: 0` so it points at a field that exists post-migration. Add an `## Approach` handling subsection in the body (R11): when reading a spec, check for `## Approach` and treat the chosen approach as a constraint on `Architecture summary` and `File Structure`; deviations surface in `Risk Assessment`.
- `agent/agents/plan-reviewer.md` (Modify) — Drop `maxSubagentDepth: 0`, add `spawning: false`, add `session-mode: lineage-only`. Body: when reviewing, if the spec has `## Approach`, check the plan honors it; flag deviations as Warnings.
- `agent/agents/coder.md` (Modify) — Drop `maxSubagentDepth: 0`, add `spawning: false`, add `session-mode: lineage-only`.
- `agent/agents/code-reviewer.md` (Modify) — Drop `maxSubagentDepth: 0`, add `spawning: false`, add `session-mode: lineage-only`.
- `agent/agents/code-refiner.md` (Modify) — Drop `maxSubagentDepth: 1` (do **not** add `spawning: false` — code-refiner intentionally dispatches nested workers), add `session-mode: lineage-only`.
- `agent/agents/verifier.md` (Modify) — Drop `maxSubagentDepth: 0`, add `spawning: false`, add `session-mode: lineage-only`.
- `agent/skills/define-spec/procedure.md` (Create) — Single canonical procedure body. No skill frontmatter. Sections: input-shape detection (R4), codebase survey (R5.2), scope-decomposition check (R5.3), intent Q&A (R5.4), architecture-need assessment (R5.5), conditional architecture Q&A (R5.6), spec self-review (R5.7), write spec with optional `## Approach` (R5.8 + R6), `SPEC_WRITTEN: <path>` completion line (R5.9), spec template.
- `agent/skills/define-spec/SKILL.md` (Modify, substantial shrinkage) — Thin orchestrator. Reads `procedure.md` fresh; probes mux availability via env-var inspection; scans input for "no subagent" override phrases; emits one-line branch-status announcement; dispatches via `subagent_run_serial { wait: true }` with `agent: spec-designer`, `systemPrompt: <procedure body>`, `task: <raw user input>` on `mux`, or follows the procedure inline; parses `SPEC_WRITTEN: <path>` from `finalMessage`; validates path exists; pauses for user review; invokes the `commit` skill on user OK; handles cases 1–3 (dispatch failures, strict) and case 4 (user reject, recovery menu); offers `generate-plan`.

## Tasks

### Task 1: Normalize frontmatter across the six existing agents

**Files:**
- Modify: `agent/agents/planner.md`
- Modify: `agent/agents/plan-reviewer.md`
- Modify: `agent/agents/coder.md`
- Modify: `agent/agents/code-reviewer.md`
- Modify: `agent/agents/code-refiner.md`
- Modify: `agent/agents/verifier.md`

**Steps:**

- [ ] **Step 1: Rewrite `agent/agents/planner.md` frontmatter.** Replace the current frontmatter block with exactly:
  ```yaml
  ---
  name: planner
  description: Deep codebase analysis and structured plan generation. Produces dependency-ordered plans in .pi/plans/. Also performs surgical plan edits when dispatched with the edit-plan-prompt.
  tools: read, grep, find, ls, bash
  model: claude-opus-4-6
  thinking: xhigh
  session-mode: lineage-only
  spawning: false
  ---
  ```
  Changes vs. today: `thinking: high` → `xhigh`, removed `maxSubagentDepth: 0`, added `session-mode: lineage-only`, added `spawning: false`. Leave the body unchanged in this task — Task 2 handles the verification-recipe example, and Task 6 adds the `## Approach` handling.

- [ ] **Step 2: Rewrite `agent/agents/plan-reviewer.md` frontmatter.** Replace the current frontmatter block with exactly:
  ```yaml
  ---
  name: plan-reviewer
  description: Reviews generated implementation plans for structural correctness, spec coverage, and buildability
  thinking: high
  session-mode: lineage-only
  spawning: false
  tools: read, grep, find, ls, bash
  ---
  ```
  Changes: removed `maxSubagentDepth: 0`, added `session-mode: lineage-only`, added `spawning: false`. `thinking: high` is unchanged. Leave body unchanged here — Task 7 adds the `## Approach` honoring rule.

- [ ] **Step 3: Rewrite `agent/agents/coder.md` frontmatter.** Replace with exactly:
  ```yaml
  ---
  name: coder
  description: Executes a single task from a structured plan or fixes code based on review findings. Reports structured status for orchestration.
  thinking: medium
  session-mode: lineage-only
  spawning: false
  ---
  ```
  Changes: removed `maxSubagentDepth: 0`, added `session-mode: lineage-only`, added `spawning: false`. Body unchanged.

- [ ] **Step 4: Rewrite `agent/agents/code-reviewer.md` frontmatter.** Replace with exactly:
  ```yaml
  ---
  name: code-reviewer
  description: Reviews code diffs for production readiness. Supports full-diff review and hybrid re-review modes.
  thinking: high
  session-mode: lineage-only
  spawning: false
  ---
  ```
  Changes: removed `maxSubagentDepth: 0`, added `session-mode: lineage-only`, added `spawning: false`. Body unchanged.

- [ ] **Step 5: Rewrite `agent/agents/code-refiner.md` frontmatter.** Replace with exactly:
  ```yaml
  ---
  name: code-refiner
  description: Orchestrates the review-remediate loop. Dispatches code-reviewer and coder subagents, manages iteration budget, writes versioned review files.
  thinking: medium
  session-mode: lineage-only
  ---
  ```
  Changes: removed `maxSubagentDepth: 1`, added `session-mode: lineage-only`. **Do NOT** add `spawning: false` — code-refiner intentionally dispatches `code-reviewer` and `coder` subagents. Body unchanged.

- [ ] **Step 6: Rewrite `agent/agents/verifier.md` frontmatter.** Replace with exactly:
  ```yaml
  ---
  name: verifier
  description: Judge-only per-task verification for execute-plan. Reads task acceptance criteria with `Verify:` recipes, consumes orchestrator-provided command evidence and file context, and returns per-criterion PASS/FAIL with an overall task verdict. Never runs exploratory shell.
  tools: read, grep, find, ls
  thinking: medium
  session-mode: lineage-only
  spawning: false
  ---
  ```
  Changes: removed `maxSubagentDepth: 0`, added `session-mode: lineage-only`, added `spawning: false`. Body unchanged.

- [ ] **Step 7: Verify the six edits with grep.** Run:
  ```bash
  rg -n "^maxSubagentDepth:" agent/agents/
  ```
  Expected: zero matches. (Scoped to frontmatter — the planner body still contains a verification-recipe example that mentions `maxSubagentDepth`; Task 2 rewrites it.) Then:
  ```bash
  rg -n "session-mode: lineage-only" agent/agents/
  ```
  Expected: 6 matches (one per file edited above). Then:
  ```bash
  rg -n "spawning: false" agent/agents/
  ```
  Expected: 5 matches (planner, plan-reviewer, coder, code-reviewer, verifier — **not** code-refiner).

- [ ] **Step 8: Commit.**
  ```bash
  git add agent/agents/planner.md agent/agents/plan-reviewer.md agent/agents/coder.md agent/agents/code-reviewer.md agent/agents/code-refiner.md agent/agents/verifier.md
  git commit -m "refactor(agents): normalize frontmatter to pi-interactive-subagent contract"
  ```

**Acceptance criteria:**

- `maxSubagentDepth` is removed from the frontmatter of every existing agent.
  Verify: `rg -n "^maxSubagentDepth:" agent/agents/` returns zero matches. (A body match on `agent/agents/planner.md` is expected here and is cleared by Task 2.)
- `session-mode: lineage-only` appears in all six existing agent files.
  Verify: `rg -l "^session-mode: lineage-only$" agent/agents/planner.md agent/agents/plan-reviewer.md agent/agents/coder.md agent/agents/code-reviewer.md agent/agents/code-refiner.md agent/agents/verifier.md` returns all six paths.
- `spawning: false` is present on planner, plan-reviewer, coder, code-reviewer, verifier and **absent** on code-refiner.
  Verify: `rg -l "^spawning: false$" agent/agents/` returns exactly five paths and does NOT include `agent/agents/code-refiner.md`.
- Planner thinking level is `xhigh`.
  Verify: `rg -n "^thinking: xhigh$" agent/agents/planner.md` returns exactly one match.
- The other five agents preserve their previous thinking values.
  Verify: open `agent/agents/plan-reviewer.md` and `agent/agents/code-reviewer.md` and confirm both have `thinking: high`; open `agent/agents/coder.md`, `agent/agents/code-refiner.md`, and `agent/agents/verifier.md` and confirm all three have `thinking: medium`.

**Model recommendation:** standard

---

### Task 2: Update planner.md verification-recipe example

**Files:**
- Modify: `agent/agents/planner.md`

**Steps:**

- [ ] **Step 1: Locate any reference to `maxSubagentDepth: 0` in `agent/agents/planner.md`.** Run:
  ```bash
  rg -n "maxSubagentDepth" agent/agents/planner.md
  ```
  This grep checks the body since Task 1 already cleaned the frontmatter. The only surviving match should be inside a verification-recipe **example** in the planner body — the planner's body documents `Verify:`-recipe shapes and uses verifier frontmatter as one of its examples (search around the "File-content inspection" example or the "verification-recipe example" the spec calls out).

  Expected match (or near-match) to look for in the body:
  ```
  Verify: open `agent/agents/verifier.md` and confirm the frontmatter sets `maxSubagentDepth: 0` and the body forbids exploratory shell commands
  ```
  If no body match exists (i.e. the recipe was already rephrased), skip to Step 3 and just commit a no-op note in the message.

- [ ] **Step 2: Rephrase the example.** Replace the example so it points at a field that still exists post-migration. Use this exact replacement:
  ```
  Verify: open `agent/agents/verifier.md` and confirm the frontmatter sets `spawning: false` and the body forbids exploratory shell commands
  ```
  Edit only the matched recipe; do not touch unrelated content.

- [ ] **Step 3: Verify no `maxSubagentDepth` reference survives anywhere in the file, or anywhere in `agent/agents/`.** Run:
  ```bash
  rg -n "maxSubagentDepth" agent/agents/planner.md
  ```
  Expected: zero matches. Then run the global gate that Task 1 deferred:
  ```bash
  rg -n "maxSubagentDepth" agent/agents/
  ```
  Expected: zero matches anywhere under `agent/agents/`.

- [ ] **Step 4: Commit.**
  ```bash
  git add agent/agents/planner.md
  git commit -m "refactor(planner): replace maxSubagentDepth verify-example with spawning"
  ```

**Acceptance criteria:**

- No `maxSubagentDepth` reference survives anywhere in `agent/agents/planner.md`, including the body, and no other agent file references it either.
  Verify: `rg -n "maxSubagentDepth" agent/agents/planner.md` returns zero matches **and** `rg -n "maxSubagentDepth" agent/agents/` returns zero matches.
- The `spawning: false` example appears in the planner body's verification-recipe section.
  Verify: `rg -n "spawning: false" agent/agents/planner.md` returns at least one match below the closing `---` of the frontmatter (exclude line numbers ≤ ~10 from the count).

**Model recommendation:** cheap

---

### Task 3: Create `agent/agents/spec-designer.md`

**Files:**
- Create: `agent/agents/spec-designer.md`

**Steps:**

- [ ] **Step 1: Create the file with this exact content.** The file is **frontmatter only — no body**. The procedure body reaches the agent at dispatch time via `systemPrompt:` (Task 5). Because `agent/agents/*.md` parsing prefers the agent body over `params.systemPrompt`, leaving a body here would silently swallow the procedure. The `system-prompt: append` field tells the runtime to deliver `systemPrompt:` as a real system prompt on both pi and Claude paths.

  ```markdown
  ---
  name: spec-designer
  description: Interactive spec-design subagent. Receives the spec-design procedure as an appended system prompt at dispatch time and conducts the Q&A directly with the user in its own multiplexer pane. Writes the spec to .pi/specs/ and ends its turn with a SPEC_WRITTEN: <absolute path> line.
  tools: read, write, grep, find, ls
  thinking: xhigh
  session-mode: lineage-only
  auto-exit: false
  spawning: false
  system-prompt: append
  ---
  ```

- [ ] **Step 2: Verify frontmatter shape with grep.** Run:
  ```bash
  rg -n "^name: spec-designer$|^description:|^tools: read, write, grep, find, ls$|^thinking: xhigh$|^session-mode: lineage-only$|^auto-exit: false$|^spawning: false$|^system-prompt: append$" agent/agents/spec-designer.md
  ```
  Expected: at least 8 matches inside the top frontmatter block (one per required field).

- [ ] **Step 3: Verify forbidden frontmatter fields are absent.** Run:
  ```bash
  rg -n "^model:|^maxSubagentDepth:" agent/agents/spec-designer.md
  ```
  Expected: zero matches.

- [ ] **Step 4: Verify there is no body.** Run:
  ```bash
  awk 'BEGIN{c=0} /^---$/{c++; next} c>=2 && NF>0 {print; exit}' agent/agents/spec-designer.md
  ```
  Expected: no output. The file ends at the closing `---` of the frontmatter (a trailing newline is fine, but no further non-empty lines).

- [ ] **Step 5: Commit.**
  ```bash
  git add agent/agents/spec-designer.md
  git commit -m "feat(agents): add spec-designer agent definition"
  ```

**Acceptance criteria:**

- The file exists.
  Verify: `ls agent/agents/spec-designer.md` returns the path with no error.
- Frontmatter matches the required shape exactly.
  Verify: open `agent/agents/spec-designer.md` and confirm the frontmatter block (between the first two `---` delimiters) contains exactly the eight fields listed in Step 1, in any order, with no `model:` or `maxSubagentDepth:` fields.
- The file has no body content after the closing frontmatter delimiter.
  Verify: the awk command in Step 4 produces no output.

**Model recommendation:** cheap

---

### Task 4: Create `agent/skills/define-spec/procedure.md`

**Files:**
- Create: `agent/skills/define-spec/procedure.md`

**Steps:**

- [ ] **Step 1: Create the file with this exact content.** The procedure file must NOT begin with a `---` frontmatter block — its first line is the H1 below.

  ````markdown
  # Spec Design Procedure

  This is the canonical spec-design procedure. It is delivered to the `spec-designer` subagent inline via `systemPrompt:` at dispatch time, OR read directly by the `define-spec` orchestrator and followed in its own session on the inline branch. The same body runs both branches — there is no per-branch divergence.

  This file is **not** a discoverable skill. It has no `name:`/`description:` frontmatter and is not loaded by any `Skill` tool surface. It is consumed only by being read from disk.

  ## Step 1: Resolve input shape

  The orchestrator passes the user's raw input as your task body. Detect the shape by pattern; do not ask the user which kind it is.

  | Shape | Pattern | Behavior |
  | --- | --- | --- |
  | **Todo ID** | matches `^TODO-[0-9a-f]{8}$` exactly | Use the `todo` tool (if available in your tool surface) or read the todo file directly from `.pi/todos/<id>.md` to get the title and full body. Set provenance to `Source: TODO-<id>`. Check whether `.pi/briefs/TODO-<id>-brief.md` exists; if it does, read it as scout context and set the `Scout brief:` provenance line. If it does not exist, proceed without — do not fail. |
  | **Existing-spec path** | string ends in `.md` and is **either** (a) a relative path that begins with `.pi/specs/`, **or** (b) an absolute path that contains the segment `/.pi/specs/` (e.g. `/Users/.../<repo>/.pi/specs/foo.md` — this is the form the orchestrator's `SPEC_WRITTEN: <absolute path>` emits and the recovery-menu Redo replays back in), **and** the file exists on disk | Read the existing draft. Treat it as starting context. Preserve its preamble lines (`Source:`, `Scout brief:`) verbatim on rewrite. Q&A focuses on filling gaps and refining unclear sections. **Overwrite the same path** at the end (use the input path as-is — do not normalize between relative and absolute). The spec self-review pass (Step 7) is mandatory. |
  | **Freeform text** | anything else | Use the text as a seed. Do not look up a scout brief. Do not emit a `Source:` or `Scout brief:` preamble. Run the full Q&A. |

  ## Step 2: Codebase survey

  Always perform a general survey before asking questions: project structure and key skill / agent definitions in scope. Read `agent/AGENTS.md` and any obviously-relevant `SKILL.md` or `*.md` files near the input topic. (You do not have `bash`, so git history is out of reach — work from file contents only.)

  Targeted survey:
  - On the **todo** branch, use the scout brief (if loaded) as foundation. Read additional files only where the brief points at something worth examining more closely.
  - On the **existing-spec** branch, follow references the existing draft makes (file paths, agent names, skill names) and read those.
  - On the **freeform** branch, identify likely files and modules from the seed text and read enough to ground questions in code reality.

  Goal: ask codebase-informed questions, not naive intent-only questions.

  ## Step 3: Scope-decomposition check

  Before Q&A starts, assess whether the input describes multiple independent subsystems. If it does, surface this and offer to split into separate specs (one per subsystem). If the user insists on a single spec for multi-subsystem work, comply but record an Open Question in the final spec noting the breadth — downstream `generate-plan` may produce a coarse plan as a result.

  This check is non-blocking and runs once at the top.

  ## Step 4: Intent Q&A

  Ask one question at a time. Multi-choice preferred where possible. Ground each question in what you learned from the codebase and (if loaded) the scout brief. Read additional code during the conversation as new areas surface.

  No fixed question count — use judgment. Stop when you can write a useful spec covering Goal / Context / Requirements / Constraints / Acceptance / Non-Goals.

  Do **not** prescribe file paths, function signatures, or types — those belong to the planner. The boundary is: "would two reasonable people building this make the same call?" If yes, the decision is mechanical and out of scope for this skill. If no, the decision is load-bearing and is a candidate for the architecture round in Step 6.

  ## Step 5: Architecture-need assessment

  After intent Q&A is sufficient, present a recommendation to the user:

  > My read: this work [does / does not] involve load-bearing architectural choices. [Reasoning — one or two sentences citing specific aspects of the input.] I recommend [running / skipping] an architecture round. You can confirm, force on, or force off.

  Wait for the user to confirm, force on, or force off. The recommendation and reasoning are surfaced to the user but are **not** recorded in the final spec — only the user's effective choice (run or skip) matters, and that is reflected by the presence or absence of the `## Approach` section in the spec.

  ## Step 6: Architecture Q&A (conditional, only when the round runs)

  Propose 2–3 distinct approaches with trade-offs. State your recommendation. Let the user pick one or propose their own. Do not fabricate alternatives that are not meaningfully different — if you genuinely cannot identify 2–3 distinct approaches, surface that to the user, recommend skipping the round, and do not invent fake alternatives.

  Capture, for the spec:
  - The chosen approach in concrete terms (paradigm-level: subagent vs inline, monolith vs split, sync vs async, single-skill vs multi-skill).
  - The reasoning for choosing it over the alternatives.
  - The considered-and-rejected alternatives, each with a one-line "why not".

  Components, data flow, file structure, types, error-handling shape, and test design remain `planner` territory — do not capture those here.

  ## Step 7: Spec self-review pass

  Before writing, re-read the assembled answers and check for:
  - **Placeholders** — "TBD", "TODO", "implement later", "fill in details". Resolve inline.
  - **Internal consistency** — do constraints contradict requirements? Are non-goals mutually exclusive with acceptance criteria?
  - **Scope** — has the conversation drifted into implementation detail? Trim it to intent + (optional) approach.
  - **Ambiguity** — any criterion that two reasonable readers would interpret differently?

  Fix issues by re-asking targeted questions if needed.

  ## Step 8: Write the spec

  Write to `.pi/specs/<YYYY-MM-DD>-<short-topic>.md` using today's date and a kebab-case topic derived from the conversation. **On the existing-spec branch, overwrite the existing path verbatim instead** — do not generate a new filename.

  Spec template (omit any section labeled OPTIONAL whose round did not run):

  ~~~markdown
  # <Title>

  Source: TODO-<id>                            <- ONLY on the todo branch
  Scout brief: .pi/briefs/TODO-<id>-brief.md   <- ONLY when a scout brief was loaded

  ## Goal

  One-paragraph summary of what we're building and why.

  ## Context

  What exists today that's relevant. Codebase reality — files, interfaces, patterns
  the implementation will interact with. Sourced from your survey and scout brief.

  ## Requirements

  Concrete requirements derived from the conversation. Each verifiable.

  - Requirement 1
  - Requirement 2

  ## Constraints

  Boundaries on the solution — must-not-do, compatibility, performance bounds, dependencies.

  ## Approach              <- OPTIONAL: present iff the architecture round ran in Step 6

  **Chosen approach:** ...

  **Why this over alternatives:** ...

  **Considered and rejected:**

  - Alternative A — why not
  - Alternative B — why not

  ## Acceptance Criteria

  How do we know it's done? Observable, testable outcomes.

  - Criterion 1
  - Criterion 2

  ## Non-Goals

  What's explicitly out of scope. Prevents the planner from gold-plating.

  ## Open Questions (optional)

  Anything surfaced during exploration that couldn't be resolved.
  ~~~

  Section ordering rules:
  - The `## Approach` section, when present, sits **between** `## Constraints` and `## Acceptance Criteria`.
  - When the architecture round did not run, omit the `## Approach` section entirely (header included). Downstream consumers detect by section presence.
  - Provenance preamble (`Source:`, `Scout brief:`) lines, when present, sit immediately under the H1 title and above `## Goal`. They are exact-match — copy the literal `Source: TODO-<id>` and `Scout brief: .pi/briefs/TODO-<id>-brief.md` strings, with no abbreviation.
  - Existing template sections (`Goal`, `Context`, `Requirements`, `Constraints`, `Acceptance Criteria`, `Non-Goals`, `Open Questions`) are unchanged from prior specs.

  Create the `.pi/specs/` directory if it does not exist.

  Do **not** commit. The orchestrator owns the commit gate.

  ## Step 9: Emit the completion line and exit

  After the file is written, end your turn with exactly this line, anchored on its own line, as your last output:

  ```
  SPEC_WRITTEN: <absolute path>
  ```

  Where `<absolute path>` is the full filesystem path of the spec file you just wrote. No backticks, no trailing commentary on the same line, no abbreviation. Then exit.

  If you cannot complete the procedure (user terminates Q&A early, ambiguous input the user refuses to clarify, etc.), exit without emitting `SPEC_WRITTEN:`. The orchestrator will detect the missing line and surface the failure.
  ````

- [ ] **Step 2: Verify the file has no skill frontmatter.** Run:
  ```bash
  head -n 1 agent/skills/define-spec/procedure.md
  ```
  Expected: the first line is `# Spec Design Procedure` (an H1 heading), **not** `---`. The procedure must not be confused with a discoverable skill.

  Then run:
  ```bash
  rg -n "^name:|^description:" agent/skills/define-spec/procedure.md | head -5
  ```
  Expected: zero matches at the top of the file (any matches deeper in the body inside fenced code blocks or template examples are fine).

- [ ] **Step 3: Verify the procedure body covers all required steps.** Run:
  ```bash
  rg -n "^## Step [1-9]" agent/skills/define-spec/procedure.md
  ```
  Expected: 9 matches (Steps 1 through 9), in numerical order.

- [ ] **Step 4: Verify the SPEC_WRITTEN contract is present.** Run:
  ```bash
  rg -n "SPEC_WRITTEN: <absolute path>" agent/skills/define-spec/procedure.md
  ```
  Expected: at least one match (likely two — the inline reference and the fenced example).

- [ ] **Step 5: Verify the optional Approach section is documented.** Run:
  ```bash
  rg -n "^## Approach" agent/skills/define-spec/procedure.md
  ```
  Expected: at least one match (inside the spec template fenced block). Then:
  ```bash
  rg -n "OPTIONAL" agent/skills/define-spec/procedure.md
  ```
  Expected: at least one match annotating the section's optionality.

- [ ] **Step 6: Commit.**
  ```bash
  git add agent/skills/define-spec/procedure.md
  git commit -m "feat(define-spec): add canonical procedure body"
  ```

**Acceptance criteria:**

- The file exists at the expected path.
  Verify: `ls agent/skills/define-spec/procedure.md` returns the path.
- The file is **not** a discoverable skill — its first line is an H1 heading, not a `---` frontmatter delimiter.
  Verify: `head -n 1 agent/skills/define-spec/procedure.md` outputs `# Spec Design Procedure`.
- The procedure body covers nine steps in order.
  Verify: `rg -n "^## Step [1-9]" agent/skills/define-spec/procedure.md` returns nine lines, with the matched headings in ascending numerical order (Step 1 → Step 9).
- Input-shape detection covers all three shapes (todo / existing-spec path / freeform).
  Verify: open `agent/skills/define-spec/procedure.md` and confirm the Step 1 table contains rows for `Todo ID`, `Existing-spec path`, and `Freeform text` with the patterns and behaviors described in Step 1 of this task. The `Existing-spec path` row must explicitly accept **both** relative `.pi/specs/<name>.md` paths and absolute paths whose path contains `/.pi/specs/` — the recovery-menu Redo (Task 5 Step 7) replays the orchestrator's captured `SPEC_WRITTEN: <absolute path>` value, and the procedure must recognize it without falling through to the freeform branch.
- The `SPEC_WRITTEN:` completion line is documented as the agent's terminal output.
  Verify: `rg -n "SPEC_WRITTEN: <absolute path>" agent/skills/define-spec/procedure.md` returns at least one match inside Step 9.
- The optional `## Approach` section is documented in the spec template.
  Verify: open `agent/skills/define-spec/procedure.md` and confirm the spec template inside Step 8 includes the `## Approach` block annotated `OPTIONAL`, sitting between `## Constraints` and `## Acceptance Criteria`.

**Model recommendation:** standard

---

### Task 5: Rewrite `agent/skills/define-spec/SKILL.md` as the thin orchestrator

**Files:**
- Modify: `agent/skills/define-spec/SKILL.md`

**Steps:**

- [ ] **Step 1: Replace the entire file content with the orchestrator skill below.** The frontmatter is preserved (the skill remains discoverable) but the body is rewritten end-to-end.

  ~~~markdown
  ---
  name: define-spec
  description: "Interactive spec writing from a todo, an existing spec under .pi/specs/, or freeform text. Dispatches a spec-designer subagent in a multiplexer pane when one is available, falling back to running the procedure inline. Writes a structured spec to .pi/specs/ and gates the commit on user review."
  ---

  # Define Spec

  This skill is a thin orchestrator. The full spec-design procedure lives in `agent/skills/define-spec/procedure.md` and is the single source of truth for both branches. This skill probes the environment, picks a branch, dispatches (or runs the procedure inline), validates completion, and gates the commit on user review.

  ## Step 1: Detect branch (mux vs inline)

  Decide which branch to run **without** prompting the user.

  ### 1a. Mux probe

  Mirror `pi-interactive-subagent`'s actual mux detection (`pi-extension/subagents/cmux.ts` + `backends/select.ts`) — pairing each multiplexer's signature env var with a command-availability check, and honoring the runtime's `PI_SUBAGENT_MUX` backend preference — so the orchestrator's branch decision and the runtime's `selectBackend()` / `getMuxBackend()` decisions agree. Apply rules in this order; the first match wins.

  1. `$PI_SUBAGENT_MODE == "headless"` (case-insensitive) → `inline` branch (runtime would force the headless backend regardless of mux).
  2. `$PI_SUBAGENT_MODE == "pane"` (case-insensitive) → `mux` branch (runtime would force the pane backend regardless).
  3. `$PI_SUBAGENT_MUX` is set (case-insensitive) to one of `cmux` / `tmux` / `zellij` / `wezterm` → evaluate **only** that backend's runtime check (the matching env-var + `command -v` pair from rules 4–7 below). If the check passes → `mux` branch with that backend. If it fails → `inline` branch (do **not** fall through to other backends — `getMuxBackend()` does not fall back when a preference is set, so the orchestrator must not either). If `$PI_SUBAGENT_MUX` is set to anything else (empty, unrecognized) → ignore the preference and fall through to rule 4.
  4. `$CMUX_SOCKET_PATH` is set and `command -v cmux` succeeds → `mux` branch (cmux).
  5. `$TMUX` is set and non-empty and `command -v tmux` succeeds → `mux` branch (tmux).
  6. (`$ZELLIJ` is set and non-empty **or** `$ZELLIJ_SESSION_NAME` is set and non-empty) and `command -v zellij` succeeds → `mux` branch (zellij).
  7. `$WEZTERM_UNIX_SOCKET` is set and non-empty and `command -v wezterm` succeeds → `mux` branch (wezterm).
  8. Otherwise → `inline` branch (no mux).

  Notes:
  - The plan deliberately uses `WEZTERM_UNIX_SOCKET` (not `WEZTERM_PANE`), `ZELLIJ` **or** `ZELLIJ_SESSION_NAME` (not `ZELLIJ` alone), and `CMUX_SOCKET_PATH` (not bare `CMUX_*`) because those are the exact env vars the runtime's `cmux.ts` checks. A divergent probe would let the orchestrator pick `mux` while the runtime then picks the headless backend, silently misrouting `spec-designer` into a non-interactive session.
  - Rule 3 mirrors `cmux.ts`'s `muxPreference()` + `getMuxBackend()`: a valid `PI_SUBAGENT_MUX` value pins the runtime to one backend with no fallback. The orchestrator must follow the same single-backend evaluation; otherwise it would pick `mux` while the runtime then refuses every backend and selects `headless`.
  - The command-availability check (`command -v <name>`) matches the runtime's `hasCommand` gate. A pane env var without the corresponding CLI binary on PATH does not count as mux.
  - Do **not** prompt the user during probing.

  ### 1b. User-input override scan

  Scan the user's slash-command input for an explicit "no subagent" override. Recognize any of these substrings (case-insensitive):

  - `--no-subagent`
  - `without a subagent`
  - `without subagent`
  - `no subagent`
  - `skip subagent`
  - `inline`

  If any match, force the `inline` branch regardless of the mux probe outcome.

  ### 1c. Status announcement

  Emit one status line to the user. This is informational — no input expected:

  - `mux` branch chosen: `Running spec design in subagent pane (mux detected, no override).`
  - `inline` branch via no-mux probe: `Running spec design in this session (no multiplexer detected).`
  - `inline` branch via override: `Running spec design in this session (per --no-subagent / inline override).`

  ## Step 2: Read `procedure.md` fresh from disk

  Read `agent/skills/define-spec/procedure.md` in full. This is the procedure body that drives the chosen branch.

  If the file is missing or unreadable, fail with:

  > `agent/skills/define-spec/procedure.md` missing or unreadable — cannot run define-spec. Restore the file before retrying.

  Stop. Do not dispatch with an empty or truncated procedure.

  ## Step 3: Run the procedure

  ### 3a. Mux branch — dispatch `spec-designer`

  Resolve both `model` and `cli` from `~/.pi/agent/model-tiers.json` (per the standard model-tier resolution rule used by `generate-plan` Step 2):

  - Read `~/.pi/agent/model-tiers.json`. If the file is missing, unreadable, or not valid JSON, fail with: `~/.pi/agent/model-tiers.json missing or unreadable — cannot resolve dispatch model/cli for spec-designer.` Stop. Do not dispatch. Do not fall back to a CLI default.
  - `model` is the `capable` field (e.g. `anthropic/claude-opus-4-7`). If `capable` is missing or empty, fail with: `model-tiers.json has no usable "capable" model — cannot dispatch spec-designer.` Stop.
  - `cli` is `dispatch.<provider>` for that model's provider prefix (e.g. `dispatch.anthropic` → `claude`). Derive `<provider>` as the prefix before the first `/` in the `capable` value. If the `dispatch` map is missing, or `dispatch.<provider>` is missing or empty, fail with: `model-tiers.json has no dispatch.<provider> mapping for capable model <capable> — cannot dispatch spec-designer.` Stop.

  All three failure modes are strict: surface the message and stop. Do not retry, do not silently use a CLI default — losing the explicit `model` / `cli` values is what motivates the split, so failing loudly is the correct behavior.

  Then dispatch (note: `wait` is a top-level orchestration option, not a per-task field):

  ```
  subagent_run_serial {
    tasks: [
      {
        name: "spec-designer",
        agent: "spec-designer",
        task: "<raw user input — todo ID, .pi/specs/<path>.md, or freeform text>",
        systemPrompt: "<full body of procedure.md from Step 2>",
        model: "<capable tier from model-tiers.json>",
        cli: "<resolved dispatch cli>"
      }
    ],
    wait: true
  }
  ```

  Notes:
  - **Do NOT pass a `skills:` parameter.** The procedure is delivered exclusively via `systemPrompt:` so delivery is symmetric across pi and Claude CLIs (the agent's `system-prompt: append` frontmatter makes the runtime treat `systemPrompt:` as a real system prompt on both paths).
  - **Both `model:` and `cli:` come from `model-tiers.json`, not from agent frontmatter.** `spec-designer.md` has no `model:` field by design (R1) — without an explicit per-call `model:` the CLI default would be used and the Opus tier would be lost.
  - The pane spawns; the user types their answers directly into the pane. The dispatch blocks until the subagent completes (top-level `wait: true`).

  Read `results[0].finalMessage`, `results[0].exitCode`, `results[0].state`, and `results[0].transcriptPath` from the orchestration result. Proceed to Step 4.

  ### 3b. Inline branch — follow the procedure in this session

  Treat the body of `procedure.md` (read in Step 2) as if it were addressed to you, the orchestrator. Execute Steps 1 through 9 of the procedure in this session. The user's raw input is the seed for the procedure's Step 1 input-shape detection.

  When the procedure's Step 9 finishes, you will have written a spec file. Capture the absolute path you wrote to. There is no `finalMessage` to parse on this branch — you `are` the procedure runner, so the absolute path is already in your hand.

  Skip Step 4 of this orchestrator (it parses the subagent's `finalMessage`) and jump straight to Step 5.

  ## Step 4: Validate `SPEC_WRITTEN:` (mux branch only)

  Parse the subagent's `finalMessage` for a single line matching exactly:

  ```
  SPEC_WRITTEN: <absolute path>
  ```

  Cases:

  - **(1) `finalMessage` lacks a `SPEC_WRITTEN:` line.** Report to the user:
    > Spec design did not complete: `spec-designer` exited without emitting `SPEC_WRITTEN: <path>`. Transcript: `<transcriptPath>`. No spec written, no commit attempted.

    Stop. Do not retry. Do not surface a recovery menu.

  - **(2) Path reported but file missing on disk.** Report:
    > Spec design reported `SPEC_WRITTEN: <path>` but `<path>` does not exist on disk. Transcript: `<transcriptPath>`. No commit attempted.

    Stop. Do not retry.

  - **(3) `exitCode != 0`.** Report:
    > Spec design failed (`exitCode: <N>`, `error: <error>`). Transcript: `<transcriptPath>`. No commit attempted.

    Stop. Do not retry.

  - **(success)** `SPEC_WRITTEN: <path>` is present, `<path>` exists, and `exitCode == 0`. Proceed to Step 5 with `<path>` captured.

  ## Step 5: Pause for user review

  Surface to the user:

  > Spec written to `<path>`. Review it and let me know when you'd like me to commit it (or that you don't want to).

  Wait for the user's reply. The orchestrator does **not** read the spec file into its own context — the user reads it directly.

  Possible user responses:

  - **OK / commit it / yes** → Step 6 (commit).
  - **Reject** (any form: "redo", "leave it", "delete it") → Step 7 (recovery menu).

  ## Step 6: Commit (on user OK)

  Invoke the `commit` skill with the exact spec path captured in Step 4 (or Step 3b on inline). Specify the path explicitly so only the spec file is committed.

  If the `commit` skill fails, report the error verbatim and stop. Leave the file on disk uncommitted. Do **not** auto-retry. The user resolves the underlying issue (e.g. pre-commit hook failure) and re-runs `/define-spec` or commits manually.

  ## Step 7: Recovery menu (on user reject)

  Present these three options:

  > Got it. What would you like to do with `<path>`?
  >
  > **(i) Redo** — re-dispatch `define-spec` with the existing draft as input. The procedure overwrites the same path.
  > **(ii) Leave it** — leave `<path>` uncommitted on disk for manual editing and committing later.
  > **(iii) Delete it** — remove the file.

  Behavior per choice:

  - **(i) Redo:** invoke `/define-spec <path>` recursively, passing the captured spec path as-is (typically the absolute path from the original `SPEC_WRITTEN: <absolute path>` line). The procedure's input-shape detector accepts both relative `.pi/specs/<name>.md` and absolute paths containing `/.pi/specs/`, so the existing-spec branch fires on the recursive run and overwrites the rejected draft with preamble preservation. On the recursive run, the same orchestrator probe + dispatch + validate + commit-gate flow applies.
  - **(ii) Leave it:** emit `Leaving <path> uncommitted. Edit and commit yourself.` and stop.
  - **(iii) Delete it:** remove the file. Then stop.

  ## Step 8: Offer `generate-plan`

  After a successful commit (Step 6), offer continuation:

  > Spec committed. Want me to run `generate-plan` with `<path>`?

  If yes, invoke `generate-plan` with `<path>`. If no, stop.

  ## Edge cases

  - **`procedure.md` missing.** Fail at Step 2 with the message specified there.
  - **`model-tiers.json` missing / no `capable` model / no `dispatch.<provider>` mapping.** Fail at Step 3a with the matching message. Stop. Do not fall back to a CLI default — the whole point of the explicit resolution is to keep dispatch on the Opus-tier / Claude-CLI route.
  - **Mux probe wrong (false positive / false negative).** The probe is aligned with the runtime's `selectBackend()` / `cmux.ts` checks (env var + command available), so divergence requires either (a) the env var being set without the matching CLI on PATH, or (b) the runtime's check changing in a future `pi-interactive-subagent` release. A false-negative probe (probe says no mux, mux actually available) drops the user into the inline branch — functionally correct but uses orchestrator context unnecessarily. A false-positive probe (probe says mux, runtime then disagrees) routes `subagent_run_serial` to the headless backend, which can't host an interactive session — `spec-designer` would receive its task without a user-driven Q&A surface. Mitigation: keep the probe rules in lockstep with `cmux.ts`; if a future change drifts, users can force the inline branch with `PI_SUBAGENT_MODE=headless` or one of the override phrases.
  - **User-input override false positive.** If the user's input contains "subagent" without meaning override (e.g. "build a subagent thing"), the substring match will trigger inline mode. Mitigation is the specific phrase set in Step 1b. Residual risk is documented; users wanting subagent dispatch can rephrase.
  - **Inline-branch session terminated mid-procedure.** No spec written, no commit, nothing to recover. User re-runs `/define-spec`. If a partial spec was written before termination, it stays on disk; user can delete or edit manually.
  - **`commit` skill failure.** Step 6 covers this. Report and stop; user resolves the underlying issue.
  - **Multi-subsystem input, user insists on a single spec.** The procedure's Step 3 scope-decomposition check handles this — user override is honored, an Open Question is recorded, and the spec is written. Downstream `generate-plan` may produce a coarse plan.
  ~~~

- [ ] **Step 2: Verify the orchestrator does not read the procedure body inline at parse time.** The procedure body is loaded **at dispatch time** (Step 2 of the orchestrator), not statically. Confirm the orchestrator does not inline `procedure.md` into the skill body itself (the skill must be readable independently of the procedure file).

  Run:
  ```bash
  rg -n "^## Step [1-8]" agent/skills/define-spec/SKILL.md
  ```
  Expected: 8 matches (Steps 1 through 8).

- [ ] **Step 3: Verify mux probe + override scan are present.** Run:
  ```bash
  rg -n "PI_SUBAGENT_MODE|PI_SUBAGENT_MUX|CMUX_SOCKET_PATH|TMUX|ZELLIJ|ZELLIJ_SESSION_NAME|WEZTERM_UNIX_SOCKET" agent/skills/define-spec/SKILL.md
  ```
  Expected: at least 7 matches (one per env-var checked: `PI_SUBAGENT_MODE`, `PI_SUBAGENT_MUX`, `CMUX_SOCKET_PATH`, `TMUX`, `ZELLIJ`, `ZELLIJ_SESSION_NAME`, `WEZTERM_UNIX_SOCKET` — matching what `pi-interactive-subagent`'s `cmux.ts` inspects, including the `muxPreference()` gate). Then confirm the probe gates each env-var detection on `command -v <cli>`:
  ```bash
  rg -n "command -v" agent/skills/define-spec/SKILL.md
  ```
  Expected: at least 4 matches (cmux, tmux, zellij, wezterm).

  ```bash
  rg -n -- "--no-subagent|without a subagent|without subagent|no subagent|skip subagent|inline" agent/skills/define-spec/SKILL.md
  ```
  Expected: at least 6 matches (the override phrase set), all inside Step 1b.

- [ ] **Step 4: Verify dispatch shape and procedure-via-systemPrompt delivery.** Run:
  ```bash
  rg -n "subagent_run_serial" agent/skills/define-spec/SKILL.md
  ```
  Expected: at least one match (in Step 3a's dispatch block).

  ```bash
  rg -n "systemPrompt: \"<full body of procedure.md" agent/skills/define-spec/SKILL.md
  ```
  Expected: at least one match.

  ```bash
  rg -n "wait: true" agent/skills/define-spec/SKILL.md
  ```
  Expected: at least one match. Open Step 3a and confirm the `wait: true` line sits **outside** the per-task object (it is a top-level `subagent_run_serial` option, not a per-task field).

  Open Step 3a and confirm the dispatch's per-task object includes `name`, `agent: "spec-designer"`, `task`, `systemPrompt`, `model`, `cli` — and **does not** include any `skills:` field. (A blanket `rg "skills:"` would also match the surrounding prose explaining the rule, so this check is by reading the code block.)

- [ ] **Step 5: Verify the failure-handling cases are documented.** Run:
  ```bash
  rg -n "SPEC_WRITTEN" agent/skills/define-spec/SKILL.md
  ```
  Expected: at least 3 matches (one in Step 4 (1), one each in Steps (2) and (3), plus possibly the success branch).

  ```bash
  rg -n "Recovery menu|Redo|Leave it|Delete it" agent/skills/define-spec/SKILL.md
  ```
  Expected: at least 4 matches (the menu header + three options).

  ```bash
  rg -n "model-tiers.json" agent/skills/define-spec/SKILL.md
  ```
  Expected: at least 4 matches across Step 3a's resolution prose, the three explicit failure messages, and the Edge-cases entry. Open Step 3a and confirm three distinct failure paths are spelled out: file missing/unreadable/non-JSON, `capable` missing/empty, and `dispatch.<provider>` missing/empty. Each must end the dispatch (stop, no fallback).

- [ ] **Step 6: Verify the orchestrator does not load the spec content into its own context.** Open Step 5 (the user-review pause) and confirm the orchestrator only references the spec path — it does not invoke `read`/`cat` on the path or otherwise pull the spec body into its own context. The user reads the spec directly. (A blanket regex check is not used here because the surrounding prose contains negative phrasing like "does not read the spec file"; this is a manual code-block read.)

- [ ] **Step 7: Commit.**
  ```bash
  git add agent/skills/define-spec/SKILL.md
  git commit -m "refactor(define-spec): collapse skill into thin orchestrator + dispatch"
  ```

**Acceptance criteria:**

- The orchestrator skill body contains only orchestration / dispatch / validation / commit-gate / recovery-menu logic — no procedure content.
  Verify: read `agent/skills/define-spec/SKILL.md` end-to-end and confirm there is no one-question-at-a-time Q&A guidance, no spec template fenced block, no codebase-survey or scope-decomposition instructions, and no architecture-round prose. The orchestrator may grow in raw line count from documenting probe rules and the recovery menu — what matters is that none of those lines belong to procedure content (which lives entirely in `procedure.md`).
- The orchestrator's mux probe matches the runtime's mux detection contract (env var + command available, using the env-var names the runtime actually inspects, and honoring `PI_SUBAGENT_MUX` as a single-backend preference), and the override-scan rules are documented.
  Verify: `rg -n "PI_SUBAGENT_MODE|PI_SUBAGENT_MUX|CMUX_SOCKET_PATH|TMUX|ZELLIJ|ZELLIJ_SESSION_NAME|WEZTERM_UNIX_SOCKET" agent/skills/define-spec/SKILL.md` returns at least 7 matches inside Step 1, and `rg -n "command -v" agent/skills/define-spec/SKILL.md` returns at least 4 matches (one per backend's CLI). The probe must NOT contain `WEZTERM_PANE` or bare `CMUX_*` checks. Open Step 1a and confirm the `PI_SUBAGENT_MUX` rule evaluates only the preferred backend's check and falls to `inline` (not the next backend) on failure.
- The orchestrator dispatches `spec-designer` via `subagent_run_serial` with `systemPrompt:` carrying the procedure body, both `model:` and `cli:` resolved from `model-tiers.json`, and **no `skills:`** parameter.
  Verify: open `agent/skills/define-spec/SKILL.md` Step 3a code block and confirm the per-task object includes `name`, `agent: "spec-designer"`, `task`, `systemPrompt: "<full body of procedure.md from Step 2>"`, `model`, `cli` — and **does not** include any `skills:` field. Confirm `wait: true` sits at the top level of `subagent_run_serial`, **not** inside the per-task object.
- Failure cases 1–3 (no `SPEC_WRITTEN:` line, file missing, non-zero exit code) and case 4 (user-review rejection menu) are all documented.
  Verify: `rg -n "SPEC_WRITTEN|Recovery menu|exitCode" agent/skills/define-spec/SKILL.md` returns matches inside Steps 4 and 7 covering all four cases.
- The mux-branch dispatch fails cleanly when `model-tiers.json` is missing, is non-JSON, lacks `capable`, or lacks `dispatch.<provider>` for the capable model's provider prefix.
  Verify: open Step 3a and the Edge cases block in `agent/skills/define-spec/SKILL.md` and confirm all three failure modes (file unreadable, `capable` missing, `dispatch.<provider>` missing) have explicit error messages and stop the dispatch. No silent fallback to a CLI default is permitted.
- The orchestrator never reads the spec body into its own context.
  Verify: open Step 5 of `agent/skills/define-spec/SKILL.md` and confirm the user-review pause references only the spec path (no `read`/`cat` invocation on the path, no instruction to inline the spec). The orchestrator validates path existence only.
- The procedure file is loaded at dispatch time (Step 2), not embedded in the skill body.
  Verify: open `agent/skills/define-spec/SKILL.md` Step 2 and confirm the prose explicitly says the procedure body is read fresh from disk, with a clear failure message when missing.

**Model recommendation:** standard

---

### Task 6: Update `agent/agents/planner.md` body to honor the optional `## Approach` section

**Files:**
- Modify: `agent/agents/planner.md`

**Steps:**

- [ ] **Step 1: Identify the right insertion point in the planner body.** The planner body has a `## Codebase Analysis` section followed by `## Plan Output`. The `## Approach` honoring rule belongs in the planner's spec-reading behavior — i.e. before plan output is produced. Add a new subsection at the end of `## Codebase Analysis` (or as a new sibling section just before `## Plan Output`, whichever fits the existing structure better) titled `## Approach handling`.

- [ ] **Step 2: Insert this exact subsection.**

  ~~~markdown
  ## Approach handling

  When you read a spec artifact (via the file-based input contract), check whether the spec contains a `## Approach` section. The section, if present, sits between `## Constraints` and `## Acceptance Criteria` and has this shape:

  ```
  ## Approach

  **Chosen approach:** ...

  **Why this over alternatives:** ...

  **Considered and rejected:**

  - Alternative A — why not
  - Alternative B — why not
  ```

  Behavior:

  - **Section present:** treat the chosen approach as a constraint on `Architecture summary` and `File Structure`. Expand the user-chosen approach into concrete file-level structure rather than picking a paradigm from scratch. Components, data flow, and types still come from your codebase analysis — only the macro paradigm-level choice is fixed.
  - **Need to deviate:** if your codebase analysis surfaces a reason the chosen approach will not work (e.g. it conflicts with an interface the spec did not surface), record the deviation as an entry under `## Risk Assessment` with a clear "spec said X; plan does Y because <reason>" justification. Do not silently override the spec's choice.
  - **Section absent:** preserve current behavior — pick the approach freely based on codebase analysis.

  This rule applies on **both** the initial generation pass and the edit pass (`generate-plan` Step 4.3). The edit pass dispatches the same planner agent, so the rule is inherited automatically.
  ~~~

- [ ] **Step 3: Verify the new subsection lands in the right place.** Run:
  ```bash
  rg -n "^## Approach handling$|^## Plan Output$|^## Codebase Analysis$" agent/agents/planner.md
  ```
  Expected: three matches, in this order: `## Codebase Analysis`, `## Approach handling`, `## Plan Output`. (The exact line numbers will vary.)

- [ ] **Step 4: Verify deviation handling is documented.** Run:
  ```bash
  rg -n "Risk Assessment" agent/agents/planner.md
  ```
  Expected: at least 2 matches (one in the existing required-sections list, one in the new `## Approach handling` subsection's deviation rule).

- [ ] **Step 5: Commit.**
  ```bash
  git add agent/agents/planner.md
  git commit -m "feat(planner): honor optional ## Approach section from spec"
  ```

**Acceptance criteria:**

- A new `## Approach handling` subsection is present in the planner body, between `## Codebase Analysis` and `## Plan Output`.
  Verify: `rg -n "^## Approach handling$|^## Plan Output$|^## Codebase Analysis$" agent/agents/planner.md` returns three matches with `## Codebase Analysis` < `## Approach handling` < `## Plan Output` by line number.
- Deviation behavior routes to `## Risk Assessment`.
  Verify: open `agent/agents/planner.md` and confirm the `## Approach handling` subsection contains the phrase "Risk Assessment" inside a deviation-handling rule.
- The rule is documented as inherited by the edit pass.
  Verify: `rg -n "edit pass" agent/agents/planner.md` returns at least one match inside the `## Approach handling` subsection.

**Model recommendation:** standard

---

### Task 7: Update `agent/agents/plan-reviewer.md` body to flag `## Approach` deviations as Warnings

**Files:**
- Modify: `agent/agents/plan-reviewer.md`

**Steps:**

- [ ] **Step 1: Add a new subsection to the plan-reviewer body.** Place it under `## Principles` or as a new sibling of `## Rules`, whichever fits the existing structure. Use this exact content:

  ~~~markdown
  ## Approach honoring

  When the spec artifact contains a `## Approach` section (between `## Constraints` and `## Acceptance Criteria`), the plan must honor the chosen approach. Check:

  - Does the plan's `Architecture summary` align with the spec's `**Chosen approach:**` paragraph?
  - Does the plan's `File Structure` reflect the chosen paradigm (e.g. if the spec chose "subagent dispatch", do the planned files include the subagent definition + dispatch site, not an inline-only design)?

  **Severity:** every deviation from the spec's chosen approach is flagged as a **Warning** — never downgraded to a Suggestion, never omitted. The planner may have a justified reason recorded in `## Risk Assessment`; if so, cite that justification inside the Warning so the user can see both the deviation and its rationale. The presence of a `Risk Assessment` entry does not suppress the Warning — surfacing the deviation is the contract that keeps the user's chosen approach visible end-to-end.

  When the spec lacks a `## Approach` section, this rule does not apply — preserve current review behavior.
  ~~~

- [ ] **Step 2: Verify the new subsection is present.** Run:
  ```bash
  rg -n "^## Approach honoring$" agent/agents/plan-reviewer.md
  ```
  Expected: exactly one match.

- [ ] **Step 3: Verify Warning severity is documented.** Run:
  ```bash
  rg -n "Warning|Warnings" agent/agents/plan-reviewer.md
  ```
  Expected: at least 2 matches (existing Severity / Issues Found references plus the new deviation-Warning rule).

- [ ] **Step 4: Verify the absence-of-section case preserves current behavior.** Run:
  ```bash
  rg -ni "preserve current review behavior|when the spec lacks a ## Approach section" agent/agents/plan-reviewer.md
  ```
  Expected: at least one match inside the new `## Approach honoring` subsection.

- [ ] **Step 5: Commit.**
  ```bash
  git add agent/agents/plan-reviewer.md
  git commit -m "feat(plan-reviewer): flag spec ## Approach deviations as warnings"
  ```

**Acceptance criteria:**

- The new `## Approach honoring` subsection is present in the plan-reviewer body.
  Verify: `rg -n "^## Approach honoring$" agent/agents/plan-reviewer.md` returns exactly one match.
- Deviations are flagged as Warnings (not Errors).
  Verify: open `agent/agents/plan-reviewer.md` `## Approach honoring` subsection and confirm the severity is documented as Warning.
- Absence of the section preserves current behavior.
  Verify: open `agent/agents/plan-reviewer.md` and confirm the new subsection ends with an explicit "section absent → preserve current behavior" statement.

**Model recommendation:** cheap

---

### Task 8: End-to-end smoke tests + downstream contract verification

**Files:**
- Test: (interactive — no test file written)

This task is a verification-only task. It runs the full pipeline against real inputs and confirms the acceptance criteria 3–10 from the spec. There is no automated test suite for skills/agents in this repo; smoke testing is manual. Each step below is a discrete smoke test.

**Steps:**

- [ ] **Step 1: Smoke test 1 — happy path, todo input, mux env.** Inside a multiplexer pane (cmux/tmux/zellij/wezterm), pick a todo with a scout brief on disk (e.g. one with `.pi/briefs/TODO-<id>-brief.md`). If no such todo exists, create a temporary brief at `.pi/briefs/TODO-<test-id>-brief.md` with a short codebase summary and a temporary `.pi/todos/<test-id>.md` with a clear, narrowly-scoped intent.

  Run:
  ```
  /define-spec TODO-<id>
  ```

  Confirm:
  - The orchestrator emits `Running spec design in subagent pane (mux detected, no override).`
  - A new mux pane spawns with `spec-designer` running.
  - You can answer Q&A interactively in the pane.
  - When you finish, the agent's last line is `SPEC_WRITTEN: <absolute path>`.
  - The orchestrator pauses with the review prompt referencing the path.
  - On user OK, the file is committed via the `commit` skill.
  - The committed spec contains `Source: TODO-<id>` and `Scout brief: .pi/briefs/TODO-<id>-brief.md` preamble lines.

  Verify after the run:
  ```bash
  git log -1 --name-only
  ```
  The committed file is the spec at `.pi/specs/<date>-<topic>.md`. Then:
  ```bash
  head -n 5 .pi/specs/<date>-<topic>.md
  ```
  Confirms preamble lines as above.

- [ ] **Step 2: Smoke test 2 — freeform input, inline branch via override.** Inside any environment, run:
  ```
  /define-spec write a brief description here, no subagent
  ```

  Confirm:
  - The orchestrator emits `Running spec design in this session (per --no-subagent / inline override).`
  - No subagent pane is spawned.
  - The procedure runs in the orchestrator's own session.
  - The written spec lacks `Source:` and `Scout brief:` preamble.
  - On user OK, the file is committed.

  Verify:
  ```bash
  head -n 5 .pi/specs/<the-newly-written-spec>.md
  ```
  No `Source:` or `Scout brief:` line above `## Goal`.

- [ ] **Step 3: Smoke test 3 — refine-existing-spec branch via recovery menu.** Pre-condition: smoke test 1 already ran and committed V1 at HEAD. This step exercises the existing-spec input shape **and** the recovery-menu Redo path together — the recovery menu only fires on rejection, so the run must be stopped at the review pause, not taken to completion.

  1. Run `/define-spec .pi/specs/<smoke-test-1-spec>.md` (i.e. the path of V1). The orchestrator picks the mux branch; the procedure detects the existing-spec input shape and runs the refine flow. The pane writes V2, overwriting V1 on disk (V1 stays safe in HEAD).
  2. At the orchestrator's review pause (SKILL.md Step 5), **reject** the draft.
  3. At the recovery menu (SKILL.md Step 7), pick option **(i) Redo**. The orchestrator re-invokes `/define-spec <path>`, which re-trips the procedure's existing-spec branch on the just-rejected V2.
  4. A new pane spawns. Confirm in the pane:
     - The subagent reads the existing draft as starting context.
     - Q&A focuses on filling gaps (it does not re-ask everything).
     - The spec at the same path is overwritten with V3.
     - The preamble lines (`Source:`, `Scout brief:`) survive both rewrites verbatim.
  5. At the review pause, accept. The orchestrator commits V3.

  Verify:
  ```bash
  git diff HEAD~1 HEAD -- .pi/specs/<that-spec>.md | head -n 30
  ```
  HEAD~1 is V1 (smoke test 1's commit); HEAD is V3 (the redo+accept commit). Diff shows refinements; the preamble lines are unchanged.
  ```bash
  head -n 5 .pi/specs/<that-spec>.md
  ```
  Confirms preamble lines preserved verbatim in V3.

- [ ] **Step 4: Smoke test 4(a) — architecture round skipped.** Run `/define-spec` with a deliberately mechanical input (e.g. "rename `foo` to `bar` across all skill files"). During Q&A, when the agent reaches the architecture-need assessment in procedure Step 5, accept its recommendation to skip. Confirm the written spec has **no** `## Approach` section.

  Verify:
  ```bash
  rg -n "^## Approach$" .pi/specs/<that-spec>.md
  ```
  Expected: zero matches.

- [ ] **Step 5: Smoke test 4(b) — architecture round runs.** Run `/define-spec` with a deliberately ambiguous-architecture input (e.g. "add a way to share scout briefs across worktrees"). Accept the agent's recommendation to run the architecture round. Pick one of the proposed approaches.

  Confirm the written spec has a `## Approach` section between `## Constraints` and `## Acceptance Criteria`, containing chosen-approach + rationale + considered-and-rejected alternatives.

  Verify:
  ```bash
  rg -n "^## Approach$|^## Constraints$|^## Acceptance Criteria$" .pi/specs/<that-spec>.md
  ```
  Expected: three lines, in this order: `## Constraints` < `## Approach` < `## Acceptance Criteria`.

  ```bash
  rg -n "Chosen approach:|Considered and rejected:" .pi/specs/<that-spec>.md
  ```
  Expected: at least 2 matches inside the `## Approach` block.

- [ ] **Step 6: Smoke test 5 — pane closed mid-Q&A.** Run smoke test 1 partway, then close the pane (or kill the subagent) before answering enough questions to write a spec. Confirm:

  - The orchestrator's wait completes with `state: failed` (or the equivalent terminal failure state).
  - The orchestrator emits the case-1 message:
    > Spec design did not complete: `spec-designer` exited without emitting `SPEC_WRITTEN: <path>`. Transcript: `<transcriptPath>`. No spec written, no commit attempted.
  - No spec file is written under `.pi/specs/`.
  - No commit is attempted.

  Verify:
  ```bash
  git status -- .pi/specs/
  ```
  Expected: clean (no new file).

- [ ] **Step 7: Downstream verification 8(a) — generate-plan provenance extraction on a spec produced by smoke test 1.** Run:
  ```
  /generate-plan .pi/specs/<smoke-test-1-spec>.md
  ```
  Confirm:
  - The planner reads the spec from disk.
  - The provenance extraction succeeds — the plan contains `**Source:** TODO-<id>` and `**Scout brief:** .pi/briefs/TODO-<id>-brief.md` in its header.
  - `plan-reviewer` runs and emits a verdict.

  Verify:
  ```bash
  rg -n "\*\*Source:\*\*|\*\*Scout brief:\*\*" .pi/plans/<the-resulting-plan>.md
  ```
  Expected: at least 2 matches.

- [ ] **Step 8: Downstream verification 8(b) — `## Approach` honored in planning.** Run `/generate-plan` against the spec from smoke test 4(b) (the one with `## Approach`). Confirm:
  - The planner's `Architecture summary` aligns with the chosen approach.
  - The plan-reviewer does **not** flag a Warning related to Approach deviation (since the plan honors it). Inspect the v1 review file at `.pi/plans/reviews/<plan-basename>-plan-review-v1.md`.

  Then exercise the deviation case **without** re-running `/generate-plan` (which would regenerate the plan from scratch and discard the deliberate edit). The actionable path dispatches `plan-reviewer` directly using the existing `agent/skills/generate-plan/review-plan-prompt.md` template, the same shape `generate-plan` Step 4.1 uses:

  1. Copy the plan file produced above to a sibling path so the original is preserved, e.g. `cp .pi/plans/<plan-basename>.md .pi/plans/<plan-basename>-deviation.md`. Edit `<plan-basename>-deviation.md` to flip the chosen approach (e.g. subagent → inline) — change the `Architecture summary`, the relevant `File Structure` entries, and a couple of task steps so the deviation is clearly visible to a reader. You may add a `## Risk Assessment` entry justifying the deviation or omit one entirely; either way, the reviewer's Warning must still fire (the `## Approach honoring` rule is "Warning every time, cite the justification if present", not "downgrade when justified").
  2. Read `agent/skills/generate-plan/review-plan-prompt.md` and fill its placeholders with the deviating plan path and the same spec used in smoke test 4(b):
     - `{PLAN_ARTIFACT}` → `Plan artifact: .pi/plans/<plan-basename>-deviation.md`
     - `{TASK_ARTIFACT}` → `Task artifact: .pi/specs/<smoke-4b-spec>.md`
     - `{SOURCE_TODO}` → empty (or copy from the v1 review's filled prompt if convenient)
     - `{SOURCE_SPEC}` → same value used by `/generate-plan` for the smoke-4b run
     - `{SCOUT_BRIEF}` → empty
     - `{ORIGINAL_SPEC_INLINE}` → empty (the spec is reachable on disk)
  3. Dispatch `plan-reviewer` directly via `subagent_run_serial`, mirroring `generate-plan` Step 4.1's dispatch shape:
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
  4. Write the reviewer's `finalMessage` to `.pi/plans/reviews/<plan-basename>-deviation-plan-review-v1.md`.

  Verify by reading the review file and confirming there is a Warning-severity entry that explicitly references the spec's `## Approach` section. The entry must NOT be under Errors. Then delete `<plan-basename>-deviation.md` and the deviation review file (they are throwaway smoke-test artifacts).

- [ ] **Step 9: Cross-CLI verification.** Re-run smoke test 1 with the resolved CLI being `claude` (the default per `model-tiers.json`'s `dispatch.anthropic = "claude"` mapping). Confirm the procedure body is delivered via `systemPrompt:` and the run completes cleanly. Then, if feasible, force a pi-CLI dispatch by temporarily editing `model-tiers.json` (or by a manual override of the resolved cli) and re-running. Confirm both runs produce identical artifact shapes.

  Verify:
  ```bash
  diff <(head -n 20 .pi/specs/<claude-run-spec>.md) <(head -n 20 .pi/specs/<pi-run-spec>.md)
  ```
  Expected: substantive content may differ (different conversations), but the artifact **shape** (preamble lines + section headings) is identical. Manual visual inspection.

- [ ] **Step 10: Regression check — `execute-plan` workflow.** The frontmatter normalization in Task 1 touched `coder`, `code-reviewer`, `code-refiner`, and `verifier`, all used by `execute-plan`. Confirm the workflow still runs end-to-end post-migration. Pick any small in-flight plan (or write a trivial one-task scratch plan whose task only edits a comment in a throwaway file) and run:
  ```
  /execute-plan <plan path>
  ```

  Confirm:
  - `coder` and `verifier` dispatch and complete normally; both have `spawning: false` so they must not attempt nested dispatch.
  - If a refinement loop runs, `code-refiner` successfully dispatches `code-reviewer` and `coder` (it deliberately does **not** carry `spawning: false`).
  - No frontmatter-related warnings or errors appear in any subagent transcript (e.g. "unknown field `maxSubagentDepth`" must not surface — that field was removed by Task 1 and the runtime never emitted such a warning, but cross-check anyway).

  Verify (post-run): the plan's task checkboxes are flipped to done by the orchestrator and any artifacts each task produces exist on disk.

- [ ] **Step 11: Regression check on existing specs.** Confirm the existing committed spec `.pi/specs/2026-04-24-pi-interactive-subagent-cutover.md` still feeds `generate-plan` correctly post-migration. Run:
  ```
  /generate-plan .pi/specs/2026-04-24-pi-interactive-subagent-cutover.md
  ```
  Confirm the planner runs and produces a plan, plan-reviewer runs and emits a verdict, and no new errors surface from the `## Approach handling` subsection (the existing spec has its own `## Approach` block, so this is also a positive cross-check that the planner honors it on a real spec).

  Verify:
  ```bash
  rg -n "^## Approach$" .pi/specs/2026-04-24-pi-interactive-subagent-cutover.md
  ```
  Expected: at least one match (confirms the existing spec has the section). Then read the freshly-generated plan and confirm the architecture summary aligns with that spec's chosen approach.

**Acceptance criteria:**

- Smoke test 1 produces a committed spec with the expected preamble.
  Verify: `git log -1 --name-only` after the run shows the spec file under `.pi/specs/`, and `head -n 5` of that file contains both `Source: TODO-<id>` and `Scout brief: .pi/briefs/TODO-<id>-brief.md` lines.
- Smoke test 2 produces a committed spec via the inline branch with no preamble.
  Verify: open the smoke-test-2 spec and confirm there is no `Source:` or `Scout brief:` line above `## Goal`.
- Smoke test 3 overwrites in place with preamble preserved.
  Verify: `git diff HEAD~1 HEAD -- .pi/specs/<that-spec>.md` shows refinements but unchanged preamble lines.
- Smoke test 4(a) writes a spec without the `## Approach` section; smoke test 4(b) writes a spec with it.
  Verify: `rg -n "^## Approach$" .pi/specs/<smoke-4a>.md` returns zero matches, and `rg -n "^## Approach$" .pi/specs/<smoke-4b>.md` returns at least one match.
- Smoke test 5 leaves no spec on disk and emits the case-1 failure message.
  Verify: `git status -- .pi/specs/` is clean after the failed run, and the orchestrator's emitted text contains both "did not complete" and "Transcript:" substrings.
- Downstream 8(a) succeeds — the resulting plan from a smoke-test-1 spec contains the provenance lines.
  Verify: `rg -n "\*\*Source:\*\*|\*\*Scout brief:\*\*" .pi/plans/<resulting-plan>.md` returns at least 2 matches.
- Downstream 8(b) — plan-reviewer flags an introduced deviation as a Warning, not Error.
  Verify: read `.pi/plans/reviews/<plan-basename>-deviation-plan-review-v1.md` (produced by the direct `plan-reviewer` dispatch on the deliberately-edited deviation plan) and confirm there is a Warning-severity entry that explicitly references the spec's `## Approach` section. The entry is **not** under Errors.
- Cross-CLI parity — the artifact shape is identical across pi and Claude dispatches.
  Verify: visually compare the two spec heads from Step 9; preamble lines and section headings are the same.
- Regression — `execute-plan` workflow still runs cleanly post-frontmatter normalization.
  Verify: the Step 10 run completes with `coder`, `verifier`, and (if a refinement loop runs) `code-refiner` + nested `code-reviewer`/`coder` dispatching without frontmatter errors; the test plan's task checkboxes are flipped to done.
- Regression — existing spec `.pi/specs/2026-04-24-pi-interactive-subagent-cutover.md` still feeds `generate-plan` cleanly.
  Verify: the Step 11 run produces a plan file under `.pi/plans/` with no error message; the plan's architecture summary aligns with the existing spec's `## Approach`.

**Model recommendation:** capable

---

## Dependencies

- Task 2 depends on: Task 1 (Task 2 modifies the same file's body that Task 1's frontmatter normalization touches; do them sequentially to avoid trivial merge friction).
- Task 3 depends on: Task 1 (the new `spec-designer` agent's frontmatter pattern matches the post-migration baseline; landing it before Task 1 would create an inconsistent baseline).
- Task 4 depends on: nothing (it creates a new file).
- Task 5 depends on: Task 3 and Task 4 (the orchestrator dispatches `spec-designer` and reads `procedure.md`; both must exist).
- Task 6 depends on: Task 2 (Task 6 modifies `agent/agents/planner.md`'s body — same file Task 2 just edited. Serialize after Task 2 so two parallel coders don't both edit `planner.md` at once. Task 2 is itself sequenced after Task 1, so Task 6 transitively depends on Task 1).
- Task 7 depends on: Task 1 (same reason for plan-reviewer).
- Task 8 depends on: Tasks 1–7 (smoke tests exercise the entire pipeline end-to-end).

Visualized:

```
Task 1 ─┬─ Task 2 ─ Task 6 ─┐
        ├─ Task 3 ──────────┤
        └─ Task 7 ──────────┤
                            ├─ Task 5 ─ Task 8
        Task 4 ─────────────┘
```

## Risk Assessment

- **Risk: User input matches an "inline" override substring incidentally.** Example: input "build a subagent thing" contains the substring "subagent". Mitigation: the override phrase set is specific (`--no-subagent`, `without a subagent`, `without subagent`, `no subagent`, `skip subagent`, `inline`), avoiding bare "subagent". Residual risk: a user typing "skip subagent for now, just write the spec" would trigger inline mode. Acceptable — they can re-run with explicit `--mux` framing if needed (no `--mux` flag is implemented; they would clear the override phrase and re-run). Documented in the orchestrator skill's edge cases.
- **Risk: Mux probe drifts from the runtime's `selectBackend()` / `cmux.ts` checks.** The orchestrator probes the same env vars + command-availability the runtime checks (`CMUX_SOCKET_PATH` + `cmux`, `TMUX` + `tmux`, `ZELLIJ`/`ZELLIJ_SESSION_NAME` + `zellij`, `WEZTERM_UNIX_SOCKET` + `wezterm`) and honors `PI_SUBAGENT_MUX` as a single-backend preference matching `getMuxBackend()`'s no-fallback semantics. A false-negative probe routes to the inline branch — functionally correct, just uses orchestrator context unnecessarily. A false-positive probe is more dangerous: `subagent_run_serial` would route to the headless backend and `spec-designer` would launch without an interactive Q&A surface. Mitigation: keep the probe in sync with `pi-interactive-subagent/pi-extension/subagents/cmux.ts` and `backends/select.ts`; users can force either branch with `PI_SUBAGENT_MODE=pane` / `headless` or the inline override phrases. Residual risk: a future `cmux.ts` change that adds a new backend would need a parallel probe update — flag if `pi-interactive-subagent` adds a multiplexer.
- **Risk: Procedure body grows large enough to bloat the `systemPrompt:`.** The procedure file is ~250 lines today; that's fine for `systemPrompt:`. If the procedure grows significantly past that, dispatch could hit prompt-size limits on some CLIs. Mitigation: monitor procedure file size; if it exceeds ~5 KB, factor out static reference material (spec template) into a separate file the procedure points to. Not in scope for this plan.
- **Risk: `code-refiner.md` post-migration depth control gap.** With `maxSubagentDepth: 1` removed and no replacement field in the contract, the only depth control is the prompt-level instruction in the agent body. Mitigation: documented in the spec's Open Questions; out of scope for this plan; revisit if a real depth-runaway problem appears.
- **Risk: Plan-reviewer's `## Approach` honoring rule fires Warnings on intentional, well-justified deviations.** This is by design — spec R11 requires every deviation to surface as a Warning so the user-chosen approach stays visible end-to-end. Mitigation: when a `## Risk Assessment` entry justifies the deviation, the reviewer cites that rationale inside the Warning so the user sees both the deviation and its reason at once. The Warning is never suppressed.
- **Risk: `procedure.md` accidentally treated as a discoverable skill.** Mitigation: the file has no `name:`/`description:` frontmatter and its first line is `# Spec Design Procedure` (an H1, not a `---` delimiter). The Skill discovery mechanism keys off frontmatter; without it, the file is invisible. Verified by Task 4 Step 2 grep + first-line check.

## Self-review

After writing the plan, the spec was checked:

1. **Spec coverage:**
   - R1 (three artifacts) — Tasks 3, 4, 5.
   - R2 (one canonical procedure body, two dispatch branches) — Task 4 (procedure body) + Task 5 (orchestrator dispatch with `systemPrompt:` + inline branch).
   - R3 (mux detection + override) — Task 5 Step 1.
   - R4 (three input shapes, type detection in procedure) — Task 4 Step 1 (procedure Step 1 table).
   - R5 (procedure step sequence) — Task 4 (procedure has 9 steps in order).
   - R6 (optional `## Approach` section in spec template) — Task 4 (procedure Step 8 template).
   - R7 (orchestrator does the minimum) — Task 5 (orchestrator reads procedure.md only; does not load spec body).
   - R8 (orchestrator owns commit gate) — Task 5 Steps 5–6.
   - R9 (failure handling) — Task 5 Step 4 (cases 1–3) + Step 7 (case 4).
   - R10 (frontmatter normalization across all 7 agents) — Tasks 1, 3 (Task 3 covers the new spec-designer agent which is the 7th).
   - R11 (downstream contract changes) — Tasks 6, 7.
   - R12 (no spec versioning) — implicitly preserved by overwrite-in-place behavior in procedure Step 8 + Task 5's recovery menu option (i).

2. **Placeholder scan:** no "TBD"/"TODO"/"implement later"/"similar to Task N"/"add appropriate" phrases survive in steps. Every step shows the content the engineer needs to write or the exact command to run. Every Verify recipe names the artifact, the check, and the success condition.

3. **Type consistency:**
   - `SPEC_WRITTEN: <absolute path>` is the same string in `procedure.md` (Task 4 Step 9) and the orchestrator validation (Task 5 Step 4). `spec-designer.md` carries no body and therefore no copy of the contract — the procedure (delivered as `systemPrompt:`) is the agent's only source of truth.
   - `## Approach` is the same heading in `procedure.md` (Task 4 spec template), `planner.md` (Task 6 honoring rule), and `plan-reviewer.md` (Task 7 honoring rule).
   - Frontmatter field names (`session-mode`, `spawning`, `auto-exit`, `thinking`, `tools`, `system-prompt`) match what the `pi-interactive-subagent` runtime parses (`system-prompt: append|replace` is supported by the runtime even though the README's Frontmatter Reference does not list it).
   - Override phrase set (`--no-subagent`, `without a subagent`, etc.) is identical between Task 5 Step 1b documentation, the orchestrator skill, and the spec's R3.
