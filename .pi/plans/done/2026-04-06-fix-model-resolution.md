# Fix Model Resolution: Explicit Tier Map in settings.json

## Goal

Replace hallucination-prone model resolution logic (abstract tier tables, cross-provider rotation heuristics, model string parsing) with an explicit `modelTiers` section in `~/.pi/agent/settings.json`. The agent reads concrete model strings from the tier map instead of guessing model names at runtime. Cross-provider rotation is removed from per-wave spec review (Step 9) and replaced with same-provider standard tier. Plan review and final code review use `crossProvider.capable` with a same-provider fallback and user notification on failure.

## Architecture Summary

The model tier system spans three files that form a resolution chain:

1. **`settings.json`** — source of truth for model name strings (new `modelTiers` section)
2. **`execute-plan/SKILL.md`** — consumes tiers in Step 6 (worker dispatch), Step 9 (spec review), and Step 12 (final code review)
3. **`generate-plan/SKILL.md`** — consumes tiers in Step 3.5 (plan review)

Currently, Steps 6/9/12 and Step 3.5 each contain their own model resolution logic: abstract tier tables, `claude-*`/`gpt-*`/`gemini-*` string parsing, and `Anthropic → OpenAI → Google → Anthropic` rotation. This is replaced with a single lookup: read `modelTiers` from `settings.json`, map the task's tier recommendation to the corresponding value.

## Tech Stack

- JSON (settings.json)
- Markdown (skill files — instruction documents, not code)

## File Structure

- `~/.pi/agent/settings.json` (Modify) — Add `modelTiers` section with `capable`, `standard`, `cheap`, and `crossProvider` tiers
- `~/.pi/agent/skills/execute-plan/SKILL.md` (Modify) — Rewrite Step 6 (tier resolution), Step 9 (spec review model selection), Step 12 (final review model selection)
- `~/.pi/agent/skills/generate-plan/SKILL.md` (Modify) — Rewrite Step 3.5 subsection 3 (plan review model selection)

## Tasks

### Task 1: Add `modelTiers` to settings.json

**Files:**
- Modify: `~/.pi/agent/settings.json`

**Steps:**

- [ ] **Step 1: Read the current settings.json** — Read `~/.pi/agent/settings.json` to confirm its current structure (it should have `lastChangelogVersion`, `defaultProvider`, `defaultModel`, `defaultThinkingLevel`, `compaction`, `hideThinkingBlock`, `theme`, `packages`, `enabledModels`).

- [ ] **Step 2: Add the `modelTiers` key** — Add the following `modelTiers` section to the JSON object, after the `enabledModels` array:

```json
"modelTiers": {
  "capable": "anthropic/claude-opus-4-6",
  "standard": "anthropic/claude-sonnet-4-6",
  "cheap": "anthropic/claude-haiku-4-5",
  "crossProvider": {
    "capable": "openai-codex/gpt-5.4",
    "standard": "openai-codex/gpt-5.4-mini"
  }
}
```

**Constraints that would break it:**
- The result must be valid JSON. Ensure no trailing commas, mismatched braces, or missing commas between the `enabledModels` array and the new `modelTiers` key.
- `crossProvider` does NOT have a `cheap` tier — do not add one.
- Provider prefixes in the model strings (e.g., `anthropic/`, `openai-codex/`) must match what pi's subagent dispatch expects. These are the same format used in `enabledModels` and `defaultModel` in the same file.

- [ ] **Step 3: Validate the JSON** — Run `cat ~/.pi/agent/settings.json | python3 -m json.tool > /dev/null` (or equivalent) to confirm the file is valid JSON. Read the file back to confirm the `modelTiers` section is present and correctly structured.

**Acceptance criteria:**
- `~/.pi/agent/settings.json` contains a `modelTiers` key at the top level
- `modelTiers` has exactly four keys: `capable`, `standard`, `cheap`, `crossProvider`
- `crossProvider` has exactly two keys: `capable`, `standard`
- All existing settings are preserved unchanged
- File is valid JSON

**Model recommendation:** cheap

---

### Task 2: Rewrite execute-plan Step 6 (model tier resolution)

**Files:**
- Modify: `~/.pi/agent/skills/execute-plan/SKILL.md`

