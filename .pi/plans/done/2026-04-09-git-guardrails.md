# Git Guardrails

## Goal

Add high-signal git-related guardrails to the existing `agent/extensions/guardrails.ts` extension, catching three classes of dangerous git operations: destructive local cleanup (`git reset --hard`, `git clean -fd/-fdx`), history-rewriting pushes (`git push --force` / `--force-with-lease`), and direct pushes to protected branches (`main`, `master`). All three categories use soft-confirm (i.e., `confirmDangerousCommand`) so they block in headless mode but are user-dismissable in UI mode. The implementation must be consistent with the extension's existing philosophy: simple regex heuristics, not shell parsing; pragmatic high-signal checks, not exhaustive coverage.

## Architecture Summary

The guardrails extension registers a single `tool_call` handler via `pi.on("tool_call", ...)`. For `bash` tool calls, the handler runs the command string through a sequence of checks (dangerous command patterns, browser guardrails, write-target extraction). Each check either returns a block/confirm result or `undefined` to continue. The new git guardrails slot into this same pipeline as a new check function called between the existing `dangerousCommands` loop and the browser guardrails check. Existing helpers (`confirmDangerousCommand`, `notifyIfUI`) are reused directly.

## Tech Stack

- TypeScript (ESM, `.ts` extension imports)
- Node.js built-in test runner (`node:test`, `node:assert/strict`)
- Test runner: `npx tsx --test agent/extensions/guardrails.test.ts`
- No external test framework or bundler

## File Structure

- `agent/extensions/guardrails.ts` (Modify) — Add git guardrail patterns and a `checkGitGuardrails` function
- `agent/extensions/guardrails.test.ts` (Modify) — Add comprehensive tests for all three git guardrail categories

## Tasks

### Task 1: Add git guardrail detection to `guardrails.ts`

**Files:**
- Modify: `agent/extensions/guardrails.ts`

**Steps:**

- [ ] **Step 1: Add the git guardrail pattern arrays** — Add three new pattern arrays near the existing `dangerousCommands` array (around line 48), following the same `{ pattern, desc }` shape:

  ```typescript
  const gitDestructiveLocalCommands = [
    { pattern: /\bgit\s+reset\s+(?:.*\s)?--hard\b/, desc: "git reset --hard (destructive local reset)" },
    { pattern: /\bgit\s+clean\s+(?:.*\s)?-[a-zA-Z]*f[a-zA-Z]*d/, desc: "git clean -fd (destructive file removal)" },
  ];

  const gitForcePushCommands = [
    { pattern: /\bgit\s+push\s+(?:.*\s)?--force(?:-with-lease)?\b/, desc: "git push --force (history rewrite)" },
    { pattern: /\bgit\s+push\s+(?:.*\s)?-f\b/, desc: "git push -f (history rewrite)" },
  ];

  const GIT_PROTECTED_BRANCHES = ["main", "master"];

  const gitProtectedBranchPush = new RegExp(
    `\\bgit\\s+push\\s+\\S+\\s+(?:HEAD:)?(?:${GIT_PROTECTED_BRANCHES.join("|")})\\b`
  );
  ```

  Design notes on the patterns:
  - `git reset --hard`: The `(?:.*\s)?` allows flags/refs before `--hard` (e.g. `git reset --hard HEAD~3`, `git reset origin/main --hard`). The word boundary `\b` after `--hard` prevents matching `--hard-reset` or similar hypothetical flags.
  - `git clean -fd`: Matches `-fd`, `-fdx`, `-fxd`, etc. The pattern `-[a-zA-Z]*f[a-zA-Z]*d` catches combined short flags. Note: this will also match `git clean -fdi` (interactive), which is a minor false positive — acceptable because interactive clean is rare in agent contexts and still destructive in nature.
  - `git push --force` / `--force-with-lease`: Single pattern with optional `-with-lease` suffix. Also matches the short form `-f`.
  - Protected branch push: Matches `git push <remote> main`, `git push <remote> HEAD:main`, etc. The `\S+` for remote means it catches `origin`, `upstream`, or any remote name. It does **not** catch `git push` with no explicit refspec (which pushes the current branch) — this is intentional to avoid false positives on normal `git push origin feature-branch`.

  Edge cases and tradeoffs:
  - `git push origin feature:main` (push local `feature` to remote `main`) is NOT caught because the pattern only looks for bare `main` or `HEAD:main`. This is a rare edge case and the regex complexity to handle `<local>:<remote>` refspecs is not worth the noise.
  - `develop` is deliberately excluded from `GIT_PROTECTED_BRANCHES`. It's not universally protected and would add noise for teams that use it as an active integration branch.
  - Piped constructs like `echo y | git push --force` will still be caught because the regex matches anywhere in the command string, consistent with how `dangerousCommands` works.

