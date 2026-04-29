# Plan Review: Git Guardrails

## Verdict
Revise before execution.

The plan is mostly aligned with the current `agent/extensions/guardrails.ts` structure: it reuses `confirmDangerousCommand`, inserts the new check in the right part of the `bash` pipeline, keeps the implementation module-private, and proposes tests in the existing style.

However, there is one material coverage gap in the proposed detection logic that should be fixed before implementation starts.

## What I verified
- Read:
  - `agent/extensions/guardrails.ts`
  - `agent/extensions/guardrails.test.ts`
- Ran baseline tests:

```bash
npx tsx --test agent/extensions/guardrails.test.ts
```

Result: `52` tests passing.

## Structural checks that pass
- The extension currently has a single `tool_call` handler with a `bash` pipeline of:
  1. dangerous command confirmation
  2. browser guardrails
  3. bash write-target extraction/protection
- Reusing `confirmDangerousCommand(...)` is the right fit for the requested git behavior.
- Adding a dedicated `checkGitGuardrails(command, ctx)` helper is consistent with the existing `checkBrowserGuardrails(...)` style.
- Inserting the git check between the existing `dangerousCommands` loop and `checkBrowserGuardrails(...)` is structurally correct.
- The proposed tests match the existing test conventions (`createToolHandler`, `assert.deepEqual` for blocks, `assert.equal(..., undefined)` for allowed flows).

## Required revision

### 1) `git clean` coverage is too narrow
The proposed pattern:

```ts
/\bgit\s+clean\s+(?:.*\s)?-[a-zA-Z]*f[a-zA-Z]*d/
```

only matches combined short flags such as:
- `git clean -fd`
- `git clean -fdx`
- `git clean -xfd`

It does **not** match common equivalent forms such as:
- `git clean -f -d`
- `git clean -d -f`
- `git clean -f -d -x`

I verified this behavior separately against the proposed regex.

Why this matters:
- These separated-flag forms are normal git usage, not edge cases.
- They are within the exact danger class the plan intends to guard.
- If the implementation ships as planned, the guardrail will miss a common destructive cleanup command while appearing to cover that category.

### Recommendation
Revise Task 1 / Task 2 so the plan explicitly covers both:
- combined forms (`-fd`, `-fdx`, `-xdf`)
- separated forms (`-f -d`, `-d -f`, optionally with `-x`)

This can be done with either:
- a broader regex strategy, or
- two simple heuristics/patterns (one for combined flags, one for separated `-f` + `-d`).

The test plan should then add at least one positive case for a separated-flag form.

## Non-blocking observation

### Protected-branch push matching is intentionally minimal
The proposed protected-branch regex only targets:
- `git push <remote> main`
- `git push <remote> master`
- `git push <remote> HEAD:main`
- `git push <remote> HEAD:master`

and intentionally does **not** catch forms like:
- `git push origin feature:main`

The plan already calls this out as a tradeoff. Given the extension philosophy, that is acceptable if intentional. I would keep the note, but I would also make the scope explicit in the implementation notes so future readers do not assume full refspec coverage.

## Suggested disposition
Update the plan to fix the `git clean` detection gap, then proceed.
