"""Tests for parse-test-runner-artifact.py"""
import json
import os
import subprocess
import sys
import tempfile
import unittest

SCRIPT = os.path.join(
    os.path.dirname(__file__), "..", "parse-test-runner-artifact.py"
)
FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures")


def run_script(*args):
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


def write_temp_artifact(content):
    f = tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False)
    f.write(content)
    f.close()
    return f.name


def write_temp_message(content):
    f = tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False)
    f.write(content)
    f.close()
    return f.name


CLEAN_ARTIFACT = """\
PHASE: baseline
COMMAND: npm test
WORKING_DIRECTORY: /tmp/project
EXIT_CODE: 0
TIMESTAMP: 2026-05-01T10:00:00Z
FAILING_IDENTIFIERS_COUNT: 0
FAILING_IDENTIFIERS:
END_FAILING_IDENTIFIERS
NON_RECONCILABLE_COUNT: 0
NON_RECONCILABLE_FAILURES:
END_NON_RECONCILABLE_FAILURES

--- RAW RUN OUTPUT BELOW ---
All tests passed.
"""


class TestCleanArtifact(unittest.TestCase):
    def test_clean_artifact_parses(self):
        rc, data, _, _ = run_script("--artifact", fixture("test-runner-artifact-clean.txt"))
        self.assertEqual(rc, 0)
        self.assertIsNotNone(data)
        self.assertEqual(data["exit_code"], 0)
        self.assertEqual(data["failing_identifiers"], [])
        self.assertEqual(data["non_reconcilable_failures"], [])


class TestStableFailures(unittest.TestCase):
    def test_stable_failures_only(self):
        rc, data, _, _ = run_script("--artifact", fixture("test-runner-artifact-stable-failures.txt"))
        self.assertEqual(rc, 0)
        self.assertIsNotNone(data)
        self.assertEqual(data["failing_identifiers"], ["tests/test_a.py::test_one", "tests/test_b.py::test_two"])
        self.assertEqual(data["non_reconcilable_failures"], [])


class TestNonReconcilable(unittest.TestCase):
    def test_non_reconcilable_only(self):
        rc, data, _, _ = run_script("--artifact", fixture("test-runner-artifact-non-reconcilable.txt"))
        self.assertEqual(rc, 0)
        self.assertIsNotNone(data)
        self.assertEqual(data["failing_identifiers"], ["tests/test_c.py::test_three"])
        self.assertEqual(len(data["non_reconcilable_failures"]), 2)
        self.assertIn("ImportError", data["non_reconcilable_failures"][0])
        self.assertIn("SyntaxError", data["non_reconcilable_failures"][1])
        # Entries are multi-line and preserved verbatim
        self.assertIn("\n", data["non_reconcilable_failures"][0])
        self.assertIn("\n", data["non_reconcilable_failures"][1])


class TestBothBucketsPopulated(unittest.TestCase):
    def test_both_buckets_populated(self):
        rc, data, _, _ = run_script("--artifact", fixture("test-runner-artifact-non-reconcilable.txt"))
        self.assertEqual(rc, 0)
        self.assertIsNotNone(data)
        self.assertGreater(len(data["failing_identifiers"]), 0)
        self.assertGreater(len(data["non_reconcilable_failures"]), 0)


class TestDuplicateIdentifierDedupes(unittest.TestCase):
    def test_duplicate_identifier_dedupes(self):
        content = (
            "PHASE: baseline\n"
            "COMMAND: pytest\n"
            "WORKING_DIRECTORY: /tmp\n"
            "EXIT_CODE: 1\n"
            "TIMESTAMP: 2026-05-01T10:00:00Z\n"
            "FAILING_IDENTIFIERS_COUNT: 3\n"
            "FAILING_IDENTIFIERS:\n"
            "tests/test_a.py::test_one\n"
            "tests/test_b.py::test_two\n"
            "tests/test_a.py::test_one\n"
            "END_FAILING_IDENTIFIERS\n"
            "NON_RECONCILABLE_COUNT: 0\n"
            "NON_RECONCILABLE_FAILURES:\n"
            "END_NON_RECONCILABLE_FAILURES\n"
            "\n"
            "--- RAW RUN OUTPUT BELOW ---\n"
            "output\n"
        )
        path = write_temp_artifact(content)
        try:
            rc, data, _, _ = run_script("--artifact", path)
            self.assertEqual(rc, 0)
            self.assertIsNotNone(data)
            # COUNT=3 matches raw line count → passes validation
            # Deduplicated output preserves first-occurrence order
            self.assertEqual(data["failing_identifiers"], ["tests/test_a.py::test_one", "tests/test_b.py::test_two"])
        finally:
            os.unlink(path)


