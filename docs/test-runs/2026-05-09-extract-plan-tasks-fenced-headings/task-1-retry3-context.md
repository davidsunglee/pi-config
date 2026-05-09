Verifier remediation target:

Criterion 2 still fails.
Reason: The realistic-fixture tests do not verify that the parsed task block itself retains the literal post-fence `**Model recommendation:** standard` line.

Required fix for this retry:
- Add an explicit assertion that the parsed `task_spec` contains the literal post-fence line `**Model recommendation:** standard`.
- Keep scope narrow and avoid unrelated changes.
