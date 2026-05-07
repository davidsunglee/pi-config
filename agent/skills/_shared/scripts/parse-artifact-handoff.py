#!/usr/bin/env python3
"""
parse-artifact-handoff.py - Extract artifact path from subagent final message.

Supported markers: BRIEF_WRITTEN, SPEC_WRITTEN, REVIEW_ARTIFACT, TEST_RESULT_ARTIFACT

Canonical failure labels (appear in stderr JSON .failure):
  missing <MARKER> marker
  path mismatch: expected <X> got <Y>
  missing or empty at <path>
"""

import argparse
import json
import os
import re
import sys

VALID_MARKERS = [
    "BRIEF_WRITTEN",
    "SPEC_WRITTEN",
    "REVIEW_ARTIFACT",
    "TEST_RESULT_ARTIFACT",
]


def fail(message: str) -> None:
    json.dump({"failure": message}, sys.stderr)
    sys.stderr.write("\n")
    sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--marker",
        required=True,
        choices=VALID_MARKERS,
        metavar="MARKER",
        help=(
            f"Artifact marker to extract. Supported choices: "
            f"{', '.join(VALID_MARKERS)}"
        ),
    )
    parser.add_argument(
        "--final-message",
        required=True,
        metavar="PATH",
        help="Path to the subagent final-message file, or '-' to read from stdin",
    )
    parser.add_argument(
        "--expected-path",
        metavar="PATH",
        help="Assert the extracted path exactly equals this value",
    )
    parser.add_argument(
        "--check-existence",
        action="store_true",
        help="Verify the extracted path exists on disk",
    )
    parser.add_argument(
        "--check-non-empty",
        action="store_true",
        help="Verify the extracted path is a file with non-whitespace content",
    )

    args = parser.parse_args()

    if args.final_message == "-":
        content = sys.stdin.read()
    else:
        with open(args.final_message, "r") as fh:
            content = fh.read()

    pattern = re.compile(r"^" + re.escape(args.marker) + r": (.+)$", re.MULTILINE)
    matches = pattern.findall(content)

    if not matches:
        fail(f"missing {args.marker} marker")

    path = matches[-1]

    if args.expected_path is not None and path != args.expected_path:
        fail(f"path mismatch: expected {args.expected_path} got {path}")

    checks = ["marker"]

    if args.check_existence:
        if not os.path.exists(path):
            fail(f"missing or empty at {path}")
        checks.append("existence")

    if args.check_non_empty:
        try:
            with open(path, "r") as fh:
                body = fh.read()
            if not body.strip():
                fail(f"missing or empty at {path}")
        except OSError:
            fail(f"missing or empty at {path}")
        checks.append("non-empty")

    json.dump({"path": path, "marker": args.marker, "checks": checks}, sys.stdout)
    sys.stdout.write("\n")
    sys.exit(0)


if __name__ == "__main__":
    main()
