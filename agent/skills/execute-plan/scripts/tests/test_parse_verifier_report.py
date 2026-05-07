"""Tests for parse-verifier-report.py"""
import json
import os
import subprocess
import sys
import tempfile
import unittest

SCRIPT = os.path.join(
    os.path.dirname(__file__), "..", "parse-verifier-report.py"
)
FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures")


def run_script(*args):
    """Run the script with given args; return (returncode, parsed_json)."""
    result = subprocess.run(
        [sys.executable, SCRIPT] + list(args),
        capture_output=True,
        text=True,
    )
    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError:
        data = None
    return result.returncode, data, result.stdout, result.stderr


def fixture(name):
    return os.path.join(FIXTURES, name)


def write_temp_report(content):
    f = tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False)
    f.write(content)
    f.close()
    return f.name


def write_temp_recipes(recipes_array):
    """Write a phase1-recipes JSON file (array shape)."""
    f = tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False)
    json.dump(recipes_array, f)
    f.close()
    return f.name


class TestPassReport(unittest.TestCase):
    def test_pass_report_exit_0(self):
        rc, data, _, _ = run_script(
            "--report", fixture("verifier-report-pass.md"),
            "--criteria-count", "2",
        )
        self.assertEqual(rc, 0)

    def test_pass_report_verdict_pass(self):
        _, data, _, _ = run_script(
            "--report", fixture("verifier-report-pass.md"),
            "--criteria-count", "2",
        )
        self.assertIsNotNone(data)
        self.assertEqual(data["verdict"], "PASS")

    def test_pass_report_two_criteria(self):
        _, data, _, _ = run_script(
            "--report", fixture("verifier-report-pass.md"),
            "--criteria-count", "2",
        )
        self.assertIsNotNone(data)
        self.assertEqual(len(data["per_criterion"]), 2)


class TestFailReport(unittest.TestCase):
    def test_fail_report_exit_nonzero(self):
        rc, _, _, _ = run_script(
            "--report", fixture("verifier-report-fail.md"),
            "--criteria-count", "2",
        )
        self.assertNotEqual(rc, 0)

    def test_fail_report_verdict_fail(self):
        _, data, _, _ = run_script(
            "--report", fixture("verifier-report-fail.md"),
            "--criteria-count", "2",
        )
        self.assertIsNotNone(data)
        self.assertEqual(data["verdict"], "FAIL")

    def test_fail_report_criterion_2_fail(self):
        _, data, _, _ = run_script(
            "--report", fixture("verifier-report-fail.md"),
            "--criteria-count", "2",
        )
        self.assertIsNotNone(data)
        # per_criterion is a list sorted by criterion number (0-indexed)
        self.assertEqual(data["per_criterion"][1]["verdict"], "FAIL")


class TestMalformedHeader(unittest.TestCase):
    def test_malformed_header_exit_nonzero(self):
        rc, _, _, _ = run_script(
            "--report", fixture("verifier-report-malformed.md"),
            "--criteria-count", "1",
        )
        self.assertNotEqual(rc, 0)

    def test_malformed_header_verdict_fail(self):
        _, data, _, _ = run_script(
            "--report", fixture("verifier-report-malformed.md"),
            "--criteria-count", "1",
        )
        self.assertIsNotNone(data)
        self.assertEqual(data["verdict"], "FAIL")

    def test_malformed_header_protocol_errors_nonempty(self):
        _, data, _, _ = run_script(
            "--report", fixture("verifier-report-malformed.md"),
            "--criteria-count", "1",
        )
        self.assertIsNotNone(data)
        self.assertTrue(len(data["protocol_errors"]) > 0)


class TestLowercaseVerdict(unittest.TestCase):
    def test_lowercase_pass_is_protocol_error(self):
        content = """## Phase 1 Evidence

## Per-Criterion Verdicts

[Criterion 1] pass
reason: lowercase verdict

## Overall Verdict

VERDICT: PASS
"""
        path = write_temp_report(content)
        try:
            rc, data, _, _ = run_script(
                "--report", path, "--criteria-count", "1"
            )
            self.assertNotEqual(rc, 0)
            self.assertIsNotNone(data)
            self.assertTrue(len(data["protocol_errors"]) > 0)
        finally:
            os.unlink(path)


class TestDuplicateCriterion(unittest.TestCase):
    def test_duplicate_criterion_protocol_error(self):
        content = """## Phase 1 Evidence

## Per-Criterion Verdicts

[Criterion 1] PASS
reason: first

[Criterion 1] PASS
reason: duplicate

## Overall Verdict

VERDICT: PASS
"""
        path = write_temp_report(content)
        try:
            rc, data, _, _ = run_script(
                "--report", path, "--criteria-count", "1"
            )
            self.assertNotEqual(rc, 0)
            self.assertIsNotNone(data)
            errors = data["protocol_errors"]
            self.assertTrue(
                any("duplicate" in e.lower() or "criterion 1" in e.lower() for e in errors),
                f"Expected duplicate error in protocol_errors: {errors}",
            )
        finally:
            os.unlink(path)


