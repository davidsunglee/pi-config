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
	modelName:     string | number;
	tokens:        string | number;
	cost:          string | number;
	cache:         string | number;
	contextUsage:  string | number;
	contextWindow: string | number;
	branch:        string | number;
	pwd:           string | number;
	statuses:      string | number;
	symbols:       string | number;
};

const THEME_COLORS: Record<string, Partial<FooterColors>> = {
	// Add entries here to override defaults for specific themes, e.g.:
	// "dracula": { modelName: "magenta", cost: "#ffb86c" },
	carbonfox: {
		modelName:     "#33b1ff",  // cyan — accent
		tokens:        "#8cb6ff",  // blueBright — consistent with contextUsage blue
		cost:          "#08bdba",  // teal — carbonfox "warning"
		cache:         "#535353",  // dimGray — subtle
		contextUsage:  "#78a9ff",  // blue
		contextWindow: "#7b7c7e",  // gray — readable but subtler than contextUsage
		branch:        "#25be6a",  // green — success
		pwd:           "#ee5396",  // red — pink-red
		statuses:      "#535353",  // dimGray — dim
		symbols:       "#484848",  // darkGray — borderMuted
	},
};

// ─── Default theme-token fallbacks ───────────────────────────────────────────

const DEFAULT_TOKENS: Record<keyof FooterColors, ThemeColor> = {
	modelName:     "accent",
	tokens:        "muted",
	cost:          "warning",
	cache:         "muted",
	contextUsage:  "muted",
	contextWindow: "dim",
	branch:        "success",
	pwd:           "dim",
	statuses:      "dim",
	symbols:       "borderMuted",
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

					// ── Accumulate cumulative token stats from ALL entries ──────────────
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

					// ── Context usage ───────────────────────────────────────────────────
					const contextUsage = ctx.getContextUsage();
					const contextWindow =
						contextUsage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
					// percent is explicitly null when context size is unknown (e.g. post-compaction)
					const contextPercentValue = contextUsage?.percent ?? 0;
					const contextPercent =
						contextUsage?.percent !== null ? contextPercentValue.toFixed(1) : "?";

					// ── Line 1: pwd (branch) • session-name ────────────────────────────
					let pwd = ctx.cwd;
					const home = process.env.HOME ?? process.env.USERPROFILE;
					if (home && pwd.startsWith(home)) {
						pwd = `~${pwd.slice(home.length)}`;
					}

					let pwdLine = colorize("pwd", pwd);

					const branch = footerData.getGitBranch();
					if (branch) {
						pwdLine +=
							colorize("symbols", " (") +
							colorize("branch", branch) +
							colorize("symbols", ")");
					}

					const sessionName = pi.getSessionName();
					if (sessionName) {
						pwdLine +=
							colorize("symbols", " • ") +
							colorize("pwd", sessionName);
					}

					const line1 = truncateToWidth(
						pwdLine,
						width,
						colorize("symbols", "..."),
					);

					// ── Line 2 left: token stats + context usage ────────────────────────
					const statsParts: string[] = [];

					if (totalInput) {
						statsParts.push(
							colorize("symbols", "↑") +
								colorize("tokens", formatTokens(totalInput)),
						);
					}
					if (totalOutput) {
						statsParts.push(
							colorize("symbols", "↓") +
								colorize("tokens", formatTokens(totalOutput)),
						);
					}
					// Prompt cache numbers hidden by design — uncomment to restore:
					// if (totalCacheRead) {
					// 	statsParts.push(
					// 		colorize("symbols", "R") +
					// 			colorize("cache", formatTokens(totalCacheRead)),
					// 	);
					// }
					// if (totalCacheWrite) {
					// 	statsParts.push(
					// 		colorize("symbols", "W") +
					// 			colorize("cache", formatTokens(totalCacheWrite)),
					// 	);
					// }

					const usingSubscription = ctx.model
						? ctx.modelRegistry.isUsingOAuth(ctx.model)
						: false;
					if (totalCost || usingSubscription) {
						const costDisplay =
							`${totalCost.toFixed(3)}` + (usingSubscription ? " (sub)" : "");
						statsParts.push(
							colorize("cost", `$${costDisplay}`),
						);
					}

					// Context usage with escalating color
					const autoCompactEnabled = SettingsManager.create().getCompactionEnabled();
					const autoIndicator = autoCompactEnabled
						? colorize("symbols", " (auto)")
						: "";
					let contextDisplay: string;
					if (contextPercent === "?") {
						contextDisplay =
							colorize("symbols", "?/") +
							colorize("contextWindow", formatTokens(contextWindow)) +
							autoIndicator;
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
							pctStr +
							pctSuffix +
							colorize("symbols", "/") +
							colorize("contextWindow", formatTokens(contextWindow)) +
							autoIndicator;
					}
					statsParts.push(contextDisplay);

					let statsLeft = statsParts.join(" ");

					// ── Line 2 right: (provider) model • thinking ───────────────────────
					const modelName = ctx.model?.id ?? "no-model";

					let rightSideWithoutProvider: string;
					if (ctx.model?.reasoning) {
						const thinkingLevel = pi.getThinkingLevel() ?? "off";
						const thinkingStr = thinkingLevel === "off" ? "thinking off" : thinkingLevel;
						rightSideWithoutProvider =
							colorize("modelName", modelName) +
							colorize("symbols", " • ") +
							theme.getThinkingBorderColor(thinkingLevel)(thinkingStr);
					} else {
						rightSideWithoutProvider = colorize("modelName", modelName);
					}

					// Ensure statsLeft does not exceed terminal width before measuring
					let statsLeftWidth = visibleWidth(statsLeft);
					if (statsLeftWidth > width) {
						statsLeft = truncateToWidth(statsLeft, width, "...");
						statsLeftWidth = visibleWidth(statsLeft);
					}

					const minPadding = 2;

					// Prepend provider only if multiple providers exist and it fits
					let rightSide = rightSideWithoutProvider;
					if (footerData.getAvailableProviderCount() > 1 && ctx.model) {
						const withProvider =
							theme.fg("dim", `(${ctx.model.provider}) `) + rightSideWithoutProvider;
						if (statsLeftWidth + minPadding + visibleWidth(withProvider) <= width) {
							rightSide = withProvider;
						}
					}

					const rightSideWidth = visibleWidth(rightSide);
					const totalNeeded = statsLeftWidth + minPadding + rightSideWidth;

					let statsLine: string;
					if (totalNeeded <= width) {
						// Both fit — right-align the model info
						const padding = " ".repeat(width - statsLeftWidth - rightSideWidth);
						statsLine = statsLeft + padding + rightSide;
					} else {
						// Truncate the right side to whatever space remains
						const availableForRight = width - statsLeftWidth - minPadding;
						if (availableForRight > 0) {
							const truncatedRight = truncateToWidth(rightSide, availableForRight, "");
							const truncatedRightWidth = visibleWidth(truncatedRight);
							const padding = " ".repeat(
								Math.max(0, width - statsLeftWidth - truncatedRightWidth),
							);
							statsLine = statsLeft + padding + truncatedRight;
						} else {
							// No room for the right side at all
							statsLine = statsLeft;
						}
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
