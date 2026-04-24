# Rename whimsical extension and add rainbow + shine working message

Source todo: `.pi/todos/9e103475.md`

## Goal

Rename `agent/extensions/whimsical.ts` to `agent/extensions/working-message.ts` and give the streaming working message an animated shine effect that becomes rainbow + shine while the model is emitting thinking content, falling back cleanly when the UI cannot render it.

## Architecture summary

The change stays local to the working-message extension: rename the existing extension file, keep its message source data intact, add timer-driven rendering plus `message_update` thinking-state handling, add a focused fallback smoke test for the no-UI path, and update the README entry to match the renamed extension and new behavior. Existing working-indicator files and unrelated UI components remain untouched.

## Tech stack

- TypeScript
- pi extension API (`ExtensionAPI`, `ExtensionContext`, `ctx.ui.setWorkingMessage`)
- Node.js timers / `node:test`
- ANSI escape sequences for terminal styling

## Context / key findings

- Current extension: `agent/extensions/whimsical.ts` picks a random string from `messages[]` on `turn_start` and clears it on `turn_end` via `ctx.ui.setWorkingMessage(...)`.
- `ExtensionUIContext.setWorkingMessage(message?: string)` (see `agent/node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts:69`) accepts a plain string only. Any animation must be driven by calling `setWorkingMessage` on a timer with pre-colorized strings (ANSI escapes embedded).
- There is **no top-level `thinking_start` / `thinking_end` extension event**. Thinking sub-events are delivered inside `message_update` as `event.assistantMessageEvent.type === "thinking_start" | "thinking_end"` (see `agent/node_modules/@mariozechner/pi-ai/dist/types.d.ts:180-193`). The plan uses that path; the task phrasing "receives `thinking_start`" maps onto this.
- `ExtensionContext.hasUI` (types.d.ts:184) tells us whether the UI can render escapes; we use it for the fallback path. In print / RPC mode we fall back to the plain random message.
- The rainbow-editor example lives at `agent/node_modules/@mariozechner/pi-coding-agent/examples/extensions/rainbow-editor.ts`. It defines `COLORS` (7 truecolor RGB tuples), `brighten()`, `colorize(text, shinePos)` and drives a 60 ms `setInterval` loop with a 20-frame cycle (10 frames shine sweeping left→right, 10 frames paused with `shinePos = -1`). We clone its palette, cadence, and cycle exactly for the rainbow+shine state.
- Existing references to the old filename:
  - `README.md:462` → `### agent/extensions/whimsical.ts` heading + surrounding prose.
  - `.pi/plans/done/2026-04-06-remove-review-extension.md` (historical record — do not edit).
  - `.pi/reviews/2026-04-13-generate-plan-extension-full-branch-gpt-5.4-code-review.md` (historical — do not edit).
- No other source file imports `whimsical.ts`. Extensions are auto-loaded by pi from `agent/extensions/*.ts`, so renaming the file is sufficient; no manifest update needed.
- `agent/working.json` and `~/.pi/agent/working.json` are owned by `working-indicator.ts` under the `workingIndicator.mode` key — **do not touch that file or key**. The new extension does not persist any settings.
- `working-indicator.test.ts` is the only existing test adjacent to this file; no tests exist for `whimsical.ts` today.

## Files to modify

- `agent/extensions/whimsical.ts` (Rename + Rewrite) → renamed via `git mv` to `agent/extensions/working-message.ts`; contents rewritten with rainbow+shine animation wiring. The `messages[]` array and `pickRandom()` helper are kept byte-for-byte.
- `README.md` (Modify) — update the heading and description at line 462 to reflect the new filename and behavior.

## Files explicitly left alone

- `agent/extensions/working-indicator.ts` (task scope: "Do not change").
- `agent/working.json` / `~/.pi/agent/working.json` (owned by working-indicator).
- `.pi/plans/done/*` and `.pi/reviews/*` (historical records; do not rewrite history).
- All other `agent/extensions/*.ts` files.

## Tasks

### Task 1: Rename and rewrite the working-message extension

**Files:**
- Rename: `agent/extensions/whimsical.ts` → `agent/extensions/working-message.ts`
- Modify: `agent/extensions/working-message.ts` (post-rename, rewrite body)
- Create: `agent/extensions/working-message.test.ts` (fallback smoke test — exercises the `!ctx.hasUI` runtime path under `node --test`)

**Steps:**
- [ ] **Step 1: Rename via git** — run `git mv agent/extensions/whimsical.ts agent/extensions/working-message.ts` so history is preserved; do not copy-then-delete.
- [ ] **Step 2: Preserve `messages[]` and `pickRandom()`** — keep the existing 180-entry `messages` array and the `pickRandom()` helper byte-for-byte; everything else in the file is replaced.
- [ ] **Step 3: Add module-level constants** (ported from `rainbow-editor.ts`, values unchanged):
  - `COLORS: [number, number, number][]` — the 7 coral → pink RGB tuples from the example.
  - `RESET = "\x1b[0m"`.
  - `ANIM_INTERVAL_MS = 60`.
  - `CYCLE_LENGTH = 20` (10 shine positions + 10 pause frames).
  - `SHINE_SPAN = 10` (shine active on frames `0..9`, paused `10..19`).
