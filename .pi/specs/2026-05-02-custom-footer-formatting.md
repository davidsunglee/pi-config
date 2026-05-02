# Custom Footer Formatting Updates

Source: TODO-02899e6c

## Goal

Update the custom pi footer so the second-row metrics are cleaner and easier to scan: remove cost/subscription display entirely, rely on color instead of dot separators between data fields, tighten the context-window divider, and make the Nord model provider prefix slightly more readable without losing the subdued Nord look.

## Context

The custom footer implementation lives in `agent/extensions/footer.ts`, with behavioral coverage in `agent/extensions/footer.test.ts`. The footer currently replaces the built-in pi footer with a three-line layout:

- Row 1: working directory and git branch on the left, optional session name on the right.
- Row 2: optional provider prefix, model name, optional thinking label, then right-aligned context usage, token counts, and cost/subscription status.
- Row 3: optional extension statuses.

Today row 2 uses grey dot separators (` · `) in several places: between thinking and model metadata, between right-side metrics such as context/tokens/cost, and between row-1 path and branch. The requested separator change is scoped to footer fields/metrics; the row-1 path/branch separator is existing project-identity punctuation and is not part of the requested cost/token/context field cleanup unless implementation planning finds it must change for consistency.

The existing code already has width-degradation logic in `computeVisibility`: low-priority fields are hidden as width shrinks, with model name and context percentage treated as highest-priority row-2 content. Cost and subscription are represented by `FooterColors.cost`, `FooterColors.subscriptionIndicator`, `FieldWidths.costWidth`, `VisibilityFlags.showCost`, `getCostDisplay`, and `buildCostString`. Metric separator width is represented by `METRIC_SEP_WIDTH`, and right-side metric joining is centralized in `joinMetrics`. The context denominator is centralized in `formatContextDenominator`, which currently renders spaces around the slash. The Nord theme palette is defined in `agent/themes/nord.json`; the custom footer also has a Nord override block in `THEME_COLORS`.

## Requirements

1. The custom footer no longer renders cost information on row 2 in any form.
   - Dollar amount output is removed.
   - Subscription-only or OAuth markers such as `(sub)` are removed.
   - The separator that previously appeared only because cost/subscription followed the token metric is removed with the cost field.
2. Cost/subscription removal is reflected in the footer behavior, not merely hidden by color.
   - Narrow-width priority logic should not reserve width for cost or subscription.
   - Tests and helper expectations should no longer treat cost/subscription as a live built-in footer field.
3. The model provider prefix uses a slightly lighter Nord-palette color than the current dim rendering when the Nord theme is active.
   - The chosen color is Nord `nord3` (`#4c566a`).
   - The provider should remain visually subdued relative to the model name, not promoted to the same emphasis as the model.
4. The context usage denominator renders without spaces around the divider between percentage and max context-window size.
   - The visible format changes from `NN.N% / WINDOW` to `NN.N%/WINDOW`.
   - The divider remains punctuation/symbol-colored, while the percentage and context-window size keep their existing field colors and escalation behavior.
5. Dot separators between row-2 fields/metrics are replaced with a single literal space.
   - This applies to the separators between the right-side row-2 metrics, such as context usage and token counts.
   - This applies to any row-2 separator between the model/thinking cluster fields if that separator is still present after implementation.
   - Missing optional fields must not create doubled spaces, leading spaces, trailing spaces, or dead separator artifacts.
6. Existing color distinctions remain the primary way to identify row-2 fields after dot separators are removed.
   - Context usage, context-window size, token symbols/values, model name, provider, and thinking label retain distinguishable colors according to the active theme/override behavior.
   - Non-Nord theme behavior should not be unnecessarily redesigned beyond the separator and cost-removal requirements.
7. Footer fields continue to degrade gracefully as terminal width shrinks.
   - No row exceeds the provided render width in normal and narrow terminal cases.
   - Optional row-2 fields still disappear in priority order when needed.
   - The always-high-priority row-2 information remains model name plus context percentage, subject only to the existing last-resort truncation behavior when the terminal is extremely narrow.

## Constraints

- Keep the change focused on the custom footer extension and its tests; do not redesign unrelated extensions, theme files, or pi core behavior.
- Use only colors from the existing Nord palette for the Nord provider color change. The selected provider color is `nord3` / `#4c566a`.
- Do not remove the context usage escalation colors: usage above 90% still uses the error color, usage above 70% still uses the warning color, and lower usage uses the configured context usage color.
- Do not remove token input/output arrows or token values; only remove dot separators around fields and remove cost/subscription display.
- Do not introduce a user-facing configuration migration unless implementation discovers that existing exported types require compatibility handling. If compatibility fields remain for user config, they must not imply that built-in rendering still shows cost/subscription.
- Preserve the existing optional third-line extension status behavior.

## Acceptance Criteria

- With a wide terminal and nonzero usage data, row 2 includes provider/model/thinking as applicable, context usage, and token counts, but includes no dollar amount and no `(sub)` marker.
- When the model uses subscription/OAuth and total cost is zero, the footer still renders no `(sub)` marker.
- When total cost is nonzero, the footer still renders no cost amount.
- The visible context denominator is formatted like `42.0%/200k`, with no spaces around `/`.
- Row-2 field/metric separators are single spaces rather than dot separators; there are no ` · ` separators between row-2 fields.
- Optional missing row-2 fields do not create doubled spaces, leading spaces, trailing spaces, or blank/dead separators.
- Under the Nord theme, the provider prefix renders with Nord `nord3` (`#4c566a`) or the theme-token/override equivalent that resolves to that color, while the model name remains visually distinct.
- Width-degradation tests cover at least: wide layout, removal of cost from width budgeting, context denominator as a unit, token dropping, provider dropping, and an extremely narrow fallback.
- Existing tests for row-1 truncation/session/branch behavior and row-3 extension statuses continue to pass or are updated only to reflect intentionally changed row-2 formatting.
- `npm test` in `agent/` passes after the footer changes.
- `npm run build` or `npm run check` in `agent/` passes after the footer changes.

## Non-Goals

- Changing the built-in pi footer.
- Changing the meaning or collection of token usage, context usage, model id, provider id, thinking level, git branch, session name, or extension statuses.
- Redesigning the entire footer layout or adding new footer fields.
- Adding new theme palettes or changing Nord colors outside the provider-prefix choice required here.
- Changing row-1 project identity behavior except where tests need to account for existing truncation behavior.
- Changing how extension status lines are sorted, sanitized, or truncated.
