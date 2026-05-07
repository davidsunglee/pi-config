import json
import subprocess
import sys
import unittest
from pathlib import Path

SCRIPT = Path(__file__).parent.parent / "extract-plan-tasks.py"
FIXTURES = Path(__file__).parent / "fixtures"


def run_script(*args):
    result = subprocess.run(
        [sys.executable, str(SCRIPT)] + list(args),
        capture_output=True,
        text=True,
    )
    return result


class TestCleanPlan(unittest.TestCase):
    def setUp(self):
        self.result = run_script("--plan", str(FIXTURES / "plan-clean.md"))
        self.data = json.loads(self.result.stdout)

    def test_exits_zero(self):
        self.assertEqual(self.result.returncode, 0)

    def test_task_count(self):
        self.assertEqual(len(self.data["tasks"]), 2)

    def test_task1_number(self):
        self.assertEqual(self.data["tasks"][0]["number"], 1)

    def test_task1_title(self):
        self.assertEqual(self.data["tasks"][0]["title"], "Parse plan headings")

    def test_task1_task_spec_starts_with_heading(self):
        spec = self.data["tasks"][0]["task_spec"]
        self.assertTrue(spec.startswith("### Task 1:"), f"task_spec does not start with '### Task 1:': {spec[:80]!r}")

    def test_task1_task_spec_does_not_contain_next_heading(self):
        spec = self.data["tasks"][0]["task_spec"]
        lines = spec.splitlines()
        for line in lines[1:]:
            self.assertFalse(
                line.startswith("### Task ") or line.startswith("## "),
                f"task_spec contains boundary heading: {line!r}",
            )

    def test_task2_task_spec_starts_with_heading(self):
        spec = self.data["tasks"][1]["task_spec"]
        self.assertTrue(spec.startswith("### Task 2:"), f"task_spec does not start with '### Task 2:': {spec[:80]!r}")

    def test_task2_task_spec_does_not_contain_next_heading(self):
        spec = self.data["tasks"][1]["task_spec"]
        lines = spec.splitlines()
        for line in lines[1:]:
            self.assertFalse(
                line.startswith("### Task ") or line.startswith("## "),
                f"task_spec contains boundary heading: {line!r}",
            )

    def test_task1_files_create(self):
        create = self.data["tasks"][0]["files"]["create"]
        self.assertIsInstance(create, list)
        self.assertIn("scripts/extract-plan-tasks.py", create)

    def test_task1_criteria_have_text_and_verify(self):
        for criterion in self.data["tasks"][0]["criteria"]:
            self.assertTrue(criterion["text"], "criterion text is empty")
            self.assertTrue(criterion["verify"], "criterion verify is empty")

    def test_task1_model_recommendation(self):
        self.assertEqual(self.data["tasks"][0]["model_recommendation"], "cheap")

    def test_task1_dependencies_empty(self):
        self.assertEqual(self.data["tasks"][0]["dependencies"], [])

    def test_task2_dependencies(self):
        self.assertEqual(self.data["tasks"][1]["dependencies"], [1])

    def test_test_command_extracted(self):
        cmd = self.data.get("test_command")
        self.assertIsNotNone(cmd)
        self.assertTrue(len(cmd.strip()) > 0, "test_command is blank")


class TestTaskNumberFilter(unittest.TestCase):
    def test_filter_returns_single_task(self):
        result = run_script("--plan", str(FIXTURES / "plan-clean.md"), "--task-number", "2")
        self.assertEqual(result.returncode, 0)
        data = json.loads(result.stdout)
        self.assertEqual(len(data["tasks"]), 1)
        self.assertEqual(data["tasks"][0]["number"], 2)


class TestMissingVerify(unittest.TestCase):
    def test_exits_nonzero(self):
        result = run_script("--plan", str(FIXTURES / "plan-missing-verify.md"))
        self.assertNotEqual(result.returncode, 0)

    def test_stderr_has_missing_verify_recipe_error(self):
        result = run_script("--plan", str(FIXTURES / "plan-missing-verify.md"))
        errors = json.loads(result.stderr)["errors"]
        kinds = [e["kind"] for e in errors]
        self.assertIn("missing_verify_recipe", kinds)

    def test_error_references_task1(self):
        result = run_script("--plan", str(FIXTURES / "plan-missing-verify.md"))
        errors = json.loads(result.stderr)["errors"]
        mv_errors = [e for e in errors if e["kind"] == "missing_verify_recipe"]
        task_nums = [e.get("task_number") for e in mv_errors]
        self.assertIn(1, task_nums)

    def test_error_references_criterion_text(self):
        result = run_script("--plan", str(FIXTURES / "plan-missing-verify.md"))
        errors = json.loads(result.stderr)["errors"]
        mv_errors = [e for e in errors if e["kind"] == "missing_verify_recipe"]
        self.assertTrue(any(e.get("criterion") for e in mv_errors), "No criterion text in error")


