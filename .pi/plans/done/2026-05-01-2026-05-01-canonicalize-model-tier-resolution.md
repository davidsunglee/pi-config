# Canonicalize Model-Tier and Dispatch Resolution Across Skills

**Source:** TODO-d4f1c8a2
**Spec:** .pi/specs/2026-05-01-canonicalize-model-tier-resolution.md

## Goal

Replace the duplicated, drifted model-tier and dispatch-CLI resolution prose scattered across `agent/skills/` with a single canonical reference document at `agent/skills/_shared/model-tier-resolution.md`, and apply a uniform strict-everywhere policy for general worker and reviewer dispatch. Each consumer skill points at the canonical doc for the algorithm and emits a fixed set of byte-equal failure-message templates parameterized only on `<agent>`, `<tier>`, `<provider>`, `<model>`. Coordinator dispatch keeps its existing pi-only chain semantics in `agent/skills/_shared/coordinator-dispatch.md` but is updated so worker re-resolution inside coordinators uses the strict canonical policy (no silent default-to-pi).

## Architecture summary

The change introduces one new shared file (`model-tier-resolution.md`) and updates one existing shared file plus seven consumer files. The two `_shared/` files form the complete dispatch-resolution policy: the canonical doc owns the primitive operations, the strict-by-default policy, and the four exact failure templates; `coordinator-dispatch.md` continues to own the four-tier coordinator chain and its hard-stop messages, with the canonical doc and coordinator-dispatch.md cross-referencing each other (canonical doc points at coordinator-dispatch.md for chain logic; coordinator-dispatch.md points at canonical doc for primitive lookups). Consumer files lose the inlined 3-or-4-step resolution algorithm and the inlined "default to pi" rule; they retain only their role-to-tier mapping, an explicit reference to the canonical doc, and the parameter values (`<agent>`, `<tier>`) needed to substitute into the canonical templates. Provenance-validation sites in `refine-code/SKILL.md` and `refine-plan/SKILL.md` keep their per-status validation rules but reference the canonical doc for the primitive lookups (tier-path resolution and `dispatch[<provider>]` lookup).

## Tech stack

- Markdown skill definitions and prompt templates under `agent/skills/`
- JSON model matrix at `~/.pi/agent/model-tiers.json` (top-level `capable`/`standard`/`cheap`, `crossProvider` object, `dispatch` object mapping provider prefixes → CLI names — schema unchanged by this work)
- `pi-interactive-subagent` extension's `subagent_run_serial` / `subagent_run_parallel` orchestration calls with explicit `model` and `cli` per dispatch
- TypeScript test suite at `agent/extensions/` runs via `npm test --prefix agent` — markdown-only changes will not affect it; running it confirms no extension sources were touched accidentally
- `grep -rn` and shell text inspection are the audit tools — no new linters or CI checks are introduced (per spec Constraints)

## File Structure

- `agent/skills/_shared/model-tier-resolution.md` (Create) — canonical reference for general worker/reviewer dispatch resolution; defines the input file location, expected JSON shape, three primitive operations, the strict-by-default policy, the four exact failure-message templates, the coordinator-dispatch pointer, and the explicit skill-specific fallback chain list.
- `agent/skills/_shared/coordinator-dispatch.md` (Modify) — add a reference to the canonical doc for primitive lookups inside `## Procedure` step 2; update `## Note on worker subagents` so worker re-resolution uses the strict canonical policy (no default-to-pi); retain the four-tier chain, the skip-silently-on-non-pi rule, and the two hard-stop messages verbatim.
- `agent/skills/define-spec/SKILL.md` (Modify) — Step 3a: replace the three custom failure messages and inlined algorithm with a reference to the canonical doc plus `<agent> = spec-designer`, `<tier> = capable` parameter values; the role-to-tier mapping (spec-designer uses `capable`, no fallback) and the dispatch block remain.
- `agent/skills/generate-plan/SKILL.md` (Modify) — Step 2: replace the inlined "default to pi" algorithm with a reference to the canonical doc; keep the role-to-tier mapping (`capable` for plan generation) AND the explicit `crossProvider.capable` → `capable` fallback note (preserved per spec Requirements §3); remove the cross-reference to "execute-plan Step 6 for the full resolution algorithm" since the algorithm now lives in the canonical doc.
- `agent/skills/execute-plan/SKILL.md` (Modify) — three dispatch sites: Step 6 (general task dispatch — replace inlined algorithm with reference to canonical doc, keep tier-mapping table and `(m) Better model` escalation rule); the test-runner subsection (replace "surface the resolution failure" prose with reference to canonical doc + parameter values for `<agent> = test-runner`, `<tier> = crossProvider.cheap`); Step 11.2 verifier dispatch (replace its strict-but-bespoke "do not silently fall back" prose with reference to canonical doc + parameter values for `<agent> = verifier`, `<tier> = crossProvider.standard`).
- `agent/skills/requesting-code-review/SKILL.md` (Modify) — Step 2b: replace the cross-reference to "execute-plan Step 6 for the full algorithm" and the "default to pi" sentence with a reference to the canonical doc; keep the reviewer-tier rule (`capable`).
- `agent/skills/refine-code/SKILL.md` (Modify) — Step 6 (provenance validation): keep per-status validation rules; reference the canonical doc for the primitive lookups (tier-path resolution and `dispatch[<provider>]` lookup) instead of leaving the lookups implicit.
- `agent/skills/refine-code/refine-code-prompt.md` (Modify) — `### Dispatch resolution`: replace the 4-step inlined algorithm with a reference to the canonical doc (strict, no default-to-pi); keep the model-tier role assignments block (`crossProvider.capable` first-pass/final-verification, `standard` hybrid re-review, `capable` remediator).
- `agent/skills/refine-plan/SKILL.md` (Modify) — Step 9.5 (provenance validation): same treatment as `refine-code/SKILL.md` Step 6 — reference canonical doc for primitives, keep per-status validation rules.
- `agent/skills/refine-plan/refine-plan-prompt.md` (Modify) — `### Dispatch resolution`: same treatment as `refine-code-prompt.md` — replace inlined algorithm with canonical-doc reference; keep `crossProvider.capable` primary / `capable` fallback / `capable` planner-edit role assignments. The primary→fallback chain is named in the canonical doc's "explicit skill-specific fallback chains" section, so it is not flagged as stale duplication during audit.

## Tasks

### Task 1: Create the canonical model-tier-resolution doc

**Files:**

- Create: `agent/skills/_shared/model-tier-resolution.md`

**Steps:**

- [ ] **Step 1: Create the new file** at `agent/skills/_shared/model-tier-resolution.md`.

- [ ] **Step 2: Add the title and `## Why this exists` section.** Use a level-1 title `# Model-Tier and Dispatch Resolution`. Then a `## Why this exists` section explaining: this doc is the single source of truth for general worker/reviewer dispatch resolution; the strict-by-default policy means a missing `model-tiers.json`, a missing selected tier, a missing `dispatch` map, or a missing `dispatch.<provider>` entry stops with the corresponding canonical template; coordinator dispatch is governed by `agent/skills/_shared/coordinator-dispatch.md` and uses these primitives but applies its own four-tier chain semantics.

- [ ] **Step 3: Add the `## Input` section** describing: the file location `~/.pi/agent/model-tiers.json`; the expected JSON shape with top-level tier keys (`capable`, `standard`, `cheap`) each mapping to a non-empty model string; the optional `crossProvider` object with the same three tier names each mapping to a non-empty model string; the required `dispatch` object mapping provider prefixes (e.g. `anthropic`, `openai-codex`) to CLI names (e.g. `claude`, `pi`).

- [ ] **Step 4: Add the `## Primitive operations` section** with three numbered primitives: (1) **Tier-path resolution** — given a tier path that may be a top-level key (`capable`, `standard`, `cheap`) or a nested path (`crossProvider.cheap`, `crossProvider.standard`, `crossProvider.capable`), look up the corresponding non-empty model string from the parsed JSON; (2) **Provider-prefix extraction** — given a model string of shape `<provider>/<model-name>`, return the substring before the first `/`; (3) **Dispatch lookup** — given a provider prefix, look up `dispatch[<prefix>]` and return the resolved CLI string.

