# Dispatch Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dispatch routing to skills so Anthropic-model subagent calls route through the Claude Code CLI and cross-provider calls route through pi.

**Architecture:** A `dispatch` map in `model-tiers.json` maps provider prefixes to CLI dispatch targets (`"claude"` or `"pi"`). Each skill resolves the dispatch target alongside the model tier and passes it explicitly on every subagent call. The canonical resolution algorithm lives in execute-plan Step 6; other skills cross-reference it. The refine-code coordinator prompt gets its own inline resolution instructions since it runs as a subagent without access to other skill files.

**Tech Stack:** Markdown skill definitions, JSON config

**Source:** TODO-be25d1fd

---

## File Structure

- Modify: `agent/model-tiers.json` — add `dispatch` key mapping provider prefixes to CLI targets
- Modify: `agent/skills/execute-plan/SKILL.md` — add dispatch resolution subsection to Step 6, update Step 7 subagent call examples
- Modify: `agent/skills/generate-plan/SKILL.md` — add dispatch resolution to Step 2, update Steps 3/4.1/4.3 subagent calls, update fallback handling
- Modify: `agent/skills/refine-code/SKILL.md` — add dispatch resolution to Step 2, update Step 4 subagent call
- Modify: `agent/skills/refine-code/refine-code-prompt.md` — rename ambiguous heading, add dispatch resolution section, update all subagent call examples
- Modify: `agent/skills/requesting-code-review/SKILL.md` — add model-matrix read with missing-file stop condition, dispatch resolution (cross-references execute-plan Step 6), update subagent call with concrete tier references and `dispatch`

## Dependencies

- Task 3 depends on: Task 2 (cross-references execute-plan Step 6)
- Task 4 depends on: Task 2 (cross-references execute-plan Step 6)
- Task 6 depends on: Task 2 (cross-references execute-plan Step 6)

## Risk Assessment

- **Low risk:** All changes are additive markdown/JSON edits with no executable code
- **Backward compatibility:** If `dispatch` key is absent from `model-tiers.json`, all skills default to `"pi"` — existing behavior preserved
- **Naming collision:** The word "dispatch" already appears in `refine-code-prompt.md` meaning "send a subagent" — Task 5 renames the heading to avoid confusion with the new `dispatch` property

---

### Task 1: Add dispatch key to model-tiers.json

**Files:**
- Modify: `agent/model-tiers.json`

- [ ] **Step 1: Add the dispatch map**

In `agent/model-tiers.json`, add a `dispatch` key after the `crossProvider` block. The full file should read:

```json
{
    "capable": "anthropic/claude-opus-4-6",
    "standard": "anthropic/claude-sonnet-4-6",
    "cheap": "anthropic/claude-haiku-4-5",
    "crossProvider": {
        "capable": "openai-codex/gpt-5.4",
        "standard": "openai-codex/gpt-5.4"
    },
    "dispatch": {
        "anthropic": "claude",
        "openai-codex": "pi"
    }
}
```

Each key in `dispatch` is a provider prefix (the substring before the first `/` in a model string). Each value is a dispatch target accepted by the pi-subagent extension (`"pi"` or `"claude"`).

- [ ] **Step 2: Verify the JSON is valid**

Run: `python3 -c "import json; json.load(open('agent/model-tiers.json')); print('valid')"`
Expected: `valid`

- [ ] **Step 3: Commit**

```bash
git add agent/model-tiers.json
git commit -m "feat: add dispatch map to model-tiers.json

Maps provider prefixes to CLI dispatch targets (claude/pi)."
```

**Acceptance criteria:**
- `model-tiers.json` contains a `dispatch` key with `anthropic` → `claude` and `openai-codex` → `pi`
- File is valid JSON

---

### Task 2: Add dispatch resolution to execute-plan Step 6 and update Step 7

**Files:**
- Modify: `agent/skills/execute-plan/SKILL.md:156-240`

This is the canonical location for dispatch resolution logic. Other skills will cross-reference this section.

- [ ] **Step 1: Add dispatch resolution subsection to Step 6**

