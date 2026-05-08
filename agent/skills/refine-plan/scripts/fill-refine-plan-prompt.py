#!/usr/bin/env python3
"""Fill placeholders in the refine-plan prompt template."""

import argparse
import json
import re
import sys
from pathlib import Path


def read_file_or_stdin(value, field_name):
    """Read from file if value is a path, or from stdin if value is '-'."""
    if value == "-":
        return sys.stdin.read()
    try:
        with open(value, "r") as f:
            return f.read()
    except (FileNotFoundError, IOError):
        emit_error("input missing or unreadable", field_name)


def emit_error(failure, input_field):
    """Emit error as JSON to stderr and exit with code 2."""
    error = {"failure": failure, "input": input_field}
    print(json.dumps(error), file=sys.stderr)
    sys.exit(2)


def emit_error_exit_1(failure):
    """Emit error as JSON to stderr and exit with code 1."""
    error = {"failure": failure}
    print(json.dumps(error), file=sys.stderr)
    sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description="Fill placeholders in the refine-plan prompt template.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Placeholders:
  PLAN_PATH - Path to the plan file
  TASK_ARTIFACT - Task artifact content
  SOURCE_TODO - Source TODO content
  SOURCE_SPEC - Source specification content
  SCOUT_BRIEF - Scout brief content
  ORIGINAL_SPEC_INLINE - Original spec inline (path or -)
  STRUCTURAL_ONLY_NOTE - Structural-only note (path or -)
  MAX_ITERATIONS - Maximum iterations (integer)
  STARTING_ERA - Starting era (integer)
  REVIEW_OUTPUT_PATH - Review output path
  WORKING_DIR - Working directory
  MODEL_MATRIX - Model matrix content (path or -)
        """,
    )

    parser.add_argument(
        "--template",
        default=str(Path(__file__).parent.parent / "refine-plan-prompt.md"),
        help="Path to the template file",
    )
    parser.add_argument("--plan-path", required=True, help="Plan file path")
    parser.add_argument(
        "--task-artifact", required=True, help="Task artifact content"
    )
    parser.add_argument(
        "--source-todo", required=True, help="Source TODO content"
    )
    parser.add_argument(
        "--source-spec", required=True, help="Source specification content"
    )
    parser.add_argument(
        "--scout-brief", required=True, help="Scout brief content"
    )
    parser.add_argument(
        "--original-spec-inline",
        required=True,
        help="Original spec inline (path or -)",
    )
    parser.add_argument(
        "--structural-only-note",
        required=True,
        help="Structural-only note (path or -)",
    )
    parser.add_argument(
        "--max-iterations",
        required=True,
        type=int,
        help="Maximum iterations",
    )
    parser.add_argument(
        "--starting-era",
        required=True,
        type=int,
        help="Starting era",
    )
    parser.add_argument(
        "--review-output-path",
        required=True,
        help="Review output path",
    )
    parser.add_argument(
        "--working-dir",
        required=True,
        help="Working directory",
    )
    parser.add_argument(
        "--model-matrix",
        required=True,
        help="Model matrix content (path or -)",
    )
    parser.add_argument(
        "--output", required=True, help="Output file path"
    )

    args = parser.parse_args()

    # Read template
    try:
        with open(args.template, "r") as f:
            content = f.read()
    except (FileNotFoundError, IOError):
        emit_error("input missing or unreadable", "template")

    # Read values that must be file paths or stdin
    original_spec_inline = read_file_or_stdin(args.original_spec_inline, "original-spec-inline")
    structural_only_note = read_file_or_stdin(args.structural_only_note, "structural-only-note")
    model_matrix = read_file_or_stdin(args.model_matrix, "model-matrix")

    # Build the placeholder map
    placeholders = {
        "{PLAN_PATH}": args.plan_path,
        "{TASK_ARTIFACT}": args.task_artifact,
        "{SOURCE_TODO}": args.source_todo,
        "{SOURCE_SPEC}": args.source_spec,
        "{SCOUT_BRIEF}": args.scout_brief,
        "{ORIGINAL_SPEC_INLINE}": original_spec_inline,
        "{STRUCTURAL_ONLY_NOTE}": structural_only_note,
        "{MAX_ITERATIONS}": str(args.max_iterations),
        "{STARTING_ERA}": str(args.starting_era),
        "{REVIEW_OUTPUT_PATH}": args.review_output_path,
        "{WORKING_DIR}": args.working_dir,
        "{MODEL_MATRIX}": model_matrix,
    }

    # Find placeholders in the original template
    original_pattern = r"\{[A-Z_][A-Z0-9_]*\}"
    original_placeholders = set(re.findall(original_pattern, content))

    # Apply single-pass literal-substring substitution
    for placeholder, value in placeholders.items():
        content = content.replace(placeholder, value)

    # Scan for remaining placeholders that were in the original template
    remaining_matches = set(re.findall(original_pattern, content))

    # Check if any original placeholders remain unreplaced
    unreplaced = remaining_matches & original_placeholders

    if unreplaced:
        emit_error_exit_1("unreplaced placeholders remain")

    # Write output
    try:
        with open(args.output, "w") as f:
            f.write(content)
    except (IOError, OSError):
        print(
            json.dumps(
                {"failure": "cannot write output file"}
            ),
            file=sys.stderr,
        )
        sys.exit(2)


if __name__ == "__main__":
    main()
