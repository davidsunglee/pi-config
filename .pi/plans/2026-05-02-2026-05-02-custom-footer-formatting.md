# Custom Footer Formatting Updates

**Goal:** Update the custom pi footer extension so that row 2 (a) drops the cost/subscription indicator entirely, (b) uses a single literal space instead of grey-dot separators between fields/metrics, (c) renders the context denominator with `%/window` (no spaces around the slash), and (d) renders the model provider prefix in Nord `nord3` (`#4c566a`) when the Nord theme is active. Width-degradation must continue to work: optional fields drop in priority order as terminal width shrinks, and model name + context percent are never hidden except under last-resort truncation.

**Architecture summary:** All behavior changes live in `agent/extensions/footer.ts` — a single pi extension built around a pure helper layer (column-width measurement, cost/denominator/metric formatting, priority dropper) and the render closure invoked by pi for each frame. `agent/extensions/footer.test.ts` exercises the pure helpers and `computeVisibility` directly. Rendering is centralized in the closure inside the default extension factory: row 1 is `~/cwd · branch    session`, row 2 is `provider model thinking    metrics-block`, row 3 (optional) is the joined extension statuses. The change is contained to those two files plus the Nord-specific override block in `THEME_COLORS`. No theme JSON changes are needed — `nord.json` is read for context only.

**Tech stack:** TypeScript (NodeNext, strict, `noEmit`), Node `--experimental-strip-types --test` runner, ESLint, pi extension API (`@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`, `@mariozechner/pi-ai`).

**Source:** TODO-02899e6c
**Spec:** `.pi/specs/2026-05-02-custom-footer-formatting.md`

## File Structure

- `agent/extensions/footer.ts` (Modify) — Remove cost/subscription rendering, types, helpers, and width budgeting; switch row-2 metric and thinking separator from ` · ` (3-char dot separator) to a single literal space; switch `formatContextDenominator` to `"/"` without surrounding spaces; add a configurable `provider` color field with a Nord override resolving to `#4c566a`; export `THEME_COLORS` and `DEFAULT_TOKENS` so a unit test can assert override values; update top-of-file documentation to reflect the new layout and provider configurability.
- `agent/extensions/footer.test.ts` (Modify) — Drop cost/subscription tests, update the shared `fw()` helper, retarget metric-width and dropping tests to the new 1-char separator and bare-slash denominator format, add an explicit cross-row priority test (tokens drop before session name), add an extremely-narrow-fallback test, and add a Nord-override unit test that asserts `THEME_COLORS.nord.provider === "#4c566a"` and `DEFAULT_TOKENS.provider === "dim"`.

## Tasks

### Task 1: Remove cost and subscription rendering from row 2

**Files:**
- Modify: `agent/extensions/footer.ts`
- Modify: `agent/extensions/footer.test.ts`

**Steps:**