- [ ] **Step 2: Create the `checkGitGuardrails` function** — Add a new async function below the existing `checkBrowserGuardrails` function:

  ```typescript
  async function checkGitGuardrails(
    command: string,
    ctx: { hasUI?: boolean; ui?: { confirm?: (title: string, body: string) => Promise<boolean> } },
  ) {
    for (const { pattern, desc } of gitDestructiveLocalCommands) {
      if (pattern.test(command)) {
        return confirmDangerousCommand(ctx, desc, command);
      }
    }

    for (const { pattern, desc } of gitForcePushCommands) {
      if (pattern.test(command)) {
        return confirmDangerousCommand(ctx, desc, command);
      }
    }

    if (gitProtectedBranchPush.test(command)) {
      return confirmDangerousCommand(ctx, "direct push to protected branch", command);
    }

    return undefined;
  }
  ```

  This function follows the same early-return-on-match pattern as the existing dangerous command loop. The order matters: destructive local commands are checked first, then force pushes, then protected branch pushes. This means `git push --force origin main` will trigger the force-push guardrail (not the protected-branch one), which is the more specific and useful warning.

- [ ] **Step 3: Wire `checkGitGuardrails` into the main handler** — In the `tool_call` handler's `bash` branch, add the git guardrail check between the existing `dangerousCommands` loop and the `checkBrowserGuardrails` call. After the closing of the `for (const { pattern, desc } of dangerousCommands)` loop (around line 70), add:

  ```typescript
  const gitGuardResult = await checkGitGuardrails(command, ctx);
  if (gitGuardResult) {
    return gitGuardResult;
  }
  ```

  This placement means:
  1. Dangerous commands (recursive deletes, etc.) are checked first — these take priority.
  2. Git guardrails are checked next.
  3. Browser guardrails follow.
  4. Write-target extraction (bash writes to protected paths) is last.

- [ ] **Step 4: Verify existing tests still pass** — Run `npx tsx --test agent/extensions/guardrails.test.ts` and confirm all 52 existing tests still pass. The new patterns should not interfere with any existing test because none of the existing test commands contain `git` substrings that match the new patterns.

**Acceptance criteria:**
- Three categories of git commands are detected: destructive local, force push, protected branch push
- All use `confirmDangerousCommand` (soft-confirm: blocked headless, confirmable with UI)
- Ordinary git operations (`git add`, `git commit`, `git status`, `git diff`, `git push`, `git push origin feature-branch`, `git checkout main`) are not flagged
- All 52 existing tests continue to pass
- No new exports; all new code is module-private

**Model recommendation:** cheap

---

### Task 2: Add comprehensive git guardrail tests to `guardrails.test.ts`

**Files:**
- Modify: `agent/extensions/guardrails.test.ts`

**Steps:**

- [ ] **Step 1: Add tests for `git reset --hard` guardrail** — Append the following tests at the end of the file, after the existing "allows unrelated tool calls" test. Follow the exact same test style as existing tests. Add a `// -- Git guardrails --` section comment, then add three tests:

  1. Test `git reset --hard` blocked without UI — expects `{ block: true, reason: "Blocked git reset --hard (destructive local reset) (no UI to confirm)" }`
  2. Test `git reset --hard HEAD~3` blocked without UI — same reason
  3. Test `git reset origin/main --hard` (ref before flag) blocked without UI — same reason

- [ ] **Step 2: Add tests for `git clean` guardrail** — Add tests for various `git clean` flag combinations:

  1. Test `git clean -fd` blocked without UI — expects `{ block: true, reason: "Blocked git clean -fd (destructive file removal) (no UI to confirm)" }`
  2. Test `git clean -fdx` blocked without UI — same reason
  3. Test `git clean -xfd` blocked without UI — same reason (flags in different order)

- [ ] **Step 3: Add tests for `git push --force` guardrail** — Cover `--force`, `--force-with-lease`, and `-f` variants:

  1. Test `git push --force` blocked without UI — expects `{ block: true, reason: "Blocked git push --force (history rewrite) (no UI to confirm)" }`
  2. Test `git push --force-with-lease` blocked without UI — same reason (the `--force` pattern matches `--force-with-lease` too)
  3. Test `git push -f origin feature` blocked without UI — expects `{ block: true, reason: "Blocked git push -f (history rewrite) (no UI to confirm)" }`
  4. Test `git push origin --force` blocked without UI — expects `{ block: true, reason: "Blocked git push --force (history rewrite) (no UI to confirm)" }`

