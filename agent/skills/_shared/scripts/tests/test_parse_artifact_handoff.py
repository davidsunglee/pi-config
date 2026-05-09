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

    # (a) Basic BRIEF_ARTIFACT marker found
    def test_marker_brief_artifact(self):
        fixture = os.path.join(FIXTURES, "final-message-with-marker.txt")
        result = run_script("--marker", "BRIEF_ARTIFACT", "--final-message", fixture)
        self.assertEqual(result.returncode, 0, msg=f"stderr: {result.stderr}")
        data = json.loads(result.stdout)
        self.assertEqual(data["path"], "/tmp/sample-brief.md")
        self.assertEqual(data["marker"], "BRIEF_ARTIFACT")

    # (b) SPEC_ARTIFACT marker with temp file
    def test_marker_spec_artifact(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            f.write("SPEC_ARTIFACT: /tmp/sample-spec.md\n")
            tmp_path = f.name
        try:
            result = run_script("--marker", "SPEC_ARTIFACT", "--final-message", tmp_path)
            self.assertEqual(result.returncode, 0, msg=f"stderr: {result.stderr}")
            data = json.loads(result.stdout)
            self.assertEqual(data["marker"], "SPEC_ARTIFACT")
            self.assertEqual(data["path"], "/tmp/sample-spec.md")
        finally:
            os.unlink(tmp_path)

    # (b1) PLAN_ARTIFACT marker with temp file
    def test_marker_plan_artifact(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            f.write("PLAN_ARTIFACT: /tmp/sample-plan.md\n")
            tmp_path = f.name
        try:
            result = run_script("--marker", "PLAN_ARTIFACT", "--final-message", tmp_path)
            self.assertEqual(result.returncode, 0, msg=f"stderr: {result.stderr}")
            data = json.loads(result.stdout)
            self.assertEqual(data["marker"], "PLAN_ARTIFACT")
            self.assertEqual(data["path"], "/tmp/sample-plan.md")
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
        for valid in ["BRIEF_ARTIFACT", "SPEC_ARTIFACT", "PLAN_ARTIFACT", "REVIEW_ARTIFACT", "TEST_RESULT_ARTIFACT"]:
            self.assertIn(valid, result.stderr, msg=f"Expected {valid} in stderr")

    # (b5) Old marker names rejected by argparse
    def test_old_marker_names_rejected(self):
        for old_marker in ["BRIEF_WRITTEN", "SPEC_WRITTEN"]:
            result = run_script("--marker", old_marker, "--final-message", "/dev/null")
            self.assertNotEqual(result.returncode, 0, msg=f"Expected non-zero for {old_marker}")
            self.assertIn("invalid choice", result.stderr, msg=f"Expected 'invalid choice' for {old_marker}")
            # Old names must not appear in the valid choices list shown in the error
            choose_from = result.stderr.split("choose from")[-1] if "choose from" in result.stderr else ""
            self.assertNotIn("BRIEF_WRITTEN", choose_from, msg="BRIEF_WRITTEN should not be a valid choice")
            self.assertNotIn("SPEC_WRITTEN", choose_from, msg="SPEC_WRITTEN should not be a valid choice")

    # (c) Marker absent → failure JSON on stderr
    def test_missing_marker(self):
        fixture = os.path.join(FIXTURES, "final-message-no-marker.txt")
        result = run_script("--marker", "BRIEF_ARTIFACT", "--final-message", fixture)
        self.assertNotEqual(result.returncode, 0)
        data = json.loads(result.stderr)
        self.assertEqual(data["failure"], "missing BRIEF_ARTIFACT marker")

    # (d) --expected-path mismatch → failure JSON
    def test_expected_path_mismatch(self):
        fixture = os.path.join(FIXTURES, "final-message-with-marker.txt")
        result = run_script(
            "--marker", "BRIEF_ARTIFACT",
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
            f.write("BRIEF_ARTIFACT: /nonexistent/path/that/does/not/exist.md\n")
            tmp_path = f.name
        try:
            result = run_script(
                "--marker", "BRIEF_ARTIFACT",
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
            msg.write(f"BRIEF_ARTIFACT: {artifact_path}\n")
            msg_path = msg.name

        try:
            result = run_script(
                "--marker", "BRIEF_ARTIFACT",
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
        result = run_script("--marker", "BRIEF_ARTIFACT", "--final-message", fixture)
        self.assertEqual(result.returncode, 0, msg=f"stderr: {result.stderr}")
        data = json.loads(result.stdout)
        self.assertEqual(data["path"], "/tmp/last-brief.md")

    # --require-path-suffix: path ends with suffix → success
    def test_require_path_suffix_success(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            f.write("SPEC_ARTIFACT: /tmp/sample.md\n")
            tmp_path = f.name
        try:
            result = run_script(
                "--marker", "SPEC_ARTIFACT",
                "--final-message", tmp_path,
                "--require-path-suffix", ".md",
            )
            self.assertEqual(result.returncode, 0, msg=f"stderr: {result.stderr}")
        finally:
            os.unlink(tmp_path)

    # --require-path-suffix: path does not end with suffix → failure
    def test_require_path_suffix_failure(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            f.write("SPEC_ARTIFACT: /tmp/sample.txt\n")
            tmp_path = f.name
        try:
            result = run_script(
                "--marker", "SPEC_ARTIFACT",
                "--final-message", tmp_path,
                "--require-path-suffix", ".md",
            )
            self.assertNotEqual(result.returncode, 0)
            data = json.loads(result.stderr)
            self.assertTrue(
                data["failure"].startswith("path suffix mismatch:"),
                msg=f"Unexpected failure: {data['failure']}",
            )
        finally:
            os.unlink(tmp_path)

    # --require-path-prefix: path is inside prefix dir → success
    def test_require_path_prefix_success(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            specs_dir = os.path.join(tmpdir, "docs", "specs")
            os.makedirs(specs_dir)
            spec_file = os.path.join(specs_dir, "foo.md")
            with open(spec_file, "w") as f:
                f.write("# Spec\nContent here.\n")

            with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as msg:
                msg.write(f"SPEC_ARTIFACT: {spec_file}\n")
                msg_path = msg.name

            try:
                result = run_script(
                    "--marker", "SPEC_ARTIFACT",
                    "--final-message", msg_path,
                    "--require-path-prefix", specs_dir + "/",
                    "--check-existence",
                )
                self.assertEqual(result.returncode, 0, msg=f"stderr: {result.stderr}")
            finally:
                os.unlink(msg_path)

    # --require-path-prefix: path is outside prefix dir → failure
    def test_require_path_prefix_failure(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            specs_dir = os.path.join(tmpdir, "docs", "specs")
            other_dir = os.path.join(tmpdir, "docs", "other")
            os.makedirs(specs_dir)
            os.makedirs(other_dir)
            spec_file = os.path.join(other_dir, "foo.md")
            with open(spec_file, "w") as f:
                f.write("# Spec\nContent here.\n")

            with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as msg:
                msg.write(f"SPEC_ARTIFACT: {spec_file}\n")
                msg_path = msg.name

            try:
                result = run_script(
                    "--marker", "SPEC_ARTIFACT",
                    "--final-message", msg_path,
                    "--require-path-prefix", specs_dir + "/",
                )
                self.assertNotEqual(result.returncode, 0)
                data = json.loads(result.stderr)
                self.assertTrue(
                    data["failure"].startswith("path prefix mismatch:"),
                    msg=f"Unexpected failure: {data['failure']}",
                )
            finally:
                os.unlink(msg_path)

    # Combined flags: exercises the exact define-spec pattern
    def test_combined_flags_define_spec_pattern(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            specs_dir = os.path.join(tmpdir, "docs", "specs")
            os.makedirs(specs_dir)

            # Sub-case (a): all checks pass
            spec_file = os.path.join(specs_dir, "good.md")
            with open(spec_file, "w") as f:
                f.write("# Spec\nReal content.\n")

            with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as msg:
                msg.write(f"SPEC_ARTIFACT: {spec_file}\n")
                msg_path_a = msg.name
            try:
                result = run_script(
                    "--marker", "SPEC_ARTIFACT",
                    "--final-message", msg_path_a,
                    "--check-existence",
                    "--check-non-empty",
                    "--require-path-suffix", ".md",
                    "--require-path-prefix", specs_dir + "/",
                )
                self.assertEqual(result.returncode, 0, msg=f"(a) stderr: {result.stderr}")
                data = json.loads(result.stdout)
                self.assertIn("path-suffix", data["checks"])
                self.assertIn("path-prefix", data["checks"])
            finally:
                os.unlink(msg_path_a)

            # Sub-case (b): spec file is empty whitespace
            empty_file = os.path.join(specs_dir, "empty.md")
            with open(empty_file, "w") as f:
                f.write("   \n\t\n")

            with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as msg:
                msg.write(f"SPEC_ARTIFACT: {empty_file}\n")
                msg_path_b = msg.name
            try:
                result = run_script(
                    "--marker", "SPEC_ARTIFACT",
                    "--final-message", msg_path_b,
                    "--check-existence",
                    "--check-non-empty",
                    "--require-path-suffix", ".md",
                    "--require-path-prefix", specs_dir + "/",
                )
                self.assertNotEqual(result.returncode, 0)
                data = json.loads(result.stderr)
                self.assertTrue(
                    data["failure"].startswith("missing or empty at"),
                    msg=f"(b) Unexpected failure: {data['failure']}",
                )
            finally:
                os.unlink(msg_path_b)

            # Sub-case (c): path doesn't end in .md
            txt_file = os.path.join(specs_dir, "wrong.txt")
            with open(txt_file, "w") as f:
                f.write("Real content.\n")

            with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as msg:
                msg.write(f"SPEC_ARTIFACT: {txt_file}\n")
                msg_path_c = msg.name
            try:
                result = run_script(
                    "--marker", "SPEC_ARTIFACT",
                    "--final-message", msg_path_c,
                    "--check-existence",
                    "--check-non-empty",
                    "--require-path-suffix", ".md",
                    "--require-path-prefix", specs_dir + "/",
                )
                self.assertNotEqual(result.returncode, 0)
                data = json.loads(result.stderr)
                self.assertTrue(
                    data["failure"].startswith("path suffix mismatch:"),
                    msg=f"(c) Unexpected failure: {data['failure']}",
                )
            finally:
                os.unlink(msg_path_c)


if __name__ == "__main__":
    unittest.main()