- [ ] **Step 1.1: Remove cost-related fields from FooterColors** — In `agent/extensions/footer.ts`, delete the `cost: string | number;` and the `subscriptionIndicator: string | number;` properties (and the JSDoc above `subscriptionIndicator`) from the `FooterColors` type alias (around lines 48–65). Update the file-top docstring example block (around lines 32–36) so the example no longer includes `cost: "..."`; replace it with an example using `branch`/`modelName` instead (e.g. `dracula: { modelName: "magenta", branch: "brightCyan" }`). Update the `Layout:` block (around lines 9–15) so the row-2 description no longer ends in `· $cost (sub)`; the new line reads exactly: `Line 2: provider model · thinking    context% / window · ↑in ↓out` (the separator change to a single space happens in Task 2; leave the dot here for now).
- [ ] **Step 1.2: Remove cost from FieldWidths and VisibilityFlags** — Delete the `costWidth: number;` and `hasCost: boolean;` lines from `interface FieldWidths` (around lines 71–91). Delete the `showCost: boolean;` line from `interface VisibilityFlags` (around lines 94–102).
- [ ] **Step 1.3: Remove cost branches in computeVisibility** — In `computeVisibility` (around lines 112–177): delete the line `let showCost = f.hasCost;`; in `row2Needed()` delete the line `if (showCost && f.costWidth) rightParts.push(f.costWidth);`; delete the line `if (!bothFit() && showCost) showCost = false;`; remove the `showCost,` field from the returned object literal.
- [ ] **Step 1.4: Remove cost helpers and theme entries** — Delete `getCostDisplay` and its JSDoc (around lines 390–402). Delete `buildCostString` and its JSDoc (around lines 422–440). Delete the `cost: ...` and `subscriptionIndicator: ...` entries from each block in `THEME_COLORS` (carbonfox at lines 184–185, everblush at lines 197–198, nord at lines 211–212). Delete the `cost: "warning",` and `subscriptionIndicator: "dim",` lines from `DEFAULT_TOKENS` (around lines 228–229).
- [ ] **Step 1.5: Remove cost from the render closure** — In the render closure (around lines 540–814): delete the `let totalCost = 0;` declaration and the `totalCost += m.usage.cost.total;` line inside the `for (const entry of ctx.sessionManager.getEntries())` loop. Delete the entire `// Cost + subscription` block including `const usingSubscription = ctx.model ? ctx.modelRegistry.isUsingOAuth(ctx.model) : false;`. Delete the `const { amountLabel: costAmountLabel, subscriptionLabel } = getCostDisplay(...)` destructure, the `const costStr = buildCostString(...)` line, and the `const costWidth = costStr ? visibleWidth(costStr) : 0;` line. In the `computeVisibility({ ... })` argument object, delete the `costWidth,` and `hasCost: !!(totalCost || usingSubscription),` entries. In the destructure `const { showCost, showTokens, ... } = flags;` remove `showCost,`. Delete the line `if (showCost && costStr) metricsFinal.push(costStr);`.
- [ ] **Step 1.6: Update test imports** — In `agent/extensions/footer.test.ts`, remove `buildCostString,` and `getCostDisplay,` from the import list at the top of the file (lines 5–14). Leave the other imports (`computeVisibility`, `formatContextDenominator`, `getProviderPrefix`, `getThinkingLabel`, `joinMetrics`, `sanitizeStatusTexts`, `type FieldWidths`, `footerFactory`) untouched.
- [ ] **Step 1.7: Update the shared fw() helper** — In `fw()` (around lines 35–57), delete `costWidth: 0,` and `hasCost: false,` from the `base` object so callers cannot reference them. The helper retains every other field unchanged.
- [ ] **Step 1.8: Update or delete cost-specific tests** — Delete the test `"priority order: cost drops first"` (lines 81–97) entirely. Delete the test `"subscription-only sessions omit dead zero-dollar cost"` (lines 227–240) entirely. Delete the test `"cost string colors both amount and subscription label with cost color"` (lines 257–271) entirely. Delete the test `"cross-row priority: row-2 cost drops before row-1 session name"` (lines 185–201) entirely; it is replaced by Step 1.9.
- [ ] **Step 1.9: Add a tokens-vs-session-name cross-row priority test** — Add a new test `test("cross-row priority: row-2 tokens drop before row-1 session name", () => { ... })` to `agent/extensions/footer.test.ts`. Use these field widths: `pwdStrWidth: 20, branchWidth: 9, sessionNameWidth: 15, modelNameWidth: 14, contextPercentWidth: 6, contextDenomWidth: 8, tokensWidth: 14, hasBranch: true, hasSessionName: true, hasTokens: true`. Comment that with the current 3-char ` · ` separator, row 2 with tokens needs `14 + 2 + (6 + 8) + 14 + 3 = 47`. Pass `width: 46` (one under the with-tokens threshold). Assert: `assert.ok(!flags.showTokens, "tokens should drop");` and `assert.ok(flags.showSessionName, "session name should survive (higher priority)");`. (Task 2 will retighten the math when the separator drops to 1 char.)
- [ ] **Step 1.10: Update remaining tests to drop cost references** — In `"wide terminal: all live fields visible"` (lines 61–79): remove `costWidth: 8,` from the field overrides, remove `hasCost: true,` from the field overrides, and remove the line `assert.ok(flags.showCost);`. Update the comment `// 14 + 12 + 12 + 2 + (6 + 8) + 14 + 8 + 2 separators = 82` if any remains in this test. In `"tokens drop as a single unit (both arrows + values)"` (lines 99–114): the test already excludes cost via `hasCost: false, costWidth: 0`; just remove those two keys (since they no longer exist on `FieldWidths`) and leave the rest. The comment math `14 + 12 + 2 + (6 + 8) + 14 + 1 separator = 59` already represents a no-cost run; leave it as is for now (Task 2 updates the separator math). In `"long cwd does NOT cause row-2 fields to drop when truncation suffices"` (lines 157–172): remove `costWidth: 8,`, remove `hasCost: true,`, and remove the `assert.ok(flags.showCost, ...)` line. Update the comment `// Row 2 full need: 14 + 12 + 2 + (6 + 8) + 14 + 8 + 2*3 sep = 70` to read `// Row 2 full need: 14 + 12 + 2 + (6 + 8) + 14 + 1*3 sep = 59` (cost gone, two metrics, one separator). The `width = 72` value still safely exceeds row 2 needs, so keep it. In `"model name and context percent are never hidden"` (lines 143–155): remove `costWidth: 8,` and `hasCost: true,`. In `"row 2 width budget accounts for 3-char ' · ' metric separators"` (lines 288–307): remove `costWidth: 8,` and `hasCost: true,` from the `fields` object, remove the lines `assert.ok(fits.showCost, "cost should fit exactly at width 70");` and `assert.ok(!justUnder.showCost, "cost should drop when row 2 needs 70 but width is 69");`. Recompute the budget without cost (two metrics ctx + tokens, one 3-char separator): `14 + 12 + 2 + (6 + 8) + 14 + 1*3 = 59`; change `fw(70, fields)` to `fw(59, fields)`, change `fw(69, fields)` to `fw(58, fields)`, update the in-test comment block to match, and replace the surviving assertions with `assert.ok(fits.showTokens, "tokens should fit exactly at width 59");` and `assert.ok(!justUnder.showTokens, "tokens should drop when row 2 needs 59 but width is 58");`.
- [ ] **Step 1.11: Run the test suite** — From `agent/`, run `npm test` and confirm every test passes with cost/subscription removed.

