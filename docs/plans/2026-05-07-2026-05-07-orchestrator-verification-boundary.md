# Orchestrator Verification Boundary and Named Cleanup Helpers

**Spec:** `docs/specs/2026-05-07-orchestrator-verification-boundary.md`

## Goal

Tighten the orchestrator/subagent boundary in `execute-plan`, `refine-code`, and `refine-plan` so orchestrators route subagent protocol output mechanically without re-judging work — anchored on a single shared boundary statement that all three skills reference. In parallel, replace two friction-prone ad hoc cleanup invocations (`rm -rf docs/test-runs/<plan-name>` and `find <dir> -type d -name __pycache__ -prune -exec rm -rf {} +`) with named helper scripts under `agent/skills/_shared/scripts/` so the dangerous-command guardrail in `agent/extensions/guardrails.ts` no longer fires on the orchestrator's normal success paths.

## Architecture summary

The change splits cleanly into three additions and three edits:

- **Two new helper scripts** under `agent/skills/_shared/scripts/` (`cleanup-test-runs.py`, `cleanup-pycache.py`) following the existing six-helper convention (Python, positional arg, argparse-driven, structured failures, tests under `tests/`). Each helper validates its argument (no `..` traversal, must resolve under cwd, no `HARD_PROTECTED_SEGMENTS` per `agent/extensions/guardrails.ts`, plus a `<cwd>/docs/test-runs/` prefix constraint for the test-runs helper) and then performs the deletion via `shutil.rmtree` / `os.walk`. The orchestrator-visible bash invocation becomes `python3 agent/skills/_shared/scripts/cleanup-*.py <arg>`, which does NOT match either dangerous-command regex in `guardrails.ts:94–95`.
- **One new shared boundary file** at `agent/skills/_shared/orchestrator-verification-boundary.md` stating the orchestrator-verification principle once. The three affected SKILL.md files reference it instead of restating it.
- **Three SKILL.md edits** that add explicit prohibition language at the temptation hot spots, reference the shared boundary file, enumerate allowed mechanical work paired with existing helpers, and (for `execute-plan`) substitute the cleanup helper at the test-runs cleanup site. `execute-plan/SKILL.md` ALSO removes the plan-archive-to-done flow per Requirement 9 to make line budget for the new wording (Requirement 8 forbids growing `wc -l`); the test-runs cleanup is relocated to its own substep on the final-gate success path per Requirement 10.

`agent/extensions/guardrails.ts` and `agent/extensions/guardrails.test.ts` are NOT modified — the cleanup-helper strategy is the entire response to the friction motivation.

## Tech stack

- Python 3 (helpers + their `unittest`-style tests).
- Markdown (skill files, shared boundary file).
- Existing convention: `agent/skills/_shared/scripts/` for shared helpers; `agent/skills/_shared/scripts/tests/` for tests; `subprocess.run([sys.executable, SCRIPT, ...])` test-invocation pattern (see `agent/skills/_shared/scripts/tests/test_classify_workflow_drift.py:12–56`).

## File Structure

- `agent/skills/_shared/scripts/cleanup-test-runs.py` (Create) — Validated test-runs cleanup helper. Argparse positional `<path>`. Validates `..`-free, resolves under cwd, no protected segments, must be a strict child of `<cwd>/docs/test-runs/` (the root `docs/test-runs/` itself is rejected). Calls `shutil.rmtree` on success; exits 0 on success or no-op (target already absent).
- `agent/skills/_shared/scripts/cleanup-pycache.py` (Create) — Validated pycache cleanup helper. Argparse positional `<path>`. Validates `..`-free, resolves under cwd, no protected segments. Walks the tree (`os.walk`) collecting every `__pycache__` directory and removes each via `shutil.rmtree`. Exits 0 on success or no-op (no `__pycache__` found).
- `agent/skills/_shared/scripts/tests/test_cleanup_test_runs.py` (Create) — Tests for `cleanup-test-runs.py` covering successful cleanup, idempotent no-op, `..` rejection, outside-cwd rejection, protected-segment rejection, outside-test-runs-prefix rejection, and rejection of the `docs/test-runs/` root itself.
- `agent/skills/_shared/scripts/tests/test_cleanup_pycache.py` (Create) — Tests for `cleanup-pycache.py` covering nested `__pycache__` removal, idempotent no-op, `..` rejection, outside-cwd rejection, and protected-segment rejection.
- `agent/skills/_shared/scripts/README.md` (Modify) — Append two bullet entries under `## Helpers` documenting the new helpers, mirroring the existing six-helper format (one-line summary + example invocation).
- `agent/skills/_shared/orchestrator-verification-boundary.md` (Create) — Single source-of-truth statement of the orchestrator-verification boundary. Articulates: orchestrators route substantive subagents mechanically; never re-judge their output; sanctioned mechanical activities (parsing, dispatching, bookkeeping) never produce substantive PASS/FAIL verdicts. The three affected SKILL.md files reference this file rather than restating the principle.
- `agent/skills/execute-plan/SKILL.md` (Modify) — Add guardrail blocks at Step 9/10/11 (post-coder verification) and Step 7/12/16 (integration tests); add an "Allowed mechanical work" enumeration paired with helper scripts; reference the shared boundary file; remove the plan-archive-to-done flow (Step 16 `### 1. Move plan to done` + cascading references at lines 117, 687, 702, 704, 711, 721) to make line budget; relocate the test-runs cleanup to its own substep on the final-gate success path, using the new `cleanup-test-runs.py` helper invocation. Add a single short reference to `cleanup-pycache.py` co-located with the allowed-mechanical-work block. The post-change `wc -l` MUST NOT exceed the pre-change `wc -l`.
- `agent/skills/refine-code/SKILL.md` (Modify) — Add a guardrail block at Step 5/Step 6 (between coordinator parse and forward) referencing the shared boundary file with a refine-code-specific forbidden-behavior list (review-file inspection, `STATUS:` override, ad hoc local checks, out-of-loop dispatches). Add a single short reference to `cleanup-pycache.py` as the sanctioned cache-cleanup invocation.
- `agent/skills/refine-plan/SKILL.md` (Modify) — Add a guardrail block at Step 9/Step 9.5/Step 10 (between parse, provenance validation, and commit gate) referencing the shared boundary file with a refine-plan-specific forbidden-behavior list (review-file inspection, `STATUS:` override, ad hoc plan checks, plan editing or extra refinement dispatches outside the documented loop). Add a single short reference to `cleanup-pycache.py` as the sanctioned cache-cleanup invocation.

## Tasks

### Task 1: Create the test-runs cleanup helper script and tests

**Files:**
- Create: `agent/skills/_shared/scripts/cleanup-test-runs.py`
- Test: `agent/skills/_shared/scripts/tests/test_cleanup_test_runs.py`

**Steps:**

- [ ] **Step 1: Open existing helpers for reference** — read `agent/skills/_shared/scripts/extract-provenance-preamble.py:1–50` and `agent/skills/_shared/scripts/classify-workflow-drift.py:1–60` to confirm the argparse + structured-failure convention, then read `agent/skills/_shared/scripts/tests/test_classify_workflow_drift.py:1–100` to confirm the `subprocess.run([sys.executable, SCRIPT, ...])` test pattern.

- [ ] **Step 2: Write the failing tests first** — create `agent/skills/_shared/scripts/tests/test_cleanup_test_runs.py` with the following test class structure (tests will fail because the script does not yet exist):

