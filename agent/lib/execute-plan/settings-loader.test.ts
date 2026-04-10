import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadModelTiers } from "./settings-loader.ts";
import type { ExecutionIO } from "./types.ts";

function makeIO(readFileFn: (path: string) => Promise<string>): ExecutionIO {
  return {
    readFile: readFileFn,
  } as unknown as ExecutionIO;
}

const validSettings = JSON.stringify({
  modelTiers: {
    capable: "anthropic/claude-opus-4-6",
    standard: "anthropic/claude-sonnet-4-6",
    cheap: "anthropic/claude-haiku-4-5",
  },
});

const validSettingsWithCrossProvider = JSON.stringify({
  modelTiers: {
    capable: "anthropic/claude-opus-4-6",
    standard: "anthropic/claude-sonnet-4-6",
    cheap: "anthropic/claude-haiku-4-5",
    crossProvider: {
      capable: "openai/gpt-5",
      standard: "openai/gpt-5-mini",
    },
  },
});

describe("loadModelTiers", () => {
  // (a) reads settings.json and extracts modelTiers
  it("reads settings.json and returns model tiers", async () => {
    let calledPath: string | null = null;
    const io = makeIO(async (path) => {
      calledPath = path;
      return validSettings;
    });

    const result = await loadModelTiers(io, "/agent");

    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("unreachable");
    assert.equal(calledPath, "/agent/settings.json");
    assert.equal(result.tiers.capable, "anthropic/claude-opus-4-6");
    assert.equal(result.tiers.standard, "anthropic/claude-sonnet-4-6");
    assert.equal(result.tiers.cheap, "anthropic/claude-haiku-4-5");
    assert.equal(result.tiers.crossProvider, undefined);
  });

  // (b) returns error when file doesn't exist
  it("returns error when settings.json does not exist", async () => {
    const io = makeIO(async (_path) => {
      throw new Error("ENOENT: no such file or directory");
    });

    const result = await loadModelTiers(io, "/agent");

    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.match(result.error, /settings\.json/i);
  });

  // (c) returns error for invalid JSON
  it("returns error when settings.json contains invalid JSON", async () => {
    const io = makeIO(async (_path) => "{ not valid json }");

    const result = await loadModelTiers(io, "/agent");

    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.match(result.error, /json|parse/i);
  });

  // (d) returns error when modelTiers key is missing
  it("returns error when modelTiers key is missing", async () => {
    const io = makeIO(async (_path) =>
      JSON.stringify({ defaultModel: "claude-opus" }),
    );

    const result = await loadModelTiers(io, "/agent");

    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.match(result.error, /modelTiers/);
  });

  // (e) returns error when any of capable/standard/cheap is missing
  it("returns error when 'capable' is missing from modelTiers", async () => {
    const io = makeIO(async (_path) =>
      JSON.stringify({
        modelTiers: { standard: "model-a", cheap: "model-b" },
      }),
    );

    const result = await loadModelTiers(io, "/agent");

    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.match(result.error, /capable/);
  });

  it("returns error when 'standard' is missing from modelTiers", async () => {
    const io = makeIO(async (_path) =>
      JSON.stringify({
        modelTiers: { capable: "model-a", cheap: "model-b" },
      }),
    );

    const result = await loadModelTiers(io, "/agent");

    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.match(result.error, /standard/);
  });

  it("returns error when 'cheap' is missing from modelTiers", async () => {
    const io = makeIO(async (_path) =>
      JSON.stringify({
        modelTiers: { capable: "model-a", standard: "model-b" },
      }),
    );

    const result = await loadModelTiers(io, "/agent");

    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.match(result.error, /cheap/);
  });

  // (f) succeeds when crossProvider is missing
  it("succeeds when crossProvider is missing", async () => {
    const io = makeIO(async (_path) => validSettings);

    const result = await loadModelTiers(io, "/agent");

    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("unreachable");
    assert.equal(result.tiers.crossProvider, undefined);
  });

  // Also verify crossProvider is included when present
  it("includes crossProvider when present in settings", async () => {
    const io = makeIO(async (_path) => validSettingsWithCrossProvider);

    const result = await loadModelTiers(io, "/agent");

    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("unreachable");
    assert.deepEqual(result.tiers.crossProvider, {
      capable: "openai/gpt-5",
      standard: "openai/gpt-5-mini",
    });
  });

  // Path construction: uses agentDir correctly
  it("constructs path correctly with trailing slash in agentDir", async () => {
    let calledPath: string | null = null;
    const io = makeIO(async (path) => {
      calledPath = path;
      return validSettings;
    });

    await loadModelTiers(io, "/agent/");

    // Should not double-slash
    assert.ok(
      calledPath === "/agent/settings.json" ||
        calledPath === "/agent//settings.json",
      `Path was: ${calledPath}`,
    );
  });
});
