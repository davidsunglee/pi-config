# Code Review: Footer Information Architecture Refresh
## Iteration 1 — Full Review (v1)

**Base:** 353fe5790468af851f6510ce33be359b5283c893
**Head:** 3232c6cca0078ba1315f7b0d612f3888bef3a303
**Reviewer model:** openai-codex/gpt-5.4

---

### Strengths

The implementation is well-executed overall. The global priority-drop system is cleanly structured as a sequential flag-mutation loop that reads naturally and matches the spec priority table exactly. The `row1CanFitWithCurrentFlags()` function correctly embeds cwd truncation as a non-drop step, preventing long paths from triggering unnecessary field removals on row 2. The new `truncatePwdTail()` helper is well-documented with a clear contract: it never makes the branch-visibility decision itself and treats branch as all-or-nothing. The `FooterColors` type is properly extended to 12 keys, all three `THEME_COLORS` entries include `subscriptionIndicator`, and `DEFAULT_TOKENS` is consistent. The JSDoc header accurately reflects the new two-row layout. All 11 tests pass, and footer.ts has no TypeScript errors.

---

### Issues

#### Critical (Must Fix)

None.

---

#### Important (Should Fix)

**1. Provider always shown on wide terminals — behavioral regression from baseline**

File: `agent/extensions/footer.ts`, line 370

The old code (baseline commit `353fe57`) only showed the provider prefix when `footerData.getAvailableProviderCount() > 1`. The new code always builds `providerPrefix` when a model exists, unconditionally. On a single-provider setup, users will now see `(anthropic) claude-sonnet` where they previously saw only `claude-sonnet`. This is a behavioral change not described in the spec or plan.

The spec says "provider remains part of the normal wide-layout execution-mode cluster and is only hidden by Task 4's narrow-width priority logic." That describes hiding behavior, not whether to show it in the first place. The old single-provider suppression was a separate visibility rule that has been silently dropped.

**Fix:** Restore the count check (`footerData.getAvailableProviderCount() > 1`) as the gating condition for building `providerPrefix`, or add a clear comment documenting that showing provider on single-provider setups is intentional.

---

**2. Dead code: `cache` field in `FooterColors`, `DEFAULT_TOKENS`, and `THEME_COLORS` is never used**

File: `agent/extensions/footer.ts`, lines 50, 68, 82, 96, 114

The `cache` key remains in `FooterColors`, `DEFAULT_TOKENS`, and all three `THEME_COLORS` entries, but `colorize("cache", ...)` is never called anywhere in the render path. The cache-read/write accumulation (`totalCacheRead`, `totalCacheWrite`) and cache stat display were intentionally removed (the commented-out block confirms this). However the `cache` type field and its theme values are still present, giving users and future maintainers the impression that cache coloring is live.

Task 5 acceptance criteria states "no dead code from the original layout remains." This fails that criterion.

**Fix:** Remove `cache` from `FooterColors`, `DEFAULT_TOKENS`, and all three `THEME_COLORS` entries, or reinstate the cache display. If cache display is intentionally deferred, document that explicitly.

---

**3. Test infrastructure: `createMocks`, `stripAnsi`, `MockOptions`, and the full mock object graph are defined but never called**

File: `agent/extensions/footer.test.ts`, lines 17–126

The test file defines a `createMocks()` function, a `MockOptions` interface, a `stripAnsi()` helper, mock objects for `ctx`, `theme`, `footerData`, and `pi`, and even comments about a `SettingsManager` challenge — but none of this scaffolding is ever used. All 11 actual tests go directly to the reimplemented `computeVisibility()` logic. This creates several problems: the dead scaffolding implies integration-level testing exists when it does not; it clutters the file with ~90 lines that have no effect; and the `visibleWidth` import from `@mariozechner/pi-tui` on line 3 is only used in the dead mock code path, making the import itself dead weight.

**Fix:** Remove the unused scaffolding (`createMocks`, `stripAnsi`, `MockOptions`, mock object graph). The comment at line 129 explaining why integration tests are not feasible is the honest explanation — keep that, remove the dead infrastructure above it.

---

#### Minor (Nice to Have)

**4. `tailTruncate` uses `String.prototype.length` (code units) rather than column width**

File: `agent/extensions/footer.ts`, lines 306–309

`tailTruncate` slices on `text.length` (UTF-16 code units), but `maxWidth` is a terminal column count. For paths containing multi-byte characters (e.g., emoji), the result can be a string that occupies fewer columns than `maxWidth`. Rewrite to use `[...text]` for code point iteration.