```python
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

SCRIPT = os.path.join(
    os.path.dirname(__file__), "..", "cleanup-test-runs.py"
)


def run(args, cwd):
    return subprocess.run(
        [sys.executable, SCRIPT] + args,
        capture_output=True,
        text=True,
        cwd=cwd,
    )


class TestCleanupTestRuns(unittest.TestCase):

    def _make_cwd_with_test_runs(self):
        cwd = tempfile.mkdtemp()
        target = os.path.join(cwd, "docs", "test-runs", "my-plan")
        os.makedirs(target)
        with open(os.path.join(target, "baseline.log"), "w") as f:
            f.write("baseline output\n")
        return cwd, target

    def test_successful_cleanup_of_present_target(self):
        cwd, target = self._make_cwd_with_test_runs()
        try:
            self.assertTrue(os.path.isdir(target))
            result = run(["docs/test-runs/my-plan"], cwd=cwd)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertFalse(os.path.exists(target))
        finally:
            shutil.rmtree(cwd, ignore_errors=True)

    def test_idempotent_when_target_absent(self):
        cwd = tempfile.mkdtemp()
        try:
            os.makedirs(os.path.join(cwd, "docs", "test-runs"))
            result = run(["docs/test-runs/my-plan"], cwd=cwd)
            self.assertEqual(result.returncode, 0, result.stderr)
        finally:
            shutil.rmtree(cwd, ignore_errors=True)

    def test_rejects_dotdot_traversal(self):
        cwd, _ = self._make_cwd_with_test_runs()
        try:
            result = run(["docs/test-runs/../my-plan"], cwd=cwd)
            self.assertNotEqual(result.returncode, 0)
            err = json.loads(result.stderr)
            self.assertEqual(err["failure"], "dotdot_traversal")
        finally:
            shutil.rmtree(cwd, ignore_errors=True)

    def test_rejects_path_outside_cwd(self):
        cwd, _ = self._make_cwd_with_test_runs()
        try:
            result = run(["/tmp/somewhere-else"], cwd=cwd)
            self.assertNotEqual(result.returncode, 0)
            err = json.loads(result.stderr)
            self.assertIn(err["failure"], ("outside_cwd", "outside_test_runs_prefix"))
        finally:
            shutil.rmtree(cwd, ignore_errors=True)

    def test_rejects_protected_segment_git(self):
        cwd = tempfile.mkdtemp()
        try:
            target = os.path.join(cwd, "docs", "test-runs", ".git")
            os.makedirs(target)
            result = run(["docs/test-runs/.git"], cwd=cwd)
            self.assertNotEqual(result.returncode, 0)
            err = json.loads(result.stderr)
            self.assertEqual(err["failure"], "protected_segment")
            self.assertEqual(err["segment"], ".git")
            self.assertTrue(os.path.isdir(target))
        finally:
            shutil.rmtree(cwd, ignore_errors=True)

    def test_rejects_protected_segment_node_modules(self):
        cwd = tempfile.mkdtemp()
        try:
            target = os.path.join(cwd, "docs", "test-runs", "node_modules")
            os.makedirs(target)
            result = run(["docs/test-runs/node_modules"], cwd=cwd)
            self.assertNotEqual(result.returncode, 0)
            err = json.loads(result.stderr)
            self.assertEqual(err["failure"], "protected_segment")
            self.assertTrue(os.path.isdir(target))
        finally:
            shutil.rmtree(cwd, ignore_errors=True)

    def test_rejects_path_outside_test_runs_prefix(self):
        cwd = tempfile.mkdtemp()
        try:
            os.makedirs(os.path.join(cwd, "docs", "specs"))
            target = os.path.join(cwd, "docs", "specs", "foo")
            os.makedirs(target)
            result = run(["docs/specs/foo"], cwd=cwd)
            self.assertNotEqual(result.returncode, 0)
            err = json.loads(result.stderr)
            self.assertEqual(err["failure"], "outside_test_runs_prefix")
            self.assertTrue(os.path.isdir(target))
        finally:
            shutil.rmtree(cwd, ignore_errors=True)

    def test_rejects_test_runs_root(self):
        cwd = tempfile.mkdtemp()
        try:
            root = os.path.join(cwd, "docs", "test-runs")
            os.makedirs(os.path.join(root, "p"))
            result = run(["docs/test-runs"], cwd=cwd)
            self.assertNotEqual(result.returncode, 0)
            err = json.loads(result.stderr)
            self.assertEqual(err["failure"], "outside_test_runs_prefix")
            self.assertTrue(os.path.isdir(root))
            self.assertTrue(os.path.isdir(os.path.join(root, "p")))
        finally:
            shutil.rmtree(cwd, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 3: Run the tests and confirm they fail** — from `agent/`, run `python3 -m unittest skills._shared.scripts.tests.test_cleanup_test_runs` (or `cd agent && python3 -m unittest discover -s skills/_shared/scripts/tests -p "test_cleanup_test_runs.py"`). Confirm every test errors with `FileNotFoundError` or similar (script does not yet exist). This proves the tests are wired correctly.

- [ ] **Step 4: Create the helper script** — write `agent/skills/_shared/scripts/cleanup-test-runs.py` with the exact contents below:

```python
#!/usr/bin/env python3
"""cleanup-test-runs - Validated cleanup of a per-plan docs/test-runs/<plan-name>/ directory.

Argument:
  <path>  Positional. Relative or absolute path to the per-plan directory to remove.

Validation (refuses with exit 1 and JSON {"failure": ...} on stderr):
  - dotdot_traversal       : argument contains a '..' segment.
  - outside_cwd            : resolved path is outside the current working directory tree.
  - protected_segment      : resolved path's segments include any of .git, .ssh,
                             node_modules, .venv, venv (HARD_PROTECTED_SEGMENTS in
                             agent/extensions/guardrails.ts).
  - outside_test_runs_prefix : resolved path is not a strict child of <cwd>/docs/test-runs/
                               (the test-runs root itself is also rejected; only per-plan
                               subdirectories under it are accepted).

On success or no-op (target already absent), exits 0 with no stdout output.

Why this exists: the orchestrator's bash invocation `python3 agent/skills/_shared/scripts/cleanup-test-runs.py <path>`
does NOT match the recursive-delete regex in agent/extensions/guardrails.ts, so the guardrail confirm
prompt does not fire. Argument validation here makes the internal shutil.rmtree safe.
"""
import argparse
import json
import os
import shutil
import sys

HARD_PROTECTED_SEGMENTS = (".git", ".ssh", "node_modules", ".venv", "venv")


def fail(label, **extra):
    payload = {"failure": label}
    payload.update(extra)
    sys.stderr.write(json.dumps(payload) + "\n")
    sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("path", help="Per-plan directory to remove")
    args = parser.parse_args()

    raw = args.path
    segments_in_input = [seg for seg in raw.replace("\\", "/").split("/") if seg]
    if ".." in segments_in_input:
        fail("dotdot_traversal", path=raw)

    cwd = os.path.realpath(os.getcwd())
    abs_target = os.path.realpath(os.path.join(cwd, raw))

    cwd_with_sep = cwd + os.sep
    if abs_target != cwd and not abs_target.startswith(cwd_with_sep):
        fail("outside_cwd", path=raw, resolved=abs_target, cwd=cwd)

    rel_segments = [
        seg for seg in os.path.relpath(abs_target, cwd).split(os.sep) if seg and seg != "."
    ]
    for seg in rel_segments:
        if seg in HARD_PROTECTED_SEGMENTS:
            fail("protected_segment", segment=seg, path=raw, resolved=abs_target)

    test_runs_root = os.path.realpath(os.path.join(cwd, "docs", "test-runs"))
    test_runs_prefix = test_runs_root + os.sep
    if not abs_target.startswith(test_runs_prefix):
        fail("outside_test_runs_prefix", path=raw, resolved=abs_target, expected_prefix=test_runs_prefix)

    if not os.path.exists(abs_target):
        sys.exit(0)

    shutil.rmtree(abs_target)
    sys.exit(0)


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Re-run the tests and confirm they pass** — `cd agent && python3 -m unittest discover -s skills/_shared/scripts/tests -p "test_cleanup_test_runs.py"`. All eight test cases must pass with exit code 0.

- [ ] **Step 6: Add a README entry for cleanup-test-runs.py** — append a single bullet to `agent/skills/_shared/scripts/README.md` under the existing `## Helpers` list (after the `classify-workflow-drift.py` bullet), formatted to match the existing style:

