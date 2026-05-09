Verifier remediation target:

Criterion 3 still fails.
Reason: The parser implementation was updated for fence-aware required-section validation, but the added tests do not include any case asserting `missing_required_section` behavior when a fenced `## ...` line could mislead section detection.

Required fix for this retry:
- Add an explicit regression test for required-section validation.
- The test should prove that a fenced fake section heading does NOT satisfy or alter real required-section validation.
- Keep scope narrow; do not broaden beyond the missing regression coverage.
