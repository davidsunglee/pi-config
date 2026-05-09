# Verify Task Prompt

Prompt template dispatched to `verifier` subagents for a single plan task. Fill placeholders before sending. Do not add sections beyond what this template defines.

## Task Spec

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

## Acceptance Criteria

1. The minimal fixture parses to the expected real tasks only.
   Verify: run the parser against `plan-fenced-headings-minimal.md` and confirm no task numbered `999` appears.
2. The realistic fixture keeps content after the fenced block inside the real task.
   Verify: assert the parsed task block still contains the post-fence `**Model recommendation:** standard` line and any following task content.
3. Required-section validation ignores heading-like lines inside fenced blocks.
   Verify: add a test that would previously have been misled by a fenced `## ...` line and confirm the section validator reports only real structure.
4. Fence-shape rules are pinned by tests.
   Verify: the new cases cover backticks, tildes, indentation, same-marker closing, longer closing fences, and unclosed fences.

## Phase 1 Verification Recipes

The orchestrator has extracted every command-style `Verify:` recipe from the `## Acceptance Criteria` section above and listed them below, numbered to match the criterion index in that section. In Phase 1 of your dispatch you MUST execute each recipe BYTE-EQUAL VERBATIM from `## Working Directory` via `bash`, capture stdout + stderr + exit code (per the per-stream 200-line / 20 KB truncation rule documented in your agent definition), and emit one `[Evidence for Criterion N]` block per recipe under a top-level `## Phase 1 Evidence` heading in your response.

Recipe-verbatim discipline (per your agent definition): you MAY run commands ONLY when they exactly match a recipe text byte-equal from this section. You MUST NOT run any other commands. You MUST NOT re-run a command after capturing its output. You MUST NOT add flags, expand variables, or otherwise transform the recipe text.



If this section is empty, the task has no command-style recipes — skip Phase 1 entirely and proceed to Phase 2 judgment using `## Verifier-Visible Files` and any files explicitly named by file-inspection / prose-inspection recipes.

## Verifier-Visible Files

The orchestrator has assembled the list below as the authoritative file set for this verification. It is the deduplicated union of:

1. The task's declared `**Files:**` scope from the plan (authoritative — the task is on the hook for every file it claimed),
2. The worker's self-reported `## Files Changed` (informative but NOT authoritative on its own), and
3. Orchestrator-observed changes in the working tree for this task (via `git status --porcelain` and `git diff HEAD`).

Do NOT treat this list as a worker self-report. A worker that omits a file from its own `## Files Changed` cannot narrow this set, and a file declared in the task's `**Files:**` scope always appears here even if the worker claims it was untouched.

For file-inspection recipes, read only these files plus any files explicitly named by a specific `Verify:` recipe. Do not browse the codebase.

agent/skills/execute-plan/scripts/tests/fixtures/plan-fenced-headings-minimal.md
agent/skills/execute-plan/scripts/tests/fixtures/plan-fenced-headings-realistic.md
agent/skills/execute-plan/scripts/tests/test_extract_plan_tasks.py
agent/skills/execute-plan/scripts/extract-plan-tasks.py
agent/skills/execute-plan/scripts/tests/fixtures/plan-fenced-fake-section.md

## Diff Context

The orchestrator may have truncated this diff if it exceeded a size threshold. If you see a truncation marker line in the diff — any single line indicating that diff content was omitted — note this in your per-criterion `reason:` where it affects judgment, and fall back to reading the file(s) in `## Verifier-Visible Files` directly for any file-inspection criterion whose relevant code may lie in the truncated window.

