#!/usr/bin/env python3
"""
Parse a verifier report and emit structured JSON.

Protocol-error labels emitted by this script:
  verifier phase-1 evidence block malformed at criterion N: <specific check>
  verifier missing evidence block for command-style criterion N
  verifier ran command not matching any phase-1 recipe: <command>
"""
import argparse
import json
import re
import sys


EVIDENCE_FIELDS = ("command:", "exit_code:", "stdout:", "stderr:")


def parse_sections(text):
    """Split report text into the three expected top-level sections."""
    sections = {}
    current = None
    buf = []
    for line in text.splitlines(keepends=True):
        m = re.match(r"^## (.+)$", line.rstrip())
        if m:
            if current is not None:
                sections[current] = "".join(buf)
            current = m.group(1).strip()
            buf = []
        else:
            if current is not None:
                buf.append(line)
    if current is not None:
        sections[current] = "".join(buf)
    return sections


def parse_evidence_blocks(section_text):
    """
    Parse [Evidence for Criterion N] blocks from Phase 1 Evidence section.
    Returns dict: {N (int): {"command": ..., "exit_code": ..., "stdout": ..., "stderr": ...}}
    and a list of protocol error strings.
    """
    blocks = {}
    errors = []
    lines = section_text.splitlines()
    i = 0
    while i < len(lines):
        m = re.match(r"^\[Evidence for Criterion (\d+)\]$", lines[i].strip())
        if m:
            n = int(m.group(1))
            i += 1
            block_lines = []
            while i < len(lines):
                if re.match(r"^\[Evidence for Criterion \d+\]$", lines[i].strip()):
                    break
                if re.match(r"^## ", lines[i]):
                    break
                block_lines.append(lines[i])
                i += 1
            parsed, errs = parse_evidence_fields(n, block_lines)
            errors.extend(errs)
            blocks[n] = parsed
        else:
            i += 1
    return blocks, errors


def parse_evidence_fields(n, lines):
    """
    Parse the four labelled fields from a single evidence block's lines.
    Returns (dict, list_of_errors).
    """
    errors = []
    field_order = ["command:", "exit_code:", "stdout:", "stderr:"]
    found = {}

    i = 0
    field_idx = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if not stripped:
            i += 1
            continue
        matched_field = None
        for fi, label in enumerate(field_order):
            if stripped.startswith(label):
                matched_field = (fi, label)
                break
        if matched_field is not None:
            fi, label = matched_field
            if fi < field_idx:
                errors.append(
                    f"verifier phase-1 evidence block malformed at criterion {n}: "
                    f"{label[:-1]} field out of order"
                )
            field_idx = fi + 1
            value = stripped[len(label):].strip()
            key = label[:-1]
            buf = [value]
            i += 1
            while i < len(lines):
                next_stripped = lines[i].strip()
                is_next_field = any(
                    next_stripped.startswith(lbl) for lbl in field_order
                )
                if is_next_field or not next_stripped:
                    if not next_stripped:
                        i += 1
                    break
                buf.append(next_stripped)
                i += 1
            found[key] = "\n".join(buf).strip()
        else:
            i += 1

    for label in field_order:
        key = label[:-1]
        if key not in found:
            errors.append(
                f"verifier phase-1 evidence block malformed at criterion {n}: "
                f"{key} field missing"
            )

    return found, errors


def _extract_reason(block_lines):
    """Extract the `reason:` field text (possibly multi-line) from a criterion block."""
    reason_parts = []
    in_reason = False
    for line in block_lines:
        stripped = line.strip()
        if not in_reason:
            m = re.match(r"^reason:\s*(.*)$", stripped, re.IGNORECASE)
            if m:
                in_reason = True
                first = m.group(1)
                if first:
                    reason_parts.append(first)
                continue
        else:
            if not stripped:
                break
            if re.match(r"^\[Criterion \d+\]", stripped):
                break
            reason_parts.append(stripped)
    return " ".join(reason_parts).strip()


def parse_per_criterion_verdicts(section_text, k):
    """
    Parse [Criterion N] PASS|FAIL headers and trailing `reason:` text.
    Returns (list of per-criterion dicts sorted by N, list of protocol errors).
    """
    errors = []
    seen = {}
    lines = section_text.splitlines()

    # First pass: collect header positions so we can scope each block.
    header_positions = []  # list of (line_idx, n, token)
    for idx, line in enumerate(lines):
        stripped = line.strip()
        m_bad = re.match(r"^\[Criterion (\d+)\]\s+verdict:\s*(.+)$", stripped)
        if m_bad:
            n = int(m_bad.group(1))
            errors.append(
                f"verifier malformed criterion header: [Criterion {n}] uses forbidden 'verdict:' prefix"
            )
            continue
        m = re.match(r"^\[Criterion (\d+)\]\s+(\S+)(.*)$", stripped)
        if m:
            header_positions.append((idx, int(m.group(1)), m.group(2)))

    for hi, (idx, n, token) in enumerate(header_positions):
        end = header_positions[hi + 1][0] if hi + 1 < len(header_positions) else len(lines)
        block_lines = lines[idx + 1:end]
        reason = _extract_reason(block_lines)

        if token not in ("PASS", "FAIL"):
            errors.append(
                f"verifier malformed criterion header: [Criterion {n}] has invalid verdict token '{token}' (must be PASS or FAIL)"
            )
            continue
        if n in seen:
            errors.append(
                f"verifier duplicate criterion header: [Criterion {n}] appears more than once"
            )
            continue
        if n < 1 or n > k:
            errors.append(
                f"verifier out-of-range criterion header: [Criterion {n}] is outside 1..{k}"
            )
            continue
        seen[n] = {"criterion": n, "verdict": token, "reason": reason}

    # Check for missing criteria
    for i in range(1, k + 1):
        if i not in seen:
            errors.append(
                f"verifier missing criterion header: [Criterion {i}] not found (expected 1..{k})"
            )

    per_criterion = [seen[i] for i in sorted(seen.keys())]
    return per_criterion, errors


