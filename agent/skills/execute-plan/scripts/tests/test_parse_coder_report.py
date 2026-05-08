"""Tests for parse-coder-report.py"""
import json
import os
import subprocess
import sys
import unittest

SCRIPT = os.path.join(
    os.path.dirname(__file__), "..", "parse-coder-report.py"
)
FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures")


def run_script(*args):
    """Run the script with given args; return (returncode, stdout_json, stdout_raw, stderr_raw)."""
    result = subprocess.run(
        [sys.executable, SCRIPT] + list(args),
        capture_output=True,
        text=True,
    )
    try:
        stdout_data = json.loads(result.stdout)
    except json.JSONDecodeError:
        stdout_data = None
    try:
        stderr_data = json.loads(result.stderr)
    except json.JSONDecodeError:
        stderr_data = None
    return result.returncode, stdout_data, stderr_data, result.stdout, result.stderr


def fixture(name):
    return os.path.join(FIXTURES, name)


class TestDoneReport(unittest.TestCase):
    def setUp(self):
        self.rc, self.data, self.stderr_data, self.stdout, self.stderr = run_script(
            "--report", fixture("coder-report-done.md")
        )

    def test_exit_0(self):
        self.assertEqual(self.rc, 0)

    def test_status_done(self):
        self.assertEqual(self.data["status"], "DONE")

    def test_files_changed_length_2(self):
        self.assertEqual(len(self.data["files_changed"]), 2)

    def test_files_changed_paths_in_order(self):
        self.assertEqual(
            self.data["files_changed"][0],
            "agent/skills/execute-plan/scripts/parse-coder-report.py",
        )
        self.assertEqual(
            self.data["files_changed"][1],
            "agent/skills/execute-plan/scripts/tests/test_parse_coder_report.py",
        )

    def test_completed_block_nonempty(self):
        self.assertTrue(self.data["completed_block"].strip())

    def test_protocol_warnings_empty(self):
        self.assertEqual(self.data["protocol_warnings"], [])

    def test_blocker_text_null(self):
        self.assertIsNone(self.data["blocker_text"])

    def test_needs_text_null(self):
        self.assertIsNone(self.data["needs_text"])


class TestDoneWithConcerns(unittest.TestCase):
    def setUp(self):
        self.rc, self.data, self.stderr_data, self.stdout, self.stderr = run_script(
            "--report", fixture("coder-report-done-with-concerns.md")
        )

    def test_exit_0(self):
        self.assertEqual(self.rc, 0)

    def test_status(self):
        self.assertEqual(self.data["status"], "DONE_WITH_CONCERNS")

    def test_concerns_block_nonempty(self):
        self.assertTrue(self.data["concerns_block"].strip())

    def test_no_concerns_block_missing_warning(self):
        self.assertNotIn("concerns_block_missing", self.data["protocol_warnings"])


class TestBlocked(unittest.TestCase):
    def setUp(self):
        self.rc, self.data, self.stderr_data, self.stdout, self.stderr = run_script(
            "--report", fixture("coder-report-blocked.md")
        )

    def test_exit_0(self):
        self.assertEqual(self.rc, 0)

    def test_status(self):
        self.assertEqual(self.data["status"], "BLOCKED")

    def test_blocker_text_nonempty(self):
        self.assertTrue(self.data["blocker_text"].strip())

    def test_needs_text_null(self):
        self.assertIsNone(self.data["needs_text"])


class TestNeedsContext(unittest.TestCase):
    def setUp(self):
        self.rc, self.data, self.stderr_data, self.stdout, self.stderr = run_script(
            "--report", fixture("coder-report-needs-context.md")
        )

    def test_exit_0(self):
        self.assertEqual(self.rc, 0)

    def test_status(self):
        self.assertEqual(self.data["status"], "NEEDS_CONTEXT")

    def test_needs_text_nonempty(self):
        self.assertTrue(self.data["needs_text"].strip())

    def test_blocker_text_null(self):
        self.assertIsNone(self.data["blocker_text"])


class TestMissingStatus(unittest.TestCase):
    def setUp(self):
        self.rc, self.data, self.stderr_data, self.stdout, self.stderr = run_script(
            "--report", fixture("coder-report-no-status.md")
        )

    def test_exit_nonzero(self):
        self.assertNotEqual(self.rc, 0)

    def test_stderr_failure_status_line_missing(self):
        self.assertIsNotNone(self.stderr_data)
        self.assertEqual(self.stderr_data["failure"], "status_line_missing")


class TestInvalidStatusToken(unittest.TestCase):
    def setUp(self):
        self.rc, self.data, self.stderr_data, self.stdout, self.stderr = run_script(
            "--report", fixture("coder-report-bad-status.md")
        )

    def test_exit_nonzero(self):
        self.assertNotEqual(self.rc, 0)

    def test_stderr_failure_status_token_invalid(self):
        self.assertIsNotNone(self.stderr_data)
        self.assertEqual(self.stderr_data["failure"], "status_token_invalid")

    def test_stderr_token_value(self):
        self.assertEqual(self.stderr_data["token"], "COMPLETED")


class TestConcernsMissing(unittest.TestCase):
    def setUp(self):
        self.rc, self.data, self.stderr_data, self.stdout, self.stderr = run_script(
            "--report", fixture("coder-report-concerns-missing.md")
        )

    def test_exit_0(self):
        self.assertEqual(self.rc, 0)

    def test_protocol_warnings_contains_concerns_block_missing(self):
        self.assertIn("concerns_block_missing", self.data["protocol_warnings"])


class TestBulletWithoutBackticks(unittest.TestCase):
    """Bullets without backticks should be silently skipped in files_changed."""

    def test_bullet_without_backticks_skipped(self):
        import tempfile

        content = """STATUS: DONE

## Completed
Done.

## Tests
Pass.

## Files Changed
- file.ts — note without backticks
- `path/to/real.py` — with backticks

## Self-Review Findings
None.
"""
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".md", delete=False
        ) as f:
            f.write(content)
            tmp = f.name

        try:
            rc, data, _, _, _ = run_script("--report", tmp)
            self.assertEqual(rc, 0)
            self.assertEqual(data["files_changed"], ["path/to/real.py"])
            self.assertEqual(data["protocol_warnings"], [])
        finally:
            os.unlink(tmp)


if __name__ == "__main__":
    unittest.main()