**Acceptance criteria:**

- The `FooterColors`, `FieldWidths`, and `VisibilityFlags` types in `agent/extensions/footer.ts` no longer contain any cost-related keys.
  Verify: open `agent/extensions/footer.ts` and confirm the `FooterColors` type alias (around line 48) has no `cost` or `subscriptionIndicator` keys, `FieldWidths` (around line 71) has no `costWidth` or `hasCost` keys, and `VisibilityFlags` (around line 94) has no `showCost` key.
- No source-level rendering path can produce `$amount` or `(sub)` regardless of `totalCost` or OAuth state.
  Verify: run `grep -nE "getCostDisplay|buildCostString|usingSubscription|totalCost|isUsingOAuth|subscriptionIndicator|subscriptionLabel|amountLabel|costWidth|hasCost|showCost" agent/extensions/footer.ts` and confirm zero matches.
- The test file no longer imports or references cost helpers or cost flags.
  Verify: run `grep -nE "buildCostString|getCostDisplay|showCost|hasCost|costWidth|subscriptionLabel|amountLabel" agent/extensions/footer.test.ts` and confirm zero matches.
- The new cross-row priority test exists and the suite is green.
  Verify: open `agent/extensions/footer.test.ts` and confirm a `test("cross-row priority: row-2 tokens drop before row-1 session name", ...)` block exists with `width: 46`, asserts `!flags.showTokens` and `flags.showSessionName`. Then from `agent/`, run `npm test` and confirm exit code 0 with no failures.

**Model recommendation:** standard

---

### Task 2: Replace row-2 metric and thinking separators with a single literal space

**Files:**
- Modify: `agent/extensions/footer.ts`
- Modify: `agent/extensions/footer.test.ts`

**Steps:**

