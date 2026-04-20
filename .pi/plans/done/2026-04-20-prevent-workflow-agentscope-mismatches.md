# Plan: Prevent Workflow `agentScope` Mismatches

**Source:** TODO-bc0033cc
**Spec:** `.pi/specs/2026-04-20-prevent-workflow-agentscope-mismatches.md`

## Goal

Make it impossible for a workflow skill file (or its prompt/template files) to pin an explicit `agentScope` on a subagent dispatch, which would otherwise let a scope like `agentScope: "project"` change which agent names resolve at runtime and break orchestrations like `execute-plan`'s `coder` dispatch. The protection lives as an automated static guardrail — a test that walks the workflow-file set under `agent/skills/**/*.md` and fails if the literal substring `agentScope` appears anywhere in those files — rather than prose discipline or framework-specific runtime fallbacks.

## Architecture summary

- This repo's workflow is defined entirely as markdown under `agent/skills/` (skill frontmatter in `SKILL.md`, plus prompt/template files like `execute-plan/execute-task-prompt.md`, `execute-plan/verify-task-prompt.md`, `execute-plan/tdd-block.md`, `generate-plan/generate-plan-prompt.md`, etc.).
- The harness has a Node.js test runner wired up via `agent/package.json`:
  - Script: `"test": "node --experimental-strip-types --experimental-test-coverage --test extensions/**/*.test.ts"`
  - Existing tests live in `agent/extensions/*.test.ts` (e.g., `guardrails.test.ts`, `footer.test.ts`, `session-breakdown.test.ts`).
- A new test file in `agent/extensions/` will be auto-discovered by that same `npm test` glob. It will not register itself as a runtime extension; it only runs under `node --test`, so it serves purely as a static guardrail.
- No changes to agent definitions, runtime behavior, or framework fallback logic. The rule encodes "do not specify scope in workflow files" as a portable, framework-agnostic text-level invariant.

## Tech stack

- Node.js test runner (`node --test`) with `--experimental-strip-types` to execute TypeScript directly.
- Node built-ins only: `node:fs/promises`, `node:path`, `node:test`, `node:assert/strict`.
- No new dependencies. No changes to `package.json`.

## File Structure

- `agent/extensions/workflow-agent-scope.test.ts` (Create) — Static guardrail test that walks every `.md` file under `agent/skills/` and asserts none contains the literal substring `agentScope`. Reports violating file paths and 1-based line numbers so a regression is easy to locate and fix.

No other files in scope are modified. A current grep shows `agentScope` does not occur in any `agent/skills/**/*.md` file, so this plan does not remove existing occurrences — the guardrail simply enforces that clean state going forward.

## Tasks

### Task 1: Add the `agentScope` workflow-file guardrail test

**Files:**
- Create: `agent/extensions/workflow-agent-scope.test.ts`
- Test: `agent/extensions/workflow-agent-scope.test.ts` (same file — it is the test)

**Steps:**

- [ ] **Step 1: Confirm the current baseline is clean.** From the repo root, run `grep -rn "agentScope" agent/skills/ || echo CLEAN` and confirm the output is exactly `CLEAN` (the `|| echo CLEAN` branch fires only when `grep` exits non-zero with no matches). If any file under `agent/skills/` contains `agentScope`, stop and report it — this plan assumes baseline cleanliness and would need to be amended to first strip the existing occurrences. (This is an orchestrator-side verification, not code written yet.)