After the existing paragraph ending with "use the exact strings from `model-tiers.json`." (line 177), add:

```markdown

### Dispatch resolution

After resolving each task's model, also resolve its dispatch target:

1. Extract the provider prefix — the substring before the first `/` in the resolved model string (e.g., `anthropic/claude-opus-4-6` → `anthropic`)
2. Look up the prefix in the `dispatch` object from `model-tiers.json` (e.g., `dispatch["anthropic"]` → `"claude"`)
3. Use the mapped value as the `dispatch` property in the subagent call

If `model-tiers.json` has no `dispatch` key, or the provider prefix has no entry in the dispatch map, default to `"pi"`.

Always pass `dispatch` explicitly on every subagent call, even when it resolves to `"pi"`.
```

- [ ] **Step 2: Update the parallel subagent call example in Step 7**

Find the parallel dispatch example (around line 231):

```
subagent { tasks: [
  { agent: "coder", task: "<self-contained prompt>", model: "<resolved>" },
  { agent: "coder", task: "<self-contained prompt>", model: "<resolved>" },
  ...
]}
```

Replace with:

```
subagent { tasks: [
  { agent: "coder", task: "<self-contained prompt>", model: "<resolved>", dispatch: "<resolved>" },
  { agent: "coder", task: "<self-contained prompt>", model: "<resolved>", dispatch: "<resolved>" },
  ...
]}
```

- [ ] **Step 3: Update the sequential subagent call example in Step 7**

Find the sequential dispatch example (around line 240):

```
subagent { agent: "coder", task: "<self-contained prompt>", model: "<resolved>" }
```

Replace with:

```
subagent { agent: "coder", task: "<self-contained prompt>", model: "<resolved>", dispatch: "<resolved>" }
```

- [ ] **Step 4: Verify all subagent calls in execute-plan include dispatch**

Search the file for `subagent {` and confirm every occurrence includes `dispatch:`. The file should have 2 subagent blocks — one parallel (containing 2 call entries) and one sequential — totaling 3 call entries, all with `dispatch`.

- [ ] **Step 5: Commit**

```bash
git add agent/skills/execute-plan/SKILL.md
git commit -m "feat(execute-plan): add dispatch resolution to Step 6, update Step 7 calls

Canonical dispatch resolution logic: extract provider prefix from
model string, look up in dispatch map, default to pi."
```

**Acceptance criteria:**
- Step 6 contains a "Dispatch resolution" subsection with the 3-step algorithm
- Default-to-`"pi"` behavior is documented
- All subagent call examples in Step 7 include `dispatch: "<resolved>"`

---

### Task 3: Add dispatch resolution to generate-plan and update subagent calls

**Files:**
- Modify: `agent/skills/generate-plan/SKILL.md:19-113`

- [ ] **Step 1: Add dispatch resolution to Step 2**

After the fallback notification block (the `⚠️ Cross-provider plan review failed...` message, around line 39) and before the "If `model-tiers.json` doesn't exist" paragraph (line 41), insert:

```markdown

### Dispatch resolution

After resolving the model for each role, also resolve its dispatch target using the `dispatch` map from `model-tiers.json`. See execute-plan Step 6 for the full resolution algorithm. In brief: extract the provider prefix (substring before the first `/`), look it up in `dispatch`, default to `"pi"` if absent.

When falling back from `crossProvider.capable` to `capable`, re-resolve the dispatch target — it will change if the providers differ (e.g., `openai-codex` dispatches to `"pi"`, `anthropic` dispatches to `"claude"`).
```

- [ ] **Step 2: Update Step 3 subagent call**

Find the Step 3 subagent call (around line 53):

```
   subagent { agent: "planner", task: "<filled template>", model: "<capable from model-tiers.json>" }
```

Replace with:

```
   subagent { agent: "planner", task: "<filled template>", model: "<capable from model-tiers.json>", dispatch: "<dispatch for capable>" }
```

- [ ] **Step 3: Update Step 4.1 subagent call**

Find the Step 4.1 subagent call (around lines 68-72):