diff --git a/Users/david/Code/pi-config/agent/skills/execute-plan/scripts/tests/fixtures/plan-fenced-headings-minimal.md b/Users/david/Code/pi-config/agent/skills/execute-plan/scripts/tests/fixtures/plan-fenced-headings-minimal.md
new file mode 100644
index 0000000..a898941
--- /dev/null
+++ b/Users/david/Code/pi-config/agent/skills/execute-plan/scripts/tests/fixtures/plan-fenced-headings-minimal.md
@@ -0,0 +1,61 @@
+## Goal
+
+Test that fenced code blocks with heading-like content inside do not create spurious tasks.
+
+## Architecture summary
+
+Simple plan with one real task containing a fenced block with fake task headings.
+
+## Tech stack
+
+Python 3, unittest, markdown
+
+## File Structure
+
+- scripts/test-fenced.py
+
+### Task 1: Real task with fenced fake content
+
+**Files:**
+- Create: scripts/test-fenced.py
+
+**Steps:**
+- [ ] **Step 1:** Create a test file
+
+Here is a fenced block with fake task content inside:
+
+```markdown
+## Completion contract
+
+This is just documentation about the contract.
+
+### Task 999: Not a real task
+
+This is fake content inside the fence and should not be parsed as a real task.
+
+More fake content.
+```
+
+Here is real content after the fence:
+
+- [ ] **Step 2:** Verify post-fence content is included
+
+**Acceptance criteria:**
+- The parser only extracts one real task (Task 1) when Task 999 is inside a fence.
+  Verify: run the parser and confirm the output contains exactly one task with `number: 1`.
+- Content after the fence is included in the task.
+  Verify: assert the `task_spec` for Task 1 contains `**Step 2:**`.
+
+**Model recommendation:** cheap
+
+## Dependencies
+
+## Risk Assessment
+
+Low risk, this is purely a regression test fixture.
+
+## Test Command
+
+```bash
+python3 -m unittest agent.skills.execute_plan.scripts.tests.test_extract_plan_tasks -v
+```
diff --git a/Users/david/Code/pi-config/agent/skills/execute-plan/scripts/tests/fixtures/plan-fenced-headings-realistic.md b/Users/david/Code/pi-config/agent/skills/execute-plan/scripts/tests/fixtures/plan-fenced-headings-realistic.md
new file mode 100644
index 0000000..78cef53
--- /dev/null
+++ b/Users/david/Code/pi-config/agent/skills/execute-plan/scripts/tests/fixtures/plan-fenced-headings-realistic.md
@@ -0,0 +1,67 @@
+## Goal
+
+Test fence-aware parsing with realistic markdown content inside code blocks.
+
+## Architecture summary
+
+A plan with a task that documents markdown structure in a fenced code block, with the model recommendation appearing after the fence closure.
+
+## Tech stack
+
+Python 3, unittest, markdown
+
+## File Structure
+
+- scripts/doc-example.py
+
+### Task 1: Document markdown structure
+
+**Files:**
+- Create: scripts/doc-example.py
+
+**Steps:**
+- [ ] **Step 1:** Implement the markdown structure documentation
+
+Here is an example of the markdown structure we need to parse:
+
+```markdown
+## Main Section
+
+This is the content of the main section.
+
+### Subsection
+
+Content here.
+
+### Another Subsection
+
+More content.
+
+## Second Section
+
+And so on.
+```
+
+The above block demonstrates how our parser handles nested markdown.
+
+**Acceptance criteria:**
+- The task is parsed correctly despite the fenced markdown block.
+  Verify: run the parser and confirm Task 1 is extracted completely.
+- Content after the fence is still parsed.
+  Verify: assert the `task_spec` contains `The above block demonstrates` and the model recommendation line.
+
+**Model recommendation:** standard
+
+## Dependencies
+
+None.
+
+## Risk Assessment
+
+Low, this is a regression test fixture showing real-world markdown inside code fences.
+
+## Test Command
+
+```bash
+python3 -m unittest agent.skills.execute_plan.scripts.tests.test_extract_plan_tasks -v
+```
diff --git a/agent/skills/execute-plan/scripts/tests/test_extract_plan_tasks.py b/agent/skills/execute-plan/scripts/tests/test_extract_plan_tasks.py
index d3cf54a..089cc39 100644
--- a/agent/skills/execute-plan/scripts/tests/test_extract_plan_tasks.py
+++ b/agent/skills/execute-plan/scripts/tests/test_extract_plan_tasks.py
@@ -438,5 +438,461 @@ class TestMaxParallelHardCapOverride(unittest.TestCase):
         self.assertGreaterEqual(len(waves), 3, f"Expected at least 3 subwaves with cap 4, got {waves}")
 
 