- [ ] **Step 2: Write the failing test first (RED).** Create `agent/extensions/workflow-agent-scope.test.ts` with a single `node:test` test named `"workflow skill files must not specify agentScope"` that:
  - Imports `test` from `node:test`, `assert` from `node:assert/strict`, `readdir` and `readFile` from `node:fs/promises`, and `path` from `node:path`.
  - Computes the workflow root as `path.resolve(import.meta.dirname, "..", "skills")` (i.e., `agent/skills/` relative to the test file). `import.meta.dirname` is available under the `--experimental-strip-types` runner used by the existing tests.
  - Defines an async helper `async function collectMarkdownFiles(dir: string): Promise<string[]>` that walks the directory tree and returns every file path ending in `.md`. Use `readdir(dir, { withFileTypes: true, recursive: true })`; filter entries to `.isFile()` and a `.md` extension; reconstruct full paths with `path.join(entry.parentPath ?? dir, entry.name)` (the `parentPath` property is what `readdir` with `recursive: true` populates on Node ≥ 20).
  - Defines `const FORBIDDEN = "agentScope"` as the literal string to scan for.
  - For each markdown file, reads its contents as UTF-8, splits on `\n`, and collects every 1-based line number where the literal `FORBIDDEN` substring appears. Do NOT regex-escape; a raw `line.includes(FORBIDDEN)` check is the required semantics — the spec says any occurrence (including examples, backticks, explanatory text) is a violation.
  - Accumulates violations as objects of shape `{ file: string; line: number; text: string }` (text trimmed for display) into an array.
  - At the end of the test, asserts `violations.length === 0`. On failure, the assertion message MUST list each violation as `<relative_path>:<line>: <trimmed line text>` so the failure is self-diagnosing. Compute the repo root once as `const repoRoot = path.resolve(import.meta.dirname, "..", "..")` (two levels up from the test file, which lives in `agent/extensions/`, so `repoRoot` is the repository root containing `agent/`), and use `path.relative(repoRoot, file)` to format each violation's path. This guarantees the emitted path begins with `agent/skills/...` regardless of the working directory from which `npm test` is invoked, so the failure message reads e.g. `agent/skills/execute-plan/SKILL.md:42: ...` and matches the acceptance-criterion expectations in Step 6.
  - Temporarily include a deliberate failure trigger so you can watch it fail: at the top of the test body, push a synthetic violation `{ file: "synthetic", line: 0, text: "RED sentinel" }` into the violations array before the file walk.

- [ ] **Step 3: Run the test and watch it fail (verify RED).** From `agent/`, run `npm test -- --test-name-pattern="workflow skill files must not specify agentScope"`. Confirm the test fails with an assertion message that includes `synthetic:0: RED sentinel`. This proves the assertion and message formatting are wired correctly — not a typo or import error.

- [ ] **Step 4: Remove the synthetic violation (transition to GREEN).** Delete the sentinel push added in Step 2. The test body now contains only the real file walk plus the final assertion.

- [ ] **Step 5: Run the test and watch it pass (verify GREEN).** From `agent/`, run `npm test -- --test-name-pattern="workflow skill files must not specify agentScope"`. Confirm the test passes. Then run `npm test` with no filter and confirm the full suite still passes (all pre-existing tests in `agent/extensions/*.test.ts` plus this new one).

- [ ] **Step 6: Prove the guardrail actually catches a violation.** Temporarily append a single line `<!-- agentScope: "project" -->` to the bottom of `agent/skills/execute-plan/SKILL.md`. Run `npm test -- --test-name-pattern="workflow skill files must not specify agentScope"` and confirm the test now fails with a message that includes `agent/skills/execute-plan/SKILL.md:<line>:` and the injected text. Then remove the injected line and re-run the full `npm test` to confirm everything is green again. This step demonstrates end-to-end that a regression introducing `agentScope` anywhere in a workflow skill file is caught by the automated check.

- [ ] **Step 7: Self-review for scope correctness.** Re-read `workflow-agent-scope.test.ts` and confirm:
  - The scan root is literally `path.resolve(import.meta.dirname, "..", "skills")` — it does NOT widen to the repo, to `.pi/`, to `agent/agents/`, or to docs. Narrow scope is a requirement from the spec's Non-Goals.
  - The substring match is case-sensitive and literal (`includes("agentScope")`). It must catch `agentScope`, `agentScope:`, and `agentScope: "project"` equally.
  - No code path silently skips files (e.g., do not add a skip list, do not filter by filename prefix, do not ignore fenced code blocks).
  - The failure message lists every violation, not just the first.

**Acceptance criteria:**

- A new test file exists at `agent/extensions/workflow-agent-scope.test.ts` that uses `node:test`, defines a test named `"workflow skill files must not specify agentScope"`, and scans every `.md` file under `agent/skills/` (recursively) for the literal substring `agentScope`.
  Verify: open `agent/extensions/workflow-agent-scope.test.ts` and confirm it (a) imports `test` from `node:test` and `assert` from `node:assert/strict`, (b) calls `test("workflow skill files must not specify agentScope", ...)` exactly once, (c) walks `path.resolve(import.meta.dirname, "..", "skills")` recursively via `readdir({ recursive: true, withFileTypes: true })` picking only entries whose name ends in `.md`, and (d) checks each file with a literal `line.includes("agentScope")` (no regex, no escaping, no case-folding).