class TestMissingCriterion(unittest.TestCase):
    def test_missing_criterion_protocol_error(self):
        content = """## Phase 1 Evidence

## Per-Criterion Verdicts

[Criterion 1] PASS
reason: ok

[Criterion 3] PASS
reason: ok

## Overall Verdict

VERDICT: PASS
"""
        path = write_temp_report(content)
        try:
            rc, data, _, _ = run_script(
                "--report", path, "--criteria-count", "3"
            )
            self.assertNotEqual(rc, 0)
            self.assertIsNotNone(data)
            errors = data["protocol_errors"]
            self.assertTrue(
                any("2" in e for e in errors),
                f"Expected mention of criterion 2 missing in protocol_errors: {errors}",
            )
        finally:
            os.unlink(path)


class TestOutOfRangeCriterion(unittest.TestCase):
    def test_out_of_range_criterion_protocol_error(self):
        content = """## Phase 1 Evidence

## Per-Criterion Verdicts

[Criterion 1] PASS
reason: ok

[Criterion 2] PASS
reason: ok

[Criterion 3] PASS
reason: ok

[Criterion 4] PASS
reason: out of range

## Overall Verdict

VERDICT: PASS
"""
        path = write_temp_report(content)
        try:
            rc, data, _, _ = run_script(
                "--report", path, "--criteria-count", "3"
            )
            self.assertNotEqual(rc, 0)
            self.assertIsNotNone(data)
            errors = data["protocol_errors"]
            self.assertTrue(
                any("4" in e for e in errors),
                f"Expected mention of out-of-range criterion 4 in protocol_errors: {errors}",
            )
        finally:
            os.unlink(path)


class TestEvidenceBlockMissingField(unittest.TestCase):
    def test_missing_stderr_field_protocol_error(self):
        recipes_path = write_temp_recipes(
            [{"criterion_n": 1, "recipe": "python3 myscript.py --help"}]
        )
        try:
            rc, data, _, _ = run_script(
                "--report", fixture("verifier-report-evidence-malformed.md"),
                "--criteria-count", "1",
                "--phase1-recipes-json", recipes_path,
            )
            self.assertNotEqual(rc, 0)
            self.assertIsNotNone(data)
            errors = data["protocol_errors"]
            self.assertIn(
                "verifier phase-1 evidence block malformed at criterion 1: stderr field missing",
                errors,
            )
        finally:
            os.unlink(recipes_path)


class TestMissingEvidenceBlock(unittest.TestCase):
    def test_missing_evidence_block_for_command_criterion(self):
        content = """## Phase 1 Evidence

## Per-Criterion Verdicts

[Criterion 1] PASS
reason: ok

## Overall Verdict

VERDICT: PASS
"""
        path = write_temp_report(content)
        recipes_path = write_temp_recipes(
            [{"criterion_n": 1, "recipe": "python3 myscript.py --help"}]
        )
        try:
            rc, data, _, _ = run_script(
                "--report", path,
                "--criteria-count", "1",
                "--phase1-recipes-json", recipes_path,
            )
            self.assertNotEqual(rc, 0)
            self.assertIsNotNone(data)
            errors = data["protocol_errors"]
            self.assertIn(
                "verifier missing evidence block for command-style criterion 1",
                errors,
            )
        finally:
            os.unlink(path)
            os.unlink(recipes_path)


class TestCommandNotMatchingRecipe(unittest.TestCase):
    def test_command_not_matching_recipe_protocol_error(self):
        content = """## Phase 1 Evidence

[Evidence for Criterion 1]
command: python3 myscript.py --wrong-flag
exit_code: 0
stdout: usage
stderr:

## Per-Criterion Verdicts

[Criterion 1] PASS
reason: ok

## Overall Verdict

VERDICT: PASS
"""
        path = write_temp_report(content)
        recipes_path = write_temp_recipes(
            [{"criterion_n": 1, "recipe": "python3 myscript.py --help"}]
        )
        try:
            rc, data, _, _ = run_script(
                "--report", path,
                "--criteria-count", "1",
                "--phase1-recipes-json", recipes_path,
            )
            self.assertNotEqual(rc, 0)
            self.assertIsNotNone(data)
            errors = data["protocol_errors"]
            self.assertTrue(
                any("verifier ran command not matching any phase-1 recipe:" in e for e in errors),
                f"Expected recipe-mismatch error in protocol_errors: {errors}",
            )
        finally:
            os.unlink(path)
            os.unlink(recipes_path)