- [ ] **Step 5: Add the `## Strict-by-default policy` section** stating: every general worker/reviewer dispatch site MUST stop on any of the four failure conditions in the next section; there is no silent fallback to `"pi"` (or any other CLI default) when the dispatch map or a provider entry is absent; consumers emit the corresponding canonical template byte-equal after parameter substitution; consumers do not extend, paraphrase, or wrap the templates.

- [ ] **Step 6: Add the `## Failure-message templates` section** with the four exact templates, each in its own fenced code block to make byte-equal copying obvious. The templates are parameterized only on `<agent>`, `<tier>`, `<provider>`, and `<model>`; the surrounding prose names each template so consumers can refer to them by name. Include exactly:

  ```
  ~/.pi/agent/model-tiers.json missing or unreadable — cannot dispatch <agent>.
  ```

  ```
  model-tiers.json has no usable "<tier>" model — cannot dispatch <agent>.
  ```

  ```
  model-tiers.json has no dispatch map — cannot dispatch <agent>.
  ```

  ```
  model-tiers.json has no dispatch.<provider> mapping for <tier> model <model> — cannot dispatch <agent>.
  ```

  Label them as Template (1) Missing/unreadable file, Template (2) Missing/empty selected tier, Template (3) Missing `dispatch` map, Template (4) Missing/empty `dispatch.<provider>`. Note that `<tier>` may be a nested path like `crossProvider.cheap` and is substituted verbatim (e.g., Template (2) becomes `model-tiers.json has no usable "crossProvider.cheap" model — cannot dispatch test-runner.` for the test-runner site).