```
- **cleanup-test-runs.py** — Validated cleanup of a per-plan `docs/test-runs/<plan-name>/` directory. Refuses `..` traversal, paths outside cwd, paths matching protected segments (`.git`, `.ssh`, `node_modules`, `.venv`, `venv`), and paths outside `<cwd>/docs/test-runs/`. Example: `python3 cleanup-test-runs.py docs/test-runs/my-plan`.
```

**Acceptance criteria:**

- `agent/skills/_shared/scripts/cleanup-test-runs.py` exists, takes a positional directory argument, and exits 0 when invoked against a present per-plan directory under `<cwd>/docs/test-runs/`.
  Verify: `cd agent/skills/_shared/scripts && python3 -c "import os, shutil, subprocess, sys, tempfile; script=os.path.abspath('cleanup-test-runs.py'); cwd=tempfile.mkdtemp(); os.makedirs(os.path.join(cwd,'docs','test-runs','p')); open(os.path.join(cwd,'docs','test-runs','p','x.log'),'w').close(); r=subprocess.run([sys.executable,script,'docs/test-runs/p'],cwd=cwd,capture_output=True,text=True); print('rc=',r.returncode,'stderr=',r.stderr,'exists=',os.path.exists(os.path.join(cwd,'docs','test-runs','p'))); shutil.rmtree(cwd)"` prints `rc= 0` and `exists= False`.
- The helper exits non-zero on each invalid input class enumerated in spec Requirement 13 plus the test-runs-prefix constraint.
  Verify: `cd agent && python3 -m unittest discover -s skills/_shared/scripts/tests -p "test_cleanup_test_runs.py"` exits 0 with all eight tests passing (no `FAIL`, no `ERROR` in output).
- The helper rejects the `docs/test-runs/` root itself (only strict per-plan subdirectories under it are accepted).
  Verify: `cd agent/skills/_shared/scripts && python3 -c "import os, shutil, subprocess, sys, tempfile; script=os.path.abspath('cleanup-test-runs.py'); cwd=tempfile.mkdtemp(); os.makedirs(os.path.join(cwd,'docs','test-runs','p')); r=subprocess.run([sys.executable,script,'docs/test-runs'],cwd=cwd,capture_output=True,text=True); print('rc=',r.returncode,'failed=','outside_test_runs_prefix' in r.stderr,'preserved=',os.path.isdir(os.path.join(cwd,'docs','test-runs','p'))); shutil.rmtree(cwd)"` prints `rc= 1`, `failed= True`, and `preserved= True`.
- The helper script's name and its docstring's documented invocation form do not contain `rm -r` or `rm --recursive`, so the regex `\brm\s+(-[^\s]*r|--recursive)/i` from `agent/extensions/guardrails.ts:94` does NOT match. (The SKILL.md-side invocation form is verified in Task 4.)
  Verify: `grep -nE "rm[[:space:]]+(-[^[:space:]]*r|--recursive)" agent/skills/_shared/scripts/cleanup-test-runs.py` returns zero matches.
- `agent/skills/_shared/scripts/README.md` documents the new helper under the `## Helpers` list.
  Verify: `grep -n "cleanup-test-runs.py" agent/skills/_shared/scripts/README.md` returns at least one match inside the `## Helpers` section (between `## Helpers` and `## Running tests`).

**Model recommendation:** standard

---

### Task 2: Create the pycache cleanup helper script and tests

**Files:**
- Create: `agent/skills/_shared/scripts/cleanup-pycache.py`
- Test: `agent/skills/_shared/scripts/tests/test_cleanup_pycache.py`

**Steps:**

- [ ] **Step 1: Write the failing tests first** — create `agent/skills/_shared/scripts/tests/test_cleanup_pycache.py` with the following test class structure:

```python
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

SCRIPT = os.path.join(
    os.path.dirname(__file__), "..", "cleanup-pycache.py"
)


def run(args, cwd):
    return subprocess.run(
        [sys.executable, SCRIPT] + args,
        capture_output=True,
        text=True,
        cwd=cwd,
    )


def make_pycache(parent):
    pc = os.path.join(parent, "__pycache__")
    os.makedirs(pc)
    with open(os.path.join(pc, "module.cpython-313.pyc"), "wb") as f:
        f.write(b"\x00\x01\x02")
    return pc


class TestCleanupPycache(unittest.TestCase):

    def test_successful_cleanup_of_nested_pycache(self):
        cwd = tempfile.mkdtemp()
        try:
            top = os.path.join(cwd, "agent")
            nested = os.path.join(cwd, "agent", "skills", "foo", "scripts")
            os.makedirs(nested)
            pc1 = make_pycache(top)
            pc2 = make_pycache(nested)
            result = run(["agent"], cwd=cwd)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertFalse(os.path.exists(pc1))
            self.assertFalse(os.path.exists(pc2))
            self.assertTrue(os.path.isdir(nested))
        finally:
            shutil.rmtree(cwd, ignore_errors=True)

    def test_idempotent_no_pycache_present(self):
        cwd = tempfile.mkdtemp()
        try:
            os.makedirs(os.path.join(cwd, "agent", "skills"))
            result = run(["agent"], cwd=cwd)
            self.assertEqual(result.returncode, 0, result.stderr)
        finally:
            shutil.rmtree(cwd, ignore_errors=True)

    def test_idempotent_target_absent(self):
        cwd = tempfile.mkdtemp()
        try:
            result = run(["agent"], cwd=cwd)
            self.assertEqual(result.returncode, 0, result.stderr)
        finally:
            shutil.rmtree(cwd, ignore_errors=True)

    def test_rejects_dotdot_traversal(self):
        cwd = tempfile.mkdtemp()
        try:
            os.makedirs(os.path.join(cwd, "agent"))
            result = run(["agent/../something"], cwd=cwd)
            self.assertNotEqual(result.returncode, 0)
            err = json.loads(result.stderr)
            self.assertEqual(err["failure"], "dotdot_traversal")
        finally:
            shutil.rmtree(cwd, ignore_errors=True)

    def test_rejects_path_outside_cwd(self):
        cwd = tempfile.mkdtemp()
        try:
            result = run(["/tmp/elsewhere"], cwd=cwd)
            self.assertNotEqual(result.returncode, 0)
            err = json.loads(result.stderr)
            self.assertEqual(err["failure"], "outside_cwd")
        finally:
            shutil.rmtree(cwd, ignore_errors=True)

    def test_rejects_protected_segment_git(self):
        cwd = tempfile.mkdtemp()
        try:
            os.makedirs(os.path.join(cwd, ".git", "hooks"))
            make_pycache(os.path.join(cwd, ".git"))
            result = run([".git"], cwd=cwd)
            self.assertNotEqual(result.returncode, 0)
            err = json.loads(result.stderr)
            self.assertEqual(err["failure"], "protected_segment")
            self.assertEqual(err["segment"], ".git")
            self.assertTrue(os.path.isdir(os.path.join(cwd, ".git", "__pycache__")))
        finally:
            shutil.rmtree(cwd, ignore_errors=True)

    def test_rejects_protected_segment_venv(self):
        cwd = tempfile.mkdtemp()
        try:
            os.makedirs(os.path.join(cwd, ".venv", "lib"))
            result = run([".venv"], cwd=cwd)
            self.assertNotEqual(result.returncode, 0)
            err = json.loads(result.stderr)
            self.assertEqual(err["failure"], "protected_segment")
        finally:
            shutil.rmtree(cwd, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the tests and confirm they fail** — `cd agent && python3 -m unittest discover -s skills/_shared/scripts/tests -p "test_cleanup_pycache.py"`. Confirm every test errors because the script does not yet exist.

- [ ] **Step 3: Create the helper script** — write `agent/skills/_shared/scripts/cleanup-pycache.py` with the exact contents below:

```python
#!/usr/bin/env python3
"""cleanup-pycache - Validated removal of __pycache__ directories under a target tree.

Argument:
  <path>  Positional. Relative or absolute path to the directory under which all
          __pycache__ directories should be removed (recursively).

Validation (refuses with exit 1 and JSON {"failure": ...} on stderr):
  - dotdot_traversal   : argument contains a '..' segment.
  - outside_cwd        : resolved path is outside the current working directory tree.
  - protected_segment  : resolved path's segments include any of .git, .ssh,
                         node_modules, .venv, venv (HARD_PROTECTED_SEGMENTS in
                         agent/extensions/guardrails.ts).

On success or no-op (no __pycache__ directories found, or the target is absent), exits 0.

Why this exists: the orchestrator's bash invocation `python3 agent/skills/_shared/scripts/cleanup-pycache.py <path>`
does NOT match the find-exec-rm regex in agent/extensions/guardrails.ts, so the guardrail confirm
prompt does not fire. Argument validation here makes the internal shutil.rmtree safe.
"""
import argparse
import json
import os
import shutil
import sys

