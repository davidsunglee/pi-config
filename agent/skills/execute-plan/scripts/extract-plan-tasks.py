#!/usr/bin/env python3
"""extract-plan-tasks.py — Parse a plan markdown file and emit a JSON task manifest.

Output shape (stdout, exit 0):
  {
    "goal": "<first paragraph of ## Goal section>",
    "test_command": "<contents of ```bash block under ## Test Command>",
    "tasks": [
      {
        "number": 1,
        "title": "<heading text after '### Task N:'>",
        "task_spec": "<raw markdown block for this task>",
        "files": {
          "create": ["path/..."],
          "modify": ["path/..."],
          "test": ["path/..."]
        },
        "steps": ["Step 1 text", ...],
        "criteria": [
          {"text": "criterion text", "verify": "verify instruction"}
        ],
        "model_recommendation": "cheap|standard|capable",
        "dependencies": [1, 2, ...]
      }
    ]
  }

Protocol-error kinds (stderr JSON, exit non-zero):
  missing_verify_recipe     — a criterion bullet has no trailing Verify: line
  duplicate_task_number     — two ### Task N: headings share the same N
  missing_files_block       — a task has no **Files:** block before **Steps:**/**Acceptance criteria:**
  missing_model_recommendation — **Model recommendation:** is absent or its value is not cheap|standard|capable
  out_of_order_task_number  — task numbers are not strictly ascending from 1 with no gaps
"""

import argparse
import json
import re
import sys


VALID_MODELS = {"cheap", "standard", "capable"}

TASK_HEADING_RE = re.compile(r"^### Task (\d+):\s*(.*)")
SECTION_HEADING_RE = re.compile(r"^## ")
DEP_LINE_RE = re.compile(r"^-\s+Task\s+(\d+)\s+depends\s+on:\s*(.+)")


