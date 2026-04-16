# Footer Information Architecture Refresh

Source: TODO-ec733a5b

## Goal

Refine the custom footer so its layout, grouping, visibility priorities, and theming better match the information users need while working. The footer should more clearly separate project identity, session identity and metrics, and execution mode, while preserving critical operational signals such as context usage.

## Context

The project replaces pi's built-in footer with a custom implementation in `agent/extensions/footer.ts`. That extension currently renders line 1 as working directory, git branch, and session name, and line 2 as session token totals, cost, context usage, and model information. Theme-specific footer styling is controlled through `THEME_COLORS` in the same file, with fallback to theme tokens. The current implementation already supports independent colors for several footer fields, computes session totals from assistant-message usage in the current session, and renders provider/model/thinking together on the right side of line 2.

Project docs (`README.md`) describe the footer as showing cwd, branch, session name, token and cost stats, context usage, current model/provider, and thinking level. Pi's extension API exposes custom footer rendering, widgets, and related UI hooks, but exploration did not find an API for writing directly into the prompt bar/editor chrome, so the footer redesign should be expressed within the existing footer surface.

## Requirements

- The footer must be reorganized into two semantic rows:
  - Row 1: project identity on the left (`cwd` and git branch) and session identity on the right (session name, when set)
  - Row 2: execution mode on the left (provider, model name, thinking level) and session metrics on the right (context usage, tokens, cost, auto-compact indicator)
- The session metrics cluster on row 2 right must appear in this order: context usage, tokens, cost/subscription indicator, auto-compact indicator
- Context usage must appear before tokens and cost
- Session name must remain in the footer rather than moving into the prompt bar or prompt editor area
- The cost field's subscription sub-indicator must be independently theme-configurable from the main cost value so themes can style or dim it separately
- Narrow-width behavior must follow this visibility priority, highest to lowest:
  1. context usage
  2. model name
  3. thinking level
  4. cwd
  5. git branch
  6. session name
  7. context window size denominator (and `/` separator)
  8. model provider
  9. tokens up/down together, including arrows
  10. cost plus subscription indicator together
  11. auto-compact indicator
- The context window size denominator must behave as a single display unit with the `/` separator; if the denominator is hidden, the `/` separator must also be hidden
- Tokens up/down must behave as a single display unit; the values and arrows appear together or disappear together
- Cost and subscription indicator must behave as a single display unit; they appear together or disappear together
- `cwd` may truncate when space is tight, and truncation should preserve the end of the path rather than the beginning where feasible
- Git branch must be shown as an all-or-nothing unit rather than partially truncated
- Session name must be shown as an all-or-nothing unit rather than partially truncated
- When no session name is set, the footer should simply omit that field rather than reserving placeholder space

## Constraints

- The redesign should stay within the custom footer surface already supported by pi's extension API
- The layout should preserve the distinction between identity information, execution-mode information, and session telemetry instead of mixing those concepts arbitrarily across rows
- Visibility and truncation behavior should operate on meaningful display units, not leave behind orphaned punctuation, separators, or partial labels that become misleading
- The solution must continue to work with existing theme override patterns in `agent/extensions/footer.ts` and existing project themes under `agent/themes/`

## Acceptance Criteria

- The footer renders row 1 as project identity on the left and session identity on the right, with session name shown only when set
- The footer renders row 2 as execution mode on the left and session metrics on the right
- On sufficiently wide terminals, the row 2 metrics cluster appears in order: context usage, tokens, cost/subscription, auto-compact indicator
- The cost subscription sub-indicator can be styled independently through footer theme overrides
- On narrow terminals, footer fields disappear according to the agreed priority order, with grouped units disappearing together where specified
- `cwd` truncation preserves the tail of the path, while git branch and session name are either fully shown or fully hidden
- The footer never leaves behind orphaned separators such as a standalone `/`, token arrows without values, or a detached subscription indicator
- The session name remains in the footer and is not moved to a prompt-bar or prompt-editor location

## Non-Goals

- Moving the session name into the prompt bar or editor chrome
- Redesigning the built-in pi footer outside this project's custom footer extension
- Changing the meaning of the reported metrics, session accounting, or context usage calculations
- Expanding the footer with new categories of data beyond the layout and theming refinements described above