**Steps:**

- [ ] **Step 1: Read the current execute-plan SKILL.md** — Read `~/.pi/agent/skills/execute-plan/SKILL.md` in full. Identify the exact boundaries of Step 6 ("## Step 6: Resolve model tiers") — it starts at the `## Step 6` heading and ends just before `## Step 7`.

- [ ] **Step 2: Replace Step 6 content** — Replace everything between `## Step 6: Resolve model tiers` and `## Step 7: Execute waves` (exclusive) with the following new content:

```markdown
## Step 6: Resolve model tiers

Read the `modelTiers` section from `~/.pi/agent/settings.json`:

```bash
cat ~/.pi/agent/settings.json | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin).get('modelTiers', {}), indent=2))"
```

Map each task's model recommendation to the tier map:

| Task recommendation | Model to use |
|---------------------|-------------|
| `capable` | `modelTiers.capable` |
| `standard` | `modelTiers.standard` |
| `cheap` | `modelTiers.cheap` |

If a task has no tier specified, apply this rubric:
- Touches 1–2 files with a complete spec → `cheap`
- Touches multiple files with integration concerns → `standard`
- Requires design judgment or broad codebase understanding → `capable`

Always pass an explicit `model` override per task in the subagent dispatch using the resolved value from the tier map. Do not parse, guess, or derive model name strings — use the exact strings from `modelTiers`.
```

**Constraints that would break it:**
- The replacement must preserve the `## Step 6` heading exactly (other steps reference it).
- The replacement must NOT include content that belongs to Step 7 (the `## Step 7` heading and everything after it must remain unchanged).
- The fenced code blocks inside the markdown use triple backticks — when the skill file itself is markdown, ensure the inner fenced blocks are correctly delimited (the file already uses this pattern in other steps).

- [ ] **Step 3: Verify no references to the old tier table remain in Step 6** — Grep the file for "Claude equivalent", "GPT equivalent", "Gemini equivalent", "detect which model family", "latest opus-class", "latest sonnet-class", "latest haiku-class". None of these should appear anywhere in the file after the edit.

**Acceptance criteria:**
- Step 6 instructs the agent to read `modelTiers` from `~/.pi/agent/settings.json`
- Step 6 contains a simple 3-row mapping table (`capable`/`standard`/`cheap` → `modelTiers.*`)
- The abstract multi-provider tier table (Claude/GPT/Gemini equivalents) is completely removed
- The "detect which model family is available" instruction is completely removed
- The default rubric for unspecified tiers is preserved
- Steps 5 and 7 are unchanged

**Model recommendation:** standard

---

### Task 3: Rewrite execute-plan Step 9 (per-wave spec review model selection)

**Files:**
- Modify: `~/.pi/agent/skills/execute-plan/SKILL.md`

**Steps:**

- [ ] **Step 1: Read the current Step 9 section** — Read `~/.pi/agent/skills/execute-plan/SKILL.md` and locate the "### Spec compliance review" subsection within Step 9. Identify item 3 ("**Select a standard-tier cross-provider model:**") and item 4 ("**Dispatch:**").

- [ ] **Step 2: Replace item 3 in the spec compliance review** — Replace the current item 3 (from `3. **Select a standard-tier cross-provider model:**` through `Fallback: if the alternate provider's model is unavailable, use the same provider's standard tier`) with:

```markdown
3. **Select the spec review model:**
   - Use `modelTiers.standard` from `~/.pi/agent/settings.json` (already read in Step 6).
   - This is the same provider as the implementer — cross-provider rotation is not used for per-wave spec review.
```

- [ ] **Step 3: Update the dispatch code block in item 4** — In item 4 ("**Dispatch:**"), replace `model: "<standard cross-provider>"` with `model: "<modelTiers.standard>"` in both the parallel and sequential dispatch examples. The full item 4 should read:

```markdown
4. **Dispatch:**
   - If parallel execution mode → dispatch all spec reviews for the wave in parallel:
     ```
     subagent { tasks: [
       { agent: "plan-executor", task: "<filled spec-reviewer.md for task A>", model: "<modelTiers.standard>" },
       { agent: "plan-executor", task: "<filled spec-reviewer.md for task B>", model: "<modelTiers.standard>" },
       ...
     ]}
     ```
   - If sequential execution mode → dispatch each review sequentially
```