def parse_plan(text):
    lines = text.splitlines(keepends=True)
    errors = []

    goal = None
    test_command = None
    raw_tasks = []  # list of (number, title, line_start, line_end_exclusive)
    dep_raw = {}  # task_number -> list of dep numbers
    section = None

    # First pass: identify task boundaries and sections
    i = 0
    n = len(lines)
    task_starts = []  # (line_index, number, title)

    while i < n:
        line = lines[i].rstrip("\n")

        m = TASK_HEADING_RE.match(line)
        if m:
            task_starts.append((i, int(m.group(1)), m.group(2).strip()))
            i += 1
            continue

        if SECTION_HEADING_RE.match(line):
            section = line.strip()

        i += 1

    # Compute task raw blocks
    # Each task block: from task heading line up to (but not including) next task or ## heading
    section_starts = []
    for idx, line_str in enumerate(lines):
        s = line_str.rstrip("\n")
        if SECTION_HEADING_RE.match(s):
            section_starts.append(idx)

    def find_block_end(start_idx):
        for j in range(start_idx + 1, n):
            s = lines[j].rstrip("\n")
            if TASK_HEADING_RE.match(s) or SECTION_HEADING_RE.match(s):
                return j
        return n

    task_blocks = []
    for ts_idx, (line_idx, num, title) in enumerate(task_starts):
        end_idx = find_block_end(line_idx)
        raw_block = "".join(lines[line_idx:end_idx]).rstrip("\n")
        task_blocks.append({
            "number": num,
            "title": title,
            "task_spec": raw_block,
            "line_idx": line_idx,
        })

    # Duplicate detection
    seen_numbers = {}
    for tb in task_blocks:
        num = tb["number"]
        if num in seen_numbers:
            errors.append({
                "kind": "duplicate_task_number",
                "task_number": num,
                "detail": f"Task {num} appears more than once",
            })
        else:
            seen_numbers[num] = True

    # Out-of-order detection (only on unique numbers)
    unique_task_numbers = list(dict.fromkeys(tb["number"] for tb in task_blocks))
    for expected, actual in enumerate(unique_task_numbers, start=1):
        if actual != expected:
            errors.append({
                "kind": "out_of_order_task_number",
                "task_number": actual,
                "detail": f"Expected Task {expected} but found Task {actual}",
            })
            break

    # Parse goal: first paragraph of ## Goal
    i = 0
    while i < n:
        if lines[i].rstrip("\n") == "## Goal":
            i += 1
            while i < n and lines[i].strip() == "":
                i += 1
            goal_lines = []
            while i < n and lines[i].strip() != "" and not SECTION_HEADING_RE.match(lines[i]) and not TASK_HEADING_RE.match(lines[i]):
                goal_lines.append(lines[i].rstrip("\n"))
                i += 1
            goal = " ".join(goal_lines).strip()
            break
        i += 1

    # Parse test_command: ## Test Command -> next ```bash block
    i = 0
    while i < n:
        if lines[i].rstrip("\n") == "## Test Command":
            i += 1
            while i < n:
                stripped = lines[i].strip()
                if stripped.startswith("```bash"):
                    i += 1
                    cmd_lines = []
                    while i < n and not lines[i].strip().startswith("```"):
                        cmd_lines.append(lines[i].rstrip("\n"))
                        i += 1
                    test_command = "\n".join(cmd_lines).strip()
                    break
                if SECTION_HEADING_RE.match(lines[i]) or TASK_HEADING_RE.match(lines[i].rstrip("\n")):
                    break
                i += 1
            break
        i += 1

    # Parse dependencies: ## Dependencies section
    i = 0
    while i < n:
        if lines[i].rstrip("\n") == "## Dependencies":
            i += 1
            while i < n:
                line = lines[i].rstrip("\n")
                if SECTION_HEADING_RE.match(line) or TASK_HEADING_RE.match(line):
                    break
                m = DEP_LINE_RE.match(line.strip())
                if m:
                    task_num = int(m.group(1))
                    deps_str = m.group(2)
                    dep_nums = []
                    for part in deps_str.split(","):
                        part = part.strip()
                        dm = re.match(r"Task\s+(\d+)", part)
                        if dm:
                            dep_nums.append(int(dm.group(1)))
                    dep_raw[task_num] = dep_nums
                i += 1
            break
        i += 1

    # Parse each task block in detail
    def parse_task_block(tb):
        block_text = tb["task_spec"]
        block_lines = block_text.splitlines()
        task_errors = []

        files = {"create": [], "modify": [], "test": []}
        steps = []
        criteria = []
        model_recommendation = None

        # State machine over block lines
        state = "header"
        j = 0
        nb = len(block_lines)
        has_files_block = False

        while j < nb:
            line = block_lines[j]
            stripped = line.strip()

            if stripped == "**Files:**":
                has_files_block = True
                state = "files"
                j += 1
                continue

            if stripped == "**Steps:**":
                if state == "header" and not has_files_block:
                    # steps appeared before files
                    pass
                state = "steps"
                j += 1
                continue

            if stripped == "**Acceptance criteria:**":
                state = "criteria"
                j += 1
                continue

            if stripped.startswith("**Model recommendation:**"):
                val = stripped[len("**Model recommendation:**"):].strip()
                model_recommendation = val
                state = "header"
                j += 1
                continue

            if state == "files" and stripped.startswith("- "):
                item = stripped[2:].strip()
                if item.lower().startswith("create:"):
                    path = item[len("create:"):].strip()
                    files["create"].append(path)
                elif item.lower().startswith("modify:"):
                    path = item[len("modify:"):].strip()
                    files["modify"].append(path)
                elif item.lower().startswith("test:"):
                    path = item[len("test:"):].strip()
                    files["test"].append(path)
                j += 1
                continue

            if state == "steps" and stripped.startswith("- [ ]"):
                step_text = stripped[5:].strip()
                steps.append(step_text)
                j += 1
                continue

            if state == "criteria" and stripped.startswith("- "):
                criterion_text = stripped[2:].strip()
                # Look ahead for Verify: line (indented child line)
                verify_text = None
                if j + 1 < nb:
                    next_line = block_lines[j + 1]
                    next_stripped = next_line.strip()
                    if next_stripped.startswith("Verify:"):
                        verify_text = next_stripped[len("Verify:"):].strip()
                        j += 1  # consume the verify line

                criteria.append({"text": criterion_text, "verify": verify_text or ""})
                if verify_text is None:
                    task_errors.append({
                        "kind": "missing_verify_recipe",
                        "task_number": tb["number"],
                        "criterion": criterion_text,
                        "detail": f"Task {tb['number']}: criterion '{criterion_text}' has no Verify: line",
                    })
                j += 1
                continue

            j += 1

        if not has_files_block:
            task_errors.append({
                "kind": "missing_files_block",
                "task_number": tb["number"],
                "detail": f"Task {tb['number']} has no **Files:** block",
            })

        if model_recommendation is None:
            task_errors.append({
                "kind": "missing_model_recommendation",
                "task_number": tb["number"],
                "detail": "line absent",
            })
        elif model_recommendation not in VALID_MODELS:
            task_errors.append({
                "kind": "missing_model_recommendation",
                "task_number": tb["number"],
                "detail": f"invalid value: {model_recommendation!r}",
            })

        return files, steps, criteria, model_recommendation, task_errors

    # Build final task list (skip duplicates beyond first occurrence)
    final_tasks = []
    seen_for_output = set()
    all_task_errors = []

    for tb in task_blocks:
        num = tb["number"]
        files, steps, criteria, model_rec, task_errs = parse_task_block(tb)
        all_task_errors.extend(task_errs)

        if num not in seen_for_output:
            seen_for_output.add(num)
            final_tasks.append({
                "number": num,
                "title": tb["title"],
                "task_spec": tb["task_spec"],
                "files": files,
                "steps": steps,
                "criteria": criteria,
                "model_recommendation": model_rec,
                "dependencies": dep_raw.get(num, []),
            })

    errors.extend(all_task_errors)

    return {
        "goal": goal,
        "test_command": test_command,
        "tasks": final_tasks,
    }, errors


def main():
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--plan", required=True, help="Path to the plan markdown file")
    parser.add_argument(
        "--task-number",
        type=int,
        default=None,
        help="If given, return only this task (still as a single-element tasks array)",
    )
    args = parser.parse_args()

    with open(args.plan, "r", encoding="utf-8") as f:
        text = f.read()

    result, errors = parse_plan(text)

    if errors:
        print(json.dumps({"errors": errors}, indent=2), file=sys.stderr)
        sys.exit(1)

    if args.task_number is not None:
        matching = [t for t in result["tasks"] if t["number"] == args.task_number]
        result["tasks"] = matching

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
