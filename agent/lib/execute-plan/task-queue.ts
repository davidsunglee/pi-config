import type { ExecutionIO, SubagentConfig, SubagentResult } from "./types.ts";

export class TaskQueue {
  /** Prevents launching new tasks after current in-flight ones complete. */
  private stopped = false;
  private io: ExecutionIO;
  private concurrency: number;

  constructor(io: ExecutionIO, concurrency: number) {
    this.io = io;
    this.concurrency = concurrency;
  }

  /**
   * Stop launching new tasks after current in-flight tasks complete.
   * Equivalent to a wave-level cancel — in-flight tasks run to completion,
   * but the queue will not pull any more items.
   */
  abortAfterCurrent(): void {
    this.stopped = true;
  }

  /**
   * Alias for abortAfterCurrent(). At the queue level, draining and stopping
   * after the current wave is the same operation — let in-flight finish,
   * don't launch new tasks.
   */
  drainAndStop(): void {
    this.abortAfterCurrent();
  }

  /**
   * Run all configs with bounded concurrency.
   *
   * @returns Map keyed by taskNumber for every task that actually completed.
   *   Tasks that were never launched (e.g. due to abort) are omitted.
   */
  async run(
    configs: SubagentConfig[],
    options?: {
      signal?: AbortSignal;
      onTaskStart?: (taskNumber: number) => void;
      onTaskComplete?: (result: SubagentResult) => void;
      onTaskProgress?: (taskNumber: number, status: string) => void;
    },
  ): Promise<Map<number, SubagentResult>> {
    // Reset stopped flag at the start of each run
    this.stopped = false;

    const signal = options?.signal;
    const onTaskStart = options?.onTaskStart;
    const onTaskComplete = options?.onTaskComplete;
    const onTaskProgress = options?.onTaskProgress;

    const results = new Map<number, SubagentResult>();
    const queue = [...configs];
    const inFlight = new Set<Promise<void>>();

    /**
     * Launch the next task from the queue if a slot is available and
     * neither the external signal nor the internal stop flag is set.
     */
    const launchNext = (): void => {
      while (
        inFlight.size < this.concurrency &&
        queue.length > 0 &&
        !this.stopped &&
        !(signal?.aborted)
      ) {
        const config = queue.shift()!;

        const task = (async () => {
          onTaskStart?.(config.taskNumber);
          const result = await this.io.dispatchSubagent(config, {
            signal,
            onProgress: onTaskProgress,
          });
          results.set(config.taskNumber, result);
          onTaskComplete?.(result);
        })()
          .catch(() => {
            // Swallow errors from individual tasks; they do not contribute
            // to the results map. The caller observes absence in the map.
          })
          .finally(() => {
            inFlight.delete(task);
            // As soon as a slot opens, try to fill it
            launchNext();
          });

        inFlight.add(task);
      }
    };

    // Seed the initial batch
    launchNext();

    // Wait for all in-flight tasks to settle
    while (inFlight.size > 0) {
      await Promise.race(inFlight);
    }

    return results;
  }
}