- [ ] **Step 2.1: Tighten METRIC_SEP_WIDTH** — In `agent/extensions/footer.ts`, change the exported constant `export const METRIC_SEP_WIDTH = 3;` (around line 443) to `export const METRIC_SEP_WIDTH = 1;`. Update the JSDoc immediately above it from `/** Separator width (" · ") used between adjacent row-2 metrics. */` to `/** Separator width (" ") used between adjacent row-2 metrics. */`.
- [ ] **Step 2.2: Switch joinMetrics to a single-space separator** — Replace the body of `joinMetrics` (around lines 451–459) so that `const sep = colorize("symbols", " · ");` becomes `const sep = " ";` (a single literal space; colorization is invisible on whitespace and the spec calls for a "single literal space"). Update the JSDoc above `joinMetrics` to read: `/** Join row-2 metrics with a single literal space. Empty/blank entries are skipped so a missing metric cannot produce doubled spaces, leading spaces, trailing spaces, or dead separators. */`. The first `if (present.length === 0) return "";` short-circuit and the `present.filter` call must remain unchanged so the missing-field guarantees still hold.
- [ ] **Step 2.3: Switch the thinking-cluster separator to a single literal space** — In the render closure (around lines 572–581), inside the `if (ctx.model?.reasoning) { ... }` block, replace the line `colorize("symbols", " · ") +` with `" " +` so `thinkingStr` becomes `" " + theme.getThinkingBorderColor(thinkingLevel)(thinkingLabel);`. Leave `getThinkingLabel` and the thinking-border color resolution unchanged.
- [ ] **Step 2.4: Update the file-top Layout docstring to match the new separators** — Update the row-2 line of the `Layout:` block (around line 11) from `Line 2: provider model · thinking    context% / window · ↑in ↓out` to `Line 2: provider model thinking    context%/window ↑in ↓out`. (Task 3 finalizes the slash-spacing change; pre-applying it here is acceptable — the docstring describes the final state.) Re-verify that the surrounding docstring still reads coherently.
- [ ] **Step 2.5: Update the joinMetrics test** — In `agent/extensions/footer.test.ts`, rename the test `"joinMetrics inserts grey-dot separators only between present metrics"` (around lines 273–286) to `"joinMetrics joins present metrics with a single literal space"`. Replace the assertions exactly: `joinMetrics(["A", "B", "C"], mockColorize)` → `"A B C"`; `joinMetrics(["A", "B"], mockColorize)` → `"A B"`; `joinMetrics(["A"], mockColorize)` → `"A"`; `joinMetrics([], mockColorize)` → `""`; `joinMetrics(["A", "", "C"], mockColorize)` → `"A C"`. Update the in-test comment (`// Empty entries must not produce dead separators.`) so it now reads `// Empty entries must not produce doubled spaces or dead separators.`.
- [ ] **Step 2.6: Update the row-2 width-budget test** — Rename `"row 2 width budget accounts for 3-char ' · ' metric separators"` (around lines 288–307) to `"row 2 width budget accounts for 1-char ' ' metric separators"`. Recompute the budget for two metrics (ctx + tokens) with one 1-char separator: `modelNameWidth(14) + providerWidth(12) + padding(2) + (contextPercentWidth(6) + contextDenomWidth(8)) + tokensWidth(14) + 1 separator(1) = 57`. Change the call `fw(59, fields)` to `fw(57, fields)` and `fw(58, fields)` to `fw(56, fields)`. Update the in-test comment block to read `// With 1-char separator between 2 metrics (ctx, tokens):\n//   left: modelName=14 + provider=12 = 26\n//   padding: 2\n//   right: (6 + 8) + 14 + 1*1 = 29\n//   total: 57`. Keep the surviving assertions but update their messages: `"tokens should fit exactly at width 57"` and `"tokens should drop when row 2 needs 57 but width is 56"`.
- [ ] **Step 2.7: Update the tokens-drop test math** — Update `"tokens drop as a single unit (both arrows + values)"` (around lines 99–114). With Task 2 the separator is 1 char, so `withTokens = 14 + 12 + 2 + (6 + 8) + 14 + 1 = 57`. Change `const withTokens = 59;` to `const withTokens = 57;` and update the comment `// With tokens: 14 + 12 + 2 + (6 + 8) + 14 + 1 separator = 59` to `// With tokens: 14 + 12 + 2 + (6 + 8) + 14 + 1*1 = 57`. The `fw(withTokens - 1, fields)` call automatically picks up the new 56.
- [ ] **Step 2.8: Update the long-cwd test math** — Update `"long cwd does NOT cause row-2 fields to drop when truncation suffices"` (around lines 157–172). After Task 2 the row-2 budget without cost and with 1-char separator is `14 + 12 + 2 + (6 + 8) + 14 + 1*1 = 57`. Update the comment `// Row 2 full need: 14 + 12 + 2 + (6 + 8) + 14 + 1*3 sep = 59` to `// Row 2 full need: 14 + 12 + 2 + (6 + 8) + 14 + 1*1 sep = 57`. The `width = 72` value still safely exceeds 57, so leave it unchanged.
- [ ] **Step 2.9: Update the new cross-row priority test math** — Update the test added in Step 1.9 (`"cross-row priority: row-2 tokens drop before row-1 session name"`). With the 1-char separator the with-tokens budget becomes `14 + 2 + (6 + 8) + 14 + 1 = 45`. Change `width: 46` to `width: 44` (one under). Update the explanatory comment to read: `// Row 2 with tokens: 14 + 2 + (6 + 8) + 14 + 1 = 45. Row 2 without tokens: 14 + 2 + (6 + 8) = 30. With session row 1 needs ellipsis(3) + 4 + branch(9) + padding(2) + sessionName(15) = 33 ≤ 44. So at width 44 tokens drops and session survives.`
- [ ] **Step 2.10: Run the test suite** — From `agent/`, run `npm test` and confirm every test passes with single-space separators in place.

**Acceptance criteria:**

