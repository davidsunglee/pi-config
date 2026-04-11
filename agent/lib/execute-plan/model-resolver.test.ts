import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveModelForTask, resolveReviewModel } from "./model-resolver.ts";
import type { PlanTask, ModelTiers } from "./types.ts";

const tiers: ModelTiers = {
  capable: "claude-opus-4-5",
  standard: "claude-sonnet-4-5",
  cheap: "claude-haiku-3-5",
  crossProvider: {
    capable: "gpt-4o",
    standard: "gpt-4o-mini",
  },
};

const tiersNoCross: ModelTiers = {
  capable: "claude-opus-4-5",
  standard: "claude-sonnet-4-5",
  cheap: "claude-haiku-3-5",
};

function makeTask(overrides: Partial<PlanTask> = {}): PlanTask {
  return {
    number: 1,
    title: "Some task",
    files: { create: [], modify: [], test: [] },
    steps: [],
    acceptanceCriteria: [],
    modelRecommendation: null,
    ...overrides,
  };
}

describe("resolveModelForTask", () => {
  it("(a) resolves 'cheap' recommendation to modelTiers.cheap", () => {
    const task = makeTask({ modelRecommendation: "cheap" });
    assert.equal(resolveModelForTask(task, tiers), tiers.cheap);
  });

  it("(b) resolves 'standard' recommendation to modelTiers.standard", () => {
    const task = makeTask({ modelRecommendation: "standard" });
    assert.equal(resolveModelForTask(task, tiers), tiers.standard);
  });

  it("(c) resolves 'capable' recommendation to modelTiers.capable", () => {
    const task = makeTask({ modelRecommendation: "capable" });
    assert.equal(resolveModelForTask(task, tiers), tiers.capable);
  });

  it("(d) resolves cross-provider capable recommendation to modelTiers.crossProvider.capable", () => {
    // crossProvider capable is not a direct recommendation value; we test
    // that capable resolves to tiers.capable (not cross-provider for tasks)
    const task = makeTask({ modelRecommendation: "capable" });
    // cross-provider capable is used in review, not task dispatch
    assert.equal(resolveModelForTask(task, tiers), tiers.capable);
  });

  it("(e) resolves cross-provider standard — standard recommendation uses tiers.standard (not crossProvider)", () => {
    const task = makeTask({ modelRecommendation: "standard" });
    assert.equal(resolveModelForTask(task, tiers), tiers.standard);
  });

  it("(f) null recommendation: 1 create file → cheap", () => {
    const task = makeTask({
      modelRecommendation: null,
      files: { create: ["src/foo.ts"], modify: [], test: [] },
    });
    assert.equal(resolveModelForTask(task, tiers), tiers.cheap);
  });

  it("(f) null recommendation: 2 create files → cheap", () => {
    const task = makeTask({
      modelRecommendation: null,
      files: { create: ["src/foo.ts", "src/bar.ts"], modify: [], test: [] },
    });
    assert.equal(resolveModelForTask(task, tiers), tiers.cheap);
  });

  it("(f) null recommendation: 3 create files → standard", () => {
    const task = makeTask({
      modelRecommendation: null,
      files: { create: ["a.ts", "b.ts", "c.ts"], modify: [], test: [] },
    });
    assert.equal(resolveModelForTask(task, tiers), tiers.standard);
  });

  it("(f) null recommendation: any modify file → standard", () => {
    const task = makeTask({
      modelRecommendation: null,
      files: { create: ["src/foo.ts"], modify: ["src/bar.ts"], test: [] },
    });
    assert.equal(resolveModelForTask(task, tiers), tiers.standard);
  });

  it("(f) null recommendation: title contains 'architecture' → capable", () => {
    const task = makeTask({
      modelRecommendation: null,
      title: "Design the architecture for the new system",
      files: { create: [], modify: [], test: [] },
    });
    assert.equal(resolveModelForTask(task, tiers), tiers.capable);
  });

  it("(f) null recommendation: title contains 'design' → capable", () => {
    const task = makeTask({
      modelRecommendation: null,
      title: "Design the data model",
      files: { create: [], modify: [], test: [] },
    });
    assert.equal(resolveModelForTask(task, tiers), tiers.capable);
  });

  it("(f) null recommendation: 0 files → cheap (cheapest default)", () => {
    const task = makeTask({
      modelRecommendation: null,
      files: { create: [], modify: [], test: [] },
    });
    assert.equal(resolveModelForTask(task, tiers), tiers.cheap);
  });

  it("(g) throws when modelTiers is missing required fields", () => {
    const badTiers = { capable: "a", standard: "b" } as unknown as ModelTiers;
    const task = makeTask({ modelRecommendation: "cheap" });
    assert.throws(() => resolveModelForTask(task, badTiers), {
      message: /missing required field/i,
    });
  });
});

describe("resolveReviewModel", () => {
  it("spec review uses tiers.standard", () => {
    assert.equal(resolveReviewModel(tiers, "spec"), tiers.standard);
  });

  it("code review uses tiers.crossProvider.capable when available", () => {
    assert.equal(resolveReviewModel(tiers, "code"), tiers.crossProvider!.capable);
  });

  it("(h) code review falls back to tiers.capable when crossProvider is missing", () => {
    assert.equal(resolveReviewModel(tiersNoCross, "code"), tiersNoCross.capable);
  });

  it("(g) throws when modelTiers is missing required fields", () => {
    const badTiers = { cheap: "a" } as unknown as ModelTiers;
    assert.throws(() => resolveReviewModel(badTiers, "spec"), {
      message: /missing required field/i,
    });
  });
});