```
   subagent {
     agent: "plan-reviewer",
     task: "<filled review-plan-prompt.md>",
     model: "<crossProvider.capable from model-tiers.json>"
   }
```

Replace with:

```
   subagent {
     agent: "plan-reviewer",
     task: "<filled review-plan-prompt.md>",
     model: "<crossProvider.capable from model-tiers.json>",
     dispatch: "<dispatch for crossProvider.capable>"
   }
```

- [ ] **Step 4: Update Step 4.1 fallback text**

Find the fallback line (around line 74):

```
   If the cross-provider dispatch fails, retry with `capable` from model-tiers.json and notify the user (see Step 2 fallback message).
```

Replace with:

```
   If the cross-provider dispatch fails, retry with `capable` from model-tiers.json (re-resolving dispatch for the fallback model) and notify the user (see Step 2 fallback message).
```

- [ ] **Step 5: Update Step 4.3 subagent call**

Find the Step 4.3 subagent call (around line 111):

```
   subagent { agent: "planner", task: "<filled edit-plan-prompt.md>", model: "<capable from model-tiers.json>" }
```

Replace with:

```
   subagent { agent: "planner", task: "<filled edit-plan-prompt.md>", model: "<capable from model-tiers.json>", dispatch: "<dispatch for capable>" }
```

- [ ] **Step 6: Verify all subagent calls in generate-plan include dispatch**

Search the file for `subagent {` and confirm every occurrence includes `dispatch:`. The file should have 3 subagent call blocks (Step 3, Step 4.1, Step 4.3), all with `dispatch`.

- [ ] **Step 7: Commit**

```bash
git add agent/skills/generate-plan/SKILL.md
git commit -m "feat(generate-plan): add dispatch resolution and update subagent calls

Cross-references execute-plan Step 6 for resolution algorithm.
Fallback path re-resolves dispatch for the fallback model."
```

**Acceptance criteria:**
- Step 2 contains a "Dispatch resolution" subsection that cross-references execute-plan Step 6
- Fallback handling explicitly mentions re-resolving dispatch
- All 3 subagent call examples include `dispatch`

---

### Task 4: Add dispatch resolution to refine-code SKILL.md and update Step 4

**Files:**
- Modify: `agent/skills/refine-code/SKILL.md`

- [ ] **Step 1: Add dispatch resolution to Step 2**

After the existing Step 2 content (the bullet list ending with "`capable` — remediator", around line 38) and before the "If the file doesn't exist..." paragraph (line 39), insert:

```markdown

### Dispatch resolution

After reading the model matrix, resolve the dispatch target for the `code-refiner` call using the `dispatch` map from `model-tiers.json`. See execute-plan Step 6 for the full resolution algorithm.

The `code-refiner` receives the full model matrix (including the `dispatch` map) as `{MODEL_MATRIX}` and resolves dispatch for its own subagent calls internally — see `refine-code-prompt.md`.
```

- [ ] **Step 2: Update Step 4 subagent call**

Find the Step 4 subagent call (around lines 58-63):

```
subagent {
  agent: "code-refiner",
  task: "<filled refine-code-prompt.md>",
  model: "<standard from model matrix>"
}
```

Replace with:

```
subagent {
  agent: "code-refiner",
  task: "<filled refine-code-prompt.md>",
  model: "<standard from model matrix>",
  dispatch: "<dispatch for standard>"
}
```

- [ ] **Step 3: Update the fallback path in Edge Cases**

Find the edge case text (in the "Edge Cases" section near the end of the file):

```
- **Code-refiner fails to dispatch** (model unavailable): Retry with `capable` from the model matrix (same provider fallback). If that also fails, stop with error.
```

Replace with:

```
- **Code-refiner fails to dispatch** (model unavailable): Retry with `capable` from the model matrix (re-resolving dispatch for the fallback model). If that also fails, stop with error.
```

- [ ] **Step 4: Verify the subagent call includes dispatch**

Search the file for `subagent {` and confirm the Step 4 call includes `dispatch:`.

- [ ] **Step 5: Commit**

