**Reviewer:** openai-codex/gpt-5.5 via pi

### Outcome

**Verdict:** Approved

**Reasoning:** The documentation changes satisfy the requested workflow adjustments: the broken fastlane promote option is no longer advertised or handled, and generate-plan now explicitly normalizes date-prefixed spec basenames before applying the current plan date.

### Strengths

- `agent/skills/fastlane/SKILL.md:70-96` cleanly removes the `(p) Promote to deep workflow` menu item while preserving stop/manual escalation guidance via `/generate-plan <spec-path>`.
- `agent/skills/fastlane/SKILL.md:198-208` removes the blocked-state promote branch and replaces it with explicit manual stash/discard plus `/generate-plan` guidance, keeping users in control of their working tree.
- `agent/skills/generate-plan/SKILL.md:62-64` clearly documents the required `YYYY-MM-DD-` prefix stripping rule and preserves behavior for basenames without a date prefix.

### Issues

#### Critical (Must Fix)

_None._

#### Important (Should Fix)

_None._

#### Minor (Nice to Have)

_None._

### Recommendations

_None._