+class TestFencedHeadingsMinimal(unittest.TestCase):
+    """Verify that fenced headings do not create spurious tasks."""
+
+    def setUp(self):
+        self.result = run_script("--plan", str(FIXTURES / "plan-fenced-headings-minimal.md"))
+        if self.result.returncode == 0:
+            self.data = json.loads(self.result.stdout)
+        else:
+            self.data = None
+
+    def test_exits_zero(self):
+        self.assertEqual(self.result.returncode, 0, f"Parser failed: {self.result.stderr}")
+
+    def test_only_one_real_task(self):
+        self.assertIsNotNone(self.data)
+        self.assertEqual(len(self.data["tasks"]), 1, f"Expected 1 task, got {len(self.data['tasks'])}")
+
+    def test_no_fake_task_999(self):
+        self.assertIsNotNone(self.data)
+        task_numbers = [t["number"] for t in self.data["tasks"]]
+        self.assertNotIn(999, task_numbers, "Task 999 from inside fence should not be parsed")
+
+    def test_task_1_extracted(self):
+        self.assertIsNotNone(self.data)
+        self.assertEqual(self.data["tasks"][0]["number"], 1)
+        self.assertEqual(self.data["tasks"][0]["title"], "Real task with fenced fake content")
+
+    def test_post_fence_content_included(self):
+        self.assertIsNotNone(self.data)
+        task_spec = self.data["tasks"][0]["task_spec"]
+        self.assertIn("**Step 2:**", task_spec,
+                      "Post-fence content should be included in task_spec")
+
+
+class TestFencedHeadingsRealistic(unittest.TestCase):
+    """Verify that fenced markdown content doesn't break parsing and model recommendation is preserved."""
+
+    def setUp(self):
+        self.result = run_script("--plan", str(FIXTURES / "plan-fenced-headings-realistic.md"))
+        if self.result.returncode == 0:
+            self.data = json.loads(self.result.stdout)
+        else:
+            self.data = None
+
+    def test_exits_zero(self):
+        self.assertEqual(self.result.returncode, 0, f"Parser failed: {self.result.stderr}")
+
+    def test_single_task(self):
+        self.assertIsNotNone(self.data)
+        self.assertEqual(len(self.data["tasks"]), 1)
+
+    def test_model_recommendation_after_fence(self):
+        self.assertIsNotNone(self.data)
+        task = self.data["tasks"][0]
+        self.assertEqual(task["model_recommendation"], "standard",
+                         "Model recommendation after fence should be preserved")
+
+    def test_task_spec_contains_post_fence_text(self):
+        self.assertIsNotNone(self.data)
+        task_spec = self.data["tasks"][0]["task_spec"]
+        self.assertIn("The above block demonstrates", task_spec,
+                      "Text after fence should be in task_spec")
+
+    def test_task_spec_contains_literal_model_recommendation_line(self):
+        self.assertIsNotNone(self.data)
+        task_spec = self.data["tasks"][0]["task_spec"]
+        self.assertIn("**Model recommendation:** standard", task_spec,
+                      "Literal model recommendation line should be in task_spec")
+
+
+class TestFencedFakeRequiredSection(unittest.TestCase):
+    """Verify that fenced section headings do not satisfy required-section validation."""
+
+    def test_fenced_section_does_not_satisfy_requirement(self):
+        """A required section inside a fence should not count toward validation."""
+        result = run_script("--plan", str(FIXTURES / "plan-fenced-fake-section.md"))
+        self.assertNotEqual(result.returncode, 0,
+                           "Parser should fail when required section is only in a fence")
+
+    def test_error_reports_missing_architecture_summary(self):
+        """The error should specifically report architecture_summary as missing."""
+        result = run_script("--plan", str(FIXTURES / "plan-fenced-fake-section.md"))
+        errors = json.loads(result.stderr)["errors"]
+        sections = [e["section"] for e in errors if e.get("kind") == "missing_required_section"]
+        self.assertIn("architecture_summary", sections,
+                     f"Expected 'architecture_summary' error, got: {sections}")
+
+    def test_only_one_missing_section_error(self):
+        """Should report exactly one missing section error for architecture_summary."""
+        result = run_script("--plan", str(FIXTURES / "plan-fenced-fake-section.md"))
+        errors = json.loads(result.stderr)["errors"]
+        section_errors = [e for e in errors if e.get("kind") == "missing_required_section"]
+        self.assertEqual(len(section_errors), 1,
+                        f"Expected 1 section error, got {len(section_errors)}: {section_errors}")
+
+
+class TestFenceBehavior(unittest.TestCase):
+    """Test fence-awareness: backticks, tildes, indentation, closing rules, unclosed."""
+
+    def _parse_inline_fixture(self, content):
+        """Helper to parse a plan string directly."""
+        import tempfile
+        with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False) as f:
+            f.write(content)
+            temp_plan = f.name
+        try:
+            result = run_script("--plan", temp_plan)
+            return result, json.loads(result.stdout) if result.returncode == 0 else None
+        finally:
+            Path(temp_plan).unlink(missing_ok=True)
+
+    def test_backtick_fence_suppresses_heading(self):
+        """Backtick fence with 3+ backticks should suppress heading parsing inside."""
+        content = """## Goal
+Test backtick fence suppression.
+
+## Architecture summary
+Test.
+
+## Tech stack
+Python.
+
+## File Structure
+- test.py
+
+### Task 1: Test backticks
+
+**Files:**
+- Create: test.py
+
+**Steps:**
+- [ ] **Step 1:** Do something
+
+```
+## Fake Heading Inside
+```
+
+More content.
+
+**Acceptance criteria:**
+- Test passes.
+  Verify: run it.
+
+**Model recommendation:** cheap
+
+## Dependencies
+
+## Risk Assessment
+Low.
+
+## Test Command
+```bash
[diff truncated — 934 lines, 28334 bytes total; verifier should note this and fall back to reading the named files for file-inspection criteria whose relevant code may lie in the truncated window]
@@ -367,13 +456,19 @@ def parse_plan(text, max_parallel_hard_cap=MAX_PARALLEL_HARD_CAP):
         criteria = []
         model_recommendation = None
 
+        # Get fence awareness for this task block
+        block_in_fence = get_fence_aware_lines(block_lines)
+
         state = "header"
         j = 0
         nb = len(block_lines)
         has_files_block = False
 
         while j < nb:
-            line = block_lines[j]
+            if j in block_in_fence:
+                j += 1
+                continue
+            line = block_lines[j].rstrip("\n")
             stripped = line.strip()
 
             if stripped == "**Files:**":
@@ -423,11 +518,15 @@ def parse_plan(text, max_parallel_hard_cap=MAX_PARALLEL_HARD_CAP):
                 criterion_text = stripped[2:].strip()
                 verify_text = None
                 if j + 1 < nb:
-                    next_line = block_lines[j + 1]
-                    next_stripped = next_line.strip()
-                    if next_stripped.startswith("Verify:"):
-                        verify_text = next_stripped[len("Verify:"):].strip()
-                        j += 1
+                    next_j = j + 1
+                    while next_j < nb and next_j in block_in_fence:
+                        next_j += 1
+                    if next_j < nb:
+                        next_line = block_lines[next_j].rstrip("\n")
+                        next_stripped = next_line.strip()
+                        if next_stripped.startswith("Verify:"):
+                            verify_text = next_stripped[len("Verify:"):].strip()
+                            j = next_j
 
                 criteria.append({"text": criterion_text, "verify": verify_text or ""})
                 if verify_text is None:
diff --git a/Users/david/Code/pi-config/agent/skills/execute-plan/scripts/tests/fixtures/plan-fenced-fake-section.md b/Users/david/Code/pi-config/agent/skills/execute-plan/scripts/tests/fixtures/plan-fenced-fake-section.md
new file mode 100644
index 0000000..872ea7b
--- /dev/null
+++ b/Users/david/Code/pi-config/agent/skills/execute-plan/scripts/tests/fixtures/plan-fenced-fake-section.md
@@ -0,0 +1,52 @@
+## Goal
+
+Test that a required section inside a fence does not satisfy section validation.
+
+## Tech stack
+
+Python 3, unittest, markdown
+
+## File Structure
+
+- scripts/test-fence-section.py
+
+### Task 1: Document architecture with fenced section
+
+**Files:**
+- Create: scripts/test-fence-section.py
+
+**Steps:**
+- [ ] **Step 1:** Create a file that documents the architecture
+
+Here is an example of architecture documentation:
+
+```markdown
+## Architecture summary
+
+This is inside a code fence and should NOT satisfy the real required section validation.
+
+The architecture has these components:
+- Parser
+- Validator
+- Emitter
+```
+
+This task demonstrates that fenced headings should not count toward required section validation.
+
+**Acceptance criteria:**
+- The parser correctly rejects this plan because Architecture summary is inside a fence and doesn't count.
+  Verify: The parser should emit a `missing_required_section` error for `architecture_summary`.
+
+**Model recommendation:** cheap
+
+## Dependencies
+
+## Risk Assessment
+
+Low risk for testing purposes.
+
+## Test Command
+
+```bash
+python3 -m unittest agent.skills.execute_plan.scripts.tests.test_extract_plan_tasks -v
+```

## Working Directory

Operate from: `/Users/david/Code/pi-config`

All paths in this prompt are relative to that directory unless otherwise stated.

## Rules

- Two-phase: in Phase 1 you MAY run bash, but ONLY to execute command-style `Verify:` recipes from `## Phase 1 Verification Recipes` byte-equal verbatim. In Phase 2 (judgment) you do NOT run any commands; you cite the Phase 1 evidence blocks for command-style criteria and read files in `## Verifier-Visible Files` (plus recipe-named files) for file-inspection / prose-inspection criteria.
- Do NOT read files outside `## Verifier-Visible Files` unless a `Verify:` recipe explicitly names them by path.
- Every criterion gets a binary verdict: `PASS` or `FAIL`. Any `FAIL` means the overall verdict is `FAIL`.
- If evidence is missing, return `FAIL` with `reason:` explaining what is missing. Do not guess.

## Report Format

Use this exact structure:

Omit the `## Phase 1 Evidence` heading entirely when no command-style recipes ran. The `## Per-Criterion Verdicts` and `## Overall Verdict` sections always appear and their format is unchanged byte-for-byte.

```
## Phase 1 Evidence

[Evidence for Criterion N]
  command: <exact recipe text>
  exit_code: <integer>
  stdout:
    ```
    <captured>
    ```
  stderr:
    ```
    <captured>
    ```

## Per-Criterion Verdicts

[Criterion 1] <PASS | FAIL>
  recipe: <the Verify: recipe text>
  evidence: <Evidence for Criterion N, file path + line range, or diff hunk>
  reason: <one or two sentences>

[Criterion 2] <PASS | FAIL>
  recipe: ...
  evidence: ...
  reason: ...

## Overall Verdict

VERDICT: <PASS | FAIL>
summary: <one paragraph>
```
