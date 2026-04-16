/**
 * Custom Footer Extension
 *
 * Replaces the default pi footer with one where each field's color is independently
 * configurable via THEME_COLORS, with graceful fallback to theme token defaults.
 *
 * The layout faithfully reproduces the default footer:
 *   Line 1: ~/path (branch) • session-name
 *   Line 2: ↑input ↓output Rcache Wcache $cost context%/window (auto) | (provider) model • thinking
 *   Line 3: extension statuses (optional)
 *
 * Context usage escalation is preserved:
 *   >90%  → "error" token
 *   >70%  → "warning" token
 *   ≤70%  → DEFAULT_TOKENS.contextUsage token (or THEME_COLORS override)
 *
 * ── Colour configuration ──────────────────────────────────────────────────────
 *
 * Add entries to THEME_COLORS to override defaults for specific themes.
 * Each value supports three formats:
 *   • Named ANSI color string: "red", "brightCyan", "magenta", etc. (16 standard)
 *   • Hex color string:        "#ff8800" (truecolor; auto-downconverted in 256-color terminals)
 *   • ANSI 256 number:         208 (used as-is regardless of terminal mode)
 *
 * Fields with no override in THEME_COLORS fall back to the theme's own token
 * (DEFAULT_TOKENS), so colors adapt automatically when the user switches themes.
 *
 * The modelProvider prefix is always rendered in the "dim" theme token.
 * The thinking level always matches the thinking border bar colors from the theme.
 * Neither is user-configurable.
 *
 * Example:
 *   const THEME_COLORS: Record<string, Partial<FooterColors>> = {
 *     dracula: { modelName: "magenta", cost: "#ffb86c" },
 *     nord:    { branch: "brightCyan", cost: 208 },
 *   };
 */

import type { AssistantMessage } from "@mariozechner/pi-ai";
import { SettingsManager, type ExtensionAPI, type ThemeColor } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

// ─── Colour type and user-configurable map ────────────────────────────────────

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

const THEME_COLORS: Record<string, Partial<FooterColors>> = {
	// Add entries here to override defaults for specific themes, e.g.:
	// "dracula": { modelName: "magenta", cost: "#ffb86c" },
	carbonfox: {
		modelName:              "#33b1ff",  // cyan — accent
		tokens:                 "#8cb6ff",  // blueBright — consistent with contextUsage blue
		cost:                   "#08bdba",  // teal — carbonfox "warning"
		subscriptionIndicator:  "#535353",  // dimGray — matches the carbonfox dim var, same value as cache
		cache:                  "#535353",  // dimGray — subtle
		contextUsage:           "#78a9ff",  // blue
		contextWindow:          "#7b7c7e",  // gray — readable but subtler than contextUsage
		branch:                 "#25be6a",  // green — success
		pwd:                    "#ee5396",  // red — pink-red
		sessionName:            "#be95ff",  // magenta — soft lavender accent
		statuses:               "#535353",  // dimGray — dim
		symbols:                "#484848",  // darkGray — borderMuted
	},
	everblush: {
		modelName:              "#67b0e8",  // blue — primary accent
		tokens:                 "#71baf2",  // bright blue — a touch brighter than model name
		cost:                   "#ccb77a",  // muted gold — softer cost emphasis
		subscriptionIndicator:  "#5c6466",  // dim gray — matches the everblush dimGray var
		cache:                  "#5c6466",  // dim gray — subtle
		contextUsage:           "#6cbfbf",  // cyan — readable emphasis distinct from tokens
		contextWindow:          "#b3b9b8",  // light gray — softer denominator / window size
		branch:                 "#8ccf7e",  // green — git branch / success
		pwd:                    "#e57474",  // red — directory path accent from Everblush palette
		sessionName:            "#c47fd5",  // magenta — violet accent
		statuses:               "#5c6466",  // dim gray — subdued status line
		symbols:                "#5c6466",  // dim gray — slightly brighter separators and punctuation
	},
	"nord-dark": {
		modelName:              "#88c0d0",  // nord8 — accent blue
		tokens:                 "#81a1c1",  // nord9 — subtle/muted blue
		cost:                   "#ebcb8b",  // nord13 — yellow/gold
		subscriptionIndicator:  "#4c566a",  // nord3 — matches the Nord dim color token
		cache:                  "#4c566a",  // nord3 — muted/dim
		contextUsage:           "#88c0d0",  // nord8 — slightly brighter blue than tokens
		contextWindow:          "#d8dee9",  // nord4 — silver/bright gray
		branch:                 "#a3be8c",  // nord14 — green
		pwd:                    "#d08770",  // nord12 — orange
		sessionName:            "#b48ead",  // nord15 — mauve accent
		statuses:               "#4c566a",  // nord3 — muted
		symbols:                "#4c566a",  // nord3 — muted
	},
};

// ─── Default theme-token fallbacks ───────────────────────────────────────────

const DEFAULT_TOKENS: Record<keyof FooterColors, ThemeColor> = {
	modelName:              "accent",
	tokens:                 "border",
	cost:                   "warning",
	subscriptionIndicator:  "dim",
	cache:                  "muted",
	contextUsage:           "accent",
	contextWindow:          "dim",
	branch:                 "success",
	pwd:                    "error",
	sessionName:            "warning",
	statuses:               "dim",
	symbols:                "borderMuted",
};

// ─── Colour helpers ───────────────────────────────────────────────────────────