- [ ] **Step 7: Add the `## Coordinator dispatch` section** stating: coordinator agents (`code-refiner`, `plan-refiner`) MUST run on `pi` because they need subagent-orchestration tools (`subagent_run_serial` / `subagent_run_parallel`); the four-tier coordinator chain procedure, the skip-silently-on-non-pi rule, and the two hard-stop messages live in `agent/skills/_shared/coordinator-dispatch.md` (link the file by relative path `./coordinator-dispatch.md`); this doc supplies the primitive operations the coordinator chain consumes (tier-path resolution, provider-prefix extraction, `dispatch[<prefix>]` lookup), but does not duplicate the chain semantics. Also state that worker re-resolution inside coordinator prompts uses the strict canonical policy from this doc (the coordinator-dispatch file's `## Note on worker subagents` section enforces this).

- [ ] **Step 8: Add the `## Skill-specific fallback chains` section** listing every legitimate skill-local fallback chain so audits can distinguish them from stale duplicated general-resolution algorithms. List exactly one entry: `agent/skills/refine-plan/refine-plan-prompt.md` plan-reviewer pair: primary `crossProvider.capable`, fallback `capable` (used when the primary dispatch fails). State that this chain is owned by the named file and is not a general-resolution fallback. Note that `agent/skills/refine-code/refine-code-prompt.md` does not use a primary/fallback chain — its `crossProvider.capable` (first-pass/final-verification), `standard` (hybrid re-review), and `capable` (remediator) are role-to-tier mappings, not a fallback chain.

- [ ] **Step 9: Add a `## Use from consumers` section** describing the consumer contract in one paragraph: a consumer references this doc, supplies the values of `<agent>` and `<tier>` for its dispatch site, and emits the corresponding template byte-equal on each failure condition; consumers MUST NOT inline the algorithm or paraphrase the templates; consumers MAY retain their role-to-tier mapping, retry/escalation rules, or provenance-validation rules separately. Cross-reference the named consumer files: `agent/skills/define-spec/SKILL.md` Step 3a, `agent/skills/generate-plan/SKILL.md` Step 2, `agent/skills/execute-plan/SKILL.md` Step 6, the test-runner subsection, and Step 11.2 verifier dispatch, `agent/skills/requesting-code-review/SKILL.md` Step 2b, `agent/skills/refine-code/SKILL.md` Step 6, `agent/skills/refine-code/refine-code-prompt.md`, `agent/skills/refine-plan/SKILL.md` Step 9.5, `agent/skills/refine-plan/refine-plan-prompt.md`.

**Acceptance criteria:**

- The file `agent/skills/_shared/model-tier-resolution.md` exists and is non-empty.
  Verify: run `test -s agent/skills/_shared/model-tier-resolution.md` and confirm exit code 0.
- The file contains a level-1 title and the eight required sections (`## Why this exists`, `## Input`, `## Primitive operations`, `## Strict-by-default policy`, `## Failure-message templates`, `## Coordinator dispatch`, `## Skill-specific fallback chains`, `## Use from consumers`).
  Verify: run `grep -nE "^(# |## )" agent/skills/_shared/model-tier-resolution.md` and confirm the output contains exactly the lines `# Model-Tier and Dispatch Resolution`, `## Why this exists`, `## Input`, `## Primitive operations`, `## Strict-by-default policy`, `## Failure-message templates`, `## Coordinator dispatch`, `## Skill-specific fallback chains`, `## Use from consumers` (one each, in this order).
- The four canonical failure templates appear byte-equal in the doc with the correct parameter placeholders.
  Verify: run each of the following four greps and confirm at least one match for each:
  `grep -nF '~/.pi/agent/model-tiers.json missing or unreadable — cannot dispatch <agent>.' agent/skills/_shared/model-tier-resolution.md`;
  `grep -nF 'model-tiers.json has no usable "<tier>" model — cannot dispatch <agent>.' agent/skills/_shared/model-tier-resolution.md`;
  `grep -nF 'model-tiers.json has no dispatch map — cannot dispatch <agent>.' agent/skills/_shared/model-tier-resolution.md`;
  `grep -nF 'model-tiers.json has no dispatch.<provider> mapping for <tier> model <model> — cannot dispatch <agent>.' agent/skills/_shared/model-tier-resolution.md`.
- The `## Coordinator dispatch` section names `code-refiner` and `plan-refiner` as the coordinator agents that must run on `pi` and links to `coordinator-dispatch.md`.
  Verify: open `agent/skills/_shared/model-tier-resolution.md`, find the `## Coordinator dispatch` section, and confirm the section body contains the literal substrings `code-refiner`, `plan-refiner`, `pi`, `subagent_run_serial`, and a link target `coordinator-dispatch.md`.
- The `## Skill-specific fallback chains` section names the `refine-plan-prompt.md` plan-reviewer primary/fallback pair as the only skill-local fallback chain.
  Verify: open `agent/skills/_shared/model-tier-resolution.md`, find the `## Skill-specific fallback chains` section, and confirm the section body contains both `crossProvider.capable` and `capable` and names `refine-plan-prompt.md` (or `agent/skills/refine-plan/refine-plan-prompt.md`).

**Model recommendation:** standard

---

### Task 2: Update `_shared/coordinator-dispatch.md` to reference canonical doc and switch worker subagent rule to strict

**Files:**

- Modify: `agent/skills/_shared/coordinator-dispatch.md`

**Steps:**

- [ ] **Step 1: Add a primitive-lookups reference inside `## Procedure` step 2.** In the existing `## Procedure` step 2 (the four-tier chain iteration step), add a sentence at the start of the step body that says something like: `For the tier-path resolution, provider-prefix extraction, and dispatch[<prefix>] lookup, follow the primitives in [model-tier-resolution.md](./model-tier-resolution.md). The chain semantics below are coordinator-specific.` This keeps the step's existing example chain intact (`crossProvider.standard` → `openai-codex/gpt-5.4` → `dispatch["openai-codex"]` → `pi`) while clarifying that the primitive operations live in the canonical doc.

- [ ] **Step 2: Rewrite the `## Note on worker subagents` section so worker re-resolution uses the strict canonical policy.** Replace the existing paragraph body with text that retains the framing (workers do not need to run on `pi`; coordinator re-resolves `(model, cli)` per worker dispatch; per-coordinator-prompt assignments name the tier; this shared procedure governs the coordinator hop only) but substitutes the strict policy for the lenient one. Specifically: (a) drop the literal phrase `defaulting to "pi" when the prefix has no entry` (or any equivalent rephrase); (b) state explicitly that worker re-resolution follows the strict procedure in [model-tier-resolution.md](./model-tier-resolution.md), with no silent default to `pi` (or any other CLI default) on missing dispatch entries; (c) reference the four canonical failure templates as the only sanctioned outcomes when worker re-resolution fails. The section title `## Note on worker subagents` stays exactly as-is. Do not alter the `## Why this exists`, `## Procedure` (other than Step 1's added sentence), or `## Hard-stop conditions` sections.

- [ ] **Step 3: Re-read the file end-to-end** and confirm that the four-tier chain (`crossProvider.standard`, `standard`, `crossProvider.capable`, `capable`), the skip-silently-on-non-pi rule, and the two hard-stop verbatim error messages are preserved exactly.

**Acceptance criteria:**

- `## Procedure` step 2 references the canonical doc by relative path for the primitive operations.
  Verify: run `grep -nF './model-tier-resolution.md' agent/skills/_shared/coordinator-dispatch.md` and confirm at least one match falls inside the `## Procedure` step 2 block (lines between `## Procedure` and `## Hard-stop conditions`).
- The `## Note on worker subagents` section no longer contains the literal phrase `defaulting to "pi" when the prefix has no entry` or any equivalent default-to-pi clause.
  Verify: run `grep -nF 'defaulting to "pi"' agent/skills/_shared/coordinator-dispatch.md` and confirm zero matches; then run `grep -nF 'default to "pi"' agent/skills/_shared/coordinator-dispatch.md` and confirm zero matches; then read the `## Note on worker subagents` section (lines between that heading and end-of-file) and confirm no clause asserts a default-to-pi behavior (negation phrases like "no silent default to pi" are allowed).
- The `## Note on worker subagents` section references the canonical doc for strict worker re-resolution.
  Verify: open `agent/skills/_shared/coordinator-dispatch.md`, find the `## Note on worker subagents` section, and confirm its body contains a relative link or path reference to `model-tier-resolution.md` AND the substring `strict` (case-insensitive) in the context of worker re-resolution.
- The four-tier chain order, skip-silently rule, and two hard-stop verbatim error messages are unchanged.
  Verify: run `grep -nF 'crossProvider.standard, standard, crossProvider.capable, capable' agent/skills/_shared/coordinator-dispatch.md` and confirm at least one match. Then run `grep -nF 'coordinator-dispatch: no model tier in [crossProvider.standard, standard, crossProvider.capable, capable] resolves to a pi CLI — coordinator cannot dispatch subagents.' agent/skills/_shared/coordinator-dispatch.md` and confirm exactly one match. Then run `grep -nF 'coordinator-dispatch: all pi-eligible tiers failed; last attempt: <model> via pi — <error>' agent/skills/_shared/coordinator-dispatch.md` and confirm exactly one match.

**Model recommendation:** standard

---

### Task 3: Update `define-spec/SKILL.md` Step 3a to reference canonical doc and emit canonical templates

**Files:**

- Modify: `agent/skills/define-spec/SKILL.md`

**Steps:**

- [ ] **Step 1: Locate Step 3a.** It begins with the heading `### 3a. Mux branch — dispatch \`spec-designer\`` and currently contains three bullets describing the three custom failure messages plus a paragraph stating the modes are strict.

- [ ] **Step 2: Replace the algorithm prose with a canonical-doc reference.** Substitute the three bullets and the "All three failure modes are strict" paragraph with a single block that: (a) opens with `Resolve both \`model\` and \`cli\` from \`~/.pi/agent/model-tiers.json\` per the canonical procedure in [\`agent/skills/_shared/model-tier-resolution.md\`](../_shared/model-tier-resolution.md).`; (b) supplies the parameter values for this dispatch as a short list — `<agent> = spec-designer`, `<tier> = capable` (no fallback); (c) states explicitly: `On any of the four documented failure conditions, emit the corresponding canonical template byte-equal with the parameter values above and stop. Do not dispatch. Do not fall back to a CLI default.`

- [ ] **Step 3: Update the dispatch block immediately below.** The existing fenced `subagent_run_serial` block's `model:` and `cli:` placeholder labels (`<capable tier from model-tiers.json>` and `<resolved dispatch cli>`) are unchanged; the surrounding prose can stay. The only edit here is to confirm the dispatch block still reads correctly after Step 2's prose replacement.

- [ ] **Step 4: Update the Edge Cases entry for `model-tiers.json`.** Find the bullet that currently reads `**\`model-tiers.json\` missing / no \`capable\` model / no \`dispatch.<provider>\` mapping.** ...` near the bottom of the file. Replace its body so it points at the canonical doc and the four templates, e.g.: `Fail at Step 3a per the canonical procedure in \`agent/skills/_shared/model-tier-resolution.md\` — emit the corresponding template (1)–(4) byte-equal with \`<agent> = spec-designer\`, \`<tier> = capable\` and stop. Do not fall back to a CLI default — the explicit resolution keeps dispatch on the Opus-tier / Claude-CLI route.` The bullet header (the bolded condition list) should be retained; only the body changes.

- [ ] **Step 5: Self-check that no inlined algorithm remains in Step 3a.** The three former custom failure messages (`cannot resolve dispatch model/cli for spec-designer`, `cannot dispatch spec-designer.` standalone, and `mapping for capable model <capable>`) must NOT appear anywhere in the file after the edit.

**Acceptance criteria:**

- Step 3a references the canonical doc by relative path.
  Verify: run `grep -nF '../_shared/model-tier-resolution.md' agent/skills/define-spec/SKILL.md` and confirm at least one match falls inside the `### 3a. Mux branch` block (lines between that heading and `### 3b. Inline branch`).
- Step 3a no longer contains the three former custom failure-message strings.
  Verify: run `grep -nF 'cannot resolve dispatch model/cli for spec-designer' agent/skills/define-spec/SKILL.md` and confirm zero matches. Then run `grep -nE 'mapping for capable model' agent/skills/define-spec/SKILL.md` and confirm zero matches.
- Step 3a names `spec-designer` as `<agent>` and `capable` as `<tier>` for the canonical templates.
  Verify: open `agent/skills/define-spec/SKILL.md`, find the `### 3a. Mux branch` block, and confirm its body contains the literal substrings `spec-designer` AND `capable` AND a reference to `model-tier-resolution.md` (relative path).
- The Edge Cases bullet for `model-tiers.json` references the canonical doc and lists `spec-designer` as the agent.
  Verify: open `agent/skills/define-spec/SKILL.md`, find the bullet beginning with `**\`model-tiers.json\` missing` in the `## Edge cases` section, and confirm its body references `model-tier-resolution.md` (or `_shared/model-tier-resolution.md`) AND the substring `spec-designer`.
- The dispatch fenced block in Step 3a still passes both `model:` and `cli:` from `model-tiers.json` resolution.
  Verify: open `agent/skills/define-spec/SKILL.md`, find the fenced `subagent_run_serial` block in Step 3a, and confirm it still contains the lines `model: "<capable tier from model-tiers.json>"` and `cli: "<resolved dispatch cli>"` (or near-identical placeholder values that reference the canonical resolution).

**Model recommendation:** standard

---

### Task 4: Update `generate-plan/SKILL.md` Step 2 to reference canonical doc

**Files:**

- Modify: `agent/skills/generate-plan/SKILL.md`

**Steps:**

- [ ] **Step 1: Locate Step 2.** It is the section headed `## Step 2: Resolve model tiers` and contains the model-matrix `cat` snippet, the role-to-tier table, the `### Dispatch resolution` subsection, and an `If \`model-tiers.json\` doesn't exist...` line.

- [ ] **Step 2: Keep the role-to-tier table and matrix-read snippet unchanged.** The `cat ~/.pi/agent/model-tiers.json | python3 -c ...` snippet, the `Model assignments:` table with `Plan generation | \`capable\` from model-tiers.json`, and the sentence `Review and edit tier roles now live inside the \`refine-plan\` skill...` remain as-is.

- [ ] **Step 3: Replace the `### Dispatch resolution` subsection.** The current subsection contains: a paragraph saying "After resolving the model for each role, also resolve its dispatch target...See execute-plan Step 6 for the full resolution algorithm. In brief: extract the provider prefix..., default to `"pi"` if absent." plus a paragraph about `crossProvider.capable` → `capable` re-resolution. Replace both paragraphs with a single block that: (a) references the canonical doc — `Follow the canonical procedure in [\`agent/skills/_shared/model-tier-resolution.md\`](../_shared/model-tier-resolution.md) to resolve \`(model, cli)\` for the planner dispatch.`; (b) supplies parameter values — `<agent> = planner`, `<tier> = capable`; (c) preserves the spec-required `crossProvider.capable` → `capable` fallback note as a single sentence: `If a downstream consumer of this skill's resolution (such as a worker that re-resolves on \`crossProvider.capable\`) needs to fall back, the documented fallback target is \`capable\`; this skill's own planner dispatch uses \`capable\` directly and does not perform the re-resolution itself.` — do NOT inline the algorithm steps for the re-resolution; the canonical doc owns those primitives; (d) replaces the cross-reference to "execute-plan Step 6 for the full resolution algorithm" so it no longer points at execute-plan; (e) drops the literal "default to `\"pi\"`" sentence.

- [ ] **Step 4: Replace the "If `model-tiers.json` doesn't exist or is unreadable" sentence.** The current sentence is `If \`model-tiers.json\` doesn't exist or is unreadable, stop with: "generate-plan requires \`~/.pi/agent/model-tiers.json\` — see model matrix configuration."` Replace with a sentence that emits canonical Template (1) byte-equal: `If \`~/.pi/agent/model-tiers.json\` is missing or unreadable, stop with the canonical Template (1) message from \`_shared/model-tier-resolution.md\` substituting \`<agent> = planner\`.` (Note: the previous custom message is dropped; the canonical Template (1) substituted is `~/.pi/agent/model-tiers.json missing or unreadable — cannot dispatch planner.`)

- [ ] **Step 5: Self-check that no inlined algorithm remains in Step 2.** Phrases such as `extract the provider prefix`, `look it up in \`dispatch\``, and `default to \`"pi"\` if absent` (or `default to "pi" if absent`) must NOT appear inside Step 2 after the edit.

**Acceptance criteria:**

- Step 2 references the canonical doc by relative path.
  Verify: run `grep -nF '../_shared/model-tier-resolution.md' agent/skills/generate-plan/SKILL.md` and confirm at least one match falls inside the `## Step 2: Resolve model tiers` block (lines between `## Step 2:` and `## Step 3:`).
- Step 2 no longer contains the inlined algorithm phrases.
  Verify: run each of the following four commands and confirm zero matches inside Step 2 (lines between `## Step 2:` and `## Step 3:`): `grep -nF 'extract the provider prefix' agent/skills/generate-plan/SKILL.md`; `grep -nF 'look it up in' agent/skills/generate-plan/SKILL.md`; `grep -nF 'default to "pi"' agent/skills/generate-plan/SKILL.md`; `grep -niF 'default to' agent/skills/generate-plan/SKILL.md` followed by inspection — confirm no remaining match asserts a CLI default within Step 2.
- Step 2 no longer cross-references "execute-plan Step 6" for the resolution algorithm.
  Verify: run `grep -nE 'execute-plan Step 6' agent/skills/generate-plan/SKILL.md` and confirm zero matches inside Step 2 (lines between `## Step 2:` and `## Step 3:`).
- Step 2 names `planner` as `<agent>` and `capable` as `<tier>`.
  Verify: open `agent/skills/generate-plan/SKILL.md`, find the `### Dispatch resolution` subsection inside Step 2, and confirm its body contains the literal substrings `planner` AND `capable` AND a reference to `model-tier-resolution.md` (relative path).
- Step 2 preserves the spec-required `crossProvider.capable` → `capable` fallback note.
  Verify: open `agent/skills/generate-plan/SKILL.md`, find the `### Dispatch resolution` subsection inside Step 2, and confirm its body contains both `crossProvider.capable` and `capable` together with a sentence that names `capable` as the documented fallback target for `crossProvider.capable` (no inlined algorithm steps required — only the fallback-target note).

**Model recommendation:** standard

---

### Task 5: Update `execute-plan/SKILL.md` (Step 6, test-runner subsection, Step 11.2 verifier dispatch)

**Files:**

- Modify: `agent/skills/execute-plan/SKILL.md`

**Steps:**

- [ ] **Step 1: Locate Step 6.** It begins with `## Step 6: Resolve model tiers` (around line 223) and contains the matrix-read snippet, the task-recommendation→model table, the rubric for unspecified tiers, the "Always pass an explicit `model` override" sentence, and the `### Dispatch resolution` subsection.

- [ ] **Step 2: Keep the matrix-read snippet, the task-recommendation→model table, the unspecified-tier rubric, and the "Always pass an explicit `model` override" sentence unchanged.** Only the `### Dispatch resolution` subsection changes in Step 6.

- [ ] **Step 3: Replace Step 6's `### Dispatch resolution` subsection.** The current subsection contains: the 3-step inlined algorithm (extract provider prefix → look up in dispatch → use as cli), the `default to "pi"` sentence, and the `Always pass \`cli\` explicitly` sentence. Replace with a single block that: (a) references the canonical doc — `Follow the canonical procedure in [\`agent/skills/_shared/model-tier-resolution.md\`](../_shared/model-tier-resolution.md) to resolve the dispatch \`cli\` for each task's model.`; (b) supplies parameter values — `<agent> = coder`, `<tier>` is the per-task tier resolved from the table above (`capable`, `standard`, or `cheap`); (c) drops the "default to `\"pi\"`" sentence; (d) keeps the trailing line `Always pass \`cli\` explicitly on every orchestration call, even when it resolves to \`"pi"\`.` since that's still the dispatch contract (just without the silent default).

- [ ] **Step 4: Locate the test-runner dispatch subsection.** It is `#### Test-runner dispatch (shared)` inside Step 7. The relevant paragraph reads `Resolve the model from \`crossProvider.cheap\` in \`~/.pi/agent/model-tiers.json\`, and resolve \`cli\` through \`dispatch[<provider>]\` for that model's provider prefix. If \`crossProvider.cheap\` cannot be resolved or its provider has no \`dispatch\` entry, surface the resolution failure to the user — do NOT silently fall back to \`cheap\`, \`standard\`, or a CLI default.`

- [ ] **Step 5: Replace the test-runner resolution paragraph.** Substitute with: `Resolve \`(model, cli)\` for this dispatch per the canonical procedure in [\`agent/skills/_shared/model-tier-resolution.md\`](../_shared/model-tier-resolution.md): \`<agent> = test-runner\`, \`<tier> = crossProvider.cheap\`. On any of the four documented failure conditions, emit the corresponding canonical template byte-equal with the parameter values above and stop the call site that triggered the dispatch — do NOT silently fall back to \`cheap\`, \`standard\`, or a CLI default.` Keep the immediately-following `Dispatch via subagent_run_serial { tasks: [...] }` line unchanged (its `model:` and `cli:` placeholders still describe the resolved values).

- [ ] **Step 6: Locate the Step 11.2 verifier dispatch site.** It is the `**Verifier model tier:**` paragraph (around line 496) reading `Every verifier dispatch in execute-plan uses the model resolved from \`crossProvider.standard\` in \`~/.pi/agent/model-tiers.json\`, with \`cli\` resolved through \`dispatch[<provider>]\` for that model's provider prefix... if \`crossProvider.standard\` cannot be resolved, surface the resolution failure to the user.`

- [ ] **Step 7: Replace the Step 11.2 verifier dispatch paragraph.** Substitute with: `Every verifier dispatch in execute-plan uses the model resolved from \`crossProvider.standard\` per the canonical procedure in [\`agent/skills/_shared/model-tier-resolution.md\`](../_shared/model-tier-resolution.md): \`<agent> = verifier\`, \`<tier> = crossProvider.standard\`. Verifier model selection is no longer based on the model tier used by the task under review (the prior \`standard\` default plus \`capable\` upgrade rule is removed). On any of the four documented failure conditions, emit the corresponding canonical template byte-equal and stop — do not silently fall back to a non-cross-provider tier.` Keep the immediately-following `Dispatch the verifier wave as subagent_run_parallel { tasks: [...] }` line unchanged.

- [ ] **Step 8: Self-check the file for residual lenient prose.** After the edits, search the file for the literal strings `default to "pi"`, `default to \`"pi"\``, and `defaulting to "pi"`; none should appear. The phrase `Always pass \`cli\` explicitly` is allowed (it's the dispatch contract, not an algorithm duplication).

**Acceptance criteria:**

- Step 6's `### Dispatch resolution` references the canonical doc.
  Verify: run `grep -nF '../_shared/model-tier-resolution.md' agent/skills/execute-plan/SKILL.md` and confirm at least one match falls inside Step 6's `### Dispatch resolution` subsection (lines between `### Dispatch resolution` and the next `## Step` heading).
- Step 6 no longer contains the inlined "default to pi" rule.
  Verify: run `grep -nF 'default to "pi"' agent/skills/execute-plan/SKILL.md` and confirm zero matches; then run `grep -niF 'default to' agent/skills/execute-plan/SKILL.md` and inspect each match — none may assert a CLI-default fallback inside Step 6 (lines between `## Step 6:` and `## Step 7:`); negation phrases (e.g. "do not silently fall back") are allowed.
- The test-runner subsection references the canonical doc and names `test-runner` as `<agent>` with `crossProvider.cheap` as `<tier>`.
  Verify: open `agent/skills/execute-plan/SKILL.md`, find the `#### Test-runner dispatch (shared)` block (between `#### Test-runner dispatch (shared)` and the next `### ` or `## ` heading), and confirm its body contains a reference to `model-tier-resolution.md` (relative path) AND the substrings `test-runner` AND `crossProvider.cheap`.
- The Step 11.2 verifier dispatch paragraph references the canonical doc and names `verifier` as `<agent>` with `crossProvider.standard` as `<tier>`.
  Verify: open `agent/skills/execute-plan/SKILL.md`, find the `**Verifier model tier:**` paragraph, and confirm its body contains a reference to `model-tier-resolution.md` (relative path) AND the substrings `verifier` AND `crossProvider.standard`.
- The retry/escalation `(m) Better model` rule is preserved.
  Verify: run `grep -nF '(m) Better model' agent/skills/execute-plan/SKILL.md` and confirm at least one match. Then open `agent/skills/execute-plan/SKILL.md` at that match and confirm the body still describes the `cheap` → `standard` → `capable` escalation chain.

**Model recommendation:** standard

---

### Task 6: Update `requesting-code-review/SKILL.md` Step 2b to reference canonical doc

**Files:**

- Modify: `agent/skills/requesting-code-review/SKILL.md`

**Steps:**

- [ ] **Step 1: Locate Step 2b.** It is the `### 2b. Resolve model and dispatch` section.

- [ ] **Step 2: Replace Step 2b's body.** The current body has two paragraphs: one beginning `Read the model matrix from \`~/.pi/agent/model-tiers.json\`. If the file doesn't exist or is unreadable, stop with: "requesting-code-review requires \`~/.pi/agent/model-tiers.json\` — see model matrix configuration."` and one beginning `Use the \`capable\` tier for the reviewer model. Resolve the dispatch target using the \`dispatch\` map — see execute-plan Step 6 for the full algorithm. Default to \`"pi"\` if absent.` Replace both paragraphs with: `Resolve \`(model, cli)\` for the \`code-reviewer\` dispatch per the canonical procedure in [\`agent/skills/_shared/model-tier-resolution.md\`](../_shared/model-tier-resolution.md): \`<agent> = code-reviewer\`, \`<tier> = capable\`. On any of the four documented failure conditions, emit the corresponding canonical template byte-equal and stop. Do not fall back to a CLI default.`

- [ ] **Step 3: Self-check that no inlined algorithm or stale cross-reference remains in Step 2b.** Phrases like `default to "pi"`, `default to \`"pi"\``, `see execute-plan Step 6`, and `requesting-code-review requires` (the old failure prose) must NOT appear inside Step 2b after the edit.

**Acceptance criteria:**

- Step 2b references the canonical doc.
  Verify: run `grep -nF '../_shared/model-tier-resolution.md' agent/skills/requesting-code-review/SKILL.md` and confirm at least one match falls inside the `### 2b.` block (lines between `### 2b.` and `### 3.`).
- Step 2b no longer cross-references execute-plan Step 6.
  Verify: run `grep -nE 'execute-plan Step 6' agent/skills/requesting-code-review/SKILL.md` and confirm zero matches.
- Step 2b names `code-reviewer` as `<agent>` and `capable` as `<tier>`.
  Verify: open `agent/skills/requesting-code-review/SKILL.md`, find the `### 2b. Resolve model and dispatch` block, and confirm its body contains the literal substrings `code-reviewer` AND `capable`.
- Step 2b no longer contains the inlined "default to pi" rule.
  Verify: run `grep -nF 'default to "pi"' agent/skills/requesting-code-review/SKILL.md` and confirm zero matches; then run `grep -niF 'default to' agent/skills/requesting-code-review/SKILL.md` and inspect each match — none may assert a CLI-default fallback within Step 2b (lines between `### 2b.` and `### 3.`); negation phrases (e.g. "do not fall back") are allowed.

**Model recommendation:** standard

---

### Task 7: Update `refine-code/SKILL.md` Step 6 and `refine-code/refine-code-prompt.md` Dispatch resolution

**Files:**

- Modify: `agent/skills/refine-code/SKILL.md`
- Modify: `agent/skills/refine-code/refine-code-prompt.md`

**Steps:**

- [ ] **Step 1: Locate `refine-code/SKILL.md` Step 6 (the provenance-validation step).** It begins with `## Step 6: Validate review provenance` and contains six numbered checks; check 4 currently reads `Read \`~/.pi/agent/model-tiers.json\` (re-read; do not assume Step 2's snapshot is still current). Resolve \`crossProvider.capable\` and \`standard\` to their concrete model strings, and resolve \`dispatch[<provider>]\` for each.`

- [ ] **Step 2: Update check 4 of Step 6 to reference the canonical doc for primitives.** Replace check 4 with: `Read \`~/.pi/agent/model-tiers.json\` (re-read; do not assume Step 2's snapshot is still current). Resolve \`crossProvider.capable\` and \`standard\` to their concrete model strings, and resolve \`dispatch[<provider>]\` for each, using the primitive operations defined in [\`agent/skills/_shared/model-tier-resolution.md\`](../_shared/model-tier-resolution.md) (tier-path resolution, provider-prefix extraction, dispatch lookup).` Checks 1, 2, 3, 5, and 6 are per-status validation rules and remain unchanged.

- [ ] **Step 3: Locate `refine-code/refine-code-prompt.md` `### Dispatch resolution` subsection.** It contains the 4-step algorithm (resolved model string → provider prefix → dispatch lookup → cli pass-through) and the `If the \`dispatch\` map is absent... default to \`"pi"\`.` sentence and the `Always pass \`cli\` explicitly` sentence.

- [ ] **Step 4: Replace the `### Dispatch resolution` subsection in `refine-code-prompt.md`.** Substitute with: `Resolve \`(model, cli)\` for each subagent dispatch per the canonical procedure in [\`agent/skills/_shared/model-tier-resolution.md\`](../_shared/model-tier-resolution.md). The model-tier role assignments are listed above (\`crossProvider.capable\` first-pass and final-verification, \`standard\` hybrid re-review, \`capable\` remediator) — these supply \`<tier>\` per dispatch; \`<agent>\` is \`code-reviewer\` for review dispatches and \`coder\` for the remediator. On any of the four documented failure conditions, emit the corresponding canonical template byte-equal and emit \`STATUS: failed\` with the appropriate reason from the \`## Failure Modes\` list — never silently fall back to \`pi\` (or any other CLI default). Always pass \`cli\` explicitly on every \`subagent_run_serial\` task.` Do NOT use the literal phrase `default to \`pi\`` (in any quoting form) — the Task 9 audit forbids that phrase outside `coordinator-dispatch.md` `## Note on worker subagents`; use `fall back to \`pi\`` for negation prose in this prompt file.

- [ ] **Step 5: Self-check that no inlined algorithm remains in `refine-code-prompt.md`.** Phrases like `Extract the provider prefix`, `Look up \`dispatch["<prefix>"]\``, and `default to \`"pi"\`` must NOT appear inside the `### Dispatch resolution` subsection or anywhere else in the file after the edit (other than as part of the canonical-doc reference).

- [ ] **Step 6: Confirm the `### Model Matrix` block above the dispatch subsection is unchanged.** The model-tier role-assignment bullets (`crossProvider.capable` first-pass and final-verification, `standard` hybrid re-review, `capable` remediator) remain — these are the role-to-tier mapping the audit allows. (The heading is level 3 — `### Model Matrix` — not level 2.)

**Acceptance criteria:**

- `refine-code/SKILL.md` Step 6 check 4 references the canonical doc for primitive operations.
  Verify: run `grep -nF '../_shared/model-tier-resolution.md' agent/skills/refine-code/SKILL.md` and confirm at least one match falls inside the `## Step 6: Validate review provenance` block (lines between `## Step 6:` and `## Edge Cases`).
- `refine-code/SKILL.md` Step 6 still contains the per-status validation rules (checks 5 and 6) for `STATUS: clean` and `STATUS: max_iterations_reached`.
  Verify: open `agent/skills/refine-code/SKILL.md`, find Step 6, and confirm its body contains the substrings `On \`STATUS: clean\`` and `On \`STATUS: max_iterations_reached\`` (or near-identical phrasing) AND names both `crossProvider.capable` and `standard` as the allowed reviewer tiers.
- `refine-code-prompt.md` `### Dispatch resolution` subsection references the canonical doc.
  Verify: run `grep -nF '_shared/model-tier-resolution.md' agent/skills/refine-code/refine-code-prompt.md` and confirm at least one match falls inside the `### Dispatch resolution` block (lines between `### Dispatch resolution` and the next `### ` or `## ` heading).
- `refine-code-prompt.md` no longer contains the inlined 4-step algorithm or the "default to pi" rule.
  Verify: run each of the following three commands and confirm zero matches inside the `### Dispatch resolution` subsection (lines between `### Dispatch resolution` and the next `### ` or `## ` heading): `grep -nF 'Extract the provider prefix' agent/skills/refine-code/refine-code-prompt.md`; `grep -nF 'Look up' agent/skills/refine-code/refine-code-prompt.md`; `grep -nF 'default to "pi"' agent/skills/refine-code/refine-code-prompt.md`.
- The `### Model Matrix` model-tier role-assignment bullets (`crossProvider.capable`, `standard`, `capable`) are preserved in `refine-code-prompt.md`.
  Verify: run each of the following three commands and confirm at least one match for each: `grep -nF 'first-pass full review' agent/skills/refine-code/refine-code-prompt.md`; `grep -nF 'hybrid re-review' agent/skills/refine-code/refine-code-prompt.md`; `grep -nF 'remediator' agent/skills/refine-code/refine-code-prompt.md`. Each match must appear between the `### Model Matrix` heading and the `### Dispatch resolution` heading (the `### Model Matrix` heading is level 3, not level 2).

**Model recommendation:** standard

---

### Task 8: Update `refine-plan/SKILL.md` Step 9.5 and `refine-plan/refine-plan-prompt.md` Dispatch resolution

**Files:**

- Modify: `agent/skills/refine-plan/SKILL.md`
- Modify: `agent/skills/refine-plan/refine-plan-prompt.md`

**Steps:**

- [ ] **Step 1: Locate `refine-plan/SKILL.md` Step 9.5.** It begins with `## Step 9.5: Validate review provenance` and contains five numbered checks; check 4 currently reads `Read \`~/.pi/agent/model-tiers.json\` (re-read; do not assume Step 5's snapshot is still current). Resolve \`crossProvider.capable\` and \`capable\` to their concrete model strings, and resolve \`dispatch[<provider>]\` for each.`

- [ ] **Step 2: Update check 4 of Step 9.5 to reference the canonical doc for primitives.** Replace check 4 with: `Read \`~/.pi/agent/model-tiers.json\` (re-read; do not assume Step 5's snapshot is still current). Resolve \`crossProvider.capable\` and \`capable\` to their concrete model strings, and resolve \`dispatch[<provider>]\` for each, using the primitive operations defined in [\`agent/skills/_shared/model-tier-resolution.md\`](../_shared/model-tier-resolution.md) (tier-path resolution, provider-prefix extraction, dispatch lookup).` Checks 1, 2, 3, and 5 are validation rules and remain unchanged.

- [ ] **Step 3: Locate `refine-plan/refine-plan-prompt.md` `### Dispatch resolution` subsection.** It contains the 4-step algorithm (resolved model string → provider prefix → dispatch lookup → cli pass-through), the `If the \`dispatch\` map is absent... default to \`"pi"\`.` sentence, and the `Always pass \`cli\` explicitly` sentence.

- [ ] **Step 4: Replace the `### Dispatch resolution` subsection in `refine-plan-prompt.md`.** Substitute with: `Resolve \`(model, cli)\` for each subagent dispatch per the canonical procedure in [\`agent/skills/_shared/model-tier-resolution.md\`](../_shared/model-tier-resolution.md). The model-tier role assignments are listed above — \`crossProvider.capable\` is the primary plan-reviewer tier, \`capable\` is the fallback plan-reviewer tier (the explicit primary/fallback pair named in the canonical doc's "Skill-specific fallback chains" section), and \`capable\` is also the planner edit-pass tier. \`<agent>\` is \`plan-reviewer\` for review dispatches and \`planner\` for the edit pass. On any of the four documented failure conditions, emit the corresponding canonical template byte-equal and emit \`STATUS: failed\` with the appropriate reason from the \`## Failure Modes\` list — never silently fall back to \`pi\` (or any other CLI default). The primary→fallback chain is governed by the per-iteration substeps below (Per-Iteration Full Review Step 4); a strict failure on the primary dispatch path triggers the documented fallback retry, not a silent CLI default. Always pass \`cli\` explicitly on every \`subagent_run_serial\` task.` Do NOT use the literal phrase `default to \`pi\`` (in any quoting form) — the Task 9 audit forbids that phrase outside `coordinator-dispatch.md` `## Note on worker subagents`; use `fall back to \`pi\`` for negation prose in this prompt file.

- [ ] **Step 5: Self-check that no inlined algorithm remains in `refine-plan-prompt.md`.** Phrases like `Extract the provider prefix`, `Look up \`dispatch["<prefix>"]\``, and `default to \`"pi"\`` must NOT appear inside the `### Dispatch resolution` subsection or anywhere else in the file after the edit (other than as part of the canonical-doc reference).

- [ ] **Step 6: Confirm the `### Model Matrix` block above the dispatch subsection is unchanged.** The model-tier role-assignment bullets (`crossProvider.capable` primary plan reviewer, `capable` fallback plan reviewer + planner edit pass) remain — these are the role-to-tier mapping plus the explicit primary/fallback chain that the canonical doc names. (The heading is level 3 — `### Model Matrix` — not level 2.)

- [ ] **Step 7: Confirm Per-Iteration Full Review Step 4's primary→fallback retry chain (substeps 4a/4b/4c) is preserved verbatim.** This chain is the explicit skill-specific fallback the canonical doc lists; it remains skill-local and must not be removed or weakened.

**Acceptance criteria:**

- `refine-plan/SKILL.md` Step 9.5 check 4 references the canonical doc for primitive operations.
  Verify: run `grep -nF '../_shared/model-tier-resolution.md' agent/skills/refine-plan/SKILL.md` and confirm at least one match falls inside the `## Step 9.5: Validate review provenance` block (lines between `## Step 9.5:` and `## Step 10`).
- `refine-plan/SKILL.md` Step 9.5 still contains the validation rule that the reviewer must equal `crossProvider.capable` OR `capable`.
  Verify: open `agent/skills/refine-plan/SKILL.md`, find Step 9.5, and confirm its body contains the substrings `crossProvider.capable` AND `capable` AND the phrase `MUST equal either` (or near-identical phrasing describing the two-allowed-tiers rule).
- `refine-plan-prompt.md` `### Dispatch resolution` subsection references the canonical doc.
  Verify: run `grep -nF '_shared/model-tier-resolution.md' agent/skills/refine-plan/refine-plan-prompt.md` and confirm at least one match falls inside the `### Dispatch resolution` block (lines between `### Dispatch resolution` and the next `### ` or `## ` heading).
- `refine-plan-prompt.md` no longer contains the inlined 4-step algorithm or the "default to pi" rule.
  Verify: run each of the following three commands and confirm zero matches inside the `### Dispatch resolution` subsection (lines between `### Dispatch resolution` and the next `### ` or `## ` heading): `grep -nF 'Extract the provider prefix' agent/skills/refine-plan/refine-plan-prompt.md`; `grep -nF 'Look up' agent/skills/refine-plan/refine-plan-prompt.md`; `grep -nF 'default to "pi"' agent/skills/refine-plan/refine-plan-prompt.md`.
- The `### Model Matrix` model-tier role-assignment bullets (`crossProvider.capable` primary, `capable` fallback, `capable` planner-edit) are preserved in `refine-plan-prompt.md`.
  Verify: run each of the following three commands and confirm at least one match for each: `grep -nF 'primary plan reviewer' agent/skills/refine-plan/refine-plan-prompt.md`; `grep -nF 'fallback plan reviewer' agent/skills/refine-plan/refine-plan-prompt.md`; `grep -nF 'planner edit pass' agent/skills/refine-plan/refine-plan-prompt.md`. Each match must appear between the `### Model Matrix` heading and the `### Dispatch resolution` heading (the `### Model Matrix` heading is level 3, not level 2). If the existing role-assignment bullets use slightly different wording, accept matches that name the role unambiguously (e.g. `primary plan-reviewer`, `fallback plan-reviewer`, `planner edit-pass`).
- The Per-Iteration Full Review Step 4 primary→fallback retry chain (substeps 4a/4b/4c) is preserved verbatim.
  Verify: run each of the following three commands and confirm at least one match for each: `grep -nF '4a. Reconstruct' agent/skills/refine-plan/refine-plan-prompt.md`; `grep -nF '4b. Re-fill the review template' agent/skills/refine-plan/refine-plan-prompt.md`; `grep -nF '4c. Dispatch the fallback' agent/skills/refine-plan/refine-plan-prompt.md`.

**Model recommendation:** standard

---

### Task 9: Run the manual grep audit and confirm coverage

**Files:**

- Test: `agent/skills/_shared/model-tier-resolution.md` (read-only audit)
- Test: `agent/skills/_shared/coordinator-dispatch.md` (read-only audit)
- Test: `agent/skills/define-spec/SKILL.md` (read-only audit)
- Test: `agent/skills/generate-plan/SKILL.md` (read-only audit)
- Test: `agent/skills/execute-plan/SKILL.md` (read-only audit)
- Test: `agent/skills/requesting-code-review/SKILL.md` (read-only audit)
- Test: `agent/skills/refine-code/SKILL.md` (read-only audit)
- Test: `agent/skills/refine-code/refine-code-prompt.md` (read-only audit)
- Test: `agent/skills/refine-plan/SKILL.md` (read-only audit)
- Test: `agent/skills/refine-plan/refine-plan-prompt.md` (read-only audit)

**Steps:**

- [ ] **Step 1: Run the spec-defined audit greps.** Run each of the following commands from the working directory and capture output: `grep -rnF 'dispatch[' agent/skills/`; `grep -rnF 'dispatch.' agent/skills/`; `grep -rnF 'provider prefix' agent/skills/`; `grep -rnF 'model-tiers.json' agent/skills/`. The `-F` flag treats each pattern as a literal fixed string (so the bracket and dot are not regex metacharacters). Save the output for the per-match classification step.

- [ ] **Step 2: Classify every match into one of the five allowed categories (plus the implicit canonical-doc-itself category).** For each match line, determine which allowed category it belongs to: (a) reference to the canonical doc (`agent/skills/_shared/model-tier-resolution.md` named or linked); (b) coordinator-specific chain rule in `_shared/coordinator-dispatch.md` (the four-tier chain procedure, the skip-silently rule, the two hard-stop messages); (c) provenance-validation rule in `refine-code/SKILL.md` Step 6 or `refine-plan/SKILL.md` Step 9.5; (d) role-to-tier mapping (e.g., "spec-designer uses `capable`", "planner uses `capable` from model-tiers.json", task-recommendation→tier table); (e) explicit skill-specific fallback semantics named in the canonical doc (the `refine-plan-prompt.md` plan-reviewer primary/fallback pair). Matches inside `agent/skills/_shared/model-tier-resolution.md` itself are implicitly allowed — that file IS the canonical source of truth, so it necessarily contains the algorithm primitives, the four templates, and the audit strings; it is the trivial self-reference of category (a). High-level workflow descriptions in README files (e.g., "Read `~/.pi/agent/model-tiers.json` and resolve the capable reviewer model") count as category (d) since they describe role-to-tier mappings rather than the algorithm.

- [ ] **Step 3: Flag any match that does NOT fall into an allowed category.** For each unclassified match, this is a stale duplication that must be removed. If any flag is raised, return to the corresponding consumer task and remove the residual prose; then re-run Step 1. The audit passes only when every match falls into one of the five allowed categories or is inside the canonical doc itself.

- [ ] **Step 4: Run the `default-to-pi` audit (two greps for the two quoting forms).** Run two fixed-string greps to catch both quoting variants of the lenient prose. First: `grep -rnF 'default to "pi"' agent/skills/`. Second: a fixed-string grep for `default to ` followed by a backtick-wrapped `pi` — invoke as `grep -rnF -e 'default to ' agent/skills/ | grep -F '`pi`'` (the second pipe filters for the backtick-wrapped form). The `default to "pi"` form (double-quotes) MUST return zero matches everywhere. The `` default to `pi` `` form (backticks) MUST return zero matches outside `_shared/coordinator-dispatch.md` `## Note on worker subagents`; matches inside that section are ALLOWED only when the new strict text uses the phrase in a negation context (e.g., `no silent default to `pi``). Any match that asserts (rather than negates) the default-to-pi rule is a failure that must be removed.

- [ ] **Step 5: Verify the four canonical templates appear byte-equal in the canonical doc.** Run each of the four templates as a fixed-string grep against `agent/skills/_shared/model-tier-resolution.md` and confirm each has at least one match. The grep commands are listed in Task 1's acceptance criteria — re-run them here as a regression check.

- [ ] **Step 6: Verify the coordinator hard-stop messages are unchanged.** Run `grep -nF 'coordinator-dispatch: no model tier in [crossProvider.standard, standard, crossProvider.capable, capable] resolves to a pi CLI — coordinator cannot dispatch subagents.' agent/skills/_shared/coordinator-dispatch.md` and confirm exactly one match. Then run `grep -nF 'coordinator-dispatch: all pi-eligible tiers failed; last attempt: <model> via pi — <error>' agent/skills/_shared/coordinator-dispatch.md` and confirm exactly one match.

- [ ] **Step 7: Run `npm test --prefix agent`** as a safety check that no extension TypeScript sources were touched accidentally. The test command should exit 0 (markdown changes do not affect TypeScript tests).

- [ ] **Step 8: Spot-check coordinator-dispatch chain semantics.** Open `agent/skills/_shared/coordinator-dispatch.md` and re-read the four-tier chain in Procedure step 1, the skip-silently rule in Procedure step 2, and the two hard-stop messages in `## Hard-stop conditions` to confirm none are altered.

**Acceptance criteria:**

- The four spec-defined audit greps produce no matches outside the five allowed categories (or matches inside the canonical doc itself).
  Verify: run `grep -rnF 'dispatch[' agent/skills/`, `grep -rnF 'dispatch.' agent/skills/`, `grep -rnF 'provider prefix' agent/skills/`, and `grep -rnF 'model-tiers.json' agent/skills/` from the working directory; classify every match line into one of categories (a)–(e) listed in this task's Step 2 (or note it as a self-reference inside `agent/skills/_shared/model-tier-resolution.md`); confirm every match is classified.
- No stale "default to pi" prose remains outside an allowed negation context.
  Verify: run `grep -rnF 'default to "pi"' agent/skills/` and confirm zero matches. Then run `grep -rnF -e 'default to ' agent/skills/ | grep -F '`pi`'` and confirm every remaining match line falls inside `agent/skills/_shared/coordinator-dispatch.md` `## Note on worker subagents` section AND appears in a negation context (e.g., the line contains the phrase `no silent default` or `no default`). Any match outside `coordinator-dispatch.md` `## Note on worker subagents`, or any match inside that section that asserts rather than negates the default-to-pi rule, is a failure.
- All eight modified consumer/shared files reference the canonical doc by relative path.
  Verify: run `grep -lF 'model-tier-resolution.md' agent/skills/_shared/coordinator-dispatch.md agent/skills/define-spec/SKILL.md agent/skills/generate-plan/SKILL.md agent/skills/execute-plan/SKILL.md agent/skills/requesting-code-review/SKILL.md agent/skills/refine-code/SKILL.md agent/skills/refine-code/refine-code-prompt.md agent/skills/refine-plan/SKILL.md agent/skills/refine-plan/refine-plan-prompt.md` and confirm the output lists all nine paths (eight consumers plus coordinator-dispatch.md), one per line.
- The four canonical templates are present byte-equal in `agent/skills/_shared/model-tier-resolution.md`.
  Verify: re-run the four `grep -nF` commands from Task 1's acceptance criteria and confirm each has at least one match.
- The two coordinator hard-stop verbatim error messages are unchanged.
  Verify: run `grep -nF 'coordinator-dispatch: no model tier in [crossProvider.standard, standard, crossProvider.capable, capable] resolves to a pi CLI — coordinator cannot dispatch subagents.' agent/skills/_shared/coordinator-dispatch.md` and confirm exactly one match. Then run `grep -nF 'coordinator-dispatch: all pi-eligible tiers failed; last attempt: <model> via pi — <error>' agent/skills/_shared/coordinator-dispatch.md` and confirm exactly one match.
- The TypeScript test suite still passes (no accidental TS source edits).
  Verify: run `npm test --prefix agent` from the working directory and confirm exit code 0.
- The four-tier coordinator chain order is preserved in the `## Procedure` section.
  Verify: run `grep -nF 'crossProvider.standard, standard, crossProvider.capable, capable' agent/skills/_shared/coordinator-dispatch.md` and confirm at least one match falls inside the `## Procedure` section (lines between `## Procedure` and `## Hard-stop conditions`).

**Model recommendation:** capable

## Dependencies

- Task 2 depends on: Task 1
- Task 3 depends on: Task 1
- Task 4 depends on: Task 1
- Task 5 depends on: Task 1
- Task 6 depends on: Task 1
- Task 7 depends on: Task 1
- Task 8 depends on: Task 1
- Task 9 depends on: Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7, Task 8

Tasks 2–8 have no dependencies between each other and may run in parallel after Task 1 completes. Task 9 (audit) is a single-dispatch synthesis task and must run last.

## Risk Assessment

- **Risk: Consumer prose drifts from canonical templates over time.** A future edit to a consumer might paraphrase a failure message instead of pulling it from the canonical doc, re-introducing the drift the spec is trying to eliminate. **Mitigation:** the spec explicitly states no automated enforcement is introduced; Task 9's audit is the manual recurring check. Each consumer task above explicitly tells the editor to substitute parameter values into the canonical templates rather than rewrite the message text. The audit grep commands documented in Task 9's `Verify:` recipes are reproducible and can be re-run on demand.
- **Risk: Strict policy breaks an existing dispatch path that currently silently defaulted to `pi`.** Today, a missing `dispatch.<provider>` entry routes worker dispatch to `pi` even when the resolved model is on a different provider. After this change, that condition stops with the canonical Template (4) message. **Mitigation:** the current `~/.pi/agent/model-tiers.json` (verified in `~/.pi/agent/model-tiers.json` at plan-write time) already contains `dispatch` entries for both `anthropic` and `openai-codex`, the only two provider prefixes used by tier values today. The strict policy will only fire if the matrix is mis-edited (a missing entry), in which case the loud failure is the desired behavior.
- **Risk: The `## Note on worker subagents` rewrite accidentally weakens the coordinator chain semantics.** Removing the "default to pi" clause for worker re-resolution must NOT touch the coordinator chain (`## Procedure` and `## Hard-stop conditions`) which keep their pi-only invariant. **Mitigation:** Task 2 Step 3 explicitly re-reads the file end-to-end after the edit; Task 9 Step 6 spot-checks the chain semantics; Task 9's acceptance criteria require the four-tier chain order and both hard-stop verbatim messages to grep cleanly.
- **Risk: Audit miss-classifies a match.** The five allowed categories in Task 9 Step 2 require human judgment per match line. **Mitigation:** the categories are spec-defined and documented inline in Task 9 Step 2; uncertain matches should be flagged and removed if they cannot be cleanly placed in one of the five categories — false positives in the audit produce additional consumer cleanup, never silent acceptance of a duplicated algorithm.
- **Risk: Cross-references between `model-tier-resolution.md` and `coordinator-dispatch.md` create a circular dependency in reading order.** The canonical doc points at `coordinator-dispatch.md` for chain semantics; `coordinator-dispatch.md` points at the canonical doc for primitive lookups. **Mitigation:** the spec explicitly requires this bidirectional linkage ("the canonical doc references the coordinator-dispatch file for coordinator-specific chain logic, and the coordinator-dispatch file references the canonical doc for primitive lookups"); each file remains independently readable because the cross-reference appears as a pointer, not as required reading-before-use; readers can land in either file and follow the link to the other when they need the cross-cutting concept.
- **Risk: Skill-specific fallback chain (refine-plan plan-reviewer) is mis-flagged as duplication during a future audit.** Without the canonical doc's explicit list, an auditor might think the `crossProvider.capable` → `capable` fallback in `refine-plan-prompt.md` is stale algorithm prose. **Mitigation:** Task 1 Step 8 explicitly names this fallback chain in the canonical doc's `## Skill-specific fallback chains` section so it is whitelisted as legitimate skill-local content; Task 8 Step 7 explicitly preserves the substeps 4a/4b/4c retry chain unchanged.

## Test Command

```bash
npm test --prefix agent
```
