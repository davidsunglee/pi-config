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

    def test_help_mentions_new_error_kinds(self):
        result = run_script("--help")
        output = result.stdout
        self.assertIn("missing_required_section", output)
        self.assertIn("dependency_unknown_target", output)
        self.assertIn("dependency_cycle", output)


class TestCleanPlanWaves(unittest.TestCase):
    """Verify clean plan emits waves array."""

    def setUp(self):
        self.result = run_script("--plan", str(FIXTURES / "plan-clean.md"))
        self.data = json.loads(self.result.stdout)

    def test_waves_key_present(self):
        self.assertIn("waves", self.data)

    def test_waves_is_list(self):
        self.assertIsInstance(self.data["waves"], list)

    def test_waves_have_required_fields(self):
        for entry in self.data["waves"]:
            self.assertIn("wave", entry)
            self.assertIn("subwave", entry)
            self.assertIn("tasks", entry)


class TestRequiredSectionMissing(unittest.TestCase):

    def _assert_missing_section(self, fixture_name, expected_section):
        result = run_script("--plan", str(FIXTURES / fixture_name))
        self.assertNotEqual(result.returncode, 0, f"{fixture_name} should exit non-zero")
        errors = json.loads(result.stderr)["errors"]
        sections = [e["section"] for e in errors if e.get("kind") == "missing_required_section"]
        self.assertIn(
            expected_section, sections,
            f"Expected section '{expected_section}' in errors, got: {sections}",
        )

    def test_missing_arch_summary_section(self):
        self._assert_missing_section("plan-missing-section-arch-summary.md", "architecture_summary")

    def test_missing_arch_summary_only_one_error(self):
        result = run_script("--plan", str(FIXTURES / "plan-missing-section-arch-summary.md"))
        errors = json.loads(result.stderr)["errors"]
        section_errors = [e for e in errors if e.get("kind") == "missing_required_section"]
        self.assertEqual(len(section_errors), 1, f"Expected 1 section error, got {section_errors}")
        self.assertEqual(section_errors[0]["section"], "architecture_summary")

    def test_missing_tech_stack_section(self):
        self._assert_missing_section("plan-missing-section-tech-stack.md", "tech_stack")

    def test_missing_tech_stack_only_one_error(self):
        result = run_script("--plan", str(FIXTURES / "plan-missing-section-tech-stack.md"))
        errors = json.loads(result.stderr)["errors"]
        section_errors = [e for e in errors if e.get("kind") == "missing_required_section"]
        self.assertEqual(len(section_errors), 1, f"Expected 1 section error, got {section_errors}")
        self.assertEqual(section_errors[0]["section"], "tech_stack")

    def test_missing_all_three_headers(self):
        result = run_script("--plan", str(FIXTURES / "plan-missing-section-header.md"))
        self.assertNotEqual(result.returncode, 0)
        errors = json.loads(result.stderr)["errors"]
        sections = [e["section"] for e in errors if e.get("kind") == "missing_required_section"]
        self.assertIn("goal", sections)
        self.assertIn("architecture_summary", sections)
        self.assertIn("tech_stack", sections)

    def test_missing_file_structure(self):
        self._assert_missing_section("plan-missing-section-files.md", "file_structure")

    def test_missing_numbered_tasks(self):
        self._assert_missing_section("plan-missing-section-tasks.md", "numbered_tasks")

    def test_missing_dependencies(self):
        self._assert_missing_section("plan-missing-section-deps.md", "dependencies")

    def test_missing_risk_assessment(self):
        self._assert_missing_section("plan-missing-section-risk.md", "risk_assessment")


