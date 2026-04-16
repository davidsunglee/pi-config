# Footer Information Architecture Refresh

## Goal

Reorganize the custom footer (`agent/extensions/footer.ts`) into two clearly separated semantic rows — row 1 for project and session identity, row 2 for execution mode and session metrics — while adding a priority-based narrow-width visibility system that hides fields as grouped display units without orphaning separators or punctuation. The subscription sub-indicator gets independent theme configurability, row 1 drops parentheses in favor of a dot separator for the git branch, and cwd truncation preserves the tail rather than the head.

**Source:** `TODO-ec733a5b`
**Spec:** `.pi/specs/2026-04-16-footer-information-architecture.md`

## Architecture Summary

The footer extension registers a `session_start` handler that calls `ctx.ui.setFooter()` with a render callback. The `render(width)` function builds two (optionally three) ANSI-colored lines using data from the pi extension API (`ctx.getContextUsage()`, `footerData.getGitBranch()`, `pi.getSessionName()`, `pi.getThinkingLevel()`, `ctx.model`, `ctx.sessionManager.getEntries()`, etc.). Per-theme overrides live in the `THEME_COLORS` map, falling back to `DEFAULT_TOKENS` → `theme.fg()`. Color helpers (`colorToAnsi`, `applyColor`) convert hex, ANSI-256, or named-ANSI values to escape sequences.

The redesign changes the layout and rendering logic within `render()` but does not alter the extension lifecycle, event wiring, color infrastructure, or the line-3 extension status surface. The `FooterColors` type gains one new field (`subscriptionIndicator`), and all three `THEME_COLORS` entries are updated to include it.

## Tech Stack

- TypeScript (ESM, `.ts` imports)
- pi extension API (`@mariozechner/pi-coding-agent`)
- pi TUI utilities (`@mariozechner/pi-tui`: `truncateToWidth`, `visibleWidth`)
- No test framework (the footer has no test file; verification is visual)

## File Structure

- `agent/extensions/footer.ts` (Modify) — Restructure render logic into two semantic rows, add priority-based responsive field visibility, add `subscriptionIndicator` to `FooterColors`, update `THEME_COLORS` entries and `DEFAULT_TOKENS`, replace row 1 parenthesized branch with dot-separator formatting, implement tail-preserving cwd truncation

## Tasks

### Task 1: Add `subscriptionIndicator` to `FooterColors`, `DEFAULT_TOKENS`, and all `THEME_COLORS` entries

**Files:**
- Modify: `agent/extensions/footer.ts`

**Steps:**

- [ ] **Step 1: Add the field to `FooterColors`** — Add `subscriptionIndicator: string | number;` to the `FooterColors` type, after the `cost` field. The full type after this change:
  ```typescript
  type FooterColors = {
      modelName:              string | number;
      tokens:                 string | number;
      cost:                   string | number;
      subscriptionIndicator:  string | number;
      cache:                  string | number;
      contextUsage:           string | number;
      contextWindow:          string | number;
      branch:                 string | number;
      pwd:                    string | number;
      sessionName:            string | number;
      statuses:               string | number;
      symbols:                string | number;
  };
  ```

- [ ] **Step 2: Add the default token** — Add `subscriptionIndicator: "dim"` to `DEFAULT_TOKENS`, after the `cost` entry. This maps to the same token used for the model provider label (`"dim"`), satisfying the spec requirement that the default color matches the muted gray used for provider.

- [ ] **Step 3: Update the `carbonfox` theme entry** — Add `subscriptionIndicator: "#535353"` (dimGray — matches the carbonfox `dim` var, same value as `cache`).

- [ ] **Step 4: Update the `everblush` theme entry** — Add `subscriptionIndicator: "#5c6466"` (dim gray — matches the everblush `dimGray` var).

- [ ] **Step 5: Update the `nord-dark` theme entry** — Add `subscriptionIndicator: "#4c566a"` (nord3 — matches the Nord `dim` color token).

**Acceptance criteria:**
- `FooterColors` has 12 keys
- `DEFAULT_TOKENS` has 12 entries with `subscriptionIndicator: "dim"`
- All three THEME_COLORS entries compile and include `subscriptionIndicator`
- The subscription sub-indicator color in each theme matches that theme's dim/muted gray (the same color family used for model provider)

**Model recommendation:** cheap

---

### Task 2: Restructure row 1 — project identity left, session identity right

**Files:**
- Modify: `agent/extensions/footer.ts`

**Steps:**