- [ ] **Step 4: Add tests for protected branch push guardrail** — Cover `main`, `master`, and `HEAD:main`/`HEAD:master` refspecs:

  1. Test `git push origin main` blocked without UI — expects `{ block: true, reason: "Blocked direct push to protected branch (no UI to confirm)" }`
  2. Test `git push origin master` blocked without UI — same reason
  3. Test `git push origin HEAD:main` blocked without UI — same reason
  4. Test `git push upstream master` blocked without UI — same reason (different remote name)

- [ ] **Step 5: Add UI confirmation flow tests for git guardrails** — Test that git guardrails can be confirmed or cancelled in UI mode, following the exact same pattern as the existing "lets users cancel dangerous commands in UI mode" and "allows dangerous commands after UI confirmation" tests:

  1. Test cancel `git reset --hard` in UI mode — creates `confirmations` array, returns `false` from `confirm`, expects `{ block: true, reason: "Blocked git reset --hard (destructive local reset) by user" }`, asserts `confirmations.length === 1` and title matches `/git reset --hard/`
  2. Test allow `git push --force` after UI confirmation — returns `true` from `confirm`, expects `result === undefined`, asserts `confirmationCount === 1`
  3. Test allow `git push origin main` after UI confirmation — returns `true` from `confirm`, expects `result === undefined`, asserts `confirmationCount === 1`

- [ ] **Step 6: Add negative tests (commands that should NOT trigger guardrails)** — These are critical to ensure the guardrails don't produce false positives on normal git operations. Each test should assert `result === undefined`:

  1. `git reset HEAD~1` (soft reset, no `--hard`)
  2. `git reset --soft HEAD~1`
  3. `git clean -nd` (dry run, no `-f`)
  4. `git push` (bare push, no remote or refspec)
  5. `git push origin feature-branch`
  6. `git push -u origin feature` (must not match `-f` pattern — `-u` is not `-f`)
  7. `git checkout main` (not a push)
  8. `git pull origin main` (not a push)
  9. `git status`, `git diff`, `git log --oneline` (ordinary read-only commands, can loop in one test)
  10. `git push origin main-feature` (branch name contains "main" as substring — must NOT trigger due to `\b` word boundary)
  11. `git push origin remaster` (branch name contains "master" as substring — must NOT trigger due to `\b` word boundary)

- [ ] **Step 7: Run the full test suite** — Run `npx tsx --test agent/extensions/guardrails.test.ts` and confirm all tests pass (52 existing + new git guardrail tests). Verify the total count matches expectations (should be approximately 52 + 28 = 80 tests).

**Acceptance criteria:**
- At least 3 positive tests for each guardrail category (destructive local, force push, protected branch)
- At least 3 UI confirmation flow tests (cancel + allow for different categories)
- At least 8 negative tests ensuring normal git operations are not flagged
- All tests pass including the original 52
- Test style matches existing conventions (inline handler creation via `createToolHandler`, `assert.deepEqual` for blocked results, `assert.equal(result, undefined)` for allowed)

**Model recommendation:** cheap

## Dependencies

- Task 2 depends on: Task 1

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `git clean` pattern matches dry-run (`-nd`) | Low | Medium (false positive noise) | The pattern requires `-f` flag: `-[a-zA-Z]*f[a-zA-Z]*d`. Dry run `-nd` has no `f`, so it won't match. Explicit negative test included. |
| Protected branch regex matches `main-feature` | Low | Medium (false positive) | The `\b` word boundary after `main`/`master` prevents substring matches. Explicit negative tests included for `main-feature` and `remaster`. |
| `git push -u origin feature` falsely matches `-f` pattern | Low | High (blocks normal pushes) | The `-f` pattern uses `\b` word boundary: `-f\b`. The flag `-u` does not contain `-f`. |
| `git push --force origin main` triggers force-push instead of protected-branch | None | Low | This is intentional — force push is checked first and is the more specific/useful warning. Both guardrails would apply, but showing force-push is correct. |
| `git push origin feature:main` refspec not caught | Low | Low | This refspec syntax is rare in agent contexts. The regex complexity to handle `<local>:<remote>` is not justified. Documented as known gap. |
| Multiline or complex shell constructs evade detection | Medium | Low | Consistent with the extension's philosophy: "This is not a full security system." The regex matches anywhere in the command string, which handles piped constructs and `&&`-chained commands. |

## Test Command

```bash
npx tsx --test agent/extensions/guardrails.test.ts
```