class TestDependencyValidation(unittest.TestCase):

    def test_unknown_dep_exits_nonzero(self):
        result = run_script("--plan", str(FIXTURES / "plan-unknown-dep.md"))
        self.assertNotEqual(result.returncode, 0)

    def test_unknown_dep_error_kind(self):
        result = run_script("--plan", str(FIXTURES / "plan-unknown-dep.md"))
        errors = json.loads(result.stderr)["errors"]
        kinds = [e["kind"] for e in errors]
        self.assertIn("dependency_unknown_target", kinds)

    def test_unknown_dep_has_task_number_and_unknown_dep(self):
        result = run_script("--plan", str(FIXTURES / "plan-unknown-dep.md"))
        errors = json.loads(result.stderr)["errors"]
        unknown_errors = [e for e in errors if e.get("kind") == "dependency_unknown_target"]
        self.assertTrue(any(e.get("task_number") == 2 for e in unknown_errors))
        self.assertTrue(any(e.get("unknown_dep") == 99 for e in unknown_errors))

    def test_cycle_exits_nonzero(self):
        result = run_script("--plan", str(FIXTURES / "plan-dep-cycle.md"))
        self.assertNotEqual(result.returncode, 0)

    def test_cycle_error_kind(self):
        result = run_script("--plan", str(FIXTURES / "plan-dep-cycle.md"))
        errors = json.loads(result.stderr)["errors"]
        kinds = [e["kind"] for e in errors]
        self.assertIn("dependency_cycle", kinds)

    def test_cycle_names_participating_tasks(self):
        result = run_script("--plan", str(FIXTURES / "plan-dep-cycle.md"))
        errors = json.loads(result.stderr)["errors"]
        cycle_errors = [e for e in errors if e.get("kind") == "dependency_cycle"]
        self.assertTrue(len(cycle_errors) > 0)
        cycle = cycle_errors[0]["cycle"]
        self.assertIn(1, cycle)
        self.assertIn(2, cycle)


class TestWaveGrouping(unittest.TestCase):

    def test_linear_deps_wave_assignment(self):
        result = run_script("--plan", str(FIXTURES / "plan-clean-with-deps.md"))
        self.assertEqual(result.returncode, 0)
        data = json.loads(result.stdout)
        waves = data["waves"]
        wave1 = [w for w in waves if w["wave"] == 1 and w["subwave"] == 1]
        wave2 = [w for w in waves if w["wave"] == 2 and w["subwave"] == 1]
        self.assertTrue(len(wave1) == 1, f"Expected wave 1 subwave 1, got {waves}")
        self.assertEqual(sorted(wave1[0]["tasks"]), [1, 2])
        self.assertTrue(len(wave2) == 1, f"Expected wave 2 subwave 1, got {waves}")
        self.assertEqual(wave2[0]["tasks"], [3])

    def test_parallel_only_all_in_wave1(self):
        result = run_script("--plan", str(FIXTURES / "plan-parallel-only.md"))
        self.assertEqual(result.returncode, 0)
        data = json.loads(result.stdout)
        waves = data["waves"]
        self.assertEqual(len(waves), 1, f"Expected 1 wave entry, got {waves}")
        self.assertEqual(waves[0]["wave"], 1)
        self.assertEqual(waves[0]["subwave"], 1)
        self.assertEqual(sorted(waves[0]["tasks"]), [1, 2, 3])

    def test_large_wave_splits_at_cap(self):
        result = run_script("--plan", str(FIXTURES / "plan-large-wave.md"))
        self.assertEqual(result.returncode, 0)
        data = json.loads(result.stdout)
        waves = data["waves"]
        for entry in waves:
            self.assertLessEqual(
                len(entry["tasks"]), 8,
                f"Subwave has {len(entry['tasks'])} tasks, exceeds cap of 8",
            )

    def test_large_wave_subwave_split(self):
        result = run_script("--plan", str(FIXTURES / "plan-large-wave.md"))
        data = json.loads(result.stdout)
        waves = data["waves"]
        self.assertEqual(len(waves), 2, f"Expected 2 subwaves for 10 tasks with cap 8, got {waves}")
        self.assertEqual(waves[0]["subwave"], 1)
        self.assertEqual(waves[1]["subwave"], 2)
        self.assertEqual(len(waves[0]["tasks"]), 8)
        self.assertEqual(len(waves[1]["tasks"]), 2)


class TestMaxParallelHardCapOverride(unittest.TestCase):

    def test_override_cap_4(self):
        result = run_script(
            "--plan", str(FIXTURES / "plan-large-wave.md"),
            "--max-parallel-hard-cap", "4",
        )
        self.assertEqual(result.returncode, 0)
        data = json.loads(result.stdout)
        waves = data["waves"]
        for entry in waves:
            self.assertLessEqual(
                len(entry["tasks"]), 4,
                f"Subwave has {len(entry['tasks'])} tasks, exceeds cap of 4",
            )

    def test_override_cap_4_at_least_three_subwaves(self):
        result = run_script(
            "--plan", str(FIXTURES / "plan-large-wave.md"),
            "--max-parallel-hard-cap", "4",
        )
        data = json.loads(result.stdout)
        waves = data["waves"]
        self.assertGreaterEqual(len(waves), 3, f"Expected at least 3 subwaves with cap 4, got {waves}")


if __name__ == "__main__":
    unittest.main()
