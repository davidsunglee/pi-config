import json
import os
import subprocess
import sys
import tempfile
import unittest

SCRIPT = os.path.join(
    os.path.dirname(__file__), "..", "parse-artifact-handoff.py"
)
FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures")


def run_script(*args):
    result = subprocess.run(
        [sys.executable, SCRIPT, *args],
        capture_output=True,
        text=True,
    )
    return result


class TestParseArtifactHandoff(unittest.TestCase):

    # (a) Basic BRIEF_WRITTEN marker found
    def test_marker_brief_written(self):
        fixture = os.path.join(FIXTURES, "final-message-with-marker.txt")
        result = run_script("--marker", "BRIEF_WRITTEN", "--final-message", fixture)
        self.assertEqual(result.returncode, 0, msg=f"stderr: {result.stderr}")
        data = json.loads(result.stdout)
        self.assertEqual(data["path"], "/tmp/sample-brief.md")
        self.assertEqual(data["marker"], "BRIEF_WRITTEN")

    # (b) SPEC_WRITTEN marker with temp file
    def test_marker_spec_written(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            f.write("SPEC_WRITTEN: /tmp/sample-spec.md\n")
            tmp_path = f.name
        try:
            result = run_script("--marker", "SPEC_WRITTEN", "--final-message", tmp_path)
            self.assertEqual(result.returncode, 0, msg=f"stderr: {result.stderr}")
            data = json.loads(result.stdout)
            self.assertEqual(data["marker"], "SPEC_WRITTEN")
            self.assertEqual(data["path"], "/tmp/sample-spec.md")
        finally:
            os.unlink(tmp_path)

    # (b2) REVIEW_ARTIFACT marker
    def test_marker_review_artifact(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            f.write("REVIEW_ARTIFACT: /tmp/sample-review.md\n")
            tmp_path = f.name
        try:
            result = run_script("--marker", "REVIEW_ARTIFACT", "--final-message", tmp_path)
            self.assertEqual(result.returncode, 0, msg=f"stderr: {result.stderr}")
            data = json.loads(result.stdout)
            self.assertEqual(data["marker"], "REVIEW_ARTIFACT")
            self.assertEqual(data["path"], "/tmp/sample-review.md")
        finally:
            os.unlink(tmp_path)

    # (b3) TEST_RESULT_ARTIFACT marker
    def test_marker_test_result_artifact(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            f.write("TEST_RESULT_ARTIFACT: /tmp/sample-test-result.md\n")
            tmp_path = f.name
        try:
            result = run_script(
                "--marker", "TEST_RESULT_ARTIFACT", "--final-message", tmp_path
            )
            self.assertEqual(result.returncode, 0, msg=f"stderr: {result.stderr}")
            data = json.loads(result.stdout)
            self.assertEqual(data["marker"], "TEST_RESULT_ARTIFACT")
            self.assertEqual(data["path"], "/tmp/sample-test-result.md")
        finally:
            os.unlink(tmp_path)

    # (b4) Unknown marker rejected by argparse
    def test_marker_invalid_choice_rejected(self):
        result = run_script("--marker", "FOO", "--final-message", "/dev/null")
        self.assertNotEqual(result.returncode, 0)
        for valid in ["BRIEF_WRITTEN", "SPEC_WRITTEN", "REVIEW_ARTIFACT", "TEST_RESULT_ARTIFACT"]:
            self.assertIn(valid, result.stderr, msg=f"Expected {valid} in stderr")

    # (c) Marker absent → failure JSON on stderr
    def test_missing_marker(self):
        fixture = os.path.join(FIXTURES, "final-message-no-marker.txt")
        result = run_script("--marker", "BRIEF_WRITTEN", "--final-message", fixture)
        self.assertNotEqual(result.returncode, 0)
        data = json.loads(result.stderr)
        self.assertEqual(data["failure"], "missing BRIEF_WRITTEN marker")

    # (d) --expected-path mismatch → failure JSON
    def test_expected_path_mismatch(self):
        fixture = os.path.join(FIXTURES, "final-message-with-marker.txt")
        result = run_script(
            "--marker", "BRIEF_WRITTEN",
            "--final-message", fixture,
            "--expected-path", "/different/path",
        )
        self.assertNotEqual(result.returncode, 0)
        data = json.loads(result.stderr)
        self.assertTrue(
            data["failure"].startswith("path mismatch: expected /different/path got"),
            msg=f"Unexpected failure: {data['failure']}",
        )
        self.assertIn("/tmp/sample-brief.md", data["failure"])

    # (e) --check-existence against non-existent path
    def test_existence_check_failure(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            f.write("BRIEF_WRITTEN: /nonexistent/path/that/does/not/exist.md\n")
            tmp_path = f.name
        try:
            result = run_script(
                "--marker", "BRIEF_WRITTEN",
                "--final-message", tmp_path,
                "--check-existence",
            )
            self.assertNotEqual(result.returncode, 0)
            data = json.loads(result.stderr)
            self.assertEqual(
                data["failure"],
                "missing or empty at /nonexistent/path/that/does/not/exist.md",
            )
        finally:
            os.unlink(tmp_path)

    # (f) --check-non-empty against whitespace-only file
    def test_non_empty_check_failure(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False) as artifact:
            artifact.write("   \n\t\n  \n")
            artifact_path = artifact.name

        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as msg:
            msg.write(f"BRIEF_WRITTEN: {artifact_path}\n")
            msg_path = msg.name

        try:
            result = run_script(
                "--marker", "BRIEF_WRITTEN",
                "--final-message", msg_path,
                "--check-non-empty",
            )
            self.assertNotEqual(result.returncode, 0)
            data = json.loads(result.stderr)
            self.assertEqual(data["failure"], f"missing or empty at {artifact_path}")
        finally:
            os.unlink(artifact_path)
            os.unlink(msg_path)

    # (h) Trailing whitespace must cause path mismatch (no normalization)
    def test_expected_path_trailing_whitespace_mismatch(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            f.write("REVIEW_ARTIFACT: /expected/path \n")
            tmp_path = f.name
        try:
            result = run_script(
                "--marker", "REVIEW_ARTIFACT",
                "--final-message", tmp_path,
                "--expected-path", "/expected/path",
            )
            self.assertNotEqual(result.returncode, 0)
            data = json.loads(result.stderr)
            self.assertTrue(
                data["failure"].startswith("path mismatch: expected /expected/path got"),
                msg=f"Unexpected failure: {data['failure']}",
            )
        finally:
            os.unlink(tmp_path)

    # (i) Leading whitespace must cause path mismatch (no normalization)
    def test_expected_path_leading_whitespace_mismatch(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            f.write("REVIEW_ARTIFACT:  /expected/path\n")
            tmp_path = f.name
        try:
            result = run_script(
                "--marker", "REVIEW_ARTIFACT",
                "--final-message", tmp_path,
                "--expected-path", "/expected/path",
            )
            self.assertNotEqual(result.returncode, 0)
            data = json.loads(result.stderr)
            self.assertTrue(
                data["failure"].startswith("path mismatch: expected /expected/path got"),
                msg=f"Unexpected failure: {data['failure']}",
            )
        finally:
            os.unlink(tmp_path)

    # (g) Multiple markers → last one wins
    def test_multiple_markers_last_wins(self):
        fixture = os.path.join(FIXTURES, "final-message-multiple-markers.txt")
        result = run_script("--marker", "BRIEF_WRITTEN", "--final-message", fixture)
        self.assertEqual(result.returncode, 0, msg=f"stderr: {result.stderr}")
        data = json.loads(result.stdout)
        self.assertEqual(data["path"], "/tmp/last-brief.md")


if __name__ == "__main__":
    unittest.main()