- [ ] **Step 1: Replace the row 1 assembly block** — Find the current row 1 block (lines 299–327 approximately, from `let pwd = ctx.cwd` through `const line1 = truncateToWidth(...)`). Replace it with a new two-sided row 1 that places project identity on the left and session name on the right.

  The new row 1 field-building logic (composition into `line1` is handled by Task 4's global priority system):

  ```typescript
  // ── Row 1: project identity (left) · session identity (right) ──

  // Build cwd with ~ substitution
  let pwdStr = ctx.cwd;
  const home = process.env.HOME ?? process.env.USERPROFILE;
  if (home && pwdStr.startsWith(home)) {
      pwdStr = `~${pwdStr.slice(home.length)}`;
  }

  // Build row 1 left: cwd · branch
  const branch = footerData.getGitBranch();
  let row1Left: string;
  if (branch) {
      row1Left =
          colorize("pwd", pwdStr) +
          colorize("symbols", " · ") +
          colorize("branch", branch);
  } else {
      row1Left = colorize("pwd", pwdStr);
  }

  // Build row 1 right: session name (only when set)
  const sessionName = pi.getSessionName();
  const row1Right = sessionName
      ? colorize("sessionName", sessionName)
      : "";

  // NOTE: Do NOT compose line1 here. The final composition of row 1
  // (including truncation and adaptive field hiding) is handled by
  // Task 4's global priority dropper, which coordinates visibility
  // across both rows using a single shared priority list.
  ```

  This removes the parenthesized branch format `(branch)`, uses a muted gray dot separator `·` (via `colorize("symbols", " · ")`), and places session name on the right side. The actual composition into `line1` is deferred to Task 4 (Steps 1-3), which needs to coordinate row 1 visibility with row 2 visibility.

- [ ] **Step 2: Add the `truncatePwdTail` helper function** — Add this function above the `export default function` line (near the other helpers). It handles cwd truncation that preserves the tail of the path, but it does **not** decide whether branch is visible. Branch visibility stays under Task 4’s explicit priority flags.

  ```typescript
  /**
   * Truncate the cwd portion of row 1 to fit within `maxWidth`,
   * preserving the tail of the path.
   *
   * Visibility policy:
   * - This helper never decides whether branch is shown.
   * - If `branch` is provided, Task 4 has already decided branch stays visible
   *   and has already verified that branch-preserving truncation can fit.
   * - If branch must be hidden, Task 4 flips `showBranch` to false before
   *   calling this helper.
   *
   * Constraints:
   * - Do not let this helper silently drop branch.
   * - Do not partially truncate branch or the ` · ` separator.
   * - Branch remains all-or-nothing; only cwd is truncated here.
   */
  function truncatePwdTail(
      pwdStr: string,
      branch: string | undefined,
      maxWidth: number,
      colorize: (field: keyof FooterColors, text: string) => string,
  ): string {
      const fullPwd = colorize("pwd", pwdStr);
      if (!branch) {
          if (visibleWidth(fullPwd) <= maxWidth) return fullPwd;

          const ellipsis = colorize("symbols", "...");
          const ellipsisWidth = visibleWidth(ellipsis);
          const availableForPwd = maxWidth - ellipsisWidth;

          if (availableForPwd >= 1) {
              return ellipsis + colorize("pwd", tailTruncate(pwdStr, availableForPwd));
          }

          return truncateToWidth(fullPwd, maxWidth, "");
      }

      const branchSuffix =
          colorize("symbols", " · ") + colorize("branch", branch);
      const fullLeft = fullPwd + branchSuffix;
      if (visibleWidth(fullLeft) <= maxWidth) return fullLeft;

      const ellipsis = colorize("symbols", "...");
      const ellipsisWidth = visibleWidth(ellipsis);
      const branchSuffixWidth = visibleWidth(branchSuffix);

      // Task 4's row1CanFitWithCurrentFlags() guarantees this branch-preserving
      // path is only used when at least 4 cwd chars can remain visible.
      const availableForPwd = maxWidth - branchSuffixWidth - ellipsisWidth;
      const truncatedPwd = tailTruncate(pwdStr, availableForPwd);

      return ellipsis + colorize("pwd", truncatedPwd) + branchSuffix;
  }

  /**
   * Return the last `maxWidth` visible characters of `text`.
   * Pure character-level tail slice — no ANSI codes expected in input.
   */
  function tailTruncate(text: string, maxWidth: number): string {
      if (text.length <= maxWidth) return text;
      return text.slice(text.length - maxWidth);
  }
  ```

  Design notes:
  - `truncatePwdTail` only truncates the cwd text; it does not make visibility decisions for session name or branch.
  - Task 4 must treat row 1 as fitting when tail truncation alone can solve the overflow, instead of dropping other fields first.
  - When branch is preserved, require enough room for `...` + at least 4 cwd characters + ` · branch`; if that cannot fit, Task 4 must drop branch explicitly before composition.

**Acceptance criteria:**
- Row 1 left shows `cwd · branch` with no parentheses
- The dot separator is colored via `colorize("symbols", " · ")`
- When no branch is set, no trailing separator appears
- Session name appears right-aligned on row 1 (only when set)
- Cwd truncation preserves the tail (end) of the path
- Cwd truncation is attempted before hiding session name or branch
- Branch is either fully shown or fully hidden (never partially truncated, and never silently dropped inside `truncatePwdTail`)
- Session name is either fully shown or fully hidden
- No orphaned dot separator when branch is hidden

**Model recommendation:** standard

---

### Task 3: Restructure row 2 — execution mode left, session metrics right

**Files:**
- Modify: `agent/extensions/footer.ts`

**Steps:**

- [ ] **Step 1: Replace the row 2 assembly block** — Find the current row 2 block (lines 329–460 approximately, from `const statsParts: string[]` through the `statsLine` composition). Replace it with a new two-sided layout that places execution mode on the left and session metrics on the right.

  The new row 2 assembly logic:

  ```typescript
  // ── Row 2 left: execution mode (provider · model · thinking) ──────

  const modelName = ctx.model?.id ?? "no-model";

  // Start with model name (always shown)
  const modelNameStr = colorize("modelName", modelName);

  // Append thinking level if model supports reasoning
  let thinkingStr = "";
  if (ctx.model?.reasoning) {
      const thinkingLevel = pi.getThinkingLevel() ?? "off";
      const thinkingLabel = thinkingLevel === "off" ? "thinking off" : thinkingLevel;
      thinkingStr =
          colorize("symbols", " · ") +
          theme.getThinkingBorderColor(thinkingLevel)(thinkingLabel);
  }

  // Always build provider when a model exists. Provider is part of the
  // normal wide-layout execution-mode cluster and only disappears under
  // narrow-width pressure via Task 4's priority logic.
  const providerPrefix = ctx.model
      ? theme.fg("dim", `(${ctx.model.provider}) `)
      : "";

  // NOTE: Do not pre-compose row2Left here. Task 4's global priority
  // dropper uses the individual components (providerPrefix, modelNameStr,
  // thinkingStr) directly, toggling each via visibility flags.

  // ── Row 2 right: session metrics ──────────────────────────────────

  const metricsParts: string[] = [];

  // 1. Context usage (always first in metrics cluster)
  const contextUsage = ctx.getContextUsage();
  const contextWindow =
      contextUsage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
  const contextPercentValue = contextUsage?.percent ?? 0;
  const contextPercent =
      contextUsage?.percent !== null ? contextPercentValue.toFixed(1) : "?";

  let contextDisplay: string;
  if (contextPercent === "?") {
      contextDisplay =
          colorize("symbols", "?") +
          colorize("symbols", "/") +
          colorize("contextWindow", formatTokens(contextWindow));
  } else {
      const pctColor =
          contextPercentValue > 90
              ? "error"
              : contextPercentValue > 70
                  ? "warning"
                  : undefined;
      const pctStr = pctColor
          ? theme.fg(pctColor, contextPercent)
          : colorize("contextUsage", contextPercent);
      const pctSuffix = pctColor
          ? theme.fg(pctColor, "%")
          : colorize("contextUsage", "%");
      contextDisplay =
          pctStr + pctSuffix +
          colorize("symbols", "/") +
          colorize("contextWindow", formatTokens(contextWindow));
  }
  metricsParts.push(contextDisplay);

  // 2. Tokens (up/down as a single unit)
  // Accumulate from all entries (same logic as before)
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheWrite = 0;
  let totalCost = 0;

  for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type === "message" && entry.message.role === "assistant") {
          const m = entry.message as AssistantMessage;
          totalInput += m.usage.input;
          totalOutput += m.usage.output;
          totalCacheRead += m.usage.cacheRead;
          totalCacheWrite += m.usage.cacheWrite;
          totalCost += m.usage.cost.total;
      }
  }

  if (totalInput || totalOutput) {
      const tokensDisplay =
          colorize("symbols", "↑") +
          colorize("tokens", formatTokens(totalInput)) +
          colorize("symbols", " ↓") +
          colorize("tokens", formatTokens(totalOutput));
      metricsParts.push(tokensDisplay);
  }

  // 3. Cost + subscription indicator (as a single unit)
  const usingSubscription = ctx.model
      ? ctx.modelRegistry.isUsingOAuth(ctx.model)
      : false;
  if (totalCost || usingSubscription) {
      const costValue = colorize("cost", `$${totalCost.toFixed(3)}`);
      const subIndicator = usingSubscription
          ? colorize("subscriptionIndicator", " (sub)")
          : "";
      metricsParts.push(costValue + subIndicator);
  }

  // 4. Auto-compact indicator (last in cluster)
  const autoCompactEnabled = SettingsManager.create().getCompactionEnabled();
  if (autoCompactEnabled) {
      metricsParts.push(colorize("symbols", "(auto)"));
  }

  // NOTE: Do NOT compose statsLine here. The final composition of row 2
  // (including adaptive field hiding) is handled by Task 4's global
  // priority dropper, which coordinates visibility across both rows
  // using a single shared priority list. The individual components
  // (providerPrefix, modelNameStr, thinkingStr, metricsParts) are
  // consumed by Task 4's priority system.
  ```

  Key changes from the current implementation:
  - Token accumulation loop is moved before the metrics assembly (was at the top of render; now positioned logically before its use in row 2)
  - The metrics order is now: context usage → tokens → cost/sub → auto-compact (was: tokens → cost → context usage)
  - Context usage no longer has spaces around the `/` separator (was ` / `, now `/`) — tighter formatting
  - The `(sub)` indicator now uses `colorize("subscriptionIndicator", ...)` instead of being part of the cost color
  - Auto-compact `(auto)` is now a separate trailing indicator in the metrics cluster instead of being appended to context usage
  - Execution mode (provider/model/thinking) is on the left instead of the right
  - Provider is always included when `ctx.model` exists, and only disappears later via the narrow-width priority dropper

- [ ] **Step 2: Move the token accumulation loop** — The existing loop that accumulates `totalInput`, `totalOutput`, etc. (currently near line 274) must be removed from its current location and incorporated into the row 2 block above. Delete the original loop and the variable declarations at lines 274–286. The new versions are embedded in the row 2 assembly code from Step 1.

- [ ] **Step 3: Update the lines array assembly** — The existing code at the end that creates `const lines = [line1, statsLine]` should remain unchanged since the variable names (`line1`, `statsLine`) are preserved.

**Acceptance criteria:**
- Row 2 left shows execution mode: `(provider) model · thinking` whenever `ctx.model` exists
- Provider remains part of the normal wide-layout execution-mode cluster and is only hidden by Task 4's narrow-width priority logic
- Row 2 right shows metrics in order: context usage, tokens, cost/sub, auto-compact
- The subscription sub-indicator `(sub)` uses `colorize("subscriptionIndicator", ...)` instead of `colorize("cost", ...)`
- Context usage appears before tokens and cost in the metrics cluster
- Auto-compact indicator appears as the last item in the metrics cluster
- When the terminal is sufficiently wide, all fields render with proper spacing

**Model recommendation:** standard

---

### Task 4: Implement priority-based narrow-width field visibility

**Files:**
- Modify: `agent/extensions/footer.ts`

**Steps:**

- [ ] **Step 1: Compute per-field widths and the row-1 truncation thresholds before composing either row** — After the row 1 left/right assembly (from Task 2) and the row 2 component assembly (from Task 3), but *before* composing either row into its final `line1`/`statsLine`, compute the visible width of every hide-able field across both rows. Also compute the truncation thresholds that let row 1 fit by shortening cwd before any visibility drops.

  Replace the "Compose row 1 with left-right layout" section from Task 2 and the "Compose row 2 with left-right layout" section from Task 3 with the unified system below. The field-building code from Tasks 2 and 3 (everything up to but not including the composition sections) remains unchanged.

  ```typescript
  // ── Pre-compute per-field widths for the global priority dropper ──

  // Row 1 field measurements
  const pwdStrWidth = visibleWidth(colorize("pwd", pwdStr));
  const branchWidth = branch
      ? visibleWidth(colorize("symbols", " · ") + colorize("branch", branch))
      : 0;
  const sessionNameWidth = sessionName
      ? visibleWidth(colorize("sessionName", sessionName))
      : 0;

  // Row 1 truncation thresholds
  const ellipsisStr = colorize("symbols", "...");
  const ellipsisWidth = visibleWidth(ellipsisStr);
  const minPwdCharsWithBranch = 4;

  // Row 2 field measurements
  const modelNameWidth = visibleWidth(colorize("modelName", modelName));
  const thinkingWidth = thinkingStr ? visibleWidth(thinkingStr) : 0;
  const providerWidth = providerPrefix ? visibleWidth(providerPrefix) : 0;

  // Context percent string (always shown — highest priority)
  let contextPercentStr: string;
  if (contextPercent === "?") {
      contextPercentStr = colorize("symbols", "?");
  } else {
      const pctColor =
          contextPercentValue > 90 ? "error"
              : contextPercentValue > 70 ? "warning"
              : undefined;
      contextPercentStr = pctColor
          ? theme.fg(pctColor, contextPercent) + theme.fg(pctColor, "%")
          : colorize("contextUsage", contextPercent) + colorize("contextUsage", "%");
  }
  const contextPercentWidth = visibleWidth(contextPercentStr);
  const contextDenomStr = colorize("symbols", "/") +
      colorize("contextWindow", formatTokens(contextWindow));
  const contextDenomWidth = visibleWidth(contextDenomStr);

  const tokensStr = (totalInput || totalOutput)
      ? colorize("symbols", "↑") + colorize("tokens", formatTokens(totalInput)) +
        colorize("symbols", " ↓") + colorize("tokens", formatTokens(totalOutput))
      : "";
  const tokensWidth = tokensStr ? visibleWidth(tokensStr) : 0;

  const costStr = (totalCost || usingSubscription)
      ? colorize("cost", `$${totalCost.toFixed(3)}`) +
        (usingSubscription ? colorize("subscriptionIndicator", " (sub)") : "")
      : "";
  const costWidth = costStr ? visibleWidth(costStr) : 0;

  const autoCompactStr = autoCompactEnabled
      ? colorize("symbols", "(auto)")
      : "";
  const autoCompactWidth = autoCompactStr ? visibleWidth(autoCompactStr) : 0;
  ```

- [ ] **Step 2: Make the fit calculation truncation-aware, then apply the global cross-row priority dropper** — The fit check must treat row 1 as fitting whenever the current `showSessionName` / `showBranch` flags leave enough room for `truncatePwdTail()` to solve the overflow by shortening cwd. That prevents the priority loop from dropping auto-compact, cost, tokens, provider, session name, or branch when a long cwd could have been handled by tail truncation alone.

  ```typescript
  // ── Global visibility flags (shared across both rows) ─────────────
  const minPadding = 2;

  let showAutoCompact = autoCompactEnabled;
  let showCost = !!(totalCost || usingSubscription);
  let showTokens = !!(totalInput || totalOutput);
  let showProvider = !!providerPrefix;
  let showContextDenom = true;
  let showSessionName = !!sessionName;
  let showBranch = !!branch;
  let showThinking = !!thinkingStr;
  // cwd is always present but may be truncated; it is never fully hidden

  function row1CanFitWithCurrentFlags(): boolean {
      const rightWidth = showSessionName && sessionNameWidth > 0
          ? minPadding + sessionNameWidth
          : 0;

      const maxLeftWidth = width - rightWidth;
      if (maxLeftWidth <= 0) return false;

      const fullLeftWidth = pwdStrWidth + (showBranch ? branchWidth : 0);
      if (fullLeftWidth <= maxLeftWidth) return true;

      if (showBranch) {
          const minLeftKeepingBranch =
              ellipsisWidth + minPwdCharsWithBranch + branchWidth;
          return maxLeftWidth >= minLeftKeepingBranch;
      }

      // cwd-only row can always be reduced to the remaining width;
      // prefer ellipsis when possible, but fitting only requires 1 column.
      return maxLeftWidth >= 1;
  }

  function row2Needed(): number {
      let left = modelNameWidth;
      if (showThinking) left += thinkingWidth;
      if (showProvider) left += providerWidth;

      const rightParts: number[] = [];
      let ctxW = contextPercentWidth;
      if (showContextDenom) ctxW += contextDenomWidth;
      rightParts.push(ctxW);
      if (showTokens && tokensWidth) rightParts.push(tokensWidth);
      if (showCost && costWidth) rightParts.push(costWidth);
      if (showAutoCompact && autoCompactWidth) rightParts.push(autoCompactWidth);

      const right = rightParts.reduce((a, b) => a + b, 0) +
          Math.max(0, rightParts.length - 1); // 1 space between each part

      return left + minPadding + right;
  }

  function bothRowsFit(): boolean {
      return row1CanFitWithCurrentFlags() && row2Needed() <= width;
  }

  // Walk the global visibility-drop priority list from lowest to highest.
  // Important: row1CanFitWithCurrentFlags() already accounts for allowed cwd
  // truncation, so a long cwd does NOT trigger drops by itself when truncation
  // can solve the overflow.
  if (!bothRowsFit() && showAutoCompact)  showAutoCompact = false;  // #11
  if (!bothRowsFit() && showCost)         showCost = false;         // #10
  if (!bothRowsFit() && showTokens)       showTokens = false;       // #9
  if (!bothRowsFit() && showProvider)     showProvider = false;     // #8
  if (!bothRowsFit() && showContextDenom) showContextDenom = false; // #7
  if (!bothRowsFit() && showSessionName)  showSessionName = false;  // #6
  if (!bothRowsFit() && showBranch)       showBranch = false;       // #5
  // #4 is cwd truncation — handled inside row1CanFitWithCurrentFlags()
  // and later applied during row 1 composition
  if (!bothRowsFit() && showThinking)     showThinking = false;     // #3
  // Priorities #1-#2 (context usage %, model name) are never hidden
  ```

  **Why this works:** `bothRowsFit()` no longer treats row 1 as over-width just because `pwdStrWidth` is long. It first asks whether the currently visible row-1 fields can fit after tail-truncating cwd. If yes, the dropper stops and preserves row 2 fields plus row 1 session/branch. If no, the loop proceeds through the global visibility priorities. This keeps the strict cross-row drop order for actual visibility changes, while ensuring cwd truncation happens before any visibility changes that truncation could have avoided.

- [ ] **Step 3: Compose row 1 from surviving flags** — Build `line1` using the global visibility flags. This replaces the row 1 composition section from Task 2.

  ```typescript
  // ── Compose row 1 using surviving visibility flags ────────────────

  let r1Left = showBranch && branch
      ? colorize("pwd", pwdStr) +
        colorize("symbols", " · ") +
        colorize("branch", branch)
      : colorize("pwd", pwdStr);

  const r1Right = showSessionName && sessionName
      ? colorize("sessionName", sessionName)
      : "";

  const r1RightW = visibleWidth(r1Right);
  const r1TargetLeftWidth = r1RightW > 0
      ? width - minPadding - r1RightW
      : width;

  // If the current row-1 flags fit only via cwd truncation, apply that now.
  if (r1TargetLeftWidth > 0 && visibleWidth(r1Left) > r1TargetLeftWidth) {
      r1Left = truncatePwdTail(
          pwdStr,
          showBranch ? branch : undefined,
          r1TargetLeftWidth,
          colorize,
      );
  }

  let line1: string;
  const r1LeftWidth = visibleWidth(r1Left);
  const r1RightWidth = visibleWidth(r1Right);

  if (r1RightWidth > 0 && r1LeftWidth + minPadding + r1RightWidth <= width) {
      const padding = " ".repeat(width - r1LeftWidth - r1RightWidth);
      line1 = r1Left + padding + r1Right;
  } else {
      line1 = r1Left;
  }
  ```

  Composition rule:
  - If `showBranch` is still true here, Step 2 has already guaranteed there is enough width for branch-preserving truncation.
  - Do not let row 1 composition silently drop branch or session name; those remain controlled by the Step 2 flags.

- [ ] **Step 4: Compose row 2 from surviving flags** — Build `statsLine` using the global visibility flags. This replaces the row 2 composition section from Task 3.

  ```typescript
  // ── Compose row 2 using surviving visibility flags ────────────────

  let row2LeftFinal = "";
  if (showProvider) row2LeftFinal += providerPrefix;
  row2LeftFinal += colorize("modelName", modelName);
  if (showThinking && thinkingStr) row2LeftFinal += thinkingStr;

  const metricsFinal: string[] = [];
  let ctxFinal = contextPercentStr;
  if (showContextDenom) ctxFinal += contextDenomStr;
  metricsFinal.push(ctxFinal);
  if (showTokens && tokensStr) metricsFinal.push(tokensStr);
  if (showCost && costStr) metricsFinal.push(costStr);
  if (showAutoCompact && autoCompactStr) metricsFinal.push(autoCompactStr);

  const row2RightFinal = metricsFinal.join(" ");
  const row2LeftFinalWidth = visibleWidth(row2LeftFinal);
  const row2RightFinalWidth = visibleWidth(row2RightFinal);

  let statsLine: string;
  if (row2LeftFinalWidth + minPadding + row2RightFinalWidth <= width) {
      const padding = " ".repeat(
          width - row2LeftFinalWidth - row2RightFinalWidth,
      );
      statsLine = row2LeftFinal + padding + row2RightFinal;
  } else {
      // Last resort: truncate left to fit right side
      const availForLeft = width - minPadding - row2RightFinalWidth;
      if (availForLeft > 0) {
          const tLeft = truncateToWidth(row2LeftFinal, availForLeft, "");
          const tLeftW = visibleWidth(tLeft);
          const padding = " ".repeat(
              Math.max(0, width - tLeftW - row2RightFinalWidth),
          );
          statsLine = tLeft + padding + row2RightFinal;
      } else {
          statsLine = truncateToWidth(row2RightFinal, width);
      }
  }
  ```

**Acceptance criteria:**
- Visibility drops still happen in strict global priority order across both rows: auto-compact (#11) → cost+sub (#10) → tokens (#9) → provider (#8) → context denominator (#7) → session name (#6) → git branch (#5) → thinking (#3)
- Cwd truncation (#4) is **not** a visibility drop; it is attempted first whenever row 1 can be made to fit by tail-truncating cwd
- A long cwd on row 1 does not cause auto-compact, cost, tokens, provider, session name, or branch to disappear when `truncatePwdTail()` alone can make row 1 fit
- A lower-priority field on row 2 is still hidden before a higher-priority visibility drop on row 1 when truncation cannot solve the row-1 overflow
- Model name and context usage percentage are never hidden (priorities #1-#2)
- Tokens up/down disappear as a single unit (both arrows + values together)
- Cost and subscription indicator disappear as a single unit
- Context window denominator and `/` separator disappear as a single unit
- On row 1, cwd tail truncation is attempted before hiding session name or branch; if row 1 still cannot fit, session name drops before git branch
- Git branch only disappears after the branch-preserving truncation case has been exhausted
- No orphaned separators (no lone `·` on row 1, no lone `/` on row 2, no lone `↑`/`↓` without values)

**Model recommendation:** capable

---

### Task 5: Final integration and cleanup

**Files:**
- Modify: `agent/extensions/footer.ts`

**Steps:**

- [ ] **Step 1: Remove dead code** — Remove any variables or code paths from the original render function that are no longer referenced after the restructuring:
  - The original `pwdLine` variable and its assembly (replaced by `row1Left`/`row1Right`)
  - The original `statsParts` array (replaced by `metricsParts`/priority-based assembly)
  - The original `rightSide`/`rightSideWithoutProvider` variables (replaced by `row2LeftFinal`)
  - The original `statsLeftWidth` / `totalNeeded` calculation block

- [ ] **Step 2: Verify the render function structure** — Walk through the final `render()` function and confirm this overall structure:
  1. Per-render color resolution (unchanged)
  2. Row 1 field building: cwd, branch, session name (no composition yet)
  3. Token accumulation loop
  4. Row 2 field building: model/thinking/provider, context usage, tokens, cost/sub, auto-compact (no composition yet)
  5. Global priority dropper: per-field width measurements, visibility flags, cross-row priority loop
  6. Row 1 composition: build `line1` from surviving flags
  7. Row 2 composition: build `statsLine` from surviving flags
  8. Lines array: `[line1, statsLine]`
  9. Optional line 3: extension statuses (unchanged)

- [ ] **Step 3: Verify the doc comment matches the new layout** — Update the JSDoc block at the top of the file to reflect the new layout:
  ```
  *   Line 1: ~/path · branch                               session-name
  *   Line 2: (provider) model · thinking    context%/window ↑in ↓out $cost (sub) (auto)
  *   Line 3: extension statuses (optional)
  ```
  Replace the old layout description:
  ```
  *   Line 1: ~/path (branch) • session-name
  *   Line 2: ↑input ↓output Rcache Wcache $cost context%/window (auto) | (provider) model • thinking
  ```

- [ ] **Step 4: Verify that all `colorize("subscriptionIndicator", ...)` calls are in place** — Confirm that the subscription sub-indicator `(sub)` uses `colorize("subscriptionIndicator", " (sub)")` and not `colorize("cost", " (sub)")`. This is what allows themes to style it independently.

**Acceptance criteria:**
- No dead code from the original layout remains
- The JSDoc comment accurately describes the new layout
- The file compiles without errors (TypeScript type checks pass)
- The subscription sub-indicator is independently colorized in all code paths
- The overall render function is structured as: color setup → row 1 fields → token loop → row 2 fields → global priority dropper → row 1 composition → row 2 composition → lines

**Model recommendation:** standard

## Dependencies

- Task 2 depends on: Task 1
- Task 3 depends on: Task 1
- Task 4 depends on: Task 2, Task 3
- Task 5 depends on: Task 4

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `visibleWidth` performance with many `colorize` calls per render | Low | Low | The current implementation already calls `visibleWidth` multiple times per render. The new code adds more calls but they are on pre-built strings, not in tight loops. Footer renders are infrequent (on terminal resize, input, or data change). |
| `tailTruncate` with multi-byte Unicode path characters | Medium | Low | `tailTruncate` uses `.slice()` on the uncolored string, which works on UTF-16 code units. Paths with emoji or CJK characters in directory names could have off-by-one width issues. Mitigation: This is an edge case for filesystem paths, and the existing `truncateToWidth` has the same limitation. |
| Global priority dropper may over-drop fields when only one row is tight | Low | Medium | The `bothRowsFit()` check evaluates both rows after each flag toggle. Because the priority list is strict and fields are dropped lowest-first, a row 2 field at priority 8 (provider) is correctly dropped before a row 1 field at priority 6 (session name) even if row 2 is fine — the field is only dropped when `bothRowsFit()` is still false, meaning the other row still doesn't fit. The greedy approach cannot drop a higher-priority field while a lower-priority one survives. |
| Theme color regressions with new `subscriptionIndicator` field | Low | Medium | All three theme entries are explicitly updated in Task 1. The `DEFAULT_TOKENS` fallback ensures themes not in `THEME_COLORS` still get a sensible default (`"dim"` token). |
| Row 1 dot separator `·` rendered as multi-byte on some terminals | Very Low | Low | The middle dot `·` (U+00B7) is a standard single-width character supported by all modern terminals. It's already used in the current footer for the session name separator. |
| `buildRow2` / priority logic becomes difficult to maintain | Medium | Low | The flag-based approach is explicit and readable — each flag maps to one spec priority item. The `row2Needed()` function centralizes width calculation. Future changes to priority order require only reordering the if-chain. |

## Review Notes

_Added by plan reviewer — informational, not blocking._

### Warnings
- **Task 3 / Task 4 / Task 5**
  - **What:** Task 3 tells the implementer to build `metricsParts`, `contextDisplay`, and a token loop that still accumulates `totalCacheRead` / `totalCacheWrite`, but Task 4 composes row 2 from a different set of recomputed strings (`contextPercentStr`, `contextDenomStr`, `tokensStr`, `costStr`, `autoCompactStr`) and does not use `metricsParts`. Task 5 then describes `metricsParts` as if it remains the intended replacement.
  - **Why it matters:** This can lead to duplicated or dead code and creates avoidable ambiguity about what Task 4 is supposed to consume. In stricter TS/lint settings, the unused cache totals and `metricsParts`-style values could also fail verification.
  - **Recommendation:** Clarify the intended row-2 contract: either Task 3 should only prepare raw values/atomic strings for Task 4, or Task 4 should explicitly consume the structures created in Task 3.

- **Task 4**
  - **What:** Step 4 falls back to `truncateToWidth(row2LeftFinal, availForLeft, "")`, which can cut through provider/model/thinking text arbitrarily.
  - **Why it matters:** The spec says visibility/truncation should operate on meaningful display units and avoid misleading partial labels or orphaned punctuation. Generic truncation of the left execution-mode cluster is at odds with that rule, especially on very narrow widths.
  - **Recommendation:** Add an explicit ultra-narrow policy for row 2 instead of generic string truncation, or at minimum state which unit may truncate and how separators are handled.

- **Task 5**
  - **What:** The plan requires the file to compile and the responsive behavior to be verified visually, but it does not name the compile/typecheck command or a concrete way to exercise the width-priority behavior.
  - **Why it matters:** An agent can implement the changes but still be unsure how to prove completion, especially for the narrow-width acceptance criteria.
  - **Recommendation:** Add the exact verification command(s) and a brief manual validation procedure for resizing/testing footer breakpoints.