- The exported `METRIC_SEP_WIDTH` is `1`, `joinMetrics` uses a literal `" "` between metrics, and the thinking-label cluster prefixes the label with a literal `" "` (no remaining `" · "` in row-2 generation paths).
  Verify: run `grep -nE "METRIC_SEP_WIDTH\s*=\s*1;|colorize\(\"symbols\", \" · \"\)" agent/extensions/footer.ts`. Confirm `METRIC_SEP_WIDTH = 1;` is present and that the only remaining `colorize("symbols", " · ")` calls are the row-1 cwd/branch path-and-branch separators (the two sites near lines ~636 and ~734 inside `truncatePwdTail` and the row-1 compose block); no row-2 site retains `" · "`.
- `joinMetrics` produces a single literal space between two present metrics and skips empty entries with no doubled spaces.
  Verify: open `agent/extensions/footer.test.ts` and confirm the renamed test asserts `joinMetrics(["A", "B", "C"], mockColorize) === "A B C"` and `joinMetrics(["A", "", "C"], mockColorize) === "A C"`.
- All width-degradation tests use the new separator math and pass.
  Verify: from `agent/`, run `npm test` and confirm the renamed `"row 2 width budget accounts for 1-char ' ' metric separators"` test passes at width 57 and fails at width 56 as designed; full suite exits with code 0.

**Model recommendation:** standard

---

### Task 3: Tighten context denominator (no spaces around `/`)

**Files:**
- Modify: `agent/extensions/footer.ts`
- Modify: `agent/extensions/footer.test.ts`

**Steps:**

- [ ] **Step 3.1: Drop spaces around the slash in formatContextDenominator** — In `agent/extensions/footer.ts`, edit `formatContextDenominator` (around lines 412–420). Change `colorize("symbols", " / ") +` to `colorize("symbols", "/") +`. The trailing `colorize("contextWindow", formatTokens(contextWindow))` is unchanged.
- [ ] **Step 3.2: Update the formatContextDenominator JSDoc** — Replace the JSDoc above `formatContextDenominator` (around lines 404–411) with: `/** Context denominator "/window" segment. Renders "/" (no spaces around the slash) in the symbols/punctuation color, then the formatted context window size in the contextWindow color. The slash glyph itself takes the symbols color so it stays muted relative to the percentage and the window size. */`.
- [ ] **Step 3.3: Update the row-2 denominator add-the-separator comment in computeVisibility** — In `agent/extensions/footer.ts`, find the comment block in `row2Needed()` (around line 144–146) that currently reads `// contextDenomWidth already includes the " / " separator rendered by formatContextDenominator — do NOT add the slash-separator width again here.` Update it to `// contextDenomWidth already includes the "/" rendered by formatContextDenominator — do NOT add the slash-separator width again here.`
- [ ] **Step 3.4: Update the formatContextDenominator unit test** — In `agent/extensions/footer.test.ts`, rename the test `"context denominator wraps ' / ' in symbols color (spaces around slash)"` (around lines 249–255) to `"context denominator wraps '/' in symbols color (no spaces around slash)"`. Change the assertion from `formatContextDenominator(200000, mockColorize)` returning `"[symbols: / ][contextWindow:200k]"` to returning `"[symbols:/][contextWindow:200k]"`.
- [ ] **Step 3.5: Confirm no other test hard-codes ' / ' in denominator output** — In `agent/extensions/footer.test.ts`, scan for any literal `" / "` strings that come from rendering the denominator. (The `contextDenomWidth: 8` constants used by `computeVisibility` tests are arbitrary widths — the dropper does not require them to match the actual rendered denom width; leave those numeric widths unchanged.) If any other assertion in the test file embeds the old format, update it accordingly.
- [ ] **Step 3.6: Run the test suite** — From `agent/`, run `npm test` and confirm every test passes.

**Acceptance criteria:**

- `formatContextDenominator(200000, mockColorize)` returns `"[symbols:/][contextWindow:200k]"`.
  Verify: from `agent/`, run `npm test` and confirm the renamed test `"context denominator wraps '/' in symbols color (no spaces around slash)"` is present in the output and passes.
- No remaining `" / "` literal in the footer renderer.
  Verify: run `grep -n "\" / \"" agent/extensions/footer.ts` and confirm zero matches inside footer rendering code (matches inside historical changelog/git messages do not apply because those live elsewhere).
- The full test suite passes.
  Verify: from `agent/`, run `npm test` and confirm exit code 0.

**Model recommendation:** cheap

---

### Task 4: Add a Nord-specific provider color override (nord3)