- [ ] **Step 4: Port helpers** — copy `brighten(rgb, factor)` and `colorizeRainbow(text, shinePos)` verbatim from `rainbow-editor.ts` (the example's `colorize` is renamed `colorizeRainbow`). Add a new `colorizeShineOnly(text, shinePos)` that walks the text char-by-char: when `shinePos >= 0` and `Math.abs(i - shinePos) <= 1` (i.e. the center and its two neighbours), emit exactly `\x1b[1m${c}\x1b[22m` — bold-on, the char, then normal-intensity (`\x1b[22m`) to close bold for that one char only; for every other char, emit the raw char with **no** escape at all. Finally append `RESET` to the returned string as a defensive terminator. Do **not** emit `\x1b[1m` once at a shine char and rely on the trailing `RESET` — SGR bold is sticky and would smear bold across every following char until the reset, breaking the intended 3-char window. The rainbow helper does not need this treatment because it emits a fresh `brighten(...)` escape for every char (each char overwrites the previous SGR state).
- [ ] **Step 5: Declare extension state** in a closure inside the default-export factory:
  - `currentMessage: string | undefined` — message for this turn or `undefined` when no turn is active.
  - `mode: "shine" | "rainbow"` — starts `"shine"` on each `turn_start`.
  - `frame: number` — animation frame counter.
  - `timer: ReturnType<typeof setInterval> | undefined`.
  - `ctxRef: ExtensionContext | undefined` — most recent context for timer ticks.
  - `supportsEffect: boolean` — cached from `ctx.hasUI`; refreshed on `turn_start`.
- [ ] **Step 6: Implement `renderFrame()`** — if `currentMessage` is unset, return. If `!supportsEffect`, publish the raw message once via `ctxRef.ui.setWorkingMessage(currentMessage)` and return. Otherwise compute `cycle = frame % CYCLE_LENGTH`, `shinePos = cycle < SHINE_SPAN ? cycle : -1`, choose `colorizeRainbow` when `mode === "rainbow"` else `colorizeShineOnly`, and publish the result via `ctxRef.ui.setWorkingMessage(...)`.
- [ ] **Step 7: Implement `startAnimation()` / `stopAnimation()`** — `startAnimation` is a no-op if `timer` is already set or if `!supportsEffect`; otherwise resets `frame = 0`, renders once, then starts `setInterval(() => { frame++; renderFrame(); }, ANIM_INTERVAL_MS)`. `stopAnimation` clears the timer and sets it to `undefined`; it does not clear the working message.
- [ ] **Step 8: Wire events via `pi.on(...)`**:
  - `session_start` — capture `ctx` into `ctxRef`, cache `supportsEffect = ctx.hasUI`, do not start animation.
  - `turn_start` — update `ctxRef`, refresh `supportsEffect = ctx.hasUI`, set `currentMessage = pickRandom()`, `mode = "shine"`, `frame = 0`. If `supportsEffect`, call `startAnimation()`; otherwise call `ctxRef.ui.setWorkingMessage(currentMessage)` directly (no escapes, no timer) to publish the plain message. `pickRandom()` MUST only be invoked on `turn_start` — not in `message_update` or `renderFrame()` — so the same base string is reused across every animation tick and thinking-mode transition for the rest of the turn.
  - `message_update` — update `ctxRef`. Branch on `event.assistantMessageEvent.type`:
    - `"thinking_start"` → `mode = "rainbow"`, call `renderFrame()`.
    - `"thinking_end"` → `mode = "shine"`, call `renderFrame()`.
    - Other sub-events → no-op.
  - `turn_end` — call `stopAnimation()`, then `ctx.ui.setWorkingMessage()` with no args, then set `currentMessage = undefined`, `mode = "shine"`.
  - `session_shutdown` — `stopAnimation()` and clear state.
- [ ] **Step 9: Add fallback guards** — when `ctx.hasUI === false`, never start the timer or emit escapes. Wrap the animated `setWorkingMessage` call in `try { ... } catch { supportsEffect = false; stopAnimation(); ctxRef.ui.setWorkingMessage(currentMessage); }` so a runtime failure degrades to plain text instead of a crash loop.
- [ ] **Step 10: Performance guardrails** — single `setInterval` at 60 ms, stop the timer in `turn_end`, and only call `setWorkingMessage` outside the timer at state transitions (`turn_start`, `thinking_start`, `thinking_end`, `turn_end`) to prevent stream spam.
- [ ] **Step 11: Write the fallback unit test at `agent/extensions/working-message.test.ts`** — create a `node:test`–style test file (same style as the adjacent `footer.test.ts` / `working-indicator.test.ts`) that imports the default factory from `./working-message.ts`, constructs a mock `ExtensionAPI` whose `.on(event, handler)` records handlers into a `Map<string, Function>`, invokes the factory, then drives the extension through two scenarios:
  - **Scenario A (`hasUI: false` fallback):** call the recorded `turn_start` handler with a mock context `{ hasUI: false, ui: { setWorkingMessage: spy } }`. Assert that `spy` was invoked at least once with a `string` argument that contains **no** `\x1b` escape bytes (regex `/\x1b\[/` must not match), and that no `setInterval` handle was created (capture any attempt via a monkey-patched `globalThis.setInterval` that throws or records — the test must fail if `setInterval` was called during this scenario).
  - **Scenario B (`hasUI: true` styled path):** call the recorded `turn_start` handler with a mock context `{ hasUI: true, ui: { setWorkingMessage: spy } }`. Assert that a `setInterval` was created and that `spy` was invoked with a string containing at least one `\x1b[` escape. Then call the recorded `turn_end` handler with the same context and assert the timer was cleared (`clearInterval` called) and that `spy` was last invoked with `undefined` (the no-arg clear). Use `node:test`'s `t.mock.timers.enable()` or manual `globalThis.setInterval` / `globalThis.clearInterval` wrapping to observe timer calls without actually waiting 60 ms.
  The test MUST NOT depend on the real pi runtime, real terminal, or any network/provider calls; it only exercises the extension factory in isolation with mocked context.

**Acceptance criteria:**

- The file `agent/extensions/whimsical.ts` no longer exists and `agent/extensions/working-message.ts` exists, with the change tracked as a git rename (history preserved).
  Verify: run `git diff --summary --find-renames HEAD -- agent/extensions` and confirm the output contains a line starting with `rename` that references both `whimsical.ts` and `working-message.ts` (e.g. `rename agent/extensions/{whimsical.ts => working-message.ts}`), and run `ls agent/extensions/whimsical.ts 2>&1` and confirm the output contains "No such file or directory".
- The `messages[]` array and `pickRandom()` helper are preserved byte-for-byte from the original `whimsical.ts`.
  Verify: run `git show HEAD:agent/extensions/whimsical.ts | awk '/^const messages = \[/,/^}$/' > /tmp/old-block.txt && awk '/^const messages = \[/,/^}$/' agent/extensions/working-message.ts > /tmp/new-block.txt && diff /tmp/old-block.txt /tmp/new-block.txt` and confirm the diff produces no output (the range runs from `const messages = [` through the first standalone `}` line, which is `pickRandom()`'s closing brace, so both the full `messages[]` array and the entire `pickRandom()` helper body are byte-identical to the pre-rename committed version).
- `agent/extensions/working-message.ts` exports a single default factory taking `ExtensionAPI` and registering `session_start`, `turn_start`, `message_update`, `turn_end`, and `session_shutdown` handlers.
  Verify: `grep -nE "pi\.on\(\"(session_start|turn_start|message_update|turn_end|session_shutdown)\"" agent/extensions/working-message.ts` returns exactly 5 matches (one per event name) and `grep -n "export default function" agent/extensions/working-message.ts` returns exactly 1 match.
- Rainbow cadence parameters match the rainbow-editor example (60 ms interval, 20-frame cycle, 10-frame shine span, 7-color palette).
  Verify: run `grep -nE "ANIM_INTERVAL_MS[[:space:]]*=[[:space:]]*60|CYCLE_LENGTH[[:space:]]*=[[:space:]]*20|SHINE_SPAN[[:space:]]*=[[:space:]]*10" agent/extensions/working-message.ts` and confirm exactly 3 matches; then run `awk '/^const COLORS:/,/^\];/' agent/extensions/working-message.ts > /tmp/palette-new.txt && awk '/^const COLORS:/,/^\];/' agent/node_modules/@mariozechner/pi-coding-agent/examples/extensions/rainbow-editor.ts > /tmp/palette-ref.txt && diff /tmp/palette-new.txt /tmp/palette-ref.txt` and confirm the diff produces no output (palette block is byte-identical to the example); finally run `grep -cE "^[[:space:]]*\[[[:space:]]*[0-9]+," /tmp/palette-new.txt` and confirm the count is exactly 7 (one tuple row per color).
- When `ctx.hasUI === false`, the extension publishes the plain random message and never starts the interval timer.
  Verify: open `agent/extensions/working-message.ts` and confirm (a) `startAnimation()` early-returns when `!supportsEffect`, and (b) the `turn_start` handler falls back to `ctxRef.ui.setWorkingMessage(currentMessage)` (plain, no escapes) when `supportsEffect === false`.
- `thinking_start` switches the render mode to rainbow and `thinking_end` returns it to shine-only, with an immediate `renderFrame()` to avoid waiting for the next tick.
  Verify: open `agent/extensions/working-message.ts` and confirm the `message_update` handler contains a branch on `event.assistantMessageEvent.type === "thinking_start"` that sets `mode = "rainbow"` then calls `renderFrame()`, and a branch on `"thinking_end"` that sets `mode = "shine"` then calls `renderFrame()`.
- `turn_end` stops the timer, clears the working message, and resets closure state so the next turn starts fresh.
  Verify: open `agent/extensions/working-message.ts` and confirm the `turn_end` handler calls `stopAnimation()`, then `ctx.ui.setWorkingMessage()` with no arguments, then resets `currentMessage = undefined` and `mode = "shine"`.
- `pickRandom()` is called exactly once per turn, on `turn_start`, and never on `message_update` or inside `renderFrame()` / animation ticks — so the same base working message string is reused across every animation frame and across thinking-mode transitions for the entire turn.
  Verify: run `grep -n "pickRandom(" agent/extensions/working-message.ts` and confirm the only call sites are (a) the function definition itself and (b) exactly one invocation inside the `turn_start` handler body assigning to `currentMessage`; confirm there are zero `pickRandom(` matches inside the `message_update` handler, the `renderFrame` function body, the `startAnimation` body, or the `setInterval` callback.
- A runtime failure of the animated `setWorkingMessage(...)` path degrades cleanly to unstyled text instead of crashing or looping: the styled publish is wrapped in `try/catch`, and the catch branch sets `supportsEffect = false`, calls `stopAnimation()`, and republishes `currentMessage` unstyled via `ctxRef.ui.setWorkingMessage(currentMessage)`.
  Verify: open `agent/extensions/working-message.ts` and locate the `renderFrame` function body; confirm the styled `ctxRef.ui.setWorkingMessage(...)` call (the one invoked when `supportsEffect === true` with the `colorizeRainbow` / `colorizeShineOnly` result) is inside a `try { ... } catch` block, and confirm the `catch` block body contains, in order, (a) an assignment `supportsEffect = false`, (b) a call to `stopAnimation()`, and (c) a call `ctxRef.ui.setWorkingMessage(currentMessage)` passing the raw unstyled message. A `catch` block that only logs, swallows, or rethrows without performing all three of those actions is a failure.
- Performance guardrails for timer and publish call sites are statically enforced: exactly one `setInterval(` creation exists in the file, timer creation is idempotent (guarded against duplicates), and non-timer `setWorkingMessage(...)` call sites are limited to the intended state transitions and fallback paths.
  Verify: run `grep -cE "setInterval\(" agent/extensions/working-message.ts` and confirm the count is exactly `1`; open `agent/extensions/working-message.ts` and confirm the `startAnimation()` function body contains an early-return guard for an already-running timer (e.g. `if (timer) return;` or equivalent `timer !== undefined` check) positioned before the `setInterval(...)` call so repeat invocations cannot create a second timer; then run `grep -nE "setWorkingMessage\(" agent/extensions/working-message.ts` and confirm every match outside the `setInterval` callback body occurs in exactly one of these contexts — (a) the `turn_start` handler's non-`supportsEffect` fallback publish of plain `currentMessage`, (b) the `message_update` `thinking_start` / `thinking_end` branches' call to `renderFrame()` which in turn publishes (note: indirect through `renderFrame` is allowed, direct calls here are not required), (c) the `turn_end` handler's no-argument clear `ctx.ui.setWorkingMessage()`, (d) the `renderFrame` body (styled publish and its `catch`-branch unstyled republish), or (e) the `startAnimation()` initial render call. Any `setWorkingMessage(` call site outside that list (e.g. inside `session_start`, `session_shutdown`, or an ad-hoc helper) is a failure.
- The fallback unit test at `agent/extensions/working-message.test.ts` exercises the `!ctx.hasUI` runtime path end-to-end (not just via static inspection) and passes under the repo's `node --test` runner, proving that when `hasUI === false` the extension publishes the plain unstyled message and never starts the interval timer.
  Verify: run `cd agent && npm test -- extensions/working-message.test.ts` and confirm exit code 0 with at least one reported passing test and zero failing tests; additionally run `grep -nE "hasUI:[[:space:]]*false" agent/extensions/working-message.test.ts` and confirm at least one match (the fallback scenario is actually present), and run `grep -nE "\\\\x1b\\\\\[" agent/extensions/working-message.test.ts` and confirm at least one match (the test actually asserts on escape bytes rather than being a no-op).

**Model recommendation:** standard

---

### Task 2: Update README to reflect the rename and new behavior

**Files:**
- Modify: `README.md`

**Steps:**
- [ ] **Step 1: Update the heading** — at `README.md:462`, change `### \`agent/extensions/whimsical.ts\`` to `### \`agent/extensions/working-message.ts\``.
- [ ] **Step 2: Rewrite the description** — replace the "Tiny quality-of-life extension that randomizes the working message while pi is thinking." sentence with: "Randomizes the working message each turn and renders it with an animated shine effect. While the model is emitting thinking content, the entire message switches to a rainbow palette + shine; otherwise the message stays shine-only. Falls back to the plain random message when the UI can't render escapes."
- [ ] **Step 3: Preserve example line** — keep the "Examples include things like 'Baking...', 'Cogitating...', 'Wrangling...', etc." line exactly as-is.

**Acceptance criteria:**

- The README heading previously referring to `whimsical.ts` is replaced with `working-message.ts`, and no other heading/text in `README.md` still says `whimsical`.
  Verify: `grep -n "whimsical" README.md` returns zero matches, and `grep -nE "^### \`agent/extensions/working-message\.ts\`$" README.md` returns exactly one match.
- The rewritten description mentions the shine effect, the rainbow switch on thinking, and the fallback.
  Verify: open `README.md` near the `### \`agent/extensions/working-message.ts\`` heading and confirm the description paragraph contains all three phrases "animated shine effect", "rainbow palette", and "Falls back".
- The "Examples include things like 'Baking...', 'Cogitating...', 'Wrangling...', etc." line is still present verbatim.
  Verify: `grep -nF "Examples include things like" README.md` returns at least one match on a line immediately following the rewritten description, and that line contains `Baking...`, `Cogitating...`, and `Wrangling...`.

**Model recommendation:** cheap

---

### Task 3: Automated verification (typecheck + fallback test + static wiring audit)

This task contains ONLY checks an automated agent can run end-to-end without a human. Manual visual verification is deferred to Task 4.

**Files:**
- Test: `agent/extensions/working-message.test.ts` is exercised here (it is created by Task 1). Task 3 runs the test under `npm test` — no additional test files are added by Task 3 itself.
- Modify (only if needed to clear pre-existing typecheck blockers surfaced during verification): `agent/extensions/usage-bar.ts`

**Steps:**
- [ ] **Step 1: Run typecheck** — `cd agent && npm run typecheck`. Must exit 0 with no TypeScript errors.
- [ ] **Step 2: Audit for residual old-name references in actionable source/doc paths** — run `grep -rn --exclude-dir=node_modules --exclude-dir=.git "whimsical" agent/ README.md` (scope is intentionally limited to the only paths this plan can modify: `agent/` source/config/tests and the top-level `README.md`). Confirm the command produces zero matches. Immutable provenance and review artifacts under `.pi/` (specifically `.pi/todos/`, `.pi/specs/`, `.pi/briefs/`, `.pi/plans/`, `.pi/plans/done/`, `.pi/plans/reviews/`, and `.pi/reviews/`) are intentionally NOT in scope for this audit because they are historical records that legitimately retain the old name (the active plan file itself is the rename's subject, the source todo `.pi/todos/9e103475.md` predates the rename, and review/spec/brief artifacts are immutable history).
- [ ] **Step 3: Run the fallback unit test** — `cd agent && npm test -- extensions/working-message.test.ts`. Must exit 0 with at least one passing test and zero failing tests. This is the executable fallback verification for the `!ctx.hasUI` path; the static-wiring check below is kept as a secondary audit but is no longer the only evidence that fallback behavior works at runtime.
- [ ] **Step 4: Confirm fallback path is statically wired** — confirm the extension has a branch that publishes the plain `currentMessage` when `supportsEffect === false`, and that `startAnimation()` early-returns when `!supportsEffect` (static audit, complementing the runtime test in Step 3).
- [ ] **Step 5: Confirm protected files were not modified** — run `git diff --name-only HEAD -- agent/extensions/working-indicator.ts agent/working.json` and confirm it prints nothing (these files are explicitly out of scope per the spec and owned by the `working-indicator` extension).
- [ ] **Step 6: Enforce changed-files whitelist on plan-owned paths** — run `git status --porcelain -- agent/extensions/whimsical.ts agent/extensions/working-message.ts agent/extensions/working-message.test.ts agent/extensions/usage-bar.ts README.md` (path-scoped to the only five files this plan is allowed to touch) and confirm the output is a strict subset of: `agent/extensions/whimsical.ts` (deleted via `git mv`), `agent/extensions/working-message.ts` (added via `git mv`), `agent/extensions/working-message.test.ts` (added, new fallback test file), `agent/extensions/usage-bar.ts` (modified only if needed to clear a pre-existing typecheck blocker surfaced during verification), and `README.md` (modified). Because `git mv` may be surfaced either as a rename or as a paired delete+add depending on rename-detection heuristics, both representations are acceptable. The scope is deliberately narrowed to these five paths because the working tree may legitimately contain unrelated in-flight artifacts (e.g. other files under `.pi/todos/`, `.pi/plans/reviews/`, or the plan/review artifacts for this very task) that are not owned by this plan; enforcing a whole-repo whitelist would false-positive on those. Additionally, run `git diff --name-only HEAD -- agent/ README.md | grep -v -x -e 'agent/extensions/whimsical.ts' -e 'agent/extensions/working-message.ts' -e 'agent/extensions/working-message.test.ts' -e 'agent/extensions/usage-bar.ts' -e 'README.md'` and confirm the output is empty — this catches any accidental edits to other files under `agent/` or the top-level README without depending on a globally clean worktree. Note: `agent/extensions/working-message.test.ts` may not show in `git diff --name-only HEAD` if it is untracked; in that case it will appear in `git status --porcelain` as `??`, which is the expected representation for a newly-created untracked file.

**Acceptance criteria:**

- `npm run typecheck` passes with no errors after Tasks 1 and 2 are complete.
  Verify: run `cd agent && npm run typecheck` and confirm exit code 0 and zero lines containing `error TS`.
- The fallback unit test passes end-to-end, providing runtime (not just static) evidence that the `!ctx.hasUI` path publishes an unstyled message and never starts the animation timer.
  Verify: run `cd agent && npm test -- extensions/working-message.test.ts` and confirm exit code 0 with at least one reported passing test and zero `not ok` / `failing` lines in the TAP output.
- No actionable source or doc file in the repository still references the old `whimsical` name.
  Verify: run `grep -rn --exclude-dir=node_modules --exclude-dir=.git "whimsical" agent/ README.md` and confirm the command produces zero matches (any hit in `agent/` or `README.md` is a failure). Immutable `.pi/` provenance/review artifacts (`.pi/todos/`, `.pi/specs/`, `.pi/briefs/`, `.pi/plans/`, `.pi/plans/done/`, `.pi/plans/reviews/`, `.pi/reviews/`) are intentionally excluded from the audit scope and are not failures.
- The fallback branch for `!ctx.hasUI` is statically present in the new extension.
  Verify: open `agent/extensions/working-message.ts` and confirm (a) `startAnimation()` contains a guard such as `if (!supportsEffect) return;` near its top, and (b) the `turn_start` handler takes an `else` / non-`supportsEffect` path that calls `ctxRef.ui.setWorkingMessage(currentMessage)` with the raw unstyled string.
- The protected files owned by the `working-indicator` extension are unchanged from `HEAD` after this plan's implementation (spec: "Do not change `agent/extensions/working-indicator.ts`"; `agent/working.json` is owned by that extension).
  Verify: run `git diff --name-only HEAD -- agent/extensions/working-indicator.ts agent/working.json` and confirm the command produces zero lines of output; additionally run `git status --porcelain -- agent/extensions/working-indicator.ts agent/working.json` and confirm it also produces zero lines (no staged, unstaged, or untracked changes to those paths).
- No file under the plan's implementation scope (`agent/` source tree and top-level `README.md`) has been modified, added, or deleted outside the five-path whitelist (spec: "Limit changes to the working message; do not change unrelated UI components"). `agent/extensions/usage-bar.ts` is an explicitly allowed exception only when needed to clear a pre-existing typecheck blocker surfaced during verification; no other unrelated UI file may change. The check is scoped to plan-owned paths only; unrelated in-flight workspace artifacts outside `agent/` and `README.md` (e.g. `.pi/todos/`, `.pi/plans/reviews/`) are not in scope for this whitelist.
  Verify: run `git status --porcelain -- agent/extensions/whimsical.ts agent/extensions/working-message.ts agent/extensions/working-message.test.ts agent/extensions/usage-bar.ts README.md` and confirm every output line's path field is one of exactly five allowed paths: `agent/extensions/whimsical.ts` (shown as `D` deleted or as the source side of an `R` rename), `agent/extensions/working-message.ts` (shown as `A`/`??` added or as the destination side of an `R` rename), `agent/extensions/working-message.test.ts` (shown as `A`/`??` added), `agent/extensions/usage-bar.ts` (shown as `M` modified only for the pre-existing typecheck fix), or `README.md` (shown as `M` modified). Additionally run `git diff --name-only HEAD -- agent/ README.md | grep -v -x -e 'agent/extensions/whimsical.ts' -e 'agent/extensions/working-message.ts' -e 'agent/extensions/working-message.test.ts' -e 'agent/extensions/usage-bar.ts' -e 'README.md'` and confirm the output is empty — this catches any accidental edits to other files under `agent/` or `README.md` without requiring a globally clean worktree.

**Model recommendation:** cheap

---

### Task 4: Manual QA sign-off (human operator only)

**This task is NOT agent-runnable.** It requires a human operator at an interactive terminal to observe the animation by eye in two themes. An automated executor MUST stop here and hand off to a human; do not attempt to fake the observations. If this plan is being run fully autonomously with no human in the loop, mark Task 4 as "deferred — awaiting human QA" and do not claim the plan complete.

**Preconditions (operator must satisfy before starting Step 1):**

- The operator MUST snapshot the exact pre-QA working-tree contents of `agent/settings.json` before any temporary edits so they can be restored verbatim afterward, regardless of whether that baseline matches `HEAD`. Concretely: run `cp agent/settings.json /tmp/agent-settings.pre-qa.json` and confirm the copy succeeded (`diff /tmp/agent-settings.pre-qa.json agent/settings.json` must produce no output). This snapshot is the authoritative restore target for Step 10 — NOT `HEAD` — so any uncommitted local edits the operator had before starting QA are preserved.

**Files:**
- Modify (temporary, reverted before sign-off): `agent/settings.json` — the operator may temporarily edit `theme`, `defaultProvider`, `defaultModel`, and/or `defaultThinkingLevel` during Steps 1–6 to exercise the light-theme and no-thinking paths; Step 10 restores this file byte-identically to the pre-QA snapshot captured in the preconditions (NOT to `HEAD`), and Task 4's acceptance criteria enforce the restore.
- Modify: `.pi/plans/2026-04-23-rename-whimsical-extension-and-add-rainbow-shine-working-message.md` — Step 11 appends a `## Manual QA sign-off` section to the bottom of this plan file.

**Required model/provider setup (apply BEFORE running the steps below):**

The current `agent/settings.json` defaults to `openai-codex/gpt-5.4` with `defaultThinkingLevel: "high"`, which emits `thinking_start` / `thinking_end` events. To exercise both code paths reliably, the operator MUST run each turn under one of these two configurations:

- **Thinking-capable config (used for Steps 2 and 5 — "thinking transition"):** keep the repo defaults (`defaultProvider: "openai-codex"`, `defaultModel: "gpt-5.4"`, `defaultThinkingLevel: "high"`). Confirm via the pi footer / `/model` command that the active model is `gpt-5.4` and thinking level is `high` before starting the turn. Send a prompt that reliably elicits thinking, e.g. "Think step by step: what is 17 × 23, then divide by 7? Show your reasoning." The operator should observe a thinking block render in the transcript during the turn — that is the signal that `thinking_start` / `thinking_end` fired.
- **No-thinking config (used for Steps 3 and 6 — "no-thinking turn"):** in the running pi session, switch to a non-thinking model+provider combo via `/model` (or temporarily set `defaultProvider: "anthropic"` + `defaultModel: "anthropic/claude-haiku-4-5"` with no thinking level in `agent/settings.json` and restart pi). Haiku-4-5 from the `enabledModels` list does not emit thinking events when no thinking level is set. Send a trivial prompt that requires no reasoning, e.g. "Reply with just the word OK." The operator should observe NO thinking block in the transcript — that is the signal that no `thinking_start` event fired for the turn.

After completing Steps 3 and 6, restore the original `agent/settings.json` (or switch back via `/model`) so subsequent steps (7, 8, 9) run under the default thinking-capable config.

**Steps (human operator):**
- [ ] **Step 1: `nord` shine-only baseline** — launch pi with the default `nord` theme (current `agent/settings.json`); start a turn; confirm the random working message is visible with the shine sweep.
- [ ] **Step 2: `nord` thinking transition** — during the same turn, send a prompt that causes the model to emit thinking content; confirm the message switches to rainbow + shine on `thinking_start` and reverts to shine-only on `thinking_end`.
- [ ] **Step 3: `nord` no-thinking turn** — run a turn with a model/prompt that never emits thinking events; confirm the message stays shine-only from `turn_start` to `turn_end`, with no rainbow frames.
- [ ] **Step 4: `light` shine-only baseline** — switch to the built-in `light` theme via `/settings` → theme → `light` (or, if the settings UI is unavailable, edit `agent/settings.json` to set `"theme": "light"` and restart pi); start a turn; confirm the random working message is visible with the shine sweep and is readable on the light background (no white-on-white washing out).
- [ ] **Step 5: `light` thinking transition** — during the same `light`-theme turn, send a prompt that causes the model to emit thinking content; confirm the message switches to rainbow + shine on `thinking_start` and reverts to shine-only on `thinking_end`, and that the rainbow palette remains legible on the light background.
- [ ] **Step 6: `light` no-thinking turn** — in `light` theme, run a turn with a model/prompt that never emits thinking events; confirm the message stays shine-only from `turn_start` to `turn_end`, with no rainbow frames.
- [ ] **Step 7: End-of-turn cleanup** — after a turn ends in each theme, confirm `turn_end` restores the default working message (empty/idle) and no residual ANSI escapes leak into the footer.
- [ ] **Step 8: Abort cleanup via `escape`** — start a turn; while the animation is visible, press `escape` (the pi `app.interrupt` binding) to interrupt the in-flight turn; confirm the animation stops, the working message clears, and the footer returns to idle. This exercises the `turn_end` cleanup path on an interrupted turn.
- [ ] **Step 9: Shutdown cleanup via exit** — start a turn so the animation is running, then exit pi via its normal quit action (the `/quit` slash command, or the documented `app.exit` keybinding — `ctrl+d` when the prompt editor is empty — NOT `ctrl+c`, which is bound to `app.clear`, and NOT the removed `/exit` command); confirm the animation stops cleanly with no residual process/timer (no stray output after the shell prompt returns). This exercises the `session_shutdown` path.
- [ ] **Step 10: Restore configuration from the pre-QA snapshot** — after completing Steps 1–9 and before recording sign-off, restore `agent/settings.json` byte-identically to the pre-QA snapshot captured in the preconditions (`/tmp/agent-settings.pre-qa.json`). Run `cp /tmp/agent-settings.pre-qa.json agent/settings.json`, then run `diff /tmp/agent-settings.pre-qa.json agent/settings.json` and confirm it produces no output. Do NOT use `git checkout -- agent/settings.json` for this step — that would restore the committed `HEAD` baseline rather than the operator's actual pre-QA working-tree contents, which could silently discard any legitimate uncommitted edits the operator had in place before QA began.
- [ ] **Step 11: Record sign-off** — append a `## Manual QA sign-off` section to the bottom of this plan file (`.pi/plans/2026-04-23-rename-whimsical-extension-and-add-rainbow-shine-working-message.md`) with one line per Step 1–9 above, each prefixed `PASS` or `FAIL` and signed with the operator's initials and an ISO date. Example: `PASS nord shine-only — DSL 2026-04-23`. If a PR is open for this work, also mirror the same nine lines into the PR description under a `## Manual QA sign-off` heading; the plan file is the authoritative record either way (the plan file MUST always be updated; PR mirroring is optional and only when a PR exists).

**Acceptance criteria:**

- A human operator has recorded a PASS/FAIL verdict for every one of Steps 1–9 in the plan file's `## Manual QA sign-off` section, with initials and date.
  Verify: open `.pi/plans/2026-04-23-rename-whimsical-extension-and-add-rainbow-shine-working-message.md`, locate the `## Manual QA sign-off` heading, and confirm the section beneath it contains exactly nine lines, one per manual step, each starting with `PASS` or `FAIL`, each ending with operator initials and an ISO date (e.g. `DSL 2026-04-23`), covering in order: (1) nord shine-only, (2) nord thinking transition, (3) nord no-thinking turn, (4) light shine-only, (5) light thinking transition, (6) light no-thinking turn, (7) end-of-turn cleanup, (8) abort cleanup via `escape`, (9) shutdown cleanup via exit.
- Every recorded verdict for Steps 1–9 is `PASS` (any `FAIL` blocks completion and must be remediated by reopening Task 1).
  Verify: run `awk '/^## Manual QA sign-off/,0' .pi/plans/2026-04-23-rename-whimsical-extension-and-add-rainbow-shine-working-message.md | grep -c "^FAIL"` and confirm the count is exactly `0`; if any `FAIL` lines exist, the plan is not complete and Task 1 must be reopened to fix the underlying issue.
- `agent/settings.json` is byte-identical to the pre-QA snapshot captured in the Task 4 preconditions (`/tmp/agent-settings.pre-qa.json`) after manual QA — any temporary theme/provider/model edits the operator made during Steps 1–6 have been fully restored to the exact pre-QA working-tree contents, so no config drift (and no accidental loss of legitimate prior uncommitted edits) leaks into the final branch.
  Verify: run `diff /tmp/agent-settings.pre-qa.json agent/settings.json` and confirm the command produces zero lines of output. If the diff prints any lines, the operator must re-run Step 10 (`cp /tmp/agent-settings.pre-qa.json agent/settings.json`) before Task 4 can be marked complete. Do NOT verify this criterion with `git diff ... HEAD -- agent/settings.json`, because the pre-QA snapshot is the authoritative restore target and may itself legitimately differ from `HEAD`.

**Model recommendation:** standard (human-gated; the model's role is only to stage the operator and record sign-off)

## Dependencies

- Task 2 has no dependencies (the README rename and new description are fully specified by the task spec and can be written in parallel with Task 1 — the final filename and intended behavior are fixed by the spec, not derived from Task 1's implementation).
- Task 3 depends on: Task 1, Task 2 (typecheck must cover the rewritten extension; residual-reference audit requires the README already updated).
- Task 4 depends on: Task 1, Task 2, Task 3 (manual QA only makes sense after static checks pass; running it earlier risks chasing bugs already caught by typecheck / static audit).

## Risk Assessment

- **Timer leakage.** If `turn_end` never fires (e.g. hard abort), the `setInterval` keeps running. Mitigated by also stopping in `session_shutdown`, but worth eyeballing during manual verification that interrupting a turn (via `escape`) and exiting pi both still clear the animation. Covered by Task 4 Steps 8 and 9.
- **`setWorkingMessage` throttling.** If the host debounces or batches `setWorkingMessage`, 60 ms updates may look choppy. If choppy in practice, raise `ANIM_INTERVAL_MS` to 80–100 ms — but do not change cadence up-front; keep parity with the example.
- **Light-theme readability of shine-only.** Using bold-only shine (no color) avoids washing out on light backgrounds, but on some terminals bold is rendered as a brighter color that may still clash. If verification shows a problem, the fix is local to `colorizeShineOnly` — do not touch the rainbow palette (task says keep it exactly as-is).
- **Thinking event mapping.** `thinking_start` / `thinking_end` arrive inside `message_update`; if a future pi-coding-agent release introduces top-level `thinking_start` / `thinking_end` events, the wiring in Task 1 Step 8 should be revisited. Not a current concern.
- **Extension auto-loading.** pi discovers extensions by scanning `agent/extensions/*.ts`; renaming the file is enough. If the deployed install caches module paths, a pi restart is required after the rename — called out in Task 3's manual verification.

## Test Command

```bash
cd agent && npm run typecheck && npm test
```
