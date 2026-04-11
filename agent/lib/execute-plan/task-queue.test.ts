import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TaskQueue } from "./task-queue.ts";
import type {
  ExecutionIO,
  SubagentConfig,
  SubagentResult,
} from "./types.ts";

// ── Helpers ──────────────────────────────────────────────────────────

function makeConfig(taskNumber: number): SubagentConfig {
  return {
    agent: "test-agent",
    taskNumber,
    task: `Task ${taskNumber}`,
    model: "test-model",
    cwd: "/tmp",
  };
}

function makeResult(taskNumber: number): SubagentResult {
  return {
    taskNumber,
    status: "DONE" as const,
    output: "",
    concerns: null,
    needs: null,
    blocker: null,
    filesChanged: [],
  };
}

function createMockIO(
  handler: (
    config: SubagentConfig,
    options?: { signal?: AbortSignal; onProgress?: (taskNumber: number, status: string) => void },
  ) => Promise<SubagentResult>,
): ExecutionIO {
  return {
    dispatchSubagent: async (
      config: SubagentConfig,
      options?: { signal?: AbortSignal; onProgress?: (taskNumber: number, status: string) => void },
    ) => {
      return handler(config, options);
    },
  } as unknown as ExecutionIO;
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("TaskQueue", () => {
  // (a) Runs tasks up to concurrency limit
  it("runs tasks up to concurrency limit", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    const concurrency = 3;
    const configs = Array.from({ length: 6 }, (_, i) => makeConfig(i + 1));

    const io = createMockIO(async (config) => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 20));
      concurrent--;
      return makeResult(config.taskNumber);
    });

    const queue = new TaskQueue(io, concurrency);
    await queue.run(configs);

    assert.equal(maxConcurrent, concurrency, `Max concurrent should be ${concurrency}`);
  });

  // (b) Queues excess tasks and runs them as slots free up
  it("queues excess tasks and runs them as slots free up", async () => {
    const order: number[] = [];
    const concurrency = 2;
    const configs = Array.from({ length: 4 }, (_, i) => makeConfig(i + 1));

    const io = createMockIO(async (config) => {
      order.push(config.taskNumber);
      await new Promise((r) => setTimeout(r, 10));
      return makeResult(config.taskNumber);
    });

    const queue = new TaskQueue(io, concurrency);
    const results = await queue.run(configs);

    // All 4 tasks should have run
    assert.equal(results.size, 4);
    assert.ok(order.includes(1));
    assert.ok(order.includes(2));
    assert.ok(order.includes(3));
    assert.ok(order.includes(4));
    // First 2 launch immediately, next 2 only after slots free
    assert.deepEqual(order.slice(0, 2).sort((a, b) => a - b), [1, 2]);
  });

  // (c) With concurrency 1 runs tasks sequentially
  it("runs tasks sequentially with concurrency 1", async () => {
    const order: number[] = [];
    const configs = Array.from({ length: 4 }, (_, i) => makeConfig(i + 1));

    const io = createMockIO(async (config) => {
      order.push(config.taskNumber);
      await new Promise((r) => setTimeout(r, 5));
      return makeResult(config.taskNumber);
    });

    const queue = new TaskQueue(io, 1);
    const results = await queue.run(configs);

    assert.equal(results.size, 4);
    assert.deepEqual(order, [1, 2, 3, 4]);
  });

  // (d) Aborting the signal stops new tasks from launching but lets in-flight complete
  it("aborting signal stops new tasks but lets in-flight tasks complete", async () => {
    const started: number[] = [];
    const completed: number[] = [];
    const concurrency = 2;
    const configs = Array.from({ length: 5 }, (_, i) => makeConfig(i + 1));
    const controller = new AbortController();

    const io = createMockIO(async (config) => {
      started.push(config.taskNumber);
      // Abort after first two tasks have started
      if (started.length === 2) {
        controller.abort();
      }
      await new Promise((r) => setTimeout(r, 30));
      completed.push(config.taskNumber);
      return makeResult(config.taskNumber);
    });

    const queue = new TaskQueue(io, concurrency);
    const results = await queue.run(configs, { signal: controller.signal });

    // Only the 2 in-flight tasks should have completed
    assert.equal(completed.length, 2);
    // Results map only has the tasks that actually ran
    assert.equal(results.size, 2);
    // Tasks 3, 4, 5 should not be in results
    assert.ok(!results.has(3));
    assert.ok(!results.has(4));
    assert.ok(!results.has(5));
  });

  // (e) run() returns a Map<number, SubagentResult> of all completed tasks
  it("returns a Map keyed by taskNumber", async () => {
    const configs = [makeConfig(10), makeConfig(20), makeConfig(30)];
    const io = createMockIO(async (config) => makeResult(config.taskNumber));

    const queue = new TaskQueue(io, 3);
    const results = await queue.run(configs);

    assert.ok(results instanceof Map);
    assert.equal(results.size, 3);
    assert.equal(results.get(10)?.taskNumber, 10);
    assert.equal(results.get(20)?.taskNumber, 20);
    assert.equal(results.get(30)?.taskNumber, 30);
  });

  // (f) Tasks that were never launched (due to abort) are not in the result map
  it("does not include never-launched tasks in results", async () => {
    const started: number[] = [];
    const concurrency = 1;
    const configs = Array.from({ length: 5 }, (_, i) => makeConfig(i + 1));
    const controller = new AbortController();

    const io = createMockIO(async (config) => {
      started.push(config.taskNumber);
      if (started.length === 1) {
        controller.abort();
      }
      await new Promise((r) => setTimeout(r, 10));
      return makeResult(config.taskNumber);
    });

    const queue = new TaskQueue(io, concurrency);
    const results = await queue.run(configs, { signal: controller.signal });

    // Only task 1 should be in the results
    assert.equal(results.size, 1);
    assert.ok(results.has(1));
    assert.ok(!results.has(2));
    assert.ok(!results.has(3));
  });

  // (g) abortAfterCurrent() stops launching, returns partial results
  it("abortAfterCurrent() stops new launches but completes in-flight", async () => {
    const started: number[] = [];
    const completed: number[] = [];
    const concurrency = 2;
    const configs = Array.from({ length: 6 }, (_, i) => makeConfig(i + 1));
    let queueRef!: TaskQueue;

    const io = createMockIO(async (config) => {
      started.push(config.taskNumber);
      // Abort after the first wave of 2 has started
      if (started.length === 2) {
        queueRef.abortAfterCurrent();
      }
      await new Promise((r) => setTimeout(r, 20));
      completed.push(config.taskNumber);
      return makeResult(config.taskNumber);
    });

    queueRef = new TaskQueue(io, concurrency);
    const results = await queueRef.run(configs);

    // The first 2 should complete
    assert.equal(completed.length, 2);
    assert.equal(results.size, 2);
    // Tasks 3-6 should not be in results
    assert.ok(!results.has(3));
    assert.ok(!results.has(4));
    assert.ok(!results.has(5));
    assert.ok(!results.has(6));
  });

  // (h) drainAndStop() (wave-level cancel) lets in-flight finish, stops after wave
  it("drainAndStop() is equivalent to abortAfterCurrent() for the queue", async () => {
    const started: number[] = [];
    const completed: number[] = [];
    const concurrency = 2;
    const configs = Array.from({ length: 6 }, (_, i) => makeConfig(i + 1));
    let queueRef!: TaskQueue;

    const io = createMockIO(async (config) => {
      started.push(config.taskNumber);
      // Call drainAndStop after the first 2 have started
      if (started.length === 2) {
        queueRef.drainAndStop();
      }
      await new Promise((r) => setTimeout(r, 20));
      completed.push(config.taskNumber);
      return makeResult(config.taskNumber);
    });

    queueRef = new TaskQueue(io, concurrency);
    const results = await queueRef.run(configs);

    // The first 2 should complete
    assert.equal(completed.length, 2);
    assert.equal(results.size, 2);
    // Tasks 3-6 should not be in results
    assert.ok(!results.has(3));
    assert.ok(!results.has(4));
  });

  // onTaskComplete callback is called for each completed task
  it("calls onTaskComplete for each completed task", async () => {
    const completed: number[] = [];
    const configs = Array.from({ length: 3 }, (_, i) => makeConfig(i + 1));
    const io = createMockIO(async (config) => makeResult(config.taskNumber));

    const queue = new TaskQueue(io, 3);
    await queue.run(configs, {
      onTaskComplete: (result) => completed.push(result.taskNumber),
    });

    assert.deepEqual(completed.sort((a, b) => a - b), [1, 2, 3]);
  });

  // onTaskProgress is passed through to dispatchSubagent
  it("passes onTaskProgress to dispatchSubagent", async () => {
    const progressCalls: Array<{ taskNumber: number; status: string }> = [];
    const configs = [makeConfig(1)];

    const io = createMockIO(async (config, options) => {
      // Simulate calling progress
      options?.onProgress?.(config.taskNumber, "working");
      return makeResult(config.taskNumber);
    });

    const queue = new TaskQueue(io, 1);
    await queue.run(configs, {
      onTaskProgress: (taskNumber, status) => {
        progressCalls.push({ taskNumber, status });
      },
    });

    assert.equal(progressCalls.length, 1);
    assert.equal(progressCalls[0].taskNumber, 1);
    assert.equal(progressCalls[0].status, "working");
  });
});
