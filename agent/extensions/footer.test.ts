import test from "node:test";
import assert from "node:assert/strict";

import {
	computeVisibility,
	getCostDisplay,
	getProviderPrefix,
	getThinkingLabel,
	sanitizeStatusTexts,
	type FieldWidths,
} from "./footer.ts";

/**
 * These tests exercise the production priority dropper directly (imported
 * from ./footer.ts) to guarantee production divergence cannot slip through.
 *
 * FieldWidths semantics reminder:
 *   - branchWidth includes the " · " separator (matches production measurement).
 *   - sessionNameWidth is the raw session label width (no padding).
 *   - ellipsisWidth is the "..." glyph width used by the cwd truncation path.
 */

const ELLIPSIS_WIDTH = 3; // "..."

/**
 * Build a FieldWidths object for a given terminal width with sensible defaults.
 * Individual tests override only the fields they care about.
 */
function fw(width: number, overrides: Partial<FieldWidths> = {}): FieldWidths {
	const base: FieldWidths = {
		width,
		pwdStrWidth: 0,
		branchWidth: 0,
		sessionNameWidth: 0,
		ellipsisWidth: ELLIPSIS_WIDTH,
		modelNameWidth: 0,
		thinkingWidth: 0,
		providerWidth: 0,
		contextPercentWidth: 0,
		contextDenomWidth: 0,
		tokensWidth: 0,
		costWidth: 0,
		hasBranch: false,
		hasSessionName: false,
		hasThinking: false,
		hasProvider: false,
		hasTokens: false,
		hasCost: false,
	};
	return { ...base, ...overrides };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test("wide terminal: all live fields visible", () => {
	const flags = computeVisibility(fw(200, {
		pwdStrWidth: 20, branchWidth: 9, sessionNameWidth: 10,
		modelNameWidth: 14, thinkingWidth: 12, providerWidth: 12,
		contextPercentWidth: 6, contextDenomWidth: 8,
		tokensWidth: 14, costWidth: 8,
		hasBranch: true, hasSessionName: true, hasThinking: true,
		hasProvider: true, hasTokens: true, hasCost: true,
	}));

	assert.ok(flags.showCost);
	assert.ok(flags.showTokens);
	assert.ok(flags.showProvider);
	assert.ok(flags.showContextDenom);
	assert.ok(flags.showSessionName);
	assert.ok(flags.showBranch);
	assert.ok(flags.showThinking);
	assert.equal("showAutoCompact" in flags, false);
});

test("priority order: cost drops first", () => {
	const fields = {
		pwdStrWidth: 20, branchWidth: 9, sessionNameWidth: 10,
		modelNameWidth: 14, thinkingWidth: 12, providerWidth: 12,
		contextPercentWidth: 6, contextDenomWidth: 8,
		tokensWidth: 14, costWidth: 8,
		hasBranch: true, hasSessionName: true, hasThinking: true,
		hasProvider: true, hasTokens: true, hasCost: true,
	};
	// Row 2 full need with all flags on:
	//   14 + 12 + 12 + 2 + (6 + 8) + 14 + 8 + 2 spaces = 78
	const fullRow2 = 78;
	const flags = computeVisibility(fw(fullRow2 - 1, fields));

	assert.ok(!flags.showCost, "cost should drop first");
	assert.ok(flags.showTokens, "tokens should still be visible");
});

test("tokens drop as a single unit (both arrows + values)", () => {
	const fields = {
		pwdStrWidth: 10, branchWidth: 0, sessionNameWidth: 0,
		modelNameWidth: 14, thinkingWidth: 0, providerWidth: 12,
		contextPercentWidth: 6, contextDenomWidth: 8,
		tokensWidth: 14, costWidth: 0,
		hasBranch: false, hasSessionName: false, hasThinking: false,
		hasProvider: true, hasTokens: true, hasCost: false,
	};
	// With tokens: 14 + 12 + 2 + (6 + 8) + 14 + 1 space = 57
	const withTokens = 57;

	const flags = computeVisibility(fw(withTokens - 1, fields));
	assert.ok(!flags.showTokens, "tokens should drop as a unit");
	assert.ok(flags.showProvider, "provider should still be visible");
});

test("session name drops before branch on row 1", () => {
	// branchWidth includes " · " separator, so 3 + 8 = 11.
	// With session: right = 2 + 15 = 17, left max = width - 17.
	//   min left keeping branch = ellipsis(3) + 4 + 11 = 18, needs width >= 35.
	// Without session: left max = width, needs >= 18.
	// Row 2: 10 + 2 + 6 + 8 = 26, fits easily.
	// Width = 34: can't fit with session, can without.
	const flags = computeVisibility(fw(34, {
		pwdStrWidth: 30, branchWidth: 11, sessionNameWidth: 15,
		modelNameWidth: 10, contextPercentWidth: 6, contextDenomWidth: 8,
		hasBranch: true, hasSessionName: true,
	}));
	assert.ok(!flags.showSessionName, "session name should drop");
	assert.ok(flags.showBranch, "branch should remain");
});

test("branch drops after session name", () => {
	// Very narrow: can't even fit truncated pwd + branch.
	// Need: ellipsis(3) + 4 chars + branchWidth(11) = 18
	const flags = computeVisibility(fw(15, {
		pwdStrWidth: 30, branchWidth: 11,
		modelNameWidth: 10, contextPercentWidth: 6,
		hasBranch: true,
	}));
	assert.ok(!flags.showBranch, "branch should drop when too narrow");
});

test("model name and context percent are never hidden", () => {
	const flags = computeVisibility(fw(20, {
		pwdStrWidth: 5,
		modelNameWidth: 10, thinkingWidth: 8, providerWidth: 10,
		contextPercentWidth: 6, contextDenomWidth: 8,
		tokensWidth: 14, costWidth: 8,
		hasThinking: true, hasProvider: true,
		hasTokens: true, hasCost: true,
	}));
	assert.ok(!flags.showThinking, "thinking should be hidden");
	assert.ok(!flags.showProvider, "provider should be hidden");
	// Model name + context percent minimum = 10 + 2 + 6 = 18, fits in 20.
});

test("long cwd does NOT cause row-2 fields to drop when truncation suffices", () => {
	// Row 2 full need: 14 + 12 + 2 + (6 + 8) + 14 + 8 + 2 spaces = 66
	const flags = computeVisibility(fw(68, {
		pwdStrWidth: 100, // very long cwd
		branchWidth: 9,
		modelNameWidth: 14, providerWidth: 12,
		contextPercentWidth: 6, contextDenomWidth: 8,
		tokensWidth: 14, costWidth: 8,
		hasBranch: true, hasProvider: true,
		hasTokens: true, hasCost: true,
	}));

	assert.ok(flags.showCost, "cost should survive when cwd truncation handles row 1");
	assert.ok(flags.showTokens, "tokens should survive when cwd truncation handles row 1");
	assert.ok(flags.showBranch, "branch should survive when cwd truncation handles row 1");
});

test("context denominator drops as a unit with / separator", () => {
	// With denom:    14 + 2 + 6 + 8 = 30
	// Without denom: 14 + 2 + 6     = 22
	const flags = computeVisibility(fw(25, {
		pwdStrWidth: 10,
		modelNameWidth: 14,
		contextPercentWidth: 6, contextDenomWidth: 8,
	}));
	assert.ok(!flags.showContextDenom, "context denom + separator should drop as unit");
});

test("cross-row priority: row-2 cost drops before row-1 session name", () => {
	// Row 2 with cost:    14 + 2 + (6 + 8) + 14 + 8 + 2 spaces = 54
	// Row 2 without cost: 14 + 2 + (6 + 8) + 14 + 1 space      = 45
	const fields = {
		pwdStrWidth: 20, branchWidth: 9, sessionNameWidth: 15,
		modelNameWidth: 14,
		contextPercentWidth: 6, contextDenomWidth: 8,
		tokensWidth: 14, costWidth: 8,
		hasBranch: true, hasSessionName: true,
		hasTokens: true, hasCost: true,
	};
	const width = 53;
	const flags = computeVisibility(fw(width, fields));

	assert.ok(!flags.showCost, "cost should drop");
	assert.ok(flags.showSessionName, "session name should survive (higher priority)");
});

test("thinking drops last among visibility-droppable fields (#3)", () => {
	// Row 2 with thinking:    10 + 12 + 2 + 6 = 30
	// Row 2 without thinking: 10 + 2 + 6      = 18
	const flags = computeVisibility(fw(25, {
		pwdStrWidth: 5,
		modelNameWidth: 10, thinkingWidth: 12,
		contextPercentWidth: 6,
		hasThinking: true,
	}));
	assert.ok(!flags.showThinking, "thinking should drop");
});

test("thinking label is hidden when thinking is off", () => {
	assert.equal(getThinkingLabel("off"), "");
	assert.equal(getThinkingLabel("minimal"), "minimal");
	assert.equal(getThinkingLabel("high"), "high");
});

test("provider prefix is omitted unless multiple providers are available", () => {
	assert.equal(getProviderPrefix("anthropic", 1), "");
	assert.equal(getProviderPrefix(undefined, 3), "");
	assert.equal(getProviderPrefix("anthropic", 2), "anthropic ");
});

test("subscription-only sessions omit dead zero-dollar cost", () => {
	assert.deepEqual(getCostDisplay(0, false), {
		amountLabel: "",
		subscriptionLabel: "",
	});
	assert.deepEqual(getCostDisplay(0, true), {
		amountLabel: "",
		subscriptionLabel: "(sub)",
	});
	assert.deepEqual(getCostDisplay(1.234, true), {
		amountLabel: "$1.234",
		subscriptionLabel: " (sub)",
	});
});

test("blank extension statuses are filtered out", () => {
	assert.deepEqual(sanitizeStatusTexts(["", "   ", "ok", "line\nwrap"]), [
		"ok",
		"line wrap",
	]);
});
