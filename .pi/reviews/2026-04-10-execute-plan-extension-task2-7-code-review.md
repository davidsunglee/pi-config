# Strengths

- The core surface area is trending in the right direction: the Task 1 contracts are cleanly separated, `ExecutionIO` is still singular-dispatch with progress hooks, and the shared plan/execution types remain readable and coherent (`agent/lib/execute-plan/types.ts:13-40`, `agent/lib/execute-plan/types.ts:163-176`, `agent/lib/execute-plan/types.ts:322-393`).
- `computeWaves()` is otherwise a solid, easy-to-follow implementation of dependency layering plus deterministic wave splitting (`agent/lib/execute-plan/wave-computation.ts:33-129`). The existing tests cover the main happy paths well, including linear, diamond, split-wave, and cycle cases (`agent/lib/execute-plan/wave-computation.test.ts`).
- `git-ops.ts` keeps git interaction behind `ExecutionIO.exec()` and makes commit formatting deterministic, which is the right shape for a pure library module (`agent/lib/execute-plan/git-ops.ts:3-114`).
- The focused test suite for the reviewed modules is substantial and currently green. I verified:
  - `cd agent && node --experimental-strip-types --test lib/execute-plan/plan-parser.test.ts lib/execute-plan/wave-computation.test.ts lib/execute-plan/model-resolver.test.ts lib/execute-plan/settings-loader.test.ts lib/execute-plan/template-filler.test.ts lib/execute-plan/git-ops.test.ts`
  - Result: 100 tests passed, 0 failed.
- A targeted TypeScript check for the reviewed modules also passes:
  - `cd agent && npx tsc --noEmit --target ESNext --module NodeNext --moduleResolution NodeNext --strict --esModuleInterop --skipLibCheck --allowImportingTsExtensions lib/execute-plan/types.ts lib/execute-plan/plan-parser.ts lib/execute-plan/wave-computation.ts lib/execute-plan/model-resolver.ts lib/execute-plan/settings-loader.ts lib/execute-plan/template-filler.ts lib/execute-plan/git-ops.ts lib/execute-plan/plan-parser.test.ts lib/execute-plan/wave-computation.test.ts lib/execute-plan/model-resolver.test.ts lib/execute-plan/settings-loader.test.ts lib/execute-plan/template-filler.test.ts lib/execute-plan/git-ops.test.ts`

# Issues

## Critical

- **Multi-dependency parsing is broken, so later scheduling can be wrong.**  
  **File:line:** `agent/lib/execute-plan/plan-parser.ts:216-227`  
  **What's wrong:** The dependency regex only captures digits/commas/spaces after the first literal `Task`, so a valid line like `- Task 3 depends on: Task 1, Task 2` is parsed as `[1]` instead of `[1, 2]`.  
  **Why it matters:** Task 2 step 3 explicitly says this parser must handle `Task 1, Task 2` forms. Losing dependencies means `computeWaves()` can place a task earlier than allowed and execute work before prerequisites are done.  
  **Evidence:** I verified this with a focused probe:
  ```bash
  cd agent && node --experimental-strip-types --input-type=module <<'EOF'
  import { parsePlan } from './lib/execute-plan/plan-parser.ts';
  // plan omitted for brevity; Dependencies section contains:
  // - Task 3 depends on: Task 1, Task 2
  const plan = parsePlan(content, 'x.md');
  console.log(JSON.stringify([...plan.dependencies.entries()]));
  EOF
  ```
  Output:
  ```json
  [[3,[1]]]
  ```

## Important

- **`sourceTodoId` only parses the backticked variant, not the format required by the task spec.**  
  **File:line:** `agent/lib/execute-plan/plan-parser.ts:256-262`  
  **What's wrong:** `parseSourceTodoId()` requires ``**Source:** `TODO-<id>` ``. Task 2 says to extract `**Source:** TODO-<id>`, and the existing plan format used elsewhere in the repo also documents the plain, non-backticked form.  
  **Why it matters:** This silently drops source-todo metadata from valid plans, which will break the later deterministic todo-closing flow that depends on `plan.sourceTodoId`.  
  **Evidence:** I verified that a plain `**Source:** TODO-abc123ef` line returns `null`:
  ```json
  { "sourceTodoId": null }
  ```

