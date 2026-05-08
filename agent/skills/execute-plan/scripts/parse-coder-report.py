#!/usr/bin/env python3
"""
Parse a coder subagent report and emit structured JSON.

Output fields:
  status             — one of DONE, DONE_WITH_CONCERNS, BLOCKED, NEEDS_CONTEXT
  files_changed      — list of file paths extracted from ## Files Changed bullets
  concerns_block     — verbatim text under ## Concerns / Needs / Blocker
  blocker_text       — concerns_block when status is BLOCKED, else null
  needs_text         — concerns_block when status is NEEDS_CONTEXT, else null
  tests_block        — verbatim text under ## Tests
  completed_block    — verbatim text under ## Completed
  self_review_block  — verbatim text under ## Self-Review Findings
  protocol_warnings  — list of non-fatal warning labels

Protocol-error labels (emitted to stderr as JSON, exit 1):
  status_line_missing    — no line matching ^STATUS:\\s*(\\S+) found
  status_token_invalid   — token not in {DONE, DONE_WITH_CONCERNS, BLOCKED, NEEDS_CONTEXT}
  report_unreadable      — file could not be opened (OSError)

Warning labels (included in protocol_warnings in stdout JSON, exit 0):
  concerns_block_missing — DONE_WITH_CONCERNS but ## Concerns / Needs / Blocker is empty
"""
import argparse
import json
import re
import sys

VALID_STATUSES = {"DONE", "DONE_WITH_CONCERNS", "BLOCKED", "NEEDS_CONTEXT"}


def _section(name, text):
    """Return text under ## <name> up to the next ## heading or EOF, stripped of trailing newlines."""
    lines = text.splitlines(keepends=True)
    in_section = False
    buf = []
    heading = f"## {name}"
    for line in lines:
        stripped = line.rstrip("\n")
        if in_section:
            if re.match(r"^## ", stripped):
                break
            buf.append(line)
        else:
            if stripped == heading:
                in_section = True
    return "".join(buf).rstrip("\n")


def _extract_files_changed(text):
    """Extract backtick-delimited paths from ## Files Changed bullets."""
    section = _section("Files Changed", text)
    paths = []
    for line in section.splitlines():
        m = re.match(r"^- `(?P<path>[^`]+)`", line)
        if m:
            paths.append(m.group("path"))
    return paths


def main():
    parser = argparse.ArgumentParser(
        description="Parse a coder subagent report and emit structured JSON.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Protocol-error labels (emitted to stderr as JSON, exit 1):
  status_line_missing    no line matching ^STATUS:\\s*(\\S+) found
  status_token_invalid   token not in {DONE, DONE_WITH_CONCERNS, BLOCKED, NEEDS_CONTEXT}
  report_unreadable      file could not be opened (OSError)

Warning label (in stdout JSON protocol_warnings, exit 0):
  concerns_block_missing DONE_WITH_CONCERNS but ## Concerns / Needs / Blocker is empty
""",
    )
    parser.add_argument(
        "--report",
        required=True,
        metavar="PATH_OR_DASH",
        help="Path to coder report .md file, or - to read from stdin",
    )
    args = parser.parse_args()

    if args.report == "-":
        text = sys.stdin.read()
    else:
        try:
            with open(args.report, "r") as f:
                text = f.read()
        except OSError:
            json.dump({"failure": "report_unreadable", "path": args.report}, sys.stderr)
            sys.stderr.write("\n")
            sys.exit(1)

    # Find STATUS line
    status_match = None
    for line in text.splitlines():
        m = re.match(r"^STATUS:\s*(\S+)", line)
        if m:
            status_match = m
            break

    if status_match is None:
        json.dump({"failure": "status_line_missing"}, sys.stderr)
        sys.stderr.write("\n")
        sys.exit(1)

    token = status_match.group(1)
    if token not in VALID_STATUSES:
        json.dump({"failure": "status_token_invalid", "token": token}, sys.stderr)
        sys.stderr.write("\n")
        sys.exit(1)

    status = token

    tests_block = _section("Tests", text)
    completed_block = _section("Completed", text)
    self_review_block = _section("Self-Review Findings", text)
    concerns_block = _section("Concerns / Needs / Blocker", text)

    blocker_text = concerns_block if status == "BLOCKED" else None
    needs_text = concerns_block if status == "NEEDS_CONTEXT" else None

    protocol_warnings = []
    if status == "DONE_WITH_CONCERNS" and concerns_block.strip() == "":
        protocol_warnings.append("concerns_block_missing")

    files_changed = _extract_files_changed(text)

    result = {
        "status": status,
        "files_changed": files_changed,
        "concerns_block": concerns_block,
        "blocker_text": blocker_text,
        "needs_text": needs_text,
        "tests_block": tests_block,
        "completed_block": completed_block,
        "self_review_block": self_review_block,
        "protocol_warnings": protocol_warnings,
    }

    print(json.dumps(result, indent=2))
    sys.exit(0)


if __name__ == "__main__":
    main()