**Files:**
- Modify: `agent/extensions/footer.ts`
- Modify: `agent/extensions/footer.test.ts`

**Steps:**

- [ ] **Step 4.1: Add a configurable `provider` color field to FooterColors** — In `agent/extensions/footer.ts`, add `provider: string | number;` as a new property of the `FooterColors` type alias (around lines 48–65). Place it directly above `modelName` so providers and model are colocated. The new key participates in the existing colorize/override mechanism — no extra wiring is required.
- [ ] **Step 4.2: Add a default token for provider** — Add `provider: "dim",` as a new entry in `DEFAULT_TOKENS` (around line 225) directly above `modelName`. This preserves existing dim-tone behavior in non-Nord themes (carbonfox/everblush still resolve provider via their `dim` theme token because they have no override for `provider`).
- [ ] **Step 4.3: Add the Nord override** — In the `nord:` block of `THEME_COLORS` (around lines 208–220), add a new entry `provider: "#4c566a", // nord3 — slightly lighter than the dim token (nord2) so the prefix is readable but still subordinate to modelName`. Place the entry directly above `modelName` for readability and consistency with Step 4.2.
- [ ] **Step 4.4: Switch the render closure to colorize the provider prefix** — In the render closure (around lines 588–594), replace the assignment `const providerPrefix = providerPrefixLabel ? theme.fg("dim", providerPrefixLabel) : "";` with `const providerPrefix = providerPrefixLabel ? colorize("provider", providerPrefixLabel) : "";`. Leave `getProviderPrefix(...)`, `providerWidth = visibleWidth(providerPrefix)`, and the rest of the row-2 composition untouched. `colorize` reads `overrides[field]` first and falls back to the `DEFAULT_TOKENS` token, so non-Nord themes continue to use their `dim` token.
- [ ] **Step 4.5: Update the file-top docstring about provider color** — In `agent/extensions/footer.ts`, update the docstring block titled `── Colour configuration ──` (around lines 17–37). Replace the sentence `The modelProvider prefix is always rendered in the "dim" theme token.` with `The modelProvider prefix uses the configurable "provider" field, which falls back to the theme's "dim" token by default and is overridden to nord3 (#4c566a) in the Nord theme block.` Keep the rest of the block (notes about thinking color, named ANSI examples) unchanged. Verify the surrounding `THEME_COLORS` example block (around lines 32–36) makes sense with the new `provider` key — if the example currently shows `cost: ...`, it was already removed in Task 1; replace it with `provider: "#4c566a"` for the `nord` example to give readers a concrete pointer.
- [ ] **Step 4.6: Export THEME_COLORS and DEFAULT_TOKENS for the unit test** — In `agent/extensions/footer.ts`, add the `export` keyword to the declaration `const THEME_COLORS:` (around line 179) so the line reads `export const THEME_COLORS: Record<string, Partial<FooterColors>> = {`. Add the `export` keyword to the declaration `const DEFAULT_TOKENS:` (around line 225) so the line reads `export const DEFAULT_TOKENS: Record<keyof FooterColors, ThemeColor> = {`. Both are module-private today; exporting them is consistent with the other helper/type exports already in this file and does not change runtime behavior.
- [ ] **Step 4.7: Add the Nord override unit test** — In `agent/extensions/footer.test.ts`, extend the import block (around lines 4–14) to include `DEFAULT_TOKENS` and `THEME_COLORS` from `./footer.ts`. Add a new test exactly named `"nord theme override sets provider prefix color to nord3 (#4c566a)"`. Inside the test, assert `assert.equal(THEME_COLORS.nord?.provider, "#4c566a", "Nord override must use nord3 hex");` and `assert.equal(DEFAULT_TOKENS.provider, "dim", "default provider color must fall back to the theme's dim token");` and `assert.equal(THEME_COLORS.carbonfox?.provider, undefined, "non-Nord themes must not override provider so they keep their dim-token rendering");` and `assert.equal(THEME_COLORS.everblush?.provider, undefined, "non-Nord themes must not override provider so they keep their dim-token rendering");`.
- [ ] **Step 4.8: Run the test suite** — From `agent/`, run `npm test` and confirm every test passes, including the new Nord override test.

**Acceptance criteria:**

- `FooterColors` includes a `provider` key, `DEFAULT_TOKENS.provider` is `"dim"`, and `THEME_COLORS.nord.provider` is `"#4c566a"`.
  Verify: open `agent/extensions/footer.ts` and confirm: the `FooterColors` type alias contains `provider: string | number;`; `DEFAULT_TOKENS` contains `provider: "dim",`; the `nord` block of `THEME_COLORS` contains `provider: "#4c566a",`; both `THEME_COLORS` and `DEFAULT_TOKENS` are declared with the `export` keyword.
