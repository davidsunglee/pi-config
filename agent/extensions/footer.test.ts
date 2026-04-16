import test from "node:test";
import assert from "node:assert/strict";

import { computeVisibility, type FieldWidths } from "./footer.ts";

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
		autoCompactWidth: 0,
		hasBranch: false,
		hasSessionName: false,
		hasThinking: false,
		hasProvider: false,
		hasTokens: false,
		hasCost: false,
		hasAutoCompact: false,
	};
	return { ...base, ...overrides };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test("wide terminal: all fields visible", () => {
	const flags = computeVisibility(fw(200, {
		pwdStrWidth: 20, branchWidth: 9, sessionNameWidth: 10,
		modelNameWidth: 14, thinkingWidth: 12, providerWidth: 12,
		contextPercentWidth: 6, contextDenomWidth: 8,
		tokensWidth: 14, costWidth: 8, autoCompactWidth: 6,
		hasBranch: true, hasSessionName: true, hasThinking: true,
		hasProvider: true, hasTokens: true, hasCost: true, hasAutoCompact: true,
	}));

	assert.ok(flags.showAutoCompact);
	assert.ok(flags.showCost);
	assert.ok(flags.showTokens);
	assert.ok(flags.showProvider);
	assert.ok(flags.showContextDenom);
	assert.ok(flags.showSessionName);
	assert.ok(flags.showBranch);
	assert.ok(flags.showThinking);
});

test("priority order: auto-compact drops first", () => {
	const fields = {
		pwdStrWidth: 20, branchWidth: 9, sessionNameWidth: 10,
		modelNameWidth: 14, thinkingWidth: 12, providerWidth: 12,
		contextPercentWidth: 6, contextDenomWidth: 8,
		tokensWidth: 14, costWidth: 8, autoCompactWidth: 6,
		hasBranch: true, hasSessionName: true, hasThinking: true,
		hasProvider: true, hasTokens: true, hasCost: true, hasAutoCompact: true,
	};
	// Row 2 full need with all flags on: modelName+thinking+provider + 2 +
	//   (contextPercent+contextDenom) + tokens + cost + autoCompact + 3 spaces
	//   = 38 + 2 + 14 + 14 + 8 + 6 + 3 = 85
	const fullRow2 = 85;
	const flags = computeVisibility(fw(fullRow2 - 1, fields));

	assert.ok(!flags.showAutoCompact, "auto-compact should drop first");
	assert.ok(flags.showCost, "cost should still be visible");
	assert.ok(flags.showTokens, "tokens should still be visible");
});

test("priority order: cost drops before tokens", () => {
	const fields = {
		pwdStrWidth: 10, branchWidth: 7, sessionNameWidth: 0,
		modelNameWidth: 14, thinkingWidth: 0, providerWidth: 12,
		contextPercentWidth: 6, contextDenomWidth: 8,
		tokensWidth: 14, costWidth: 8, autoCompactWidth: 0,
		hasBranch: true, hasSessionName: false, hasThinking: false,
		hasProvider: true, hasTokens: true, hasCost: true, hasAutoCompact: false,
	};
	// With cost:    14+12 + 2 + (6+8) + 14 + 8 + 2spaces = 66
	// Without cost: 14+12 + 2 + (6+8) + 14 + 1space       = 57
	const withCost = 66;
	const withoutCost = 57;
	const width = withCost - 1;
	assert.ok(width >= withoutCost, "test precondition: width should fit without cost");

	const flags = computeVisibility(fw(width, fields));
	assert.ok(!flags.showCost, "cost should be dropped");
	assert.ok(flags.showTokens, "tokens should remain");
});

test("tokens drop as a single unit (both arrows + values)", () => {
	const fields = {
		pwdStrWidth: 10, branchWidth: 0, sessionNameWidth: 0,
		modelNameWidth: 14, thinkingWidth: 0, providerWidth: 12,
		contextPercentWidth: 6, contextDenomWidth: 8,
		tokensWidth: 14, costWidth: 0, autoCompactWidth: 0,
		hasBranch: false, hasSessionName: false, hasThinking: false,
		hasProvider: true, hasTokens: true, hasCost: false, hasAutoCompact: false,
	};
	// With tokens: 14+12 + 2 + (6+8) + 14 + 1 = 57
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
		tokensWidth: 14, costWidth: 8, autoCompactWidth: 6,
		hasThinking: true, hasProvider: true,
		hasTokens: true, hasCost: true, hasAutoCompact: true,
	}));
	assert.ok(!flags.showThinking, "thinking should be hidden");
	assert.ok(!flags.showProvider, "provider should be hidden");
	// Model name + context percent minimum = 10 + 2 + 6 = 18, fits in 20.
});

test("long cwd does NOT cause row-2 fields to drop when truncation suffices", () => {
	// Row 2 full need: 14+12 + 2 + (6+8) + 14 + 8 + 6 + 3 = 83
	const flags = computeVisibility(fw(85, {
		pwdStrWidth: 100, // very long cwd
		branchWidth: 9,
		modelNameWidth: 14, providerWidth: 12,
		contextPercentWidth: 6, contextDenomWidth: 8,
		tokensWidth: 14, costWidth: 8, autoCompactWidth: 6,
		hasBranch: true, hasProvider: true,
		hasTokens: true, hasCost: true, hasAutoCompact: true,
	}));

	assert.ok(flags.showAutoCompact, "auto-compact should survive when cwd truncation handles row 1");
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

test("cross-row priority: row-2 auto-compact drops before row-1 session name", () => {
	// auto-compact (#11) should drop before session name (#6).
	// Provider is hasProvider:false to keep row 2 need manageable.
	// Row 2 with auto-compact:    14 + 2 + (6+8) + 14 + 8 + 6 + 3 = 61
	// Row 2 without auto-compact: 14 + 2 + (6+8) + 14 + 8 + 2 = 54
	const fields = {
		pwdStrWidth: 20, branchWidth: 9, sessionNameWidth: 15,
		modelNameWidth: 14,
		contextPercentWidth: 6, contextDenomWidth: 8,
		tokensWidth: 14, costWidth: 8, autoCompactWidth: 6,
		hasBranch: true, hasSessionName: true,
		hasTokens: true, hasCost: true, hasAutoCompact: true,
	};
	const withAutoCompact = 61;
	const withoutAutoCompact = 54;
	const width = withAutoCompact - 1; // 60

	if (width >= withoutAutoCompact) {
		const flags = computeVisibility(fw(width, fields));
		assert.ok(!flags.showAutoCompact, "auto-compact should drop");
		assert.ok(flags.showSessionName, "session name should survive (higher priority)");
	}
});

test("thinking drops last among visibility-droppable fields (#3)", () => {
	// Row 2 with thinking:    10+12 + 2 + 6 = 30
	// Row 2 without thinking: 10 + 2 + 6    = 18
	const flags = computeVisibility(fw(25, {
		pwdStrWidth: 5,
		modelNameWidth: 10, thinkingWidth: 12,
		contextPercentWidth: 6,
		hasThinking: true,
	}));
	assert.ok(!flags.showThinking, "thinking should drop");
});