```bash
git add agent/skills/refine-code/SKILL.md
git commit -m "feat(refine-code): add dispatch resolution and update code-refiner call

Cross-references execute-plan Step 6 for resolution algorithm.
Code-refiner resolves dispatch for its own calls via prompt instructions."
```

**Acceptance criteria:**
- Step 2 contains a "Dispatch resolution" subsection
- The subsection notes that code-refiner handles its own dispatch internally
- Step 4 subagent call includes `dispatch`
- The fallback path in Edge Cases mentions re-resolving dispatch

---

### Task 5: Update refine-code-prompt.md with dispatch resolution instructions

**Files:**
- Modify: `agent/skills/refine-code/refine-code-prompt.md`

This file is a prompt template consumed by the `code-refiner` subagent. It needs its own inline dispatch resolution instructions because the code-refiner can't reference other skill files at runtime.

- [ ] **Step 1: Rename the ambiguous heading**

Find the heading (around line 29):

```
Use these model tiers for dispatch:
```

Replace with:

```
Model tier assignments:
```

This avoids collision with the new `dispatch` property name.

- [ ] **Step 2: Add dispatch resolution section**

After the model tier assignments block (after the line "`capable` — remediator (coder fixing code)", around line 32), add:

```markdown

### Dispatch resolution

The model matrix above includes a `dispatch` map that maps provider prefixes to CLI dispatch targets. For each subagent call:

1. Take the resolved model string (e.g., `anthropic/claude-opus-4-6`)
2. Extract the provider prefix — the substring before the first `/` (e.g., `anthropic`)
3. Look up `dispatch["<prefix>"]` in the model matrix (e.g., `dispatch["anthropic"]` → `"claude"`)
4. Pass the result as `dispatch: "<value>"` in the subagent call

If the `dispatch` map is absent from the model matrix, or the provider has no entry, default to `"pi"`.

Always pass `dispatch` explicitly on every subagent call, even when it resolves to `"pi"`.
```

- [ ] **Step 3: Update iteration 1 dispatch prose**

Find the prose text for iteration 1 (around line 47):

```
3. **Dispatch `code-reviewer`** with model `crossProvider.capable` from the model matrix:
```

Replace with:

```
3. **Dispatch `code-reviewer`** with model `crossProvider.capable` and corresponding `dispatch` from the model matrix:
```

- [ ] **Step 4: Update remediator dispatch prose**

Find the prose text for the remediator (around line 69):

```
7. **Dispatch remediator** for one batch — use model `capable` from the model matrix:
```

Replace with:

```
7. **Dispatch remediator** for one batch — use model `capable` and corresponding `dispatch` from the model matrix:
```

- [ ] **Step 5: Update iteration 1 code-reviewer call**

Find the iteration 1 subagent call (around lines 48-54):

```
   subagent {
     agent: "code-reviewer",
     task: "<filled template>",
     model: "<crossProvider.capable from model matrix>"
   }
```

Replace with:

```
   subagent {
     agent: "code-reviewer",
     task: "<filled template>",
     model: "<crossProvider.capable from model matrix>",
     dispatch: "<dispatch for crossProvider.capable>"
   }
```

- [ ] **Step 6: Update remediator call**

Find the remediator subagent call (around lines 70-76):

```
   subagent {
     agent: "coder",
     task: "Fix the following code review findings:\n\n<batched findings with file:line refs>\n\nContext:\n<relevant plan/spec sections>\n\nWorking directory: {WORKING_DIR}",
     model: "<capable from model matrix>"
   }
```

Replace with:

```
   subagent {
     agent: "coder",
     task: "Fix the following code review findings:\n\n<batched findings with file:line refs>\n\nContext:\n<relevant plan/spec sections>\n\nWorking directory: {WORKING_DIR}",
     model: "<capable from model matrix>",
     dispatch: "<dispatch for capable>"
   }
```

- [ ] **Step 7: Update iteration 2..N re-review dispatch text**

Find the text (around line 108):

```
5. **Dispatch `code-reviewer`** with model `standard` from the model matrix (hybrid re-reviews are scoped and cheaper).
```