- [ ] **Step 4: Verify no cross-provider rotation remains in Step 9** — Grep the Step 9 section for "cross-provider", "rotation", "Anthropic → OpenAI", "Parse model strings", "claude-\*", "gpt-\*", "gemini-\*". None should appear in Step 9 after the edit. (Note: `cross-provider` may appear in the negative — "cross-provider rotation is not used" — that's fine. The rotation *logic* must be gone.)

**Acceptance criteria:**
- Step 9 item 3 uses `modelTiers.standard` directly with no provider detection or rotation
- Step 9 item 4 dispatch examples use `<modelTiers.standard>` as the model
- All model string parsing logic (`claude-*` → Anthropic, etc.) is removed from Step 9
- All cross-provider rotation logic (`Anthropic → OpenAI → Google → Anthropic`) is removed from Step 9
- Items 1, 2, and 5 of the spec compliance review are unchanged
- The rest of Step 9 (the "After each wave" verification paragraph before the spec review subsection) is unchanged

**Model recommendation:** standard

---

### Task 4: Rewrite execute-plan Step 12 (final code review model selection)

**Files:**
- Modify: `~/.pi/agent/skills/execute-plan/SKILL.md`

**Steps:**

- [ ] **Step 1: Read the current Step 12 section** — Read `~/.pi/agent/skills/execute-plan/SKILL.md` and locate Step 12 ("## Step 12: Request code review"). Identify item 4 ("**Dispatch review subagent:**") and the text "Use a capable-tier model in a fresh context."

- [ ] **Step 2: Replace item 4 with cross-provider dispatch and fallback** — Replace the current item 4 (dispatch block and the "Use a capable-tier model" sentence) with:

```markdown
4. **Dispatch review subagent:**

   Use `modelTiers.crossProvider.capable` from `~/.pi/agent/settings.json` (already read in Step 6) for an independent cross-provider perspective:
   ```
   subagent {
     agent: "plan-executor",
     task: "<filled template>",
     model: "<modelTiers.crossProvider.capable>"
   }
   ```

   **Fallback:** If the dispatch fails (model unavailable, provider error), retry with `modelTiers.capable` (same provider) and notify the user:
   ```
   ⚠️ Cross-provider review failed (<modelTiers.crossProvider.capable>).
   Falling back to same-provider review (<modelTiers.capable>).
   ```

   The fallback dispatch:
   ```
   subagent {
     agent: "plan-executor",
     task: "<filled template>",
     model: "<modelTiers.capable>"
   }
   ```
```

- [ ] **Step 3: Verify the updated Step 12** — Read back Step 12 to confirm: (a) it references `modelTiers.crossProvider.capable` as the primary model, (b) it has a fallback to `modelTiers.capable`, (c) the fallback includes a user notification, (d) items 1–3 and 5 are unchanged.

**Acceptance criteria:**
- Step 12 item 4 dispatches with `modelTiers.crossProvider.capable` as the primary model
- On failure, it falls back to `modelTiers.capable`
- The fallback includes a visible user notification (⚠️ message)
- Items 1, 2, 3, and 5 of Step 12 are unchanged
- No vague `<capable-tier>` reference remains in Step 12

**Model recommendation:** standard

---

### Task 5: Rewrite generate-plan Step 3.5 subsection 3 (plan review model selection)

**Files:**
- Modify: `~/.pi/agent/skills/generate-plan/SKILL.md`

**Steps:**

- [ ] **Step 1: Read the current generate-plan SKILL.md** — Read `~/.pi/agent/skills/generate-plan/SKILL.md` in full. Locate Step 3.5 subsection "### 3. Select a cross-provider capable-tier model" (around line 64). This subsection contains the provider detection, model string parsing, rotation logic, and fallback.

- [ ] **Step 2: Replace subsection 3** — Replace the entire "### 3. Select a cross-provider capable-tier model" subsection (from its heading through the end of item 4 "**Fallback:**..." line, just before "### 4. Dispatch the reviewer") with:

```markdown
### 3. Select the review model

Read `modelTiers` from `~/.pi/agent/settings.json` (use `cat` + `python3 -c` as in execute-plan Step 6).

Use `modelTiers.crossProvider.capable` for cross-provider review.

**Fallback:** If the dispatch fails (model unavailable, provider error), retry with `modelTiers.capable` (same provider) and notify the user:
```
⚠️ Cross-provider plan review failed (<modelTiers.crossProvider.capable>).
Falling back to same-provider review (<modelTiers.capable>).
```
```

- [ ] **Step 3: Update subsection 4 dispatch example** — In "### 4. Dispatch the reviewer", replace `model: "<resolved capable-tier model>"` with `model: "<modelTiers.crossProvider.capable>"`. The dispatch block should read:

```markdown
### 4. Dispatch the reviewer

```
subagent {
  agent: "plan-executor",
  task: "<filled plan-reviewer.md template>",
  model: "<modelTiers.crossProvider.capable>"
}
```

If the cross-provider model failed and fallback is in effect, use `modelTiers.capable` instead.
```

- [ ] **Step 4: Verify no rotation or parsing logic remains** — Grep `~/.pi/agent/skills/generate-plan/SKILL.md` for "rotation", "Anthropic → OpenAI", "claude-\*", "gpt-\*", "gemini-\*", "parse.*model string", "detect which provider". None should appear after the edit.

**Acceptance criteria:**
- Step 3.5 subsection 3 uses `modelTiers.crossProvider.capable` directly with no provider detection or rotation
- The three-provider rotation logic (`Anthropic → OpenAI → Google → Anthropic`) is completely removed
- Model string parsing (`claude-*` → Anthropic, `gpt-*` → OpenAI, `gemini-*` → Google) is completely removed
- Fallback is to `modelTiers.capable` with a user notification
- The dispatch example in subsection 4 uses `<modelTiers.crossProvider.capable>`
- Subsections 1, 2, and 5 of Step 3.5 are unchanged
- All other steps (1, 2, 3, 4) of generate-plan are unchanged

**Model recommendation:** standard

---

### Task 6: Final sweep — verify no dead logic remains

**Files:**
- Verify: `~/.pi/agent/skills/execute-plan/SKILL.md`
- Verify: `~/.pi/agent/skills/generate-plan/SKILL.md`
- Verify: `~/.pi/agent/settings.json`

**Steps:**

- [ ] **Step 1: Grep all skill files for dead patterns** — Run these greps across `~/.pi/agent/skills/` and confirm zero matches (excluding this plan file and any negative references like "rotation is not used"):

  ```bash
  grep -n "detect which model family" ~/.pi/agent/skills/execute-plan/SKILL.md ~/.pi/agent/skills/generate-plan/SKILL.md
  grep -n "Claude equivalent\|GPT equivalent\|Gemini equivalent" ~/.pi/agent/skills/execute-plan/SKILL.md ~/.pi/agent/skills/generate-plan/SKILL.md
  grep -n "latest opus-class\|latest sonnet-class\|latest haiku-class\|latest GPT frontier\|latest GPT mini\|latest GPT nano\|latest pro-class\|latest flash-class\|latest flash-lite" ~/.pi/agent/skills/execute-plan/SKILL.md ~/.pi/agent/skills/generate-plan/SKILL.md
  grep -n "Anthropic → OpenAI → Google" ~/.pi/agent/skills/execute-plan/SKILL.md ~/.pi/agent/skills/generate-plan/SKILL.md
  grep -n 'claude-\*.*Anthropic\|gpt-\*.*OpenAI\|gemini-\*.*Google' ~/.pi/agent/skills/execute-plan/SKILL.md ~/.pi/agent/skills/generate-plan/SKILL.md
  grep -n "Parse model strings" ~/.pi/agent/skills/execute-plan/SKILL.md ~/.pi/agent/skills/generate-plan/SKILL.md
  ```

  Each grep should return zero results.

- [ ] **Step 2: Verify settings.json is valid and complete** — Read `~/.pi/agent/settings.json`, confirm it has `modelTiers` with the correct structure, and confirm all pre-existing keys are intact.

- [ ] **Step 3: Verify execute-plan SKILL.md is coherent** — Read the full `~/.pi/agent/skills/execute-plan/SKILL.md`. Confirm:
  - Step 6 references `modelTiers` from `settings.json`
  - Step 9 uses `modelTiers.standard` (no cross-provider rotation)
  - Step 12 uses `modelTiers.crossProvider.capable` with fallback to `modelTiers.capable`
  - All other steps (0–5, 7–8, 10–11, 13) are unchanged from their pre-edit state

- [ ] **Step 4: Verify generate-plan SKILL.md is coherent** — Read the full `~/.pi/agent/skills/generate-plan/SKILL.md`. Confirm:
  - Step 3.5 subsection 3 uses `modelTiers.crossProvider.capable` with fallback
  - No rotation or model string parsing logic exists
  - All other steps and subsections are unchanged

**Acceptance criteria:**
- Zero matches for all dead-logic grep patterns across all skill files
- `settings.json` is valid JSON with `modelTiers` correctly structured
- `execute-plan/SKILL.md` has no references to the old tier table, model string parsing, or cross-provider rotation
- `generate-plan/SKILL.md` has no references to model string parsing or provider rotation
- Both skill files are structurally intact — all step numbers and headings present, no content accidentally deleted

**Model recommendation:** standard

## Dependencies

- Task 2 depends on: Task 1 (Step 6 references the `modelTiers` section that Task 1 creates)
- Task 3 depends on: Task 2 (Step 9 references "already read in Step 6" which Task 2 rewrites)
- Task 4 depends on: Task 3 (edits same file as Task 3 — must be sequential to avoid clobbering)
- Task 5 depends on: Task 1 (Step 3.5 reads `modelTiers` from `settings.json`)
- Task 6 depends on: Task 1, Task 2, Task 3, Task 4, Task 5 (verification sweep after all edits)

## Risk Assessment

### Risk 1: Concurrent edits to execute-plan/SKILL.md
**Impact:** Tasks 2, 3, and 4 all modify `execute-plan/SKILL.md`. If executed in parallel, they could clobber each other's changes.
**Mitigation:** The dependency graph ensures Tasks 3 and 4 depend on Task 2 (so Task 2 runs first). Tasks 3 and 4 can run in parallel because they edit different sections (Step 9 vs Step 12) — but since they modify the same file, they should be executed sequentially or the orchestrator should use file-level locking. The wave structure naturally handles this: Wave 1 = [Task 1], Wave 2 = [Task 2, Task 5], Wave 3 = [Task 3, Task 4], Wave 4 = [Task 6]. Tasks 3 and 4 are in the same wave editing the same file — **the orchestrator should run them sequentially within that wave**, or they should be placed in separate waves.

**Recommended adjustment:** Make Task 4 depend on Task 3 to avoid concurrent edits to the same file. This yields: Wave 1 = [Task 1], Wave 2 = [Task 2, Task 5], Wave 3 = [Task 3], Wave 4 = [Task 4], Wave 5 = [Task 6].

### Risk 2: Model strings in settings.json become stale
**Impact:** If model versions change (e.g., `claude-opus-4-7` is released), the tier map has stale strings.
**Mitigation:** This is by design — the user updates `settings.json` manually. The spec explicitly calls this out. No action needed.

### Risk 3: Markdown nesting — fenced code blocks inside fenced code blocks
**Impact:** The skill files are markdown that contain fenced code block examples. When editing, incorrect backtick nesting could break the markdown rendering.
**Mitigation:** Each task's steps specify the exact replacement content with correct fencing. The worker should read back the file after editing to verify rendering is correct.

### Risk 4: requesting-code-review/SKILL.md still says `<capable-tier model>`
**Impact:** The standalone requesting-code-review skill (used outside of plan execution) still has a vague `<capable-tier model>` reference in its dispatch example. This is not broken — it's just not updated to reference `modelTiers`.
**Mitigation:** Out of scope for this plan. The requesting-code-review skill is invoked by execute-plan Step 12 (which we're fixing) and also used standalone. A follow-up could update it, but it doesn't have the hallucination-prone rotation logic — it just says "use a capable-tier model" which is vague but not dangerous.

## Review Notes

_Reviewed by GPT-5.4 (openai) — Approved with 0 errors, 2 warnings, 1 suggestion. No blocking issues._