class TestExtraEvidenceCommand(unittest.TestCase):
    def test_extra_evidence_command_with_empty_recipes_protocol_error(self):
        # phase1-recipes-json is [] but report has a Phase 1 evidence command.
        content = """## Phase 1 Evidence

[Evidence for Criterion 1]
command: echo unexpected
exit_code: 0
stdout: unexpected
stderr:

## Per-Criterion Verdicts

[Criterion 1] PASS
reason: ok

## Overall Verdict

VERDICT: PASS
"""
        path = write_temp_report(content)
        recipes_path = write_temp_recipes([])
        try:
            rc, data, _, _ = run_script(
                "--report", path,
                "--criteria-count", "1",
                "--phase1-recipes-json", recipes_path,
            )
            self.assertNotEqual(rc, 0)
            self.assertIsNotNone(data)
            errors = data["protocol_errors"]
            self.assertTrue(
                any(
                    "verifier ran command not matching any phase-1 recipe: echo unexpected" in e
                    for e in errors
                ),
                f"Expected extra-command protocol error: {errors}",
            )
        finally:
            os.unlink(path)
            os.unlink(recipes_path)

    def test_extra_evidence_command_for_inspection_criterion_protocol_error(self):
        # Recipe only for criterion 1; criterion 2 is inspection-only but report
        # has an evidence block with command for it.
        content = """## Phase 1 Evidence

[Evidence for Criterion 1]
command: python3 myscript.py --help
exit_code: 0
stdout: usage
stderr:

[Evidence for Criterion 2]
command: echo unexpected
exit_code: 0
stdout: unexpected
stderr:

## Per-Criterion Verdicts

[Criterion 1] PASS
reason: ok

[Criterion 2] PASS
reason: ok

## Overall Verdict

VERDICT: PASS
"""
        path = write_temp_report(content)
        recipes_path = write_temp_recipes(
            [{"criterion_n": 1, "recipe": "python3 myscript.py --help"}]
        )
        try:
            rc, data, _, _ = run_script(
                "--report", path,
                "--criteria-count", "2",
                "--phase1-recipes-json", recipes_path,
            )
            self.assertNotEqual(rc, 0)
            self.assertIsNotNone(data)
            errors = data["protocol_errors"]
            self.assertTrue(
                any(
                    "verifier ran command not matching any phase-1 recipe: echo unexpected" in e
                    for e in errors
                ),
                f"Expected extra-command protocol error: {errors}",
            )
        finally:
            os.unlink(path)
            os.unlink(recipes_path)


class TestPhase1RecipesPathInvalid(unittest.TestCase):
    def test_phase1_recipes_missing_file_protocol_error(self):
        rc, data, _, _ = run_script(
            "--report", fixture("verifier-report-pass.md"),
            "--criteria-count", "2",
            "--phase1-recipes-json", "/nonexistent/path/recipes.json",
        )
        self.assertNotEqual(rc, 0)
        self.assertIsNotNone(data)
        errors = data["protocol_errors"]
        self.assertTrue(
            any("phase1-recipes-json invalid" in e for e in errors),
            f"Expected phase1-recipes-json invalid error: {errors}",
        )

    def test_phase1_recipes_object_shape_protocol_error(self):
        # Old object shape {"1": "cmd"} must be rejected; only array shape is accepted.
        recipes_path = write_temp_recipes_raw(json.dumps({"1": "python3 myscript.py --help"}))
        try:
            rc, data, _, _ = run_script(
                "--report", fixture("verifier-report-pass.md"),
                "--criteria-count", "2",
                "--phase1-recipes-json", recipes_path,
            )
            self.assertNotEqual(rc, 0)
            self.assertIsNotNone(data)
            errors = data["protocol_errors"]
            self.assertTrue(
                any("phase1-recipes-json invalid" in e for e in errors),
                f"Expected phase1-recipes-json invalid error: {errors}",
            )
        finally:
            os.unlink(recipes_path)

    def test_phase1_recipes_array_shape_accepted(self):
        recipes_path = write_temp_recipes(
            [{"criterion_n": 1, "recipe": "python3 myscript.py --help"}]
        )
        try:
            rc, data, _, _ = run_script(
                "--report", fixture("verifier-report-evidence-malformed.md"),
                "--criteria-count", "1",
                "--phase1-recipes-json", recipes_path,
            )
            # Recipe matches the command in the report; failure here comes only
            # from the missing stderr field, not from a recipes-shape error.
            self.assertNotEqual(rc, 0)
            self.assertIsNotNone(data)
            errors = data["protocol_errors"]
            self.assertFalse(
                any("phase1-recipes-json invalid" in e for e in errors),
                f"Array-shape recipes file must not be rejected: {errors}",
            )
        finally:
            os.unlink(recipes_path)


def write_temp_recipes_raw(text):
    f = tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False)
    f.write(text)
    f.close()
    return f.name


class TestPerCriterionReason(unittest.TestCase):
    def test_fail_report_includes_reason_text(self):
        _, data, _, _ = run_script(
            "--report", fixture("verifier-report-fail.md"),
            "--criteria-count", "2",
        )
        self.assertIsNotNone(data)
        # Each per_criterion entry must include 'reason'.
        c1 = data["per_criterion"][0]
        c2 = data["per_criterion"][1]
        self.assertIn("reason", c1)
        self.assertIn("reason", c2)
        self.assertEqual(c1["criterion"], 1)
        self.assertEqual(c2["criterion"], 2)
        self.assertIn("--help flag", c1["reason"])
        self.assertIn("non-zero exit", c2["reason"])


if __name__ == "__main__":
    unittest.main()