const ANSI_NAMED: Record<string, number> = {
	black:         30,
	red:           31,
	green:         32,
	yellow:        33,
	blue:          34,
	magenta:       35,
	cyan:          36,
	white:         37,
	gray:          90,
	grey:          90,
	brightRed:     91,
	brightGreen:   92,
	brightYellow:  93,
	brightBlue:    94,
	brightMagenta: 95,
	brightCyan:    96,
	brightWhite:   97,
};

const CUBE_VALUES = [0, 95, 135, 175, 215, 255];
const GRAY_VALUES = Array.from({ length: 24 }, (_, i) => 8 + i * 10);

function hexToRgb(hex: string): { r: number; g: number; b: number } {
	const clean = hex.replace(/^#/, "");
	return {
		r: parseInt(clean.slice(0, 2), 16),
		g: parseInt(clean.slice(2, 4), 16),
		b: parseInt(clean.slice(4, 6), 16),
	};
}

function rgbTo256(r: number, g: number, b: number): number {
	// Weighted Euclidean distance — matches pi's own hex→256 algorithm.
	let bestIdx = 0;
	let bestDist = Infinity;

	// 6×6×6 colour cube: indices 16–231
	for (let ri = 0; ri < 6; ri++) {
		for (let gi = 0; gi < 6; gi++) {
			for (let bi = 0; bi < 6; bi++) {
				const dr = r - CUBE_VALUES[ri];
				const dg = g - CUBE_VALUES[gi];
				const db = b - CUBE_VALUES[bi];
				const dist = dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114;
				if (dist < bestDist) {
					bestDist = dist;
					bestIdx = 16 + ri * 36 + gi * 6 + bi;
				}
			}
		}
	}

	// 24-step grayscale ramp: indices 232–255
	for (let i = 0; i < 24; i++) {
		const v = GRAY_VALUES[i];
		const dr = r - v;
		const dg = g - v;
		const db = b - v;
		const dist = dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114;
		if (dist < bestDist) {
			bestDist = dist;
			bestIdx = 232 + i;
		}
	}

	return bestIdx;
}

function colorToAnsi(value: string | number, mode: "truecolor" | "256color"): string {
	if (typeof value === "number") {
		// ANSI 256 index — used as-is
		return `\x1b[38;5;${value}m`;
	}

	if (value.startsWith("#")) {
		const { r, g, b } = hexToRgb(value);
		if (mode === "truecolor") {
			return `\x1b[38;2;${r};${g};${b}m`;
		} else {
			return `\x1b[38;5;${rgbTo256(r, g, b)}m`;
		}
	}

	const code = ANSI_NAMED[value];
	if (code !== undefined) {
		return `\x1b[${code}m`;
	}

	throw new Error(
		`[custom-footer] Unknown color "${value}". ` +
		`Use a named ANSI color (e.g. "red", "brightCyan"), a hex value (e.g. "#ff8800"), ` +
		`or an ANSI 256 number (e.g. 208).`,
	);
}

function applyColor(value: string | number, text: string, mode: "truecolor" | "256color"): string {
	const ansi = colorToAnsi(value, mode);
	return `${ansi}${text}\x1b[39m`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format token counts compactly, matching the default footer exactly. */
function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
	return `${Math.round(count / 1000000)}M`;
}

/** Strip control characters for safe single-line display. */
function sanitizeStatusText(text: string): string {
	return text
		.replace(/[\r\n\t]/g, " ")
		.replace(/ +/g, " ")
		.trim();
}

// ─── Row 1 helpers ───────────────────────────────────────────────────────────

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

// ─── Extension entry point ────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		ctx.ui.setFooter((tui, theme, footerData) => {
			// Re-render whenever the git branch changes.
			const unsub = footerData.onBranchChange(() => tui.requestRender());

			return {
				dispose: unsub,

				// Colors are computed fresh in every render() call via `colorize()`,
				// so there is no cached content to invalidate on theme switch.
				invalidate() {},

				render(width: number): string[] {
					// ── Per-render color resolution ─────────────────────────────────────
					// Read theme.name and colorMode fresh each render so theme switches
					// are picked up automatically without needing to cache anything.
					const overrides = THEME_COLORS[theme.name ?? ""] ?? {};
					const colorMode = theme.getColorMode();

					function colorize(field: keyof FooterColors, text: string): string {
						const override = overrides[field];
						if (override !== undefined) {
							return applyColor(override, text, colorMode);
						}
						return theme.fg(DEFAULT_TOKENS[field], text);
					}

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
					// Temporary placeholder — replaced by Task 4's global priority dropper:
					const line1 = truncateToWidth(row1Left, width, colorize("symbols", "..."));

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
					// Temporary placeholder — replaced by Task 4's global priority dropper:
					const row2Left = providerPrefix + modelNameStr + thinkingStr;
					const row2Right = metricsParts.join(" ");
					const row2LeftWidth = visibleWidth(row2Left);
					const row2RightWidth = visibleWidth(row2Right);
					let statsLine: string;
					if (row2LeftWidth + 2 + row2RightWidth <= width) {
						const padding = " ".repeat(width - row2LeftWidth - row2RightWidth);
						statsLine = row2Left + padding + row2Right;
					} else {
						statsLine = truncateToWidth(row2Left, width, "");
					}

					const lines = [line1, statsLine];

					// ── Line 3 (optional): extension statuses ───────────────────────────
					const extensionStatuses = footerData.getExtensionStatuses();
					if (extensionStatuses.size > 0) {
						const sortedStatuses = Array.from(extensionStatuses.entries())
							.sort(([a], [b]) => a.localeCompare(b))
							.map(([, text]) => sanitizeStatusText(text));
						const statusLine = sortedStatuses.join(" ");
						lines.push(truncateToWidth(statusLine, width));
					}

					return lines;
				},
			};
		});
	});
}
