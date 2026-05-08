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
    ],
    "waves": [
      {"wave": 1, "subwave": 1, "tasks": [1, 2]},
      {"wave": 2, "subwave": 1, "tasks": [3]}
    ]
  }

Protocol-error kinds (stderr JSON, exit non-zero):
  missing_required_section  — a required top-level section is absent or has empty body;
                              section names: goal, architecture_summary, tech_stack,
                              file_structure, numbered_tasks, dependencies, risk_assessment
  dependency_unknown_target — a dependency references a task number not in the plan
  dependency_cycle          — dependency graph contains a cycle; cycle lists participating
                              task numbers in discovery order
  missing_verify_recipe     — a criterion bullet has no trailing Verify: line
  duplicate_task_number     — two ### Task N: headings share the same N
  missing_files_block       — a task has no **Files:** block before **Steps:**/**Acceptance criteria:**
  missing_model_recommendation — **Model recommendation:** is absent or its value is not cheap|standard|capable
  out_of_order_task_number  — task numbers are not strictly ascending from 1 with no gaps

Options:
  --plan                    Path to the plan markdown file
  --task-number             If given, return only this task (single-element tasks array)
  --max-parallel-hard-cap   Maximum tasks per subwave (default: 8); matches MAX_PARALLEL_HARD_CAP
                            constant used by pi-interactive-subagent
"""

import argparse
import json
import re
import sys


VALID_MODELS = {"cheap", "standard", "capable"}

TASK_HEADING_RE = re.compile(r"^### Task (\d+):\s*(.*)")
SECTION_HEADING_RE = re.compile(r"^## ")
DEP_LINE_RE = re.compile(r"^-\s+Task\s+(\d+)\s+depends\s+on:\s*(.+)")

MAX_PARALLEL_HARD_CAP = 8

SECTION_RULES = [
    {"key": "goal", "patterns": [r"^## Goal\s*$", r"^\*\*Goal\*\*:"], "requires_body": True},
    {"key": "architecture_summary", "patterns": [r"^## Architecture summary\s*$", r"^\*\*Architecture summary\*\*:"], "requires_body": True},
    {"key": "tech_stack", "patterns": [r"^## Tech stack\s*$", r"^\*\*Tech stack\*\*:"], "requires_body": True},
    {"key": "file_structure", "patterns": [r"^## File Structure"], "requires_body": False},
    {"key": "numbered_tasks", "patterns": [r"^### Task \d+:"], "requires_body": False},
    {"key": "dependencies", "patterns": [r"^## Dependencies\s*$"], "requires_body": False},
    {"key": "risk_assessment", "patterns": [r"^## Risk [Aa]ssessment\s*$"], "requires_body": False},
]


def validate_required_sections(text):
    """Return list of missing_required_section errors for absent/empty sections."""
    lines = text.splitlines()
    errors = []

    def check_section(patterns, requires_body):
        compiled = [re.compile(p) for p in patterns]
        matches = []
        for idx, raw_line in enumerate(lines):
            stripped = raw_line.strip()
            for pat in compiled:
                m = pat.match(stripped)
                if m:
                    matches.append((idx, m, stripped))
                    break
        if not matches:
            return False
        if not requires_body:
            return True
        for idx, m, stripped in matches:
            inline = stripped[m.end():].strip()
            if inline:
                return True
            j = idx + 1
            while j < len(lines):
                if re.match(r"^#{1,3}\s", lines[j]):
                    break
                if lines[j].strip():
                    return True
                j += 1
        return False

    for rule in SECTION_RULES:
        if not check_section(rule["patterns"], rule["requires_body"]):
            errors.append({"kind": "missing_required_section", "section": rule["key"]})

    return errors


def validate_dependency_targets(tasks, dep_raw):
    """Return errors for dep references to unknown task numbers."""
    errors = []
    known = {t["number"] for t in tasks}
    for task_num, dep_nums in dep_raw.items():
        for dep in dep_nums:
            if dep not in known:
                errors.append({
                    "kind": "dependency_unknown_target",
                    "task_number": task_num,
                    "unknown_dep": dep,
                })
    return errors


def detect_dependency_cycle(dep_raw):
    """Detect a cycle in the dependency graph via DFS. Returns at most one error."""
    all_nodes = set(dep_raw.keys())
    for deps in dep_raw.values():
        all_nodes.update(deps)

    visited = set()
    rec_stack = []
    rec_set = set()

    def dfs(node):
        visited.add(node)
        rec_stack.append(node)
        rec_set.add(node)
        for neighbor in dep_raw.get(node, []):
            if neighbor not in visited:
                result = dfs(neighbor)
                if result is not None:
                    return result
            elif neighbor in rec_set:
                cycle_start = rec_stack.index(neighbor)
                return list(rec_stack[cycle_start:])
        rec_stack.pop()
        rec_set.remove(node)
        return None

    for node in sorted(all_nodes):
        if node not in visited:
            cycle = dfs(node)
            if cycle is not None:
                return [{"kind": "dependency_cycle", "cycle": cycle}]

    return []


def compute_waves(tasks, dep_raw, max_parallel_hard_cap):
    """Assign tasks to waves based on dependencies; split oversized waves into subwaves."""
    task_numbers = [t["number"] for t in tasks]
    wave_assignment = {}
    remaining = set(task_numbers)
    current_wave = 1

    while remaining:
        wave_tasks = [
            t for t in sorted(remaining)
            if all(d in wave_assignment for d in dep_raw.get(t, []))
        ]
        if not wave_tasks:
            break
        for t in wave_tasks:
            wave_assignment[t] = current_wave
            remaining.remove(t)
        current_wave += 1

    waves_dict = {}
    for t, w in wave_assignment.items():
        waves_dict.setdefault(w, []).append(t)
    for w in waves_dict:
        waves_dict[w].sort()

    result = []
    for w in sorted(waves_dict.keys()):
        wave_tasks = waves_dict[w]
        subwave = 1
        for i in range(0, len(wave_tasks), max_parallel_hard_cap):
            chunk = wave_tasks[i:i + max_parallel_hard_cap]
            result.append({"wave": w, "subwave": subwave, "tasks": chunk})
            subwave += 1

    return result


def parse_plan(text, max_parallel_hard_cap=MAX_PARALLEL_HARD_CAP):
    lines = text.splitlines(keepends=True)
    errors = []

    # Section validation first; skip task parsing if any section is missing
    section_errors = validate_required_sections(text)
    if section_errors:
        return {"goal": None, "test_command": None, "tasks": []}, section_errors

    goal = None
    test_command = None
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
                verify_text = None
                if j + 1 < nb:
                    next_line = block_lines[j + 1]
                    next_stripped = next_line.strip()
                    if next_stripped.startswith("Verify:"):
                        verify_text = next_stripped[len("Verify:"):].strip()
                        j += 1

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

    if errors:
        return {
            "goal": goal,
            "test_command": test_command,
            "tasks": final_tasks,
        }, errors

    # Dependency reference + cycle validation
    dep_errors = validate_dependency_targets(final_tasks, dep_raw)
    dep_errors.extend(detect_dependency_cycle(dep_raw))

    if dep_errors:
        return {
            "goal": goal,
            "test_command": test_command,
            "tasks": final_tasks,
        }, dep_errors

    # All clean: compute waves
    waves = compute_waves(final_tasks, dep_raw, max_parallel_hard_cap)

    return {
        "goal": goal,
        "test_command": test_command,
        "tasks": final_tasks,
        "waves": waves,
    }, []


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
    parser.add_argument(
        "--max-parallel-hard-cap",
        type=int,
        default=MAX_PARALLEL_HARD_CAP,
        help=f"Maximum tasks per subwave when splitting oversized waves (default: {MAX_PARALLEL_HARD_CAP})",
    )
    args = parser.parse_args()

    with open(args.plan, "r", encoding="utf-8") as f:
        text = f.read()

    result, errors = parse_plan(text, args.max_parallel_hard_cap)

    if errors:
        print(json.dumps({"errors": errors}, indent=2), file=sys.stderr)
        sys.exit(1)

    if args.task_number is not None:
        matching = [t for t in result["tasks"] if t["number"] == args.task_number]
        result["tasks"] = matching

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