- The test scope is restricted to `agent/skills/**/*.md`. It does not read or assert against any file outside that subtree.
  Verify: `grep -n "skills" agent/extensions/workflow-agent-scope.test.ts` shows the scan root resolved under `..", "skills"` (or a direct literal `agent/skills`), and `grep -nE "agent/agents|\\.pi|docs|README" agent/extensions/workflow-agent-scope.test.ts` returns no matches — confirming no other paths are hard-coded as scan targets.

- The test fails with a clear, specific message whenever `agentScope` appears in any workflow skill file. The message must include the offending file path and 1-based line number for every occurrence found.
  Verify: append a single line `<!-- agentScope: "project" -->` to the bottom of `agent/skills/execute-plan/SKILL.md`, then from `agent/` run `npm test -- --test-name-pattern="workflow skill files must not specify agentScope"`; confirm exit code is non-zero and the failure output contains `agent/skills/execute-plan/SKILL.md:` followed by a line number and the injected text. Then delete the injected line and re-run — confirm the test passes again (exit code 0) before considering this criterion met.

- The test currently passes, confirming that no workflow skill file contains `agentScope` today.
  Verify: from `agent/` run `npm test -- --test-name-pattern="workflow skill files must not specify agentScope"` and confirm the process exits 0, stdout contains a line matching `✔ workflow skill files must not specify agentScope` (node `--test` spec-reporter output — the default when `agent/package.json`'s `test` script runs without `--test-reporter=tap`), and stdout contains no line starting with `✖`.

- The full existing test suite continues to pass after this change.
  Verify: from `agent/` run `npm test` with no filter and confirm exit code is 0, stdout contains a summary line matching `ℹ fail 0` (spec-reporter summary), and stdout contains no line beginning with `✖ ` (which spec-reporter uses for failing test cases).

- The guardrail cannot be bypassed by narrowing to "dispatch-only" occurrences or by whitelisting example text. Any textual occurrence of `agentScope` in an in-scope file is treated as a violation.
  Verify: open `agent/extensions/workflow-agent-scope.test.ts` and confirm the matching logic is a literal `.includes("agentScope")` against each line with no surrounding conditionals that exclude fenced code blocks, inline backticks, HTML comments, block quotes, or lines containing the word "example"/"sample"/etc. There must be no skip list of files and no per-line exceptions.

**Model recommendation:** cheap

## Dependencies

- Task 1 has no dependencies. It is the only task.

## Risk Assessment

- **Risk: `readdir({ recursive: true, withFileTypes: true })` behavior across Node versions.** The recursive option was added in Node 18 and the `parentPath` property stabilized in Node 20. `agent/package.json` pins `@types/node: ^22`, and the existing tests already use `node --experimental-strip-types --test`, implying Node ≥ 22. Mitigation: the test reads paths via `path.join(entry.parentPath ?? dir, entry.name)` with a fallback to the scan root so it behaves correctly even if `parentPath` is undefined on an older runtime; the failure mode then is overly-broad-but-correct paths, not missed files.
- **Risk: The check is purely textual and might false-positive on documentation that discusses `agentScope` deliberately.** This is intentional, not a risk: the spec explicitly requires that any occurrence — including examples or explanatory text — count as a violation. Any future documentation that genuinely needs to mention `agentScope` belongs outside `agent/skills/` (e.g., in `docs/` or `.pi/todos/`), which is out of scope for the guardrail.
- **Risk: Someone adds a new workflow file type (e.g., `.mdx`, `.txt`) that bypasses the `.md` extension filter.** Mitigation: this repo currently uses only `.md` for workflow content, matching the spec's phrasing "workflow skill files and their prompt/template files". If that changes, the test can be extended in one place — the extension check. This is accepted as a known limit rather than over-engineered in this plan.
- **Risk: `npm test` runs `extensions/**/*.test.ts`, so the new file must be `.test.ts` and live under `agent/extensions/`.** Mitigation: the filename is `workflow-agent-scope.test.ts` and the location is `agent/extensions/`, matching the glob exactly.
- **Risk: The test walks disk at test time; path-relative logic must be correct when `npm test` is invoked from `agent/` (which is the existing convention — `package.json` sits in `agent/`).** Mitigation: the scan root is computed from `import.meta.dirname`, which is the directory of the test file itself (`agent/extensions/`), making the scan root `agent/skills/` regardless of the working directory the test runner is launched from.

## Test Command

```bash
npm test
```