- The render closure resolves the provider prefix via `colorize("provider", providerPrefixLabel)` and never via `theme.fg("dim", providerPrefixLabel)`.
  Verify: run `grep -nE "colorize\(\"provider\", providerPrefixLabel\)|theme\.fg\(\"dim\", providerPrefixLabel\)" agent/extensions/footer.ts` and confirm exactly one `colorize("provider", providerPrefixLabel)` call inside the render closure and zero remaining `theme.fg("dim", providerPrefixLabel)` calls.
- The Nord override unit test passes.
  Verify: from `agent/`, run `npm test` and confirm the test `"nord theme override sets provider prefix color to nord3 (#4c566a)"` is present and passes; the suite exits with code 0.

**Model recommendation:** standard

---

### Task 5: Cover width-degradation acceptance scenarios end-to-end

**Files:**
- Modify: `agent/extensions/footer.test.ts`

**Steps:**

- [ ] **Step 5.1: Audit existing width-degradation coverage** — Open `agent/extensions/footer.test.ts` and read every test name. Confirm the spec-required scenarios are covered: (a) wide layout — `"wide terminal: all live fields visible"`; (b) removal of cost from width budgeting — implicit, since `FieldWidths` no longer accepts cost keys and the wide test no longer asserts `showCost`; (c) context denominator as a unit — `"context denominator drops as a unit with / separator"`; (d) token dropping — `"tokens drop as a single unit (both arrows + values)"`; (e) provider dropping — currently only co-asserted inside `"model name and context percent are never hidden"`; (f) extremely narrow fallback — currently only partially via `"branch drops after session name"` (which only asserts `!showBranch`).
- [ ] **Step 5.2: Add an extremely-narrow-fallback test** — Add a new test exactly named `"extremely narrow width keeps only model name and context percent"` to `agent/extensions/footer.test.ts`. Body:
  ```ts
  const flags = computeVisibility(fw(20, {
    pwdStrWidth: 30, branchWidth: 11, sessionNameWidth: 15,
    modelNameWidth: 10, thinkingWidth: 8, providerWidth: 12,
    contextPercentWidth: 6, contextDenomWidth: 5, tokensWidth: 14,
    hasBranch: true, hasSessionName: true, hasThinking: true,
    hasProvider: true, hasTokens: true,
  }));
  assert.ok(!flags.showTokens, "tokens drop");
  assert.ok(!flags.showProvider, "provider drops");
  assert.ok(!flags.showContextDenom, "context denom drops");
  assert.ok(!flags.showSessionName, "session name drops");
  assert.ok(!flags.showBranch, "branch drops");
  assert.ok(!flags.showThinking, "thinking drops");
  ```
  Width 20 only fits the `modelName(10) + padding(2) + contextPercent(6) = 18` minimum, so every droppable optional flag must be false. Model name and context percent are not gated by `VisibilityFlags` — `computeVisibility` never sets a flag for them — so their preservation is implicit.
- [ ] **Step 5.3: Add an explicit provider-only-drops test** — Add a new test exactly named `"provider drops before model name when row 2 is constrained"` to `agent/extensions/footer.test.ts`. Body:
  ```ts
  const flags = computeVisibility(fw(22, {
    pwdStrWidth: 5,
    modelNameWidth: 14, providerWidth: 12,
    contextPercentWidth: 6,
    hasProvider: true,
  }));
  assert.ok(!flags.showProvider, "provider drops first");
  // Without provider: 14 + 2 + 6 = 22, fits exactly at width 22.
  ```
  This isolates the provider-drop path from the multi-field test for clarity per spec acceptance criterion 7.
- [ ] **Step 5.4: Run the test suite and the type/lint check** — From `agent/`, run `npm test` and confirm exit code 0 with all tests (including the two new ones) passing. Then run `npm run check` (which runs `npm run build` — `npm run lint && npm run typecheck` — followed by `npm test`) and confirm exit code 0 with no lint or type errors. If `npm run check` is unavailable, run `npm run build` (lint + typecheck) explicitly.

**Acceptance criteria:**