- **Malformed `crossProvider` config is accepted instead of rejected with a clear error.**  
  **File:line:** `agent/lib/execute-plan/settings-loader.ts:89-103`  
  **What's wrong:** If `crossProvider` is present but incomplete or malformed, `loadModelTiers()` silently drops it and still returns `{ ok: true }`.  
  **Why it matters:** Task 5 requires clear errors for malformed config. Silent acceptance turns a bad settings file into a hidden fallback, which makes review-model selection non-obvious and harder to debug.  
  **Evidence:** I verified this with:
  ```bash
  cd agent && node --experimental-strip-types --input-type=module <<'EOF'
  import { loadModelTiers } from './lib/execute-plan/settings-loader.ts';
  const io = {
    async readFile() {
      return JSON.stringify({
        modelTiers: {
          capable: 'capable-model',
          standard: 'standard-model',
          cheap: 'cheap-model',
          crossProvider: { capable: 'cp-capable' }
        }
      });
    }
  };
  console.log(JSON.stringify(await loadModelTiers(io, '/agent'), null, 2));
  EOF
  ```
  Output:
  ```json
  {
    "ok": true,
    "tiers": {
      "capable": "capable-model",
      "standard": "standard-model",
      "cheap": "cheap-model"
    }
  }
  ```

- **The TDD block no longer matches the canonical execute-plan instructions.**  
  **File:line:** `agent/lib/execute-plan/template-filler.ts:27-32` and `agent/skills/execute-plan/SKILL.md:257-273`  
  **What's wrong:** The filler emits a short four-line block beginning `## TDD Required`, while the current execute-plan skill defines a specific `## Test-Driven Development` block with the full red/green/refactor loop, explicit failure verification, and the `No production code without a failing test first` rule.  
  **Why it matters:** Task 6 acceptance explicitly says the TDD block must match existing `SKILL.md` content. The current implementation weakens the worker contract right where the plan asked for fidelity.  
  **Evidence:** A direct comparison shows the strings are not the same (`sameText: false`).

- **`computeWaves()` can crash with a raw `TypeError` on invalid dependency-map keys instead of producing a clear validation error.**  
  **File:line:** `agent/lib/execute-plan/wave-computation.ts:22-31`, `agent/lib/execute-plan/wave-computation.ts:43-49`, `agent/lib/execute-plan/wave-computation.ts:74-85`  
  **What's wrong:** The function validates dependency *targets* but not dependency-map *keys*. If `dependencies` includes an entry for a task number that is not in `tasks`, the algorithm later queues that nonexistent task and blows up at `dependents.get(current)!`.  
  **Why it matters:** Task 3 calls for clear errors on invalid dependency input. As written, malformed input can take the engine down with an internal exception instead of a useful message.  
  **Evidence:** A focused probe with `new Map([[99, [1]]])` throws:
  ```text
  TypeError: dependents.get is not a function or its return value is not iterable
      at computeWaves (.../agent/lib/execute-plan/wave-computation.ts:74:40)
  ```

## Minor

- **The earlier Task 1 cancellation-schema gap is still unresolved.**  
  **File:line:** `agent/lib/execute-plan/types.ts:158-176`  
  **What's wrong:** `CancellationState` is defined, but `RunState` still has no field that actually persists that structure.  
  **Why it matters:** You asked for unresolved Task 1 contract issues to be called out in this cumulative review. This is the same state-schema gap noted in the earlier Task 1 review, and it still means the persisted run-state contract is incomplete.

# Recommendations

- Fix `parseDependencies()` first and add a regression test for `- Task 3 depends on: Task 1, Task 2` in `agent/lib/execute-plan/plan-parser.test.ts`. Right now the most serious functional issue is a parser bug that can invalidate downstream wave computation.
- Broaden `parseSourceTodoId()` to accept the specified plain format `**Source:** TODO-<id>` and, if desired for compatibility, also accept the backticked variant used by the current fixture.
- Tighten `loadModelTiers()` so `crossProvider` is truly optional, but if it is present it must be structurally valid (`capable` and `standard` both required strings) or return `{ ok: false, error: ... }`.
- Replace the hard-coded TDD block in `template-filler.ts` with the exact canonical text from `agent/skills/execute-plan/SKILL.md`, then snapshot-test the exact filled output so this does not drift again.
- Add one negative test for invalid dependency-map keys in `agent/lib/execute-plan/wave-computation.test.ts` so `computeWaves()` guarantees a clear domain error instead of an internal exception.
- Before moving deeper into engine/state-manager work, close the remaining Task 1 cancellation-schema gap so later tasks are not forced to work around an incomplete persisted contract.

# Assessment

**Ready to merge?** No.

**Reasoning:** The overall direction is good, the focused tests are mostly strong, and the reviewed modules do compile cleanly in isolation. But Task 2 still has a real correctness bug in multi-dependency parsing, and there are additional spec-compliance gaps in source-todo parsing, malformed settings validation, template fidelity, and invalid-dependency handling. Those should be fixed before treating Tasks 2-7 as production-ready.