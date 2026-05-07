**Reviewer:** openai-codex/gpt-5.5 via pi

### Outcome

**Verdict:** Not approved

**Reasoning:** The implementation covers the main workflow/source drift shape, but the documented reachability check does not actually verify that the brief SHA is reachable from HEAD. That gap can let stale briefs from another local branch be classified and auto-continued instead of surfacing the required checkpoint.

### Strengths

- Adds a shared workflow-artifact allowlist document with clear directory-boundary matching examples.
- Preserves path-based handoff and bounded preamble reads while adding explicit NUL-separated diff enumeration guidance.
- Defines clear `(c)`/`(x)` menu handling with no auto-default for source/config drift and uninspectable cases.

### Issues

#### Critical (Must Fix)

_None._

#### Important (Should Fix)

- `agent/skills/generate-plan/SKILL.md:74` describes the “brief SHA not reachable from HEAD” case, but the proposed detection (`git rev-list --quiet <brief-sha>` or unknown-revision failures from `git diff`) only verifies that the SHA exists as a revision; it does not prove it is an ancestor/reachable from `HEAD`. If the brief SHA exists on another local branch, `git diff <brief-sha>..HEAD` can succeed and the classifier may treat unrelated changes as workflow-only drift, bypassing the required uninspectable `(c)`/`(x)` checkpoint. Add an explicit ancestry check such as `git merge-base --is-ancestor <brief-sha> HEAD` before enumeration and route non-ancestors to sub-case B.

#### Minor (Nice to Have)

- `agent/skills/generate-plan/SKILL.md:36` says the shared allowlist is the single source of truth and not to inline the four entries, but the workflow-drift message at `agent/skills/generate-plan/SKILL.md:50` hard-codes the four prefixes. Consider wording the message generically or instructing consumers to render the current shared allowlist so future allowlist changes cannot make the user-facing text stale.

### Recommendations

- Validate SHA format and commit existence first, then explicitly verify ancestry from the brief SHA to `HEAD` before running `git diff --name-only -z`.
- Keep the workflow-drift message tied to the shared allowlist rather than duplicating the prefix list in `generate-plan/SKILL.md`.
