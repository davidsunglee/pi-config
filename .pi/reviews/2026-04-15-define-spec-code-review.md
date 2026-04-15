# define-spec Feature Code Review

**Range:** 60f9b7a..ff68046
**Date:** 2026-04-15
**Reviewer:** opus-4.6

## Verdict

**[Approved]**

## Strengths

- **Clean provenance chain.** The field names and prefixes are consistent end-to-end: define-spec writes `Source: TODO-<id>` and `Scout brief: .pi/briefs/<name>` in the spec preamble; generate-plan Step 1 parses those exact prefixes; Step 3 fills `{SOURCE_TODO}`, `{SOURCE_SPEC}`, `{SOURCE_BRIEF}` with `Source todo:`, `Source spec:`, `Scout brief:` prefixes respectively; planner.md looks for those exact prefixed lines. No mismatches.

- **Graceful degradation.** Every optional input (scout brief, todo ID, spec provenance) has explicit "omit/skip/empty string" handling. The skill works with any combination: todo-only, freeform-only, todo+scout, todo+scout+spec. The missing-brief warning in generate-plan Step 1 is well-specified.

- **Clear separation of concerns.** define-spec captures *what* and *why*; the planner decides *how*. The SKILL.md explicitly forbids prescribing architecture and redirects user design decisions into requirements/constraints. This is well-articulated in both the spec and the skill.

- **Consistent pipeline UX.** The continuation pattern (write artifact, offer to invoke next stage) is now uniform: define-spec offers generate-plan, generate-plan offers execute-plan. The Step 5 change in generate-plan is a natural extension of the define-spec handoff pattern.

- **Preamble parsing scope.** The "parse only between `# Title` and first `## ` heading, ignore code blocks and later content" rule prevents false matches against the spec's own format examples (which contain `Source: TODO-<id>` inside fenced code blocks).

- **Thorough edge cases.** define-spec handles: todo not found, scout brief missing, `.pi/specs/` missing, user skipping questions. All are specified with concrete behaviors.

## Issues

### Critical

(none)

### Important

1. **Provenance fields positioned under File Structure in planner.md, not Header.**
   The three provenance fields (Source, Spec, Scout brief) are placed at the end of "#### 2. File Structure" in planner.md (lines 55-57), between the file listing design principles and "#### 3. Tasks". These are plan-level metadata describing lineage, not file structure information. They logically belong in "#### 1. Header" alongside Goal, Architecture summary, and Tech stack. The actual plan output for this feature (`.pi/plans/2026-04-15-define-spec.md`) correctly places Source in the header area, which means the planner is interpreting intent over position -- but this is fragile. A different model or a less capable tier might place Spec and Scout brief under the File Structure heading, producing an oddly structured plan.

   **Recommendation:** Move the three provenance field instructions from after the File Structure design principles to after the Tech stack bullet in the Header section.

### Minor

1. **README `.pi/` directory listing does not include `specs/`.**
   The repository layout tree in README.md (lines 28-31) lists `.pi/` with `plans/`, `reviews/`, and `todos/`, but omits `specs/`. Since define-spec writes artifacts to `.pi/specs/` and the directory already exists on disk, this should be reflected in the layout documentation.

2. **README "Tracked workflow state" description omits specs.**
   Line 16 says `.pi/` contains "todos, plans, reviews" but should now include "specs" as well.

3. **README skill ordering: define-spec placed in utility group rather than workflow group.**
   The README skills are organized by workflow stage (generate-plan, execute-plan, refine-code, requesting/receiving-code-review) followed by utility skills (commit, TDD, debugging, etc.). define-spec is placed after commit in the utility group, but it is arguably a workflow skill that sits upstream of generate-plan in the pipeline. Consider placing it before generate-plan to reflect the `define-spec -> generate-plan -> execute-plan` flow. This is a stylistic preference, not a correctness issue.

4. **Empty placeholder lines in rendered prompt template.**
   When `{SOURCE_TODO}`, `{SOURCE_SPEC}`, and `{SOURCE_BRIEF}` all resolve to empty strings (e.g., freeform input with no provenance), the rendered prompt will have several consecutive blank lines between `{TASK_DESCRIPTION}` and `## Output`. This is harmless and consistent with the pre-existing `{SOURCE_TODO}` behavior, but three consecutive blank lines is slightly messier than one. No action required unless a future cleanup pass addresses this.

## Summary

The feature is well-designed and internally consistent. The provenance chain flows correctly from define-spec through generate-plan to the planner, with matching field names and prefix strings at every handoff point. The define-spec skill itself is clear, complete, and handles all edge cases. The cross-suite modifications to generate-plan (provenance extraction, placeholder updates, continuation offer) integrate cleanly with the existing skill steps.

The one important finding is the placement of provenance field instructions under File Structure rather than Header in planner.md -- this works today because the planner interprets intent, but the instruction positioning is misleading and could cause misplacement of these fields in future plans. The minor findings are all README documentation gaps that should be addressed in a follow-up.

Overall: solid feature, clean implementation, approved for merge.