class TestDuplicateTask(unittest.TestCase):
    def test_exits_nonzero(self):
        result = run_script("--plan", str(FIXTURES / "plan-duplicate-task.md"))
        self.assertNotEqual(result.returncode, 0)

    def test_stderr_has_duplicate_task_number_error(self):
        result = run_script("--plan", str(FIXTURES / "plan-duplicate-task.md"))
        errors = json.loads(result.stderr)["errors"]
        kinds = [e["kind"] for e in errors]
        self.assertIn("duplicate_task_number", kinds)

    def test_error_references_duplicated_number(self):
        result = run_script("--plan", str(FIXTURES / "plan-duplicate-task.md"))
        errors = json.loads(result.stderr)["errors"]
        dup_errors = [e for e in errors if e["kind"] == "duplicate_task_number"]
        task_nums = [e.get("task_number") for e in dup_errors]
        self.assertIn(1, task_nums)


class TestMissingFiles(unittest.TestCase):
    def test_exits_nonzero(self):
        result = run_script("--plan", str(FIXTURES / "plan-missing-files.md"))
        self.assertNotEqual(result.returncode, 0)

    def test_stderr_has_missing_files_block_error(self):
        result = run_script("--plan", str(FIXTURES / "plan-missing-files.md"))
        errors = json.loads(result.stderr)["errors"]
        kinds = [e["kind"] for e in errors]
        self.assertIn("missing_files_block", kinds)

    def test_error_references_task1(self):
        result = run_script("--plan", str(FIXTURES / "plan-missing-files.md"))
        errors = json.loads(result.stderr)["errors"]
        mf_errors = [e for e in errors if e["kind"] == "missing_files_block"]
        task_nums = [e.get("task_number") for e in mf_errors]
        self.assertIn(1, task_nums)


class TestMissingModel(unittest.TestCase):
    def test_exits_nonzero(self):
        result = run_script("--plan", str(FIXTURES / "plan-missing-model.md"))
        self.assertNotEqual(result.returncode, 0)

    def test_stderr_has_missing_model_recommendation_error(self):
        result = run_script("--plan", str(FIXTURES / "plan-missing-model.md"))
        errors = json.loads(result.stderr)["errors"]
        kinds = [e["kind"] for e in errors]
        self.assertIn("missing_model_recommendation", kinds)

    def test_error_references_task1(self):
        result = run_script("--plan", str(FIXTURES / "plan-missing-model.md"))
        errors = json.loads(result.stderr)["errors"]
        mm_errors = [e for e in errors if e["kind"] == "missing_model_recommendation"]
        task_nums = [e.get("task_number") for e in mm_errors]
        self.assertIn(1, task_nums)


class TestInvalidModel(unittest.TestCase):
    def test_exits_nonzero(self):
        result = run_script("--plan", str(FIXTURES / "plan-invalid-model.md"))
        self.assertNotEqual(result.returncode, 0)

    def test_stderr_has_missing_model_recommendation_error(self):
        result = run_script("--plan", str(FIXTURES / "plan-invalid-model.md"))
        errors = json.loads(result.stderr)["errors"]
        kinds = [e["kind"] for e in errors]
        self.assertIn("missing_model_recommendation", kinds)

    def test_error_detail_mentions_offending_token(self):
        result = run_script("--plan", str(FIXTURES / "plan-invalid-model.md"))
        errors = json.loads(result.stderr)["errors"]
        mm_errors = [e for e in errors if e["kind"] == "missing_model_recommendation"]
        self.assertTrue(
            any("premium" in (e.get("detail") or "") for e in mm_errors),
            "detail does not mention the offending token 'premium'",
        )


class TestOutOfOrder(unittest.TestCase):
    def test_exits_nonzero(self):
        result = run_script("--plan", str(FIXTURES / "plan-out-of-order.md"))
        self.assertNotEqual(result.returncode, 0)

    def test_stderr_has_out_of_order_task_number_error(self):
        result = run_script("--plan", str(FIXTURES / "plan-out-of-order.md"))
        errors = json.loads(result.stderr)["errors"]
        kinds = [e["kind"] for e in errors]
        self.assertIn("out_of_order_task_number", kinds)


class TestHelp(unittest.TestCase):
    def test_help_exits_zero(self):
        result = run_script("--help")
        self.assertEqual(result.returncode, 0)

    def test_help_mentions_expected_terms(self):
        result = run_script("--help")
        output = result.stdout
        self.assertIn("tasks", output)
        self.assertIn("criteria", output)
        self.assertIn("dependencies", output)
        self.assertTrue(
            "missing_verify_recipe" in output or "duplicate_task_number" in output,
            "help does not mention error kinds",
        )


if __name__ == "__main__":
    unittest.main()