- Test coverage exists for each of the six width-degradation scenarios called out by spec acceptance criterion 7: wide layout, cost-budget removal, context denominator as a unit, token dropping, provider dropping, extremely narrow fallback.
  Verify: from `agent/`, run `npm test 2>&1` and grep the output for the test names: `wide terminal: all live fields visible`, `tokens drop as a single unit`, `context denominator drops as a unit with / separator`, `provider drops before model name when row 2 is constrained`, `extremely narrow width keeps only model name and context percent`. Confirm each line appears as a passing test. Additionally run `grep -nE "showCost|hasCost|costWidth" agent/extensions/footer.test.ts` and confirm zero matches (the cost-budget-removal proof point).
- The new `"extremely narrow width keeps only model name and context percent"` test asserts every droppable optional flag is false at width 20.
  Verify: open `agent/extensions/footer.test.ts` and confirm the named test exists, sets the `width` argument of `fw(...)` to `20`, and contains six `assert.ok(!flags.show...)` lines covering `showTokens`, `showProvider`, `showContextDenom`, `showSessionName`, `showBranch`, `showThinking`.
- `npm test` and `npm run check` (or `npm run build`) both pass after this task.
  Verify: from `agent/`, run `npm test` and confirm exit code 0; then run `npm run check` (or `npm run build`) and confirm exit code 0 with no lint or type errors.

**Model recommendation:** cheap

## Dependencies

- Task 2 depends on: Task 1
- Task 3 depends on: Task 1, Task 2
- Task 4 depends on: Task 1
- Task 5 depends on: Task 1, Task 2, Task 3, Task 4

(Task 1 is foundational because it removes the cost type/render surface that the other tasks operate on top of. Task 2 retargets metric-separator math after the cost slot is gone. Task 3 then tightens the context denominator format, which depends on the same metric/test infrastructure. Task 4 introduces the configurable `provider` color independently of the separator/denominator changes, but it shares the same updated test file so it must follow Task 1. Task 5 is the final coverage check after every behavioral change is in place.)

## Risk Assessment

- **Risk: removing `getCostDisplay` / `buildCostString` / `FooterColors.cost` etc. silently breaks an external consumer.** Mitigation: a repository-wide grep for every cost symbol confirms the only callers are `agent/extensions/footer.ts` and `agent/extensions/footer.test.ts`; nothing else (including `session-breakdown.ts`, `context.ts`, `guardrails.ts`, theme JSON files, or pi core) imports these names. Pi extensions are dynamically loaded by file path rather than typed cross-package imports, so changing this file's exported shape cannot break consumers transitively.
- **Risk: dropping `costWidth` / `hasCost` / `showCost` from `FieldWidths` and `VisibilityFlags` breaks an in-flight branch.** Mitigation: the test file is updated in lockstep within the same task, and the helper `fw()` (and every existing test) loses the cost keys at the same time. CI sees only atomic states.
- **Risk: collapsing the metric separator from `" · "` (3 chars) to `" "` (1 char) creates dead trailing whitespace when only the context-percent metric is present.** Mitigation: `joinMetrics` already filters empty entries via `present.filter` and short-circuits on empty input. The new `joinMetrics(["A", "", "C"], ...) === "A C"` test in Task 2 explicitly asserts that empty entries cannot produce doubled spaces. Right-side padding in the render closure pads the gap between left and right sides only if the row fits; otherwise it falls through to the truncate branch.
- **Risk: switching the provider prefix color from `theme.fg("dim", ...)` to a hardcoded `#4c566a` for Nord shifts behavior under truecolor vs. 256-color modes.** Mitigation: `colorToAnsi` already handles both modes (truecolor emits `38;2;r;g;b`, 256-color emits `38;5;<index>` via `rgbTo256`); `applyColor` is the same code path the other Nord overrides use, so the new `provider` entry behaves identically to existing Nord entries (e.g., `pwd: "#d08770"`, `branch: "#a3be8c"`). Hex `#4c566a` is the same value `nord.json` uses for `borderMuted`/`muted`/`statusPath`, so the rendered color is consistent with the rest of the Nord UI.
- **Risk: an intermediate state between Tasks 1 and 2 leaves a test temporarily relying on math that does not match production.** Mitigation: every task is self-contained — Task 1 leaves the suite green at 3-char separator math (cost is gone but the separator size is unchanged), then Task 2 flips both the implementation constant and the dependent tests to 1-char in one commit. CI never sees a half-applied state because the tasks are atomic relative to `npm test`.
- **Risk: exporting `THEME_COLORS` and `DEFAULT_TOKENS` from `footer.ts` creates an unintended public API.** Mitigation: the file is a pi extension entry point, not a published package; pi loads the default export only. Adding `export` to two consts allows the test to assert configuration values without changing what pi imports at runtime.

## Test Command

```bash
npm test
```