class TestHeaderOutOfOrder(unittest.TestCase):
    def test_header_out_of_order(self):
        rc, _, _, stderr = run_script("--artifact", fixture("test-runner-artifact-out-of-order.txt"))
        self.assertNotEqual(rc, 0)
        err = json.loads(stderr)
        self.assertEqual(err["failure"], "header_out_of_order")


class TestHeaderMissing(unittest.TestCase):
    def test_header_missing(self):
        # Omit TIMESTAMP
        content = (
            "PHASE: baseline\n"
            "COMMAND: npm test\n"
            "WORKING_DIRECTORY: /tmp/project\n"
            "EXIT_CODE: 0\n"
            "FAILING_IDENTIFIERS_COUNT: 0\n"
            "FAILING_IDENTIFIERS:\n"
            "END_FAILING_IDENTIFIERS\n"
            "NON_RECONCILABLE_COUNT: 0\n"
            "NON_RECONCILABLE_FAILURES:\n"
            "END_NON_RECONCILABLE_FAILURES\n"
            "\n"
            "--- RAW RUN OUTPUT BELOW ---\n"
        )
        path = write_temp_artifact(content)
        try:
            rc, _, _, stderr = run_script("--artifact", path)
            self.assertNotEqual(rc, 0)
            err = json.loads(stderr)
            self.assertEqual(err["failure"], "header_missing")
        finally:
            os.unlink(path)


class TestExitCodeMalformed(unittest.TestCase):
    def test_exit_code_malformed(self):
        content = (
            "PHASE: baseline\n"
            "COMMAND: npm test\n"
            "WORKING_DIRECTORY: /tmp/project\n"
            "EXIT_CODE: not-an-int\n"
            "TIMESTAMP: 2026-05-01T10:00:00Z\n"
            "FAILING_IDENTIFIERS_COUNT: 0\n"
            "FAILING_IDENTIFIERS:\n"
            "END_FAILING_IDENTIFIERS\n"
            "NON_RECONCILABLE_COUNT: 0\n"
            "NON_RECONCILABLE_FAILURES:\n"
            "END_NON_RECONCILABLE_FAILURES\n"
            "\n"
            "--- RAW RUN OUTPUT BELOW ---\n"
        )
        path = write_temp_artifact(content)
        try:
            rc, _, _, stderr = run_script("--artifact", path)
            self.assertNotEqual(rc, 0)
            err = json.loads(stderr)
            self.assertEqual(err["failure"], "exit_code_malformed")
        finally:
            os.unlink(path)


class TestCountFieldMalformed(unittest.TestCase):
    def test_count_field_malformed(self):
        content = (
            "PHASE: baseline\n"
            "COMMAND: npm test\n"
            "WORKING_DIRECTORY: /tmp/project\n"
            "EXIT_CODE: 0\n"
            "TIMESTAMP: 2026-05-01T10:00:00Z\n"
            "FAILING_IDENTIFIERS_COUNT: not-an-int\n"
            "FAILING_IDENTIFIERS:\n"
            "END_FAILING_IDENTIFIERS\n"
            "NON_RECONCILABLE_COUNT: 0\n"
            "NON_RECONCILABLE_FAILURES:\n"
            "END_NON_RECONCILABLE_FAILURES\n"
            "\n"
            "--- RAW RUN OUTPUT BELOW ---\n"
        )
        path = write_temp_artifact(content)
        try:
            rc, _, _, stderr = run_script("--artifact", path)
            self.assertNotEqual(rc, 0)
            err = json.loads(stderr)
            self.assertEqual(err["failure"], "count_field_malformed")
        finally:
            os.unlink(path)


class TestArtifactMissingOrEmpty(unittest.TestCase):
    def test_artifact_missing_or_empty(self):
        rc, _, _, stderr = run_script("--artifact", "/nonexistent/path/artifact.txt")
        self.assertNotEqual(rc, 0)
        err = json.loads(stderr)
        self.assertEqual(err["failure"], "artifact_missing_or_empty")

    def test_artifact_empty_file(self):
        path = write_temp_artifact("")
        try:
            rc, _, _, stderr = run_script("--artifact", path)
            self.assertNotEqual(rc, 0)
            err = json.loads(stderr)
            self.assertEqual(err["failure"], "artifact_missing_or_empty")
        finally:
            os.unlink(path)