**5. `contextUsage?.percent !== null` check evaluates to `true` when `contextUsage` is `undefined`** (pre-existing, not introduced here)

File: `agent/extensions/footer.ts`, line 382

When `getContextUsage()` returns `undefined`, `contextUsage?.percent` is `undefined`, and `undefined !== null` is `true`, so `contextPercent` becomes `"0.0"` instead of `"?"`. Pre-existing bug; worth a separate fix.

**6. Row 2 last-resort fallback drops model name at extreme terminal widths** (cosmetic only, ≤8 cols)

File: `agent/extensions/footer.ts`, line 610

At terminal widths ≤ ~8 columns, the `availForLeft ≤ 0` branch emits only the right side, violating the "model name never hidden" spec rule. Cosmetic edge case at unusable widths.

---

### Recommendations

1. Restore `getAvailableProviderCount() > 1` gating for provider prefix, or document the intent change.
2. Remove the `cache` field from type and all theme maps to satisfy Task 5 no-dead-code criterion.
3. Delete unused test scaffolding from `footer.test.ts`.
4. Use `[...text]` in `tailTruncate` for surrogate-pair safety.

---

### Assessment

**Ready to merge: With fixes**

**Reasoning:** The core implementation — two-row layout, priority-based visibility dropping, `subscriptionIndicator` independence, dot-separator formatting, and tail-preserving cwd truncation — correctly implements the spec and all tests pass. However, the silent removal of the single-provider gating is an undocumented behavioral change affecting all single-provider users, and the `cache` dead code directly violates the Task 5 acceptance criterion. Both should be resolved before merging.

---

## Remediation Log

### Iteration 1

**Batched findings for remediation:**
- Important #1: Provider always shown on wide terminals (behavioral regression)
- Important #2: Dead `cache` field in type/theme maps
- Important #3: Dead test scaffolding in footer.test.ts

**Status:** Committed as e21d5d840aee4099739dc07c0ade40ffc82cfa24

**Fixed:**
- Important #1: Restored `getAvailableProviderCount() > 1` guard on `providerPrefix`
- Important #2: Removed `cache` field from `FooterColors`, `DEFAULT_TOKENS`, and all three `THEME_COLORS` entries
- Important #3: Removed dead `createMocks()`, `MockOptions`, `stripAnsi()`, and `visibleWidth` import from `footer.test.ts`

**Deferred (Minor):**
- Minor #4: `tailTruncate` code-unit vs column-width issue (low priority edge case)
- Minor #5: Pre-existing `contextUsage?.percent !== null` bug (pre-existing, separate fix)
- Minor #6: Extreme narrow-width last resort (cosmetic, ≤8 cols)

**Proceeding to:** Hybrid re-review (Iteration 2)

---

### Iteration 2 — Hybrid Re-Review

**PREV_HEAD:** 3232c6cca0078ba1315f7b0d612f3888bef3a303
**NEW_HEAD:** e21d5d840aee4099739dc07c0ade40ffc82cfa24
**Reviewer model:** anthropic/claude-sonnet-4-6

**Result:** Ready to merge: Yes — all 3 Important findings from Iteration 1 confirmed fixed.

---

### Final Verification (Pass 1)

**Base:** 353fe5790468af851f6510ce33be359b5283c893
**Head:** e21d5d840aee4099739dc07c0ade40ffc82cfa24
**Reviewer model:** openai-codex/gpt-5.4

**Result:** Ready to merge: Yes — but flagged 1 Important issue:
- **Important:** Test reimplementation divergence — tests copy the priority-drop logic instead of importing from production

**Remediation (Iteration 2 patch):** Committed 7ccbf4... — extracted `computeVisibility()` as exported pure function; tests now import and call production code; all 11 tests pass.

**Proceeding to:** Final Verification (Pass 2)

---

### Final Verification (Pass 2)

**Base:** 353fe5790468af851f6510ce33be359b5283c893
**Head:** 7ccbf49411510e0e1c84e4eb0297d60f44c46869
**Reviewer model:** openai-codex/gpt-5.4

**Result:** Ready to merge: Yes — no Critical or Important issues.

**Minor findings (deferred):**
- Minor: Stale "Task 4" planning notation in production JSDoc comments (footer.ts:353,355,393,469)
- Minor: `tailTruncate` uses code-unit count instead of visual column width (footer.ts:405-408) — pre-existing edge case
- Minor: Conditional guard in cross-row priority test can silently do nothing (footer.test.ts:218-222)
- Minor: No inline comment explaining contextDenomStr space removal (footer.ts:540-541)

---

**Result: Clean after 2 iterations.**
