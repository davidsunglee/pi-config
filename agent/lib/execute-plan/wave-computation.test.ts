import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeWaves } from "./wave-computation.ts";
import type { PlanTask, PlanDependencies } from "./types.ts";

function makeTask(number: number): PlanTask {
  return {
    number,
    title: `Task ${number}`,
    files: { create: [], modify: [], test: [] },
    steps: [],
    acceptanceCriteria: [],
    modelRecommendation: null,
  };
}

describe("computeWaves", () => {
  // (a) tasks with no dependencies all go in wave 1
  it("places all independent tasks in wave 1", () => {
    const tasks = [makeTask(1), makeTask(2), makeTask(3)];
    const deps: PlanDependencies = new Map();
    const waves = computeWaves(tasks, deps);
    assert.equal(waves.length, 1);
    assert.equal(waves[0].number, 1);
    assert.deepEqual(waves[0].taskNumbers.sort((a, b) => a - b), [1, 2, 3]);
  });

  // (b) tasks depending on wave 1 tasks go in wave 2
  it("places dependent tasks in wave 2", () => {
    const tasks = [makeTask(1), makeTask(2), makeTask(3)];
    // task 2 depends on task 1, task 3 depends on task 1
    const deps: PlanDependencies = new Map([
      [2, [1]],
      [3, [1]],
    ]);
    const waves = computeWaves(tasks, deps);
    assert.equal(waves.length, 2);
    assert.deepEqual(waves[0].taskNumbers, [1]);
    assert.deepEqual(waves[1].taskNumbers.sort((a, b) => a - b), [2, 3]);
  });

  // (c) transitive dependencies produce wave 3+
  it("handles transitive dependencies producing wave 3", () => {
    const tasks = [makeTask(1), makeTask(2), makeTask(3)];
    // linear: 1 <- 2 <- 3
    const deps: PlanDependencies = new Map([
      [2, [1]],
      [3, [2]],
    ]);
    const waves = computeWaves(tasks, deps);
    assert.equal(waves.length, 3);
    assert.deepEqual(waves[0].taskNumbers, [1]);
    assert.deepEqual(waves[1].taskNumbers, [2]);
    assert.deepEqual(waves[2].taskNumbers, [3]);
  });

  // (d) wave with >7 tasks splits into sub-waves of ≤7
  it("splits waves with more than 7 tasks into sub-waves", () => {
    const tasks = Array.from({ length: 10 }, (_, i) => makeTask(i + 1));
    // no dependencies — all 10 go in wave 1, should be split
    const deps: PlanDependencies = new Map();
    const waves = computeWaves(tasks, deps);
    assert.ok(waves.length >= 2, "Should split into at least 2 waves");
    for (const wave of waves) {
      assert.ok(
        wave.taskNumbers.length <= 7,
        `Wave ${wave.number} has ${wave.taskNumbers.length} tasks (max 7)`,
      );
    }
    // All task numbers should be present across all waves
    const allTasks = waves.flatMap((w) => w.taskNumbers).sort((a, b) => a - b);
    assert.deepEqual(allTasks, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  // (e) cyclic dependency detection should error
  it("throws on cyclic dependency", () => {
    const tasks = [makeTask(1), makeTask(2), makeTask(3)];
    // 1 -> 2 -> 3 -> 1 (cycle)
    const deps: PlanDependencies = new Map([
      [2, [1]],
      [3, [2]],
      [1, [3]],
    ]);
    assert.throws(
      () => computeWaves(tasks, deps),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /cycl/i);
        return true;
      },
    );
  });

  // (f) dependency on non-existent task should error
  it("throws on dependency referencing non-existent task", () => {
    const tasks = [makeTask(1), makeTask(2)];
    // task 2 depends on task 99 which doesn't exist
    const deps: PlanDependencies = new Map([[2, [99]]]);
    assert.throws(
      () => computeWaves(tasks, deps),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /99/);
        return true;
      },
    );
  });

  // (g) diamond dependency pattern produces correct waves
  it("handles diamond dependency pattern", () => {
    // Diamond: 1 <- 2 <- 4, 1 <- 3 <- 4
    const tasks = [makeTask(1), makeTask(2), makeTask(3), makeTask(4)];
    const deps: PlanDependencies = new Map([
      [2, [1]],
      [3, [1]],
      [4, [2, 3]],
    ]);
    const waves = computeWaves(tasks, deps);
    assert.equal(waves.length, 3);
    assert.deepEqual(waves[0].taskNumbers, [1]);
    assert.deepEqual(waves[1].taskNumbers.sort((a, b) => a - b), [2, 3]);
    assert.deepEqual(waves[2].taskNumbers, [4]);
  });

  // Wave numbers should be sequential starting from 1
  it("assigns sequential wave numbers starting from 1", () => {
    const tasks = [makeTask(1), makeTask(2), makeTask(3)];
    const deps: PlanDependencies = new Map([
      [2, [1]],
      [3, [2]],
    ]);
    const waves = computeWaves(tasks, deps);
    waves.forEach((wave, idx) => {
      assert.equal(wave.number, idx + 1);
    });
  });

  // (h) dependency map key referencing non-existent task should error
  it("throws on dependency map key referencing non-existent task", () => {
    const tasks = [makeTask(1), makeTask(2)];
    const deps: PlanDependencies = new Map([[99, [1]]]);
    assert.throws(
      () => computeWaves(tasks, deps),
      /non-existent.*99|99.*non-existent/i,
    );
  });

  // Split waves also get sequential numbers
  it("assigns sequential wave numbers after splitting", () => {
    const tasks = Array.from({ length: 10 }, (_, i) => makeTask(i + 1));
    const deps: PlanDependencies = new Map();
    const waves = computeWaves(tasks, deps);
    waves.forEach((wave, idx) => {
      assert.equal(wave.number, idx + 1);
    });
  });
});
