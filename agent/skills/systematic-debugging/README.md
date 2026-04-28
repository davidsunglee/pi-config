# Systematic Debugging skill

Investigate bugs, failures, and unexpected behavior by finding root cause before changing code.

## When to use

Use for test failures, production bugs, build failures, performance problems, integration issues, and any unexpected behavior. It is especially important under time pressure or after a previous fix failed.

## Iron law

No fixes without root cause investigation first. A visible symptom is not enough; the agent must understand why the problem happens before proposing or implementing a fix.

## Four phases

### 1. Root cause investigation

Read the full error, reproduce consistently, inspect recent changes, add diagnostic instrumentation at component boundaries, and trace bad values back to their origin.

### 2. Pattern analysis

Find similar working code, read references completely, compare differences, and identify dependencies or assumptions.

### 3. Hypothesis and testing

State a single specific hypothesis, test it with the smallest possible change, and either confirm it or form a new hypothesis. Do not stack speculative fixes.

### 4. Implementation

Write a failing test or reproduction, implement one fix for the confirmed root cause, verify it, and check for regressions.

## Three-fix escalation rule

If three fix attempts fail, stop and question the architecture before trying another patch. Repeated failures often mean the underlying pattern is wrong, not that one more small change is needed.

## Supporting techniques

- `root-cause-tracing.md` — trace bugs backward through the call stack to the original trigger.
- `defense-in-depth.md` — add validation at multiple layers after root cause is understood.
- `condition-based-waiting.md` — replace arbitrary sleeps with polling for real conditions.

## Related skills

- `test-driven-development` — for the failing test required before the fix.
- `verification-before-completion` — for evidence before reporting that the issue is fixed.

## Files

- `SKILL.md` — core debugging process.
- `root-cause-tracing.md` — backward tracing technique.
- `defense-in-depth.md` — layered validation guidance.
- `condition-based-waiting.md` — deterministic wait guidance.