HARD_PROTECTED_SEGMENTS = (".git", ".ssh", "node_modules", ".venv", "venv")


def fail(label, **extra):
    payload = {"failure": label}
    payload.update(extra)
    sys.stderr.write(json.dumps(payload) + "\n")
    sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("path", help="Directory under which to remove __pycache__ subtrees")
    args = parser.parse_args()

    raw = args.path
    segments_in_input = [seg for seg in raw.replace("\\", "/").split("/") if seg]
    if ".." in segments_in_input:
        fail("dotdot_traversal", path=raw)

    cwd = os.path.realpath(os.getcwd())
    abs_target = os.path.realpath(os.path.join(cwd, raw))

    cwd_with_sep = cwd + os.sep
    if abs_target != cwd and not abs_target.startswith(cwd_with_sep):
        fail("outside_cwd", path=raw, resolved=abs_target, cwd=cwd)

    rel_segments = [
        seg for seg in os.path.relpath(abs_target, cwd).split(os.sep) if seg and seg != "."
    ]
    for seg in rel_segments:
        if seg in HARD_PROTECTED_SEGMENTS:
            fail("protected_segment", segment=seg, path=raw, resolved=abs_target)

    if not os.path.isdir(abs_target):
        sys.exit(0)

    for dirpath, dirnames, _ in os.walk(abs_target):
        if "__pycache__" in dirnames:
            shutil.rmtree(os.path.join(dirpath, "__pycache__"))
            dirnames.remove("__pycache__")

    sys.exit(0)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Re-run the tests and confirm they pass** — `cd agent && python3 -m unittest discover -s skills/_shared/scripts/tests -p "test_cleanup_pycache.py"`. All seven test cases must pass.

- [ ] **Step 5: Add a README entry for cleanup-pycache.py** — insert a single bullet to `agent/skills/_shared/scripts/README.md` under the existing `## Helpers` list, immediately after the `extract-provenance-preamble.py` bullet (an existing helper present in the file regardless of Task 1's run order). This anchor is order-independent with respect to Task 1's edit, which targets the `classify-workflow-drift.py` bullet, so neither task's edit invalidates the other's anchor regardless of which runs first:

```
- **cleanup-pycache.py** — Validated removal of every `__pycache__` directory under a target tree. Refuses `..` traversal, paths outside cwd, and paths matching protected segments (`.git`, `.ssh`, `node_modules`, `.venv`, `venv`). Example: `python3 cleanup-pycache.py agent`.
```

**Acceptance criteria:**

- `agent/skills/_shared/scripts/cleanup-pycache.py` exists, removes every `__pycache__` directory under a target tree, and exits 0.
  Verify: `cd agent/skills/_shared/scripts && python3 -c "import os, shutil, subprocess, sys, tempfile; script=os.path.abspath('cleanup-pycache.py'); cwd=tempfile.mkdtemp(); os.makedirs(os.path.join(cwd,'a','__pycache__')); os.makedirs(os.path.join(cwd,'a','b','__pycache__')); r=subprocess.run([sys.executable,script,'a'],cwd=cwd,capture_output=True,text=True); print('rc=',r.returncode,'stderr=',r.stderr,'pc1=',os.path.exists(os.path.join(cwd,'a','__pycache__')),'pc2=',os.path.exists(os.path.join(cwd,'a','b','__pycache__'))); shutil.rmtree(cwd)"` prints `rc= 0`, `pc1= False`, and `pc2= False`.
- The helper exits non-zero on each invalid input class enumerated in spec Requirement 13.
  Verify: `cd agent && python3 -m unittest discover -s skills/_shared/scripts/tests -p "test_cleanup_pycache.py"` exits 0 with all seven tests passing.
- The helper uses the orchestrator-visible bash form `python3 agent/skills/_shared/scripts/cleanup-pycache.py <path>` and the regex `\bfind\b.*(?:\s-delete\b|\s-exec\s+rm\b)/i` from `agent/extensions/guardrails.ts:95` does NOT match this invocation form.
  Verify: open `agent/skills/_shared/scripts/cleanup-pycache.py` and confirm the file does not include any `find` shell command in any code or comment that would later be presented as the orchestrator-visible invocation; the documented invocation form in the docstring is `python3 ... cleanup-pycache.py <path>` with no `find` token.
- `agent/skills/_shared/scripts/README.md` documents the new helper under the `## Helpers` list.
  Verify: `grep -n "cleanup-pycache.py" agent/skills/_shared/scripts/README.md` returns at least one match inside the `## Helpers` section.

**Model recommendation:** standard

---

### Task 3: Create the shared orchestrator-verification-boundary file

**Files:**
- Create: `agent/skills/_shared/orchestrator-verification-boundary.md`

**Steps:**

- [ ] **Step 1: Confirm the location convention** — read `agent/skills/_shared/coordinator-dispatch.md` end-to-end (already cited as the existing shared-authority precedent in spec Open Questions). The new file lives alongside it as a peer.

- [ ] **Step 2: Create the shared boundary file** — write `agent/skills/_shared/orchestrator-verification-boundary.md` with the exact contents below. This is the single source of truth that `execute-plan/SKILL.md`, `refine-code/SKILL.md`, and `refine-plan/SKILL.md` will reference.

```
# Orchestrator-verification boundary

## Why this exists

Orchestrator skills (`execute-plan`, `refine-code`, `refine-plan`) dispatch substantive-work
subagents (`coder`, `verifier`, `test-runner`, `code-refiner`, `plan-refiner`) and route their
structured protocol output. The substantive judgment — *does the implementation satisfy the
acceptance criteria? does the review approve the change? does the plan cover the spec?* —
lives entirely inside the dispatched subagent. The orchestrator's job is mechanical: assemble
inputs, parse markers, validate provenance, route results.

This file is the single source of truth for that boundary. The three skills above reference
it instead of restating the principle. Skill-specific forbidden-behavior examples and hot-spot
anchoring stay in each `SKILL.md`; the principle itself stays here so revisions propagate
without reword.

## The boundary

After a substantive-work subagent (`coder`, `verifier`, `test-runner`, `code-refiner`,
`plan-refiner`) returns its protocol output, the orchestrator MUST:

- Parse only the structured markers documented for that subagent (`STATUS:`, `VERDICT:`,
  `## Per-Criterion Verdicts`, `FAILING_IDENTIFIERS:`, `## Review File`, etc.) and the
  artifact handoff line where applicable.
- Validate provenance and artifact format using the sanctioned helper scripts under
  `agent/skills/_shared/scripts/` and `agent/skills/<skill>/scripts/` (e.g.,
  `validate-review-provenance.py`, `parse-artifact-handoff.py`, `parse-test-runner-artifact.py`,
  `parse-verifier-report.py`, `parse-refine-code-summary.py`).
- Route the parsed result mechanically to the documented next gate (commit gate, retry loop,
  user-facing menu, completion bookkeeping).

The orchestrator MUST NOT:

- Inspect the subagent's substantive output (review file body, plan content, implementation
  files, diff hunks) to form an independent verdict on the subagent's judgment.