def parse_overall_verdict(section_text):
    """Parse VERDICT: PASS|FAIL line. Returns (verdict_str or None, errors)."""
    errors = []
    for line in section_text.splitlines():
        stripped = line.strip()
        m = re.match(r"^VERDICT:\s+(\S+)$", stripped)
        if m:
            token = m.group(1)
            if token in ("PASS", "FAIL"):
                return token, []
            else:
                errors.append(
                    f"verifier malformed overall verdict: unexpected token '{token}'"
                )
                return None, errors
    errors.append("verifier missing overall verdict: no VERDICT: line found")
    return None, errors


def validate_phase1_recipes(evidence_blocks, recipes, k):
    """
    For each criterion N in recipes, check:
    - evidence_blocks contains an entry for N
    - evidence_blocks[N]["command"] == recipes[N] (byte-equal)
    Returns list of protocol errors.
    """
    errors = []
    for n, recipe in recipes.items():
        if n not in evidence_blocks:
            errors.append(
                f"verifier missing evidence block for command-style criterion {n}"
            )
        else:
            actual_command = evidence_blocks[n].get("command", "")
            if actual_command != recipe:
                errors.append(
                    f"verifier ran command not matching any phase-1 recipe: {actual_command}"
                )
    return errors


def _load_phase1_recipes(path):
    """
    Load phase-1 recipes from a JSON file.

    Required shape: a JSON array of objects, each with integer "criterion_n"
    and string "recipe". Returns ({n: recipe} dict, list_of_protocol_errors).
    """
    try:
        with open(path, "r") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        return {}, [f"phase1-recipes-json invalid: {e}"]

    if not isinstance(data, list):
        return {}, [
            "phase1-recipes-json invalid: expected a JSON array of "
            '{"criterion_n", "recipe"} entries'
        ]

    recipes = {}
    for i, entry in enumerate(data):
        if (
            not isinstance(entry, dict)
            or "criterion_n" not in entry
            or "recipe" not in entry
            or not isinstance(entry["criterion_n"], int)
            or not isinstance(entry["recipe"], str)
        ):
            return {}, [
                f"phase1-recipes-json invalid: entry {i} must be an object "
                'with integer "criterion_n" and string "recipe"'
            ]
        recipes[entry["criterion_n"]] = entry["recipe"]
    return recipes, []


def main():
    parser = argparse.ArgumentParser(
        description="Parse a verifier report and emit structured JSON.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Protocol-error labels:
  verifier phase-1 evidence block malformed at criterion N: <specific check>
  verifier missing evidence block for command-style criterion N
  verifier ran command not matching any phase-1 recipe: <command>
""",
    )
    parser.add_argument("--report", required=True, help="Path to verifier report .md file")
    parser.add_argument(
        "--criteria-count",
        required=True,
        type=int,
        help="Total number of acceptance criteria (K)",
    )
    parser.add_argument(
        "--phase1-recipes-json",
        default=None,
        help=(
            "Path to a JSON file containing an array of "
            '{"criterion_n": <int>, "recipe": <str>} entries.'
        ),
    )
    args = parser.parse_args()

    with open(args.report, "r") as f:
        text = f.read()

    k = args.criteria_count
    recipes = {}
    recipes_load_errors = []
    if args.phase1_recipes_json:
        recipes, recipes_load_errors = _load_phase1_recipes(args.phase1_recipes_json)
        if recipes_load_errors:
            result = {
                "verdict": "FAIL",
                "per_criterion": [],
                "phase1_evidence": {},
                "protocol_errors": recipes_load_errors,
            }
            print(json.dumps(result, indent=2))
            sys.exit(1)

    sections = parse_sections(text)

    evidence_section = sections.get("Phase 1 Evidence", "")
    criteria_section = sections.get("Per-Criterion Verdicts", "")
    overall_section = sections.get("Overall Verdict", "")

    protocol_errors = []

    # Parse evidence blocks
    evidence_blocks, evidence_errors = parse_evidence_blocks(evidence_section)
    protocol_errors.extend(evidence_errors)

    # Parse per-criterion verdicts
    per_criterion, crit_errors = parse_per_criterion_verdicts(criteria_section, k)
    protocol_errors.extend(crit_errors)

    # Parse overall verdict
    overall_verdict, verdict_errors = parse_overall_verdict(overall_section)
    protocol_errors.extend(verdict_errors)

    # Validate phase-1 recipes if provided
    if recipes:
        recipe_errors = validate_phase1_recipes(evidence_blocks, recipes, k)
        protocol_errors.extend(recipe_errors)

    # Determine final verdict
    if protocol_errors:
        final_verdict = "FAIL"
    else:
        final_verdict = overall_verdict if overall_verdict else "FAIL"

    result = {
        "verdict": final_verdict,
        "per_criterion": per_criterion,
        "phase1_evidence": {
            str(n): block for n, block in evidence_blocks.items()
        },
        "protocol_errors": protocol_errors,
    }

    print(json.dumps(result, indent=2))

    if final_verdict == "FAIL":
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
