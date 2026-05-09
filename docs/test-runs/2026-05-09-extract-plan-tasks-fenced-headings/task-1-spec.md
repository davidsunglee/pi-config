### Task 1: Add regression coverage for fenced headings

**Files:**
- Modify: `agent/skills/execute-plan/scripts/tests/test_extract_plan_tasks.py`
- Create: `agent/skills/execute-plan/scripts/tests/fixtures/plan-fenced-headings-minimal.md`
- Create: `agent/skills/execute-plan/scripts/tests/fixtures/plan-fenced-headings-realistic.md`

**Steps:**
- [ ] **Step 1:** Add a minimal fixture with a real task that contains a fenced block holding both `## Completion contract` and `### Task 999: Not a real task`, followed by real task content after the fence.
- [ ] **Step 2:** Add a realistic fixture based on the observed failure pattern from `docs/plans/2026-05-08-2026-05-08-define-spec-and-artifact-handoff-fixes.md`, keeping fenced markdown headings inside task content and `**Model recommendation:** standard` after the fence.
- [ ] **Step 3:** Add failing tests that assert fenced headings do not create extra tasks, do not truncate the surrounding task block, and do not prevent post-fence content from being parsed.
- [ ] **Step 4:** Add fence-behavior tests for both backtick and tilde fences, leading indentation, closing fences that are at least as long as the opener, mismatched marker types that must not close the fence, and unclosed fences that suppress structure parsing to EOF.

**Acceptance criteria:**
- The minimal fixture parses to the expected real tasks only.
  Verify: run the parser against `plan-fenced-headings-minimal.md` and confirm no task numbered `999` appears.
- The realistic fixture keeps content after the fenced block inside the real task.
  Verify: assert the parsed task block still contains the post-fence `**Model recommendation:** standard` line and any following task content.
- Required-section validation ignores heading-like lines inside fenced blocks.
  Verify: add a test that would previously have been misled by a fenced `## ...` line and confirm the section validator reports only real structure.
- Fence-shape rules are pinned by tests.
  Verify: the new cases cover backticks, tildes, indentation, same-marker closing, longer closing fences, and unclosed fences.

**Model recommendation:** cheap