class TestFailingIdentifiersCountMismatch(unittest.TestCase):
    def test_failing_identifiers_count_mismatch(self):
        rc, _, _, stderr = run_script("--artifact", fixture("test-runner-artifact-count-mismatch.txt"))
        self.assertNotEqual(rc, 0)
        err = json.loads(stderr)
        self.assertEqual(err["failure"], "failing_identifiers_count_mismatch")


class TestNonReconcilableCountMismatch(unittest.TestCase):
    def test_non_reconcilable_count_mismatch(self):
        # NON_RECONCILABLE_COUNT=3 but only 1 entry provided
        content = (
            "PHASE: baseline\n"
            "COMMAND: pytest\n"
            "WORKING_DIRECTORY: /tmp\n"
            "EXIT_CODE: 1\n"
            "TIMESTAMP: 2026-05-01T10:00:00Z\n"
            "FAILING_IDENTIFIERS_COUNT: 0\n"
            "FAILING_IDENTIFIERS:\n"
            "END_FAILING_IDENTIFIERS\n"
            "NON_RECONCILABLE_COUNT: 3\n"
            "NON_RECONCILABLE_FAILURES:\n"
            "Some error occurred\n"
            "END_NON_RECONCILABLE_FAILURES\n"
            "\n"
            "--- RAW RUN OUTPUT BELOW ---\n"
            "output\n"
        )
        path = write_temp_artifact(content)
        try:
            rc, _, _, stderr = run_script("--artifact", path)
            self.assertNotEqual(rc, 0)
            err = json.loads(stderr)
            self.assertEqual(err["failure"], "non_reconcilable_count_mismatch")
        finally:
            os.unlink(path)


class TestRawOutputMarkerMissing(unittest.TestCase):
    def test_raw_output_marker_missing(self):
        rc, _, _, stderr = run_script("--artifact", fixture("test-runner-artifact-missing-marker.txt"))
        self.assertNotEqual(rc, 0)
        err = json.loads(stderr)
        self.assertEqual(err["failure"], "raw_output_marker_missing")


class TestRawOutputExcludedFromJson(unittest.TestCase):
    def test_raw_output_excluded_from_json(self):
        content = (
            "PHASE: baseline\n"
            "COMMAND: npm test\n"
            "WORKING_DIRECTORY: /tmp/project\n"
            "EXIT_CODE: 0\n"
            "TIMESTAMP: 2026-05-01T10:00:00Z\n"
            "FAILING_IDENTIFIERS_COUNT: 0\n"
            "FAILING_IDENTIFIERS:\n"
            "END_FAILING_IDENTIFIERS\n"
            "NON_RECONCILABLE_COUNT: 0\n"
            "NON_RECONCILABLE_FAILURES:\n"
            "END_NON_RECONCILABLE_FAILURES\n"
            "\n"
            "--- RAW RUN OUTPUT BELOW ---\n"
            "__SHOULD_NOT_APPEAR_IN_JSON__\n"
            "more raw output here\n"
        )
        path = write_temp_artifact(content)
        try:
            rc, _, stdout, _ = run_script("--artifact", path)
            self.assertEqual(rc, 0)
            self.assertNotIn("__SHOULD_NOT_APPEAR_IN_JSON__", stdout)
        finally:
            os.unlink(path)


class TestFinalMessageHandoffCheck(unittest.TestCase):
    def test_with_final_message_handoff_check(self):
        artifact_path = write_temp_artifact(CLEAN_ARTIFACT)
        message_content = f"Some preamble.\nTEST_RESULT_ARTIFACT: {artifact_path}\n"
        message_path = write_temp_message(message_content)
        try:
            rc, data, _, _ = run_script(
                "--artifact", artifact_path,
                "--final-message", message_path,
                "--expected-path", artifact_path,
            )
            self.assertEqual(rc, 0)
            self.assertIsNotNone(data)
            self.assertEqual(data["exit_code"], 0)
        finally:
            os.unlink(artifact_path)
            os.unlink(message_path)

    def test_with_final_message_handoff_check_marker_missing(self):
        artifact_path = write_temp_artifact(CLEAN_ARTIFACT)
        message_content = "Some preamble without the marker.\n"
        message_path = write_temp_message(message_content)
        try:
            rc, _, _, stderr = run_script(
                "--artifact", artifact_path,
                "--final-message", message_path,
                "--expected-path", artifact_path,
            )
            self.assertNotEqual(rc, 0)
            self.assertIn("missing TEST_RESULT_ARTIFACT marker", stderr)
        finally:
            os.unlink(artifact_path)
            os.unlink(message_path)


if __name__ == "__main__":
    unittest.main()