- Override, second-guess, or recompute the subagent's `STATUS:` / `VERDICT:` line.
- Run local checks — grep, Python scripts, assertion scripts, spot checks, ad hoc test
  command invocations, or extra `Read` calls — to decide whether the subagent's verdict is
  "really" correct.
- Synthesize a subagent's artifact (e.g., a `test-runner` artifact written from locally-run
  test output, or a verifier report stitched together from local file inspections).
- Dispatch ad hoc remediation, refinement, or verification subagents outside the documented
  loop for the current skill.
- Edit the artifact under judgment (the plan, the implementation, the review file) on the
  basis of an orchestrator-formed conclusion.

## Sanctioned mechanical surface

The orchestrator's allowed activities are the mechanical-glue work needed to connect
substantive subagents:

- Filling prompt templates via the helper scripts under `agent/skills/_shared/scripts/` and
  `agent/skills/<skill>/scripts/` (e.g., `fill-template.py`, `assemble-coder-prompt.py`,
  `assemble-verifier-prompt.py`, `fill-refine-code-prompt.py`, `fill-refine-plan-prompt.py`).
- Plan parsing via `extract-plan-tasks.py`.
- Model-tier resolution via `resolve-model-dispatch.py` and the procedure in
  `agent/skills/_shared/coordinator-dispatch.md`.
- Verifier-visible file-set assembly using the documented union rule (task scope ∪ worker
  report ∪ orchestrator-observed diff state).
- Diff context generation via `collect-diff-context.py`.
- Protocol-marker parsing via `parse-artifact-handoff.py`, `parse-test-runner-artifact.py`,
  `parse-verifier-report.py`, `parse-refine-code-summary.py`.
- Provenance validation via `validate-review-provenance.py`.
- Completion bookkeeping (moving artifacts, closing todos, checking git status, post-helper
  cache cleanup via `cleanup-test-runs.py` / `cleanup-pycache.py`).

These activities never produce a substantive PASS/FAIL verdict on subagent acceptance
criteria. PASS/FAIL judgments are the dispatched subagent's exclusive role.

## Why this matters

Orchestrator overreach has two failure modes: (1) duplicating the subagent's role with
inferior context (the subagent has the prompt template, the recipes, the instructions; the
orchestrator does not), and (2) polluting the orchestrator's context with substantive
inspection that biases later mechanical routing. The boundary keeps each role isolated, the
verdict authoritative, and the orchestrator's context clean.
```

- [ ] **Step 3: Verify the file is well-formed Markdown** — open the file in a text reader and confirm the headings render as `# Orchestrator-verification boundary`, `## Why this exists`, `## The boundary`, `## Sanctioned mechanical surface`, and `## Why this matters` (no broken Markdown).

**Acceptance criteria:**

- A single shared boundary statement file exists at `agent/skills/_shared/orchestrator-verification-boundary.md`.
  Verify: `test -f agent/skills/_shared/orchestrator-verification-boundary.md && echo OK` prints `OK`.
- The file contains the principle that orchestrators route substantive subagents mechanically and never re-judge their output, plus an explicit list of forbidden orchestrator behaviors and an explicit list of sanctioned mechanical activities.
  Verify: open `agent/skills/_shared/orchestrator-verification-boundary.md` and confirm all five section headings (`# Orchestrator-verification boundary`, `## Why this exists`, `## The boundary`, `## Sanctioned mechanical surface`, `## Why this matters`) appear, and that the body under `## The boundary` lists at least the forbidden behaviors: inspecting substantive output for an independent verdict, overriding `STATUS:` / `VERDICT:`, running local checks, synthesizing subagent artifacts, dispatching ad hoc remediation, and editing the artifact under judgment.
- The file does NOT prescribe any specific skill's workflow steps — it states the principle once, with skill-specific anchoring left to each `SKILL.md`.
  Verify: `grep -n "Step [0-9]" agent/skills/_shared/orchestrator-verification-boundary.md` returns zero matches (no step numbers from any skill appear in the shared file).

**Model recommendation:** standard

---

### Task 4: Update execute-plan/SKILL.md — add guardrail blocks, remove archive flow, swap in cleanup helpers

**Files:**
- Modify: `agent/skills/execute-plan/SKILL.md`

**Steps:**

- [ ] **Step 1: Record the pre-change line count** — run `wc -l agent/skills/execute-plan/SKILL.md` and write the result down (call it `PRE_LINES`). The post-change line count must not exceed `PRE_LINES` (spec Requirement 8). The current value is 739; the implementer must capture whatever value `wc -l` reports just before editing.

