import type { PlanTask, PlanDependencies, Wave } from "./types.ts";

const MAX_WAVE_SIZE = 7;

/**
 * Compute execution waves for a set of plan tasks given their dependencies.
 *
 * Algorithm:
 * 1. Validate all dependency references point to existing tasks.
 * 2. Topologically sort using Kahn's algorithm (detects cycles).
 * 3. Assign each task to the earliest wave where all its dependencies are
 *    satisfied (wave = max(dep waves) + 1, or wave 1 if no deps).
 * 4. Split any resulting wave with >MAX_WAVE_SIZE tasks into sequential
 *    sub-waves of ≤MAX_WAVE_SIZE, re-numbering all waves sequentially.
 */
export function computeWaves(
  tasks: PlanTask[],
  dependencies: PlanDependencies,
): Wave[] {
  const taskNumbers = new Set(tasks.map((t) => t.number));

  // Step 1: Validate all dependency references
  for (const [taskNum, deps] of dependencies) {
    for (const dep of deps) {
      if (!taskNumbers.has(dep)) {
        throw new Error(
          `Task ${taskNum} depends on task ${dep}, which does not exist in the task list.`,
        );
      }
    }
  }

  // Step 2: Assign wave numbers via Kahn's algorithm (BFS topological sort)
  // Build in-degree map and adjacency list (dep -> dependents)
  const inDegree = new Map<number, number>();
  const dependents = new Map<number, number[]>(); // taskNum -> tasks that depend on it

  for (const num of taskNumbers) {
    inDegree.set(num, 0);
    dependents.set(num, []);
  }

  for (const [taskNum, deps] of dependencies) {
    if (deps.length > 0) {
      inDegree.set(taskNum, deps.length);
    }
    for (const dep of deps) {
      dependents.get(dep)!.push(taskNum);
    }
  }

  // Step 3: BFS-style wave assignment
  // Each task's wave = max wave of its dependencies + 1
  const waveOf = new Map<number, number>();
  const queue: number[] = [];

  // Seed with tasks that have no dependencies
  for (const [num, degree] of inDegree) {
    if (degree === 0) {
      queue.push(num);
      waveOf.set(num, 1);
    }
  }

  // Remaining in-degree counter to detect cycles
  const remaining = new Map(inDegree);
  let processed = 0;

  while (queue.length > 0) {
    const current = queue.shift()!;
    processed++;
    const currentWave = waveOf.get(current)!;

    for (const dependent of dependents.get(current)!) {
      // Update the wave for the dependent: it must be at least currentWave + 1
      const existingWave = waveOf.get(dependent) ?? 0;
      if (currentWave + 1 > existingWave) {
        waveOf.set(dependent, currentWave + 1);
      }

      const newDegree = remaining.get(dependent)! - 1;
      remaining.set(dependent, newDegree);
      if (newDegree === 0) {
        queue.push(dependent);
      }
    }
  }

  // If not all tasks were processed, there's a cycle
  if (processed < taskNumbers.size) {
    const cycleNodes = [...taskNumbers].filter((n) => !waveOf.has(n));
    throw new Error(
      `Cyclic dependency detected among tasks: ${cycleNodes.join(", ")}.`,
    );
  }

  // Step 4: Group tasks by wave number
  const waveGroups = new Map<number, number[]>();
  for (const [taskNum, wave] of waveOf) {
    if (!waveGroups.has(wave)) {
      waveGroups.set(wave, []);
    }
    waveGroups.get(wave)!.push(taskNum);
  }

  // Step 5: Build ordered waves (sorted by wave number), splitting large waves
  const sortedWaveNumbers = [...waveGroups.keys()].sort((a, b) => a - b);
  const result: Wave[] = [];
  let waveCounter = 1;

  for (const waveNum of sortedWaveNumbers) {
    const taskNums = waveGroups.get(waveNum)!;
    // Sort task numbers for deterministic output
    taskNums.sort((a, b) => a - b);

    if (taskNums.length <= MAX_WAVE_SIZE) {
      result.push({ number: waveCounter++, taskNumbers: taskNums });
    } else {
      // Split into sub-waves of at most MAX_WAVE_SIZE
      for (let i = 0; i < taskNums.length; i += MAX_WAVE_SIZE) {
        result.push({
          number: waveCounter++,
          taskNumbers: taskNums.slice(i, i + MAX_WAVE_SIZE),
        });
      }
    }
  }

  return result;
}