Replace with:

```
5. **Dispatch `code-reviewer`** with model `standard` and corresponding `dispatch` from the model matrix (hybrid re-reviews are scoped and cheaper).
```

- [ ] **Step 8: Update final verification dispatch text**

Find the text in the Final Verification section (around line 118):

```
1. **Dispatch `code-reviewer`** with model `crossProvider.capable` for a **full-diff** verification:
```

Replace with:

```
1. **Dispatch `code-reviewer`** with model `crossProvider.capable` and corresponding `dispatch` for a **full-diff** verification:
```

- [ ] **Step 9: Verify all subagent calls and dispatch references**

Search the file for `subagent {` and `**Dispatch` and confirm every occurrence includes dispatch. The file should have:
- 2 subagent call blocks (code-reviewer iteration 1, coder remediator) — both with `dispatch:` property
- 4 "Dispatch" prose lines (iteration 1, remediator, iteration 2..N, final verification) — all mentioning `dispatch`

- [ ] **Step 10: Commit**

```bash
git add agent/skills/refine-code/refine-code-prompt.md
git commit -m "feat(refine-code-prompt): add dispatch resolution instructions

Renames ambiguous 'dispatch' heading to 'Model tier assignments'.
Adds inline dispatch resolution algorithm for the code-refiner.
Updates all subagent call examples to include dispatch property."
```

**Acceptance criteria:**
- Old "Use these model tiers for dispatch:" heading is renamed to "Model tier assignments:"
- A "Dispatch resolution" section exists with the 4-step algorithm
- Default-to-`"pi"` behavior is documented
- Both subagent call blocks include `dispatch`
- All 4 "Dispatch" prose lines mention `dispatch`
- No remaining uses of "dispatch" that could be confused with the property name (except in the new Dispatch resolution section)

---

### Task 6: Add model + dispatch resolution to requesting-code-review

**Files:**
- Modify: `agent/skills/requesting-code-review/SKILL.md`

- [ ] **Step 1: Insert model + dispatch resolution instruction**

Before the current "### 3. Dispatch the subagent" section in `requesting-code-review/SKILL.md`, insert:

```markdown
### 2b. Resolve model and dispatch

Read the model matrix from `~/.pi/agent/model-tiers.json`. If the file doesn't exist or is unreadable, stop with: "requesting-code-review requires `~/.pi/agent/model-tiers.json` — see model matrix configuration."

Use the `capable` tier for the reviewer model. Resolve the dispatch target using the `dispatch` map — see execute-plan Step 6 for the full algorithm. Default to `"pi"` if absent.
```

- [ ] **Step 2: Update the subagent call example**

Find the subagent call in section 3:

```
subagent {
  agent: "code-reviewer",
  task: "<filled review-code-prompt.md template>",
  model: "<capable-tier model>"
}
```

Replace with:

```
subagent {
  agent: "code-reviewer",
  task: "<filled review-code-prompt.md template>",
  model: "<capable from model-tiers.json>",
  dispatch: "<dispatch for capable>"
}
```

Also update the prose line below the code block. Find:

```
Use a capable-tier model in a fresh context — the reviewer must see the code without bias from the generation process.
```

Replace with:

```
Use the `capable` model from `model-tiers.json` in a fresh context — the reviewer must see the code without bias from the generation process.
```

- [ ] **Step 3: Verify the subagent call**

Search for `subagent {` and confirm the single block includes both `model:` referencing model-tiers.json and `dispatch:`.

- [ ] **Step 4: Commit**

```bash
git add agent/skills/requesting-code-review/SKILL.md
git commit -m "feat(requesting-code-review): add model + dispatch resolution

Adds model-tiers.json read step and dispatch resolution instruction.
Updates subagent call to use concrete tier references."
```

**Acceptance criteria:**
- The skill has a model + dispatch resolution instruction referencing model-tiers.json
- The subagent call uses `capable from model-tiers.json` (not the old vague placeholder)
- The subagent call includes `dispatch`
- Missing model-tiers.json produces a clear error message and stops execution