- [ ] **Step 2: Add the post-coder verification guardrail block** — between Step 9 (line 354's "After the wave drains…") and Step 10's heading (line 358), insert a single guardrail block titled `### Boundary: orchestrator MUST NOT verify coder output itself` containing this exact wording:

```
> After a `coder` returns `DONE` or `DONE_WITH_CONCERNS`, the orchestrator MUST NOT run local
> grep / Python / assertion scripts, spot checks, or final-acceptance checks to decide
> whether the implementation satisfies the task. The only sanctioned path for substantive
> task verification is dispatching a fresh `verifier` subagent (Step 11) with the
> planner-authored acceptance criteria and `Verify:` recipes, then mechanically parsing the
> verifier's protocol output via `agent/skills/execute-plan/scripts/parse-verifier-report.py`.
>
> Forbidden behaviors (illustrative, not exhaustive):
> - Writing Python / grep / `Read` scripts that independently check criteria.
> - Running spot checks against implemented files to decide whether criteria pass.
> - Synthesizing a "final acceptance" script that re-checks task-specific expected strings.
> - Interpreting local command output as evidence that a task passed.
>
> See `agent/skills/_shared/orchestrator-verification-boundary.md` for the shared statement
> that anchors this rule across `execute-plan`, `refine-code`, and `refine-plan`.
```

The block must be placed where the temptation is highest (between coder return and verifier dispatch) so a reader encounters it in place — the cross-reference to the shared file is in support, not the primary anchor (spec Requirement 7 + last bullet of "Verification-boundary acceptance criteria").

- [ ] **Step 3: Add the integration-test guardrail block** — insert a single guardrail block titled `### Boundary: orchestrator MUST NOT run the test command itself` adjacent to Step 7's "Test-runner dispatch (shared)" subsection (around line 283), containing this exact wording:

```
> The orchestrator MUST NOT run the configured test command itself or synthesize a
> `test-runner` artifact from locally-run output. All integration-test execution and artifact
> writing must be performed by the `test-runner` subagent. The orchestrator may only:
>
> - Create the parent directory `docs/test-runs/<plan-name>/` (via `mkdir -p`).
> - Dispatch `test-runner` via `subagent_run_serial` with the filled
>   `test-runner-prompt.md` template.
> - Parse the artifact handoff marker via
>   `agent/skills/execute-plan/scripts/parse-test-runner-artifact.py`.
> - Validate the artifact format via the same
>   `agent/skills/execute-plan/scripts/parse-test-runner-artifact.py` helper, which performs
>   both the handoff parse and the structural format checks (required-header presence and
>   order, `EXIT_CODE` integer parse, `FAILING_IDENTIFIERS_COUNT` /
>   `NON_RECONCILABLE_COUNT` integer parse and count reconciliation, raw-output marker
>   presence).
> - Reconcile the parsed `FAILING_IDENTIFIERS:` and `NON_RECONCILABLE_FAILURES:` against
>   the frozen `baseline_failures` per `integration-regression-model.md`.
>
> This boundary applies identically at Step 7 (baseline), Step 12 (post-wave), the Step 12
> Debugger-first re-test, and Step 16 (final-gate). See
> `agent/skills/_shared/orchestrator-verification-boundary.md`.
```

- [ ] **Step 4: Add the allowed-mechanical-work enumeration** — adjacent to the Step 7 / Step 11 surfaces (the planner picks the placement that fits without growing line count; a sensible site is immediately after the post-coder verification guardrail block from Step 2, since the allowed-work list is the positive complement of that block's prohibition). Insert this block titled `### Allowed mechanical work (orchestrator)`:

```
> The orchestrator's sanctioned activities are mechanical glue connecting substantive
> subagents. None of these produces a PASS/FAIL verdict on implementation acceptance
> criteria — those judgments belong to `verifier` and `test-runner`.
>
> | Activity | Helper |
> |---|---|
> | Plan parsing (task spec, files, criteria, recipes) | `agent/skills/execute-plan/scripts/extract-plan-tasks.py` |
> | Coder prompt assembly | `agent/skills/execute-plan/scripts/assemble-coder-prompt.py` |
> | Verifier prompt assembly | `agent/skills/execute-plan/scripts/assemble-verifier-prompt.py` |
> | Diff context generation | `agent/skills/execute-plan/scripts/collect-diff-context.py` |
> | Verifier-visible file-set assembly | orchestrator-computed (union rule, Step 11.2) |
> | Model-tier resolution | `agent/skills/_shared/scripts/resolve-model-dispatch.py` |
> | Test-runner artifact parsing | `agent/skills/execute-plan/scripts/parse-test-runner-artifact.py` |
> | Verifier report parsing | `agent/skills/execute-plan/scripts/parse-verifier-report.py` |
> | Per-plan test-runs cleanup (success exit only) | `agent/skills/_shared/scripts/cleanup-test-runs.py` |
> | Post-helper Python bytecode cache cleanup | `agent/skills/_shared/scripts/cleanup-pycache.py` |
> | Completion bookkeeping (todo close, branch finish) | native git / todo tool |
```

- [ ] **Step 5: Remove the plan-archive-to-done flow (per Requirement 9)** — apply each of the following edits to make line budget for the new wording. Each edit is grounded in the spec's enumeration of cascading references:

  - **(a)** Line 117: replace ``list `docs/plans/` (excluding `done/`) and let the user pick.`` with ``list `docs/plans/` and let the user pick.`` — drops the `excluding done/` clause, since `docs/plans/done/` will no longer be a destination.

  - **(b)** Line 687: replace ``Proceed to `### 1. Move plan to done`.`` with ``Proceed to `### 1. Cleanup`.`` — the gate's success-path target is now the renamed cleanup substep.

  - **(c)** Line 702: in the `(x) Stop execution` bullet, replace `Do NOT move the plan file, close the todo, or run branch completion.` with `Do NOT close the todo or run branch completion.` — there is no plan-file move to forbid.

  - **(d)** Line 704: replace ``**Blocking guarantee:** Steps `### 1. Move plan to done`, `### 2. Close linked todo`, and `### 4. Branch completion` MUST NOT execute…`` with ``**Blocking guarantee:** Steps `### 1. Cleanup`, `### 2. Close linked todo`, and `### 4. Branch completion` MUST NOT execute…`` — substep name change.

  - **(e)** Lines 706–711: replace the entire `### 1. Move plan to done` substep (six lines including content) with the relocated cleanup substep below. This is Requirement 10's relocation: the cleanup target, timing, and conditions stay identical — only the grouping changes. The inline `rm -rf docs/test-runs/<plan-name>` becomes the helper invocation per Requirement 11:

````
### 1. Cleanup

**Precondition:** `current_non_baseline_stable ∪ current_non_reconcilable` is empty AND
this run reached this substep via the final-gate success exit (never via any
`(x) Stop execution` path; every stop exit leaves `docs/test-runs/<plan-name>/` in place
so the user can inspect run artifacts).

Delete the per-plan test-runs directory now that the final integration regression gate has
passed:

```bash
python3 agent/skills/_shared/scripts/cleanup-test-runs.py docs/test-runs/<plan-name>
```

This invocation is the sanctioned mechanism for this cleanup; it does not match the
recursive-delete regex in `agent/extensions/guardrails.ts` and does not surface a manual
confirm. Helper argument validation is the safety surface — see
`agent/skills/_shared/scripts/cleanup-test-runs.py` for the exact validation contract.
````

  - **(f)** Line 721: replace ``Append to the todo body: `\nCompleted via plan: docs/plans/done/<plan-filename>.md``` with ``Append to the todo body: `\nCompleted via plan: docs/plans/<plan-filename>.md``` — the plan file no longer moves.

  - **(g)** Stop-exit phrasing sweep across Steps 10/12/13/15/16: spec Requirement 9 enumerates "the 'do NOT move the plan file' / 'the per-plan `docs/test-runs/<plan-name>/` directory is preserved on this exit path' stop-exit phrasing in Steps 10/12/13/15/16" as a cascading reference that must be updated. (c) above only handles the line-702 occurrence. Sweep the remainder: run `grep -nE "[Mm]ove the plan file|plan file (move|is moved)|preserved on this exit path" agent/skills/execute-plan/SKILL.md` and for each remaining match outside the line-702 bullet already handled, apply one of these rewrites:
    - Phrasing of the form `Do NOT move the plan file, …` or any clause forbidding the plan-file move on a stop-exit path: delete the obsolete plan-move clause (the plan never moves on any path now), keeping the rest of the bullet's prohibitions intact.
    - Phrasing of the form `the per-plan `docs/test-runs/<plan-name>/` directory is preserved on this exit path` (or equivalent wording justifying preservation by explicit comparison to the archive-flow cleanup): keep the preservation guarantee but replace any reference to the old `### 1. Move plan to done` grouping with a reference to the relocated `### 1. Cleanup` substep, so the wording is consistent with the new flow.
    The cleanup-on-stop-exit semantics stay identical — every `(x) Stop execution` exit path leaves `docs/test-runs/<plan-name>/` in place — but the wording must no longer reference the removed plan-move flow. After this sweep, `grep -nE "[Mm]ove the plan file" agent/skills/execute-plan/SKILL.md` MUST return zero matches.

- [ ] **Step 6: Add the cleanup-pycache reference** — append a single short note to the allowed-mechanical-work block (already added in Step 4 — it has a `cleanup-pycache.py` row). No additional placement is required if Step 4's table is in place; if not, insert a one-line note adjacent to the allowed-mechanical-work block stating: `Post-helper Python bytecode cache cleanup uses `agent/skills/_shared/scripts/cleanup-pycache.py <path>` rather than ad hoc `find … -exec rm` invocations.`

- [ ] **Step 7: Verify line budget** — run `wc -l agent/skills/execute-plan/SKILL.md` and confirm the result is `≤ PRE_LINES` from Step 1. If exceeded, perform cosmetic reflows (joining short lines, tightening repeated stop-exit phrasing into a single back-reference) until budget is met. Do NOT delete substantive content beyond what Steps 5(a)–5(g) authorize.

- [ ] **Step 8: Verify no `docs/plans/done/` references and no stale plan-move phrasing remain** — `grep -n "docs/plans/done" agent/skills/execute-plan/SKILL.md` must return zero matches, AND `grep -nE "[Mm]ove the plan file" agent/skills/execute-plan/SKILL.md` must return zero matches (the stop-exit phrasing sweep from Step 5(g) is complete).

- [ ] **Step 9: Verify the boundary file is referenced** — `grep -n "orchestrator-verification-boundary.md" agent/skills/execute-plan/SKILL.md` must return at least two matches (one in each of the two new guardrail blocks from Steps 2 and 3).

**Acceptance criteria:**

- `agent/skills/execute-plan/SKILL.md` contains a clearly-marked guardrail block at or adjacent to Step 9 / Step 10 / Step 11 that explicitly forbids the orchestrator from running local grep / Python / assertion scripts, spot checks, or final-acceptance checks to decide whether implementation satisfies a task; the block names `verifier` as the sole sanctioned substantive-verification path.
  Verify: `grep -n -B1 -A20 "Boundary: orchestrator MUST NOT verify coder output itself" agent/skills/execute-plan/SKILL.md` shows the block within 60 lines of a `## Step 10` or `## Step 11` heading and contains the literal substrings `MUST NOT run local`, `verifier`, and `Verify:`.
- `agent/skills/execute-plan/SKILL.md` contains a guardrail block at or adjacent to Step 7 / Step 12 / Step 16 that explicitly forbids the orchestrator from running the configured test command itself or synthesizing a `test-runner` artifact; the block names `test-runner` as the sole sanctioned integration-test execution path; and the block's "may only" list enumerates create-parent-directory, dispatch, parse handoff marker, validate artifact format, and reconcile against `baseline_failures`.
  Verify: `grep -n -B1 -A20 "Boundary: orchestrator MUST NOT run the test command itself" agent/skills/execute-plan/SKILL.md` returns the block, and the block contains the literal substrings `test-runner`, `MUST NOT run the configured test command`, `Validate the artifact format`, and `parse-test-runner-artifact.py`.
- The skill enumerates allowed mechanical work and pairs each item with its existing helper script where one exists; the enumeration explicitly states these activities never produce a substantive PASS/FAIL verdict on implementation acceptance criteria.
  Verify: `grep -n "Allowed mechanical work" agent/skills/execute-plan/SKILL.md` returns at least one match, and reading the surrounding 30 lines shows a table with rows naming `extract-plan-tasks.py`, `assemble-coder-prompt.py`, `assemble-verifier-prompt.py`, `collect-diff-context.py`, `parse-test-runner-artifact.py`, `parse-verifier-report.py`, `cleanup-test-runs.py`, and `cleanup-pycache.py`, plus the disclaimer `never produces a PASS/FAIL verdict on implementation acceptance criteria`.
- The plan-archive-to-done flow is removed from the skill — no reference to `docs/plans/done/` remains.
  Verify: `grep -n "docs/plans/done" agent/skills/execute-plan/SKILL.md` returns zero matches.
- All stop-exit phrasing in Steps 10/12/13/15/16 is updated to be consistent with the removed plan-archive flow — no clause forbidding a plan-file move on a stop-exit path remains anywhere in the file.
  Verify: `grep -nE "[Mm]ove the plan file" agent/skills/execute-plan/SKILL.md` returns zero matches.
- Test-runs cleanup is relocated to its own substep on the final-gate success path under the same precondition as before.
  Verify: open `agent/skills/execute-plan/SKILL.md` and confirm there is a `### 1. Cleanup` (or equivalently named) substep inside Step 16 whose body contains both the precondition `current_non_baseline_stable ∪ current_non_reconcilable` is empty AND the helper invocation `python3 agent/skills/_shared/scripts/cleanup-test-runs.py docs/test-runs/<plan-name>`.
- `agent/skills/execute-plan/SKILL.md` references the new `cleanup-pycache.py` helper at least once as the sanctioned post-helper cache-cleanup mechanism.
  Verify: `grep -n "cleanup-pycache.py" agent/skills/execute-plan/SKILL.md` returns at least one match inside the allowed-mechanical-work block (within 30 lines of the `Allowed mechanical work` heading).
- `agent/skills/execute-plan/SKILL.md` references the shared boundary file from each of the two new guardrail blocks.
  Verify: `grep -c "orchestrator-verification-boundary.md" agent/skills/execute-plan/SKILL.md` returns a count ≥ 2.
- Post-change line count of `agent/skills/execute-plan/SKILL.md` does not exceed the pre-change line count.
  Verify: `wc -l agent/skills/execute-plan/SKILL.md` returns a value ≤ 739 (the pre-change count recorded in this plan; the implementer recomputes the pre-change baseline in Step 1 of this task and confirms ≤ that value if it differs from 739 due to ambient repo state).

**Model recommendation:** capable

---

### Task 5: Update refine-code/SKILL.md — add guardrail block and cleanup-pycache reference

**Files:**
- Modify: `agent/skills/refine-code/SKILL.md`

**Steps:**

- [ ] **Step 1: Add the guardrail block between Step 5 and Step 6** — between the end of `## Step 5: Handle code-refiner result` (line ~81) and the start of `## Step 6: Validate review provenance` (line ~83), insert a single guardrail block titled `### Boundary: orchestrator MUST NOT re-judge the code-refiner's verdict` containing this exact wording:

```
> Between parsing the `code-refiner`'s `finalMessage` (Step 5) and forwarding it verbatim to
> the caller (Step 6), the orchestrator MUST NOT:
>
> - Read the review file or the diff under `BASE_SHA..HEAD_SHA` to form an independent
>   verdict on the change.
> - Override or recompute the `STATUS:` line returned by the `code-refiner` (`approved`,
>   `approved_with_concerns`, `not_approved_within_budget`, `failed`).
> - Run local checks (grep, the test command, additional `Read` calls on implementation
>   files, ad hoc Python scripts) to second-guess the coordinator's judgment.
> - Dispatch ad hoc remediation subagents outside the documented loop. Iteration is owned by
>   the `code-refiner`'s internal review-remediate cycle; the only sanctioned re-entry from
>   this skill is the (a) keep-iterating choice on `not_approved_within_budget`.
>
> The only sanctioned post-coordinator path is: parse `finalMessage` for the `STATUS:` line,
> validate provenance via `agent/skills/_shared/scripts/validate-review-provenance.py`
> (Step 6), and forward the coordinator's output verbatim. See
> `agent/skills/_shared/orchestrator-verification-boundary.md` for the shared statement.
```

- [ ] **Step 2: Add the cleanup-pycache reference** — add a single short reference to `cleanup-pycache.py` as the sanctioned cache-cleanup invocation after running Python helpers under `agent/skills/refine-code/scripts/`. A natural placement is co-located with the new guardrail block from Step 1 (since the boundary block already lists allowed mechanical activities). Append the following line to the bottom of the guardrail block (inside the same blockquote):

```
> Post-helper bookkeeping: any Python bytecode caches (`__pycache__`) left behind by
> helper-script invocations under `agent/skills/refine-code/scripts/` are removed via
> `python3 agent/skills/_shared/scripts/cleanup-pycache.py <path>`, never via ad hoc
> `find … -exec rm` commands.
```

- [ ] **Step 3: Verify the boundary file is referenced** — `grep -n "orchestrator-verification-boundary.md" agent/skills/refine-code/SKILL.md` must return at least one match.

- [ ] **Step 4: Verify the cleanup-pycache helper is referenced** — `grep -n "cleanup-pycache.py" agent/skills/refine-code/SKILL.md` must return at least one match.

**Acceptance criteria:**

- `agent/skills/refine-code/SKILL.md` contains a guardrail block at or adjacent to Step 5 / Step 6 that explicitly forbids the orchestrator from reading the review file or diff for independent judgment, overriding the coordinator's `STATUS:`, running local checks, or dispatching ad hoc remediation outside the documented loop.
  Verify: `grep -n -A20 "Boundary: orchestrator MUST NOT re-judge the code-refiner" agent/skills/refine-code/SKILL.md` returns the block, and reading the 25 lines that follow the heading shows all four forbidden behaviors (review-file inspection, `STATUS:` override, local checks, ad hoc dispatches) explicitly stated.
- The block is positioned between `## Step 5` and `## Step 6` in the file (so a reader encounters the boundary at the temptation gap between coordinator return and provenance validation).
  Verify: open `agent/skills/refine-code/SKILL.md` and confirm the new `### Boundary…` heading appears on a line strictly after the heading `## Step 5: Handle code-refiner result` and strictly before the heading `## Step 6: Validate review provenance`.
- The skill references the shared boundary file.
  Verify: `grep -n "orchestrator-verification-boundary.md" agent/skills/refine-code/SKILL.md` returns at least one match.
- The skill references `cleanup-pycache.py` as the sanctioned post-helper cache-cleanup invocation.
  Verify: `grep -n "cleanup-pycache.py" agent/skills/refine-code/SKILL.md` returns at least one match.

**Model recommendation:** standard

---

### Task 6: Update refine-plan/SKILL.md — add guardrail block and cleanup-pycache reference

**Files:**
- Modify: `agent/skills/refine-plan/SKILL.md`

**Steps:**

- [ ] **Step 1: Add the guardrail block between Step 9 and Step 10** — between the end of `## Step 9.5: Validate review provenance` (line ~146) and the start of `## Step 10` (line ~148), insert a single guardrail block titled `### Boundary: orchestrator MUST NOT re-judge the plan-refiner's verdict` containing this exact wording:

```
> Between parsing the `plan-refiner`'s `finalMessage` (Step 9), validating each review
> file's provenance (Step 9.5), and routing on `STATUS:` to the commit gate (Step 10), the
> orchestrator MUST NOT:
>
> - Read the review files (`docs/plans/reviews/<PLAN_BASENAME>-plan-review-v<ERA>.md`) or
>   the plan content (`PLAN_PATH`) to form an independent verdict on the plan.
> - Override or recompute the `STATUS:` line returned by the `plan-refiner` (`approved`,
>   `approved_with_concerns`, `not_approved_within_budget`, `failed`).
> - Run local checks (grep, ad hoc Python scripts, additional `Read` calls on the plan or
>   reviews) to second-guess the coordinator's judgment.
> - Edit the plan file directly, or invent extra refinement dispatches outside the
>   documented loop. Iteration is owned by the `plan-refiner`'s internal review-edit cycle;
>   the only sanctioned re-entry from this skill is the (a) commit-and-continue choice on
>   `not_approved_within_budget`, which re-runs from Step 6 onward with `STARTING_ERA`
>   recomputed.
>
> The only sanctioned post-coordinator paths are: parse `finalMessage`, validate each review
> file's provenance via `agent/skills/_shared/scripts/validate-review-provenance.py`, and
> route on `STATUS:` to Step 10's commit gate. See
> `agent/skills/_shared/orchestrator-verification-boundary.md` for the shared statement.
>
> Post-helper bookkeeping: any Python bytecode caches (`__pycache__`) left behind by
> helper-script invocations under `agent/skills/refine-plan/scripts/` are removed via
> `python3 agent/skills/_shared/scripts/cleanup-pycache.py <path>`, never via ad hoc
> `find … -exec rm` commands.
```

- [ ] **Step 2: Verify the boundary file is referenced** — `grep -n "orchestrator-verification-boundary.md" agent/skills/refine-plan/SKILL.md` must return at least one match.

- [ ] **Step 3: Verify the cleanup-pycache helper is referenced** — `grep -n "cleanup-pycache.py" agent/skills/refine-plan/SKILL.md` must return at least one match.

**Acceptance criteria:**

- `agent/skills/refine-plan/SKILL.md` contains a guardrail block at or adjacent to Step 9 / Step 9.5 / Step 10 that explicitly forbids the orchestrator from reading review files or plan content for independent judgment, overriding the coordinator's `STATUS:`, running local plan checks, or editing the plan / inventing extra refinement dispatches.
  Verify: `grep -n -A25 "Boundary: orchestrator MUST NOT re-judge the plan-refiner" agent/skills/refine-plan/SKILL.md` returns the block, and reading the 30 lines that follow the heading shows all four forbidden behaviors (review-file/plan-content inspection, `STATUS:` override, local plan checks, plan editing or extra dispatches) explicitly stated.
- The block is positioned between `## Step 9.5` and `## Step 10` in the file.
  Verify: open `agent/skills/refine-plan/SKILL.md` and confirm the new `### Boundary…` heading appears on a line strictly after the heading `## Step 9.5: Validate review provenance` and strictly before the heading `## Step 10`.
- The skill references the shared boundary file.
  Verify: `grep -n "orchestrator-verification-boundary.md" agent/skills/refine-plan/SKILL.md` returns at least one match.
- The skill references `cleanup-pycache.py` as the sanctioned post-helper cache-cleanup invocation.
  Verify: `grep -n "cleanup-pycache.py" agent/skills/refine-plan/SKILL.md` returns at least one match.

**Model recommendation:** standard

## Dependencies

- Task 4 depends on: Task 1, Task 2, Task 3
- Task 5 depends on: Task 2, Task 3
- Task 6 depends on: Task 2, Task 3

Wave 1: [Task 1, Task 2, Task 3]
Wave 2: [Task 4, Task 5, Task 6]

## Risk Assessment

- **Line budget for `execute-plan/SKILL.md` is tight.** The new guardrail blocks (Steps 2, 3, 4 of Task 4) add ~30–40 lines; the archive-flow removal (Step 5) recovers ~6–10 lines. The remaining gap must be closed by cosmetic reflows. If the budget cannot be met without losing required content, the implementer escalates rather than dropping a guardrail. Mitigation: Step 5 enumerates explicit, spec-authorized removals; Step 7 includes an explicit verification recipe and a fallback (cosmetic reflows) before any substantive cut. The pre-change line count is recorded in Step 1 so reviewers can confirm post-change `wc -l` against it directly.
- **Parallel edits to `_shared/scripts/README.md` from Tasks 1 and 2.** Both tasks insert a single bullet under the existing `## Helpers` list. Each task uses a distinct, pre-existing helper bullet as its insertion anchor — Task 1 inserts after `classify-workflow-drift.py` (the current last bullet), and Task 2 inserts after `extract-provenance-preamble.py`. Both anchors exist in the file before either task runs, so neither task's edit invalidates the other's anchor regardless of run order. Mitigation: the anchors are deliberately non-overlapping; the resulting helper-list order varies by run order but the file is always well-formed; the post-wave commit (`execute-plan` Step 12) bundles both edits into a single wave commit. Worst-case, one of the two tasks' Edit calls fails on string-match conflict; that failure surfaces as a Step 9 retry and resolves on re-dispatch.
- **Argument validation order matters in helpers.** A path containing `..` must be rejected BEFORE `os.path.realpath` resolution, because `realpath` collapses `..` and would silently let a `docs/test-runs/../docs/specs/foo` argument pass the test-runs-prefix check. Mitigation: both helpers (Tasks 1 and 2) check `..` against the input string's literal segments before calling `realpath`; tests `test_rejects_dotdot_traversal` in both files cover this ordering explicitly.
- **Helper invocation must NOT match either dangerous-command regex.** The form `python3 agent/skills/_shared/scripts/cleanup-test-runs.py <path>` does not contain `rm -r` or `rm --recursive`; the form `python3 agent/skills/_shared/scripts/cleanup-pycache.py <path>` does not contain `find … -delete` or `find … -exec rm`. Mitigation: every documented invocation in SKILL.md files (Task 4 Step 5(e), Task 5 Step 2, Task 6 Step 1) uses only `python3 <helper> <path>` shape; reviewers can grep `agent/skills/execute-plan/SKILL.md` and the two refine-* SKILL.md files for `rm -r`, `--recursive`, `find .* -exec rm`, and `find .* -delete` to confirm no inline forms remain at the cleanup sites.
- **Spec coverage for `refine-code` / `refine-plan` is principle-driven, not incident-driven.** The spec's Open Questions explicitly notes no smoking-gun overreach incident has been observed in those skills; the boundary is added as parallel reinforcement of the `execute-plan` boundary. If a future incident surfaces requirements not anticipated by the wording in Tasks 5 and 6, those tasks may need an editing pass — but this is acknowledged in the spec, not a planning gap.
- **Shared boundary file location chosen by the planner.** Per spec Constraints + Open Questions, the file lives at `agent/skills/_shared/orchestrator-verification-boundary.md` as a peer of the existing `coordinator-dispatch.md`. If a future revision wants to move it (e.g., into `coordinator-dispatch.md`), all three SKILL.md cross-references must be updated together. Mitigation: each SKILL.md has only one or two cross-references, so the find-and-replace surface is small.

## Test Command

```bash
cd agent && npm run test:helpers
```
